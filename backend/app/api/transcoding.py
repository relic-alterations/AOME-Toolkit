from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models.models import TranscodeProfile, TranscodeJob, MovieRip
from app.core.transcoder import Transcoder
from pydantic import BaseModel
import os

router = APIRouter()
transcoder = Transcoder()

class ProfileSchema(BaseModel):
    id: Optional[int] = None
    name: str
    container: str = "av_mkv"
    video_encoder: str = "x264"
    video_quality: int = 22
    width: Optional[int] = None
    height: Optional[int] = None
    audio_encoder: str = "av_aac"
    audio_bitrate: int = 160
    audio_mixdown: str = "stereo"
    audio_samplerate: str = "auto"
    framerate: str = "auto"
    vfr_cfr: str = "vfr"
    deinterlace: bool = False
    encoder_preset: str = "fast"
    subtitle_mode: str = "all"
    burn_subtitles: bool = False
    advanced_params: Optional[str] = None

@router.get("/profiles")
def list_profiles(db: Session = Depends(get_db)):
    return db.query(TranscodeProfile).all()

@router.post("/profiles")
def create_profile(profile: ProfileSchema, db: Session = Depends(get_db)):
    if profile.id:
        existing = db.query(TranscodeProfile).filter(TranscodeProfile.id == profile.id).first()
        if existing:
            for key, value in profile.dict(exclude={"id"}).items():
                setattr(existing, key, value)
            db.commit()
            db.refresh(existing)
            return existing
            
    existing = db.query(TranscodeProfile).filter(TranscodeProfile.name == profile.name).first()
    if existing:
        for key, value in profile.dict(exclude={"id"}).items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing
        
    db_profile = TranscodeProfile(**profile.dict(exclude={"id"}))
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile

@router.delete("/profiles/{profile_id}")
def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    profile = db.query(TranscodeProfile).filter(TranscodeProfile.id == profile_id).first()
    if profile:
        db.delete(profile)
        db.commit()
    return {"message": "Profile deleted"}

@router.get("/ready")
def get_ready_media(db: Session = Depends(get_db)):
    from app.db.models.models import Settings
    settings = db.query(Settings).first()
    if not settings:
        return []
        
    rips_path = settings.default_rips_path
    if rips_path.startswith("~"):
        rips_path = os.path.expanduser(rips_path)
        
    if not os.path.exists(rips_path):
        return []
        
    ready_items = []
    
    for item in os.listdir(rips_path):
        item_path = os.path.join(rips_path, item)
        if os.path.isdir(item_path):
            seasons = [d for d in os.listdir(item_path) if os.path.isdir(os.path.join(item_path, d)) and d.startswith("Season ")]
            extras_dir = os.path.join(item_path, "Extras")
            has_extras = os.path.exists(extras_dir) and len([f for f in os.listdir(extras_dir) if f.endswith(".mkv")]) > 0
            
            if seasons:
                episode_count = 0
                for s in seasons:
                    s_path = os.path.join(item_path, s)
                    episode_count += len([f for f in os.listdir(s_path) if f.endswith(".mkv")])
                    
                if episode_count > 0 or has_extras:
                    ready_items.append({
                        "name": item,
                        "type": "tv",
                        "path": item_path,
                        "has_extras": has_extras,
                        "episode_count": episode_count
                    })
            else:
                main_mkv = [f for f in os.listdir(item_path) if f.endswith(".mkv")]
                if main_mkv:
                    ready_items.append({
                        "name": item,
                        "type": "movie",
                        "path": item_path,
                        "main_file": main_mkv[0],
                        "has_extras": has_extras
                    })
    return ready_items

@router.get("/jobs")
def list_jobs(db: Session = Depends(get_db)):
    # Return both active (from core) and finished (from DB)
    return db.query(TranscodeJob).order_by(TranscodeJob.created_at.desc()).all()

@router.post("/jobs")
async def start_job(
    input_path: str,
    profile_id: Optional[int] = None,
    profile_ids: Optional[str] = None,
    target_mode: str = "main", # 'main' or 'all' (includes extras)
    db: Session = Depends(get_db)
):
    p_ids = []
    if profile_ids:
        p_ids = [int(x) for x in profile_ids.split(",") if x.strip()]
    elif profile_id:
        p_ids = [profile_id]
        
    if not p_ids:
        raise HTTPException(status_code=400, detail="No profile specified")
        
    profiles = db.query(TranscodeProfile).filter(TranscodeProfile.id.in_(p_ids)).all()
    if not profiles:
        raise HTTPException(status_code=404, detail="Profiles not found")
        
    is_multi = len(p_ids) > 1
        
    from app.db.models.models import Settings
    settings = db.query(Settings).first()
    output_base = settings.default_transcodes_path if settings else "~/AOME/transcodes"
    if output_base.startswith("~"):
        output_base = os.path.expanduser(output_base)

    created_jobs = []
    
    for profile in profiles:
        files_to_transcode = []
        
        # Check if input is a directory (from /ready) or a single file
        if os.path.isdir(input_path):
            base_folder_name = os.path.basename(input_path.rstrip('/'))
            
            def make_out_path(rel_dir, f_name):
                name, ext = os.path.splitext(f_name)
                new_ext = ".mp4" if "mp4" in profile.container else ".mkv"
                if is_multi:
                    return os.path.join(output_base, base_folder_name, rel_dir, f"{name} - {profile.name}{new_ext}")
                return os.path.join(output_base, base_folder_name, rel_dir, f"{name}{new_ext}")

            # Main files
            for f in os.listdir(input_path):
                if f.endswith(".mkv"):
                    files_to_transcode.append((
                        os.path.join(input_path, f),
                        make_out_path("", f)
                    ))
            
            # Seasons
            for d in os.listdir(input_path):
                if d.startswith("Season ") and os.path.isdir(os.path.join(input_path, d)):
                    season_path = os.path.join(input_path, d)
                    for f in os.listdir(season_path):
                        if f.endswith(".mkv"):
                            files_to_transcode.append((
                                os.path.join(season_path, f),
                                make_out_path(d, f)
                            ))
            
            # Extras
            if target_mode == "all":
                extras_dir = os.path.join(input_path, "Extras")
                if os.path.exists(extras_dir):
                    for f in os.listdir(extras_dir):
                        if f.endswith(".mkv"):
                            files_to_transcode.append((
                                os.path.join(extras_dir, f),
                                make_out_path("Extras", f)
                            ))
        else:
            # Single file fallback
            filename = os.path.basename(input_path)
            name, ext = os.path.splitext(filename)
            new_ext = ".mp4" if "mp4" in profile.container else ".mkv"
            if is_multi:
                out_path = os.path.join(output_base, f"{name} - {profile.name}{new_ext}")
            else:
                out_path = os.path.join(output_base, f"{name}{new_ext}")
            files_to_transcode.append((input_path, out_path))

        group_name = os.path.basename(input_path.rstrip('/'))

        import time
        log_dir = os.path.expanduser("~/AOME/logs/transcodes")
        os.makedirs(log_dir, exist_ok=True)
        
        for in_p, out_p in files_to_transcode:
            # Skip if file already exists
            if os.path.exists(out_p) and os.path.getsize(out_p) > 0:
                continue
                
            log_path = os.path.join(log_dir, f"transcode_{int(time.time())}_{os.path.basename(in_p)}.log")
            
            job = TranscodeJob(
                input_path=in_p,
                output_path=out_p,
                profile_id=profile.id,
                group_name=group_name,
                status="queued",
                log_path=log_path
            )
            db.add(job)
            db.commit()
            db.refresh(job)
            created_jobs.append(job)

    return {"message": f"Queued {len(created_jobs)} items", "jobs": created_jobs}

@router.get("/status/{job_id}")
def get_job_status(job_id: str):
    return transcoder.get_status(job_id)

@router.post("/jobs/cancel/{input_path}")
async def cancel_job(input_path: str):
    success = await transcoder.cancel_job(input_path)
    return {"success": success}

@router.post("/jobs/cancel-group/{group_name}")
async def cancel_group(group_name: str, db: Session = Depends(get_db)):
    jobs = db.query(TranscodeJob).filter(TranscodeJob.group_name == group_name).all()
    for job in jobs:
        if job.status == "queued":
            job.status = "cancelled"
        elif job.status == "processing":
            await transcoder.cancel_job(job.input_path)
            job.status = "cancelled"
    db.commit()
    return {"message": f"Cancelled group {group_name}"}

@router.delete("/jobs/{job_id}")
async def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(TranscodeJob).filter(TranscodeJob.id == job_id).first()
    if job:
        if job.status == "processing":
            await transcoder.cancel_job(job.input_path)
        db.delete(job)
        db.commit()
    return {"message": "Job deleted"}

@router.delete("/jobs/clear/all")
async def clear_all_jobs(db: Session = Depends(get_db)):
    jobs = db.query(TranscodeJob).all()
    for job in jobs:
        if job.status == "processing":
            await transcoder.cancel_job(job.input_path)
        db.delete(job)
    db.commit()
    return {"message": "All jobs cleared"}

class PushRequest(BaseModel):
    folder_name: str
    type: str = "movie"

from app.db.models.models import TransferJob, Settings

@router.post("/push")
def push_folder(req: PushRequest, db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    if not settings:
        raise HTTPException(status_code=400, detail="Settings not configured")
        
    if req.type == "tv" and not settings.tv_shows_export_path:
        raise HTTPException(status_code=400, detail="TV Shows destination not configured")
    if req.type == "movie" and not settings.movies_export_path:
        raise HTTPException(status_code=400, detail="Movies destination not configured")
        
    transcodes_path = os.path.expanduser(settings.default_transcodes_path if settings.default_transcodes_path else "~/AOME/transcodes")
    folder_path = os.path.join(transcodes_path, req.folder_name)
    
    if not os.path.exists(folder_path):
        raise HTTPException(status_code=404, detail="Folder not found")
        
    final_dest = os.path.expanduser(settings.tv_shows_export_path if req.type == "tv" else settings.movies_export_path)
    
    if getattr(settings, 'export_stats_file', True):
        try:
            from app.db.models.models import TranscodeJob, MovieRip, TranscodeProfile
            t_jobs = db.query(TranscodeJob).filter(TranscodeJob.group_name == req.folder_name).all()
            m_rips = db.query(MovieRip).all()
            matched_rip = None
            import re
            for r in m_rips:
                if r.title:
                    clean_t = re.sub(r'^\[.*?\]\s*', '', r.title)
                    if req.folder_name.startswith(clean_t):
                        matched_rip = r
                        break
            
            stats_path = os.path.join(folder_path, "aome_stats.txt")
            with open(stats_path, "w") as f:
                f.write("AOME EXPORT STATS\n")
                f.write("=================\n\n")
                f.write(f"Title Name: {req.folder_name}\n")
                f.write(f"Media Type: {req.type.upper()}\n")
                if matched_rip:
                    f.write(f"Original Disc/Drive: {matched_rip.title}\n")
                    f.write(f"Rip Started At: {matched_rip.created_at}\n")
                
                f.write("\n--- Files Exported ---\n")
                total_size = 0
                for root, dirs, files in os.walk(folder_path):
                    for file in files:
                        if file.endswith((".mkv", ".mp4")):
                            f_path = os.path.join(root, file)
                            size = os.path.getsize(f_path)
                            total_size += size
                            f.write(f"- {file} ({round(size / (1024*1024), 2)} MB)\n")
                
                f.write(f"\nTotal Export Size: {round(total_size / (1024*1024*1024), 2)} GB\n")
                
                if t_jobs:
                    f.write(f"\n--- Transcoding Stats ---\n")
                    earliest_start = min((j.created_at for j in t_jobs if j.created_at), default=None)
                    latest_end = max((j.completed_at for j in t_jobs if j.completed_at), default=None)
                    if earliest_start:
                        f.write(f"Transcode Batch Started At: {earliest_start}\n")
                    if latest_end:
                        f.write(f"Transcode Batch Completed At: {latest_end}\n")
                    if earliest_start and latest_end:
                        duration = latest_end - earliest_start
                        f.write(f"Total Transcode Batch Duration: {duration}\n")

                    f.write(f"\n--- Profile Settings ---\n")
                    for job in t_jobs:
                        profile = db.query(TranscodeProfile).filter(TranscodeProfile.id == job.profile_id).first()
                        f.write(f"File: {os.path.basename(job.output_path)}\n")
                        if profile:
                            f.write(f"  Profile Name: {profile.name}\n")
                            f.write(f"  Container: {profile.container}\n")
                            f.write(f"  Video Encoder: {profile.video_encoder}\n")
                            f.write(f"  Quality (RF): {profile.quality_rf}\n")
                            f.write(f"  Encoder Preset: {profile.encoder_preset}\n")
                            f.write(f"  Framerate: {profile.framerate}\n")
                            f.write(f"  VFR: {profile.vfr}\n")
                            f.write(f"  Deinterlace: {profile.deinterlace}\n")
                            f.write(f"  Max Width: {profile.max_width}\n")
                            f.write(f"  Max Height: {profile.max_height}\n")
                            f.write(f"  Audio Encoder: {profile.audio_encoder}\n")
                            f.write(f"  Audio Mixdown: {profile.audio_mixdown}\n")
                            f.write(f"  Audio Bitrate: {profile.audio_bitrate}\n")
                            f.write(f"  Subtitle Mode: {profile.subtitle_mode}\n")
                            f.write(f"  Hardburn Subtitles: {profile.hardburn_subtitles}\n")
                        else:
                            f.write(f"  Profile Settings: Unknown\n")
                        f.write("-" * 40 + "\n")

                    meta_path = os.path.join(folder_path, "comparison_metadata.json")
                    if os.path.exists(meta_path):
                        import json
                        with open(meta_path, "r") as mf:
                            meta = json.load(mf)
                        f.write("\n--- Quality Comparison Captures ---\n")
                        f.write(f"Screenshots (10 frames) captured at: {', '.join(meta.get('timestamps', []))}\n")
                        if meta.get("video_timestamp"):
                            f.write(f"10-second Video Clip captured at: {meta.get('video_timestamp')}\n")
                        try:
                            os.remove(meta_path)
                        except Exception:
                            pass
        except Exception as e:
            print(f"Failed to generate stats file: {e}")
            
    jobs_created = []
    
    for root, dirs, files in os.walk(folder_path):
        for f in files:
            if f.endswith(".mp4") or f.endswith(".mkv") or f.endswith(".txt") or f.endswith(".html"):
                source_f = os.path.join(root, f)
                rel_path = os.path.relpath(source_f, transcodes_path)
                dest_f = os.path.join(final_dest, rel_path)
                
                job = TransferJob(
                    source_path=source_f,
                    destination_path=dest_f,
                    group_name=req.folder_name,
                    status="queued"
                )
                db.add(job)
                jobs_created.append(job)
                
    db.commit()
    return {"message": f"Queued {len(jobs_created)} files for transfer", "count": len(jobs_created)}

def auto_reorder_transfers(db: Session):
    import os
    from datetime import datetime, timedelta
    queued_jobs = db.query(TransferJob).filter(TransferJob.status == "queued").all()
    def get_size(job):
        try: return os.path.getsize(job.source_path)
        except: return float('inf')
    queued_jobs.sort(key=get_size)
    now = datetime.now()
    for i, job in enumerate(queued_jobs):
        job.created_at = now + timedelta(seconds=i)
    db.commit()

class RestartTransferRequest(BaseModel):
    group_name: str

@router.post("/restart_transfer")
def restart_transfer(req: RestartTransferRequest, db: Session = Depends(get_db)):
    jobs = db.query(TransferJob).filter(TransferJob.group_name == req.group_name).all()
    for job in jobs:
        job.status = "queued"
        job.progress = 0
    db.commit()
    auto_reorder_transfers(db)
    return {"message": "Transfer restarted and queue reordered"}

@router.post("/smart_restart_transfer")
def smart_restart_transfer(req: RestartTransferRequest, db: Session = Depends(get_db)):
    import os
    jobs = db.query(TransferJob).filter(TransferJob.group_name == req.group_name).all()
    for job in jobs:
        try:
            local_size = os.path.getsize(job.source_path)
        except Exception:
            local_size = -1
            
        try:
            remote_size = os.path.getsize(job.destination_path)
        except Exception:
            remote_size = -2
            
        if local_size == remote_size and local_size > 0:
            job.status = "completed"
            job.progress = 100
        else:
            job.status = "queued"
            job.progress = 0
            
    db.commit()
    auto_reorder_transfers(db)
    return {"message": "Smart resume applied: matching files skipped."}
    
@router.post("/clear_completed")
def clear_completed(req: RestartTransferRequest, db: Session = Depends(get_db)):
    # 1. Mark jobs as cleared so they disappear from UI
    jobs = db.query(TransferJob).filter(TransferJob.group_name == req.group_name).all()
    for job in jobs:
        job.status = "cleared"
    db.commit()
    
    # 2. Delete the folders from transcode and staging
    import shutil, os
    from app.db.models.models import Settings
    
    settings_db = db.query(Settings).first()
    rips_path = os.path.expanduser(settings_db.default_rips_path if settings_db else "~/AOME/rips")
    transcodes_path = os.path.expanduser(settings_db.default_transcodes_path if settings_db else "~/AOME/transcodes")
    
    transcode_dir = os.path.join(transcodes_path, req.group_name)
    staging_dir = os.path.join(rips_path, req.group_name)
    
    if os.path.exists(transcode_dir):
        try:
            shutil.rmtree(transcode_dir)
        except:
            pass
            
    if os.path.exists(staging_dir):
        try:
            shutil.rmtree(staging_dir)
        except:
            pass
            
    return {"message": "Local files deleted and jobs cleared"}

@router.get("/transfers")
def get_transfers(db: Session = Depends(get_db)):
    return db.query(TransferJob).order_by(TransferJob.created_at.desc()).all()

@router.post("/reorder_transfers")
def reorder_transfers(db: Session = Depends(get_db)):
    """
    Reorders the transfer queue so that the smallest files are transferred first.
    """
    auto_reorder_transfers(db)
    return {"message": "Transfer queue reordered by file size."}

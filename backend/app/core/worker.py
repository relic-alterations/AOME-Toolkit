import asyncio
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.db.models.models import Settings, TranscodeJob, TranscodeProfile, TransferJob
import shutil
import hashlib
from app.core.transcoder import transcoder_instance as transcoder
from datetime import datetime

async def process_queue():
    while True:
        db = SessionLocal()
        try:
            settings = db.query(Settings).first()
            max_jobs = settings.max_concurrent_transcodes if settings else 1
            
            # Count currently processing jobs
            active_count = db.query(TranscodeJob).filter(TranscodeJob.status == "processing").count()
            
            if active_count < max_jobs:
                # Find the oldest queued job
                next_job = db.query(TranscodeJob).filter(TranscodeJob.status == "queued").order_by(TranscodeJob.created_at.asc()).first()
                
                if next_job:
                    # Mark as processing
                    next_job.status = "processing"
                    db.commit()
                    db.refresh(next_job)
                    
                    profile = db.query(TranscodeProfile).filter(TranscodeProfile.id == next_job.profile_id).first()
                    
                    if profile:
                        profile_dict = {
                            "media_type": profile.media_type,
                            "container": profile.container,
                            "video_encoder": profile.video_encoder,
                            "video_quality": profile.video_quality,
                            "width": profile.width,
                            "height": profile.height,
                            "audio_encoder": profile.audio_encoder,
                            "audio_bitrate": profile.audio_bitrate,
                            "subtitle_mode": profile.subtitle_mode,
                            "burn_subtitles": profile.burn_subtitles,
                            "audio_mixdown": profile.audio_mixdown,
                            "audio_samplerate": profile.audio_samplerate,
                            "framerate": profile.framerate,
                            "vfr_cfr": profile.vfr_cfr,
                            "deinterlace": profile.deinterlace,
                            "encoder_preset": profile.encoder_preset,
                            "advanced_params": profile.advanced_params
                        }
                        
                        # Start transcoding in background
                        asyncio.create_task(run_transcode_job(next_job.id, next_job.input_path, next_job.output_path, profile_dict, next_job.log_path))
                    else:
                        next_job.status = "failed"
                        next_job.error_message = "Profile not found"
                        db.commit()
        except Exception as e:
            print(f"Queue worker error: {e}")
        finally:
            db.close()
        
        await asyncio.sleep(2)

async def run_transcode_job(job_id: int, input_path: str, output_path: str, profile_dict: dict, log_path: str):
    result = await transcoder.transcode(job_id, input_path, output_path, profile_dict, log_path=log_path)
    
    db = SessionLocal()
    try:
        job = db.query(TranscodeJob).filter(TranscodeJob.id == job_id).first()
        if job:
            if result["status"] == "error":
                job.status = "failed"
                job.error_message = result["message"]
                db.commit()
            else:
                # The transcoder monitor handles setting the status to completed or failed internally,
                # but we should sync the DB state here when it's done.
                # However, transcoder.transcode is async and returns when the process *starts*.
                # We need to wait for it to actually finish. Let's poll transcoder status.
                while True:
                    status = transcoder.get_status(job_id)
                    if status["status"] in ["completed", "failed", "cancelled"]:
                        job.status = status["status"]
                        job.completed_at = datetime.now()
                        
                        import os
                        import shutil
                        
                        if status["status"] in ["failed", "cancelled"]:
                            try:
                                if os.path.exists(job.output_path):
                                    os.remove(job.output_path)
                                # Delete parent dir if empty
                                parent_dir = os.path.dirname(job.output_path)
                                if os.path.exists(parent_dir) and not os.listdir(parent_dir):
                                    os.rmdir(parent_dir)
                            except Exception as e:
                                print(f"Cleanup failed for {job.output_path}: {e}")
                                
                        # Auto delete logic
                        if status["status"] == "completed":
                            try:
                                # Attach custom cover art if present and it's an MKV file
                                if job.output_path and job.output_path.lower().endswith(".mkv"):
                                    poster_path = os.path.join(os.path.dirname(job.input_path), "poster.jpg")
                                    if os.path.exists(poster_path):
                                        import subprocess
                                        try:
                                            subprocess.run([
                                                "mkvpropedit",
                                                job.output_path,
                                                "--attachment-name", "cover.jpg",
                                                "--attachment-mime-type", "image/jpeg",
                                                "--add-attachment", poster_path
                                            ], check=True, capture_output=True)
                                        except Exception as e:
                                            print(f"Failed to attach poster to MKV {job.output_path}: {e}")

                                settings = db.query(Settings).first()
                                
                                # Generate HTML comparison report if enabled (Wait for entire group to finish)
                                profile = db.query(TranscodeProfile).filter(TranscodeProfile.id == job.profile_id).first()
                                
                                unfinished_group_peers = db.query(TranscodeJob).filter(
                                    TranscodeJob.group_name == job.group_name,
                                    TranscodeJob.id != job.id,
                                    TranscodeJob.status != "completed"
                                ).count()

                                if settings and getattr(settings, 'generate_comparison_html', False) and (not profile or profile.media_type != "audio"):
                                    if unfinished_group_peers == 0:
                                        print(f"Generating master comparison report for {job.group_name}...")
                                        from app.core.reports import generate_comparison_report
                                        all_group_jobs = db.query(TranscodeJob).filter(
                                            TranscodeJob.group_name == job.group_name,
                                            TranscodeJob.status == "completed"
                                        ).all()
                                        
                                        if job not in all_group_jobs:
                                            all_group_jobs.append(job)
                                            
                                        # Filter out Extras and group by output directory (for multi-profile)
                                        profile_groups = {}
                                        for gj in all_group_jobs:
                                            if "/Extras/" not in gj.output_path and "\\Extras\\" not in gj.output_path:
                                                out_dir = os.path.dirname(gj.output_path)
                                                if out_dir not in profile_groups:
                                                    profile_groups[out_dir] = []
                                                profile_groups[out_dir].append((gj.input_path, gj.output_path))
                                                
                                        for out_dir, f_pairs in profile_groups.items():
                                            if f_pairs:
                                                generate_comparison_report(f_pairs, out_dir, job.group_name, settings)

                                if settings and getattr(settings, 'auto_transfer_transcodes', False):
                                    if unfinished_group_peers == 0:
                                        from app.api.transcoding import queue_transfer_jobs_for_group
                                        # Determine media type
                                        type_str = "movie"
                                        if profile and profile.media_type == "audio":
                                            type_str = "music"
                                        elif "/Season " in job.output_path or "\\Season " in job.output_path:
                                            type_str = "tv"
                                        
                                        print(f"Auto-transferring group {job.group_name} as {type_str}...")
                                        queue_transfer_jobs_for_group(job.group_name, type_str, db, settings)

                                if settings and settings.auto_delete_rips:
                                    # Ensure no other jobs for this input file failed or are still running
                                    unfinished_peers = db.query(TranscodeJob).filter(
                                        TranscodeJob.input_path == job.input_path,
                                        TranscodeJob.id != job.id,
                                        TranscodeJob.status != "completed"
                                    ).count()
                                    if unfinished_peers == 0:
                                        if os.path.exists(job.input_path):
                                            os.remove(job.input_path)
                            except Exception as e:
                                print(f"Auto-delete failed: {e}")
                                
                        db.commit()
                        break
                    
                    # Update progress in DB (optional, but good for persistence)
                    if "progress" in status:
                        job.progress = status["progress"]
                        db.commit()
                        
                    await asyncio.sleep(2)
    except Exception as e:
        print(f"Job runner error: {e}")
    finally:
        db.close()

def calculate_md5(file_path):
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

async def process_transfers():
    # Clean up orphaned jobs from unexpected shutdowns
    db = SessionLocal()
    try:
        orphans = db.query(TransferJob).filter(TransferJob.status.in_(["transferring", "verifying"])).all()
        for orphan in orphans:
            orphan.status = "queued"
            orphan.progress = 0
            
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
    except Exception as e:
        print(f"Orphan cleanup error: {e}")
    finally:
        db.close()

    while True:
        db = SessionLocal()
        try:
            settings = db.query(Settings).first()
            active_transfer = db.query(TransferJob).filter(TransferJob.status.in_(["transferring", "verifying"])).first()
            
            if not active_transfer:
                next_job = db.query(TransferJob).filter(TransferJob.status == "queued").order_by(TransferJob.created_at.asc()).first()
                if next_job:
                    next_job.status = "transferring"
                    db.commit()
                    db.refresh(next_job)
                    asyncio.create_task(run_transfer_job(next_job.id))
        except Exception as e:
            print(f"Transfer queue worker error: {e}")
        finally:
            db.close()
            
        await asyncio.sleep(1)

async def run_transfer_job(job_id: int):
    import os
    import hashlib
    import shutil
    
    def get_job_settings():
        db = SessionLocal()
        try:
            job = db.query(TransferJob).filter(TransferJob.id == job_id).first()
            settings = db.query(Settings).first()
            if not job:
                return None, None, None, None, None, None
            return job.source_path, job.destination_path, job.status, \
                   settings.verify_checksum_on_push if settings else True, \
                   settings.auto_delete_transcodes_after_push if settings else False, \
                   job.group_name
        finally:
            db.close()
            
    source, dest, initial_status, verify_checksum, auto_delete, group_name = await asyncio.to_thread(get_job_settings)
    if not source:
        return

    def update_job_status(status=None, progress=None, error_message=None, completed=False):
        db = SessionLocal()
        try:
            job = db.query(TransferJob).filter(TransferJob.id == job_id).first()
            if not job:
                return None
            if status is not None:
                job.status = status
            if progress is not None:
                job.progress = progress
            if error_message is not None:
                job.error_message = error_message
            if completed:
                job.completed_at = datetime.now()
            db.commit()
            return job.status
        finally:
            db.close()
            
    try:
        await asyncio.to_thread(os.makedirs, os.path.dirname(dest), exist_ok=True)
        file_size = await asyncio.to_thread(os.path.getsize, source)
        copied = 0
        
        def open_files():
            return open(source, 'rb'), open(dest, 'wb')
            
        fsrc, fdst = await asyncio.to_thread(open_files)
        last_progress = 0
        
        while True:
            chunk = await asyncio.to_thread(fsrc.read, 1024 * 1024 * 16)
            if not chunk:
                break
            await asyncio.to_thread(fdst.write, chunk)
            copied += len(chunk)
            
            new_progress = int((copied / file_size) * 100) if file_size else 100
            if new_progress - last_progress >= 1:
                current_status = await asyncio.to_thread(update_job_status, progress=new_progress)
                if current_status != "transferring":
                    await asyncio.to_thread(fsrc.close)
                    await asyncio.to_thread(fdst.close)
                    return
                last_progress = new_progress
                
        await asyncio.to_thread(fsrc.close)
        await asyncio.to_thread(fdst.close)
        
        try:
            await asyncio.to_thread(shutil.copystat, source, dest)
        except Exception as copystat_e:
            print(f"Warning: Failed to copy stats to {dest}: {copystat_e}")
            
        if verify_checksum:
            await asyncio.to_thread(update_job_status, status="verifying", progress=0)
            
            dest_size = await asyncio.to_thread(os.path.getsize, dest)
            
            if file_size != dest_size:
                await asyncio.to_thread(update_job_status, status="failed", error_message="File size mismatch")
                return
                
            await asyncio.to_thread(update_job_status, progress=100)
        
        await asyncio.to_thread(update_job_status, status="completed", progress=100, completed=True)
        
        if auto_delete:
            try:
                await asyncio.to_thread(os.remove, source)
            except:
                pass
                
    except Exception as e:
        await asyncio.to_thread(update_job_status, status="failed", error_message=str(e))

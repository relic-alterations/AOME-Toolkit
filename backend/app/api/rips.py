from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models.models import MovieRip, Settings, TVShowProfile
from app.core.ripper import Ripper
from app.core.audio_ripper import audio_ripper_instance as audio_ripper
import os
import json

router = APIRouter()
ripper = Ripper()

@router.get("/tv-shows")
def list_tv_shows(db: Session = Depends(get_db)):
    return db.query(TVShowProfile).all()

@router.post("/tv-shows")
def create_tv_show(name: str, year: Optional[int] = None, db: Session = Depends(get_db)):
    show = TVShowProfile(name=name, year=year, progress_data={"season": 1, "next_episode": 1})
    db.add(show)
    db.commit()
    db.refresh(show)
    return show

@router.delete("/tv-shows/{show_id}")
def delete_tv_show(show_id: int, db: Session = Depends(get_db)):
    show = db.query(TVShowProfile).filter(TVShowProfile.id == show_id).first()
    if show:
        db.delete(show)
        db.commit()
    return {"message": "Deleted"}

@router.get("/scan/{device_path:path}")
async def scan_disc(device_path: str):
    """
    Returns a list of titles on the disc in the specified drive.
    """
    from app.main import drive_manager_instance
    return await drive_manager_instance.scan_disc(device_path)

@router.post("/start")
async def start_rip(
    device_path: str, 
    title: str = "", 
    year: Optional[int] = None, 
    mode: str = "movie",
    ripMode: str = "all",
    title_ids: Optional[str] = "all", # comma separated list or 'all'
    subtitle_mode: str = "all",
    tv_show_id: Optional[int] = None,
    episode_map: Optional[str] = None, # JSON string: {"title_id": {"season": 1, "episode": 5}}
    season: Optional[int] = None,
    start_episode: Optional[int] = None,
    end_episode: Optional[int] = None,
    disc_name: Optional[str] = None,
    artist: Optional[str] = None,
    mbid: Optional[str] = None,
    poster: Optional[str] = None,
    db: Session = Depends(get_db)
):
    settings = db.query(Settings).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not found")

    output_base = settings.default_rips_path
    if output_base.startswith("~"):
        output_base = os.path.expanduser(output_base)

    metadata = {
        "mode": mode,
        "ripMode": ripMode,
        "title": title,
        "artist": artist,
        "year": year,
        "mbid": mbid,
        "poster": poster,
        "episode_map": json.loads(episode_map) if episode_map else {},
        "season": season,
        "start_episode": start_episode,
        "end_episode": end_episode
    }

    if mode == "tv":
        if not tv_show_id:
            raise HTTPException(status_code=400, detail="TV Show ID required for TV mode")
        show = db.query(TVShowProfile).filter(TVShowProfile.id == tv_show_id).first()
        if not show:
            raise HTTPException(status_code=404, detail="TV Show Profile not found")
        
        # Update show progress so the next disc defaults to the next episode
        if season is not None and end_episode is not None:
            # We must assign a new dict to trigger SQLAlchemy JSON mutation detection, 
            # or use flag_modified. Creating a new dict is safer.
            show.progress_data = {"season": season, "next_episode": end_episode + 1}
            db.commit()

        folder_name = f"{show.name} ({show.year})" if show.year else show.name
        target_dir = os.path.join(output_base, folder_name)
        os.makedirs(target_dir, exist_ok=True)
        output_dir = os.path.join(target_dir, f".tmp_drive_{device_path.replace('/dev/', '')}")
        metadata["target_dir"] = target_dir
        metadata["title"] = show.name
        metadata["year"] = show.year
    else:
        # For movies: rips/Title (Year)
        folder_name = f"{title} ({year})" if year else title
        target_dir = os.path.join(output_base, folder_name)
        os.makedirs(target_dir, exist_ok=True)
        output_dir = os.path.join(target_dir, f".tmp_drive_{device_path.replace('/dev/', '')}")
        metadata["target_dir"] = target_dir

    import time
    log_dir = os.path.expanduser("~/AOME/logs/rips")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f"rip_{int(time.time())}_{device_path.replace('/', '_')}.log")

    # Start the rip
    if mode in ["album", "mixtape"]:
        result = await audio_ripper.rip_disc(
            device_path,
            output_dir,
            metadata=metadata,
            log_path=log_path
        )
    else:
        result = await ripper.rip_disc(
            device_path, 
            output_dir, 
            title_index=title_ids, 
            subtitle_mode=subtitle_mode,
            metadata=metadata,
            log_path=log_path
        )
    
    if result["status"] == "started":
        # Always create a MovieRip record as a generic 'rip job' for history
        display_title = f"[{disc_name}] {metadata['title']}" if disc_name else metadata["title"]
        new_rip = MovieRip(
            title=display_title,
            year=metadata["year"],
            status="ripping",
            raw_path=output_dir,
            log_path=log_path
        )
        db.add(new_rip)
        db.commit()
        return {"message": "Rip started", "device_path": device_path, "output_dir": output_dir}
    else:
        raise HTTPException(status_code=500, detail=result.get("message", "Failed to start rip"))

@router.get("/status/{device_path:path}")
def get_rip_status(device_path: str):
    res = ripper.get_status(device_path)
    if not res or res.get("status") == "idle":
        audio_res = audio_ripper.get_status(device_path)
        if audio_res and audio_res.get("status") != "idle":
            res = audio_res
    return res

@router.get("/active")
def get_all_active_rips():
    res = ripper.active_rips.copy()
    res.update(audio_ripper.active_rips)
    return res

@router.post("/cancel-all")
async def cancel_all_rips(db: Session = Depends(get_db)):
    for device_path in list(ripper.active_rips.keys()):
        await ripper.cancel_rip(device_path)
        
        # Mark as cancelled in DB if possible
        job = db.query(MovieRip).filter(
            MovieRip.status == "ripping", 
            MovieRip.raw_path.contains(device_path.replace('/dev/', ''))
        ).first()
        if job:
            job.status = "cancelled"
            db.commit()
            
    for device_path in list(audio_ripper.active_rips.keys()):
        await audio_ripper.cancel_rip(device_path)
        
        # Mark as cancelled in DB if possible
        job = db.query(MovieRip).filter(
            MovieRip.status == "ripping", 
            MovieRip.raw_path.contains(device_path.replace('/dev/', ''))
        ).first()
        if job:
            job.status = "cancelled"
            db.commit()
            
    return {"message": "All rips cancelled"}

import requests
@router.get("/history")
def get_rip_history(limit: int = 5, db: Session = Depends(get_db)):
    rips = db.query(MovieRip).filter(MovieRip.status == "completed").order_by(MovieRip.created_at.desc()).limit(limit).all()
    settings = db.query(Settings).first()
    
    results = []
    for rip in rips:
        if not rip.poster_url and rip.title and rip.title != "Unknown Disc":
            if settings and settings.omdb_api_key:
                try:
                    import re
                    clean_title = re.sub(r'^\[.*?\]\s*', '', rip.title)
                    omdb_url = f"http://www.omdbapi.com/?t={requests.utils.quote(clean_title)}&apikey={settings.omdb_api_key}"
                    resp = requests.get(omdb_url, timeout=2)
                    data = resp.json()
                    if data.get("Response") == "True" and data.get("Poster") != "N/A":
                        rip.poster_url = data.get("Poster")
                        db.commit()
                except:
                    pass
        
        results.append({
            "id": rip.id,
            "title": rip.title,
            "year": rip.year,
            "status": rip.status,
            "created_at": rip.created_at,
            "poster_url": rip.poster_url
        })
    return {"history": results}

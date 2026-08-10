from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models.models import MovieRip, TranscodeJob
import os

router = APIRouter()

@router.get("/history")
def get_log_history(db: Session = Depends(get_db)):
    """
    Returns a unified list of recent ripping and transcoding jobs that have logs.
    """
    history = []
    
    rips = db.query(MovieRip).order_by(MovieRip.created_at.desc()).limit(50).all()
    for rip in rips:
        history.append({
            "id": f"rip_{rip.id}",
            "type": "rip",
            "title": rip.title,
            "status": rip.status,
            "created_at": rip.created_at,
            "log_path": rip.log_path
        })
        
    transcodes = db.query(TranscodeJob).order_by(TranscodeJob.created_at.desc()).limit(50).all()
    for t in transcodes:
        history.append({
            "id": f"transcode_{t.id}",
            "type": "transcode",
            "title": os.path.basename(t.input_path),
            "status": t.status,
            "created_at": t.created_at,
            "log_path": t.log_path
        })
        
    # Sort by created_at descending
    history.sort(key=lambda x: x["created_at"], reverse=True)
    return history

@router.get("/content")
def get_log_content(path: str, lines: int = 200):
    """
    Reads the last N lines of a log file.
    """
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Log file not found")
        
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            # Simple tail implementation
            content = f.readlines()
            return {"content": "".join(content[-lines:])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading log: {e}")

@router.post("/{log_id}/cancel")
async def cancel_log(log_id: str, db: Session = Depends(get_db)):
    """
    Cancels the background process associated with a running log.
    """
    try:
        if log_id.startswith("rip_"):
            db_id = int(log_id.replace("rip_", ""))
            job = db.query(MovieRip).filter(MovieRip.id == db_id).first()
            if not job:
                raise HTTPException(status_code=404, detail="Rip not found")
            
            from app.api.rips import ripper
            # Find the active drive using log_path
            drive_to_cancel = None
            for d_idx, rip_state in ripper.active_rips.items():
                if rip_state.get("log_path") == job.log_path:
                    drive_to_cancel = d_idx
                    break
            
            if drive_to_cancel is not None:
                await ripper.cancel_rip(drive_to_cancel)
                
            job.status = "cancelled"
            db.commit()
            return {"message": "Rip cancelled"}
            
        elif log_id.startswith("transcode_"):
            db_id = int(log_id.replace("transcode_", ""))
            job = db.query(TranscodeJob).filter(TranscodeJob.id == db_id).first()
            if not job:
                raise HTTPException(status_code=404, detail="Transcode job not found")
            
            from app.api.transcoding import transcoder
            await transcoder.cancel_job(job.input_path)
            
            job.status = "cancelled"
            db.commit()
            return {"message": "Transcode cancelled"}
        else:
            raise HTTPException(status_code=400, detail="Invalid log ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{log_id}")
def delete_log(log_id: str, db: Session = Depends(get_db)):
    """
    Deletes a log file and clears the history entry, provided it is not actively running.
    log_id format: rip_{id} or transcode_{id}
    """
    try:
        if log_id.startswith("rip_"):
            db_id = int(log_id.replace("rip_", ""))
            job = db.query(MovieRip).filter(MovieRip.id == db_id).first()
            if not job:
                raise HTTPException(status_code=404, detail="Rip not found")
            if job.status in ["started", "ripping", "running"]:
                raise HTTPException(status_code=400, detail="Cannot delete an active rip log")
                
            if job.log_path and os.path.exists(job.log_path):
                os.remove(job.log_path)
            
            db.delete(job)
            db.commit()
            
        elif log_id.startswith("transcode_"):
            db_id = int(log_id.replace("transcode_", ""))
            job = db.query(TranscodeJob).filter(TranscodeJob.id == db_id).first()
            if not job:
                raise HTTPException(status_code=404, detail="Transcode job not found")
            if job.status in ["queued", "processing", "running"]:
                raise HTTPException(status_code=400, detail="Cannot delete an active transcode log")
                
            if job.log_path and os.path.exists(job.log_path):
                os.remove(job.log_path)
                
            db.delete(job)
            db.commit()
            
        else:
            raise HTTPException(status_code=400, detail="Invalid log ID format")
            
        return {"message": "Log deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
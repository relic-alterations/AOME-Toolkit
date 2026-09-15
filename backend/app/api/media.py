from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
import urllib.parse
from app.db.models.models import Settings, TVShowProfile
from pydantic import BaseModel
import os
import shutil
import json

router = APIRouter()

class MoveRequest(BaseModel):
    folder_name: str
    file_path: str # Relative to folder_name (e.g. "title_t00.mkv" or "Extras/Extra Feature 1.mkv")
    target: str # "extras", "season", or "root"
    season: int = 1
    new_name: str = ""

class SwapRequest(BaseModel):
    folder_name: str
    file_path_1: str
    file_path_2: str

class ImportRequest(BaseModel):
    folder_name: str
    mode: str
    title: str = ""
    year: int = None
    tv_show_id: int = None
    season: int = 1
    start_episode: int = 1
    end_episode: int = 1

def _get_rips_path(db: Session):
    settings = db.query(Settings).first()
    path = settings.default_rips_path if settings else "~/AOME/rips"
    return os.path.expanduser(path)

def format_size(size_bytes):
    if size_bytes >= 1024**3:
        return f"{size_bytes / (1024**3):.1f} GB"
    elif size_bytes >= 1024**2:
        return f"{size_bytes / (1024**2):.1f} MB"
    return f"{size_bytes} B"

def get_video_info(file_path: str):
    import subprocess
    size = 0
    duration_str = ""
    try:
        size = os.path.getsize(file_path)
    except:
        pass
        
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, timeout=1
        )
        if result.stdout.strip():
            seconds = float(result.stdout.strip())
            mins = int(seconds // 60)
            secs = int(seconds % 60)
            if mins > 60:
                hours = mins // 60
                mins = mins % 60
                duration_str = f"{hours}h {mins}m"
            else:
                duration_str = f"{mins}m {secs}s"
    except:
        pass
        
    return {"size": format_size(size), "duration": duration_str}

import re

def natural_sort_key(s):
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', s)]

@router.get("/staging")
def get_staging_area(db: Session = Depends(get_db)):
    rips_path = _get_rips_path(db)
    if not os.path.exists(rips_path):
        return {"folders": []}

    folders = []
    for item in os.listdir(rips_path):
        if item.startswith(".tmp_"):
            continue
        item_path = os.path.join(rips_path, item)
        if os.path.isdir(item_path):
            files = []
            extras = []
            seasons = {}

            # Read root files
            for f in os.listdir(item_path):
                f_path = os.path.join(item_path, f)
                if os.path.isfile(f_path) and (f.endswith(".mkv") or f.lower().endswith((".flac", ".wav", ".mp3", ".m4a"))):
                    info = get_video_info(f_path)
                    files.append({"name": f, "path": f, "size": info["size"], "duration": info["duration"]})

            # Read extras
            extras_dir = os.path.join(item_path, "Extras")
            if os.path.exists(extras_dir):
                for f in os.listdir(extras_dir):
                    if f.endswith(".mkv") or f.lower().endswith((".flac", ".wav", ".mp3", ".m4a")):
                        f_path = os.path.join(extras_dir, f)
                        info = get_video_info(f_path)
                        extras.append({"name": f, "path": f"Extras/{f}", "size": info["size"], "duration": info["duration"]})

            # Read seasons
            for d in os.listdir(item_path):
                if d.startswith("Season ") and os.path.isdir(os.path.join(item_path, d)):
                    season_files = []
                    for f in os.listdir(os.path.join(item_path, d)):
                        if f.endswith(".mkv"):
                            f_path = os.path.join(item_path, d, f)
                            info = get_video_info(f_path)
                            season_files.append({"name": f, "path": f"{d}/{f}", "size": info["size"], "duration": info["duration"]})
                    seasons[d] = season_files

            type_guess = "tv" if seasons else "movie"
            # If no seasons but it has SxxExx in root files, it might be unorganized TV
            if type_guess == "movie" and any("S0" in f["name"] for f in files):
                type_guess = "tv"
            elif any(f["name"].lower().endswith((".flac", ".wav", ".mp3", ".m4a")) for f in files):
                type_guess = "music"

            # Naturally sort all lists
            files.sort(key=lambda x: natural_sort_key(x["name"]))
            extras.sort(key=lambda x: natural_sort_key(x["name"]))
            for s in seasons:
                seasons[s].sort(key=lambda x: natural_sort_key(x["name"]))

            # Sort the seasons dictionary itself by season name
            sorted_seasons = {k: seasons[k] for k in sorted(seasons.keys(), key=natural_sort_key)}

            if not files and not extras and not seasons:
                continue

            poster_url = None
            if os.path.exists(os.path.join(item_path, "poster.jpg")):
                poster_url = f"http://localhost:8000/media/staging/{urllib.parse.quote(item)}/poster.jpg"

            folders.append({
                "name": item,
                "type": type_guess,
                "poster_url": poster_url,
                "root_files": files,
                "extras": extras,
                "seasons": sorted_seasons
            })

    return {"folders": folders}

def _get_transcodes_path(db: Session):
    settings = db.query(Settings).first()
    path = settings.default_transcodes_path if settings else "~/AOME/transcodes"
    return os.path.expanduser(path)

@router.get("/final-media")
def get_final_media(db: Session = Depends(get_db)):
    transcodes_path = _get_transcodes_path(db)
    if not os.path.exists(transcodes_path):
        return {"folders": []}

    folders = []
    for item in os.listdir(transcodes_path):
        if item.startswith(".tmp_"):
            continue
        item_path = os.path.join(transcodes_path, item)
        if os.path.isdir(item_path):
            files = []
            extras = []
            seasons = {}

            # Read root files
            for f in os.listdir(item_path):
                f_path = os.path.join(item_path, f)
                if os.path.isfile(f_path) and f.lower().endswith((".mkv", ".mp4", ".flac", ".wav", ".mp3", ".m4a")):
                    info = get_video_info(f_path)
                    files.append({"name": f, "path": f, "size": info["size"], "duration": info["duration"]})

            # Read extras
            extras_dir = os.path.join(item_path, "Extras")
            if os.path.exists(extras_dir):
                for f in os.listdir(extras_dir):
                    if f.lower().endswith((".mkv", ".mp4", ".flac", ".wav", ".mp3", ".m4a")):
                        f_path = os.path.join(extras_dir, f)
                        info = get_video_info(f_path)
                        extras.append({"name": f, "path": f"Extras/{f}", "size": info["size"], "duration": info["duration"]})

            # Read seasons
            for d in os.listdir(item_path):
                if d.startswith("Season ") and os.path.isdir(os.path.join(item_path, d)):
                    season_files = []
                    for f in os.listdir(os.path.join(item_path, d)):
                        if f.lower().endswith((".mkv", ".mp4", ".flac", ".wav", ".mp3", ".m4a")):
                            f_path = os.path.join(item_path, d, f)
                            info = get_video_info(f_path)
                            season_files.append({"name": f, "path": f"{d}/{f}", "size": info["size"], "duration": info["duration"]})
                    seasons[d] = season_files

            type_guess = "tv" if seasons else "movie"
            if type_guess == "movie" and any("S0" in f["name"] for f in files):
                type_guess = "tv"
            if any(f["name"].lower().endswith((".flac", ".wav", ".mp3", ".m4a")) for f in files):
                type_guess = "music"

            files.sort(key=lambda x: natural_sort_key(x["name"]))
            extras.sort(key=lambda x: natural_sort_key(x["name"]))
            for s in seasons:
                seasons[s].sort(key=lambda x: natural_sort_key(x["name"]))
            sorted_seasons = {k: seasons[k] for k in sorted(seasons.keys(), key=natural_sort_key)}

            if not files and not extras and not seasons:
                continue

            poster_url = None
            import urllib.parse
            if type_guess == "music" or os.path.exists(os.path.join(item_path, "poster.jpg")) or os.path.exists(os.path.join(_get_rips_path(db), item, "poster.jpg")):
                poster_url = f"http://localhost:8000/media/final-media/{urllib.parse.quote(item)}/poster.jpg"

            folders.append({
                "name": item,
                "type": type_guess,
                "poster_url": poster_url,
                "root_files": files,
                "seasons": sorted_seasons,
                "extras": extras
            })

    folders.sort(key=lambda x: natural_sort_key(x["name"]))
    print(f"DEBUG get_final_media returning: {folders}")
    return {"folders": folders}

from fastapi.responses import FileResponse
import hashlib

@router.get("/staging/{folder_name}/thumbnail")
def get_thumbnail(folder_name: str, file_path: str, db: Session = Depends(get_db)):
    rips_path = _get_rips_path(db)
    base_folder = os.path.join(rips_path, folder_name)
    target_file = os.path.join(base_folder, file_path)
    
    if not os.path.exists(target_file):
        raise HTTPException(status_code=404, detail="File not found")
        
    thumbs_dir = os.path.join(rips_path, ".thumbnails")
    os.makedirs(thumbs_dir, exist_ok=True)
    
    # Create a unique hash for the thumbnail based on the file path
    path_hash = hashlib.md5(target_file.encode()).hexdigest()
    thumb_path = os.path.join(thumbs_dir, f"{path_hash}.jpg")
    
    if not os.path.exists(thumb_path):
        import subprocess
        # Generate thumbnail at 30 seconds
        cmd = [
            "ffmpeg", "-y", "-ss", "00:00:30", "-i", target_file, 
            "-vframes", "1", "-q:v", "2", "-vf", "scale=320:-1", thumb_path
        ]
        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        except Exception:
            pass
            
    # Fallback to 5 seconds if file is very short
    if not os.path.exists(thumb_path):
        import subprocess
        cmd = [
            "ffmpeg", "-y", "-ss", "00:00:05", "-i", target_file, 
            "-vframes", "1", "-q:v", "2", "-vf", "scale=320:-1", thumb_path
        ]
        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        except Exception:
            pass
            
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path)
        
    raise HTTPException(status_code=404, detail="Could not generate thumbnail")

@router.delete("/staging/{folder_name}")
def delete_staging_folder(folder_name: str, db: Session = Depends(get_db)):
    rips_path = _get_rips_path(db)
    folder_path = os.path.join(rips_path, folder_name)
    if os.path.exists(folder_path):
        shutil.rmtree(folder_path, ignore_errors=True)
        return {"success": True}
    raise HTTPException(status_code=404, detail="Folder not found")

class RenameFolderReq(BaseModel):
    new_name: str

@router.post("/staging/{folder_name}/rename")
def rename_staging_folder(folder_name: str, req: RenameFolderReq, db: Session = Depends(get_db)):
    rips_path = _get_rips_path(db)
    old_path = os.path.join(rips_path, folder_name)
    new_path = os.path.join(rips_path, req.new_name)
    if os.path.exists(old_path):
        os.rename(old_path, new_path)
        return {"success": True}
    raise HTTPException(status_code=404, detail="Folder not found")

@router.post("/move-file")
def move_file(req: MoveRequest, db: Session = Depends(get_db)):
    rips_path = _get_rips_path(db)
    base_folder = os.path.join(rips_path, req.folder_name)
    source_file = os.path.join(base_folder, req.file_path)

    if not os.path.exists(source_file):
        raise HTTPException(status_code=404, detail="Source file not found")

    filename = os.path.basename(source_file)
    if req.new_name:
        filename = req.new_name if req.new_name.endswith(".mkv") else f"{req.new_name}.mkv"

    target_dir = base_folder
    if req.target == "extras":
        target_dir = os.path.join(base_folder, "Extras")
        # Auto-name if going to extras and no new name provided
        if not req.new_name:
            os.makedirs(target_dir, exist_ok=True)
            existing_extras = [f for f in os.listdir(target_dir) if f.endswith(".mkv")]
            filename = f"Extra Feature {len(existing_extras) + 1}.mkv"
    elif req.target == "season":
        target_dir = os.path.join(base_folder, f"Season {req.season:02d}")
    
    os.makedirs(target_dir, exist_ok=True)
    target_file = os.path.join(target_dir, filename)

    try:
        shutil.move(source_file, target_file)
        return {"success": True, "new_path": target_file}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/swap-files")
def swap_files(req: SwapRequest, db: Session = Depends(get_db)):
    rips_path = _get_rips_path(db)
    base_folder = os.path.join(rips_path, req.folder_name)
    
    path1 = os.path.join(base_folder, req.file_path_1)
    path2 = os.path.join(base_folder, req.file_path_2)
    
    if not os.path.exists(path1) or not os.path.exists(path2):
        raise HTTPException(status_code=404, detail="One or both files not found")
        
    temp_path = path1 + ".swap_tmp"
    
    try:
        os.rename(path1, temp_path)
        os.rename(path2, path1)
        os.rename(temp_path, path2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import-folder")
def import_folder(req: ImportRequest, db: Session = Depends(get_db)):
    """
    Takes an unorganized folder and attempts to auto-organize it based on user input.
    """
    rips_path = _get_rips_path(db)
    source_folder = os.path.join(rips_path, req.folder_name)

    if not os.path.exists(source_folder):
        raise HTTPException(status_code=404, detail="Folder not found")

    # Find all media files recursively in the source folder and rename to .processing to prevent collisions
    all_media = []
    original_exts = {}
    for root, dirs, files in os.walk(source_folder):
        for f in files:
            if f.endswith(".mkv") or f.lower().endswith((".flac", ".wav", ".mp3", ".m4a")):
                old_path = os.path.join(root, f)
                ext = os.path.splitext(f)[1]
                temp_path = old_path + ".processing"
                os.rename(old_path, temp_path)
                all_media.append(temp_path)
                original_exts[temp_path] = ext

    if not all_media:
        raise HTTPException(status_code=400, detail="No media files found in folder")

    # Calculate sizes to sort largest to smallest
    file_sizes = {f: os.path.getsize(f) for f in all_media}
    sorted_files = sorted(file_sizes.keys(), key=lambda k: file_sizes[k], reverse=True)

    if req.mode == "movie":
        new_folder_name = f"{req.title} ({req.year})" if req.year else req.title
        new_folder_path = os.path.join(rips_path, new_folder_name)
        
        if new_folder_path != source_folder:
            os.makedirs(new_folder_path, exist_ok=True)
            
        main_feature = sorted_files[0]
        extras = sorted_files[1:]

        # Move main
        shutil.move(main_feature, os.path.join(new_folder_path, f"{new_folder_name}.mkv"))
        
        # Move extras
        if extras:
            extras_dir = os.path.join(new_folder_path, "Extras")
            os.makedirs(extras_dir, exist_ok=True)
            for i, extra in enumerate(extras, 1):
                shutil.move(extra, os.path.join(extras_dir, f"Extra Feature {i}.mkv"))
                
        # Note: We no longer delete the source folder to prevent accidental media loss.

    elif req.mode == "tv":
        show = db.query(TVShowProfile).filter(TVShowProfile.id == req.tv_show_id).first()
        if not show:
            raise HTTPException(status_code=404, detail="TV Show Profile not found")
            
        show_name = show.name
        new_folder_name = f"{show.name} ({show.year})" if show.year else show.name
        new_folder_path = os.path.join(rips_path, new_folder_name)
        
        if new_folder_path != source_folder:
            os.makedirs(new_folder_path, exist_ok=True)

        expected_count = req.end_episode - req.start_episode + 1
        
        # Auto-detect episodes vs extras
        if len(sorted_files) > 1 and file_sizes[sorted_files[0]] > file_sizes[sorted_files[1]] * 1.5:
            # Play-all track detected
            if len(sorted_files) >= expected_count + 1:
                episodes = sorted_files[1:expected_count+1]
                extras = [sorted_files[0]] + sorted_files[expected_count+1:]
            else:
                episodes = [sorted_files[0]]
                extras = sorted_files[1:]
        else:
            episodes = sorted_files[:expected_count]
            extras = sorted_files[expected_count:]

        # Sort episodes alphabetically to maintain order
        episodes.sort()
        
        season_dir = os.path.join(new_folder_path, f"Season {req.season:02d}")
        os.makedirs(season_dir, exist_ok=True)

        # Move episodes
        if len(episodes) == 1 and expected_count > 1:
            # Play-all track renaming
            new_name = f"{show_name} - S{req.season:02d}E{req.start_episode:02d}-E{req.end_episode:02d} [NEEDS SPLIT].mkv"
            shutil.move(episodes[0], os.path.join(season_dir, new_name))
        else:
            for i, file in enumerate(episodes):
                e_num = req.start_episode + i
                new_name = f"{show_name} - S{req.season:02d}E{e_num:02d}.mkv"
                shutil.move(file, os.path.join(season_dir, new_name))

        # Move extras
        if extras:
            extras_dir = os.path.join(new_folder_path, "Extras")
            os.makedirs(extras_dir, exist_ok=True)
            for i, extra in enumerate(extras, 1):
                shutil.move(extra, os.path.join(extras_dir, f"Extra Feature {i}.mkv"))

        # Note: We no longer delete the source folder to prevent accidental media loss.

    elif req.mode in ["album", "mixtape"]:
        new_folder_name = f"{req.title} ({req.year})" if req.year else req.title
        new_folder_path = os.path.join(rips_path, new_folder_name)
        
        if new_folder_path != source_folder:
            os.makedirs(new_folder_path, exist_ok=True)
            
        # For music, we usually keep alphabetical or size order if we don't have track numbers,
        # but let's just sort alphabetically since files are usually named "01 - Track.flac".
        sorted_files_alpha = sorted(sorted_files, key=lambda f: os.path.basename(f))
        
        for i, track in enumerate(sorted_files_alpha, 1):
            ext = original_exts[track]
            # If mixtape, just name it Track 1, Track 2. If album, same unless we have names. 
            # The staging area allows manual renaming later if they want.
            new_name = f"{str(i).zfill(2)} - Track{ext}"
            shutil.move(track, os.path.join(new_folder_path, new_name))

    return {"message": "Folder imported successfully"}

@router.get("/staging/{folder_name}/poster.jpg")
def get_staging_poster(folder_name: str, db: Session = Depends(get_db)):
    from fastapi.responses import FileResponse
    rips_path = _get_rips_path(db)
    poster_path = os.path.join(rips_path, folder_name, "poster.jpg")
    if os.path.exists(poster_path):
        return FileResponse(poster_path)
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    return FileResponse(os.path.join(project_root, "frontend", "public", "default_album.jpg")) # Fallback if it doesn't exist

@router.get("/final-media/{folder_name}/poster.jpg")
def get_final_media_poster(folder_name: str, db: Session = Depends(get_db)):
    from fastapi.responses import FileResponse
    transcodes_path = _get_transcodes_path(db)
    poster_path = os.path.join(transcodes_path, folder_name, "poster.jpg")
    
    # Also fallback to checking the rips folder in case the poster didn't get copied over
    if not os.path.exists(poster_path):
        rips_path = _get_rips_path(db)
        rips_poster = os.path.join(rips_path, folder_name, "poster.jpg")
        if os.path.exists(rips_poster):
            return FileResponse(rips_poster)
            
    if os.path.exists(poster_path):
        return FileResponse(poster_path)
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    return FileResponse(os.path.join(project_root, "frontend", "public", "default_album.jpg"))

from fastapi import WebSocket, WebSocketDisconnect, UploadFile, File, Form
import shutil

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]

    async def send_message(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            await self.active_connections[session_id].send_json(message)

manager = ConnectionManager()

@router.websocket("/ws/capture/{session_id}")
async def websocket_capture(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(session_id)

@router.post("/capture/{session_id}")
async def upload_capture(session_id: str, file: UploadFile = File(...), folder_name: str = Form(None)):
    from app.db.session import SessionLocal
    import urllib.parse
    filepath = None
    image_url = None
    
    if folder_name:
        db = SessionLocal()
        try:
            rips_dir = _get_rips_path(db)
            transcodes_dir = _get_transcodes_path(db)
            
            target_path = None
            if os.path.exists(os.path.join(rips_dir, folder_name)):
                target_path = os.path.join(rips_dir, folder_name)
            elif os.path.exists(os.path.join(transcodes_dir, folder_name)):
                target_path = os.path.join(transcodes_dir, folder_name)
                
            if target_path:
                filepath = os.path.join(target_path, "poster.jpg")
                image_url = f"http://localhost:8000/media/staging/{urllib.parse.quote(folder_name)}/poster.jpg"
        finally:
            db.close()
            
    if not filepath:
        tmp_dir = os.path.expanduser("~/AOME/.tmp_covers")
        os.makedirs(tmp_dir, exist_ok=True)
        ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        filename = f"{session_id}.{ext}"
        filepath = os.path.join(tmp_dir, filename)
        image_url = f"http://localhost:8000/media/tmp_covers/{filename}"
    
    with open(filepath, "wb") as f:
        import shutil
        shutil.copyfileobj(file.file, f)
        
    await manager.send_message(session_id, {"status": "success", "image_url": image_url})
    return {"success": True, "image_url": image_url}

@router.get("/tmp_covers/{filename}")
def get_tmp_cover(filename: str):
    tmp_dir = os.path.expanduser("~/AOME/.tmp_covers")
    filepath = os.path.join(tmp_dir, filename)
    if os.path.exists(filepath):
        from fastapi.responses import FileResponse
        return FileResponse(filepath)
    raise HTTPException(status_code=404, detail="Not found")

@router.get("/server-ip")
def get_server_ip():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return {"ip": ip}

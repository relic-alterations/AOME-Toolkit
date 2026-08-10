from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core.drive_manager import DriveManager
from app.api import settings, rips, transcoding, logs, metadata, media
from app.core.worker import process_queue, process_transfers
from app.db.session import engine, Base
from sqlalchemy import text
import asyncio
import os

# Auto-migrate poster_url and auto_eject columns
try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE movie_rips ADD COLUMN poster_url VARCHAR"))
except Exception:
    pass

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE settings ADD COLUMN auto_eject BOOLEAN DEFAULT 1"))
except Exception:
    pass

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE settings ADD COLUMN skip_confirmations BOOLEAN DEFAULT 0"))
except Exception:
    pass

try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE settings ADD COLUMN export_stats_file BOOLEAN DEFAULT 1"))
except Exception:
    pass

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AOME API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings.router, prefix="/settings", tags=["settings"])
app.include_router(rips.router, prefix="/rips", tags=["rips"])
app.include_router(transcoding.router, prefix="/transcoding", tags=["transcoding"])
app.include_router(logs.router, prefix="/logs", tags=["logs"])
app.include_router(metadata.router, prefix="/metadata", tags=["metadata"])
app.include_router(media.router, prefix="/media", tags=["media"])

drive_manager_instance = DriveManager()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(process_queue())
    asyncio.create_task(process_transfers())

@app.get("/api")
async def root():
    return {"message": "AOME API is running"}

@app.get("/drives")
async def get_drives():
    """
    Returns a list of all detected optical drives and their current status.
    """
    result = await drive_manager_instance.list_drives()
    from app.api.rips import ripper
    
    raw_drives = result.get("drives", [])
    
    # Deduplicate raw drives by device_path (prioritize the one that has a disc)
    unique_drives = {}
    for d in raw_drives:
        path = d["device_path"]
        if path not in unique_drives or d.get("has_disc"):
            unique_drives[path] = d
    drives = list(unique_drives.values())
    
    active_paths = list(ripper.active_rips.keys())
    
    from app.db.session import SessionLocal
    from app.db.models.models import DriveMapping
    db = SessionLocal()
    try:
        mappings = {m.device_path: m.custom_name for m in db.query(DriveMapping).all()}
    finally:
        db.close()

    # Map active rips to drives MakeMKV found
    for d in drives:
        path = d["device_path"]
        if path in mappings:
            d["custom_name"] = mappings[path]
            
        if path in active_paths:
            status = ripper.get_status(path)
            # Clear old finished statuses if the disc has been removed
            if not d.get("has_disc") and status.get("status") in ["completed", "failed", "needs_split", "cancelled"]:
                ripper.active_rips.pop(path, None)
                d["rip_status"] = {"status": "idle"}
            else:
                d["rip_status"] = status
            active_paths.remove(path)
            
    # Inject locked drives MakeMKV excluded
    for path in active_paths:
        rip = ripper.get_status(path)
        drives.append({
            "index": 999,
            "visible": True,
            "enabled": True,
            "drive_name": f"Locked Drive {path}",
            "custom_name": mappings.get(path),
            "disc_name": rip.get("metadata", {}).get("title", "Active Rip"),
            "device_path": path,
            "has_disc": True,
            "rip_status": rip
        })
        
    result["drives"] = sorted(drives, key=lambda x: x["device_path"])
    return result

import shutil
@app.get("/health")
def get_system_health():
    from app.db.session import SessionLocal
    from app.db.models.models import Settings
    db = SessionLocal()
    try:
        settings = db.query(Settings).first()
        check_dir = settings.default_rips_path if settings and settings.default_rips_path else os.path.expanduser("~/AOME/Rips")
    finally:
        db.close()
    
    # Disk Space
    try:
        os.makedirs(check_dir, exist_ok=True)
        total, used, free = shutil.disk_usage(check_dir)
        disk_percent = (used / total) * 100 if total > 0 else 0
    except:
        total, used, free, disk_percent = 0, 0, 0, 0
    
    # CPU Usage Percentage
    try:
        import psutil
        cpu_load_percent = psutil.cpu_percent(interval=None)
    except Exception:
        cpu_load_percent = 0
        
    # CPU Temp
    temp_c = 0
    try:
        if os.path.exists("/sys/class/thermal/thermal_zone0/temp"):
            with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
                temp_c = int(f.read().strip()) / 1000.0
    except:
        pass
        
    # Memory
    mem_total = 0
    mem_avail = 0
    try:
        with open("/proc/meminfo", "r") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    mem_total = int(line.split()[1]) * 1024
                elif line.startswith("MemAvailable:"):
                    mem_avail = int(line.split()[1]) * 1024
    except:
        pass
        
    mem_used_percent = ((mem_total - mem_avail) / mem_total * 100) if mem_total > 0 else 0

    return {
        "cpu_load": round(cpu_load_percent, 1),
        "cpu_temp": round(temp_c, 1),
        "ram_used": round(mem_used_percent, 1),
        "disk_free_gb": round(free / (1024**3), 1),
        "disk_total_gb": round(total / (1024**3), 1),
        "disk_percent": round(disk_percent, 1)
    }

# Serve frontend static files
frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
if os.path.exists(frontend_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")
    
    @app.api_route("/{path_name:path}", methods=["GET"])
    async def catch_all(path_name: str):
        file_path = os.path.join(frontend_path, path_name)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_path, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models.models import Settings
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class SettingsSchema(BaseModel):
    tmdb_api_key: Optional[str] = None
    omdb_api_key: Optional[str] = None
    music_api_key: Optional[str] = None
    makemkv_key: Optional[str] = None
    default_rips_path: Optional[str] = None
    default_transcodes_path: Optional[str] = None
    handbrake_preset: Optional[str] = None
    default_audio_profile: Optional[str] = None
    default_rip_mode: Optional[str] = None
    default_subtitle_mode: Optional[str] = None
    max_concurrent_transcodes: Optional[int] = None
    auto_eject: Optional[bool] = None
    skip_confirmations: Optional[bool] = None
    auto_delete_rips: Optional[bool] = None
    final_destination_path: Optional[str] = None
    tv_shows_export_path: Optional[str] = None
    movies_export_path: Optional[str] = None
    music_export_path: Optional[str] = None
    auto_delete_transcodes_after_push: Optional[bool] = None
    verify_checksum_on_push: Optional[bool] = None
    auto_transcode_rips: Optional[bool] = None
    auto_transcode_target: Optional[str] = None
    export_stats_file: Optional[bool] = None
    multi_profile_transcode: Optional[bool] = None
    auto_transfer_transcodes: Optional[bool] = None
    generate_comparison_html: Optional[bool] = None
    comparison_image_count: Optional[int] = None
    include_video_comparison: Optional[bool] = None
    skip_transcoding_and_finalize: Optional[bool] = None

    class Config:
        from_attributes = True

@router.get("/fetch-makemkv-key")
def fetch_makemkv_key():
    """
    Scrapes the latest MakeMKV beta key from the official forum.
    """
    import requests
    import re
    from bs4 import BeautifulSoup

    url = "https://forum.makemkv.com/forum/viewtopic.php?f=5&t=1053"
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # The key is usually inside a [code] block or just plain text in the first post
        post_content = soup.find('div', class_='content')
        if not post_content:
            raise HTTPException(status_code=404, detail="Could not find post content on forum")

        # Regex for MakeMKV key format: T-xxxxxxxx...
        key_pattern = re.compile(r'T-[a-zA-Z0-9_@\+\-\/]{40,100}')
        match = key_pattern.search(post_content.text)
        
        if match:
            return {"key": match.group(0)}
        else:
            raise HTTPException(status_code=404, detail="MakeMKV key not found in forum post")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch key from forum: {str(e)}")

@router.get("/")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    if not settings:
        # Create default settings if they don't exist
        settings = Settings(
            tmdb_api_key="",
            omdb_api_key="",
            music_api_key="",
            makemkv_key="",
            default_rips_path="~/AOME/rips",
            default_transcodes_path="~/AOME/transcodes",
            handbrake_preset="Fast 1080p30",
            default_rip_mode="all",
            default_subtitle_mode="all",
            max_concurrent_transcodes=1,
            auto_eject=True,
            skip_confirmations=False,
            auto_delete_rips=False,
            final_destination_path="",
            tv_shows_export_path="",
            movies_export_path="",
            music_export_path="",
            auto_delete_transcodes_after_push=False,
            verify_checksum_on_push=True,
            auto_transcode_rips=False,
            auto_transcode_target="all",
            auto_transfer_transcodes=False,
            export_stats_file=True,
            multi_profile_transcode=False,
            skip_transcoding_and_finalize=False
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings

@router.post("/")
def update_settings(settings_data: SettingsSchema, db: Session = Depends(get_db)):
    settings = db.query(Settings).first()
    if not settings:
        settings = Settings()
        db.add(settings)
    
    for key, value in settings_data.dict(exclude_unset=True).items():
        setattr(settings, key, value)
    
    db.commit()
    db.refresh(settings)
    return settings

class DriveMappingSchema(BaseModel):
    device_path: str
    custom_name: str

@router.get("/drive-mappings")
def get_drive_mappings(db: Session = Depends(get_db)):
    from app.db.models.models import DriveMapping
    return db.query(DriveMapping).all()

@router.post("/drive-mappings")
def set_drive_mapping(mapping: DriveMappingSchema, db: Session = Depends(get_db)):
    from app.db.models.models import DriveMapping
    existing = db.query(DriveMapping).filter(DriveMapping.device_path == mapping.device_path).first()
    if existing:
        existing.custom_name = mapping.custom_name
    else:
        new_mapping = DriveMapping(device_path=mapping.device_path, custom_name=mapping.custom_name)
        db.add(new_mapping)
    db.commit()
    return {"status": "success"}

@router.delete("/drive-mappings/{device_path:path}")
def delete_drive_mapping(device_path: str, db: Session = Depends(get_db)):
    from app.db.models.models import DriveMapping
    existing = db.query(DriveMapping).filter(DriveMapping.device_path == device_path).first()
    if existing:
        db.delete(existing)
        db.commit()
    return {"status": "success"}

import os
@router.post("/validate-path")
def validate_path(path_data: dict):
    path = path_data.get("path", "")
    if not path:
        return {"valid": False, "message": "Path cannot be empty"}
        
    path = os.path.expanduser(path)
    
    if not os.path.exists(path):
        return {"valid": False, "message": "Path does not exist"}
        
    # Check write permissions
    test_file = os.path.join(path, ".aome_write_test")
    try:
        with open(test_file, 'w') as f:
            f.write("test")
        os.remove(test_file)
        return {"valid": True, "message": "Path is valid and writable"}
    except Exception as e:
        return {"valid": False, "message": f"Path is not writable: {str(e)}"}

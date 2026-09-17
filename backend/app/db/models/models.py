from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func
from app.db.session import Base

class Settings(Base):
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True, index=True)
    tmdb_api_key = Column(String, nullable=True)
    omdb_api_key = Column(String, nullable=True)
    music_api_key = Column(String, nullable=True)
    makemkv_key = Column(String, nullable=True)
    default_rips_path = Column(String, default="~/AOME/rips")
    default_transcodes_path = Column(String, default="~/AOME/transcodes")
    handbrake_preset = Column(String, default="Fast 1080p30")
    default_audio_profile = Column(String, nullable=True)
    default_rip_mode = Column(String, default="all") # all, main, selection
    default_subtitle_mode = Column(String, default="all") # all, english
    max_concurrent_transcodes = Column(Integer, default=1)
    auto_eject = Column(Boolean, default=True)
    skip_confirmations = Column(Boolean, default=False)
    auto_delete_rips = Column(Boolean, default=False)
    final_destination_path = Column(String, nullable=True)
    tv_shows_export_path = Column(String, nullable=True)
    movies_export_path = Column(String, nullable=True)
    music_export_path = Column(String, nullable=True)
    auto_delete_transcodes_after_push = Column(Boolean, default=False)
    verify_checksum_on_push = Column(Boolean, default=True)
    auto_transcode_rips = Column(Boolean, default=False)
    auto_transcode_target = Column(String, default="all") # all, main
    auto_transfer_transcodes = Column(Boolean, default=False)
    generate_comparison_html = Column(Boolean, default=False)
    comparison_image_count = Column(Integer, default=10)
    include_video_comparison = Column(Boolean, default=False)
    export_stats_file = Column(Boolean, default=True)
    multi_profile_transcode = Column(Boolean, default=False)
    skip_transcoding_and_finalize = Column(Boolean, default=False)
    fallback_handbrake_rip = Column(Boolean, default=False)

class TVShowProfile(Base):
    __tablename__ = "tv_show_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    year = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # Stores current progress: { "season": 1, "last_episode": 4 }
    progress_data = Column(JSON, nullable=True)

class MovieRip(Base):
    __tablename__ = "movie_rips"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    year = Column(Integer, nullable=True)
    status = Column(String, default="pending") # pending, ripping, completed, failed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    raw_path = Column(String, nullable=True)
    log_path = Column(String, nullable=True)
    poster_url = Column(String, nullable=True)

class TranscodeProfile(Base):
    __tablename__ = "transcode_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    media_type = Column(String, default="video") # video or audio
    container = Column(String, default="av_mkv")
    video_encoder = Column(String, default="x264")
    video_quality = Column(Integer, default=22) # Constant Quality (RF)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    audio_encoder = Column(String, default="av_aac")
    audio_bitrate = Column(Integer, default=160)
    audio_mixdown = Column(String, default="stereo") # stereo, 5.1, 7.1
    audio_samplerate = Column(String, default="auto") # auto, 44.1, 48
    framerate = Column(String, default="auto")
    vfr_cfr = Column(String, default="vfr")
    deinterlace = Column(Boolean, default=False)
    encoder_preset = Column(String, default="fast") # slow, medium, fast
    subtitle_mode = Column(String, default="all") # all, english, none
    burn_subtitles = Column(Boolean, default=False)
    advanced_params = Column(String, nullable=True) # JSON or raw string
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class TranscodeJob(Base):
    __tablename__ = "transcode_jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    input_path = Column(String, nullable=False)
    output_path = Column(String, nullable=False)
    profile_id = Column(Integer, ForeignKey("transcode_profiles.id"))
    group_name = Column(String, nullable=True) # Used to group related jobs (e.g. episodes of a show)
    status = Column(String, default="queued") # queued, processing, completed, failed
    progress = Column(Integer, default=0)
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    log_path = Column(String, nullable=True)

class JobQueue(Base):
    __tablename__ = "job_queue"
    
    id = Column(Integer, primary_key=True, index=True)
    job_type = Column(String, nullable=False) # rip, transcode
    status = Column(String, default="queued") # queued, processing, completed, failed
    priority = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    payload = Column(JSON, nullable=False) # Parameters for the job

class TransferJob(Base):
    __tablename__ = "transfer_jobs"
    
    id = Column(Integer, primary_key=True, index=True)
    source_path = Column(String, nullable=False)
    destination_path = Column(String, nullable=False)
    group_name = Column(String, nullable=True) 
    status = Column(String, default="queued") # queued, transferring, verifying, completed, failed
    progress = Column(Integer, default=0) # percentage
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

class DriveMapping(Base):
    __tablename__ = "drive_mappings"
    
    id = Column(Integer, primary_key=True, index=True)
    device_path = Column(String, unique=True, nullable=False)
    custom_name = Column(String, nullable=False)

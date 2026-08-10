import os
import subprocess
import json
import base64
import math

def get_video_duration(filepath: str) -> float:
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration", "-of",
            "default=noprint_wrappers=1:nokey=1", filepath
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return float(result.stdout.strip())
    except Exception as e:
        print(f"Error getting duration for {filepath}: {e}")
        return 0.0

def extract_frame(filepath: str, timestamp: float, output_path: str):
    try:
        cmd = [
            "ffmpeg", "-y", "-ss", str(timestamp), "-i", filepath,
            "-vframes", "1", "-q:v", "2", output_path
        ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        print(f"Error extracting frame at {timestamp} for {filepath}: {e}")

def extract_clip(filepath: str, timestamp: float, duration: int, output_path: str, reencode=False):
    try:
        if reencode:
            # We transcode the raw clip into a web-friendly mp4 because browsers can't natively play some MKV formats (like MPEG2/HEVC).
            cmd = [
                "ffmpeg", "-y", "-ss", str(timestamp), "-i", filepath,
                "-t", str(duration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-c:a", "aac", output_path
            ]
        else:
            # For transcoded file, we can probably just copy it (if it's already mp4) or transcode lightly.
            # To be safe for browser playback, let's also transcode it lightly.
            cmd = [
                "ffmpeg", "-y", "-ss", str(timestamp), "-i", filepath,
                "-t", str(duration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
                "-c:a", "aac", output_path
            ]
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception as e:
        print(f"Error extracting clip at {timestamp} for {filepath}: {e}")

def file_to_base64(filepath: str) -> str:
    with open(filepath, "rb") as f:
        return base64.b64encode(f.read()).decode('utf-8')

def generate_comparison_report(file_pairs: list, output_dir: str, title_name: str, settings):
    try:
        if not file_pairs:
            return

        num_screenshots = 10
        valid_pairs = []
        durations = []
        for r, t in file_pairs:
            d = get_video_duration(t)
            if d <= 0:
                d = get_video_duration(r)
            if d > 0:
                valid_pairs.append((r, t))
                durations.append(d)

        if not valid_pairs:
            print("Could not determine video durations. Skipping comparison report.")
            return

        total_files = len(valid_pairs)
        allocations = [0] * total_files
        for i in range(num_screenshots):
            idx = int(i * total_files / num_screenshots)
            allocations[idx] += 1
            
        timestamps_plan = []
        for i, (r, t) in enumerate(valid_pairs):
            count = allocations[i]
            if count > 0:
                d = durations[i]
                start_time = d * 0.1
                end_time = d * 0.9
                if count == 1:
                    timestamps_plan.append((r, t, d * 0.5))
                else:
                    interval = (end_time - start_time) / (count - 1)
                    for j in range(count):
                        timestamps_plan.append((r, t, start_time + (j * interval)))
            
        temp_dir = os.path.join(output_dir, ".aome_tmp_assets")
        os.makedirs(temp_dir, exist_ok=True)
        
        raw_images = []
        transcoded_images = []
        
        # Extract images
        for i, (r, t, ts) in enumerate(timestamps_plan):
            raw_out = os.path.join(temp_dir, f"raw_{i}.jpg")
            trans_out = os.path.join(temp_dir, f"trans_{i}.jpg")
            extract_frame(r, ts, raw_out)
            extract_frame(t, ts, trans_out)
            
            if os.path.exists(raw_out) and os.path.exists(trans_out):
                raw_images.append((ts, file_to_base64(raw_out)))
                transcoded_images.append((ts, file_to_base64(trans_out)))
                
        # Extract video (pick the middle one)
        has_video = False
        raw_video_b64 = ""
        trans_video_b64 = ""
        if getattr(settings, 'include_video_comparison', False) and timestamps_plan:
            mid_idx = len(timestamps_plan) // 2
            r, t, video_ts = timestamps_plan[mid_idx]
            raw_vid_out = os.path.join(temp_dir, "raw_clip.mp4")
            trans_vid_out = os.path.join(temp_dir, "trans_clip.mp4")
            extract_clip(r, video_ts, 10, raw_vid_out, reencode=True)
            extract_clip(t, video_ts, 10, trans_vid_out, reencode=True)
            
            if os.path.exists(raw_vid_out) and os.path.exists(trans_vid_out):
                raw_video_b64 = file_to_base64(raw_vid_out)
                trans_video_b64 = file_to_base64(trans_vid_out)
                has_video = True
                
        # Generate HTML
        html_path = os.path.join(output_dir, f"{title_name}_Comparison_Report.html")
        with open(html_path, "w") as f:
            f.write(f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>{name_no_ext} - Quality Comparison</title>
    <style>
        body {{ font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 2rem; }}
        .container {{ max-w: 1200px; margin: 0 auto; }}
        h1 {{ text-align: center; color: #38bdf8; }}
        .comparison-block {{ position: relative; margin-bottom: 3rem; border: 1px solid #334155; border-radius: 8px; overflow: hidden; }}
        .comparison-slider {{ position: relative; width: 100%; max-width: 1920px; margin: 0 auto; overflow: hidden; }}
        .comparison-slider img, .comparison-slider video {{ display: block; width: 100%; height: auto; }}
        .img-overlay {{ position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; clip-path: inset(0 50% 0 0); }}
        .slider-handle {{ position: absolute; top: 0; bottom: 0; left: 50%; width: 4px; background: #38bdf8; cursor: ew-resize; z-index: 10; margin-left: -2px; }}
        .slider-handle::after {{ content: '↔'; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #38bdf8; color: #fff; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 0 10px rgba(0,0,0,0.5); }}
        .labels {{ display: flex; justify-content: space-between; padding: 1rem; background: #1e293b; font-weight: bold; }}
        .label-raw {{ color: #fbbf24; }}
        .label-trans {{ color: #4ade80; }}
        .timestamp {{ text-align: center; color: #94a3b8; font-size: 0.9rem; padding-bottom: 0.5rem; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Quality Comparison Report: {name_no_ext}</h1>
''')
            
            for i, (ts, raw_b64) in enumerate(raw_images):
                trans_b64 = transcoded_images[i][1]
                mins = int(ts // 60)
                secs = int(ts % 60)
                f.write(f'''
        <div class="comparison-block">
            <div class="labels">
                <span class="label-raw">Raw Rip</span>
                <span class="timestamp">Timestamp: {mins}:{secs:02d}</span>
                <span class="label-trans">Transcode</span>
            </div>
            <div class="comparison-slider" onmousemove="slide(event, this)" ontouchmove="slide(event, this)" style="background: #000;">
                <img src="data:image/jpeg;base64,{raw_b64}" style="display: block; width: 100%; height: auto; visibility: hidden;" alt="Spacer">
                <img src="data:image/jpeg;base64,{trans_b64}" alt="Transcode" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; object-position: center;">
                <img src="data:image/jpeg;base64,{raw_b64}" class="img-overlay" alt="Raw" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; object-position: center; clip-path: inset(0 50% 0 0);">
                <div class="slider-handle"></div>
            </div>
        </div>
''')
            
            if has_video:
                mins = int(video_ts // 60)
                secs = int(video_ts % 60)
                f.write(f'''
        <h2 style="text-align: center; color: #facc15; margin-top: 4rem;">Video Comparison (10 seconds)</h2>
        <div class="comparison-block" style="cursor: pointer;" onclick="togglePlay(this)">
            <div class="labels">
                <span class="label-raw">Raw Rip (re-encoded for web)</span>
                <span class="timestamp">Timestamp: {mins}:{secs:02d} (Click to Play/Pause)</span>
                <span class="label-trans">Transcode</span>
            </div>
            <div class="comparison-slider" onmousemove="slide(event, this)" ontouchmove="slide(event, this)" style="background: #000;">
                <video src="data:video/mp4;base64,{raw_video_b64}" style="display: block; width: 100%; height: auto; visibility: hidden;" preload="metadata"></video>
                <video src="data:video/mp4;base64,{trans_video_b64}" loop muted autoplay playsinline style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; object-position: center;"></video>
                <video src="data:video/mp4;base64,{raw_video_b64}" class="img-overlay" loop muted autoplay playsinline style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; object-position: center; clip-path: inset(0 50% 0 0);"></video>
                <div class="slider-handle"></div>
            </div>
        </div>
''')
            
            f.write('''
    </div>
    <script>
        function slide(e, container) {
            let clientX = e.clientX;
            if(e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
            }
            const rect = container.getBoundingClientRect();
            let x = clientX - rect.left;
            if (x < 0) x = 0;
            if (x > rect.width) x = rect.width;
            const percentage = (x / rect.width) * 100;
            container.querySelector('.img-overlay').style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
            container.querySelector('.slider-handle').style.left = percentage + '%';
        }
        
        function togglePlay(block) {
            const videos = block.querySelectorAll('video');
            videos.forEach(v => {
                if (v.paused) v.play();
                else v.pause();
            });
        }
    </script>
</body>
</html>
''')

        # Clean up temp assets
        import shutil
        try:
            shutil.rmtree(temp_dir)
        except Exception as e:
            print(f"Error deleting temp assets: {e}")
            
        # Dump metadata for stats export
        metadata = {
            "timestamps": [f"{int(ts // 60)}:{int(ts % 60):02d}" for ts in timestamps],
            "video_timestamp": f"{int(video_ts // 60)}:{int(video_ts % 60):02d}" if has_video else None
        }
        with open(os.path.join(output_dir, "comparison_metadata.json"), "w") as f:
            json.dump(metadata, f)
            
    except Exception as e:
        print(f"Failed to generate report: {e}")

# This will be used by transcoding.py when exporting stats
def generate_stats_content(title_name: str, media_type: str, matched_rip, t_jobs, settings) -> str:
    content = "AOME EXPORT STATS\n"
    content += "=================\n\n"
    content += f"Title Name: {title_name}\n"
    content += f"Media Type: {media_type.upper()}\n"
    if matched_rip:
        content += f"Original Disc/Drive: {matched_rip.title}\n"
        content += f"Rip Started At: {matched_rip.created_at}\n"
    
    if t_jobs:
        content += "\n--- Transcoding Profiles Used ---\n"
        from app.db.database import SessionLocal
        from app.db.models.models import TranscodeProfile
        
        db = SessionLocal()
        try:
            for job in t_jobs:
                profile = db.query(TranscodeProfile).filter(TranscodeProfile.id == job.profile_id).first()
                if profile:
                    content += f"File: {os.path.basename(job.output_path)}\n"
                    content += f"  Profile: {profile.name}\n"
                    content += f"  Video Encoder: {profile.video_encoder}\n"
                    content += f"  Quality (RF): {profile.quality_rf}\n"
                    content += f"  Preset: {profile.encoder_preset}\n"
                    content += f"  Audio Encoder: {profile.audio_encoder}\n"
                    content += f"  Bitrate: {profile.audio_bitrate}\n"
                    content += f"  Subtitles: {profile.subtitle_mode}\n"
                    content += "-" * 30 + "\n"
        finally:
            db.close()
            
    return content

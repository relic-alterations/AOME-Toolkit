import asyncio
import os
import re

class Transcoder:
    """
    Asynchronous wrapper for Handbrake CLI to handle transcoding operations.
    """

    def __init__(self, handbrake_cli_path="HandBrakeCLI"):
        self.handbrake_cli_path = handbrake_cli_path
        self.active_jobs = {} # job_id -> job mapping

    async def transcode(self, job_id, input_path, output_path, profile_data=None, log_path=None):
        """
        Transcodes a file using Handbrake with detailed settings.
        
        :param input_path: Path to the raw MKV file.
        :param output_path: Path where the transcoded file will be saved.
        :param profile_data: Dictionary containing transcoding options.
        :param log_path: Path to save the transcoder log file.
        """
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)

        if profile_data is None:
            profile_data = {"preset": "Fast 1080p30"}

        if profile_data.get("media_type") == "audio":
            # Use ffmpeg for audio
            # We want lossless FLAC or high-quality MP3
            cmd = ["nice", "-n", "19", "ffmpeg", "-y", "-i", input_path]
            
            input_dir = os.path.dirname(input_path)
            
            poster_jpg = os.path.join(input_dir, "poster.jpg")
            has_poster = os.path.exists(poster_jpg)
            if has_poster:
                cmd.extend(["-i", poster_jpg])
                
            # Now output options
            a_enc = profile_data.get("audio_encoder", "flac")
            cmd.extend(["-c:a", a_enc])
            
            if a_enc == "libmp3lame":
                bitrate = str(profile_data.get("audio_bitrate", "320"))
                cmd.extend(["-b:a", f"{bitrate}k"])
                
            if has_poster:
                cmd.extend(["-map", "0:a", "-map", "1:v", "-c:v", "copy", "-disposition:v", "attached_pic"])

            meta_json = os.path.join(input_dir, "metadata.json")
            if os.path.exists(meta_json):
                try:
                    import json, re
                    with open(meta_json, "r") as f:
                        meta = json.load(f)
                    
                    if meta.get("artist"):
                        cmd.extend(["-metadata", f"artist={meta['artist']}"])
                        cmd.extend(["-metadata", f"album_artist={meta['artist']}"])
                    if meta.get("title"):
                        cmd.extend(["-metadata", f"album={meta['title']}"])
                    if meta.get("year"):
                        cmd.extend(["-metadata", f"date={meta['year']}"])
                        
                    # Try to guess track number and title from filename
                    # "01 - Track.wav" -> track: 1, title: "Track"
                    basename = os.path.basename(input_path)
                    name_no_ext = os.path.splitext(basename)[0]
                    m = re.match(r"^(\d+)\s*-\s*(.+)$", name_no_ext)
                    if m:
                        cmd.extend(["-metadata", f"track={int(m.group(1))}"])
                        cmd.extend(["-metadata", f"title={m.group(2).strip()}"])
                    else:
                        cmd.extend(["-metadata", f"title={name_no_ext}"])
                except Exception as e:
                    print(f"Failed to apply audio metadata: {e}")

            cmd.append(output_path)
        else:
            # Base command for HandBrake
            cmd = [
                "nice", "-n", "19",
                self.handbrake_cli_path,
                "-i", input_path,
                "-o", output_path,
            ]

            # Apply Profile Settings
            if "container" in profile_data:
                cmd.extend(["--format", profile_data["container"]])
                
            if "video_encoder" in profile_data:
                cmd.extend(["-e", profile_data["video_encoder"]])
                
            if "video_quality" in profile_data:
                cmd.extend(["-q", str(profile_data["video_quality"])])
                
            if profile_data.get("width") or profile_data.get("height"):
                if profile_data.get("width"):
                    cmd.extend(["-w", str(profile_data["width"])])
                if profile_data.get("height"):
                    cmd.extend(["-l", str(profile_data["height"])])

            if "audio_encoder" in profile_data:
                cmd.extend(["-E", profile_data["audio_encoder"]])
            
            if "audio_bitrate" in profile_data:
                cmd.extend(["-B", str(profile_data["audio_bitrate"])])
                
            if profile_data.get("audio_mixdown"):
                cmd.extend(["--mixdown", profile_data["audio_mixdown"]])
                
            if profile_data.get("encoder_preset"):
                cmd.extend(["--encoder-preset", profile_data["encoder_preset"]])
                
            if profile_data.get("framerate") and profile_data["framerate"] != "auto":
                cmd.extend(["-r", profile_data["framerate"]])
                
            if profile_data.get("vfr_cfr") == "cfr":
                cmd.extend(["--cfr"])
            else:
                cmd.extend(["--vfr"])
                
            if profile_data.get("deinterlace"):
                cmd.extend(["--decomb"])

            # Subtitle Handling
            if profile_data.get("subtitle_mode") == "english":
                cmd.extend(["--subtitle-lang-list", "eng", "--first-subtitle"])
            elif profile_data.get("subtitle_mode") == "all":
                cmd.extend(["--all-subtitles"])
            
            if profile_data.get("burn_subtitles"):
                cmd.extend(["--subtitle-burned"])

            # Advanced params (raw string from profile)
            if profile_data.get("advanced_params"):
                # Simple splitting by space for now, assuming user knows what they are doing
                cmd.extend(profile_data["advanced_params"].split())

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )
            
            self.active_jobs[job_id] = {
                "process": process,
                "output_path": output_path,
                "status": "transcoding",
                "progress": 0,
                "eta": "",
                "log_path": log_path
            }

            # Start monitoring output in the background
            asyncio.create_task(self._monitor_output(job_id, process, log_path))
            
            return {"status": "started", "job_id": job_id, "output": output_path}

        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def _monitor_output(self, job_id, process, log_path=None):
        """
        Parses Handbrake stdout/stderr to track progress.
        Example output: Encoding: task 1 of 1, 12.45 % (45.12 fps, avg 43.10 fps, ETA 00h12m45s)
        """
        progress_pattern = re.compile(r"Encoding: task \d+ of \d+, ([\d\.]+) % \(.*ETA (.*)\)")
        f = open(log_path, "a") if log_path else None

        try:
            buffer = b""
            while True:
                chunk = await process.stdout.read(4096)
                if not chunk:
                    # process remaining buffer
                    if buffer:
                        decoded_line = buffer.decode(errors='replace').strip()
                        if f and decoded_line:
                            f.write(decoded_line + "\n")
                            f.flush()
                    break
                
                buffer += chunk
                while b'\r' in buffer or b'\n' in buffer:
                    if b'\r' in buffer and (b'\n' not in buffer or buffer.find(b'\r') < buffer.find(b'\n')):
                        line, buffer = buffer.split(b'\r', 1)
                    else:
                        line, buffer = buffer.split(b'\n', 1)
                    
                    decoded_line = line.decode(errors='replace').strip()
                    if not decoded_line:
                        continue
                        
                    if f:
                        f.write(decoded_line + "\n")
                        f.flush()
                    
                    match = progress_pattern.search(decoded_line)
                    if match:
                        progress = float(match.group(1))
                        eta = match.group(2)
                        self.active_jobs[job_id]["progress"] = progress
                        self.active_jobs[job_id]["eta"] = eta

            return_code = await process.wait()
            if self.active_jobs[job_id].get("status") == "cancelled":
                pass # preserve cancelled status
            elif return_code == 0:
                self.active_jobs[job_id]["status"] = "completed"
                self.active_jobs[job_id]["progress"] = 100
            else:
                self.active_jobs[job_id]["status"] = "failed"
        finally:
            if f:
                f.close()
            
    def get_status(self, job_id):
        """
        Returns the current status of a transcoding job.
        """
        job = self.active_jobs.get(job_id)
        if job:
            data = dict(job)
            data.pop("process", None)
            
            # Extract last line from log file directly
            log_path = data.get("log_path")
            if log_path and os.path.exists(log_path):
                try:
                    with open(log_path, 'rb') as f:
                        try:
                            f.seek(-1024, os.SEEK_END)
                        except OSError:
                            f.seek(0)
                        lines = f.readlines()
                        if lines:
                            data["last_log_line"] = lines[-1].decode(errors='replace').strip()
                except Exception:
                    pass
                    
            return data
        return {"status": "idle"}

    async def cancel_job(self, job_id):
        """
        Terminates an active transcoding job.
        """
        if job_id in self.active_jobs:
            process = self.active_jobs[job_id]["process"]
            try:
                process.kill()
                await process.wait()
                self.active_jobs[job_id]["status"] = "cancelled"
                return True
            except Exception:
                return False
        return False

transcoder_instance = Transcoder()

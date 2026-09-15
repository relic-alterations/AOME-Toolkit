import asyncio
import os
import time
import shutil

class AudioRipper:
    def __init__(self):
        self.active_rips = {}
        self.active_processes = {}

    async def rip_disc(self, device_path, output_dir, metadata=None, log_path=None):
        if not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
            
        self.active_rips[device_path] = {
            "status": "Ripping tracks (cdparanoia)...",
            "progress": 0,
            "title": metadata.get("title", "Unknown Audio CD") if metadata else "Unknown Audio CD",
            "output_dir": output_dir
        }
        
        asyncio.create_task(self._run_rip(device_path, output_dir, metadata, log_path))
        return {"status": "started"}

    async def _run_rip(self, device_path, output_dir, metadata, log_path):
        # We will use cdparanoia -B to extract all tracks as wav
        cmd = ["cdparanoia", "-d", device_path, "-B"]
        
        log_file = None
        if log_path:
            log_file = open(log_path, "w")
            
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=output_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT
            )
            self.active_processes[device_path] = process
            
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                    
                text = line.decode('utf-8', errors='replace').strip()
                if text:
                    if log_file:
                        log_file.write(text + "\n")
                        log_file.flush()
                    
                    self.active_rips[device_path]["last_log_line"] = text
                    
            await process.wait()
                
            if process.returncode == 0:
                self.active_rips[device_path]["progress"] = 100
                self.active_rips[device_path]["status"] = "completed"
                
                # Fetch tracklist and poster from MusicBrainz if mbid is provided
                track_names = {}
                mbid = metadata.get("mbid")
                poster = metadata.get("poster")
                if mbid:
                    try:
                        import requests
                        url = f"https://musicbrainz.org/ws/2/release/{mbid}?inc=recordings&fmt=json"
                        resp = requests.get(url, headers={'User-Agent': 'AOME/1.0'}, timeout=10)
                        if resp.ok:
                            data = resp.json()
                            for media_item in data.get("media", []):
                                for track in media_item.get("tracks", []):
                                    num = track.get("number", "")
                                    try:
                                        idx = int(num)
                                        track_names[idx] = track.get("title", "Track").replace("/", "-").replace("\\", "-")
                                    except:
                                        pass
                    except Exception as e:
                        print(f"Failed to fetch tracklist: {e}")
                        
                if poster:
                    try:
                        import requests
                        resp = requests.get(poster, headers={'User-Agent': 'AOME/1.0'}, timeout=10)
                        if resp.ok:
                            with open(os.path.join(output_dir, "poster.jpg"), "wb") as f:
                                f.write(resp.content)
                    except Exception as e:
                        print(f"Failed to fetch poster: {e}")
                
                # After extraction, rename .wav files
                tracks = sorted([f for f in os.listdir(output_dir) if f.endswith(".wav")])
                for i, t in enumerate(tracks, 1):
                    t_name = track_names.get(i, "Track")
                    new_name = f"{str(i).zfill(2)} - {t_name}.wav"
                    os.rename(os.path.join(output_dir, t), os.path.join(output_dir, new_name))
                
                # Move from .tmp to final target dir
                target_dir = metadata.get("target_dir", output_dir)
                if output_dir != target_dir:
                    os.makedirs(target_dir, exist_ok=True)
                    for f in os.listdir(output_dir):
                        shutil.move(os.path.join(output_dir, f), os.path.join(target_dir, f))
                    shutil.rmtree(output_dir, ignore_errors=True)
                
                # Save metadata for transcoder
                import json
                try:
                    with open(os.path.join(target_dir, "metadata.json"), "w") as f:
                        json.dump(metadata, f)
                except Exception as e:
                    print(f"Failed to write metadata.json: {e}")
            else:
                self.active_rips[device_path]["status"] = "failed"
                
        except asyncio.CancelledError:
            self.active_rips[device_path]["status"] = "cancelled"
        except Exception as e:
            self.active_rips[device_path]["status"] = "failed"
            print(f"Error in audio rip: {e}")
        finally:
            if log_file:
                log_file.close()
                
            if device_path in self.active_processes:
                del self.active_processes[device_path]
                
            # Database and Eject Logic
            from app.db.session import SessionLocal
            from app.db.models.models import Settings, MovieRip
            db = SessionLocal()
            try:
                if log_path:
                    db_rip = db.query(MovieRip).filter(MovieRip.log_path == log_path).first()
                    if db_rip:
                        db_rip.status = self.active_rips[device_path]["status"]
                        if metadata.get("poster"):
                            db_rip.poster_url = metadata.get("poster")
                        db.commit()
                
                settings = db.query(Settings).first()
                
                # Auto-finalize Logic
                if settings and settings.skip_transcoding_and_finalize and self.active_rips[device_path]["status"] == "completed":
                    dest_base = settings.music_export_path
                    if dest_base and os.path.exists(target_dir):
                        folder_name = os.path.basename(os.path.normpath(target_dir))
                        final_dest = os.path.join(dest_base, folder_name)
                        try:
                            shutil.move(target_dir, final_dest)
                            print(f"Skipped transcoding. Successfully moved {folder_name} to {final_dest}")
                        except Exception as e:
                            print(f"Direct to final move failed: {e}")
                            
                elif settings and settings.auto_transcode_rips and self.active_rips[device_path]["status"] == "completed":
                    from app.db.models.models import TranscodeProfile
                    preset_names = [x.strip() for x in (settings.default_audio_profile or "").split(",") if x.strip()]
                    profiles = db.query(TranscodeProfile).filter(TranscodeProfile.name.in_(preset_names), TranscodeProfile.media_type == "audio").all() if preset_names else []
                    if not profiles:
                        # Fallback to first audio profile
                        first_p = db.query(TranscodeProfile).filter(TranscodeProfile.media_type == "audio").first()
                        if first_p:
                            profiles = [first_p]
                        
                    if profiles:
                        from app.api.transcoding import start_job
                        p_ids = [p.id for p in profiles]
                        target_mode = settings.auto_transcode_target if hasattr(settings, 'auto_transcode_target') and settings.auto_transcode_target else "all"
                        try:
                            await start_job(input_path=target_dir, profile_id=p_ids[0], profile_ids=",".join(map(str, p_ids)), target_mode=target_mode, db=db)
                        except Exception as e:
                            print(f"Auto-transcode failed to queue: {e}")

                if not settings or settings.auto_eject:
                    import subprocess
                    subprocess.run(["eject", device_path], check=False)
            except Exception as e:
                print(f"Error in audio ripper post-db logic: {e}")
            finally:
                db.close()

    def get_status(self, device_path):
        return self.active_rips.get(device_path, None)

    async def cancel_rip(self, device_path):
        if device_path in self.active_processes:
            process = self.active_processes[device_path]
            try:
                process.terminate()
            except Exception:
                pass
            self.active_rips[device_path]["status"] = "cancelled"
            return True
        return False
            
audio_ripper_instance = AudioRipper()
# Patch skip_transcoding_and_finalize block 

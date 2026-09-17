import asyncio
import os
import re

class Ripper:
    """
    Asynchronous wrapper for MakeMKV CLI (makemkvcon) to handle ripping operations.
    """

    def __init__(self, makemkvcon_path="makemkvcon"):
        self.makemkvcon_path = makemkvcon_path
        self.active_rips = {} # index -> process mapping

    async def _get_makemkv_env(self):
        """
        Retrieves the registration key from the database and returns it in an env dict.
        Also ensures the key is written to ~/.MakeMKV/settings.conf for CLI reliability.
        """
        from app.db.session import SessionLocal
        from app.db.models.models import Settings
        
        env = os.environ.copy()
        db = SessionLocal()
        try:
            settings = db.query(Settings).first()
            if settings and settings.makemkv_key:
                key = settings.makemkv_key
                env["MAKEMKVCON_KEY"] = key
                
                # Ensure ~/.MakeMKV/settings.conf is updated
                try:
                    conf_dir = os.path.expanduser("~/.MakeMKV")
                    os.makedirs(conf_dir, exist_ok=True)
                    conf_path = os.path.join(conf_dir, "settings.conf")
                    
                    content = ""
                    if os.path.exists(conf_path):
                        with open(conf_path, "r") as f:
                            content = f.read()
                    
                    if 'app_Key = "' in content:
                        import re
                        new_content = re.sub(r'app_Key = ".*?"', f'app_Key = "{key}"', content)
                        with open(conf_path, "w") as f:
                            f.write(new_content)
                    else:
                        with open(conf_path, "a") as f:
                            if content and not content.endswith("\n"):
                                f.write("\n")
                            f.write(f'app_Key = "{key}"\n')
                except Exception as e:
                    print(f"Warning: Failed to update MakeMKV settings.conf: {e}")
        finally:
            db.close()
        return env

    async def rip_disc(self, device_path, output_dir, title_index="all", subtitle_mode="all", metadata=None, log_path=None):
        """
        Rips a disc from the specified drive.
        
        :param device_path: The device path to rip from (e.g., /dev/sr0).
        :param output_dir: Directory where the rip will be saved.
        :param title_index: Which title to rip ('all', a specific ID, or a list of IDs like '0,1,2').
        :param subtitle_mode: 'all' or 'english'.
        :param metadata: Dict containing mode, title, year, episode_map
        :param log_path: File path to save output logs.
        """
        if not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        else:
            import shutil
            for filename in os.listdir(output_dir):
                filepath = os.path.join(output_dir, filename)
                try:
                    if os.path.isfile(filepath) or os.path.islink(filepath):
                        os.unlink(filepath)
                    elif os.path.isdir(filepath):
                        shutil.rmtree(filepath)
                except Exception as e:
                    print(f"Failed to delete {filepath}. Reason: {e}")

        if metadata is None:
            metadata = {}

        # Handle multiple title IDs if passed as a list or comma-separated string
        if isinstance(title_index, list):
            title_index = ",".join(map(str, title_index))

        # command format: makemkvcon [options] mkv dev:<device_path> <title_index> <output_dir>
        cmd = [
            self.makemkvcon_path,
            "-r", # use stdout for messages
            "mkv",
            f"dev:{device_path}",
            str(title_index),
            output_dir
        ]
        
        try:
            env = await self._get_makemkv_env()
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            
            self.active_rips[device_path] = {
                "process": process,
                "output_dir": output_dir,
                "status": "initializing",
                "progress": 0,
                "titles_completed": 0,
                "titles_total": 0,
                "metadata": metadata,
                "log_path": log_path
            }

            # Start monitoring output in the background
            asyncio.create_task(self._monitor_output(device_path, process, metadata, log_path))
            
            return {"status": "started", "device_path": device_path, "output_dir": output_dir}

        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def _monitor_output(self, device_path, process, metadata, log_path=None):
        """
        Parses makemkvcon stdout to track progress and logs it.
        Also polls the output directory to infer title completion when MakeMKV is silent.
        """
        f = open(log_path, "a") if log_path else None
        try:
            while True:
                try:
                    line = await asyncio.wait_for(process.stdout.readline(), timeout=2.0)
                    if not line:
                        break
                    
                    decoded_line = line.decode().strip()
                    if f:
                        f.write(decoded_line + "\n")
                        f.flush()
                        
                    if decoded_line:
                        # Extract human readable message from MSG: code,flags,count,"Message"
                        if decoded_line.startswith("MSG:"):
                            try:
                                # the last quoted string is usually the human readable part, or we can just split by quote
                                parts = decoded_line.split('"')
                                if len(parts) >= 2:
                                    # Use the first quoted string as the primary message
                                    self.active_rips[device_path]["last_log_line"] = parts[1]
                                else:
                                    self.active_rips[device_path]["last_log_line"] = decoded_line
                            except Exception:
                                self.active_rips[device_path]["last_log_line"] = decoded_line
                        elif not (decoded_line.startswith("PRGV:") or decoded_line.startswith("PRGC:") or decoded_line.startswith("PRGW:") or decoded_line.startswith("DRV:")):
                            self.active_rips[device_path]["last_log_line"] = decoded_line
                    
                    # Example progress line: PRGC:type,code,name
                    # Example progress update: PRGV:current,total,max
                    if decoded_line.startswith("PRGV:"):
                        # PRGV:current,min,max
                        parts = decoded_line.replace("PRGV:", "").split(",")
                        if len(parts) >= 3:
                            try:
                                current = int(parts[0])
                                max_val = int(parts[2])
                                if max_val > 0:
                                    self.active_rips[device_path]["progress"] = min(100, round((current / max_val) * 100, 1))
                            except ValueError:
                                pass
                                
                    elif decoded_line.startswith("MSG:2003") or "Failed to save title" in decoded_line:
                        self.active_rips[device_path]["scsi_error"] = True
                    elif decoded_line.startswith("MSG:5014"):
                        # MSG:5014 indicates MakeMKV has finished scanning and is now saving titles
                        if self.active_rips[device_path]["status"] == "initializing":
                            self.active_rips[device_path]["status"] = "ripping"
                        match = re.search(r'"Saving (\d+) titles into directory', decoded_line)
                        if match and self.active_rips[device_path]["titles_total"] == 0:
                            self.active_rips[device_path]["titles_total"] = int(match.group(1))
                    
                    elif "Failed to open disc" in decoded_line:
                        self.active_rips[device_path]["status"] = "failed"
                        
                except asyncio.TimeoutError:
                    # MakeMKV is busy ripping silently (PRGV is suppressed).
                    pass
                
                # Periodically update titles_completed and pseudo-progress by checking the output directory
                rip_info = self.active_rips.get(device_path)
                if rip_info and rip_info["status"] == "ripping":
                    output_dir = rip_info["output_dir"]
                    if os.path.exists(output_dir):
                        # Count the number of .mkv files created
                        mkv_count = len([x for x in os.listdir(output_dir) if x.endswith('.mkv')])
                        if mkv_count > 0:
                            # If 1 file exists, 0 are fully completed. If 2 exist, 1 is completed.
                            rip_info["titles_completed"] = min(mkv_count - 1, rip_info["titles_total"])
                            
                        # Update progress based on titles_completed to show some movement
                        if rip_info["titles_total"] > 0:
                            # e.g., 1 out of 4 titles completed = 25%
                            # We can also add a small bump based on mkv_count so it doesn't stay completely static
                            # if mkv_count is 1 and total is 4, base is 0%. We can fake 10% just to show it's working.
                            base_pct = (rip_info["titles_completed"] / rip_info["titles_total"]) * 100
                            rip_info["progress"] = min(100, round(base_pct, 1))
                            
            return_code = await process.wait()
            scsi_failed = self.active_rips[device_path].get("scsi_error", False)
            if (return_code == 0 and not scsi_failed) and self.active_rips[device_path].get("status") != "failed":
                if self.active_rips[device_path].get("titles_total", 0) > 0:
                    self.active_rips[device_path]["titles_completed"] = self.active_rips[device_path]["titles_total"]
                    self.active_rips[device_path]["progress"] = 100
                    
                needs_split = await self._post_process_rip(device_path, metadata)
                if needs_split:
                    self.active_rips[device_path]["status"] = "needs_split"
                else:
                    self.active_rips[device_path]["status"] = "completed"
            else:
                fallback_success = False
                try:
                    from app.db.session import SessionLocal
                    from app.db.models.models import Settings
                    db = SessionLocal()
                    settings = db.query(Settings).first()
                    fallback_enabled = settings.fallback_handbrake_rip if settings else False
                    db.close()
                    if fallback_enabled and metadata.get("mode") == "movie":
                        fallback_success = await self._handbrake_fallback_rip(device_path, output_dir, metadata, log_path)
                except Exception as e:
                    print(f"Fallback error: {e}")
                
                if fallback_success:
                    self.active_rips[device_path]["status"] = "completed"
                    await self._post_process_rip(device_path, metadata)
                else:
                    self.active_rips[device_path]["status"] = "failed"
                
            # Update DB, trigger auto-transcode, and auto-eject disc
            try:
                from app.db.session import SessionLocal
                from app.db.models.models import Settings, MovieRip, TranscodeProfile
                db = SessionLocal()
                try:
                    # Sync final status to the log history in database
                    if log_path:
                        db_rip = db.query(MovieRip).filter(MovieRip.log_path == log_path).first()
                        if db_rip:
                            db_rip.status = self.active_rips[device_path]["status"]
                            db.commit()
                            
                    settings = db.query(Settings).first()
                    
                    # Auto-Transcode or Direct-to-Final Logic
                    if settings and settings.skip_transcoding_and_finalize and self.active_rips[device_path]["status"] == "completed":
                        target_dir = metadata.get("target_dir", self.active_rips[device_path]["output_dir"])
                        mode = metadata.get("mode", "movie")
                        dest_base = settings.movies_export_path if mode == "movie" else settings.tv_shows_export_path
                        
                        if dest_base and os.path.exists(target_dir):
                            folder_name = os.path.basename(os.path.normpath(target_dir))
                            final_dest = os.path.join(dest_base, folder_name)
                            try:
                                import shutil
                                shutil.move(target_dir, final_dest)
                                print(f"Skipped transcoding. Successfully moved {folder_name} to {final_dest}")
                                
                                # Generate a simple stats file
                                if settings.export_stats_file:
                                    stats_path = os.path.join(final_dest, "aome_stats.txt")
                                    with open(stats_path, "w") as sf:
                                        sf.write("AOME EXPORT STATS (DIRECT RIP)\n==============================\n")
                                        sf.write(f"Title Name: {folder_name}\n")
                                        sf.write(f"Media Type: {mode.upper()}\n")
                                        sf.write("Note: Transcoding was skipped. This is the raw MakeMKV rip.\n")
                            except Exception as e:
                                print(f"Direct to final move failed: {e}")
                                
                    elif settings and settings.auto_transcode_rips and self.active_rips[device_path]["status"] == "completed":
                        preset_names = [x.strip() for x in (settings.handbrake_preset or "").split(",") if x.strip()]
                        profiles = db.query(TranscodeProfile).filter(TranscodeProfile.name.in_(preset_names), (TranscodeProfile.media_type == "video") | (TranscodeProfile.media_type == None)).all() if preset_names else []
                        if not profiles:
                            first_p = db.query(TranscodeProfile).filter((TranscodeProfile.media_type == "video") | (TranscodeProfile.media_type == None)).first()
                            if first_p:
                                profiles = [first_p]
                            
                        if profiles:
                            from app.api.transcoding import start_job
                            target_dir = metadata.get("target_dir", self.active_rips[device_path]["output_dir"])
                            p_ids = [p.id for p in profiles]
                            target_mode = settings.auto_transcode_target if hasattr(settings, 'auto_transcode_target') and settings.auto_transcode_target else "all"
                            try:
                                await start_job(input_path=target_dir, profile_id=p_ids[0], profile_ids=",".join(map(str, p_ids)), target_mode=target_mode, db=db)
                            except Exception as e:
                                print(f"Auto-transcode failed to queue: {e}")

                    if not settings or settings.auto_eject:
                        import subprocess
                        subprocess.run(["eject", device_path], check=False)
                finally:
                    db.close()
            except Exception as e:
                print(f"Error in ripper post-db logic: {e}")
                pass
        finally:
            if f:
                f.close()
            
    async def _post_process_rip(self, device_path, metadata):
        """
        Organizes the output directory according to Jellyfin standards based on metadata.
        """
        rip_info = self.active_rips.get(device_path)
        if not rip_info:
            return
            
        output_dir = rip_info["output_dir"]
        target_dir = metadata.get("target_dir", output_dir)
        mode = metadata.get("mode", "movie")
        title = metadata.get("title", "Unknown")
        year = metadata.get("year")
        episode_map = metadata.get("episode_map", {})
        
        try:
            mkv_files = [f for f in os.listdir(output_dir) if f.endswith('.mkv')]
            if not mkv_files:
                return
                
            os.makedirs(target_dir, exist_ok=True)
            
            # If we don't have explicit episode mapping, we'll try to find the longest file
            # to be the main feature (for movies)
            file_sizes = {f: os.path.getsize(os.path.join(output_dir, f)) for f in mkv_files}
            sorted_files = sorted(file_sizes.keys(), key=lambda k: file_sizes[k], reverse=True)
            
            if mode == "movie":
                rip_mode_strategy = metadata.get("ripMode", "all")
                
                if rip_mode_strategy == "bonus":
                    # All ripped files are extras
                    extras = sorted_files
                    # No main feature to rename
                else:
                    main_feature = sorted_files[0]
                    extras = sorted_files[1:]
                    
                    # Rename main feature
                    movie_name = f"{title} ({year})" if year else title
                    os.rename(
                        os.path.join(output_dir, main_feature),
                        os.path.join(target_dir, f"{movie_name}.mkv")
                    )
                
                # Move extras
                if extras:
                    extras_dir = os.path.join(target_dir, "Extras")
                    os.makedirs(extras_dir, exist_ok=True)
                    
                    for extra in extras:
                        idx = 1
                        while True:
                            dest_name = f"Extra Feature {idx}.mkv"
                            dest_path = os.path.join(extras_dir, dest_name)
                            if not os.path.exists(dest_path):
                                os.rename(os.path.join(output_dir, extra), dest_path)
                                break
                            idx += 1
            
            elif mode == "tv":
                show_name = metadata.get("title")
                season = metadata.get("season")
                start_episode = metadata.get("start_episode")
                end_episode = metadata.get("end_episode")
                needs_split = False
                
                # If we have an episode_map (from manual selection)
                if episode_map and len(episode_map) == len(sorted_files):
                    # Sort the map by title_id to match the MakeMKV output order
                    sorted_title_ids = sorted(episode_map.keys(), key=int)
                    for i, file in enumerate(sorted(sorted_files)):
                        t_id = sorted_title_ids[i]
                        s_num = episode_map[t_id].get("season", 1)
                        e_num = episode_map[t_id].get("episode", 1)
                        
                        season_dir = os.path.join(target_dir, f"Season {s_num:02d}")
                        os.makedirs(season_dir, exist_ok=True)
                        
                        new_name = f"{show_name} - S{s_num:02d}E{e_num:02d}.mkv"
                        os.rename(
                            os.path.join(output_dir, file),
                            os.path.join(season_dir, new_name)
                        )
                elif season is not None and start_episode is not None and end_episode is not None:
                    # Robust Auto-Detection based on user-provided range
                    expected_count = end_episode - start_episode + 1
                    if expected_count > 0:
                        # Check for play-all track (significantly larger than the next file)
                        if len(sorted_files) > 1 and file_sizes[sorted_files[0]] > file_sizes[sorted_files[1]] * 1.5:
                            # Largest file is likely a play-all track.
                            if len(sorted_files) >= expected_count + 1:
                                # We have enough individual episodes. Skip the play-all track to Extras.
                                episodes_by_size = sorted_files[1:expected_count+1]
                                extras = [sorted_files[0]] + sorted_files[expected_count+1:]
                            else:
                                # Not enough individual episodes. We must use the play-all track.
                                episodes_by_size = [sorted_files[0]]
                                extras = sorted_files[1:]
                                needs_split = True
                        else:
                            if len(sorted_files) >= expected_count:
                                episodes_by_size = sorted_files[:expected_count]
                                extras = sorted_files[expected_count:]
                            else:
                                episodes_by_size = sorted_files
                                extras = []
                                if expected_count > len(episodes_by_size):
                                    needs_split = True
                        
                        # Sort the chosen episodes by filename so that title_t00 is Ep1, title_t01 is Ep2...
                        episodes_by_size.sort()
                        
                        season_dir = os.path.join(target_dir, f"Season {season:02d}")
                        os.makedirs(season_dir, exist_ok=True)
                        
                        if needs_split and len(episodes_by_size) == 1:
                            new_name = f"{show_name} - S{season:02d}E{start_episode:02d}-E{end_episode:02d} [NEEDS SPLIT].mkv"
                            os.rename(
                                os.path.join(output_dir, episodes_by_size[0]),
                                os.path.join(season_dir, new_name)
                            )
                        else:
                            for i, file in enumerate(episodes_by_size):
                                e_num = start_episode + i
                                split_tag = " [NEEDS SPLIT]" if needs_split else ""
                                new_name = f"{show_name} - S{season:02d}E{e_num:02d}{split_tag}.mkv"
                                os.rename(
                                    os.path.join(output_dir, file),
                                    os.path.join(season_dir, new_name)
                                )
                    else:
                        # Fallback if something went wrong
                        extras = sorted_files
                        
                    # Move extras
                    if extras:
                        extras_dir = os.path.join(target_dir, "Extras")
                        os.makedirs(extras_dir, exist_ok=True)
                        
                        existing_extras = [f for f in os.listdir(extras_dir) if f.startswith("Extra Feature ")]
                        current_max = len(existing_extras)
                        
                        for i, extra in enumerate(extras, 1):
                            os.rename(
                                os.path.join(output_dir, extra),
                                os.path.join(extras_dir, f"Extra Feature {current_max + i}.mkv")
                            )
                else:
                    # Fallback auto-naming for TV episodes without explicit range
                    season_dir = os.path.join(target_dir, "Season 01")
                    os.makedirs(season_dir, exist_ok=True)
                    for i, file in enumerate(sorted(sorted_files), 1):
                        new_name = f"{show_name} - S01E{i:02d}.mkv"
                        os.rename(
                            os.path.join(output_dir, file),
                            os.path.join(season_dir, new_name)
                        )
            
            # Clean up the temp directory if we used one
            if target_dir != output_dir:
                try:
                    os.rmdir(output_dir)
                except Exception:
                    pass
                        
                return needs_split
        except Exception as e:
            print(f"Post-processing failed: {e}")
            return False
            
    def get_status(self, device_path):
        """
        Returns the current status and progress of a rip.
        """
        rip = self.active_rips.get(device_path)
        if rip:
            data = dict(rip)
            data.pop("process", None)
            
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

    async def cancel_rip(self, device_path):
        """
        Terminates an active rip process.
        """
        if device_path in self.active_rips:
            process = self.active_rips[device_path]["process"]
            try:
                process.kill()
                await process.wait()
                self.active_rips[device_path]["status"] = "cancelled"
                return True
            except Exception:
                return False
        return False

    async def _handbrake_fallback_rip(self, device_path, output_dir, metadata, log_path):
        self.active_rips[device_path]["status"] = "handbrake_fallback"
        self.active_rips[device_path]["last_log_line"] = "Handbrake fallback initiated..."
        
        from app.db.session import SessionLocal
        from app.db.models.models import Settings, TranscodeProfile
        db = SessionLocal()
        settings = db.query(Settings).first()
        preset_name = settings.handbrake_preset if settings else "Fast 1080p30"
        profile = db.query(TranscodeProfile).filter(TranscodeProfile.name == preset_name).first()
        db.close()
        
        mode = metadata.get("mode", "movie")
        title = metadata.get("title", "Unknown")
        year = metadata.get("year", "")
        import os
        import asyncio
        target_dir = metadata.get("target_dir", output_dir)
        os.makedirs(target_dir, exist_ok=True)
        
        movie_name = f"{title} ({year})" if year else title
        final_mkv = os.path.join(target_dir, f"{movie_name}.mkv")
        
        cmd = [
            "HandBrakeCLI",
            "-i", device_path,
            "-o", final_mkv,
            "--main-feature",
            "-e", "x264", "-q", "18", "--audio", "1", "--aencoder", "copy", "--subtitle", "scan", "-f", "mkv"
        ]
        
        f = open(log_path, "a") if log_path else None
        if f:
            f.write("\n--- MAKE MKV FAILED, TRIGGERING HANDBRAKE FALLBACK ---\n")
            f.flush()
            
        try:
            env = os.environ.copy()
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=env
            )
            self.active_rips[device_path]["process"] = process
            
            while True:
                line = await asyncio.wait_for(process.stdout.readline(), timeout=2.0)
                if not line:
                    break
                decoded = line.decode(errors="replace").strip()
                if f:
                    f.write(decoded + "\n")
                    f.flush()
                    
                self.active_rips[device_path]["last_log_line"] = decoded
                
                if "Encoding: task" in decoded and "%" in decoded:
                    try:
                        pct_str = decoded.split(",")[-1].replace("%", "").strip()
                        self.active_rips[device_path]["progress"] = float(pct_str)
                    except:
                        pass
                        
            return_code = await process.wait()
            return return_code == 0
        except Exception as e:
            if f:
                f.write(f"Handbrake fallback error: {str(e)}\n")
            return False
        finally:
            if f:
                f.close()

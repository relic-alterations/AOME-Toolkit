import subprocess
import re
import asyncio
import os

class DriveManager:
    """
    Manages optical drive detection and status using MakeMKV CLI.
    """

    def __init__(self, makemkvcon_path="makemkvcon"):
        self.makemkvcon_path = makemkvcon_path

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
                    
                    # Update or add app_Key
                    if 'app_Key = "' in content:
                        # Replace existing key
                        import re
                        new_content = re.sub(r'app_Key = ".*?"', f'app_Key = "{key}"', content)
                        with open(conf_path, "w") as f:
                            f.write(new_content)
                    else:
                        # Append new key
                        with open(conf_path, "a") as f:
                            if content and not content.endswith("\n"):
                                f.write("\n")
                            f.write(f'app_Key = "{key}"\n')
                except Exception as e:
                    print(f"Warning: Failed to update MakeMKV settings.conf: {e}")
        finally:
            db.close()
        return env

    async def list_drives(self):
        """
        Uses sysfs and lsblk to instantly list all available drives and their current disc status,
        avoiding MakeMKV's multi-minute timeouts when drives are locked by active rips.
        """
        try:
            drives = []
            if os.path.exists("/sys/block"):
                index = 0
                for dev in os.listdir("/sys/block"):
                    if dev.startswith("sr"):
                        dev_path = f"/dev/{dev}"
                        
                        model = "Optical Drive"
                        try:
                            with open(f"/sys/block/{dev}/device/model", "r") as f:
                                model = f.read().strip()
                        except:
                            pass
                            
                        disc_name = await self._get_disc_label(dev_path)
                        
                        drives.append({
                            "index": index,
                            "visible": True,
                            "enabled": True,
                            "drive_name": model,
                            "disc_name": disc_name if disc_name else None,
                            "device_path": dev_path,
                            "has_disc": bool(disc_name)
                        })
                        index += 1
                drives.sort(key=lambda x: x["device_path"])
            
            if not drives:
                drives = await self._detect_hardware_fallback()
                
            return {"drives": drives, "warnings": []}
        except Exception as e:
            return {"drives": [], "warnings": [f"Unexpected error: {str(e)}"]}

    async def scan_disc(self, device_path):
        """
        Scans a disc and returns detailed title information.
        """
        try:
            env = await self._get_makemkv_env()
            process = await asyncio.create_subprocess_exec(
                self.makemkvcon_path, "-r", "info", f"dev:{device_path}",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            stdout, _ = await process.communicate()
            output = stdout.decode()
            
            return self._parse_disc_info(output)
        except Exception as e:
            return {"error": str(e)}

    def _parse_disc_info(self, output):
        """
        Parses the output of makemkvcon -r info for a specific disc.
        """
        titles = {}
        # TINFO:title_id,code,value
        # Code 9: Name, 10: Size (formatted), 11: Size (bytes), 16: Duration
        tinfo_pattern = re.compile(r'^TINFO:(\d+),(\d+),\d+,"([^"]*)"', re.MULTILINE)
        
        for match in tinfo_pattern.finditer(output):
            t_id, code, value = match.groups()
            t_id = int(t_id)
            if t_id not in titles:
                titles[t_id] = {"id": t_id}
            
            if code == "2":
                titles[t_id]["name"] = value
            elif code == "9":
                titles[t_id]["duration"] = value
            elif code == "10":
                titles[t_id]["size_formatted"] = value
            elif code == "11":
                titles[t_id]["size_bytes"] = int(value)
            elif code == "27":
                titles[t_id]["file_name"] = value

        # Filter out titles that didn't get a name or duration (usually invalid entries)
        valid_titles = [t for t in titles.values() if "name" in t and "duration" in t]
        
        # Sort by ID
        valid_titles.sort(key=lambda x: x["id"])
        
        return {"titles": valid_titles}


    async def _detect_hardware_fallback(self):
        """
        Uses lsscsi to find optical drives when MakeMKV fails to list them.
        """
        try:
            process = await asyncio.create_subprocess_exec(
                "lsscsi", "-g",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=1.0)
            lines = stdout.decode().splitlines()
            
            drives = []
            index = 0
            for line in lines:
                if "cd/dvd" in line:
                    # Example: [1:0:0:0] cd/dvd Lenovo Slim_USB_Burner LA01 /dev/sr0 /dev/sg1
                    parts = line.split()
                    # Device path is usually the second to last item
                    dev_path = parts[-2] if parts[-2].startswith("/dev/sr") else "Unknown"
                    # Name is usually in the middle
                    name = " ".join(parts[2:-2])
                    
                    # Attempt to detect disc via lsblk
                    disc_name = await self._get_disc_label(dev_path)
                    
                    drives.append({
                        "index": index,
                        "visible": True,
                        "enabled": True,
                        "drive_name": name,
                        "disc_name": disc_name or "Empty Drive",
                        "device_path": dev_path,
                        "has_disc": bool(disc_name)
                    })
                    index += 1
            return drives
        except Exception:
            return []

    async def _get_disc_label(self, dev_path):
        """
        Uses lsblk to find a volume label on the device.
        """
        try:
            process = await asyncio.create_subprocess_exec(
                "lsblk", "-no", "LABEL", dev_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=0.5)
            return stdout.decode().strip()
        except Exception:
            try:
                process.kill()
            except:
                pass
            return None

    def _parse_makemkv_output(self, output):
        """
        Parses the DRV lines from makemkvcon output.
        Format: DRV:index,visible,enabled,flags,drive_name,disc_name,device_path
        """
        drives = []
        # Regex to find DRV: lines
        drv_pattern = re.compile(r'^DRV:(\d+),(\d+),(\d+),(\d+),"([^"]*)","([^"]*)","([^"]*)"', re.MULTILINE)
        
        for match in drv_pattern.finditer(output):
            index, visible, enabled, flags, drive_name, disc_name, device_path = match.groups()
            
            # Even if visible is 0, if there is a drive name, it's a real piece of hardware
            if drive_name or device_path:
                drives.append({
                    "index": int(index),
                    "visible": visible == "1",
                    "enabled": enabled == "1" or enabled == "999",
                    "drive_name": drive_name,
                    "disc_name": disc_name if disc_name else None,
                    "device_path": device_path,
                    "has_disc": bool(disc_name)
                })
            
        return drives

if __name__ == "__main__":
    # Quick local test
    manager = DriveManager()
    loop = asyncio.get_event_loop()
    drives = loop.run_until_complete(manager.list_drives())
    print(f"Detected {len(drives)} drives:")
    for d in drives:
        print(d)

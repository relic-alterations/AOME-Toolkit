import subprocess
import re
import requests

def get_toc_from_drive(device_path="/dev/sr0"):
    try:
        proc = subprocess.run(
            ["cd-info", "-C", device_path, "--no-cddb", "--no-device-info"],
            capture_output=True, text=True, timeout=10
        )
        lines = proc.stdout.splitlines()
        
        # Parse tracks and leadout
        # Format:   1: 00:02:00  000000 audio  false  no
        #         170: 45:12:34  203434 leadout
        
        tracks = []
        leadout = None
        
        for line in lines:
            line = line.strip()
            if not line: continue
            
            # Match track lines
            m = re.match(r'^(\d+):\s+\d+:\d+:\d+\s+(\d+)\s+audio', line)
            if m:
                track_num = int(m.group(1))
                lsn = int(m.group(2))
                tracks.append((track_num, lsn + 150))
                
            # Match leadout
            m_leadout = re.match(r'^170:\s+\d+:\d+:\d+\s+(\d+)\s+leadout', line)
            if m_leadout:
                leadout = int(m_leadout.group(1)) + 150
                
        if not tracks or not leadout:
            return None
            
        first_track = tracks[0][0]
        last_track = tracks[-1][0]
        
        toc_parts = [str(first_track), str(last_track), str(leadout)]
        for t in tracks:
            toc_parts.append(str(t[1]))
            
        return "+".join(toc_parts)
    except Exception as e:
        print(f"Error reading TOC: {e}")
        return None

def identify_cd(device_path="/dev/sr0", cached_toc=None, cd_text=None):
    toc = cached_toc or get_toc_from_drive(device_path)
    if not toc:
        return None
        
    url = f"https://musicbrainz.org/ws/2/discid/-?toc={toc}&inc=artists&fmt=json"
    
    email = "your-email@example.com"
    try:
        from app.db.session import SessionLocal
        from app.db.models.models import Settings
        db = SessionLocal()
        settings = db.query(Settings).first()
        if settings and settings.music_api_key:
            email = settings.music_api_key
        db.close()
    except:
        pass
        
    headers = {'User-Agent': f'AOME/1.0 ( {email} )'}
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        data = resp.json()
        if "releases" in data and len(data["releases"]) > 0:
            releases = data["releases"]
            matches = []
            for rel in releases:
                title = rel.get("title") or ""
                artist = "Unknown Artist"
                if rel.get("artist-credit") and len(rel["artist-credit"]) > 0:
                    artist = rel["artist-credit"][0].get("name", "Unknown Artist")
                year = rel.get("date", "").split("-")[0] if rel.get("date") else ""
                mbid = rel.get("id")
                
                # Heuristic scoring
                score = 0
                status = rel.get("status", "")
                if status == "Official":
                    score += 10
                elif status in ["Promotion", "Bootleg"]:
                    score -= 5
                    
                country = rel.get("country", "")
                if country in ["US", "GB", "XW"]: # XW is worldwide
                    score += 5
                    
                # CD-Text check
                if cd_text:
                    if cd_text.get("title") and cd_text["title"].lower() in title.lower():
                        score += 50
                    if cd_text.get("artist") and cd_text["artist"].lower() in artist.lower():
                        score += 50
                        
                matches.append({
                    "id": mbid,
                    "title": title,
                    "artist": artist,
                    "year": year,
                    "poster": f"https://coverartarchive.org/release/{mbid}/front-250",
                    "score": score
                })
                
            # Sort by score descending
            matches.sort(key=lambda x: x["score"], reverse=True)
            
            best = matches[0]
            return {
                "title": best["title"],
                "artist": best["artist"],
                "year": best["year"],
                "mbid": best["id"],
                "poster": best["poster"],
                "all_matches": matches
            }
    except Exception as e:
        print(f"MB TOC Error: {e}")
    return None

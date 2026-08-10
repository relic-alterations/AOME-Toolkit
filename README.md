# AOME (Automated Optical Media Extractor)

AOME is a fully automated toolkit for ripping and trans-coding optical media. It provides a FastAPI backend for hardware interfacing and a React (Vite) front-end for monitoring and management.

It uses MakeMKV for media ripping and Handbrake for trans-coding. Currently DVD's and BlueRays are confirmed working but 4k Blurays are untested as of now as I do not have a 4k usable drive. Currently there is no built in way to extract Music/CD's and this is planned to be release in the future.

Native Support for having about as many optical drives as you can get your hands on, the goal to to be as user friendly as possible. 

This was inspired by the popular project "automatic-ripping-machine" but made to be a bit more straightforward and user friendly. I found there were a few features that were either not implemented or I felt were not quite as nice as it could be. 

Full disclosure, I am hardly a software developer/programmer. 99% of this codebase was written by Gemini 3.1 pro and I am certain this code has plenty of room to improve upon. I am not claiming I have the skill to do this all on my own but I wanted to see just how far I could take a project like this. 

---

## Features
- Rip multiple Discs at the same time
- Automatic extras detection and labeling for easier use for Jellyfin/Plex
- Automatically create a comparison document showing you exactly how your media encoding is effecting the quality of your media
- Automatic Show management making sorting and ripping entire shows as easy as possible
- High degree of trans-coding control
- Allow to automatically trans-code to multiple pre-configered formats if you want to have the same title in multiple quality (this can assist if your media server does not have live trans-coding abilities it can be trans-coded ahead of time)
- More not listed here and more to come

---

## ToDo's

- Add discord/web-hook support to send notifications throughout the media process
- Add support for music/CD's
- Likely more not listed here...

---

## Installation & Setup (Linux)

The easiest and most reliable way to run AOME on Linux is via Docker, as it bypasses all system-level dependencies for MakeMKV and Handbrake. 

### Docker Compose Configuration
For your reference, here is the default `docker-compose.yml` used to run the suite. Notice how it maps the hardware optical drive (`/dev/sr0`) directly into the container.

```yaml
version: '3.8'

services:
  aome:
    image: ghcr.io/relic-alterations/aome-toolkit:main
    ports:
      - "8000:8000"
    volumes:
      # Map your local ~/AOME folder to the container's extraction folder
      - ${HOME}/AOME:/root/AOME
      
      # Persist the database so MakeMKV keys and settings survive restarts
      - ./backend/aome.db:/app/backend/aome.db
      
      # UNCOMMENT and map your network NAS drives here to enable Auto-Transfers:
      # - /mnt/nas/Media:/mnt/nas/Media
      
    devices:
      # Pass the optical drive through to the container
      - "/dev/sr0:/dev/sr0"
      # - "/dev/sr1:/dev/sr1" # Uncomment for multiple drives
    privileged: true # Required for full SCSI command access to optical drives
    restart: unless-stopped
```

### Linux Docker (Recommended)
1. **Download the code:**
   ```bash
   git clone https://github.com/relic-alterations/AOME-Toolkit.git
   cd AOME-Toolkit
   ```
2. **Start the application:** 
   ```bash
   docker compose up -d
   ```
3. **Access the Web UI:** `http://localhost:8000`

> **Note on Hardware:** The `docker-compose.yml` file is pre-configured to pass `/dev/sr0` into the container. If your optical drive is located elsewhere (e.g., `/dev/sr1`), or you have multiple drives, update the `devices:` section in the `docker-compose.yml`.

### Linux Native (Bare Metal)
If you prefer not to use Docker, or are on a locked-down file system:
1. Run `./install.sh` to setup your Python and Node environments securely.
2. Run `./aome.sh start` to launch the suite.
3. **Access the Web UI:** `http://localhost:5173`

---

## Installation & Setup (Windows)

### Windows Docker
You can run AOME on Windows via Docker Desktop, but **please read the hardware warning below carefully.**
1. **Download the code:**
   ```powershell
   git clone https://github.com/relic-alterations/AOME-Toolkit.git
   cd AOME-Toolkit
   ```
2. **Start the application:** 
   ```powershell
   docker compose up -d
   ```
3. **Access the Web UI:** `http://localhost:8000`

> **CRITICAL WARNING FOR WINDOWS DOCKER:** MakeMKV requires direct, low-level SCSI access to physical optical drives. Because Windows Docker runs inside a virtual machine (Hyper-V / WSL2), it cannot natively "see" SATA optical drives plugged into your motherboard. 
> 
> *Workaround:* If you use an **external USB Optical Drive**, you can successfully pass it into the Docker container by using the open-source `usbipd-win` tool. Otherwise, you must run AOME natively (Bare Metal).

---

### Windows Native (Bare Metal)

If you have an internal SATA optical drive, you must run AOME natively on your host machine.

**Prerequisites:** You must have [Python 3.10+](https://www.python.org/downloads/) and [Node.js](https://nodejs.org/) installed. You must also install [MakeMKV](https://www.makemkv.com/download/) and [HandBrakeCLI](https://handbrake.fr/downloads2.php) natively on your Windows system and ensure they are added to your system PATH.

1. **Download the code:** Open PowerShell or Command Prompt.
   ```powershell
   git clone https://github.com/relic-alterations/AOME-Toolkit.git
   cd AOME-Toolkit
   ```

2. **Start the Application:** I've included a simple batch script to automate booting the servers. Double click it, or run:
   ```powershell
   .\aome.bat start
   ```
   *(This will automatically install any missing Python/Node dependencies and launch two background windows for the frontend and backend).*

3. **Stop the Application:**
   ```powershell
   .\aome.bat stop
   ```

4. **Launch it:** Access the Web UI at `http://localhost:5173`


# AOME (Automated Optical Media Extractor)

AOME is a fully automated toolkit for ripping and trans-coding optical media. It provides a FastAPI backend for hardware interfacing and a React (Vite) front-end for monitoring and management.

It uses MakeMKV for media ripping, Handbrake/FFmpeg for trans-coding, and cdparanoia for Audio CD extraction. Currently DVD's, BluRays, and Audio CDs are confirmed working (4k Blurays are untested as of now as I do not have a 4k usable drive). 

Native Support for having about as many optical drives as you can get your hands on, the goal is to be as user friendly as possible. 

This was inspired by the popular project "automatic-ripping-machine" but made to be a bit more straightforward and user friendly. I found there were a few features that were either not implemented or I felt were not quite as nice as it could be. 

Full disclosure, I am hardly a software developer/programmer. 99% of this codebase was written by Gemini 3.1 pro and I am certain this code has plenty of room to improve upon. I am not claiming I have the skill to do this all on my own but I wanted to see just how far I could take a project like this. 

---

## Features
- Rip multiple Discs (Movies, TV Shows, or Audio CDs) at the same time
- Native MusicBrainz integration for automatic Audio CD album art injection and track tagging
- Mobile Integration: Snap a photo of a disc cover on your phone to instantly set custom poster art
- Automatic extras detection and labeling for easier use for Jellyfin/Plex
- Automatically create a comparison document showing you exactly how your media encoding is effecting the quality of your media
- Automatic Show management making sorting and ripping entire shows as easy as possible
- High degree of trans-coding control
- Multi-Profile Queueing: trans-code to multiple pre-configered formats if you want to have the same title in multiple qualities
- Auto-transfer capability to push fully extracted and trans-coded media directly to your NAS share
- More not listed here and more to come

---

## ToDo's

- Add discord/web-hook support to send notifications throughout the media process
- Drive naming support
- Likely more not listed here...

---

## 🐳 Installation Guide (Docker / Recommend)

Running AOME via Docker is the easiest and most robust method. It isolates all dependencies (MakeMKV, HandBrake, FFmpeg, Node, Python) into a clean container and avoids polluting your host OS.

### 1. Create your `docker-compose.yml`

Create a new folder anywhere on your machine, and inside it, create a file named `docker-compose.yml` with the following contents:

```yaml
version: '3.8'

services:
  aome:
    # build: . # Uncomment to build locally instead of pulling
    image: ghcr.io/relic-alterations/aome-toolkit:main
    ports:
      - "8000:8000"
    volumes:
      - ${HOME}/AOME:/root/AOME # Core media storage
      - ./backend/aome.db:/app/backend/aome.db # Database persistence
      # - /mnt/nas/Media:/mnt/nas/Media # Network drive passthrough
      - /dev:/dev # Required for real-time optical drive detection
      - /run/udev:/run/udev:ro # Required for real-time optical drive detection
    privileged: true # Mandatory for MakeMKV SCSI command access
    restart: unless-stopped
    
    # NVENC (Nvidia) Hardware Acceleration (Requires nvidia-container-toolkit on host)
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]
    
    # QSV (Intel) Hardware Acceleration is native and automatic via /dev:/dev
```

### 2. Launch the Container

Run the following command in the same folder as your `docker-compose.yml` file:
```bash
docker compose up -d
```

### 3. Access the Dashboard

Once the container boots, open your web browser and navigate to:
**http://localhost:8000**

---

## 💻 Installation Guide (Bare Metal)

AOME is designed to run natively on Linux (Arch, Ubuntu, Debian, Pop!_OS) using our automated orchestration script. The installer will automatically download all required system dependencies, build isolated environments, and configure your optical drive permissions without altering your core system.

### Step 1: Download the Toolkit

You can download AOME using either Git or a direct ZIP file if you don't have Git installed.

**Option A: Using Git (Recommended)**
1. Open your terminal.
2. Run the following commands to clone the repository:
   ```bash
   git clone https://github.com/relic-alterations/AOME-Toolkit.git
   cd AOME-Toolkit
   ```

**Option B: Downloading the ZIP (No Git Required)**
1. Click the green **"<> Code"** button at the top of this GitHub repository page.
2. Select **"Download ZIP"**.
3. Open your file manager, extract the downloaded `AOME-Toolkit-main.zip` file, and rename the folder to `AOME-Toolkit`.
4. Open your terminal, navigate to where you extracted it (e.g., your Downloads folder), and move into it:
   ```bash
   cd ~/Downloads/AOME-Toolkit
   ```

### Step 2: Run the Automated Installer

We have included a highly robust script that builds AOME. Because AOME interacts closely with your physical hardware (CD/DVD drives), the script will ask for your `sudo` password to install system packages and grant you the correct group permissions.

1. Ensure the installer is executable, then run it:
   ```bash
   chmod +x install.sh
   ./install.sh
   ```
2. **What this does in the background:**
   - **System Packages:** Installs Python 3, Node.js, `npm`, `ffmpeg`, `handbrake-cli`, MakeMKV, `cdparanoia`, and `libcdio` using your system's package manager (`apt` or `pacman`).
   - **Isolated Environments:** Creates an isolated Python virtual environment (`~/.aome_venv`) and Node.js dependency folder (`~/.aome_frontend_deps`) in your home directory. *Note: This guarantees the software remains completely portable, even if you are running the project code off an exFAT USB flash drive!*
   - **Permissions:** Adds your user account to the `optical` or `cdrom` group so AOME can interface with your disc drives.

3. **Important:** Because your user was added to a new hardware group, you may need to apply the group changes. The script will tell you at the end, but you can typically do this by running `newgrp optical` (Arch) or `newgrp cdrom` (Debian/Ubuntu), or simply **rebooting your computer**.

### Step 3: Launch the Suite

AOME comes with a built-in management script (`aome.sh`) that orchestrates both the backend API and the frontend user interface.

1. Start AOME in the background:
   ```bash
   ./aome.sh start
   ```
   *(To stop it later, you can run `./aome.sh stop` or `./aome.sh restart`).*

### Step 4: Access the Dashboard

Once AOME says it is fully operational, open any web browser on your machine and navigate to:
**http://localhost:5173**

You're all set! You can now configure your settings, insert a disc, and start ripping.

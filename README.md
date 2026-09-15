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

## 🚀 Quick Start Guide

The easiest and most reliable way to run AOME on both **Linux** and **Windows** is using our pre-compiled Docker container. This skips all the messy system dependencies (MakeMKV, HandBrake, Python) and gets you ripping in minutes.

### For Docker Veterans
If you already have a Docker environment running, you don't even need to clone the entire repository. Just spin up this `docker-compose.yml` file:

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

---

### Step-by-Step Installation

#### Step 1: Install Prerequisites
- **Git**: Download and install [Git](https://git-scm.com/downloads) so you can download the project.
- **Docker**: Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows) or the Docker Engine (Linux).

> ⚠️ **Windows Hardware Note:** Docker on Windows runs inside a virtual machine and cannot natively "see" internal SATA CD/DVD drives plugged into your motherboard. To use AOME on Windows, you **must** use an external USB optical drive and pass it through to Docker (using the open-source `usbipd-win` tool).

### Step 2: Download AOME
Open your terminal (or PowerShell/Command Prompt) and download the repository:
```bash
git clone https://github.com/relic-alterations/AOME-Toolkit.git
cd AOME-Toolkit
```

### Step 3: Configure Your Drives (Optional)
By default, AOME looks for a single optical drive at `/dev/sr0`. If you have multiple drives or it's mounted elsewhere, open the `docker-compose.yml` file in any text editor and update the `devices:` section to include your extra drives (e.g., `/dev/sr1`).

### Step 4: Start the Engine
We automatically build and publish the AOME container via GitHub Actions, so you don't have to wait for it to compile locally! Run:
```bash
docker compose up -d
```
*Note: This will download the latest pre-compiled image from GitHub Packages and start it in the background.*

### Step 5: Access the Dashboard
Open your web browser and navigate to:
**http://localhost:8000**

---

### 🐧 Linux Native (Bare Metal Alternative)

If you are on Linux and prefer not to use Docker, we've included an automated install script that safely configures everything for you:

1. **Download the code:**
   ```bash
   git clone https://github.com/relic-alterations/AOME-Toolkit.git
   cd AOME-Toolkit
   ```
2. **Run the Installer:** 
   ```bash
   ./install.sh
   ```
   *(This safely installs Python, Node, MakeMKV, HandBrake, FFmpeg, cdparanoia, and builds your isolated virtual environments).*
3. **Launch the Suite:**
   ```bash
   ./aome.sh start
   ```
4. **Access the Dashboard:** Go to `http://localhost:5173` in your browser.


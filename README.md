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

## 🚀 Quick Start Guide (Docker)

The easiest and most reliable way to run AOME on both **Linux** and **Windows** is using our pre-compiled Docker container. 

*Note: In the Docker container, the React frontend is pre-built and served directly by the FastAPI backend, which is why everything is seamlessly accessed through a single port (`8000`).*

### Example Compose File
You can run AOME by saving the following `docker-compose.yml` file and running `docker compose up -d`:

```yaml
version: '3.8'

services:
  aome:
    image: ghcr.io/relic-alterations/aome-toolkit:main
    ports:
      # The container serves both the Frontend UI and Backend API on port 8000
      - "8000:8000"
    environment:
      # Tell AOME to store the database directly inside your extracted media folder
      - AOME_DATABASE_URL=sqlite:////root/AOME/aome.db
    volumes:
      # Maps your local ~/AOME folder to where the container extracts and transcodes media
      - ${HOME}/AOME:/root/AOME
      
      # UNCOMMENT to map your NAS/Network drives for the Auto-Transfer feature:
      # - /mnt/nas/Media:/mnt/nas/Media
      
    devices:
      # Passes the physical optical drive through to the container
      - "/dev/sr0:/dev/sr0"
      # - "/dev/sr1:/dev/sr1" # Uncomment for multiple drives
      
    # Required for full SCSI command access to hardware optical drives
    privileged: true 
    restart: unless-stopped
```

---

### Step-by-Step Installation

If you've never used Docker before, follow these simple steps to get started:

#### Step 1: Install Prerequisites
- **Git**: Download and install [Git](https://git-scm.com/downloads) so you can download the project.
- **Docker**: Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows) or the Docker Engine (Linux).

> ⚠️ **Windows Hardware Note:** Docker on Windows runs inside a virtual machine and cannot natively "see" internal SATA CD/DVD drives plugged into your motherboard. To use AOME on Windows, you **must** use an external USB optical drive and pass it through to Docker (using the open-source `usbipd-win` tool).

#### Step 2: Download AOME
Open your terminal (or PowerShell/Command Prompt) and download the repository:
```bash
git clone https://github.com/relic-alterations/AOME-Toolkit.git
cd AOME-Toolkit
```

#### Step 3: Configure Your Drives (Optional)
By default, AOME looks for a single optical drive at `/dev/sr0`. If you have multiple drives or it's mounted elsewhere, open the `docker-compose.yml` file in any text editor and update the `devices:` section to include your extra drives (e.g., `/dev/sr1`).

#### Step 4: Start the Engine
We automatically build and publish the AOME container via GitHub Actions, so you don't have to wait for it to compile locally! Run:
```bash
docker compose up -d
```

#### Step 5: Access the Dashboard
Once the container finishes starting, open your web browser and navigate to:
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
   *(Installs Python, Node, MakeMKV, HandBrake, FFmpeg, cdparanoia, and configures environments).*
3. **Launch the Suite:**
   ```bash
   ./aome.sh start
   ```
4. **Access the Dashboard:** Go to `http://localhost:5173` in your browser. *(Note: Bare metal runs the frontend and backend on separate ports).*


# AOME (Automated Optical Media Extractor)

AOME is a fully automated toolkit for ripping and transcoding optical media. It provides a FastAPI backend for hardware interfacing and a React (Vite) frontend for monitoring and management.

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


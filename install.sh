#!/bin/bash

# AOME (Automated Optical Media Extractor) Installation Script
# Supports: Arch Linux, Debian, Ubuntu

set -e

echo "--- Starting AOME Installation ---"

# 1. Distro Detection
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
else
    echo "Cannot detect Linux distribution. Proceeding with caution..."
    DISTRO="unknown"
fi

echo "Detected distribution: $DISTRO"

# 2. Install System Dependencies
case "$DISTRO" in
    arch|cachyos)
        echo "[1/6] Installing dependencies via pacman..."
        sudo pacman -Syu --needed \
            python python-pip \
            handbrake-cli \
            git curl base-devel \
            lsscsi util-linux nodejs npm \
            jre-openjdk-headless ffmpeg cdparanoia libcdio
            
        echo "[1.5/6] Checking for AUR helper to install MakeMKV..."
        if command -v paru &> /dev/null; then
            paru -S --needed makemkv
        elif command -v yay &> /dev/null; then
            yay -S --needed makemkv
        else
            echo "WARNING: No AUR helper (yay or paru) found. You must install 'makemkv' manually."
        fi
        ;;
    ubuntu|debian|pop|linuxmint)
        echo "[1/6] Installing standard dependencies via apt..."
        sudo apt update || true
        
        # Temporarily disable set -e for potentially missing packages
        set +e
        sudo apt install -y software-properties-common
        
        sudo apt install -y \
            python3 python3-pip python3-venv \
            handbrake-cli ffmpeg cdparanoia libcdio-utils \
            git curl build-essential \
            lsscsi util-linux nodejs npm \
            default-jre-headless
        
        # Re-enable error catching
        set -e
        
        echo "[1.5/6] Attempting to install MakeMKV via PPA..."
        # Add MakeMKV PPA for Ubuntu/Mint/Pop
        sudo add-apt-repository -y ppa:heyarje/makemkv-beta || echo "Notice: PPA addition failed (common on pure Debian)."
        sudo apt update
        
        # We temporarily disable set -e so the script doesn't instantly die if makemkv isn't found
        set +e
        sudo apt install -y makemkv-bin makemkv-oss
        if [ $? -ne 0 ]; then
            echo "=========================================================================="
            echo "WARNING: Could not install MakeMKV from the repository."
            echo "If you are on pure Debian, you must compile MakeMKV manually from source:"
            echo "https://forum.makemkv.com/forum/viewtopic.php?f=3&t=224"
            echo "AOME will not be able to rip video discs until MakeMKV is installed."
            echo "=========================================================================="
            sleep 3
        fi
        set -e
        ;;
    *)
        echo "Unsupported distribution: $DISTRO"
        echo "Please install dependencies manually: python3, makemkv, handbrake-cli, git, curl, lsscsi, cdparanoia"
        exit 1
        ;;
esac

# 3. Setup AOME Directories
echo "[2/6] Creating AOME directory structure..."
mkdir -p ~/AOME/{rips,transcodes,metadata,backups}
mkdir -p ~/AOME/logs/{rips,transcodes}
mkdir -p ~/.MakeMKV # Required for robust MakeMKV key registration

# 4. Virtual Environment Setup (exFAT Compatible)
echo "[3/6] Setting up Python virtual environment..."
# We place the venv in the user's home directory because exFAT (often used for flash drives) 
# does not support symbolic links required by Python virtual environments.
VENV_DIR="$HOME/.aome_venv"
PY_CMD=$(command -v python3 || command -v python)
$PY_CMD -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
if [ -f "backend/requirements.txt" ]; then
    pip install -r backend/requirements.txt
fi

# 5. Frontend Dependencies Setup (exFAT Compatible)
echo "[4/6] Setting up Frontend dependencies..."
# Similar to the venv, npm requires symlinks. We store node_modules in the home directory.
FRONTEND_DEPS_DIR="$HOME/.aome_frontend_deps"
mkdir -p "$FRONTEND_DEPS_DIR"
if [ -f "frontend/package.json" ]; then
    cp frontend/package.json "$FRONTEND_DEPS_DIR/"
    if [ -f "frontend/package-lock.json" ]; then
        cp frontend/package-lock.json "$FRONTEND_DEPS_DIR/"
        echo "Installing using package-lock.json for consistent versions..."
        (cd "$FRONTEND_DEPS_DIR" && npm ci --silent)
    else
        echo "Installing using package.json..."
        (cd "$FRONTEND_DEPS_DIR" && npm install --silent)
    fi
    
    # Copy all Vite environment files if they exist
    if ls frontend/.env* 1> /dev/null 2>&1; then
        cp frontend/.env* "$FRONTEND_DEPS_DIR/"
    fi
    
    echo "Copying dereferenced node_modules back to flash drive to bypass exFAT symlink limitations..."
    rm -rf frontend/node_modules
    cp -rL "$FRONTEND_DEPS_DIR/node_modules" frontend/
fi

# 6. Permissions & Orchestration
echo "[5/6] Configuring drive permissions and scripts..."
case "$DISTRO" in
    arch|cachyos)
        # Arch uses 'optical' group for drives
        sudo usermod -aG optical $USER || true
        ;;
    ubuntu|debian|pop)
        # Debian/Ubuntu uses 'cdrom'
        sudo usermod -aG cdrom $USER || true
        ;;
esac

if [ -f "aome.sh" ]; then
    chmod +x aome.sh
fi

# 6.5 Firewall Configuration
echo "[5.5/6] Configuring Firewall..."
if [ -f /.dockerenv ]; then
    echo "Running inside Docker. Skipping UFW firewall configuration..."
else
    if command -v ufw &> /dev/null; then
        echo "Opening ports 5173 (Frontend) and 8000 (Backend) via UFW..."
        sudo ufw allow 5173/tcp || true
        sudo ufw allow 8000/tcp || true
    else
        echo "UFW not found. If you use a firewall, ensure TCP ports 5173 and 8000 are open."
    fi
fi

# 7. Final Steps
echo "[6/6] Foundational setup complete."

echo "--- AOME Installation Finished ---"
echo "Please restart your session or run 'newgrp optical' (Arch) or 'newgrp cdrom' (Debian) to apply group changes."
echo "Use './aome.sh start' to launch the application."

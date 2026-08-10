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
            jre-openjdk-headless ffmpeg
            
        echo "[1.5/6] Checking for AUR helper to install MakeMKV..."
        if command -v paru &> /dev/null; then
            paru -S --needed makemkv
        elif command -v yay &> /dev/null; then
            yay -S --needed makemkv
        else
            echo "WARNING: No AUR helper (yay or paru) found. You must install 'makemkv' manually."
        fi
        ;;
    ubuntu|debian|pop)
        echo "[1/6] Installing dependencies via apt..."
        sudo apt update
        sudo apt install -y \
            python3 python3-pip python3-venv \
            makemkv-bin makemkv-oss \
            handbrake-cli ffmpeg \
            git curl build-essential \
            lsscsi util-linux nodejs npm \
            default-jre-headless
        ;;
    *)
        echo "Unsupported distribution: $DISTRO"
        echo "Please install dependencies manually: python3, makemkv, handbrake-cli, git, curl, lsscsi"
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

# 7. Final Steps
echo "[6/6] Foundational setup complete."

echo "--- AOME Installation Finished ---"
echo "Please restart your session or run 'newgrp optical' (Arch) or 'newgrp cdrom' (Debian) to apply group changes."
echo "Use './aome.sh start' to launch the application."

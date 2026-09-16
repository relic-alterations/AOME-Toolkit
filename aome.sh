#!/bin/bash

# AOME (Automated Optical Media Extractor) Management Script
# This script handles starting and stopping the backend and frontend.

# Dynamically determine the root directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_PATH="$HOME/.aome_venv"
PYTHONPATH_ROOT="$SCRIPT_DIR"

# PIDs for background processes
BACKEND_PID_FILE="/tmp/aome_backend.pid"
FRONTEND_PID_FILE="/tmp/aome_frontend.pid"

start_aome() {
    echo "--- Starting AOME Suite ---"

    if [ ! -d "$VENV_PATH" ] || [ ! -d "$HOME/.aome_frontend_deps" ]; then
        echo "ERROR: Dependencies not found!"
        echo "It looks like you moved AOME to a new machine or haven't installed it yet."
        echo "Please run './install.sh' first to set up the environments."
        exit 1
    fi

    # 1. Start Backend
    if [ -f "$BACKEND_PID_FILE" ] && ps -p $(cat "$BACKEND_PID_FILE") > /dev/null; then
        echo "Backend is already running."
    else
        echo "Starting Backend (FastAPI)..."
        source "$VENV_PATH/bin/activate"
        export PYTHONPATH="$PYTHONPATH_ROOT/backend"
        cd "$BACKEND_DIR"
        nohup python3 app/main.py > /tmp/aome_backend.log 2>&1 &
        echo $! > "$BACKEND_PID_FILE"
        echo "Backend started at http://localhost:8000"
    fi

    # 2. Start Frontend
    if [ -f "$FRONTEND_PID_FILE" ] && ps -p $(cat "$FRONTEND_PID_FILE") > /dev/null; then
        echo "Frontend is already running."
    else
        echo "Starting Frontend (Vite)..."
        # Run from the dependencies folder in home, but point root to the flash drive
        cd "$HOME/.aome_frontend_deps"
        nohup ./node_modules/.bin/vite "$FRONTEND_DIR" --host > /tmp/aome_frontend.log 2>&1 &
        echo $! > "$FRONTEND_PID_FILE"
        echo "Frontend started at http://localhost:5173"
    fi

    echo "AOME is fully operational."
    echo "Use './aome.sh stop' to shutdown the system."
}

stop_aome() {
    echo "--- Stopping AOME Suite ---"

    if [ -f "$BACKEND_PID_FILE" ]; then
        PID=$(cat "$BACKEND_PID_FILE")
        echo "Stopping Backend (PID: $PID)..."
        kill $PID && rm "$BACKEND_PID_FILE"
    else
        echo "Backend is not running."
    fi

    if [ -f "$FRONTEND_PID_FILE" ]; then
        PID=$(cat "$FRONTEND_PID_FILE")
        echo "Stopping Frontend (PID: $PID)..."
        kill $PID && rm "$FRONTEND_PID_FILE"
    else
        echo "Frontend is not running."
    fi

    echo "AOME has been stopped."
}

status_aome() {
    if [ -f "$BACKEND_PID_FILE" ] && ps -p $(cat "$BACKEND_PID_FILE") > /dev/null; then
        echo "Backend: RUNNING"
    else
        echo "Backend: STOPPED"
    fi

    if [ -f "$FRONTEND_PID_FILE" ] && ps -p $(cat "$FRONTEND_PID_FILE") > /dev/null; then
        echo "Frontend: RUNNING"
    else
        echo "Frontend: STOPPED"
    fi
}

update_aome() {
    echo "--- Updating AOME Toolkit ---"
    
    stop_aome
    sleep 1
    
    echo "Pulling latest code from GitHub..."
    cd "$SCRIPT_DIR"
    if ! git pull origin main; then
        echo "ERROR: Failed to pull latest code."
        echo "If you downloaded AOME as a ZIP without Git, you must manually download the new ZIP and extract it."
        echo "Otherwise, you may have local code changes conflicting with the update."
        exit 1
    fi
    
    echo "Re-running installer to update environments..."
    if [ -f "./install.sh" ]; then
        chmod +x ./install.sh
        ./install.sh
    else
        echo "ERROR: install.sh not found!"
        exit 1
    fi
    
    echo "Update complete! You can now run './aome.sh start' to boot the updated system."
}

case "$1" in
    start)
        start_aome
        ;;
    stop)
        stop_aome
        ;;
    restart)
        stop_aome
        sleep 2
        start_aome
        ;;
    status)
        status_aome
        ;;
    update)
        update_aome
        ;;
    *)
        echo "Usage: ./aome.sh {start|stop|restart|status|update}"
        exit 1
        ;;
esac

# Stage 1: Build the Vite frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npx vite build

# Stage 2: Build the FastAPI backend + MakeMKV/Handbrake
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    wget \
    curl \
    python3 \
    python3-pip \
    handbrake-cli \
    ffmpeg \
    lsscsi \
    util-linux \
    default-jre-headless \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Add the MakeMKV PPA and install
RUN add-apt-repository ppa:heyarje/makemkv-beta \
    && apt-get update \
    && apt-get install -y makemkv-bin makemkv-oss \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./backend/
RUN pip3 install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
# Copy the built frontend into the unified image
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Setup local AOME directories inside the container's root home
RUN mkdir -p ~/AOME/rips ~/AOME/transcodes ~/AOME/metadata ~/AOME/backups
RUN mkdir -p ~/AOME/logs/rips ~/AOME/logs/transcodes
RUN mkdir -p ~/.MakeMKV

WORKDIR /app/backend
EXPOSE 8000

CMD ["python3", "-m", "app.main"]

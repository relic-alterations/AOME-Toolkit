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
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Add the MakeMKV PPA and install
RUN add-apt-repository ppa:heyarje/makemkv-beta \
    && apt-get update \
    && apt-get install -y makemkv-bin makemkv-oss \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

# Setup local AOME directories inside the container's root home
RUN mkdir -p ~/AOME/{rips,transcodes,metadata,backups}
RUN mkdir -p ~/AOME/logs/{rips,transcodes}
RUN mkdir -p ~/.MakeMKV

EXPOSE 8000

CMD ["python3", "app/main.py"]

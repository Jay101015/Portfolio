#!/usr/bin/env bash
# ffmpeg and ffprobe for the GitHub runner. The runner image stopped shipping ffmpeg, and installing it with apt
# from the Ubuntu mirror has hung for a quarter of an hour at a time, so the first choice is a static build from
# GitHub's own release servers (seconds); apt is the fallback.
set -u
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null && { ffmpeg -version | head -1; exit 0; }
url="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
tmp="$(mktemp -d)"
for i in 1 2 3; do
  if curl -fsSL --retry 3 --max-time 180 -o "$tmp/ff.tar.xz" "$url" && tar -xJf "$tmp/ff.tar.xz" -C "$tmp"; then
    sudo install -m 755 "$tmp"/ffmpeg-*/bin/ffmpeg "$tmp"/ffmpeg-*/bin/ffprobe /usr/local/bin/ && break
  fi
  echo "static ffmpeg download attempt $i failed"
done
if ! command -v ffmpeg >/dev/null; then
  opts="-o Acquire::Retries=3 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20"
  timeout 150 sudo apt-get update -q $opts || true
  timeout 300 sudo apt-get install -y -q --no-install-recommends $opts ffmpeg || true
fi
ffmpeg -version | head -1

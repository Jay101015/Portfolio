#!/usr/bin/env bash
# ffmpeg and ffprobe for the GitHub runner. The runner image stopped shipping ffmpeg. Ubuntu's own package is
# the one every render so far has used, so it comes first, with short timeouts (the mirror has stalled for a
# quarter of an hour at a time). A static build of the stable 7.1 branch is the fallback: the "master" static
# build hung for an hour joining the chunks of the house video, after rendering every frame.
set -u
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null && { ffmpeg -version | head -1; exit 0; }
opts="-o Acquire::Retries=3 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20"
for i in 1 2; do
  timeout 150 sudo apt-get update -q $opts && timeout 300 sudo apt-get install -y -q --no-install-recommends $opts ffmpeg && break
  echo "apt ffmpeg attempt $i failed"
done
if ! command -v ffmpeg >/dev/null; then
  url="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n7.1-latest-linux64-gpl-7.1.tar.xz"
  tmp="$(mktemp -d)"
  if curl -fsSL --retry 3 --max-time 180 -o "$tmp/ff.tar.xz" "$url" && tar -xJf "$tmp/ff.tar.xz" -C "$tmp"; then
    sudo install -m 755 "$tmp"/ffmpeg-*/bin/ffmpeg "$tmp"/ffmpeg-*/bin/ffprobe /usr/local/bin/
  fi
fi
ffmpeg -version | head -1

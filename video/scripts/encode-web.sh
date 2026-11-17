#!/bin/sh
# Encode the rendered video (out/intro.mp4) for the site: VP9/Opus WebM first, H.264/AAC MP4 as
# the fallback, and a poster frame from the title card. Outputs go to web/, which the site build
# copies to dist/assets/video/. Cloudflare Pages caps a file at 25 MiB.
set -eu
cd "$(dirname "$0")/.."
mkdir -p web
ffmpeg -v error -y -i out/intro.mp4 -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 -deadline good \
  -cpu-used 2 -c:a libopus -b:a 96k web/intro.webm
ffmpeg -v error -y -i out/intro.mp4 -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart web/intro.mp4
# The title card, a second into shot 2: the cold open runs about 11.3s.
ffmpeg -v error -y -ss 13.2 -i out/intro.mp4 -frames:v 1 -q:v 3 web/intro-poster.jpg
ls -l web

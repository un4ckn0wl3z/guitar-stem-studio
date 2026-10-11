#!/usr/bin/env bash
cd "$(dirname "$0")"
. .venv/bin/activate
pip install -U "yt-dlp[default]" deno imageio-ffmpeg

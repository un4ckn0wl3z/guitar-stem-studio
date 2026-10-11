#!/usr/bin/env bash
# ติดตั้งครั้งแรก (macOS / Linux)
set -e
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
$PY -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo ""
echo "ติดตั้งเสร็จแล้ว  ->  รันด้วย ./run.sh"

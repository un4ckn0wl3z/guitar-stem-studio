#!/usr/bin/env bash
# ติดตั้งครั้งแรก (macOS / Linux)
set -e
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
$PY -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
# basic-pitch ติดตั้งแบบ --no-deps เพื่อใช้ ONNX runtime แทน TensorFlow (เบากว่า และรองรับ Python ใหม่)
pip install --no-deps basic-pitch==0.4.0
echo ""
echo "ติดตั้งเสร็จแล้ว  ->  รันด้วย ./run.sh"

"""Guitar Stem Studio — local web app.

Run:  python app.py   then open http://localhost:8000
"""
from __future__ import annotations

import os
import re
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import processing as P
from i18n import UserError

BASE = Path(__file__).parent
ALLOWED = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"}

app = FastAPI(title="Guitar Stem Studio")


@app.on_event("startup")
def _startup():
    P.start_worker()


def _meta_or_404(job_id: str) -> dict:
    if not job_id.isalnum():
        raise HTTPException(400, "bad id")
    m = P.read_meta(job_id)
    if not m:
        raise HTTPException(404, "job not found")
    return m


@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(400, {"key": "err.bad_ext", "params": {"exts": ", ".join(sorted(ALLOWED))}})
    fd, tmp = tempfile.mkstemp(suffix=ext)
    with os.fdopen(fd, "wb") as f:
        shutil.copyfileobj(file.file, f)
    job_id = P.create_job(file.filename, Path(tmp))
    return {"id": job_id}


class UrlReq(BaseModel):
    url: str


@app.post("/api/youtube")
def from_youtube(req: UrlReq):
    url = req.url.strip()
    if not re.match(r"^https?://", url):
        raise HTTPException(400, {"key": "err.bad_url", "params": {}})
    return {"id": P.create_job_from_url(url)}


@app.get("/api/jobs")
def jobs():
    return P.list_jobs()


@app.get("/api/jobs/{job_id}")
def job(job_id: str):
    return _meta_or_404(job_id)


@app.delete("/api/jobs/{job_id}")
def delete(job_id: str):
    _meta_or_404(job_id)
    P.delete_job(job_id)
    return {"ok": True}


@app.get("/api/jobs/{job_id}/analysis")
def analysis(job_id: str):
    _meta_or_404(job_id)
    p = P.job_dir(job_id) / "analysis.json"
    if not p.exists():
        raise HTTPException(404, "not ready")
    try:
        P.ensure_refined_beats(job_id)  # tighten beats onto the drum hits (older jobs)
    except Exception:  # noqa: BLE001
        pass
    return FileResponse(p, media_type="application/json")


# ------------------------------------------------------------ backing track export

class BackingReq(BaseModel):
    stems: dict[str, float]
    start: float = 0
    end: float = 0
    rate: float = 1.0
    count_in_bars: int = 0
    metronome: bool = False
    click_gain: float = 0.8
    beats: list[float] = []
    bpb: int = 4
    first_downbeat_index: int = 0
    fmt: str = "mp3"


@app.post("/api/jobs/{job_id}/backing")
def backing_export(job_id: str, req: BackingReq):
    import backing

    m = _meta_or_404(job_id)
    if m.get("status") != "done" and not m.get("stems"):
        raise HTTPException(409, {"key": "err.not_ready", "params": {}})
    fmt = "wav" if req.fmt == "wav" else "mp3"
    try:
        out = backing.render(job_id, stems=req.stems, start=max(0.0, req.start), end=req.end, rate=req.rate,
                             count_in_bars=max(0, min(4, req.count_in_bars)), metronome=req.metronome,
                             click_gain=max(0.0, min(2.0, req.click_gain)), beats=req.beats,
                             bpb=max(1, min(12, req.bpb)), first_downbeat_index=req.first_downbeat_index, fmt=fmt)
    except UserError as e:
        raise HTTPException(400, e.to_dict())
    name = backing.nice_name(m["name"], list(req.stems), m.get("stems", []), req.start,
                             req.end or float(m.get("duration") or 0), req.rate, req.count_in_bars, fmt)
    return {"file": out.name, "name": name}


@app.get("/api/jobs/{job_id}/backing/{file}")
def backing_file(job_id: str, file: str, name: str | None = None):
    _meta_or_404(job_id)
    if not re.fullmatch(r"backing_\d{6}\.(mp3|wav)", file):
        raise HTTPException(400, "bad file")
    p = P.job_dir(job_id) / "exports" / file
    if not p.exists():
        raise HTTPException(404, {"key": "err.expired", "params": {}})
    return FileResponse(p, filename=name) if name else FileResponse(p)


@app.get("/api/jobs/{job_id}/stem/{name}")
def stem(job_id: str, name: str, download: int = 0):
    m = _meta_or_404(job_id)
    allowed = set(m.get("stems", [])) | ({m["source"]} if m.get("source") else set())
    if name not in allowed:
        raise HTTPException(404, "no such stem")
    kw = {"filename": f"{m['name']}-{name}"} if download else {}
    # FileResponse supports HTTP Range requests -> seeking works in <audio>
    return FileResponse(P.job_dir(job_id) / name, **kw)


app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("GS_HOST", "127.0.0.1")
    port = int(os.environ.get("GS_PORT", "8000"))
    print(f"\n  Guitar Stem Studio → http://{'localhost' if host == '127.0.0.1' else host}:{port}\n")
    uvicorn.run(app, host=host, port=port, log_level="warning")

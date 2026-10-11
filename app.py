"""Guitar Stem Studio — local web app.

Run:  python app.py   then open http://localhost:8000
"""
from __future__ import annotations

import os
import re
import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import processing as P

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
        raise HTTPException(400, f"รองรับเฉพาะ {', '.join(sorted(ALLOWED))}")
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
        raise HTTPException(400, "ลิงก์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย http:// หรือ https://)")
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


class TranscribeReq(BaseModel):
    stem: str = "guitar"
    onset: float = 0.5
    frame: float = 0.3
    min_len_ms: float = 80.0


@app.post("/api/jobs/{job_id}/transcribe")
def transcribe(job_id: str, req: TranscribeReq):
    m = _meta_or_404(job_id)
    if m.get("status") not in ("done", "error"):
        raise HTTPException(409, "งานยังประมวลผลอยู่")
    P.enqueue_transcribe(job_id, req.model_dump())
    return {"ok": True}


# ------------------------------------------------------------ imported tabs

TAB_EXTS = {".pdf", ".txt", ".tab", ".gp3", ".gp4", ".gp5", ".gp", ".gpx", ".musicxml", ".xml", ".mxl"}


def _save_import(job_id: str, src: Path, track: int | None = None, bpb: float = 4, display: str | None = None) -> dict:
    import json
    import tabimport

    try:
        tab = tabimport.import_file(src, track=track, bpb_hint=bpb)
    except tabimport.ImportErrorTH as e:
        raise HTTPException(422, str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"อ่านไฟล์ไม่สำเร็จ: {type(e).__name__}: {e}")
    tab["file"] = display or src.name
    (P.job_dir(job_id) / "imported_tab.json").write_text(json.dumps(tab, ensure_ascii=False), "utf-8")
    return tab


@app.post("/api/jobs/{job_id}/tab-import")
async def tab_import(job_id: str, file: UploadFile | None = File(None), text: str | None = Form(None),
                     bpb: float = Form(4)):
    _meta_or_404(job_id)
    d = P.job_dir(job_id)
    if file is not None and file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in TAB_EXTS:
            raise HTTPException(400, f"รองรับ {', '.join(sorted(TAB_EXTS))}")
        src = d / f"incoming_src{ext}"
        with open(src, "wb") as f:
            shutil.copyfileobj(file.file, f)
    elif text and text.strip():
        src = d / "incoming_src.txt"
        src.write_text(text, "utf-8")
    else:
        raise HTTPException(400, "ไม่มีไฟล์หรือข้อความ Tab")
    display = file.filename if file is not None and file.filename else "Tab ที่วาง"
    try:
        _save_import(job_id, src, bpb=bpb, display=display)  # validate first; keep the old tab if this fails
    except HTTPException:
        src.unlink(missing_ok=True)
        raise
    for old in d.glob("imported_src.*"):
        old.unlink()
    final = src.rename(d / src.name.replace("incoming_src", "imported_src"))
    return _save_import(job_id, final, bpb=bpb, display=display)


@app.post("/api/jobs/{job_id}/tab-import/track")
def tab_import_track(job_id: str, index: int, bpb: float = 4):
    _meta_or_404(job_id)
    src = next(P.job_dir(job_id).glob("imported_src.*"), None)
    if not src:
        raise HTTPException(404, "ยังไม่ได้นำเข้า Tab")
    import json

    old = P.job_dir(job_id) / "imported_tab.json"
    display = json.loads(old.read_text("utf-8")).get("file") if old.exists() else None
    return _save_import(job_id, src, track=index, bpb=bpb, display=display)


@app.get("/api/jobs/{job_id}/tab-import")
def tab_import_get(job_id: str):
    _meta_or_404(job_id)
    p = P.job_dir(job_id) / "imported_tab.json"
    if not p.exists():
        raise HTTPException(404, "no imported tab")
    return FileResponse(p, media_type="application/json")


@app.delete("/api/jobs/{job_id}/tab-import")
def tab_import_delete(job_id: str):
    _meta_or_404(job_id)
    d = P.job_dir(job_id)
    for f in list(d.glob("imported_src.*")) + [d / "imported_tab.json"]:
        f.unlink(missing_ok=True)
    return {"ok": True}


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
        raise HTTPException(409, "ยังประมวลผลไม่เสร็จ")
    fmt = "wav" if req.fmt == "wav" else "mp3"
    try:
        out = backing.render(job_id, stems=req.stems, start=max(0.0, req.start), end=req.end, rate=req.rate,
                             count_in_bars=max(0, min(4, req.count_in_bars)), metronome=req.metronome,
                             click_gain=max(0.0, min(2.0, req.click_gain)), beats=req.beats,
                             bpb=max(1, min(12, req.bpb)), first_downbeat_index=req.first_downbeat_index, fmt=fmt)
    except ValueError as e:
        raise HTTPException(400, str(e))
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
        raise HTTPException(404, "ไฟล์หมดอายุ — กดสร้างใหม่")
    return FileResponse(p, filename=name) if name else FileResponse(p)


@app.get("/api/jobs/{job_id}/midi")
def midi(job_id: str):
    m = _meta_or_404(job_id)
    p = P.job_dir(job_id) / "transcription.mid"
    if not p.exists():
        raise HTTPException(404, "no midi")
    return FileResponse(p, media_type="audio/midi", filename=f"{m['name']}-guitar.mid")


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

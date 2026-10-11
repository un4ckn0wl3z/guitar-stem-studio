"""Audio pipeline: stem separation (Demucs), beat tracking (librosa), guitar transcription (basic-pitch)."""
from __future__ import annotations

import json
import os
import queue
import shutil
import threading
import time
import traceback
import uuid
from pathlib import Path

import numpy as np

from tabgen import assign_frets, STANDARD_TUNING

DATA_DIR = Path(os.environ.get("GS_DATA_DIR", Path(__file__).parent / "data" / "jobs"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

MODEL_NAME = os.environ.get("GS_MODEL", "htdemucs_6s")  # 6 stems incl. guitar & piano
STEM_FORMAT = os.environ.get("GS_STEM_FORMAT", "mp3")  # mp3 (small) or wav

_lock = threading.Lock()
_queue: "queue.Queue[tuple]" = queue.Queue()


# ---------------------------------------------------------------- job meta

def job_dir(job_id: str) -> Path:
    return DATA_DIR / job_id


def read_meta(job_id: str) -> dict | None:
    p = job_dir(job_id) / "meta.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text("utf-8"))
    except Exception:
        return None


def write_meta(job_id: str, **updates) -> dict:
    with _lock:
        meta = read_meta(job_id) or {}
        meta.update(updates)
        tmp = job_dir(job_id) / "meta.json.tmp"
        tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=1), "utf-8")
        tmp.replace(job_dir(job_id) / "meta.json")
        return meta


def list_jobs() -> list[dict]:
    jobs = []
    for d in DATA_DIR.iterdir():
        if d.is_dir():
            m = read_meta(d.name)
            if m:
                jobs.append(m)
    jobs.sort(key=lambda m: m.get("created", 0), reverse=True)
    return jobs


def create_job(filename: str, src_path: Path) -> str:
    job_id = uuid.uuid4().hex[:10]
    d = job_dir(job_id)
    d.mkdir(parents=True)
    ext = Path(filename).suffix.lower() or ".mp3"
    dst = d / f"original{ext}"
    shutil.move(str(src_path), dst)
    write_meta(
        job_id,
        id=job_id,
        name=Path(filename).stem,
        source=dst.name,
        status="queued",
        stage="รอคิว",
        progress=0.0,
        created=time.time(),
        stems=[],
        error=None,
        transcribe_stem="guitar",
    )
    _queue.put(("full", job_id, {}))
    return job_id


def create_job_from_url(url: str) -> str:
    job_id = uuid.uuid4().hex[:10]
    job_dir(job_id).mkdir(parents=True)
    write_meta(
        job_id,
        id=job_id,
        name="YouTube",
        url=url,
        source=None,
        status="queued",
        stage="รอคิว (ดาวน์โหลด)",
        progress=0.0,
        created=time.time(),
        stems=[],
        error=None,
        transcribe_stem="guitar",
    )
    _queue.put(("youtube", job_id, {}))
    return job_id


def enqueue_transcribe(job_id: str, opts: dict):
    write_meta(job_id, status="queued", stage="รอคิว (ถอดโน้ตใหม่)", progress=0.85, error=None)
    _queue.put(("transcribe", job_id, opts))


def delete_job(job_id: str):
    shutil.rmtree(job_dir(job_id), ignore_errors=True)


# ---------------------------------------------------------------- worker

def _worker():
    while True:
        kind, job_id, opts = _queue.get()
        try:
            if kind == "youtube":
                run_download(job_id)
                run_full(job_id)
            elif kind == "full":
                run_full(job_id)
            elif kind == "transcribe":
                run_transcribe(job_id, **opts)
                write_meta(job_id, status="done", stage="เสร็จแล้ว", progress=1.0)
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            write_meta(job_id, status="error", error=f"{type(e).__name__}: {e}")
        finally:
            _queue.task_done()


def start_worker():
    # resume jobs interrupted by a restart
    for m in list_jobs():
        if m.get("status") in ("queued", "running"):
            _queue.put(("youtube" if not m.get("source") else "full", m["id"], {}))
    threading.Thread(target=_worker, daemon=True).start()


def _pick_device():
    import torch

    forced = os.environ.get("GS_DEVICE")
    if forced:
        return forced
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"  # MPS lacks some FFT ops Demucs needs; CPU is safer


# ---------------------------------------------------------------- ffmpeg / download

MAX_MINUTES = float(os.environ.get("GS_MAX_MINUTES", "20"))
NATIVE_EXTS = {".mp3", ".wav", ".flac", ".ogg"}  # readable without ffmpeg


def get_ffmpeg() -> str:
    """System ffmpeg if present, otherwise the binary bundled with imageio-ffmpeg (works on Windows/macOS/Linux)."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def to_mp3(src: Path) -> Path:
    import subprocess

    dst = src.with_suffix(".mp3")
    subprocess.run([get_ffmpeg(), "-y", "-loglevel", "error", "-i", str(src), "-vn", "-ac", "2",
                    "-ar", "44100", "-b:a", "192k", str(dst)], check=True)
    src.unlink(missing_ok=True)
    return dst


def normalize_url(url: str) -> str:
    """music.youtube.com / youtu.be / shorts links -> plain youtube watch URL (single video)."""
    from urllib.parse import urlparse, parse_qs

    u = urlparse(url.strip())
    host = (u.hostname or "").lower()
    vid = None
    if host.endswith("youtube.com"):
        if u.path == "/watch":
            vid = parse_qs(u.query).get("v", [None])[0]
        elif u.path.startswith(("/shorts/", "/live/")):
            vid = u.path.split("/")[2]
    elif host == "youtu.be":
        vid = u.path.lstrip("/").split("/")[0]
    return f"https://www.youtube.com/watch?v={vid}" if vid else url


def run_download(job_id: str):
    """Download audio from YouTube (or any site yt-dlp supports) and convert to MP3."""
    import yt_dlp

    meta = read_meta(job_id)
    d = job_dir(job_id)
    write_meta(job_id, status="running", stage="กำลังดึงข้อมูลวิดีโอ", progress=0.0)

    def hook(st):
        if st.get("status") == "downloading":
            total = st.get("total_bytes") or st.get("total_bytes_estimate") or 0
            frac = (st.get("downloaded_bytes", 0) / total) if total else 0
            write_meta(job_id, stage="กำลังดาวน์โหลดจาก YouTube", progress=0.04 * frac)
        elif st.get("status") == "finished":
            write_meta(job_id, stage="กำลังแปลงเป็น MP3", progress=0.045)

    def too_long(info, *, incomplete=False):
        dur = info.get("duration")
        if dur and dur > MAX_MINUTES * 60:
            return f"วิดีโอยาว {dur / 60:.0f} นาที เกินกำหนด {MAX_MINUTES:.0f} นาที (ตั้ง GS_MAX_MINUTES เพื่อเพิ่ม)"
        return None

    opts = {
        "format": "bestaudio/best",
        "outtmpl": str(d / "original.%(ext)s"),
        "noplaylist": True,
        "playlist_items": "1",  # album/playlist links -> only the first track
        "quiet": True,
        "no_warnings": True,
        "ffmpeg_location": get_ffmpeg(),
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192"}],
        "progress_hooks": [hook],
        "match_filter": too_long,
    }
    try:  # YouTube needs a JS runtime for signature solving; the `deno` pip package provides one
        import deno

        opts["js_runtimes"] = {"deno": {"path": deno.find_deno_bin()}}
    except Exception:
        pass

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(normalize_url(meta["url"]), download=True)
            if info and info.get("entries") is not None:  # playlist wrapper -> first entry
                info = next((e for e in info["entries"] if e), None)
    except yt_dlp.utils.DownloadError as e:
        msg = str(e).replace("ERROR: ", "").split("; please report")[0]
        raise RuntimeError(f"ดาวน์โหลดไม่สำเร็จ: {msg} — ถ้าลิงก์ถูกต้อง ลองรัน update.bat เพื่ออัปเดตตัวโหลด YouTube") from None
    if info is None or not (d / "original.mp3").exists():
        reason = too_long(info or {}) if info else None
        raise RuntimeError(reason or "ดาวน์โหลดไม่สำเร็จ (ตรวจสอบลิงก์ หรืออัปเดต yt-dlp: pip install -U yt-dlp)")
    title = info.get("title") or "YouTube"
    write_meta(job_id, name=title, source="original.mp3", url=info.get("webpage_url", meta["url"]),
               duration=info.get("duration"))


# ---------------------------------------------------------------- stages

def run_full(job_id: str):
    meta = read_meta(job_id)
    d = job_dir(job_id)
    src = d / meta["source"]
    write_meta(job_id, status="running", stage="กำลังโหลดไฟล์เสียง", progress=0.05)
    if src.suffix.lower() not in NATIVE_EXTS:  # m4a / aac / webm ... -> mp3
        src = to_mp3(src)
        write_meta(job_id, source=src.name)

    import librosa

    # ---- separation
    stems = separate(src, d, lambda p: write_meta(job_id, stage="กำลังแยกเสียง (AI)", progress=0.05 + 0.75 * p))
    write_meta(job_id, stems=stems)

    # ---- beats / tempo on the original mix (more reliable than drums alone)
    write_meta(job_id, stage="กำลังหาจังหวะ (beat)", progress=0.82)
    y, sr = librosa.load(str(src), sr=22050, mono=True)
    duration = float(len(y) / sr)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames", trim=False)
    beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()
    bpm = float(np.atleast_1d(tempo)[0])
    if len(beats) > 4:
        bpm = float(60.0 / np.median(np.diff(beats)))
    beats = refine_beats(beats, d / next((x for x in stems if x.startswith("drums.")), ""), y, sr)
    analysis = {"duration": duration, "bpm": round(bpm, 2), "beats": [round(b, 4) for b in beats], "beats_refined": 2,
                "tuning": STANDARD_TUNING, "notes": [], "notes_stem": None}
    (d / "analysis.json").write_text(json.dumps(analysis), "utf-8")

    # ---- transcription
    run_transcribe(job_id, stem="guitar")
    write_meta(job_id, status="done", stage="เสร็จแล้ว", progress=1.0, duration=duration, bpm=round(bpm, 1))


def _onsets(y, sr):
    import librosa

    hop = 64  # ~3 ms resolution at 22.05 kHz
    env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, n_fft=512, n_mels=48)
    # robust normalisation: one huge hit (e.g. music starting after silence) must not hide the rest
    pos = env[env > 0]
    if len(pos):
        env = np.minimum(env / (np.percentile(pos, 99) + 1e-9), 1.0)
    t = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units="time", normalize=False)
    return np.maximum(t - 0.006, 0.0)  # spectral-flux peaks ~6 ms after the audible attack


def refine_beats(beats, drums_path: Path | None, mix_y=None, sr: int = 22050) -> list[float]:
    """Beat trackers place beats ~20-50 ms late. Pull every beat onto the actual drum hits:
    match each beat to the nearest onset (±70 ms) in the drums stem (fallback: full mix),
    smooth the per-beat offsets with a running median (no jitter), apply to all beats."""
    import librosa

    beats = np.asarray(beats, dtype=float)
    if len(beats) < 8:
        return beats.tolist()
    sources = []
    if drums_path and Path(drums_path).is_file():
        sources.append(lambda: librosa.load(str(drums_path), sr=sr, mono=True)[0])
    if mix_y is not None:
        sources.append(lambda: mix_y)
    for load in sources:
        on = _onsets(load(), sr)
        if len(on) < 8:
            continue
        idx = np.clip(np.searchsorted(on, beats), 1, len(on) - 1)
        near = np.where(np.abs(on[idx - 1] - beats) < np.abs(on[idx] - beats), on[idx - 1], on[idx])
        diff = near - beats
        ok = np.abs(diff) < 0.07
        per_beat = np.sum((on >= beats[0]) & (on <= beats[-1])) / max(1, len(beats) - 1)
        if ok.mean() < 0.35 or per_beat > 6 or np.std(diff[ok]) > 0.03:
            continue  # too few hits on the beat (no drums) or too noisy to trust
        dm = np.where(ok, diff, np.nan)
        k = 4
        sm = np.array([np.nanmedian(dm[max(0, i - k):i + k + 1]) if np.any(~np.isnan(dm[max(0, i - k):i + k + 1]))
                       else np.nan for i in range(len(dm))])
        sm = np.where(np.isnan(sm), np.nanmedian(dm), sm)
        out = beats + sm
        out = np.maximum.accumulate(np.maximum(out, 0))  # keep monotonic, non-negative
        return out.tolist()
    return beats.tolist()


def ensure_refined_beats(job_id: str):
    """Upgrade analyses made by older versions (one-time, a few seconds)."""
    import librosa

    ap = job_dir(job_id) / "analysis.json"
    a = json.loads(ap.read_text("utf-8"))
    if a.get("beats_refined") == 2 or len(a.get("beats", [])) < 8:
        return
    meta = read_meta(job_id)
    d = job_dir(job_id)
    drums = next((d / x for x in meta.get("stems", []) if x.startswith("drums.")), None)
    y, sr = librosa.load(str(d / meta["source"]), sr=22050, mono=True)
    a["beats"] = [round(b, 4) for b in refine_beats(a["beats"], drums, y, sr)]
    a["beats_refined"] = 2
    ap.write_text(json.dumps(a), "utf-8")


def separate(src: Path, out_dir: Path, progress_cb) -> list[str]:
    import librosa
    import soundfile as sf
    import torch
    import demucs.apply as dapply
    from demucs.pretrained import get_model

    model = get_model(MODEL_NAME)
    model.eval()
    sr = model.samplerate
    wav, _ = librosa.load(str(src), sr=sr, mono=False)
    if wav.ndim == 1:
        wav = np.stack([wav, wav])
    wav = wav[:2]
    mix = torch.from_numpy(np.ascontiguousarray(wav)).float()
    ref = mix.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    mix = (mix - mean) / std

    # hook Demucs' tqdm progress bar to report progress to the UI
    class _TqdmShim:
        @staticmethod
        def tqdm(iterable, **kw):
            items = list(iterable)
            for i, it in enumerate(items):
                progress_cb(i / max(1, len(items)))
                yield it
            progress_cb(1.0)

    orig_tqdm = dapply.tqdm
    dapply.tqdm = _TqdmShim
    try:
        with torch.no_grad():
            sources = dapply.apply_model(model, mix[None], device=_pick_device(), shifts=1, split=True,
                                         overlap=0.25, progress=True, num_workers=0)[0]
    finally:
        dapply.tqdm = orig_tqdm
    sources = sources * std + mean

    names = []
    for name, src_t in zip(model.sources, sources):
        audio = src_t.cpu().numpy().T  # (samples, channels)
        peak = float(np.abs(audio).max() or 1.0)
        if peak > 0.999:
            audio = audio / peak * 0.999
        out = out_dir / f"{name}.{STEM_FORMAT}"
        try:
            sf.write(str(out), audio, sr, format=STEM_FORMAT.upper())
        except Exception:
            out = out_dir / f"{name}.wav"
            sf.write(str(out), audio, sr, subtype="PCM_16")
        names.append(out.name)
    return names


def run_transcribe(job_id: str, stem: str = "guitar", onset: float = 0.5, frame: float = 0.3,
                   min_len_ms: float = 80.0):
    """Polyphonic note transcription with Spotify basic-pitch, then fret assignment."""
    d = job_dir(job_id)
    meta = read_meta(job_id)
    write_meta(job_id, status="running", stage=f"กำลังถอดโน้ต ({stem}) → tab", progress=0.86)
    stem_file = next((s for s in meta.get("stems", []) if s.rsplit(".", 1)[0] == stem), None)
    path = d / stem_file if stem_file else d / meta["source"]

    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    _, midi, events = predict(
        str(path),
        ICASSP_2022_MODEL_PATH,
        onset_threshold=float(onset),
        frame_threshold=float(frame),
        minimum_note_length=float(min_len_ms),
        minimum_frequency=75.0,
        maximum_frequency=1400.0,
        melodia_trick=True,
    )
    midi.write(str(d / "transcription.mid"))
    raw = [{"t": float(s), "d": float(e - s), "p": int(p), "v": float(a)} for s, e, p, a, *_ in events]
    notes = assign_frets(raw)

    ap = d / "analysis.json"
    analysis = json.loads(ap.read_text("utf-8"))
    analysis["notes"] = notes
    analysis["notes_stem"] = stem
    ap.write_text(json.dumps(analysis), "utf-8")
    write_meta(job_id, transcribe_stem=stem, note_count=len(notes))

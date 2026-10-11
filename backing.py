"""Render a practice backing track: chosen stems + gains, time range, slow-down (pitch kept),
count-in and optional metronome clicks."""
from __future__ import annotations

import re
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

import processing as P

SR_OUT = 44100


def _click(sr: int, accent: bool) -> np.ndarray:
    n = int(0.045 * sr)
    t = np.arange(n) / sr
    f = 1760.0 if accent else 1175.0
    wave = np.sign(np.sin(2 * np.pi * f * t)) * 0.6 + np.sin(2 * np.pi * f * t) * 0.4
    env = np.exp(-t * 90.0)
    env[: int(0.002 * sr)] *= np.linspace(0, 1, int(0.002 * sr))
    return (wave * env * (0.9 if accent else 0.6)).astype(np.float32)


def _stretch(audio: np.ndarray, sr: int, rate: float, ffmpeg: str, only: str | None = None):
    """Time-stretch keeping pitch. Prefers ffmpeg rubberband (best quality), falls back to atempo.
    Returns (audio, filter_used)."""
    if abs(rate - 1.0) < 1e-3:
        return audio, None
    with tempfile.TemporaryDirectory() as td:
        src, dst = Path(td) / "in.wav", Path(td) / "out.wav"
        sf.write(src, audio, sr, subtype="FLOAT")
        chain, r = [], rate
        while r < 0.5:
            chain.append("atempo=0.5")
            r /= 0.5
        while r > 2.0:
            chain.append("atempo=2.0")
            r /= 2.0
        chain.append(f"atempo={r:.6f}")
        filters = [f"rubberband=tempo={rate:.6f}:pitchq=quality:transients=crisp", ",".join(chain)]
        for flt in ([only] if only else filters):
            res = subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-af", flt, "-ac", "2",
                                  "-ar", str(sr), "-c:a", "pcm_f32le", str(dst)], capture_output=True)
            if res.returncode == 0 and dst.exists():
                out, _ = sf.read(dst, dtype="float32", always_2d=True)
                return out, flt
        raise RuntimeError("ยืดเวลาเสียงไม่สำเร็จ: " + res.stderr.decode(errors="replace")[-300:])


def _stretch_latency(sr: int, rate: float, ffmpeg: str, flt: str) -> float:
    """Time-stretchers move transients by a rate-dependent amount (rubberband at 50%: ~30 ms early).
    Measure it by pushing isolated drum-like hits through the exact same filter and locating each
    hit's attack (envelope crossing 25% of its peak). Returns seconds; negative = output is early."""
    gap, n = 0.6, 10
    probe = np.zeros((int((n + 1) * gap * sr), 2), np.float32)
    rng = np.random.default_rng(1)
    hl = int(0.08 * sr)
    tt = np.arange(hl) / sr
    hit = ((rng.standard_normal(hl) * 0.4 + np.sin(2 * np.pi * (50 + 80 * np.exp(-tt * 40)) * tt))
           * np.exp(-tt * 25)).astype(np.float32) * 0.8
    times = [(k + 0.5) * gap for k in range(n)]
    for t in times:
        i = int(t * sr)
        probe[i:i + hl] += hit[:, None]
    out, _ = _stretch(probe, sr, rate, ffmpeg, only=flt)
    env = np.abs(out.mean(1))
    d = []
    for t in times[1:-1]:
        e = t / rate
        i0, i1 = int((e - 0.1) * sr), int((e + 0.1) * sr)
        if i0 < 0 or i1 > len(env):
            continue
        sm = np.convolve(env[i0:i1], np.ones(16) / 16, "same")
        d.append((i0 + int(np.argmax(sm > 0.25 * sm.max()))) / sr - e)
    return float(np.median(d)) if d else 0.0


def render(job_id: str, *, stems: dict[str, float], start: float, end: float, rate: float = 1.0,
           count_in_bars: int = 0, metronome: bool = False, click_gain: float = 0.8,
           beats: list[float] | None = None, bpb: int = 4, first_downbeat_index: int = 0,
           fmt: str = "mp3") -> Path:
    """stems: {stem file name: gain}. beats: song beat times (s) covering [start, end] for the clicks;
    beats[i] is a downbeat when (i - first_downbeat_index) % bpb == 0."""
    meta = P.read_meta(job_id)
    d = P.job_dir(job_id)
    allowed = set(meta.get("stems", []))
    rate = float(min(2.0, max(0.25, rate)))
    if not stems:
        raise ValueError("ต้องเลือกอย่างน้อย 1 แทร็ก")

    mix = None
    sr = SR_OUT
    for name, gain in stems.items():
        if name not in allowed:
            raise ValueError(f"ไม่มีแทร็ก {name}")
        with sf.SoundFile(d / name) as f:
            sr = f.samplerate
            s0 = max(0, int(start * sr))
            s1 = min(f.frames, int(end * sr)) if end > 0 else f.frames
            f.seek(s0)
            data = f.read(max(0, s1 - s0), dtype="float32", always_2d=True)
        if data.shape[1] == 1:
            data = np.repeat(data, 2, axis=1)
        data = data[:, :2] * float(gain)
        mix = data if mix is None else (mix[: min(len(mix), len(data))] + data[: min(len(mix), len(data))])
    if mix is None or len(mix) < sr * 0.2:
        raise ValueError("ช่วงเวลาสั้นเกินไป")

    # short fades at the cut points
    fl = min(len(mix) // 4, int(0.015 * sr))
    if fl > 0:
        ramp = np.linspace(0, 1, fl, dtype=np.float32)[:, None]
        mix[:fl] *= ramp
        mix[-fl:] *= ramp[::-1]

    ff = P.get_ffmpeg()
    mix, used = _stretch(mix, sr, rate, ff)
    if used:  # put transients back on the grid so clicks line up with the drums
        lat = _stretch_latency(sr, rate, ff, used)
        shift = int(round(-lat * sr))
        if shift > 0:
            mix = np.concatenate([np.zeros((shift, 2), np.float32), mix])
        elif shift < 0:
            mix = mix[-shift:]

    # ---- clicks (positions in OUTPUT time)
    beats = sorted(beats or [])
    beat_iv = float(np.median(np.diff(beats))) if len(beats) > 2 else 0.5
    clicks: list[tuple[float, bool]] = []
    if metronome:
        for i, bt in enumerate(beats):
            if start - 1e-3 <= bt < (end if end > 0 else 1e9):
                clicks.append(((bt - start) / rate, (i - first_downbeat_index) % bpb == 0))
    lead = 0.0
    if count_in_bars > 0:
        iv_out = beat_iv / rate
        n = int(count_in_bars) * bpb
        lead = n * iv_out
        clicks = [(c + lead, a) for c, a in clicks]
        clicks = [(k * iv_out, k % bpb == 0) for k in range(n)] + clicks
    if lead > 0:
        mix = np.concatenate([np.zeros((int(round(lead * sr)), 2), np.float32), mix])
    if clicks:
        hi, lo = _click(sr, True) * click_gain, _click(sr, False) * click_gain
        for t, acc in clicks:
            c = hi if acc else lo
            i0 = int(round(t * sr))
            if 0 <= i0 < len(mix):
                seg = c[: len(mix) - i0]
                mix[i0:i0 + len(seg)] += seg[:, None]

    peak = float(np.abs(mix).max() or 1.0)
    if peak > 0.98:
        mix *= 0.98 / peak

    out_dir = d / "exports"
    out_dir.mkdir(exist_ok=True)
    for old in out_dir.glob("backing_*"):  # keep the folder small
        if time.time() - old.stat().st_mtime > 3600:
            old.unlink(missing_ok=True)
    stamp = time.strftime("%H%M%S")
    wav = out_dir / f"backing_{stamp}.wav"
    sf.write(wav, mix, sr, subtype="PCM_16")
    if fmt == "wav":
        return wav
    mp3 = wav.with_suffix(".mp3")
    subprocess.run([P.get_ffmpeg(), "-y", "-loglevel", "error", "-i", str(wav), "-b:a", "256k", str(mp3)], check=True)
    wav.unlink(missing_ok=True)
    return mp3


def nice_name(song: str, stems: list[str], all_stems: list[str], start: float, end: float, rate: float,
              count_in: int, ext: str) -> str:
    def mmss(t):
        return f"{int(t // 60)}m{int(t % 60):02d}"

    names = [s.rsplit(".", 1)[0] for s in stems]
    missing = [s.rsplit(".", 1)[0] for s in all_stems if s not in stems]
    if len(missing) == 1:
        what = f"no {missing[0]}"
    elif not missing:
        what = "full"
    else:
        what = "+".join(names)
    parts = [song, f"backing ({what})", f"{round(rate * 100)}%", f"{mmss(start)}-{mmss(end)}"]
    if count_in:
        parts.append(f"countin{count_in}")
    name = " - ".join(parts) + "." + ext
    return re.sub(r'[\\/:*?"<>|]+', "_", name)

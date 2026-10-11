"""Import existing guitar tabs (PDF, ASCII text, Guitar Pro 3-5, MusicXML) into a measure-based model.

Output model:
{
  "source": "pdf-text" | "pdf-vector" | "ascii" | "guitarpro" | "musicxml",
  "title": str, "tempo": float|None, "tuning": [64,59,55,50,45,40],   # string 0 = high e
  "tracks": [names], "track": int,
  "exact_rhythm": bool,           # False for PDF/ASCII (position estimated from spacing)
  "measures": [ {"len": beats, "notes": [ {"pos": beats, "dur": beats|None, "s": 0-5, "f": fret, "p": midi} ]} ],
  "warnings": [str]
}
Beats are quarter notes.
"""
from __future__ import annotations

import re
import statistics
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

STANDARD = [64, 59, 55, 50, 45, 40]


class ImportErrorTH(Exception):
    pass


def _result(source, measures, **kw):
    out = {"source": source, "title": kw.get("title"), "tempo": kw.get("tempo"),
           "tuning": kw.get("tuning") or STANDARD, "tracks": kw.get("tracks") or [], "track": kw.get("track", 0),
           "exact_rhythm": kw.get("exact_rhythm", False), "measures": measures, "warnings": kw.get("warnings") or []}
    n = sum(len(m["notes"]) for m in measures)
    if not measures or n == 0:
        raise ImportErrorTH("ไม่พบโน้ต Tab ในไฟล์นี้")
    out["note_count"] = n
    return out


def import_file(path: Path, track: int | None = None, bpb_hint: float = 4) -> dict:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return import_pdf(path, bpb_hint)
    if ext in (".txt", ".tab", ".text"):
        return import_ascii(path.read_text("utf-8", errors="replace"), bpb_hint)
    if ext in (".gp3", ".gp4", ".gp5"):
        return import_guitarpro(path, track)
    if ext in (".musicxml", ".xml", ".mxl"):
        return import_musicxml(path, track)
    if ext in (".gp", ".gpx"):
        raise ImportErrorTH("ไฟล์ Guitar Pro 6/7/8 (.gp/.gpx) ยังไม่รองรับ — ใน Guitar Pro ให้ File → Export → MusicXML "
                            "หรือ Guitar Pro 5 (.gp5) แล้วนำเข้าไฟล์นั้นแทน")
    raise ImportErrorTH(f"ไม่รองรับไฟล์ {ext}")


# ============================================================ repeats

def unfold(headers: list[dict]) -> list[int]:
    """headers: [{open:bool, close:int (total plays, 0=none), alt:set|None}] -> play order of measure indices."""
    order, n = [], len(headers)
    i, start, pas = 0, 0, 1
    while i < n and len(order) < 20000:
        h = headers[i]
        if h.get("open") and i != start:
            start, pas = i, 1
        alt = h.get("alt")
        if alt and pas not in alt:
            i += 1
            continue
        order.append(i)
        close = h.get("close") or 0
        if close and pas < close:
            pas += 1
            i = start
            continue
        if close:
            pas, start = 1, i + 1
        i += 1
    return order


# ============================================================ ASCII tab

_ALLOWED = set("-0123456789|hpbrs/\\~x()<>.^*=v+:[]{}' ")
_LABEL = re.compile(r"^\s*([A-Ga-g][#b]?)?\s*[|:]")


def _is_tab_line(line: str) -> bool:
    s = line.rstrip()
    if s.count("-") < 6:
        return False
    body = _LABEL.sub("", s, count=1)
    if not body:
        return False
    bad = sum(1 for c in body if c not in _ALLOWED and not c.isalpha())
    letters = sum(1 for c in body if c.isalpha() and c not in "hpbrsvx")
    return bad == 0 and letters <= 2 and body.count("-") >= len(body.strip()) * 0.4


def import_ascii(text: str, bpb: float = 4) -> dict:
    lines = text.replace("\t", "    ").splitlines()
    blocks, cur = [], []
    for ln in lines:
        if _is_tab_line(ln):
            cur.append(ln.rstrip())
        else:
            if cur:
                blocks.append(cur)
            cur = []
    if cur:
        blocks.append(cur)

    measures, warnings = [], []
    skipped = 0
    for blk in blocks:
        for k in range(0, len(blk) - 5, 6):
            six = blk[k:k + 6]
            if len(six) < 6:
                break
            measures.extend(_parse_ascii_block(six, bpb))
        if len(blk) % 6:
            skipped += 1
    if skipped:
        warnings.append(f"ข้ามบล็อกที่ไม่ใช่ 6 สาย {skipped} บล็อก (เช่น Tab เบส)")
    return _result("ascii", measures, warnings=warnings, exact_rhythm=False)


def _parse_ascii_block(six: list[str], bpb: float) -> list[dict]:
    labels = []
    bodies = []
    for ln in six:
        m = _LABEL.match(ln)
        labels.append((m.group(1) or "") if m else "")
        bodies.append(ln[m.end() - 1:] if m else ln)  # keep the leading bar char
    if labels[0] == "E" and labels[-1] == "e":  # written low-to-high
        bodies = bodies[::-1]
    width = min(len(b) for b in bodies)
    bodies = [b[:width] for b in bodies]
    # bar columns: '|' present in the majority of strings
    bars = [c for c in range(width) if sum(b[c] == "|" for b in bodies) >= 4]
    if not bars or bars[0] > 2:
        bars = [0] + bars
    if width - 1 - bars[-1] > 2:
        bars.append(width)
    out = []
    for a, b in zip(bars, bars[1:]):
        seg_w = b - a - 1
        if seg_w < 3:
            continue
        notes = []
        for s, body in enumerate(bodies):
            for m in re.finditer(r"\d{1,2}", body[a + 1:b]):
                col = m.start()
                notes.append({"col": col, "s": s, "f": int(m.group()), "p": STANDARD[s] + int(m.group())})
        if notes:
            first = min(n["col"] for n in notes)
            pad = 1 if first == 1 else 0  # "|-0---" style: one leading dash is just spacing
            span = max(1, seg_w - pad)
            for n in notes:
                n["pos"] = round(max(0.0, (n.pop("col") - pad) / span * bpb), 4)
                n["dur"] = None
        out.append({"len": bpb, "notes": sorted(notes, key=lambda n: (n["pos"], n["s"]))})
    return out


# ============================================================ PDF

def import_pdf(path: Path, bpb: float = 4) -> dict:
    import pdfplumber

    with pdfplumber.open(str(path)) as pdf:
        text = "\n".join((p.extract_text(layout=True) or "") for p in pdf.pages)
        try:
            r = import_ascii(text, bpb)
            if r["note_count"] >= 8:
                r["source"] = "pdf-text"
                return r
        except ImportErrorTH:
            pass
        measures, warnings, ts_found = [], [], None
        for page in pdf.pages:
            ms, ts = _pdf_vector_page(page, bpb)
            measures.extend(ms)
            ts_found = ts_found or ts
        if not measures:
            if not text.strip() and not pdf.pages[0].chars:
                raise ImportErrorTH("PDF นี้เป็นภาพสแกน (ไม่มีข้อความในไฟล์) ยังอ่านไม่ได้ — ลองหา Tab แบบไฟล์ Guitar Pro / MusicXML / "
                                    "ข้อความ หรือ PDF ที่ export จากโปรแกรมแทน")
            raise ImportErrorTH("ไม่พบบรรทัด Tab 6 เส้นใน PDF นี้")
    if ts_found and ts_found != bpb:
        for m in measures:
            for n in m["notes"]:
                n["pos"] = round(n["pos"] / bpb * ts_found, 4)
            m["len"] = ts_found
    warnings.append("จังหวะของโน้ตใน PDF ประมาณจากระยะห่างตัวเลข — ถ้าต้องการจังหวะเป๊ะ ใช้ไฟล์ .gp5 หรือ MusicXML")
    return _result("pdf-vector", measures, warnings=warnings, exact_rhythm=False)


def _segments(page):
    hs, vs = [], []

    def add(x0, y0, x1, y1):
        if abs(y0 - y1) < 0.8 and abs(x1 - x0) > 3:
            hs.append(((y0 + y1) / 2, min(x0, x1), max(x0, x1)))
        elif abs(x0 - x1) < 0.8 and abs(y1 - y0) > 3:
            vs.append(((x0 + x1) / 2, min(y0, y1), max(y0, y1)))

    for l in page.lines:
        add(l["x0"], l["top"], l["x1"], l["bottom"])
    for r in page.rects:
        if r["height"] <= 1.6 and r["width"] > 3:
            hs.append(((r["top"] + r["bottom"]) / 2, r["x0"], r["x1"]))
        elif r["width"] <= 2.5 and r["height"] > 3:
            vs.append(((r["x0"] + r["x1"]) / 2, r["top"], r["bottom"]))
    for c in page.curves:
        pts = c.get("pts") or []
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            add(x0, y0, x1, y1)
    return hs, vs


def _pdf_vector_page(page, bpb):
    hs, vs = _segments(page)
    # merge horizontal segments on the same y into long lines
    rows = {}
    for y, x0, x1 in hs:
        key = round(y * 2) / 2
        r = rows.setdefault(key, [x0, x1, 0.0])
        r[0], r[1] = min(r[0], x0), max(r[1], x1)
        r[2] += x1 - x0
    lines = sorted((y, a, b) for y, (a, b, cov) in rows.items() if b - a > 60 and cov > (b - a) * 0.5)
    # find staffs = 6 equally spaced lines
    staffs, i = [], 0
    while i + 5 < len(lines):
        grp = lines[i:i + 6]
        gaps = [grp[k + 1][0] - grp[k][0] for k in range(5)]
        g = sum(gaps) / 5
        x0, x1 = max(l[1] for l in grp), min(l[2] for l in grp)
        if 3 <= g <= 20 and max(abs(d - g) for d in gaps) < 0.18 * g and x1 - x0 > 60:
            staffs.append({"top": grp[0][0], "bot": grp[5][0], "g": g, "x0": x0, "x1": x1})
            i += 6
        else:
            i += 1
    measures, ts = [], None
    chars = [c for c in page.chars if c["text"].strip()]
    for st in staffs:
        g, top, bot = st["g"], st["top"], st["bot"]
        bars = sorted(x for x, y0, y1 in vs
                      if st["x0"] - 3 <= x <= st["x1"] + 3 and y0 <= top + 0.4 * g and y1 >= bot - 0.4 * g)
        xs = []
        for x in [st["x0"]] + bars + [st["x1"]]:
            if not xs or x - xs[-1] > 4:
                xs.append(x)
            else:
                xs[-1] = max(xs[-1], x)  # double bar -> keep right edge
        digs = [c for c in chars if c["text"].isdigit() and st["x0"] - 2 <= (c["x0"] + c["x1"]) / 2 <= st["x1"] + 2
                and top - 0.6 * g <= (c["top"] + c["bottom"]) / 2 <= bot + 0.6 * g]
        if not digs:
            continue
        med = statistics.median(c["size"] for c in digs)
        big = [c for c in digs if c["size"] > med * 1.45]
        if big and ts is None:  # time signature digits drawn large on the tab staff
            big.sort(key=lambda c: (c["x0"], c["top"]))
            try:
                num, den = int(big[0]["text"]), int(big[1]["text"]) if len(big) > 1 else 4
                if num and den in (2, 4, 8, 16):
                    ts = num * 4 / den
            except ValueError:
                pass
        others = big + [c for c in chars if not c["text"].isdigit() and c["text"] not in "()"]
        digs = [c for c in digs if c["size"] <= med * 1.45]
        # merge multi-digit numbers
        items = []
        for c in sorted(digs, key=lambda c: (round((c["top"] + c["bottom"]) / 2), c["x0"])):
            yc = (c["top"] + c["bottom"]) / 2
            s = int(round((yc - top) / g))
            if not 0 <= s <= 5:
                continue
            if items and items[-1]["s"] == s and 0 <= c["x0"] - items[-1]["x1"] < c["size"] * 0.35:
                items[-1]["t"] += c["text"]
                items[-1]["x1"] = c["x1"]
            else:
                items.append({"s": s, "t": c["text"], "x0": c["x0"], "x1": c["x1"]})
        for a, b in zip(xs, xs[1:]):
            w = b - a
            if w < 12:
                continue
            ns = [it for it in items if a <= (it["x0"] + it["x1"]) / 2 < b]
            notes = []
            if ns:
                # skip clef ("TAB") / time-signature glyphs at the start of a system
                first_x = min(it["x0"] for it in ns)
                obst = [c["x1"] for c in others if a <= c["x0"] and c["x1"] < first_x
                        and top - 0.6 * g <= (c["top"] + c["bottom"]) / 2 <= bot + 0.6 * g]
                if obst:
                    a = max(obst) + 2
                    w = b - a
                centers = [(it["x0"] + it["x1"]) / 2 - a for it in ns]
                first = min(centers)
                pad = first if first <= w * 0.18 else 0
                span = max(1.0, w - pad - w * 0.04)
                for it, cx in zip(ns, centers):
                    f = int(it["t"])
                    if f > 24:
                        continue
                    notes.append({"pos": round(max(0.0, (cx - pad) / span * bpb), 4), "dur": None,
                                  "s": it["s"], "f": f, "p": STANDARD[it["s"]] + f})
            measures.append({"len": bpb, "notes": sorted(notes, key=lambda n: (n["pos"], n["s"]))})
    # drop a leading empty "measure" made by the clef/time-signature area
    return measures, ts


# ============================================================ Guitar Pro 3/4/5

def import_guitarpro(path: Path, track: int | None) -> dict:
    import guitarpro

    try:
        song = guitarpro.parse(str(path))
    except Exception as e:  # noqa: BLE001
        raise ImportErrorTH(f"อ่านไฟล์ Guitar Pro ไม่ได้: {e}")
    names = [t.name for t in song.tracks]
    cands = [i for i, t in enumerate(song.tracks) if not t.isPercussionTrack and len(t.strings) == 6]
    if not cands:
        raise ImportErrorTH("ไม่พบแทร็กกีตาร์ 6 สายในไฟล์นี้")
    if track is None or track not in range(len(song.tracks)):
        track = next((i for i in cands if "guit" in names[i].lower()), cands[0])
    tr = song.tracks[track]
    tuning = [s.value for s in tr.strings][:6]
    Q = 960
    headers, raw = [], []
    for m in tr.measures:
        h = m.header
        ts = h.timeSignature
        length = ts.numerator * 4 / ts.denominator.value
        alt = {k + 1 for k in range(8) if h.repeatAlternative & (1 << k)} if h.repeatAlternative else None
        headers.append({"open": h.isRepeatOpen, "close": (h.repeatClose + 1) if h.repeatClose > 0 else 0, "alt": alt})
        notes = []
        for beat in m.voices[0].beats:
            pos = (beat.start - m.start) / Q
            dur = beat.duration.time / Q
            for n in beat.notes:
                if n.type in (guitarpro.NoteType.tie, guitarpro.NoteType.dead, guitarpro.NoteType.rest):
                    continue
                s = n.string - 1
                if not 0 <= s < 6:
                    continue
                notes.append({"pos": round(pos, 4), "dur": round(dur, 4), "s": s, "f": n.value, "p": tuning[s] + n.value})
        raw.append({"len": length, "notes": sorted(notes, key=lambda n: (n["pos"], n["s"]))})
    measures = [raw[i] for i in unfold(headers)]
    warnings = [] if tuning == STANDARD else ["จูนสายไม่ใช่ standard — ตัวเลขเฟร็ตแสดงตามไฟล์"]
    return _result("guitarpro", measures, title=song.title or None, tempo=float(song.tempo), tuning=tuning,
                   tracks=names, track=track, exact_rhythm=True, warnings=warnings)


# ============================================================ MusicXML

_STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def _load_xml(path: Path) -> ET.Element:
    if path.suffix.lower() == ".mxl":
        with zipfile.ZipFile(path) as z:
            name = None
            try:
                cont = ET.fromstring(z.read("META-INF/container.xml"))
                rf = cont.find(".//{*}rootfile")
                name = rf.get("full-path") if rf is not None else None
            except KeyError:
                pass
            name = name or next(n for n in z.namelist() if n.endswith((".xml", ".musicxml")) and not n.startswith("META"))
            data = z.read(name)
    else:
        data = path.read_bytes()
    root = ET.fromstring(data)
    for el in root.iter():  # strip namespaces
        if "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return root


def import_musicxml(path: Path, track: int | None) -> dict:
    from tabgen import assign_frets

    try:
        root = _load_xml(path)
    except Exception as e:  # noqa: BLE001
        raise ImportErrorTH(f"อ่านไฟล์ MusicXML ไม่ได้: {e}")
    if root.tag == "score-timewise":
        raise ImportErrorTH("MusicXML แบบ timewise ยังไม่รองรับ (ใช้แบบ partwise)")
    parts = root.findall("part")
    names = {sp.get("id"): (sp.findtext("part-name") or sp.get("id")) for sp in root.iter("score-part")}
    if not parts:
        raise ImportErrorTH("ไม่พบ part ในไฟล์ MusicXML")
    has_fret = [p.find(".//technical/fret") is not None for p in parts]
    if track is None or track not in range(len(parts)):
        track = has_fret.index(True) if any(has_fret) else 0
    part = parts[track]
    use_fret = has_fret[track]

    divisions, length, tempo, tuning = 1, 4.0, None, None
    headers, raw = [], []
    for meas in part.findall("measure"):
        h = {"open": False, "close": 0, "alt": None}
        for bl in meas.findall("barline"):
            rep = bl.find("repeat")
            if rep is not None:
                if rep.get("direction") == "forward":
                    h["open"] = True
                else:
                    h["close"] = int(rep.get("times") or 2)
            end = bl.find("ending")
            if end is not None and end.get("type") == "start":
                h["alt"] = {int(x) for x in re.findall(r"\d+", end.get("number", ""))} or None
        attrs = meas.find("attributes")
        if attrs is not None:
            divisions = int(attrs.findtext("divisions") or divisions)
            t = attrs.find("time")
            if t is not None and t.findtext("beats"):
                try:
                    length = int(t.findtext("beats").split("+")[0]) * 4 / int(t.findtext("beat-type"))
                except ValueError:
                    pass
            sd = attrs.find("staff-details")
            if sd is not None and tuning is None:
                tl = {}
                for tu in sd.findall("staff-tuning"):
                    step = tu.findtext("tuning-step")
                    midi = (int(tu.findtext("tuning-octave")) + 1) * 12 + _STEP.get(step, 0) + int(float(tu.findtext("tuning-alter") or 0))
                    tl[int(tu.get("line"))] = midi
                if len(tl) == 6:
                    tuning = [tl[k] for k in sorted(tl, reverse=True)]
        snd = meas.find(".//sound[@tempo]")
        if snd is not None and tempo is None:
            tempo = float(snd.get("tempo"))
        cur, last_on, notes = 0, 0, []
        for el in meas:
            if el.tag == "backup":
                cur -= int(el.findtext("duration") or 0)
            elif el.tag == "forward":
                cur += int(el.findtext("duration") or 0)
            elif el.tag == "note":
                dur = int(el.findtext("duration") or 0)
                is_chord = el.find("chord") is not None
                if el.find("grace") is not None:
                    continue
                on = last_on if is_chord else cur
                if not is_chord:
                    cur += dur
                    last_on = on
                if el.find("rest") is not None:
                    continue
                if any(t.get("type") == "stop" for t in el.findall("tie")) and not any(t.get("type") == "start" for t in el.findall("tie")):
                    continue
                pt = el.find("pitch")
                p = None
                if pt is not None:
                    p = (int(pt.findtext("octave")) + 1) * 12 + _STEP[pt.findtext("step")] + int(float(pt.findtext("alter") or 0))
                fret, string = el.findtext(".//technical/fret"), el.findtext(".//technical/string")
                if use_fret:
                    if fret is None or string is None:
                        continue
                    s, f = int(string) - 1, int(fret)
                    if not 0 <= s < 6:
                        continue
                    notes.append({"pos": round(on / divisions, 4), "dur": round(dur / divisions, 4), "s": s, "f": f, "p": p})
                elif p is not None:
                    notes.append({"pos": round(on / divisions, 4), "dur": round(dur / divisions, 4), "p": p})
        headers.append(h)
        raw.append({"len": length, "notes": notes})

    tuning = tuning or STANDARD
    warnings = []
    if not use_fret:  # standard notation only -> choose strings/frets ourselves
        flat, t = [], 0.0
        for mi, m in enumerate(raw):
            for n in m["notes"]:
                flat.append({"t": t + n["pos"], "d": n["dur"], "p": n["p"], "v": 1.0, "_m": mi, "_pos": n["pos"]})
            t += m["len"]
        placed = assign_frets(flat)
        by_t = {}
        for n in placed:
            by_t.setdefault(round(n["t"], 3), []).append(n)
        t = 0.0
        for m in raw:
            m["notes"] = [{"pos": n["t"] - t, "dur": n["d"], "s": n["s"], "f": n["f"], "p": n["p"]}
                          for k in sorted(by_t) if t <= k < t + m["len"] - 1e-6 for n in by_t[k]]
            t += m["len"]
        warnings.append("ไฟล์นี้ไม่มีข้อมูลสาย/เฟร็ต — โปรแกรมเลือกตำแหน่งบนคอกีตาร์ให้เอง")
    for m in raw:
        for n in m["notes"]:
            if n.get("p") is None:
                n["p"] = tuning[n["s"]] + n["f"]
        m["notes"].sort(key=lambda n: (n["pos"], n["s"]))
    measures = [raw[i] for i in unfold(headers)]
    title = root.findtext("work/work-title") or root.findtext("movement-title")
    return _result("musicxml", measures, title=title, tempo=tempo, tuning=tuning,
                   tracks=[names.get(p.get("id"), p.get("id")) for p in parts], track=track,
                   exact_rhythm=True, warnings=warnings)

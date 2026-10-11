"""Convert transcribed notes (pitch/time) into guitar string + fret positions."""
from __future__ import annotations

# string index 0 = high e ... 5 = low E  (standard tuning)
STANDARD_TUNING = [64, 59, 55, 50, 45, 40]
MAX_FRET = 20
CHORD_WINDOW = 0.035  # seconds — notes starting this close together form a chord


def _candidates(pitch: int, tuning):
    out = []
    for s, open_p in enumerate(tuning):
        f = pitch - open_p
        if 0 <= f <= MAX_FRET:
            out.append((s, f))
    return out


def _fit_pitch(pitch: int, tuning) -> int:
    lo, hi = min(tuning), max(tuning) + MAX_FRET
    while pitch < lo:
        pitch += 12
    while pitch > hi:
        pitch -= 12
    return pitch


def _shape_cost(shape, hand):
    fretted = [f for _, f in shape if f > 0]
    if fretted:
        span = max(fretted) - min(fretted)
        center = sum(fretted) / len(fretted)
    else:
        span, center = 0, hand
    cost = span * 2.0
    if span > 4:
        cost += (span - 4) * 10.0  # physically hard stretch
    cost += abs(center - hand) * 1.0  # hand movement
    cost += center * 0.15  # preference for lower positions / open strings
    return cost, (center if fretted else hand)


def _best_shape(pitches, hand, tuning):
    cands = [_candidates(p, tuning) for p in pitches]
    best = [None, 1e18, hand]
    used = set()
    cur = []

    def rec(i):
        if i == len(pitches):
            c, h = _shape_cost(cur, hand)
            if c < best[1]:
                best[0], best[1], best[2] = list(cur), c, h
            return
        for s, f in cands[i]:
            if s in used:
                continue
            used.add(s)
            cur.append((s, f))
            rec(i + 1)
            cur.pop()
            used.discard(s)

    rec(0)
    return best[0], best[2]


def assign_frets(notes, tuning=None):
    """notes: list of dict(t, d, p, v). Returns new list with s (string 0-5) and f (fret)."""
    tuning = tuning or STANDARD_TUNING
    notes = sorted(notes, key=lambda n: (n["t"], -n["p"]))
    groups, cur = [], []
    for n in notes:
        if cur and n["t"] - cur[0]["t"] > CHORD_WINDOW:
            groups.append(cur)
            cur = []
        cur.append(n)
    if cur:
        groups.append(cur)

    out = []
    hand = 3.0
    for g in groups:
        # dedupe identical pitches, keep loudest, max 6 notes
        by_p = {}
        for n in g:
            p = _fit_pitch(int(n["p"]), tuning)
            if p not in by_p or n["v"] > by_p[p]["v"]:
                by_p[p] = {**n, "p": p}
        chord = sorted(by_p.values(), key=lambda n: -n["v"])[:6]
        chord.sort(key=lambda n: -n["p"])
        shape = None
        while chord:
            shape, new_hand = _best_shape([n["p"] for n in chord], hand, tuning)
            if shape:
                break
            # cannot place all notes on distinct strings -> drop the quietest
            quietest = min(chord, key=lambda n: n["v"])
            chord.remove(quietest)
        if not shape:
            continue
        hand = 0.5 * hand + 0.5 * new_hand  # smooth hand movement
        t0 = g[0]["t"]
        for n, (s, f) in zip(chord, shape):
            out.append({
                "t": round(t0, 4),
                "d": round(n["d"], 4),
                "p": n["p"],
                "v": round(n["v"], 3),
                "s": s,
                "f": f,
            })
    return out

/* Guitar Stem Studio — front-end */
'use strict';

const $ = (s) => document.querySelector(s);
const STEM_INFO = {
  guitar: { th: 'กีตาร์', c: '#f0a830' },
  vocals: { th: 'เสียงร้อง', c: '#e2683c' },
  drums: { th: 'กลอง', c: '#5ca8e2' },
  bass: { th: 'เบส', c: '#9b7be2' },
  piano: { th: 'เปียโน', c: '#5cc28a' },
  other: { th: 'อื่นๆ', c: '#a8a08f' },
};
const STEM_ORDER = ['guitar', 'vocals', 'drums', 'bass', 'piano', 'other'];

const fmt = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const api = async (url, opt) => { const r = await fetch(url, opt); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.statusText); return r.json(); };
const store = { get(k, d) { try { const v = localStorage.getItem('gs:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('gs:' + k, JSON.stringify(v)); } catch {} } };

/* ================================================================ LIBRARY */
let pollTimer = null;

function showLibrary() {
  if (engine) engine.pause();
  $('#playerView').classList.add('hidden');
  $('#libraryView').classList.remove('hidden');
  $('#songTitle').textContent = '';
  history.replaceState(null, '', '/');
  refreshJobs();
}

async function refreshJobs() {
  clearTimeout(pollTimer);
  let jobs = [];
  try { jobs = await api('/api/jobs'); } catch (e) { $('#jobList').innerHTML = `<div class="empty err">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: ${e.message}</div>`; return; }
  const list = $('#jobList');
  if (!jobs.length) list.innerHTML = '<div class="empty">ยังไม่มีเพลง — อัปโหลดไฟล์ด้านบนเพื่อเริ่ม</div>';
  else {
    list.innerHTML = '';
    for (const j of jobs) {
      const el = document.createElement('div');
      el.className = 'job';
      const pct = Math.round((j.progress || 0) * 100);
      let sub;
      if (j.status === 'done') sub = `${fmt(j.duration)} · ~${j.bpm || '?'} BPM`;
      else if (j.status === 'error') sub = `<span class="err">ผิดพลาด: ${escapeHtml(j.error || '')}</span>`;
      else sub = `${escapeHtml(j.stage || '')} · ${pct}%`;
      const src = j.url ? ` · <a class="src" href="${escapeHtml(j.url)}" target="_blank" rel="noopener">▶ YouTube</a>` : '';
      el.innerHTML = `<div class="grow"><div class="name">${escapeHtml(j.name)}</div><div class="sub">${sub}${src}</div>
        ${j.status !== 'done' && j.status !== 'error' ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</div>`;
      if (j.status === 'done' || (j.stems && j.stems.length && j.status !== 'running' && j.status !== 'queued')) {
        const b = document.createElement('button'); b.textContent = 'เปิด'; b.className = 'on';
        b.onclick = () => openJob(j.id); el.appendChild(b);
      }
      const del = document.createElement('button'); del.textContent = 'ลบ';
      del.onclick = async () => { if (confirm(`ลบ "${j.name}" ?`)) { await api(`/api/jobs/${j.id}`, { method: 'DELETE' }); refreshJobs(); } };
      el.appendChild(del);
      list.appendChild(el);
    }
  }
  if (jobs.some((j) => j.status === 'queued' || j.status === 'running')) pollTimer = setTimeout(refreshJobs, 2000);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function uploadFile(file) {
  const st = $('#uploadStatus');
  const fd = new FormData(); fd.append('file', file);
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');
  xhr.upload.onprogress = (e) => { if (e.lengthComputable) st.textContent = `กำลังอัปโหลด ${file.name} … ${Math.round(e.loaded / e.total * 100)}%`; };
  xhr.onload = () => {
    if (xhr.status === 200) { st.textContent = `อัปโหลดแล้ว — กำลังประมวลผล (ครั้งแรกจะดาวน์โหลดโมเดล AI ~80MB)`; refreshJobs(); }
    else st.innerHTML = `<span class="err">อัปโหลดไม่สำเร็จ: ${escapeHtml(xhr.responseText)}</span>`;
  };
  xhr.onerror = () => { st.innerHTML = '<span class="err">อัปโหลดไม่สำเร็จ</span>'; };
  xhr.send(fd);
}

$('#ytForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('#ytUrl').value.trim(); if (!url) return;
  const st = $('#uploadStatus');
  st.textContent = 'กำลังเริ่มดาวน์โหลดจาก YouTube…';
  try {
    await api('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    $('#ytUrl').value = '';
    st.textContent = 'เพิ่มในคิวแล้ว — ดาวน์โหลด → แยกเสียง → ถอด Tab อัตโนมัติ';
    refreshJobs();
  } catch (err) { st.innerHTML = `<span class="err">${escapeHtml(err.message)}</span>`; }
});
$('#fileInput').addEventListener('change', (e) => { if (e.target.files[0]) uploadFile(e.target.files[0]); e.target.value = ''; });
const drop = $('#drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) uploadFile(f); });
$('#homeBtn').onclick = showLibrary;
$('#backBtn').onclick = showLibrary;

/* ================================================================ AUDIO ENGINE */
/* Each stem is an <audio> element (keeps pitch when slowed down: preservesPitch)
   routed through Web Audio for per-stem gain + level meters. */
class Engine {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.tracks = [];
    this.rate = 1;
    this.playing = false;
    this._syncTimer = setInterval(() => this._resync(), 300);
  }
  async load(stems) {
    const ready = [];
    for (const s of stems) {
      const el = new Audio();
      el.preload = 'auto';
      el.src = s.url;
      el.preservesPitch = el.mozPreservesPitch = el.webkitPreservesPitch = true;
      const src = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      const an = this.ctx.createAnalyser(); an.fftSize = 512;
      src.connect(gain); gain.connect(an); gain.connect(this.master);
      const t = { name: s.name, el, gain, an, vol: 1, mute: false, solo: false, buf: new Uint8Array(512) };
      this.tracks.push(t);
      ready.push(new Promise((res) => { el.addEventListener('loadedmetadata', res, { once: true }); el.addEventListener('error', res, { once: true }); }));
      el.addEventListener('ended', () => { if (t === this.leader) { this.pause(); this.seek(0); onEnded(); } });
    }
    await Promise.all(ready);
    this.leader = this.tracks[0];
    this.applyGains();
  }
  get duration() { return this.leader?.el.duration || 0; }
  get time() { return this.leader?.el.currentTime || 0; }
  async play() {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    const t = this.time;
    for (const tr of this.tracks) { tr.el.playbackRate = this.rate; if (tr !== this.leader) tr.el.currentTime = t; }
    await Promise.all(this.tracks.map((tr) => tr.el.play().catch(() => {})));
    this.playing = true;
  }
  pause() { for (const tr of this.tracks) tr.el.pause(); this.playing = false; }
  seek(t) {
    t = Math.max(0, Math.min(t, (this.duration || 0) - 0.05));
    for (const tr of this.tracks) tr.el.currentTime = t;
  }
  setRate(r) { this.rate = r; for (const tr of this.tracks) tr.el.playbackRate = r; }
  setMaster(v) { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
  applyGains() {
    const anySolo = this.tracks.some((t) => t.solo);
    for (const t of this.tracks) {
      const audible = !t.mute && (!anySolo || t.solo);
      t.gain.gain.setTargetAtTime(audible ? t.vol : 0, this.ctx.currentTime, 0.02);
    }
  }
  _resync() {
    if (!this.playing || !this.leader) return;
    const lt = this.leader.el.currentTime;
    for (const tr of this.tracks) {
      if (tr === this.leader) continue;
      if (Math.abs(tr.el.currentTime - lt) > 0.045) tr.el.currentTime = lt + 0.01;
    }
  }
  level(t) {
    t.an.getByteTimeDomainData(t.buf);
    let m = 0; for (let i = 0; i < t.buf.length; i += 4) { const v = Math.abs(t.buf[i] - 128); if (v > m) m = v; }
    return m / 128;
  }
}

/* ================================================================ PLAYER STATE */
let engine = null, job = null, analysis = null, grid = [];
let loop = { a: null, b: null, on: false };
let settings = {};

async function openJob(id) {
  const meta = await api(`/api/jobs/${id}`);
  if (!meta.stems?.length) return alert('ยังประมวลผลไม่เสร็จ');
  job = meta;
  $('#libraryView').classList.add('hidden');
  $('#playerView').classList.remove('hidden');
  $('#songTitle').textContent = meta.name;
  $('#loadingOverlay').classList.remove('hidden');
  history.replaceState(null, '', `/#${id}`);

  if (engine) { engine.pause(); engine.tracks.forEach((t) => { t.el.src = ''; }); clearInterval(engine._syncTimer); engine.ctx.close(); }
  engine = new Engine();
  const stems = meta.stems
    .map((f) => ({ name: f.replace(/\.[^.]+$/, ''), file: f }))
    .sort((a, b) => STEM_ORDER.indexOf(a.name) - STEM_ORDER.indexOf(b.name))
    .map((s) => ({ ...s, url: `/api/jobs/${id}/stem/${encodeURIComponent(s.file)}` }));
  await engine.load(stems);
  stems.forEach((s, i) => { engine.tracks[i].file = s.file; });
  engine.setRate(+$('#rate').value / 100);
  engine.setMaster(+$('#master').value / 100);
  setPlayIcon();

  settings = Object.assign({ dbOffset: 0, bpb: 4, metroBpm: null, metroMode: 'song' }, store.get('job:' + id, {}));
  loop = { a: null, b: null, on: false };
  buildMixer();
  await loadAnalysis();
  buildBacking();
  $('#durTime').textContent = fmt(engine.duration);
  $('#loadingOverlay').classList.add('hidden');
  applySettingsToUI();
  updateLoopUI();
}

function saveSettings() { if (job) store.set('job:' + job.id, settings); }

async function loadAnalysis() {
  try { analysis = await api(`/api/jobs/${job.id}/analysis?ts=${Date.now()}`); }
  catch { analysis = { beats: [], bpm: 120, duration: engine.duration }; }
  if (settings.metroBpm == null) settings.metroBpm = Math.round(analysis.bpm || 120);
  rebuildGrid();
}

/* ================================================================ MIXER */
function buildMixer() {
  const mx = $('#mixer'); mx.innerHTML = '';
  for (const t of engine.tracks) {
    const info = STEM_INFO[t.name] || { th: t.name, c: '#888' };
    const el = document.createElement('div');
    el.className = 'strip'; el.style.setProperty('--c', info.c);
    el.innerHTML = `<div class="top"><span class="nm">${info.th}</span><span class="btns"><button class="m" title="Mute">M</button><button class="s" title="Solo">S</button></span></div>
      <div class="vol"><input type="range" min="0" max="150" value="100"><span>100%</span></div>
      <div class="meter"><i></i></div>
      <a href="/api/jobs/${job.id}/stem/${encodeURIComponent(t.file || t.name)}?download=1">⬇ ดาวน์โหลดแทร็กนี้</a>`;
    const [mB, sB] = el.querySelectorAll('button');
    const range = el.querySelector('input'), lbl = el.querySelector('.vol span');
    range.oninput = () => { t.vol = range.value / 100; lbl.textContent = range.value + '%'; engine.applyGains(); };
    mB.onclick = () => { t.mute = !t.mute; mB.classList.toggle('on', t.mute); engine.applyGains(); };
    sB.onclick = () => { t.solo = !t.solo; sB.classList.toggle('on', t.solo); engine.applyGains(); };
    t.ui = { el, mB, sB, range, lbl, meter: el.querySelector('.meter i') };
    mx.appendChild(el);
  }
}
function preset(fn) {
  for (const t of engine.tracks) { t.solo = false; t.mute = !fn(t.name); t.ui.mB.classList.toggle('on', t.mute); t.ui.sB.classList.remove('on'); }
  engine.applyGains();
}
$('#presetAll').onclick = () => preset(() => true);
$('#presetGuitar').onclick = () => preset((n) => n === 'guitar');
$('#presetBacking').onclick = () => preset((n) => n !== 'guitar');

/* ================================================================ BACKING TRACK EXPORT */
const parseTime = (str) => {
  const p = String(str).trim().split(':').map(Number);
  if (p.some(isNaN)) return null;
  return p.length === 1 ? p[0] : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2];
};
const fmtPrecise = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };

function buildBacking() {
  const box = $('#bkStems'); box.innerHTML = '';
  const saved = settings.bkStems;
  for (const t of engine.tracks) {
    const info = STEM_INFO[t.name] || { th: t.name, c: '#888' };
    const on = saved ? saved.includes(t.name) : t.name !== 'guitar';
    const lab = document.createElement('label');
    lab.className = 'chip-check' + (on ? '' : ' off'); lab.style.setProperty('--c', info.c);
    lab.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''} data-stem="${t.name}"> ${info.th}`;
    lab.querySelector('input').onchange = (e) => {
      lab.classList.toggle('off', !e.target.checked);
      settings.bkStems = [...box.querySelectorAll('input:checked')].map((i) => i.dataset.stem); saveSettings();
    };
    box.appendChild(lab);
  }
  setBkRange(0, engine.duration);
  $('#bkResult').classList.add('hidden'); $('#bkStatus').textContent = '';
}
function setBkRange(a, b) { $('#bkStart').value = fmtPrecise(a); $('#bkEnd').value = fmtPrecise(b); }
$('#bkToggle').onclick = () => {
  const hid = $('#bkBody').classList.toggle('hidden');
  $('#bkToggle').textContent = hid ? 'แสดง' : 'ซ่อน';
  if (!hid) { $('#bkRate').value = $('#rate').value; $('#bkRateVal').textContent = $('#rate').value + '%'; if (loop.a != null && loop.b != null) setBkRange(loop.a, loop.b); }
};
$('#bkAll').onclick = () => setBkRange(0, engine.duration);
$('#bkAB').onclick = () => { if (loop.a == null || loop.b == null) return alert('ยังไม่ได้ตั้งช่วง A–B'); setBkRange(loop.a, loop.b); };
$('#bkNowS').onclick = () => { $('#bkStart').value = fmtPrecise(engine.time); };
$('#bkNowE').onclick = () => { $('#bkEnd').value = fmtPrecise(engine.time); };
$('#bkRate').oninput = () => { $('#bkRateVal').textContent = $('#bkRate').value + '%'; };
$('#bkClick').oninput = () => { $('#bkClickVal').textContent = $('#bkClick').value + '%'; };

$('#bkGo').onclick = async () => {
  const st = $('#bkStatus');
  let a = parseTime($('#bkStart').value), b = parseTime($('#bkEnd').value);
  const dur = engine.duration;
  if (a == null || b == null) { st.textContent = 'รูปแบบเวลาไม่ถูก ใช้ นาที:วินาที เช่น 1:23.5'; return; }
  a = Math.max(0, Math.min(a, dur)); b = Math.max(0, Math.min(b || dur, dur));
  if ($('#bkSnap').checked && grid.length) {
    const bpb = settings.bpb;
    const sa = timeAtBeat(Math.round(beatAt(a) / bpb) * bpb), sb = timeAtBeat(Math.round(beatAt(b) / bpb) * bpb);
    if (sb - sa > 0.5) { a = Math.max(0, sa); b = Math.min(dur, sb); }
  }
  if (b - a < 0.5) { st.textContent = 'ช่วงเวลาสั้นเกินไป'; return; }
  setBkRange(a, b);
  const chosen = [...$('#bkStems').querySelectorAll('input:checked')].map((i) => i.dataset.stem);
  if (!chosen.length) { st.textContent = 'เลือกอย่างน้อย 1 แทร็ก'; return; }
  const stems = {};
  for (const t of engine.tracks) if (chosen.includes(t.name)) stems[t.file] = t.vol;
  // beat times inside the range (for count-in tempo + metronome clicks)
  const i0 = Math.max(0, Math.floor(beatAt(a)) - 2), i1 = Math.min(grid.length - 1, Math.ceil(beatAt(b)) + 2);
  const beats = grid.slice(i0, i1 + 1);
  const bpb = settings.bpb;
  const body = {
    stems, start: a, end: b, rate: $('#bkRate').value / 100, count_in_bars: +$('#bkCount').value,
    metronome: $('#bkMetro').checked, click_gain: $('#bkClick').value / 100,
    beats, bpb, first_downbeat_index: (((-i0) % bpb) + bpb) % bpb, fmt: $('#bkFmt').value,
  };
  $('#bkGo').disabled = true; st.textContent = 'กำลังสร้าง… (เพลงยาว/ช้ามากอาจใช้เวลาสักครู่)';
  try {
    const r = await api(`/api/jobs/${job.id}/backing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const url = `/api/jobs/${job.id}/backing/${r.file}`;
    $('#bkAudio').src = url;
    $('#bkDl').href = `${url}?name=${encodeURIComponent(r.name)}`;
    $('#bkDl').setAttribute('download', r.name);
    $('#bkResult').classList.remove('hidden');
    st.textContent = `เสร็จแล้ว: ${r.name}`;
  } catch (e) { st.innerHTML = `<span class="err">สร้างไม่สำเร็จ: ${escapeHtml(e.message)}</span>`; }
  finally { $('#bkGo').disabled = false; }
};

/* ================================================================ TRANSPORT */
let countInTimer = null;
async function togglePlay() {
  if (!engine) return;
  if (engine.playing || countInTimer) { clearTimeout(countInTimer); countInTimer = null; engine.pause(); metroReset(); setPlayIcon(); return; }
  if (engine.ctx.state !== 'running') await engine.ctx.resume();
  if ($('#countIn').checked) {
    const beatDur = beatDurationAt(engine.time) / engine.rate;
    const n = settings.bpb, t0 = engine.ctx.currentTime + 0.1;
    for (let i = 0; i < n; i++) { click(t0 + i * beatDur, i === 0); flashDot(i, (t0 + i * beatDur - engine.ctx.currentTime) * 1000); }
    $('#playBtn').textContent = '…';
    countInTimer = setTimeout(async () => { countInTimer = null; await engine.play(); setPlayIcon(); }, (0.1 + n * beatDur) * 1000 - 15);
    return;
  }
  await engine.play();
  setPlayIcon();
}
function setPlayIcon() { $('#playBtn').textContent = engine?.playing ? '❚❚' : '▶'; }
function onEnded() { setPlayIcon(); metroReset(); }
function seekTo(t) { engine.seek(t); metroReset(); }

$('#playBtn').onclick = togglePlay;
$('#rewBtn').onclick = () => seekTo(engine.time - 5);
$('#fwdBtn').onclick = () => seekTo(engine.time + 5);
let seeking = false;
$('#seek').addEventListener('input', () => { seeking = true; $('#curTime').textContent = fmt($('#seek').value / 1000 * engine.duration); });
$('#seek').addEventListener('change', () => { seeking = false; seekTo($('#seek').value / 1000 * engine.duration); });

function setRate(pct) {
  pct = Math.max(25, Math.min(150, pct));
  $('#rate').value = pct; $('#rateVal').textContent = pct + '%';
  engine?.setRate(pct / 100); metroReset();
}
$('#rate').oninput = () => setRate(+$('#rate').value);
document.querySelectorAll('[data-rate]').forEach((b) => (b.onclick = () => setRate(+b.dataset.rate)));
$('#master').oninput = () => { $('#masterVal').textContent = $('#master').value + '%'; engine?.setMaster($('#master').value / 100); };

/* ---- A-B loop */
function updateLoopUI() {
  const r = $('#loopRegion');
  const { a, b, on } = loop;
  $('#loopToggle').textContent = 'วน: ' + (on ? 'เปิด' : 'ปิด');
  $('#loopToggle').classList.toggle('on', on);
  $('#loopVal').textContent = a != null && b != null ? `${fmt(a)} – ${fmt(b)}${on ? '' : ' (ปิด)'}` : a != null ? `A ${fmt(a)}` : 'ปิด';
  if (a != null && b != null && engine?.duration) {
    r.classList.remove('hidden');
    r.style.left = (a / engine.duration * 100) + '%';
    r.style.width = ((b - a) / engine.duration * 100) + '%';
  } else r.classList.add('hidden');
}
function setA() { loop.a = engine.time; if (loop.b != null && loop.b <= loop.a) loop.b = null; updateLoopUI(); }
function setB() { if (loop.a == null) loop.a = 0; const t = engine.time; if (t > loop.a + 0.2) { loop.b = t; loop.on = true; } updateLoopUI(); }
$('#setA').onclick = setA;
$('#setB').onclick = setB;
$('#loopToggle').onclick = () => { if (loop.a != null && loop.b != null) loop.on = !loop.on; updateLoopUI(); };
$('#loopClear').onclick = () => { loop = { a: null, b: null, on: false }; updateLoopUI(); };

/* ================================================================ BEAT GRID */
// Extends detected beats over the whole song; index 0 is guaranteed to be a downbeat.
function rebuildGrid() {
  const dur = Math.max(analysis.duration || 0, engine.duration || 0, 1);
  let b;
  if (settings.metroMode === 'manual' || (analysis.beats || []).length < 4) {
    const iv = 60 / (settings.metroBpm || analysis.bpm || 120);
    b = []; for (let t = 0; t < dur + iv * 8; t += iv) b.push(t);

  } else {
    b = analysis.beats.slice();
    const iv0 = b[1] - b[0];
    let pre = 0;
    while (b[0] > 1e-3) { b.unshift(b[0] - iv0); pre++; }
    // make sure the chosen first downbeat lands on a multiple of beats-per-bar
    const bpb = settings.bpb;
    let first = pre + (+settings.dbOffset || 0);
    while (((first % bpb) + bpb) % bpb !== 0) { b.unshift(b[0] - iv0); first++; }
    const ivN = b[b.length - 1] - b[b.length - 2];
    while (b[b.length - 1] < dur + ivN * 8) b.push(b[b.length - 1] + ivN);
  }
  grid = b;
}
function beatAt(t) { // fractional beat index for time t
  const g = grid; if (!g.length) return 0;
  let lo = 0, hi = g.length - 1;
  if (t <= g[0]) return (t - g[0]) / (g[1] - g[0]);
  if (t >= g[hi]) return hi + (t - g[hi]) / (g[hi] - g[hi - 1]);
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g[m] <= t) lo = m; else hi = m; }
  return lo + (t - g[lo]) / (g[lo + 1] - g[lo]);
}
function timeAtBeat(x) {
  const g = grid; const i = Math.max(0, Math.min(g.length - 2, Math.floor(x)));
  return g[i] + (x - i) * (g[i + 1] - g[i]);
}
function beatDurationAt(t) { const i = Math.max(0, Math.min(grid.length - 2, Math.floor(beatAt(t)))); return grid[i + 1] - grid[i] || 0.5; }

/* ================================================================ METRONOME */
const metro = { on: false, vol: 0.8, next: null };
function click(when, accent) {
  const ctx = engine.ctx;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.value = accent ? 1760 : 1175;
  const v = metro.vol * (accent ? 0.5 : 0.32);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  o.connect(g); g.connect(ctx.destination);
  o.start(when); o.stop(when + 0.06);
}
function metroReset() { metro.next = null; }
function metroTick() {
  if (!engine || !engine.playing || !metro.on || !grid.length) { metro.next = null; return; }
  const now = engine.ctx.currentTime, songT = engine.time, rate = engine.rate;
  if (metro.next == null) metro.next = Math.ceil(beatAt(songT + 0.02));
  for (let guard = 0; guard < 16; guard++) {
    const bt = timeAtBeat(metro.next);
    if (loop.on && loop.b != null && bt >= loop.b) break;
    const when = now + (bt - songT) / rate;
    if (when > now + 0.15) break;
    if (when >= now - 0.01) {
      const beatInBar = ((metro.next % settings.bpb) + settings.bpb) % settings.bpb;
      click(when, beatInBar === 0);
      flashDot(beatInBar, (when - now) * 1000);
    }
    metro.next++;
  }
}
setInterval(metroTick, 25);

function buildDots() {
  const d = $('#beatDots'); d.innerHTML = '';
  for (let i = 0; i < settings.bpb; i++) d.appendChild(Object.assign(document.createElement('i'), { className: i === 0 ? 'first' : '' }));
}
function flashDot(i, delayMs) {
  setTimeout(() => {
    const dots = $('#beatDots').children; const d = dots[i]; if (!d) return;
    d.classList.add('hit'); setTimeout(() => d.classList.remove('hit'), 110);
  }, Math.max(0, delayMs));
}
function setMetro(on) { metro.on = on; $('#metroToggle').textContent = on ? 'เปิด' : 'ปิด'; $('#metroToggle').classList.toggle('on', on); metroReset(); }
$('#metroToggle').onclick = () => setMetro(!metro.on);
$('#metroVol').oninput = () => { metro.vol = $('#metroVol').value / 100; $('#metroVolVal').textContent = $('#metroVol').value + '%'; };
$('#metroMode').onchange = () => { settings.metroMode = $('#metroMode').value; $('#metroBpm').disabled = settings.metroMode !== 'manual'; saveSettings(); rebuildGrid(); metroReset(); };
$('#metroBpm').onchange = () => { settings.metroBpm = +$('#metroBpm').value || 120; saveSettings(); if (settings.metroMode === 'manual') rebuildGrid(); metroReset(); };
$('#beatsPerBar').onchange = () => { settings.bpb = +$('#beatsPerBar').value; saveSettings(); buildDots(); rebuildGrid(); };

/* ---- settings UI */
function applySettingsToUI() {
  $('#dbOffset').value = settings.dbOffset;
  $('#beatsPerBar').value = settings.bpb;
  $('#metroMode').value = settings.metroMode; $('#metroBpm').value = settings.metroBpm; $('#metroBpm').disabled = settings.metroMode !== 'manual';
  buildDots();
}
$('#dbOffset').onchange = () => { settings.dbOffset = +$('#dbOffset').value; saveSettings(); rebuildGrid(); metroReset(); };

/* ================================================================ UI LOOP */
function frame() {
  if (engine && !$('#playerView').classList.contains('hidden')) {
    const t = engine.time;
    if (loop.on && loop.a != null && loop.b != null && engine.playing && t >= loop.b) seekTo(loop.a);
    if (!seeking) {
      $('#curTime').textContent = fmt(t);
      if (engine.duration) $('#seek').value = Math.round(t / engine.duration * 1000);
    }
    if (grid.length) {
      const bf = beatAt(t);
      const bar = Math.floor(bf / settings.bpb) + 1, beat = ((Math.floor(bf) % settings.bpb) + settings.bpb) % settings.bpb + 1;
      $('#posInfo').textContent = `ห้อง ${bar} · จังหวะ ${beat}`;
    }
    for (const tr of engine.tracks) if (tr.ui) tr.ui.meter.style.width = engine.playing ? Math.min(100, engine.level(tr) * 140) + '%' : '0%';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* keyboard shortcuts */
document.addEventListener('keydown', (e) => {
  if (!engine || $('#playerView').classList.contains('hidden')) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  const k = e.key;
  if (k === ' ') { e.preventDefault(); togglePlay(); }
  else if (k === 'ArrowLeft') { e.preventDefault(); seekTo(engine.time - 5); }
  else if (k === 'ArrowRight') { e.preventDefault(); seekTo(engine.time + 5); }
  else if (k === '[') setA();
  else if (k === ']') setB();
  else if (k === 'l' || k === 'L') $('#loopToggle').click();
  else if (k === 'm' || k === 'M') setMetro(!metro.on);
  else if (k === '-') setRate(+$('#rate').value - 5);
  else if (k === '+' || k === '=') setRate(+$('#rate').value + 5);
});

/* boot */
if (location.hash.length > 1) openJob(location.hash.slice(1)).catch(() => showLibrary());
else refreshJobs();

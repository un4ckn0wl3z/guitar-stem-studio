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
const STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SUB = 4; // 16th-note grid

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
      if (j.status === 'done') sub = `${fmt(j.duration)} · ~${j.bpm || '?'} BPM · ${j.note_count ?? 0} โน้ต`;
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
let engine = null, job = null, analysis = null, grid = [], gridDownbeatIdx = 0, gridOrigin = 0;
let imported = null; // imported tab (PDF / GP / MusicXML / text)
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

  settings = Object.assign({ sens: 0.3, dbOffset: 0, sync: 0, bpb: 4, metroBpm: null, metroMode: 'song', tabSrc: null, tabShift: null }, store.get('job:' + id, {}));
  imported = null;
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
  catch { analysis = { beats: [], notes: [], bpm: 120, duration: engine.duration }; }
  if (settings.metroBpm == null) settings.metroBpm = Math.round(analysis.bpm || 120);
  const sel = $('#retrStem'); sel.innerHTML = '';
  for (const t of engine.tracks) { const o = document.createElement('option'); o.value = t.name; o.textContent = STEM_INFO[t.name]?.th || t.name; sel.appendChild(o); }
  const o = document.createElement('option'); o.value = 'original'; o.textContent = 'เพลงต้นฉบับ (ทั้งหมด)'; sel.appendChild(o);
  sel.value = analysis.notes_stem || 'guitar';
  await loadImported();
  rebuildGrid();
  if (settings.tabSrc === 'import' && imported && settings.tabShift == null) autoAlign();
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
  drawLoopOnTab();
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
    gridDownbeatIdx = 0; gridOrigin = 0;
  } else {
    b = analysis.beats.slice();
    const iv0 = b[1] - b[0];
    let pre = 0;
    while (b[0] > 1e-3) { b.unshift(b[0] - iv0); pre++; }
    // make sure the chosen first downbeat lands on a multiple of beats-per-bar
    const bpb = settings.bpb;
    const d0 = useImport() ? (settings.tabShift || 0) : (+settings.dbOffset || 0);
    let first = pre + d0;
    while (((first % bpb) + bpb) % bpb !== 0) { b.unshift(b[0] - iv0); first++; pre++; }
    gridOrigin = pre;
    const ivN = b[b.length - 1] - b[b.length - 2];
    while (b[b.length - 1] < dur + ivN * 8) b.push(b[b.length - 1] + ivN);
  }
  grid = b;
  layoutTab();
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

/* ================================================================ TAB */
let tabRows = [];      // [{svg, m0, m1, y}]
let tabNotes = [];     // quantized notes [{t,d,s,f,p,v,beat,slot,measure, el}]
let measureW = 0, slotW = 0;
const ROW = { top: 18, gap: 13, pad: 10, left: 22 };
const rowHeight = () => ROW.top + ROW.gap * 5 + ROW.pad + 8;

const useImport = () => settings.tabSrc === 'import' && !!imported;

function placeNote(n, beat, out) {
  const slotG = Math.round(beat * SUB), spm = SUB * settings.bpb;
  const key = slotG + ':' + n.s;
  const prev = out.get(key);
  if (prev && prev.v >= n.v) return;
  out.set(key, { ...n, slotG, measure: Math.floor(slotG / spm), slot: ((slotG % spm) + spm) % spm });
}

// imported tab: measure-based positions -> song beats -> seconds (follows the real beat grid)
function importedNotes(shift = settings.tabShift || 0) {
  const out = new Map();
  const base = gridOrigin + shift;
  let cum = 0;
  const flat = [];
  for (const m of imported.measures) {
    for (const n of m.notes) flat.push({ n, beat: base + cum + n.pos });
    cum += m.len;
  }
  flat.sort((a, b) => a.beat - b.beat);
  for (let i = 0; i < flat.length; i++) {
    const { n, beat } = flat[i];
    let durB = n.dur;
    if (!durB) { // no rhythm info: ring until the next onset (max 2 beats)
      let j = i + 1; while (j < flat.length && flat[j].beat - beat < 0.05) j++;
      durB = Math.min(2, j < flat.length ? flat[j].beat - beat : 1);
    }
    const t = timeAtBeat(beat);
    placeNote({ t, d: Math.max(0.05, timeAtBeat(beat + durB) - t), p: n.p, s: n.s, f: n.f, v: 1 }, beat, out);
  }
  return [...out.values()].sort((a, b) => a.slotG - b.slotG || a.s - b.s);
}

function quantizedNotes() {
  if (useImport()) return importedNotes();
  const thr = settings.sens;
  const out = new Map();
  for (const n of analysis.notes || []) {
    if (n.v < thr) continue;
    const bf = beatAt(n.t);
    let slotG = Math.round(bf * SUB);
    const key = slotG + ':' + n.s;
    const prev = out.get(key);
    if (prev && prev.v >= n.v) continue;
    out.set(key, { ...n, slotG, measure: Math.floor(slotG / (SUB * settings.bpb)), slot: ((slotG % (SUB * settings.bpb)) + SUB * settings.bpb) % (SUB * settings.bpb) });
  }
  return [...out.values()].sort((a, b) => a.slotG - b.slotG || a.s - b.s);
}

function layoutTab() {
  const view = $('#tabView');
  view.innerHTML = '';
  tabRows = [];
  if (!analysis) return;
  tabNotes = quantizedNotes();
  const spm = SUB * settings.bpb;
  const totalBeats = beatAt(engine.duration || analysis.duration);
  const nMeasures = Math.max(1, Math.ceil(totalBeats / settings.bpb));
  const W = Math.max(280, $('#tabScroll').clientWidth - 24);
  const avail = W - ROW.left;
  const perRow = Math.max(1, Math.floor(avail / (spm * 20)));
  measureW = avail / perRow; slotW = measureW / spm;
  const H = rowHeight();
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
  const byMeasure = new Map();
  for (const n of tabNotes) { if (!byMeasure.has(n.measure)) byMeasure.set(n.measure, []); byMeasure.get(n.measure).push(n); }

  const frag = document.createDocumentFragment();
  for (let m0 = 0; m0 < nMeasures; m0 += perRow) {
    const m1 = Math.min(nMeasures, m0 + perRow);
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, height: H, 'data-m0': m0 });
    const loopG = mk('g', {}, svg);
    for (let s = 0; s < 6; s++) {
      const y = ROW.top + s * ROW.gap;
      mk('line', { x1: ROW.left, x2: ROW.left + (m1 - m0) * measureW, y1: y, y2: y, class: 'str' }, svg);
      { const t = mk('text', { x: 9, y, class: 'tuning' }, svg); t.textContent = STRING_NAMES[s]; }
    }
    for (let m = m0; m <= m1; m++) {
      const x = ROW.left + (m - m0) * measureW;
      mk('line', { x1: x, x2: x, y1: ROW.top, y2: ROW.top + ROW.gap * 5, class: 'barl' }, svg);
      if (m < m1) {
        const t = mk('text', { x: x + 3, y: ROW.top - 7, class: 'mnum' }, svg); t.textContent = m + 1;
        for (let b = 1; b < settings.bpb; b++) { const bx = x + b * SUB * slotW; mk('line', { x1: bx, x2: bx, y1: ROW.top + ROW.gap * 5 + 3, y2: ROW.top + ROW.gap * 5 + 7, class: 'beat' }, svg); }
      }
    }
    for (let m = m0; m < m1; m++) {
      for (const n of byMeasure.get(m) || []) {
        const x = ROW.left + (m - m0) * measureW + (n.slot + 0.5) * slotW;
        const y = ROW.top + n.s * ROW.gap;
        const g = mk('g', { class: 'note' }, svg);
        const label = String(n.f);
        const w = label.length > 1 ? 15 : 9;
        mk('rect', { x: x - w / 2, y: y - 6, width: w, height: 12, rx: 2, class: 'nb' }, g);
        const tx = mk('text', { x, y, class: 'n' }, g); tx.textContent = label;
        const tt = mk('title', {}, g); tt.textContent = `${NOTE_NAMES[n.p % 12]}${Math.floor(n.p / 12) - 1} · สาย ${n.s + 1} เฟร็ต ${n.f} · ${fmt(n.t)}`;
        n.el = g;
      }
    }
    svg.addEventListener('click', (e) => onTabClick(e, svg, m0));
    frag.appendChild(svg);
    tabRows.push({ svg, m0, m1, loopG });
  }
  view.appendChild(frag);
  const nc = (analysis.notes || []).length;
  if (useImport()) { $('#tabInfo').textContent = `· Tab นำเข้า · ${tabNotes.length} โน้ต · ${imported.measures.length} ห้อง`; updateAlignUI(); }
  else $('#tabInfo').textContent = `· ${tabNotes.length}/${nc} โน้ต · แทร็ก: ${STEM_INFO[analysis.notes_stem]?.th || (analysis.notes_stem === 'original' ? 'ต้นฉบับ' : analysis.notes_stem) || '-'} · ~${analysis.bpm} BPM`;
  activeNotes.clear();
  drawLoopOnTab();
}

function onTabClick(e, svg, m0) {
  const r = svg.getBoundingClientRect();
  const W = svg.viewBox.baseVal.width;
  const x = (e.clientX - r.left) * (W / r.width) - ROW.left;
  if (x < 0) return;
  const m = m0 + Math.floor(x / measureW);
  const slot = (x - (m - m0) * measureW) / slotW;
  const beatF = m * settings.bpb + Math.floor(slot / SUB);
  if (e.shiftKey) { // select loop by measures
    const ms = timeAtBeat(m * settings.bpb), me = timeAtBeat((m + 1) * settings.bpb);
    if (loop.a == null || loop.b != null) { loop = { a: ms, b: null, on: false }; }
    else { const a = Math.min(loop.a, ms), b = Math.max(loop.a + 0.01, me); loop = { a, b, on: true }; }
    updateLoopUI(); return;
  }
  seekTo(Math.max(0, timeAtBeat(beatF)));
}

function drawLoopOnTab() {
  for (const r of tabRows) {
    r.loopG.innerHTML = '';
    if (loop.a == null || loop.b == null) continue;
    const ba = beatAt(loop.a) / settings.bpb, bb = beatAt(loop.b) / settings.bpb;
    const s = Math.max(ba, r.m0), e = Math.min(bb, r.m1);
    if (e <= s) continue;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', ROW.left + (s - r.m0) * measureW); rect.setAttribute('width', (e - s) * measureW);
    rect.setAttribute('y', ROW.top - 4); rect.setAttribute('height', ROW.gap * 5 + 8); rect.setAttribute('class', 'loopbg');
    r.loopG.appendChild(rect);
  }
}

/* ---- live cursor + note highlight */
const activeNotes = new Set();
let lastRow = -1;
function updateTabCursor(t) {
  const cur = $('#cursor');
  if (!tabRows.length) { cur.style.display = 'none'; return; }
  const bf = beatAt(t);
  const mF = bf / settings.bpb;
  const ri = tabRows.findIndex((r) => mF >= r.m0 && mF < r.m1);
  if (ri < 0) { cur.style.display = 'none'; return; }
  const row = tabRows[ri];
  const scale = row.svg.getBoundingClientRect().width / row.svg.viewBox.baseVal.width;
  const x = (ROW.left + (mF - row.m0) * measureW) * scale;
  cur.style.display = 'block';
  // SVG elements have no offsetTop/Left -> measure relative to the scroll container
  const sc = $('#tabScroll'), scR = sc.getBoundingClientRect(), svR = row.svg.getBoundingClientRect();
  const rowTop = svR.top - scR.top + sc.scrollTop, rowLeft = svR.left - scR.left + sc.scrollLeft;
  cur.style.left = (rowLeft + x) + 'px';
  cur.style.top = (rowTop + (ROW.top - 6) * scale) + 'px';
  cur.style.height = ((ROW.gap * 5 + 12) * scale) + 'px';
  if (ri !== lastRow) {
    lastRow = ri;
    if ($('#autoScroll').checked && engine.playing) {
      const target = rowTop - sc.clientHeight / 3;
      sc.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }
  // highlight notes that are sounding (min 120 ms so short notes still flash)
  const slotNow = bf * SUB;
  for (const n of activeNotes) { if (!(n.t <= t && t < n.t + Math.max(n.d, 0.12))) { n.el?.classList.remove('hi'); activeNotes.delete(n); } }
  // notes are sorted by slot: search around the current slot
  let lo = 0, hi = tabNotes.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (tabNotes[m].slotG < slotNow - 64) lo = m + 1; else hi = m; }
  for (let i = lo; i < tabNotes.length && tabNotes[i].slotG <= slotNow + 1; i++) {
    const n = tabNotes[i];
    if (n.t <= t && t < n.t + Math.max(n.d, 0.12) && !activeNotes.has(n)) { n.el?.classList.add('hi'); activeNotes.add(n); }
  }
}

/* ---- settings UI */
function applySettingsToUI() {
  $('#sens').value = settings.sens; $('#sensVal').textContent = (+settings.sens).toFixed(2);
  $('#dbOffset').value = settings.dbOffset;
  $('#syncOff').value = settings.sync; $('#syncVal').textContent = settings.sync;
  $('#beatsPerBar').value = settings.bpb;
  $('#metroMode').value = settings.metroMode; $('#metroBpm').value = settings.metroBpm; $('#metroBpm').disabled = settings.metroMode !== 'manual';
  buildDots();
}
let sensTimer;
$('#sens').oninput = () => { settings.sens = +$('#sens').value; $('#sensVal').textContent = settings.sens.toFixed(2); clearTimeout(sensTimer); sensTimer = setTimeout(() => { saveSettings(); layoutTab(); }, 150); };
$('#dbOffset').onchange = () => { settings.dbOffset = +$('#dbOffset').value; saveSettings(); rebuildGrid(); };
$('#syncOff').oninput = () => { settings.sync = +$('#syncOff').value; $('#syncVal').textContent = settings.sync; saveSettings(); };
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (analysis && !$('#playerView').classList.contains('hidden')) layoutTab(); }, 200); });

/* ---- re-transcribe */
$('#retrBtn').onclick = async () => {
  const stem = $('#retrStem').value, onset = +$('#retrOnset').value;
  $('#tabStatus').textContent = 'กำลังถอดโน้ตใหม่…';
  try { await api(`/api/jobs/${job.id}/transcribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stem, onset }) }); }
  catch (e) { $('#tabStatus').textContent = 'ผิดพลาด: ' + e.message; return; }
  const id = job.id;
  const poll = async () => {
    const m = await api(`/api/jobs/${id}`);
    if (job?.id !== id) return;
    if (m.status === 'done') { $('#tabStatus').textContent = 'ถอดโน้ตเสร็จแล้ว'; await loadAnalysis(); setTimeout(() => ($('#tabStatus').textContent = ''), 3000); }
    else if (m.status === 'error') $('#tabStatus').textContent = 'ผิดพลาด: ' + m.error;
    else { $('#tabStatus').textContent = `${m.stage} ${Math.round(m.progress * 100)}%`; setTimeout(poll, 1500); }
  };
  poll();
};

/* ================================================================ TAB IMPORT */
const SRC_LABEL = { 'pdf-text': 'PDF (ข้อความ)', 'pdf-vector': 'PDF', ascii: 'ข้อความ', guitarpro: 'Guitar Pro', musicxml: 'MusicXML' };

async function loadImported() {
  try { imported = await api(`/api/jobs/${job.id}/tab-import?ts=${Date.now()}`); } catch { imported = null; }
  if (settings.tabSrc == null) settings.tabSrc = imported ? 'import' : 'ai';
  if (!imported && settings.tabSrc === 'import') settings.tabSrc = 'ai';
  renderImportPanel();
}

function renderImportPanel() {
  const imp = useImport();
  document.body.classList.toggle('src-import', imp);
  $('#srcAi').classList.toggle('on', !imp);
  $('#srcImp').classList.toggle('on', imp);
  $('#srcImp').disabled = !imported;
  $('#impPanel').classList.toggle('hidden', !imp);
  if (!imported) return;
  const exact = imported.exact_rhythm ? 'จังหวะตามไฟล์' : 'จังหวะโดยประมาณ';
  $('#impInfo').innerHTML = `<b>${escapeHtml(imported.title || imported.file || 'Tab')}</b> · ${SRC_LABEL[imported.source] || imported.source} · ${imported.measures.length} ห้อง · ${imported.note_count} โน้ต · ${exact}`;
  const tw = $('#trackWrap'), ts = $('#impTrack');
  tw.classList.toggle('hidden', (imported.tracks || []).length < 2);
  ts.innerHTML = (imported.tracks || []).map((n, i) => `<option value="${i}">${i + 1}. ${escapeHtml(n || 'Track')}</option>`).join('');
  ts.value = imported.track ?? 0;
  $('#impWarn').textContent = (imported.warnings || []).join(' · ');
  updateAlignUI();
}

function updateAlignUI() {
  if (!imported) return;
  const b = gridOrigin + (settings.tabShift || 0);
  const bar = Math.floor(b / settings.bpb) + 1, beat = ((b % settings.bpb) + settings.bpb) % settings.bpb + 1;
  $('#alignVal').textContent = `ห้อง ${bar} จังหวะ ${beat} (${fmt(Math.max(0, timeAtBeat(b)))})`;
}

function setTabSrc(src) {
  if (src === 'import' && !imported) return;
  settings.tabSrc = src; saveSettings();
  renderImportPanel();
  if (src === 'import') {
    const tabBpb = Math.round(imported.measures[0]?.len || 4);
    if (tabBpb >= 2 && tabBpb <= 7 && tabBpb !== settings.bpb) { settings.bpb = tabBpb; $('#beatsPerBar').value = tabBpb; buildDots(); }
    if (settings.tabShift == null) { rebuildGrid(); autoAlign(); return; }
  }
  rebuildGrid();
}
$('#srcAi').onclick = () => setTabSrc('ai');
$('#srcImp').onclick = () => setTabSrc('import');

/* Auto-sync: slide the imported tab over the AI transcription of the audio and pick the
   offset (in beats) where the most notes agree (same 16th slot ±1, same pitch class). */
function autoAlign() {
  if (!imported) return;
  const ai = (analysis.notes || []).filter((n) => n.v >= 0.3);
  const keys = new Set();
  for (const n of ai) { const sl = Math.round(beatAt(n.t) * SUB); const pc = n.p % 12; keys.add((sl - 1) * 12 + pc); keys.add(sl * 12 + pc); keys.add((sl + 1) * 12 + pc); }
  let cum = 0; const tn = [];
  for (const m of imported.measures) { for (const n of m.notes) tn.push({ b: cum + n.pos, pc: n.p % 12 }); cum += m.len; }
  if (!tn.length) return;
  const sample = tn.length > 1500 ? tn.filter((_, i) => i % Math.ceil(tn.length / 1500) === 0) : tn;
  const totalBeats = Math.ceil(beatAt(engine.duration || analysis.duration));
  let best = null, bestScore = -1;
  if (ai.length > 10) {
    for (let sh = -gridOrigin - Math.ceil(tn[0].b); sh <= totalBeats - gridOrigin; sh++) {
      let sc = 0;
      for (const n of sample) { const sl = Math.round((gridOrigin + sh + n.b) * SUB); if (keys.has(sl * 12 + n.pc)) sc++; }
      if (sc > bestScore) { bestScore = sc; best = sh; }
    }
  }
  if (best == null || bestScore < sample.length * 0.08) {
    // fallback: first tab note lands on the first confidently-detected note
    const firstAi = ai.length ? Math.round(beatAt(ai[0].t)) : gridOrigin;
    best = firstAi - gridOrigin - Math.floor(tn[0].b);
    $('#tabStatus').textContent = 'ซิงก์อัตโนมัติไม่มั่นใจ — ปรับจุดเริ่มด้วยปุ่ม ±ห้อง/จังหวะ ได้';
  } else {
    $('#tabStatus').textContent = `ซิงก์อัตโนมัติแล้ว (ตรงกับเสียงจริง ${Math.round(bestScore / sample.length * 100)}%)`;
  }
  clearTimeout(autoAlign.t); autoAlign.t = setTimeout(() => ($('#tabStatus').textContent = ''), 6000);
  settings.tabShift = best; saveSettings();
  rebuildGrid();
}
$('#autoAlign').onclick = autoAlign;
document.querySelectorAll('[data-shift]').forEach((b) => (b.onclick = () => {
  const v = b.dataset.shift;
  const d = v === 'bar' ? settings.bpb : v === '-bar' ? -settings.bpb : +v;
  settings.tabShift = (settings.tabShift || 0) + d; saveSettings(); rebuildGrid();
}));

async function sendImport(fd, label) {
  $('#tabStatus').textContent = `กำลังอ่าน ${label} …`;
  fd.append('bpb', settings.bpb);
  try {
    imported = await api(`/api/jobs/${job.id}/tab-import`, { method: 'POST', body: fd });
  } catch (e) { $('#tabStatus').innerHTML = `<span class="err">นำเข้าไม่สำเร็จ: ${escapeHtml(e.message)}</span>`; return false; }
  settings.tabShift = null;
  setTabSrc('import');
  return true;
}
$('#tabFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const fd = new FormData(); fd.append('file', f); await sendImport(fd, f.name);
});
$('#pasteBtn').onclick = () => { $('#pasteBox').classList.toggle('hidden'); $('#pasteText').focus(); };
$('#pasteCancel').onclick = () => $('#pasteBox').classList.add('hidden');
$('#pasteGo').onclick = async () => {
  const t = $('#pasteText').value; if (!t.trim()) return;
  const fd = new FormData(); fd.append('text', t);
  if (await sendImport(fd, 'Tab ข้อความ')) { $('#pasteBox').classList.add('hidden'); $('#pasteText').value = ''; }
};
$('#impTrack').onchange = async () => {
  try { imported = await api(`/api/jobs/${job.id}/tab-import/track?index=${$('#impTrack').value}&bpb=${settings.bpb}`, { method: 'POST' }); }
  catch (e) { $('#tabStatus').textContent = 'ผิดพลาด: ' + e.message; return; }
  settings.tabShift = null; setTabSrc('import');
};
$('#impDelete').onclick = async () => {
  if (!confirm('ลบ Tab ที่นำเข้า แล้วกลับไปใช้ Tab จาก AI ?')) return;
  await api(`/api/jobs/${job.id}/tab-import`, { method: 'DELETE' });
  imported = null; settings.tabShift = null; setTabSrc('ai');
};

/* ================================================================ EXPORTS */
function download(name, text, type) {
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const safeName = () => (job?.name || 'song').replace(/[\\/:*?"<>|]+/g, '_');

function measuresData() {
  const spm = SUB * settings.bpb;
  const nMeasures = Math.max(1, Math.ceil(beatAt(engine.duration || analysis.duration) / settings.bpb));
  const ms = Array.from({ length: nMeasures }, () => []);
  for (const n of tabNotes) if (n.measure >= 0 && n.measure < nMeasures) ms[n.measure].push(n);
  return { ms, spm };
}

function exportTxt() {
  const { ms, spm } = measuresData();
  const perLine = 4, CW = 3;
  let out = `${job.name}\nTuning: E A D G B e (standard)   Tempo: ~${analysis.bpm} BPM   ${settings.bpb}/4\n`;
  out += `Auto-transcribed by Guitar Stem Studio (each column = 1/16 note)\n\n`;
  for (let i = 0; i < ms.length; i += perLine) {
    const lines = STRING_NAMES.map((s) => s + '|');
    const nums = ' '.repeat(2);
    let header = nums;
    for (let m = i; m < Math.min(ms.length, i + perLine); m++) {
      const cols = Array.from({ length: 6 }, () => Array(spm).fill('-'.repeat(CW)));
      for (const n of ms[m]) { const f = String(n.f); cols[n.s][n.slot] = (f + '-'.repeat(CW)).slice(0, CW); }
      for (let s = 0; s < 6; s++) lines[s] += cols[s].join('') + '|';
      header += String(m + 1).padEnd(spm * CW + 1, ' ');
    }
    out += header.trimEnd() + '\n' + lines.join('\n') + '\n\n';
  }
  download(`${safeName()}-tab.txt`, out, 'text/plain;charset=utf-8');
}

function exportMusicXML() {
  const { ms, spm } = measuresData();
  const TYPES = [[16, 'whole', 0], [12, 'half', 1], [8, 'half', 0], [6, 'quarter', 1], [4, 'quarter', 0], [3, 'eighth', 1], [2, 'eighth', 0], [1, '16th', 0]];
  const split = (d) => { const r = []; while (d > 0) { const t = TYPES.find((x) => x[0] <= d); r.push(t); d -= t[0]; } return r; };
  const typeXml = (t) => `<type>${t[1]}</type>${t[2] ? '<dot/>' : ''}`;
  const pitchXml = (p) => { const n = NOTE_NAMES[p % 12]; return `<pitch><step>${n[0]}</step>${n.length > 1 ? '<alter>1</alter>' : ''}<octave>${Math.floor(p / 12) - 1}</octave></pitch>`; };
  const rest = (d) => split(d).map((t) => `<note><rest/><duration>${t[0]}</duration><voice>1</voice>${typeXml(t)}</note>`).join('');
  const tuning = [[64, 'E', 4], [59, 'B', 3], [55, 'G', 3], [50, 'D', 3], [45, 'A', 2], [40, 'E', 2]];
  let body = '';
  ms.forEach((notes, mi) => {
    let x = `<measure number="${mi + 1}">`;
    if (mi === 0) {
      x += `<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>${settings.bpb}</beats><beat-type>4</beat-type></time>` +
        `<clef><sign>TAB</sign><line>5</line></clef><staff-details><staff-lines>6</staff-lines>` +
        tuning.slice().reverse().map((t, i) => `<staff-tuning line="${i + 1}"><tuning-step>${t[1]}</tuning-step><tuning-octave>${t[2]}</tuning-octave></staff-tuning>`).join('') +
        `</staff-details></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(analysis.bpm)}</per-minute></metronome></direction-type><sound tempo="${Math.round(analysis.bpm)}"/></direction>`;
    }
    const bySlot = new Map();
    for (const n of notes) { if (!bySlot.has(n.slot)) bySlot.set(n.slot, []); bySlot.get(n.slot).push(n); }
    const slots = [...bySlot.keys()].sort((a, b) => a - b);
    if (!slots.length) x += `<note><rest measure="yes"/><duration>${spm}</duration><voice>1</voice></note>`;
    else {
      let pos = 0;
      slots.forEach((sl, i) => {
        if (sl > pos) x += rest(sl - pos);
        const gap = (i + 1 < slots.length ? slots[i + 1] : spm) - sl;
        const chord = bySlot.get(sl).sort((a, b) => a.p - b.p);
        const slotSec = beatDurationAt(chord[0].t) / SUB;
        const len = Math.max(1, Math.min(gap, Math.round(Math.max(...chord.map((n) => n.d)) / slotSec)));
        const t = TYPES.find((tt) => tt[0] <= len);
        chord.forEach((n, ci) => {
          x += `<note>${ci ? '<chord/>' : ''}${pitchXml(n.p)}<duration>${t[0]}</duration><voice>1</voice>${typeXml(t)}` +
            `<notations><technical><string>${n.s + 1}</string><fret>${n.f}</fret></technical></notations></note>`;
        });
        if (gap > t[0]) x += rest(gap - t[0]);
        pos = sl + gap;
      });
    }
    body += x + '</measure>\n';
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1"><work><work-title>${escapeHtml(job.name)}</work-title></work>
<identification><encoding><software>Guitar Stem Studio</software></encoding></identification>
<part-list><score-part id="P1"><part-name>Guitar</part-name><score-instrument id="P1-I1"><instrument-name>Guitar</instrument-name></score-instrument><midi-instrument id="P1-I1"><midi-program>26</midi-program></midi-instrument></score-part></part-list>
<part id="P1">
${body}</part></score-partwise>`;
  download(`${safeName()}-tab.musicxml`, xml, 'application/vnd.recordare.musicxml+xml');
}

function exportJson() {
  const data = {
    app: 'Guitar Stem Studio', version: 1, song: job.name, duration: engine.duration, bpm: analysis.bpm,
    beatsPerBar: settings.bpb, syncOffsetMs: settings.sync, tuning: 'EADGBE',
    beats: grid.filter((t) => t >= 0 && t <= engine.duration + 0.01).map((t) => +t.toFixed(4)),
    notes: tabNotes.map((n) => ({ time: +(n.t + settings.sync / 1000).toFixed(4), dur: +n.d.toFixed(4), string: n.s + 1, fret: n.f, midi: n.p, measure: n.measure + 1, slot16: n.slot })),
  };
  download(`${safeName()}-tab-sync.json`, JSON.stringify(data, null, 1), 'application/json');
}

$('#expTxt').onclick = exportTxt;
$('#expXml').onclick = exportMusicXML;
$('#expJson').onclick = exportJson;
$('#expMidi').onclick = () => { location.href = `/api/jobs/${job.id}/midi`; };

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
      updateTabCursor(t + settings.sync / 1000);
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

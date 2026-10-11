/* Guitar Stem Studio — UI translations (th / en) */
'use strict';

const I18N = {
  th: {
    'drop.title': 'ลากไฟล์ MP3 มาวาง หรือคลิกเพื่อเลือก',
    'drop.sub': 'AI จะแยกเป็น 6 แทร็ก: กีตาร์ · เสียงร้อง · กลอง · เบส · เปียโน · อื่นๆ',
    'yt.ph': 'วางลิงก์ YouTube / YouTube Music เช่น https://music.youtube.com/watch?v=...',
    'yt.go': 'โหลดเพลง',
    'yt.starting': 'กำลังเริ่มดาวน์โหลดจาก YouTube…',
    'yt.queued': 'เพิ่มในคิวแล้ว — ดาวน์โหลด → แยกเสียง อัตโนมัติ',
    'lib.title': 'เพลงของฉัน',
    'lib.empty': 'ยังไม่มีเพลง — อัปโหลดไฟล์ด้านบนเพื่อเริ่ม',
    'lib.offline': 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: {msg}',
    'lib.error': 'ผิดพลาด: {msg}',
    'lib.open': 'เปิด',
    'lib.delete': 'ลบ',
    'lib.confirmDelete': 'ลบ "{name}" ?',
    'up.progress': 'กำลังอัปโหลด {name} … {pct}%',
    'up.done': 'อัปโหลดแล้ว — กำลังประมวลผล (ครั้งแรกจะดาวน์โหลดโมเดล AI ~80MB)',
    'up.fail': 'อัปโหลดไม่สำเร็จ',
    'up.failMsg': 'อัปโหลดไม่สำเร็จ: {msg}',
    'notReady': 'ยังประมวลผลไม่เสร็จ',
    'loading': 'กำลังโหลดแทร็ก…',
    't.back': 'กลับไปหน้าเพลง', 't.rew': 'ย้อน 5 วิ (←)', 't.play': 'เล่น/หยุด (Space)', 't.fwd': 'ไปข้างหน้า 5 วิ (→)',
    'pos': 'ห้อง {bar} · จังหวะ {beat}',
    'speed': 'ความเร็ว', 'master': 'เสียงรวม (Master)',
    'p.all': 'ทุกแทร็ก', 'p.guitar': 'เฉพาะกีตาร์', 'p.backing': 'ตัดกีตาร์ (Backing)',
    'loop': 'วนซ้ำ A–B', 'loop.a': 'ตั้ง A', 'loop.b': 'ตั้ง B', 'loop.clear': 'ล้าง',
    'loop.btn': 'วน: {state}', 'on': 'เปิด', 'off': 'ปิด', 'offParen': ' (ปิด)',
    'mixer': 'มิกเซอร์ (Volume แต่ละแทร็ก)', 'stem.dl': '⬇ ดาวน์โหลดแทร็กนี้',
    'show': 'แสดง', 'hide': 'ซ่อน',
    'bk.sub': '— เลือกแทร็ก ช่วงเวลา ความเร็ว แล้วดาวน์โหลดไปซ้อม',
    'bk.stems': 'แทร็กที่จะใส่', 'bk.stems.note': '(ระดับเสียงตามมิกเซอร์)',
    'bk.range': 'ช่วงเวลา', 'bk.to': 'ถึง', 'bk.start.t': 'เริ่ม (นาที:วินาที)', 'bk.end.t': 'จบ (นาที:วินาที)',
    'bk.all': 'ทั้งเพลง', 'bk.ab': 'ใช้ช่วง A–B', 'bk.nows': 'เริ่ม = ตอนนี้', 'bk.nowe': 'จบ = ตอนนี้',
    'bk.snap': 'ปัดให้ตรงต้นห้อง/ท้ายห้อง', 'bk.metro': 'ใส่เมโทรนอมตลอดเพลง', 'bk.go': 'สร้าง Backing Track',
    'bk.noAB': 'ยังไม่ได้ตั้งช่วง A–B', 'bk.badTime': 'รูปแบบเวลาไม่ถูก ใช้ นาที:วินาที เช่น 1:23.5',
    'bk.making': 'กำลังสร้าง… (เพลงยาว/ช้ามากอาจใช้เวลาสักครู่)', 'bk.done': 'เสร็จแล้ว: {name}', 'bk.fail': 'สร้างไม่สำเร็จ: {msg}',
    'countin': 'นับนำ (count-in)', 'none': 'ไม่มี', 'bar1': '1 ห้อง', 'bar2': '2 ห้อง',
    'click': 'เสียงคลิก', 'file': 'ไฟล์', 'download': '⬇ ดาวน์โหลด',
    'metro': 'เมโทรนอม', 'mode': 'โหมด', 'mode.song': 'ตามจังหวะเพลง (auto)', 'mode.manual': 'กำหนด BPM เอง',
    'bpb': 'จังหวะ/ห้อง', 'shift1': 'เลื่อนจังหวะ 1 ของห้อง', 'countin1': 'นับนำ 1 ห้อง',
    'keys': 'คีย์ลัด: <b>Space</b> เล่น/หยุด · <b>← →</b> ±5 วิ · <b>[ ]</b> ตั้ง A/B · <b>L</b> วนซ้ำ · <b>M</b> เมโทรนอม · <b>- +</b> ความเร็ว',
    'stem.guitar': 'กีตาร์', 'stem.vocals': 'เสียงร้อง', 'stem.drums': 'กลอง', 'stem.bass': 'เบส', 'stem.piano': 'เปียโน', 'stem.other': 'อื่นๆ',
    'stage.queued': 'รอคิว', 'stage.queued_download': 'รอคิว (ดาวน์โหลด)', 'stage.fetching': 'กำลังดึงข้อมูลวิดีโอ',
    'stage.downloading': 'กำลังดาวน์โหลดจาก YouTube', 'stage.converting': 'กำลังแปลงเป็น MP3', 'stage.loading': 'กำลังโหลดไฟล์เสียง',
    'stage.separating': 'กำลังแยกเสียง (AI)', 'stage.beats': 'กำลังหาจังหวะ (beat)', 'stage.done': 'เสร็จแล้ว',
    'err.download': 'ดาวน์โหลดไม่สำเร็จ: {msg} — ถ้าลิงก์ถูกต้อง ลองรัน update.bat เพื่ออัปเดตตัวโหลด YouTube',
    'err.download_failed': 'ดาวน์โหลดไม่สำเร็จ (ตรวจสอบลิงก์ หรืออัปเดต yt-dlp ด้วย update.bat)',
    'err.too_long': 'วิดีโอยาว {minutes} นาที เกินกำหนด {max} นาที (ตั้ง GS_MAX_MINUTES เพื่อเพิ่ม)',
    'err.bad_ext': 'รองรับเฉพาะ {exts}', 'err.bad_url': 'ลิงก์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย http:// หรือ https://)',
    'err.not_ready': 'ยังประมวลผลไม่เสร็จ', 'err.expired': 'ไฟล์หมดอายุ — กดสร้างใหม่',
    'err.no_stems': 'ต้องเลือกอย่างน้อย 1 แทร็ก', 'err.no_such_stem': 'ไม่มีแทร็ก {name}', 'err.range_short': 'ช่วงเวลาสั้นเกินไป',
  },
  en: {
    'drop.title': 'Drop an MP3 here, or click to choose a file',
    'drop.sub': 'AI splits it into 6 stems: guitar · vocals · drums · bass · piano · other',
    'yt.ph': 'Paste a YouTube / YouTube Music link, e.g. https://music.youtube.com/watch?v=...',
    'yt.go': 'Load song',
    'yt.starting': 'Starting YouTube download…',
    'yt.queued': 'Queued — download → stem separation runs automatically',
    'lib.title': 'My songs',
    'lib.empty': 'No songs yet — upload a file above to get started',
    'lib.offline': 'Cannot reach the server: {msg}',
    'lib.error': 'Error: {msg}',
    'lib.open': 'Open',
    'lib.delete': 'Delete',
    'lib.confirmDelete': 'Delete "{name}"?',
    'up.progress': 'Uploading {name} … {pct}%',
    'up.done': 'Uploaded — processing (the first run downloads the ~80 MB AI model)',
    'up.fail': 'Upload failed',
    'up.failMsg': 'Upload failed: {msg}',
    'notReady': 'Still processing',
    'loading': 'Loading tracks…',
    't.back': 'Back to songs', 't.rew': 'Back 5 s (←)', 't.play': 'Play/Pause (Space)', 't.fwd': 'Forward 5 s (→)',
    'pos': 'Bar {bar} · Beat {beat}',
    'speed': 'Speed', 'master': 'Master volume',
    'p.all': 'All tracks', 'p.guitar': 'Guitar only', 'p.backing': 'No guitar (backing)',
    'loop': 'A–B loop', 'loop.a': 'Set A', 'loop.b': 'Set B', 'loop.clear': 'Clear',
    'loop.btn': 'Loop: {state}', 'on': 'On', 'off': 'Off', 'offParen': ' (off)',
    'mixer': 'Mixer (per-stem volume)', 'stem.dl': '⬇ Download this stem',
    'show': 'Show', 'hide': 'Hide',
    'bk.sub': '— choose stems, range and speed, then download it to practice',
    'bk.stems': 'Stems to include', 'bk.stems.note': '(levels follow the mixer)',
    'bk.range': 'Time range', 'bk.to': 'to', 'bk.start.t': 'Start (min:sec)', 'bk.end.t': 'End (min:sec)',
    'bk.all': 'Whole song', 'bk.ab': 'Use A–B loop', 'bk.nows': 'Start = now', 'bk.nowe': 'End = now',
    'bk.snap': 'Snap to bar lines', 'bk.metro': 'Metronome through the whole track', 'bk.go': 'Create backing track',
    'bk.noAB': 'No A–B loop set yet', 'bk.badTime': 'Invalid time — use min:sec, e.g. 1:23.5',
    'bk.making': 'Rendering… (long or very slow tracks can take a moment)', 'bk.done': 'Done: {name}', 'bk.fail': 'Could not create it: {msg}',
    'countin': 'Count-in', 'none': 'None', 'bar1': '1 bar', 'bar2': '2 bars',
    'click': 'Click volume', 'file': 'Format', 'download': '⬇ Download',
    'metro': 'Metronome', 'mode': 'Mode', 'mode.song': 'Follow the song (auto)', 'mode.manual': 'Fixed BPM',
    'bpb': 'Beats per bar', 'shift1': 'Shift beat 1', 'countin1': '1-bar count-in',
    'keys': 'Shortcuts: <b>Space</b> play/pause · <b>← →</b> ±5 s · <b>[ ]</b> set A/B · <b>L</b> loop · <b>M</b> metronome · <b>- +</b> speed',
    'stem.guitar': 'Guitar', 'stem.vocals': 'Vocals', 'stem.drums': 'Drums', 'stem.bass': 'Bass', 'stem.piano': 'Piano', 'stem.other': 'Other',
    'stage.queued': 'Queued', 'stage.queued_download': 'Queued (download)', 'stage.fetching': 'Fetching video info',
    'stage.downloading': 'Downloading from YouTube', 'stage.converting': 'Converting to MP3', 'stage.loading': 'Loading audio',
    'stage.separating': 'Separating stems (AI)', 'stage.beats': 'Detecting beats', 'stage.done': 'Done',
    'err.download': 'Download failed: {msg} — if the link is correct, run update.bat to update the YouTube downloader',
    'err.download_failed': 'Download failed (check the link, or update yt-dlp with update.bat)',
    'err.too_long': 'Video is {minutes} min, over the {max} min limit (raise GS_MAX_MINUTES)',
    'err.bad_ext': 'Supported formats: {exts}', 'err.bad_url': 'Invalid link (must start with http:// or https://)',
    'err.not_ready': 'Still processing', 'err.expired': 'File expired — create it again',
    'err.no_stems': 'Select at least one stem', 'err.no_such_stem': 'No such stem: {name}', 'err.range_short': 'Time range is too short',
  },
};

// Stage / error texts written by older versions (Thai) -> keys
const LEGACY = {
  'รอคิว': 'stage.queued', 'รอคิว (ดาวน์โหลด)': 'stage.queued_download', 'กำลังดึงข้อมูลวิดีโอ': 'stage.fetching',
  'กำลังดาวน์โหลดจาก YouTube': 'stage.downloading', 'กำลังแปลงเป็น MP3': 'stage.converting', 'กำลังโหลดไฟล์เสียง': 'stage.loading',
  'กำลังแยกเสียง (AI)': 'stage.separating', 'กำลังหาจังหวะ (beat)': 'stage.beats', 'เสร็จแล้ว': 'stage.done',
};

let LANG = (() => {
  try { const v = localStorage.getItem('gs:lang'); if (v === 'th' || v === 'en') return v; } catch {}
  return (navigator.language || '').toLowerCase().startsWith('th') ? 'th' : 'en';
})();

function t(key, params = {}) {
  const s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`));
}

// Server messages: {key, params} objects, stage keys, or legacy Thai strings
function tMsg(m) {
  if (m == null) return '';
  if (typeof m === 'object' && m.key) return t(m.key, m.params || {});
  if (typeof m === 'string') {
    if (I18N.en['stage.' + m]) return t('stage.' + m);
    if (LEGACY[m]) return t(LEGACY[m]);
  }
  return String(m);
}

function applyI18n(root = document) {
  document.documentElement.lang = LANG;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === LANG));
}

function setLang(lang) {
  LANG = lang;
  try { localStorage.setItem('gs:lang', lang); } catch {}
  applyI18n();
  document.dispatchEvent(new Event('langchange'));
}

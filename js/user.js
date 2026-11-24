const $ = id => document.getElementById(id);
const KEY = 'vb_profile', SEEN = 'vb_seen';
const pad = n => String(n).padStart(2, '0');

const Store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } },
  set(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } },
  getSeen() { try { return JSON.parse(localStorage.getItem(SEEN)); } catch (e) { return null; } },
  setSeen(o) { try { localStorage.setItem(SEEN, JSON.stringify(o)); } catch (e) { /* ignore */ } }
};

const ICONS = { 'เอกสาร': '📄', 'พัสดุ': '📦', 'กิจกรรมอื่นๆ': '📝' };
const HEAD = [
  ['⏳', 'รอรับเรื่อง', 'ผู้จัดคิวได้รับแจ้งทาง LINE แล้ว'],
  ['👀', 'รับเรื่องแล้ว', 'กำลังจัดรถให้คุณ'],
  ['🛵', 'จัดรถแล้ว', 'กำลังดำเนินการส่ง'],
  ['✅', 'ส่งเรียบร้อย', 'งานนี้เสร็จสิ้นแล้ว']
];
const STEP_LABELS = ['ส่งคำขอแล้ว', 'ผู้จัดคิวรับเรื่อง', 'จัดรถแล้ว', 'เสร็จสิ้น'];

let profile = Store.get();
let svc = CONFIG.TYPES[0], when = 'now', focusField = 'dest';
let mine = [], trackId = null, view = 'Home';
let seen = Store.getSeen() || {}, seenFresh = Store.getSeen() === null;   // เครื่องใหม่: ไม่เด้งแจ้งเตือนย้อนหลัง
let seenAtOpen = {}, prev = {};

/* ---------- เวลา ---------- */
function nowSlot() {            // ตอนนี้ + 10 นาที ปัดขึ้นทีละ 5 นาที
  const d = new Date(Date.now() + 10 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return { date: d.toLocaleDateString('sv-SE'), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
}

/* ---------- สลับหน้า ---------- */
function showView(v) {
  view = v;
  document.body.dataset.view = v;
  $('vHome').classList.toggle('hidden', v === 'Setup');
  $('setup').classList.toggle('hidden', v !== 'Setup');
  window.scrollTo(0, 0);
}

function showSetup() {
  closePanel();
  showView('Setup');
  $('sDept').innerHTML = CONFIG.DEPTS.map(d => `<option>${UI.esc(d)}</option>`).join('');
  if (profile) { $('sName').value = profile.booker; $('sDept').value = profile.dept; $('sPhone').value = profile.phone || ''; }
  Api.get({ action: 'options' }).then(o => {
    $('nameList').innerHTML = (o.bookers || []).map(n => `<option value="${UI.esc(n)}">`).join('');
  }).catch(() => {});
}

function showApp() {
  $('bell').classList.remove('hidden'); $('editProfile').classList.remove('hidden');
  $('who').textContent = profile.booker;
  $('origin').value = CONFIG.DEFAULT_ORIGIN;
  $('unit').innerHTML = CONFIG.UNITS.map(u => `<option>${UI.esc(u)}</option>`).join('');
  renderSvc(); setWhen('now'); renderSuggest();
  showView('Home');
  loadMine();
}

/* ---------- ฟอร์ม ---------- */
function renderSvc() {
  $('svc').innerHTML = CONFIG.TYPES.map(t =>
    `<button type="button" data-v="${UI.esc(t)}" class="${t === svc ? 'on' : ''}"><span>${ICONS[t] || '📋'}</span><b>${UI.esc(t)}</b></button>`).join('');
}

function setWhen(w) {
  when = w;
  document.querySelectorAll('#when button').forEach(b => b.classList.toggle('on', b.dataset.w === w));
  $('later').classList.toggle('hidden', w !== 'later');
  if (w === 'later' && !$('date').value) { const s = nowSlot(); $('date').value = s.date; $('time').value = s.time; }
}

function renderSuggest() {
  const q = $(focusField).value.trim().toLowerCase();
  const recent = [...new Set(mine.map(m => m.dest).filter(Boolean))].slice(0, 5).map(v => ({ v, ic: '🕒', sub: 'ใช้ล่าสุด' }));
  const seenV = new Set();
  const list = recent.concat(CONFIG.PLACES.map(v => ({ v, ic: '📍', sub: '' })))
    .filter(x => !seenV.has(x.v) && seenV.add(x.v))
    .filter(x => !q || x.v.toLowerCase().includes(q))
    .slice(0, 6);
  $('suggest').innerHTML = list.map(x =>
    `<button type="button" class="item" data-v="${UI.esc(x.v)}"><span class="ic">${x.ic}</span><span>${UI.esc(x.v)}${x.sub ? `<small>${x.sub}</small>` : ''}</span></button>`).join('');
}

/* ---------- ข้อมูลของฉัน ---------- */
async function loadMine() {
  try {
    mine = await Api.get({ action: 'mine', booker: profile.booker });
  } catch (e) {
    $('mine').innerHTML = `<p class="muted">โหลดรายการไม่ได้: ${UI.esc(e.message)}</p>`; return;
  }
  if (seenFresh) { mine.forEach(x => { seen[x.requestId] = UI.stepOf(x); }); Store.setSeen(seen); seenFresh = false; }
  mine.forEach(x => {                       // สถานะเปลี่ยนระหว่างเปิดหน้าอยู่ -> เด้งข้อความ
    const s = UI.stepOf(x);
    if (prev[x.requestId] !== undefined && s > prev[x.requestId]) UI.toast(x.dest + ': ' + HEAD[s][1]);
    prev[x.requestId] = s;
  });
  if (!trackId && mine.length) trackId = (mine.find(m => UI.stepOf(m) < 3) || mine[0]).requestId;
  renderMine(); renderTrack(); renderSuggest(); renderBell();
}

function renderMine() {
  $('mine').innerHTML = mine.length ? mine.slice(0, 20).map(x => {
    const [cls, label] = UI.statusOf(x);
    return `<div class="card job${x.requestId === trackId ? ' sel' : ''}" data-id="${UI.esc(x.requestId)}" style="cursor:pointer">
      <span class="badge ${cls}">${UI.esc(label)}</span>
      <h3>${UI.esc(x.dest)}</h3>
      <div class="meta">จาก ${UI.esc(x.origin)} · ${UI.esc(x.date)} ${UI.esc(x.time)} · ${UI.esc(x.type)}</div></div>`;
  }).join('') : '<p class="muted">ยังไม่มีรายการ</p>';
}

function renderTrack() {
  const x = mine.find(m => m.requestId === trackId);
  if (!x) {
    $('trackBody').innerHTML = '<div class="card empty">ยังไม่มีงานที่ติดตาม<br>จองงานแรกได้เลย</div>';
    return;
  }
  const step = UI.stepOf(x), h = HEAD[step];
  const steps = STEP_LABELS.map((l, i) => `<li class="${i < step ? 'done' : i === step ? 'cur' : ''}">${l}</li>`).join('');
  const driver = step >= 2 ? `<div class="card driver"><div class="avatar">🛵</div>
      <div><b>${UI.esc(x.operator || 'กำลังระบุผู้ดำเนินการ')}</b>
      <div class="muted">${x.queue ? 'คิวที่ ' + UI.esc(x.queue) : 'ผู้ดำเนินการงานนี้'}</div></div></div>` : '';
  $('trackBody').innerHTML = `
    <div class="card track-head"><div class="big-ic">${h[0]}</div><h1>${h[1]}</h1><div class="muted">${h[2]}</div></div>
    <div class="card"><ol class="steps">${steps}</ol></div>
    ${driver}
    <div class="card">
      <div class="pair"><span class="dot pick"></span><div>${UI.esc(x.origin)}</div></div>
      <div class="pair"><span class="dot drop"></span><div><b>${UI.esc(x.dest)}</b></div></div>
      <div class="muted">${UI.esc(x.date)} ${UI.esc(x.time)} · ${UI.esc(x.type)} ${UI.esc(x.qty)} ${UI.esc(x.unit)}</div>
      ${x.note ? `<div class="muted">${UI.esc(x.note)}</div>` : ''}
      <a class="maplink" href="${UI.esc(UI.mapsUrl(x))}" target="_blank" rel="noopener">🗺 เปิดเส้นทางใน Google Maps</a>
      <div class="muted" style="margin-top:6px">${UI.esc(x.requestId)}</div>
    </div>
    <button id="again" class="btn block">จองงานใหม่</button>`;
}

function openTrack(id) { trackId = id; renderMine(); renderTrack(); showView('Track'); loadMine(); }

/* ---------- กระดิ่งแจ้งเตือน ---------- */
const unread = () => mine.filter(x => (seen[x.requestId] === undefined ? -1 : seen[x.requestId]) < UI.stepOf(x));

function renderBell() {
  const n = unread().length;
  $('badge').textContent = n > 9 ? '9+' : n;
  $('badge').classList.toggle('hidden', n === 0);
  if (!$('bellPanel').classList.contains('hidden')) renderNotif();
}

function renderNotif() {
  $('notifList').innerHTML = mine.length ? mine.slice(0, 20).map(x => {
    const s = UI.stepOf(x), h = HEAD[s];
    const isNew = (seenAtOpen[x.requestId] === undefined ? -1 : seenAtOpen[x.requestId]) < s;
    return `<button class="notif${isNew ? ' new' : ''}" data-id="${UI.esc(x.requestId)}"><span class="ic">${h[0]}</span>
      <span class="nt"><b>${UI.esc(x.dest)}</b><small>${h[1]}${s >= 2 && x.operator ? ' · ' + UI.esc(x.operator) : ''} · ${UI.esc(x.date)} ${UI.esc(x.time)}</small></span>
      ${isNew ? '<i class="dotnew"></i>' : ''}</button>`;
  }).join('') : '<div class="empty">ยังไม่มีการแจ้งเตือน</div>';
}

function openPanel() {
  seenAtOpen = Object.assign({}, seen);
  $('bellPanel').classList.remove('hidden');
  renderNotif();
  mine.forEach(x => { seen[x.requestId] = UI.stepOf(x); });   // เปิดดูแล้ว = อ่านแล้ว
  Store.setSeen(seen);
  $('badge').classList.add('hidden');
}
function closePanel() { $('bellPanel').classList.add('hidden'); }

/* ---------- events ---------- */
$('saveProfile').onclick = () => {
  const booker = $('sName').value.trim();
  if (!booker) return UI.toast('กรุณาใส่ชื่อ', true);
  if (!profile || profile.booker !== booker) { mine = []; trackId = null; prev = {}; seen = {}; seenFresh = true; }
  profile = { booker, dept: $('sDept').value, phone: $('sPhone').value.trim() };
  Store.set(profile); showApp();
};
$('editProfile').onclick = showSetup;
$('bell').onclick = e => { e.stopPropagation(); $('bellPanel').classList.contains('hidden') ? openPanel() : closePanel(); };
$('closePanel').onclick = closePanel;
document.addEventListener('click', e => {
  if (!$('bellPanel').classList.contains('hidden') && !$('bellPanel').contains(e.target)) closePanel();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
$('notifList').addEventListener('click', e => { const b = e.target.closest('.notif'); if (b) { closePanel(); openTrack(b.dataset.id); } });

$('back').onclick = () => showView('Home');
$('trackBody').addEventListener('click', e => { if (e.target.id === 'again') showView('Home'); });
$('mine').addEventListener('click', e => { const c = e.target.closest('.job'); if (c) openTrack(c.dataset.id); });

['origin', 'dest'].forEach(id => {
  $(id).addEventListener('focus', () => { focusField = id; renderSuggest(); });
  $(id).addEventListener('input', renderSuggest);
});
$('suggest').addEventListener('click', e => {
  const b = e.target.closest('.item'); if (!b) return;
  $(focusField).value = b.dataset.v;
  if (focusField === 'origin') { focusField = 'dest'; $('dest').focus(); }
  renderSuggest();
});
$('svc').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { svc = b.dataset.v; renderSvc(); } });
$('when').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setWhen(b.dataset.w); });

$('submit').onclick = async () => {
  const dest = $('dest').value.trim();
  if (!dest) { UI.toast('ใส่ปลายทางก่อน', true); $('dest').focus(); return; }
  const slot = when === 'now' ? nowSlot() : { date: $('date').value, time: $('time').value };
  if (!slot.date || !slot.time) return UI.toast('เลือกวันและเวลา', true);

  const btn = $('submit'); btn.disabled = true; btn.textContent = 'กำลังส่ง…';
  try {
    const r = await Api.post({ action: 'create', data: {
      booker: profile.booker, dept: profile.dept, bookerPhone: profile.phone,
      date: slot.date, time: slot.time + ':00',
      type: svc, origin: $('origin').value.trim(), dest,
      note: $('note').value, qty: $('qty').value || '1', unit: $('unit').value,
      destContact: $('destContact').value, destPhone: $('destPhone').value, project: $('project').value
    } });
    seen[r.requestId] = 0; Store.setSeen(seen);          // งานที่เพิ่งจองเอง ไม่นับเป็นแจ้งเตือนใหม่
    ['dest', 'note', 'qty', 'destContact', 'destPhone'].forEach(id => { $(id).value = ''; });
    UI.toast('ส่งคำขอแล้ว');
    openTrack(r.requestId);
  } catch (e) { UI.toast(e.message, true); }
  finally { btn.disabled = false; btn.textContent = 'จองเลย'; }
};

// รีเฟรชสถานะเป็นระยะ เพื่อให้กระดิ่งเตือนเมื่อผู้จัดคิวเปลี่ยนสถานะ
setInterval(() => { if (!document.hidden && profile && view !== 'Setup') loadMine(); }, 20000);

profile ? showApp() : showSetup();

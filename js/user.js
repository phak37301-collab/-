const $ = id => document.getElementById(id);
const KEY = 'vb_profile';
const pad = n => String(n).padStart(2, '0');

const Store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } },
  set(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } }
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
let mine = [], trackId = null, poll = null, view = 'Home';

/* ---------- เวลา ---------- */
function nowSlot() {            // ตอนนี้ + 10 นาที ปัดขึ้นทีละ 5 นาที
  const d = new Date(Date.now() + 10 * 60000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return { date: d.toLocaleDateString('sv-SE'), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
}

/* ---------- สลับหน้า ---------- */
function showView(v) {
  view = v;
  ['Home', 'Act', 'Track'].forEach(n => $('v' + n).classList.toggle('hidden', n !== v));
  $('bar').classList.toggle('hidden', v !== 'Home');
  $('tabHome').classList.toggle('on', v === 'Home');
  $('tabAct').classList.toggle('on', v !== 'Home');
  clearInterval(poll);
  if (v === 'Track') poll = setInterval(() => { if (!document.hidden) loadMine(); }, 15000);
  window.scrollTo(0, 0);
}

function showSetup() {
  ['vHome', 'vAct', 'vTrack', 'bar', 'tabs'].forEach(id => $(id).classList.add('hidden'));
  clearInterval(poll);
  $('setup').classList.remove('hidden');
  $('sDept').innerHTML = CONFIG.DEPTS.map(d => `<option>${UI.esc(d)}</option>`).join('');
  if (profile) { $('sName').value = profile.booker; $('sDept').value = profile.dept; $('sPhone').value = profile.phone || ''; }
  Api.get({ action: 'options' }).then(o => {
    $('nameList').innerHTML = (o.bookers || []).map(n => `<option value="${UI.esc(n)}">`).join('');
  }).catch(() => {});
}

function showApp() {
  $('setup').classList.add('hidden');
  $('tabs').classList.remove('hidden'); $('editProfile').classList.remove('hidden');
  $('who').textContent = profile.booker; $('whoDept').textContent = '';

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
  const seen = new Set();
  const list = recent.concat(CONFIG.PLACES.map(v => ({ v, ic: '📍', sub: '' })))
    .filter(x => !seen.has(x.v) && seen.add(x.v))
    .filter(x => !q || x.v.toLowerCase().includes(q))
    .slice(0, 6);
  $('suggest').innerHTML = list.map(x =>
    `<button type="button" class="item" data-v="${UI.esc(x.v)}"><span class="ic">${x.ic}</span><span>${UI.esc(x.v)}${x.sub ? `<small>${x.sub}</small>` : ''}</span></button>`).join('');
}

/* ---------- ข้อมูลของฉัน / ติดตามงาน ---------- */
async function loadMine() {
  try {
    mine = await Api.get({ action: 'mine', booker: profile.booker });
  } catch (e) {
    $('mine').innerHTML = `<p class="muted">โหลดรายการไม่ได้: ${UI.esc(e.message)}</p>`; return;
  }
  $('mine').innerHTML = mine.length ? mine.slice(0, 20).map(x => {
    const [cls, label] = UI.statusOf(x);
    return `<div class="card job" data-id="${UI.esc(x.requestId)}" style="cursor:pointer">
      <span class="badge ${cls}">${UI.esc(label)}</span>
      <h3>${UI.esc(x.dest)}</h3>
      <div class="meta">จาก ${UI.esc(x.origin)} · ${UI.esc(x.date)} ${UI.esc(x.time)} · ${UI.esc(x.type)}</div></div>`;
  }).join('') : '<p class="muted">ยังไม่มีรายการ กดแท็บ "จองรถ" เพื่อเริ่มจอง</p>';
  if (view === 'Home') renderSuggest();
  if (view === 'Track') renderTrack();
}

function renderTrack() {
  const x = mine.find(m => m.requestId === trackId);
  if (!x) { $('trackBody').innerHTML = '<p class="muted">กำลังโหลด…</p>'; return; }
  const step = UI.stepOf(x), h = HEAD[step];
  const steps = STEP_LABELS.map((l, i) => `<li class="${i < step ? 'done' : i === step ? 'cur' : ''}">${l}</li>`).join('');
  const driver = step >= 2 ? `<div class="card driver"><div class="avatar">🛵</div>
      <div><b>${UI.esc(x.operator || 'กำลังระบุผู้ดำเนินการ')}</b>
      <div class="muted">${x.queue ? 'คิวที่ ' + UI.esc(x.queue) : 'ผู้ดำเนินการงานนี้'}</div></div></div>` : '';
  $('trackBody').innerHTML = `
    <div class="track-head"><div class="big-ic">${h[0]}</div><h1>${h[1]}</h1><div class="muted">${h[2]}</div></div>
    <div class="card"><ol class="steps">${steps}</ol></div>
    ${driver}
    <div class="card">
      <div class="pair"><span class="dot pick"></span><div>${UI.esc(x.origin)}</div></div>
      <div class="pair"><span class="dot drop"></span><div><b>${UI.esc(x.dest)}</b></div></div>
      <div class="muted">${UI.esc(x.date)} ${UI.esc(x.time)} · ${UI.esc(x.type)} ${UI.esc(x.qty)} ${UI.esc(x.unit)}</div>
      ${x.note ? `<div class="muted">${UI.esc(x.note)}</div>` : ''}
      <div class="muted" style="margin-top:6px">${UI.esc(x.requestId)}</div>
    </div>
    <button id="again" class="btn block">จองงานใหม่</button>`;
}

function openTrack(id) { trackId = id; showView('Track'); renderTrack(); loadMine(); }

/* ---------- events ---------- */
$('saveProfile').onclick = () => {
  const booker = $('sName').value.trim();
  if (!booker) return UI.toast('กรุณาใส่ชื่อ', true);
  profile = { booker, dept: $('sDept').value, phone: $('sPhone').value.trim() };
  Store.set(profile); showApp();
};
$('editProfile').onclick = showSetup;
$('tabHome').onclick = () => showView('Home');
$('tabAct').onclick = () => { showView('Act'); loadMine(); };
$('back').onclick = () => showView('Act');
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
    ['dest', 'note', 'qty', 'destContact', 'destPhone'].forEach(id => { $(id).value = ''; });
    openTrack(r.requestId);
  } catch (e) { UI.toast(e.message, true); }
  finally { btn.disabled = false; btn.textContent = 'จองเลย'; }
};

profile ? showApp() : showSetup();

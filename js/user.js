const $ = id => document.getElementById(id);
const KEY = 'vb_profile';

const Store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } },
  set(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ } }
};

let profile = Store.get();
let typeChips, originChips, destChips;

function nextHalfHour() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function showSetup() {
  $('app').classList.add('hidden'); $('bar').classList.add('hidden');
  $('setup').classList.remove('hidden');
  $('sDept').innerHTML = CONFIG.DEPTS.map(d => `<option>${UI.esc(d)}</option>`).join('');
  if (profile) { $('sName').value = profile.booker; $('sDept').value = profile.dept; $('sPhone').value = profile.phone || ''; }
  Api.get({ action: 'options' }).then(o => {
    $('nameList').innerHTML = (o.bookers || []).map(n => `<option value="${UI.esc(n)}">`).join('');
  }).catch(() => {});
}

function showApp() {
  $('setup').classList.add('hidden');
  $('app').classList.remove('hidden'); $('bar').classList.remove('hidden');
  $('who').textContent = profile.booker; $('whoDept').textContent = profile.dept;

  $('date').value = new Date().toLocaleDateString('sv-SE');
  $('time').value = nextHalfHour();
  $('unit').innerHTML = CONFIG.UNITS.map(u => `<option>${UI.esc(u)}</option>`).join('');

  typeChips = UI.chips($('typeChips'), CONFIG.TYPES, CONFIG.TYPES[0]);
  originChips = UI.chips($('originChips'), CONFIG.PLACES, CONFIG.DEFAULT_ORIGIN, v => { $('origin').value = v; });
  destChips = UI.chips($('destChips'), CONFIG.PLACES, '', v => { $('dest').value = v; });
  $('origin').value = CONFIG.DEFAULT_ORIGIN;
  $('origin').oninput = () => originChips.set('');
  $('dest').oninput = () => destChips.set('');
  loadMine();
}

async function loadMine() {
  try {
    const rows = await Api.get({ action: 'mine', booker: profile.booker });
    $('mine').innerHTML = rows.length ? rows.slice(0, 15).map(x => {
      const [cls, label] = UI.statusOf(x);
      return `<div class="card job"><div><span class="badge ${cls}">${UI.esc(label)}</span></div>
        <h3>${UI.esc(x.origin)} → ${UI.esc(x.dest)}</h3>
        <div class="meta">${UI.esc(x.date)} ${UI.esc(x.time)} · ${UI.esc(x.type)} ${UI.esc(x.qty)} ${UI.esc(x.unit)}</div></div>`;
    }).join('') : '<p class="muted">ยังไม่มีรายการ</p>';
  } catch (e) { $('mine').innerHTML = `<p class="muted">โหลดรายการไม่ได้: ${UI.esc(e.message)}</p>`; }
}

$('saveProfile').onclick = () => {
  const booker = $('sName').value.trim();
  if (!booker) return UI.toast('กรุณาใส่ชื่อ', true);
  profile = { booker, dept: $('sDept').value, phone: $('sPhone').value.trim() };
  Store.set(profile); showApp();
};
$('editProfile').onclick = showSetup;

$('submit').onclick = async () => {
  const dest = $('dest').value.trim();
  if (!$('date').value || !$('time').value) return UI.toast('เลือกวันและเวลา', true);
  if (!dest) return UI.toast('ใส่ปลายทาง', true);

  const btn = $('submit'); btn.disabled = true; btn.textContent = 'กำลังส่ง…';
  try {
    const r = await Api.post({ action: 'create', data: {
      booker: profile.booker, dept: profile.dept, bookerPhone: profile.phone,
      date: $('date').value, time: $('time').value + ':00',
      type: typeChips.get(), origin: $('origin').value.trim(), dest,
      note: $('note').value, qty: $('qty').value || '1', unit: $('unit').value,
      destContact: $('destContact').value, destPhone: $('destPhone').value, project: $('project').value
    } });
    UI.toast('ส่งแล้ว ' + r.requestId);
    $('note').value = ''; $('dest').value = ''; destChips.set('');
    $('qty').value = ''; $('destContact').value = ''; $('destPhone').value = '';
    loadMine();
  } catch (e) { UI.toast(e.message, true); }
  finally { btn.disabled = false; btn.textContent = 'ส่งคำขอ'; }
};

profile ? showApp() : showSetup();

const $ = id => document.getElementById(id);
let pin = '';
try { pin = sessionStorage.getItem('vb_pin') || ''; } catch (e) { /* ignore */ }
let timer = null;

function jobHtml(x) {
  const [cls, label] = UI.statusOf(x);
  const ops = CONFIG.OPERATORS.map(o => `<option ${o === x.operator ? 'selected' : ''}>${UI.esc(o)}</option>`).join('');
  const contact = [x.destContact, x.destPhone].filter(Boolean).join(' ');
  return `<div class="card job" data-id="${UI.esc(x.requestId)}">
    <div><span class="badge ${cls}">${UI.esc(label)}</span>
      <span class="muted"> ${UI.esc(x.date)} ${UI.esc(x.time)}</span></div>
    <h3>${UI.esc(x.booker)} <span class="muted">${UI.esc(x.dept)}</span></h3>
    <div class="route-txt">${UI.esc(x.origin)} → <b>${UI.esc(x.dest)}</b></div>
    <div class="meta">${UI.esc(x.type)} ${UI.esc(x.qty)} ${UI.esc(x.unit)}${contact ? ' · ' + UI.esc(contact) : ''}</div>
    ${x.note ? `<div class="meta">${UI.esc(x.note)}</div>` : ''}
    <a class="maplink" href="${UI.esc(UI.mapsUrl(x))}" target="_blank" rel="noopener">🗺 เปิดเส้นทางใน Google Maps</a>
    <div class="row" style="margin-top:10px">
      <select class="op"><option value="">ผู้ดำเนินการ</option>${ops}</select>
      <input class="q" placeholder="คิวที่" inputmode="numeric" value="${UI.esc(x.queue)}">
    </div>
    <div class="actions">
      ${x.check ? '' : '<button class="btn ghost" data-op="ack">รับเรื่อง</button>'}
      <button class="btn" data-op="assign">จ่ายงาน</button>
      <button class="btn ok" data-op="done">แล้วเสร็จ</button>
    </div>
  </div>`;
}

async function load(force) {
  // ไม่วาดทับระหว่างที่ผู้จัดคิวกำลังพิมพ์/เลือกในการ์ด
  const a = document.activeElement;
  if (!force && a && $('jobs').contains(a) && /INPUT|SELECT/.test(a.tagName)) return;
  try {
    const rows = await Api.get({ action: 'queue', pin, includeOld: $('showOld').checked ? '1' : '0' });
    $('login').classList.add('hidden'); $('board').classList.remove('hidden');
    $('jobs').innerHTML = rows.length ? rows.map(jobHtml).join('') : '<p class="muted">ไม่มีงานค้าง</p>';
    $('updated').textContent = 'อัปเดต ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {
    if (/PIN/.test(e.message)) {
      pin = ''; try { sessionStorage.removeItem('vb_pin'); } catch (_) { /* ignore */ }
      $('board').classList.add('hidden'); $('login').classList.remove('hidden');
      clearInterval(timer);
    }
    UI.toast(e.message, true);
  }
}

function start() {
  load(true);
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) load(false); }, CONFIG.POLL_MS);
}

$('enter').onclick = () => {
  pin = $('pin').value.trim();
  if (!pin) return;
  try { sessionStorage.setItem('vb_pin', pin); } catch (e) { /* ignore */ }
  start();
};
$('pin').onkeydown = e => { if (e.key === 'Enter') $('enter').click(); };
$('refresh').onclick = () => load(true);
$('showOld').onchange = () => load(true);

$('jobs').addEventListener('click', async e => {
  const b = e.target.closest('[data-op]'); if (!b) return;
  const card = b.closest('.job');
  const body = { action: 'update', pin, requestId: card.dataset.id, op: b.dataset.op };
  if (b.dataset.op === 'assign') {
    body.operator = card.querySelector('.op').value;
    body.queue = card.querySelector('.q').value;
    if (!body.operator && !body.queue) return UI.toast('เลือกผู้ดำเนินการหรือใส่คิว', true);
  }
  b.disabled = true;
  try { await Api.post(body); UI.toast('บันทึกแล้ว'); await load(true); }
  catch (err) { UI.toast(err.message, true); b.disabled = false; }
});

if (pin) start();

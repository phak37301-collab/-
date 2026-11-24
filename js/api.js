// เรียก Apps Script ทั้งหมดผ่านไฟล์นี้ + ฟังก์ชันช่วย UI ที่ใช้ร่วมกัน
const Api = {
  async get(params) {
    const u = new URL(CONFIG.API_URL);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return Api._unwrap(await fetch(u));
  },
  // ส่งเป็น text/plain เพื่อเลี่ยง CORS preflight ของ Apps Script
  async post(body) {
    return Api._unwrap(await fetch(CONFIG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body)
    }));
  },
  async _unwrap(res) {
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'เกิดข้อผิดพลาด');
    return j.data;
  }
};

const UI = {
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  toast(msg, isErr) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  },
  // วาดชิปเลือก 1 ค่า: คืนฟังก์ชัน get/set
  chips(el, items, initial, onChange) {
    let cur = initial;
    const draw = () => {
      el.innerHTML = items.map(v =>
        `<button type="button" class="chip${v === cur ? ' on' : ''}" data-v="${UI.esc(v)}">${UI.esc(v)}</button>`).join('');
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      cur = b.dataset.v; draw(); onChange && onChange(cur);
    });
    draw();
    return { get: () => cur, set: v => { cur = v; draw(); } };
  },
  // ลิงก์เปิดเส้นทางใน Google Maps (ไม่ต้องใช้ API key) — ถ้าในชีทมีลิงก์โลเคชั่นปลายทางจะใช้อันนั้นก่อน
  mapsUrl(x) {
    if (/^https?:\/\//.test(x.destLoc || '')) return x.destLoc;
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(x.origin || '') +
      '&destination=' + encodeURIComponent(x.dest || '');
  },
  // 0 รอรับเรื่อง, 1 รับเรื่องแล้ว, 2 จัดรถแล้ว, 3 เสร็จ
  stepOf(x) {
    if (x.status === 'แล้วเสร็จ') return 3;
    if (x.operator || x.queue) return 2;
    return x.check ? 1 : 0;
  },
  statusOf(x) {
    if (x.status === 'แล้วเสร็จ') return ['done', 'เสร็จแล้ว'];
    if (x.operator || x.queue) return ['assigned', 'จัดรถแล้ว: ' + [x.operator, x.queue && 'คิว ' + x.queue].filter(Boolean).join(' ')];
    if (x.check) return ['ack', 'รับเรื่องแล้ว'];
    return ['new', 'รอรับเรื่อง'];
  }
};

/**
 * ระบบจองรถ - Backend (Google Apps Script)
 * ผูกกับสเปรดชีต "ฟอรืมจองรถ" (Extensions > Apps Script)
 *
 * ตั้งค่าที่ Project Settings > Script properties:
 *   ADMIN_PIN      = รหัส PIN ของผู้จัดคิว (เช่น 6 หลัก)
 *   LINE_TOKEN     = (เฟสถัดไป) Channel access token
 *   LINE_GROUP_ID  = (เฟสถัดไป) Group ID ของกลุ่มผู้จัดรถ
 *
 * Deploy: Deploy > New deployment > Web app
 *   Execute as: Me | Who has access: Anyone
 */

const SHEET_NAME = 'การตอบแบบฟอร์ม 1';
const PLACES_SHEET = 'สถานที่ประจำ';   // (ไม่บังคับ) แท็บ: ชื่อ | โลเคชั่น | ผู้ติดต่อ | เบอร์
const TZ = 'Asia/Bangkok';
const HEADER_ROWS = 1;

// ลำดับคอลัมน์ (เริ่มที่ 1)
const C = {
  TS: 1, BOOKER: 2, DEPT: 3, PROJECT: 4, DATE: 5, TIME: 6,
  ORIGIN: 7, ORIGIN_LOC: 8, ORIGIN_CONTACT: 9, ORIGIN_PHONE: 10,
  TYPE: 11, QTY: 12, UNIT: 13,
  DEST: 14, DEST_LOC: 15, DEST_CONTACT: 16, DEST_PHONE: 17,
  NOTE: 18, LINE_ID: 19, CHECK: 20, BOOKER_PHONE: 21,
  QUEUE: 22, OPERATOR: 23, STATUS: 24, SPECIAL: 25, REQ_ID: 26
};
const LAST_COL = 26;
const ACK_TEXT = 'รับทราบ ได้ตรวจสอบข้อมูลแล้ว';
const DONE_TEXT = 'แล้วเสร็จ';

/* ===================== Entry points ===================== */

function doGet(e) {
  try {
    const p = e.parameter || {};
    switch (p.action) {
      case 'options':  return json_({ ok: true, data: getOptions_() });
      case 'mine':     return json_({ ok: true, data: getMyBookings_(p.booker) });
      case 'queue':    requirePin_(p.pin);
                       return json_({ ok: true, data: getQueue_(p.includeOld === '1') });
      default:         return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ฝั่งเว็บต้องส่ง body เป็น text/plain (JSON string) เพื่อเลี่ยง CORS preflight
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'create': {
        const res = createBooking_(body.data || {});   // lock ถูกปล่อยแล้วก่อนส่ง LINE
        try { notifyLine_(res.requestId, res.summary); } catch (e) { console.error('LINE: ' + e); }
        return json_({ ok: true, data: { requestId: res.requestId } });
      }
      case 'update': requirePin_(body.pin);
                     return json_({ ok: true, data: updateBooking_(body) });
      default:       return json_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/* ===================== Create ===================== */

function createBooking_(d) {
  const required = ['booker', 'dept', 'date', 'time', 'dest', 'type'];
  required.forEach(k => { if (!clean_(d[k])) throw new Error('กรอกไม่ครบ: ' + k); });

  const dateObj = parseDate_(d.date);           // รับ yyyy-mm-dd หรือ d/m/yyyy
  if (!dateObj) throw new Error('รูปแบบวันที่ไม่ถูกต้อง');
  const today = startOfDay_(new Date());
  const diffDays = Math.round((dateObj - today) / 86400000);
  if (diffDays < 0) throw new Error('วันที่ออกเดินทางเป็นวันที่ผ่านมาแล้ว');
  if (diffDays > 60) throw new Error('วันที่ห่างจากวันนี้เกิน 60 วัน กรุณาตรวจสอบอีกครั้ง');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const reqId = nextRequestId_();

    const row = new Array(LAST_COL).fill('');
    row[C.TS - 1] = new Date();
    row[C.BOOKER - 1] = clean_(d.booker);
    row[C.DEPT - 1] = clean_(d.dept);
    row[C.PROJECT - 1] = clean_(d.project);
    row[C.DATE - 1] = dateObj;
    row[C.TIME - 1] = clean_(d.time);
    row[C.ORIGIN - 1] = clean_(d.origin) || 'ออโรส';
    row[C.ORIGIN_LOC - 1] = clean_(d.originLoc);
    row[C.ORIGIN_CONTACT - 1] = clean_(d.originContact);
    row[C.ORIGIN_PHONE - 1] = clean_(d.originPhone);
    row[C.TYPE - 1] = clean_(d.type);
    row[C.QTY - 1] = clean_(d.qty);
    row[C.UNIT - 1] = clean_(d.unit);
    row[C.DEST - 1] = clean_(d.dest);
    row[C.DEST_LOC - 1] = clean_(d.destLoc);
    row[C.DEST_CONTACT - 1] = clean_(d.destContact);
    row[C.DEST_PHONE - 1] = clean_(d.destPhone);
    row[C.NOTE - 1] = clean_(d.note);
    row[C.LINE_ID - 1] = clean_(d.lineId);
    row[C.BOOKER_PHONE - 1] = clean_(d.bookerPhone);
    row[C.REQ_ID - 1] = reqId;

    sh.appendRow(row);
    const r = sh.getLastRow();
    sh.getRange(r, C.DATE).setNumberFormat('d/m/yyyy');
    SpreadsheetApp.flush();

    return {
      requestId: reqId,
      summary: {
        booker: row[C.BOOKER - 1], dept: row[C.DEPT - 1], date: fmtDate_(dateObj),
        time: row[C.TIME - 1], origin: row[C.ORIGIN - 1], dest: row[C.DEST - 1],
        type: row[C.TYPE - 1], qty: row[C.QTY - 1], unit: row[C.UNIT - 1], note: row[C.NOTE - 1]
      }
    };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Update (admin) ===================== */

function updateBooking_(b) {
  const id = clean_(b.requestId);
  if (!id) throw new Error('ไม่มี requestId');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_();
    const r = findRowById_(sh, id);
    if (!r) throw new Error('ไม่พบรายการ ' + id);

    switch (b.op) {
      case 'ack':
        sh.getRange(r, C.CHECK).setValue(ACK_TEXT);
        break;
      case 'assign':
        if (b.queue !== undefined) sh.getRange(r, C.QUEUE).setValue(clean_(b.queue));
        if (b.operator !== undefined) sh.getRange(r, C.OPERATOR).setValue(clean_(b.operator));
        if (!sh.getRange(r, C.CHECK).getValue()) sh.getRange(r, C.CHECK).setValue(ACK_TEXT);
        break;
      case 'done':
        sh.getRange(r, C.STATUS).setValue(DONE_TEXT);
        break;
      case 'reopen':
        sh.getRange(r, C.STATUS).clearContent();
        break;
      case 'special':
        sh.getRange(r, C.SPECIAL).setValue(clean_(b.special));
        break;
      default:
        throw new Error('unknown op');
    }
    SpreadsheetApp.flush();
    return { requestId: id, row: r };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Read ===================== */

function getQueue_(includeOld) {
  const rows = readRows_();
  const today = startOfDay_(new Date());
  return rows
    .filter(x => x.requestId && x.status !== DONE_TEXT)
    .filter(x => includeOld || (x.dateObj && x.dateObj >= today))
    .sort((a, b) => (a.dateObj - b.dateObj) || a.time.localeCompare(b.time))
    .map(stripInternal_);
}

function getMyBookings_(booker) {
  const name = clean_(booker);
  if (!name) throw new Error('ไม่ระบุชื่อผู้จอง');
  return readRows_()
    .filter(x => x.requestId && x.booker === name)
    .sort((a, b) => (b.dateObj - a.dateObj) || b.time.localeCompare(a.time))
    .slice(0, 30)
    .map(stripInternal_);
}

function getOptions_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('options');
  if (hit) return JSON.parse(hit);

  const rows = readRows_();
  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));
  const opts = {
    bookers: uniq(rows.map(x => x.booker)).sort(),
    depts: uniq(rows.map(x => x.dept)).sort(),
    projects: uniq(rows.map(x => x.project)).sort(),
    types: uniq(rows.map(x => x.type)),
    units: uniq(rows.map(x => x.unit)),
    places: readPlaces_()
  };
  cache.put('options', JSON.stringify(opts), 300);
  return opts;
}

function readPlaces_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(PLACES_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues()
    .filter(r => r[0])
    .map(r => ({ name: String(r[0]), loc: String(r[1] || ''), contact: String(r[2] || ''), phone: String(r[3] || '') }));
}

// อ่านเฉพาะ 400 แถวล่าสุดเพื่อความเร็ว
function readRows_() {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last <= HEADER_ROWS) return [];
  const n = Math.min(400, last - HEADER_ROWS);
  const start = last - n + 1;
  const vals = sh.getRange(start, 1, n, LAST_COL).getValues();
  return vals.map((v, i) => ({
    row: start + i,
    requestId: String(v[C.REQ_ID - 1] || ''),
    timestamp: fmtDateTime_(v[C.TS - 1]),
    booker: String(v[C.BOOKER - 1] || '').trim(),
    dept: String(v[C.DEPT - 1] || '').trim(),
    project: String(v[C.PROJECT - 1] || '').trim(),
    dateObj: parseDate_(v[C.DATE - 1]),
    date: fmtDate_(v[C.DATE - 1]),
    time: fmtTime_(v[C.TIME - 1]),
    origin: String(v[C.ORIGIN - 1] || ''),
    originLoc: String(v[C.ORIGIN_LOC - 1] || ''),
    originContact: String(v[C.ORIGIN_CONTACT - 1] || ''),
    originPhone: String(v[C.ORIGIN_PHONE - 1] || ''),
    type: String(v[C.TYPE - 1] || ''),
    qty: String(v[C.QTY - 1] || ''),
    unit: String(v[C.UNIT - 1] || ''),
    dest: String(v[C.DEST - 1] || ''),
    destLoc: String(v[C.DEST_LOC - 1] || ''),
    destContact: String(v[C.DEST_CONTACT - 1] || ''),
    destPhone: String(v[C.DEST_PHONE - 1] || ''),
    note: String(v[C.NOTE - 1] || ''),
    check: String(v[C.CHECK - 1] || ''),
    queue: String(v[C.QUEUE - 1] || ''),
    operator: String(v[C.OPERATOR - 1] || ''),
    status: String(v[C.STATUS - 1] || ''),
    special: String(v[C.SPECIAL - 1] || '')
  }));
}

function stripInternal_(x) {
  const o = Object.assign({}, x);
  delete o.dateObj;
  return o;
}

/* ===================== Request ID ===================== */

// รูปแบบ REQ-yyyyMMdd-NNN (รันเลขต่อวัน) ต้องเรียกภายใน lock เท่านั้น
function nextRequestId_() {
  const props = PropertiesService.getScriptProperties();
  const day = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd');
  const key = 'seq_' + day;
  const n = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(n));
  return 'REQ-' + day + '-' + ('000' + n).slice(-3);
}

function findRowById_(sh, id) {
  const last = sh.getLastRow();
  if (last <= HEADER_ROWS) return 0;
  const col = sh.getRange(1, C.REQ_ID, last, 1).getValues();
  for (let i = col.length - 1; i >= HEADER_ROWS; i--) {
    if (String(col[i][0]) === id) return i + 1;
  }
  return 0;
}

/**
 * รันมือครั้งเดียว: เติม Request ID ให้แถวเก่าที่ยังไม่มี (ใช้วันที่จาก "ประทับเวลา")
 * เพื่อให้แถวเก่าที่ยังค้างอยู่แสดงในหน้า Admin ได้
 */
function backfillRequestIds() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = sheet_();
    const last = sh.getLastRow();
    if (last <= HEADER_ROWS) return;
    const ts = sh.getRange(1, C.TS, last, 1).getValues();
    const ids = sh.getRange(1, C.REQ_ID, last, 1).getValues();
    const counters = {};
    ids.forEach(r => {                      // นับเลขที่ใช้ไปแล้วต่อวัน
      const m = /^REQ-(\d{8})-(\d+)$/.exec(String(r[0]));
      if (m) counters[m[1]] = Math.max(counters[m[1]] || 0, Number(m[2]));
    });
    for (let i = HEADER_ROWS; i < last; i++) {
      if (ids[i][0]) continue;
      const d = parseDate_(ts[i][0]);
      if (!d) continue;
      const day = Utilities.formatDate(d, TZ, 'yyyyMMdd');
      counters[day] = (counters[day] || 0) + 1;
      ids[i][0] = 'REQ-' + day + '-' + ('000' + counters[day]).slice(-3);
    }
    sh.getRange(1, C.REQ_ID, last, 1).setValues(ids);
    // ซิงก์ตัวนับวันนี้ ไม่ให้ชนกับเลขที่เพิ่งเติม
    const props = PropertiesService.getScriptProperties();
    Object.keys(counters).forEach(day => {
      const k = 'seq_' + day;
      props.setProperty(k, String(Math.max(Number(props.getProperty(k) || 0), counters[day])));
    });
  } finally {
    lock.releaseLock();
  }
}

/* ===================== Auth ===================== */

function requirePin_(pin) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pin_fails') || 0);
  if (fails >= 5) throw new Error('ใส่ PIN ผิดหลายครั้ง กรุณารอ 10 นาที');

  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
  if (!real) throw new Error('ยังไม่ได้ตั้งค่า ADMIN_PIN');
  if (String(pin || '') !== real) {
    cache.put('pin_fails', String(fails + 1), 600);
    throw new Error('PIN ไม่ถูกต้อง');
  }
}

/* ===================== Helpers ===================== */

function sheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('ไม่พบแท็บ ' + SHEET_NAME);
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ตัดช่องว่าง จำกัดความยาว และกันสูตรฝัง (=, +, -, @ นำหน้า)
function clean_(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim().slice(0, 1000);
  if (/^[=+\-@]/.test(s) && !/^[+\-]?\d[\d\s\-]*$/.test(s)) s = "'" + s;
  return s;
}

function startOfDay_(d) {
  const s = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
  return new Date(s + 'T00:00:00+07:00');
}

// รับ Date, 'yyyy-mm-dd', หรือ 'd/m/yyyy [h:mm:ss]' (รองรับปี พ.ศ.)
function parseDate_(v) {
  if (v instanceof Date && !isNaN(v)) return startOfDay_(v);
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (!m) return null;
    d = +m[1]; mo = +m[2]; y = +m[3];
  }
  if (y > 2400) y -= 543;
  const pad = n => ('0' + n).slice(-2);
  const out = new Date(y + '-' + pad(mo) + '-' + pad(d) + 'T00:00:00+07:00');
  return isNaN(out) ? null : out;
}

function fmtDate_(v) {
  const d = parseDate_(v);
  return d ? Utilities.formatDate(d, TZ, 'd/M/yyyy') : String(v || '');
}

function fmtDateTime_(v) {
  return (v instanceof Date) ? Utilities.formatDate(v, TZ, 'd/M/yyyy H:mm:ss') : String(v || '');
}

function fmtTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || ''));
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : String(v || '');
}

/* ===================== LINE แจ้งเตือน ===================== */
// Script properties: LINE_TOKEN, LINE_GROUP_ID, ADMIN_URL (ลิงก์หน้า admin บน GitHub Pages)
function notifyLine_(reqId, d) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('LINE_TOKEN');
  const to = props.getProperty('LINE_GROUP_ID');
  const adminUrl = props.getProperty('ADMIN_URL');
  if (!token || !to) return;

  const rowOf = (label, value) => ({
    type: 'box', layout: 'baseline', spacing: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: String(value || '-'), size: 'sm', wrap: true, flex: 5 }
    ]
  });
  const qty = [d.qty, d.unit].filter(Boolean).join(' ');
  const bubble = {
    type: 'bubble',
    header: { type: 'box', layout: 'vertical', backgroundColor: '#1F6FEB', paddingAll: 'md',
      contents: [{ type: 'text', text: 'มีรายการจองรถใหม่', color: '#FFFFFF', weight: 'bold' }] },
    body: { type: 'box', layout: 'vertical', spacing: 'sm',
      contents: [
        { type: 'text', text: d.booker + ' (' + d.dept + ')', weight: 'bold', wrap: true },
        rowOf('วัน-เวลา', d.date + ' ' + d.time),
        rowOf('ต้นทาง', d.origin),
        rowOf('ปลายทาง', d.dest),
        rowOf('ประเภท', d.type + (qty ? ' ' + qty : '')),
        rowOf('รายละเอียด', d.note),
        { type: 'text', text: reqId, size: 'xs', color: '#AAAAAA' }
      ] }
  };
  if (adminUrl) {
    bubble.footer = { type: 'box', layout: 'vertical',
      contents: [{ type: 'button', style: 'primary',
        action: { type: 'uri', label: 'เปิดหน้าจัดคิว', uri: adminUrl } }] };
  }
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ to: to, messages: [{ type: 'flex', altText: 'มีรายการจองรถใหม่ ' + d.booker + ' → ' + d.dest, contents: bubble }] }),
    muteHttpExceptions: true
  });
}

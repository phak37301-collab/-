# ระบบจองรถ

Google Sheet (ฐานข้อมูล) + Google Apps Script (API) + GitHub Pages (หน้าเว็บ) + LINE Messaging API (แจ้งเตือน)

## โครงสร้าง
- `index.html`        หน้าพนักงาน (เปิดที่ `/`)
- `admin/index.html`  หน้าผู้จัดคิว (เปิดที่ `/admin/`)
- `css/app.css`       สี ขนาด คอมโพเนนต์
- `js/config.js`      ตั้งค่า: API_URL, สังกัด, ปุ่มลัดสถานที่, ผู้ดำเนินการ
- `js/api.js`         เรียก Apps Script + ตัวช่วย UI
- `js/user.js`, `js/admin.js`  ตรรกะของแต่ละหน้า
- `apps-script/Code.gs`  โค้ดที่วางใน Apps Script ของชีท (ไม่ได้ใช้งานบนเว็บ)

## ตั้งค่า
1. วาง `apps-script/Code.gs` ใน Apps Script ของชีท ตั้ง Script properties:
   `ADMIN_PIN`, `LINE_TOKEN`, `LINE_GROUP_ID`, `ADMIN_URL`
2. Deploy เป็น Web app (Execute as: Me, Access: Anyone) แล้วนำ URL `/exec` ไปใส่ `API_URL` ใน `js/config.js`
3. GitHub: Settings > Pages > Deploy from branch (main, root)
4. ห้ามใส่ PIN / LINE token / Group ID ในไฟล์ใดๆ ของ repo นี้

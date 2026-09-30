# MY IT WORKs Smart Launcher

เว็บพอร์ทัลแบบ static สำหรับรวมเครื่องมือ IT และ AI Assistant ทำงานบน Cloudflare Worker `my-it-works` โดยให้ Worker เป็น proxy เรียก Gemini API เพื่อไม่ส่ง API key ไปยัง browser

## Deploy บน Cloudflare Worker

1. ใช้โฟลเดอร์นี้เป็น project root; `wrangler.jsonc` ระบุชื่อ Worker `my-it-works` และ static assets
2. ติดตั้งแพ็กเกจด้วย `npm ci` แล้ว deploy จาก PowerShell ใน project root ด้วยคำสั่งนี้:

```powershell
.\deploy-my-it-works.ps1
```

สคริปต์จะถาม token ในช่องซ่อน แล้ว deploy Worker `my-it-works` ตามชื่อใน `wrangler.jsonc`; ห้ามใส่ token ในคำสั่งหรือ commit ลงไฟล์ ตัวสคริปต์ถูกยกเว้นจาก static assets ด้วย `.assetsignore`
3. ตั้ง `GEMINI_API_KEY` เป็น Secret ใน **Worker → Settings → Variables and secrets → Production**; Secret จะอยู่กับ Worker เดิมเมื่อ deploy โค้ด/asset รอบใหม่
4. หากต้องการข้อมูล Deploy และ AI Limit สด ให้ตั้ง Secrets/Variables สำหรับ `/api/ops` ตามหัวข้อด้านล่าง
5. ตั้ง Cloudflare rate limiting rule ให้ `/api/ai` และ `/api/ops` จำกัดตาม IP เนื่องจากหน้าเว็บยังไม่มีระบบบัญชีผู้ใช้

`worker.js` เชื่อม route `/api/*` กับโค้ดใน `functions/api/`; secret อ่านจาก `env` ของ Worker เท่านั้น

สำหรับ local development ให้สร้างไฟล์ `.dev.vars` (ไฟล์นี้ถูก ignore แล้ว) และใส่ `GEMINI_API_KEY="คีย์ของคุณ"` จากนั้นรัน `npm run dev`

## เชื่อม Vercel, Render และ AI Limit แบบอ่านอย่างเดียว

เพิ่มค่าต่อไปนี้ที่ **Worker → Settings → Variables and secrets → Production**:

- `VERCEL_READ_TOKEN` — Secret ของบัญชีที่อ่านโปรเจกต์ได้; endpoint ใช้เรียก Vercel Deployments API ด้วย GET เท่านั้น
- `VERCEL_PROJECT_ID` — project ID หรือชื่อโปรเจกต์; ค่าเริ่มต้นคือ `my-it-works-present-web`
- `VERCEL_TEAM_SLUG` — slug ของทีม; ค่าเริ่มต้นคือ `itmdcu`
- `RENDER_API_KEY` — Secret ของบริการ Render; endpoint ใช้เรียก API ด้วย GET เท่านั้น
- `RENDER_SERVICE_ID` — รหัสบริการ; ถ้าไม่กำหนดจะใช้บริการที่ลิงก์ไว้ใน Launcher
- `GOOGLE_SERVICE_ACCOUNT_JSON` — Secret ที่เก็บ JSON key ของ service account ซึ่งมีสิทธิ์อ่าน Cloud Monitoring เท่านั้น
- `GOOGLE_CLOUD_PROJECT_ID` — project ID ที่ใช้ Gemini API; ถ้าไม่กำหนดจะใช้ `project_id` จาก service account

สำหรับ AI Limit ให้เปิด Cloud Monitoring API ใน Google Cloud project และกำหนด service account ให้มีสิทธิ์ `monitoring.timeSeries.list` (เช่น Cloud Monitoring Viewer) เท่านั้น เมตริกจาก Google อาจล่าช้าประมาณ 150 วินาที API นี้อ่าน usage/limit metrics โดยไม่แก้ quota หรือการตั้งค่า

`/api/ops` รับเฉพาะ action ที่กำหนดไว้ และเรียก Vercel/Render/Google Monitoring เพื่ออ่านข้อมูลเท่านั้น ไม่ส่งกุญแจ API กลับไปที่หน้าเว็บ ห้ามวางค่า Secret ใน source code หรือส่งค่า Secret ผ่านแชต

## ก่อนเปิดใช้งานจริง

- ยกเลิกหรือหมุน Gemini API key เดิมที่เคยฝังอยู่ในไฟล์หน้าเว็บ และอย่านำ key เก่ามาใช้ซ้ำ
- ตั้ง Cloudflare rate limiting ที่ `/api/ai`; การตรวจ Origin และจำกัดขนาดข้อความใน Function ช่วยกรองคำขอเบื้องต้น แต่ไม่ทดแทน rate limit หรือระบบยืนยันตัวตน
- หน้าล็อกอินเดิมและ Vault เป็นเพียง UI ฝั่ง browser จึงไม่ใช่ระบบควบคุมสิทธิ์ โปรเจ็กต์นี้ไม่มีระบบบัญชีผู้ใช้ หากข้อมูลปลายทางจำกัดสิทธิ์ให้ใช้ authentication/access policy ของ Cloudflare และระบบปลายทาง
- หน้า AI Office สร้างร่างข้อความจากโมเดล ไม่ได้รันโค้ดหรือทำงานจริงในระบบปลายทาง
- AI Office เรียก GitHub API ได้เฉพาะอ่านข้อมูล public repository, commits และ releases ของ repository ที่กำหนดไว้ ไม่มี token หรือ endpoint สำหรับเขียนกลับ GitHub
- AI Office อ่านสถานะ Vercel/Render และ Gemini quota metrics ผ่าน `/api/ops` เมื่อกำหนด Secrets แล้ว โดย endpoint นี้เรียก API ภายนอกแบบอ่านอย่างเดียว
- เมนู Check MDCUnet และ Search MDCUnet ไม่ถูกส่งเป็นบริบทให้ AI และไม่มี API เชื่อมต่อสองชีตนี้
- แชตในหน้า App เรียก Gemini ผ่าน `/api/ai` เท่านั้น; ห้ามฝังคีย์ Gemini ใน HTML หรือ JavaScript ฝั่งเบราว์เซอร์

## โครงสร้างหลัก

- `index.html` เปิดหน้า portal หลัก
- `app.html` หน้า Smart Launcher
- `ai_office.html` หน้าจำลอง AI Office
- `functions/api/ai.js` route ของ Worker สำหรับเรียก Gemini อย่างจำกัดขอบเขต
- `functions/api/github.js` route ของ Worker สำหรับอ่าน GitHub repository แบบ read-only
- `functions/api/ops.js` route ของ Worker สำหรับอ่านสถานะ Vercel, Render และ Gemini quota metrics แบบ read-only
- `_headers` ตั้ง response security headers สำหรับ static assets

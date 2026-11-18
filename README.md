# Jira Subtask + Confluence Auto-Spec Creator

Web Application สำหรับทีม Developer ที่ช่วยให้สามารถ **สร้าง Jira Subtask** และ **สร้างเอกสาร Technical Specification บน Confluence** ตาม Template ที่เลือก พร้อม **ผูก Remote Link เชื่อมโยงกลับไปยัง Jira Subtask** ได้ในขั้นตอนเดียว

---

## โครงสร้างระบบ (Architecture)

- **Frontend (`frontend/`):** Vue 3 + Vite + Vuetify 3 (JavaScript ESM)
  - หน้าจอเดียวแบ่งเป็น 3 ส่วนหลัก:
    1. **Jira Issue & Work Type:** ค้นหา Parent Issue จาก Issue Key หรือ Summary และเลือกประเภทงาน (`API Development` หรือ `Database Design`) เพื่อสลับ Template อัตโนมัติ
    2. **Documentation Template (Confluence):** เลือก Confluence Space, ค้นหา Parent Page (พร้อมค่า Default จาก `.env`) และกรอกพารามิเตอร์ตั้งต้นของเอกสาร
    3. **Live Preview & Execution:** แสดงตัวอย่างชื่อหน้า Confluence และหัวข้อเอกสารแบบ Real-time พร้อมแสดงสถานะการทำงานทีละขั้น ปุ่มเปิดลิงก์เมื่อสำเร็จ และปุ่ม **Retry Confluence Only** เมื่อฝั่ง Confluence ล้มเหลวโดยไม่สร้าง Jira Subtask ซ้ำ
- **Backend (`backend/`):** Express.js (JavaScript ESM)
  - ทำหน้าที่เรียก **Jira Cloud REST API v3** และ **Confluence Cloud REST API** ทั้งหมด
  - เก็บ `ATLASSIAN_EMAIL` และ `ATLASSIAN_API_TOKEN` ไว้ใน `.env` ฝั่ง Server เท่านั้น ไม่ส่งออกไปยัง Browser

---

## การติดตั้งและเริ่มต้นใช้งาน (Quick Start)

### 1. ติดตั้ง Dependencies ทั้งหมด
```bash
npm run install:all
```

### 2. ตั้งค่า Environment Variables (`.env`)
คัดลอกไฟล์ `.env.example` เป็น `.env` ที่โฟลเดอร์หลัก:
```bash
cp .env.example .env
```

กรอกข้อมูล Atlassian Cloud ของทีมใน `.env`:
```env
ATLASSIAN_BASE_URL=https://your-domain.atlassian.net
ATLASSIAN_EMAIL=your-email@company.com
ATLASSIAN_API_TOKEN=your-atlassian-api-token
DEFAULT_JIRA_PROJECT_KEY=PAY
DEFAULT_CONFLUENCE_SPACE_KEY=1KSGA
DEFAULT_CONFLUENCE_PARENT_PAGE_ID=5164335849
```

### 3. รันระบบ (Development Mode)
```bash
npm run dev
```
- **Frontend (Vue 3 + Vuetify 3):** `http://localhost:5173`
- **Backend (Express.js API):** `http://localhost:3001`

### 4. รันชุดทดสอบและตรวจสอบการ Build
```bash
npm test
npm run build
```

---

## สรุป API Endpoints (Express.js)

| Method | Path | รายละเอียด |
| --- | --- | --- |
| `GET` | `/api/config/defaults` | ดึงค่าเริ่มต้น Space/Parent Page และโครงสร้าง Templates |
| `GET` | `/api/jira/issues/search?q=` | ค้นหา Jira Parent Issue ด้วย Issue Key หรือ Summary |
| `GET` | `/api/confluence/spaces` | ดึงรายชื่อ Confluence Spaces |
| `GET` | `/api/confluence/pages/search?spaceKey=&q=` | ค้นหาหน้า Confluence เพื่อใช้เป็น Parent Page |
| `POST` | `/api/workflow/create-all` | สร้าง Jira Subtask -> สร้าง Confluence Page -> ผูก Remote Link (คืนค่า `207 PARTIAL_FAILURE` หาก Subtask สำเร็จแต่ Confluence ล้มเหลว) |
| `POST` | `/api/workflow/retry-confluence` | ลองสร้าง Confluence Page และผูก Remote Link ใหม่สำหรับ `subtaskKey` เดิมโดยไม่สร้าง Subtask ซ้ำ |

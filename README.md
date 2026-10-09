# EOC BCP นราธิวาส 2570

Dashboard ศูนย์ปฏิบัติการฉุกเฉิน (EOC) สำหรับแผนความต่อเนื่องทางธุรกิจ (BCP) ด้านการแพทย์และสาธารณสุข สสจ.นราธิวาส
ข้อมูลทั้งหมดมาจาก **Google Sheet เท่านั้น** (ไม่มีข้อมูลตัวอย่างฝังในหน้าเว็บ) อ่านแบบ Real-time และเพิ่ม/แก้ไข/ลบ (CRUD) ได้ทีละแถวผ่าน Google Apps Script

## ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | Dashboard (ไฟล์เดียว เปิดผ่าน GitHub Pages) — โครงสร้างฐานข้อมูลอยู่ในบล็อก `SCHEMA_DEF` |
| `Code.gs` | Google Apps Script ฉบับสมบูรณ์ (สร้างจาก `tools/build.js`) |
| `narathiwat_districts.geojson` | ขอบเขต 13 อำเภอ (geoBoundaries + OpenGISData-Thailand) |
| `facilities_osm.json` | พิกัดหน่วยบริการจาก OpenStreetMap |
| `database/BCP_Narathiwat_database.xlsx` | เทมเพลตฐานข้อมูลเปล่า 16 แท็บ (หัวตาราง + Dropdown + นิยามแผน BCP 9 ข้อ) |
| `tools/` | `build.js` (สร้าง Code.gs), `make_xlsx.py` (สร้างเทมเพลต), `test_gas.js` (ทดสอบ Code.gs) |

## โครงสร้างเมนู (11 หัวข้อ + ติดตามแผน)
- **สถานการณ์และความเสี่ยง** 1 พื้นที่เสี่ยงจากอุทกภัย · 2 แผนที่/ความเสี่ยงรายอำเภอ · 3 คาดการณ์ผลกระทบ
- **ดูแลประชาชน & บัญชาการ** 4 เส้นทางคมนาคม · 5 กลุ่มเปราะบาง/อพยพ · 6 EMS & ส่งต่อ (OPOH) · 7 สื่อสาร & Escalation
- **ขีดความสามารถสถานพยาบาล** 8 โรงพยาบาล & RTO · 9 รพ.สต. · 10 ทรัพยากร & โลจิสติกส์ · 11 กำลังคน
- **ติดตามแผน** ความก้าวหน้า BCP 9 ข้อ · บันทึกการเปลี่ยนแปลง (Audit Log)

ทุกหัวข้อ CRUD ลงแท็บของตัวเองใน Sheet โดยตรง ตัวเลข KPI และแจ้งเตือนคำนวณจากข้อมูลใน Sheet เท่านั้น

## ติดตั้งฐานข้อมูล
1. สร้าง Google Sheet ใหม่ (หรือใช้ไฟล์ว่าง) → Extensions → Apps Script → วาง `Code.gs`
2. แก้ `TOKENS` (ADMIN / EDITOR / VIEWER) → รันฟังก์ชัน `setupDatabase` → อนุญาตสิทธิ์
3. Deploy → Web app → Execute as **Me** · Who has access **Anyone** → คัดลอก URL `/exec`
4. เปิด Dashboard → **Sheet & GAS** → ใส่ URL + Token → ตรวจสอบการเชื่อมต่อ

| สิทธิ์ | อ่าน | CRUD | Push ทั้งแท็บ / setup / แชร์ | ข้อมูลส่วนบุคคล |
|---|---|---|---|---|
| ADMIN | ✓ | ✓ | ✓ | เห็นครบ |
| EDITOR | ✓ | ✓ | — | เห็นครบ |
| VIEWER | ✓ | — | — | ปิดบังที่เซิร์ฟเวอร์ |

> ทะเบียนกลุ่มเปราะบางมีชื่อ ที่อยู่ เบอร์โทร — แนะนำให้ตั้ง Sheet เป็นส่วนตัวและเข้าถึงผ่าน Web App + Token เท่านั้น

## พัฒนา
```
node tools/build.js      # สร้าง Code.gs + tools/schema.json จาก index.html
node tools/test_gas.js   # ทดสอบ Code.gs ด้วยตัวจำลอง Apps Script
python tools/make_xlsx.py
```

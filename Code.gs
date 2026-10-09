/**
 * ============================================================================
 *  แผนความต่อเนื่องทางธุรกิจ (BCP) ด้านการแพทย์และสาธารณสุข สสจ.นราธิวาส ปี 2570
 *  Google Apps Script backend (Code.gs)  —  ใช้คู่กับ Dashboard EOC (index.html)
 * ----------------------------------------------------------------------------
 *  ไฟล์นี้สร้างอัตโนมัติจาก tools/build.js (โครงสร้างฐานข้อมูลมาจาก index.html)
 *  อย่าแก้ส่วน DB ด้วยมือ — แก้ที่ index.html แล้วรัน: node tools/build.js
 *
 *  ความสามารถ
 *   1. setupDatabase()  สร้าง/ซ่อมแซมฐานข้อมูล 19 แท็บ พร้อมหัวตาราง รายการเลือก (Dropdown) รูปแบบข้อมูล
 *   2. Web App API      ping / whoami / readAll / read / create / update / delete / replace / setup / setSharing
 *   3. สิทธิ์ 3 ระดับ     ADMIN (Full) · EDITOR (CRUD) · VIEWER (อ่าน + ปิดบังข้อมูลส่วนบุคคล)
 *   4. ตรวจสอบข้อมูลฝั่งเซิร์ฟเวอร์ (ชนิดข้อมูล, ค่าที่เลือกได้, ช่วงตัวเลข, ค่าซ้ำ) + ล็อกกันเขียนชนกัน
 *   5. บันทึกประวัติทุกการเปลี่ยนแปลงลงแท็บ Log และประทับเวลาเมื่อแก้ไขใน Sheet โดยตรง (onEdit)
 *   6. Auto-sync: ทุกการเปลี่ยนแปลง (CRUD / แก้ใน Sheet / แทรกลบแถว) เพิ่มเลขรุ่น (rev) → Dashboard ถามเลขรุ่นถี่ ๆ แบบเบา แล้วดึงข้อมูลเฉพาะเมื่อมีการเปลี่ยน
 *   7. Auto-update: เมื่อโครงสร้างเปลี่ยน (SCHEMA_VERSION ใหม่) ระบบซ่อมแซมแท็บ/คอลัมน์/Dropdown เองในคำขอแรก + ติดตั้ง Trigger อัตโนมัติ
 *   8. เมนู "BCP นราธิวาส" ใน Google Sheet และฟังก์ชันปลดล็อกการแชร์ไฟล์ (Private / View / Full)
 *
 *  วิธีติดตั้ง
 *   1) เปิด Google Sheet → Extensions → Apps Script → วางโค้ดนี้แทนของเดิม → Save
 *   2) ตั้งรหัสผ่าน: เมนู "BCP นราธิวาส → ตั้งรหัสผ่าน (Token)" หรือรัน setToken('admin','รหัสของคุณ') — รหัสเก็บใน Script Properties ไม่มีอยู่ในซอร์สโค้ด/GitHub
 *   3) เลือกฟังก์ชัน setupDatabase → Run → อนุญาตสิทธิ์ (Sheets, Drive)
 *   4) Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone
 *   5) คัดลอก URL /exec + Token ไปวางในเมนู "Sheet & GAS" ของ Dashboard
 *   * ทุกครั้งที่แก้โค้ด ต้อง Deploy → Manage deployments → Edit → New version
 * ============================================================================
 */

const VERSION = '1.1.0';
/** รหัสโครงสร้างฐานข้อมูล — สร้างอัตโนมัติ; Dashboard เทียบค่านี้เพื่อเตือนเมื่อ Code.gs ล้าสมัย */
const SCHEMA_VERSION = 'gha0yc';

const TZ = 'Asia/Bangkok';
const MAX_TEXT = 2000;

/** โครงสร้างฐานข้อมูล (สร้างโดย tools/build.js) */
const DB = {
  order: ["Config","Rainfall","Districts","GeoLayers","Roads","RoadCuts","BypassRoutes","Vulnerable","EMS","Referral","Comms","Escalation","Hospitals","RPH","Resources","Logistics","Staff","BCP","Log"],
  tabs: {
    Config: { label: "ค่าสถานการณ์จังหวัด", prefix: "CF", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"key","l":"คีย์","t":"text","req":1,"uniq":1},
      {"k":"value","l":"ค่า","t":"text"},
      {"k":"note","l":"คำอธิบาย","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Rainfall: { label: "ปริมาณฝนและพื้นที่เสี่ยง", prefix: "RF", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"as_of","l":"ข้อมูล ณ วันที่","t":"date","req":1},
      {"k":"district","l":"อำเภอ","t":"sel","o":["เมืองนราธิวาส","ตากใบ","บาเจาะ","ยี่งอ","ระแงะ","รือเสาะ","ศรีสาคร","แว้ง","สุคิริน","สุไหงโก-ลก","สุไหงปาดี","จะแนะ","เจาะไอร้อง"],"req":1},
      {"k":"rain24","l":"ฝนสะสม 24 ชม. (มม.)","t":"num"},
      {"k":"rain72","l":"ฝนสะสม 72 ชม. (มม.)","t":"num"},
      {"k":"forecast24","l":"พยากรณ์ฝน 24 ชม. (มม.)","t":"num"},
      {"k":"source","l":"แหล่งข้อมูล","t":"sel","o":["GISTDA","ThaiWater","ปภ.","กรมอุตุนิยมวิทยา","สถานีวัดท้องถิ่น"]},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Districts: { label: "ระดับความเสี่ยงรายอำเภอ", prefix: "DS", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"district","l":"อำเภอ","t":"sel","o":["เมืองนราธิวาส","ตากใบ","บาเจาะ","ยี่งอ","ระแงะ","รือเสาะ","ศรีสาคร","แว้ง","สุคิริน","สุไหงโก-ลก","สุไหงปาดี","จะแนะ","เจาะไอร้อง"],"req":1,"uniq":1},
      {"k":"level","l":"ระดับความเสี่ยง","t":"sel","o":["แดง","ส้ม","เหลือง","เขียว"],"req":1},
      {"k":"trend","l":"แนวโน้ม","t":"sel","o":["↑↑","↑","→","↓"]},
      {"k":"h6","l":"ผลกระทบ 6 ชม.","t":"sel","o":["เสี่ยงสูง","น้ำเพิ่ม","ท่วมขัง","เฝ้าระวัง","ปกติ"]},
      {"k":"h12","l":"ผลกระทบ 12 ชม.","t":"sel","o":["เสี่ยงสูง","น้ำเพิ่ม","ท่วมขัง","เฝ้าระวัง","ปกติ"]},
      {"k":"h24","l":"ผลกระทบ 24 ชม.","t":"sel","o":["เสี่ยงสูง","น้ำเพิ่ม","ท่วมขัง","เฝ้าระวัง","ปกติ"]},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    GeoLayers: { label: "ชั้นข้อมูลภูมิสารสนเทศ (GISTDA / ปภ. / อื่นๆ)", prefix: "GL", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"name","l":"ชื่อชั้นข้อมูล","t":"text","req":1},
      {"k":"provider","l":"หน่วยงานเจ้าของข้อมูล","t":"sel","o":["GISTDA","ปภ.","ThaiWater/สนช.","กรมชลประทาน","อื่นๆ"],"req":1},
      {"k":"type","l":"ชนิดบริการ","t":"sel","o":["ArcGIS MapServer","WMS","XYZ Tile","GeoJSON"],"req":1},
      {"k":"url","l":"URL บริการ","t":"text","req":1},
      {"k":"layers","l":"เลเยอร์ (ArcGIS: เลขเลเยอร์ เช่น 0,1 · WMS: ชื่อเลเยอร์)","t":"text"},
      {"k":"opacity","l":"ความโปร่งใส (0-1)","t":"num","min":0,"max":1},
      {"k":"visible","l":"เปิดแสดงตอนเริ่ม","t":"sel","o":["ใช่","ไม่"]},
      {"k":"note","l":"หมายเหตุ/ที่มา","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Roads: { label: "เส้นทางคมนาคมและเส้นทางสำรอง", prefix: "RD", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"route","l":"เส้นทาง/ถนน/สะพาน","t":"text","req":1},
      {"k":"district","l":"อำเภอ","t":"sel","o":["เมืองนราธิวาส","ตากใบ","บาเจาะ","ยี่งอ","ระแงะ","รือเสาะ","ศรีสาคร","แว้ง","สุคิริน","สุไหงโก-ลก","สุไหงปาดี","จะแนะ","เจาะไอร้อง"]},
      {"k":"lat","l":"lat (จุดที่ตัดขาด/เสี่ยง)","t":"num","min":4,"max":8},
      {"k":"lng","l":"lng","t":"num","min":100,"max":103},
      {"k":"type","l":"ประเภท","t":"sel","o":["หลัก","สำรอง (Bypass)","ทางน้ำ","ทางอากาศ"]},
      {"k":"status","l":"สถานะปัจจุบัน","t":"sel","o":["ผ่านได้","เสี่ยง","ตัดขาด"],"req":1},
      {"k":"cut_history_3y","l":"ประวัติถูกตัดขาดย้อนหลัง 3 ปี","t":"area"},
      {"k":"bypass_route","l":"เส้นทางสำรองที่กำหนด","t":"area"},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    RoadCuts: { label: "ประวัติเส้นทางถูกตัดขาด (ย้อนหลัง 3 ปี)", prefix: "RC", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"route","l":"เส้นทาง/ถนน/สะพาน","t":"text","req":1},
      {"k":"district","l":"อำเภอ","t":"sel","o":["เมืองนราธิวาส","ตากใบ","บาเจาะ","ยี่งอ","ระแงะ","รือเสาะ","ศรีสาคร","แว้ง","สุคิริน","สุไหงโก-ลก","สุไหงปาดี","จะแนะ","เจาะไอร้อง"],"req":1},
      {"k":"date_from","l":"ถูกตัดขาดตั้งแต่","t":"date","req":1},
      {"k":"date_to","l":"เปิดใช้ได้อีกครั้ง","t":"date"},
      {"k":"cause","l":"สาเหตุ","t":"sel","o":["น้ำท่วม","น้ำป่า/ดินสไลด์","สะพาน/ถนนชำรุด","อื่นๆ"],"req":1},
      {"k":"disaster","l":"เหตุการณ์ภัยพิบัติ (เช่น อุทกภัยปลายปี 2568)","t":"text"},
      {"k":"depth_cm","l":"ระดับน้ำสูงสุด (ซม.)","t":"num"},
      {"k":"lat","l":"lat","t":"num","req":1,"min":4,"max":8},
      {"k":"lng","l":"lng","t":"num","req":1,"min":100,"max":103},
      {"k":"impact","l":"ผลกระทบต่อการส่งต่อ/ลงพื้นที่","t":"area"},
      {"k":"bypass_used","l":"เส้นทางสำรองที่ใช้","t":"text"},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    BypassRoutes: { label: "เส้นทางสำรอง (Bypass Routes)", prefix: "BR", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"name","l":"ชื่อเส้นทางสำรอง","t":"text","req":1},
      {"k":"purpose","l":"วัตถุประสงค์","t":"sel","o":["ส่งต่อผู้ป่วย","ลงพื้นที่","ทั้งสองอย่าง"],"req":1},
      {"k":"replaces","l":"เลี่ยงเส้นทางหลัก (ชื่อตรงกับ Roads)","t":"text"},
      {"k":"from_name","l":"ต้นทาง","t":"text","req":1},
      {"k":"to_name","l":"ปลายทาง","t":"text","req":1},
      {"k":"distance_km","l":"ระยะทาง (กม.)","t":"num"},
      {"k":"duration_min","l":"เวลา (นาที)","t":"num"},
      {"k":"vehicle","l":"ยานพาหนะที่ใช้ได้","t":"sel","o":["รถพยาบาล","รถ 4WD/ยกสูง","เรือ","เฮลิคอปเตอร์","ทุกชนิด"]},
      {"k":"status","l":"สถานะ","t":"sel","o":["พร้อมใช้","เสี่ยง","ปิด"],"req":1},
      {"k":"geometry","l":"พิกัดเส้นทาง (lat,lng;lat,lng;…)","t":"area","len":6000,"hide":1},
      {"k":"verified_on","l":"สำรวจยืนยันเมื่อ","t":"date"},
      {"k":"contact","l":"ผู้ประสานงาน/เบอร์","t":"phone"},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Vulnerable: { label: "ทะเบียนกลุ่มเปราะบาง (Priority Evacuation)", prefix: "VN", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"name","l":"ชื่อ-สกุล","t":"text","req":1,"pii":"name"},
      {"k":"group","l":"กลุ่มผู้ป่วย","t":"sel","o":["หญิงตั้งครรภ์เสี่ยงสูง/ใกล้คลอด","ผู้ป่วย Dialysis","Home O2/Ventilator","ผู้ป่วยติดเตียง/พึ่งพาอุปกรณ์","ผู้ป่วยที่ขาดยาไม่ได้","SMI/จิตเวชรุนแรง","Palliative/Device-dependent","อื่นๆ"],"req":1},
      {"k":"address","l":"ที่อยู่","t":"area","req":1,"pii":"addr"},
      {"k":"district","l":"อำเภอ","t":"sel","o":["เมืองนราธิวาส","ตากใบ","บาเจาะ","ยี่งอ","ระแงะ","รือเสาะ","ศรีสาคร","แว้ง","สุคิริน","สุไหงโก-ลก","สุไหงปาดี","จะแนะ","เจาะไอร้อง"],"req":1},
      {"k":"phone","l":"เบอร์โทรที่ติดต่อได้จริง","t":"phone","req":1,"pii":"phone"},
      {"k":"caregiver","l":"ผู้ดูแล/ผู้ติดต่อสำรอง","t":"text","pii":"name"},
      {"k":"evac_priority","l":"ลำดับอพยพ","t":"sel","o":["1","2","3"]},
      {"k":"evac_status","l":"สถานะอพยพ","t":"sel","o":["รอดำเนินการ","กำลังอพยพ","อพยพแล้ว","ไม่ต้องอพยพ"]},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    EMS: { label: "หน่วย EMS และยานพาหนะ", prefix: "EM", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"unit","l":"หน่วย/ชื่อยานพาหนะ","t":"text","req":1},
      {"k":"type","l":"ประเภท","t":"sel","o":["รถพยาบาล","เรือ","เฮลิคอปเตอร์","รถ 4WD/ยกสูง","อื่นๆ"],"req":1},
      {"k":"base","l":"ฐานปฏิบัติการ","t":"text"},
      {"k":"district","l":"อำเภอ","t":"sel","o":["เมืองนราธิวาส","ตากใบ","บาเจาะ","ยี่งอ","ระแงะ","รือเสาะ","ศรีสาคร","แว้ง","สุคิริน","สุไหงโก-ลก","สุไหงปาดี","จะแนะ","เจาะไอร้อง"]},
      {"k":"qty_total","l":"จำนวนทั้งหมด","t":"num"},
      {"k":"qty_ready","l":"พร้อมใช้งาน","t":"num"},
      {"k":"phone","l":"เบอร์ติดต่อ","t":"phone"},
      {"k":"status","l":"สถานะ","t":"sel","o":["พร้อม","จำกัด","ไม่พร้อม"]},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Referral: { label: "ระบบส่งต่อผู้ป่วยฉุกเฉิน (OPOH)", prefix: "RR", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"from_facility","l":"ต้นทาง","t":"text","req":1},
      {"k":"to_facility","l":"ปลายทาง","t":"text","req":1},
      {"k":"route_main","l":"เส้นทางหลัก","t":"area"},
      {"k":"route_bypass","l":"เส้นทางสำรอง/แนวทางกรณีถูกตัดขาด","t":"area"},
      {"k":"transport","l":"พาหนะ","t":"sel","o":["รถพยาบาล","เรือ","เฮลิคอปเตอร์","รถ 4WD"]},
      {"k":"est_min","l":"เวลาโดยประมาณ (นาที)","t":"num"},
      {"k":"status","l":"สถานะเส้นทาง","t":"sel","o":["พร้อม","เสี่ยง","ใช้ไม่ได้"],"req":1},
      {"k":"contact","l":"เบอร์ประสานงาน","t":"phone"},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Comms: { label: "ระบบสื่อสารหลัก/สำรอง", prefix: "CM", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"channel","l":"ช่องทาง/ระบบ","t":"text","req":1},
      {"k":"tier","l":"ลำดับ","t":"sel","o":["หลัก","สำรองลำดับ 1","สำรองลำดับ 2"],"req":1},
      {"k":"system_type","l":"ประเภทระบบ","t":"sel","o":["Line/Social","โทรศัพท์","วิทยุสื่อสาร","ดาวเทียม","อินเทอร์เน็ต","อื่นๆ"]},
      {"k":"owner","l":"ผู้รับผิดชอบ","t":"text"},
      {"k":"phone","l":"เบอร์/ความถี่/ID","t":"text"},
      {"k":"last_test","l":"ทดสอบล่าสุด","t":"date"},
      {"k":"test_result","l":"ผลทดสอบ","t":"sel","o":["ผ่าน","ไม่ผ่าน","ยังไม่ทดสอบ"]},
      {"k":"evidence","l":"หลักฐานการทดสอบ (ลิงก์)","t":"text"},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Escalation: { label: "แผนยกระดับขอรับการสนับสนุน (Escalation)", prefix: "ES", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"level","l":"ระดับ","t":"sel","o":["รพ./รพ.สต.","อำเภอ","จังหวัด","ส่วนกลาง/เขตสุขภาพ"],"req":1},
      {"k":"trigger","l":"เงื่อนไขการยกระดับ","t":"area","req":1},
      {"k":"role","l":"ตำแหน่ง/หน้าที่","t":"text","req":1},
      {"k":"name","l":"ชื่อผู้ประสานงาน","t":"text","pii":"name"},
      {"k":"phone","l":"เบอร์โทร","t":"phone","pii":"phone"},
      {"k":"sla_hr","l":"เวลาตอบสนอง (ชม.)","t":"num"},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Hospitals: { label: "สถานะโรงพยาบาลและเป้าหมายฟื้นฟู (RTO)", prefix: "HP", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"name","l":"โรงพยาบาล","t":"text","req":1,"uniq":1},
      {"k":"tier","l":"ระดับ","t":"sel","o":["A+","A","S+","S","M1","M2","F1","F2","F3"]},
      {"k":"district","l":"อำเภอ","t":"sel","o":["เมืองนราธิวาส","ตากใบ","บาเจาะ","ยี่งอ","ระแงะ","รือเสาะ","ศรีสาคร","แว้ง","สุคิริน","สุไหงโก-ลก","สุไหงปาดี","จะแนะ","เจาะไอร้อง"]},
      {"k":"level","l":"ระดับความเสี่ยง","t":"sel","o":["แดง","ส้ม","เหลือง","เขียว"],"req":1},
      {"k":"ER","l":"ER","t":"sel","o":["G","Y","R","N"]},
      {"k":"LR","l":"LR","t":"sel","o":["G","Y","R","N"]},
      {"k":"OR","l":"OR","t":"sel","o":["G","Y","R","N"]},
      {"k":"ICU","l":"ICU","t":"sel","o":["G","Y","R","N"]},
      {"k":"Dialysis","l":"Dialysis","t":"sel","o":["G","Y","R","N"]},
      {"k":"OPD","l":"OPD/NCD","t":"sel","o":["G","Y","R","N"]},
      {"k":"beds_total","l":"เตียงทั้งหมด","t":"num"},
      {"k":"beds_avail","l":"เตียงว่าง","t":"num"},
      {"k":"autonomy_hr","l":"Autonomy (ชม.)","t":"num"},
      {"k":"rto_hr","l":"เป้าหมายฟื้นฟู RTO (ชม.)","t":"num"},
      {"k":"lat","l":"lat","t":"num"},
      {"k":"lng","l":"lng","t":"num"},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    RPH: { label: "รพ.สต.", prefix: "RP", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"name","l":"รพ.สต.","t":"text","req":1},
      {"k":"district","l":"อำเภอ","t":"sel","o":["เมืองนราธิวาส","ตากใบ","บาเจาะ","ยี่งอ","ระแงะ","รือเสาะ","ศรีสาคร","แว้ง","สุคิริน","สุไหงโก-ลก","สุไหงปาดี","จะแนะ","เจาะไอร้อง"],"req":1},
      {"k":"status","l":"สถานะ","t":"sel","o":["ปกติ","เฝ้าระวัง","เสี่ยง","ปิดให้บริการ"],"req":1},
      {"k":"flood_risk","l":"ความเสี่ยงน้ำท่วม","t":"sel","o":["ต่ำ","กลาง","สูง"]},
      {"k":"phone","l":"เบอร์ติดต่อ","t":"phone"},
      {"k":"lat","l":"lat","t":"num"},
      {"k":"lng","l":"lng","t":"num"},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Resources: { label: "ทรัพยากรและความต่อเนื่อง", prefix: "RS", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"facility","l":"หน่วยบริการ","t":"text","req":1},
      {"k":"category","l":"หมวด","t":"sel","o":["ไฟฟ้าสำรอง","ออกซิเจน","น้ำใช้","ยา/เวชภัณฑ์","เลือด","เชื้อเพลิง","อาหาร","วัสดุอุปกรณ์","อื่นๆ"],"req":1},
      {"k":"item","l":"รายการ","t":"text","req":1},
      {"k":"qty","l":"จำนวน","t":"num"},
      {"k":"unit","l":"หน่วย","t":"text"},
      {"k":"hours_remaining","l":"ใช้ได้อีก (ชม.)","t":"num"},
      {"k":"min_required","l":"ขั้นต่ำที่ต้องมี (ชม.)","t":"num"},
      {"k":"status","l":"สถานะ","t":"sel","o":["พร้อม","เฝ้าระวัง","วิกฤต"],"req":1},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Logistics: { label: "โลจิสติกส์และการสนับสนุน", prefix: "LG", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"resource","l":"รายการ/ทรัพยากร","t":"text","req":1},
      {"k":"qty","l":"จำนวน","t":"num"},
      {"k":"unit","l":"หน่วย","t":"text"},
      {"k":"source","l":"แหล่งสนับสนุน (ทหาร/ปภ./กาชาด/อื่นๆ)","t":"text"},
      {"k":"destination","l":"ปลายทาง","t":"text"},
      {"k":"eta","l":"กำหนดถึง","t":"date"},
      {"k":"status","l":"สถานะ","t":"sel","o":["วางแผน","กำลังขนส่ง","ถึงแล้ว","ล่าช้า"],"req":1},
      {"k":"contact","l":"ผู้ประสานงาน/เบอร์","t":"text"},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Staff: { label: "กำลังคนและทีมตอบโต้", prefix: "ST", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"team","l":"ทีม","t":"sel","o":["ทีม A","ทีม B","ทีม C","สำรอง","อื่นๆ"],"req":1},
      {"k":"facility","l":"หน่วยบริการ","t":"text","req":1},
      {"k":"role","l":"ตำแหน่ง/บทบาท","t":"text","req":1},
      {"k":"name","l":"ชื่อ-สกุล","t":"text","req":1,"pii":"name"},
      {"k":"phone","l":"เบอร์โทร","t":"phone","pii":"phone"},
      {"k":"status","l":"สถานะ","t":"sel","o":["พร้อมปฏิบัติงาน","ปฏิบัติงานอยู่","สำรอง","ไม่พร้อม"],"req":1},
      {"k":"shift","l":"เวร/ช่วงเวลา","t":"text"},
      {"k":"note","l":"หมายเหตุ","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    BCP: { label: "ความก้าวหน้าตามแผน BCP", prefix: "BC", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"no","l":"ข้อที่","t":"num","req":1,"uniq":1},
      {"k":"title","l":"หัวข้อ","t":"text","req":1},
      {"k":"status","l":"สถานะ","t":"sel","o":["รอดำเนินการ","ดำเนินการ","เสร็จสิ้น"],"req":1},
      {"k":"progress","l":"ความคืบหน้า (%)","t":"num","min":0,"max":100},
      {"k":"owner","l":"ผู้รับผิดชอบ","t":"text"},
      {"k":"due","l":"กำหนดเสร็จ","t":"date"},
      {"k":"evidence","l":"หลักฐาน (ลิงก์)","t":"text"},
      {"k":"note","l":"รายละเอียดตามแผน","t":"area"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] },
    Log: { label: "บันทึกการเปลี่ยนแปลง", prefix: "LOG", cols: [
      {"k":"id","l":"รหัส","t":"id"},
      {"k":"ts","l":"เวลา","t":"ts"},
      {"k":"user","l":"ผู้ใช้/บทบาท","t":"ts"},
      {"k":"action","l":"การกระทำ","t":"ts"},
      {"k":"tab","l":"แท็บ","t":"ts"},
      {"k":"row_id","l":"รหัสแถว","t":"ts"},
      {"k":"detail","l":"รายละเอียด","t":"ts"},
      {"k":"updated_at","l":"แก้ไขล่าสุด","t":"ts"},
      {"k":"updated_by","l":"แก้ไขโดย","t":"ts"}
    ] }
  },
  bcpSeed: [
    [1,"การบูรณาการข้อมูลสารสนเทศภูมิศาสตร์","ประยุกต์ใช้ฐานข้อมูลแผนที่พื้นที่เสี่ยงภัยจากสำนักงานพัฒนาเทคโนโลยีอวกาศและภูมิสารสนเทศ (องค์การมหาชน) หรือ GISTDA และกรมป้องกันและบรรเทาสาธารณภัย (ปภ.) เพื่อประกอบการตัดสินใจและประเมินสถานการณ์"],
    [2,"การบริหารจัดการเส้นทางคมนาคม","จัดทำแผนที่ประวัติเส้นทางที่ถูกตัดขาดจากสถานการณ์ภัยพิบัติย้อนหลัง 3 ปี พร้อมกำหนดแผนที่เส้นทางสำรอง (Bypass Routes) สำหรับการลงพื้นที่และการส่งต่อผู้ป่วย"],
    [3,"การประเมินทรัพยากรทางการแพทย์","จัดทำบัญชีและสรุปยอดจำนวนทรัพยากร (Inventory) ที่จำเป็นต่อการให้บริการของโรงพยาบาลและโรงพยาบาลส่งเสริมสุขภาพตำบล (รพ.สต.) แต่ละแห่งให้เป็นปัจจุบัน"],
    [4,"การกำหนดเป้าหมายการฟื้นฟู (RTO)","ประเมินและกำหนดระยะเวลาเป้าหมายในการฟื้นฟูกระบวนการปฏิบัติงาน (Recovery Time Objective: RTO) สำหรับโรงพยาบาลแต่ละแห่ง เพื่อให้สามารถกลับมาให้บริการขั้นวิกฤตได้ตามกำหนด"],
    [5,"การบริหารจัดการกำลังคน (Human Resources)","จัดทำทำเนียบและแผนการบริหารจัดการบุคลากร (Staff) รวมถึงการจัดเตรียมทีมตอบโต้ภาวะฉุกเฉินและกำลังพลสำรอง"],
    [6,"การบริหารจัดการกลุ่มเปราะบาง (Evacuation Plan)","จัดทำฐานข้อมูลและระบุตัวกลุ่มเปราะบางในพื้นที่เสี่ยงที่ต้องได้รับการอพยพเคลื่อนย้ายเป็นลำดับแรก (Priority Evacuation) โดยต้องมีรายละเอียดชื่อ ที่อยู่ และหมายเลขโทรศัพท์ที่สามารถติดต่อได้จริง"],
    [7,"ระบบการส่งต่อผู้ป่วยในภาวะฉุกเฉิน","เตรียมความพร้อมระบบการส่งต่อผู้ป่วย (Referral System) โดยประเมินและวางแผนเส้นทางร่วมกับข้อมูลเส้นทางสำรองจากข้อ 2 พร้อมทั้งกำหนดแนวทางแก้ไขปัญหากรณีเส้นทางถูกตัดขาดอย่างเป็นรูปธรรม"],
    [8,"แผนสำรองด้านการสื่อสาร (Communication Redundancy)","ประเมินความพร้อมและจัดทำแผนระบบการสื่อสารหลักและระบบสำรอง พร้อมแสดงหลักฐานการทดสอบระบบ โดยต้องระบุช่องทางการสื่อสารทดแทนลำดับที่ 1 และลำดับที่ 2 อย่างชัดเจนกรณีระบบหลักขัดข้อง (System Down)"],
    [9,"แผนยกระดับการขอรับการสนับสนุน (Escalation Plan)","กำหนดแนวทางการบริหารจัดการและขั้นตอนการประสานขอกำลังสนับสนุนจากส่วนกลางระดับจังหวัด กรณีสถานการณ์ยืดเยื้อเกินกว่าระยะเวลาฟื้นฟู (RTO) หรือทรัพยากรสำรองในระดับพื้นที่ถูกใช้จนหมด"]
  ],
  configSeed: [["level","ระดับสถานการณ์จังหวัด (0-3)"],["level_name","ชื่อระดับ เช่น PRE-ACTIVATE BCP"],["level_note","ข้อความสถานการณ์ เช่น เฝ้าระวัง : เตรียมพร้อม"],["deaths","จำนวนผู้เสียชีวิตจากน้ำท่วม (ราย)"],["as_of","วันเวลาประเมินสถานการณ์"]]
};

/* ───────────────────────────── Utilities ───────────────────────────── */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function nowIso_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
const ROLES = ['admin', 'editor', 'viewer'];
const MIN_TOKEN = 4;

/** รหัสผ่านเก็บใน Script Properties (TOKEN_ADMIN / TOKEN_EDITOR / TOKEN_VIEWER) เท่านั้น — ไม่มีรหัสใดอยู่ในซอร์สโค้ดนี้ */
function tokenOf_(role) { return PropertiesService.getScriptProperties().getProperty('TOKEN_' + role.toUpperCase()) || ''; }
function hasToken_(role) { return tokenOf_(role).length >= MIN_TOKEN; }

/** ตั้งรหัสจาก Apps Script editor: setToken('admin', 'รหัสของคุณ') */
function setToken(role, value) {
  role = String(role || '').toLowerCase();
  if (ROLES.indexOf(role) < 0) throw new Error("role ต้องเป็น 'admin' | 'editor' | 'viewer'");
  value = String(value || '');
  if (value.length < MIN_TOKEN) throw new Error('รหัสต้องยาวอย่างน้อย ' + MIN_TOKEN + ' ตัวอักษร');
  PropertiesService.getScriptProperties().setProperty('TOKEN_' + role.toUpperCase(), value);
}
/** ปิดสิทธิ์ของ role นั้น (ลบรหัส) */
function clearToken(role) { PropertiesService.getScriptProperties().deleteProperty('TOKEN_' + String(role).toUpperCase()); }

/** เมนู: ตั้งรหัสผ่านทีละระดับ (เว้นว่าง = ไม่เปลี่ยน · พิมพ์ - = ปิดสิทธิ์) */
function setTokens() {
  const ui = SpreadsheetApp.getUi(), done = [];
  for (let i = 0; i < ROLES.length; i++) {
    const r = ROLES[i];
    const a = ui.prompt('ตั้งรหัสผ่าน ' + r.toUpperCase() + ' (' + (hasToken_(r) ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง') + ')', 'อย่างน้อย ' + MIN_TOKEN + ' ตัวอักษร · เว้นว่าง = ไม่เปลี่ยน · พิมพ์ - = ปิดสิทธิ์นี้', ui.ButtonSet.OK_CANCEL);
    if (a.getSelectedButton() !== ui.Button.OK) break;
    const v = a.getResponseText();
    if (!v) continue;
    if (v === '-') { clearToken(r); done.push(r.toUpperCase() + ' ปิดแล้ว'); continue; }
    try { setToken(r, v); done.push(r.toUpperCase() + ' ตั้งแล้ว'); } catch (e) { ui.alert(e.message); }
  }
  ui.alert(done.length ? done.join('\n') : 'ไม่มีการเปลี่ยนแปลง');
}

/** เลขรุ่นข้อมูล: เปลี่ยนทุกครั้งที่มีการเขียน เพื่อให้ Dashboard รู้ว่าต้อง Pull */
function getRev_() { return PropertiesService.getScriptProperties().getProperty('REV') || '0'; }
function bumpRev_() {
  try { PropertiesService.getScriptProperties().setProperty('REV', String(Date.now()) + Math.random().toString(36).slice(2, 5)); } catch (e) { /* ignore */ }
}

/** ถ้าโครงสร้างเปลี่ยนจากที่เคย apply ไว้ → ซ่อมแซมฐานข้อมูลอัตโนมัติ (ทำงานครั้งเดียวต่อเวอร์ชัน) */
function ensureSchema_() {
  const P = PropertiesService.getScriptProperties();
  if (P.getProperty('SCHEMA_APPLIED') === SCHEMA_VERSION) return false;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (P.getProperty('SCHEMA_APPLIED') === SCHEMA_VERSION) return false;
    setupDatabase_();
    P.setProperty('SCHEMA_APPLIED', SCHEMA_VERSION);
    bumpRev_();
    return true;
  } finally { lock.releaseLock(); }
}

/** คืนค่า 'admin' | 'editor' | 'viewer' | 'none' */
function roleOf_(token) {
  if (!token) return 'none';
  const t = String(token);
  const roles = ['admin', 'editor', 'viewer'];
  for (let i = 0; i < roles.length; i++) {
    if (hasToken_(roles[i]) && tokenOf_(roles[i]) === t) return roles[i];
  }
  return 'none';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(msg, code) { return json_({ ok: false, error: msg, code: code || 400 }); }

function colsOf_(tab) { return DB.tabs[tab].cols; }
function dataCols_(tab) { return colsOf_(tab).filter(function (c) { return c.t !== 'id' && c.t !== 'ts'; }); }

function newId_(tab) {
  return DB.tabs[tab].prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
}

function mask_(kind, v) {
  v = String(v == null ? '' : v);
  if (!v) return v;
  if (kind === 'phone') return v.length > 4 ? '•••-•••-' + v.slice(-4) : '••••';
  if (kind === 'addr') return '••••• (ปิดบัง)';
  return v.slice(0, 2) + '•••••';
}

function cellToString_(v, col) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, TZ, col && col.t === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss");
  }
  return String(v);
}

function sheetOf_(tab) {
  const sh = ss_().getSheetByName(tab);
  if (!sh) throw new Error('ไม่พบแท็บ "' + tab + '" — รัน setupDatabase ก่อน');
  return sh;
}

function headerOf_(sh) {
  const lastCol = Math.max(1, sh.getLastColumn());
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}

/** อ่านทุกแถวของแท็บเป็น array ของ object (คีย์ตามหัวตาราง) */
function readTab_(tab, role) {
  const sh = ss_().getSheetByName(tab);
  if (!sh) return null;
  const last = sh.getLastRow();
  if (last < 2) return [];
  const head = headerOf_(sh);
  const vals = sh.getRange(2, 1, last - 1, head.length).getValues();
  const cols = {};
  colsOf_(tab).forEach(function (c) { cols[c.k] = c; });
  const out = [];
  vals.forEach(function (r) {
    const o = {};
    head.forEach(function (h, i) {
      if (!cols[h]) return;
      let v = cellToString_(r[i], cols[h]);
      if (role === 'viewer' && cols[h].pii) v = mask_(cols[h].pii, v);
      o[h] = v;
    });
    if (o.id) out.push(o);
  });
  return out;
}

/** หา index แถว (1-based) ของ id */
function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const head = headerOf_(sh);
  const ci = head.indexOf('id');
  if (ci < 0) throw new Error('แท็บไม่มีคอลัมน์ id');
  const ids = sh.getRange(2, ci + 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function rowToValues_(tab, sh, obj) {
  const head = headerOf_(sh);
  const cols = {};
  colsOf_(tab).forEach(function (c) { cols[c.k] = c; });
  return head.map(function (h) {
    const c = cols[h];
    let v = obj[h] === undefined || obj[h] === null ? '' : obj[h];
    if (c && c.t === 'num' && v !== '') v = Number(v);
    return v;
  });
}

/** ตรวจสอบข้อมูลทั้งแถว คืนข้อความผิดพลาด หรือ '' ถ้าถูกต้อง */
function validateRow_(tab, row, existing) {
  const cols = dataCols_(tab);
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    let v = row[c.k];
    v = v === undefined || v === null ? '' : String(v).trim();
    row[c.k] = v;
    if (v.length > (c.len || MAX_TEXT)) return '"' + c.l + '" ยาวเกิน ' + (c.len || MAX_TEXT) + ' ตัวอักษร';
    if (c.req && !v) return 'กรุณากรอก "' + c.l + '"';
    if (!v) continue;
    if (c.t === 'num') {
      if (isNaN(Number(v))) return '"' + c.l + '" ต้องเป็นตัวเลข';
      if (c.min !== undefined && (Number(v) < c.min || Number(v) > c.max)) return '"' + c.l + '" ต้องอยู่ระหว่าง ' + c.min + '–' + c.max;
    }
    if (c.t === 'sel' && c.o && c.o.indexOf(v) < 0) return '"' + c.l + '" ไม่อยู่ในรายการที่กำหนด: ' + v;
    if (c.t === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return '"' + c.l + '" ต้องเป็นรูปแบบ yyyy-mm-dd';
    if (c.t === 'phone' && !/^[0-9+\-\s()#,]{5,30}$/.test(v)) return '"' + c.l + '" รูปแบบเบอร์โทรไม่ถูกต้อง';
    if (c.uniq && existing) {
      for (let j = 0; j < existing.length; j++) {
        if (String(existing[j][c.k]) === v && existing[j].id !== row.id) return '"' + c.l + '" = ' + v + ' มีอยู่แล้ว';
      }
    }
  }
  return '';
}

function log_(role, action, tab, rowId, detail) {
  try {
    const sh = ss_().getSheetByName('Log');
    if (!sh) return;
    const o = { id: newId_('Log'), ts: nowIso_(), user: role, action: action, tab: tab, row_id: rowId || '', detail: String(detail || '').slice(0, 500), updated_at: '', updated_by: '' };
    sh.appendRow(rowToValues_('Log', sh, o));
  } catch (e) { /* ไม่ให้ log ทำให้คำสั่งหลักล้มเหลว */ }
}

function meta_() {
  const ss = ss_();
  const tabs = {};
  DB.order.forEach(function (t) {
    const sh = ss.getSheetByName(t);
    tabs[t] = sh ? Math.max(0, sh.getLastRow() - 1) : null;
  });
  return { id: ss.getId(), name: ss.getName(), url: ss.getUrl(), tabs: tabs, version: VERSION };
}

/* ───────────────────────────── Web App ───────────────────────────── */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action || 'ping';
    const role = roleOf_(p.token);
    if (role !== 'none') ensureSchema_();
    if (action === 'ping') {
      const m = meta_();
      return json_({ ok: true, version: VERSION, schemaVersion: SCHEMA_VERSION, rev: getRev_(), name: m.name, url: m.url, id: m.id, tabs: m.tabs, role: role, tokensSet: ROLES.filter(hasToken_).length });
    }
    if (action === 'whoami') return json_({ ok: true, role: role });
    if (role === 'none') return fail_('Token ไม่ถูกต้องหรือยังไม่ได้ตั้งรหัสใน Code.gs', 401);
    if (action === 'rev') return json_({ ok: true, rev: getRev_(), schemaVersion: SCHEMA_VERSION, role: role });
    if (action === 'schema') return json_({ ok: true, schema: DB });
    if (action === 'readAll') {
      const data = {};
      DB.order.forEach(function (t) { const r = readTab_(t, role); if (r) data[t] = r; });
      return json_({ ok: true, role: role, rev: getRev_(), schemaVersion: SCHEMA_VERSION, data: data, meta: meta_() });
    }
    if (action === 'read') {
      if (!DB.tabs[p.tab]) return fail_('ไม่รู้จักแท็บ ' + p.tab);
      return json_({ ok: true, role: role, rows: readTab_(p.tab, role) || [] });
    }
    return fail_('ไม่รู้จักคำสั่ง ' + action);
  } catch (err) { return fail_(String(err && err.message || err), 500); }
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (x) { return fail_('รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น JSON)'); }
  const role = roleOf_(body.token);
  const action = body.action;
  if (role === 'none') return fail_('Token ไม่ถูกต้อง หรือยังไม่ได้ตั้งรหัสใน Code.gs', 401);
  const need = { create: 'editor', update: 'editor', delete: 'editor', replace: 'admin', setup: 'admin', setSharing: 'admin', whoami: 'viewer', ping: 'viewer' };
  const rank = { viewer: 1, editor: 2, admin: 3 };
  if (!need[action]) return fail_('ไม่รู้จักคำสั่ง ' + action);
  if (rank[role] < rank[need[action]]) return fail_('สิทธิ์ ' + role.toUpperCase() + ' ไม่เพียงพอ (ต้องการ ' + need[action].toUpperCase() + ')', 403);

  try { ensureSchema_(); } catch (x) { return fail_('ซ่อมแซมฐานข้อมูลไม่สำเร็จ: ' + x.message, 500); }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (x) { return fail_('ระบบกำลังประมวลผลคำสั่งอื่น กรุณาลองใหม่', 503); }
  try {
    if (action === 'whoami' || action === 'ping') return json_({ ok: true, role: role, version: VERSION, schemaVersion: SCHEMA_VERSION, rev: getRev_() });
    if (action === 'setup') { const msg = setupDatabase_(); PropertiesService.getScriptProperties().setProperty('SCHEMA_APPLIED', SCHEMA_VERSION); bumpRev_(); log_(role, 'setup', '', '', msg); return json_({ ok: true, message: msg, rev: getRev_() }); }
    if (action === 'setSharing') { const msg = setSharing_(body.mode); log_(role, 'setSharing', '', '', msg); return json_({ ok: true, message: msg }); }

    const tab = body.tab;
    if (!DB.tabs[tab]) return fail_('ไม่รู้จักแท็บ ' + tab);
    if (tab === 'Log') return fail_('แท็บ Log เขียนได้เฉพาะระบบ');
    const sh = sheetOf_(tab);

    if (action === 'create') {
      const row = body.row || {};
      row.id = row.id || newId_(tab);
      if (findRow_(sh, row.id) > 0) return fail_('รหัส ' + row.id + ' มีอยู่แล้ว');
      const er = validateRow_(tab, row, readTab_(tab, 'admin'));
      if (er) return fail_(er);
      row.updated_at = nowIso_(); row.updated_by = role;
      sh.appendRow(rowToValues_(tab, sh, row));
      log_(role, 'create', tab, row.id, JSON.stringify(row).slice(0, 300));
      bumpRev_();
      return json_({ ok: true, row: row, rev: getRev_() });
    }
    if (action === 'update') {
      const row = body.row || {};
      if (!row.id) return fail_('ต้องระบุ id');
      const idx = findRow_(sh, row.id);
      if (idx < 0) return fail_('ไม่พบรหัส ' + row.id + ' (อาจถูกลบไปแล้ว — กด Pull)');
      const all = readTab_(tab, 'admin');
      const cur = all.filter(function (r) { return r.id === row.id; })[0] || {};
      const merged = {};
      Object.keys(cur).forEach(function (k) { merged[k] = cur[k]; });
      dataCols_(tab).forEach(function (c) { if (row[c.k] !== undefined) merged[c.k] = row[c.k]; });
      const er = validateRow_(tab, merged, all);
      if (er) return fail_(er);
      merged.updated_at = nowIso_(); merged.updated_by = role;
      const vals = rowToValues_(tab, sh, merged);
      sh.getRange(idx, 1, 1, vals.length).setValues([vals]);
      log_(role, 'update', tab, merged.id, JSON.stringify(row).slice(0, 300));
      bumpRev_();
      return json_({ ok: true, row: merged, rev: getRev_() });
    }
    if (action === 'delete') {
      const id = (body.row && body.row.id) || body.id;
      if (!id) return fail_('ต้องระบุ id');
      const idx = findRow_(sh, id);
      if (idx < 0) return fail_('ไม่พบรหัส ' + id);
      sh.deleteRow(idx);
      log_(role, 'delete', tab, id, '');
      bumpRev_();
      return json_({ ok: true, id: id, rev: getRev_() });
    }
    if (action === 'replace') {
      const rows = body.rows || [];
      const seen = {};
      for (let i = 0; i < rows.length; i++) {
        rows[i].id = rows[i].id || newId_(tab);
        if (seen[rows[i].id]) return fail_('รหัสซ้ำในข้อมูลที่ส่งมา: ' + rows[i].id);
        seen[rows[i].id] = 1;
        const er = validateRow_(tab, rows[i], null);
        if (er) return fail_('แถวที่ ' + (i + 1) + ': ' + er);
        rows[i].updated_at = rows[i].updated_at || nowIso_();
        rows[i].updated_by = rows[i].updated_by || role;
      }
      const last = sh.getLastRow();
      if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
      if (rows.length) {
        const vals = rows.map(function (r) { return rowToValues_(tab, sh, r); });
        sh.getRange(2, 1, vals.length, vals[0].length).setValues(vals);
      }
      log_(role, 'replace', tab, '', rows.length + ' แถว');
      bumpRev_();
      return json_({ ok: true, count: rows.length, rev: getRev_() });
    }
    return fail_('ไม่รู้จักคำสั่ง ' + action);
  } catch (err) {
    return fail_(String(err && err.message || err), 500);
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── สร้าง/ซ่อมแซมฐานข้อมูล ───────────────────────── */

/** รันจาก Apps Script editor หรือเมนู BCP นราธิวาส */
function setupDatabase() {
  const msg = setupDatabase_();
  PropertiesService.getScriptProperties().setProperty('SCHEMA_APPLIED', SCHEMA_VERSION);
  bumpRev_();
  try { SpreadsheetApp.getUi().alert('BCP นราธิวาส', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
}

function setupDatabase_() {
  const ss = ss_();
  const created = [], repaired = [];
  DB.order.forEach(function (tab) {
    const def = DB.tabs[tab];
    let sh = ss.getSheetByName(tab);
    let isNew = false;
    if (!sh) { sh = ss.insertSheet(tab); isNew = true; created.push(tab); }
    // หัวตาราง = คีย์ภาษาอังกฤษ (แถว 1) — ตัวแอปอ่านตามชื่อหัว ไม่ขึ้นกับลำดับคอลัมน์
    let head = sh.getLastColumn() > 0 ? headerOf_(sh) : [];
    if (!head.length || (head.length === 1 && head[0] === '')) {
      head = def.cols.map(function (c) { return c.k; });
      sh.getRange(1, 1, 1, head.length).setValues([head]);
    } else {
      const missing = def.cols.filter(function (c) { return head.indexOf(c.k) < 0; });
      if (missing.length) {
        sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing.map(function (c) { return c.k; })]);
        head = head.concat(missing.map(function (c) { return c.k; }));
        if (!isNew) repaired.push(tab + ' (+' + missing.length + ' คอลัมน์)');
      }
    }
    const rowsN = Math.max(sh.getMaxRows() - 1, 1);
    const hr = sh.getRange(1, 1, 1, head.length);
    hr.setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff').setHorizontalAlignment('center');
    sh.setFrozenRows(1);
    head.forEach(function (h, i) {
      const c = def.cols.filter(function (x) { return x.k === h; })[0];
      if (!c) return;
      const colRange = sh.getRange(2, i + 1, rowsN, 1);
      hr.getCell(1, i + 1).setNote(c.l + (c.req ? ' (จำเป็น)' : '') + (c.pii ? ' · ข้อมูลส่วนบุคคล' : '') + (c.t === 'date' ? ' · รูปแบบ yyyy-mm-dd' : ''));
      colRange.setNumberFormat(c.t === 'num' ? 'General' : '@');
      if (c.t === 'sel' && c.o) {
        colRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(c.o, true).setAllowInvalid(false).build());
      }
      sh.setColumnWidth(i + 1, c.t === 'area' ? 280 : c.t === 'id' ? 120 : c.t === 'ts' ? 150 : 130);
    });
    if (tab === 'Log') sh.setTabColor('#64748b'); else if (isNew) sh.setTabColor('#38bdf8');
  });

  // ข้อมูลตั้งต้น (นิยามแผน ไม่ใช่ข้อมูลสถานการณ์): หัวข้อ BCP 9 ข้อ + คีย์ Config
  const bcp = ss.getSheetByName('BCP');
  if (bcp.getLastRow() < 2) {
    const rows = DB.bcpSeed.map(function (s) {
      return rowToValues_('BCP', bcp, { id: 'BC-' + ('0' + s[0]).slice(-2), no: s[0], title: s[1], status: 'รอดำเนินการ', progress: 0, owner: '', due: '', evidence: '', note: s[2], updated_at: nowIso_(), updated_by: 'setup' });
    });
    bcp.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  const cfg = ss.getSheetByName('Config');
  if (cfg.getLastRow() < 2) {
    const rows = DB.configSeed.map(function (s) {
      return rowToValues_('Config', cfg, { id: 'CF-' + s[0].toUpperCase(), key: s[0], value: '', note: s[1], updated_at: nowIso_(), updated_by: 'setup' });
    });
    cfg.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  // ลบ Sheet1 เริ่มต้นถ้าว่าง
  const def1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (def1 && def1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def1);
  try { ss.setActiveSheet(ss.getSheetByName('Config')); } catch (e) { /* ไม่มี UI */ }
  const trg = installAutoTriggers_();
  const rolesReady = ROLES.filter(hasToken_);
  return 'ฐานข้อมูลพร้อมใช้งาน — สร้างใหม่ ' + created.length + ' แท็บ' + (created.length ? ' (' + created.join(', ') + ')' : '') +
    (repaired.length ? ' · ซ่อมแซม: ' + repaired.join(', ') : '') +
    ' · Auto-sync trigger: ' + trg + ' · Token ที่ตั้งแล้ว: ' + (rolesReady.length ? rolesReady.join(', ').toUpperCase() : 'ยังไม่มี (เมนู BCP นราธิวาส → ตั้งรหัสผ่าน)');
}

/* ───────────────────────── สิทธิ์การแชร์ไฟล์ ───────────────────────── */

function setSharing_(mode) {
  const file = DriveApp.getFileById(ss_().getId());
  if (mode === 'EDIT') { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT); return 'เปิดสิทธิ์: ผู้มีลิงก์แก้ไขได้ (Full)'; }
  if (mode === 'VIEW') { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); return 'เปิดสิทธิ์: ผู้มีลิงก์ดูได้ (Viewer)'; }
  if (mode === 'PRIVATE') { file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); return 'ตั้งเป็นส่วนตัว (เฉพาะผู้ที่ได้รับเชิญ)'; }
  throw new Error('mode ต้องเป็น PRIVATE | VIEW | EDIT');
}
function lockSharingPrivate() { alert_(setSharing_('PRIVATE')); }
function unlockSharingView() { alert_(setSharing_('VIEW')); }
function unlockSharingFull() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('ยืนยันเปิดสิทธิ์ Full', 'ใครก็ตามที่มีลิงก์จะแก้ไข/ลบข้อมูลทั้งไฟล์ได้ รวมข้อมูลส่วนบุคคลของกลุ่มเปราะบาง\nต้องการดำเนินการต่อหรือไม่?', ui.ButtonSet.YES_NO);
  if (r === ui.Button.YES) alert_(setSharing_('EDIT'));
}
function alert_(m) { try { SpreadsheetApp.getUi().alert(m); } catch (e) { Logger.log(m); } }

/* ───────────────────────── Auto-sync / Auto-maintenance ───────────────────────── */

/** ติดตั้ง Trigger อัตโนมัติ (ไม่ติดตั้งซ้ำ): onChange → bump rev · รายชั่วโมง → ดูแลระบบ */
function installAutoTriggers_() {
  try {
    const have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    const added = [];
    if (have.indexOf('onChangeInstalled_') < 0) { ScriptApp.newTrigger('onChangeInstalled_').forSpreadsheet(ss_()).onChange().create(); added.push('onChange'); }
    if (have.indexOf('autoMaintenance_') < 0) { ScriptApp.newTrigger('autoMaintenance_').timeBased().everyHours(1).create(); added.push('รายชั่วโมง'); }
    return added.length ? 'ติดตั้ง ' + added.join(' + ') : 'พร้อมแล้ว';
  } catch (e) { return 'ติดตั้งไม่ได้ (' + e.message + ') — รัน installAutoTriggers เอง'; }
}
function installAutoTriggers() { alert_(installAutoTriggers_()); }

/** ทุกการเปลี่ยนแปลงใน Sheet (แก้มือ/แทรก/ลบ/วาง) → เพิ่ม rev เพื่อให้ Dashboard ซิงก์ */
function onChangeInstalled_() { bumpRev_(); }

/** ดูแลระบบรายชั่วโมง: ซ่อมโครงสร้างถ้าถูกแก้ + จำกัดขนาด Log */
function autoMaintenance_() {
  ensureSchema_();
  const sh = ss_().getSheetByName('Log');
  if (sh && sh.getLastRow() > 5500) {
    sh.deleteRows(2, sh.getLastRow() - 5001);
    bumpRev_();
  }
}

/* ───────────────────────── เมนู / Trigger ───────────────────────── */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('BCP นราธิวาส')
    .addItem('🏗 สร้าง/ซ่อมแซมฐานข้อมูล', 'setupDatabase')
    .addItem('🔑 ตั้งรหัสผ่าน (Token)', 'setTokens')
    .addItem('🔄 ติดตั้ง Auto-sync Trigger', 'installAutoTriggers')
    .addItem('ℹ ตรวจสอบสถานะระบบ', 'showStatus')
    .addSeparator()
    .addItem('🔒 แชร์: ส่วนตัว', 'lockSharingPrivate')
    .addItem('👁 แชร์: ผู้มีลิงก์ดูได้', 'unlockSharingView')
    .addItem('🔓 แชร์: ผู้มีลิงก์แก้ไขได้ (Full)', 'unlockSharingFull')
    .addToUi();
}

function showStatus() {
  const m = meta_();
  const roles = ROLES.map(function (r) { return r.toUpperCase() + ': ' + (hasToken_(r) ? '✅ ตั้งแล้ว' : '❌ ยังไม่ได้ตั้งรหัส'); });
  const tabs = DB.order.map(function (t) { return (m.tabs[t] === null ? '❌ ' : '✅ ') + t + (m.tabs[t] === null ? '' : ' (' + m.tabs[t] + ')'); });
  alert_('เวอร์ชัน ' + VERSION + ' · สคีมา ' + SCHEMA_VERSION + ' · rev ' + getRev_() + '\n\nสิทธิ์\n' + roles.join('\n') + '\n\nแท็บ\n' + tabs.join('\n'));
}

/** ประทับเวลาเมื่อมีการแก้ไขโดยตรงใน Sheet (Simple trigger) */
function onEdit(e) {
  try {
    const sh = e.range.getSheet();
    const tab = sh.getName();
    if (!DB.tabs[tab] || tab === 'Log' || e.range.getRow() < 2) return;
    const head = headerOf_(sh);
    const a = head.indexOf('updated_at'), b = head.indexOf('updated_by');
    const r = e.range.getRow();
    if (a >= 0 && e.range.getColumn() !== a + 1) sh.getRange(r, a + 1).setValue(nowIso_());
    if (b >= 0 && e.range.getColumn() !== b + 1) sh.getRange(r, b + 1).setValue('sheet');
    const ci = head.indexOf('id');
    if (ci >= 0 && !sh.getRange(r, ci + 1).getValue()) sh.getRange(r, ci + 1).setValue(newId_(tab));
    bumpRev_();
  } catch (x) { /* ignore */ }
}

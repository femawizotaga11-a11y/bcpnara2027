// ทดสอบตรรกะ Code.gs ด้วยตัวจำลอง Google Apps Script (ไม่ต้องใช้บัญชี Google)
// ใช้: node tools/test_gas.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

// ---- mock services ----
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() { const o = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push((this.sh.d[this.r - 1 + i] || [])[this.c - 1 + j] ?? ''); o.push(row); } return o; }
  setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { const R = this.r - 1 + i; (this.sh.d[R] = this.sh.d[R] || [])[this.c - 1 + j] = x; })); return this; }
  setValue(x) { return this.setValues([[x]]); }
  getValue() { return this.getValues()[0][0]; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (this.sh.d[this.r - 1 + i]) this.sh.d[this.r - 1 + i][this.c - 1 + j] = ''; this.sh.trim(); return this; }
  getCell() { return this; } getSheet() { return this.sh; } getRow() { return this.r; } getColumn() { return this.c; }
}
['setFontWeight', 'setBackground', 'setFontColor', 'setHorizontalAlignment', 'setNote', 'setNumberFormat', 'setDataValidation'].forEach(m => Range.prototype[m] = function () { this.sh.calls[m] = (this.sh.calls[m] || 0) + 1; return this; });
class Sheet {
  constructor(name) { this.name = name; this.d = []; this.calls = {}; }
  trim() { while (this.d.length && this.d[this.d.length - 1].every(x => x === '' || x == null)) this.d.pop(); }
  getName() { return this.name; }
  getLastRow() { return this.d.length; }
  getLastColumn() { return this.d.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return 1000; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  appendRow(a) { this.d.push(a); }
  deleteRow(i) { this.d.splice(i - 1, 1); }
  deleteRows(i, n) { this.d.splice(i - 1, n); }
  setFrozenRows() {} setColumnWidth() {} setTabColor() {}
}
const sheets = {};
const ssObj = { getId: () => 'SSID', getName: () => 'TestBook', getUrl: () => 'https://docs.google.com/spreadsheets/d/SSID/edit',
  getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet(n)), getSheets: () => Object.values(sheets), deleteSheet() {}, setActiveSheet() {} };
const props = {};
const sharing = [];
global.SpreadsheetApp = { getActiveSpreadsheet: () => ssObj, newDataValidation: () => ({ requireValueInList() { return this; }, setAllowInvalid() { return this; }, build() { return {}; } }), getUi: () => { throw new Error('no ui'); } };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) };
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
global.Utilities = { formatDate: (d, tz, f) => d.toISOString().slice(0, f.startsWith('yyyy-MM-dd\'T') ? 19 : 10) };
global.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; }, getContent: () => t }) };
global.DriveApp = { Access: { ANYONE_WITH_LINK: 'ANY', PRIVATE: 'PRIV' }, Permission: { EDIT: 'EDIT', VIEW: 'VIEW', NONE: 'NONE' }, getFileById: () => ({ setSharing: (a, p) => sharing.push([a, p]) }) };
global.Logger = { log() {} };
const triggers = [];
global.ScriptApp = { getProjectTriggers: () => triggers.map(h => ({ getHandlerFunction: () => h })),
  newTrigger: h => { const o = { forSpreadsheet() { return o; }, onChange() { return o; }, timeBased() { return o; }, everyHours() { return o; }, create() { triggers.push(h); } }; return o; } };

// โหลด Code.gs แล้วเปิดเผยฟังก์ชันที่ต้องทดสอบ
const api = new Function(code + '\nreturn {doGet,doPost,setupDatabase_,TOKENS,DB,SCHEMA_VERSION,autoMaintenance_,onChangeInstalled_,installAutoTriggers_};')();
const post = (o) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(o) } }).getContent());
const get = (p) => JSON.parse(api.doGet({ parameter: p }).getContent());
let n = 0; const ok = (name, fn) => { try { fn(); n++; console.log('  ✓', name); } catch (e) { console.log('  ✗', name, '\n    ', e.message); process.exitCode = 1; } };

console.log('Code.gs tests');
ok('ปฏิเสธทุกคำสั่งเมื่อยังไม่ได้ตั้ง Token (ค่าเริ่มต้น)', () => {
  assert.strictEqual(post({ action: 'create', token: api.TOKENS.viewer, tab: 'Roads', row: {} }).code, 401);
  assert.strictEqual(get({ action: 'readAll', token: api.TOKENS.viewer }).ok, false);
});
ok("ADMIN = EDITOR = 'admin' ตามที่ตั้งใน Code.gs: รหัสเดียวได้สิทธิ์ ADMIN, VIEWER ยังปิด", () => {
  assert.strictEqual(api.TOKENS.admin, 'admin'); assert.strictEqual(api.TOKENS.editor, 'admin');
  assert.strictEqual(get({ action: 'whoami', token: 'admin' }).role, 'admin');
  assert.strictEqual(get({ action: 'whoami', token: api.TOKENS.viewer }).role, 'none');
});
props.TOKEN_ADMIN = 'A1'; props.TOKEN_EDITOR = 'E1'; props.TOKEN_VIEWER = 'V1';
ok('ping ใช้ได้โดยไม่ต้องมี token', () => assert.strictEqual(get({ action: 'ping' }).ok, true));
ok('whoami คืนบทบาทถูกต้อง', () => { assert.strictEqual(get({ action: 'whoami', token: 'A1' }).role, 'admin'); assert.strictEqual(get({ action: 'whoami', token: 'x' }).role, 'none'); });
ok('setup สร้างครบ 16 แท็บ + seed BCP 9 ข้อ + Config 5 คีย์', () => {
  const r = post({ action: 'setup', token: 'A1' }); assert.ok(r.ok, r.error);
  assert.strictEqual(Object.keys(sheets).length, 16);
  assert.strictEqual(sheets.BCP.getLastRow(), 10); assert.strictEqual(sheets.Config.getLastRow(), 6);
  assert.deepStrictEqual(sheets.Hospitals.d[0].slice(0, 3), ['id', 'name', 'tier']);
});
ok('setup รันซ้ำไม่สร้างข้อมูล seed ซ้ำ', () => { post({ action: 'setup', token: 'A1' }); assert.strictEqual(sheets.BCP.getLastRow(), 10); });
ok('EDITOR สร้างแถวได้ + id/updated ถูกประทับ', () => {
  const r = post({ action: 'create', token: 'E1', tab: 'Roads', row: { route: 'ถนนสายหลัก A', status: 'ตัดขาด', type: 'หลัก' } });
  assert.ok(r.ok, r.error); assert.ok(/^RD-/.test(r.row.id)); assert.strictEqual(r.row.updated_by, 'editor'); global.rid = r.row.id;
});
ok('ตรวจค่าที่ไม่อยู่ในรายการเลือก', () => assert.ok(/ไม่อยู่ในรายการ/.test(post({ action: 'create', token: 'E1', tab: 'Roads', row: { route: 'x', status: 'พัง' } }).error)));
ok('ตรวจฟิลด์จำเป็น', () => assert.ok(/กรุณากรอก/.test(post({ action: 'create', token: 'E1', tab: 'Roads', row: { status: 'ผ่านได้' } }).error)));
ok('ตรวจตัวเลข/ช่วง (BCP progress 0-100)', () => {
  assert.ok(/ระหว่าง/.test(post({ action: 'create', token: 'E1', tab: 'BCP', row: { no: 20, title: 't', status: 'ดำเนินการ', progress: 150 } }).error));
  assert.ok(/ตัวเลข/.test(post({ action: 'create', token: 'E1', tab: 'Hospitals', row: { name: 'x', level: 'แดง', autonomy_hr: 'abc' } }).error));
});
ok('ตรวจค่าซ้ำ (uniq): ชื่อ รพ./อำเภอ/เลขข้อ BCP', () => {
  assert.ok(post({ action: 'create', token: 'E1', tab: 'Hospitals', row: { name: 'นราธิวาส', level: 'ส้ม', autonomy_hr: 48, rto_hr: 24 } }).ok);
  assert.ok(/มีอยู่แล้ว/.test(post({ action: 'create', token: 'E1', tab: 'Hospitals', row: { name: 'นราธิวาส', level: 'แดง' } }).error));
  assert.ok(/มีอยู่แล้ว/.test(post({ action: 'create', token: 'E1', tab: 'BCP', row: { no: 1, title: 'ซ้ำ', status: 'ดำเนินการ' } }).error));
});
ok('ตัวเลขถูกเก็บเป็น Number ใน Sheet', () => { const h = sheets.Hospitals; const ci = h.d[0].indexOf('autonomy_hr'); assert.strictEqual(h.d[1][ci], 48); });
ok('update ผสานเฉพาะฟิลด์ที่ส่งมา + ตรวจซ้ำ', () => {
  const r = post({ action: 'update', token: 'E1', tab: 'Roads', row: { id: global.rid, status: 'ผ่านได้' } });
  assert.ok(r.ok, r.error); assert.strictEqual(r.row.status, 'ผ่านได้'); assert.strictEqual(r.row.route, 'ถนนสายหลัก A');
  assert.ok(/ไม่พบรหัส/.test(post({ action: 'update', token: 'E1', tab: 'Roads', row: { id: 'NOPE', status: 'ผ่านได้' } }).error));
});
ok('VIEWER อ่านได้แต่เขียนไม่ได้ (403)', () => {
  assert.strictEqual(post({ action: 'create', token: 'V1', tab: 'Roads', row: { route: 'x', status: 'ผ่านได้' } }).code, 403);
  assert.strictEqual(post({ action: 'setup', token: 'E1' }).code, 403);
  assert.strictEqual(get({ action: 'readAll', token: 'V1' }).ok, true);
});
ok('ปิดบังข้อมูลส่วนบุคคลสำหรับ VIEWER เท่านั้น', () => {
  const r = post({ action: 'create', token: 'E1', tab: 'Vulnerable', row: { name: 'สมชาย ใจดี', group: 'ผู้ป่วย Dialysis', address: '99 ม.1 ต.ท่าสาป', district: 'ตากใบ', phone: '0812345678' } });
  assert.ok(r.ok, r.error);
  const v = get({ action: 'readAll', token: 'V1' }).data.Vulnerable[0], e = get({ action: 'readAll', token: 'E1' }).data.Vulnerable[0];
  assert.ok(v.name.includes('•') && v.phone.endsWith('5678') && v.phone.includes('•') && v.address.includes('ปิดบัง'));
  assert.strictEqual(e.name, 'สมชาย ใจดี'); assert.strictEqual(e.phone, '0812345678');
});
ok('ตรวจรูปแบบเบอร์โทร/วันที่', () => {
  assert.ok(/เบอร์โทร/.test(post({ action: 'create', token: 'E1', tab: 'Vulnerable', row: { name: 'ก', group: 'ผู้ป่วย Dialysis', address: 'x', district: 'ตากใบ', phone: 'abc' } }).error));
  assert.ok(/yyyy-mm-dd/.test(post({ action: 'create', token: 'E1', tab: 'Rainfall', row: { as_of: '09/10/2570', district: 'ตากใบ' } }).error));
});
ok('delete ลบแถว + ลบซ้ำแจ้งไม่พบ', () => {
  assert.ok(post({ action: 'delete', token: 'E1', tab: 'Roads', row: { id: global.rid } }).ok);
  assert.ok(/ไม่พบรหัส/.test(post({ action: 'delete', token: 'E1', tab: 'Roads', row: { id: global.rid } }).error));
  assert.strictEqual(get({ action: 'readAll', token: 'E1' }).data.Roads.length, 0);
});
ok('Log บันทึกทุกการเปลี่ยนแปลง และ client เขียน Log ไม่ได้', () => {
  const log = get({ action: 'readAll', token: 'A1' }).data.Log;
  assert.ok(log.length >= 5); assert.ok(log.some(l => l.action === 'create' && l.tab === 'Roads') && log.some(l => l.action === 'delete'));
  assert.ok(/เฉพาะระบบ/.test(post({ action: 'create', token: 'A1', tab: 'Log', row: {} }).error));
});
ok('replace (ADMIN) เขียนทับทั้งแท็บ + ปฏิเสธข้อมูลผิด/id ซ้ำ', () => {
  assert.ok(post({ action: 'replace', token: 'A1', tab: 'RPH', rows: [{ name: 'รพ.สต.ก', district: 'ตากใบ', status: 'ปกติ' }, { name: 'รพ.สต.ข', district: 'แว้ง', status: 'เสี่ยง' }] }).ok);
  assert.strictEqual(get({ action: 'read', token: 'V1', tab: 'RPH' }).rows.length, 2);
  assert.ok(post({ action: 'replace', token: 'A1', tab: 'RPH', rows: [{ name: 'x', district: 'ตากใบ', status: 'พัง' }] }).error);
  assert.strictEqual(get({ action: 'read', token: 'V1', tab: 'RPH' }).rows.length, 2, 'ข้อมูลเดิมต้องไม่ถูกลบเมื่อ validate ไม่ผ่าน');
  assert.ok(post({ action: 'replace', token: 'A1', tab: 'RPH', rows: [] }).ok);
  assert.strictEqual(get({ action: 'read', token: 'V1', tab: 'RPH' }).rows.length, 0);
});
ok('setSharing เฉพาะ ADMIN และตรวจ mode', () => {
  assert.strictEqual(post({ action: 'setSharing', token: 'E1', mode: 'EDIT' }).code, 403);
  assert.ok(post({ action: 'setSharing', token: 'A1', mode: 'VIEW' }).ok);
  assert.deepStrictEqual(sharing[0], ['ANY', 'VIEW']);
  assert.ok(post({ action: 'setSharing', token: 'A1', mode: 'XXX' }).error);
});
ok('ปฏิเสธแท็บ/คำสั่งที่ไม่รู้จัก และ JSON เสีย', () => {
  assert.ok(/ไม่รู้จักแท็บ/.test(post({ action: 'create', token: 'E1', tab: 'Evil', row: {} }).error));
  assert.ok(/ไม่รู้จักคำสั่ง/.test(post({ action: 'dropAll', token: 'A1' }).error));
  assert.ok(/JSON/.test(JSON.parse(api.doPost({ postData: { contents: '{bad' } }).getContent()).error));
});
ok('readAll คืนครบ 16 แท็บ + meta', () => { const r = get({ action: 'readAll', token: 'V1' }); assert.strictEqual(Object.keys(r.data).length, 16); assert.strictEqual(r.meta.name, 'TestBook'); });
ok('SCHEMA_VERSION ตรงกับที่ Dashboard คำนวณ (index.html)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const a = html.indexOf('/* SCHEMA_DEF_START'), b = html.indexOf('/* SCHEMA_DEF_END */');
  const v = new Function(html.slice(a, b) + '; return schemaVer();')();
  assert.strictEqual(v, api.SCHEMA_VERSION);
  assert.strictEqual(get({ action: 'ping' }).schemaVersion, v);
});
ok('Auto-sync: rev เปลี่ยนทุกครั้งที่เขียน/แก้ใน Sheet และ action=rev เบา+ต้องมีสิทธิ์', () => {
  const r0 = get({ action: 'rev', token: 'V1' }).rev;
  assert.ok(post({ action: 'create', token: 'E1', tab: 'Roads', row: { route: 'rev-test', status: 'ผ่านได้' } }).ok);
  const r1 = get({ action: 'rev', token: 'V1' }).rev; assert.notStrictEqual(r1, r0);
  api.onChangeInstalled_(); const r2 = get({ action: 'rev', token: 'V1' }).rev; assert.notStrictEqual(r2, r1);
  assert.strictEqual(get({ action: 'rev', token: 'V1' }).rev, r2, 'ไม่มีการเขียน rev ต้องคงเดิม');
  assert.strictEqual(get({ action: 'rev', token: 'bad' }).ok, false);
  assert.strictEqual(get({ action: 'readAll', token: 'V1' }).rev, r2);
});
ok('Auto-update: โครงสร้างเปลี่ยน → ซ่อมแซมแท็บ/คอลัมน์ให้เองในคำขอแรก', () => {
  delete sheets.Staff;                                  // แท็บหาย
  sheets.Hospitals.d.forEach(r => r.splice(sheets.Hospitals.d[0].indexOf('rto_hr'), 1)); // คอลัมน์หาย
  props.SCHEMA_APPLIED = 'old-version';                 // จำลอง deploy เวอร์ชันใหม่
  const r = get({ action: 'readAll', token: 'V1' });
  assert.ok(r.ok && sheets.Staff, 'ต้องสร้างแท็บ Staff กลับมา');
  assert.ok(sheets.Hospitals.d[0].includes('rto_hr'), 'ต้องเพิ่มคอลัมน์ rto_hr กลับมา');
  assert.strictEqual(props.SCHEMA_APPLIED, api.SCHEMA_VERSION);
});
ok('Trigger ติดตั้งอัตโนมัติครั้งเดียว (ไม่ซ้ำ)', () => {
  assert.deepStrictEqual(triggers.sort(), ['autoMaintenance_', 'onChangeInstalled_']);
  api.installAutoTriggers_(); assert.strictEqual(triggers.length, 2);
});
ok('autoMaintenance จำกัดขนาด Log และแจ้ง rev', () => {
  const log = sheets.Log; for (let i = 0; i < 6000; i++) log.d.push(['LOG-' + i, 't', 'u', 'a', 't', '', '', '', '']);
  const r0 = props.REV; api.autoMaintenance_();
  assert.ok(log.getLastRow() <= 5001 + 1); assert.notStrictEqual(props.REV, r0);
});
console.log(n + ' tests passed' + (process.exitCode ? ' (มีข้อผิดพลาด)' : ''));

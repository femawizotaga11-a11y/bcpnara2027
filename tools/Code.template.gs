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
 *   2) TOKENS ด้านล่าง: ตอนนี้ ADMIN = EDITOR = 'admin' (VIEWER ยังปิดอยู่จนกว่าจะแก้เป็นรหัสของคุณ — ค่าที่มี 'เปลี่ยนรหัสนี้' จะถูกปฏิเสธ)
 *   3) เลือกฟังก์ชัน setupDatabase → Run → อนุญาตสิทธิ์ (Sheets, Drive)
 *   4) Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone
 *   5) คัดลอก URL /exec + Token ไปวางในเมนู "Sheet & GAS" ของ Dashboard
 *   * ทุกครั้งที่แก้โค้ด ต้อง Deploy → Manage deployments → Edit → New version
 * ============================================================================
 */

const VERSION = '1.1.0';
/** รหัสโครงสร้างฐานข้อมูล — สร้างอัตโนมัติ; Dashboard เทียบค่านี้เพื่อเตือนเมื่อ Code.gs ล้าสมัย */
const SCHEMA_VERSION = '/*__VER__*/';

/** รหัสผ่านแต่ละระดับ — แก้ก่อนใช้งานจริง (หรือเก็บใน Project Settings → Script properties: TOKEN_ADMIN / TOKEN_EDITOR / TOKEN_VIEWER) */
const TOKENS = {
  admin:  'admin',                  // Full: CRUD + Push ทั้งแท็บ + สร้างฐานข้อมูล + จัดการการแชร์ (⚠ รหัสสั้น เดาง่าย — แนะนำตั้ง TOKEN_ADMIN ใน Script properties แทน)
  editor: 'admin',                  // เพิ่ม/แก้ไข/ลบ รายแถว (ตอนนี้ใช้รหัสเดียวกับ ADMIN จึงถูกตีความเป็น ADMIN เสมอ — ตั้งรหัสต่างกันหากต้องการแยกสิทธิ์)
  viewer: 'VIEWER-เปลี่ยนรหัสนี้'   // อ่านอย่างเดียว (ข้อมูลส่วนบุคคลถูกปิดบัง)
};

const TZ = 'Asia/Bangkok';
const MAX_TEXT = 2000;

/** โครงสร้างฐานข้อมูล (สร้างโดย tools/build.js) */
const DB = /*__SCHEMA__*/;

/* ───────────────────────────── Utilities ───────────────────────────── */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function nowIso_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function isDefaultToken_(v) { return !v || String(v).indexOf('เปลี่ยนรหัสนี้') >= 0; }

function tokenOf_(role) {
  const p = PropertiesService.getScriptProperties().getProperty('TOKEN_' + role.toUpperCase());
  return p || TOKENS[role];
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
    const tk = tokenOf_(roles[i]);
    if (!isDefaultToken_(tk) && tk === t) return roles[i];
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
      return json_({ ok: true, version: VERSION, schemaVersion: SCHEMA_VERSION, rev: getRev_(), name: m.name, url: m.url, id: m.id, tabs: m.tabs, role: role });
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
  const rolesReady = ['admin', 'editor', 'viewer'].filter(function (r) { return !isDefaultToken_(tokenOf_(r)); });
  return 'ฐานข้อมูลพร้อมใช้งาน — สร้างใหม่ ' + created.length + ' แท็บ' + (created.length ? ' (' + created.join(', ') + ')' : '') +
    (repaired.length ? ' · ซ่อมแซม: ' + repaired.join(', ') : '') +
    ' · Auto-sync trigger: ' + trg + ' · Token ที่ตั้งแล้ว: ' + (rolesReady.length ? rolesReady.join(', ').toUpperCase() : 'ยังไม่มี (แก้ TOKENS ใน Code.gs)');
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
  const roles = ['admin', 'editor', 'viewer'].map(function (r) { return r.toUpperCase() + ': ' + (isDefaultToken_(tokenOf_(r)) ? '❌ ยังไม่ได้ตั้งรหัส' : '✅ ตั้งแล้ว'); });
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

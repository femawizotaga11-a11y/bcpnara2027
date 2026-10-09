// สร้าง Code.gs และ schema.json จากนิยามฐานข้อมูลใน index.html (SCHEMA_DEF_START..END)
// ใช้: node tools/build.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const a = html.indexOf('/* SCHEMA_DEF_START'), b = html.indexOf('/* SCHEMA_DEF_END */');
if (a < 0 || b < 0) throw new Error('ไม่พบ SCHEMA_DEF ใน index.html');
const def = new Function(html.slice(a, b) + '; return {SCHEMA, BCP_SEED, CONFIG_SEED, schemaVer};')();
const strip = col => { const o = {}; for (const k in col) if (col[k] !== undefined) o[k] = col[k]; return o; };
const tabs = {};
for (const k in def.SCHEMA) tabs[k] = { label: def.SCHEMA[k].label, prefix: def.SCHEMA[k].prefix, cols: def.SCHEMA[k].cols.map(strip) };
const DB = { order: Object.keys(tabs), tabs, bcpSeed: def.BCP_SEED, configSeed: def.CONFIG_SEED };
const tpl = fs.readFileSync(path.join(__dirname, 'Code.template.gs'), 'utf8');
const J = JSON.stringify;
const dbText = '{\n  order: ' + J(DB.order) + ',\n  tabs: {\n' +
  DB.order.map(t => '    ' + t + ': { label: ' + J(tabs[t].label) + ', prefix: ' + J(tabs[t].prefix) + ', cols: [\n' +
    tabs[t].cols.map(c => '      ' + J(c)).join(',\n') + '\n    ] }').join(',\n') +
  '\n  },\n  bcpSeed: [\n' + DB.bcpSeed.map(r => '    ' + J(r)).join(',\n') + '\n  ],\n  configSeed: ' + J(DB.configSeed) + '\n}';
const gs = tpl.replace('/*__SCHEMA__*/', () => dbText).replace('/*__VER__*/', def.schemaVer());
fs.writeFileSync(path.join(root, 'Code.gs'), gs.replace(/\r\n/g, '\n'));
fs.writeFileSync(path.join(__dirname, 'schema.json'), JSON.stringify(DB, null, 1));
console.log('schema', def.schemaVer(), '· Code.gs', gs.split('\n').length, 'lines · tabs:', DB.order.length, '· columns:', DB.order.reduce((s, t) => s + tabs[t].cols.length, 0));

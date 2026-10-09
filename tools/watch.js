// รันค้างไว้ตอนพัฒนา: แก้ index.html / Code.template.gs แล้ว Code.gs อัปเดตเองทันที
// ใช้: node tools/watch.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const files = [path.join(__dirname, '..', 'index.html'), path.join(__dirname, 'Code.template.gs')];
let t;
const build = () => { try { console.log(execFileSync('node', [path.join(__dirname, 'build.js')]).toString().trim()); } catch (e) { console.error('build ล้มเหลว:', e.message); } };
files.forEach(f => fs.watch(f, () => { clearTimeout(t); t = setTimeout(build, 300); }));
build(); console.log('กำลังเฝ้าดู index.html และ Code.template.gs …');

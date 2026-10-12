// 用法：node send.cjs <脚本文件> [最长等待秒数]。把脚本交给 driver 执行并打印结果。
const fs = require('fs'), path = require('path');
const src = process.argv[2], wait = Number(process.argv[3] || 120) * 1000;
const name = Date.now() + '-' + path.basename(src).replace(/\.js$/, '');
const out = path.join(__dirname, 'out', name + '.json');
fs.copyFileSync(src, path.join(__dirname, 'cmd', name + '.js.tmp'));
fs.renameSync(path.join(__dirname, 'cmd', name + '.js.tmp'), path.join(__dirname, 'cmd', name + '.js'));
const t0 = Date.now();
(function poll() {
  if (fs.existsSync(out)) { let s = fs.readFileSync(out, 'utf8'); try { JSON.parse(s); } catch { return setTimeout(poll, 150); } console.log(s.length > 12000 ? s.slice(0, 12000) + '\n…(truncated)' : s); return; }
  if (Date.now() - t0 > wait) { console.log('TIMEOUT waiting for', name); process.exit(2); }
  setTimeout(poll, 200);
})();

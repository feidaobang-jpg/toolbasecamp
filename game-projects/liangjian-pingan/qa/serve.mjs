// 本地试玩/验收用静态服务：把仓库 public/ 当站点根目录，禁用缓存（改完代码刷新即生效）
// 用法：node game-projects/liangjian-pingan/qa/serve.mjs   （PORT 默认 8795；HOST=0.0.0.0 可让同一局域网的手机访问）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.env.PUBLIC_DIR || path.join(here, '../../../public'));
const port = Number(process.env.PORT || 8795);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  let file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(302, { Location: p + '/' }); res.end(); return; }
      file = path.join(file, 'index.html');
    }
    fs.readFile(file, (e2, buf) => {
      if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
}).listen(port, host, () => {
  console.log(`serving ${root}`);
  console.log(`亮剑战役： http://localhost:${port}/html/game/gunfire-assembly/liangjian/?ch=pingan`);
  console.log(`原版：   http://localhost:${port}/html/game/gunfire-assembly/`);
  if (host === '0.0.0.0') for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`手机：   http://${n.address}:${port}/html/game/gunfire-assembly/pingan/`);
});

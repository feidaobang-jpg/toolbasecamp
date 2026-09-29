// 探测本机能用于实机验证的自动化浏览器依赖，输出 JSON 供后续决策。
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const report = { node: process.version, playwright: [], chromiumDirs: [], pythons: [] };

// 1. 常见安装位置里找 playwright 包
const roots = [
  'D:/project',
  'D:/',
  path.join(os.homedir(), 'AppData', 'Local', 'Programs'),
  os.homedir(),
];
const seen = new Set();
function scan(dir, depth) {
  if (depth > 3 || seen.has(dir)) return;
  seen.add(dir);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.') || ['node_modules', '$RECYCLE.BIN', 'System Volume Information'].includes(e.name)) {
      if (e.name === 'node_modules') {
        const probe = path.join(dir, 'node_modules', 'playwright', 'package.json');
        if (fs.existsSync(probe)) report.playwright.push(path.join(dir, 'node_modules', 'playwright'));
      }
      continue;
    }
    const full = path.join(dir, e.name);
    if (e.name === 'playwright') {
      if (fs.existsSync(path.join(full, 'package.json'))) report.playwright.push(full);
    }
    scan(full, depth + 1);
  }
}
for (const r of roots) { try { scan(r, 0); } catch {} }

// 2. ms-playwright 缓存里的浏览器内核
const cache = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
if (fs.existsSync(cache)) {
  for (const e of fs.readdirSync(cache, { withFileTypes: true })) {
    if (e.isDirectory() && /chromium|firefox|webkit/.test(e.name)) report.chromiumDirs.push(path.join(cache, e.name));
  }
}

// 3. 本机 python 解释器（PATH 上的可能是商店占位程序）
for (const cand of ['C:/pycheck/ComfyUI/venv/Scripts/python.exe', 'D:/pycheck/ComfyUI/venv/Scripts/python.exe']) {
  if (fs.existsSync(cand)) report.pythons.push(cand);
}

console.log(JSON.stringify(report, null, 2));

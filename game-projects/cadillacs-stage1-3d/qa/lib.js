// Playwright 公共：默认系统 Edge + 真显卡（本机 RTX）；CD_SWIFT=1 改用软件渲染
const path = require('path');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('D:/project/godot/absurd-3d-daily/node_modules/playwright'); }
const BASE = process.env.CD_BASE || 'http://127.0.0.1:8777/html/game/cadillacs-stage1-3d/index.html';
async function launch(opts) {
  const o = opts || {};
  const args = ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'];
  if (process.env.CD_SWIFT) args.push('--use-angle=swiftshader');
  else args.push('--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11');
  const browser = await pw.chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: o.headless !== false, args });
  return browser;
}
function out(name) { const d = path.join(__dirname, 'out'); require('fs').mkdirSync(d, { recursive: true }); return path.join(d, name); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
module.exports = { pw, launch, BASE, out, sleep };

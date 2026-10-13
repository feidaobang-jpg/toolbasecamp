// 验收脚本公用：启动本机 Edge（Playwright），打开游戏并收集报错
const path = require('path');
const fs = require('fs');
const PW = process.env.PLAYWRIGHT_DIR || 'D:/project/godot/absurd-3d-daily/node_modules/playwright';
const { chromium } = require(PW);
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.LJ_URL || 'http://localhost:8795/html/game/gunfire-assembly/pingan/';
const OUT = process.env.QA_OUTPUT || path.join(__dirname, '../media-kit/releases/v0.3.0/captures/qa');
fs.mkdirSync(OUT, { recursive: true });

async function open(opts = {}) {
  const browser = await chromium.launch({ executablePath: EDGE, headless: opts.headless !== false, args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, opts.context || {}));
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('requestfailed', (r) => { if (!/assets\/voice\//.test(r.url())) errors.push('requestfailed: ' + r.url()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/assets\/voice\//.test(r.url()) && !/favicon/.test(r.url())) errors.push('http ' + r.status() + ': ' + r.url()); });
  await page.goto(BASE + '?qa=1' + (opts.query || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lj && document.getElementById('loading').hidden, null, { timeout: 20000 });
  // 电脑端默认是鼠标接管；原有的拖动类断言沿用“按住拖动”，要测接管的脚本自己改回 lock
  await page.evaluate((lock) => { const a = window.__lj.app; a.noAutoPause = true; if (!lock) a.s.mouseAim = 'drag'; }, !!opts.lock);
  return { browser, ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) });
// 从主菜单开局：按 Enter；万一按键没送到（偶发），改点“开始战斗”
async function start(page) {
  await page.keyboard.press('Enter');
  try { await page.waitForFunction(() => __lj.app.state === 'play', null, { timeout: 1500 }); }
  catch (e) { await page.evaluate(() => document.querySelector('#menu .btn.primary').click()); await page.waitForFunction(() => __lj.app.state === 'play', null, { timeout: 3000 }); }
}
module.exports = { open, shot, start, OUT, BASE };

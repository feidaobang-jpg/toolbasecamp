// 实机录像：实时运行，由脚本按键从头打到结算（自动化操作，无声音轨），存到 media-kit 的 captures
// 用法：node record.cjs [视角 0 第三人称 / 1 第一人称] [起始阶段]
const path = require('path');
const fs = require('fs');
const PW = process.env.PLAYWRIGHT_DIR || 'D:/project/godot/absurd-3d-daily/node_modules/playwright';
const { chromium } = require(PW);
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.LJ_URL || 'http://localhost:8795/html/game/gunfire-assembly/liangjian/';
const OUT = path.join(__dirname, '../media-kit/releases/v0.2.0/captures');
const view = +(process.argv[2] || 0), startPhase = +(process.argv[3] || 1);
const BOT = fs.readFileSync(path.join(__dirname, 'bot.browser.js'), 'utf8');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir: OUT, size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '?qa=1&ch=' + (process.env.LJ_CH || 'pingan'), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lj && document.getElementById('loading').hidden);
  await page.evaluate(([v, sp]) => { const a = __lj.app; a.noAutoPause = true; a.s.view = v; a.s.startPhase = sp; a.s.lives = 'inf'; a.s.armor = 'std'; a.s.quality = 'high'; a.applyQuality(); a.ui.refresh(); }, [view, startPhase]);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter');
  await page.evaluate(async () => { window.__W = await import('./js/world-kit.js'); });
  await page.addScriptTag({ content: BOT });
  await page.evaluate(() => { window.__bot = window.__installBot(); let last = performance.now(); const tick = (t) => { const dt = Math.min(0.05, (t - last) / 1000); last = t; if (__lj.app.state === 'play') window.__bot(dt); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const t0 = Date.now();
  let res = null;
  while (Date.now() - t0 < 12 * 60 * 1000) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => ({ state: __lj.app.state, phase: __lj.game.phase, t: __lj.game.t }));
    if (s.state === 'result') { res = s; break; }
  }
  await page.waitForTimeout(3500);
  const stats = await page.evaluate(() => ({ title: document.querySelector('#result .title2').textContent, total: document.querySelector('#result .total').textContent, t: __lj.game.t, stats: __lj.game.stats }));
  const video = page.video();
  await ctx.close();
  const src = await video.path();
  const dst = path.join(OUT, `playthrough-view${view}-p${startPhase}.webm`);
  fs.renameSync(src, dst);
  console.log(JSON.stringify({ file: dst, finished: !!res, stats, errors }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });

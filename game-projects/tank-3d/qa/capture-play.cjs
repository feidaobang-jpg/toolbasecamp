// 实机录像（Playwright 录屏，无声）：页面内自动驾驶用键盘事件开坦克，覆盖经典第 1 关多视角与魔改大 Boss 关。
// PLAYWRIGHT_MODULE=… BROWSER_EXECUTABLE=… node game-projects/tank-3d/qa/capture-play.cjs <输出目录> [页面地址]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:8766/public/html/game/tank-3d/index.html';
// 页面内自动驾驶：每 50ms 按最近敌军选方向，对准了就按 J；不朝自家老鹰开炮
const PILOT = `(() => {
  const T = window.__TANK_TEST__; let held = null, tick = 0;
  const send = (code, type) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const KEYS = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
  window.__pilot = setInterval(() => {
    const w = T.world, p = w && w.player; tick++;
    if (!p || p.state !== 'active' || T.state().overlay) { if (held) { send(held, 'keyup'); held = null; } return; }
    const ts = w.bots.filter(b => b.state === 'active');
    let want = null, aim = false;
    if (ts.length) {
      ts.sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - Math.abs(b.x - p.x) - Math.abs(b.y - p.y));
      const t = ts[0], cx = t.x + t.size / 2 - 8, cy = t.y + t.size / 2 - 8, dx = cx - p.x, dy = cy - p.y;
      const lim = t.size / 2 - 2;
      if (Math.abs(dx) <= lim) { want = dy < 0 ? 0 : 2; aim = true; }
      else if (Math.abs(dy) <= lim) { want = dx > 0 ? 1 : 3; aim = true; }
      else want = Math.abs(dx) < Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy < 0 ? 0 : 2);
      if (tick % 40 < 6) want = (want + 1) % 4;   // 偶尔绕一下，免得顶着墙不动
    }
    const towardEagle = d => (p.y > 176 && (d === 1 || d === 3)) || (d === 2 && p.x > 76 && p.x < 116);
    // 键位是屏幕方向：把世界方向换回当前镜头下的按键
    const q = ((Math.round(T.view.cameraYaw() / (Math.PI / 2)) % 4) + 4) % 4;
    const key = want === null ? null : KEYS[(want + q) % 4];
    if (key !== held) { if (held) send(held, 'keyup'); if (key && !(aim && p.dir === want)) send(key, 'keydown'); held = key && !(aim && p.dir === want) ? key : null; }
    if (aim && p.dir === want && !towardEagle(p.dir) && tick % 3 === 0) { send('KeyJ', 'keydown'); send('KeyJ', 'keyup'); }
  }, 50);
})()`;

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const shots = [];
  async function clip(name, prep, plan) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } }, locale: 'zh-CN' });
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    await p.goto(url + '?test=1&clean=1');
    await p.waitForFunction(() => window.__tankReady && window.__TANK_TEST__);
    await p.evaluate(() => localStorage.clear());
    await p.evaluate(prep);
    await p.waitForTimeout(2400);
    await p.evaluate(PILOT);
    for (const [ms, js, shot] of plan) { if (js) await p.evaluate(js); await p.waitForTimeout(ms); if (shot) { await p.screenshot({ path: path.join(out, shot) }); shots.push(shot); } }
    const video = await p.video().path();
    await ctx.close();
    fs.renameSync(video, path.join(out, name));
    if (errors.length) throw Error(name + ': ' + errors.join('; '));
  }
  // 经典第 1 关：正俯视开打 → 近景 → 正视 → 第一人称 → 斜俯视
  await clip('play-classic-stage1.webm', "(() => { const T = window.__TANK_TEST__; T.settings.mode = 'classic'; T.startGame({ stage: 1, cycle: 1, score: 0 }); T.run.demo = true; })()", [
    [9000, null, 'play-classic-top.png'],
    [6000, "window.__TANK_TEST__.view.setPreset(2)", 'play-classic-close.png'],
    [6000, "window.__TANK_TEST__.view.setPreset(3)", 'play-classic-front.png'],
    [6000, "window.__TANK_TEST__.view.setPreset(4)", 'play-classic-fp.png'],
    [5000, "window.__TANK_TEST__.view.setPreset(0)", 'play-classic-overview.png']
  ]);
  // 魔改第 10 关：大 Boss 锈湾堡垒
  await clip('play-remix-boss10.webm', "(() => { const T = window.__TANK_TEST__; T.settings.mode = 'remix'; T.startGame({ stage: 10, cycle: 1, score: 0 }); T.run.demo = true; })()", [
    [10000, null, 'play-remix-boss10-a.png'],
    [8000, "window.__TANK_TEST__.view.setPreset(3)", 'play-remix-boss10-front.png'],
    [6000, "window.__TANK_TEST__.view.setPreset(0)", 'play-remix-boss10-b.png']
  ]);
  await b.close();
  console.log(JSON.stringify({ shots }));
})().catch(e => { console.error(e); process.exit(1); });

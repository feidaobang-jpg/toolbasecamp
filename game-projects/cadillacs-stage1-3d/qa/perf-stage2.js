// 第二关实时测帧（真显卡）：森林 / 泥沼 / 尸骸地 + 屠夫战，bot 实时打斗，分视角采样帧间隔。node qa/perf-stage2.js [宽] [高] [画质]
const { launch, BASE, out, sleep } = require('./lib');
const { BOT_SRC } = require('./bot');
const fs = require('fs');
(async () => {
  const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720), q = process.argv[4] || 'high';
  const b = await launch();
  const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const stat = (arr) => { const a = arr.slice().sort((x, y) => x - y); const mean = a.reduce((s, v) => s + v, 0) / a.length; return { n: a.length, fps: +(1000 / mean).toFixed(1), mean: +mean.toFixed(2), median: +a[Math.floor(a.length / 2)].toFixed(2), p95: +a[Math.floor(a.length * 0.95)].toFixed(2), over50: a.filter(v => v > 50).length, max: +a[a.length - 1].toFixed(1) }; };
  const res = { date: new Date().toISOString(), viewport: [W, H], quality: q, runs: [] };
  for (const area of [3, 4, 5]) {
    await page.goto(BASE + '?test=1&seed=9&q=' + q + '&area=' + area, { waitUntil: 'load' }); await sleep(800);
    await page.keyboard.press('Enter'); await sleep(100); await page.keyboard.press('Enter'); await sleep(300);
    for (let i = 0; i < 16; i++) { const s = await page.evaluate(() => window.__CD_TEST__.snapshot()); if (s.mode === 'play') break; await page.keyboard.press('KeyJ'); await sleep(300); }
    if (!res.renderer) res.renderer = await page.evaluate(() => window.__CD_TEST__.renderInfo());
    await page.evaluate(BOT_SRC);
    await page.evaluate(() => window.__bot.live(true, { jumps: true }));
    if (area === 5) {   // 屠夫战（Boss + 叫来的手下）
      await page.evaluate(() => { const C = window.__CD_TEST__.cheat, G = C.G; C.killAll(); G.pending = []; G.waveOn = false; G.wave = 9; G.lockX = null; G.focusX = 38; G.player.x = 42; });
      for (let i = 0; i < 40; i++) { const s = await page.evaluate(() => window.__CD_TEST__.snapshot()); if (s.boss && s.mode === 'play') break; await sleep(300); }
      await page.evaluate(() => window.__CD_TEST__.cheat.bossHp(330));
    }
    for (const [name, cam, yaw] of [['side', 0, 0], ['front', 2, 0], ['fp', 3, 0], ['side-rot', 0, 2.6]]) {
      await page.evaluate(([c, y]) => window.__CD_TEST__.setCamera(c, y), [cam, yaw]);
      await sleep(1200);
      await page.evaluate(() => window.__CD_TEST__.perfStart());
      await sleep(5000);
      const p = await page.evaluate(() => window.__CD_TEST__.perfStop());
      const info = p.info.length ? p.info[Math.floor(p.info.length / 2)] : null;
      const snap = await page.evaluate(() => { const s = window.__CD_TEST__.snapshot(); return { area: s.areaId, x: s.player.x, enemies: s.enemies, boss: !!s.boss }; });
      res.runs.push(Object.assign({ name: snap.area + '-' + name, frames: stat(p.frames), work: stat(p.work), drawCalls: info }, snap));
      console.log(snap.area + '-' + name, JSON.stringify({ fps: res.runs[res.runs.length - 1].frames.fps, p95: res.runs[res.runs.length - 1].frames.p95, over50: res.runs[res.runs.length - 1].frames.over50, work: res.runs[res.runs.length - 1].work.mean, calls: info && info.calls, tris: info && info.tris, enemies: snap.enemies }));
    }
    await page.evaluate(() => window.__bot.live(false));
  }
  fs.writeFileSync(out('perf-stage2-' + W + 'x' + H + '-' + q + '.json'), JSON.stringify(res, null, 1));
  await b.close();
})();

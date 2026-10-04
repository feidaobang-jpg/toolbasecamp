// 实时测帧（真显卡）：bot 实时打斗，分视角采样帧间隔。node qa/perf.js [宽] [高] [画质]
const { launch, BASE, out, sleep } = require('./lib');
const { BOT_SRC } = require('./bot');
const fs = require('fs');
(async () => {
  const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720), q = process.argv[4] || 'high';
  const b = await launch();
  const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(BASE + '?test=1&seed=9&q=' + q, { waitUntil: 'load' }); await sleep(800);
  await page.keyboard.press('Enter'); await sleep(100); await page.keyboard.press('Enter'); await sleep(300);
  for (let i = 0; i < 10; i++) { const s = await page.evaluate(() => window.__CD_TEST__.snapshot()); if (s.mode === 'play') break; await page.keyboard.press('KeyJ'); await sleep(250); }
  await page.evaluate(BOT_SRC);
  const stat = (arr) => { const a = arr.slice().sort((x, y) => x - y); const mean = a.reduce((s, v) => s + v, 0) / a.length; return { n: a.length, fps: +(1000 / mean).toFixed(1), mean: +mean.toFixed(2), median: +a[Math.floor(a.length / 2)].toFixed(2), p95: +a[Math.floor(a.length * 0.95)].toFixed(2), over50: a.filter(v => v > 50).length, max: +a[a.length - 1].toFixed(1) }; };
  const res = { date: new Date().toISOString(), viewport: [W, H], quality: q, runs: [] };
  res.renderer = await page.evaluate(() => window.__CD_TEST__.renderInfo());
  const segs = [['side', 0, 0], ['front', 2, 0], ['fp', 3, 0], ['side-rot', 0, 2.2]];
  await page.evaluate(() => window.__bot.live(true, { jumps: true }));
  for (const [name, cam, yaw] of segs) {
    await page.evaluate(([c, y]) => window.__CD_TEST__.setCamera(c, y), [cam, yaw]);
    await sleep(1500);
    await page.evaluate(() => window.__CD_TEST__.perfStart());
    await sleep(8000);
    const p = await page.evaluate(() => window.__CD_TEST__.perfStop());
    const info = p.info.length ? p.info[Math.floor(p.info.length / 2)] : null;
    const snap = await page.evaluate(() => { const s = window.__CD_TEST__.snapshot(); return { area: s.area, x: s.player.x, enemies: s.enemies }; });
    res.runs.push(Object.assign({ name, frames: stat(p.frames), work: stat(p.work), drawCalls: info }, snap));
    console.log(name, JSON.stringify(res.runs[res.runs.length - 1]));
  }
  await page.evaluate(() => window.__bot.live(false));
  // Boss 战负载
  await page.evaluate(() => { window.__CD_TEST__.setCamera(0, 0); window.__CD_TEST__.cheat.area(2); });
  await sleep(500);
  await page.evaluate(() => window.__bot.live(true, { jumps: true }));
  for (let i = 0; i < 60; i++) { const s = await page.evaluate(() => window.__CD_TEST__.snapshot()); if (s.boss && s.mode === 'play') break; if (s.mode === 'cut') await page.keyboard.press('KeyJ'); await page.evaluate(() => { const T = window.__CD_TEST__.cheat; if (T.G.waveOn) T.killAll(); }); await sleep(400); }
  await page.evaluate(() => window.__CD_TEST__.perfStart()); await sleep(8000);
  const p = await page.evaluate(() => window.__CD_TEST__.perfStop());
  res.runs.push({ name: 'boss-side', frames: stat(p.frames), work: stat(p.work), drawCalls: p.info[Math.floor(p.info.length / 2)] || null, enemies: (await page.evaluate(() => window.__CD_TEST__.snapshot())).enemies });
  console.log('boss-side', JSON.stringify(res.runs[res.runs.length - 1]));
  await page.evaluate(() => window.__bot.live(false));
  fs.writeFileSync(out('perf-' + W + 'x' + H + '-' + q + '.json'), JSON.stringify(res, null, 1));
  await b.close();
})();

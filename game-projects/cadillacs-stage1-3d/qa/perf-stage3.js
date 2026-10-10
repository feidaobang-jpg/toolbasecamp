// 第三关实时测帧（真显卡）：荒漠、公路一路撞（人最多的那几秒）、霍格投弹、车毁后的徒步战，分视角采样帧间隔。node qa/perf-stage3.js [宽] [高] [画质]
const { launch, BASE, out, sleep } = require('./lib');
const fs = require('fs');
(async () => {
  const W = +(process.argv[2] || 1280), H = +(process.argv[3] || 720), q = process.argv[4] || 'high';
  const b = await launch();
  const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const stat = (arr) => { const a = arr.slice().sort((x, y) => x - y); const mean = a.reduce((s, v) => s + v, 0) / a.length; return { n: a.length, fps: +(1000 / mean).toFixed(1), mean: +mean.toFixed(2), median: +a[Math.floor(a.length / 2)].toFixed(2), p95: +a[Math.floor(a.length * 0.95)].toFixed(2), max: +a[a.length - 1].toFixed(2), over25: a.filter(v => v > 25).length, over50: a.filter(v => v > 50).length }; };
  const res = { date: new Date().toISOString(), viewport: [W, H], quality: q, runs: [] };
  const T = (fn, a) => page.evaluate(fn, a);
  const measure = async (name, ms) => {
    await sleep(700);
    await T(() => window.__CD_TEST__.perfStart());
    await sleep(ms || 4000);
    const p = await T(() => window.__CD_TEST__.perfStop());
    const info = p.info.length ? p.info[Math.floor(p.info.length / 2)] : null;
    const snap = await T(() => { const s = window.__CD_TEST__.snapshot(); return { area: s.areaId, phase: s.road && s.road.phase, t: s.road && s.road.t, enemies: s.enemies, objs: s.road && s.road.objs }; });
    const r = Object.assign({ name, frames: stat(p.frames), work: stat(p.work), drawCalls: info }, snap); res.runs.push(r);
    console.log(name, JSON.stringify({ fps: r.frames.fps, p95: r.frames.p95, max: r.frames.max, over25: r.frames.over25, over50: r.frames.over50, work: r.work.mean, calls: info && (info.calls || info), enemies: snap.enemies, t: snap.t }));
  };
  const start = async (area) => {
    await page.goto(BASE + '?test=1&seed=9&q=' + q + '&area=' + area, { waitUntil: 'load' }); await sleep(900);
    await page.keyboard.press('Enter'); await sleep(150); await page.keyboard.press('Enter'); await sleep(400);
    for (let i = 0; i < 30; i++) { const s = await T(() => window.__CD_TEST__.snapshot()); if (s.mode === 'play') break; await page.keyboard.press('KeyJ'); await sleep(300); }
    if (!res.renderer) res.renderer = await T(() => window.__CD_TEST__.renderInfo());
  };
  // 3-1 荒漠：开场四人
  await start(6);
  for (const [name, cam, yaw] of [['side', 0, 0], ['front', 2, 0], ['side-rot', 0, 2.6]]) { await T(([c, y]) => window.__CD_TEST__.setCamera(c, y), [cam, yaw]); await measure('desert-' + name, 3000); }
  // 3-2 公路：从头开，一路撞（人和路障最密的 2～8 秒、16～24 秒），再到霍格
  for (const [name, cam, yaw, from] of [['side', 0, 0, 1.0], ['front', 2, 0, 15.5], ['fp', 3, 0, 1.0], ['side-rot', 0, 2.6, 15.5]]) {
    await start(7);
    await T(([c, y]) => window.__CD_TEST__.setCamera(c, y), [cam, yaw]);
    if (from > 2) await T((t) => window.__CD_TEST__.cheat.road.skipTo(t), from);
    await measure('road-run-' + name, 6500);
  }
  await start(7); await T(() => window.__CD_TEST__.cheat.road.skipTo(27.2));
  for (let i = 0; i < 20; i++) { const s = await T(() => window.__CD_TEST__.snapshot()); if (s.road.phase === 'hogg') break; await sleep(200); }
  await T(() => { window.__CD_TEST__.cheat.G.settings.demo = true; });   // 测帧时车不炸，专心采样
  for (const [name, cam, yaw] of [['side', 0, 0], ['front', 2, 0], ['fp', 3, 0]]) { await T(([c, y]) => window.__CD_TEST__.setCamera(c, y), [cam, yaw]); await measure('road-hogg-' + name, 5000); }
  await T(() => { window.__CD_TEST__.cheat.G.settings.demo = false; window.__CD_TEST__.setCamera(0, 0); window.__CD_TEST__.cheat.road.wreck(); window.__CD_TEST__.cheat.G.settings.demo = true; });
  await measure('road-foot-side', 6000);
  await T(() => window.__CD_TEST__.setCamera(2, 0)); await measure('road-foot-front', 5000);
  res.errors = errs;
  fs.writeFileSync(out('perf-stage3-' + W + 'x' + H + '-' + q + '.json'), JSON.stringify(res, null, 1));
  console.log('errors', errs.length, errs.slice(0, 3));
  await b.close();
})().catch(e => { console.error('SCRIPT FAIL', e); process.exit(1); });

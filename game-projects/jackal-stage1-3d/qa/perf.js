// 实时帧时间测量：bot 实时游玩时采样 rAF 间隔与每帧 JS 耗时（与录像分开进行）。
// 云端无 GPU：Chromium 走 SwiftShader 软件渲染，数据只说明软件渲染下的表现，不代表真实电脑或手机。
const fs = require('fs');
const { BASE, snap, launch } = require('./lib');
const { makeBot } = require('./bot');
function stats(a) {
  const s = a.slice().sort((x, y) => x - y);
  const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  return { n: a.length, mean_ms: +mean.toFixed(2), fps: +(1000 / mean).toFixed(2), median_ms: +q(0.5).toFixed(2), p95_ms: +q(0.95).toFixed(2), max_ms: +s[s.length - 1].toFixed(2), over50ms: a.filter(x => x > 50).length };
}
async function run(name, ctxOpts, q, seconds, spot) {
  const browser = await launch();
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  await page.goto(BASE + '?test=1&clean=1&seed=41&q=' + q);
  await page.waitForTimeout(1200);
  const ri0 = await page.evaluate(() => __JK_TEST__.renderInfo());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  if (spot) await page.evaluate(([x, y]) => __JK_TEST__.cheat.teleport(x, y), spot);
  const bot = makeBot(page, { seed: 41 });
  await page.evaluate(() => __JK_TEST__.perfStart());
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < seconds * 1000) { s = await snap(page); await bot.tick(s); await page.waitForTimeout(100); }
  const d = await page.evaluate(() => __JK_TEST__.perfStop());
  const ri = await page.evaluate(() => __JK_TEST__.renderInfo());
  s = await snap(page);
  await browser.close();
  const calls = d.info.map(x => x.calls), tris = d.info.map(x => x.tris);
  return {
    name, renderer: ri0.gl, browser: 'Chromium headless (Playwright ' + require('playwright/package.json').version + ')',
    viewport: ctxOpts.viewport, dpr: ctxOpts.deviceScaleFactor || 1, quality: q, effective: s.ui.quality, backing: s.ui.display.backing, seconds,
    route: 'bot 实时游玩（seed=41）' + (spot ? '，从 ' + spot.join(',') + ' 开始' : '，从开场开始'),
    frameInterval: stats(d.frames), jsPerFrame: stats(d.work),
    drawCalls: calls.length ? { min: Math.min(...calls), max: Math.max(...calls) } : null, triangles: tris.length ? { min: Math.min(...tris), max: Math.max(...tris) } : null,
    memory: { geometries: ri.geometries, textures: ri.textures }, gameTimeAdvanced: s.t, finalPos: s.player
  };
}
(async () => {
  const out = [];
  out.push(await run('desktop-1280x720-high', { viewport: { width: 1280, height: 720 } }, 'high', 25, [0, 60]));
  out.push(await run('desktop-1280x720-low', { viewport: { width: 1280, height: 720 } }, 'low', 25, [0, 60]));
  out.push(await run('desktop-640x360-low', { viewport: { width: 640, height: 360 } }, 'low', 25, [0, 60]));
  out.push(await run('mobile-emu-844x390-dpr3-auto', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'auto', 25, [0, 60]));
  fs.mkdirSync('out', { recursive: true });
  fs.writeFileSync('out/perf.json', JSON.stringify({ when: new Date().toISOString(), note: '云端无 GPU：SwiftShader 软件渲染（2 核 CPU）。帧率主要受软件光栅限制（每帧 JS 只有几毫秒），不能外推到真实电脑或手机；手机为设备模拟。', runs: out }, null, 2));
  console.log(JSON.stringify(out.map(r => ({ name: r.name, fps: r.frameInterval.fps, median: r.frameInterval.median_ms, p95: r.frameInterval.p95_ms, js: r.jsPerFrame.mean_ms, calls: r.drawCalls, tris: r.triangles, eff: r.effective })), null, 1));
})();

// 性能：实时运行（不是手动步进），让脚本边打边测帧间隔；记录渲染器、视口、DPR、绘制批次与面数
// 无头 Edge + 本机显卡的结果只代表这台电脑，不能外推到手机真机。
const { open } = require('./lib.cjs');
const fs = require('fs');
const path = require('path');
const BOT = fs.readFileSync(path.join(__dirname, 'bot.browser.js'), 'utf8');

async function sample(page, seconds) {
  return page.evaluate((sec) => new Promise((res) => {
    const ts = []; let calls = 0, tris = 0, n = 0;
    const t0 = performance.now();
    const tick = (t) => {
      ts.push(t); window.__bot(1 / 60);
      const i = __lj.app.renderer.info.render; calls += i.calls; tris += i.triangles; n++;
      if (t - t0 < sec * 1000) requestAnimationFrame(tick);
      else {
        const d = []; for (let k = 1; k < ts.length; k++) d.push(ts[k] - ts[k - 1]);
        d.sort((a, b) => a - b);
        const sum = d.reduce((a, b) => a + b, 0);
        res({ frames: d.length, avgFps: +(1000 * d.length / sum).toFixed(1), medianMs: +d[Math.floor(d.length / 2)].toFixed(2), p95Ms: +d[Math.floor(d.length * 0.95)].toFixed(2), maxMs: +d[d.length - 1].toFixed(1), over50ms: d.filter((x) => x > 50).length, avgCalls: Math.round(calls / n), avgTris: Math.round(tris / n), phase: __lj.game.phase, units: __lj.game.units.length, quality: __lj.app.actualQuality() });
      }
    };
    requestAnimationFrame(tick);
  }), seconds);
}

(async () => {
  const out = { at: new Date().toISOString(), runs: [] };
  const cases = [
    { name: '电脑 1920×1080 高画质', ctx: { viewport: { width: 1920, height: 1080 } }, quality: 'high' },
    { name: '电脑 1280×720 高画质', ctx: { viewport: { width: 1280, height: 720 } }, quality: 'high' },
    { name: '手机模拟 844×390 DPR3 流畅', ctx: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }, quality: 'low' },
  ];
  for (const c of cases) {
    const { browser, page, errors } = await open({ context: c.ctx });
    const env = await page.evaluate(() => { const gl = __lj.app.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); const cv = document.getElementById('gl'); return { renderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown', dpr: devicePixelRatio, canvas: [cv.width, cv.height], ua: navigator.userAgent.replace(/^.*(Edg\/[\d.]+).*$/, '$1') }; });
    await page.evaluate((q) => { const a = __lj.app; a.s.quality = q; a.applyQuality(); a.layout(true); a.s.lives = 'inf'; }, c.quality);
    const run = { name: c.name, env, samples: [] };
    await page.evaluate(async () => { window.__W = await import('./js/world.js'); });
    await page.addScriptTag({ content: BOT });
    for (const [phase, view, secs] of [[1, 0, 12], [1, 1, 10], [2, 0, 12], [4, 0, 14], [4, 1, 10], [5, 0, 10]]) {
      await page.evaluate(([v, ph]) => { const a = __lj.app; a.s.view = v; a.s.startPhase = ph; if (a.state !== 'menu') a.toMenu(); a.start(false); window.__bot = window.__installBot(); }, [view, phase]);
      await page.waitForTimeout(1500);   // 预热
      const s = await sample(page, secs);
      s.view = ['第三人称', '第一人称'][view];
      s.canvas = await page.evaluate(() => { const cv = document.getElementById('gl'); return [cv.width, cv.height]; });
      run.samples.push(s);
      console.log(c.name, `阶段${phase} ${s.view}`, JSON.stringify(s));
    }
    run.errors = errors;
    out.runs.push(run);
    await browser.close();
  }
  fs.writeFileSync(path.join(__dirname, 'out-perf.json'), JSON.stringify(out, null, 1));
  console.log('渲染器：', out.runs[0].env.renderer);
})().catch((e) => { console.error(e); process.exit(2); });

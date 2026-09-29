// Browser-level render/QA check for contra-3d. One scenario per process
// (Edge headless crashes when a second WebGL context is created in the same
// browser process after the first one closed; isolated runs are stable).
// PLAYWRIGHT_MODULE=<playwright-core> BROWSER_EXECUTABLE=<chromium exe> \
//   node render-check.cjs <desktop|mobile|capture> <label> <outdir> [url]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const [scenario = 'desktop', label = 'after', out = 'render-results', url = 'http://127.0.0.1:8765/public/html/game/mario-1-1-3d/index.html'] = process.argv.slice(2);
const executablePath = process.env.BROWSER_EXECUTABLE;
const VIEWPORTS = { desktop: { width: 1280, height: 720 }, mobile: { width: 844, height: 390 }, shots: { width: 1280, height: 720 }, video: { width: 1280, height: 720 }, stages: { width: 1280, height: 720 } };
async function open(browser, viewport, recordVideo) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(recordVideo ? { recordVideo: { dir: out, size: viewport } } : {}) });
  const page = await context.newPage();
  await page.route('**/main.js*', async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: await r.text() + '\nwindow.__renderQA={view,world};' }); });
  await page.addInitScript(() => { Element.prototype.requestFullscreen = async () => { throw new Error('QA: windowed comparison'); }; });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url); await page.waitForFunction(() => window.__renderQA);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  assert.ok(await page.locator('#rotate').isHidden());
  return { context, page, errors };
}
async function sample(page, duration) {
  return page.evaluate(ms => new Promise(resolve => {
    const q = window.__renderQA, v = q.view, g = v.renderer.getContext(), ext = g.getExtension('WEBGL_debug_renderer_info');
    let last = performance.now(), start = last; const frames = [], calls = [], triangles = [];
    function tick(now) {
      frames.push(now - last); last = now; calls.push(v.renderer.info.render.calls); triangles.push(v.renderer.info.render.triangles);
      if (now - start < ms) return requestAnimationFrame(tick);
      frames.sort((a, b) => a - b); const quantile = p => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))];
      resolve({ seconds: (now - start) / 1000, frames: frames.length, fps: frames.length * 1000 / (now - start), median_ms: quantile(.5), p95_ms: quantile(.95), over50ms: frames.filter(t => t > 50).length, max_draw_calls: Math.max(...calls), max_triangles: Math.max(...triangles), renderer: ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER), pixelRatio: v.renderer.getPixelRatio(), width: g.drawingBufferWidth, height: g.drawingBufferHeight, state: q.world.status, x: q.world.player.x, z: q.world.player.z, lives: q.world.lives });
    }
    requestAnimationFrame(tick);
  }), duration);
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const viewport = VIEWPORTS[scenario];
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-dev-shm-usage'] });
  try {
    if (scenario === 'shots') {
      const { context, page, errors } = await open(browser, viewport, false);
      await page.screenshot({ path: path.join(out, label + '-ground.png') });
      await page.keyboard.down('KeyE'); await page.waitForTimeout(600); await page.keyboard.up('KeyE');
      await page.screenshot({ path: path.join(out, label + '-orbit.png') });
      await page.keyboard.press('KeyC'); await page.keyboard.down('KeyD'); await page.keyboard.down('KeyJ'); await page.waitForTimeout(1200); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyJ');
      await page.screenshot({ path: path.join(out, label + '-moving.png') }); assert.deepEqual(errors, []);
      console.log('shots OK');
    } else if (scenario === 'video') {
      // recordVideo crashes Edge headless with WebGL; use CDP screencast frames + ffmpeg.
      const { context, page, errors } = await open(browser, viewport, false);
      const cdp = await context.newCDPSession(page);
      const framesDir = path.join(out, 'frames'); fs.rmSync(framesDir, { recursive: true, force: true }); fs.mkdirSync(framesDir, { recursive: true });
      const frameFiles = []; let frameNo = 0;
      cdp.on('Page.screencastFrame', async f => {
        const file = path.join(framesDir, 'frame-' + String(++frameNo).padStart(6, '0') + '.jpg');
        fs.writeFileSync(file, Buffer.from(f.data, 'base64')); frameFiles.push(file);
        cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      });
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
      await page.keyboard.down('KeyD');
      const jumps = [1500, 3200, 4800];
      for (const t of jumps) setTimeout(() => page.keyboard.press('KeyK').catch(() => {}), t);
      await page.waitForTimeout(6500);
      await page.keyboard.up('KeyD');
      await cdp.send('Page.stopScreencast').catch(() => {});
      assert.deepEqual(errors, []);
      console.log('frames captured:', frameFiles.length);
      console.log('video OK');
    } else if (scenario === 'stages') {
      // QA test shortcut (marked, never exposed to players): teleport through key set pieces.
      const { context, page, errors } = await open(browser, viewport, false);
      const goto = async (x, name) => {
        await page.evaluate(x => { const p = window.__renderQA.world.player; p.x = x; p.z = 0; p.invuln = 6; }, x);
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(out, label + '-stage-' + name + '.png') });
      };
      await goto(30, 'blocks');
      await goto(66, 'gap');
      await goto(140, 'stairs');
      await goto(178, 'flag');
      assert.deepEqual(errors, []);
      console.log('stages OK');
    } else {
      const { context, page, errors } = await open(browser, viewport, false);
      await page.keyboard.down('KeyS'); await page.waitForTimeout(400); await page.keyboard.up('KeyS');
      await page.keyboard.down('KeyD'); await page.keyboard.down('KeyJ');
      const moving = await sample(page, 3500);
      await page.keyboard.up('KeyD'); await page.keyboard.up('KeyJ'); await page.keyboard.down('KeyE');
      const orbit = await sample(page, 2500); await page.keyboard.up('KeyE');
      assert.deepEqual(errors, []);
      const result = { label, url, scenario, viewport, browser: browser.version(), mode: 'headless Edge, default GPU (D3D11), DPR 1, recording disabled during timings', moving, orbit, errors };
      fs.writeFileSync(path.join(out, label + '-perf-' + scenario + '.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify(result, null, 2));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

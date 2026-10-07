// Targeted regressions for BV1Fwpw6FEFx: checkpoint roof spawns and retained plants.
// Teleports/manual steps are test-only setup; death, pipe and restart use real game paths.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const out = path.resolve(process.env.MARIO_OUT || 'game-projects/mario-3d/media-kit/releases/v2.4.3/captures');
const root = process.env.MARIO_ROOT ? path.resolve(process.env.MARIO_ROOT) : path.resolve(__dirname, '../../..', 'public');
const results = [];
async function openGame(page, entry) {
  await page.goto(entry.href);
  let frame = page.mainFrame();
  if (/bilibili[.]com[/]toy/.test(entry.href)) {
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => /bilibilitoy[.]com/.test(f.src)));
    frame = page.frames().find(f => /bilibilitoy[.]com/.test(f.url()));
    const inner = new URL(frame.url()); for (const [key, value] of entry.searchParams) inner.searchParams.set(key, value);
    await frame.goto(inner.href);
  }
  await frame.waitForFunction(() => window.__MARIO_TEST__);
  return frame;
}
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(detail)); };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => { if (e) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(b);
  });
});
(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = process.env.MARIO_URL || `http://127.0.0.1:${server.address().port}${process.env.MARIO_ROOT ? '/index.html' : '/html/game/mario-3d/index.html'}`;
  const entry = new URL(url); entry.searchParams.set('test', '1'); entry.searchParams.set('level', '1-2'); entry.searchParams.set('q', 'high');
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, recordVideo: { dir: out, size: viewport } });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const frame = await openGame(page, entry);
      await frame.locator('[data-control-mode=show]').first().click();
      await frame.locator('[data-act=start]').first().click();
      await frame.evaluate(() => { __MARIO_TEST__.manual(true); __MARIO_TEST__.skipCard(); __MARIO_TEST__.step(600); }); // 等待 1-2 地面钻管过场结束
      const prefix = `${viewport.width}x${viewport.height}`;
      check(prefix + ': initial underground entry stays below roof', await frame.evaluate(() => __MARIO_TEST__.world.player.y === 0));
      // Register the checkpoint through its real trigger, then walk over a pit.
      await frame.evaluate(() => { const p = __MARIO_TEST__.world.player; Object.assign(p, { x: 91.5, y: 0, vx: 0, vy: 0 }); __MARIO_TEST__.step(2); Object.assign(p, { x: 119.3, y: 0, vx: 0, vy: 0 }); });
      await page.keyboard.down('KeyD'); await frame.evaluate(() => __MARIO_TEST__.step(115)); await page.keyboard.up('KeyD');
      check(prefix + ': pit invokes death', await frame.evaluate(() => __MARIO_TEST__.world.mode === 'dying'));
      await frame.evaluate(() => { __MARIO_TEST__.step(420); __MARIO_TEST__.skipCard(); __MARIO_TEST__.step(12); });
      const respawn = await frame.evaluate(() => __MARIO_TEST__.state());
      check(prefix + ': checkpoint respawn returns to playable floor', respawn.player.x === 91.5 && respawn.player.y === 0 && respawn.player.inv > 0 && respawn.session.hearts === 3, respawn.player);
      await frame.evaluate(() => { const t = __MARIO_TEST__; t.world.player.inv = 0; t.world.rt.enemies.forEach(e => e.gone = true); t.step(1); });
      await page.screenshot({ path: path.join(out, prefix + '-checkpoint.png') });
      // Visible flowers before restart; count actual scene roots, not map bookkeeping.
      const plants = () => frame.evaluate(() => __MARIO_TEST__.view.scene.children.filter(o => o.userData.jaws).length);
      const showPlants = () => frame.evaluate(() => { const t = __MARIO_TEST__, w = t.world; Object.assign(w.player, { x: 108, y: 0, vx: 0, vy: 0 }); w.rt.piranhas.forEach(p => { p.rise = 1; p.phase = 'up'; p.t = 2; }); t.step(1); });
      await showPlants(); check(prefix + ': current area has nine plant models', (await plants()) === 9, await plants());
      for (let i = 0; i < 3; i++) {
        await frame.locator('#btn-pause').click(); await frame.locator('#pause [data-act=restart]').click();
        await frame.evaluate(() => { __MARIO_TEST__.skipCard(); __MARIO_TEST__.step(600); }); await showPlants();
        check(prefix + ': restart clears previous plants ' + i, (await plants()) === 9, await plants());
      }
      await page.screenshot({ path: path.join(out, prefix + '-plants.png') });
      // Real pipe transition to the bonus room and back.
      await frame.evaluate(() => { Object.assign(__MARIO_TEST__.world.player, { x: 104, y: 3, grounded: true, vx: 0, vy: 0 }); });
      await page.keyboard.down('KeyU'); await frame.evaluate(() => __MARIO_TEST__.step(145)); await page.keyboard.up('KeyU');
      check(prefix + ': bonus room has no retained plants', await frame.evaluate(() => __MARIO_TEST__.world.areaId === 'bonus') && (await plants()) === 0, await plants());
      await frame.evaluate(() => { Object.assign(__MARIO_TEST__.world.player, { x: 13.7, y: 0, grounded: true, vx: 2, vy: 0 }); });
      await page.keyboard.down('KeyD'); await frame.evaluate(() => __MARIO_TEST__.step(320)); await page.keyboard.up('KeyD');
      check(prefix + ': return from bonus restores only current plants', await frame.evaluate(() => __MARIO_TEST__.world.areaId === 'main') && (await plants()) === 9, await plants());
      await frame.locator('#btn-pause').click(); await frame.locator('#pause [data-act=title]').click();
      check(prefix + ': title clears underground plants', (await plants()) === 0, await plants());
      // Start 1-1 with the actual menu selector, matching the viewer's first screenshot.
      await frame.locator('[data-opt=level]').first().click(); await frame.locator('[data-act=start]').first().click();
      await frame.evaluate(() => { __MARIO_TEST__.skipCard(); __MARIO_TEST__.step(120); });
      check(prefix + ': 1-1 has no ghost plants', await frame.evaluate(() => __MARIO_TEST__.world.levelId === '1-1') && (await plants()) === 0, await plants());
      await frame.evaluate(() => { const t = __MARIO_TEST__; Object.assign(t.world.player, { x: 108, y: 0, vx: 0, vy: 0, inv: 0 }); t.world.rt.enemies.forEach(e => e.gone = true); t.view.snap = true; t.step(1); });
      await page.screenshot({ path: path.join(out, prefix + '-overworld.png') });
      check(prefix + ': no runtime errors', errors.length === 0, errors);
      const video = page.video(); await context.close(); await video.saveAs(path.join(out, prefix + '-regressions.webm')); await video.delete();
    }
    // Separate frame-time sampling from recording overhead; real-time movement and turn.
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } }); const page = await context.newPage();
    const frame = await openGame(page, entry);
    await frame.locator('[data-act=start]').first().click(); await frame.evaluate(() => __MARIO_TEST__.skipCard()); await page.waitForTimeout(1500);
    const timings = [];
    for (let i = 0; i < 5; i++) {
      await frame.evaluate(i => { const t = __MARIO_TEST__; t.view.setPreset(i); Object.assign(t.world.player, { x: 100, y: 0, vx: 0, vy: 0, inv: 999 }); t.perfStart(); }, i);
      await page.keyboard.down('KeyE'); await page.keyboard.down('KeyA'); await page.waitForTimeout(4200); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyE');
      const data = await frame.evaluate(() => { const t = __MARIO_TEST__, g = t.view.renderer.getContext(), ext = g.getExtension('WEBGL_debug_renderer_info'); return { ...t.perfStop(), info: t.renderInfo(), renderer: ext && g.getParameter(ext.UNMASKED_RENDERER_WEBGL), dpr: t.view.renderer.getPixelRatio() }; });
      const frames = data.frames.slice().sort((a,b) => a-b), sum = frames.reduce((a,b) => a+b,0);
      timings.push({ preset: i, fps: frames.length * 1000 / sum, medianMs: frames[Math.floor(frames.length*.5)], p95Ms: frames[Math.floor(frames.length*.95)], over50ms: frames.filter(x=>x>50).length, info: data.info, renderer: data.renderer, dpr: data.dpr });
      await page.screenshot({ path: path.join(out, 'preset-' + i + '.png') });
    }
    fs.writeFileSync(path.join(out, 'performance.json'), JSON.stringify(timings,null,2)); await context.close();
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ url, browser: browser.version(), methods: 'test-only teleports + real game simulation/UI, viewport emulation; no physical phone', results }, null, 2));
    console.log('PERFORMANCE', JSON.stringify(timings));
    process.exitCode = results.every(x => x.ok) ? 0 : 1;
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });

// 1-1 → 1-2 钻管过场回归。定位/手动时钟只用于测试准备，不是普通玩家游玩证据。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(process.env.MARIO_ROOT || path.join(__dirname, '../../../public'));
const out = path.resolve(process.env.MARIO_OUT || path.join(__dirname, '../media-kit/releases/v2.4.7/captures'));
const checks = [], errors = [];
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(detail || '')); };
const server = http.createServer((req, res) => {
  const f = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!f.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(f, (e, b) => { if (e) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(b);
  });
});
async function open(page, url) {
  await page.goto(url);
  let frame = page.mainFrame();
  if (/bilibili\.com\/toy/.test(url)) {
    await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => /bilibilitoy\.com/.test(f.src)));
    frame = page.frames().find(f => /bilibilitoy\.com/.test(f.url()));
    const inner = new URL(frame.url()); inner.searchParams.set('test', '1'); inner.searchParams.set('level', '1-1');
    await frame.goto(inner.href);
  }
  await frame.waitForFunction(() => window.__MARIO_TEST__);
  return frame;
}
async function until(frame, condition, max = 4000) {
  for (let i = 0; i < max; i++) {
    const reached = await frame.evaluate(c => { const t = __MARIO_TEST__; if (c === 'level2') return t.world.levelId === '1-2'; if (c === 'pipe') return t.world.mode === 'pipe'; if (c === 'drop') return t.world.areaId === 'main'; if (c === 'play') return t.world.mode === 'play'; if (c === 'card') return t.state().phase === 'card'; return t.state().overlay === 'result'; }, condition);
    if (reached) return true;
    await frame.evaluate(() => __MARIO_TEST__.step(12));
  }
  throw Error('Timed out waiting for ' + condition);
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = new URL(process.env.MARIO_URL || `http://127.0.0.1:${server.address().port}${process.env.MARIO_ROOT ? '/index.html' : '/html/game/mario-3d/index.html'}`);
  url.searchParams.set('test', '1'); url.searchParams.set('level', '1-1');
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, recordVideo: { dir: out, size: viewport } });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      const frame = await open(page, url.href), prefix = `${viewport.width}x${viewport.height}`;
      await frame.locator('[data-control-mode=show]').first().click();
      await frame.locator('[data-act=start]').first().click();
      await frame.evaluate(() => { const t = __MARIO_TEST__; t.manual(true); t.skipCard(); const w = t.world; w.session.coins = 23; w.session.score = 1234; w.session.power = w.player.power = 'fire'; w.time = 102; Object.assign(w.player, { x: 198.3, y: 7, vx: 0, vy: 0 }); t.step(1); });
      await until(frame, 'level2');
      const entry = await frame.evaluate(() => __MARIO_TEST__.state());
      check(prefix + ' 1-1 clear reaches 1-2 surface card', entry.area === 'entry' && entry.mode === 'entrance' && entry.phase === 'card' && entry.cleared[0] === '1-1', entry);
      check(prefix + ' score/coins/power/lives carry over', entry.session.coins === 23 && entry.session.power === 'fire' && entry.player.power === 'fire' && entry.session.lives === 'inf' && entry.session.score > 1234, entry.session);
      const score = entry.session.score;
      await frame.evaluate(() => { __MARIO_TEST__.skipCard(); __MARIO_TEST__.step(90); });
      await page.screenshot({ path: path.join(out, prefix + '-surface-walk.png') });
      const before = await frame.evaluate(() => ({ state: __MARIO_TEST__.state(), clock: __MARIO_TEST__.world.clock }));
      await frame.locator('#btn-pause').click(); await frame.evaluate(() => __MARIO_TEST__.step(240));
      const paused = await frame.evaluate(() => ({ state: __MARIO_TEST__.state(), clock: __MARIO_TEST__.world.clock }));
      check(prefix + ' pause freezes entrance', paused.state.paused && before.clock === paused.clock && before.state.player.x === paused.state.player.x);
      await frame.locator('#pause [data-act=resume]').click();
      await page.keyboard.down('KeyA'); await page.keyboard.down('KeyK'); await page.keyboard.down('KeyE');
      await until(frame, 'pipe');
      const pipe = await frame.evaluate(() => __MARIO_TEST__.state());
      check(prefix + ' automatic horizontal pipe ignores movement/jump', pipe.area === 'entry' && pipe.player.y === 0 && pipe.player.x >= 12.64 && pipe.events.includes('pipe'), pipe.player);
      await frame.evaluate(() => __MARIO_TEST__.step(50));
      await page.screenshot({ path: path.join(out, prefix + '-enter-pipe.png') });
      await until(frame, 'drop');
      await page.screenshot({ path: path.join(out, prefix + '-underground-drop.png') });
      await until(frame, 'play');
      await page.keyboard.up('KeyA'); await page.keyboard.up('KeyK'); await page.keyboard.up('KeyE');
      const landed = await frame.evaluate(() => __MARIO_TEST__.state());
      check(prefix + ' lands before input/timer resume', landed.area === 'main' && landed.player.x === 2.6 && landed.player.y === 0 && landed.player.grounded && landed.time === 400 && landed.keys.length === 0, landed);
      check(prefix + ' entrance does not award points/secrets', landed.session.score === score && landed.session.stats.secrets === entry.session.stats.secrets);
      await page.screenshot({ path: path.join(out, prefix + '-underground-ready.png') });
      // First-person setting survives the cinematic; restarting repeats entrance and landing.
      await frame.evaluate(() => __MARIO_TEST__.view.setPreset(3));
      await frame.locator('#btn-pause').click(); await frame.locator('#pause [data-act=restart]').click();
      await frame.evaluate(() => __MARIO_TEST__.skipCard());
      check(prefix + ' first-person temporarily shows player for cinematic', await frame.evaluate(() => !__MARIO_TEST__.view.firstPerson(__MARIO_TEST__.world) && __MARIO_TEST__.view.presetIndex === 3));
      await until(frame, 'play');
      check(prefix + ' first-person restored after landing', await frame.evaluate(() => __MARIO_TEST__.view.firstPerson(__MARIO_TEST__.world) && __MARIO_TEST__.view.presetIndex === 3));
      // Checkpoint death bypasses the opening without spawning on the underground roof.
      await frame.evaluate(() => { const t = __MARIO_TEST__; Object.assign(t.world.player, { x: 91.5, y: 0, vx: 0, vy: 0 }); t.step(1); t.world.player.y = -7; t.step(1); });
      await until(frame, 'card'); await frame.evaluate(() => __MARIO_TEST__.skipCard());
      const respawn = await frame.evaluate(() => __MARIO_TEST__.state());
      check(prefix + ' checkpoint respawn skips opening', respawn.area === 'main' && respawn.mode === 'play' && respawn.player.x === 91.5 && respawn.player.y === 0, respawn.player);
      // Existing reward and exit pipes still use their original playable destinations.
      await frame.evaluate(() => Object.assign(__MARIO_TEST__.world.player, { x: 104, y: 3, grounded: true, vx: 0, vy: 0 }));
      await page.keyboard.down('KeyU'); await frame.evaluate(() => __MARIO_TEST__.step(150)); await page.keyboard.up('KeyU');
      check(prefix + ' bonus pipe stays playable', await frame.evaluate(() => __MARIO_TEST__.world.areaId === 'bonus' && !__MARIO_TEST__.world.entrance));
      await frame.evaluate(() => Object.assign(__MARIO_TEST__.world.player, { x: 13.7, y: 0, grounded: true, vx: 0, vy: 0 }));
      await page.keyboard.down('KeyU'); await frame.evaluate(() => __MARIO_TEST__.step(400)); await page.keyboard.up('KeyU');
      check(prefix + ' bonus return still rises to correct pipe', await frame.evaluate(() => __MARIO_TEST__.world.areaId === 'main' && __MARIO_TEST__.world.player.y === 2));
      await frame.evaluate(() => { __MARIO_TEST__.view.setPreset(0); Object.assign(__MARIO_TEST__.world.player, { x: 165.64, y: 3, grounded: true, vx: 0, vy: 0 }); });
      await page.keyboard.down('KeyU'); await frame.evaluate(() => __MARIO_TEST__.step(400)); await page.keyboard.up('KeyU');
      check(prefix + ' exit pipe still rises to overworld', await frame.evaluate(() => __MARIO_TEST__.world.areaId === 'exit' && __MARIO_TEST__.world.player.y === 2));
      await frame.evaluate(() => { const t = __MARIO_TEST__; t.world.time = 102; Object.assign(t.world.player, { x: 32.3, y: 7, vx: 0, vy: 0 }); t.step(1); });
      const finalLevel = await frame.evaluate(() => __MARIO_TEST__.world.levelId === '1-3');
      if (!finalLevel) {
        for (let n = 0; n < 400 && await frame.evaluate(() => __MARIO_TEST__.world.levelId === '1-2'); n++) await frame.evaluate(() => __MARIO_TEST__.step(12));
      }
      if (await frame.evaluate(() => __MARIO_TEST__.world.levelId === '1-3')) {
        check(prefix + ' 1-2 clear enters third stage', await frame.evaluate(() => __MARIO_TEST__.state().cleared.join() === '1-1,1-2'));
        await frame.evaluate(() => { const t = __MARIO_TEST__; t.skipCard(); Object.assign(t.world.player, { x: t.world.area.flag.x - .2, y: 1, vx: 0, vy: 0 }); t.step(1); });
      }
      await until(frame, 'result');
      check(prefix + ' last implemented stage settles', await frame.evaluate(() => __MARIO_TEST__.state().overlay === 'result'));
      await frame.locator('#result [data-act=title]').click();
      await frame.locator('[data-opt=level]').first().click(); await frame.locator('[data-act=start]').first().click();
      check(prefix + ' menu directly selecting 1-2 includes opening', await frame.evaluate(() => __MARIO_TEST__.world.levelId === '1-2' && __MARIO_TEST__.world.areaId === 'entry'));
      // Real-time recording of this exact build (test hook only chooses starting level).
      await frame.evaluate(() => { __MARIO_TEST__.skipCard(); __MARIO_TEST__.manual(false); });
      await page.waitForTimeout(4700);
      check(prefix + ' real-time opening reaches playable floor', await frame.evaluate(() => __MARIO_TEST__.world.areaId === 'main' && __MARIO_TEST__.world.mode === 'play'));
      const video = page.video(); await context.close(); await video.saveAs(path.join(out, prefix + '-entrance.webm')); await video.delete();
    }
    check('no browser runtime errors', errors.length === 0, errors);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ url: url.href, browser: browser.version(), methods: 'Test-only teleports/manual clock for regression; final 4.7 seconds use real-time simulation; viewport emulation, no physical phone; videos have no audio.', checks }, null, 2));
    process.exitCode = checks.every(c => c.ok) ? 0 : 1;
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });

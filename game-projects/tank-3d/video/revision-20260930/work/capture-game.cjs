// Browser QA for tank-3d. Serve the repo root over HTTP first (e.g. `python -m http.server 8765`), then:
//   PLAYWRIGHT_MODULE=<playwright or playwright-core> [BROWSER_EXECUTABLE=<chromium/edge exe>] \
//     node render-check.cjs <scenario> <outdir> [url]
// Scenarios: flow | shots | mobile | perf-desktop | perf-mobile | capture
// QA-only hooks (virtual clock, bot input, teleports) are injected by this script and never shipped to players.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const [scenario = 'flow', out = 'render-results', url = 'http://127.0.0.1:8765/public/html/game/tank-3d/index.html'] = process.argv.slice(2);
const GL_ARGS = process.env.QA_GPU ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const SEED = Number(process.env.QA_SEED || 109);

// In-page driver: virtual clock (frames advance only on __advance), a line-up-and-shoot bot, and a hook to the game modules.
const DRIVER = ({ virtual }) => {
  window.__frames = 0;
  if (virtual) {
    let vnow = 1000; const cbs = [];
    performance.now = () => vnow;
    window.requestAnimationFrame = cb => { cbs.push(cb); return cbs.length; };
    window.__advance = (n = 1, ms = 1000 / 30) => { for (let i = 0; i < n; i++) { vnow += ms; window.__beforeFrame && window.__beforeFrame(); const list = cbs.splice(0); for (const cb of list) cb(vnow); window.__frames++; } };
  } else {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => { window.__beforeFrame && window.__beforeFrame(); cb(t); });
  }
  const down = new Set();
  const key = (code, on) => { if (on === down.has(code)) return; if (on) down.add(code); else down.delete(code); window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, bubbles: true })); };
  window.__key = key;
  window.__bot = false;
  window.__beforeFrame = () => {
    if (!window.__bot || !window.__qa) return;
    const w = window.__qa.world, p = w.player;
    const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, KeyJ: false };
    if (p && w.status === 'playing') {
      let best = null, bd = 1e9;
      for (const e of w.enemies) { const d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z); if (d < bd) { bd = d; best = e; } }
      if (w.powerup) { const pu = w.powerup, d = Math.abs(pu.x - p.x) + Math.abs(pu.z - p.z); if (d < 9) best = pu; }
      const hitsFort = d => (d === 2 && p.x > 9.5 && p.x < 16.5) || (p.z > 21.5 && ((d === 1 && p.x < 12) || (d === 3 && p.x > 14)));
      let dir = -1, fire = false;
      if (best) {
        const dx = best.x - p.x, dz = best.z - p.z;
        if (Math.abs(dx) < .6) dir = dz < 0 ? 0 : 2; else if (Math.abs(dz) < .6) dir = dx < 0 ? 3 : 1;
        else dir = Math.abs(dx) < Math.abs(dz) ? (dx < 0 ? 3 : 1) : (dz < 0 ? 0 : 2);
        fire = !hitsFort(dir);
      }
      const names = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
      if (dir >= 0) keys[names[dir]] = true;   // camera stays at yaw 0 during bot runs, so WASD = world directions
      keys.KeyJ = fire;
    }
    for (const [k, v] of Object.entries(keys)) key(k, v);
  };
};
async function open(browser, opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1920, height: 1080 }, deviceScaleFactor: opts.dpr || 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  const page = await context.newPage(); page.setDefaultTimeout(180000);
  await page.route('**/main.js*', async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: await r.text() + "\nimport * as __W from './world.js';\nwindow.__qa={view,world,audio,W:__W,get phase(){return phase},get paused(){return paused}};" }); });
  await page.addInitScript(DRIVER, { virtual: !!opts.virtual });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__qa, null, { polling: 100, timeout: 60000 });
  if (opts.virtual) await page.evaluate(() => window.__advance(2));
  await page.evaluate(seed => { const q = window.__qa; Object.assign(q.world, q.W.createWorld(seed)); }, SEED);
  return { context, page, errors };
}
const adv = (page, n) => page.evaluate(n => window.__advance(n), n);
const state = page => page.evaluate(() => { const q = window.__qa, w = q.world; return { phase: q.phase, paused: q.paused, status: w.status, reason: w.reason, time: +w.time.toFixed(2), score: w.score, lives: w.lives, killed: w.killed, level: w.level, player: w.player && { x: +w.player.x.toFixed(2), z: +w.player.z.toFixed(2), dir: w.player.dir }, enemies: w.enemies.length, bricks: Array.from(w.grid).filter(c => c === 1).length, powerup: w.powerup && w.powerup.type }; });
async function sampleFrames(page, ms) {
  return page.evaluate(ms => new Promise(resolve => {
    const v = window.__qa.view, g = v.renderer.getContext(), ext = g.getExtension('WEBGL_debug_renderer_info');
    let last = performance.now(); const start = last, frames = [], calls = [], tris = [];
    function tick(now) {
      frames.push(now - last); last = now; calls.push(v.renderer.info.render.calls); tris.push(v.renderer.info.render.triangles);
      if (now - start < ms) return requestAnimationFrame(tick);
      const sorted = frames.slice(1).sort((a, b) => a - b), q = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
      resolve({ seconds: +((now - start) / 1000).toFixed(2), frames: frames.length, fps: +(frames.length * 1000 / (now - start)).toFixed(2), median_ms: +q(.5).toFixed(1), p95_ms: +q(.95).toFixed(1), over50ms: sorted.filter(t => t > 50).length, max_draw_calls: Math.max(...calls), max_triangles: Math.max(...tris), renderer: ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER), pixelRatio: v.renderer.getPixelRatio(), drawing_buffer: [g.drawingBufferWidth, g.drawingBufferHeight] });
    }
    requestAnimationFrame(tick);
  }), ms);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE, args: GL_ARGS });
  const log = [];
  const note = (k, v) => { log.push({ k, v }); console.log(k, typeof v === 'string' ? v : JSON.stringify(v)); };
  try {
    if (scenario === 'flow') {
      // Keyboard-only full loop with a virtual clock: title → Enter → intro → play → Esc pause → Enter resume
      // → camera-relative steering check → forced defeat → Enter restart (walls rebuilt) → forced clear.
      const { page, errors } = await open(browser, { virtual: true, viewport: { width: 640, height: 360 } });
      let s = await state(page); assert.equal(s.phase, 'title');
      await page.keyboard.press('Enter'); await adv(page, 20);
      s = await state(page); assert.equal(s.phase, 'intro'); note('intro', s);
      await adv(page, 80); s = await state(page); assert.equal(s.phase, 'playing'); assert.ok(s.player, 'player spawned'); note('playing', s);
      // Drive up 1 s with W.
      const z0 = s.player.z; await page.keyboard.down('KeyW'); await adv(page, 30); await page.keyboard.up('KeyW');
      s = await state(page); assert.ok(s.player.z < z0 - 3, 'W drives north'); assert.equal(s.player.dir, 0);
      // Esc pauses: world time frozen; Enter resumes.
      await page.keyboard.press('Escape'); const t0 = (await state(page)).time; await adv(page, 30);
      s = await state(page); assert.equal(s.paused, true); assert.equal(s.time, t0); note('paused', s);
      await page.keyboard.press('Enter'); await adv(page, 5); s = await state(page); assert.equal(s.paused, false);
      // Orbit ~90° with E, then W should map to a different world direction (camera-relative).
      await page.keyboard.down('KeyE'); await adv(page, 28); await page.keyboard.up('KeyE');
      const yaw = await page.evaluate(() => window.__qa.view.yaw); note('yaw after E', yaw);
      await page.keyboard.down('KeyW'); await adv(page, 3); await page.keyboard.up('KeyW');
      s = await state(page); note('dir after orbit + W', s.player.dir); assert.notEqual(s.player.dir, 0);
      await page.keyboard.down('KeyC'); await adv(page, 2); await page.keyboard.up('KeyC');
      assert.ok(Math.abs(await page.evaluate(() => window.__qa.view.yaw)) < 1e-6, 'C recentres');
      // Blur clears held keys and auto-pauses.
      await page.keyboard.down('KeyD'); await adv(page, 2); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await adv(page, 2);
      s = await state(page); assert.equal(s.paused, true); await page.keyboard.up('KeyD'); await page.keyboard.press('Enter'); await adv(page, 2);
      const px = (await state(page)).player.x; await adv(page, 20); assert.equal((await state(page)).player.x, px, 'no stuck key after blur');
      // Forced defeat (QA shortcut): destroy the eagle.
      await page.evaluate(() => { const q = window.__qa; q.W.qa.destroyBase(q.world, 'enemy'); }); await adv(page, 120);
      s = await state(page); assert.equal(s.phase, 'over'); assert.equal(s.status, 'lost'); note('defeat', s);
      await page.waitForTimeout(1700); await adv(page, 2);
      assert.ok(await page.locator('#panel').isVisible()); await page.screenshot({ path: path.join(out, 'flow-defeat-panel.png') });
      const bricksBefore = (await state(page)).bricks;
      await page.keyboard.press('Enter'); await adv(page, 100);
      s = await state(page); assert.equal(s.phase, 'playing'); assert.equal(s.status, 'playing'); assert.equal(s.lives, 3); assert.ok(s.bricks >= bricksBefore); note('restarted', s);
      await adv(page, 12); await page.screenshot({ path: path.join(out, 'flow-restart-rebuild.png') });
      // Forced clear (QA shortcut): destroy every tank as it appears.
      for (let i = 0; i < 160; i++) { await page.evaluate(() => { const q = window.__qa; for (const e of q.world.enemies) if (e.alive) q.W.qa.destroyEnemy(q.world, e); if (q.world.player) q.world.player.shield = 99; }); await adv(page, 15); if ((await state(page)).phase === 'over') break; }
      s = await state(page); assert.equal(s.status, 'won'); note('cleared', s);
      await adv(page, 4); await page.screenshot({ path: path.join(out, 'flow-win-panel.png') });
      assert.deepEqual(errors, []);
      note('flow', 'OK');
    } else if (scenario === 'shots') {
      const { page, errors } = await open(browser, { virtual: true });
      await adv(page, 20); await page.screenshot({ path: path.join(out, 'title.png') });
      await page.keyboard.press('Enter'); await adv(page, 12);
      await page.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 500; }));
      await page.screenshot({ path: path.join(out, 'curtain.png') });
      await page.evaluate(() => document.getAnimations().forEach(a => { a.currentTime = 1250; }));
      await adv(page, 34); await page.screenshot({ path: path.join(out, 'intro-swoop.png') });
      await adv(page, 60);
      await page.evaluate(() => { window.__bot = true; });
      await adv(page, 30 * 14); await page.screenshot({ path: path.join(out, 'battle-overview.png') }); note('battle', await state(page));
      await page.evaluate(() => { window.__bot = false; }); await adv(page, 1);
      await page.keyboard.down('KeyE'); await adv(page, 16); await page.keyboard.up('KeyE'); await page.keyboard.down('KeyR'); await adv(page, 14); await page.keyboard.up('KeyR');
      await adv(page, 20); await page.screenshot({ path: path.join(out, 'orbit-low.png') });
      await page.keyboard.down('KeyR'); await adv(page, 30); await page.keyboard.up('KeyR'); await page.keyboard.press('KeyQ');
      await adv(page, 20); await page.screenshot({ path: path.join(out, 'commander-view.png') });
      await page.keyboard.down('KeyC'); await adv(page, 2); await page.keyboard.up('KeyC');
      // Power-up + steel fort (QA shortcuts), then a tank explosion mid-air.
      await page.evaluate(() => { const q = window.__qa; q.W.spawnPowerup(q.world, 'star'); q.W.qa.applyPowerup(q.world, { type: 'shovel', x: 13, z: 20 }); if (q.world.player) q.world.player.shield = 99; });
      await adv(page, 16); await page.screenshot({ path: path.join(out, 'powerup-steel-fort.png') });
      await page.evaluate(() => { const q = window.__qa; const e = q.world.enemies.find(e => e.alive); if (e) q.W.qa.destroyEnemy(q.world, e); });
      await adv(page, 4); await page.screenshot({ path: path.join(out, 'explosion.png') });
      await page.evaluate(() => { const q = window.__qa; q.W.qa.applyPowerup(q.world, { type: 'timer', x: 13, z: 13 }); q.world.level = 3; });
      await adv(page, 10); await page.screenshot({ path: path.join(out, 'freeze-level3.png') });
      assert.deepEqual(errors, []); note('shots', 'OK');
    } else if (scenario === 'mobile') {
      const { page, errors, context } = await open(browser, { virtual: true, mobile: true, viewport: { width: 844, height: 390 }, dpr: 2 });
      await adv(page, 10);
      assert.ok(await page.locator('#stick').count()); await page.screenshot({ path: path.join(out, 'mobile-title.png') });
      await page.tap('#start'); await adv(page, 110);
      let s = await state(page); assert.equal(s.phase, 'playing'); assert.ok(await page.locator('#stick').isVisible()); assert.ok(await page.locator('.fire-btn').isVisible());
      // Multi-touch: hold the stick up (touch 1) while holding fire (touch 2).
      const cdp = await context.newCDPSession(page);
      const box = await page.locator('#stick').boundingBox(), fire = await page.locator('.fire-btn').boundingBox();
      const sx = box.x + box.width / 2, sy = box.y + box.height / 2, fx = fire.x + fire.width / 2, fy = fire.y + fire.height / 2;
      const z0 = s.player.z;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx, y: sy - 45, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy - 45, id: 1 }, { x: fx, y: fy, id: 2 }] });
      await adv(page, 24); await page.screenshot({ path: path.join(out, 'mobile-play.png') });
      s = await state(page); const bullets = await page.evaluate(() => window.__qa.world.bullets.length + window.__qa.world.events.length);
      note('mobile stick+fire', { z0, z: s.player.z, bullets });
      assert.ok(s.player.z < z0 - 2, 'stick drives north');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await adv(page, 10); const zStop = (await state(page)).player.z; await adv(page, 10); assert.equal((await state(page)).player.z, zStop, 'released stick stops the tank');
      // Portrait → rotate overlay + auto pause; back to landscape → resume via button.
      await page.setViewportSize({ width: 390, height: 844 }); await adv(page, 4);
      assert.ok(await page.locator('#rotate').isVisible()); s = await state(page); assert.equal(s.paused, true);
      await page.screenshot({ path: path.join(out, 'mobile-portrait-paused.png') });
      await page.setViewportSize({ width: 844, height: 390 }); await adv(page, 4);
      assert.ok(await page.locator('#rotate').isHidden()); await page.locator('#pause').tap(); await adv(page, 4);
      s = await state(page); assert.equal(s.paused, false); note('mobile resume', s);
      await page.setViewportSize({ width: 740, height: 360 }); await adv(page, 6); await page.screenshot({ path: path.join(out, 'mobile-narrow.png') });
      assert.deepEqual(errors, []); note('mobile', 'OK');
    } else if (scenario === 'perf-desktop' || scenario === 'perf-mobile') {
      const mobile = scenario === 'perf-mobile';
      const { page, errors } = await open(browser, { mobile, viewport: mobile ? { width: 844, height: 390 } : { width: 1920, height: 1080 }, dpr: mobile ? 2 : 1 });
      await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__qa.phase === 'playing', null, { polling: 250, timeout: 180000 });
      await page.evaluate(() => { window.__bot = true; const q = window.__qa; setInterval(() => { if (q.world.player) q.world.player.shield = 99; }, 200); });
      await page.waitForTimeout(2500);
      const play = await sampleFrames(page, 8000);
      await page.keyboard.down('KeyE'); const orbit = await sampleFrames(page, 3000); await page.keyboard.up('KeyE');
      const result = { scenario, url, viewport: mobile ? '844x390 @2x touch emulation' : '1280x720 @1x', browser: browser.version(), mode: process.env.QA_GPU ? 'headless, default GL' : 'headless, SwiftShader software GL (not representative of real GPUs)', route: 'bot plays with QA shield; then orbit with E', play, orbit, errors };
      fs.writeFileSync(path.join(out, scenario + '.json'), JSON.stringify(result, null, 2)); note(scenario, result);
    } else if (scenario === 'capture') {
      // Offline render: virtual clock at 30 fps, bot input, one PNG per frame → H.264 (no audio).
      const seconds = Number(process.env.QA_SECONDS || 30), fps = 30;
      const { page, errors } = await open(browser, { virtual: true });
      // Resumable: the run is deterministic (seeded world, fixed dt, scripted bot), so a restarted process
      // replays the already-captured frames without screenshots and continues where it stopped.
      const dir = path.join(out, 'frames'); if (process.env.QA_FRESH) fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      const existing = Math.max(0, fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).length - 1);
      if (existing) note('resume from frame', existing);
      let n = 0; const shot = async () => { if (n >= existing) await page.screenshot({ path: path.join(dir, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 88 }); n++; };
      // Log every sound call against the virtual clock so a synced game-audio track can be rendered offline afterwards.
      const v0 = await page.evaluate(() => {
        const a = window.__qa.audio, eff = a.effect.bind(a), tick = a.tick.bind(a); window.__audioLog = [];
        a.effect = e => { window.__audioLog.push([performance.now(), 'e', typeof e === 'string' ? e : JSON.parse(JSON.stringify(e))]); eff(e); };
        a.tick = (act, mov) => { window.__audioLog.push([performance.now(), 't', act ? 1 : 0, mov ? 1 : 0]); tick(act, mov); };
        return performance.now();
      });
      for (let i = 0; i < 20; i++) { await adv(page, 1); await shot(); }
      await page.keyboard.press('Enter');
      const anims = async ms => page.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }), ms);
      for (let i = 0; i < 90; i++) { await anims(i * 1000 / fps); await adv(page, 1); await shot(); }
      await page.evaluate(() => { window.__bot = true; });
      const timeline = [];
      for (let i = 0; i < seconds * fps; i++) {
        await adv(page, 1); await shot();
        if (i % 15 === 0) { const s = await state(page); timeline.push({ t: +(n / fps).toFixed(2), ...s }); if (s.phase === 'over' && i > 60) { for (let k = 0; k < 75; k++) { await adv(page, 1); await shot(); } break; } }
      }
      assert.deepEqual(errors, []);
      const mp4 = path.join(out, 'capture-offline.mp4');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]);
      fs.writeFileSync(path.join(out, 'capture-timeline.json'), JSON.stringify({ seed: SEED, fps, frames: n, timeline }, null, 2));
      // Offline audio: replay the logged calls through the game's own GameAudio on an OfflineAudioContext.
      const wavB64 = await page.evaluate(async ({ v0, seconds }) => {
        const { GameAudio } = await import(new URL('./audio.js', location.href).href);
        const rate = 44100, off = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
        let T = 0;
        const ctx = new Proxy(off, { get(target, prop) { if (prop === 'currentTime') return T; if (prop === 'createMediaStreamDestination') return () => target.createGain(); if (prop === 'state') return 'running'; const v = Reflect.get(target, prop); return typeof v === 'function' ? v.bind(target) : v; } });
        const RealAC = window.AudioContext; window.AudioContext = function () { return ctx; };
        const a = new GameAudio(); await a.unlock(); window.AudioContext = RealAC;
        for (const [tv, kind, x, y] of window.__audioLog) {
          T = (tv - v0) / 1000 - 1 / 30; if (T < 0 || T >= seconds - .05) continue;
          if (kind === 'e') a.effect(x); else a.tick(!!x, !!y);
        }
        const buf = await off.startRendering(), ch = buf.getChannelData(0), n = ch.length;
        const view = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o, str) => [...str].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, ch[i])) * 32767, true);
        let bin = ''; const bytes = new Uint8Array(view.buffer); for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
        return btoa(bin);
      }, { v0, seconds: n / fps });
      const wav = path.join(out, 'capture-audio-offline.wav'); fs.writeFileSync(wav, Buffer.from(wavB64, 'base64'));
      const mp4a = path.join(out, 'capture-offline-audio.mp4');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4a]);
      note('capture', { frames: n, mp4, mp4a }); fs.writeFileSync(path.join(out, 'DONE'), String(n));
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

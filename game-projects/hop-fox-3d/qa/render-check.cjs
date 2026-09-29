// Browser QA for hop-fox-3d. Serve the repo root over HTTP first (e.g. `python -m http.server 8765`), then:
//   PLAYWRIGHT_MODULE=<playwright or playwright-core> [BROWSER_EXECUTABLE=<chromium/edge exe>] \
//     node render-check.cjs <scenario> <outdir> [url]
// Scenarios: flow | shots | mobile | perf-desktop | perf-mobile | capture
// QA-only hooks (virtual clock, scripted bot, teleports) are injected here and never shipped to players.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const [scenario = 'flow', out = 'render-results', url = 'http://127.0.0.1:8765/public/html/game/hop-fox-3d/index.html'] = process.argv.slice(2);
const GL_ARGS = process.env.QA_GPU ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

const DRIVER = ({ virtual }) => {
  if (virtual) {
    let vnow = 1000; const cbs = [];
    performance.now = () => vnow;
    window.requestAnimationFrame = cb => { cbs.push(cb); return cbs.length; };
    window.__advance = (n = 1, ms = 1000 / 30) => { for (let i = 0; i < n; i++) { vnow += ms; window.__beforeFrame && window.__beforeFrame(); const list = cbs.splice(0); for (const cb of list) cb(vnow); } };
  } else {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => raf(t => { window.__beforeFrame && window.__beforeFrame(); cb(t); });
  }
  const down = new Set();
  const key = (code, on) => { if (on === down.has(code)) return; if (on) down.add(code); else down.delete(code); window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, bubbles: true })); };
  window.__key = key; window.__bot = false;
  window.__beforeFrame = () => {
    if (!window.__bot || !window.__qa || !window.__botInput) return;
    const i = window.__botInput(window.__qa.world, window.__qa.W);
    key('KeyD', i.x > 0); key('KeyA', i.x < 0); key('KeyK', !!i.jump); key('KeyJ', !!(i.run || i.action));
  };
};
async function open(browser, opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 720 }, deviceScaleFactor: opts.dpr || 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, locale: opts.locale || 'en-US' });
  const page = await context.newPage(); page.setDefaultTimeout(300000);
  await page.route('**/main.js*', async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: await r.text() + "\nimport * as __W from './world.js';\nwindow.__qa={view,world,audio,W:__W,get phase(){return phase},get paused(){return paused}};" }); });
  await page.addInitScript(DRIVER, { virtual: !!opts.virtual });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__qa, null, { polling: 100, timeout: 60000 });
  await page.evaluate(async () => { const m = await import(new URL('/game-projects/hop-fox-3d/qa/bot.mjs', location.href).href); window.__botInput = m.botInput; });
  if (opts.virtual) await page.evaluate(() => window.__advance(2));
  return { context, page, errors };
}
const adv = (page, n) => page.evaluate(n => window.__advance(n), n);
const state = page => page.evaluate(() => { const q = window.__qa, w = q.world, p = w.hero; return { phase: q.phase, paused: q.paused, status: w.status, time: Math.round(w.time), score: Math.floor(w.score), coins: w.coins, lives: w.lives, hero: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), power: p.power, dead: p.dead }, goal: w.goal && w.goal.phase }; });
const teleport = (page, x, y, extra = {}) => page.evaluate(({ x, y, extra }) => { const p = window.__qa.world.hero; Object.assign(p, { x, y, vx: 0, vy: 0, grounded: false, invincible: 3 }, extra); }, { x, y, extra });
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
  const note = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
  const shotP = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });
  try {
    if (scenario === 'flow') {
      const { page, errors } = await open(browser, { virtual: true, viewport: { width: 640, height: 360 } });
      let s = await state(page); assert.equal(s.phase, 'title');
      await page.keyboard.press('Enter'); await adv(page, 30); s = await state(page); assert.equal(s.phase, 'intro');
      await adv(page, 50); s = await state(page); assert.equal(s.phase, 'playing'); note('playing', s);
      const x0 = s.hero.x; await page.keyboard.down('KeyD'); await adv(page, 30); await page.keyboard.up('KeyD'); s = await state(page); assert.ok(s.hero.x > x0 + 3, 'D walks right');
      await page.keyboard.down('KeyK'); await adv(page, 6); s = await state(page); assert.ok(s.hero.y > .5, 'K jumps'); await page.keyboard.up('KeyK'); await adv(page, 30);
      await page.keyboard.press('Escape'); const t0 = (await page.evaluate(() => window.__qa.world.time)); await adv(page, 30);
      s = await state(page); assert.equal(s.paused, true); assert.equal(await page.evaluate(() => window.__qa.world.time), t0);
      await page.keyboard.press('Enter'); await adv(page, 3); assert.equal((await state(page)).paused, false);
      await page.keyboard.down('KeyD'); await adv(page, 2); await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await adv(page, 2);
      assert.equal((await state(page)).paused, true); await page.keyboard.up('KeyD'); await page.keyboard.press('Enter'); await adv(page, 3);
      const xb = (await state(page)).hero.x; await adv(page, 20); assert.ok(Math.abs((await state(page)).hero.x - xb) < .3, 'no stuck key after blur');
      // QA shortcut: lose all lives.
      for (let i = 0; i < 3; i++) { await page.evaluate(() => { const q = window.__qa; q.W.qa.killHero(q.world, 'qa'); }); await adv(page, 90); }
      s = await state(page); assert.equal(s.phase, 'over'); assert.equal(s.status, 'lost'); note('game over', s);
      await page.waitForTimeout(1700); await adv(page, 2); assert.ok(await page.locator('#panel').isVisible()); await shotP(page, 'flow-gameover-panel');
      await page.keyboard.press('Enter'); await adv(page, 80); s = await state(page); assert.equal(s.phase, 'playing'); assert.equal(s.lives, 3); note('restarted', s);
      // QA shortcut: teleport near the goal and run into the pole.
      await teleport(page, 160, 0); await page.keyboard.down('KeyD'); await page.keyboard.down('KeyJ'); await adv(page, 45); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyJ');
      s = await state(page); assert.ok(s.goal, 'grabbed pole');
      for (let i = 0; i < 40 && (await state(page)).phase !== 'over'; i++) await adv(page, 15);
      s = await state(page); assert.equal(s.status, 'won'); note('won', s); await adv(page, 3); await shotP(page, 'flow-win-panel');
      assert.deepEqual(errors, []); note('flow', 'OK');
    } else if (scenario === 'shots') {
      const { page, errors } = await open(browser, { virtual: true });
      await adv(page, 30); await shotP(page, 'title');
      await page.keyboard.press('Enter'); await adv(page, 8);
      await page.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 450; })); await shotP(page, 'stage-card');
      await page.evaluate(() => document.getAnimations().forEach(a => { a.currentTime = 1300; }));
      await adv(page, 32); await shotP(page, 'intro-swoop');
      await adv(page, 60); await shotP(page, 'start');
      const at = async (name, x, y, frames, extra, before) => { await teleport(page, x, y, extra); if (before) await before(); await adv(page, frames); await shotP(page, name); note(name, await state(page)); };
      await at('crates-plank', 19.5, 4, 25);
      await page.keyboard.down('KeyK'); await adv(page, 10); await page.keyboard.up('KeyK'); await adv(page, 16); await shotP(page, 'power-crate-bump');
      await at('stumps-beetles', 38, 0, 30);
      await page.keyboard.down('KeyE'); await adv(page, 18); await page.keyboard.up('KeyE'); await page.keyboard.down('KeyF'); await adv(page, 16); await page.keyboard.up('KeyF'); await adv(page, 8); await shotP(page, 'orbit-view');
      await page.keyboard.down('KeyC'); await adv(page, 2); await page.keyboard.up('KeyC');
      await at('clay-snail', 60.5, 0, 30);
      await at('stairs-moving-log', 80.5, 3, 30);
      await at('clay-corridor-helmet', 99.5, 0, 20, { power: 1 });
      await page.keyboard.down('KeyK'); await adv(page, 8); await page.keyboard.up('KeyK'); await adv(page, 4); await shotP(page, 'clay-break');
      await teleport(page, 114.5, 1.5, { vy: -2 }); await adv(page, 14); await shotP(page, 'spring-launch');
      await teleport(page, 128, 0, { power: 2 }); await adv(page, 10); for (let k = 0; k < 3; k++) { await page.keyboard.down('KeyJ'); await adv(page, 3); await page.keyboard.up('KeyJ'); await adv(page, 5); } await shotP(page, 'lantern-sparks');
      await at('tiers', 147, 3, 30);
      await teleport(page, 163, 0); await page.keyboard.down('KeyD'); await page.keyboard.down('KeyJ'); await adv(page, 6); await page.keyboard.down('KeyK'); await adv(page, 16); await page.keyboard.up('KeyK'); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyJ'); await adv(page, 4); await shotP(page, 'goal-grab');
      for (let i = 0; i < 30; i++) { await adv(page, 10); const s = await state(page); if (s.goal === 'tally' && (await page.evaluate(() => window.__qa.world.goal.fwStarted))) break; }
      await adv(page, 18); await shotP(page, 'fireworks');
      assert.deepEqual(errors, []); note('shots', 'OK');
    } else if (scenario === 'mobile') {
      const { page, errors, context } = await open(browser, { virtual: true, mobile: true, viewport: { width: 844, height: 390 }, dpr: 2 });
      await adv(page, 10); await shotP(page, 'mobile-title');
      await page.tap('#start'); await adv(page, 85);
      let s = await state(page); assert.equal(s.phase, 'playing');
      const cdp = await context.newCDPSession(page);
      const box = await page.locator('#stick').boundingBox(), jb = await page.locator('.jump-btn').boundingBox();
      const sx = box.x + box.width / 2, sy = box.y + box.height / 2, jx = jb.x + jb.width / 2, jy = jb.y + jb.height / 2;
      const x0 = s.hero.x;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + 45, y: sy, id: 1 }] });
      await adv(page, 20);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx + 45, y: sy, id: 1 }, { x: jx, y: jy, id: 2 }] });
      await adv(page, 8); s = await state(page); note('mobile move+jump', s); assert.ok(s.hero.x > x0 + 2, 'stick moves right'); assert.ok(s.hero.y > .8, 'jump button with stick held');
      await shotP(page, 'mobile-play');
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await adv(page, 40);
      const xs = (await state(page)).hero.x; await adv(page, 20); assert.ok(Math.abs((await state(page)).hero.x - xs) < .05, 'released stick stops');
      await page.setViewportSize({ width: 390, height: 844 }); await adv(page, 22);
      assert.ok(await page.locator('#rotate').isVisible()); assert.equal((await state(page)).paused, true); await shotP(page, 'mobile-portrait-paused');
      await page.setViewportSize({ width: 844, height: 390 }); await adv(page, 22); assert.ok(await page.locator('#rotate').isHidden());
      await page.locator('#pause').tap(); await adv(page, 4); assert.equal((await state(page)).paused, false);
      await page.setViewportSize({ width: 740, height: 360 }); await adv(page, 22); await shotP(page, 'mobile-narrow');
      assert.deepEqual(errors, []); note('mobile', 'OK');
    } else if (scenario === 'perf-desktop' || scenario === 'perf-mobile') {
      const mobile = scenario === 'perf-mobile';
      const { page, errors } = await open(browser, { mobile, viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 }, dpr: mobile ? 2 : 1 });
      await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__qa.phase === 'playing', null, { polling: 250, timeout: 240000 });
      await page.evaluate(() => { window.__bot = true; });
      await page.waitForTimeout(2500);
      const play = await sampleFrames(page, 8000);
      await page.keyboard.down('KeyE'); const orbit = await sampleFrames(page, 3000); await page.keyboard.up('KeyE');
      const result = { scenario, url, viewport: mobile ? '844x390 @2x touch emulation' : '1280x720 @1x', browser: browser.version(), mode: process.env.QA_GPU ? 'headless, default GL' : 'headless, SwiftShader software GL (not representative of real GPUs)', route: 'bot plays from the start; then orbit with E', play, orbit, errors };
      fs.writeFileSync(path.join(out, scenario + '.json'), JSON.stringify(result, null, 2)); note(scenario, result);
    } else if (scenario === 'capture') {
      // Offline render: virtual clock at 30 fps, scripted bot, one frame per screenshot → H.264 + offline-rendered game audio.
      const seconds = Number(process.env.QA_SECONDS || 70), fps = 30;
      const { page, errors } = await open(browser, { virtual: true });
      const dir = path.join(out, 'frames'); if (process.env.QA_FRESH) fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      const existing = Math.max(0, fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).length - 1); if (existing) note('resume from frame', existing);
      let n = 0; const shot = async () => { if (n >= existing) await page.screenshot({ path: path.join(dir, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 88 }); n++; };
      const v0 = await page.evaluate(() => {
        const a = window.__qa.audio, eff = a.effect.bind(a), tick = a.tick.bind(a); window.__audioLog = [];
        a.effect = e => { window.__audioLog.push([performance.now(), 'e', typeof e === 'string' ? e : JSON.parse(JSON.stringify(e))]); eff(e); };
        a.tick = playing => { window.__audioLog.push([performance.now(), 't', playing ? 1 : 0]); tick(playing); };
        return performance.now();
      });
      for (let i = 0; i < 20; i++) { await adv(page, 1); await shot(); }
      await page.keyboard.press('Enter');
      for (let i = 0; i < 80; i++) { await page.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }), i * 1000 / fps); await adv(page, 1); await shot(); }
      await page.evaluate(() => { window.__bot = true; });
      const timeline = [];
      for (let i = 0; i < seconds * fps; i++) {
        await adv(page, 1); await shot();
        if (i % 15 === 0) { const s = await state(page); timeline.push({ t: +(n / fps).toFixed(2), ...s }); if (s.phase === 'over' && i > 60) { for (let k = 0; k < 60; k++) { await adv(page, 1); await shot(); } break; } }
      }
      assert.deepEqual(errors, []);
      const wavB64 = await page.evaluate(async ({ v0, seconds }) => {
        const { GameAudio } = await import(new URL('./audio.js', location.href).href);
        const rate = 44100, off = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate); let T = 0;
        const ctx = new Proxy(off, { get(t, p) { if (p === 'currentTime') return T; if (p === 'createMediaStreamDestination') return () => t.createGain(); if (p === 'state') return 'running'; const v = Reflect.get(t, p); return typeof v === 'function' ? v.bind(t) : v; } });
        const Real = window.AudioContext; window.AudioContext = function () { return ctx; }; const a = new GameAudio(); await a.unlock(); window.AudioContext = Real;
        for (const [tv, kind, x] of window.__audioLog) { T = (tv - v0) / 1000 - 1 / 30; if (T < 0 || T >= seconds - .05) continue; if (kind === 'e') a.effect(x); else a.tick(!!x); }
        const buf = await off.startRendering(), ch = buf.getChannelData(0), n = ch.length, view = new DataView(new ArrayBuffer(44 + n * 2)), w = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, ch[i])) * 32767, true);
        let bin = ''; const bytes = new Uint8Array(view.buffer); for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); return btoa(bin);
      }, { v0, seconds: n / fps });
      const wav = path.join(out, 'capture-audio.wav'); fs.writeFileSync(wav, Buffer.from(wavB64, 'base64'));
      const mp4 = path.join(out, 'capture.mp4');
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, '%05d.jpg'), '-i', wav, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4]);
      fs.writeFileSync(path.join(out, 'capture-timeline.json'), JSON.stringify({ fps, frames: n, timeline }, null, 2));
      note('capture', { frames: n, mp4 }); fs.writeFileSync(path.join(out, 'DONE'), String(n));
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

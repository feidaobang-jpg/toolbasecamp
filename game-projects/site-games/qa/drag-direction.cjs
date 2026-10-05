// Checks rendered camera orientation, rather than the sign of an internal yaw.
// Run against the task HTTP server; touch results are browser emulation, not a phone test.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs'), path = require('path');
const base = process.env.GAMES_BASE || 'http://127.0.0.1:8905/html/game/';
const out = process.env.GAMES_OUT || path.resolve('game-projects/site-games/qa/out/drag-direction');
fs.mkdirSync(out, { recursive: true });
const games = (process.env.GAMES_ONLY || 'starship-defense,tank-3d,mario-3d,cadillacs-stage1-3d,jackal-stage1-3d,journey-west-3d,hop-fox-3d').split(',');
const results = [];
function check(tag, action, turn, sign) {
  const ok = Number.isFinite(turn) && turn * sign > .015;
  results.push({ tag, action, turn, ok });
  if (!ok) console.log('FAIL', tag, action, turn);
}
async function basis(p, game) {
  return p.evaluate(g => {
    let cam, index;
    if (g === 'starship-defense') { cam = __gameQA.camera; index = __gameQA.getCamMode() === 'first' ? 5 : __gameQA.camState.qaIndex || 0; }
    else if (g === 'tank-3d' || g === 'mario-3d') { const v = (g === 'tank-3d' ? __TANK_TEST__ : __MARIO_TEST__).view; cam = v.camera; index = v.presetIndex; }
    else if (g === 'cadillacs-stage1-3d' || g === 'jackal-stage1-3d') { const c = (g === 'cadillacs-stage1-3d' ? __CD_TEST__ : __JK_TEST__)._cam; cam = c.cam; index = c.idx; }
    else { cam = __CAMERA_QA__.view.camera; index = __CAMERA_QA__.view.cameraIndex; }
    const r = cam.position.clone().set(1, 0, 0).applyQuaternion(cam.quaternion); const len = Math.hypot(r.x, r.z);
    return { index, right: [r.x / len, r.z / len] };
  }, game);
}
const turn = (a, b) => Math.atan2(a.right[0] * b.right[1] - a.right[1] * b.right[0], a.right[0] * b.right[0] + a.right[1] * b.right[1]);
async function settle(p, g) {
  await p.evaluate(g => {
    const h = g === 'tank-3d' ? window.__TANK_TEST__ : g === 'mario-3d' ? window.__MARIO_TEST__ : g === 'cadillacs-stage1-3d' ? window.__CD_TEST__ : g === 'jackal-stage1-3d' ? window.__JK_TEST__ : null;
    if (h) h.step(30);
  }, g);
  await p.waitForTimeout(120);
}
async function cycle(p, g) {
  await p.keyboard.press('KeyC'); await settle(p, g);
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const g of games) for (const layout of ['desktop', 'landscape', 'portrait']) {
    const tag = `${g}-${layout}`, mobile = layout !== 'desktop';
    const viewport = layout === 'desktop' ? { width: 1280, height: 720 } : layout === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 };
    const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, recordVideo: { dir: out, size: viewport }, ...(mobile ? { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36' } : {}) });
    const p = await ctx.newPage(), errors = []; p.on('pageerror', e => errors.push(e.message));
    try {
      await p.goto(base + g + '/index.html?test=1&qa=1&q=low');
      await p.waitForFunction(() => window.__gameQA || window.__TANK_TEST__ || window.__MARIO_TEST__ || window.__CD_TEST__ || window.__JK_TEST__ || window.__CAMERA_QA__);
      if (g === 'starship-defense') await p.evaluate(m => { __gameQA.setDeviceMode(m ? 'touch' : 'desktop'); __gameQA.newGame(true); __gameQA.player.invuln = 999; }, mobile);
      else {
        await p.locator(`[data-control-mode=${mobile ? 'show' : 'hide'}]`).first().click();
        if (g === 'cadillacs-stage1-3d') await p.locator('[data-act=select]').first().click();
        await p.locator(g === 'hop-fox-3d' || g === 'journey-west-3d' ? '#start' : '[data-act=start]').first().click();
      }
      await p.waitForTimeout(2800);
      await p.evaluate(g => {
        if (g === 'tank-3d') { __TANK_TEST__.manual(true); __TANK_TEST__.skipCurtain(); __TANK_TEST__.world.player.invuln = 9999; }
        if (g === 'mario-3d') { __MARIO_TEST__.manual(true); __MARIO_TEST__.skipCard(); __MARIO_TEST__.world.player.inv = 9999; }
        if (g === 'cadillacs-stage1-3d') { __CD_TEST__.manual(true); __CD_TEST__.step(180); }
        if (g === 'jackal-stage1-3d') { __JK_TEST__.manual(true); __JK_TEST__.cheat.invuln(9999); __JK_TEST__.step(180); }
        if (g === 'hop-fox-3d') __CAMERA_QA__.begin();
        if (g === 'journey-west-3d') __CAMERA_QA__.world.player.invulnerable = 9999;
      }, g);
      const cdp = mobile ? await ctx.newCDPSession(p) : null;
      const point = x => layout === 'portrait' ? { x: 390 - 145, y: x } : { x, y: layout === 'desktop' ? 210 : 145 };
      const from = point(layout === 'desktop' ? 800 : 530), to = point(layout === 'desktop' ? 870 : 580);
      const seen = new Set();
      for (let i = 0; i < 8; i++) {
        if (g === 'starship-defense') { if (i === 6) break; await p.evaluate(i => { if (i === 5) __gameQA.setCamMode('first'); else __gameQA.setCameraView(i, false); __gameQA.camState.qaIndex = i; __gameQA.updCamera(.5); }, i); }
        await settle(p, g); const state = await basis(p, g); if (seen.has(state.index)) break; seen.add(state.index);
        const item = `${tag}-preset${state.index}`;
        for (const sign of [1, -1]) {
          const a = sign > 0 ? from : to, b = sign > 0 ? to : from; const before = await basis(p, g);
          await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 6 }); await p.mouse.up(); await settle(p, g);
          check(item, sign > 0 ? 'mouse right' : 'mouse left', turn(before, await basis(p, g)), sign);
          if (mobile) {
            const beforeTouch = await basis(p, g);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(p, g);
            check(item, sign > 0 ? 'touch right' : 'touch left', turn(beforeTouch, await basis(p, g)), sign);
          }
        }
        if (!mobile) for (const key of ['KeyE', 'KeyQ']) {
          const before = await basis(p, g); await p.keyboard.down(key); await settle(p, g); await p.waitForTimeout(150); await p.keyboard.up(key); await settle(p, g);
          check(item, key, turn(before, await basis(p, g)), key === 'KeyE' ? 1 : -1);
        }
        if (i === 0 || i === seen.size - 1) await p.screenshot({ path: path.join(out, `${item}.png`) });
        if (g !== 'starship-defense') await cycle(p, g);
      }
      results.push({ tag, action: 'all presets covered', count: seen.size, ok: seen.size >= 4 });
      results.push({ tag, action: 'runtime errors', errors, ok: errors.length === 0 });
      console.log(tag, seen.size, 'presets checked');
    } catch (e) { results.push({ tag, action: 'run', error: e.message, ok: false }); console.log('FAIL', tag, e.message); }
    const video = p.video(); await ctx.close(); await video.saveAs(path.join(out, `${tag}.webm`));
  }
  await browser.close(); fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`${results.filter(r => r.ok).length}/${results.length} passed`); process.exitCode = results.every(r => r.ok) ? 0 : 1;
})();

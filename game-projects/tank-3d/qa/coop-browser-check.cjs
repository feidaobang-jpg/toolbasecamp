// Real two-browser QA; mutations use explicitly enabled test hooks in test rooms.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const out = path.resolve(process.argv[2] || 'game-projects/tank-3d/qa/out/coop1');
const url = process.argv[3] || 'http://127.0.0.1:8792/public/html/game/tank-3d/index.html';
const results = [];
const ok = (name, data) => { results.push({ name, data, ok: true }); console.log('PASS ' + name + (data ? ' ' + JSON.stringify(data) : '')); };
const state = g => g.evaluate(() => window.__TANK_TEST__.state());
const key = (g, code, down) => g.evaluate(([code, down]) => document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true })), [code, down]);
async function game(browser, mobile) {
  const viewport = mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 };
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, recordVideo: { dir: out, size: viewport } });
  const p = await context.newPage(); const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.goto(url + (url.includes('?') ? '&' : '?') + 'test=1');
  let g = p;
  if (/bilibili\.com\/toy\//.test(url)) {
    g = await (await p.waitForSelector('iframe')).contentFrame();
    await g.goto(g.url().split('?')[0] + '?test=1');
  }
  await g.waitForFunction(() => window.__TANK_TEST__ && window.__tankReady);
  await g.click('[data-act="coop"]');
  return { p, g, context, errors };
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const host = await game(browser, false), guest = await game(browser, true);
  try {
    await host.g.fill('#coop-name', '测试房主'); await host.g.click('#coop-create');
    await host.g.waitForFunction(() => window.__TANK_TEST__.coop.room);
    const code = (await state(host.g)).coop.room.code;
    await guest.g.fill('#coop-code', '000000'); await guest.g.click('#coop-join');
    await guest.g.waitForFunction(() => document.getElementById('coop-message').textContent.includes('不存在'));
    ok('bad room reports useful error');
    await guest.g.fill('#coop-name', '测试好友'); await guest.g.fill('#coop-code', code); await guest.g.click('#coop-join');
    await guest.g.waitForFunction(() => window.__TANK_TEST__.coop.room?.players.length === 2);
    await guest.g.click('#coop-ready');
    await host.g.waitForFunction(() => !document.getElementById('coop-start').disabled);
    await host.p.screenshot({ path: path.join(out, 'host-lobby.png') });
    await guest.p.screenshot({ path: path.join(out, 'mobile-lobby.png') });
    await host.g.click('#coop-start');
    for (const g of [host.g, guest.g]) await g.waitForFunction(() => { const s = window.__TANK_TEST__.state(); return s.phase === 'play' && s.players?.every(p => p.tank); });
    ok('two seats join/ready/start on identical stage', { code });
    await host.p.screenshot({ path: path.join(out, 'real-stage-host.png') });
    await guest.p.screenshot({ path: path.join(out, 'real-stage-mobile.png') });
    // Isolate input/snapshot tests from enemies while using actual networking.
    await host.g.evaluate(() => {
      const w = window.__TANK_TEST__.world;
      w.bots = []; w.rosterIndex = w.roster.length; w.remaining = 99;
      for (const array of Object.values(w.terrain)) array.fill(0);
      w.terrainVersion++; w.changedAll = true;
    });
    await guest.g.waitForFunction(() => window.__TANK_TEST__.coop.stateCount > 4);
    const y1 = (await state(host.g)).players[0].tank.y;
    const y2 = (await state(guest.g)).player.y;
    await key(host.g, 'KeyW', true); await key(guest.g, 'KeyW', true);
    await guest.g.waitForFunction(y => window.__TANK_TEST__.state().player.y < y - 12, y2);
    await key(host.g, 'KeyW', false); await key(guest.g, 'KeyW', false);
    await guest.g.waitForFunction(() => window.__TANK_TEST__.state().players[0].tank.y < 180);
    const moved = await state(host.g); assert(moved.players[0].tank.y < y1 - 12);
    ok('both players move and guest receives host motion');
    const shots = await host.g.evaluate(() => window.__TANK_TEST__.world.playerShots || 0);
    await key(guest.g, 'KeyJ', true); await key(guest.g, 'KeyJ', false);
    await host.g.waitForFunction(n => (window.__TANK_TEST__.world.playerShots || 0) > n, shots);
    ok('guest fire executes on host');
    await guest.g.click('#btn-pause');
    for (const g of [host.g, guest.g]) await g.waitForFunction(() => window.__TANK_TEST__.state().paused);
    const tick = await host.g.evaluate(() => window.__TANK_TEST__.world.t);
    await host.g.evaluate(() => new Promise(r => setTimeout(r, 250)));
    assert.equal(await host.g.evaluate(() => window.__TANK_TEST__.world.t), tick);
    ok('guest pause freezes both simulations');
    await guest.g.click('#pause [data-control-mode="hide"]');
    await guest.g.click('#pause [data-control-mode="show"]');
    assert.equal((await state(guest.g)).touchHidden, false);
    await guest.g.click('#pause [data-act="resume"]');
    for (const g of [host.g, guest.g]) await g.waitForFunction(() => !window.__TANK_TEST__.state().paused);
    ok('input mode switches without leaving room');
    await host.p.screenshot({ path: path.join(out, 'host-two-tanks.png') });
    await guest.p.screenshot({ path: path.join(out, 'mobile-two-tanks.png') });
    // Portrait layout simulation (not a physical phone test).
    await guest.p.setViewportSize({ width: 390, height: 844 });
    await guest.g.waitForFunction(() => window.__TANK_TEST__.state().display.rotated);
    await guest.p.screenshot({ path: path.join(out, 'portrait-coop.png') });
    ok('portrait rotates gameplay while preserving room');
    await host.g.evaluate(() => { const T = window.__TANK_TEST__, w = T.world; w.remaining = 0; w.rosterIndex = w.roster.length; w.bots = []; });
    for (const g of [host.g, guest.g]) await g.waitForFunction(() => window.__TANK_TEST__.state().overlay === 'tally');
    await key(guest.g, 'Enter', true); await key(guest.g, 'Enter', false);
    await key(guest.g, 'Enter', true); await key(guest.g, 'Enter', false);
    for (const g of [host.g, guest.g]) await g.waitForFunction(() => window.__TANK_TEST__.state().stage === 2);
    ok('shared clear/tally/next-stage');
    await guest.context.close();
    await host.g.waitForFunction(() => window.__TANK_TEST__.state().overlay === 'lobby' && document.getElementById('coop-message').textContent.includes('离线'));
    assert.equal((await state(host.g)).coop.room, null);
    ok('guest disconnect ends room clearly');
    await host.g.click('[data-act="coop-back"]'); await host.g.click('[data-act="start"]');
    await host.g.waitForFunction(() => window.__TANK_TEST__.state().phase === 'play');
    assert.equal(await host.g.evaluate(() => window.__TANK_TEST__.run.coop), false);
    ok('single-player still works after networking');
    assert.deepEqual(host.errors, []); assert.deepEqual(guest.errors, []);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ url, results, physicalPhoneTest: false }, null, 2));
  } finally { await host.context.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

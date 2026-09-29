// End-to-end functional verification for mario-1-1-3d in a real browser.
// Covers: start, coin pickup, stomp, pit death + respawn, checkpoint,
// flagpole win, game over, restart, pause/resume, mute, touch toggle,
// portrait rotate overlay. QA teleport shortcuts are marked as such.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const assert = require('node:assert/strict');
const URL = process.argv[2] || 'http://127.0.0.1:8765/public/html/game/mario-1-1-3d/index.html';
const executablePath = process.env.BROWSER_EXECUTABLE;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--disable-dev-shm-usage'] });
  const results = [];
  const ok = (name) => { results.push(name); console.log('PASS', name); };
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.route('**/main.js*', async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: await r.text() + '\nwindow.__qa={view,world};' }); });
    await page.goto(URL);
    await page.waitForFunction(() => window.__qa, null, { timeout: 20000 });
    assert.equal(await page.locator('#panel').isHidden(), false, 'menu shown first');
    ok('menu-first');

    // Menu-only options (hidden during play by design): sound toggle and the
    // desktop touch-overlay switch.
    await page.locator('#sound').click(); await page.waitForTimeout(150);
    await page.locator('#sound').click(); await page.waitForTimeout(150);
    ok('sound-toggle');
    await page.locator('#touch-toggle').click(); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.getElementById('touch').hasAttribute('hidden')), false, 'touch overlay attribute toggled on');
    await page.locator('#touch-toggle').click(); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.getElementById('touch').hasAttribute('hidden')), true, 'touch overlay attribute toggled off');
    ok('touch-toggle');

    // Start with Enter (keyboard path, no mouse).
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.__qa.world.status), 'playing');
    assert.equal(await page.locator('#panel').isHidden(), true);
    ok('enter-start');

    // Run right and jump: advance + coin from floating row or ?-block.
    // QA shortcut (marked, never exposed to players): clear enemies so this
    // test measures movement, not combat.
    await page.evaluate(() => { window.__qa.world.enemies.length = 0; });
    await page.keyboard.down('KeyD'); await page.keyboard.down('KeyJ');
    await page.waitForTimeout(1600);
    await page.keyboard.press('KeyK'); await page.waitForTimeout(700);
    await page.keyboard.up('KeyD'); await page.keyboard.up('KeyJ');
    const x1 = await page.evaluate(() => window.__qa.world.player.x);
    assert.ok(x1 > 10, 'advanced to ' + x1);
    ok('run-jump-advance');

    // Stomp test (QA shortcut: move to a clear lane at x=31, spawn a
    // stationary goomba and drop onto it from low height; marked, not
    // player-facing).
    await page.evaluate(() => {
      const w = window.__qa.world, p = w.player;
      w.enemies.push({ kind: 'goomba', x: 31, y: 0, z: 0, vx: 0, vy: 0, alive: true, squashT: 0, t: 0 });
      p.x = 31.3; p.y = 2.5; p.vy = -1; p.vx = 0; p.invuln = 0;
    });
    const scoreBefore = await page.evaluate(() => window.__qa.world.score);
    let stompCheck = null;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(100);
      stompCheck = await page.evaluate(s => {
        const w = window.__qa.world;
        const e = w.enemies[w.enemies.length - 1];
        return { squash: e.squashT > 0 || !e.alive, gained: w.score - s, py: +w.player.y.toFixed(2), vy: +w.player.vy.toFixed(2), ex: +e.x.toFixed(2), px: +w.player.x.toFixed(2), evts: w.events.map(x => x.type).join(',') };
      }, scoreBefore);
      if (stompCheck.squash) break;
    }
    assert.ok(stompCheck.squash && stompCheck.gained >= 100, 'goomba stomped, +' + stompCheck.gained + ' state=' + JSON.stringify(stompCheck));
    ok('stomp');

    // Pit death + respawn: teleport in front of gap 1 and walk in (QA shortcut).
    await page.evaluate(() => { const w = window.__qa.world; const p = w.player; p.x = 67; p.y = 0; p.vy = 0; p.invuln = 0; });
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyD');
    const afterPit = await page.evaluate(() => ({ lives: window.__qa.world.lives, status: window.__qa.world.status, x: window.__qa.world.player.x }));
    assert.equal(afterPit.lives, 2, 'lost a life');
    assert.equal(afterPit.status, 'playing', 'respawned');
    ok('pit-death-respawn');

    // Checkpoint: teleport past x=100 (QA shortcut), then die in pit 2, respawn at checkpoint.
    await page.evaluate(() => { const w = window.__qa.world; const p = w.player; p.x = 100.5; p.y = 0; p.invuln = 9; });
    await page.waitForTimeout(400);
    await page.evaluate(() => { const w = window.__qa.world; const p = w.player; p.x = 85; p.y = 0; p.vy = 0; p.invuln = 0; });
    await page.keyboard.down('KeyD'); await page.waitForTimeout(1400); await page.keyboard.up('KeyD');
    const cp = await page.evaluate(() => ({ checkpoint: window.__qa.world.checkpoint, x: window.__qa.world.player.x, lives: window.__qa.world.lives }));
    assert.ok(cp.checkpoint >= 100, 'checkpoint reached: ' + cp.checkpoint);
    assert.ok(cp.x > 95, 'respawned at checkpoint: ' + cp.x);
    ok('checkpoint-respawn');

    // Pause / resume with Escape.
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const pauseLabel = await page.locator('#pause').textContent();
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const resumeBack = await page.evaluate(() => window.__qa.world.status);
    assert.equal(resumeBack, 'playing');
    assert.ok(pauseLabel, 'pause label switched');
    ok('pause-resume');

    // Flagpole win (QA shortcut): teleport near the flag and run into it.
    await page.evaluate(() => { const w = window.__qa.world; const p = w.player; p.x = 182; p.y = 0; p.invuln = 9; });
    await page.keyboard.down('KeyD'); await page.keyboard.down('KeyJ');
    await page.waitForFunction(() => window.__qa.world.status === 'won', null, { timeout: 12000 });
    await page.keyboard.up('KeyD'); await page.keyboard.up('KeyJ');
    const winScore = await page.evaluate(() => window.__qa.world.score);
    assert.ok(winScore > 2000, 'win score with flag + time bonus: ' + winScore);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#panel').isHidden(), false, 'win panel shown');
    assert.equal(await page.locator('#restart').isHidden(), false, 'restart button shown');
    ok('flagpole-win-panel');

    // Restart reloads into a fresh world.
    await page.locator('#restart').click();
    await page.waitForFunction(() => window.__qa && window.__qa.world.status === 'ready', null, { timeout: 20000 });
    const fresh = await page.evaluate(() => ({ lives: window.__qa.world.lives, x: window.__qa.world.player.x, coins: window.__qa.world.coins }));
    assert.equal(fresh.lives, 3); assert.ok(fresh.x < 5); assert.equal(fresh.coins, 0);
    ok('restart-fresh-world');

    // Game over: drain lives via pit falls (QA shortcut teleports).
    await page.keyboard.press('Enter'); // start the fresh (reloaded) world
    await page.waitForTimeout(400);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => { const w = window.__qa.world; w.status = 'playing'; const p = w.player; p.x = 67; p.y = 0; p.vy = 0; p.invuln = 0; });
      await page.keyboard.down('KeyD'); await page.waitForTimeout(1300); await page.keyboard.up('KeyD');
      await page.waitForTimeout(250);
    }
    const over = await page.evaluate(() => window.__qa.world.status);
    assert.equal(over, 'dead', 'game over after 3 lives');
    assert.equal(await page.locator('#restart').isHidden(), false, 'game over panel offers restart');
    ok('game-over');

    assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    ok('zero-console-errors');
    await context.close();

    // Mobile landscape: touch controls visible, core loop playable via virtual stick.
    const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const mpage = await mctx.newPage();
    const merrors = []; mpage.on('pageerror', e => merrors.push(String(e)));
    await mpage.route('**/main.js*', async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: await r.text() + '\nwindow.__qa={view,world};' }); });
    await mpage.goto(URL);
    await mpage.waitForFunction(() => window.__qa, null, { timeout: 20000 });
    await mpage.locator('#start').tap();
    await mpage.waitForTimeout(700);
    assert.equal(await mpage.evaluate(() => window.__qa.world.status), 'playing');
    assert.equal(await mpage.locator('#touch').isHidden(), false, 'touch overlay default on mobile');
    ok('mobile-tap-start');
    // Drag the virtual stick right: world x should increase.
    const stick = await mpage.locator('#stick').boundingBox();
    const cx = stick.x + stick.width / 2, cy = stick.y + stick.height / 2;
    await mpage.mouse.move(cx, cy); await mpage.mouse.down();
    await mpage.mouse.move(cx + stick.width * .38, cy, { steps: 6 });
    await mpage.waitForTimeout(1400);
    const mx = await mpage.evaluate(() => window.__qa.world.player.x);
    await mpage.mouse.up();
    assert.ok(mx > 3, 'stick moved mario right: ' + mx);
    ok('mobile-stick-move');
    // Jump button tap.
    await mpage.locator('[data-hold="KeyK"]').dispatchEvent('pointerdown', { pointerId: 7 });
    await mpage.waitForTimeout(300);
    const jumped = await mpage.evaluate(() => window.__qa.world.player.y > .3);
    await mpage.locator('[data-hold="KeyK"]').dispatchEvent('pointerup', { pointerId: 7 });
    assert.ok(jumped, 'jump via touch button');
    ok('mobile-jump-button');
    // Portrait after start: the game auto-rotates its layout and stays
    // playable (site-wide convention), no dead-end overlay.
    await mpage.setViewportSize({ width: 390, height: 844 });
    await mpage.waitForTimeout(500);
    assert.equal(await mpage.evaluate(() => document.body.classList.contains('rotated-layout')), true, 'portrait auto-rotates layout');
    assert.equal(await mpage.locator('#rotate').isHidden(), true, 'game stays playable, no blocking overlay');
    // Stick still drives mario after rotation (coordinate transform correct).
    // The layout rotates 90° clockwise, so the game's forward (+x) points to
    // the physical bottom of the portrait screen.
    // QA shortcut (marked): invulnerability + enemy clear so this measures the
    // rotated stick mapping, not combat deaths respawning mario backwards.
    await mpage.evaluate(() => { const w = window.__qa.world; w.enemies.length = 0; w.player.invuln = 30; });
    const mx0 = await mpage.evaluate(() => window.__qa.world.player.x);
    const stick2 = await mpage.locator('#stick').boundingBox();
    await mpage.mouse.move(stick2.x + stick2.width / 2, stick2.y + stick2.height / 2);
    await mpage.mouse.down();
    await mpage.mouse.move(stick2.x + stick2.width / 2, stick2.y + stick2.height / 2 + stick2.height * .38, { steps: 5 });
    await mpage.waitForTimeout(1200);
    const mx1 = await mpage.evaluate(() => window.__qa.world.player.x);
    await mpage.mouse.up();
    assert.ok(mx1 > mx0 + 2, 'rotated stick moves mario forward: ' + mx0.toFixed(1) + ' -> ' + mx1.toFixed(1));
    await mpage.setViewportSize({ width: 844, height: 390 });
    await mpage.waitForTimeout(500);
    assert.equal(await mpage.evaluate(() => document.body.classList.contains('rotated-layout')), false, 'landscape restores normal layout');
    ok('portrait-auto-rotate-playable');
    assert.deepEqual(merrors, [], 'no mobile page errors: ' + merrors.join(' | '));
    ok('mobile-zero-errors');
    await mctx.close();
    console.log('E2E ALL PASSED (' + results.length + ' checks)');
  } finally { await browser.close(); }
})().catch(e => { console.error('E2E FAIL:', e.message); process.exit(1); });

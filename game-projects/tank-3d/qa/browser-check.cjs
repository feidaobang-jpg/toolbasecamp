// 浏览器实机验收（Playwright + Edge）：菜单与选项（键盘 / 触屏、保存）、两种模式开局、5 个视角下的 WASD 方向、
// Q/E 一整圈、第一人称锁定方向、暂停、原版计分页 → 下一关、GAME OVER → 结算 → 重打、耐久 / 命数 / 演示模式、
// 手机竖屏自动旋转与触控逆变换，以及实时帧时间。截图 / 录像写到输出目录（只留本机）。
// PLAYWRIGHT_MODULE=… BROWSER_EXECUTABLE=… node game-projects/tank-3d/qa/browser-check.cjs <输出目录> [页面地址]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const out = process.argv[2], url = process.argv[3] || 'http://127.0.0.1:8766/public/html/game/tank-3d/index.html';
const GL_ARGS = process.env.QA_SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
const results = [];
const ok = (name, data) => { results.push({ name, ok: true, data }); console.log('ok  ' + name + (data ? '  ' + JSON.stringify(data) : '')); };
const T = fn => `(() => { const T = window.__TANK_TEST__; ${fn} })()`;
const key = (p, code, type = 'keydown') => p.evaluate(([c, t]) => document.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
const tap = async (p, code) => { await key(p, code); await key(p, code, 'keyup'); };

async function page(b, opt) {
  const ctx = await b.newContext({ viewport: opt.viewport, isMobile: !!opt.mobile, hasTouch: !!opt.mobile, deviceScaleFactor: opt.dpr || 1, locale: 'zh-CN', recordVideo: opt.video ? { dir: out, size: opt.viewport } : undefined });
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error' && !/hdslb|reporter|toy-host|addon/.test(m.text())) errors.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400 && !/hdslb|data\.bilibili|api\.bilibili/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
  // B 站 Toy 预览：游戏在 bilibilitoy.com 的 iframe 里；把这个 iframe 自己带上 ?test=1 重新导航，所有操作都在 iframe 内进行
  let g = p, gameUrl = url + '?test=1' + (opt.qs || '');
  if (/bilibili\.com\/toy\//.test(url)) {
    await p.goto(url, { waitUntil: 'load' });
    g = await (await p.waitForSelector('iframe')).contentFrame();
    gameUrl = g.url().split('?')[0] + '?test=1' + (opt.qs || '');
    await g.goto(gameUrl);
  } else await p.goto(gameUrl);
  await g.waitForFunction(() => window.__tankReady && window.__TANK_TEST__, null, { timeout: 30000 });
  const reload = async () => { await g.goto(gameUrl); await g.waitForFunction(() => window.__tankReady && window.__TANK_TEST__, null, { timeout: 30000 }); };
  return { p, g, ctx, errors, reload };
}
// 按 D（屏幕右）开 30 帧，返回玩家世界方向
async function dirAfter(p, code) {
  await p.evaluate(T('T.manual(true); const w = T.world; w.terrain.brick.fill(0); w.terrain.steel.fill(0); w.terrain.water.fill(0); w.player.x = 96; w.player.y = 96; w.bots.length = 0; w.roster.length = 0; w.rosterIndex = 0; w.remaining = 99;'));
  await key(p, code);
  const s = await p.evaluate(T('return T.step(30)'));
  await key(p, code, 'keyup');
  await p.evaluate(T('T.step(4)'));
  return s.player.dir;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE, args: GL_ARGS });
  try {
    // ---------- 桌面：菜单与选项 ----------
    {
      const { p, g, ctx, errors, reload } = await page(b, { viewport: { width: 1280, height: 720 } });
      await g.evaluate(() => localStorage.clear()); await reload();
      await p.screenshot({ path: path.join(out, 'desktop-menu-classic.png') });
      const label = name => g.locator(`#menu [data-opt="${name}"] .val`).innerText();
      assert.match(await label('mode'), /经典复刻/); assert.match(await label('lives'), /经典 3 命/); assert.match(await label('armor'), /经典一发/); assert.match(await label('camera'), /正俯视/);
      // 键盘：↓ 到「模式」→ → 切到魔改：命数、耐久、视角跟着换成魔改默认
      await tap(g, 'ArrowDown'); await tap(g, 'ArrowRight');
      assert.match(await label('mode'), /魔改/); assert.match(await label('lives'), /无限命/); assert.match(await label('armor'), /标准 3 格/); assert.match(await label('camera'), /斜俯视/);
      await p.screenshot({ path: path.join(out, 'desktop-menu-remix.png') });
      // 触屏式点击：音量、帧率、画质、触屏按键，刷新后保留；演示模式刷新后回到关
      await g.click('#menu [data-opt="volume"]'); await g.click('#menu [data-opt="fps"]'); await g.click('#menu [data-opt="quality"]'); await g.click('#menu [data-opt="touch"]'); await g.click('#menu [data-opt="demo"]');
      const before = { vol: await label('volume'), fps: await label('fps'), q: await label('quality'), touch: await label('touch'), demo: await label('demo') };
      await reload();
      const after = { vol: await label('volume'), fps: await label('fps'), q: await label('quality'), touch: await label('touch'), demo: await label('demo') };
      assert.equal(after.vol, before.vol); assert.equal(after.fps, before.fps); assert.equal(after.q, before.q); assert.equal(after.touch, before.touch); assert.match(after.demo, /关/); assert.match(before.demo, /开/);
      assert.match(await label('mode'), /魔改/, 'mode persisted');
      ok('menu options keyboard/click/persist', { before, after });
      // 经典起始关卡可选 1～35，标题背景换成该关原版地图
      await g.evaluate(() => localStorage.clear()); await reload();
      await g.focus('#menu [data-opt="from"]'); for (let i = 0; i < 3; i++) await tap(g, 'ArrowLeft');
      assert.match(await label('from'), /第 33 关/);
      await p.screenshot({ path: path.join(out, 'desktop-menu-stage33.png') });
      for (let i = 0; i < 3; i++) await tap(g, 'ArrowRight');
      ok('classic stage select wraps 1..35');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // ---------- 桌面：经典模式实机 ----------
    {
      const { p, g, ctx, errors, reload } = await page(b, { viewport: { width: 1280, height: 720 }, video: true });
      await g.evaluate(() => localStorage.clear()); await reload();
      await tap(g, 'Enter');
      await p.waitForTimeout(400); await p.screenshot({ path: path.join(out, 'desktop-curtain.png') });
      await g.waitForFunction(() => window.__TANK_TEST__.state().phase === 'play', null, { timeout: 5000 });
      await p.waitForTimeout(1500);
      // 实时：按住 W 1 秒，J 每按一下一发（经典按住不连发）
      await key(g, 'KeyW'); await p.waitForTimeout(1000); await key(g, 'KeyW', 'keyup');
      let s = await g.evaluate(T('return T.state()'));
      assert.ok(s.player.y < 192 - 30, 'player drove north ' + s.player.y);
      const shots0 = await g.evaluate(T('return T.world.playerShots || 0'));
      await key(g, 'KeyJ'); await p.waitForTimeout(1200);
      const shotsHeld = await g.evaluate(T('return T.world.playerShots || 0')) - shots0;
      await key(g, 'KeyJ', 'keyup');
      assert.equal(shotsHeld, 1, 'classic: holding J fires once');
      ok('classic realtime drive + single shot per press', { y: s.player.y, fires: shotsHeld });
      await p.screenshot({ path: path.join(out, 'desktop-classic-top.png') });
      // 5 个视角：按 D 都是屏幕右方（Q/E 未转时 = 东）；第一人称按 D 右转后继续直行
      const dirs = {};
      for (let i = 0; i < 5; i++) {
        const cam = await g.evaluate(T('return T.state().camera'));
        dirs[cam] = await dirAfter(g, 'KeyD');
        await g.evaluate(T('T.world.player.dir = 0; T.view.yawOffset = 0; T.step(2);'));
        await p.screenshot({ path: path.join(out, 'desktop-view-' + cam + '.png') });
        await tap(g, 'KeyC'); await g.evaluate(T('T.step(2)'));
      }
      assert.deepEqual(Object.values(dirs), [1, 1, 1, 1, 1], JSON.stringify(dirs));
      ok('every view: D = screen right', dirs);
      // Q/E：转 90° 后 W 方向跟着视线；E 一整圈回到原方向
      await g.evaluate(T('T.view.setPreset(0); T.view.yawOffset = -Math.PI / 2; T.step(2)'));
      const wAt90 = await dirAfter(g, 'KeyW');
      await g.evaluate(T('T.view.yawOffset = -Math.PI; T.step(2)'));
      const wAt180 = await dirAfter(g, 'KeyW');
      await g.evaluate(T('T.manual(false); T.view.yawOffset = 0;'));
      await key(g, 'KeyE'); await p.waitForTimeout(4100); await key(g, 'KeyE', 'keyup');
      const yawAfterCircle = await g.evaluate(T('return T.view.yawOffset'));
      await p.screenshot({ path: path.join(out, 'desktop-rotated.png') });
      assert.equal(wAt90, 1); assert.equal(wAt180, 2);
      assert.ok(Math.abs(Math.abs(yawAfterCircle) - 2 * Math.PI) < .5, 'E held 4s ≈ one turn ' + yawAfterCircle);
      ok('Q/E rotation maps WASD', { wAt90, wAt180, yawAfterCircle: +yawAfterCircle.toFixed(2) });
      // 第一人称：按 D 后车头转向东，再按住 D 不会原地打转
      await g.evaluate(T('T.view.setPreset(4); T.view.yawOffset = 0; T.world.player.dir = 0; T.step(2)'));
      const fpD = await dirAfter(g, 'KeyD');
      await g.evaluate(T('T.manual(true); T.world.player.x = 96; T.world.player.y = 64;'));
      await key(g, 'KeyD'); const mid = await g.evaluate(T('T.step(45); return T.state().player.dir')); await g.evaluate(T('T.step(45)')); await key(g, 'KeyD', 'keyup');
      const fpHeld = await g.evaluate(T('return T.state().player'));
      // 当前第一人称独立转头，行驶不带着视线跳转；再次 D 仍相对同一视线向右。
      assert.equal(fpD, 1); assert.equal(mid, 1); assert.equal(fpHeld.dir, 1); assert.ok(fpHeld.x > 120, 'fp keeps driving east ' + fpHeld.x);
      ok('first person latched steering', { fpD, fpHeld });
      // 暂停菜单（Esc）→ 继续
      await g.evaluate(T('T.manual(false); T.view.setPreset(1)'));
      await tap(g, 'Escape'); await p.waitForTimeout(200);
      assert.equal(await g.evaluate(T('return T.state().overlay')), 'pause');
      await p.screenshot({ path: path.join(out, 'desktop-pause.png') });
      await tap(g, 'Escape'); await p.waitForTimeout(200);
      assert.equal(await g.evaluate(T('return T.state().overlay')), null);
      ok('pause / resume');
      // 清场 → 原版计分页 → 第 2 关
      await g.evaluate(T('T.clearStage()'));
      await g.waitForFunction(() => window.__TANK_TEST__.state().overlay === 'tally', null, { timeout: 8000 });
      await p.waitForTimeout(900); await p.screenshot({ path: path.join(out, 'desktop-tally.png') });
      await g.waitForFunction(() => window.__TANK_TEST__.state().stage === 2 && window.__TANK_TEST__.state().overlay === null, null, { timeout: 15000 });
      ok('stage clear -> tally -> stage 2');
      // 经典 3 命一发：连续阵亡 3 次 → GAME OVER → 计分页 → 结算 → 重打本关
      await g.waitForFunction(() => window.__TANK_TEST__.state().phase === 'play', null, { timeout: 5000 });
      for (let k = 0; k < 3; k++) {
        await g.waitForFunction(() => { const s = window.__TANK_TEST__.state(); return s.player && s.player.state === 'active'; }, null, { timeout: 5000 });
        await g.evaluate(T('T.world.player.shield = 0; T.qa.hurtPlayer(T.world, 1)'));
        await p.waitForTimeout(700);
      }
      await g.waitForFunction(() => window.__TANK_TEST__.state().status === 'gameover', null, { timeout: 5000 });
      await p.waitForTimeout(1500); await p.screenshot({ path: path.join(out, 'desktop-gameover.png') });
      await g.waitForFunction(() => window.__TANK_TEST__.state().overlay === 'tally', null, { timeout: 8000 });
      await tap(g, 'Enter'); await tap(g, 'Enter');
      await g.waitForFunction(() => window.__TANK_TEST__.state().overlay === 'result', null, { timeout: 8000 });
      await p.screenshot({ path: path.join(out, 'desktop-result.png') });
      const res = await g.locator('#res-table').innerText();
      assert.match(res, /经典复刻/); assert.match(await g.locator('#retry-btn').innerText(), /从第 2 关再来/);
      await tap(g, 'Enter');
      await g.waitForFunction(() => window.__TANK_TEST__.state().stage === 2 && window.__TANK_TEST__.state().run.lives === 3, null, { timeout: 5000 });
      ok('classic 3 lives -> game over -> result -> retry stage 2');
      // 老鹰被打掉 → GAME OVER
      await g.waitForFunction(() => window.__TANK_TEST__.state().phase === 'play', null, { timeout: 5000 });
      await g.evaluate(T('const w = T.world; w.eagle.alive = false; w.eagle.boom = 39;'));
      await g.waitForFunction(() => window.__TANK_TEST__.state().overlay === 'tally', null, { timeout: 9000 });
      ok('eagle destroyed -> game over tally');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // ---------- 桌面：魔改模式（耐久、演示、Boss、存档） ----------
    {
      const { p, g, ctx, errors, reload } = await page(b, { viewport: { width: 1280, height: 720 } });
      await g.evaluate(() => { localStorage.clear(); localStorage.setItem('tb-game-tank3d-progress', JSON.stringify({ stage: 7, loop: 2, runScore: 12345 })); localStorage.setItem('tb-game-tank3d-hi', '54321'); });
      await reload();
      await g.focus('#menu [data-opt="mode"]'); await tap(g, 'ArrowRight');
      assert.match(await g.locator('#menu [data-opt="from"] .val').innerText(), /继续第 7 关（第 2 周目）/);
      assert.equal(await g.locator('#hi-val').innerText(), '54321');
      ok('legacy 50-stage save migrated into remix');
      await g.focus('#menu [data-opt="from"]'); await tap(g, 'ArrowRight');
      assert.match(await g.locator('#menu [data-opt="from"] .val').innerText(), /从第 1 关开始/);
      await g.click('#start-btn');
      await g.waitForFunction(() => window.__TANK_TEST__.state().phase === 'play', null, { timeout: 5000 });
      await g.waitForFunction(() => { const s = window.__TANK_TEST__.state(); return s.player && s.player.state === 'active'; });
      assert.equal(await g.evaluate(() => localStorage.getItem('tank3d-v2:remix.progress')), 'null');
      // 标准 3 格：受击扣 1 格并闪烁无敌，第 3 下才阵亡；阵亡后补满；无限命
      await g.evaluate(T('T.world.player.shield = 0; T.qa.hurtPlayer(T.world, 1)'));
      await p.waitForTimeout(300);
      assert.match(await g.locator('#h-hp').innerHTML(), /♥♥<span class="off">♥/);
      await p.screenshot({ path: path.join(out, 'desktop-remix-hurt.png') });
      await g.evaluate(T('T.world.player.invuln = 0; T.qa.hurtPlayer(T.world, 1); T.world.player.invuln = 0; T.qa.hurtPlayer(T.world, 1)'));
      await p.waitForTimeout(1500);
      const afterDeath = await g.evaluate(T('return T.state()'));
      assert.equal(afterDeath.run.lives, 'inf'); assert.equal(afterDeath.run.hp, 3); assert.ok(afterDeath.player && afterDeath.player.shield > 0);
      ok('std durability + infinite lives respawn', { hp: afterDeath.run.hp, deaths: afterDeath.run.stats.deaths });
      // 演示模式：暂停菜单打开 → 标识显示、不受伤、不计最高分
      await tap(g, 'Escape'); await p.waitForTimeout(150);
      await g.click('#pause [data-opt="demo"]'); await tap(g, 'Escape'); await p.waitForTimeout(150);
      assert.equal(await g.locator('#demo-badge').isVisible(), true);
      await g.evaluate(T('T.world.player.shield = 0; T.world.player.invuln = 0; T.qa.hurtPlayer(T.world, 1)'));
      assert.equal(await g.evaluate(T('return T.state().run.hp')), 3);
      ok('demo mode badge + invulnerable');
      // 过关保存进度；大 Boss 关
      await g.evaluate(T('T.clearStage()'));
      await g.waitForFunction(() => window.__TANK_TEST__.state().overlay === 'tally', null, { timeout: 8000 });
      await tap(g, 'Enter'); await tap(g, 'Enter');
      await g.waitForFunction(() => window.__TANK_TEST__.state().stage === 2, null, { timeout: 5000 });
      assert.deepEqual(JSON.parse(await g.evaluate(() => localStorage.getItem('tank3d-v2:remix.progress'))).level, 2);
      ok('remix progress saved on clear');
      await g.evaluate(T('T.startGame({ stage: 10, cycle: 1, score: 0 })'));
      await g.waitForFunction(() => { const s = window.__TANK_TEST__.state(); return s.phase === 'play' && s.bots.some(b => b.type === 'boss' && b.state === 'active'); }, null, { timeout: 8000 });
      await p.waitForTimeout(2500);
      assert.equal(await g.locator('#bossbar').isVisible(), true);
      await p.screenshot({ path: path.join(out, 'desktop-boss10.png') });
      ok('boss level shows boss + HP bar');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // ---------- 手机：竖屏开局自动旋转、摇杆与按键逆变换 ----------
    {
      const { p, g, ctx, errors, reload } = await page(b, { viewport: { width: 390, height: 844 }, mobile: true, dpr: 2, video: true });
      await g.evaluate(() => localStorage.clear()); await reload();
      // 2026-10-07：手机竖着拿时菜单也直接旋转成横屏，免得菜单竖屏、开局又变横屏
      const m0 = await g.evaluate(T('return T.state()'));
      assert.equal(m0.display.rotated, true, 'portrait menu is rotated to landscape');
      ok('phone portrait menu opens in rotated landscape layout', m0.display);
      await p.screenshot({ path: path.join(out, 'phone-portrait-menu.png') });
      await g.locator('#start-btn').tap();
      await g.waitForFunction(() => window.__TANK_TEST__.state().phase === 'play', null, { timeout: 5000 });
      const s0 = await g.evaluate(T('return T.state()'));
      assert.equal(s0.display.rotated, true); assert.equal(s0.touchHidden, false);
      await g.waitForFunction(() => { const s = window.__TANK_TEST__.state(); return s.player && s.player.state === 'active'; });
      await p.waitForTimeout(500);
      await p.screenshot({ path: path.join(out, 'phone-portrait-rotated.png') });
      // 旋转布局下摇杆往「屏幕上方」推（物理右方）→ 坦克向北开
      const zone = await g.locator('#joy-base').boundingBox();
      const cx = zone.x + zone.width / 2, cy = zone.y + zone.height / 2;
      const cdp = await ctx.newCDPSession(p);
      const touchAt = (type, x, y, id = 1) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }] });
      await touchAt('touchStart', cx, cy); await touchAt('touchMove', cx + 20, cy); await touchAt('touchMove', cx + 45, cy);
      await p.waitForTimeout(800);
      const s1 = await g.evaluate(T('return T.state()'));
      await touchAt('touchEnd');
      assert.equal(s1.player.dir, 0, 'stick up (physical right) drives north');
      assert.ok(s1.player.y < 192, 'moved ' + s1.player.y);
      const fire = await g.locator('[data-hold="fire"]').boundingBox();
      await touchAt('touchStart', fire.x + fire.width / 2, fire.y + fire.height / 2, 2); await p.waitForTimeout(80); await touchAt('touchEnd');
      await p.waitForTimeout(100);
      assert.ok((await g.evaluate(T('return T.state().events'))).includes('fire'));
      const cam = await g.locator('#btn-cam-t').boundingBox();
      await touchAt('touchStart', cam.x + cam.width / 2, cam.y + cam.height / 2, 3); await touchAt('touchEnd');
      await p.waitForTimeout(100);
      assert.equal(await g.evaluate(T('return T.state().camera')), 'close');
      const beforeDrag = await g.evaluate(T('return T.state().yawOffset'));
      await touchAt('touchStart', 195, 450, 4); await touchAt('touchMove', 195, 380, 4); await touchAt('touchMove', 195, 300, 4); await touchAt('touchEnd');
      await p.waitForTimeout(350);
      assert.ok(Math.abs(await g.evaluate(T('return T.state().yawOffset')) - beforeDrag) > .25, 'blank-area drag rotates in portrait');
      await p.screenshot({ path: path.join(out, 'phone-portrait-close.png') });
      ok('phone portrait rotation + stick/fire/C/drag', { rotated: s0.display.rotated, y: s1.player.y });
      // 横屏
      await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(700);
      const s2 = await g.evaluate(T('return T.state()'));
      assert.equal(s2.display.rotated, false);
      await p.screenshot({ path: path.join(out, 'phone-landscape.png') });
      ok('phone landscape layout');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // ---------- 实时帧时间（桌面，满场敌军，每个视角） ----------
    {
      const { p, g, ctx, errors, reload } = await page(b, { viewport: { width: 1280, height: 720 }, qs: '&q=high' });
      const perf = {};
      for (const [mode, stage] of [['classic', 35], ['remix', 10], ['remix', 27]]) {
        await g.evaluate(([m, s]) => { const T = window.__TANK_TEST__; T.settings.mode = m; T.settings.classicStage = s; T.startGame(m === 'classic' ? { stage: s, cycle: 1, score: 0 } : { stage: s, cycle: 1, score: 0 }); T.world.run.demo = true; }, [mode, stage]);
        await g.waitForFunction(() => window.__TANK_TEST__.state().phase === 'play', null, { timeout: 6000 });
        await p.waitForTimeout(6000);
        for (let v = 0; v < 5; v++) {
          await g.evaluate(v2 => { const T = window.__TANK_TEST__; T.view.setPreset(v2); }, v);
          await key(g, 'KeyE');
          await p.waitForTimeout(500);
          await g.evaluate(T('T.perfStart()'));
          await p.waitForTimeout(3000);
          const r = await g.evaluate(T('return { ...T.perfStop(), info: T.renderInfo() }'));
          await key(g, 'KeyE', 'keyup');
          const f = r.frames.slice().sort((a, b) => a - b), mean = f.reduce((a, b) => a + b, 0) / f.length;
          perf[mode + stage + ':' + ['overview', 'top', 'close', 'front', 'fp'][v]] = { fps: +(1000 / mean).toFixed(1), median: +f[Math.floor(f.length / 2)].toFixed(1), p95: +f[Math.floor(f.length * .95)].toFixed(1), over50: f.filter(x => x > 50).length, calls: r.info.calls, tris: r.info.triangles };
        }
        await p.screenshot({ path: path.join(out, 'perf-' + mode + stage + '.png') });
      }
      const gl = await g.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?'; });
      ok('realtime perf', { gl, perf });
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally {
    await b.close();
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify({ url, at: new Date().toISOString(), results }, null, 2));
  }
})().catch(e => { console.error(e); process.exit(1); });

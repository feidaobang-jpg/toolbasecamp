// 互动与接入（v0.3.0 起）：兼容包能跑、I 接管机枪 / 上炮、U 手榴弹、默认鼠标接管下左键开火、设置换算、枪火集结第三章跳转
const { open, start, BASE } = require('./lib.cjs');
const out = [];
const check = (name, ok, detail) => { out.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(detail))); };
(async () => {
  const { browser, ctx, page, errors } = await open({ lock: true });
  check('入口用的是兼容包（经典脚本），没有模块脚本', await page.evaluate(() => !!document.querySelector('script[src^="game.compat.js"]') && !document.querySelector('script[type="module"]')), null);
  await page.evaluate(() => { __lj.manual(true); const a = __lj.app; a.s.startPhase = 1; a.s.view = 0; });
  await start(page);
  const step = (n) => page.evaluate((k) => __lj.step(k, true), n);

  // ---- 阵地机枪 ----
  const pre = await page.evaluate(() => {
    const g = __lj.game, W = g.mgs[0];
    for (const e of g.enemies) { e.alive = e.type === 'mg' && e.nest === 'A'; if (!e.alive) e.deadT = 9; }
    g.timers.length = 0; g.cut = 0; g.flags.counter = 1; g.flags.nA = 1; g.flags.nB = 1; g.flags.p1done = 1; __lj.app.demo = true;
    g.place(g.hero, W.x, W.z - 1.4); g.hero.y = 0;
    __lj.step(3, false);
    return { guns: g.mgs.length, nearWhileGunnerAlive: !!g.gunNear() };
  });
  check('三处阵地各有一挺机枪；机枪手还在时不能接管', pre.guns === 3 && !pre.nearWhileGunnerAlive, pre);
  await page.evaluate(() => { const g = __lj.game; for (const e of g.enemies) { e.alive = false; e.deadT = 9; } __lj.step(3, true); });
  const prompt = await page.evaluate(() => document.getElementById('prompt').textContent);
  await page.keyboard.press('KeyI'); await step(4);
  const on = await page.evaluate(() => { const g = __lj.game; return { mg: !!g.hero.mg, ammo: g.hero.mg && g.hero.mg.ammo, use: document.getElementById('act-use').querySelector('span').textContent }; });
  check('打掉机枪手后提示“按 I 接管机枪”，按 I 上机枪', /按 I 接管机枪/.test(prompt) && on.mg && on.ammo === 100, { prompt, on });
  // 在正北 14 米放一个步兵，按住 J 扫射
  await page.evaluate(() => { const g = __lj.game, h = g.hero; g.cam.yaw = 0; g.cam.pitch = 0; g.addUnit('enemy', 'rifle', h.x, h.z - 14, { group: 'T', hold: true, wake: 0 }); __lj.step(2, false); });
  await page.keyboard.down('KeyJ'); await step(40); await page.keyboard.up('KeyJ'); await step(4);
  const fired = await page.evaluate(() => { const g = __lj.game, m = g.hero.mg; return { ammo: m.ammo, alive: g.enemies.filter((e) => e.alive).length, kills: g.stats.kills, chip: document.querySelector('#skills div').textContent, heroAt: [g.hero.x, g.hero.z], gunYaw: m.model.root.rotation.y }; });
  check('按住 J 扫射：弹链减少，正前方的敌人被打倒，状态条显示重机枪', fired.ammo < 100 && fired.alive === 0 && /重机枪/.test(fired.chip), fired);
  await page.keyboard.press('KeyW'); await step(10);
  const fixed = await page.evaluate(() => { const g = __lj.game; return Math.hypot(g.hero.x - g.hero.mg.x, g.hero.z - g.hero.mg.z); });
  check('在机枪上不能走动', fixed < 0.01, fixed);
  await page.keyboard.press('KeyI'); await step(4);
  const off = await page.evaluate(() => !!__lj.game.hero.mg);
  await page.keyboard.down('KeyW'); await step(30); await page.keyboard.up('KeyW'); await step(2);
  const moved = await page.evaluate(() => { const g = __lj.game; return Math.hypot(g.hero.x - g.mgs[0].x, g.hero.z - g.mgs[0].z); });
  check('再按 I 离开机枪，离开后能走', !off && moved > 0.5, { off, moved });

  // ---- 手榴弹改到 U；F 也能互动 ----
  const n0 = await page.evaluate(() => __lj.game.hero.nades);
  await page.keyboard.press('KeyU'); await step(3);
  const n1 = await page.evaluate(() => __lj.game.hero.nades);
  check('U 扔手榴弹', n1 === n0 - 1, { n0, n1 });
  // 亮剑 L、骑兵连 N（v0.4.0 加回）
  await page.evaluate(() => { const g = __lj.game; g.reset(1, false); g.cut = 0; g.timers.length = 0; for (const e of g.enemies) { e.alive = false; e.deadT = 9; } g.place(g.hero, 0, 70); g.cam.yaw = 0; __lj.step(4, true); });
  const z0 = await page.evaluate(() => __lj.game.hero.z);
  await page.keyboard.press('KeyL'); await step(20);
  const d1 = await page.evaluate(() => ({ z: __lj.game.hero.z, cd: __lj.game.hero.dashCd }));
  await page.keyboard.press('KeyN'); await step(6);
  const cv = await page.evaluate(() => ({ riders: __lj.game.riders.length, cd: __lj.game.hero.cavCd, cav: __lj.game.stats.cav }));
  const skills = await page.evaluate(() => ({ chips: [...document.querySelectorAll('#skills div')].map((d) => d.textContent), dash: !!document.getElementById('act-dash'), cav: !!document.getElementById('act-cav') }));
  check('L 亮剑向前突进并进入冷却', z0 - d1.z > 3 && d1.cd > 0, { z0, d1 });
  check('N 叫骑兵连：五骑出场并进入冷却', cv.riders === 5 && cv.cd > 0 && cv.cav === 1, cv);
  check('状态条四项：开火 J、手榴弹 U、亮剑 L、骑兵连 N；触屏有对应按键', skills.chips.length === 4 && /^L亮剑/.test(skills.chips[2]) && /^N骑兵连/.test(skills.chips[3]) && skills.dash && skills.cav, skills);

  // ---- 上炮改用 I（F 也行）----
  await page.evaluate(() => { const g = __lj.game; g.reset(3, false); g.cut = 0; g.timers.length = 0; for (const b of g.world.bunkers) b.cd = 999; g.place(g.hero, g.cannon.x + 0.5, g.cannon.z + 2.4); __lj.step(6, true); });
  await page.keyboard.press('KeyI'); await step(5);
  const c1 = await page.evaluate(() => __lj.game.cannon.manned);
  await page.keyboard.press('KeyF'); await step(5);
  const c2 = await page.evaluate(() => __lj.game.cannon.manned);
  check('炮位旁按 I 上炮，按 F 也能离开', c1 && !c2, { c1, c2 });

  // ---- 默认鼠标接管：开局自动锁定，锁定状态下左键能开火、右键开镜 ----
  await page.evaluate(() => { __lj.manual(false); __lj.app.toMenu(); });
  await page.waitForTimeout(300);
  const def = await page.evaluate(() => ({ mouseAim: __lj.app.s.mouseAim, mode: __lj.app.mode() }));
  await page.mouse.click(640, 360);   // 给页面一次点击（用户手势）
  await page.evaluate(() => { const a = __lj.app; a.s.startPhase = 1; a.noAutoPause = true; a.start(false); });
  await page.waitForTimeout(700);
  let lk = await page.evaluate(() => ({ locked: __lj.app.input.locked, state: __lj.app.state }));
  if (!lk.locked) { await page.mouse.click(640, 300); await page.waitForTimeout(600); lk = await page.evaluate(() => ({ locked: __lj.app.input.locked, state: __lj.app.state, viaClick: true })); }
  check('默认设置是鼠标接管；开局（或点一下画面）后鼠标被接管', def.mouseAim === 'lock' && lk.locked && lk.state === 'play', { def, lk });
  if (lk.locked) {
    await page.evaluate(() => { const g = __lj.game; g.cut = 0; g.timers.length = 0; for (const e of g.enemies) { e.alive = false; e.deadT = 9; } });
    await page.waitForTimeout(200);
    const m0 = await page.evaluate(() => __lj.game.hero.mag);
    await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up(); await page.waitForTimeout(100);
    const m1 = await page.evaluate(() => __lj.game.hero.mag);
    await page.mouse.down({ button: 'right' }); await page.waitForTimeout(250);
    const ads = await page.evaluate(() => __lj.game.hero.ads);
    await page.mouse.up({ button: 'right' }); await page.waitForTimeout(150);
    const ads2 = await page.evaluate(() => __lj.game.hero.ads);
    const y0 = await page.evaluate(() => __lj.game.cam.yaw);
    await page.mouse.move(760, 300); await page.waitForTimeout(250);
    const y1 = await page.evaluate(() => __lj.game.cam.yaw);
    check('鼠标接管时：左键开火、右键按住开镜、移动鼠标转视角', m1 < m0 && ads && !ads2 && y1 < y0 - 0.05, { m0, m1, ads, ads2, y0, y1 });
    await page.evaluate(() => document.exitPointerLock()); await page.waitForTimeout(300);
    check('释放鼠标（Esc）即暂停', await page.evaluate(() => __lj.app.state) === 'pause', null);
  }

  // ---- 旧设置换算：sv=2 且存着“按住拖动”的，换到鼠标接管一次；视角不再被重算 ----
  await page.evaluate(() => { localStorage.setItem('lj_campaign_v1_settings', JSON.stringify({ sv: 2, view: 1, mouseAim: 'drag', volume: 30 })); });
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__lj && document.getElementById('loading').hidden);
  const mig = await page.evaluate(() => ({ mouseAim: __lj.app.s.mouseAim, view: __lj.app.s.view, volume: __lj.app.s.volume }));
  check('旧设置换算：鼠标瞄准改为接管，视角与音量保留', mig.mouseAim === 'lock' && mig.view === 1 && mig.volume === 30, mig);
  const lobbyBtn = await page.evaluate(() => [...document.querySelectorAll('#menu button')].some((b) => /返回大厅/.test(b.textContent)));
  check('主菜单有“返回大厅”', lobbyBtn, null);
  await page.evaluate(() => localStorage.removeItem('lj_campaign_v1_settings'));

  // ---- 枪火集结：大厅能开，抗战战役入口进亮剑战役页面（0.4.0 起三章都在那里，没有旧的章节选择） ----
  const p2 = await ctx.newPage(); const e2 = [];
  p2.on('pageerror', (e) => e2.push(e.message));
  await p2.goto(BASE.replace(/liangjian\/$/, ''), { waitUntil: 'load' });
  await p2.waitForFunction(() => window.__ccReady, null, { timeout: 30000 });
  const ver = await p2.evaluate(() => document.getElementById('gameVersion').textContent);
  const chap = await p2.evaluate(() => document.getElementById('btnPingan').textContent.replace(/\s+/g, ' ').trim());
  await p2.click('#btnPingan');
  await p2.waitForURL(/gunfire-assembly\/liangjian\/index\.html/, { timeout: 8000 }).catch(() => {});
  await p2.waitForTimeout(1500);
  const landed = await p2.evaluate(() => ({ url: location.pathname, cur: (document.querySelector('#menu .chapter.cur') || {}).dataset, menu: !!document.getElementById('menu') && !document.getElementById('menu').hidden, title: document.title }));
  check('枪火集结大厅正常；「抗战战役 · 亮剑三章」点进去是亮剑战役页面，落在上次玩的平安县城', /^v0\.\d+\.\d+$/.test(ver) && /亮剑三章/.test(chap) && /liangjian\/index\.html$/.test(landed.url) && landed.cur && landed.cur.ch === 'pingan' && landed.menu, { ver, chap, landed });
  await p2.evaluate(() => [...document.querySelectorAll('#menu button')].find((b) => /返回大厅/.test(b.textContent)).click());
  await p2.waitForURL(/gunfire-assembly\/index\.html/, { timeout: 8000 }).catch(() => {});
  await p2.waitForTimeout(800);
  check('重做版里点“返回大厅”回到枪火集结', /gunfire-assembly\/index\.html$/.test(await p2.evaluate(() => location.pathname)), await p2.evaluate(() => location.pathname));
  // 键位表：医疗默认 N，Y/H 为抬头低头
  const keys = await p2.evaluate(async () => { const m = await import('./key-bindings.js'); const k = m.createKeyBindings(); return { H: k.code('H'), up: k.code('LOOKUP'), down: k.code('LOOKDOWN'), Y: m.KEY_ACTIONS.Y }; });
  check('枪火集结键位：医疗 / 直升机降低默认 N，Y / H 为抬头低头', keys.H === 'KeyN' && keys.up === 'KeyY' && keys.down === 'KeyH' && !keys.Y, keys);
  console.log('pingan errors:', errors.length ? errors.join(' | ') : 'none', '；gunfire errors:', e2.length ? e2.join(' | ') : 'none');
  require('fs').writeFileSync(require('path').join(__dirname, 'out-interact.json'), JSON.stringify({ at: new Date().toISOString(), results: out, errors: errors.concat(e2) }, null, 1));
  const bad = out.filter((r) => !r.ok).length;
  console.log(`\n${out.length - bad}/${out.length} 通过`);
  await browser.close();
  process.exit(bad || errors.length || e2.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

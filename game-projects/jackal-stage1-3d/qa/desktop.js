// 桌面纯键盘验收（无头 Chromium + SwiftShader）：菜单、移动/镜头映射、机枪/手雷/火箭、救俘虏、送达、隐藏星、
// 阵亡复活、3 格护甲与修理包（v0.2）、演示模式、暂停、营地大门、岩崖、Boss 两段受伤、通关结算、经典 3 命 / 经典一发、失焦、全屏、返回列表。
// 菜单流程用实时时钟；需要精确时序的玩法检查用手动时钟（__JK_TEST__.step），按键仍是真实键盘事件。
const fs = require('fs');
const { BASE, results, check, snap, waitFor, launch } = require('./lib');

(async () => {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [], warns = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });
  const steps = (n) => page.evaluate((n) => { let r; for (let i = 0; i < n; i++) r = __JK_TEST__.step(1, false); return r; }, n);
  const cheat = (fn, arg) => page.evaluate(([fn, arg]) => { const c = __JK_TEST__.cheat; return c[fn].apply(null, arg || []); }, [fn, arg]);
  const evs = () => page.evaluate(() => __JK_TEST__.events());
  const key = async (code, ms) => { await page.keyboard.down(code); if (ms) await steps(ms); await page.keyboard.up(code); };

  await page.goto(BASE + '?test=1&seed=7&q=low');
  await page.waitForTimeout(1200);
  let s = await snap(page);
  const ri = await page.evaluate(() => __JK_TEST__.renderInfo());
  check('加载完成并显示主菜单，WebGL 正常', s.ui.overlay === 'menu' && s.ui.uiMode === 'title' && /SwiftShader|ANGLE|WebGL/i.test(ri.gl), { gl: ri.gl });
  check('首个焦点在「开始游戏」', s.ui.focus === 'start', s.ui.focus);
  const listHref = await page.evaluate(() => Array.from(document.querySelectorAll('.list-link')).map(a => a.getAttribute('href')));
  check('菜单/暂停/结算都有「返回游戏列表」普通链接', listHref.length === 3 && listHref.every(h => h === '../../../games.html'), listHref);

  // ---------- 菜单键盘导航 ----------
  await page.keyboard.press('ArrowDown'); s = await snap(page);
  const stageTxt = await page.textContent('#menu [data-opt=stage]');
  check('↓ 到「起始关卡」，未过关时只有第一关', s.ui.focus === 'stage' && /第一关/.test(stageTxt), { focus: s.ui.focus, stageTxt });
  await page.keyboard.press('ArrowDown'); s = await snap(page);
  check('↓ 移动焦点到「命数」', s.ui.focus === 'lives', s.ui.focus);
  await page.keyboard.press('ArrowRight'); s = await snap(page);
  const livesTxt = await page.textContent('#menu [data-opt=lives]');
  check('→ 切换为经典 3 命', /经典 3 命/.test(livesTxt), livesTxt);
  await page.keyboard.press('ArrowLeft');
  const livesTxt2 = await page.textContent('#menu [data-opt=lives]');
  check('← 切回无限命（默认）', /无限命/.test(livesTxt2), livesTxt2);
  await page.keyboard.press('ArrowDown'); s = await snap(page);
  const armTxt0 = await page.textContent('#menu [data-opt=armor]');
  check('↓ 到「耐久」，默认标准 3 格', s.ui.focus === 'armor' && /标准 3 格/.test(armTxt0), { focus: s.ui.focus, armTxt0 });
  await page.keyboard.press('ArrowRight'); const armTxt1 = await page.textContent('#menu [data-opt=armor]');
  await page.keyboard.press('ArrowLeft'); const armTxt2 = await page.textContent('#menu [data-opt=armor]');
  check('←/→ 在「标准 3 格 / 经典一发」之间切换', /经典一发/.test(armTxt1) && /标准 3 格/.test(armTxt2), { armTxt1, armTxt2 });
  await page.keyboard.press('ArrowDown');
  const gunTxt0 = await page.textContent('#menu [data-opt=gun]');
  await page.keyboard.press('ArrowRight'); const gunTxt1 = await page.textContent('#menu [data-opt=gun]');
  await page.keyboard.press('ArrowLeft'); const gunTxt2 = await page.textContent('#menu [data-opt=gun]');
  check('「机枪方向」默认跟随车头，可切换为原作朝上（原作）', /跟随车头/.test(gunTxt0) && /原作朝上/.test(gunTxt1) && /跟随车头/.test(gunTxt2), { gunTxt0, gunTxt1, gunTxt2 });
  await page.keyboard.press('ArrowDown');
  const demoTxt = await page.textContent('#menu [data-opt=demo]');
  check('演示模式默认关闭', /关/.test(demoTxt), demoTxt);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); s = await snap(page);
  check('菜单里 →/← 切换视角预设', s.ui.camera === 'top', s.ui.camera);
  await page.keyboard.press('KeyC'); await page.keyboard.press('KeyC'); s = await snap(page);
  check('菜单里 C 键循环视角（3 个预设回到斜俯视）', s.ui.camera === 'oblique', s.ui.camera);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  const vol0 = await page.textContent('#menu [data-opt=volume]');
  await page.keyboard.press('ArrowLeft'); const vol1 = await page.textContent('#menu [data-opt=volume]');
  await page.keyboard.press('ArrowRight');
  check('音量可用 ←/→ 调节', vol0 !== vol1, { vol0, vol1 });
  // 回到开始按钮并按 Enter
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowUp');
  s = await snap(page);
  check('↑ 回到「开始游戏」', s.ui.focus === 'start', s.ui.focus);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  s = await snap(page);
  check('Enter 开始游戏，不自动全屏', s.ui.uiMode === 'game' && s.ui.overlay === null && !s.ui.fs && s.mode === 'intro', { mode: s.mode, fs: s.ui.fs });
  const hintVisible = await page.isVisible('#keyhint');
  check('桌面显示键位提示、隐藏触屏按键', hintVisible && s.ui.touchHidden, { hintVisible, touchHidden: s.ui.touchHidden });
  check('开场 BGM 开始播放', s.ui.music === 'stage', s.ui.music);
  const pipsStart = await page.$$eval('#h-armor i.on', els => els.length);
  check('标准模式开局 3 格护甲，HUD 显示 3 格', s.settings.armor === 'std' && s.player.armor === 3 && s.player.armorMax === 3 && pipsStart === 3, { armor: s.player.armor, pipsStart });

  // ---------- 手动时钟下的玩法 ----------
  await page.evaluate(() => __JK_TEST__.manual(true));
  s = await steps(130);
  check('登陆艇开场约 1.7 秒后进入操作', s.mode === 'play', s);
  // 移动与镜头映射（每个预设）
  const moveTest = async (label) => {
    await cheat('teleport', [-8, 22]); await cheat('invuln', [60]);
    const out = {};
    for (const [code, axis, sign] of [['KeyD', 'x', 1], ['KeyA', 'x', -1], ['KeyW', 'y', 1], ['KeyS', 'y', -1]]) {
      const a = await snap(page);
      await key(code, 20);
      const b = await snap(page);
      out[code] = +(b.player[axis] - a.player[axis]).toFixed(2) * sign;
    }
    const ax = (await snap(page)).cam.axes;
    return { out, ax };
  };
  for (const name of ['oblique', 'top', 'low']) {
    s = await snap(page);
    while (s.ui.camera !== name) { await page.keyboard.press('KeyC'); await steps(1); s = await snap(page); }
    const r = await moveTest(name);
    check('[视角 ' + name + '] WASD 按相机水平轴移动（W 前进=北、D 右=东）', Object.values(r.out).every(v => v > 2) && Math.abs(r.ax.fwd.y - 1) < 0.01 && Math.abs(r.ax.right.x - 1) < 0.01, r);
  }
  while ((await snap(page)).ui.camera !== 'oblique') { await page.keyboard.press('KeyC'); await steps(1); }
  // 对角
  let a = await snap(page);
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await steps(20); await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD');
  let b = await snap(page);
  const dx = b.player.x - a.player.x, dy = b.player.y - a.player.y;
  check('W+D 斜向移动且速度归一化', b.player.dir === 1 && dx > 1 && dy > 1 && Math.hypot(dx, dy) > 2.2 && Math.hypot(dx, dy) < 3.0, { dx: +dx.toFixed(2), dy: +dy.toFixed(2), dir: b.player.dir });
  // 机枪默认跟随车头
  await page.keyboard.down('KeyD'); await steps(3); await page.keyboard.up('KeyD');   // 车头朝东
  a = await snap(page);
  await page.keyboard.down('KeyJ'); await steps(2);
  s = await snap(page); const vel = s.pbVel;
  await steps(20); b = await snap(page);
  check('按住 J 机枪连发（默认跟随车头：朝东时子弹向东飞）', b.mgShots - a.mgShots >= 3 && vel && vel[0] > 20 && Math.abs(vel[1]) < 0.01 && s.player.dir === 2, { shots: b.mgShots - a.mgShots, vel, dir: s.player.dir });
  await page.keyboard.up('KeyJ');
  // 手雷朝车头方向
  await cheat('teleport', [-20, 26]); await cheat('invuln', [60]); await page.keyboard.down('KeyD'); await steps(2); await page.keyboard.up('KeyD');
  a = await snap(page);
  let n0 = (await evs()).length;
  await key('KeyK', 2);
  await steps(45);
  let land = (await evs()).slice(n0).find(e => e.name === 'grenadeLand');
  check('K 手雷朝车头（东）抛出约 9 米', land && land.data.x > a.player.x + 7 && Math.abs(land.data.y - a.player.y) < 1.5, { from: [a.player.x, a.player.y], land: land && land.data });

  // 炸 H0 → 救出俘虏 → 接上车
  n0 = (await evs()).length;
  await cheat('teleport', [-14.5, 26.5]); await cheat('invuln', [60]);
  await page.keyboard.down('KeyW'); await steps(3); await page.keyboard.up('KeyW');
  await key('KeyK', 2); await steps(45);
  s = await snap(page);
  let ev = (await evs()).slice(n0);
  const h0 = s.huts.find(h => h.name === 'H0');
  check('手雷炸毁营房 H0 并放出 2 名俘虏', !h0.alive && ev.some(e => e.name === 'powFreed' && e.data.n === 2), { h0, freed: ev.filter(e => e.name === 'powFreed').map(e => e.data) });
  for (let k = 0; k < 3 && s.pows.length; k++) { const p = s.pows[0]; await cheat('teleport', [p.x, p.y - 0.2]); await steps(3); s = await snap(page); }
  check('开过去接上俘虏，HUD 车上人数增加', s.carried >= 2, { carried: s.carried });
  const hudCarried = await page.textContent('#h-carried');
  check('HUD 显示车上俘虏数', +hudCarried === s.carried, hudCarried);

  // ---------- 3 格护甲与修理包（v0.2）----------
  ev = (await evs()).slice(n0);
  check('营房 H0 炸开时掉出一个修理包', ev.filter(e => e.name === 'kitDropped').length === 1 && s.kits.length >= 1, { drops: ev.filter(e => e.name === 'kitDropped').map(e => e.data), kits: s.kits });
  if (s.kits.length) { await cheat('teleport', [s.kits[0].x, s.kits[0].y]); await steps(4); }
  b = await snap(page);
  check('护甲满时修理包留在原地（之后可回来拿）', b.kits.length === s.kits.length && b.player.armor === 3, { kits: b.kits, armor: b.player.armor });
  const pips = () => page.$$eval('#h-armor i.on', els => els.length);
  const hurtOp = () => page.evaluate(() => +getComputedStyle(document.getElementById('hurt')).opacity);
  const shootMe = async () => { const q = await snap(page); await page.evaluate(([x, y]) => __JK_TEST__.cheat.bulletsAt(x - 3, y, Math.PI / 2), [q.player.x, q.player.y]); };
  await cheat('kill'); await steps(2);
  await cheat('teleport', [-19, 14]); await cheat('invuln', [0]);
  await page.evaluate(() => { __JK_TEST__.cheat.state().P.shield = 0; });
  await steps(2);
  a = await snap(page); n0 = (await evs()).length;
  await shootMe(); await steps(24);
  b = await snap(page); ev = (await evs()).slice(n0);
  const hit1 = ev.find(e => e.name === 'playerHit');
  check('敌弹命中：护甲 3 → 2，吉普不毁，进入约 1.2 秒闪烁无敌', b.player.alive && b.player.armor === 2 && b.deaths === a.deaths && hit1 && b.player.invuln > 0.6 && b.player.invuln < 1.2, { armor: b.player.armor, invuln: b.player.invuln, hit: hit1 && hit1.data });
  const p2 = await pips(), op1 = await hurtOp();
  check('HUD 护甲同步减为 2 格，画面四周闪红', p2 === 2 && op1 > 0.2, { pips: p2, hurtOpacity: op1 });
  await shootMe(); await steps(24);
  b = await snap(page);
  check('无敌时间内再中弹不扣护甲', b.player.armor === 2 && b.player.alive, { armor: b.player.armor, invuln: b.player.invuln });
  await steps(60);
  await shootMe(); await steps(24);
  b = await snap(page);
  const lowCls = await page.evaluate(() => document.getElementById('hc-armor').classList.contains('low'));
  check('第 2 次中弹剩 1 格：HUD 变红闪烁', b.player.armor === 1 && b.player.alive && lowCls && (await pips()) === 1, { armor: b.player.armor, lowCls });
  const op0 = (await steps(40), await hurtOp());
  check('红边约 0.45 秒后褪去', op0 === 0, op0);
  await steps(40);
  n0 = (await evs()).length; a = await snap(page);
  await shootMe(); await steps(24);
  b = await snap(page); ev = (await evs()).slice(n0);
  check('第 3 次中弹才被击毁', !b.player.alive && b.deaths === a.deaths + 1 && ev.some(e => e.name === 'playerDown'), { alive: b.player.alive, deaths: b.deaths - a.deaths, evs: ev.map(e => e.name) });
  await steps(130);
  b = await snap(page);
  check('复活后护甲补满 3 格', b.player.alive && b.player.armor === 3 && (await pips()) === 3, { alive: b.player.alive, armor: b.player.armor });
  await steps(170);
  await cheat('hit'); await steps(80);
  a = await snap(page); n0 = (await evs()).length;
  await page.evaluate(([x, y]) => __JK_TEST__.cheat.kitAt(x, y + 2.5), [a.player.x, a.player.y]);
  await page.keyboard.down('KeyW'); await steps(20); await page.keyboard.up('KeyW');
  b = await snap(page); ev = (await evs()).slice(n0);
  check('护甲不满时开过修理包：护甲 +1，修理包消失', a.player.armor === 2 && b.player.armor === 3 && ev.some(e => e.name === 'kitPicked') && b.kits.length === a.kits.length && /护甲 \+1/.test(b.ui.toast || ''), { before: a.player.armor, after: b.player.armor, toast: b.ui.toast });
  await cheat('armor', [1]); await cheat('teleport', [8, 46.4]); await cheat('invuln', [60]); await steps(2);
  n0 = (await evs()).length;
  await page.keyboard.down('KeyW'); await steps(24); await page.keyboard.up('KeyW');
  b = await snap(page); ev = (await evs()).slice(n0);
  const cpEv = ev.find(e => e.name === 'checkpoint');
  check('经过检查点自动补满护甲', b.player.armor === 3 && cpEv && cpEv.data.refill === true && /护甲已补满/.test(b.ui.toast || ''), { armor: b.player.armor, cp: cpEv && cpEv.data, toast: b.ui.toast });
  // 闪光俘虏升级
  await cheat('destroy', ['H1']); await steps(50);
  s = await snap(page);
  const flash = s.pows.find(p => p.flash);
  if (flash) { await cheat('teleport', [flash.x, flash.y - 0.2]); await steps(3); }
  s = await snap(page);
  check('闪光俘虏让武器升级为火箭（Lv2）', s.weapon === 2, { weapon: s.weapon, flash: !!flash });
  await page.keyboard.down('KeyD'); await steps(2); await page.keyboard.up('KeyD');
  await key('KeyK', 2); s = await snap(page);
  check('K 发射火箭（直线飞行）', s.bombs.includes('rocket'), s.bombs);
  await steps(40);

  // 直升机坪送达
  await cheat('carry', [3]); a = await snap(page);
  await cheat('teleport', [19, 291]); await cheat('invuln', [60]);
  await steps(70);
  b = await snap(page);
  check('开到直升机坪：俘虏逐个送上直升机，每名 +500', b.delivered - a.delivered === 3 && b.carried === 0 && b.score - a.score >= 1500, { delivered: b.delivered, carried: b.carried, score: b.score - a.score });

  // 隐藏星
  n0 = (await evs()).length;
  await cheat('teleport', [21.4, 204.5]); await cheat('invuln', [60]); await cheat('weapon', [1]);
  await page.keyboard.down('KeyD'); await steps(2); await page.keyboard.up('KeyD');
  await key('KeyK', 2); await steps(45);
  s = await snap(page);
  check('炸林角露出隐藏的棕色星', s.star && s.star.hidden === false && s.star.item === 'bomb', s.star);
  a = s;
  const inView0 = a.enemies.filter(e => e.active).length;
  await cheat('teleport', [29.2, 205]); await steps(3);
  b = await snap(page);
  const picked = (await evs()).find(e => e.name === 'starPicked');
  check('拾取棕色星：消灭画面上的敌人（原作智能炸弹），画面内不剩敌人', b.star.picked && picked && picked.data.item === 'bomb' && b.enemies.filter(e => e.active).length === 0 && /棕色星/.test(b.banner || ''), { killed: picked && picked.data.killed, before: inView0, after: b.enemies.filter(e => e.active).length, banner: b.banner });

  // 阵亡与复活（连续多次）：先清场，避免其他敌人干扰计数
  await cheat('kill'); await steps(5);
  await cheat('teleport', [-8, 22]); await steps(2);
  await cheat('weapon', [3]); await cheat('carry', [2]);
  s = await snap(page);
  let deaths0 = s.deaths, ok = true, detail = [];
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => { const st = __JK_TEST__.cheat.state(); st.P.shield = 0; });
    const hurt = await cheat('hurt');
    await steps(2); const d = await snap(page);
    await steps(130); const r = await snap(page);
    detail.push({ hurt, alive2: d.player.alive, alive: r.player.alive, inv: r.player.invuln, w: r.weapon });
    if (!hurt || d.player.alive || !r.player.alive || r.player.invuln <= 0) ok = false;
    await steps(170);
  }
  s = await snap(page);
  check('连续 3 次阵亡都能在检查点复活（无限命）', ok && s.deaths === deaths0 + 3, detail);
  check('阵亡后武器回到手雷、车上俘虏散落在原地', s.weapon === 1 && s.pows.length >= 2, { weapon: s.weapon, pows: s.pows.length });
  check('复活保护约 2.6 秒后结束', s.player.invuln <= 0, s.player.invuln);
  ev = await evs();
  check('复活时显示无敌闪烁并清掉附近敌弹（respawn 事件）', ev.filter(e => e.name === 'respawn').length >= 3, ev.filter(e => e.name === 'respawn').slice(-1));

  // 暂停菜单：Esc 暂停 / 继续；演示模式开关
  await page.keyboard.press('Escape'); await steps(1); s = await snap(page);
  check('Esc 暂停并打开暂停菜单', s.ui.overlay === 'pause' && s.ui.paused, s.ui.overlay);
  check('暂停菜单首焦点「继续」', s.ui.focus === 'resume', s.ui.focus);
  for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowDown');
  s = await snap(page);
  await page.keyboard.press('Enter'); s = await snap(page);
  check('暂停菜单里开启演示模式（无敌）', s.settings.demo === true && s.demoUsed, s.settings);
  await page.keyboard.press('Escape'); await steps(1); s = await snap(page);
  check('Esc 继续游戏', s.ui.overlay === null && !s.ui.paused, s.ui.overlay);
  const badge = await page.isVisible('#demo-badge');
  check('演示模式右上角显示红色标识', badge, badge);
  n0 = (await evs()).length;
  s = await snap(page);
  await page.evaluate(([x, y]) => __JK_TEST__.cheat.bulletsAt(x - 3, y, Math.PI / 2), [s.player.x, s.player.y]);
  await steps(30);
  b = await snap(page);
  ev = (await evs()).slice(n0);
  check('演示模式下敌弹不会击毁吉普', b.player.alive && b.deaths === s.deaths && ev.some(e => e.name === 'demoBlock'), { alive: b.player.alive, block: ev.filter(e => e.name === 'demoBlock').length });
  await page.keyboard.press('Escape'); await steps(1);
  for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape'); await steps(1);
  s = await snap(page);
  check('关闭演示模式后恢复正常', s.settings.demo === false && !(await page.isVisible('#demo-badge')), s.settings);

  // 营地大门与检查点
  await cheat('teleport', [0, 46.5]); await cheat('invuln', [60]); await cheat('weapon', [2]);
  await page.keyboard.down('KeyW'); await steps(2); await page.keyboard.up('KeyW');
  await key('KeyK', 2); await steps(30); await key('KeyK', 2); await steps(30);
  s = await snap(page);
  check('火箭两发炸开营地大门', !s.gate.alive, s.gate);
  await page.keyboard.down('KeyW'); await steps(110); await page.keyboard.up('KeyW');
  s = await snap(page);
  check('穿过大门进入营地并记录检查点', s.player.y > 59 && s.cp >= 2, { y: s.player.y, cp: s.cp });

  // 岩崖：手雷飞越不破坏，火箭可炸毁
  const bluffCount = async () => (await evs()).filter(e => e.name === 'staticDestroyed' && e.data.kind === 'bluff').length;
  const b0 = await bluffCount();
  await cheat('teleport', [-25, 150]); await cheat('invuln', [60]); await cheat('weapon', [1]);
  await page.keyboard.down('KeyW'); await steps(2); await page.keyboard.up('KeyW');
  await key('KeyK', 2); await steps(45);
  const b1 = await bluffCount();
  await cheat('weapon', [2]); await key('KeyK', 2); await steps(30);
  const b2 = await bluffCount();
  check('手雷不破坏岩崖、火箭能炸毁岩崖', b1 === b0 && b2 > b1, { b0, b1, b2 });

  // 失焦自动暂停并清空按键
  await page.keyboard.down('KeyD');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  s = await snap(page);
  check('页面失焦自动暂停并清空按住的方向', s.ui.overlay === 'pause' && !s.input.held.r, { overlay: s.ui.overlay, held: s.input.held });
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Escape'); await steps(1);

  // Boss
  n0 = (await evs()).length;
  await cheat('teleport', [0, 310]); await cheat('invuln', [999]); await cheat('weapon', [2]);
  await steps(20);
  s = await snap(page);
  check('进入 Boss 场地：路障升起、BOSS 战开始、切换 Boss 音乐', s.boss.state === 'intro' || s.boss.state === 'fight', { boss: s.boss, music: s.ui.music });
  check('Boss 音乐', s.ui.music === 'boss', s.ui.music);
  await steps(400);
  s = await snap(page);
  const bosses = s.enemies.filter(e => e.type === 'boss');
  check('蓝色坦克依次开进（不是一次全部出现）', s.boss.spawned >= 2 && s.boss.spawned <= 4, s.boss);
  // 两段受伤：用 4 发机枪子弹把第一辆打成棕色
  const st0 = await page.evaluate(() => { const e = __JK_TEST__.cheat.state().ents.find(q => q.type === 'boss' && q.alive && !q.enter); return e ? { hp: e.hp, stage: e.stage, id: e.bossId, x: e.x, y: e.y } : null; });
  await page.evaluate(() => { const st = __JK_TEST__.cheat.state(); const e = st.ents.find(q => q.type === 'boss' && q.alive && !q.enter); st.P.x = e.x; st.P.y = e.y - 6; });
  for (let k = 0; k < 4; k++) { await page.evaluate(() => { const st = __JK_TEST__.cheat.state(); const e = st.ents.find(q => q.type === 'boss' && q.alive && !q.enter); st.P.x = e.x; st.P.y = e.y - 6; }); await key('KeyJ', 1); await steps(14); }
  const st1 = await page.evaluate((id) => { const e = __JK_TEST__.cheat.state().ents.find(q => q.bossId === id); return e ? { hp: e.hp, stage: e.stage, alive: e.alive } : null; }, st0 && st0.id);
  check('Boss 坦克：4 发机枪子弹打掉一段（蓝 → 棕）', st0 && st1 && st1.stage === 2, { before: st0, after: st1 });
  // 一发爆炸物直接命中再打掉一段
  await page.evaluate((id) => { const st = __JK_TEST__.cheat.state(); const e = st.ents.find(q => q.bossId === id); if (e) { st.P.x = e.x - 8; st.P.y = e.y; st.P.dir = 2; } }, st0 && st0.id);
  await page.evaluate((id) => { const st = __JK_TEST__.cheat.state(); const e = st.ents.find(q => q.bossId === id); if (e) __JK_TEST__.cheat.explodeAt(e.x, e.y, 'rocket'); }, st0 && st0.id);
  await steps(2);
  const st2 = await page.evaluate((id) => { const e = __JK_TEST__.cheat.state().ents.find(q => q.bossId === id); return e ? { hp: e.hp, alive: e.alive } : null; }, st0 && st0.id);
  check('再一发爆炸物直接命中击毁该坦克', st2 && !st2.alive, st2);
  // 溅射不算：在 3.5 米外爆炸不扣血
  const sp = await page.evaluate(() => { const e = __JK_TEST__.cheat.state().ents.find(q => q.type === 'boss' && q.alive && !q.enter); if (!e) return null; const hp = e.hp; __JK_TEST__.cheat.explodeAt(e.x + 3.5, e.y, 'rocket'); return { before: hp, after: e.hp }; });
  check('Boss 只吃直接命中，溅射不扣血', !sp || sp.before === sp.after, sp);
  await steps(900);
  await cheat('kill', ['boss']); await steps(30);
  for (let k = 0; k < 6; k++) { s = await snap(page); if (s.boss.killed >= 4) break; await steps(300); await cheat('kill', ['boss']); await steps(10); }
  s = await snap(page);
  check('4 辆全部击毁后第一关完成', s.boss.state === 'done' && s.mode === 'clear', s.boss);
  await steps(320); await page.waitForTimeout(600);
  s = await snap(page);
  check('救援直升机降落后显示结算', s.ui.overlay === 'result', s.ui.overlay);
  const resTitle = await page.textContent('#res-title');
  const tally = await page.textContent('#tally');
  check('结算含击毁统计、送达俘虏与总分', /第一关完成/.test(resTitle) && /送达俘虏/.test(tally) && /总分/.test(tally), resTitle);
  const nextTxt = await page.textContent('#res-next');
  ev = await evs();
  const end = ev.find(e => e.name === 'end');
  check('用过演示模式的局不计最高分', end && end.data.demo === true && end.data.newHi === false, end && end.data);
  s = await snap(page);
  check('第一关结算首焦点「进入第二关」', s.ui.focus === 'next' && /进入第二关/.test(nextTxt), { focus: s.ui.focus, nextTxt });
  const scoreBefore = s.score, weaponBefore = s.weapon;
  await page.keyboard.press('Enter'); await steps(5);
  s = await snap(page);
  check('Enter 进入第二关：换成废墟城，分数和武器保留，营房与大门是新的', s.stage === 2 && s.stageNo === 2 && s.mode === 'intro' && s.huts.length === 6 && s.huts.every(h => h.alive) && s.score === scoreBefore && s.weapon === weaponBefore && s.boss.state === 'idle', { stage: s.stage, mode: s.mode, score: s.score, scoreBefore, weapon: s.weapon, weaponBefore, huts: s.huts.length });
  check('第二关开场换成废墟城 BGM', s.ui.music === 'ruins', s.ui.music);

  // 经典 3 命：命用完 → 失败结算
  await steps(130);
  await page.keyboard.press('Escape'); await steps(1);
  // 返回主菜单
  const items = await page.$$eval('#pause .items > *', els => els.map(e => e.getAttribute('data-act') || e.getAttribute('data-opt')));
  const titleIdx = items.indexOf('title');
  for (let k = 0; k < titleIdx; k++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  s = await snap(page);
  check('暂停菜单「返回主菜单」', s.ui.overlay === 'menu' && s.ui.uiMode === 'title', s.ui);
  await page.keyboard.press('ArrowDown');                                             // 起始关卡（保持第一关）
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');   // 经典 3 命
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');   // 经典一发
  for (let k = 0; k < 3; k++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter'); await steps(130);
  s = await snap(page);
  check('经典模式开局 3 命，HUD 显示 ×3', s.settings.lives === 'classic' && s.lives === 3 && (await page.textContent('#h-lives')) === '×3', { lives: s.lives });
  const clsCls = await page.evaluate(() => document.getElementById('hc-armor').classList.contains('classic'));
  check('经典一发：护甲上限 1，HUD 标「一发」', s.settings.armor === 'classic' && s.player.armorMax === 1 && s.player.armor === 1 && clsCls && (await pips()) === 1, { armor: s.player.armor, max: s.player.armorMax, clsCls });
  await cheat('invuln', [6]); await steps(170);   // 开局附近有步兵开火：先保护一下，这里只验证修理包
  a = await snap(page); n0 = (await evs()).length;
  await page.evaluate(([x, y]) => __JK_TEST__.cheat.kitAt(x, y + 2.5), [a.player.x, a.player.y]);
  await page.keyboard.down('KeyW'); await steps(20); await page.keyboard.up('KeyW');
  b = await snap(page);
  check('经典一发：修理包改为 +300 分', b.score - a.score >= 300 && b.player.armor === 1 && b.kits.length === a.kits.length, { ds: b.score - a.score, armor: b.player.armor });
  await page.evaluate(() => { __JK_TEST__.cheat.state().P.shield = 0; __JK_TEST__.cheat.invuln(0); });
  a = await snap(page);
  await shootMe(); await steps(24);
  b = await snap(page);
  check('经典一发：一颗子弹就被击毁', !b.player.alive && b.deaths === a.deaths + 1, { alive: b.player.alive, deaths: b.deaths - a.deaths });
  await steps(150); await steps(170);
  for (let k = 0; k < 3; k++) { await page.evaluate(() => { __JK_TEST__.cheat.state().P.shield = 0; }); await cheat('hurt'); await steps(150); await steps(170); }
  await steps(200); await page.waitForTimeout(800); s = await snap(page);
  check('经典模式命数用完 → 失败结算', s.ui.overlay === 'result' && /任务失败/.test(await page.textContent('#res-title')), { overlay: s.ui.overlay, lives: s.lives, mode: s.mode });
  const resExtra = await page.textContent('#res-extra');
  check('结算注明「经典 3 命 · 经典一发」', /经典 3 命/.test(resExtra) && /经典一发/.test(resExtra), resExtra);
  // 复原无限命 + 标准 3 格设置
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');

  // 全屏：F 键请求；无头环境可能被拒绝，但不能崩溃
  await page.evaluate(() => __JK_TEST__.manual(false));
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(600);
  s = await snap(page);
  check('F 键独立请求全屏（成功或被拒绝都有记录且可继续）', s.ui.fsLog.length >= 1, s.ui.fsLog);
  if (s.ui.fs) {
    await page.evaluate(() => document.exitFullscreen());
    s = await waitFor(page, x => x.ui.overlay === 'pause', 5000, 150) || await snap(page);
    check('退出全屏自动暂停', s.ui.overlay === 'pause', s.ui.overlay);
  }
  check('全程无脚本错误', errors.length === 0, errors.slice(0, 5));
  const pass = results.filter(r => r.ok).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  fs.mkdirSync('out', { recursive: true });
  fs.writeFileSync('out/desktop.json', JSON.stringify({ when: new Date().toISOString(), env: 'Playwright ' + require('playwright/package.json').version + ' Chromium headless, SwiftShader（软件渲染）, 1280×720, ?q=low', pass, total: results.length, results, warns: warns.slice(0, 10) }, null, 1));
  await browser.close();
})();

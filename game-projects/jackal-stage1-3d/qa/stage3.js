// 第三关（港口）与 v0.11 开局保护验收（手动时钟 + 测试钩子；按键仍是真实键盘事件）：
// 开局保护（不动时敌人不开火、提示操作、超时后恢复）、第三关开局与连通性、三道闸门与检查点、停着的吉普与藏星、
// 栈桥炮艇、仓库通道炮台、Boss 战舰（靠泊、无敌期、三发扇形炮弹、机枪与手雷都有效、贴码头边够得着北排、击沉结算）、
// 第二关过关后接第三关、主菜单起始关卡可选第三关、手机横屏触屏。
const fs = require('fs');
const { BASE, results, check, snap, launch } = require('./lib');
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';

(async () => {
  const browser = await launch();
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const mk = (pg) => ({
    steps: (n) => pg.evaluate((n) => { let r; for (let i = 0; i < n; i++) r = __JK_TEST__.step(1, false); return r; }, n),
    cheat: (fn, arg) => pg.evaluate(([fn, arg]) => { const c = __JK_TEST__.cheat; return c[fn].apply(null, arg || []); }, [fn, arg]),
    evs: () => pg.evaluate(() => __JK_TEST__.events()),
    place: (x, y, dir) => pg.evaluate(([x, y, dir]) => { const P = __JK_TEST__.cheat.state().P; P.x = x; P.y = y; if (dir !== undefined) { P.dir = dir; P.ang = dir * Math.PI / 4; } __JK_TEST__._cam.snap(x, y); }, [x, y, dir])
  });
  const { steps, cheat, evs, place } = mk(page);

  // ---------- 开局：第三关 ----------
  await page.goto(BASE + '?test=1&seed=3&q=low&stage=3');
  await page.waitForTimeout(1200);
  check('?stage=3 主菜单副标题是「第三关 · 港口」，说明里提到战舰', /第三关 · 港口/.test(await page.textContent('#menu-sub')) && /战舰/.test(await page.textContent('#menu .rules')), await page.textContent('#menu-sub'));
  await page.keyboard.press('Enter');
  await page.evaluate(() => __JK_TEST__.manual(true));
  await steps(130);
  let s = await snap(page);
  check('第三关开局：港口 BGM、4 间俘虏棚、12 名俘虏、HUD 显示「第三关」', s.stage === 3 && s.mode === 'play' && s.ui.music === 'harbor' && s.huts.length === 4 && s.powTotal === 12 && (await page.textContent('#h-stage')) === '第三关', { stage: s.stage, music: s.ui.music, huts: s.huts.length, pow: s.powTotal });
  check('Boss 是战舰（开战前不刷出）', s.boss.type === 'battleship' && s.boss.state === 'idle' && !s.enemies.some(q => q.type === 'ship' || q.type === 'shipgun'), s.boss);
  const reach = await page.evaluate(() => __JK_TEST__.reach());
  check('连通性：停机坪、4 间俘虏棚、12 个检查点、Boss 触发线都开得到', reach.pad && reach.boss && reach.huts.every(h => h.ok) && reach.checkpoints.length === 12 && reach.checkpoints.every(c => c.ok), { pad: reach.pad, boss: reach.boss, bad: reach.huts.concat(reach.checkpoints).filter(q => !q.ok) });
  const count = (t) => s.enemies.filter(q => q.type === t).length;
  check('敌人编制：通道炮台 9 座、固定炮台 14 座、炮艇 5 艘、敌方吉普 3 辆、三道闸门', count('cannon') === 9 && count('turret') === 14 && count('boat') === 5 && count('ejeep') === 3 && s.gates.length === 3, { cannon: count('cannon'), turret: count('turret'), boat: count('boat'), ejeep: count('ejeep'), gates: s.gates.map(g => g.name) });

  // ---------- 开局保护：不动时敌人不开火，2.5 秒后提示操作，10 秒后恢复 ----------
  check('进场后开局保护生效（玩家还没操作）', s.grace && s.grace.on && !s.grace.acted, s.grace);
  await steps(130);
  s = await snap(page);
  check('进场约 3 秒还没动：提示怎么开车开火，并说明敌人暂不开火', /W A S D 开车/.test(s.ui.toast || '') && /敌人不开火/.test(s.ui.toast || ''), s.ui.toast);
  let maxEb = 0;
  for (let k = 0; k < 13; k++) { await steps(30); s = await snap(page); maxEb = Math.max(maxEb, s.ebul); }
  let e = await evs();
  check('保护期内原地不动 9 秒：没有敌弹、没有受击（改动前约 3 秒挨第一枪、8 秒阵亡）', maxEb === 0 && !e.some(q => q.name === 'playerHit' || q.name === 'playerDown') && s.player.armor === 3 && s.grace.on, { maxEb, armor: s.player.armor, grace: s.grace });
  let ge = null;
  for (let k = 0; k < 40 && !(ge && maxEb > 0); k++) { await steps(10); s = await snap(page); maxEb = Math.max(maxEb, s.ebul); ge = (await evs()).find(q => q.name === 'graceEnd'); }
  await cheat('invuln', [999]);   // 后面的检查不再受流弹干扰
  check('一直不动：10 秒后保护按超时结束，敌人开始开火', ge && ge.data.why === 'timeout' && Math.abs(ge.data.after - 10) < 0.2 && maxEb > 0 && !s.grace.on, { ge: ge && ge.data, maxEb });

  // 第一关同样有保护；一操作就结束，并留 1.2 秒缓冲
  const p1 = await context.newPage();
  p1.on('pageerror', x => errors.push('stage1: ' + x.message));
  const t1 = mk(p1);
  await p1.goto(BASE + '?test=1&seed=3&q=low&stage=1');
  await p1.waitForTimeout(1000);
  await p1.keyboard.press('Enter');
  await p1.evaluate(() => __JK_TEST__.manual(true));
  await t1.steps(130 + 360);
  let s1 = await snap(p1), e1 = await t1.evs();
  check('第一关：进场后原地不动 6 秒没有受击', !e1.some(q => q.name === 'playerHit') && s1.player.armor === 3 && s1.grace.on, { armor: s1.player.armor, hits: e1.filter(q => q.name === 'playerHit').length });
  await p1.keyboard.down('KeyW'); await t1.steps(3); await p1.keyboard.up('KeyW');
  s1 = await snap(p1); e1 = await t1.evs();
  const g1 = e1.find(q => q.name === 'graceEnd');
  check('第一次推方向：保护按「已操作」结束，只再留约 1.2 秒', g1 && g1.data.why === 'input' && s1.grace.acted && s1.grace.left <= 1.2 && s1.grace.left > 0.9, { g1: g1 && g1.data, grace: s1.grace });
  await t1.steps(90);
  s1 = await snap(p1);
  check('缓冲过后保护关闭', !s1.grace.on, s1.grace);
  await p1.close();

  // ---------- 闸门与检查点 ----------
  await cheat('invuln', [999]);
  await place(9, 25.5, 0); await steps(3);
  s = await snap(page);
  check('第一道闸门没炸开时，开到门后也不算进入下一个检查点', s.cp === 0 && s.gates.find(g => g.name === '第一道闸门').alive, { cp: s.cp });
  let n0 = (await evs()).length;
  await cheat('destroy', ['第一道闸门']); await steps(3);
  s = await snap(page); e = (await evs()).slice(n0);
  check('炸开第一道闸门后进入检查点「停车场」', s.cp === 1 && e.some(q => q.name === 'checkpoint' && q.data.name === '停车场') && !s.gates.find(g => g.name === '第一道闸门').alive, { cp: s.cp });

  // ---------- 停着的吉普与藏星 ----------
  n0 = (await evs()).length; let sc0 = s.score;
  await cheat('explodeAt', [6, 30.5, 'explosive']); await steps(3);
  s = await snap(page); e = (await evs()).slice(n0);
  check('停车场里停着的吉普可以炸毁（+300 分）', e.some(q => q.name === 'staticDestroyed' && q.data.kind === 'pjeep') && s.score - sc0 >= 300, { ds: s.score - sc0 });
  for (const t of ['soldier', 'officer', 'tank', 'turret']) await cheat('kill', [t]);
  n0 = (await evs()).length;
  await place(15, 180, 0); await cheat('weapon', [1]); await steps(2);
  await page.keyboard.down('KeyK'); await steps(3); await page.keyboard.up('KeyK'); await steps(50);
  s = await snap(page); e = (await evs()).slice(n0);
  const upStar = s.stars.find(q => q.item === 'up');
  check('俘虏棚货场：朝停着的吉普扔手雷，吉普炸毁并露出绿色星', e.some(q => q.name === 'staticDestroyed' && q.data.kind === 'pjeep') && e.some(q => q.name === 'starRevealed' && q.data.item === 'up') && upStar && !upStar.hidden, { ev: e.map(q => q.name), upStar });
  await cheat('armor', [1]);
  await place(15, 187, 0); await steps(4);
  s = await snap(page); e = (await evs()).slice(n0);
  check('开过去拾取绿色星：无限命模式护甲补满', e.some(q => q.name === 'starPicked' && q.data.item === 'up') && s.player.armor === 3, { armor: s.player.armor });
  n0 = (await evs()).length;
  await cheat('explodeAt', [4.5, 285.5, 'explosive']); await steps(2);
  e = (await evs()).slice(n0);
  check('四炮台院子：爆炸把藏着的棕色星炸出来', e.some(q => q.name === 'starRevealed' && q.data.item === 'bomb'), e.map(q => q.name));

  // ---------- 栈桥：炮艇夹击、东桥坦克堵路 ----------
  s = await snap(page);
  const pierTank = (await page.evaluate(() => __JK_TEST__.cheat.state().ents.filter(q => q.alive && q.type === 'tank').map(q => [q.x, q.y, q.hp])));
  check('（上一步清掉了坦克）先确认本关原有 4 辆坦克已被测试清除', pierTank.length === 0, pierTank);
  await place(-11, 152, 0); await steps(5);
  maxEb = 0;
  for (let k = 0; k < 16; k++) { await steps(30); s = await snap(page); maxEb = Math.max(maxEb, s.ebul); }
  check('西栈桥上：两侧海面的炮艇朝吉普开炮', maxEb > 0 && s.enemies.filter(q => q.type === 'boat' && Math.abs(q.y - 152) < 22).length >= 3, { maxEb, boats: s.enemies.filter(q => q.type === 'boat').map(q => [q.x, q.y]) });
  const grid = await page.evaluate(() => __JK_TEST__.grid());
  const cell = (x, y) => grid.cells[Math.floor(y) * grid.cols + Math.floor(x - grid.x0)] === '1';
  check('栈桥两侧和中间水道是海，开不下去；两条桥面各 6 格宽', cell(-15, 150) && cell(-4, 150) && cell(7, 150) && !cell(-11, 150) && !cell(3, 150) && !cell(-13.5, 150) && !cell(-8.5, 150) && !cell(0.5, 150) && !cell(5.5, 150), null);

  // ---------- 仓库通道：炮台在身后开炮 ----------
  await place(7, 219.5, 2); await steps(5);
  maxEb = 0;
  for (let k = 0; k < 14; k++) { await steps(30); s = await snap(page); maxEb = Math.max(maxEb, s.ebul); }
  check('第一条通道：仓库北侧的炮台朝吉普开炮', maxEb > 0 && s.enemies.filter(q => q.type === 'cannon' && Math.abs(q.y - 215.5) < 0.1).length === 3, { maxEb });
  n0 = (await evs()).length;
  await place(7, 220.5, 4); await cheat('weapon', [2]); await steps(2);
  await page.keyboard.down('KeyS'); await steps(2); await page.keyboard.up('KeyS');
  for (let k = 0; k < 3; k++) { await page.keyboard.down('KeyK'); await steps(3); await page.keyboard.up('KeyK'); await steps(28); }
  e = (await evs()).slice(n0);
  check('车头朝南用火箭可以打掉通道里的炮台', e.some(q => q.name === 'kill' && q.data.type === 'cannon'), e.filter(q => q.name === 'kill').map(q => q.data));

  // ---------- Boss：战舰 ----------
  for (const t of ['soldier', 'officer', 'ejeep', 'cannon', 'boat', 'bulltank']) await cheat('kill', [t]);
  await cheat('destroy', ['第二道闸门']); await cheat('destroy', ['第三道闸门']);
  await cheat('bossReady'); await cheat('invuln', [999]); await steps(5);
  n0 = (await evs()).length;
  await page.keyboard.down('KeyW'); await steps(30); await page.keyboard.up('KeyW');
  s = await snap(page);
  const ship0 = s.enemies.find(q => q.type === 'ship');
  check('越过触发线：路障升起，战舰从东面海上开来（还没靠泊）', s.boss.state === 'intro' && ship0 && ship0.x > 5 && s.enemies.filter(q => q.type === 'shipgun').length === 6, { boss: s.boss, shipX: ship0 && ship0.x });
  const gun0 = s.enemies.filter(q => q.type === 'shipgun')[0];
  await cheat('explodeAt', [gun0.x, gun0.y, 'rocket']); await steps(1);
  s = await snap(page);
  check('靠泊过程中炮塔打不坏', s.enemies.filter(q => q.type === 'shipgun').every(q => q.hp === 20), s.enemies.filter(q => q.type === 'shipgun').map(q => q.hp));
  await steps(130);
  s = await snap(page); e = (await evs()).slice(n0);
  const ship = s.enemies.find(q => q.type === 'ship');
  const guns = () => s.enemies.filter(q => q.type === 'shipgun').sort((a, b) => a.x - b.x || a.y - b.y);
  check('战舰靠上码头开战：停在码头正北，6 座炮塔各就各位', s.boss.state === 'fight' && e.some(q => q.name === 'shipDocked') && Math.abs(ship.x + 2) < 0.01 && ship.y === 341 && guns().length === 6 && guns().every(g => g.y > 338 && g.y < 344), { ship, guns: guns().map(g => [g.x, g.y]) });
  check('Boss 音乐、Boss 血条 6 格并提示贴近码头边', s.ui.music === 'boss' && await page.isVisible('#boss-bar') && (await page.$$eval('#boss-bar i', els => els.length)) === 6 && /码头边/.test(await page.textContent('#boss-bar')), s.ui.music);
  let maxShell = 0, warned = false;
  for (let k = 0; k < 30; k++) { await steps(10); s = await snap(page); maxShell = Math.max(maxShell, s.ebul); if (s.enemies.some(q => q.type === 'shipgun' && q.state === 'warn')) warned = true; }
  check('舰炮先闪灯预警，再打出三发扇形炮弹', warned && maxShell >= 3, { warned, maxShell });
  // 机枪有效
  let g = guns().find(q => q.y < 339);   // 南排
  await place(g.x, 329, 0); await steps(2);
  await page.keyboard.down('KeyJ'); await steps(40); await page.keyboard.up('KeyJ'); await steps(30);
  s = await snap(page);
  const gAfter = s.enemies.find(q => q.type === 'shipgun' && q.x === g.x && q.y === g.y);
  check('机枪能打伤舰炮（一发 1 点）', gAfter && gAfter.hp < 20 && gAfter.hp >= 1 && s.boss.pips.includes('hurt'), { before: 20, after: gAfter && gAfter.hp });
  // 手雷：离码头边远了够不着北排，贴边才够得着
  const gn = guns().find(q => q.y > 343);  // 北排
  await cheat('weapon', [1]);
  await place(gn.x + 0.0, 327, 0); await steps(2);
  const hpN0 = s.enemies.find(q => q.type === 'shipgun' && q.x === gn.x && q.y === gn.y).hp;
  await page.evaluate(() => { for (const q of __JK_TEST__.cheat.state().ents) if (q.type === 'shipgun' && q.y < 339) q.noHit = true; });   // 只看北排，暂时让南排不吃伤害
  await page.keyboard.down('KeyK'); await steps(3); await page.keyboard.up('KeyK'); await steps(50);
  s = await snap(page);
  const hpFar = s.enemies.find(q => q.type === 'shipgun' && q.x === gn.x && q.y === gn.y).hp;
  await page.keyboard.down('KeyW'); await steps(60); await page.keyboard.up('KeyW'); await steps(2);
  s = await snap(page);
  const edgeY = s.player.y;
  await page.keyboard.down('KeyK'); await steps(3); await page.keyboard.up('KeyK'); await steps(50);
  s = await snap(page);
  const hpEdge = s.enemies.find(q => q.type === 'shipgun' && q.x === gn.x && q.y === gn.y).hp;
  check('手雷：站得靠后够不着北排炮塔，贴着码头边（开不进海里）才炸得到', hpFar === hpN0 && hpEdge === hpN0 - 4 && edgeY > 333 && edgeY < 333.3, { hpN0, hpFar, hpEdge, edgeY });
  await page.evaluate(() => { for (const q of __JK_TEST__.cheat.state().ents) if (q.type === 'shipgun') q.noHit = false; });
  // 逐座击毁
  n0 = (await evs()).length;
  const first = guns()[0];
  for (let k = 0; k < 5; k++) { await cheat('explodeAt', [first.x, first.y, 'rocket']); await steps(2); }
  s = await snap(page);
  check('5 发爆炸物击毁一座炮塔，血条少一格，残骸留在甲板上冒烟', s.boss.killed === 1 && s.boss.pips.filter(v => v === 'dead').length === 1 && s.kills.shipgun === 1, s.boss);
  for (const q of guns()) for (let k = 0; k < 5; k++) { await cheat('explodeAt', [q.x, q.y, 'rocket']); await steps(2); }
  await steps(10); s = await snap(page); e = (await evs()).slice(n0);
  check('6 座炮塔全毁 → 战舰起火下沉，第三关完成', s.boss.state === 'done' && s.mode === 'clear' && e.some(q => q.name === 'shipSunk') && e.filter(q => q.name === 'shipgunDown').length === 6, s.boss);
  const sink0 = await page.evaluate(() => __JK_TEST__.cheat.state().ents.find(q => q.type === 'ship').sink);
  await steps(120);
  const sink1 = await page.evaluate(() => __JK_TEST__.cheat.state().ents.find(q => q.type === 'ship').sink);
  check('结算前战舰持续下沉', sink1 - sink0 > 1.5, { sink0, sink1 });
  await steps(200); await page.waitForTimeout(600);
  s = await snap(page);
  const resTitle = await page.textContent('#res-title'), resExtra = await page.textContent('#res-extra');
  check('第三关结算：标题、Boss 战舰炮塔击毁数、「已打通目前全部 3 关」、主按钮「从第一关再玩一次」', s.ui.overlay === 'result' && /第三关完成/.test(resTitle) && /Boss 战舰炮塔/.test(await page.textContent('#tally')) && /全部 3 关/.test(resExtra) && (await page.$eval('#res-next', x => x.hidden)) && /从第一关再玩一次/.test(await page.textContent('#res-restart')), { resTitle, resExtra });
  for (const [vw, vh] of [[844, 390], [844, 346], [800, 390]]) {
    await page.setViewportSize({ width: vw, height: vh }); await page.waitForTimeout(300);
    const rfit = await page.evaluate(() => { const p = document.querySelector('#result .panel').getBoundingClientRect(); return { top: Math.round(p.top), bottom: Math.round(p.bottom), left: Math.round(p.left), right: Math.round(p.right), vw: innerWidth, vh: innerHeight, rows: document.querySelectorAll('#tally tr').length }; });
    check('第三关结算面板（' + rfit.rows + ' 行）在 ' + vw + '×' + vh + ' 横屏下完整落在视口内', rfit.top >= 0 && rfit.bottom <= rfit.vh && rfit.left >= 0 && rfit.right <= rfit.vw, rfit);
  }
  await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(200);

  // ---------- 第二关过关后接第三关 ----------
  const p2 = await context.newPage();
  p2.on('pageerror', x => errors.push('stage2: ' + x.message));
  const t2 = mk(p2);
  await p2.goto(BASE + '?test=1&seed=3&q=low&stage=2');
  await p2.waitForTimeout(1000);
  await p2.keyboard.press('Enter');
  await p2.evaluate(() => __JK_TEST__.manual(true));
  await t2.steps(130);
  await t2.cheat('weapon', [3]);
  await t2.cheat('bossReady'); await t2.cheat('invuln', [999]); await t2.steps(5);
  await p2.keyboard.down('KeyW'); await t2.steps(30); await p2.keyboard.up('KeyW'); await t2.steps(140);
  let s2 = await snap(p2);
  for (const q of s2.enemies.filter(z => z.type === 'bust')) for (let k = 0; k < 3; k++) { await t2.cheat('explodeAt', [q.x, q.y, 'rocket']); await t2.steps(2); }
  await t2.steps(330); await p2.waitForTimeout(600);
  s2 = await snap(p2);
  const nextTxt = await p2.textContent('#res-next');
  check('打完第二关：结算主按钮是「进入第三关」', s2.ui.overlay === 'result' && !(await p2.$eval('#res-next', x => x.hidden)) && /进入第三关/.test(nextTxt), { nextTxt });
  await p2.keyboard.press('Enter'); await t2.steps(130);
  s2 = await snap(p2);
  check('进入第三关：武器等级带过来，港口 BGM，保护重新生效', s2.stage === 3 && s2.mode === 'play' && s2.weapon === 3 && s2.ui.music === 'harbor' && s2.grace && s2.grace.on, { stage: s2.stage, weapon: s2.weapon, music: s2.ui.music, grace: s2.grace });
  await p2.close();

  // ---------- 主菜单：起始关卡可直接选第三关 ----------
  const p3 = await context.newPage();
  await p3.goto(BASE + '?test=1&q=low');
  await p3.evaluate(() => { localStorage.removeItem('jk3d-stage1:unlocked'); localStorage.setItem('jk3d-stage1:stage', '1'); });
  await p3.reload(); await p3.waitForTimeout(1200);
  await p3.keyboard.press('ArrowDown'); await p3.keyboard.press('ArrowRight'); await p3.keyboard.press('ArrowRight'); await p3.waitForTimeout(300);
  const st3 = await p3.textContent('#menu [data-opt=stage]'), sub3 = await p3.textContent('#menu-sub');
  check('新玩家（没有通关记录）也能在主菜单把「起始关卡」切到第三关，背景换成港口', /第三关/.test(st3) && /港口/.test(sub3), { st3, sub3 });
  await p3.keyboard.press('ArrowRight'); await p3.waitForTimeout(200);
  check('再按一次回到第一关（共 3 关循环）', /第一关/.test(await p3.textContent('#menu [data-opt=stage]')), await p3.textContent('#menu [data-opt=stage]'));
  await p3.evaluate(() => { localStorage.removeItem('jk3d-stage1:stage'); });
  await p3.close();

  // ---------- 手机：第三关触屏 ----------
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
  const mp = await mctx.newPage();
  mp.on('pageerror', x => errors.push('mobile: ' + x.message));
  await mp.goto(BASE + '?test=1&seed=3&q=low&stage=3');
  await mp.waitForTimeout(1200);
  const st = await mp.locator('#menu [data-act=start]').boundingBox();
  await mp.touchscreen.tap(st.x + st.width / 2, st.y + st.height / 2);
  await mp.evaluate(() => __JK_TEST__.manual(true));
  await mp.evaluate(() => { for (let i = 0; i < 130 + 170; i++) __JK_TEST__.step(1, false); __JK_TEST__.step(1, true); });
  const m0 = await mp.evaluate(() => __JK_TEST__.snapshot());
  check('手机横屏：进场不动约 3 秒，提示「推左下角摇杆开车」', /推左下角摇杆开车/.test(m0.ui.toast || '') && m0.grace.on, m0.ui.toast);
  const joy = await mp.locator('#joy-base').boundingBox();
  const cdp = await mctx.newCDPSession(mp);
  const jx = joy.x + joy.width / 2, jy = joy.y + joy.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: jx + 3, y: jy - 55, id: 1 }] });
  await mp.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await mp.evaluate(() => { for (let i = 0; i < 30; i++) __JK_TEST__.step(1, false); __JK_TEST__.step(1, true); });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const m1 = await mp.evaluate(() => __JK_TEST__.snapshot());
  check('手机横屏：第三关触屏按键显示，摇杆向上开车向北，保护随第一次操作结束', m1.stage === 3 && !m1.ui.touchHidden && m1.player.y - m0.player.y > 2 && m1.grace.acted, { stage: m1.stage, touchHidden: m1.ui.touchHidden, dy: +(m1.player.y - m0.player.y).toFixed(2), grace: m1.grace });
  fs.mkdirSync('out', { recursive: true });
  await mp.screenshot({ path: 'out/stage3-mobile.png' });
  await mctx.close();

  check('全程无脚本错误', errors.length === 0, errors.slice(0, 5));
  const pass = results.filter(r => r.ok).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  fs.writeFileSync('out/stage3.json', JSON.stringify({ when: new Date().toISOString(), env: 'Playwright ' + require('playwright/package.json').version + (process.env.JK_CHANNEL ? ' ' + process.env.JK_CHANNEL : ' Chromium') + (process.env.JK_GPU ? ' 真显卡' : ' SwiftShader') + ', 1280×720 / 844×390 手机模拟, ?q=low', pass, total: results.length, results }, null, 1));
  await browser.close();
  if (pass !== results.length) process.exit(1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });

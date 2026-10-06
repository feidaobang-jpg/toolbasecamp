// 第二关与 v0.3 新机制验收（手动时钟 + 测试钩子；按键仍是真实键盘事件）：
// 四级武器的双向 / 四向溅射、机枪方向选项、满甲修理包提示、三种道具星、水中石像与 Boss 石像防弹、
// 机枪 / 火箭打掉导弹、轰炸机、敌方吉普手雷、倒塌石柱、Boss 石像战与第二关结算、过关解锁起始关卡、手机触屏。
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
  const steps = (n) => page.evaluate((n) => { let r; for (let i = 0; i < n; i++) r = __JK_TEST__.step(1, false); return r; }, n);
  const cheat = (fn, arg) => page.evaluate(([fn, arg]) => { const c = __JK_TEST__.cheat; return c[fn].apply(null, arg || []); }, [fn, arg]);
  const evs = () => page.evaluate(() => __JK_TEST__.events());
  const key = async (code, n) => { await page.keyboard.down(code); if (n) await steps(n); await page.keyboard.up(code); };
  const shrapCount = () => page.evaluate(() => __JK_TEST__.cheat.state().P && __JK_TEST__.snapshot().bombs.filter(b => b === 'shrap').length);

  await page.goto(BASE + '?test=1&seed=3&q=low&stage=2');
  await page.waitForTimeout(1200);
  let s = await snap(page);
  check('?stage=2 主菜单副标题是「第二关 · 废墟城」', /第二关 · 废墟城/.test(await page.textContent('#menu-sub')), await page.textContent('#menu-sub'));
  await page.keyboard.press('Enter');
  await page.evaluate(() => __JK_TEST__.manual(true));
  s = await steps(130); s = await snap(page);
  check('第二关开局：废墟城 BGM、6 座营房、15 名俘虏、HUD 显示「第二关」', s.stage === 2 && s.mode === 'play' && s.ui.music === 'ruins' && s.huts.length === 6 && s.powTotal === 15 && (await page.textContent('#h-stage')) === '第二关', { stage: s.stage, mode: s.mode, music: s.ui.music, huts: s.huts.length, pow: s.powTotal });
  check('Boss 是 4 座石像（开战前不刷出）', s.boss.type === 'statues' && s.boss.state === 'idle', s.boss);

  // ---------- 四级武器：双向 / 四向溅射 ----------
  for (const t of ['soldier', 'tank', 'turret']) await cheat('kill', [t]);
  await cheat('teleport', [0, 14]); await cheat('invuln', [999]);
  await cheat('rocketAt', [0, 26, 3]);
  const sh3 = await shrapCount();
  await steps(30);
  await cheat('rocketAt', [0, 26, 4]);
  const sh4 = await shrapCount();
  await steps(30);
  check('三级「双向火箭」爆炸后向左右溅射 2 发，四级「四向火箭」溅射 4 发', sh3 === 2 && sh4 === 4, { sh3, sh4 });
  await cheat('weapon', [4]);
  let n0 = (await evs()).length;
  await key('KeyK', 2); await steps(40);
  let e = (await evs()).slice(n0);
  const rocketBoom = e.filter(q => q.name === 'kill' || q.name === 'staticDestroyed').length >= 0 && e.some(q => q.name === 'bomb' && q.data.weapon === 4);
  check('四级武器按 K 发射火箭', rocketBoom, e.filter(q => q.name === 'bomb').map(q => q.data));

  // ---------- 机枪方向选项 ----------
  await page.keyboard.down('KeyD'); await steps(3); await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyJ'); await steps(2); s = await snap(page); await page.keyboard.up('KeyJ'); await steps(60);
  const velFollow = s.pbVel;
  await page.keyboard.press('Escape'); await steps(1);
  const pitems = await page.$$eval('#pause .items > *', els => els.map(x => x.getAttribute('data-act') || x.getAttribute('data-opt')));
  for (let k = 0; k < pitems.indexOf('gun'); k++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  const gunTxt = await page.textContent('#pause [data-opt=gun]');
  await page.keyboard.press('Escape'); await steps(1);
  await page.keyboard.down('KeyJ'); await steps(2); s = await snap(page); await page.keyboard.up('KeyJ'); await steps(60);
  const velUp = s.pbVel;
  check('机枪方向：跟随车头时朝东打；暂停菜单切到「原作朝上（原作）」后朝北打', velFollow && velFollow[0] > 20 && velUp && Math.abs(velUp[0]) < 0.01 && velUp[1] > 20 && /原作朝上/.test(gunTxt) && s.settings.gun === 'up', { velFollow, velUp, gunTxt });
  await page.keyboard.press('Escape'); await steps(1);
  for (let k = 0; k < pitems.indexOf('gun'); k++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape'); await steps(1);

  // ---------- 修理包：满甲时提示 ----------
  s = await snap(page);
  await cheat('kitAt', [s.player.x, s.player.y + 2.4]);
  await page.keyboard.down('KeyW'); await steps(14); await page.keyboard.up('KeyW');
  s = await snap(page);
  check('护甲满时开过修理包：提示「护甲已满」，修理包留在原地', s.kits.length === 1 && /护甲已满/.test(s.ui.toast || ''), { kits: s.kits.length, toast: s.ui.toast });

  // ---------- 三种道具星 ----------
  await cheat('weapon', [1]);
  s = await snap(page);
  await cheat('starAt', [s.player.x + 1, s.player.y, 'max']); await steps(3);
  s = await snap(page);
  check('闪光星：武器直接升到四级', s.weapon === 4 && /闪光星/.test(s.banner || ''), { weapon: s.weapon, banner: s.banner });
  await cheat('armor', [1]); let a = await snap(page);
  await cheat('starAt', [a.player.x + 1, a.player.y, 'up']); await steps(3);
  s = await snap(page);
  check('绿色星（无限命模式）：护甲补满 +3000 分', s.player.armor === 3 && s.score - a.score >= 3000 && /绿色星/.test(s.banner || ''), { armor: s.player.armor, ds: s.score - a.score });

  // ---------- 水中石像：防弹、发射导弹、机枪能打掉导弹 ----------
  await cheat('teleport', [-14, 62]); await cheat('invuln', [999]); await steps(5);
  const wsHp = async () => (await snap(page)).enemies.filter(q => q.type === 'wstatue' && q.x < -20).map(q => q.hp)[0];
  const hp0 = await wsHp();
  await page.evaluate(() => { const st = __JK_TEST__.cheat.state(); st.P.dir = 6; });
  await page.keyboard.down('KeyA'); await steps(2); await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyJ'); await steps(60); await page.keyboard.up('KeyJ');
  const hp1 = await wsHp();
  check('水中石像机枪打不动（只吃手雷 / 火箭）', hp0 === 4 && hp1 === 4, { hp0, hp1 });
  n0 = (await evs()).length;
  s = await snap(page);
  await cheat('missileAt', [s.player.x, s.player.y + 9, Math.PI, false]);
  await page.evaluate(() => { __JK_TEST__.cheat.state().P.dir = 0; });
  await page.keyboard.down('KeyW'); await steps(1); await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyJ'); await steps(40); await page.keyboard.up('KeyJ');
  e = (await evs()).slice(n0);
  check('机枪能把迎面飞来的导弹打掉', e.some(q => q.name === 'missileShot'), e.filter(q => q.name === 'missileShot').length);
  await page.evaluate(() => { const w = __JK_TEST__.cheat.state().ents.find(q => q.type === 'wstatue' && q.alive && q.x < -20); __JK_TEST__.cheat.explodeAt(w.x, w.y, 'rocket'); });
  await steps(5);
  check('水中石像一发爆炸物就沉没', !(await snap(page)).enemies.some(q => q.type === 'wstatue' && q.x < -20), null);

  // ---------- 轰炸机：到达触发线后掠过投弹；机枪打不到，火箭能打下 ----------
  n0 = (await evs()).length;
  await cheat('teleport', [-8, 150]); await cheat('invuln', [999]); await steps(2);
  await cheat('teleport', [-20, 152]); await steps(60);
  e = (await evs()).slice(n0);
  s = await snap(page);
  const bomber = s.enemies.find(q => q.type === 'bomber' && q.state === 'fly');
  check('越过触发线：轰炸机从北面飞来', e.some(q => q.name === 'bomberIn') && !!bomber, { ev: e.filter(q => q.name === 'bomberIn').length, bomber });
  let maxArcs = 0;
  for (let k = 0; k < 10; k++) { await steps(5); s = await snap(page); maxArcs = Math.max(maxArcs, (s.arcs || []).length); }
  check('轰炸机沿途投下炸弹（抛物线落地爆炸）', maxArcs > 0, { maxArcs });
  const bm = (await snap(page)).enemies.find(q => q.type === 'bomber' && q.state === 'fly');
  if (bm) { await cheat('rocketAt', [bm.x, bm.y, 2]); await steps(3); }
  check('火箭能打下轰炸机', bm && !(await snap(page)).enemies.some(q => q.type === 'bomber' && q.state === 'fly' && Math.abs(q.y - bm.y) < 6), bm);

  // ---------- 敌方吉普扔手雷 ----------
  await cheat('teleport', [2, 246]); await cheat('invuln', [999]); await steps(5);
  let lobbed = false;
  for (let k = 0; k < 12 && !lobbed; k++) { await steps(20); s = await snap(page); if ((s.arcs || []).length) lobbed = true; }
  check('敌方吉普靠近后抛手雷（抛物线投掷物）', lobbed && s.enemies.some(q => q.type === 'ejeep'), { arcs: s.arcs, jeeps: s.enemies.filter(q => q.type === 'ejeep').length });

  // ---------- 倒塌石柱 ----------
  await cheat('kill', ['ejeep']); await cheat('kill', ['turret']); await cheat('kill', ['soldier']);
  await cheat('teleport', [-5, 249]); await page.evaluate(() => { const st = __JK_TEST__.cheat.state(); st.P.invuln = 0; st.P.shield = 0; st.P.armor = 3; });
  n0 = (await evs()).length;
  await steps(50);
  e = (await evs()).slice(n0);
  s = await snap(page);
  const fp = s.enemies.find(q => q.type === 'fallpillar' && Math.abs(q.y - 254) < 1);
  check('靠近时石柱朝路中倒下，横在路上', e.some(q => q.name === 'pillarFall') && fp && fp.state === 'down', { fall: e.filter(q => q.name === 'pillarFall').length, fp });
  await page.evaluate(() => { __JK_TEST__.cheat.state().P.invuln = 999; });
  await cheat('explodeAt', [-4, 254, 'explosive']); await steps(3);
  check('倒下的石柱一发爆炸物就能炸开', !(await snap(page)).enemies.some(q => q.type === 'fallpillar' && Math.abs(q.y - 254) < 1), null);

  // ---------- Boss：4 座石像 ----------
  await cheat('bossReady'); await steps(5);
  await page.keyboard.down('KeyW'); await steps(30); await page.keyboard.up('KeyW');
  await steps(140);
  s = await snap(page);
  check('进入庭院：路障升起，4 座石像开战', s.boss.state === 'fight' && s.boss.pips.length === 4 && s.enemies.filter(q => q.type === 'bust').length === 4, s.boss);
  check('Boss 音乐与 Boss 血条（4 格）', s.ui.music === 'boss' && await page.isVisible('#boss-bar') && (await page.$$eval('#boss-bar i', els => els.length)) === 4, s.ui.music);
  let fired = false;
  for (let k = 0; k < 10 && !fired; k++) { await steps(30); s = await snap(page); if (s.missiles > 0) fired = true; }
  check('石像眼睛闪光后张嘴发射追踪导弹', fired, s.missiles);
  const bust1 = s.enemies.filter(q => q.type === 'bust').sort((p, q) => p.x - q.x)[0];
  await page.evaluate(([x, y]) => { const st = __JK_TEST__.cheat.state(); st.P.x = x; st.P.y = y; st.P.dir = 0; }, [bust1.x, bust1.y - 6]);
  await page.keyboard.down('KeyJ'); await steps(60); await page.keyboard.up('KeyJ');
  s = await snap(page);
  const b1 = s.enemies.find(q => q.type === 'bust' && q.x === bust1.x);
  check('机枪打不动石像', b1 && b1.hp === 12, b1);
  await cheat('explodeAt', [bust1.x, bust1.y, 'rocket']); await steps(2);
  s = await snap(page);
  const b2 = s.enemies.find(q => q.type === 'bust' && q.x === bust1.x);
  check('爆炸物命中石像扣血（3 发爆炸物击毁一座）', b2 && b2.hp === 8 && s.boss.pips.includes('hurt'), b2);
  for (let k = 0; k < 2; k++) { await cheat('explodeAt', [bust1.x, bust1.y, 'rocket']); await steps(2); }
  s = await snap(page);
  check('第 3 发击毁石像，血条少一格', !s.enemies.some(q => q.type === 'bust' && q.x === bust1.x) && s.boss.killed === 1, s.boss);
  // 其余石像
  for (const q of s.enemies.filter(z => z.type === 'bust')) for (let k = 0; k < 3; k++) { await cheat('explodeAt', [q.x, q.y, 'rocket']); await steps(2); }
  await steps(10); s = await snap(page);
  check('4 座石像全部击毁 → 第二关完成', s.boss.state === 'done' && s.mode === 'clear', s.boss);
  await steps(320); await page.waitForTimeout(600);
  s = await snap(page);
  const resTitle = await page.textContent('#res-title'), resExtra = await page.textContent('#res-extra');
  const nextHidden = await page.$eval('#res-next', x => x.hidden), restartTxt = await page.textContent('#res-restart');
  check('第二关结算：标题、Boss 石像击毁数、「后续关卡制作中」、主按钮「从第一关再玩一次」', s.ui.overlay === 'result' && /第二关完成/.test(resTitle) && /Boss 石像/.test(await page.textContent('#tally')) && /后续关卡制作中/.test(resExtra) && nextHidden && /从第一关再玩一次/.test(restartTxt) && s.ui.focus === 'restart', { resTitle, resExtra, nextHidden, restartTxt, focus: s.ui.focus });
  check('打通最后一关的结算不显示「进入下一关」按钮', !(await page.isVisible('#res-next')));
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(300);
  const rfit = await page.evaluate(() => { const p = document.querySelector('#result .panel').getBoundingClientRect(); return { top: Math.round(p.top), bottom: Math.round(p.bottom), left: Math.round(p.left), right: Math.round(p.right), vw: innerWidth, vh: innerHeight, rows: document.querySelectorAll('#tally tr').length }; });
  check('第二关结算面板在 844×390 横屏下完整落在视口内', rfit.top >= 0 && rfit.bottom <= rfit.vh && rfit.left >= 0 && rfit.right <= rfit.vw, rfit);
  await page.setViewportSize({ width: 1280, height: 720 }); await page.waitForTimeout(300);

  // ---------- 过关解锁：主菜单「起始关卡」可选第二关 ----------
  const p2 = await context.newPage();
  await p2.goto(BASE + '?test=1&q=low');
  await p2.evaluate(() => { localStorage.setItem('jk3d-stage1:unlocked', '2'); localStorage.setItem('jk3d-stage1:stage', '1'); });
  await p2.reload(); await p2.waitForTimeout(1200);
  await p2.keyboard.press('ArrowDown'); await p2.keyboard.press('ArrowRight'); await p2.waitForTimeout(200);
  const st2 = await p2.textContent('#menu [data-opt=stage]'), sub2 = await p2.textContent('#menu-sub');
  check('打通第一关后，主菜单「起始关卡」可以切到第二关，背景换成废墟城', /第二关/.test(st2) && /废墟城/.test(sub2), { st2, sub2 });
  await p2.evaluate(() => { localStorage.removeItem('jk3d-stage1:unlocked'); localStorage.removeItem('jk3d-stage1:stage'); });
  await p2.close();

  // ---------- 手机：第二关触屏 ----------
  const mctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA });
  const mp = await mctx.newPage();
  mp.on('pageerror', x => errors.push('mobile: ' + x.message));
  await mp.goto(BASE + '?test=1&seed=3&q=low&stage=2');
  await mp.waitForTimeout(1200);
  const st = await mp.locator('#menu [data-act=start]').boundingBox();
  await mp.touchscreen.tap(st.x + st.width / 2, st.y + st.height / 2);
  await mp.evaluate(() => __JK_TEST__.manual(true));
  await mp.evaluate(() => { for (let i = 0; i < 130; i++) __JK_TEST__.step(1, false); });
  const joy = await mp.locator('#joy-base').boundingBox();
  const cdp = await mctx.newCDPSession(mp);
  const a0 = await mp.evaluate(() => __JK_TEST__.snapshot());
  const jx = joy.x + joy.width / 2, jy = joy.y + joy.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: jx + 3, y: jy - 55, id: 1 }] });
  await mp.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await mp.evaluate(() => { for (let i = 0; i < 30; i++) __JK_TEST__.step(1, false); __JK_TEST__.step(1, true); });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const a1 = await mp.evaluate(() => __JK_TEST__.snapshot());
  check('手机横屏：第二关触屏按键显示，摇杆向上开车向北', a1.stage === 2 && !a1.ui.touchHidden && a1.player.y - a0.player.y > 2, { stage: a1.stage, touchHidden: a1.ui.touchHidden, dy: +(a1.player.y - a0.player.y).toFixed(2) });
  fs.mkdirSync('out', { recursive: true });
  await mp.screenshot({ path: 'out/stage2-mobile.png' });
  await mctx.close();

  check('全程无脚本错误', errors.length === 0, errors.slice(0, 5));
  const pass = results.filter(r => r.ok).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  fs.writeFileSync('out/stage2.json', JSON.stringify({ when: new Date().toISOString(), env: 'Playwright ' + require('playwright/package.json').version + (process.env.JK_CHANNEL ? ' ' + process.env.JK_CHANNEL : ' Chromium') + (process.env.JK_GPU ? ' 真显卡' : ' SwiftShader') + ', 1280×720 / 844×390 手机模拟, ?q=low', pass, total: results.length, results }, null, 1));
  await browser.close();
})();

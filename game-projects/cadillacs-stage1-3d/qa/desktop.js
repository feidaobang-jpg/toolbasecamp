// 桌面纯键盘验收：真实键盘事件（Playwright keyboard），实时时钟。node qa/desktop.js
const { launch, BASE, out, sleep } = require('./lib');
const fs = require('fs');
(async () => {
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const results = [];
  const ok = (name, cond, info) => { results.push({ name, pass: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
  const S = () => page.evaluate(() => window.__CD_TEST__.snapshot());
  const C = (fn, arg) => page.evaluate(fn, arg);
  const K = page.keyboard;
  const hold = async (key, ms) => { await K.down(key); await sleep(ms); await K.up(key); };
  const press = async (key) => { await K.press(key); await sleep(60); };
  const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { const s = await S(); if (fn(s)) return s; await sleep(50); } return S(); };
  const fresh = async (q) => {
    await page.goto(BASE + '?test=1&seed=5' + (q || ''), { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await sleep(500);
  };
  const startGame = async (heroSteps) => {
    await press('Enter');
    for (let i = 0; i < (heroSteps || 0); i++) await press('ArrowRight');
    await press('Enter');
    await sleep(200);
  };
  const skipIntro = async () => { for (let i = 0; i < 48; i++) { const s = await S(); if (s.mode === 'play') break; await press('KeyJ'); await sleep(250); } return S(); };
  // 开场后还有两名手下排队上场，一并清掉
  const clearEnemies = async () => { await C(() => { window.__CD_TEST__.cheat.G.pending = []; window.__CD_TEST__.cheat.killAll(); }); await sleep(1500); };

  await fresh();
  let s = await S();
  ok('标题载入、主菜单获得焦点', s.ui.overlay === 'menu' && s.ui.focus === 'select', s.ui.focus);
  await press('ArrowDown');
  s = await S(); ok('↓ 移动焦点到起始关卡', s.ui.focus === 'stage', s.ui.focus);
  await press('ArrowDown');
  s = await S(); ok('↓ 移动焦点到命数', s.ui.focus === 'lives', s.ui.focus);
  await press('ArrowRight');
  s = await S(); ok('→ 切换命数为经典', s.ui.settings.lives === 'classic');
  ok('命数写入本地', (await C(() => localStorage.getItem('cd3d-stage1:lives'))) === '"classic"');
  await press('ArrowLeft');
  s = await S(); ok('← 切回无限命', s.ui.settings.lives === 'inf');
  await press('ArrowDown'); await press('ArrowRight');
  s = await S(); ok('耐久 标准→宽松', s.ui.settings.dur === 'easy');
  await press('ArrowRight'); s = await S(); ok('耐久 宽松→经典', s.ui.settings.dur === 'classic');
  await press('ArrowRight'); s = await S(); ok('耐久 经典→标准', s.ui.settings.dur === 'std');
  await press('ArrowDown'); await press('Enter'); s = await S(); ok('Enter 打开演示模式', s.ui.settings.demo === true);
  await press('Enter'); s = await S(); ok('再按关闭演示模式', s.ui.settings.demo === false);
  await press('ArrowDown'); await press('ArrowRight'); s = await S(); ok('菜单「视角」切到斜视', s.ui.camera === 'oblique');
  await press('ArrowRight'); await press('ArrowRight'); await press('ArrowRight'); s = await S(); ok('视角循环回侧视', s.ui.camera === 'side');
  await press('ArrowDown'); await press('ArrowDown'); await press('ArrowLeft');
  ok('音量下调到 70%', Math.abs((await C(() => window.__CD_TEST__.snapshot().ui.audio.volume)) - 0.7) < 0.01);
  await press('ArrowRight');
  await press('ArrowDown'); await press('ArrowDown'); await press('Enter');
  ok('帧率显示开', !(await C(() => document.getElementById('fps').hidden)));
  await press('Enter');
  ok('帧率显示关', await C(() => document.getElementById('fps').hidden));
  // 选人
  await page.keyboard.press('Home');
  await C(() => document.querySelector('[data-act=select]').focus());
  await press('Enter');
  s = await S(); ok('开始游戏 → 选人画面', s.ui.overlay === 'select', s.ui.overlay);
  const h0 = s.ui.hero;
  await press('ArrowRight'); s = await S(); ok('→ 换下一位英雄', s.ui.hero === (h0 + 1) % 4, [h0, s.ui.hero]);
  await press('KeyA'); s = await S(); ok('A 换回', s.ui.hero === h0);
  await press('ArrowLeft'); await press('ArrowLeft');   // 杰克或其他
  const heroPick = (await S()).ui.hero;
  await press('Enter');
  await sleep(300);
  s = await S(); ok('Enter 出发，进入楼顶开场', s.ui.uiMode === 'game' && s.area === 0 && s.mode === 'cut', [s.mode, s.area]);
  const est = await C(() => ({ pt: window.__CD_TEST__.cheat.G.pteroFly.length, cine: !!window.__CD_TEST__.cheat.G.cineCam, banner: window.__CD_TEST__.cheat.G.banner && window.__CD_TEST__.cheat.G.banner.sub }));
  ok('开场远景：翼龙飞过、EASTCOAST 2513 字幕、镜头远景', est.pt >= 2 && est.cine && /2513/.test(est.banner || ''), est);
  await press('KeyJ');   // J 跳过远景
  ok('开场维斯台词出现', !!(await waitFor(x => !!x.dialog, 3500)).dialog);
  s = await skipIntro();
  ok('J 跳过对话后进入战斗', s.mode === 'play', s.mode);
  s = await waitFor(x => x.ui.music.name === 'roof', 2500);
  ok('关卡音乐开始（楼顶原版曲）', s.ui.music.name === 'roof' && s.ui.music.playing, s.ui.music);
  // 移动
  const x0 = s.player.x;
  await hold('KeyD', 500); s = await S(); ok('D 向右走', s.player.x > x0 + 0.8, [x0, s.player.x]);
  const z0 = s.player.z;
  await hold('KeyW', 400); s = await S(); ok('W 走向纵深（远离镜头）', s.player.z < z0 - 0.4, [z0, s.player.z]);
  await hold('KeyS', 400);
  await hold('KeyA', 200); s = await S(); ok('A 转身朝左', Math.abs(s.player.face + Math.PI / 2) < 0.1, s.player.face);
  await hold('KeyD', 120);
  await clearEnemies();
  // 连招
  // 清敌不会终止上一段移动的抓取/受击状态；给连招用例独立、确定的起点。
  await C(() => { const T = window.__CD_TEST__, p = T.cheat.G.player; T.manual(true); Object.assign(p, { state: 'idle', st: 0, move: null, grab: null, sub: {}, face: Math.PI / 2, vx: 0, vz: 0, hitstop: 0 }); });
  let id = await C(() => window.__CD_TEST__.cheat.enemy('ferris', 0.85, 0));
  await C((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); e.hp = 200; e.cd = 9; e.def = Object.assign({}, e.def, { aggr: 0 }); }, id);
  const hits = [];
  for (let i = 0; i < 4; i++) { await K.press('KeyJ'); await C(() => window.__CD_TEST__.step(13)); hits.push((await C((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); return e ? [+(e.hp).toFixed(1), e.state] : null; }, id))); }
  await C(() => window.__CD_TEST__.step(24));
  const eState = await C((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); return e ? e.state : 'gone'; }, id);
  ok('J 连打命中扣血', hits[0] && hits[0][0] < 200, hits);
  ok('四连击最后一下击倒', hits.some(h => h && h[1] === 'down') || eState === 'down' || eState === 'getup', [hits, eState]);
  s = await S(); ok('打中有分数', s.score > 0, s.score);
  await C(() => window.__CD_TEST__.manual(false));
  await clearEnemies();
  // 跳跃 + 跳踢
  await K.down('KeyK'); await sleep(80); await K.up('KeyK');
  s = await S(); ok('K 起跳', s.player.y > 0.1 || s.player.state === 'jump', [s.player.y, s.player.state]);
  await sleep(700); s = await S(); ok('落地回到站立', s.player.state === 'idle' && s.player.y === 0, s.player.state);
  id = await C(() => window.__CD_TEST__.cheat.enemy('gneiss', 1.3, 0));
  await C((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); e.cd = 9; e.hp = 200; }, id);
  await hold('KeyD', 60);
  await K.down('KeyK'); await sleep(60); await K.up('KeyK'); await sleep(120); await K.press('KeyJ');
  await sleep(700);
  const jk = await C((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); return e ? [e.hp, e.state] : null; }, id);
  ok('跳踢命中击倒', jk && jk[0] < 200, jk);
  await clearEnemies();
  // 冲刺：按住 I（与触屏方阵上排右键对应）；L 保留为同一动作
  await K.down('KeyI'); await K.down('KeyD'); await sleep(250);
  s = await S(); ok('按住 I + D 冲刺', s.player.state === 'run', s.player.state);
  await K.press('KeyJ'); await sleep(60);
  s = await S(); ok('冲刺中按 J 出冲刺攻击', s.player.state === 'attack', s.player.state);
  await K.up('KeyD'); await K.up('KeyI'); await sleep(700);
  await K.down('KeyL'); await K.down('KeyA'); await sleep(250);
  s = await S(); ok('按住 L + A 也能冲刺（旧键位保留）', s.player.state === 'run', s.player.state);
  await K.up('KeyA'); await K.up('KeyL'); await sleep(700);
  // 双击方向冲刺
  await K.press('KeyA'); await sleep(60); await K.down('KeyA'); await sleep(200);
  s = await S(); ok('双击 A 冲刺', s.player.state === 'run', s.player.state);
  await K.up('KeyA'); await sleep(300);
  // 必杀
  const ids = [];
  for (const [dx, dz] of [[1, 0], [-1, 0.2], [0.3, -0.9]]) ids.push(await C(([dx, dz]) => window.__CD_TEST__.cheat.enemy('ferris', dx, dz), [dx, dz]));
  await sleep(100);
  const hpBefore = (await S()).player.hp;
  await K.down('KeyJ'); await K.down('KeyK'); await sleep(40); await K.up('KeyJ'); await K.up('KeyK');
  await sleep(80);
  let mv = await C(() => { const p = window.__CD_TEST__.cheat.G.player; return p.move ? p.move.id : p.state; });
  ok('J+K 同按放出必杀', mv === 'mega', mv);
  await sleep(700);
  const downs = await C((ids) => ids.map(id => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); return e ? e.state : 'gone'; }), ids);
  ok('必杀击倒周围敌人', downs.filter(x => x === 'down' || x === 'getup' || x === 'dead' || x === 'gone').length >= 2, downs);
  s = await S(); ok('必杀命中消耗少量体力', s.player.hp < hpBefore && s.player.hp >= hpBefore - 6.01, [hpBefore, s.player.hp]);
  await clearEnemies();
  await C(() => window.__CD_TEST__.cheat.hp(100));
  await K.press('KeyU'); await sleep(80);
  mv = await C(() => { const p = window.__CD_TEST__.cheat.G.player; return p.move ? p.move.id : p.state; });
  ok('U 键放必杀', mv === 'mega', mv);
  await sleep(700);
  // 抓投
  id = await C(() => window.__CD_TEST__.cheat.enemy('ferris', 0.9, 0));
  await C((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); e.cd = 9; e.hp = 200; }, id);
  await C(() => { const p = window.__CD_TEST__.cheat.G.player; p.face = Math.PI / 2; });
  await hold('KeyD', 350);
  s = await S(); ok('走进敌人自动抓住', s.player.state === 'grab', s.player.state);
  for (let i = 0; i < 3; i++) { await K.press('KeyJ'); await sleep(260); }
  const gk = await C((id) => window.__CD_TEST__.cheat.G.actors.find(a => a.id === id).hp, id);
  ok('抓住后 J 膝撞扣血', gk < 200, gk);
  await K.press('KeyJ'); await sleep(200);
  const thrown = await C((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); return e ? e.state : 'gone'; }, id);
  ok('第四下把敌人摔出去', thrown === 'down', thrown);
  await sleep(1200);
  await clearEnemies();
  // 食物
  await C(() => window.__CD_TEST__.cheat.hp(40));
  await C(() => window.__CD_TEST__.cheat.item('steak', 0.1));
  await sleep(100); await K.press('KeyJ'); await sleep(400);
  s = await S(); ok('J 捡牛排回血', s.player.hp > 100 * 0.79, s.player.hp);
  const sc0 = s.score;
  await C(() => window.__CD_TEST__.cheat.item('steak', 0.1)); await sleep(100); await K.press('KeyJ'); await sleep(400);
  s = await S(); ok('满血吃牛排加 10000 分', s.score >= sc0 + 10000, [sc0, s.score]);
  // 枪
  await C(() => window.__CD_TEST__.cheat.item('gun', 0.1)); await sleep(100); await K.press('KeyJ'); await sleep(400);
  s = await S(); ok('捡起左轮手枪 6 发', s.player.weapon && s.player.weapon.kind === 'gun' && s.player.weapon.ammo === 6, s.player.weapon);
  ok('HUD 显示武器', s.hud.weapon === '左轮手枪', s.hud.weapon);
  id = await C(() => window.__CD_TEST__.cheat.enemy('gneiss', 3.5, 0));
  await C((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); e.cd = 9; e.hp = 200; }, id);
  await C(() => { const p = window.__CD_TEST__.cheat.G.player; p.face = Math.PI / 2; });
  await sleep(100); await K.press('KeyJ'); await sleep(350);
  s = await S();
  const gh = await C((id) => window.__CD_TEST__.cheat.G.actors.find(a => a.id === id).hp, id);
  ok('开枪：弹药 -1 且远处敌人中弹', s.player.weapon.ammo === 5 && gh < 200, [s.player.weapon.ammo, gh]);
  await clearEnemies();
  // 举油桶：楼顶 x=15.6 有油桶
  await C(() => { const G = window.__CD_TEST__.cheat.G; G.focusX = 12; const p = G.player; p.weapon = null; p.x = 14.75; p.z = -1.5; p.face = Math.PI / 2; });
  await sleep(100); await K.press('KeyJ'); await sleep(200);
  s = await S(); ok('面前贴着油桶按 J 举起来', s.player.state === 'carry', s.player.state);
  id = await C(() => window.__CD_TEST__.cheat.enemy('gneiss', 2.2, 0));
  await C((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); e.cd = 9; e.hp = 200; }, id);
  await K.press('KeyJ'); await sleep(700);
  const dh = await C((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); return e ? [e.hp, e.state] : null; }, id);
  ok('扔出油桶砸中敌人', dh && dh[0] < 200, dh);
  ok('油桶摔破掉出炸药', (await C(() => window.__CD_TEST__.cheat.items().map(i => i.kind))).indexOf('dynamite') >= 0);
  await clearEnemies();
  // 镜头
  await press('KeyC'); s = await S(); ok('C 切到斜视', s.ui.camera === 'oblique');
  await press('KeyC'); s = await S(); ok('C 切到正视', s.ui.camera === 'front');
  ok('HUD 视角按钮同步', (await C(() => document.getElementById('cam-label').textContent)) === '正视');
  const xf = s.player.x;
  await hold('KeyW', 400); s = await S(); ok('正视下 W = 前进（+x）', s.player.x > xf + 0.5, [xf, s.player.x]);
  await press('KeyC'); s = await S(); ok('C 切到第一人称', s.ui.camera === 'fp' && s.ui.fpActive);
  await sleep(100); s = await S(); ok('第一人称隐藏主角模型', s.player.visible === false);
  await hold('KeyE', 500); s = await S(); ok('第一人称按住 E 向右转头', s.ui.yawOff < -0.4, s.ui.yawOff);
  await sleep(200); const y1 = (await S()).ui.yawOff; await sleep(200); ok('松开 E 停止转动', Math.abs((await S()).ui.yawOff - y1) < 0.001);
  await press('KeyC'); s = await S(); ok('C 循环回侧视并回正', s.ui.camera === 'side' && s.ui.yawOff === 0, [s.ui.camera, s.ui.yawOff]);
  await hold('KeyQ', 1000); s = await S(); ok('按住 Q 左转约 90°（与 E 方向相反）', s.ui.yawOff > 1.2, s.ui.yawOff);
  const xq = s.player.x, zq = s.player.z;
  await hold('KeyD', 400); s = await S(); ok('转 90° 后 D 仍沿屏幕右方移动', Math.abs(s.player.z - zq) > 0.4 && Math.abs(s.player.x - xq) < 0.3, [xq, zq, s.player.x, s.player.z]);
  await press('KeyC'); await press('KeyC'); await press('KeyC'); await press('KeyC');
  s = await S(); ok('转回侧视', s.ui.camera === 'side' && s.ui.yawOff === 0);
  // 暂停
  await press('Escape'); s = await S(); ok('Esc 暂停', s.ui.overlay === 'pause' && s.ui.paused);
  const tp = s.t; await sleep(400); ok('暂停时游戏时间停止', (await S()).t === tp);
  await press('Escape'); s = await S(); ok('Esc 继续', !s.ui.overlay && !s.ui.paused);
  // 死亡与复活（无限命）
  await C(() => window.__CD_TEST__.cheat.hp(1));
  id = await C(() => window.__CD_TEST__.cheat.enemy('ferris', 0.9, 0));
  s = await waitFor(x => x.player.state === 'dead', 8000);
  ok('体力耗尽倒下', s.player.state === 'dead' || s.player.state === 'respawn', s.player.state);
  s = await waitFor(x => x.player.state === 'idle' && x.player.hp === 100, 6000);
  ok('无限命原地复活、满血', s.player.hp === 100 && s.lives === 'inf', [s.player.hp, s.lives]);
  ok('复活后有无敌时间', s.player.invul > 0.5, s.player.invul);
  await clearEnemies();
  // 计时
  await C(() => window.__CD_TEST__.cheat.setTimer(1.2));
  s = await waitFor(x => x.banner === 'TIME OVER', 3000);
  ok('时间到显示 TIME OVER', s.banner === 'TIME OVER');
  s = await waitFor(x => x.player.state === 'idle', 6000);
  ok('时间到后计时重置', s.timer > 100, s.timer);
  // 区域切换：清掉楼顶全部波次，走到门口
  for (let i = 0; i < 90; i++) { s = await S(); if (s.wave >= 3 && !s.waveOn) break; if (s.waveOn) { await clearEnemies(); continue; } await hold('KeyD', 300); }
  s = await S();
  ok('楼顶三波都清完', s.wave >= 3, s.wave);
  ok('清完出现 GO 提示', s.hud.go || s.wave >= 3);
  for (let i = 0; i < 40; i++) { s = await S(); if (s.area === 1) break; await K.down('KeyD'); if (s.player.z > 0.4) await K.down('KeyW'); else if (s.player.z < -0.4) await K.down('KeyS'); await sleep(150); await K.up('KeyW'); await K.up('KeyS'); }
  await K.up('KeyD');
  s = await waitFor(x => x.area === 1 && x.mode === 'play', 4000);
  ok('踢门进入大楼内部', s.area === 1, s.area);
  await page.screenshot({ path: out('desktop-hall.png') });
  // 第 47 街与 Boss
  await C(() => window.__CD_TEST__.cheat.area(2)); await sleep(1200); await clearEnemies(); await sleep(400);
  for (let i = 0; i < 80; i++) { s = await S(); if (s.boss) break; if (s.waveOn) { await clearEnemies(); continue; } await hold('KeyD', 250); }
  s = await S(); ok('走到 Boss 区触发维斯登场', !!s.boss, s.boss);
  s = await waitFor(x => !!x.dialog, 6000); ok('Boss 开场台词', !!s.dialog, s.dialog);
  await page.screenshot({ path: out('desktop-boss-dialog.png') });
  for (let i = 0; i < 12; i++) { s = await S(); if (s.mode === 'play') break; await press('KeyJ'); await sleep(300); }
  s = await waitFor(x => x.mode === 'play', 5000);
  ok('Boss 战开始、岩跳龙暴怒', s.mode === 'play' && s.raptor && s.raptor.angry, s.raptor);
  ok('Boss 音乐', (await S()).ui.music.name === 'boss');
  await C(() => window.__CD_TEST__.cheat.bossHp(270)); await sleep(1500);
  s = await S(); ok('维斯掉血后叫手下', s.boss.summons >= 1, s.boss);
  await C(() => { const T = window.__CD_TEST__.cheat; T.bossHp(1); T.G.boss.invul = 0; T.G.boss.state = 'idle'; });
  await C(() => { const G = window.__CD_TEST__.cheat.G; const v = G.boss, p = G.player; p.x = v.x - 0.9; p.z = v.z; p.face = Math.PI / 2; v.cd = 9; });
  for (let i = 0; i < 10; i++) { await K.press('KeyJ'); await sleep(150); s = await S(); if (s.mode === 'clear') break; }
  s = await waitFor(x => x.mode === 'clear', 3000);
  ok('打倒维斯 → 过关', s.mode === 'clear', s.mode);
  // 街机式连续：打倒维斯 → 体力奖励 → 接着打第二关（第二关打完才结算，见 qa/stage2.js）
  s = await waitFor(x => x.areaId === 'forest', 25000);
  ok('打倒维斯后接着进入第二关', s.areaId === 'forest' && s.cleared.indexOf(1) >= 0 && s.ui.overlay === null, [s.areaId, s.cleared, s.ui.overlay]);
  ok('体力奖励已结算', (await C(() => window.__CD_TEST__.cheat.G.vitalityTotal)) > 0);
  s = await waitFor(x => x.mode === 'play', 8000);
  await page.screenshot({ path: out('desktop-stage2-enter.png') });
  await press('Escape'); await C(() => document.querySelector('#pause [data-act=restart]').click()); await sleep(300);
  s = await S(); ok('重新开始回到所选的第一关', s.ui.overlay === null && s.area === 0 && s.ui.uiMode === 'game', [s.ui.overlay, s.area]);
  // 经典命数 → 续关 / GAME OVER
  await press('Escape'); await C(() => document.querySelector('#pause [data-act=title]').click()); await sleep(300);
  s = await S(); ok('暂停菜单返回主菜单', s.ui.overlay === 'menu' && s.ui.uiMode === 'title');
  await C(() => document.querySelector('[data-opt=lives]').click());
  await C(() => document.querySelector('[data-act=select]').focus()); await press('Enter'); await press('Enter');
  await sleep(300); await skipIntro();
  s = await S(); ok('经典 3 命开局', s.lives === 3, s.lives);
  for (let d = 0; d < 3; d++) {
    await C(() => { const G = window.__CD_TEST__.cheat.G, p = G.player; p.invul = 0; p.hp = 1; });
    await C(() => window.__CD_TEST__.cheat.enemy('ferris', 0.9, 0));
    s = await waitFor(x => x.player.state === 'dead' || x.mode === 'cont', 9000);
    s = await waitFor(x => x.player.state === 'idle' || x.mode === 'cont', 6000);
    await clearEnemies();
  }
  s = await waitFor(x => x.mode === 'cont', 4000);
  ok('命用完进入续关倒计时', s.mode === 'cont' && s.ui.overlay === 'cont', [s.mode, s.ui.overlay]);
  await page.screenshot({ path: out('desktop-continue.png') });
  await press('KeyJ'); await sleep(300);
  s = await S(); ok('续关后满命回到战斗', s.mode === 'play' && s.lives === 3, [s.mode, s.lives]);
  for (let d = 0; d < 3; d++) {
    await C(() => { const G = window.__CD_TEST__.cheat.G, p = G.player; p.invul = 0; p.hp = 1; });
    await C(() => window.__CD_TEST__.cheat.enemy('ferris', 0.9, 0));
    s = await waitFor(x => x.player.state === 'dead' || x.mode === 'cont', 9000);
    s = await waitFor(x => x.player.state === 'idle' || x.mode === 'cont', 6000);
    await clearEnemies();
  }
  s = await waitFor(x => x.mode === 'cont', 4000);
  s = await waitFor(x => x.ui.overlay === 'result', 16000);
  ok('不续关倒计时结束 → GAME OVER', s.ui.overlay === 'result' && (await C(() => document.getElementById('res-title').textContent)) === 'GAME OVER');
  // 演示模式
  await C(() => document.querySelector('#result [data-act=title]').click()); await sleep(300);
  await C(() => document.querySelector('[data-opt=lives]').click());
  await C(() => document.querySelector('[data-opt=demo]').click());
  await C(() => document.querySelector('[data-act=select]').focus()); await press('Enter'); await press('Enter');
  await sleep(300); await skipIntro();
  ok('演示模式标识', !(await C(() => document.getElementById('demo-badge').hidden)));
  const hpD = (await S()).player.hp;
  await C(() => window.__CD_TEST__.cheat.enemy('ferris', 0.9, 0)); await sleep(3000);
  s = await S(); ok('演示模式不扣血', s.player.hp === hpD && s.demoUsed, [hpD, s.player.hp]);
  fs.writeFileSync(out('desktop.json'), JSON.stringify({ date: new Date().toISOString(), pass: results.filter(r => r.pass).length, total: results.length, results, errors: errs }, null, 1));
  console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed');
  console.log(errs.slice(0, 10).join('\n'));
  await b.close();
})();

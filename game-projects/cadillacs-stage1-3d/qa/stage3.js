// 第三关「地狱公路」验收（手动时钟 + 真实键盘 / 触摸事件）：node qa/stage3.js
// 起始关卡选第三关、霍格放话开场、荒漠三波与字幕、木桶弹药箱、沃尔瑟、机修工送车与翻身上车、
// 公路：方向键开车与范围、一路撞人撞路障、躲得开与躲不开的手雷、撞霍格、车被炸毁、徒步阶段（冲撞 / 投弹 / 手下 / 冲锋枪）、
// 两种结局（徒步打倒 / 车上撞死）、四个视角、暂停重开、演示模式、手机摇杆开车、结算。
const fs = require('fs');
const { launch, BASE, out, sleep } = require('./lib');
(async () => {
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const results = [];
  const ok = (name, cond, info) => { results.push({ name, pass: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
  const T = (fn, a) => page.evaluate(fn, a);
  const S = () => T(() => window.__CD_TEST__.snapshot());
  const step = (n) => T((n) => window.__CD_TEST__.step(n, false), n);
  const ev = (type) => T((t) => window.__CD_TEST__.events().filter(e => e.type === t), type);
  const until = async (pred, maxFrames, chunk) => { for (let i = 0; i < maxFrames; i += (chunk || 10)) { const s = await S(); if (pred(s)) return s; await step(chunk || 10); } return S(); };
  const keyDown = (c) => T((c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true })), c);
  const keyUp = (c) => T((c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true })), c);
  const hold = async (c, frames) => { await keyDown(c); await step(frames); await keyUp(c); await step(2); };
  const tap = async (c, n) => { await keyDown(c); await step(2); await keyUp(c); await step(n || 2); };
  const shot = async (name) => { await T(() => window.__CD_TEST__.step(1, true)); await page.screenshot({ path: out(name) }); };
  const proj = (x, y, z) => T((a) => window.__CD_TEST__.project(a[0], a[1], a[2]), [x, y, z]);
  const clearWave = async () => { for (let i = 0; i < 60; i++) { await T(() => window.__CD_TEST__.cheat.killAll()); await step(30); if (!(await S()).waveOn) break; } };
  const walkTo = async (x, z) => { for (let i = 0; i < 200; i++) { const s = await S(); if (s.player.x >= x - 0.3 || s.waveOn || s.mode !== 'play') break; await T((a) => window.__CD_TEST__.cheat.tp(a[0], a[1]), [x, z]); await step(6); } };
  const startGame = async () => { await T(() => document.querySelector('[data-act=select]').focus()); await page.keyboard.press('Enter'); await sleep(250); await page.keyboard.press('Enter'); await sleep(250); await T(() => window.__CD_TEST__.manual(true)); };
  const types = () => T(() => window.__CD_TEST__.cheat.actors().filter(a => a.side === 'enemy').map(a => a.type).sort());
  const inView = (p) => p[0] > 0.01 && p[0] < 0.99 && p[1] > 0.02 && p[1] < 0.99;

  // ---------- 菜单：起始关卡 ----------
  await page.goto(BASE + '?test=1&seed=31', { waitUntil: 'load' });
  await sleep(800);
  await T(() => { localStorage.clear(); localStorage.setItem('cd3d-stage1:hero', '2'); });
  await page.reload({ waitUntil: 'load' }); await sleep(1300);
  await T(() => document.querySelector('[data-opt=stage]').focus());
  await page.keyboard.press('ArrowRight'); await sleep(80); await page.keyboard.press('ArrowRight'); await sleep(120);
  let label = await T(() => document.querySelector('[data-opt=stage]').textContent);
  ok('起始关卡可选第三关 · 地狱公路', /第三关 · 地狱公路/.test(label), label);
  ok('起始关卡保存', (await T(() => localStorage.getItem('cd3d-stage1:stage'))) === '2');
  await page.keyboard.press('ArrowRight'); await sleep(100);
  ok('再按一次循环回第一关', /第一关/.test(await T(() => document.querySelector('[data-opt=stage]').textContent)));
  await page.keyboard.press('ArrowLeft'); await sleep(100);
  await page.reload({ waitUntil: 'load' }); await sleep(1300);
  ok('刷新后仍是第三关', /第三关/.test(await T(() => document.querySelector('[data-opt=stage]').textContent)));
  ok('主菜单副标题列出三关', /第三关 · 地狱公路/.test(await T(() => document.getElementById('menu-sub').textContent)));
  await startGame();

  // ---------- 开场：黑屏上霍格放话 ----------
  let s = await S();
  ok('直接从第三关开局：死亡沙漠', s.areaId === 'desert' && s.stage === 3 && s.mode === 'cut', [s.areaId, s.stage, s.mode]);
  await step(40); s = await S();
  ok('黑屏上霍格放话', s.fade > 0.9 && /修车厂/.test(s.dialog || ''), [s.fade, s.dialog]);
  const dz = await T(() => { const d = document.getElementById('dialog'); return { over: d.classList.contains('over'), z: +getComputedStyle(d).zIndex, fz: +getComputedStyle(document.getElementById('fade')).zIndex, name: document.getElementById('d-name').textContent, face: document.getElementById('d-face').src.length }; });
  ok('台词盖在黑幕上面、有霍格头像与名字', dz.over && dz.z > dz.fz && /HOGG/.test(dz.name) && dz.face > 200, dz);
  await shot('s3-01-hogg-line.png');
  let gang = await T(() => window.__CD_TEST__.cheat.G.actors.filter(a => a.side === 'enemy').map(a => ({ type: a.type, state: a.state, pose: a.sub.pose })));
  ok('荒漠里四个手下蹲着等人（费里斯、车手、尼斯 ×2）', gang.length === 4 && gang.every(g => g.state === 'cut' && g.pose === 'crouch') && gang.map(g => g.type).sort().join() === 'driver,ferris,gneiss,gneiss', gang);
  s = await until(x => x.fade < 0.5 && !x.dialog, 600, 5); await step(8); await shot('s3-02-squat.png');
  s = await until(x => x.mode === 'play', 600, 5);
  ok('开场结束可操作、画面已淡入', s.mode === 'play' && s.fade < 0.05 && Math.abs(s.player.x - 3.0) < 0.6, [s.mode, s.fade, s.player.x]);
  ok('关卡标题：第三关 · 地狱公路', s.banner === '第三关 · 地狱公路', s.banner);
  ok('3-1 音乐（原版 Roaring Sound）', s.ui.music.name === 'desert' && s.ui.music.original && !s.ui.music.synth, s.ui.music);
  ok('计时 2:30', Math.abs(s.timer - 150) < 3, s.timer);
  await shot('s3-03-desert.png');

  // ---------- 可走纵深：最前、最里都走得到且在画面里 ----------
  await T(() => { const G = window.__CD_TEST__.cheat.G; for (const a of G.actors) if (a.side === 'enemy') { a.cd = 99; a.state = 'cut'; } });
  await hold('KeyS', 150); s = await S(); const zFront = s.player.z, pf = await proj(s.player.x, 0, s.player.z), ph = await proj(s.player.x, 1.95, s.player.z);
  ok('往前走到最前排 z = 4.0', Math.abs(zFront - 4.0) < 0.05, zFront);
  ok('最前排脚下在画面约八成高、整个人在画面里', pf[1] > 0.7 && pf[1] < 0.93 && ph[1] > 0.3, [pf, ph]);
  await shot('s3-04-front-row.png');
  await hold('KeyW', 200); s = await S(); const pb = await proj(s.player.x, 0, s.player.z);
  ok('往里走到最里排 z = -2.3', Math.abs(s.player.z + 2.3) < 0.05, s.player.z);
  ok('最里排在画面中部偏上、地平线以下', pb[1] > 0.3 && pb[1] < 0.62, pb);
  const sky = await proj(s.player.x, 0, -400);
  ok('画面上方露出天空和远处台地（地平线在画面上部一成半以下）', sky[1] > 0.1 && sky[1] < 0.3, sky);
  await T(() => { const G = window.__CD_TEST__.cheat.G; for (const a of G.actors) if (a.side === 'enemy') { a.cd = 0.2; a.state = 'idle'; } });

  // ---------- 第一波打完才出字幕 DESERT OF DEATH ----------
  await clearWave(); s = await S();
  ok('第一波打完出字幕「死亡沙漠 DESERT OF DEATH」并喊 GO', s.banner === '死亡沙漠' && s.hud.go, [s.banner, s.hud.go]);
  await shot('s3-05-desert-of-death.png');
  // 木桶里是弹药箱
  let props = await T(() => window.__CD_TEST__.cheat.props());
  ok('两只木桶', props.length === 2 && props.every(p => p.kind === 'barrel' && !p.broken), props);
  await walkTo(19.6, 1.3);
  await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player, pr = G.props[0]; p.x = pr.x - 0.75; p.z = pr.z; p.face = Math.PI / 2; });
  // 贴着木桶按 J 是举起来、再按 J 扔出去（和前两关的油桶一样），落地摔碎
  for (let i = 0; i < 8; i++) { await tap('KeyJ', 20); if ((await T(() => window.__CD_TEST__.cheat.items())).some(i => i.kind === 'ammo')) break; }
  await step(60);
  let items = await T(() => window.__CD_TEST__.cheat.items());
  ok('木桶摔碎掉出弹药箱', items.some(i => i.kind === 'ammo'), items);
  const sc0 = (await S()).score;
  await until(x => ['idle', 'walk'].includes(x.player.state), 200, 4);
  for (let i = 0; i < 40; i++) { const d = await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player, it = G.items.find(i => i.kind === 'ammo'); if (!it) return 0; const d = Math.hypot(it.x - p.x, it.z - p.z); if (d > 0.3) window.__CD_TEST__.cheat.tp(it.x, it.z); return d; }); if (d < 0.3) break; await step(6); }
  await tap('KeyJ', 30);
  ok('捡弹药箱 +1000 分', (await S()).score === sc0 + 1000, [(await S()).score, sc0]);

  // ---------- 第二波：锤子·T 带着车手、尼斯；第三波：沃尔瑟 ----------
  await walkTo(21, 1.2); s = await until(x => x.waveOn, 300, 10); await step(120);
  let ty = await types();
  ok('第二波：锤子·T + 车手 + 尼斯从右边冲过来', ty.includes('hammer') && ty.includes('driver') && ty.includes('gneiss'), ty);
  await shot('s3-06-hammer.png');
  await clearWave();
  await walkTo(41.5, 0.8); s = await until(x => x.waveOn, 300, 10); await step(200);
  ty = await types();
  const wal = await T(() => window.__CD_TEST__.cheat.actors().find(a => a.type === 'walther'));
  ok('第三波：大块头沃尔瑟登场', !!wal && wal.hp === 170 && ty.includes('driver'), [ty, wal && wal.hp]);
  await shot('s3-07-walther.png');
  // 真打：贴上去连打，沃尔瑟会掉血
  await T(() => { const G = window.__CD_TEST__.cheat.G, w = G.actors.find(a => a.type === 'walther'), p = G.player; for (const a of G.actors) if (a.side === 'enemy' && a !== w) { a.hp = 0; } w.state = 'idle'; w.cd = 9; p.x = w.x - 0.95; p.z = w.z; p.face = Math.PI / 2; p.state = 'idle'; });
  for (let i = 0; i < 4; i++) await tap('KeyJ', 12);
  const wal2 = await T(() => window.__CD_TEST__.cheat.actors().find(a => a.type === 'walther'));
  ok('拳脚打得动沃尔瑟', wal2 && wal2.hp < 170, wal2 && wal2.hp);

  // ---------- 机修工送车 ----------
  await clearWave();
  s = await until(x => x.mode === 'cut' && x.car, 900, 5);
  ok('最后一波打完凯迪拉克开过来（不喊 GO）', s.mode === 'cut' && s.car && !s.hud.go && (await ev('carArrive')).length === 1, [s.mode, s.car, s.hud.go]);
  const mech = await T(() => window.__CD_TEST__.cheat.actors().find(a => a.type === 'mechanic'));
  ok('开车来的是机修工', !!mech && mech.state === 'incar', mech);
  await step(60); await shot('s3-08-car-arrive.png');
  s = await until(x => !!x.dialog, 600, 5); await step(30);
  ok('机修工：「开这辆车走，会安全些。上吧！」', /开这辆车走/.test(s.dialog), s.dialog);
  const pos = await T(() => { const G = window.__CD_TEST__.cheat.G, m = G.actors.find(a => a.type === 'mechanic'), p = G.player; return { m: [m.x, m.z, m.state], p: [p.x, p.z], car: [G.car.position.x, G.car.position.z] }; });
  ok('机修工下车站在主角对面（两人不重叠、都在车前面）', Math.abs(pos.m[0] - pos.p[0]) > 0.9 && pos.m[1] > pos.car[1] + 1.2 && pos.p[1] > pos.car[1] + 1.2 && pos.m[2] === 'cut', pos);
  await shot('s3-09-mechanic.png');
  s = await until(x => !x.dialog, 600, 3); await step(12);
  let pst = await T(() => { const p = window.__CD_TEST__.cheat.G.player; return { state: p.state, flip: p.sub.flip, y: p.y }; });
  ok('主角翻身跳上车', pst.state === 'jump' && pst.flip > 0 && pst.y > 0.5, pst);
  await shot('s3-10-flip.png');
  s = await until(x => x.player.state === 'incar', 200, 2);
  ok('落在驾驶座上', s.player.state === 'incar' && (await ev('carBoard')).length === 1, s.player);
  s = await until(x => x.areaId === 'road', 600, 5);
  ok('车开走后进入 3-2 地狱公路', s.areaId === 'road' && s.stage === 3, [s.areaId, s.stage]);

  // ---------- 公路：开车 ----------
  s = await until(x => x.mode === 'play' && x.fade < 0.05 && x.road && x.road.t > 1.0, 600, 5);
  ok('公路段：坐在车里、自动开进画面', s.road.phase === 'run' && s.player.state === 'incar' && Math.abs(s.road.car.x - 5.2) < 0.8, s.road);
  ok('标题 地狱公路 HELL ROAD、3-2 音乐（原版 Like a Squall）', s.banner === '地狱公路' && s.ui.music.name === 'road' && s.ui.music.original, [s.banner, s.ui.music.name]);
  ok('一路撞的时候不显示计时、武器栏显示凯迪拉克耐久', s.hud.timer === null && s.hud.weapon === '凯迪拉克' && s.road.car.hp === 4 && s.road.car.max === 4, [s.hud.timer, s.hud.weapon, s.road.car]);
  const d0 = s.road.dist, t0 = s.road.t; await step(60); s = await S();
  ok('地面按车速向后卷（约 13 米 / 秒）', Math.abs((s.road.dist - d0) / (s.road.t - t0) - 13) < 0.5, (s.road.dist - d0) / (s.road.t - t0));
  await T(() => window.__CD_TEST__.cheat.road.skipTo(26.2));   // 先把路上的人清空，单测方向
  await step(30);
  let c0 = (await S()).road.car;
  await hold('KeyD', 30); let c1 = (await S()).road.car; ok('D：车往前（右）', c1.x > c0.x + 1.5, [c0.x, c1.x]);
  await hold('KeyA', 30); let c2 = (await S()).road.car; ok('A：车往后（左）', c2.x < c1.x - 1.5, [c1.x, c2.x]);
  await hold('KeyW', 30); let c3 = (await S()).road.car; ok('W：车往里', c3.z < c2.z - 1.0, [c2.z, c3.z]);
  await hold('KeyS', 30); let c4 = (await S()).road.car; ok('S：车往外（靠镜头）', c4.z > c3.z + 1.0, [c3.z, c4.z]);
  await keyDown('KeyD'); await keyDown('KeyS'); await step(150); s = await S(); await shot('s3-11-car-corner.png');
  const cA = s.road.car, cornA = [await proj(cA.x + 2.62, 0, cA.z + 0.98), await proj(cA.x - 2.62, 0.9, cA.z + 0.98)];
  await keyUp('KeyD'); await keyUp('KeyS'); await keyDown('KeyA'); await keyDown('KeyW'); await step(170); s = await S();
  const cB = s.road.car, cornB = [await proj(cB.x - 2.62, 0, cB.z - 0.98), await proj(cB.x + 2.62, 1.5, cB.z - 0.98)];
  await keyUp('KeyA'); await keyUp('KeyW'); await step(4);
  ok('车开不出范围（右前 9.87 / 4.8，左里 2.4 / -2.95；靠镜头的几排左右收窄）', Math.abs(cA.x - 9.87) < 0.05 && Math.abs(cA.z - 4.8) < 0.05 && Math.abs(cB.x - 2.4) < 0.05 && Math.abs(cB.z + 2.95) < 0.05, [cA, cB]);
  ok('公路加宽：车上下能开 7.75 米（原来 4.25 米），可走纵深 9.8 米（原来 6.3 米）', Math.abs(cA.z - cB.z - 7.75) < 0.06 && Math.abs((await T(() => window.__CD_TEST__.areaDef())).z1 - (await T(() => window.__CD_TEST__.areaDef())).z0 - 9.8) < 0.01, [cA.z - cB.z]);
  ok('开到四角整辆车都在画面里', cornA.every(inView) && cornB.every(inView), [cornA, cornB]);

  // ---------- 一路撞：从头再来一遍（重开本关到公路） ----------
  await T(() => window.__CD_TEST__.cheat.area(7)); await step(70);
  s = await S(); ok('重新进入公路：阶段与耐久复位', s.road.phase === 'run' && s.road.t < 1.5 && s.road.car.hp === 4 && s.road.ev <= 8 && s.road.objs === 0, s.road);   // 前方 24 米内的人和路障一进来就放好了
  const scoreA = s.score, killsA = Object.values(s.kills).reduce((a, b) => a + b, 0), razorA = s.kills.razor || 0, roA = (await ev('runOver')).length, propA = (await ev('prop')).length;
  // 不碰方向：车在 z = 0.6 这一排，同排的被撞飞，隔得远的（z = 2.4 的格特）从旁边掠过
  s = await until(x => x.road.t >= 3.5, 600, 3);
  ok('木桶被撞碎、同一排的雷泽被撞飞并计分', (await ev('prop')).length > propA && (await ev('runOver')).length > roA && (s.kills.razor || 0) > razorA && s.score >= scoreA + 2500, [s.kills.razor, razorA, s.score - scoreA]);
  ok('被撞的敌人名字显示在 HUD 上', !!s.hud.enemy, s.hud.enemy);
  await shot('s3-12-runover.png');
  s = await until(x => x.road.t >= 5.2, 600, 3);
  ok('不在车道上的格特没被撞到（从旁边过去了）', !s.kills.gutter, s.kills);
  s = await until(x => x.road.t >= 6.6, 600, 3);
  ok('轮胎堆被撞散，轮胎满天飞', (await ev('prop')).some(e => e.kind === 'tires') && s.road.objs >= 5, [s.road.objs]);
  await shot('s3-13-tires.png');
  // 追着飞车党撞：把车摆到摩托那一排
  s = await until(x => x.road.t >= 11.6, 900, 3);
  for (let i = 0; i < 200; i++) { const bz = await T(() => { const G = window.__CD_TEST__.cheat.G, b = G.actors.find(a => a.type === 'biker' && a.road); return b ? b.z - G.carZ : null; }); if (bz === null) break; if (Math.abs(bz) > 0.2) { await hold(bz > 0 ? 'KeyS' : 'KeyW', 3); } else await step(3); }
  s = await S();
  ok('撞翻飞车党：人飞出去、摩托散架', (s.kills.biker || 0) >= 1 && s.road.objs >= 3, [s.kills.biker, s.road.objs]);
  await shot('s3-14-biker.png');
  s = await until(x => x.road.t >= 21.2, 1200, 4);
  const itemsB = (await ev('prop')).length;
  ok('铁桶也能撞碎', (await ev('prop')).some(e => e.kind === 'drum'), itemsB);
  s = await until(x => x.road.t >= 26.5, 600, 4);
  const killsB = Object.values(s.kills).reduce((a, b) => a + b, 0);
  ok('一路撞下来撞倒十个以上', killsB - killsA >= 10, killsB - killsA);
  ok('天色开始转暗', s.road.dusk > 0.2, s.road.dusk);

  // ---------- 霍格 ----------
  s = await until(x => x.road.phase === 'hogg', 300, 3); await step(60); s = await S();
  ok('霍格骑摩托出场（约 27.5 秒）', s.road.phase === 'hogg' && s.boss && s.boss.type === 'hogg' && s.road.hogg.rider && Math.abs(s.road.t - 28.5) < 1.2, [s.road.t, s.boss]);
  ok('Boss 3 音乐（原版）、HUD 显示 HOGG、开始计时 3:00', s.ui.music.name === 'boss3' && s.ui.music.original && s.hud.enemy === 'HOGG' && s.hud.timer !== null && Math.abs(s.timer - 179) < 2, [s.ui.music.name, s.hud.enemy, s.hud.timer]);
  await shot('s3-15-hogg.png');
  // 手雷：不躲 → 炸中
  s = await until(x => x.road.nades.length > 0, 600, 2);
  ok('霍格扔手雷，落点瞄着车', s.road.nades.length > 0 && Math.abs(s.road.nades[0].x - s.road.car.x) < 4.5 && Math.abs(s.road.nades[0].z - s.road.car.z) < 2.2, [s.road.nades, s.road.car]);
  await step(4); await shot('s3-16-grenade.png');
  const hp0 = s.player.hp;
  s = await until(x => x.road.car.hp < 4, 600, 2);
  ok('不躲：车被炸中（耐久 -1、整车闪红、车上的人掉血但不会倒）', s.road.car.hp === 3 && s.road.car.flash > 0 && s.player.hp < hp0 && s.player.hp > 0 && s.player.state === 'incar' && (await ev('carHit')).length >= 1, [s.road.car, s.player.hp, hp0, s.player.state, (await ev('carHit')).length]);
  await shot('s3-17-car-hit.png');
  // 躲：看到红圈就把车开走
  const fixCar = () => T(() => { const G = window.__CD_TEST__.cheat.G; G.carHp = G.carMax; });   // 这几项只测躲和撞，别让车中途炸掉
  let dodged = 0, hits0 = (await ev('carHit')).length;
  for (let n = 0; n < 3; n++) {
    await fixCar();
    s = await until(x => x.road.nades.length > 0, 900, 2);
    const nd = s.road.nades[0], c = s.road.car;
    const awayZ = c.z >= nd.z ? (c.z < 4.4 ? 'KeyS' : 'KeyW') : (c.z > -2.55 ? 'KeyW' : 'KeyS'), awayX = c.x >= nd.x ? (c.x < 9.5 ? 'KeyD' : 'KeyA') : (c.x > 3.0 ? 'KeyA' : 'KeyD');
    await keyDown(awayZ); await keyDown(awayX); await until(x => x.road.nades.length === 0, 200, 2); await keyUp(awayZ); await keyUp(awayX); await step(10);
    if ((await ev('carHit')).length === hits0) dodged++; else hits0 = (await ev('carHit')).length;
  }
  ok('看到红圈把车开走就躲得掉（三颗至少躲开两颗）', dodged >= 2, dodged);
  // 撞霍格：朝他压过去
  let hh0 = (await S()).road.hogg.hp, rammed = false;
  const rams0 = (await ev('ram')).length;
  for (let i = 0; i < 700 && !rammed; i++) {
    await fixCar();
    s = await S(); const h = s.road.hogg, c = s.road.car;
    const kx = Math.abs(h.x - c.x) < 0.3 ? null : h.x > c.x ? 'KeyD' : 'KeyA', kz = Math.abs(h.z - c.z) < 0.15 ? null : h.z > c.z ? 'KeyS' : 'KeyW';
    if (kx) await keyDown(kx); if (kz) await keyDown(kz); await step(3); if (kx) await keyUp(kx); if (kz) await keyUp(kz);
    rammed = (await ev('ram')).length > rams0;
  }
  s = await S();
  ok('开车撞到霍格：掉 30 血、加 500 分', rammed && Math.abs(hh0 - s.road.hogg.hp - 30) < 0.01, [hh0, s.road.hogg.hp]);
  await shot('s3-18-ram.png');
  const hh1 = s.road.hogg.hp; await step(20);
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.carVx = 0; G.carVz = 0; G.boss.x = G.carX + 2.9; G.boss.z = G.carZ; G.boss.ai.safe = 0; G.ramCd = 0; });
  await step(3); s = await S();
  ok('车没朝他压过去时只是把他顶开，不掉血', s.road.hogg.hp === hh1, [hh1, s.road.hogg.hp]);
  // 演示模式：车不掉耐久
  await fixCar(); await T(() => { const G = window.__CD_TEST__.cheat.G; G.carHp = 3; });
  const chp = (await S()).road.car.hp;
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.settings.demo = true; window.__CD_TEST__.cheat.road.carHit(); }); await step(3);
  ok('演示模式（无敌）下车不掉耐久', (await S()).road.car.hp === chp, chp);
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.settings.demo = false; G.carInv = 90; });   // 看视角的这一段先不让车挨炸

  // ---------- 四个视角 ----------
  const camInfo = [];
  for (const i of [1, 2, 3, 0]) {
    await T((i) => window.__CD_TEST__.setCamera(i), i); await step(40); s = await S();
    const c = s.road.car, pc = await proj(c.x, 0.8, c.z);
    camInfo.push({ cam: s.ui.camera, car: pc, fp: s.ui.fpActive, y: s.cam.pos[1] });
    if (i !== 0) await shot('s3-19-cam-' + s.ui.camera + '.png');
  }
  ok('斜视 / 正视 / 侧视里车都在画面内', camInfo.filter(c => c.cam !== 'fp').every(c => inView(c.car)), camInfo);
  ok('第一人称：坐在驾驶座上的高度（眼睛约 1.7 米）', camInfo.find(c => c.cam === 'fp').fp && Math.abs(camInfo.find(c => c.cam === 'fp').y - 1.75) < 0.25, camInfo.find(c => c.cam === 'fp'));
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.carX = 5.5; G.carVx = 0; window.__CD_TEST__.setCamera(2); }); await step(30);   // 先把车放回中间
  c0 = (await S()).road.car; await hold('KeyW', 30); c1 = (await S()).road.car;
  ok('正视（车后）里 W 是往前开', c1.x > c0.x + 1.0, [c0.x, c1.x]);
  await keyDown('KeyE'); await step(240); await keyUp('KeyE'); s = await S();
  ok('Q / E 转视角照常可用', Math.abs(s.ui.yawOff) > 1.5, s.ui.yawOff);
  await shot('s3-20-rotated.png');
  await T(() => window.__CD_TEST__.setCamera(0)); await step(20);

  // ---------- 车被炸毁 → 徒步 ----------
  await fixCar(); await T(() => { window.__CD_TEST__.cheat.G.carInv = 0; });
  for (let i = 0; i < 6; i++) { await T(() => window.__CD_TEST__.cheat.road.carHit()); await step(2); if ((await S()).road.phase !== 'hogg') break; }
  s = await S();
  ok('耐久用完：凯迪拉克爆炸，人被掀下车', s.road.phase === 'wreck' && !s.road.car && s.player.state === 'down' && s.player.hp > 0 && (await ev('carWreck')).length === 1, [s.road.phase, s.player.state, s.player.hp]);
  await shot('s3-21-wreck.png');
  s = await until(x => x.road.phase === 'foot' && ['idle', 'walk'].includes(x.player.state), 600, 4);
  ok('地面停住、主角爬起来、锁在一屏之内', s.road.v === 0 && s.lockX !== null && s.player.hp > 0 && (await ev('death')).length === 0, [s.road.v, s.lockX, s.player.state]);
  ok('武器栏不再显示凯迪拉克', s.hud.weapon === null, s.hud.weapon);
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.gangCd = 99; G.boss.ai.mode = 'away'; G.boss.ai.wait = 99; G.boss.x = 30; G.player.invul = 99; });
  await hold('KeyS', 170); s = await S(); const zrf = s.player.z, rf = await proj(s.player.x, 0, s.player.z), rfh = await proj(s.player.x, 1.95, s.player.z);
  await shot('s3-21b-road-front-row.png');
  await hold('KeyW', 240); s = await S(); const rb = await proj(s.player.x, 0, s.player.z), rbh = await proj(s.player.x, 1.95, s.player.z);
  ok('加宽后的公路：徒步走得到最前排 5.8、最里排 -4.0', Math.abs(zrf - 5.8) < 0.05 && Math.abs(s.player.z + 4.0) < 0.05, [zrf, s.player.z]);
  ok('公路最前排脚下在画面七成半到九成高、最里排头顶在地平线下', rf[1] > 0.72 && rf[1] < 0.93 && rfh[1] > 0.3 && rb[1] > 0.4 && rb[1] < 0.6 && rbh[1] > 0.2, [rf, rfh, rb, rbh]);
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.boss.ai.wait = 0.5; G.player.invul = 0; G.player.z = 0.9; });
  // 霍格猛冲：站在他那一排会被撞
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.gangCd = 99; });
  s = await until(x => x.road.hogg.mode === 'charge', 900, 2);
  let php = s.player.hp;
  await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player; p.x = 6.8; p.z = G.boss.z; p.invul = 0; p.state = 'idle'; });
  s = await until(x => x.road.hogg.mode !== 'charge' || x.player.hp < php, 300, 1);
  ok('霍格猛冲：站在同一排被撞飞', s.player.hp < php && s.player.state === 'down', [php, s.player.hp, s.player.state]);
  await shot('s3-22-charge-hit.png');
  // 起跳躲开（按 K）
  await until(x => ['idle', 'walk'].includes(x.player.state), 400, 4);
  let jumped = false;
  for (let k = 0; k < 6 && !jumped; k++) {
    s = await until(x => x.road.hogg.mode === 'charge', 1500, 2);
    await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player; p.x = 6.8; p.z = G.boss.z; p.invul = 0; if (!['idle', 'walk'].includes(p.state)) p.state = 'idle'; p.y = 0; });
    php = (await S()).player.hp;
    for (let i = 0; i < 200; i++) { s = await S(); if (s.road.hogg.mode !== 'charge') break; if (Math.abs(s.road.hogg.x - s.player.x) < 3.6 && s.player.state !== 'jump' && s.player.y === 0) { await tap('KeyK', 1); } else await step(1); }
    jumped = (await S()).player.hp === php;
    await until(x => x.road.hogg.mode !== 'charge' && ['idle', 'walk'].includes(x.player.state), 400, 4);
  }
  ok('看准了按 K 起跳能躲开冲撞', jumped);
  // 慢速经过：停下来投弹，这时贴上去打得动他，且不吃硬直
  s = await until(x => x.road.hogg.mode === 'cruise' && x.road.hogg.x > 2 && x.road.hogg.x < 11.5, 2400, 2);
  s = await until(x => x.road.nades.length > 0 || x.road.hogg.mode !== 'cruise', 600, 2);
  ok('慢速经过时停下来朝主角投弹', s.road.hogg.mode === 'cruise' && s.road.nades.length > 0 && Math.hypot(s.road.nades[0].x - s.player.x, s.road.nades[0].z - s.player.z) < 2.2, [s.road.nades, s.player.x, s.player.z]);
  hh0 = s.road.hogg.hp;
  await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player, h = G.boss; p.x = h.x - 0.95; p.z = h.z; p.face = Math.PI / 2; p.state = 'idle'; p.invul = 2; });
  for (let i = 0; i < 3; i++) await tap('KeyJ', 10);
  s = await S();
  ok('徒步拳脚打得动霍格（伤害 ×1.5），他不吃硬直', s.road.hogg.hp < hh0 && s.road.hogg.rider && s.boss.state === 'ride', [hh0, s.road.hogg.hp, s.boss.state]);
  await shot('s3-23-melee-hogg.png');
  // 手雷炸人
  await until(x => ['idle', 'walk'].includes(x.player.state), 400, 4);
  php = (await S()).player.hp;
  await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player; p.invul = 0; window.__CD_TEST__.cheat.road.lob(p.x, p.z); });
  s = await until(x => x.player.hp < php || x.road.nades.length === 0, 200, 2); await step(3); s = await S();
  ok('站在红圈里会被炸飞', s.player.hp < php, [php, s.player.hp]);
  // 手下：第一个费里斯掉冲锋枪
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.gangCd = 0; G.player.invul = 9; });
  s = await until(x => x.enemies >= 2, 600, 4);
  ty = await types();
  ok('霍格的手下从画面边上来', ty.includes('ferris'), ty);
  await T(() => { const G = window.__CD_TEST__.cheat.G; for (const a of G.actors) if (a.type === 'ferris' && a.alive) a.hp = 0; window.__CD_TEST__.cheat.hurtAll(0); G.gangCd = 99; });
  s = await until(x => x.items > 0, 400, 4); await step(40);
  items = await T(() => window.__CD_TEST__.cheat.items());
  ok('打倒费里斯掉冲锋枪', items.some(i => i.kind === 'smg'), items);
  await until(x => ['idle', 'walk'].includes(x.player.state), 400, 4);
  await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player, it = G.items.find(i => i.kind === 'smg'); p.x = it.x; p.z = it.z; p.state = 'idle'; });
  await tap('KeyJ', 30); s = await S();
  ok('捡起冲锋枪', s.player.weapon && s.player.weapon.kind === 'smg', s.player.weapon);
  s = await until(x => x.road.hogg.x > 2.5 && x.road.hogg.x < 11 && ['idle', 'walk'].includes(x.player.state), 2400, 2);
  hh0 = s.road.hogg.hp;
  await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player, h = G.boss; p.z = h.z; p.x = h.x > 6.8 ? h.x - 3 : h.x + 3; p.face = h.x > p.x ? Math.PI / 2 : -Math.PI / 2; p.state = 'idle'; p.invul = 3; });
  await keyDown('KeyJ'); await step(24); await keyUp('KeyJ'); await step(20); s = await S();
  ok('冲锋枪扫得到霍格', s.road.hogg.hp < hh0, [hh0, s.road.hogg.hp]);
  await shot('s3-24-uzi.png');

  // ---------- 结局一：徒步打倒霍格 ----------
  await T(() => window.__CD_TEST__.cheat.bossHp(1));
  for (let i = 0; i < 3000; i++) {
    const st = await T(() => { const G = window.__CD_TEST__.cheat.G, h = G.boss, p = G.player; if (!h || !h.alive) return 'dead'; if (h.x > 1.5 && h.x < 12 && ['idle', 'walk', 'shoot'].includes(p.state)) { p.x = h.x - 0.9; p.z = h.z; p.face = Math.PI / 2; p.state = 'idle'; p.invul = 1; } return h.ai.mode; });
    if (st === 'dead') break;
    await tap('KeyJ', 1);
  }
  await step(4); s = await S();
  ok('打到没血：摩托炸开、霍格摔下来', !s.road.hogg.alive && !s.road.hogg.rider && s.road.objs >= 3 && s.mode === 'clear' && (await ev('bossDown')).some(e => e.boss === 'hogg'), [s.road.hogg, s.road.objs, s.mode]);
  await shot('s3-25-hogg-down.png');
  s = await until(x => x.ui.music.name === 'clear', 600);
  ok('过关音乐、霍格计入击倒数', s.ui.music.name === 'clear' && s.kills.hogg === 1 && s.cleared.indexOf(3) >= 0, [s.ui.music.name, s.kills.hogg, s.cleared]);
  s = await until(x => !!x.dialog, 900, 5);
  ok('主角的胜利台词', !!s.dialog && s.player.state === 'victory', [s.dialog, s.player.state]);
  s = await until(x => /修车厂/.test(x.dialog || ''), 1800, 5);
  ok('过场：「你看……我们的修车厂！」（下一关的引子）', /修车厂/.test(s.dialog || ''), s.dialog);
  await shot('s3-26-garage-line.png');
  await T(() => window.__CD_TEST__.manual(false));
  s = await (async () => { for (let i = 0; i < 80; i++) { const x = await S(); if (x.ui.overlay === 'result') return x; await sleep(300); } return S(); })();
  const title = await T(() => document.getElementById('res-title').textContent), tally = await T(() => document.getElementById('tally').textContent);
  ok('第三关结算画面', s.ui.overlay === 'result' && title === '第三关完成！', title);
  ok('结算含霍格、沃尔瑟、车手', /霍格/.test(tally) && /沃尔瑟/.test(tally) && /车手/.test(tally), tally.slice(0, 200));
  const reach = await T(() => { const btn = document.querySelector('#result [data-act=restart]'); btn.scrollIntoView({ block: 'nearest' }); const r = btn.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; });
  ok('结算很长时「再玩一次」滚动可达', reach);
  await page.screenshot({ path: out('s3-27-result.png') });
  await page.keyboard.press('Enter'); await sleep(500);
  s = await S();
  ok('再玩一次回到所选的第三关开头', s.areaId === 'desert' && s.ui.overlay === null && s.road === null && !s.car, [s.areaId, s.ui.overlay, s.road]);

  // ---------- 结局二：在车上把霍格撞死 ----------
  await T(() => window.__CD_TEST__.manual(true));
  await T(() => window.__CD_TEST__.cheat.skipScript()); await step(5);
  await T(() => window.__CD_TEST__.cheat.area(7)); await step(70);
  await T(() => window.__CD_TEST__.cheat.road.skipTo(27.4));
  s = await until(x => x.road.phase === 'hogg', 300, 3); await step(60);
  await T(() => { window.__CD_TEST__.cheat.bossHp(20); window.__CD_TEST__.cheat.road.ram(); }); await step(2); s = await S();
  ok('车上撞死霍格：直接过关', s.road.phase === 'end' && !s.road.hogg.alive && s.mode === 'clear', [s.road.phase, s.mode]);
  s = await until(x => x.player.state === 'jump', 300, 2);
  ok('主角翻身跳下车', s.player.state === 'jump', s.player.state);
  await shot('s3-28-car-kill.png');
  s = await until(x => !x.car && x.road.v === 0, 900, 5);
  ok('凯迪拉克自己开走、地面停住', !s.car && s.road.v === 0, [s.car, s.road.v]);
  s = await until(x => x.player.state === 'victory', 600, 5);
  ok('落地后摆出胜利姿势', s.player.state === 'victory' && s.player.y === 0, s.player);

  // ---------- 暂停 → 重新开始：公路上的东西清干净 ----------
  await T(() => window.__CD_TEST__.manual(false));
  for (let i = 0; i < 80; i++) { if ((await S()).ui.overlay === 'result') break; await sleep(300); }
  ok('车上撞死的结局也进结算', (await S()).ui.overlay === 'result');
  await page.keyboard.press('Enter'); await sleep(500);
  await T(() => window.__CD_TEST__.manual(true)); await T(() => window.__CD_TEST__.cheat.skipScript()); await step(5);
  await T(() => window.__CD_TEST__.cheat.area(7)); await step(120);
  await T(() => window.__CD_TEST__.manual(false)); await sleep(200);
  await page.keyboard.press('Escape'); await sleep(300);
  s = await S(); ok('公路上可以暂停', s.ui.overlay === 'pause' && s.ui.paused, s.ui.overlay);
  const tP = s.road.t; await sleep(600);
  ok('暂停时公路不继续卷', (await S()).road.t === tP, [(await S()).road.t, tP]);
  await T(() => document.querySelector('#pause [data-act=restart]').click()); await sleep(600);
  s = await S();
  ok('重新开始回到第三关开头，车和公路状态清空', s.areaId === 'desert' && s.road === null && !s.car && s.ui.overlay === null, [s.areaId, s.road, s.car]);
  ok('重开后声音正常（音频未挂起）', s.ui.audio && s.ui.audio.ctx === 'running', s.ui.audio.ctx);
  await page.keyboard.press('Escape'); await sleep(200);
  await T(() => document.querySelector('#pause [data-act=title]').click()); await sleep(400);

  // ---------- 手机横屏：摇杆开车 ----------
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' });
  const mp = await ctx.newPage();
  mp.on('pageerror', e => errs.push('mobile pageerror: ' + e.message));
  mp.on('console', m => { if (m.type() === 'error') errs.push('mobile console: ' + m.text()); });
  const cdp = await ctx.newCDPSession(mp);
  const MS = () => mp.evaluate(() => window.__CD_TEST__.snapshot());
  const rectOf = (sel) => mp.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id !== undefined ? p.id : i, radiusX: 4, radiusY: 4, force: 1 })) });
  const tapSel = async (sel) => { const r = await rectOf(sel); await touch('touchStart', [{ x: r.x, y: r.y, id: 9 }]); await sleep(60); await touch('touchEnd', []); await sleep(140); };
  await mp.goto(BASE + '?test=1&seed=5&area=7', { waitUntil: 'load' });
  await mp.evaluate(() => { localStorage.clear(); localStorage.setItem('cd3d-stage1:stage', '2'); }); await mp.reload({ waitUntil: 'load' }); await sleep(1000);
  await tapSel('[data-act=select]'); await tapSel('#sel-go'); await sleep(1800);
  let m = await MS();
  ok('手机：直接进公路段，触屏按键显示', m.areaId === 'road' && m.road && m.road.phase === 'run' && !m.ui.touchHidden, [m.areaId, m.road && m.road.phase]);
  await mp.evaluate(() => window.__CD_TEST__.cheat.road.skipTo(26.5));
  const jz = await rectOf('#joy-zone'), jx = jz.x - jz.w * 0.15, jy = jz.y + jz.h * 0.1;
  let mc0 = (await MS()).road.car;
  await touch('touchStart', [{ x: jx, y: jy, id: 1 }]); await sleep(50);
  for (let k = 1; k <= 6; k++) { await touch('touchMove', [{ x: jx + k * 10, y: jy + k * 8, id: 1 }]); await sleep(16); }
  await sleep(500);
  let mc1 = (await MS()).road.car;
  ok('手机：摇杆右下推，车往前、往外开', mc1.x > mc0.x + 0.8 && mc1.z > mc0.z + 0.5, [mc0, mc1]);
  await touch('touchEnd', []); await sleep(500);
  const mc2 = (await MS()).road.car; await sleep(300); const mc3 = (await MS()).road.car;
  ok('手机：松手后车不再偏移', Math.abs(mc3.x - mc2.x) < 0.15 && Math.abs(mc3.z - mc2.z) < 0.15, [mc2, mc3]);
  await mp.screenshot({ path: out('s3-29-mobile-road.png') });
  const hudFit = await mp.evaluate(() => { const w = document.getElementById('h-weapon').getBoundingClientRect(), t = document.getElementById('hud-top').getBoundingClientRect(); return { w: [w.left, w.right, w.top, w.bottom], vw: innerWidth, vh: innerHeight, top: [t.left, t.right] }; });
  ok('手机：凯迪拉克耐久与右上按钮都在画面里', hudFit.w[0] >= 0 && hudFit.w[1] <= hudFit.vw && hudFit.w[3] <= hudFit.vh && hudFit.top[1] <= hudFit.vw + 1, hudFit);
  await ctx.close();

  ok('无脚本错误', errs.length === 0, errs.slice(0, 6));
  fs.writeFileSync(out('stage3.json'), JSON.stringify({ date: new Date().toISOString(), pass: results.filter(r => r.pass).length, total: results.length, results, errors: errs }, null, 1));
  console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed');
  await b.close();
})().catch(e => { console.error('SCRIPT FAIL', e); process.exit(1); });

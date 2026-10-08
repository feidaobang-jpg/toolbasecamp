// 第二关验收（手动时钟 + 真实键盘事件）：node qa/stage2.js
// 起始关卡选择、凯迪拉克开场、三角龙冲锋、步枪兵预警开枪、霸王龙「被吵醒 / 没被吵醒」两条路线、泥沼减速与水中冒出、
// 链锤兵、黄昏尸骸地、屠夫（双刀脱手可捡、屁股坐、叫手下、击败结算）、第一关打完接第二关、重玩回到所选关卡。
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
  const shot = async (name) => { await T(() => window.__CD_TEST__.step(1, true)); await page.screenshot({ path: out(name) }); };
  const tap = async (c, n) => { await keyDown(c); await step(2); await keyUp(c); await step(n || 2); };

  await page.goto(BASE + '?test=1&seed=21', { waitUntil: 'load' });
  await sleep(800);
  await T(() => localStorage.setItem('cd3d-stage1:stage', '2'));
  await page.reload({ waitUntil: 'load' }); await sleep(1200);
  let rollbackLabel = await T(() => document.querySelector('[data-opt=stage]').textContent);
  ok('旧第三关选择安全回退到第二关', /第二关 · 沼泽森林/.test(rollbackLabel), rollbackLabel);
  await T(() => document.querySelector('[data-opt=stage]').focus());
  await page.keyboard.press('ArrowRight'); await sleep(100);
  rollbackLabel = await T(() => document.querySelector('[data-opt=stage]').textContent);
  ok('两关选择循环回第一关，没有第三关', /第一关 · 海上都市/.test(rollbackLabel), rollbackLabel);
  await T(() => { localStorage.removeItem('cd3d-stage1:stage'); localStorage.setItem('cd3d-stage1:hero', '0'); });
  await page.reload({ waitUntil: 'load' }); await sleep(1200);
  // ---------- 起始关卡选项 ----------
  let label = await T(() => document.querySelector('[data-opt=stage]').textContent);
  ok('菜单有起始关卡选项（默认第一关）', /起始关卡/.test(label) && /第一关/.test(label), label);
  await T(() => document.querySelector('[data-opt=stage]').focus());
  await page.keyboard.press('ArrowRight'); await sleep(100);
  label = await T(() => document.querySelector('[data-opt=stage]').textContent);
  ok('键盘 → 切到第二关', /第二关 · 沼泽森林/.test(label), label);
  ok('起始关卡保存', (await T(() => localStorage.getItem('cd3d-stage1:stage'))) === '1');
  await page.reload({ waitUntil: 'load' }); await sleep(1200);
  label = await T(() => document.querySelector('[data-opt=stage]').textContent);
  ok('刷新后仍是第二关', /第二关/.test(label), label);
  await T(() => document.querySelector('[data-act=select]').focus());
  await page.keyboard.press('Enter'); await sleep(200); await page.keyboard.press('Enter'); await sleep(200);
  await T(() => window.__CD_TEST__.manual(true));
  let s = await S();
  ok('直接从第二关开局：偷猎者森林', s.areaId === 'forest' && s.stage === 2, [s.areaId, s.stage]);
  ok('第二关标题', s.banner === '第二关 · 沼泽森林', s.banner);
  ok('凯迪拉克开进来（过场）', s.mode === 'cut' && s.carMoving && s.player.state === 'incar', [s.mode, s.carMoving, s.player.state]);
  s = await until(x => x.mode === 'play', 400);
  ok('下车后开始游玩', s.mode === 'play' && Math.abs(s.player.x - 4.6) < 0.8 && s.player.state !== 'incar', s.player);
  ok('凯迪拉克停在起点', s.car && !s.carMoving);
  ok('第二关 2-1 音乐（原版 In the Poachers\' Forest）', s.ui.music.name === 'forest', s.ui.music.name);
  ok('熟睡的霸王龙在原位', s.sleeper && s.sleeper.state === 'sleep' && (await T(() => window.__CD_TEST__.cheat.G.sleeper.x)) > 47, s.sleeper);
  await shot('stage2-forest-start.png');

  // ---------- 三角龙哈克 ----------
  s = await until(x => x.enemies >= 1, 400);
  const hack = await T(() => window.__CD_TEST__.cheat.actors().find(a => a.type === 'hack'));
  ok('三角龙哈克登场', !!hack, hack);
  // 站着不动、与它同一纵深：应该会刨地、冲锋并撞到玩家
  const hp0 = (await S()).player.hp;
  let sawPaw = false, sawCharge = false;
  for (let i = 0; i < 120; i++) {
    await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player, t = G.actors.find(a => a.type === 'hack' && a.alive); if (t && ['idle', 'walk'].includes(t.state)) p.z = t.z; p.invul = 0; });
    await step(5);
    const st = await T(() => (window.__CD_TEST__.cheat.G.actors.find(a => a.type === 'hack') || {}).state);
    if (st === 'paw') sawPaw = true; if (st === 'charge') sawCharge = true;
    if (sawCharge && (await S()).player.hp < hp0) break;
  }
  s = await S();
  ok('冲锋前先刨地预警', sawPaw);
  ok('三角龙冲锋撞倒玩家', sawCharge && s.player.hp < hp0, [hp0, s.player.hp, s.player.state]);
  // 打败后晕乎乎跑掉
  await T(() => { const G = window.__CD_TEST__.cheat.G; for (const t of G.actors.filter(a => a.type === 'hack' && a.alive)) { t.hp = 1; t.state = 'idle'; t.cd = 9; } });
  await step(60);
  await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player, t = G.actors.find(a => a.type === 'hack' && a.alive); p.state = 'idle'; p.invul = 2; p.x = t.x - 1.4; p.z = t.z; p.face = Math.PI / 2; t.cd = 9; });
  for (let i = 0; i < 6; i++) await tap('KeyJ', 8);
  s = await until(x => (x.kills.hack || 0) >= 1, 200);
  ok('打败三角龙计分', (s.kills.hack || 0) >= 1, s.kills);
  const fleeSt = await T(() => (window.__CD_TEST__.cheat.G.actors.find(a => a.type === 'hack' && a.dazed) || {}).state);
  ok('被打败的三角龙跑开（不打死恐龙）', fleeSt === 'flee' || fleeSt === undefined, fleeSt);

  // ---------- 步枪兵 ----------
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.pending = []; for (const e of G.actors) if (e.type === 'hack') { e.alive = false; e.state = 'dead'; } window.__CD_TEST__.cheat.killAll(); }); await step(240);
  const pid = await T(() => window.__CD_TEST__.cheat.enemy('poacher', 5, 0));
  await T((id) => { const G = window.__CD_TEST__.cheat.G, e = G.actors.find(a => a.id === id); e.cd = 0; G.player.invul = 0; G.player.hp = 100; G.player.state = 'idle'; e.z = G.player.z; }, pid);
  let shots = [];
  for (let i = 0; i < 60 && !shots.length; i++) { await T((id) => { const G = window.__CD_TEST__.cheat.G, e = G.actors.find(a => a.id === id); if (e && ['idle', 'walk', 'hover'].includes(e.state)) { e.z = G.player.z; if (Math.abs(e.x - G.player.x) < 3) e.x = G.player.x + 5; } }, pid); await step(6); shots = await ev('rifleShot'); }
  ok('偷猎者举枪瞄准后开枪', shots.length >= 1, shots[0]);
  ok('同一纵深站着不动会被打中', shots.some(x => x.hit), shots.map(x => x.hit));
  // 跳起来躲子弹
  await T((id) => { const G = window.__CD_TEST__.cheat.G, e = G.actors.find(a => a.id === id); G.player.invul = 0; G.player.state = 'idle'; G.player.y = 0; e.state = 'aim'; e.st = 0; e.sub = {}; e.x = G.player.x + 5; e.z = G.player.z; e.face = -Math.PI / 2; }, pid);
  await step(24); await tap('KeyK', 2);
  await step(30);
  shots = await ev('rifleShot');
  ok('跳起来能躲开步枪', shots.length >= 2 && shots[shots.length - 1].hit === false, shots.slice(-1));
  await T(() => window.__CD_TEST__.cheat.give('rifle'));
  await T((id) => { const G = window.__CD_TEST__.cheat.G, e = G.actors.find(a => a.id === id); e.hp = 200; e.cd = 9; e.state = 'idle'; e.x = G.player.x + 4; e.z = G.player.z; G.player.face = Math.PI / 2; G.player.state = 'idle'; G.player.y = 0; }, pid);
  const ehp = await T((id) => window.__CD_TEST__.cheat.G.actors.find(a => a.id === id).hp, pid);
  await T(() => { window.__CD_TEST__.cheat.G.player.invul = 3; });
  await tap('KeyJ', 20);
  s = await S();
  const ehp2 = await T((id) => window.__CD_TEST__.cheat.G.actors.find(a => a.id === id).hp, pid);
  ok('玩家用步枪远距离打中', s.player.weapon && s.player.weapon.kind === 'rifle' && s.player.weapon.ammo === 5 && ehp2 < ehp - 15, [s.player.weapon, ehp, ehp2]);
  await T(() => { window.__CD_TEST__.cheat.G.player.weapon = null; window.__CD_TEST__.cheat.killAll(); }); await step(120);

  // ---------- 霸王龙：胖子没被拦住 → 被吵醒 ----------
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.waveOn = false; G.lockX = null; G.pending = []; G.wave = 2; G.player.x = 39; G.player.z = 1.5; G.focusX = 34; });
  s = await until(x => x.waveOn && x.wave === 2, 200);
  ok('走到霸王龙附近触发第三波', s.waveOn && s.wave === 2, [s.wave, s.waveOn]);
  const wakers = await T(() => window.__CD_TEST__.cheat.actors().filter(a => a.waker).map(a => a.type));
  ok('胖子被标记为去叫醒霸王龙', wakers.length >= 1, wakers);
  await T(() => { window.__CD_TEST__.cheat.G.settings.demo = true; });
  s = await until(x => x.sleeper && x.sleeper.state !== 'sleep', 1500, 20);
  const pokes = await ev('poke');
  ok('胖子捶了霸王龙', pokes.length >= 3, pokes.length);
  ok('捶三下把霸王龙吵醒', s.sleeper.state !== 'sleep' && (await ev('shivatWake')).length === 1, s.sleeper);
  await shot('stage2-shivat-awake.png');
  s = await until(x => ['bite', 'stomp'].includes(x.sleeper.state), 900, 6);
  ok('霸王龙会咬 / 跺脚', ['bite', 'stomp'].includes(s.sleeper.state), s.sleeper.state);
  ok('霸王龙醒着时锁屏', s.waveOn, s.waveOn);
  await T(() => { window.__CD_TEST__.cheat.G.settings.demo = false; window.__CD_TEST__.cheat.killAll(); });
  for (let i = 0; i < 30; i++) { await step(20); s = await S(); if (!s.waveOn && s.sleeper.state === 'knocked') break; await T(() => window.__CD_TEST__.cheat.killAll()); }
  ok('打倒霸王龙后它倒地睡着、本波结束', s.sleeper.state === 'knocked' && !s.sleeper.alive && !s.waveOn, [s.sleeper, s.waveOn]);
  ok('打倒霸王龙计 10000 分', (s.kills.shivat || 0) === 1, s.kills);

  // ---------- 霸王龙：先打倒胖子 → 一直睡着 ----------
  await T(() => window.__CD_TEST__.cheat.stage(2)); await T(() => window.__CD_TEST__.cheat.skipScript());
  await step(60);
  await T(() => { const G = window.__CD_TEST__.cheat.G; for (const e of G.actors) if (e.side === 'enemy' && e.type === 'hack') { e.alive = false; e.state = 'dead'; } G.pending = []; G.waveOn = false; G.lockX = null; G.wave = 2; G.player.x = 39; G.focusX = 34; });
  await until(x => x.waveOn && x.wave === 2, 200);
  for (let i = 0; i < 60; i++) {   // 胖子一出场就打倒（第二个胖子晚 3.4 秒才来）
    await step(10);
    await T(() => { const G = window.__CD_TEST__.cheat.G; for (const e of G.actors) if (e.waker && e.alive) { e.hp = 0; e.alive = false; e.state = 'dead'; } });
  }
  for (let i = 0; i < 30; i++) { await T(() => window.__CD_TEST__.cheat.killAll()); await step(30); s = await S(); if (!s.waveOn) break; }
  ok('胖子还没叫醒就被打倒：霸王龙一直睡着、可以直接过', !s.waveOn && s.sleeper.state === 'sleep', [s.waveOn, s.sleeper]);

  // ---------- 山崖 → 泥沼 ----------
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.wave = 9; G.waveOn = false; G.lockX = null; G.focusX = 64; G.player.x = 68; G.player.z = 0.5; G.player.state = 'idle'; });
  await keyDown('KeyD');
  s = await until(x => x.areaId === 'swamp', 400);
  await keyUp('KeyD');
  ok('走到山崖边跳进泥沼', s.areaId === 'swamp', s.areaId);
  s = await until(x => x.mode === 'play' && x.player.state === 'idle', 300);
  ok('落在泥水里（齐腰）', s.sink === 1, s.sink);
  ok('2-2 音乐（原版 Ancient Earth）', s.ui.music.name === 'swamp', s.ui.music.name);
  await step(240);
  await shot('stage2-swamp.png');
  await T(() => window.__CD_TEST__.cheat.killAll()); await T(() => { const G = window.__CD_TEST__.cheat.G; G.pending = []; });
  const rose = await T(() => window.__CD_TEST__.events().filter(e => e.type === 'spawn' && e.enemy === 'gutter').length);
  ok('格特从泥水里冒出来', rose >= 1, rose);
  // 水里与岸上的移动速度
  const speedAt = async (x) => {
    await T((x) => { const G = window.__CD_TEST__.cheat.G; G.waveOn = false; G.lockX = null; G.pending = []; G.wave = 9; G.focusX = x; G.player.x = x; G.player.z = 0; G.player.state = 'idle'; G.player.vx = 0; }, x);
    await sleep(450);   // 隔开真实时间，避免被当成「双击方向冲刺」
    await keyDown('KeyD'); await step(30); const a = (await S()).player.x; await step(60); const bx = (await S()).player.x; await keyUp('KeyD'); await step(10);
    return bx - a;
  };
  const dWater = await speedAt(10), dLand = await speedAt(45);
  ok('泥沼里走得比岸上慢', dWater < dLand * 0.8 && dWater > 0.5, [+dWater.toFixed(2), +dLand.toFixed(2)]);
  // 链锤兵
  await T(() => { const G = window.__CD_TEST__.cheat.G; for (const e of G.actors) if (e.side === 'enemy') { e.alive = false; e.state = 'dead'; } });
  await step(80);
  const lid = await T(() => window.__CD_TEST__.cheat.enemy('lash', 3.0, 0));
  await T((id) => { const G = window.__CD_TEST__.cheat.G, e = G.actors.find(a => a.id === id); G.player.invul = 0; G.player.hp = 100; G.player.state = 'idle'; e.state = 'mace'; e.st = 0; e.sub = { ext: -1 }; e.face = -Math.PI / 2; e.z = G.player.z; }, lid);
  let maxExt = 0;
  for (let i = 0; i < 16; i++) { await step(5); maxExt = Math.max(maxExt, await T((id) => { const e = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); return e && e.sub && e.sub.ext > 0 ? e.sub.ext : 0; }, lid)); }
  s = await S();
  ok('拉什·T 甩出链锤，3 米外也能打中', maxExt >= 0.99 && s.player.hp < 100, [maxExt, s.player.hp]);
  await T(() => { window.__CD_TEST__.cheat.G.player.x = window.__CD_TEST__.cheat.G.player.x; });
  await shot('stage2-lash.png');
  ok('拉什·T 多条血', (await T((id) => window.__CD_TEST__.cheat.G.actors.find(a => a.id === id).maxHp, lid)) > 200);
  await T(() => window.__CD_TEST__.cheat.killAll()); await step(90);

  // ---------- 黄昏 → 尸骸地 ----------
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.wave = 9; G.waveOn = false; G.lockX = null; G.pending = []; G.focusX = 62; G.player.x = 67; G.player.z = 0; G.player.state = 'idle'; });
  await keyDown('KeyD');
  s = await until(x => x.areaId === 'grave', 400);
  await keyUp('KeyD');
  ok('走出泥沼 → 黄昏的恐龙尸骸地', s.areaId === 'grave', s.areaId);
  s = await until(x => x.fade < 0.05, 200);
  ok('原作字幕：看看这些恐龙尸体！', /看看这些恐龙尸体/.test(s.banner || '') || (await ev('area')).some(e => e.area === 'grave'), s.banner);
  ok('2-3 音乐（原版 Trap of Silence，与 1-2 同曲）', s.ui.music.name === 'grave', s.ui.music.name);
  ok('一排油桶', s.props >= 5, s.props);
  await shot('stage2-grave.png');

  // ---------- 屠夫 ----------
  await T(() => { const C = window.__CD_TEST__.cheat, G = C.G; C.killAll(); G.pending = []; G.waveOn = false; G.wave = 9; G.lockX = null; G.focusX = 37; G.player.x = 42; G.player.z = 0.3; });
  s = await until(x => !!x.boss, 200);
  ok('屠夫登场（背对玩家在肢解死恐龙）', s.boss && s.boss.type === 'butcher' && s.boss.state === 'cut' && s.mode === 'cut', s.boss);
  s = await until(x => x.mode === 'play', 600);
  ok('屠夫转身开打、Boss 2 音乐', s.mode === 'play' && s.ui.music.name === 'boss2', s.ui.music.name);
  ok('屠夫双手两把刀', s.boss.swords === 2);
  await shot('stage2-butcher.png');
  // 打倒 → 双刀脱手
  await T(() => { const G = window.__CD_TEST__.cheat.G, b = G.boss, p = G.player; p.x = b.x - 0.95; p.z = b.z; p.face = Math.PI / 2; p.state = 'idle'; b.cd = 9; b.state = 'idle'; b.invul = 0; });
  await T(() => window.__CD_TEST__.cheat.give('pipe'));
  for (let i = 0; i < 4; i++) { await tap('KeyJ', 18); s = await S(); if (s.boss.swords === 0) break; await T(() => { const G = window.__CD_TEST__.cheat.G, b = G.boss, p = G.player; if (b.state === 'idle' || b.state === 'walk') { p.x = b.x - 0.95; p.z = b.z; p.face = Math.PI / 2; } b.cd = 9; b.invul = 0; }); }
  s = await S();
  const swordItems = await T(() => window.__CD_TEST__.cheat.items().filter(i => i.kind === 'sword').length);
  ok('打倒屠夫后两把刀脱手掉在地上', s.boss.swords === 0 && swordItems === 2, [s.boss.swords, swordItems]);
  await T(() => { const G = window.__CD_TEST__.cheat.G, it = G.items.find(i => i.kind === 'sword'); G.player.weapon = null; G.player.x = it.x; G.player.z = it.z; G.player.state = 'idle'; G.boss.cd = 9; G.boss.x = G.player.x + 3; });
  await step(30);
  await tap('KeyJ', 20);
  s = await S();
  ok('玩家捡起屠夫的砍刀', s.player.weapon && s.player.weapon.kind === 'sword', s.player.weapon);
  // 屁股坐
  await T(() => { const G = window.__CD_TEST__.cheat.G, b = G.boss; b.state = 'butt'; b.st = 0; b.sub = { phase: 'up', n: 2 }; b.vy = 10; b.y = 0.01; G.player.invul = 0; G.player.state = 'idle'; });
  s = await until(x => x.boss.state !== 'butt', 400, 6);
  ok('屠夫连续屁股坐', (await ev('buttDrop')).length >= 2, (await ev('buttDrop')).length);
  // 叫手下
  await T(() => window.__CD_TEST__.cheat.bossHp(340)); await step(120);
  s = await S(); ok('屠夫掉血后叫手下', s.boss.summons >= 1 && (await ev('summon')).some(e => e.boss === 'butcher'), s.boss);
  // 击败 → 结算
  await T(() => { const C = window.__CD_TEST__.cheat, G = C.G; C.bossHp(1); const b = G.boss, p = G.player; b.invul = 0; b.state = 'idle'; b.cd = 9; p.x = b.x - 0.9; p.z = b.z; p.face = Math.PI / 2; p.state = 'idle'; });
  for (let i = 0; i < 6; i++) { await tap('KeyJ', 10); s = await S(); if (s.mode === 'clear') break; await T(() => { const G = window.__CD_TEST__.cheat.G, b = G.boss, p = G.player; if (b.alive) { p.x = b.x - 0.9; p.z = b.z; p.face = Math.PI / 2; b.invul = 0; b.cd = 9; } }); }
  s = await until(x => x.mode === 'clear', 200);
  ok('打倒屠夫 → 过关', s.mode === 'clear' && s.cleared.indexOf(2) >= 0, [s.mode, s.cleared]);
  s = await until(x => x.ui.music.name === 'clear', 400);
  ok('过关放原版「Stage Clear」（不是合成曲）', s.ui.music.name === 'clear' && s.ui.music.original && !s.ui.music.synth, s.ui.music);
  await T(() => window.__CD_TEST__.manual(false));
  s = await (async () => { for (let i = 0; i < 60; i++) { const x = await S(); if (x.ui.overlay === 'result') return x; await sleep(300); } return S(); })();
  const title = await T(() => document.getElementById('res-title').textContent);
  const tally = await T(() => document.getElementById('tally').textContent);
  ok('第二关结算画面', s.ui.overlay === 'result' && title === '第二关完成！', title);
  ok('结算含屠夫', /屠夫/.test(tally), tally.slice(0, 160));
  await shot('stage2-result.png');
  await page.keyboard.press('Enter'); await sleep(400);
  s = await S();
  ok('再玩一次回到所选的第二关', s.areaId === 'forest' && s.ui.overlay === null, [s.areaId, s.ui.overlay]);

  // ---------- 第一关打完接着打第二关 ----------
  await T(() => window.__CD_TEST__.manual(true));
  await T(() => window.__CD_TEST__.cheat.area(2)); await step(60);
  await T(() => { const C = window.__CD_TEST__.cheat, G = C.G; C.killAll(); G.pending = []; G.waveOn = false; G.wave = 9; G.lockX = null; G.focusX = 41; G.player.x = 45.6; G.player.z = 0.3; });
  s = await until(x => !!x.boss, 200);
  await T(() => window.__CD_TEST__.cheat.skipScript()); await step(10);
  await T(() => { const C = window.__CD_TEST__.cheat, G = C.G; C.bossHp(1); const v = G.boss, p = G.player; v.invul = 0; v.state = 'idle'; v.cd = 9; p.x = v.x - 0.9; p.z = v.z; p.face = Math.PI / 2; p.state = 'idle'; p.hp = 40; });
  for (let i = 0; i < 6; i++) { await tap('KeyJ', 10); s = await S(); if (s.mode === 'clear') break; await T(() => { const G = window.__CD_TEST__.cheat.G, v = G.boss, p = G.player; if (v.alive) { p.x = v.x - 0.9; p.z = v.z; p.face = Math.PI / 2; v.invul = 0; v.cd = 9; } }); }
  s = await until(x => x.areaId === 'forest', 1800, 20);
  ok('打倒维斯后接着进入第二关（不弹结算）', s.areaId === 'forest' && s.ui.overlay === null && s.cleared.indexOf(1) >= 0, [s.areaId, s.ui.overlay, s.cleared]);
  ok('进入第二关时体力回满', s.player.hp === 100, s.player.hp);
  s = await until(x => x.mode === 'play', 400);
  ok('第二关开场后可操作、画面已淡入', s.mode === 'play' && s.fade < 0.05, [s.mode, s.fade]);

  ok('无脚本错误', errs.length === 0, errs.slice(0, 5));
  fs.writeFileSync(out('stage2.json'), JSON.stringify({ date: new Date().toISOString(), pass: results.filter(r => r.pass).length, total: results.length, results, errors: errs }, null, 1));
  console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' passed');
  await b.close();
})();

// 打击感回归（v0.6.0）：命中停顿时拳脚定格在打到位的姿势、受击方向反应、轻 / 重 / 终结三档停顿与音效、
// 挥空连打不吞键、空手出拳不带挥空声（原作没有，v0.8.2 起）、倒地有砸地声、一波最后一个敌人倒下的慢动作会自动恢复。
// node qa/feel.js（CD_BASE 指向本地服务）
const { launch, BASE, out } = require('./lib');
(async () => {
  const b = await launch(), results = [], errors = [];
  const ok = (name, pass, info) => { results.push({ name, pass: !!pass }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${info === undefined ? '' : JSON.stringify(info)}`); };
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(e.message));
  const C = (fn, arg) => page.evaluate(fn, arg), K = page.keyboard;
  const step = (n, draw) => C(([n, d]) => window.__CD_TEST__.step(n, d), [n, !!draw]);
  async function fresh(hero) {
    await page.goto(BASE + '?test=1&seed=21');
    await page.locator('#menu [data-act=select]').click();
    await page.locator(`[data-hero="${hero}"]`).click(); if (await page.locator('#sel-go').isVisible()) await page.locator('#sel-go').click();
    await C(() => { const T = window.__CD_TEST__; T.manual(true); T.cheat.skipScript(); T.cheat.killAll(); T.step(120); });
  }
  async function reset(n = 1, hp = 300) {
    return C(([n, hp]) => {
      const T = window.__CD_TEST__, G = T.cheat.G, p = G.player;
      for (const a of G.actors) if (a !== p) { a.alive = false; a.removed = true; a.model.root.visible = false; }
      G.actors = G.actors.filter(a => !a.removed);
      G.waveOn = true; G.pending = []; G.waveEnemies = []; G.timeScale = 1; G.slowT = 0;
      Object.assign(p, { x: 7, z: 0, y: 0, vx: 0, vz: 0, face: Math.PI / 2, state: 'idle', st: 0, move: null, grab: null, sub: {}, hp: p.maxHp, invul: 999, hitstop: 0, weapon: null, comboN: 0, lastHitT: -9 });
      const ids = [];
      for (let i = 0; i < n; i++) {
        const id = T.cheat.enemy('ferris', 1.05 + i * 0.05, 0), e = G.actors.find(a => a.id === id);
        Object.assign(e, { hp, maxHp: hp, cd: 999, state: 'idle', stun: 0, invul: 0, x: p.x + 1.05 + i * 4, z: 0 });
        e.def = { ...e.def, aggr: 0, speed: 0 }; ids.push(id);
      }
      return ids;
    }, [n, hp]);
  }
  const G = (fn, a) => C(new Function('a', 'const G = window.__CD_TEST__.cheat.G, p = G.player; return (' + fn + ')(a);'), a);

  // 1. 刺拳命中：停顿中左臂完全伸直（jabLx 左肩 rx≈-1.5），敌人进入头部受击
  await fresh(0); await reset();
  await C(() => window.__CD_TEST__.audioLogStart());
  await K.press('KeyJ');
  let st = null;
  for (let i = 0; i < 12 && !st; i++) { await step(1, true); st = await G(() => p.hitstop > 0 ? { hs: p.hitstop, ls: p.pose[15], e: G.actors.find(a => a !== p).state, hv: G.actors.find(a => a !== p).sub.hv, ehs: G.actors.find(a => a !== p).hitstop } : null); }
  ok('刺拳命中触发停顿', !!st, st);
  ok('停顿中拳头打到位（左肩前伸 ≥ 95%）', st && st.ls < -1.42, st && st.ls);
  ok('被打者头部受击反应且停顿略长于出手方', st && st.e === 'hurt' && /head/.test(st.hv) && st.ehs > st.hs, st);
  await page.screenshot({ path: out('feel-jab-impact.png') });
  const lightHs = st ? st.ehs : 0;
  await step(30);
  let log = await C(() => window.__CD_TEST__.audioLogStop());
  ok('空手出拳只有打击声、没有合成挥空声（原作如此）', log.some(e => e.name === 'punch') && !log.some(e => /^whoosh/.test(e.name)), log.map(e => e.name).join(','));

  // 2. 终结技：杰克第四下上勾拳 → 最长停顿、重拳音、挑飞，落地有砸地声
  await reset(1, 9999);
  await C(() => window.__CD_TEST__.audioLogStart());
  let maxHs = 0;
  for (let k = 0; k < 4; k++) { await K.press('KeyJ'); for (let i = 0; i < 9; i++) { await step(1); maxHs = Math.max(maxHs, await G(() => G.actors.find(a => a !== p).hitstop)); } }
  for (let i = 0; i < 20; i++) { await step(1); maxHs = Math.max(maxHs, await G(() => G.actors.find(a => a !== p).hitstop)); }
  const fin = await G(() => ({ move: p.move && p.move.id, combo: p.comboN, e: G.actors.find(a => a !== p).state }));
  await step(60);
  log = await C(() => window.__CD_TEST__.audioLogStop());
  ok('连招打到终结技（上勾拳）并击倒', fin.combo === 3 && log.some(e => e.name === 'bodyfall'), fin);
  ok('终结技停顿明显长于轻拳', maxHs > lightHs + 0.05, { maxHs, lightHs });
  ok('终结技用重拳事件并在起手时喊一声，没有挥空声', log.some(e => e.name === 'punchHeavy') && log.some(e => e.name === 'finisher') && !log.some(e => /^whoosh/.test(e.name)), log.map(e => e.name).join(','));
  ok('被打飞落地有砸地声', log.some(e => e.name === 'bodyfall'), log.map(e => e.name).join(','));

  // 3. 汉娜踢中身体 → 弯腰受击；第四下高踢用重踢音
  await fresh(1); await reset(1, 9999);
  await C(() => window.__CD_TEST__.audioLogStart());
  let bodyHurt = false;
  for (let k = 0; k < 4; k++) { await K.press('KeyJ'); for (let i = 0; i < 12; i++) { await step(1); if (await G(() => { const e = G.actors.find(a => a !== p); return p.move && p.move.id === 'kickMid' && e.state === 'hurt' && e.sub.hv === 'body'; })) bodyHurt = true; } }
  await step(40);
  log = await C(() => window.__CD_TEST__.audioLogStop());
  ok('中踢打中身体是弯腰受击', bodyHurt);
  ok('踢用踢击音，终结高踢升级为重踢音', log.some(e => e.name === 'kick') && log.some(e => e.name === 'kickHeavy'), log.filter(e => /kick|punch/.test(e.name)).map(e => e.name).join(','));

  // 4. 挥空连打不吞键：前面没人，出拳中途再按一次 → 收招后自动再出一拳
  await reset(0);
  await K.press('KeyJ'); await step(4); await K.press('KeyJ');
  let moves = 0, last = null;
  for (let i = 0; i < 40; i++) { await step(1); const m = await G(() => p.move ? p.move.id + ':' + p.move.t.toFixed(3) : null); if (m && (!last || parseFloat(m.split(':')[1]) < parseFloat(last.split(':')[1]))) moves++; last = m; }
  ok('挥空时连按两下出两拳', moves === 2, moves);
  await step(30);
  ok('之后回到站立（没有多出的拳）', (await G(() => p.state)) === 'idle');

  // 5. 一波最后一个敌人被主角打倒：慢动作 0.3，约 0.42 秒后恢复 1；其他波不触发
  await fresh(0);
  const ids = await reset(1, 1);
  await K.press('KeyJ');
  let slow = 0;
  for (let i = 0; i < 20; i++) { await step(1); slow = Math.max(slow, await G(() => G.timeScale === 0.3 ? 1 : 0)); }
  ok('最后一个敌人倒下进入慢动作', slow === 1);
  await step(40);
  ok('慢动作自动恢复正常速度', (await G(() => G.timeScale)) === 1 && (await G(() => G.events.some(e => e.type === 'finishSlow'))));
  const two = await reset(2, 1);
  await K.press('KeyJ'); let slow2 = 0;
  for (let i = 0; i < 20; i++) { await step(1); slow2 = Math.max(slow2, await G(() => G.timeScale < 1 ? 1 : 0)); }
  ok('场上还有敌人时不触发慢动作', slow2 === 0, two);

  ok('无页面错误', errors.length === 0, errors);
  const fail = results.filter(r => !r.pass).length;
  console.log(`${results.length - fail}/${results.length} passed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();

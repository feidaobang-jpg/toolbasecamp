// 枪口与子弹回归：火花在枪模型的枪管前端；开枪后有子弹拖光飞出去；子弹飞到才掉血。
// 覆盖玩家手枪 / 冲锋枪 / 霰弹枪 / 步枪（朝右、朝左）、火箭筒火花，偷猎者步枪、维斯左轮。
// node qa/guns.js   结果写 qa/out/guns.json
const { launch, BASE, out, sleep } = require('./lib');
const fs = require('fs');
const results = [];
const check = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log((pass ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(info)); };
(async () => {
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '?test=1&clean=1&seed=4', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cd3d-stage1:hero', '0'); });
  await page.reload({ waitUntil: 'load' }); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(400); await page.keyboard.press('Enter'); await sleep(600);
  await page.evaluate(() => window.__CD_TEST__.manual(true));
  const T = (fn, a) => page.evaluate(fn, a);
  // 枪模型在世界里的包围盒：返回到枪口的距离、枪口在朝向上是否在最前端
  const muzzleCheck = (id) => T((id) => {
    const G = window.__CD_TEST__.cheat.G, a = G.actors.find(x => x.id === id), s = G.lastShot;
    const m = a.gunMesh && a.gunMesh.visible ? a.gunMesh : a.wmesh;
    if (!s || !m) return { ok: false, s, mesh: !!m };
    m.updateMatrixWorld(true); const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const e = m.matrixWorld.elements, bb = g.boundingBox, pts = [];
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) pts.push([e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]);
    const lo = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i]))), hi = [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])));
    const q = s.muzzle, d = Math.hypot(...[0, 1, 2].map(i => Math.max(lo[i] - q[i], 0, q[i] - hi[i])));
    const fx = Math.sin(a.face), fz = Math.cos(a.face), proj = (p) => p[0] * fx + p[2] * fz;
    const front = Math.max(...pts.map(proj));
    return { ok: true, id: s.id, kind: s.kind, dist: +d.toFixed(3), behindFront: +(front - proj(q)).toFixed(3), ends: s.ends.length };
  }, id);
  const setup = (area, foe, dx, face) => T(([area, foe, dx, face]) => {
    const t = window.__CD_TEST__, C = t.cheat, G = C.G; C.area(area); C.skipScript(); t.step(5, false);
    for (const e of G.actors) if (e !== G.player && e.type !== 'shivat') { e.alive = false; e.removed = true; e.model.root.visible = false; e.blob.visible = false; }
    G.pending = []; G.waveOn = false; G.wave = 99; G.lockX = 30; G.focusX = 30; G.mode = 'play'; G.script = null; G.lastShot = null;
    const p = G.player; p.x = 30; p.z = 0.5; p.y = 0; p.vx = p.vz = 0; p.face = face; p.state = 'idle'; p.st = 0; p.sub = {}; p.invul = 0; p.hp = 100;
    const id = C.enemy(foe, dx, 0); const e = G.actors.find(a => a.id === id); e.face = face + Math.PI; e.cd = 99; e.state = 'idle'; e.hp = 9999; e.invul = 0;
    t.step(10, true); return id;
  }, [area, foe, dx, face]);
  const hp = (id) => T((id) => window.__CD_TEST__.cheat.G.actors.find(a => a.id === id).hp, id);
  const playerHp = () => T(() => window.__CD_TEST__.cheat.G.player.hp);
  const tracers = () => T(() => window.__CD_TEST__.fx().tracers);
  const step = (n) => T((n) => window.__CD_TEST__.step(n, true), n);

  for (const [kind, face, tag] of [['gun', Math.PI / 2, '朝右'], ['smg', Math.PI / 2, '朝右'], ['shotgun', Math.PI / 2, '朝右'], ['rifle', Math.PI / 2, '朝右'], ['gun', -Math.PI / 2, '朝左'], ['rifle', -Math.PI / 2, '朝左']]) {
    const dx = face > 0 ? 4.5 : -4.5;
    const id = await setup(2, 'thug', dx, face);
    await T((k) => { window.__CD_TEST__.cheat.give(k, 30); window.__CD_TEST__.step(15, true); }, kind);
    const h0 = await hp(id);
    await page.keyboard.down('KeyJ'); await step(1); await page.keyboard.up('KeyJ');
    const pid = await T(() => window.__CD_TEST__.cheat.G.player.id);
    const m = await muzzleCheck(pid);
    check(kind + tag + '：火花在枪管前端', m.ok && m.id === pid && m.kind === kind && m.dist < 0.06 && m.behindFront < 0.1, m);
    check(kind + tag + '：开枪后有子弹飞出去', (await tracers()) >= 1, null);
    const h1 = await hp(id);
    check(kind + tag + '：扣扳机那一帧还没掉血（子弹在飞）', h1 === h0, [h0, h1]);
    await step(14);
    const h2 = await hp(id);
    check(kind + tag + '：子弹飞到后掉血', h2 < h0, [h0, h2]);
    await step(30);
    check(kind + tag + '：子弹拖光消失', (await tracers()) === 0, null);
  }
  // 火箭筒：只有火花，火箭本身是飞行道具
  await setup(2, 'thug', 6, Math.PI / 2);
  await T(() => { window.__CD_TEST__.cheat.give('bazooka', 3); window.__CD_TEST__.step(15, true); });
  await page.keyboard.down('KeyJ'); await step(1); await page.keyboard.up('KeyJ');
  { const pid = await T(() => window.__CD_TEST__.cheat.G.player.id); const m = await muzzleCheck(pid); check('火箭筒：火花在炮管前端', m.ok && m.kind === 'bazooka' && m.dist < 0.08 && m.behindFront < 0.12, m); }
  // 敌人开枪
  for (const [area, foe] of [[3, 'poacher'], [2, 'vice']]) {
    const id = await setup(area, foe, 5, Math.PI / 2);
    await T(() => { window.__CD_TEST__.cheat.G.player.weapon = null; });
    const ph0 = await playerHp();
    const ok = await T((id) => window.__CD_TEST__.cheat.shoot(id), id);
    await step(2);
    const m = await muzzleCheck(id);
    check(foe + '：开枪火花在枪管前端', ok && m.ok && m.id === id && m.dist < 0.06 && m.behindFront < 0.1, m);
    check(foe + '：子弹飞向主角', (await tracers()) >= 1, null);
    const ph1 = await playerHp();
    check(foe + '：开枪那一刻主角还没掉血', ph1 === ph0, [ph0, ph1]);
    await step(16);
    const ph2 = await playerHp();
    check(foe + '：子弹飞到后主角掉血', ph2 < ph0, [ph0, ph2]);
    if (foe === 'vice') check('维斯开枪时手里有左轮', await T((id) => { const v = window.__CD_TEST__.cheat.G.actors.find(a => a.id === id); return !!v.gunMesh; }, id), null);
  }
  check('无运行异常', errors.length === 0, errors);
  fs.writeFileSync(out('guns.json'), JSON.stringify(results, null, 1));
  console.log(results.filter(r => r.pass).length + '/' + results.length + ' passed');
  await b.close();
  if (results.some(r => !r.pass)) process.exitCode = 1;
})();

// 机枪有人开、碉堡机枪手、战友阵亡与增援（v0.10.0，2026-10-15）：手动步进，平安县城 / 李家坡 / 苍云岭各一处
const { open, start } = require('./lib.cjs');
const out = [];
const check = (name, ok, detail) => { out.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(detail))); };

async function chapter(ch, fn) {
  const { browser, page, errors } = await open({ ch });
  await page.evaluate(() => { __lj.manual(true); });
  await start(page);
  await fn(page);
  await browser.close();
  return errors;
}
// 重置到某阶段，清掉敌人（可保留 keep 里的）、定时台词和过场
const CLEAN = `(ph, keep) => { const g = __lj.game; g.reset(ph, false); for (const e of g.enemies) if (!(keep || []).includes(e.type) && e.type !== 'boss') { e.alive = false; e.deadT = 9; } g.timers.length = 0; g.cut = 0; g.scn = null; g.flags.p1done = 1; g.flags.counter = 1; g.flags.nA = 1; g.flags.nB = 1; __lj.step(6, false); return g; }`;

(async () => {
  const errs = [];
  // ---------- 平安县城：鬼子补机枪手、团长只能用空机枪、战友阵亡与增援、机枪堡 ----------
  errs.push(...await chapter('pingan', async (page) => {
    const r1 = await page.evaluate((cl) => {
      const g = eval(cl)(1, ['mg']), h = g.hero, m = g.mgs.find((q) => q.id === 'A');
      g.place(h, m.x, m.z + 40);
      const gunner = g.enemies.find((e) => e.alive && e.type === 'mg' && e.nest === 'A');
      const near = g.addUnit('enemy', 'rifle', m.gx + 8, m.gz - 4, { group: 'Q' }); near.active = true; near.hold = true; near.stT = 99;
      const far = g.addUnit('enemy', 'rifle', m.gx - 22, m.gz - 6, { group: 'Q' }); far.active = true; far.hold = true; far.stT = 99;
      g.killUnit(gunner, false);
      __lj.step(60, false);
      const at2s = { claim: !!near.manGun };
      __lj.step(60 * 5, false);
      return { at2s, nearType: near.type, nearNest: near.nest, farType: far.type, farClaim: !!far.manGun, crews: g.stats.crews, pos: Math.hypot(near.x - m.gx, near.z - m.gz) };
    }, CLEAN);
    check('平安县城：机枪手死了 3 秒内没人补；之后 15 米内的鬼子跑过去当机枪手（6 秒内到位），22 米外的不动', !r1.at2s.claim && r1.nearType === 'mg' && r1.nearNest === 'A' && r1.pos < 0.1 && r1.farType === 'rifle' && !r1.farClaim && r1.crews === 1, r1);
    const r2 = await page.evaluate(() => {
      const g = __lj.game, h = g.hero, m = g.mgs.find((q) => q.id === 'A');
      g.place(h, m.x, m.z - 1.2); __lj.step(2, false);
      const withGunner = !!g.gunNear();
      for (const e of g.enemies) if (e.alive && e.nest === 'A') g.killUnit(e, false);
      __lj.step(2, false);
      const empty = !!g.gunNear();
      return { withGunner, empty };
    });
    check('有鬼子机枪手时团长接管不了，打掉就能接管', !r2.withGunner && r2.empty, r2);
    // 战友阵亡与增援
    const r3 = await page.evaluate((cl) => {
      const g = eval(cl)(1, []), h = g.hero;
      g.place(h, 0, 80); __lj.step(30, false);
      const n0 = g.allies.filter((a) => a.alive).length;
      const plain = g.allies.find((a) => !a.name), named = g.allies.find((a) => a.name);
      const slot = plain.slot;
      g.hurtUnit(plain, 99, 0, 1, 'bullet'); g.hurtUnit(named, 99, 0, 1, 'bullet');
      __lj.step(2, false);
      const after = { plainAlive: plain.alive, namedAlive: named.alive, namedDown: named.down > 0, fallen: g.stats.fallen };
      __lj.step(60 * 7, false);
      const at7 = g.allies.filter((a) => a.alive).length;
      __lj.step(60 * 1.5, false);
      const nu = g.allies.find((a) => a.alive && a !== plain && a.slot === slot && !a.name);
      const n1 = g.allies.filter((a) => a.alive).length;
      // 预备队打光就不再补
      g.reserve = 0; const p2 = g.allies.find((a) => a.alive && !a.name && a !== nu);
      g.hurtUnit(p2, 99, 0, 1, 'bullet'); __lj.step(60 * 9, false);
      const n2 = g.allies.filter((a) => a.alive).length;
      return { n0, after, at7, n1, nu: !!nu, reinf: g.stats.reinf, n2 };
    }, CLEAN);
    check('普通战士阵亡倒下、张大彪只是倒地；约 8 秒后同一个位置补上来一个，人数恢复', !r3.after.plainAlive && r3.after.namedAlive && r3.after.namedDown && r3.after.fallen === 1 && r3.at7 === r3.n0 - 1 && r3.nu && r3.n1 === r3.n0 && r3.reinf === 1, r3);
    check('这个阶段的预备队打光了就不再补人', r3.n2 === r3.n0 - 1, r3);
    // 城墙机枪堡：从缝里打机枪手
    const r4 = await page.evaluate((cl) => {
      const g = eval(cl)(3, []), b = g.world.bunkers[0], s = b.crewSlit;
      const shoot = (dy = 0, dx = 0) => { g.bullets.push({ team: 0, x: s.x + dx, y: s.y + dy, z: s.z + 12, dx: 0, dy: 0, dz: -1, sp: 90, life: 0.5, dmg: 1, ign: null, age: 0, hero: true }); __lj.step(12, false); };
      const r = { slit: !!s, crew0: b.crew, man0: b.manned, vis0: b.crewModel.root.visible };
      shoot(0.9); r.missHp = b.gunnerHp;          // 打在顶棚上，打不到
      shoot(); shoot(); shoot();
      r.after3 = { manned: b.manned, vis: b.crewModel.root.visible, kills: g.stats.kills };
      b.cd = 0; __lj.step(30, false); r.silentBurst = b.burst;
      __lj.step(60 * 3.2, false); r.back = { manned: b.manned, crew: b.crew };
      for (let k = 0; k < 2; k++) { shoot(); shoot(); shoot(); __lj.step(60 * 3.2, false); shoot(); shoot(); shoot(); }
      r.end = { manned: b.manned, crew: b.crew };
      __lj.step(60 * 4, false); r.end2 = { manned: b.manned, alive: b.alive };
      return r;
    }, CLEAN);
    check('平安县城机枪堡：缝里露着机枪手，打顶棚打不到，三枪打倒；没人时不开火，3 秒后换人', r4.slit && r4.man0 && r4.vis0 && r4.missHp === 3 && !r4.after3.manned && !r4.after3.vis && r4.silentBurst === 0 && r4.back.manned && r4.back.crew === 1, r4);
    check('机枪手打光（一共三个）这个堡就哑了，堡还在', !r4.end2.manned && r4.end2.alive && r4.end.crew === 0, r4);
  }));
  // ---------- 李家坡：坡顶碉堡的机枪手 ----------
  errs.push(...await chapter('lijiapo', async (page) => {
    const r = await page.evaluate((cl) => {
      const g = eval(cl)(1, []), b = g.world.bunkers[1], s = b.crewSlit;
      const shoot = () => { g.bullets.push({ team: 0, x: s.x, y: s.y, z: s.z + 14, dx: 0, dy: 0, dz: -1, sp: 90, life: 0.6, dmg: 1, ign: null, age: 0, hero: true }); __lj.step(14, false); };
      const r = { man0: b.manned, vis: b.crewModel.root.visible };
      shoot(); shoot(); shoot();
      r.after = { manned: b.manned, kills: g.stats.kills };
      // 没人的时候碉堡不开火
      const before = g.bullets.filter((q) => q.team === 1).length;
      b.cd = 0; __lj.step(40, false);
      r.fired = g.bullets.filter((q) => q.team === 1).length - before;
      return r;
    }, CLEAN);
    check('李家坡碉堡：射击孔里的机枪手三枪打倒，倒了之后碉堡不开火', r.man0 && r.vis && !r.after.manned && r.fired === 0, r);
  }));
  // ---------- 苍云岭：山头我方的两挺机枪，战友去操；团长走过去就让 ----------
  errs.push(...await chapter('cangyunling', async (page) => {
    const r = await page.evaluate((cl) => {
      const g = eval(cl)(1, []), h = g.hero, m = g.mgs.find((q) => q.id === 'L');
      g.place(h, m.x + 14, m.z + 6); __lj.step(30, false);
      const t0 = { ally: !!m.ally };
      __lj.step(60 * 3.5, false);
      const a = m.ally;
      __lj.step(60 * 4, false);
      const at = a ? { onGun: Math.hypot(a.x - m.x, a.z - m.z) < 0.6, gun: a.gun === m } : null;
      // 前面 30 米放个鬼子：战友用机枪打
      const e = g.addUnit('enemy', 'rifle', m.x, m.z - 30, { group: 'Q' }); e.active = true; e.hold = true; e.stT = 99; e.hp = 40;
      const hp0 = e.hp; __lj.step(60 * 4, false);
      const shot = hp0 - e.hp;
      e.alive = false; e.deadT = 9;
      // 团长走到跟前：战友让开，团长能接管
      g.place(h, m.x, m.z + 1.2); __lj.step(3, false);
      const give = { ally: !!m.ally, near: !!g.gunNear() };
      return { t0, named: a ? a.name : null, at, shot, give };
    }, CLEAN);
    check('苍云岭：山头空着的机枪，团长不在跟前时 20 米内的普通战士过去操枪', !r.t0.ally && r.at && r.at.onGun && r.at.gun && !r.named, r);
    check('操机枪的战友打前面的鬼子', r.shot > 0, r);
    check('团长走到机枪跟前，战友把枪让出来，团长能接管', !r.give.ally && r.give.near, r);
  }));
  console.log('errors:', errs.length ? errs.join(' | ') : 'none');
  require('fs').writeFileSync(require('path').join(__dirname, 'out-crews.json'), JSON.stringify({ at: new Date().toISOString(), results: out, errors: errs }, null, 1));
  const bad = out.filter((x) => !x.ok).length;
  console.log(`\n${out.length - bad}/${out.length} 通过`);
  process.exit(bad || errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

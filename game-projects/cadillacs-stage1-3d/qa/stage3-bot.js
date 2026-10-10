// 第三关公路段自动试玩（手动时钟 + 真实键盘事件），用来量节奏和难度：node qa/stage3-bot.js [英雄0-3] [种子] [std|easy|classic] [car|foot|lazy]
// car：一路撞人、躲手雷、追着霍格撞；foot：故意让车早点被炸，徒步打完；lazy：全程不碰方向（看最差情况）
const { launch, BASE, out, sleep } = require('./lib');
(async () => {
  const hero = process.argv[2] || '2', seed = process.argv[3] || '11', dur = process.argv[4] || 'std', plan = process.argv[5] || 'car';
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const T = (fn, a) => page.evaluate(fn, a);
  const S = () => T(() => window.__CD_TEST__.snapshot());
  const step = (n) => T((n) => window.__CD_TEST__.step(n, false), n);
  const held = new Set();
  const key = async (c, on) => { if (on === held.has(c)) return; if (on) held.add(c); else held.delete(c); await T((a) => window.dispatchEvent(new KeyboardEvent(a[1] ? 'keydown' : 'keyup', { code: a[0], key: a[0], bubbles: true })), [c, on]); };
  const dirs = async (dx, dz) => { await key('KeyD', dx > 0); await key('KeyA', dx < 0); await key('KeyS', dz > 0); await key('KeyW', dz < 0); };
  const tap = async (c) => { await key(c, true); await step(2); await key(c, false); };

  await page.goto(BASE + '?test=1&clean=1&area=7&seed=' + seed, { waitUntil: 'load' });
  await sleep(900);
  await T((a) => { localStorage.setItem('cd3d-stage1:hero', a[0]); localStorage.setItem('cd3d-stage1:dur', JSON.stringify(a[1])); }, [hero, dur]);
  await page.reload({ waitUntil: 'load' }); await sleep(1500);
  await T(() => document.querySelector('[data-act=select]').focus());
  await page.keyboard.press('Enter'); await sleep(250); await page.keyboard.press('Enter'); await sleep(250);
  await T(() => window.__CD_TEST__.manual(true));
  let s = await S();
  console.log('start', s.areaId, s.road && s.road.phase, 'dur', s.settings.dur, 'car', s.road && s.road.car);
  const log = { hoggAt: null, wreckAt: null, deadAt: null, rams: 0, carHits: 0, footHits: 0, deaths: 0 };
  let shots = 0;
  for (let f = 0; f < 60 * 240; f += 3) {
    s = await S();
    const R = s.road;
    if (!R || s.mode === 'clear' || s.mode === 'over') break;
    if (R.phase === 'run') {
      // 一路撞：瞄着最近的还站着的人 / 路障那一排
      const tz = await T(() => { const G = window.__CD_TEST__.cheat.G; let best = null, bd = 99; for (const a of G.actors) if (a.road && a.x > G.carX + 2.5 && a.x - G.carX < bd) { bd = a.x - G.carX; best = a.z; } for (const p of G.props) if (!p.broken && !p.parked && p.x > G.carX + 2.5 && p.x - G.carX < bd) { bd = p.x - G.carX; best = p.z; } return best; });
      if (plan === 'lazy' || tz === null) await dirs(0, 0); else await dirs(0, Math.abs(tz - R.car.z) < 0.25 ? 0 : Math.sign(tz - R.car.z));
    } else if (R.phase === 'hogg') {
      if (log.hoggAt === null) log.hoggAt = s.t;
      const h = R.hogg, c = R.car;
      let dx = 0, dz = 0;
      if (plan === 'car') {
        // 有手雷的红圈压着车：往远离落点的方向躲；否则朝霍格撞过去
        const n = R.nades.filter(n => Math.max(0, Math.abs(n.x - c.x) - 2.62) < 1.2 && Math.max(0, Math.abs(n.z - c.z) - 0.98) < 1.2)[0];
        if (n) { dz = c.z >= n.z ? 1 : -1; if ((dz > 0 && c.z > 2.8) || (dz < 0 && c.z < -1.05)) dz = -dz; dx = c.x >= n.x ? 1 : -1; }
        else { dx = Math.abs(h.x - c.x) < 0.4 ? 0 : Math.sign(h.x - c.x); dz = Math.abs(h.z - c.z) < 0.2 ? 0 : Math.sign(h.z - c.z); }
      }
      await dirs(dx, dz);
    } else if (R.phase === 'wreck' || R.phase === 'foot') {
      if (log.wreckAt === null) { log.wreckAt = s.t; await dirs(0, 0); }
      const h = R.hogg, p = s.player;
      if (p.state === 'dead' || p.state === 'respawn') { await dirs(0, 0); }
      else if (h && h.alive) {
        const inView = h.x > 0.8 && h.x < 12.8, dzh = h.z - p.z, dxh = h.x - p.x;
        if (h.mode === 'charge' && inView && Math.abs(dzh) < 0.8 && Math.abs(dxh) < 4.2 && ['idle', 'walk'].includes(p.state)) { await dirs(0, 0); await tap('KeyK'); await step(8); await tap('KeyJ'); }   // 猛冲过来：起跳，空中补一脚
        else if (p.weapon && ['smg', 'rifle', 'gun'].includes(p.weapon.kind) && p.weapon.ammo > 0 && inView && Math.abs(dzh) < 0.4 && Math.abs(dxh) > 0.8) {
          // 手里有枪、霍格在同一排：朝他那边转过去开火
          await dirs(Math.sign(dxh), 0); await step(1); await dirs(0, 0); await key('KeyJ', true); await step(4); await key('KeyJ', false);
        } else if (h.mode === 'cruise' && inView) {
          // 凑到他身边同一排，面对他连打；红圈快炸了才挪开
          const n = R.nades.filter(n => Math.hypot(n.x - p.x, n.z - p.z) < 1.9 && n.t < 0.75)[0];
          if (n) await dirs(Math.abs(dxh) > 1.2 ? Math.sign(dxh) : (p.x >= n.x ? 1 : -1), p.z >= n.z ? 1 : -1);
          else {
            const tx = h.x - Math.sign(dxh || 1) * 0.95;
            await dirs(Math.abs(tx - p.x) < 0.15 ? 0 : Math.sign(tx - p.x), Math.abs(dzh) < 0.15 ? 0 : Math.sign(dzh));
            if (Math.abs(dzh) < 0.3 && Math.abs(dxh) < 1.25) await tap('KeyJ');
          }
        } else {
          // 没有霍格可打：收拾身边的手下
          const it = await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.actors.find(a => a.side === 'player'); if (p.weapon) return null; const i = G.items.find(i => ['smg', 'rifle'].includes(i.kind)); return i ? { x: i.x, z: i.z } : null; });
          if (it) { await dirs(Math.abs(it.x - p.x) < 0.2 ? 0 : Math.sign(it.x - p.x), Math.abs(it.z - p.z) < 0.2 ? 0 : Math.sign(it.z - p.z)); if (Math.hypot(it.x - p.x, it.z - p.z) < 0.5) { await dirs(0, 0); await tap('KeyJ'); } await step(3); continue; }
          const e = await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.actors.find(a => a.side === 'player'); let best = null, bd = 99; for (const a of G.actors) if (a.side === 'enemy' && a.alive && a.type !== 'hogg' && a.state !== 'down') { const d = Math.hypot(a.x - p.x, a.z - p.z); if (d < bd) { bd = d; best = { x: a.x, z: a.z }; } } return best; });
          if (e) { const tx = e.x - Math.sign(e.x - p.x || 1) * 0.9; await dirs(Math.abs(tx - p.x) < 0.15 ? 0 : Math.sign(tx - p.x), Math.abs(e.z - p.z) < 0.15 ? 0 : Math.sign(e.z - p.z)); if (Math.abs(e.z - p.z) < 0.3 && Math.abs(e.x - p.x) < 1.2) await tap('KeyJ'); }
          else await dirs(0, 0);
        }
      }
    } else await dirs(0, 0);
    if ((R.phase === 'foot' || R.phase === 'wreck') && f % 900 === 0) console.log('  t', s.t, 'hogg', R.hogg && [R.hogg.hp, R.hogg.mode], 'p', s.player.state, s.player.hp, s.player.weapon && s.player.weapon.kind, 'en', s.enemies);
    if (shots < 6 && R.phase !== 'run' && f % 600 === 0) { await T(() => window.__CD_TEST__.step(1, true)); await page.screenshot({ path: out('bot-' + plan + '-' + (shots++) + '.png') }); }
    await step(3);
  }
  await dirs(0, 0);
  s = await S();
  const evs = await T(() => window.__CD_TEST__.events());
  const cnt = (t) => evs.filter(e => e.type === t).length;
  const tOf = (t) => (evs.find(e => e.type === t) || {}).t;
  console.log(JSON.stringify({ plan, dur, mode: s.mode, phase: s.road && s.road.phase, t: s.t, score: s.score, hp: s.player.hp, hoggHp: s.road && s.road.hogg && s.road.hogg.hp,
    runOver: cnt('runOver'), props: cnt('prop'), rams: cnt('ram'), grenades: cnt('grenade'), carHits: cnt('carHit'), hoggStart: tOf('bossStart'), wreck: tOf('carWreck'), bossDown: tOf('bossDown'), deaths: cnt('death'), kills: s.kills }));
  console.log('ERRORS', errs.length, errs.slice(0, 8).join('\n'));
  await b.close();
})().catch(e => { console.error('SCRIPT FAIL', e); process.exit(1); });

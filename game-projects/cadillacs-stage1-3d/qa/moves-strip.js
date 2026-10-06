// 出招逐帧截图：每位英雄对着木桩连按四下 J（连招）、冲刺攻击、下上攻击，按固定帧距截局部图，看出招是否到位、命中停顿和受击反馈。
// node qa/moves-strip.js <前缀> [英雄 0-3，可逗号分隔]   输出 qa/out/<前缀>-h<英雄>-<招>-NN.png 与 <前缀>-frames.json
// 拼图：python qa/strip-sheet.py <前缀>
const { launch, BASE, out, sleep } = require('./lib');
const fs = require('fs');
(async () => {
  const pre = process.argv[2] || 'moves';
  const heroes = (process.argv[3] || '0,1,2,3').split(',').map(Number);
  const EVERY = +(process.env.EVERY || 2), N = +(process.env.FRAMES || 34);
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('ERR', e.message));
  const T = (fn, a) => page.evaluate(fn, a);
  const index = [];
  for (const hero of heroes) {
    await page.goto(BASE + '?test=1&clean=1&q=high&seed=4', { waitUntil: 'load' });
    await page.evaluate(h => { localStorage.clear(); localStorage.setItem('cd3d-stage1:hero', String(h)); }, hero);
    await page.reload({ waitUntil: 'load' }); await sleep(900);
    await page.keyboard.press('Enter'); await sleep(400); await page.keyboard.press('Enter'); await sleep(600);
    await page.evaluate(() => window.__CD_TEST__.manual(true));
    await page.addStyleTag({ content: '#hud,#hud-top,#keyhint,#toast,#banner,#fps,#h-timer,#h-weapon,#h-go,#dialog{display:none!important}' });
    const setup = (dx) => T((dx) => {
      const t = window.__CD_TEST__, C = t.cheat, G = C.G; C.area(2); C.skipScript(); t.step(5, false);
      for (const e of G.actors) if (e !== G.player) { e.alive = false; e.removed = true; e.model.root.visible = false; e.blob.visible = false; }
      G.pending = []; G.waveOn = false; G.wave = 99; G.lockX = 30; G.focusX = 30; G.mode = 'play'; G.script = null;
      const p = G.player; Object.assign(p, { x: 28, z: 0.5, y: 0, vx: 0, vz: 0, face: Math.PI / 2, state: 'idle', st: 0, sub: {}, invul: 99, weapon: null, comboN: 0, lastHitT: -9 });
      const id = C.enemy('ferris', dx, 0);
      const e = G.actors.find(a => a.id === id); Object.assign(e, { x: 28 + dx, z: 0.5, face: -Math.PI / 2, invul: 0, hp: 9999, maxHp: 9999, cd: 999, state: 'idle', stun: 0 });
      e.def = Object.assign({}, e.def, { aggr: 0, speed: 0 });
      t.step(20, true);
    }, dx);
    const seqs = [
      { name: 'combo', dx: 1.05, keys: { 0: ['KeyJ'], 7: ['KeyJ'], 14: ['KeyJ'], 21: ['KeyJ'] } },
      { name: 'dash', dx: 2.6, keys: { 0: ['KeyI', 'KeyJ'] } },
      { name: 'special', dx: 1.1, keys: { 0: ['KeyS'], 1: ['KeyW'], 2: ['KeyJ'] } }
    ];
    for (const s of seqs) {
      await setup(s.dx);
      for (let f = 0; f < N * EVERY; f++) {
        for (const k of s.keys[f] || []) {
          if (k === 'KeyI') { await page.keyboard.down('KeyI'); continue; }
          await page.keyboard.press(k);
        }
        await T(() => window.__CD_TEST__.step(1, true));
        if (s.keys[f] && s.keys[f].includes('KeyI')) { await T(() => window.__CD_TEST__.step(6, true)); await page.keyboard.up('KeyI'); }
        if (f % EVERY === EVERY - 1) {
          const file = out(`${pre}-h${hero}-${s.name}-${String(f).padStart(3, '0')}.png`);
          const info = await T(() => { const G = window.__CD_TEST__.cheat.G, p = G.player, e = G.actors.find(a => a !== p); return { p: p.state, move: p.move && p.move.id, mt: p.move && +p.move.t.toFixed(3), hs: +p.hitstop.toFixed(3), e: e && e.state, ehs: e && +e.hitstop.toFixed(3) }; });
          await page.screenshot({ path: file, clip: { x: 340, y: 160, width: 600, height: 400 } });
          index.push({ hero, seq: s.name, f, file: require('path').basename(file), ...info });
        }
      }
    }
  }
  fs.writeFileSync(out(pre + '-frames.json'), JSON.stringify(index, null, 1));
  console.log('frames', index.length);
  await b.close();
})();

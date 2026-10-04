// 网站卡片封面：Boss 区实机画面（隐藏 HUD），穆斯塔法飞踢维斯、岩跳龙在旁嘶吼。node qa/cover.js
const { launch, BASE, out, sleep } = require('./lib');
(async () => {
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(BASE + '?test=1&clean=1&q=high&seed=4', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cd3d-stage1:hero', '2'); });
  await page.reload({ waitUntil: 'load' }); await sleep(800);
  await page.keyboard.press('Enter'); await sleep(100); await page.keyboard.press('Enter'); await sleep(200);
  await page.evaluate(() => window.__CD_TEST__.manual(true));
  const T = (fn, a) => page.evaluate(fn, a);
  const step = (n, d) => T(([n, d]) => window.__CD_TEST__.step(n, d), [n, d !== false]);
  await T(() => { const C = window.__CD_TEST__.cheat; C.skipScript(); C.area(2); });
  await step(10);
  await T(() => { const C = window.__CD_TEST__.cheat, G = C.G; C.killAll(); G.pending = []; G.waveOn = false; G.wave = 9; G.focusX = 41; G.player.x = 45.6; G.player.z = 0.3; });
  await step(30);
  for (let i = 0; i < 20; i++) { await T(() => window.__CD_TEST__.cheat.skipScript()); await step(5); const s = await T(() => window.__CD_TEST__.snapshot()); if (s.mode === 'play' && s.boss) break; }
  await step(90, false);
  await page.addStyleTag({ content: '#hud,#hud-top,#keyhint,#toast,#banner,#fps,#h-timer,#h-weapon,#h-go,#dialog{display:none!important}' });
  const pose = (o) => T((o) => {
    const G = window.__CD_TEST__.cheat.G, p = G.player, v = G.boss, r = G.raptor;
    for (const e of G.actors) if (e !== p && e !== v && e !== r) { e.alive = false; e.removed = true; e.model.root.visible = false; e.blob.visible = false; }
    v.x = o.vx; v.z = 0.15; v.face = -Math.PI / 2; v.state = 'cut'; v.sub = { pose: 'hurt' }; v.cd = 99; v.invul = 9; v.y = 0; v.vx = v.vz = v.vy = 0;
    r.x = o.rx; r.z = 1.05; r.face = -Math.PI / 2 - 0.55; r.state = 'idle'; r.sub = { roar: 9 }; r.cd = 99; r.invul = 9; r.vx = r.vz = 0;
    p.x = o.px; p.z = 0.3; p.face = Math.PI / 2; p.invul = 0; p.y = o.py; p.vy = 0; p.vx = 0; p.vz = 0; p.state = 'jump'; p.st = 0.3; p.sub = { atk: true, atkT: 0, fly: true, hitDone: true, noAtk: true };
    G.focusX = o.f; G.mode = 'cut';
  }, o);
  const sets = [['a', { px: 54.75, py: 0.75, vx: 56.0, rx: 57.5, f: 55.6 }], ['b', { px: 54.6, py: 0.95, vx: 56.0, rx: 57.6, f: 55.8 }]];
  for (const [name, o] of sets) {
    for (let k = 0; k < 24; k++) { await pose(o); await step(1, k === 23); }
    await page.screenshot({ path: out('cover-' + name + '.png') });
  }
  await b.close();
})();

// 开枪画面逐帧截图：手枪 / 冲锋枪 / 霰弹枪 / 步枪，以及偷猎者步枪、维斯左轮。
// 每种枪开火后第 1、3、6 帧各截一张局部图拼成一行，看火花是否在枪口、子弹是否飞出去。
// node qa/gun-shots.js <前缀>   输出 qa/out/<前缀>-guns.png；ZOOM=0 不裁剪
const { launch, BASE, out, sleep } = require('./lib');
(async () => {
  const pre = process.argv[2] || 'guns';
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(BASE + '?test=1&clean=1&q=high&seed=4', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cd3d-stage1:hero', '0'); });
  await page.reload({ waitUntil: 'load' }); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(400); await page.keyboard.press('Enter'); await sleep(600);
  await page.evaluate(() => window.__CD_TEST__.manual(true));
  await page.addStyleTag({ content: '#hud,#hud-top,#keyhint,#toast,#banner,#fps,#h-timer,#h-weapon,#h-go,#dialog{display:none!important}' });
  const T = (fn, a) => page.evaluate(fn, a);
  const shots = [];
  const setup = (foe) => T((foe) => {
    const t = window.__CD_TEST__, C = t.cheat, G = C.G; C.area(2); C.skipScript(); t.step(5, false);
    for (const e of G.actors) if (e !== G.player) { e.alive = false; e.removed = true; e.model.root.visible = false; e.blob.visible = false; }
    G.pending = []; G.waveOn = false; G.wave = 99; G.lockX = 30; G.focusX = 30; G.mode = 'play'; G.script = null;
    const p = G.player; p.x = 27; p.z = 0.5; p.y = 0; p.vx = p.vz = 0; p.face = Math.PI / 2; p.state = 'idle'; p.st = 0; p.sub = {}; p.invul = 0; p.weapon = null;
    if (foe) { const id = C.enemy(foe, 5.5, 0); const e = G.actors.find(a => a.id === id); e.face = -Math.PI / 2; e.invul = 0; e.hp = 9999; e.cd = 99; e.state = 'idle'; }
    t.step(20, true);
  }, foe);
  const crop = { x: 330, y: 250, width: 620, height: 260 };
  for (const kind of (process.env.KINDS || 'gun,smg,shotgun,rifle').split(',').filter(Boolean)) {
    await setup('thug');
    await T((k) => { const t = window.__CD_TEST__; t.cheat.give(k, 30); t.step(25, true); }, kind);
    await page.keyboard.down('KeyJ'); await T(() => window.__CD_TEST__.step(1, true)); await page.keyboard.up('KeyJ');
    for (const f of [1, 3, 6]) {
      if (f > 1) await T((n) => window.__CD_TEST__.step(n, true), f === 3 ? 2 : 3);
      const file = out(pre + '-' + kind + '-f' + f + '.png');
      await page.screenshot({ path: file, clip: process.env.ZOOM === '0' ? undefined : crop });
      shots.push(file);
    }
  }
  // 敌人开枪：偷猎者（第二关森林）与维斯（47 街 Boss）由 AI 自己开枪，这里直接叫开枪动作
  await page.reload({ waitUntil: 'load' }); await sleep(900);   // 重新载入，清掉前面给主角的枪
  await page.keyboard.press('Enter'); await sleep(400); await page.keyboard.press('Enter'); await sleep(600);
  await page.evaluate(() => window.__CD_TEST__.manual(true));
  await page.addStyleTag({ content: '#hud,#hud-top,#keyhint,#toast,#banner,#fps,#h-timer,#h-weapon,#h-go,#dialog{display:none!important}' });
  for (const [area, foe, fn] of [[3, 'poacher', 'rifle'], [2, 'vice', 'vice']]) {
    await T(([area, foe]) => {
      const t = window.__CD_TEST__, C = t.cheat, G = C.G; C.area(area); C.skipScript(); t.step(5, false);
      for (const e of G.actors) if (e !== G.player && e.type !== 'shivat') { e.alive = false; e.removed = true; e.model.root.visible = false; e.blob.visible = false; }
      G.pending = []; G.waveOn = false; G.wave = 99; G.lockX = 30; G.focusX = 30; G.mode = 'play'; G.script = null;
      const p = G.player; p.x = 27; p.z = 0.5; p.y = 0; p.vx = p.vz = 0; p.face = Math.PI / 2; p.state = 'idle'; p.invul = 0; p.weapon = null;
      const id = C.enemy(foe, 5.5, 0); const e = G.actors.find(a => a.id === id); e.face = -Math.PI / 2; e.cd = 99; e.state = 'idle'; G.testShooter = e;
      t.step(20, true);
    }, [area, foe]);
    const ok = await T((fn) => { const t = window.__CD_TEST__, G = t.cheat.G, e = G.testShooter; return t.cheat.shoot ? t.cheat.shoot(e.id) : false; }, fn);
    if (!ok) { console.log('skip enemy shot', foe, '(no cheat.shoot hook)'); continue; }
    for (const f of [1, 3, 6]) {
      await T((n) => window.__CD_TEST__.step(n, true), f === 1 ? 1 : f === 3 ? 2 : 3);
      const file = out(pre + '-' + foe + '-f' + f + '.png');
      await page.screenshot({ path: file, clip: process.env.ZOOM === '0' ? undefined : crop });
      shots.push(file);
    }
  }
  console.log(JSON.stringify(shots));
  await b.close();
})();

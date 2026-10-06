// 画风对照：固定站位摆拍六个场景（选人、楼顶、大楼内部、47 街 Boss、森林三角龙、屠夫），便于新旧版本并排比较。
// node qa/style-shots.js <前缀>   输出 qa/out/<前缀>-*.png
const { launch, BASE, out, sleep } = require('./lib');
(async () => {
  const pre = process.argv[2] || 'style';
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(BASE + '?test=1&clean=1&q=high&seed=4', { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('cd3d-stage1:hero', '0'); });
  await page.reload({ waitUntil: 'load' }); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(500);
  await page.screenshot({ path: out(pre + '-select.png') });
  await page.keyboard.press('Enter'); await sleep(300);
  await page.evaluate(() => window.__CD_TEST__.manual(true));
  await page.addStyleTag({ content: '#hud,#hud-top,#keyhint,#toast,#banner,#fps,#h-timer,#h-weapon,#h-go,#dialog{display:none!important}' });
  const T = (fn, a) => page.evaluate(fn, a);
  // 场景：区域、焦点、主角站位，敌人 [类型, x, z, 朝向(1 右 / -1 左)]
  const scenes = [
    ['roof', 0, 8, [6.4, 0.6], [['ferris', 8.3, 0.4, -1], ['gneiss', 9.6, -0.6, -1], ['punk', 4.6, -0.8, 1]]],
    ['hall', 1, 20, [18.5, 0.4], [['hammer', 20.6, 0.2, -1], ['blade', 22.0, -0.9, -1], ['elmer', 16.4, -0.6, 1]]],
    ['street', 2, 53, [51.0, 0.3], [['vice', 53.2, 0.1, -1], ['wrench', 55.0, -0.9, -1]]],
    ['forest', 3, 12, [10.0, 0.6], [['hack', 13.4, 0.4, -1], ['poacher', 15.0, -1.0, -1]]],
    ['grave', 5, 50, [48.6, 0.2], [['butcher', 51.0, -0.1, -1], ['gutter', 46.2, -1.0, 1]]]
  ];
  const only = process.env.SCENES ? process.env.SCENES.split(',') : null;   // 旧版只有第一关：SCENES=roof,hall,street
  for (const [name, area, focus, p, foes] of scenes) {
    if (only && only.indexOf(name) < 0) continue;
    await T((a) => { const C = window.__CD_TEST__.cheat; C.area(a); C.skipScript(); }, area);
    await T(() => window.__CD_TEST__.step(5, false));
    await T(([focus, p, foes]) => {
      const C = window.__CD_TEST__.cheat, G = C.G;
      for (const e of G.actors) if (e !== G.player && e.type !== 'shivat') { e.alive = false; e.removed = true; e.model.root.visible = false; e.blob.visible = false; }
      G.pending = []; G.waveOn = false; G.wave = 99; G.lockX = focus; G.focusX = focus; G.mode = 'cut';
      const pl = G.player; pl.x = p[0]; pl.z = p[1]; pl.y = 0; pl.vx = pl.vz = 0; pl.face = Math.PI / 2; pl.state = 'idle'; pl.st = 0; pl.sub = {}; pl.weapon = null; pl.invul = 0;
      for (const [type, x, z, f] of foes) { const id = C.enemy(type, 1, 0); const e = G.actors.find(a => a.id === id); e.x = x; e.z = z; e.face = f > 0 ? Math.PI / 2 : -Math.PI / 2; e.state = 'cut'; e.sub = {}; e.cd = 99; e.invul = 99; }
    }, [focus, p, foes]);
    await T(() => window.__CD_TEST__.step(40, true));
    await page.screenshot({ path: out(pre + '-' + name + '.png') });
    console.log('shot', name);
  }
  await b.close();
})();

// 可走纵深回归：第二关地面铺到画面下方，主角要能走到画面约八成高处；第一关保持原来的纵深和取景。
// 真实按键往前（S）/往里（W）走到头，量脚下在画面里的高度；锁屏窗口左右两端最前排角色整个在画面内。
// node qa/depth.js   结果写 qa/out/depth.json，截图 qa/out/depth-<区域>-front.png
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
  const T = (fn, a) => page.evaluate(fn, a);
  // 每个区域：清场、锁屏，放到区域中段，然后真实按键走到最前 / 最里
  const prep = (area, x) => T(([area, x]) => {
    const t = window.__CD_TEST__, C = t.cheat, G = C.G; C.area(area); C.skipScript(); t.step(5, false);
    for (const e of G.actors) if (e !== G.player && e.type !== 'shivat') { e.alive = false; e.removed = true; e.model.root.visible = false; e.blob.visible = false; }
    G.pending = []; G.waveOn = false; G.wave = 99; G.lockX = x; G.focusX = x; G.mode = 'play'; G.script = null;
    const p = G.player; p.x = x; p.z = 0; p.y = 0; p.vx = p.vz = 0; p.state = 'idle'; p.st = 0; p.sub = {}; p.invul = 0; p.weapon = null;
  }, [area, x]);
  const pos = () => T(() => { const t = window.__CD_TEST__, G = t.cheat.G, p = G.player, d = t.areaDef(); return { area: G.area, x: +p.x.toFixed(2), z: +p.z.toFixed(2), feet: t.project(p.x, 0, p.z), head: t.project(p.x, p.model.H, p.z), z0: d.z0, z1: d.z1, camZ1: d.camZ1, focus: G.focusX }; });
  const walk = async (key, ms) => { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key); await sleep(450); };
  for (const [area, x, stage] of [[0, 20, 1], [2, 30, 1], [3, 30, 2], [4, 30, 2], [5, 30, 2]]) {
    await prep(area, x);
    await walk('KeyS', 3800);   // 泥沼里走得慢三成，多按一会
    const f = await pos();
    await page.screenshot({ path: out('depth-' + area + '-front.png') });
    check('区域 ' + area + '：S 走到最前排 z1', Math.abs(f.z - f.z1) < 0.05, { z: f.z, z1: f.z1 });
    if (stage === 2) {
      check('区域 ' + area + '：第二关可走到 z 4.0', f.z1 === 4.0 && f.camZ1 === 2.5, { z1: f.z1, camZ1: f.camZ1 });
      check('区域 ' + area + '：最前排脚下在画面 76%–90% 高', f.feet[1] > 0.76 && f.feet[1] < 0.9, f.feet);
    } else {
      check('区域 ' + area + '：第一关纵深不变（z1 2.5 以内，无 camZ1）', f.z1 <= 2.5 && f.camZ1 === undefined, { z1: f.z1 });
      check('区域 ' + area + '：第一关最前排脚下仍在画面 60%–80% 高', f.feet[1] > 0.6 && f.feet[1] < 0.8, f.feet);
    }
    // 最前排贴着锁屏左右两端：身体左右边缘都在画面里
    for (const [key, side] of [['KeyA', '左'], ['KeyD', '右']]) {
      await walk(key, 3800);
      const e = await pos();
      const half = await T(([x, z]) => { const t = window.__CD_TEST__; const a = t.project(x - 0.45, 1.0, z), b = t.project(x + 0.45, 1.0, z); return [a[0], b[0]]; }, [e.x, e.z]);
      check('区域 ' + area + '：最前排' + side + '端角色完整在画面内', half[0] > 0 && half[1] < 1 && Math.abs(e.z - e.z1) < 0.05, { x: e.x, z: e.z, screenX: half, focus: e.focus });
      await walk(key === 'KeyA' ? 'KeyD' : 'KeyA', 1200);
    }
    await walk('KeyW', 3800);
    const bk = await pos();
    check('区域 ' + area + '：W 走到最里排 z0', Math.abs(bk.z - bk.z0) < 0.05, { z: bk.z, z0: bk.z0, feet: bk.feet });
  }
  check('无运行异常', errors.length === 0, errors);
  fs.writeFileSync(out('depth.json'), JSON.stringify(results, null, 1));
  console.log(results.filter(r => r.pass).length + '/' + results.length + ' passed');
  await b.close();
  if (results.some(r => !r.pass)) process.exitCode = 1;
})();

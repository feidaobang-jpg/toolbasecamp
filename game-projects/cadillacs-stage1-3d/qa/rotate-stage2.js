// 第二关各区域 Q/E 转一整圈与正视 / 第一人称取景检查（看有没有穿帮、空白、悬空）：node qa/rotate-stage2.js
const { launch, BASE, out, sleep } = require('./lib');
(async () => {
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '?test=1&seed=3&clean=1&area=3', { waitUntil: 'load' }); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(200); await page.keyboard.press('Enter'); await sleep(300);
  await page.evaluate(() => window.__CD_TEST__.manual(true));
  const T = (fn, a) => page.evaluate(fn, a);
  const files = [];
  for (const [area, xs] of [[3, [6, 40, 70]], [4, [3, 30, 52]], [5, [8, 52]]]) {
    await T((a) => { window.__CD_TEST__.cheat.area(a); window.__CD_TEST__.cheat.skipScript(); }, area);
    for (const x of xs) {
      await T((x) => { const C = window.__CD_TEST__.cheat, G = C.G; C.killAll(); G.pending = []; G.waveOn = false; G.wave = 99; G.lockX = null; G.focusX = x; G.player.x = x; G.player.z = 0; G.player.state = 'idle'; }, x);
      for (const [cam, yaw] of [[0, Math.PI / 2], [0, Math.PI], [0, -Math.PI / 2], [2, 0], [2, Math.PI], [3, 0]]) {
        await T(([c, y]) => window.__CD_TEST__.setCamera(c, y), [cam, yaw]);
        await T(() => window.__CD_TEST__.step(40, true));
        const f = 'rot-a' + area + '-x' + x + '-c' + cam + '-y' + yaw.toFixed(1) + '.png';
        await page.screenshot({ path: out(f) }); files.push(f);
      }
    }
  }
  console.log(files.length, 'shots', errs);
  await b.close();
})();

// 冒烟：载入页面、截标题、开局、截图，收集控制台错误
const { launch, BASE, out, sleep } = require('./lib');
(async () => {
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + '?test=1&seed=7', { waitUntil: 'load' });
  await sleep(2500);
  await page.screenshot({ path: out('smoke-title.png') });
  const info = await page.evaluate(() => window.__CD_TEST__ ? window.__CD_TEST__.renderInfo() : null);
  console.log('render', JSON.stringify(info));
  await page.keyboard.press('Enter');
  await sleep(500);
  await page.screenshot({ path: out('smoke-select.png') });
  await page.keyboard.press('Enter');
  await sleep(3000);
  await page.screenshot({ path: out('smoke-game.png') });
  const snap = await page.evaluate(() => window.__CD_TEST__.snapshot());
  console.log(JSON.stringify({ mode: snap.mode, area: snap.area, player: snap.player, enemies: snap.enemies, dialog: snap.dialog, ui: { overlay: snap.ui.overlay, camera: snap.ui.camera } }));
  console.log(errs.slice(0, 20).join('\n'));
  await b.close();
})();

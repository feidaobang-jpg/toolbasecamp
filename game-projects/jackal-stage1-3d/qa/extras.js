// 补充截图（手动时钟渲染）：主菜单、暂停菜单、三种视角、演示模式标识、帧率显示
const fs = require('fs');
const { BASE, snap, launch } = require('./lib');
(async () => {
  const outDir = process.argv[2] || 'out/extras';
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(BASE + '?test=1&q=high&seed=41');
  await page.waitForTimeout(1500);
  await page.evaluate(() => __JK_TEST__.manual(true));
  const steps = (n) => page.evaluate((n) => { let r; for (let i = 0; i < n; i++) r = __JK_TEST__.step(1, false); return r; }, n);
  const shot = async (name) => { await page.evaluate(() => __JK_TEST__.step(1, true)); await page.screenshot({ path: outDir + '/' + name + '.png' }); console.log(name); };
  for (let k = 0; k < 40; k++) await page.evaluate(() => __JK_TEST__.step(2, false));
  await shot('title-menu');
  await page.keyboard.press('Enter');
  await steps(150);
  await page.evaluate(() => { __JK_TEST__.cheat.teleport(-21, 112); __JK_TEST__.cheat.invuln(0.01); });
  await steps(40);
  for (const cam of ['oblique', 'top', 'low']) {
    while ((await snap(page)).ui.camera !== cam) { await page.keyboard.press('KeyC'); await steps(1); }
    await steps(30);
    await shot('camera-' + cam);
  }
  while ((await snap(page)).ui.camera !== 'oblique') { await page.keyboard.press('KeyC'); await steps(1); }
  await page.keyboard.press('Escape'); await steps(1);
  await shot('pause-menu');
  // 暂停菜单里打开演示模式与帧率显示，再继续
  const items = await page.$$eval('#pause .items > *', els => els.map(e => e.getAttribute('data-act') || e.getAttribute('data-opt')));
  for (const want of ['demo', 'fps']) {
    let s = await snap(page);
    while (s.ui.focus !== want) { await page.keyboard.press('ArrowDown'); s = await snap(page); }
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape'); await steps(1);
  await page.evaluate(() => __JK_TEST__.manual(false));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: outDir + '/demo-badge-fps.png' });
  console.log('demo-badge-fps', JSON.stringify((await snap(page)).settings));
  await browser.close();
})();

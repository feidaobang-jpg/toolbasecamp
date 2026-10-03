// 封面：营地大门前的实机画面（隐藏 HUD），手动时钟渲染
const { BASE, snap, launch } = require('./lib');
(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(BASE + '?test=1&clean=1&q=high&seed=9');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await page.evaluate(() => __JK_TEST__.manual(true));
  const steps = (n) => page.evaluate((n) => { let r; for (let i = 0; i < n; i++) r = __JK_TEST__.step(1, false); return r; }, n);
  await steps(140);
  await page.addStyleTag({ content: '#hud,#hud-top,#keyhint,#toast,#banner,#fps,#boss-bar{display:none!important}' });
  for (const [x, y, name, k, cam] of [[1.5, 45, 'gate-ob', 44, 0], [1.5, 46.5, 'gate-low', 44, 2]]) {
    while ((await snap(page)).ui.camera !== ['oblique', 'top', 'low'][cam]) { await page.keyboard.press('KeyC'); await steps(1); }
    await page.evaluate(([x, y]) => { __JK_TEST__.cheat.teleport(x, y); __JK_TEST__.cheat.invuln(0.01); __JK_TEST__.cheat.carry(3); }, [x, y]);
    await page.keyboard.down('KeyW'); await steps(6); await page.keyboard.up('KeyW');
    await steps(60);
    await page.keyboard.down('KeyJ'); await page.keyboard.down('KeyK'); await steps(3); await page.keyboard.up('KeyK');
    await steps(k); await page.keyboard.up('KeyJ');
    await page.evaluate(() => __JK_TEST__.step(1, true));
    await page.screenshot({ path: 'out/cover-' + name + '.png' });
    await steps(60);
  }
  await browser.close();
})();

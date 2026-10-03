const { snap, launch } = require('./lib');
(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file:///home/claude/jk/public/html/game/jackal-stage1-3d/index.html?test=1&q=low');
  await page.waitForTimeout(2500);
  const s = await snap(page);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  const s2 = await snap(page);
  await page.screenshot({ path: 'out/filetest.png' });
  console.log(JSON.stringify({ menu: s.ui.overlay, after: s2.ui.uiMode, mode: s2.mode, errs }));
  await browser.close();
})();

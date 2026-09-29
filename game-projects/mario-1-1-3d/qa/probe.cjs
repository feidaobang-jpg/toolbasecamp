// Debug probe: start the game, hold D, sample world state over time.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE, args: ['--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e));
  await page.route('**/main.js*', async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: await r.text() + '\nwindow.__qa={view,world,input,running:()=>running,paused:()=>paused};' }); });
  await page.goto('http://127.0.0.1:8765/public/html/game/mario-1-1-3d/index.html');
  await page.waitForFunction(() => window.__qa);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyJ');
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => {
      const w = window.__qa.world, p = w.player;
      return { t: +w.elapsed.toFixed(2), status: w.status, running: window.__qa.running(), paused: window.__qa.paused(), x: +p.x.toFixed(2), vx: +p.vx.toFixed(2), y: +p.y.toFixed(2), lives: w.lives, ix: window.__qa.input.x, irun: window.__qa.input.run, evts: w.events.map(e => e.type).join(',') };
    });
    console.log(JSON.stringify(s));
  }
  await page.keyboard.press('KeyK');
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => {
      const w = window.__qa.world, p = w.player;
      return { t: +w.elapsed.toFixed(2), status: w.status, x: +p.x.toFixed(2), vx: +p.vx.toFixed(2), y: +p.y.toFixed(2), grounded: p.grounded, evts: w.events.map(e => e.type).join(',') };
    });
    console.log(JSON.stringify(s));
  }
  await browser.close();
})();

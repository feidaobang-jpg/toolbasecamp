// Mobile-viewport captures for the current build: title panel, landscape play,
// and the site thumbnail (derived from a desktop gameplay frame).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const path = require('node:path');
const URL = 'http://127.0.0.1:8765/public/html/game/mario-1-1-3d/index.html';
const CAP = 'D:/project/toolbasecamp/game-projects/mario-1-1-3d/media-kit/releases/v0.1.0/captures';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE, args: ['--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/main.js*', async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: await r.text() + '\nwindow.__qa={view,world};' }); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__qa, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(CAP, 'mobile-title.png') });
  await page.locator('#start').tap();
  await page.waitForTimeout(700);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(1800); await page.keyboard.up('KeyD');
  await page.screenshot({ path: path.join(CAP, 'mobile-play.png') });
  await ctx.close();
  // Site thumbnail: a representative desktop gameplay frame (blocks + coins + pipe).
  const tctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const tpage = await tctx.newPage();
  await tpage.route('**/main.js*', async route => { const r = await route.fetch(); await route.fulfill({ response: r, body: await r.text() + '\nwindow.__qa={view,world};' }); });
  await tpage.goto(URL);
  await tpage.waitForFunction(() => window.__qa, null, { timeout: 20000 });
  await tpage.keyboard.press('Enter');
  await tpage.waitForTimeout(600);
  await tpage.evaluate(() => { const w = window.__qa.world; const p = w.player; p.x = 27; p.z = 1.4; p.invuln = 60; w.enemies.length = 0; });
  await tpage.waitForTimeout(1000);
  await tpage.screenshot({ path: 'D:/project/toolbasecamp/public/assets/game/thumbs/mario-1-1-3d.jpg', type: 'jpeg', quality: 82 });
  await tctx.close();
  await browser.close();
  console.log('mobile captures + thumbnail OK');
})().catch(e => { console.error(e); process.exit(1); });

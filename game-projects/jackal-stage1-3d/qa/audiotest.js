const fs = require('fs');
const { BASE, snap, launch } = require('./lib');
const { makeBot } = require('./bot');
(async () => {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(BASE + '?test=1&clean=1&q=low&seed=41');
  await page.waitForTimeout(800);
  await page.evaluate(() => __JK_TEST__.manual(true));
  await page.evaluate(() => __JK_TEST__.audioLogStart());
  await page.keyboard.press('Enter');
  const bot = makeBot(page, { seed: 41 });
  for (let k = 0; k < 120; k++) { const r = await page.evaluate(() => __JK_TEST__.step(6, false)); const s = await snap(page); await bot.tick(s); }
  const ev = await page.evaluate(() => __JK_TEST__.audioLogStop());
  const counts = {}; ev.forEach(e => counts[e.n] = (counts[e.n] || 0) + 1);
  console.log('events', ev.length, JSON.stringify(counts));
  const au = await page.evaluate((ev) => __JK_TEST__.audioOffline(ev, 12.5), ev);
  fs.writeFileSync('out/audiotest.wav', Buffer.from(au.wav, 'base64'));
  console.log('peak', au.peak, 'seconds', au.seconds);
  await browser.close();
})();

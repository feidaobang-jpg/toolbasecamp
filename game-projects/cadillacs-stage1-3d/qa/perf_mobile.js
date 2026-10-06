// 弱设备粗略参考：手机视口 844×390 DPR2 + CDP CPU 降速 4 倍，画质自动；不代表真机。node qa/perf_mobile.js [区域 0-5]
const { launch, BASE, out, sleep } = require('./lib');
const { BOT_SRC } = require('./bot');
const fs = require('fs');
(async () => {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const area = process.argv[2] || '';
  await page.goto(BASE + '?test=1&seed=9' + (area ? '&area=' + area : ''), { waitUntil: 'load' }); await sleep(800);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => document.querySelector('[data-act=select]').click()); await sleep(300);
  await page.evaluate(() => document.querySelector('#sel-go').click()); await sleep(500);
  await page.evaluate(() => window.__CD_TEST__.cheat.skipScript());
  await page.evaluate(BOT_SRC);
  await page.evaluate(() => window.__bot.live(true, { jumps: true }));
  await sleep(9000);   // 让自动画质完成判定
  await page.evaluate(() => window.__CD_TEST__.perfStart()); await sleep(10000);
  const p = await page.evaluate(() => window.__CD_TEST__.perfStop());
  const snap = await page.evaluate(() => window.__CD_TEST__.snapshot());
  const a = p.frames.slice().sort((x, y) => x - y), mean = a.reduce((s, v) => s + v, 0) / a.length;
  const res = { date: new Date().toISOString(), area: snap.areaId, note: 'Edge 设备模拟 844×390 DPR2 + CPU 降速 4 倍（RTX 4060 Ti 仍负责 GPU），不代表真机', quality: snap.ui.quality, fps: +(1000 / mean).toFixed(1), median: +a[Math.floor(a.length / 2)].toFixed(1), p95: +a[Math.floor(a.length * 0.95)].toFixed(1), over50: a.filter(v => v > 50).length, n: a.length, backing: snap.ui.display.backing };
  console.log(JSON.stringify(res));
  fs.writeFileSync(out('perf-mobile-throttle4' + (area ? '-a' + area : '') + '.json'), JSON.stringify(res, null, 1));
  await page.evaluate(() => window.__bot.live(false));
  await b.close();
})();

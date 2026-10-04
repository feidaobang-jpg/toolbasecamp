// Toy 预览实测：电脑 + 手机视口载入、开局、确认无控制台错误、无站内资源 404
const { launch, out, sleep } = require('./lib');
const PREVIEW = 'https://www.bilibili.com/toy/preview/preview_K0X4v6fM/index.html';
(async () => {
  for (const mode of ['desktop', 'mobile']) {
    const b = await launch();
    const ctx = mode === 'desktop'
      ? await b.newContext({ viewport: { width: 1280, height: 720 } })
      : await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    const page = await ctx.newPage();
    const errs = [], failed = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', r => failed.push(r.url() + ' ' + (r.failure() || {}).errorText));
    page.on('response', r => { if (r.status() >= 400 && !r.url().includes('bilibili.com')) failed.push(r.status() + ' ' + r.url()); });
    await page.goto(PREVIEW, { waitUntil: 'load', timeout: 60000 });
    await sleep(4000);
    await page.screenshot({ path: out('toy-preview-' + mode + '-title.png') });
    // 电脑：Enter 开局；手机：触摸屏幕中央代替
    if (mode === 'desktop') { await page.keyboard.press('Enter'); } else { await page.touchscreen.tap(422, 195); }
    await sleep(1200);
    await page.screenshot({ path: out('toy-preview-' + mode + '-select.png') });
    if (mode === 'desktop') { await page.keyboard.press('Enter'); } else { await page.touchscreen.tap(422, 195); }
    await sleep(4000);
    await page.screenshot({ path: out('toy-preview-' + mode + '-game.png') });
    const state = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return { canvas: !!c, canvasSize: c ? c.width + 'x' + c.height : null, title: document.title };
    });
    console.log(mode, JSON.stringify(state));
    console.log(mode, 'console-errors:', errs.length ? errs.slice(0, 10).join(' | ') : 'none');
    console.log(mode, 'failed-requests:', failed.length ? failed.slice(0, 10).join(' | ') : 'none');
    await ctx.close(); await b.close();
  }
})();

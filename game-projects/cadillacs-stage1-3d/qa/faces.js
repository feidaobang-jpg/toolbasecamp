// 头像检查：把所有离屏渲染的头像排成一页截图
const { launch, BASE, out, sleep } = require('./lib');
(async () => {
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(BASE + '?test=1&seed=7', { waitUntil: 'load' });
  await sleep(1200);
  await page.evaluate(() => {
    const F = window.__CD_TEST__.faces();
    const div = document.createElement('div'); div.style.cssText = 'position:fixed;inset:0;z-index:999;background:#556;display:flex;flex-wrap:wrap;align-content:flex-start;gap:6px;padding:6px';
    for (const k in F) { const w = document.createElement('div'); w.style.cssText = 'color:#fff;font:12px sans-serif;text-align:center'; w.innerHTML = '<img src="' + F[k] + '" style="width:150px;height:150px;background:#223;display:block">' + k; div.appendChild(w); }
    document.body.appendChild(div);
  });
  await sleep(300);
  await page.screenshot({ path: out('faces.png') });
  await b.close();
})();

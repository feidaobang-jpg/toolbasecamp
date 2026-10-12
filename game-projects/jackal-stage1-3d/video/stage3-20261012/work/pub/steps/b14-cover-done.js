// B 站：封面对话框点「完成」，再核对封面缩略与整表
const { page, path, sleep } = S;
const btn = page.getByText('完成', { exact: true }).filter({ visible: true }).last();
if (await btn.count()) await btn.click(); else await page.mouse.click(1262, 841);
await sleep(6000);
const st = await page.evaluate(() => {
  const vis = e => !!e.offsetParent;
  return {
    dialogOpen: [...document.querySelectorAll('.cover-editor-content')].filter(vis).length,
    coverText: (document.querySelector('.cover-main') || { innerText: '' }).innerText.replace(/\n+/g, ' | ').slice(0, 160),
    coverImgs: [...document.querySelectorAll('.cover-main img, .cover-main [style*=background]')].filter(vis).map(e => ({ tag: e.tagName, w: e.naturalWidth || Math.round(e.getBoundingClientRect().width), h: e.naturalHeight || Math.round(e.getBoundingClientRect().height), src: (e.src || e.style.backgroundImage || '').slice(0, 90) })).slice(0, 6),
    toast: [...document.querySelectorAll('.bcc-message, [class*=toast]')].filter(vis).map(e => e.innerText.trim().slice(0, 80)),
  };
});
await page.evaluate(() => window.scrollTo(0, 0)); await sleep(400);
await page.screenshot({ path: path.join(S.OUT, 'b14-top.png') });
await page.mouse.wheel(0, 700); await sleep(600);
await page.screenshot({ path: path.join(S.OUT, 'b14-mid.png') });
await page.mouse.wheel(0, 900); await sleep(600);
await page.screenshot({ path: path.join(S.OUT, 'b14-bottom.png') });
return st;

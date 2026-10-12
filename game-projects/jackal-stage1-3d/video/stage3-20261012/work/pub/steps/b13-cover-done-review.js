// B 站：封面点「完成」，然后整表核对（不提交）
const { page, path, sleep } = S;
const done = page.locator('.bcc-dialog').locator('button, .bcc-button', { hasText: /^\s*完成\s*$/ }).first();
if (await done.isVisible().catch(() => false)) { await done.click(); await sleep(5000); }
const st = await page.evaluate(() => {
  const vis = e => !!e.offsetParent;
  return {
    upload: (document.body.innerText.match(/上传完成|上传中[^\n]*/g) || []).slice(0, 2),
    title: (document.querySelector('input[placeholder="请输入稿件标题"]') || {}).value,
    statement: (document.querySelector('input[placeholder="请选择符合您视频内容的创作声明"]') || {}).value,
    tags: [...document.querySelectorAll('.label-item-v2-container')].filter(vis).map(e => e.innerText.trim()),
    desc: [...document.querySelector('.ql-editor').querySelectorAll('p')].map(p => p.innerText),
    cover: [...document.querySelectorAll('.cover-main img, .cover img')].filter(vis).map(e => ({ w: e.naturalWidth, h: e.naturalHeight, src: (e.src || '').slice(0, 60) })).slice(0, 6),
    coverText: (document.querySelector('.cover-main') || { innerText: '' }).innerText.replace(/\n+/g, ' | ').slice(0, 120),
    section: (document.body.innerText.match(/分区\s*\n+\s*[^\n]+/) || [''])[0].replace(/\n+/g, ' '),
    collection: (document.body.innerText.match(/加入合集\s*\n+\s*[^\n]+/) || [''])[0].replace(/\n+/g, ' '),
    timing: (document.body.innerText.match(/定时发布[^\n]*/) || [''])[0],
    dialogs: [...document.querySelectorAll('.bcc-dialog')].filter(vis).length,
  };
});
await page.evaluate(() => window.scrollTo(0, 0)); await sleep(300);
await page.screenshot({ path: path.join(S.OUT, 'b13-top.png') });
await page.locator('.ql-editor').first().scrollIntoViewIfNeeded(); await sleep(300);
await page.screenshot({ path: path.join(S.OUT, 'b13-mid.png') });
return st;

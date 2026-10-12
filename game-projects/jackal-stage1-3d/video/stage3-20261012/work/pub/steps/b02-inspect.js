// B 站：只读，看表单结构
const { page, path, sleep } = S;
await sleep(1000);
const info = await page.evaluate(() => {
  const q = s => [...document.querySelectorAll(s)];
  const desc = el => ({ tag: el.tagName, cls: (el.className && el.className.toString().slice(0, 90)) || '', ph: el.getAttribute('placeholder'), val: (el.value || '').slice(0, 60), text: (el.innerText || '').slice(0, 60).replace(/\n/g, ' ') });
  return {
    inputs: q('input:not([type=file]),textarea').filter(e => e.offsetParent).map(desc),
    files: q('input[type=file]').map(e => ({ accept: e.accept, cls: e.className, parent: e.parentElement.className.toString().slice(0, 80) })),
    tags: q('.tag-container .label-item-v2-container, .tag-pre-wrp .label-item-v2-content, .tag-pre-wrp > *').map(desc).slice(0, 20),
    ql: q('.ql-editor').map(desc),
    status: (document.body.innerText.match(/上传完成|上传中[^\n]*|已经上传[^\n]*/g) || []).slice(0, 4),
    cover: q('.cover-upload, .cover-main, [class*=cover]').slice(0, 12).map(desc),
    decl: q('[class*=declaration], [class*=copyright], [class*=statement]').slice(0, 10).map(desc),
  };
});
await page.screenshot({ path: path.join(S.OUT, 'b02.png'), fullPage: false });
return info;

// 抖音：只读，看发布表单的字段结构与上传进度
const { path, sleep } = S; const t = S.vars.dy; const out = {};
out.fields = await t.evaluate(() => [...document.querySelectorAll('input:not([type=file]), textarea, [contenteditable=true]')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return { tag: e.tagName, type: e.type, cls: e.className.toString().slice(0, 60), ph: e.getAttribute('placeholder') || e.getAttribute('data-placeholder'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), val: (e.value || e.innerText || '').slice(0, 30) }; }));
out.files = await t.evaluate(() => [...document.querySelectorAll('input[type=file]')].map(e => ({ accept: e.accept.slice(0, 40), cls: e.className.toString().slice(0, 40) })));
out.upload = await t.evaluate(() => (document.body.innerText.match(/已上传[^\n]*|上传成功[^\n]*|重新上传|预览视频|上传完成[^\n]*/g) || []).slice(0, 4));
await t.screenshot({ path: path.join(S.OUT, 't03.png'), fullPage: true });
return out;

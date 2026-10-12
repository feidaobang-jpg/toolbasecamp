// YouTube：英文标题与说明对话框已打开——找到翻译侧的两个输入框，填好后发布
const { path, fs, EP, sleep } = S; const y = S.vars.yt; const out = {};
const raw = fs.readFileSync(path.join(EP, 'final/youtube-zh/English-localizations.txt'), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
const title = raw.split('[Title]\n')[1].split('\n\n')[0].trim();
const desc = raw.split('[Description]\n')[1].trim();
out.fields = await y.evaluate(() => [...document.querySelectorAll('textarea, [contenteditable=true]')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); const host = e.closest('[id]'); return { tag: e.tagName, id: e.id, host: host && host.id, aria: e.getAttribute('aria-label'), dis: e.disabled || e.readOnly || e.getAttribute('aria-disabled'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), val: (e.value || e.innerText || '').slice(0, 30) }; }));
// 翻译侧在右边：取 x 较大的、未禁用的两个框，上面的是标题
const editable = out.fields.filter(f => !f.dis && f.x > 600).sort((a, b) => a.y - b.y);
if (editable.length < 2) { await y.screenshot({ path: path.join(S.OUT, 'y15-nofields.png') }); return out; }
const clickType = async (f, text) => { await y.mouse.click(f.x + Math.min(60, f.w / 2), f.y + 10); await sleep(300); await y.keyboard.press('Control+A'); await y.keyboard.insertText(text); await sleep(500); };
await clickType(editable[0], title); await clickType(editable[1], desc);
out.after = await y.evaluate(() => [...document.querySelectorAll('textarea, [contenteditable=true]')].filter(e => e.offsetParent && e.getBoundingClientRect().x > 600).map(e => (e.value || e.innerText || '')).map(v => [v.length, v.slice(0, 50)]));
await y.screenshot({ path: path.join(S.OUT, 'y15-filled.png') });
if (out.after[0] && out.after[0][0] === title.length && out.after[1] && Math.abs(out.after[1][0] - desc.length) <= 2) {
  const publish = y.locator('ytcp-button, button').filter({ hasText: /^\s*发布\s*$/ }).filter({ visible: true }).last();
  await publish.click(); await sleep(4500); out.published = true;
}
out.want = [title.length, desc.length];
out.rows = await y.evaluate(() => [...document.querySelectorAll('ytgn-video-translation-row')].map(r => r.innerText.replace(/\n+/g, ' | ').slice(0, 120)));
await y.screenshot({ path: path.join(S.OUT, 'y15.png') });
return out;

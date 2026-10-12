// YouTube：给「中文（简体）」行上传带时间码的中文字幕并发布
const { path, EP, sleep } = S; const y = S.vars.yt; const out = {};
const LANG = S.vars.subLang || '中文（简体）', FILE = S.vars.subFile || 'final/youtube-zh/captions-zh.srt';
const row = y.locator('ytgn-video-translation-row').filter({ hasText: LANG }).first();
out.row = await row.count(); if (!out.row) return out;
await row.hover(); await sleep(600);
out.cells = await row.evaluate(r => [...r.querySelectorAll('td')].map(td => ({ cls: td.className, text: td.innerText.trim().replace(/\n+/g, ' | ').slice(0, 40), btns: [...td.querySelectorAll('ytcp-button, button, a')].map(b => (b.id || b.className.toString().slice(0, 30)) + ':' + b.innerText.trim()).slice(0, 4) })));
const cell = row.locator('td.tablecell-captions, td').nth(1);
const add = cell.locator('ytcp-button, button, a').filter({ hasText: /添加|修改|Add|Edit/ }).first();
out.addBtn = await add.count();
if (!out.addBtn) { await y.screenshot({ path: path.join(S.OUT, 'y07-noadd.png') }); return out; }
await add.click({ force: true }); await sleep(3000);
out.editor = await y.evaluate(() => { const e = document.querySelector('ytve-captions-editor-options-panel, ytve-captions-editor, ytcp-dialog[opened], ytve-modal-host'); return e ? e.tagName + ' => ' + e.innerText.replace(/\n+/g, ' | ').slice(0, 500) : null; });
await y.screenshot({ path: path.join(S.OUT, 'y07-editor.png') });
return out;

// YouTube：悬停后点铅笔图标进入字幕编辑器，看有哪些添加方式
const { path, sleep } = S; const y = S.vars.yt; const out = {};
const LANG = S.vars.subLang || '中文（简体）';
const row = y.locator('ytgn-video-translation-row').filter({ hasText: LANG }).first();
const cell = row.locator('td.tablecell-captions').first();
const b = await cell.boundingBox();
await y.mouse.move(b.x + 120, b.y + b.height / 2, { steps: 5 }); await sleep(900);
const icon = cell.locator('ytcp-icon-button, tp-yt-iron-icon, [role=button], button, a').filter({ visible: true }).first();
out.icons = await cell.evaluate(e => [...e.querySelectorAll('ytcp-icon-button, [role=button], button, a, tp-yt-iron-icon')].filter(x => x.offsetParent).map(x => x.tagName + '#' + x.id + '.' + x.className.toString().slice(0, 40) + ' aria=' + x.getAttribute('aria-label')).slice(0, 8));
if (await icon.count()) await icon.click(); else await y.mouse.click(b.x + 46, b.y + b.height / 2);
await sleep(4000);
out.url = y.url();
out.panel = await y.evaluate(() => [...document.querySelectorAll('ytve-captions-editor-options-panel, ytve-captions-editor, ytgn-captions-editor, ytve-modal-host, ytcp-dialog, tp-yt-paper-dialog')].filter(e => e.offsetParent && e.innerText.trim()).map(e => e.tagName + ' => ' + e.innerText.replace(/\n+/g, ' | ').slice(0, 500)).slice(0, 4));
await y.screenshot({ path: path.join(S.OUT, 'y10.png') });
return out;

// YouTube：点字幕单元格，看是否出现「添加」或直接进编辑器
const { path, sleep } = S; const y = S.vars.yt; const out = {};
const LANG = S.vars.subLang || '中文（简体）';
const row = y.locator('ytgn-video-translation-row').filter({ hasText: LANG }).first();
const cell = row.locator('td.tablecell-captions #cell-container').first();
await cell.hover(); await y.mouse.move(700, 219); await sleep(500); await y.mouse.move(760, 219, { steps: 6 }); await sleep(900);
out.hoverBtns = await row.evaluate(r => [...r.querySelectorAll('td.tablecell-captions *')].filter(e => e.offsetParent && e.children.length === 0 && e.innerText && e.innerText.trim()).map(e => e.tagName + '#' + e.id + ':' + e.innerText.trim()).slice(0, 10));
await y.screenshot({ path: path.join(S.OUT, 'y09-hover.png') });
const add = row.locator('td.tablecell-captions').locator('text=/^\\s*(添加|修改)\\s*$/').first();
if (await add.count()) { await add.click(); out.clicked = 'add'; } else { await cell.click(); out.clicked = 'cell'; }
await sleep(3500);
out.url = y.url();
out.panel = await y.evaluate(() => [...document.querySelectorAll('ytve-captions-editor-options-panel, ytve-captions-editor, ytcp-dialog, tp-yt-paper-dialog, ytve-modal-host, ytgn-captions-editor')].filter(e => e.offsetParent).map(e => e.tagName + ' => ' + e.innerText.replace(/\n+/g, ' | ').slice(0, 400)).slice(0, 4));
await y.screenshot({ path: path.join(S.OUT, 'y09.png') });
return out;

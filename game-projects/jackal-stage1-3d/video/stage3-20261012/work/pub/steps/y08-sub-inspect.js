// YouTube：只读，看字幕单元格悬停后的结构
const { path, sleep } = S; const y = S.vars.yt; const out = {};
const row = y.locator('ytgn-video-translation-row').filter({ hasText: '中文（简体）' }).first();
const cell = row.locator('td.tablecell-captions').first();
await cell.hover(); await sleep(1000);
out.html = await cell.evaluate(e => e.innerHTML.replace(/\s+/g, ' ').slice(0, 1800));
const box = await cell.boundingBox(); out.box = box;
await y.screenshot({ path: path.join(S.OUT, 'y08.png') });
return out;

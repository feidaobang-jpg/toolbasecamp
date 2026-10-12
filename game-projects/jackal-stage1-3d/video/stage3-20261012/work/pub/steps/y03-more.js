// YouTube：付费宣传=否、AI 使用=是（合成配音）、标签、视频语言=中文（简体）
const { path, sleep } = S; const y = S.vars.yt; const out = {};
const dlg = y.locator('ytcp-uploads-dialog');
out.radios = await y.evaluate(() => [...document.querySelectorAll('ytcp-uploads-dialog tp-yt-paper-radio-button')].map(e => ({ name: e.getAttribute('name'), checked: e.getAttribute('aria-checked'), text: e.innerText.trim().slice(0, 30) })));
const pick = async name => { const r = dlg.locator('tp-yt-paper-radio-button[name="' + name + '"]').first(); if (await r.count()) { await r.scrollIntoViewIfNeeded(); await r.click(); await sleep(500); return await r.getAttribute('aria-checked'); } return 'missing'; };
out.paid = await pick('VIDEO_HAS_NO_PAID_PRODUCT_PLACEMENT');
out.ai = await pick('VIDEO_HAS_ALTERED_CONTENT_YES');
// 标签
const tagInput = dlg.locator('ytcp-form-input-container#tags-container input#text-input, #tags-container input').first();
out.tagInput = await tagInput.count();
if (out.tagInput) { await tagInput.scrollIntoViewIfNeeded(); await tagInput.click(); for (const t of S.vars.ytMeta.tags) { await y.keyboard.insertText(t); await sleep(150); await y.keyboard.type(','); await sleep(350); } }
out.tags = await y.evaluate(() => [...document.querySelectorAll('ytcp-uploads-dialog #tags-container ytcp-chip, ytcp-uploads-dialog #tags-container .chip')].map(e => e.innerText.trim()));
// 语言
const lang = dlg.locator('#language-input ytcp-dropdown-trigger, ytcp-form-language-input ytcp-dropdown-trigger').first();
out.langTrigger = await lang.count();
if (out.langTrigger) {
  await lang.scrollIntoViewIfNeeded(); await lang.click(); await sleep(1200);
  const search = y.locator('ytcp-text-menu input, tp-yt-paper-dialog input#search-input, #search-input').filter({ visible: true }).first();
  if (await search.count()) { await search.click(); await y.keyboard.insertText('中文（简体）'); await sleep(1000); }
  const item = y.locator('tp-yt-paper-item').filter({ hasText: /^\s*中文（简体）\s*$/ }).filter({ visible: true }).first();
  out.langItem = await item.count();
  if (out.langItem) { await item.click(); await sleep(800); } else { out.langOptions = await y.evaluate(() => [...document.querySelectorAll('tp-yt-paper-item')].filter(e => e.offsetParent).map(e => e.innerText.trim()).filter(t => /中文/.test(t)).slice(0, 8)); await y.keyboard.press('Escape'); }
  out.lang = (await lang.innerText()).replace(/\n+/g, ' ').trim();
}
out.radiosAfter = await y.evaluate(() => [...document.querySelectorAll('ytcp-uploads-dialog tp-yt-paper-radio-button')].filter(e => e.getAttribute('aria-checked') === 'true').map(e => e.getAttribute('name')));
out.category = await y.evaluate(() => (document.querySelector('ytcp-uploads-dialog #category') || { innerText: '' }).innerText.replace(/\n+/g, ' ').slice(0, 60));
await y.screenshot({ path: path.join(S.OUT, 'y03.png') });
return out;

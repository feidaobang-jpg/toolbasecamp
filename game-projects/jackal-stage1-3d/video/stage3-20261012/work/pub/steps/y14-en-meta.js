// YouTube：英语行的「标题和说明」——填英文标题与说明并发布
const { path, fs, EP, sleep } = S; const y = S.vars.yt; const out = {};
const raw = fs.readFileSync(path.join(EP, 'final/youtube-zh/English-localizations.txt'), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
const title = raw.split('[Title]\n')[1].split('\n\n')[0].trim();
const desc = raw.split('[Description]\n')[1].trim();
const row = y.locator('ytgn-video-translation-row').filter({ hasText: /^\s*英语/ }).first();
const cell = row.locator('td.tablecell-metadata').first();
const b = await cell.boundingBox();
await y.mouse.move(b.x + 120, b.y + b.height / 2, { steps: 5 }); await sleep(900);
out.icons = await cell.evaluate(e => [...e.querySelectorAll('ytcp-icon-button, [role=button], button, a')].filter(x => x.offsetParent).map(x => x.tagName + '#' + x.id + ' aria=' + x.getAttribute('aria-label')).slice(0, 6));
const icon = cell.locator('ytcp-icon-button, [role=button], button, a').filter({ visible: true }).first();
if (await icon.count()) await icon.click(); else await y.mouse.click(b.x + 46, b.y + b.height / 2);
await sleep(3000);
const dlg = y.locator('ytcp-dialog, tp-yt-paper-dialog').filter({ visible: true }).filter({ hasText: /标题/ }).last();
out.dialog = (await dlg.innerText().catch(() => '')).replace(/\n+/g, ' | ').slice(0, 500);
out.fields = await y.evaluate(() => [...document.querySelectorAll('ytcp-dialog textarea, ytcp-dialog [contenteditable=true], ytcp-dialog input')].filter(e => e.offsetParent).map(e => ({ tag: e.tagName, id: e.id, aria: e.getAttribute('aria-label'), ph: e.getAttribute('placeholder'), dis: e.disabled || e.getAttribute('aria-disabled'), val: (e.value || e.innerText || '').slice(0, 40) })));
const tField = y.locator('ytcp-dialog #translated-title textarea, ytcp-dialog #translated-title [contenteditable=true], ytcp-dialog #translated-title #textbox').filter({ visible: true }).first();
const dField = y.locator('ytcp-dialog #translated-description textarea, ytcp-dialog #translated-description [contenteditable=true], ytcp-dialog #translated-description #textbox').filter({ visible: true }).first();
out.has = [await tField.count(), await dField.count()];
if (out.has[0] && out.has[1]) {
  await tField.click(); await y.keyboard.press('Control+A'); await y.keyboard.insertText(title); await sleep(400);
  await dField.click(); await y.keyboard.press('Control+A'); await y.keyboard.insertText(desc); await sleep(800);
  out.back = [await tField.inputValue().catch(() => tField.innerText()), (await dField.inputValue().catch(() => dField.innerText())).length, desc.length];
  await y.screenshot({ path: path.join(S.OUT, 'y14-filled.png') });
  const publish = y.locator('ytcp-dialog #publish-button, ytcp-dialog ytcp-button').filter({ hasText: /^\s*发布\s*$/ }).filter({ visible: true }).first();
  if (await publish.count() && out.back[0] === title) { await publish.click(); await sleep(4500); out.published = true; }
}
out.rows = await y.evaluate(() => [...document.querySelectorAll('ytgn-video-translation-row')].map(r => r.innerText.replace(/\n+/g, ' | ').slice(0, 120)));
await y.screenshot({ path: path.join(S.OUT, 'y14.png') });
return out;

// 腾讯文档推流表：只读，回到 A 列截图核对第 385 行整行外观
const { path, sleep } = S; const d = S.vars.doc;
const box = d.locator('input.bar-label').first();
await box.click(); await d.keyboard.press('Control+A'); await d.keyboard.type('A385', { delay: 15 }); await d.keyboard.press('Enter'); await sleep(1500);
await d.screenshot({ path: path.join(S.OUT, 'd06-row.png') });
return { at: await box.inputValue(), save: await d.evaluate(() => (document.body.innerText.match(/最近保存[^\n]{0,20}|上次修改[^\n]{0,30}/g) || []).slice(0, 2)) };

// 腾讯文档推流表：只读——逐行读 360 之后，确认真实末行（同时读回名称框，防止跳转失败读到旧格）
const { path, sleep } = S; const d = S.vars.doc; const out = { rows: {} };
const read = async addr => {
  const box = d.locator('input.bar-label').first();
  await box.click(); await d.keyboard.press('Control+A'); await d.keyboard.type(addr, { delay: 15 }); await d.keyboard.press('Enter'); await sleep(380);
  const at = await box.inputValue();
  const v = (await d.evaluate(() => { const f = document.querySelector('.formula-bar .formula-input, .formula-bar'); return f ? f.innerText : null; }) || '').replace(/\n/g, ' ').trim();
  return at === addr ? v : '<<跳转失败 ' + at + '>>';
};
const from = Number(S.vars.tailFrom || 361), to = from + 34;
for (let r = from; r <= to; r++) { const b = await read('B' + r); const a = b.startsWith('<<') ? '' : await read('A' + r); out.rows[r] = [a, b.slice(0, 64)]; if (b.startsWith('<<')) break; }
await d.screenshot({ path: path.join(S.OUT, 'd02.png') });
return out;

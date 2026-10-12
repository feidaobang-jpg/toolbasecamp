// B 站：逐个添加本期标签（每个等它出现再填下一个）
const { page, path, sleep } = S;
const out = { added: [] };
const current = () => page.evaluate(() => [...document.querySelectorAll('.label-item-v2-container')].filter(e => e.offsetParent).map(e => e.innerText.trim()));
const WANT = ['bilibilitoy', '赤色要塞', '独立游戏', '游戏开发', '射击游戏', 'AI', 'Claude开发'];
const input = page.locator('input[placeholder="按回车键Enter创建标签"]').first();
for (const name of WANT) {
  if ((await current()).includes(name)) { out.added.push(name + ':already'); continue; }
  await input.scrollIntoViewIfNeeded(); await input.click(); await input.fill(''); await page.keyboard.type(name, { delay: 70 }); await sleep(600); await page.keyboard.press('Enter');
  let ok = false;
  for (let k = 0; k < 16 && !ok; k++) { await sleep(400); ok = (await current()).includes(name); }
  const toast = await page.evaluate(() => [...document.querySelectorAll('.bcc-message, .bcc-toast, [class*=message], [class*=toast]')].filter(e => e.offsetParent).map(e => e.innerText.trim().slice(0, 80)).filter(Boolean).slice(0, 3));
  out.added.push(name + (ok ? ':ok' : ':MISSING') + (toast.length ? ' ' + JSON.stringify(toast) : ''));
  if (!ok) await input.fill('');
  await sleep(1000);
}
out.final = await current();
await page.screenshot({ path: path.join(S.OUT, 'b06.png') });
return out;

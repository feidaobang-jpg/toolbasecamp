// B 站：选「含AI生成内容」；去掉自动带上的无关标签；逐个添加本期标签（每个等它出现再填下一个）
const { page, path, sleep } = S;
const out = {};
// 创作声明
const opt = page.locator('.bcc-option', { hasText: /^含AI生成内容$/ }).first();
if (!(await opt.isVisible().catch(() => false))) { await page.locator('input[placeholder="请选择符合您视频内容的创作声明"]').click(); await sleep(800); }
await opt.click(); await sleep(800);
out.statement = await page.locator('input[placeholder="请选择符合您视频内容的创作声明"]').inputValue();
// 标签区
const current = () => page.evaluate(() => [...document.querySelectorAll('.label-item-v2-container')].map(e => e.innerText.trim()));
out.tagHtml = await page.evaluate(() => { const e = document.querySelector('.label-item-v2-container'); return e ? e.outerHTML.slice(0, 500) : null; });
const WANT = ['bilibilitoy', '赤色要塞', '独立游戏', '游戏开发', '射击游戏', 'AI', 'Claude开发'];
for (const name of await current()) {
  if (WANT.includes(name)) continue;
  const item = page.locator('.label-item-v2-container', { hasText: new RegExp('^' + name + '$') }).first();
  await item.scrollIntoViewIfNeeded(); await item.hover(); await sleep(200);
  const close = item.locator('.label-item-v2-close, [class*=close], svg, i').first();
  if (await close.count()) await close.click({ force: true }); else await item.click();
  await sleep(700);
}
out.afterRemove = await current();
const input = page.locator('input[placeholder="按回车键Enter创建标签"]');
out.added = [];
for (const name of WANT) {
  if ((await current()).includes(name)) { out.added.push(name + ':already'); continue; }
  await input.click(); await input.fill(''); await page.keyboard.type(name, { delay: 60 }); await sleep(500); await page.keyboard.press('Enter');
  let ok = false;
  for (let k = 0; k < 16 && !ok; k++) { await sleep(400); ok = (await current()).includes(name); }
  const toast = await page.evaluate(() => [...document.querySelectorAll('.bcc-message, .bcc-toast, [class*=message], [class*=toast]')].filter(e => e.offsetParent).map(e => e.innerText.trim().slice(0, 80)).filter(Boolean).slice(0, 3));
  out.added.push(name + (ok ? ':ok' : ':MISSING') + (toast.length ? ' ' + JSON.stringify(toast) : ''));
  if (!ok) { await input.fill(''); }
  await sleep(900);
}
out.final = await current();
await page.screenshot({ path: path.join(S.OUT, 'b04.png') });
return out;

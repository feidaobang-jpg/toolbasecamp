// YouTube：添加语言「英语」，看英语行结构
const { path, sleep } = S; const y = S.vars.yt; const out = {};
if (!(await y.locator('ytgn-video-translation-row').filter({ hasText: /^\s*英语/ }).count())) {
  await y.locator('#add-translations-button').first().click(); await sleep(1500);
  const items = y.locator('tp-yt-paper-item').filter({ visible: true });
  out.itemCount = await items.count();
  const en = items.filter({ hasText: /^\s*英语\s*$/ }).first();
  out.en = await en.count();
  if (out.en) { await en.scrollIntoViewIfNeeded(); await en.click(); await sleep(2500); }
  else { out.sample = await y.evaluate(() => [...document.querySelectorAll('tp-yt-paper-item')].filter(e => e.offsetParent).map(e => e.innerText.trim()).filter(t => /英/.test(t)).slice(0, 10)); await y.keyboard.press('Escape'); }
}
out.rows = await y.evaluate(() => [...document.querySelectorAll('ytgn-video-translation-row')].map(r => r.innerText.replace(/\n+/g, ' | ').slice(0, 120)));
await y.screenshot({ path: path.join(S.OUT, 'y12.png') });
return out;

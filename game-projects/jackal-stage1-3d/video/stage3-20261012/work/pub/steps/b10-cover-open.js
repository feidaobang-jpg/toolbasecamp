// B 站：打开封面编辑，先看界面
const { page, path, sleep } = S;
const add = page.locator('.cover-empty-pill, .cover-empty').first();
await add.scrollIntoViewIfNeeded(); await add.click(); await sleep(2500);
const info = await page.evaluate(() => ({
  files: [...document.querySelectorAll('input[type=file]')].map(e => ({ accept: e.accept, parent: e.parentElement.className.toString().slice(0, 80), vis: !!e.offsetParent })),
  dialog: [...document.querySelectorAll('[class*=cover-editor], [class*=cover-select], [class*=cover-cut], [class*=dialog], [class*=modal]')].filter(e => e.offsetParent).map(e => e.className.toString().slice(0, 70) + ' => ' + e.innerText.trim().replace(/\n+/g, ' | ').slice(0, 260)).slice(0, 8),
}));
await page.screenshot({ path: path.join(S.OUT, 'b10.png') });
return info;

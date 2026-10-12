// B 站：标题 + 创作声明下拉（先只打开看选项）
const { page, path, sleep } = S;
const TITLE = '一辆吉普单挑一艘战舰！赤色要塞3D第三关上线，直接开玩';
const t = page.locator('input[placeholder="请输入稿件标题"]');
await t.click(); await t.fill(''); await t.fill(TITLE); await sleep(400);
const sel = page.locator('input[placeholder="请选择符合您视频内容的创作声明"]');
await sel.scrollIntoViewIfNeeded(); await sel.click(); await sleep(1200);
const options = await page.evaluate(() => [...document.querySelectorAll('.bcc-select-list-wrap .bcc-option, .bcc-option, [class*=select-option]')].filter(e => e.offsetParent).map(e => e.innerText.trim().slice(0, 80)));
await page.screenshot({ path: path.join(S.OUT, 'b03.png') });
return { title: await t.inputValue(), options };

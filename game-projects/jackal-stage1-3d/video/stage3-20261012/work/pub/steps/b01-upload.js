// B 站：打开投稿页并开始上传成片
const { page, path, EP, sleep } = S;
await page.goto('https://member.bilibili.com/platform/upload/video/frame', { waitUntil: 'domcontentloaded' });
await sleep(4000);
const inputs = await page.locator('input[type=file]').count();
const video = path.join(EP, 'final/bilibili-zh/gameplay-zh-final.mp4');
await page.locator('input[type=file]').first().setInputFiles(video);
await sleep(8000);
await page.screenshot({ path: path.join(S.OUT, 'b01.png') });
return { url: page.url(), inputs, text: (await page.evaluate(() => document.body.innerText.slice(0, 1500))).replace(/\n+/g, ' | ') };

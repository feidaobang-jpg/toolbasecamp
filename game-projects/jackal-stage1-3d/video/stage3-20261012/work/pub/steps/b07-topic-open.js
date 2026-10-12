// B 站：打开话题搜索，搜「哔哩哔哩Toy创意挑战」，先只看结果
const { page, path, sleep } = S;
const more = page.locator('.tag-topic-wrp', { hasText: '搜索更多话题' }).locator('text=搜索更多话题').first();
await more.scrollIntoViewIfNeeded(); await more.click(); await sleep(1500);
const boxes = await page.evaluate(() => [...document.querySelectorAll('input')].filter(e => e.offsetParent).map(e => ({ ph: e.placeholder, cls: e.className })));
const search = page.locator('input[placeholder*="话题"]').first();
let typed = false;
if (await search.count()) { await search.click(); await page.keyboard.type('哔哩哔哩Toy创意挑战', { delay: 50 }); typed = true; await sleep(2500); }
const results = await page.evaluate(() => [...document.querySelectorAll('[class*=topic] [class*=item], [class*=topic-item], [class*=search-item], [class*=topic-list] > *')].filter(e => e.offsetParent).map(e => e.className.toString().slice(0, 60) + ' => ' + e.innerText.trim().slice(0, 100).replace(/\n+/g, ' | ')).slice(0, 14));
await page.screenshot({ path: path.join(S.OUT, 'b07.png') });
return { boxes, typed, results };

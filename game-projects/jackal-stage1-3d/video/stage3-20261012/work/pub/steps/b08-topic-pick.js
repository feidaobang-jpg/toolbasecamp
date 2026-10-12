// B 站：在话题对话框里搜索并选中「哔哩哔哩Toy创意挑战」
const { page, path, sleep } = S;
const NAME = '哔哩哔哩Toy创意挑战';
const search = page.locator('input.bcc-search-input').first();
await search.click(); await search.fill(''); await page.keyboard.type(NAME, { delay: 50 }); await sleep(600); await page.keyboard.press('Enter'); await sleep(2500);
const items = await page.evaluate(() => [...document.querySelectorAll('.dialog-item')].filter(e => e.offsetParent).map(e => e.innerText.trim().replace(/\n+/g, ' | ').slice(0, 100)));
const hit = page.locator('.dialog-item', { hasText: NAME }).first();
let clicked = false;
if (await hit.count()) { await hit.click(); clicked = true; await sleep(1500); }
const after = await page.evaluate(() => ({
  tags: [...document.querySelectorAll('.label-item-v2-container')].filter(e => e.offsetParent).map(e => e.innerText.trim()),
  topicArea: (document.querySelector('.tag-topic-wrp') || { innerText: '' }).innerText.replace(/\n+/g, ' | ').slice(0, 300),
  tagArea: (document.querySelector('.tag-container, .video-tag, [class*=tag-wrp]') || { innerText: '' }).innerText.replace(/\n+/g, ' | ').slice(0, 300),
  dialogOpen: [...document.querySelectorAll('.dialog-item')].filter(e => e.offsetParent).length,
}));
await page.screenshot({ path: path.join(S.OUT, 'b08.png') });
return { items, clicked, after };

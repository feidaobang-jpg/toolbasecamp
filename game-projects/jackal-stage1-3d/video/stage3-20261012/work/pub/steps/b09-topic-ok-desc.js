// B 站：确认话题；逐行填写简介并读回
const { page, path, fs, EP, sleep } = S;
const out = {};
const ok = page.locator('.bcc-dialog, [class*=dialog]').locator('button, .bcc-button', { hasText: /^\s*确定\s*$/ }).first();
if (await ok.isVisible().catch(() => false)) { await ok.click(); await sleep(1500); }
out.topicArea = await page.evaluate(() => (document.querySelector('.tag-topic-wrp') || document.querySelector('[class*=topic]') || { innerText: '' }).innerText.replace(/\n+/g, ' | ').slice(0, 200));
out.tagArea = await page.evaluate(() => { const lab = [...document.querySelectorAll('.label-item-v2-container')].filter(e => e.offsetParent).map(e => e.innerText.trim()); return lab; });
const raw = fs.readFileSync(path.join(EP, 'final/bilibili-zh/投稿文案.txt'), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
let desc = raw.split('【简介】\n')[1].split('\n\n【置顶评论】')[0].trim();
desc = desc.replace('本作用 Claude 辅助开发，是《赤色要塞》的粉丝向非官方重制。', '本作用 Claude 辅助开发，解说为合成语音，是《赤色要塞》的粉丝向非官方重制。');
const lines = desc.split('\n');
const ed = page.locator('.ql-editor').first();
await ed.scrollIntoViewIfNeeded(); await ed.click(); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); await sleep(300);
for (let i = 0; i < lines.length; i++) { await page.keyboard.insertText(lines[i]); await sleep(250); if (i < lines.length - 1) { await page.keyboard.press('Enter'); await sleep(200); } }
await sleep(800);
const back = await page.evaluate(() => [...document.querySelector('.ql-editor').querySelectorAll('p')].map(p => p.innerText.replace(/​|﻿/g, '')));
out.match = back.join('\n') === desc; out.lines = back.length; out.chars = desc.length; out.back = back;
S.vars.desc = desc;
await page.screenshot({ path: path.join(S.OUT, 'b09.png') });
return out;

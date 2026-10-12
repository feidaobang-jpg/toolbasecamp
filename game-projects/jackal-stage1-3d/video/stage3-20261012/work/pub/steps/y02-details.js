// YouTube：填标题、说明、缩略图、非儿童内容；展开「显示更多」看其余字段
const { path, fs, EP, sleep } = S; const y = S.vars.yt; const out = {};
const raw = fs.readFileSync(path.join(EP, 'final/youtube-zh/投稿文案.txt'), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
const title = raw.split('【标题】\n')[1].split('\n\n')[0].trim();
const desc = raw.split('【简介】\n')[1].split('\n\n【标签】')[0].trim();
const tags = raw.split('【标签】\n')[1].split('\n\n')[0].trim().split('\n');
S.vars.ytMeta = { title, desc, tags };
const dlg = y.locator('ytcp-uploads-dialog');
const tbox = dlg.locator('#title-textarea #textbox').first();
await tbox.click(); await y.keyboard.press('Control+A'); await y.keyboard.press('Backspace'); await y.keyboard.insertText(title); await sleep(500);
const dbox = dlg.locator('#description-textarea #textbox').first();
await dbox.click(); await y.keyboard.press('Control+A'); await y.keyboard.press('Backspace');
const L = desc.split('\n');
for (let i = 0; i < L.length; i++) { await y.keyboard.insertText(L[i]); await sleep(150); if (i < L.length - 1) { await y.keyboard.press('Enter'); await sleep(120); } }
await sleep(600);
out.title = (await tbox.innerText()).trim(); out.titleOk = out.title === title;
out.descBack = (await dbox.innerText()).replace(/\n+$/, ''); out.descOk = out.descBack.replace(/\n{2,}/g, '\n') === desc;
// 缩略图
const thumb = dlg.locator('input[type=file]#file-loader, input[type=file][accept*="image"]').first();
out.thumbInputs = await thumb.count();
if (out.thumbInputs) { await thumb.setInputFiles(path.join(EP, 'final/youtube-zh/cover-zh-16x9.jpg')); await sleep(5000); }
// 非儿童内容
const notKids = dlg.locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]').first();
await notKids.scrollIntoViewIfNeeded(); await notKids.click(); await sleep(600);
out.notKids = await notKids.getAttribute('aria-checked');
// 展开更多
const more = dlg.locator('#toggle-button, ytcp-button#toggle-button').filter({ hasText: /显示更多|展开|Show more/ }).first();
if (await more.count()) { await more.click(); await sleep(1500); }
out.moreText = await y.evaluate(() => { const d = document.querySelector('ytcp-uploads-dialog'); const t = d.innerText.replace(/\n+/g, ' | '); const i = t.indexOf('付费宣传'); return t.slice(Math.max(0, i - 50), i + 1800); });
out.upload = await y.evaluate(() => (document.querySelector('ytcp-uploads-dialog .progress-label, ytcp-video-upload-progress') || { innerText: '' }).innerText.replace(/\n+/g, ' ').slice(0, 120));
await y.screenshot({ path: path.join(S.OUT, 'y02.png') });
return out;

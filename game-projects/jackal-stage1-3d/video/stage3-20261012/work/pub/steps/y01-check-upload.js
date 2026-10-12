// YouTube：核对频道与已有视频（防重复），然后打开上传对话框并选择成片
const { path, EP, sleep } = S; const y = S.vars.yt; const out = {};
await y.bringToFront();
await y.goto('https://studio.youtube.com/channel/UCha4DVE3db0P1eJvu4qsLJg/videos/upload', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(7000);
out.url = y.url().slice(0, 120);
out.channel = await y.evaluate(() => (document.querySelector('#entity-name, .entity-name, ytcp-navigation-drawer #entity-name') || { innerText: '' }).innerText.trim());
out.videos = await y.evaluate(() => [...document.querySelectorAll('#video-title, a#video-title')].map(e => e.innerText.trim().slice(0, 60)).slice(0, 12));
if (out.videos.some(t => /第三关|港口/.test(t) && /赤色要塞/.test(t))) { out.stopped = '已有疑似本期视频，未上传'; return out; }
const create = y.locator('#create-icon, ytcp-button#create-icon, [aria-label="创建"], [aria-label="Create"]').first();
out.createBtn = await create.count();
if (out.createBtn) { await create.click(); await sleep(1200); const item = y.locator('tp-yt-paper-item, ytcp-text-menu tp-yt-paper-item').filter({ hasText: /上传视频|Upload videos/ }).first(); out.uploadItem = await item.count(); if (out.uploadItem) { await item.click(); await sleep(2500); } }
out.fileInputs = await y.locator('input[type=file]').count();
if (out.fileInputs) { await y.locator('input[type=file]').first().setInputFiles(path.join(EP, 'final/youtube-zh/gameplay-youtube-final.mp4')); await sleep(10000); }
out.dialog = await y.evaluate(() => { const dlg = document.querySelector('ytcp-uploads-dialog'); return dlg ? dlg.innerText.replace(/\n+/g, ' | ').slice(0, 900) : null; });
await y.screenshot({ path: path.join(S.OUT, 'y01.png') });
return out;

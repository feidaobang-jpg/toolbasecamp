// 抖音：先看作品管理防重复，再到上传页选择成片
const { path, EP, sleep } = S; const t = S.vars.dy; const out = {};
await t.bringToFront();
await t.goto('https://creator.douyin.com/creator-micro/content/manage', { waitUntil: 'domcontentloaded' }); await sleep(7000);
out.recent = await t.evaluate(() => (document.body.innerText.match(/[^\n]*(赤色要塞|战舰)[^\n]*/g) || []).slice(0, 5));
out.manage = (await t.evaluate(() => document.body.innerText.slice(0, 700))).replace(/\n+/g, ' | ');
if (out.recent.some(s => /战舰/.test(s))) { out.stopped = '作品管理里已有疑似本期视频，未上传'; return out; }
await t.goto('https://creator.douyin.com/creator-micro/content/upload', { waitUntil: 'domcontentloaded' }); await sleep(6000);
out.inputs = await t.evaluate(() => [...document.querySelectorAll('input[type=file]')].map(e => ({ accept: e.accept, multiple: e.multiple })));
const vid = t.locator('input[type=file]').first();
await vid.setInputFiles(path.join(EP, 'final/douyin-zh/gameplay-zh-final.mp4'));
await sleep(12000);
out.url = t.url();
out.text = (await t.evaluate(() => document.body.innerText.slice(0, 1800))).replace(/\n+/g, ' | ');
await t.screenshot({ path: path.join(S.OUT, 't02.png') });
return out;

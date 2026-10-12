// 抖音：只读，打开新片公开页看能否播放、标题与声明是否在线
const { path, sleep } = S; const t = S.vars.dy; const out = {};
await t.goto('https://www.douyin.com/video/7695767660625202470', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(10000);
out.url = t.url();
out.video = await t.evaluate(() => { const v = document.querySelector('video'); return v ? { ready: v.readyState, duration: Math.round(v.duration || 0), src: !!(v.currentSrc || v.src) } : null; });
out.text = await t.evaluate(() => (document.body.innerText.match(/一辆吉普单挑一艘战舰[^\n]{0,60}|作者声明[^\n]{0,20}|#赤色要塞|视频不存在|作品不见了/g) || []).slice(0, 6));
await t.screenshot({ path: path.join(S.OUT, 't23.png') });
await t.goto('about:blank').catch(() => { });
return out;

// 抖音：只读，看创作者中心是否已登录
const { path, sleep } = S; const t = S.vars.dy; const out = {};
out.url = t.url();
out.loggedOut = await t.evaluate(() => /扫码登录|验证码登录/.test(document.body.innerText)).catch(() => null);
out.text = (await t.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '')).replace(/\n+/g, ' | ');
await t.screenshot({ path: path.join(S.OUT, 't01.png') }).catch(() => { });
return out;

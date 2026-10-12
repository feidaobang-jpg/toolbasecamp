// 只读：另开两个标签页看抖音创作者中心与 YouTube Studio 的登录状态（不输入任何账号信息）
const { ctx, path, sleep } = S;
const out = {};
S.vars.dy = S.vars.dy || await ctx.newPage();
await S.vars.dy.goto('https://creator.douyin.com/creator-micro/home', { waitUntil: 'domcontentloaded' }).catch(e => out.dyErr = String(e).slice(0, 200));
await sleep(5000);
out.douyin = { url: S.vars.dy.url(), loggedOut: await S.vars.dy.evaluate(() => /扫码登录|验证码登录/.test(document.body.innerText)).catch(() => null) };
await S.vars.dy.screenshot({ path: path.join(S.OUT, 'l01-douyin.png') }).catch(() => { });
S.vars.yt = S.vars.yt || await ctx.newPage();
await S.vars.yt.goto('https://studio.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => out.ytErr = String(e).slice(0, 200));
await sleep(6000);
out.youtube = { url: S.vars.yt.url().slice(0, 140), title: await S.vars.yt.title().catch(() => null) };
await S.vars.yt.screenshot({ path: path.join(S.OUT, 'l01-youtube.png') }).catch(() => { });
return out;

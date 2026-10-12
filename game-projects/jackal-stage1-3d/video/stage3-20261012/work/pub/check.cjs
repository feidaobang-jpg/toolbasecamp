// 只读：核对三个平台在投稿配置里的登录账号，并查 B 站最近稿件防止重复投稿。
const { open, save, sleep, biliGet } = require('./lib.cjs');
(async () => {
  const ctx = await open(); const page = ctx.pages()[0] || await ctx.newPage(); const r = {};
  try {
    await page.goto('https://member.bilibili.com/platform/home', { waitUntil: 'domcontentloaded' }); await sleep(2500);
    const nav = await biliGet(page, 'https://api.bilibili.com/x/web-interface/nav');
    r.bilibili = { isLogin: nav.data && nav.data.isLogin, mid: nav.data && nav.data.mid, uname: nav.data && nav.data.uname, url: page.url() };
    if (r.bilibili.isLogin) {
      const arc = await biliGet(page, 'https://member.bilibili.com/x/web/archives?status=is_pubing%2Cpubed%2Cnot_pubed&pn=1&ps=10&coop=1&interactive=1');
      r.bilibili.recent = ((arc.data && arc.data.arc_audits) || []).map(a => ({ bvid: a.Archive.bvid, title: a.Archive.title, state: a.Archive.state, state_desc: a.Archive.state_desc, ptime: a.Archive.ptime }));
    }
  } catch (e) { r.bilibili = { error: String(e).slice(0, 300) }; }
  try {
    await page.goto('https://creator.douyin.com/creator-micro/home', { waitUntil: 'domcontentloaded' }); await sleep(6000);
    r.douyin = { url: page.url(), title: await page.title(), text: (await page.evaluate(() => document.body.innerText.slice(0, 400))).replace(/\s+/g, ' ') };
  } catch (e) { r.douyin = { error: String(e).slice(0, 300) }; }
  try {
    await page.goto('https://studio.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }); await sleep(6000);
    r.youtube = { url: page.url().slice(0, 120), title: await page.title() };
  } catch (e) { r.youtube = { error: String(e).slice(0, 300) }; }
  save('check.json', r); console.log(JSON.stringify(r, null, 1));
  await ctx.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });

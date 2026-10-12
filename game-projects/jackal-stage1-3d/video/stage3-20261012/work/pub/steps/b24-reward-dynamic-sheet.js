// B 站：只读——流量奖励可用券、个人空间自动动态、旧稿简介公开状态；腾讯文档推流表是否可编辑
const { page, path, lib, sleep } = S;
const out = {};
const old = await lib.biliGet(page, 'https://api.bilibili.com/x/web-interface/view?bvid=BV1EyHz6wE5u');
out.oldDesc = { chars: old.data.desc.length, head: old.data.desc.slice(0, 60), hasUpdate: old.data.desc.includes('v0.11.0'), state: old.data.state };
const dyn = await lib.biliGet(page, 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=16214353&timezone_offset=-480');
out.dynamic = ((dyn.data && dyn.data.items) || []).slice(0, 6).map(i => { const a = i.modules && i.modules.module_dynamic && i.modules.module_dynamic.major && i.modules.module_dynamic.major.archive; const t = i.modules && i.modules.module_dynamic && i.modules.module_dynamic.topic; return { type: i.type, bvid: a && a.bvid, title: a && a.title.slice(0, 30), topic: t && t.name }; });
await page.goto('https://member.bilibili.com/york/flow-reward/?navhide=1', { waitUntil: 'domcontentloaded' }); await sleep(6000);
out.reward = (await page.evaluate(() => document.body.innerText.slice(0, 1500))).replace(/\n+/g, ' | ');
await page.screenshot({ path: path.join(S.OUT, 'b24-reward.png') });
S.vars.doc = S.vars.doc || await S.ctx.newPage();
await S.vars.doc.goto('https://docs.qq.com/sheet/DU3dnQkR1WG5RUnp0?tab=7mm8hw', { waitUntil: 'domcontentloaded' }).catch(e => out.docErr = String(e).slice(0, 150));
await sleep(9000);
out.doc = await S.vars.doc.evaluate(() => ({ cls: document.body ? document.body.className.slice(0, 200) : null, guest: document.body ? /skeleton-guest-mode/.test(document.body.className) : null, text: document.body ? (document.body.innerText.match(/只能查看|登录腾讯文档|登录|申请编辑权限|可编辑/g) || []).slice(0, 6) : null })).catch(e => ({ err: String(e).slice(0, 150) }));
await S.vars.doc.screenshot({ path: path.join(S.OUT, 'b24-doc.png') }).catch(() => { });
return out;

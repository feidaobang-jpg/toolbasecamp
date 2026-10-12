// 抖音：只读——回读旧视频说明（编辑页）与新片审核状态（作品管理）
const { path, sleep } = S; const t = S.vars.dy; const out = {};
await t.goto('https://creator.douyin.com/creator-micro/content/post/video?mid=7694182043927760191&enter_from=edit_item', { waitUntil: 'domcontentloaded' }); await sleep(8000);
const d = await t.locator('.zone-container[contenteditable=true]').first().innerText().catch(() => '');
out.old = { hasNew: d.includes('v0.11.0'), hasOld: d.includes('v0.10.3'), head: d.replace(/​/g, '').slice(0, 70) };
const found = [];
const onResp = async r => { if (!/work_list/.test(r.url())) return; try { const j = await r.json(); for (const a of (j.aweme_list || [])) if (a.aweme_id === '7695767660625202470') found.push(a.status); } catch (e) { } };
t.on('response', onResp);
await t.goto('https://creator.douyin.com/creator-micro/content/manage', { waitUntil: 'domcontentloaded' }); await sleep(8000);
t.off('response', onResp);
out.newStatus = found[0] || null;
out.row = await t.evaluate(() => { const txt = document.body.innerText; const i = txt.indexOf('一辆吉普单挑一艘战舰'); const j = txt.indexOf('删除作品', i); return i < 0 ? null : txt.slice(j, j + 60).replace(/\n+/g, ' | '); });
return out;

// 抖音：只读，刷新作品管理，从列表接口里找到本期作品的 ID 与状态
const { path, sleep } = S; const t = S.vars.dy; const out = { apis: [] };
const found = [];
const onResp = async r => { const u = r.url(); if (!/work_list|aweme\/post|item\/list|creator\/item/.test(u)) return; try { const j = await r.json(); const list = j.aweme_list || j.item_info_list || (j.data && (j.data.aweme_list || j.data.items || j.data.list)) || []; out.apis.push(u.split('?')[0] + ' n=' + list.length); for (const a of list) { const desc = a.desc || a.title || (a.item && a.item.desc) || ''; if (/战舰/.test(desc)) found.push({ id: a.aweme_id || a.item_id || a.id, desc: desc.slice(0, 60), status: a.status && (a.status.review_status !== undefined ? a.status : a.status), create_time: a.create_time, duration: a.duration, public: a.status && a.status.private_status }); } } catch (e) { } };
t.on('response', onResp);
await t.goto('https://creator.douyin.com/creator-micro/content/manage', { waitUntil: 'domcontentloaded' }); await sleep(9000);
t.off('response', onResp);
out.found = found.slice(0, 3);
out.first = await t.evaluate(() => { const txt = document.body.innerText; const i = txt.indexOf('导出数据'); return txt.slice(i, i + 700).replace(/\n+/g, ' | '); });
await t.screenshot({ path: path.join(S.OUT, 't12.png') });
return out;

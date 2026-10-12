// B 站：新稿件——核对标签/话题，查重后发布玩法置顶评论并置顶，读回
const { page, path, fs, EP, sleep, lib } = S;
const BV = 'BV1avpd6KE3h', AID = 117428012981011;
const out = {};
await page.goto('https://www.bilibili.com/video/' + BV + '/', { waitUntil: 'domcontentloaded' }); await sleep(5000);
const nav = await lib.biliGet(page, 'https://api.bilibili.com/x/web-interface/nav'); out.me = { mid: nav.data.mid, uname: nav.data.uname };
if (nav.data.mid !== 16214353) throw new Error('账号不是飞刀班长');
const view = await lib.biliGet(page, 'https://api.bilibili.com/x/web-interface/view?bvid=' + BV);
out.view = { aid: view.data.aid, owner: view.data.owner.mid, state: view.data.state, title: view.data.title, pubdate: view.data.pubdate, pic: view.data.pic };
if (view.data.aid !== AID || view.data.owner.mid !== 16214353) throw new Error('稿件不符');
const tags = await lib.biliGet(page, 'https://api.bilibili.com/x/tag/archive/tags?bvid=' + BV);
out.tags = (tags.data || []).map(t => t.tag_name + (t.tag_type ? '(' + t.tag_type + ')' : ''));
const raw = fs.readFileSync(path.join(EP, 'final/bilibili-zh/投稿文案.txt'), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
const text = raw.split('【置顶评论】\n')[1].trim();
out.text = text;
const list = await lib.biliGet(page, 'https://api.bilibili.com/x/v2/reply?type=1&oid=' + AID + '&sort=2&ps=20&pn=1');
const mine = ((list.data && list.data.replies) || []).concat((list.data && list.data.upper && list.data.upper.top) ? [list.data.upper.top] : []).filter(r => r && r.mid === 16214353);
out.existing = mine.map(r => ({ rpid: r.rpid_str, msg: r.content.message.slice(0, 40) }));
let rpid = (mine.find(r => r.content.message.replace(/\s+/g, '') === text.replace(/\s+/g, '')) || {}).rpid_str;
if (!rpid) {
  const add = await lib.biliPost(page, 'https://api.bilibili.com/x/v2/reply/add', { type: '1', oid: String(AID), message: text, plat: '1' });
  out.add = { code: add.code, message: add.message, rpid: add.data && add.data.rpid_str };
  if (add.code !== 0) return out;
  rpid = add.data.rpid_str; await sleep(2500);
}
const back = await lib.biliGet(page, 'https://api.bilibili.com/x/v2/reply?type=1&oid=' + AID + '&sort=2&ps=20&pn=1');
const got = ((back.data && back.data.replies) || []).concat((back.data && back.data.upper && back.data.upper.top) ? [back.data.upper.top] : []).find(r => r && r.rpid_str === rpid);
out.readback = got ? { same: got.content.message === text, len: got.content.message.length, want: text.length } : null;
if (!got || got.content.message !== text) return out;
const top = await lib.biliPost(page, 'https://api.bilibili.com/x/v2/reply/top', { type: '1', oid: String(AID), rpid, action: '1' });
out.top = { code: top.code, message: top.message }; await sleep(2500);
const fin = await lib.biliGet(page, 'https://api.bilibili.com/x/v2/reply?type=1&oid=' + AID + '&sort=2&ps=20&pn=1');
out.pinned = fin.data && fin.data.upper && fin.data.upper.top ? { rpid: fin.data.upper.top.rpid_str, ok: fin.data.upper.top.rpid_str === rpid } : null;
out.rpid = rpid;
return out;

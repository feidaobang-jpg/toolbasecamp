// B 站：旧视频 BV1EyHz6wE5u——查重后发一条新版引导评论并置顶（原置顶评论保留）
const { page, lib, sleep } = S;
const BV = 'BV1EyHz6wE5u', AID = 117380046919398;
const out = {};
await page.goto('https://www.bilibili.com/video/' + BV + '/', { waitUntil: 'domcontentloaded' }); await sleep(4000);
const view = await lib.biliGet(page, 'https://api.bilibili.com/x/web-interface/view?bvid=' + BV);
if (view.data.aid !== AID || view.data.owner.mid !== 16214353) throw new Error('稿件不符');
const text = ['第三关「港口」上线了，新一期讲吉普怎么单挑战舰：https://www.bilibili.com/video/BV1avpd6KE3h/',
  '本片是 10 月 4 日的早期版本实录，玩法以当前游戏为准。先炸营房救人，闪光俘虏会升级武器，记得送到直升机坪！',
  'Toy试玩：https://www.bilibili.com/toy/feidao-jackal-3d/index.html',
  '投票／愿望单（复制到浏览器打开）：https://www.zhengxiaohui.cn/game-vote.html （百宝箱 → 游戏 → 自研游戏投票榜）'].join('\n');
const all = async () => { const r = await lib.biliGet(page, 'https://api.bilibili.com/x/v2/reply?type=1&oid=' + AID + '&sort=2&ps=20&pn=1'); return { top: r.data && r.data.upper && r.data.upper.top, list: (r.data && r.data.replies) || [] }; };
let a = await all();
const mine = a.list.concat(a.top ? [a.top] : []).filter(r => r.mid === 16214353);
let rpid = (mine.find(r => r.content.message.includes('BV1avpd6KE3h')) || {}).rpid_str;
out.existing = rpid || null; out.old_top = a.top && a.top.rpid_str;
if (!rpid) {
  const add = await lib.biliPost(page, 'https://api.bilibili.com/x/v2/reply/add', { type: '1', oid: String(AID), message: text, plat: '1' });
  out.add = { code: add.code, message: add.message, rpid: add.data && add.data.rpid_str };
  if (add.code !== 0) return out;
  rpid = add.data.rpid_str; await sleep(2500);
}
a = await all();
const got = a.list.concat(a.top ? [a.top] : []).find(r => r.rpid_str === rpid);
out.readback = got ? { same: got.content.message === text } : null;
if (!got || got.content.message !== text) return out;
if (!(a.top && a.top.rpid_str === rpid)) { const top = await lib.biliPost(page, 'https://api.bilibili.com/x/v2/reply/top', { type: '1', oid: String(AID), rpid, action: '1' }); out.top = { code: top.code, message: top.message }; await sleep(2500); }
a = await all();
out.pinned = a.top ? { rpid: a.top.rpid_str, ok: a.top.rpid_str === rpid } : null;
out.old_kept = a.list.some(r => r.rpid_str === '315954533281');
out.rpid = rpid; out.text = text;
return out;

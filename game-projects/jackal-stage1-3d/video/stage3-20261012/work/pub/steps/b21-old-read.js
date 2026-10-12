// B 站：只读，保存旧视频 BV1EyHz6wE5u 的简介与置顶评论现状
const { page, lib, sleep } = S;
const BV = 'BV1EyHz6wE5u';
const view = await lib.biliGet(page, 'https://api.bilibili.com/x/web-interface/view?bvid=' + BV);
const v = view.data;
const list = await lib.biliGet(page, 'https://api.bilibili.com/x/v2/reply?type=1&oid=' + v.aid + '&sort=2&ps=20&pn=1');
const top = list.data && list.data.upper && list.data.upper.top;
const snap = { bvid: BV, aid: v.aid, owner: v.owner.mid, title: v.title, state: v.state, desc: v.desc, desc_chars: v.desc.length, pinned: top ? { rpid: top.rpid_str, mid: top.mid, message: top.content.message } : null, reply_count: list.data && list.data.page && list.data.page.count, my_replies: ((list.data && list.data.replies) || []).filter(r => r.mid === 16214353).map(r => ({ rpid: r.rpid_str, message: r.content.message.slice(0, 80) })) };
S.lib.save('old-video-before.json', snap);
return snap;

// 抖音：旧视频说明——只替换开头那句旧更新说明（保留其余文字和三个话题），读回正确才「提交修改」，否则「取消」
const { path, sleep, lib } = S; const t = S.vars.dy; const out = {};
const NEW = '更新（2026-10-12·v0.11.0）：第三关「港口」上线，炸三道闸门、过双栈桥，在码头单挑战舰 Boss；新增开局保护，进场后动起来之前敌人不开火；支持2–4人合作。以下视频保留录制时版本，以当前游戏为准。';
const ed = t.locator('.zone-container[contenteditable=true]').first();
const before = (await ed.innerText()).replace(/​/g, '');
if (before.includes('v0.11.0')) return { skipped: '已是 v0.11.0' };
await ed.click(); await sleep(300);
out.selected = await ed.evaluate(e => {
  const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const i = n.data.indexOf('更新（2026-10-10'); if (i >= 0) { const end = '以当前游戏为准。'; const j = n.data.indexOf(end, i); if (j < 0) return 'no-end'; const r = document.createRange(); r.setStart(n, i); r.setEnd(n, j + end.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return s.toString().length; } }
  return 'not-found';
});
if (typeof out.selected !== 'number') return out;
await sleep(300); await t.keyboard.insertText(NEW); await sleep(1000);
const after = (await ed.innerText()).replace(/​/g, '');
const want = before.replace(/更新（2026-10-10[\s\S]*?以当前游戏为准。/, NEW);
out.readback = after === want; out.topicNodes = await ed.evaluate(e => [...e.querySelectorAll('[class*=mention], span[class*=tag], a')].map(x => x.innerText.trim()).filter(Boolean));
await t.screenshot({ path: path.join(S.OUT, 't21-before-submit.png') });
if (!out.readback) { out.after = after; out.want = want; const c = t.locator('button').filter({ hasText: /^\s*取消\s*$/ }).filter({ visible: true }).first(); if (await c.count()) await c.click(); out.cancelled = true; return out; }
const sub = t.locator('button').filter({ hasText: /^\s*提交修改\s*$/ }).filter({ visible: true }).first();
await sub.scrollIntoViewIfNeeded(); await sub.click();
for (let k = 0; k < 25; k++) { await sleep(1000); if (/content\/manage/.test(t.url())) { out.redirected = true; break; } }
await sleep(4000);
out.url = t.url(); out.msg = await t.evaluate(() => (document.body.innerText.match(/修改成功|提交成功|审核中|修改失败[^\n]*|今日修改次数[^\n]*/g) || []).slice(0, 3));
lib.save('douyin-old-after.txt', after);
await t.screenshot({ path: path.join(S.OUT, 't21-after.png') });
return out;

// B 站：旧视频 BV1EyHz6wE5u 简介——加新一期链接、把更新行换成 v0.11.0；写前重读，读回一致才提交
const { page, path, lib, sleep } = S;
const BV = 'BV1EyHz6wE5u', NEW = 'https://www.bilibili.com/video/BV1avpd6KE3h/';
const out = {};
const before = (await lib.biliGet(page, 'https://api.bilibili.com/x/web-interface/view?bvid=' + BV)).data.desc;
const lines = before.split('\n');
const iUpd = lines.findIndex(l => l.startsWith('更新（'));
if (iUpd < 0 || lines.some(l => l.includes('BV1avpd6KE3h'))) return { skipped: true, reason: iUpd < 0 ? '找不到更新行' : '已含新一期链接', before };
lines[iUpd] = '更新（2026-10-12·v0.11.0）：第三关「港口」上线，炸三道闸门、过双栈桥，在码头单挑战舰 Boss；新增开局保护，进场后动起来之前敌人不开火。支持2–4人合作、中途加入与退出。网站与Toy已更新。视频为录制时版本，以当前试玩为准。';
lines.unshift('新一期：第三关「港口」单挑战舰 ' + NEW);
const desc = lines.join('\n');
out.before_chars = before.length; out.after_chars = desc.length;
lib.save('old-video-desc-new.txt', desc);
await page.goto('https://member.bilibili.com/platform/upload/video/frame?type=edit&version=new&bvid=' + BV, { waitUntil: 'domcontentloaded' });
await page.locator('.ql-editor').first().waitFor({ timeout: 30000 }); await sleep(5000);
const title = await page.locator('input[placeholder="请输入稿件标题"]').inputValue();
out.title = title;
if (!/赤色要塞3D双关卡/.test(title)) throw new Error('编辑页不是目标稿件：' + title);
const cur = await page.evaluate(() => [...document.querySelector('.ql-editor').querySelectorAll('p')].map(p => p.innerText.replace(/​|﻿/g, '')).join('\n'));
out.editorMatchesPublic = cur.replace(/\n+$/, '') === before;
const ed = page.locator('.ql-editor').first();
await ed.scrollIntoViewIfNeeded(); await ed.click(); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); await sleep(300);
const L = desc.split('\n');
for (let i = 0; i < L.length; i++) { await page.keyboard.insertText(L[i]); await sleep(220); if (i < L.length - 1) { await page.keyboard.press('Enter'); await sleep(180); } }
await sleep(800);
const back = await page.evaluate(() => [...document.querySelector('.ql-editor').querySelectorAll('p')].map(p => p.innerText.replace(/​|﻿/g, '')).join('\n'));
out.readbackSame = back === desc;
await page.screenshot({ path: path.join(S.OUT, 'b22-before-submit.png') });
if (!out.readbackSame) { out.back = back; return out; }
const hits = [];
const onResp = async r => { if (/x\/vu\/web\/edit/.test(r.url())) { try { hits.push(await r.json()); } catch (e) { hits.push({ err: String(e).slice(0, 80) }); } } };
page.on('response', onResp);
const btn = page.locator('span.submit-add').filter({ visible: true }).first();
await btn.scrollIntoViewIfNeeded(); await btn.click();
let state = 'unknown';
for (let k = 0; k < 40; k++) { await sleep(1000); const s = await page.evaluate(() => ({ ok: /稿件投递成功/.test(document.body.innerText), captcha: !!document.querySelector('.geetest_panel, .geetest_wind, .geetest_box, iframe[src*=geetest]') })); if (s.ok) { state = 'success'; break; } if (s.captcha) { state = 'captcha'; break; } }
page.off('response', onResp);
out.state = state; out.hits = hits.map(h => ({ code: h.code, message: h.message }));
await page.screenshot({ path: path.join(S.OUT, 'b22-after-submit.png') });
return out;

// YouTube：旧视频 9MwVi2fVMPo 说明——把更新行换成 v0.11.0 并带上新一期链接；写前重读、读回一致后保存、刷新再核对
const { path, sleep, lib } = S; const y = S.vars.yt; const out = {};
const box = y.locator('#description-textarea #textbox').first();
const before = (await box.innerText()).replace(/\n+$/, '');
if (before.includes('TT3uvOfYiVo')) return { skipped: '已含新一期链接' };
const lines = before.split('\n').filter(l => l.trim() !== '');
const i = lines.findIndex(l => l.startsWith('更新（'));
const upd = '更新（2026-10-12·v0.11.0）：第三关「港口」上线，炸三道闸门、过双栈桥，在码头单挑战舰 Boss；新增开局保护，进场后动起来之前敌人不开火。支持2–4人合作，网站已更新。新一期：https://www.youtube.com/watch?v=TT3uvOfYiVo 视频为录制时版本，以当前试玩为准。';
if (i >= 0) lines[i] = upd; else lines.push(upd);
const desc = lines.join('\n');
await box.click(); await y.keyboard.press('Control+A'); await y.keyboard.press('Backspace'); await sleep(200);
for (let k = 0; k < lines.length; k++) { await y.keyboard.insertText(lines[k]); await sleep(150); if (k < lines.length - 1) { await y.keyboard.press('Enter'); await sleep(120); } }
await sleep(700);
out.readback = (await box.innerText()).replace(/\n+$/, '') === desc;
if (!out.readback) { out.back = await box.innerText(); return out; }
const save = y.locator('ytcp-button#save').first();
out.saveBtn = await save.count(); await save.click(); await sleep(6000);
await y.reload({ waitUntil: 'domcontentloaded' }); await sleep(8000);
const after = (await y.locator('#description-textarea #textbox').first().innerText()).replace(/\n+$/, '');
out.saved = after === desc; out.after_chars = after.length; out.before_chars = before.length;
lib.save('yt-old-after.txt', after);
return out;

// 腾讯文档推流表：查重 → 确认目标行仍为空 → 只填本期一行 A:E（F 留给运营）→ 读回
const { path, sleep } = S; const d = S.vars.doc; const out = {};
const BV = 'BV1avpd6KE3h', URL = 'https://www.bilibili.com/video/' + BV + '/';
const box = d.locator('input.bar-label').first();
const jump = async addr => { await box.click(); await d.keyboard.press('Control+A'); await d.keyboard.type(addr, { delay: 15 }); await d.keyboard.press('Enter'); await sleep(420); return (await box.inputValue()) === addr; };
const read = async addr => { const ok = await jump(addr); const v = (await d.evaluate(() => { const f = document.querySelector('.formula-bar .formula-input, .formula-bar'); return f ? f.innerText : null; }) || '').replace(/\n/g, ' ').trim(); return ok ? v : '<<跳转失败>>'; };
// 1) 表内查找本期 BV
await jump('A1'); await d.keyboard.press('Control+F'); await sleep(1200);
const find = d.locator('input[placeholder*="查找"]').first();
out.findBox = await find.count();
if (out.findBox) {
  await find.click(); await d.keyboard.press('Control+A'); await d.keyboard.type(BV, { delay: 20 }); await d.keyboard.press('Enter'); await sleep(2000);
  out.findResult = await d.evaluate(() => { const p = [...document.querySelectorAll('[class*=find], [class*=search]')].filter(e => e.offsetParent).map(e => e.innerText.trim().replace(/\n+/g, ' | ').slice(0, 120)).filter(Boolean); return p.slice(0, 4); });
  await d.screenshot({ path: path.join(S.OUT, 'd03-find.png') });
  await d.keyboard.press('Escape'); await sleep(500);
}
if (!out.findBox || !out.findResult.some(t => /无结果|0\s*\/\s*0|未找到/.test(t))) { out.stopped = '查重结果不明确，未填写'; return out; }
// 2) 找到第一行空行（从 385 起，防止别人刚填过）
let row = null;
for (let r = 385; r <= 400; r++) { const a = await read('A' + r), b = await read('B' + r), c = await read('C' + r); if (!a && !b && !c) { row = r; break; } }
out.row = row; if (!row) { out.stopped = '没找到空行'; return out; }
out.prev = [await read('A' + (row - 1)), (await read('B' + (row - 1))).slice(0, 60)];
// 3) 填写
await jump('A' + row);
const cells = ['飞刀班长', URL, '是', '是', '是'];
for (let i = 0; i < cells.length; i++) { await d.keyboard.type(cells[i], { delay: 25 }); await sleep(250); await d.keyboard.press(i < cells.length - 1 ? 'Tab' : 'Enter'); await sleep(500); }
await sleep(2500);
out.readback = { A: await read('A' + row), B: await read('B' + row), C: await read('C' + row), D: await read('D' + row), E: await read('E' + row), F: await read('F' + row) };
out.next = [await read('A' + (row + 1)), await read('B' + (row + 1))];
await jump('B' + row); await sleep(800);
out.save = await d.evaluate(() => (document.body.innerText.match(/上次修改[^\n]{0,30}|已保存[^\n]{0,20}|保存中[^\n]{0,10}|最近保存[^\n]{0,20}/g) || []).slice(0, 3));
await d.screenshot({ path: path.join(S.OUT, 'd03-filled.png') });
return out;

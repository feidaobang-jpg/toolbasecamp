// 腾讯文档推流表：修正第 385 行。名称框回车后焦点还留在名称框，所以改为：跳到单元格 → 点编辑栏 → 全选改写 → 回车。只动本行 A、B、E。
const { path, sleep } = S; const d = S.vars.doc; const out = { steps: [] };
const ROW = 385, URL = 'https://www.bilibili.com/video/BV1avpd6KE3h/';
const box = d.locator('input.bar-label').first();
const jump = async addr => { await box.click(); await d.keyboard.press('Control+A'); await d.keyboard.type(addr, { delay: 15 }); await d.keyboard.press('Enter'); await sleep(600); return (await box.inputValue()) === addr; };
const val = async () => (await d.evaluate(() => { const f = document.querySelector('.formula-bar .formula-input, .formula-bar'); return f ? f.innerText : null; }) || '').replace(/\n/g, ' ').trim();
const read = async addr => (await jump(addr)) ? await val() : '<<跳转失败>>';
out.formulaHtml = await d.evaluate(() => { const f = document.querySelector('.formula-bar'); return f ? f.outerHTML.slice(0, 500) : null; });
const cur = { A: await read('A' + ROW), B: await read('B' + ROW), E: await read('E' + ROW) };
out.before = cur;
if (cur.A !== URL && cur.A !== '飞刀班长') { out.stopped = '第 385 行不是预期内容，未改动'; return out; }
const set = async (addr, text) => {
  if (!(await jump(addr))) return false;
  if ((await val()) === text) { out.steps.push(addr + ' 已是目标值'); return true; }
  const f = d.locator('.formula-bar .formula-input, .formula-bar [contenteditable=true]').first();
  await f.click(); await sleep(300); await d.keyboard.press('Control+A'); await sleep(150); await d.keyboard.press('Backspace'); await sleep(150);
  await d.keyboard.type(text, { delay: 35 }); await sleep(400); await d.keyboard.press('Enter'); await sleep(1000);
  const got = await read(addr); out.steps.push(addr + ' => ' + got.slice(0, 50)); return got === text;
};
out.okA = await set('A' + ROW, '飞刀班长');
if (out.okA) out.okB = await set('B' + ROW, URL);
if (out.okB) out.okE = await set('E' + ROW, '是');
await sleep(2500);
out.after = { A: await read('A' + ROW), B: await read('B' + ROW), C: await read('C' + ROW), D: await read('D' + ROW), E: await read('E' + ROW), F: await read('F' + ROW) };
out.neighbors = { prev: [await read('A' + (ROW - 1)), (await read('B' + (ROW - 1))).slice(0, 50)], next: [await read('A' + (ROW + 1)), await read('B' + (ROW + 1))] };
await jump('G' + ROW); await sleep(2000);
out.save = await d.evaluate(() => (document.body.innerText.match(/上次修改[^\n]{0,30}|已保存[^\n]{0,20}|保存中[^\n]{0,10}|最近保存[^\n]{0,20}/g) || []).slice(0, 3));
await d.screenshot({ path: path.join(S.OUT, 'd05-fixed.png') });
return out;

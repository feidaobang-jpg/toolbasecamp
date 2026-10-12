// 腾讯文档推流表：修正第 385 行（上一步第一格没写进去，内容左移了一格）。逐格清空再写，逐格读回。只动本行 A:E。
const { path, sleep } = S; const d = S.vars.doc; const out = { steps: [] };
const ROW = 385, URL = 'https://www.bilibili.com/video/BV1avpd6KE3h/';
const box = d.locator('input.bar-label').first();
const jump = async addr => { await box.click(); await d.keyboard.press('Control+A'); await d.keyboard.type(addr, { delay: 15 }); await d.keyboard.press('Enter'); await sleep(600); return (await box.inputValue()) === addr; };
const val = async () => (await d.evaluate(() => { const f = document.querySelector('.formula-bar .formula-input, .formula-bar'); return f ? f.innerText : null; }) || '').replace(/\n/g, ' ').trim();
const read = async addr => (await jump(addr)) ? await val() : '<<跳转失败>>';
// 先确认这一行确实是我刚写的那一行
const cur = { A: await read('A' + ROW), B: await read('B' + ROW), C: await read('C' + ROW), D: await read('D' + ROW), E: await read('E' + ROW), F: await read('F' + ROW) };
out.before = cur;
if (cur.A !== URL && cur.B !== URL) { out.stopped = '第 385 行不是预期内容，未改动'; return out; }
const set = async (addr, text) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!(await jump(addr))) continue;
    await d.keyboard.press('Delete'); await sleep(400);
    await d.keyboard.type(text, { delay: 40 }); await sleep(400); await d.keyboard.press('Enter'); await sleep(900);
    const got = await read(addr); out.steps.push(addr + ' => ' + got.slice(0, 50));
    if (got === text) return true;
  }
  return false;
};
out.okA = await set('A' + ROW, '飞刀班长');
out.okB = await set('B' + ROW, URL);
if (cur.C !== '是') out.okC = await set('C' + ROW, '是');
if (cur.D !== '是') out.okD = await set('D' + ROW, '是');
out.okE = await set('E' + ROW, '是');
await sleep(2500);
out.after = { A: await read('A' + ROW), B: await read('B' + ROW), C: await read('C' + ROW), D: await read('D' + ROW), E: await read('E' + ROW), F: await read('F' + ROW) };
out.neighbors = { prev: [await read('A' + (ROW - 1)), (await read('B' + (ROW - 1))).slice(0, 50), await read('E' + (ROW - 1))], next: [await read('A' + (ROW + 1)), await read('B' + (ROW + 1))] };
await jump('G' + ROW); await sleep(1500);
out.save = await d.evaluate(() => (document.body.innerText.match(/上次修改[^\n]{0,30}|已保存[^\n]{0,20}|保存中[^\n]{0,10}|最近保存[^\n]{0,20}/g) || []).slice(0, 3));
await d.screenshot({ path: path.join(S.OUT, 'd04-fixed.png') });
return out;

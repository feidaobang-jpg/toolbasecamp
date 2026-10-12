// 腾讯文档「【进行中】日常推流」填一行申请：查重 → 找第一行空行 → 通过编辑栏逐格写 A:E → 逐格读回 → 截图。
// 用法：node push-sheet-row.cjs <BV号> <C> <D> <E> [昵称]      例：node push-sheet-row.cjs BV1Wmp96JEBD 是 是 否
// PUB_HEADLESS=1 时不弹窗口（无头）；只动自己这一行，F 列留给运营。名称框回车后焦点还在名称框，所以一律点编辑栏改写。
const fs = require('fs'), path = require('path');
const { chromium } = require('../../../../node_modules/playwright');
const [BV, C, D, E] = process.argv.slice(2), NAME = process.argv[6] || '飞刀班长';
if (!/^BV\w{10}$/.test(BV || '') || ![C, D, E].every(v => v === '是' || v === '否')) { console.error('参数不对'); process.exit(2); }
const URL = 'https://www.bilibili.com/video/' + BV + '/', OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const headless = process.env.PUB_HEADLESS === '1';
  const ctx = await chromium.launchPersistentContext('C:/Users/37818/AppData/Local/bili-publish-edge-profile', { channel: 'msedge', headless, viewport: { width: 1440, height: 900 }, args: ['--disable-blink-features=AutomationControlled', '--window-position=40,40', '--no-first-run'] });
  ctx.setDefaultTimeout(30000); const d = ctx.pages()[0] || await ctx.newPage(); const out = { bv: BV, headless };
  try {
    await d.goto('https://docs.qq.com/sheet/DU3dnQkR1WG5RUnp0?tab=7mm8hw', { waitUntil: 'domcontentloaded' }); await sleep(9000);
    out.guest = await d.evaluate(() => /skeleton-guest-mode/.test(document.body.className) || /登录腾讯文档/.test(document.body.innerText));
    if (out.guest) { out.stopped = '游客态，不能编辑'; return; }
    const box = d.locator('input.bar-label').first();
    const jump = async a => { await box.click(); await d.keyboard.press('Control+A'); await d.keyboard.type(a, { delay: 15 }); await d.keyboard.press('Enter'); await sleep(550); return (await box.inputValue()) === a; };
    const val = async () => (await d.evaluate(() => { const f = document.querySelector('.formula-bar .formula-input, .formula-bar'); return f ? f.innerText : null; }) || '').replace(/\n/g, ' ').trim();
    const read = async a => (await jump(a)) ? await val() : '<<跳转失败>>';
    out.headers = [await read('A2'), (await read('B2')).slice(0, 12), (await read('E2')).slice(0, 14), (await read('F2')).slice(0, 8)];
    if (!/UP主昵称/.test(out.headers[0]) || !/视频链接/.test(out.headers[1]) || !/宣传Toy/.test(out.headers[2])) { out.stopped = '表头与预期不符'; return; }
    await jump('A1'); await d.keyboard.press('Control+F'); await sleep(1200);
    const find = d.locator('input[placeholder*="查找"]').first();
    if (!(await find.count())) { out.stopped = '找不到查找框'; return; }
    await find.click(); await d.keyboard.press('Control+A'); await d.keyboard.type(BV, { delay: 20 }); await d.keyboard.press('Enter'); await sleep(2200);
    out.find = await d.evaluate(() => [...document.querySelectorAll('[class*=find], [class*=search]')].filter(e => e.offsetParent).map(e => e.innerText.trim().replace(/\n+/g, ' | ').slice(0, 60)).filter(Boolean).slice(0, 2));
    await d.keyboard.press('Escape'); await sleep(500);
    if (!out.find.some(t => /无结果/.test(t))) { out.stopped = '表里可能已有这条稿件，未填写'; return; }
    let row = null;
    for (let r = 380; r <= 430; r++) { const b = await read('B' + r); if (!b && !(await read('A' + r)) && !(await read('C' + r))) { row = r; break; } }
    out.row = row; if (!row) { out.stopped = '没找到空行'; return; }
    out.prev = [await read('A' + (row - 1)), (await read('B' + (row - 1))).slice(0, 50)];
    const set = async (a, text) => { if (!(await jump(a))) return false; const f = d.locator('.formula-bar .formula-input, .formula-bar [contenteditable=true]').first(); await f.click(); await sleep(300); await d.keyboard.press('Control+A'); await sleep(120); await d.keyboard.press('Backspace'); await sleep(120); await d.keyboard.type(text, { delay: 35 }); await sleep(350); await d.keyboard.press('Enter'); await sleep(1000); return (await read(a)) === text; };
    out.set = {}; for (const [col, v] of [['A', NAME], ['B', URL], ['C', C], ['D', D], ['E', E]]) { out.set[col] = await set(col + row, v); if (!out.set[col]) break; }
    await sleep(2500);
    out.readback = { A: await read('A' + row), B: await read('B' + row), C: await read('C' + row), D: await read('D' + row), E: await read('E' + row), F: await read('F' + row) };
    out.next = [await read('A' + (row + 1)), await read('B' + (row + 1))];
    await jump('A' + row); await sleep(1500);
    out.save = await d.evaluate(() => (document.body.innerText.match(/最近保存[^\n]{0,20}|上次修改[^\n]{0,30}|保存中[^\n]{0,10}/g) || []).slice(0, 2));
    await d.screenshot({ path: path.join(OUT, 'push-row-' + BV + '.png') });
    out.ok = out.readback.A === NAME && out.readback.B === URL && out.readback.C === C && out.readback.D === D && out.readback.E === E && !out.readback.F;
  } catch (e) { out.error = String(e).slice(0, 300); }
  finally { fs.writeFileSync(path.join(OUT, 'push-row-' + BV + '.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1)); await ctx.close().catch(() => { }); }
})();

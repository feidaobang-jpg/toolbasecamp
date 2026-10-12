// 腾讯文档推流表：只读——核对表头，查本期 BV 是否已在表里，找到数据末行
const { path, sleep } = S; const d = S.vars.doc; const out = {};
await d.bringToFront(); await sleep(800);
out.who = await d.evaluate(() => ({ guest: /skeleton-guest-mode/.test(document.body.className), nameBox: !!document.querySelector('input.bar-label'), formula: !!document.querySelector('.formula-bar') }));
const read = async addr => {
  const box = d.locator('input.bar-label').first();
  await box.click(); await d.keyboard.press('Control+A'); await d.keyboard.type(addr, { delay: 20 }); await d.keyboard.press('Enter'); await sleep(450);
  return (await d.evaluate(() => { const f = document.querySelector('.formula-bar .formula-input, .formula-bar'); return f ? f.innerText : null; }) || '').replace(/\n/g, ' ').trim();
};
out.headers = {}; for (const c of ['A2', 'B2', 'C2', 'D2', 'E2', 'F2']) out.headers[c] = (await read(c)).slice(0, 50);
out.a1 = (await read('A1')).slice(0, 80);
// 找末行：先粗跳再细查
const probe = {}; let lo = 284, hi = null;
for (const r of [300, 320, 340, 360, 380, 400, 440, 480, 520, 600]) { const v = await read('B' + r); probe[r] = v.slice(0, 50); if (!v) { hi = r; break; } lo = r; }
if (hi) { while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); const v = await read('B' + m); probe[m] = v.slice(0, 50); if (v) lo = m; else hi = m; } }
out.probe = probe; out.lastFilled = lo; out.firstEmpty = hi;
if (hi) { out.around = {}; for (let r = Math.max(2, hi - 3); r <= hi + 6; r++) out.around[r] = [await read('A' + r), (await read('B' + r)).slice(0, 60), await read('C' + r), await read('D' + r), await read('E' + r), await read('F' + r)]; }
await d.screenshot({ path: path.join(S.OUT, 'd01.png') });
return out;

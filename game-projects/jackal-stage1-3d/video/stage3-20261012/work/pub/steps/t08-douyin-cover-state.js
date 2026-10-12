// 抖音：只读，看封面对话框当前状态与各上传输入框的位置
const { path, sleep } = S; const t = S.vars.dy; const out = {};
await sleep(800);
out.prompt = await t.getByText('设置竖封面获更多流量').first().isVisible().catch(() => false);
out.inputs = await t.evaluate(() => [...document.querySelectorAll('input[type=file]')].map((e, i) => { const p = e.closest('.semi-upload, [class*=upload]'); const r = p ? p.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 }; return { i, cls: e.className.toString().slice(0, 44), inModal: !!e.closest('[class*=modal]'), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], text: p ? p.innerText.trim().slice(0, 20) : '' }; }));
await t.screenshot({ path: path.join(S.OUT, 't08.png') });
return out;

// 抖音：打开横封面选择，先看界面
const { path, sleep } = S; const t = S.vars.dy; const out = {};
const pick = t.getByText('选择封面', { exact: true }).first();
await pick.scrollIntoViewIfNeeded(); await pick.click(); await sleep(3000);
out.modal = await t.evaluate(() => [...document.querySelectorAll('[class*=modal], [role=dialog], [class*=dialog], [class*=dy-creator-content-modal]')].filter(e => e.offsetParent && e.innerText.trim()).map(e => e.className.toString().slice(0, 50) + ' => ' + e.innerText.replace(/\n+/g, ' | ').slice(0, 400)).slice(0, 3));
out.files = await t.evaluate(() => [...document.querySelectorAll('input[type=file]')].map(e => ({ accept: e.accept.slice(0, 40), cls: e.className.toString().slice(0, 40), inModal: !!e.closest('[class*=modal], [role=dialog]') })));
await t.screenshot({ path: path.join(S.OUT, 't05.png') });
return out;

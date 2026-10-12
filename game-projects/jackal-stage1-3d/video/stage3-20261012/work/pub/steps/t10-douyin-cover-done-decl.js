// 抖音：封面「完成」→「暂不设置」竖封面；然后打开自主声明看选项
const { path, sleep } = S; const t = S.vars.dy; const out = {};
const done = t.locator('[class*=modal] button').filter({ hasText: /^\s*完成\s*$/ }).filter({ visible: true }).first();
if (await done.count()) { await done.click(); await sleep(2500); }
const skip = t.getByText('暂不设置', { exact: true }).filter({ visible: true }).first();
out.skipPrompt = await skip.count();
if (out.skipPrompt) { await skip.click(); await sleep(4000); }
out.modalOpen = await t.evaluate(() => [...document.querySelectorAll('[class*=dy-creator-content-modal]')].filter(e => e.offsetParent && /设置横封面/.test(e.innerText)).length);
await t.screenshot({ path: path.join(S.OUT, 't10-cover.png') });
const decl = t.getByText('请选择自主声明', { exact: true }).first();
out.decl = await decl.count();
if (out.decl) { await decl.scrollIntoViewIfNeeded(); await decl.click(); await sleep(2000); }
out.options = await t.evaluate(() => [...document.querySelectorAll('[class*=modal], [role=dialog], [class*=sidesheet], [class*=drawer], [class*=popover]')].filter(e => e.offsetParent && /声明/.test(e.innerText)).map(e => e.innerText.replace(/\n+/g, ' | ').slice(0, 500)).slice(0, 2));
await t.screenshot({ path: path.join(S.OUT, 't10-decl.png') });
return out;

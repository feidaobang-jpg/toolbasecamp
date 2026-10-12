// 抖音：横封面上传 4:3 那张（与 B 站首页封面同一构图），点「完成」
const { path, EP, sleep } = S; const t = S.vars.dy; const out = {};
const input = t.locator('[class*=modal] input[type=file].semi-upload-hidden-input').first();
await input.setInputFiles(path.join(EP, 'final/bilibili-zh/cover-home-4x3.jpg')); await sleep(5000);
await t.screenshot({ path: path.join(S.OUT, 't06-uploaded.png') });
const done = t.locator('[class*=modal] button').filter({ hasText: /^\s*完成\s*$/ }).filter({ visible: true }).first();
out.done = await done.count();
if (out.done) { await done.click(); await sleep(4000); }
out.modalOpen = await t.evaluate(() => [...document.querySelectorAll('[class*=dy-creator-content-modal]')].filter(e => e.offsetParent && /设置横封面/.test(e.innerText)).length);
out.coverArea = await t.evaluate(() => { const i = document.body.innerText.indexOf('设置封面'); return document.body.innerText.slice(i, i + 160).replace(/\n+/g, ' | '); });
await t.screenshot({ path: path.join(S.OUT, 't06.png') });
return out;

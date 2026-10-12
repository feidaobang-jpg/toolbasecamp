// 抖音：自主声明选「内容由AI生成」并确定；核对整表后点「发布」
const { path, sleep } = S; const t = S.vars.dy; const out = {};
await t.locator('label.semi-radio').filter({ hasText: '内容由AI生成' }).filter({ visible: true }).first().click(); await sleep(500);
await t.locator('button').filter({ hasText: /^\s*确定\s*$/ }).filter({ visible: true }).last().click(); await sleep(1500);
out.form = await t.evaluate(() => {
  const txt = document.body.innerText; const i = txt.indexOf('自主声明');
  return { title: (document.querySelector('input[placeholder*="填写作品标题"]') || {}).value, desc: (document.querySelector('.zone-container[contenteditable=true]') || { innerText: '' }).innerText.replace(/​/g, '').slice(0, 260), decl: txt.slice(i, i + 40).replace(/\n+/g, ' | '), who: [...document.querySelectorAll('label, [class*=radio]')].filter(e => e.offsetParent && /checked|active/.test(e.className)).map(e => e.innerText.trim()).filter(Boolean).slice(0, 8), covers: [...document.querySelectorAll('[class*=cover] img, [class*=coverControl] img')].filter(e => e.offsetParent).length };
});
await t.screenshot({ path: path.join(S.OUT, 't11-before.png'), fullPage: true });
if (!/内容由AI生成/.test(out.form.decl) || !out.form.title) { out.stopped = '表单核对未通过，未发布'; return out; }
const pub = t.locator('button').filter({ hasText: /^\s*发布\s*$/ }).filter({ visible: true }).first();
await pub.scrollIntoViewIfNeeded(); await pub.click();
for (let k = 0; k < 30; k++) { await sleep(1000); if (/content\/manage/.test(t.url())) { out.redirected = true; break; } const m = await t.evaluate(() => (document.body.innerText.match(/发布成功|请完成验证|验证码|审核中|发布失败[^\n]*/) || [''])[0]); if (m) { out.msg = m; if (/验证/.test(m)) break; } }
await sleep(5000);
out.url = t.url();
out.top = (await t.evaluate(() => document.body.innerText.slice(0, 900))).replace(/\n+/g, ' | ');
await t.screenshot({ path: path.join(S.OUT, 't11-after.png') });
return out;

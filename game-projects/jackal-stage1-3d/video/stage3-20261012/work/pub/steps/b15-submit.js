// B 站：点「立即投稿」，记录接口返回的 BV；若出现验证码则停下如实报告
const { page, path, sleep } = S;
const hits = [];
const onResp = async r => { const u = r.url(); if (/x\/vu\/web\/add|x\/vu\/web\/edit|archive\/add/.test(u)) { try { hits.push({ url: u.split('?')[0], status: r.status(), body: await r.json() }); } catch (e) { hits.push({ url: u.split('?')[0], status: r.status(), err: String(e).slice(0, 100) }); } } };
page.on('response', onResp);
const btn = page.locator('span.submit-add').filter({ visible: true }).first();
await btn.scrollIntoViewIfNeeded(); await btn.click();
let state = 'unknown';
for (let k = 0; k < 40; k++) {
  await sleep(1000);
  const s = await page.evaluate(() => ({ ok: /稿件投递成功/.test(document.body.innerText), captcha: !!document.querySelector('.geetest_panel, .geetest_wind, [class*=geetest_holder], iframe[src*=geetest], .geetest_box'), err: [...document.querySelectorAll('.bcc-message, [class*=toast], .error-tip, [class*=error]')].filter(e => e.offsetParent).map(e => e.innerText.trim().slice(0, 100)).filter(Boolean).slice(0, 4) }));
  if (s.ok) { state = 'success'; break; }
  if (s.captcha) { state = 'captcha'; break; }
  if (s.err.length && k > 3) { state = 'error:' + JSON.stringify(s.err); if (hits.length) break; }
}
page.off('response', onResp);
await page.screenshot({ path: path.join(S.OUT, 'b15.png') });
S.vars.submit = hits;
return { state, hits, url: page.url(), text: (await page.evaluate(() => document.body.innerText.slice(0, 600))).replace(/\n+/g, ' | ') };

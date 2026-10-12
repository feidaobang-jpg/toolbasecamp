// YouTube：付费宣传=否；逐步「继续」到公开范围，选「公开」，先截图不发布
const { path, sleep } = S; const y = S.vars.yt; const out = { steps: [] };
const dlg = y.locator('ytcp-uploads-dialog');
const paid = dlg.locator('tp-yt-paper-radio-button[name="VIDEO_PAID_PRODUCT_PLACEMENT_NO"]').first();
await paid.scrollIntoViewIfNeeded(); await paid.click(); await sleep(500); out.paid = await paid.getAttribute('aria-checked');
out.thumb = await y.evaluate(() => { const t = document.querySelector('ytcp-uploads-dialog ytcp-thumbnail-uploader, ytcp-uploads-dialog #still-picker'); return t ? t.innerText.replace(/\n+/g, ' | ').slice(0, 200) : null; });
const step = async () => y.evaluate(() => { const s = document.querySelector('ytcp-uploads-dialog #step-title, ytcp-uploads-dialog .step-title, ytcp-uploads-dialog ytcp-stepper [aria-selected=true], ytcp-uploads-dialog button[role=tab][aria-selected=true]'); return s ? s.innerText.trim().slice(0, 30) : null; });
for (let i = 0; i < 3; i++) {
  const next = dlg.locator('#next-button').first(); await next.click(); await sleep(2500);
  out.steps.push(await step());
  if (await dlg.locator('tp-yt-paper-radio-button[name="PUBLIC"]').first().isVisible().catch(() => false)) break;
}
out.checks = await y.evaluate(() => { const d = document.querySelector('ytcp-uploads-dialog'); const t = d.innerText.replace(/\n+/g, ' | '); return t.slice(0, 1200); });
const pub = dlg.locator('tp-yt-paper-radio-button[name="PUBLIC"]').first();
if (await pub.count()) { await pub.click(); await sleep(800); out.public = await pub.getAttribute('aria-checked'); }
out.premiere = await y.evaluate(() => { const c = [...document.querySelectorAll('ytcp-uploads-dialog ytcp-checkbox-lit, ytcp-uploads-dialog tp-yt-paper-checkbox')].filter(e => e.offsetParent).map(e => ({ text: (e.innerText || e.parentElement.innerText || '').trim().slice(0, 40), checked: e.getAttribute('aria-checked') || e.getAttribute('checked') })); return c; });
out.done = await dlg.locator('#done-button').first().innerText().catch(() => null);
await y.screenshot({ path: path.join(S.OUT, 'y04.png') });
return out;

// YouTube：确认「设为即时首映」未勾选后点「发布」，记录结果
const { path, sleep } = S; const y = S.vars.yt; const out = {};
const dlg = y.locator('ytcp-uploads-dialog');
out.public = await dlg.locator('tp-yt-paper-radio-button[name="PUBLIC"]').first().getAttribute('aria-checked');
out.premiere = await y.evaluate(() => { const c = [...document.querySelectorAll('ytcp-uploads-dialog ytcp-checkbox-lit')].find(e => /首映/.test((e.innerText || '') + (e.parentElement.innerText || ''))); if (!c) return 'none'; const b = c.querySelector('[role=checkbox]') || c; return b.getAttribute('aria-checked') || 'false'; });
if (out.public !== 'true' || out.premiere === 'true') { out.stopped = '公开范围或首映状态不对，未发布'; return out; }
await dlg.locator('#done-button').first().click();
for (let k = 0; k < 30; k++) { await sleep(1000); const t = await y.evaluate(() => document.body.innerText); if (/视频已发布|已发布视频|Video published/.test(t)) { out.published = true; break; } }
out.after = await y.evaluate(() => { const d = [...document.querySelectorAll('ytcp-video-share-dialog, tp-yt-paper-dialog, ytcp-dialog')].filter(e => e.offsetParent).map(e => e.innerText.replace(/\n+/g, ' | ').slice(0, 300)); return d.slice(0, 3); });
await y.screenshot({ path: path.join(S.OUT, 'y05.png') });
const close = y.locator('ytcp-video-share-dialog #close-button, ytcp-video-share-dialog ytcp-button').filter({ hasText: /关闭|Close/ }).first();
if (await close.count()) { await close.click().catch(() => { }); await sleep(1000); }
return out;

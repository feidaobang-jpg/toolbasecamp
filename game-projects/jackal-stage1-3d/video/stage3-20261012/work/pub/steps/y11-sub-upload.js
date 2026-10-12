// YouTube：字幕编辑器里「上传文件 → 带时间码 → 继续」选择 SRT，核对条数后发布
const { path, EP, sleep } = S; const y = S.vars.yt; const out = {};
const FILE = S.vars.subFile || 'final/youtube-zh/captions-zh.srt';
const panel = y.locator('ytve-captions-editor-options-panel');
await panel.locator('text=上传文件').first().click(); await sleep(1500);
out.dialog = await y.evaluate(() => [...document.querySelectorAll('ytcp-dialog, tp-yt-paper-dialog')].filter(e => e.offsetParent && /时间码/.test(e.innerText)).map(e => e.innerText.replace(/\n+/g, ' | ').slice(0, 300))[0] || null);
const timed = y.locator('tp-yt-paper-radio-button').filter({ hasText: /^\s*带时间码/ }).filter({ visible: true }).first();
if (await timed.count()) { await timed.click(); await sleep(400); out.timed = await timed.getAttribute('aria-checked'); }
const cont = y.locator('ytcp-button, button').filter({ hasText: /^\s*继续\s*$/ }).filter({ visible: true }).last();
const [chooser] = await Promise.all([y.waitForEvent('filechooser', { timeout: 15000 }), cont.click()]);
await chooser.setFiles(path.join(EP, FILE)); await sleep(5000);
out.segments = await y.evaluate(() => document.querySelectorAll('ytve-captions-editor-caption-segment-line, .segment-line, ytve-captions-editor-caption-segment').length);
out.firstLast = await y.evaluate(() => { const t = [...document.querySelectorAll('ytve-captions-editor-caption-segment-line textarea, ytve-captions-editor-caption-segment textarea, textarea')].filter(e => e.offsetParent).map(e => e.value); return [t.length, t[0], t[t.length - 1]]; });
out.buttons = await y.evaluate(() => [...document.querySelectorAll('ytcp-dialog ytcp-button')].filter(e => e.offsetParent && e.innerText.trim()).map(e => e.id + ':' + e.innerText.trim() + ':' + (e.getAttribute('disabled') !== null || e.hasAttribute('disabled') ? 'disabled' : 'enabled')).slice(0, 8));
await y.screenshot({ path: path.join(S.OUT, 'y11-loaded.png') });
const publish = y.locator('ytcp-dialog #publish-button, ytcp-dialog ytcp-button').filter({ hasText: /^\s*发布\s*$/ }).filter({ visible: true }).first();
out.publishBtn = await publish.count();
if (out.publishBtn && out.firstLast[0] > 5) { await publish.click(); await sleep(5000); out.published = true; }
out.rowAfter = await y.evaluate(() => [...document.querySelectorAll('ytgn-video-translation-row')].map(r => r.innerText.replace(/\n+/g, ' | ').slice(0, 120)));
await y.screenshot({ path: path.join(S.OUT, 'y11-after.png') });
return out;

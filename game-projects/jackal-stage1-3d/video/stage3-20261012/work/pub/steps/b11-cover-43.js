// B 站：封面——确认「双比例同步改动」关闭，选中 4:3 窗格并上传首页推荐封面
const { page, path, EP, sleep } = S;
const out = {};
out.sync = await page.evaluate(() => { const lab = [...document.querySelectorAll('.bcc-dialog *')].find(e => e.children.length <= 3 && /双比例同步改动/.test(e.innerText || '') && e.offsetParent); if (!lab) return null; const box = lab.querySelector('input[type=checkbox], [class*=checkbox]') || lab.parentElement.querySelector('input[type=checkbox], [class*=checkbox]'); return { html: (lab.outerHTML || '').slice(0, 600), checked: box ? (box.checked !== undefined ? box.checked : /checked|active|is-check/.test(box.className)) : 'unknown' }; });
const label43 = page.locator('.bcc-dialog').getByText('首页推荐封面（4:3）', { exact: false }).first();
out.label43 = await label43.count();
// 点 4:3 画布使其成为当前编辑对象
const panes = await page.evaluate(() => [...document.querySelectorAll('.bcc-dialog canvas, .bcc-dialog [class*=cover-cut], .bcc-dialog [class*=cropper], .bcc-dialog [class*=cover-editor-content-main] > *')].filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return { tag: e.tagName, cls: e.className.toString().slice(0, 70), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }).slice(0, 16));
out.panes = panes;
await page.mouse.click(600, 190); await sleep(500);   // 「首页推荐封面（4:3）」标签
const img = page.locator('.bcc-dialog input[type=file][accept*="image"]').first();
out.imgInputs = await page.locator('input[type=file][accept*="image"]').count();
await (out.imgInputs ? page.locator('input[type=file][accept*="image"]').first() : img).setInputFiles(path.join(EP, 'final/bilibili-zh/cover-home-4x3.jpg'));
await sleep(4000);
await page.screenshot({ path: path.join(S.OUT, 'b11.png') });
return out;

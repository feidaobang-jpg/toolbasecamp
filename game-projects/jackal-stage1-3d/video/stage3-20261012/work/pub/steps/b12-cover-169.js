// B 站：封面——选中 16:9 窗格并上传个人空间封面
const { page, path, EP, sleep } = S;
await page.mouse.click(585, 478); await sleep(600);          // 「个人空间封面（16:9）」标签
await page.mouse.click(726, 617); await sleep(600);          // 16:9 画布
await page.locator('input[type=file][accept*="image"]').first().setInputFiles(path.join(EP, 'final/bilibili-zh/cover-space-16x9.jpg'));
await sleep(4000);
await page.screenshot({ path: path.join(S.OUT, 'b12.png') });
// 右侧预览切到「个人空间」再截一张
const tab = page.locator('.bcc-dialog').getByText('个人空间', { exact: true }).first();
if (await tab.count()) { await tab.click(); await sleep(1200); await page.screenshot({ path: path.join(S.OUT, 'b12b.png') }); }
return { ok: true };

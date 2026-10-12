// 抖音：关掉竖封面提示，点「上传封面」用文件选择器上传 4:3 封面（上一步传到了 AI 参考图栏，没成为封面）
const { path, EP, sleep } = S; const t = S.vars.dy; const out = {};
if (await t.getByText('设置竖封面获更多流量').first().isVisible().catch(() => false)) { await t.mouse.click(934, 246); await sleep(1200); }
out.promptOpen = await t.getByText('设置竖封面获更多流量').first().isVisible().catch(() => false);
const up = t.locator('[class*=modal]').getByText('上传封面', { exact: true }).filter({ visible: true }).first();
out.upBtn = await up.count();
const [chooser] = await Promise.all([t.waitForEvent('filechooser', { timeout: 15000 }), up.click()]);
await chooser.setFiles(path.join(EP, 'final/bilibili-zh/cover-home-4x3.jpg')); await sleep(6000);
await t.screenshot({ path: path.join(S.OUT, 't07-uploaded.png') });
return out;

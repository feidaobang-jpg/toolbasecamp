// 抖音：点黑色「上传封面」按钮（坐标），用文件选择器传 4:3 封面；不行就直接给第二组上传输入框
const { path, EP, sleep } = S; const t = S.vars.dy; const out = {};
const file = path.join(EP, 'final/bilibili-zh/cover-home-4x3.jpg');
try {
  const [chooser] = await Promise.all([t.waitForEvent('filechooser', { timeout: 6000 }), t.mouse.click(919, 601)]);
  await chooser.setFiles(file); out.via = 'chooser';
} catch (e) {
  await t.locator('[class*=modal] input[type=file].semi-upload-hidden-input').nth(1).setInputFiles(file); out.via = 'input-nth1';
}
await sleep(6000);
await t.screenshot({ path: path.join(S.OUT, 't09.png') });
return out;

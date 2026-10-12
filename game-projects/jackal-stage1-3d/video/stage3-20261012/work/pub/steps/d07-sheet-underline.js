// 腾讯文档推流表：A385 残留了下划线格式（之前误写过链接），点工具栏 U 去掉；并顺带看登录标签页状态
const { path, sleep } = S; const d = S.vars.doc; const out = {};
const box = d.locator('input.bar-label').first();
await box.click(); await d.keyboard.press('Control+A'); await d.keyboard.type('A385', { delay: 15 }); await d.keyboard.press('Enter'); await sleep(900);
if ((await box.inputValue()) === 'A385') { await d.mouse.click(177, 130); await sleep(1500); }
await d.screenshot({ path: path.join(S.OUT, 'd07-row.png'), clip: { x: 0, y: 80, width: 1440, height: 660 } });
out.save = await d.evaluate(() => (document.body.innerText.match(/最近保存[^\n]{0,20}|上次修改[^\n]{0,30}/g) || []).slice(0, 2));
out.douyin = { url: S.vars.dy.url(), loggedOut: await S.vars.dy.evaluate(() => /扫码登录|验证码登录/.test(document.body.innerText)).catch(() => null) };
out.youtube = { url: S.vars.yt.url().slice(0, 100) };
return out;

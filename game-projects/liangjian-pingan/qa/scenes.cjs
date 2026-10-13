// 画面巡检：把主角摆到容易穿帮/被遮挡的位置，第三人称与第一人称各截图人工查看（城墙根、门洞、贴墙、巷子、棚顶、院子、回头看），并做全屏与 0×0 启动两项检查
const { open, shot, start, BASE } = require('./lib.cjs');

(async () => {
  const { browser, ctx, page, errors } = await open();
  await start(page);
  await page.evaluate(() => { __lj.manual(true); __lj.app.demo = true; });
  const put = (phase, view, x, z, yaw, extra = '') => page.evaluate(`(function(){ const g = __lj.game; g.reset(${phase}, false); for (const e of g.enemies) { if (e.type !== 'boss') { e.alive = false; e.deadT = 9; } } g.timers.length = 0; g.cut = 0; g.app.s.view = ${view}; g.setView(${view}); g.place(g.hero, ${x}, ${z}); g.cam.yaw = ${yaw}; g.cam.pitch = 0; g.hero.yaw = ${yaw}; g.flags.counter = 1; g.flags.nA = 1; g.flags.nB = 1; g.flags.p1done = 1; ${extra}; __lj.app.ui.clearTransient(); __lj.step(50, true); })()`);
  const cases = [
    ['field-tp', 1, 0, 0, 84, 0],
    ['field-fp', 1, 1, 0, 84, 0],
    ['field-tp-back', 1, 0, 0, 60, Math.PI],
    ['field-tp-east', 1, 0, 20, 60, -Math.PI / 2],
    ['behind-mound-tp', 1, 0, -6, 75.4, 0],
    ['wallbase-tp', 1, 0, 20, -12, 0],
    ['wallbase-tp-up', 1, 0, 20, -9, 0, 'g.cam.pitch = 0.6'],
    ['gate-tunnel-tp', 4, 0, 0, -20.5, 0],
    ['gate-tunnel-fp', 4, 1, 0, -16, 0],
    ['street-tp', 4, 0, 0, -34, 0],
    ['street-tp-back', 4, 0, 0, -34, Math.PI],
    ['street-tp-wall-right', 4, 0, 7.4, -48, 0],
    ['street-tp-side', 4, 0, 5.5, -48, Math.PI / 2],
    ['alley-tp', 4, 0, 24, -60, Math.PI / 2],
    ['shed-top-tp', 4, 0, -4, -61, -1.2, 'g.hero.x = -10.7; g.hero.z = -63; g.hero.y = 2.4; g.hero.vy = 0; g.cam.gy = 2.4'],
    ['depot-fp', 4, 1, 15, -68, 0],
    ['hq-tp', 5, 0, 0, -86, 0],
    ['hq-fp', 5, 1, 0, -86, 0],
    ['hq-tp-corner', 5, 0, -16, -84, -0.8],
    ['platform-top-tp', 1, 0, 6, 66, 1.2, 'g.hero.x = 6; g.hero.z = 60; g.hero.y = 1.5; g.hero.vy = 0; g.cam.gy = 1.5; g.addUnit("enemy", "mg", -16, 58.3, { group: "T", hold: true, wake: 0 })'],
  ];
  for (const [name, phase, view, x, z, yaw, extra] of cases) { await put(phase, view, x, z, yaw, extra || ''); await shot(page, `scene-${name}.png`); }
  // 接管机枪、跳跃、开镜、操炮的动态截图
  await put(1, 0, 0, 70, 0);
  await page.evaluate(() => { const g = __lj.game, m = g.mgs[0]; g.place(g.hero, m.x, m.z - 1.2); g.cam.yaw = 0; __lj.step(4, true); });
  await page.keyboard.press('KeyI'); await page.keyboard.down('KeyJ'); await page.evaluate(() => __lj.step(20, true)); await shot(page, 'scene-mg-tp.png'); await page.keyboard.up('KeyJ');
  await put(1, 0, 0, 70, 0);
  await page.evaluate(() => { const g = __lj.game, m = g.mgs[0]; g.setView(1); g.place(g.hero, m.x, m.z - 1.2); g.cam.yaw = 0; __lj.step(4, true); });
  await page.keyboard.press('KeyI'); await page.keyboard.down('KeyJ'); await page.evaluate(() => __lj.step(20, true)); await shot(page, 'scene-mg-fp.png'); await page.keyboard.up('KeyJ');
  await put(1, 0, 0, 70, 0);
  await page.keyboard.press('KeyK'); await page.evaluate(() => __lj.step(14, true)); await shot(page, 'scene-jump-tp.png');
  await put(1, 0, 0, 84, 0);
  await page.keyboard.down('KeyO'); await page.keyboard.down('KeyJ'); await page.evaluate(() => __lj.step(26, true)); await shot(page, 'scene-ads-fire-tp.png'); await page.keyboard.up('KeyJ'); await page.keyboard.up('KeyO');
  await put(1, 1, 0, 84, 0);
  await page.keyboard.down('KeyO'); await page.keyboard.down('KeyJ'); await page.evaluate(() => __lj.step(26, true)); await shot(page, 'scene-ads-fire-fp.png'); await page.keyboard.up('KeyJ'); await page.keyboard.up('KeyO');
  for (const v of [0, 1]) {
    await put(3, v, 0.5, 28, 0, 'for (const b of g.world.bunkers) b.cd = 999');
    await page.keyboard.press('KeyF'); await page.evaluate(() => __lj.step(30, true)); await shot(page, `scene-cannon-${v ? 'fp' : 'tp'}.png`);
    await page.keyboard.down('KeyJ'); await page.evaluate(() => __lj.step(4, true)); await page.keyboard.up('KeyJ'); await page.evaluate(() => __lj.step(10, true)); await shot(page, `scene-cannon-${v ? 'fp' : 'tp'}-fire.png`);
  }

  // 全屏按钮：请求的是整页（含控件），失败时保持可玩
  await page.evaluate(() => { __lj.manual(false); });
  await page.locator('#btn-full').click();
  await page.waitForTimeout(500);
  const fs1 = await page.evaluate(() => ({ el: document.fullscreenElement ? document.fullscreenElement.tagName : null, state: __lj.app.state }));
  console.log('全屏：', JSON.stringify(fs1));
  if (fs1.el) { await page.evaluate(() => document.exitFullscreen()); await page.waitForTimeout(300); }

  // 以 0×0 的 iframe 启动，随后才给尺寸：游戏要自己重排
  const p2 = await ctx.newPage();
  await p2.setContent(`<html><body style="margin:0;background:#000"><iframe id="f" src="${BASE}?qa=1" style="border:0;width:0;height:0" allow="fullscreen"></iframe></body></html>`);
  await p2.waitForTimeout(2500);
  const fr = p2.frames().find((f) => f.url().includes('gunfire-assembly/pingan'));
  const z0 = await fr.evaluate(() => ({ ok: !!window.__lj, size: window.__lj && __lj.app.size(), loading: document.getElementById('loading').hidden }));
  await p2.evaluate(() => { const f = document.getElementById('f'); f.style.width = '844px'; f.style.height = '390px'; });
  await p2.waitForTimeout(1200);
  const z1 = await fr.evaluate(() => { const cv = document.getElementById('gl'); return { size: __lj.app.size(), canvas: [cv.clientWidth, cv.clientHeight], menu: !document.getElementById('menu').hidden }; });
  console.log('0×0 启动：', JSON.stringify(z0), '→', JSON.stringify(z1));
  console.log(z0.ok && z1.size[0] === 844 && z1.size[1] === 390 && z1.canvas[0] === 844 ? 'PASS 0×0 启动后拿到真实尺寸能自己重排' : 'FAIL 0×0 启动重排');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });

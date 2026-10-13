// 画面巡检：把主角摆到容易穿帮/被遮挡的位置，各视角截图人工查看（城门洞、房后、巷子、院子、转 180°），并做全屏与 0×0 启动两项检查
const { open, shot, BASE } = require('./lib.cjs');

(async () => {
  const { browser, ctx, page, errors } = await open();
  await page.keyboard.press('Enter');
  await page.evaluate(() => { __lj.manual(true); __lj.app.demo = true; });
  const put = (phase, view, x, z, yaw, extra = '') => page.evaluate(`(function(){ const g = __lj.game; g.reset(${phase}, false); for (const e of g.enemies) { if (e.type !== 'boss') { e.alive = false; e.deadT = 9; } } g.timers.length = 0; g.cut = 0; g.app.s.view = ${view}; g.setView(${view}); g.place(g.hero, ${x}, ${z}); g.cam.yaw = ${yaw}; g.hero.yaw = ${yaw}; ${extra}; __lj.app.ui.clearTransient(); __lj.step(50, true); })()`);
  const cases = [
    ['gate-tunnel-tilt', 4, 0, 0, -20, 0],
    ['gate-tunnel-top', 4, 1, 0, -20, 0],
    ['gate-tunnel-chase', 4, 2, 0, -20.5, 0],
    ['gate-tunnel-fp', 4, 3, 0, -16, 0],
    ['behind-house-tilt', 4, 0, -15, -55.3, 0],
    ['street-chase', 4, 2, 0, -34, 0],
    ['street-chase-back', 4, 2, 0, -34, Math.PI],
    ['street-chase-side', 4, 2, 5.5, -48, Math.PI / 2],
    ['alley-tilt-rot', 4, 0, 24, -60, Math.PI / 2],
    ['depot-fp', 4, 3, 15, -68, 0],
    ['hq-fp', 5, 3, 0, -86, 0],
    ['hq-chase', 5, 2, 0, -86, 0],
    ['hq-top', 5, 1, 0, -92, 0],
    ['field-chase-back', 1, 2, 0, 60, Math.PI],
    ['field-fp-east', 1, 3, 20, 60, -Math.PI / 2],
    ['wallbase-chase', 1, 2, 20, -12, 0],
    ['under-tower-tilt', 3, 0, 0, -13, 0],
  ];
  for (const [name, phase, view, x, z, yaw] of cases) { await put(phase, view, x, z, yaw); await shot(page, `scene-${name}.png`); }
  // 亮剑、骑兵、手榴弹的动态截图
  await put(1, 2, 0, 70, 0);
  await page.keyboard.press('KeyI'); await page.evaluate(() => __lj.step(75, true)); await shot(page, 'scene-cavalry-chase.png');
  await put(1, 0, 0, 70, 0);
  await page.keyboard.press('KeyI'); await page.evaluate(() => __lj.step(80, true)); await shot(page, 'scene-cavalry-tilt.png');
  await put(1, 2, 0, 70, 0);
  await page.keyboard.press('KeyU'); await page.evaluate(() => __lj.step(9, true)); await shot(page, 'scene-dash-chase.png');
  await put(3, 3, 0.5, 28, 0, 'for (const b of g.world.bunkers) b.cd = 999');
  await page.keyboard.press('KeyJ'); await page.evaluate(() => __lj.step(30, true)); await shot(page, 'scene-cannon-fp.png');
  await page.keyboard.down('KeyJ'); await page.evaluate(() => __lj.step(4, true)); await page.keyboard.up('KeyJ'); await page.evaluate(() => __lj.step(10, true)); await shot(page, 'scene-cannon-fp-fire.png');

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
  const fr = p2.frames().find((f) => f.url().includes('liangjian-pingan'));
  const z0 = await fr.evaluate(() => ({ ok: !!window.__lj, size: window.__lj && __lj.app.size(), loading: document.getElementById('loading').hidden }));
  await p2.evaluate(() => { const f = document.getElementById('f'); f.style.width = '844px'; f.style.height = '390px'; });
  await p2.waitForTimeout(1200);
  const z1 = await fr.evaluate(() => { const cv = document.getElementById('gl'); return { size: __lj.app.size(), canvas: [cv.clientWidth, cv.clientHeight], menu: !document.getElementById('menu').hidden }; });
  console.log('0×0 启动：', JSON.stringify(z0), '→', JSON.stringify(z1));
  console.log(z0.ok && z1.size[0] === 844 && z1.size[1] === 390 && z1.canvas[0] === 844 ? 'PASS 0×0 启动后拿到真实尺寸能自己重排' : 'FAIL 0×0 启动重排');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });

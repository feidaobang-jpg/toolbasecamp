// 四个视角：WASD / 射击方向是否跟镜头走、Q/E 与鼠标拖动的转向方向、C 循环与回正；并各截一张图
const { open, shot } = require('./lib.cjs');

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

(async () => {
  const { browser, page, errors } = await open();
  await page.keyboard.press('Enter');
  await page.evaluate(() => { __lj.manual(true); __lj.app.demo = true; });
  const st = () => page.evaluate(() => {
    const g = __lj.game, c = g.camera, f = new (c.position.constructor)();
    c.getWorldDirection(f);
    const l = Math.hypot(f.x, f.z) || 1;
    return { x: g.hero.x, z: g.hero.z, yaw: g.cam.yaw, view: g.cam.view, fx: f.x / l, fz: f.z / l, fy: f.y, heroYaw: g.hero.yaw, bullets: g.bullets.filter((b) => b.team === 0).map((b) => [b.dx, b.dz]) };
  });
  const step = (n) => page.evaluate((k) => __lj.step(k, true), n);
  const hold = async (key, n) => { await page.keyboard.down(key); await step(n); await page.keyboard.up(key); await step(2); };
  const names = ['斜俯视', '战术俯视', '正视', '第一人称'];

  for (let v = 0; v < 4; v++) {
    // 干净场地：清掉敌人，站在出发阵地前的空地
    await page.evaluate((view) => { const g = __lj.game; g.reset(1, false); for (const e of g.enemies) { e.alive = false; e.deadT = 9; } g.app.s.view = view; g.setView(view); g.cam.yaw = 0; g.place(g.hero, 0, 80); __lj.step(20, true); }, v);
    let a = await st();
    // 俯视类镜头近乎垂直，前向量取镜头的“上方向”在水平面的投影更稳，这里统一用视线 yaw 换算
    const fwd = (s) => [-Math.sin(s.yaw), -Math.cos(s.yaw)], right = (s) => [Math.cos(s.yaw), -Math.sin(s.yaw)];
    await hold('KeyW', 30);
    let b = await st();
    let d = [b.x - a.x, b.z - a.z], l = Math.hypot(d[0], d[1]) || 1, f = fwd(a), r = right(a);
    check(`${names[v]}：W 朝镜头前方走`, l > 1 && (d[0] * f[0] + d[1] * f[1]) / l > 0.95, { moved: l.toFixed(2) });
    check(`${names[v]}：镜头前向量与视线一致`, v === 1 || (b.fx * f[0] + b.fz * f[1]) > 0.97, { cam: [b.fx.toFixed(2), b.fz.toFixed(2)] });
    a = b;
    await hold('KeyD', 30);
    b = await st();
    d = [b.x - a.x, b.z - a.z]; l = Math.hypot(d[0], d[1]) || 1;
    check(`${names[v]}：D 朝镜头右方走`, l > 1 && (d[0] * r[0] + d[1] * r[1]) / l > 0.95, { moved: l.toFixed(2) });
    // E 向右转
    a = await st();
    await hold('KeyE', 40);
    b = await st();
    const turn = (s0, s1) => { const f1 = fwd(s1), r0 = right(s0); return f1[0] * r0[0] + f1[1] * r0[1]; };
    check(`${names[v]}：E 向右转`, turn(a, b) > 0.3, { proj: turn(a, b).toFixed(2), dyaw: (b.yaw - a.yaw).toFixed(2) });
    check(`${names[v]}：站立转视角时身体跟着转`, Math.abs(Math.atan2(Math.sin(b.heroYaw - b.yaw), Math.cos(b.heroYaw - b.yaw))) < 0.5, { heroYaw: b.heroYaw.toFixed(2), yaw: b.yaw.toFixed(2) });
    // 转过之后 W 仍朝新的前方
    a = await st();
    await hold('KeyW', 24);
    b = await st();
    d = [b.x - a.x, b.z - a.z]; l = Math.hypot(d[0], d[1]) || 1; f = fwd(a);
    check(`${names[v]}：转向后 W 仍朝镜头前方`, l > 1 && (d[0] * f[0] + d[1] * f[1]) / l > 0.95, { moved: l.toFixed(2) });
    // 没有目标时子弹朝前方打
    await page.keyboard.down('KeyJ'); await step(6); const s2 = await st(); await page.keyboard.up('KeyJ'); await step(2);
    const bl = s2.bullets[0], hf = [-Math.sin(s2.heroYaw), -Math.cos(s2.heroYaw)];
    check(`${names[v]}：无目标时朝面向开枪`, bl && (bl[0] * hf[0] + bl[1] * hf[1]) > 0.9, { bullet: bl && bl.map((n) => n.toFixed(2)) });
    // Q 向左转
    a = await st();
    await hold('KeyQ', 40);
    b = await st();
    check(`${names[v]}：Q 向左转`, turn(a, b) < -0.3, { proj: turn(a, b).toFixed(2) });
    // 鼠标向右拖 → 向右看
    a = await st();
    await page.mouse.move(640, 300); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(640 + i * 20, 300); await step(2); }
    await page.mouse.up(); await step(20);
    b = await st();
    check(`${names[v]}：鼠标右拖向右看`, turn(a, b) > 0.2, { proj: turn(a, b).toFixed(2) });
    a = b;
    await page.mouse.move(640, 300); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(640 - i * 20, 300); await step(2); }
    await page.mouse.up(); await step(20);
    b = await st();
    check(`${names[v]}：鼠标左拖向左看`, turn(a, b) < -0.2, { proj: turn(a, b).toFixed(2) });
    // 纵向拖动有限位
    const p0 = await page.evaluate(() => __lj.game.cam.pitch);
    await page.mouse.move(640, 200); await page.mouse.down();
    for (let i = 1; i <= 20; i++) { await page.mouse.move(640, 200 + i * 20); await step(2); }
    await page.mouse.up(); await step(20);
    const p1 = await page.evaluate(() => ({ p: __lj.game.cam.pitch, y: __lj.game.camera.position.y }));
    check(`${names[v]}：纵向拖动改变俯仰且镜头不钻地`, Math.abs(p1.p - p0) > 0.05 && p1.y > 0.4, { pitch: p1.p.toFixed(2), camY: p1.y.toFixed(2) });
    // 回到干净站位截图
    await page.evaluate((view) => { const g = __lj.game; g.reset(1, false); g.app.s.view = view; g.setView(view); g.place(g.hero, 0, 80); __lj.step(90, true); }, v);
    await shot(page, `view-${v}.png`);
  }

  // C 循环 + 回正
  await page.evaluate(() => { const g = __lj.game; g.reset(1, false); g.app.s.view = 0; g.setView(0); __lj.step(5, true); });
  await hold('KeyE', 30);
  const order = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyC'); await step(3); order.push(await page.evaluate(() => [__lj.game.cam.view, +__lj.game.cam.yaw.toFixed(3), document.getElementById('view-name').textContent])); }
  check('C 依次循环四个视角并回正', order.map((o) => o[0]).join() === '1,2,3,0' && order.every((o) => o[1] === 0), order);

  // 操炮：四个视角下 A/D、W/S 与落点
  await page.evaluate(() => { const g = __lj.game; g.reset(3, false); for (const e of g.enemies) { e.alive = false; e.deadT = 9; } for (const b of g.world.bunkers) b.cd = 999; g.place(g.hero, 0.5, 28); __lj.step(10, true); });
  await page.keyboard.press('KeyJ'); await step(5);
  const manned = await page.evaluate(() => __lj.game.cannon.manned);
  check('炮位旁按 J 上炮', manned, null);
  const shells0 = await page.evaluate(() => __lj.game.cannon.shells);
  check('上炮那一下按键不会直接开炮', shells0 === 8, { shells: shells0 });
  for (let v = 0; v < 4; v++) {
    await page.evaluate((view) => { const g = __lj.game; g.app.s.view = view; g.setView(view); g.cam.yaw = 0; g.cannon.elev = 0.2; __lj.step(20, true); }, v);
    const c0 = await page.evaluate(() => ({ yaw: __lj.game.cannon.aimYaw, el: __lj.game.cannon.elev }));
    await hold('KeyD', 30);
    const c1 = await page.evaluate(() => ({ yaw: __lj.game.cannon.aimYaw, el: __lj.game.cannon.elev }));
    await hold('KeyW', 30);
    const c2 = await page.evaluate(() => ({ yaw: __lj.game.cannon.aimYaw, el: __lj.game.cannon.elev }));
    check(`操炮·${names[v]}：D 炮口右转、W 抬高仰角`, c1.yaw < c0.yaw - 0.1 && c2.el > c1.el + 0.05, { c0, c1, c2 });
    await page.evaluate(() => { const g = __lj.game; g.cam.yaw = 0; g.cannon.elev = 0.16; __lj.step(30, true); });
    await shot(page, `cannon-view-${v}.png`);
  }
  await page.keyboard.press('KeyK'); await step(5);
  check('K 离开炮位', await page.evaluate(() => !__lj.game.cannon.manned), null);

  const bad = results.filter((r) => !r.ok);
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
  console.log(`\n${results.length - bad.length}/${results.length} 通过`);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  require('fs').writeFileSync(require('path').join(__dirname, 'out-views.json'), JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 1));
  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

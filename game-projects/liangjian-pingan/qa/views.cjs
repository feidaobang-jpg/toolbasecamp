// 枪战类操作验收：两个视角下的移动 / Q,E / Y,H / 鼠标瞄准、吸附与爆头、换弹、开镜、跳跃与关卡里的可跳物、操炮
// Edge 无头浏览器，真实键盘与鼠标事件 + 手动步进。
const { open, shot, start } = require('./lib.cjs');

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
const DEG = Math.PI / 180;

(async () => {
  const { browser, page, errors } = await open();
  await start(page);
  await page.evaluate(() => { __lj.manual(true); __lj.app.demo = true; });
  const step = (n) => page.evaluate((k) => __lj.step(k, true), n);
  const hold = async (key, n) => { await page.keyboard.down(key); await step(n); await page.keyboard.up(key); await step(2); };
  // 干净场地：清掉敌人和定时台词，主角放到指定位置
  const clean = (view, x = 0, z = 80, yaw = 0, phase = 1) => page.evaluate(([v, px, pz, y, ph]) => {
    const g = __lj.game; g.reset(ph, false);
    for (const e of g.enemies) { if (e.type !== 'boss') { e.alive = false; e.deadT = 9; } }
    g.timers.length = 0; g.cut = 0; g.flags.counter = 1; g.flags.nA = 1; g.flags.nB = 1; g.flags.p1done = 1;
    g.app.s.view = v; g.setView(v); g.place(g.hero, px, pz); g.cam.yaw = y; g.cam.pitch = 0; g.hero.yaw = y;
    __lj.app.ui.clearTransient(); __lj.step(12, true);
  }, [view, x, z, yaw, phase]);
  const st = () => page.evaluate(() => {
    const g = __lj.game, c = g.camera, f = new (c.position.constructor)(); c.getWorldDirection(f);
    const h = g.hero;
    return { x: h.x, y: h.y, z: h.z, yaw: g.cam.yaw, pitch: g.cam.pitch, view: g.cam.view, f: [f.x, f.y, f.z], camY: c.position.y, fov: c.fov, heroYaw: h.yaw, mag: h.mag, reloadT: h.reloadT, onGround: h.onGround, hp: h.hp,
      bullets: g.bullets.filter((b) => b.team === 0).map((b) => [b.dx, b.dy, b.dz]), target: g.aim.target ? g.aim.target.type : null, ads: h.ads };
  });
  const fwd = (s) => [-Math.sin(s.yaw), -Math.cos(s.yaw)], right = (s) => [Math.cos(s.yaw), -Math.sin(s.yaw)];
  const turn = (s0, s1) => { const f1 = fwd(s1), r0 = right(s0); return f1[0] * r0[0] + f1[1] * r0[1]; };
  const names = ['第三人称', '第一人称'];

  for (let v = 0; v < 2; v++) {
    const N = names[v];
    await clean(v);
    let a = await st();
    await hold('KeyW', 30);
    let b = await st();
    let d = [b.x - a.x, b.z - a.z], l = Math.hypot(d[0], d[1]) || 1, f = fwd(a), r = right(a);
    check(`${N}：W 朝镜头前方走`, l > 1 && (d[0] * f[0] + d[1] * f[1]) / l > 0.97, { moved: l.toFixed(2) });
    const fl = Math.hypot(b.f[0], b.f[2]);
    check(`${N}：镜头前向量与瞄准方向一致`, (b.f[0] * f[0] + b.f[2] * f[1]) / fl > 0.995, { f: b.f.map((n) => n.toFixed(2)) });
    a = b;
    await hold('KeyD', 30);
    b = await st();
    d = [b.x - a.x, b.z - a.z]; l = Math.hypot(d[0], d[1]) || 1;
    check(`${N}：D 向右平移且身体不转身`, l > 1 && (d[0] * r[0] + d[1] * r[1]) / l > 0.97 && Math.abs(b.heroYaw - b.yaw) < 0.05, { moved: l.toFixed(2), heroYaw: b.heroYaw.toFixed(2) });
    // Q/E
    a = await st(); await hold('KeyE', 40); b = await st();
    check(`${N}：E 向右转，身体跟着转`, turn(a, b) > 0.5 && Math.abs(Math.atan2(Math.sin(b.heroYaw - b.yaw), Math.cos(b.heroYaw - b.yaw))) < 0.25, { proj: turn(a, b).toFixed(2) });
    a = b; await hold('KeyW', 24); b = await st();
    d = [b.x - a.x, b.z - a.z]; l = Math.hypot(d[0], d[1]) || 1; f = fwd(a);
    check(`${N}：转向后 W 仍朝镜头前方`, l > 1 && (d[0] * f[0] + d[1] * f[1]) / l > 0.97, null);
    a = await st(); await hold('KeyQ', 40); b = await st();
    check(`${N}：Q 向左转`, turn(a, b) < -0.5, { proj: turn(a, b).toFixed(2) });
    // Y/H
    await clean(v);
    a = await st(); await hold('KeyY', 20); b = await st();
    check(`${N}：Y 抬头（镜头前向量向上）`, b.pitch > a.pitch + 0.2 && b.f[1] > a.f[1] + 0.15, { pitch: b.pitch.toFixed(2), fy: b.f[1].toFixed(2) });
    a = b; await hold('KeyH', 20); b = await st();
    check(`${N}：H 低头`, b.pitch < a.pitch - 0.2 && b.f[1] < a.f[1] - 0.15, { pitch: b.pitch.toFixed(2) });
    await hold('KeyY', 200); const up = await st();
    await hold('KeyH', 260); const dn = await st();
    const lim = v === 0 ? [-50, 42] : [-60, 60];
    check(`${N}：Y/H 有上下限位，镜头不钻地`, Math.abs(up.pitch / DEG - lim[1]) < 0.6 && Math.abs(dn.pitch / DEG - lim[0]) < 0.6 && up.camY > 0.25 && dn.camY > 0.25, { up: (up.pitch / DEG).toFixed(1), dn: (dn.pitch / DEG).toFixed(1), camYUp: up.camY.toFixed(2) });
    // 松开即停
    await clean(v); await hold('KeyY', 10); a = await st(); await step(20); b = await st();
    check(`${N}：松开 Y 立即停止`, Math.abs(b.pitch - a.pitch) < 0.01, null);
    // 鼠标：右键按住拖动转视角
    await clean(v);
    a = await st();
    await page.mouse.move(640, 300); await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 10; i++) { await page.mouse.move(640 + i * 20, 300); await step(2); }
    await page.mouse.up({ button: 'right' }); await step(20);
    b = await st();
    check(`${N}：鼠标右键向右拖＝向右看`, turn(a, b) > 0.2, { proj: turn(a, b).toFixed(2) });
    a = b;
    await page.mouse.move(640, 300); await page.mouse.down({ button: 'right' });
    for (let i = 1; i <= 10; i++) { await page.mouse.move(640, 300 - i * 14); await step(2); }
    await page.mouse.up({ button: 'right' }); await step(20);
    b = await st();
    check(`${N}：鼠标向上拖＝抬头`, b.pitch > a.pitch + 0.1 && Math.abs(turn(a, b)) < 0.05, { dp: (b.pitch - a.pitch).toFixed(2) });
    check(`${N}：右键拖动过程中不误触开镜`, !b.ads, null);
    // 左键：按住开火，同时拖动也能转视角
    await clean(v);
    a = await st();
    await page.mouse.move(640, 320); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(640 - i * 18, 320); await step(2); }
    const mid = await st();
    await page.mouse.up(); await step(4);
    b = await st();
    check(`${N}：左键按住开火，拖动同时向左转`, mid.bullets.length > 0 && turn(a, mid) < -0.1 && mid.mag < 20, { bullets: mid.bullets.length, proj: turn(a, mid).toFixed(2), mag: mid.mag });
    await step(30); const after = await st();
    check(`${N}：松开左键停火`, after.mag === b.mag, { mag: [b.mag, after.mag] });
    // 右键单击（不拖）切换开镜，视野变窄；再点恢复
    const f0 = (await st()).fov;
    await page.mouse.move(640, 320); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await step(30);
    const f1 = await st();
    await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await step(30);
    const f2 = await st();
    check(`${N}：右键单击切换开镜（视野变窄再恢复）`, f1.ads && f1.fov < f0 - 8 && !f2.ads && Math.abs(f2.fov - f0) < 0.5, { f0, f1: f1.fov.toFixed(1), f2: f2.fov.toFixed(1) });
    // 键盘 O 按住开镜
    await page.keyboard.down('KeyO'); await step(30); const o1 = await st(); await page.keyboard.up('KeyO'); await step(30); const o2 = await st();
    check(`${N}：按住 O 开镜、松开恢复`, o1.ads && o1.fov < f0 - 8 && !o2.ads, null);
    // 没有目标时子弹沿准星方向飞
    await clean(v);
    await page.keyboard.down('KeyJ'); await step(4); const s2 = await st(); await page.keyboard.up('KeyJ'); await step(2);
    const bl = s2.bullets[0];
    check(`${N}：J 开火，无目标时沿准星方向`, bl && bl[0] * s2.f[0] + bl[1] * s2.f[1] + bl[2] * s2.f[2] > 0.985, { bullet: bl && bl.map((n) => n.toFixed(2)), f: s2.f.map((n) => n.toFixed(2)) });

    // 吸附：按键转视角时偏 2° 能吸住并打中，偏 8° 吸不住也打不中
    for (const [off, expect] of [[2, true], [8, false]]) {
      await clean(v);
      const r1 = await page.evaluate(([deg]) => {
        const g = __lj.game, h = g.hero, DEG = Math.PI / 180;
        const e = g.addUnit('enemy', 'rifle', h.x, h.z - 20, { hold: true, group: 'T', wake: 0 });
        g.input.lookSrc = 'key';
        __lj.step(2, false);
        // 先对准，再偏开指定角度
        const cam = g.camera.position;
        g.cam.yaw = Math.atan2(-(e.x - cam.x), -(e.z - cam.z)) + deg * DEG;
        g.cam.pitch = Math.atan2(1.05 - cam.y, Math.hypot(e.x - cam.x, e.z - cam.z));
        __lj.step(3, false);
        const cam2 = g.camera.position;
        g.cam.yaw = Math.atan2(-(e.x - cam2.x), -(e.z - cam2.z)) + deg * DEG;
        g.cam.pitch = Math.atan2(1.05 - cam2.y, Math.hypot(e.x - cam2.x, e.z - cam2.z));
        __lj.step(2, false);
        const magnet = g.aim.target === e;
        g.hero.aim = 1;
        g.heroShoot(); __lj.step(30, false);
        return { magnet, hp: e.hp, alive: e.alive };
      }, [off]);
      check(`${N}：准星偏 ${off}°${expect ? '能吸住并命中' : '吸不住、打不中'}`, r1.magnet === expect && (expect ? r1.hp < 2 : r1.hp === 2), r1);
    }
    // 鼠标瞄准时吸附更小：偏 4.5° 不吸（角度从身体边缘算起，所以比标称的吸附角宽一点）
    await clean(v);
    const rm = await page.evaluate(() => {
      const g = __lj.game, h = g.hero, DEG = Math.PI / 180;
      const e = g.addUnit('enemy', 'rifle', h.x, h.z - 20, { hold: true, group: 'T', wake: 0 });
      __lj.step(3, false);
      const res = {};
      for (const src of ['key', 'mouse']) {
        g.input.lookSrc = src;
        const cam = g.camera.position;
        g.cam.yaw = Math.atan2(-(e.x - cam.x), -(e.z - cam.z)) + 4.5 * DEG;
        g.cam.pitch = Math.atan2(1.05 - cam.y, Math.hypot(e.x - cam.x, e.z - cam.z));
        __lj.step(3, false);
        const cam2 = g.camera.position;
        g.cam.yaw = Math.atan2(-(e.x - cam2.x), -(e.z - cam2.z)) + 4.5 * DEG;
        g.input.lookSrc = src; __lj.step(1, false);
        res[src] = g.aim.target === e;
      }
      return res;
    });
    check(`${N}：偏 4.5° 时按键/触屏瞄准会吸附，鼠标瞄准不吸`, rm.key === true && rm.mouse === false, rm);
    // 爆头：准星压在头上伤害加倍（2 血的步兵一枪倒），打身体只扣 1
    await clean(v);
    const hs = await page.evaluate(() => {
      const g = __lj.game, h = g.hero, out = {};
      for (const [part, yy] of [['body', 0.95], ['head', 1.58]]) {
        const e = g.addUnit('enemy', 'rifle', h.x + (part === 'body' ? -3 : 3), h.z - 15, { hold: true, group: 'T', wake: 0 });
        __lj.step(2, false);
        for (let k = 0; k < 4; k++) { const cam = g.camera.position; g.cam.yaw = Math.atan2(-(e.x - cam.x), -(e.z - cam.z)); g.cam.pitch = Math.atan2(yy - cam.y, Math.hypot(e.x - cam.x, e.z - cam.z)); __lj.step(2, false); }
        h.ads = true; h.moving = 0; h.aim = 1; g.computeAim();
        const heads0 = g.stats.heads;
        g.heroShoot(); h.fireCd = 0; __lj.step(25, false);
        out[part] = { hp: e.hp, alive: e.alive, heads: g.stats.heads - heads0 };
        e.alive = false; e.deadT = 9;
      }
      return out;
    });
    check(`${N}：打身体扣 1 血，打头加倍（一枪倒）并记爆头`, hs.body.hp === 1 && hs.body.heads === 0 && !hs.head.alive && hs.head.heads === 1, hs);
    await clean(v);
    await shot(page, `view-${v}.png`);
  }

  // C 在两个视角间切换，保持瞄准方向
  await clean(0);
  await hold('KeyE', 20); await hold('KeyY', 10);
  const c0 = await st();
  await page.keyboard.press('KeyC'); await step(3); const c1 = await st();
  const n1 = await page.evaluate(() => document.getElementById('view-name').textContent);
  await page.keyboard.press('KeyC'); await step(3); const c2 = await st();
  check('C 在第三人称 / 第一人称间切换，瞄准方向不变', c1.view === 1 && c2.view === 0 && Math.abs(c1.yaw - c0.yaw) < 1e-6 && Math.abs(c1.pitch - c0.pitch) < 1e-6 && n1 === '第一人称', { c0: [c0.yaw, c0.pitch], c1: [c1.view, c1.yaw, c1.pitch], n1 });

  // 换弹
  await clean(0);
  await page.keyboard.down('KeyJ'); await step(40); await page.keyboard.up('KeyJ'); await step(2);
  let r0 = await st();
  await page.keyboard.press('KeyR'); await step(4); const r1 = await st();
  await page.keyboard.down('KeyJ'); await step(20); const r2 = await st(); await page.keyboard.up('KeyJ');
  await step(70); const r3 = await st();
  check('R 手动换弹：换弹中不能开火，换完弹匣回满', r0.mag < 20 && r0.mag > 0 && r1.reloadT > 0 && r2.mag === r1.mag && r3.mag === 20 && r3.reloadT <= 0, { mag0: r0.mag, r1: r1.reloadT.toFixed(2), mag2: r2.mag, mag3: r3.mag });
  await page.keyboard.down('KeyJ'); await step(260); const e1 = await st(); await page.keyboard.up('KeyJ'); await step(90); const e2 = await st();
  check('打空后自动换弹', e2.mag === 20, { during: e1.mag, after: e2.mag });
  const idle = await page.evaluate(() => { const g = __lj.game; g.hero.mag = 7; __lj.step(240, false); return g.hero.mag; });
  check('不再有“停火一会儿自动补满”', idle === 7, { idle });

  // ---------- 跳跃 ----------
  for (const key of ['KeyK', 'Space']) {
    await clean(0);
    await page.keyboard.press(key);
    const ys = await page.evaluate(() => { const g = __lj.game, out = []; for (let i = 0; i < 60; i++) { __lj.step(1, false); out.push(g.hero.y); } return { max: Math.max(...out), end: out[out.length - 1], ground: g.hero.onGround, jumps: g.stats.jumps }; });
    check(`${key === 'KeyK' ? 'K' : '空格'} 起跳约 1.3 米并落回地面`, ys.max > 1.15 && ys.max < 1.45 && ys.end === 0 && ys.ground, ys);
  }
  await clean(0);
  const dj = await page.evaluate(() => { const g = __lj.game, inp = g.input; inp.key('KeyK', true); inp.key('KeyK', false); __lj.step(12, false); const y1 = g.hero.y, vy1 = g.hero.vy; inp.key('KeyK', true); inp.key('KeyK', false); __lj.step(2, false); return { y1, vy1, vy2: g.hero.vy }; });
  check('空中不能二段跳', dj.vy2 < dj.vy1, dj);
  // 箱子：走不上去，跳得上去
  await clean(0, 19, 49.8, 0);
  await hold('KeyW', 50); let j0 = await st();
  check('箱子（0.8 米）走不上去', j0.y === 0 && j0.z > 47.95 + 0.4, { z: j0.z.toFixed(2) });
  // 一直按着前进起跳，也要能落在箱子上（不用半空松手）
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyK');
  const land = await page.evaluate(() => { const g = __lj.game, h = g.hero; let on = 0, first = null; for (let i = 0; i < 34; i++) { __lj.step(1, false); if (h.onGround && Math.abs(h.y - 0.8) < 0.02) { on++; if (first === null) first = { frame: i, z: +h.z.toFixed(2) }; } } return { on, first }; });
  await page.keyboard.up('KeyW'); await step(3);
  let j1 = await st();
  check('贴着箱子按住前进起跳，能落在箱子上（不用半空松手）', land.on >= 3 && land.first && land.first.z < 48.3 && land.first.z > 45.7, { land, y: j1.y.toFixed(2), z: j1.z.toFixed(2) });
  await clean(0, 19, 48.5, 0);
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyK'); await step(18); await page.keyboard.up('KeyW'); await step(40);
  j1 = await st();
  check('跳上箱子后松开方向能稳稳站住', Math.abs(j1.y - 0.8) < 0.02 && j1.onGround, { y: j1.y.toFixed(2), z: j1.z.toFixed(2) });
  await shot(page, 'jump-on-crate.png');
  await hold('KeyW', 40); j1 = await st();
  check('从箱子另一侧走下去落回地面', j1.y === 0 && j1.z < 45.75, { y: j1.y, z: j1.z.toFixed(2) });
  // 铁丝网
  await clean(0, -16, 66, 0);
  await hold('KeyW', 60); j0 = await st();
  check('铁丝网走不过去', j0.z > 63.78 + 0.4, { z: j0.z.toFixed(2) });
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyK'); await step(40); await page.keyboard.up('KeyW'); await step(10);
  j1 = await st();
  check('铁丝网跳得过去', j1.z < 63.2 && j1.y === 0, { z: j1.z.toFixed(2) });
  const wire = await page.evaluate(() => { const g = __lj.game; const a = g.allies[0]; g.place(a, -16, 64.6); a.hold = true; a.px = -16; a.pz = 59.5; __lj.step(90, false); return { z: a.z }; });
  check('铁丝网只拦主角，战友照常通过', wire.z < 62, wire);
  // 土台：踩箱子上土台顶
  const plat = await page.evaluate(() => __lj.game.world.colliders.filter((c) => c.tag === 'crate' || c.tag === 'mound').map((c) => [c.x0, c.x1, c.z0, c.z1, c.h, c.tag]).filter((c) => Math.abs((c[0] + c[1]) / 2 - 6) < 3 && Math.abs((c[2] + c[3]) / 2 - 61) < 3));
  await clean(0, 6.6, 64.6, 0);
  await hold('KeyW', 30);
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyK'); await step(40); await page.keyboard.up('KeyW'); await step(10);
  const p1 = await st();
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyK'); await step(40); await page.keyboard.up('KeyW'); await step(10);
  const p2 = await st();
  check('两跳上土台顶（箱子 0.78 → 土台 1.5）', Math.abs(p1.y - 0.78) < 0.03 && Math.abs(p2.y - 1.5) < 0.03 && p2.onGround, { p1: [p1.y.toFixed(2), p1.z.toFixed(2)], p2: [p2.y.toFixed(2), p2.z.toFixed(2)], plat });
  await shot(page, 'jump-on-platform.png');
  // 机枪阵地：从腰高的侧墙跳进去
  await clean(0, -11.6, 58, Math.PI / 2);
  await hold('KeyW', 40); j0 = await st();
  check('机枪阵地侧墙走不进去', j0.x > -13.3 + 0.4, { x: j0.x.toFixed(2) });
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyK'); await step(36); await page.keyboard.up('KeyW'); await step(30);
  j1 = await st();
  check('从侧墙跳进机枪阵地', j1.x < -14.1 && j1.y < 0.01, { x: j1.x.toFixed(2), y: j1.y.toFixed(2) });
  // 空中按实际高度判定：脚下飞过的子弹打不到
  await clean(0);
  const air = await page.evaluate(() => { const g = __lj.game, h = g.hero; __lj.app.demo = false; h.inv = 0; h.y = 1.2; h.vy = 2; h.onGround = false; g.fireBullet(1, h.x + 3, 0.6, h.z, h.x - 3, 0.6, h.z, 1, 60, null); __lj.step(6, false); const low = h.hp; h.inv = 0; g.fireBullet(1, h.x + 3, h.y + 1.0, h.z, h.x - 3, h.y + 1.0, h.z, 1, 60, null); __lj.step(4, false); const r = { low, high: h.hp, max: h.maxHp }; __lj.app.demo = true; return r; });
  check('跳在空中：脚下的子弹打不到，打在身上的照常扣血', air.low === air.max && air.high === air.max - 1, air);
  // 跳起躲过山本的贴地突进；不跳就挨刀
  const boss = await page.evaluate(() => {
    const out = {};
    for (const jump of [false, true]) {
      const g = __lj.game; g.reset(5, false); g.cut = 0; g.timers.length = 0; __lj.app.demo = false;
      const h = g.hero, b = g.boss;
      g.place(h, 0, -88); h.inv = 0;
      b.x = 0; b.z = -96; b.state = 'dash'; b.dx = 0; b.dz = 1; b.left = 14; b.hitDone = false; b.second = true;
      __lj.step(4, false);
      if (jump) { g.input.key('KeyK', true); g.input.key('KeyK', false); }
      __lj.step(40, false);
      out[jump ? 'jump' : 'stand'] = { hp: h.hp, max: h.maxHp, flag: !!g.flags.jumpDodge };
    }
    __lj.app.demo = true;
    return out;
  });
  check('山本突进：站着挨一刀（-2），跳起来躲过', boss.stand.hp === boss.stand.max - 2 && boss.jump.hp === boss.jump.max && boss.jump.flag, boss);

  // ---------- 操炮 ----------
  await clean(0, 0.5, 28, 0, 3);
  await page.evaluate(() => { for (const b of __lj.game.world.bunkers) b.cd = 999; });
  const pr = await page.evaluate(() => ({ prompt: document.getElementById('prompt').textContent, hidden: document.getElementById('prompt').hidden }));
  await page.keyboard.down('KeyJ'); await step(3);
  await page.keyboard.press('KeyF'); await step(6);
  const m1 = await page.evaluate(() => ({ manned: __lj.game.cannon.manned, shells: __lj.game.cannon.shells }));
  await page.keyboard.up('KeyJ'); await step(3);
  check('炮位旁提示“按 F 操炮”，按 F 上炮；上炮时按着开火键也不会直接开炮', !pr.hidden && /F/.test(pr.prompt) && m1.manned && m1.shells === 8, { pr, m1 });
  for (let v = 0; v < 2; v++) {
    await page.evaluate((view) => { const g = __lj.game; g.app.s.view = view; g.setView(view); g.cam.yaw = 0; g.cannon.elev = 0.2; __lj.step(20, true); }, v);
    const c0 = await page.evaluate(() => ({ yaw: __lj.game.cannon.aimYaw, el: __lj.game.cannon.elev }));
    await hold('KeyD', 30); const c1 = await page.evaluate(() => ({ yaw: __lj.game.cannon.aimYaw, el: __lj.game.cannon.elev }));
    await hold('KeyW', 30); const c2 = await page.evaluate(() => ({ yaw: __lj.game.cannon.aimYaw, el: __lj.game.cannon.elev }));
    await hold('KeyH', 20); const c3 = await page.evaluate(() => ({ yaw: __lj.game.cannon.aimYaw, el: __lj.game.cannon.elev }));
    await hold('KeyQ', 20); const c4 = await page.evaluate(() => ({ yaw: __lj.game.cannon.aimYaw, el: __lj.game.cannon.elev }));
    check(`操炮·${names[v]}：D 右转、W 抬高、H 压低、Q 左转`, c1.yaw < c0.yaw - 0.1 && c2.el > c1.el + 0.05 && c3.el < c2.el - 0.03 && c4.yaw > c3.yaw + 0.1, { c0, c1, c2, c3, c4 });
    await page.evaluate(() => { const g = __lj.game; g.cam.yaw = 0; g.cannon.elev = 0.16; __lj.step(30, true); });
    await shot(page, `cannon-view-${v}.png`);
  }
  await page.keyboard.press('KeyJ'); await step(5);
  const fired = await page.evaluate(() => ({ shells: __lj.game.cannon.shells, n: __lj.game.shells.length, stamp: document.getElementById('stamp').textContent }));
  check('操炮时 J 开炮', fired.shells === 7 && /开炮/.test(fired.stamp), fired);
  await page.keyboard.press('KeyK'); await step(5);
  const stillOn = await page.evaluate(() => __lj.game.cannon.manned);
  await page.keyboard.press('KeyF'); await step(5);
  check('K 不再离开炮位（现在是跳跃键），F 才离开', stillOn && await page.evaluate(() => !__lj.game.cannon.manned), { stillOn });

  // ---------- 街垒：看得见就打得到，守军也能越过沙袋还击（v0.2.0 录像暴露的僵持） ----------
  const bar = (hx, hz, fire, frames) => page.evaluate(([hx, hz, fire, frames]) => {
    const g = __lj.game, inp = __lj.app.input;
    g.reset(4, false); g.cut = 0; g.timers.length = 0; g.setView(0);
    __lj.app.demo = false;   // 这一组要量真实掉血，先关掉脚本开头打开的演示无敌
    for (const e of g.enemies) { if (!(e.group === 'S1' && e.hold)) { e.alive = false; e.deadT = 9; } }
    for (const a of g.allies) { a.hold = true; a.px = 0; a.pz = 20; a.x = 0; a.z = 20; }
    const h = g.hero; g.place(h, hx, hz); h.inv = 0; g.cam.yaw = 0; g.cam.pitch = 0;
    const tgt = g.enemies.find((e) => e.alive && e.x < -3), hp0 = h.hp, heads0 = g.stats.heads;
    let enemyShots = 0, last = 0;
    for (let i = 0; i < frames && (!fire || tgt.alive); i++) {
      if (fire) {
        // 经“鼠标拖动”输入通道把准星对到守军头上，再按住开火键
        const cam = g.camera.position, dx = tgt.x - cam.x, dy = tgt.y + 1.62 * tgt.model.scale - cam.y, dz = tgt.z - cam.z;
        let ey = Math.atan2(-dx, -dz) - g.cam.yaw; ey = Math.atan2(Math.sin(ey), Math.cos(ey));
        const ep = Math.atan2(dy, Math.hypot(dx, dz)) - g.cam.pitch, w = __lj.app.size()[0];
        inp._look((-ey * 0.4 / 3.0) * w, (-ep * 0.4 / 2.4) * w, 'mouse');
        if (i === 30) inp.key('KeyJ', true, false);
      }
      __lj.step(1, false);
      const n = g.bullets.filter((b) => b.team === 1).length; if (n > last) enemyShots += n - last; last = n;
    }
    inp.key('KeyJ', false, false); __lj.app.demo = true;
    return { tgtAlive: tgt.alive, heads: g.stats.heads - heads0, heroLost: hp0 - h.hp + g.stats.deaths * 99, enemyShots, used: h.magMax - h.mag };
  }, [hx, hz, fire, frames]);
  const b1 = await bar(-4, -38.1, true, 300);
  check('街垒：站在街垒前瞄守军露出的头能打中（爆头击倒），不被沙袋挡住', !b1.tgtAlive && b1.heads >= 1 && b1.used <= 3, b1);
  const b2 = await bar(-4, -38.1, false, 600);
  check('街垒：守军能越过沙袋打到站在街垒前的主角（10 秒内开过枪且命中）', b2.enemyShots >= 3 && b2.heroLost >= 1, b2);
  const b3 = await bar(-2.2, -40.05, false, 600);
  check('街垒：主角贴着沙袋也不是打不到的死角', b3.enemyShots >= 3 && b3.heroLost >= 1, b3);

  // ---------- 鼠标锁定（可选项） ----------
  await clean(0);
  const lock = await page.evaluate(() => { const a = __lj.app; a.manual = false; a.s.mouseAim = 'lock'; return a.s.mouseAim; });
  await page.mouse.move(640, 300); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(500);
  const lk = await page.evaluate(() => ({ locked: __lj.app.input.locked, el: document.pointerLockElement ? document.pointerLockElement.id : null, toast: document.getElementById('toast').textContent, state: __lj.app.state }));
  if (lk.locked) {
    const y0 = await page.evaluate(() => __lj.game.cam.yaw);
    await page.mouse.move(760, 300); await page.waitForTimeout(250);
    const y1 = await page.evaluate(() => __lj.game.cam.yaw);
    check('鼠标锁定：锁定后直接移动鼠标就能转视角', y1 < y0 - 0.05, { y0, y1 });
    await page.evaluate(() => document.exitPointerLock()); await page.waitForTimeout(300);
    check('退出鼠标锁定即暂停', await page.evaluate(() => __lj.app.state) === 'pause', null);
  } else {
    check('鼠标锁定被环境拒绝时：给出提示并保持可玩（回退到按住拖动）', /不能锁定/.test(lk.toast) && lk.state === 'play', lk);
  }
  results.push({ name: '（记录）本次运行环境是否允许鼠标锁定：' + (lk.locked ? '允许' : '不允许'), ok: true, detail: lk });

  const bad = results.filter((r) => !r.ok);
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
  console.log(`\n${results.length - bad.length}/${results.length} 通过`);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  require('fs').writeFileSync(require('path').join(__dirname, 'out-views.json'), JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 1));
  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

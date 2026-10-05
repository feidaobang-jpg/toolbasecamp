// 镜头回归（v0.1.1 修的三处）：① 正视在第 47 街贴墙 Q/E 转头时镜头进墙、满屏砖墙；② 第一人称贴着岩跳龙 / 敌人时
// 近裁剪面切进模型（满屏贴图、黑屏）；③ 侧视锁屏（Boss 战）时敌人被打出画面。手动时钟 + 测试钩子，逐项给量化指标并截图到 qa/out/。
// 只用修复前就有的钩子，CD_BASE 指向旧构建、NO_ASSERT=1 可得到修复前对照。用法：node qa/camera.js [输出前缀]
const { launch, BASE, out, sleep } = require('./lib');
const { BOT_SRC } = require('./bot');

// 页面内探针：射线取样（同版本 three.js 动态载入）、读像素、逐顶点投影
const PROBE_SRC = `(() => {
  const T = window.__CD_TEST__;
  let THREE = null;
  const load = async () => THREE || (THREE = await import(new URL('../../../vendor/three/0.170.0/build/three.module.js', location.href).href));
  const chainVisible = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
  // 实心可见面：排除描边外壳 / 天空球（BackSide）、镂空贴图、半透明（已淡化的）物体
  const solid = (h) => {
    const o = h.object; if (!o.isMesh || o.userData.outline) return false;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.visible === false || m.side === 1 || m.alphaTest > 0 || (m.transparent && m.opacity < 0.5)) return false;
    return chainVisible(o);
  };
  const roots = () => T._scene.children.filter(c => c.visible);
  const free = ['enter', 'leave', 'flee', 'cut'];
  function actorsNdc() {
    const G = T.cheat.G, cam = T._cam.cam, res = [];
    cam.updateMatrixWorld();
    const v = cam.position.clone();
    for (const a of G.actors) {
      if (a.removed || !a.model.root.visible) continue;
      a.model.root.updateMatrixWorld(true);
      let mn = 9, mx = -9;
      a.model.root.traverse(o => {
        if (!o.isMesh || o.userData.outline || !chainVisible(o)) return;
        const P = o.geometry.attributes.position;
        for (let i = 0; i < P.count; i += 2) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld).project(cam); if (v.x < mn) mn = v.x; if (v.x > mx) mx = v.x; }
      });
      res.push({ type: a.type, state: a.state, x: +a.x.toFixed(2), z: +a.z.toFixed(2), mn: +mn.toFixed(3), mx: +mx.toFixed(3), over: +Math.max(mx - 1, -1 - mn).toFixed(3) });
    }
    return res;
  }
  window.__probe = {
    // 画面网格射线：第一个实心面离镜头 < maxD 的比例（满屏墙 / 满屏模型）
    async fill(maxD) {
      await load();
      const cam = T._cam.cam, rc = new THREE.Raycaster(), R = roots();
      let near = 0, n = 0;
      for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) {
        rc.setFromCamera({ x: -0.9 + 1.8 * i / 8, y: -0.85 + 1.7 * j / 4 }, cam);
        const h = rc.intersectObjects(R, true).find(solid);
        n++; if (h && h.distance < maxD) near++;
      }
      return +(near / n).toFixed(3);
    },
    // 镜头到主角胸口的连线上，第一个实心面是不是主角自己
    async playerSeen() {
      await load();
      const p = T.cheat.G.player, cam = T._cam.cam, rc = new THREE.Raycaster();
      const o = new THREE.Vector3(cam.position.x, cam.position.y, cam.position.z), d = new THREE.Vector3(p.x, p.y + 1.1, p.z).sub(o), dist = d.length();
      rc.set(o, d.normalize()); rc.far = dist + 0.6; rc.camera = cam;
      const h = rc.intersectObjects(roots(), true).find(solid);
      if (!h) return true;
      for (let x = h.object; x; x = x.parent) if (x === p.model.root) return true;
      return h.distance > dist - 0.45;
    },
    // 画面暗像素比例（描边外壳罩住镜头时整屏发黑）；必须紧接着渲染调用
    dark() {
      const gl = T._renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4);
      let dark = 0, n = 0;
      for (let i = 0; i < 16; i++) for (let j = 0; j < 9; j++) { gl.readPixels(Math.floor((i + 0.5) / 16 * w), Math.floor((j + 0.5) / 9 * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); n++; if (px[0] + px[1] + px[2] < 90) dark++; }
      return +(dark / n).toFixed(3);
    },
    actorsNdc,
    // bot 打 iters 次决策（每次 2 帧），记录非进退场状态下角色超出画面左右边缘的最大量（NDC，>0 即出画）
    fight(iters) {
      const G = T.cheat.G;
      let worst = { over: -9 }, samples = 0;
      for (let i = 0; i < iters; i++) {
        window.__bot.tick({ jumps: true });
        T.step(2, false);
        if (i % 3) continue;
        for (const a of actorsNdc()) { if (free.indexOf(a.state) >= 0) continue; samples++; if (a.over > worst.over) worst = Object.assign({ t: +G.t.toFixed(2), focusX: +G.focusX.toFixed(2), lockX: G.lockX }, a); }
        if (!G.boss || G.mode !== 'play') break;
      }
      worst.samples = samples;
      return worst;
    }
  };
})();`;

(async () => {
  const pre = process.argv[2] || 'cam';
  const strict = !process.env.NO_ASSERT;
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const results = [];
  const ok = (name, cond, info) => { results.push({ name, pass: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
  const E = (fn, arg) => page.evaluate(fn, arg);
  const step = (n, draw) => E(([n, d]) => window.__CD_TEST__.step(n, d), [n, draw !== false]);
  const shot = async (name) => { await step(1); await page.screenshot({ path: out(pre + '-' + name + '.png') }); };
  await page.goto(BASE + '?test=1&clean=1&q=high&seed=7', { waitUntil: 'load' });
  await E(() => { localStorage.clear(); localStorage.setItem('cd3d-stage1:hero', '2'); });
  await page.reload({ waitUntil: 'load' }); await sleep(900);
  await page.keyboard.press('Enter'); await sleep(300); await page.keyboard.press('Enter'); await sleep(300);
  await E(() => window.__CD_TEST__.manual(true));
  await E(BOT_SRC); await E(PROBE_SRC);
  console.log('build', await E(() => window.__CD_TEST__.version));

  // ---------- ① 正视 + Q/E 转一整圈：第 47 街贴着后墙（及楼体立面）站在最里排 ----------
  await E(() => { const C = window.__CD_TEST__.cheat; C.area(2); C.skipScript(); });
  await step(20);
  const quiet = () => E(() => { const C = window.__CD_TEST__.cheat, G = C.G; C.killAll(); G.pending = []; G.waveOn = false; G.wave = 99; G.lockX = null; for (const a of G.actors) if (a !== G.player) a.removed = true; });
  await quiet(); await step(30);
  let worstFill = 0, unseen = [], worstAt = null;
  for (const [x, z] of [[7, -2.3], [16, -2.3], [27.5, -2.3], [38, -2.3], [27.5, 0.2]]) {
    await E(([x, z]) => { const G = window.__CD_TEST__.cheat.G; G.player.x = x; G.player.z = z; G.focusX = x; G.player.vx = G.player.vz = 0; window.__CD_TEST__.setCamera(2, 0); }, [x, z]);
    await step(60, false);
    // 按 Q/E 的实际速度（90°/秒）连续转满一圈，每 8 帧取样
    for (let f = 0; f < 240; f++) {
      await E(() => { const c = window.__CD_TEST__._cam; c.yawOff += Math.PI * 2 / 240; window.__CD_TEST__.step(1, false); });
      if (f % 8) continue;
      const fill = await E(() => window.__probe.fill(0.9)), seen = await E(() => window.__probe.playerSeen());
      if (fill > worstFill) {
        worstFill = fill; worstAt = { x, z, deg: Math.round((f + 1) * 1.5), cam: (await E(() => window.__CD_TEST__.snapshot().cam)) };
        await E(() => window.__CD_TEST__.step(0, true)); await page.screenshot({ path: out(pre + '-front-worst.png') });
      }
      if (!seen) unseen.push({ x, z, deg: Math.round((f + 1) * 1.5) });
    }
  }
  ok('正视转一圈：满屏近物（0.9 米内射线比例）最大值 < 0.2', worstFill < 0.2, { worstFill, worstAt });
  ok('正视转一圈：主角始终可见', unseen.length === 0, unseen.slice(0, 8));
  // 截图：镜头朝 +z（在墙那一侧）——原录像 176.8 s / 180.4 s 的情形
  await E(() => { const G = window.__CD_TEST__.cheat.G; G.player.x = 27.5; G.player.z = -2.3; G.focusX = 27.5; window.__CD_TEST__.setCamera(2, -Math.PI / 2); });
  await step(90, false); await shot('front-wall-lookz');
  const camAt = await E(() => window.__CD_TEST__.snapshot().cam);
  console.log('  front -90°: cam', JSON.stringify(camAt));
  await E(() => window.__CD_TEST__.setCamera(2, -Math.PI * 0.75)); await step(90, false); await shot('front-wall-diag');
  await E(() => { const G = window.__CD_TEST__.cheat.G; G.player.x = 7; G.player.z = -2.3; G.focusX = 7; window.__CD_TEST__.setCamera(2, -Math.PI / 2); });
  await step(90, false); await shot('front-facade-lookz');
  // 侧视 / 斜视转到墙后（镜头远，背后是瓦砾堆）
  const sideFill = [];
  for (const [i, yaw] of [[0, Math.PI], [0, Math.PI * 0.75], [1, Math.PI]]) {
    await E(([i, yaw]) => { const G = window.__CD_TEST__.cheat.G; G.player.x = 27.5; G.player.z = 0; G.focusX = 27.5; window.__CD_TEST__.setCamera(i, yaw); }, [i, yaw]);
    await step(120, false);
    sideFill.push(await E(() => window.__probe.fill(0.9)));
  }
  await shot('side-rot180');
  ok('侧视 / 斜视转到墙后：满屏近物 < 0.2', Math.max.apply(null, sideFill) < 0.2, sideFill);

  // ---------- ② 第一人称贴身：岩跳龙 / 维斯从 1.6 米贴到 0 米 ----------
  await E(() => { const C = window.__CD_TEST__.cheat, G = C.G; G.wave = 9; G.boss = null; G.focusX = 41; G.player.x = 45.6; G.player.z = 0.3; window.__CD_TEST__.setCamera(0, 0); });
  await step(150, false);
  await E(() => window.__CD_TEST__.cheat.skipScript()); await step(10, false);
  const bossOn = await E(() => !!window.__CD_TEST__.cheat.G.boss);
  ok('Boss 战开始', bossOn);
  await E(() => { const G = window.__CD_TEST__.cheat.G; G.player.invul = 999; window.__CD_TEST__.setCamera(3, 0); });
  await step(30, false);
  const fpRows = [];
  for (const who of ['raptor', 'vice']) {
    for (const d of [1.6, 1.2, 0.9, 0.7, 0.5, 0.35, 0.2, 0.05]) {
      const r = await E(([who, d]) => {
        const T = window.__CD_TEST__, G = T.cheat.G, p = G.player;
        const a = who === 'raptor' ? G.raptor : G.boss, o = who === 'raptor' ? G.boss : G.raptor;
        // 冻结：岩跳龙用 grabbed（不跑 AI、不推开），维斯用 cut；另一只挪远
        if (who === 'raptor') a.state = 'grabbed'; else { a.state = 'cut'; a.sub = { pose: 'stand' }; }
        o.state = 'cut'; o.sub = o.sub || {}; o.x = p.x - 4; o.z = -1.5;
        p.state = 'idle'; p.vx = p.vz = 0; p.invul = 999;
        a.x = p.x + d; a.z = p.z; a.y = 0; a.vx = a.vz = a.vy = 0; a.face = -Math.PI / 2;
        T.step(1, true);
        return { dark: window.__probe.dark(), fp: T.snapshot().ui.fpActive };
      }, [who, d]);
      r.fill = await E(() => window.__probe.fill(0.3));
      r.nearK = await E((who) => { const a = window.__CD_TEST__.cheat.actors().find(x => x.type === who); return a && a.nearK; }, who);
      fpRows.push(Object.assign({ who, d }, r));
      if (who === 'raptor' && (d === 0.5 || d === 0.2)) await shot('fp-raptor-' + d);
      if (who === 'vice' && d === 0.2) await shot('fp-vice-' + d);
    }
  }
  for (const r of fpRows) console.log('  fp', JSON.stringify(r));
  const fpBad = fpRows.filter(r => r.dark > 0.25 || r.fill > 0.25);
  ok('第一人称贴身：无黑屏（暗像素 ≤ 25%）、无满屏模型（0.3 米内实心面 ≤ 25%）', fpBad.length === 0, fpBad);
  ok('第一人称：贴身时 FP 仍生效（没被退回正视）', fpRows.every(r => r.fp));
  // 放开 AI，让岩跳龙和维斯真打 6 秒，持续取样
  await E(() => { const G = window.__CD_TEST__.cheat.G; G.raptor.state = 'idle'; G.boss.state = 'idle'; G.raptor.cd = 0; G.boss.cd = 0; G.boss.x = G.player.x + 3; G.raptor.x = G.player.x + 1.4; });
  let fpLive = { dark: 0, fill: 0 };
  for (let i = 0; i < 60; i++) {
    const dk = await E(() => { const T = window.__CD_TEST__, G = T.cheat.G; G.player.invul = 999; if (G.player.state !== 'idle' && G.player.state !== 'hurt') G.player.state = 'idle'; T.step(5, true); return window.__probe.dark(); });
    const fl = await E(() => window.__probe.fill(0.3));
    fpLive.dark = Math.max(fpLive.dark, dk); fpLive.fill = Math.max(fpLive.fill, fl);
  }
  ok('第一人称实战 6 秒：暗像素与满屏模型峰值 ≤ 25%', fpLive.dark <= 0.25 && fpLive.fill <= 0.25, fpLive);

  // ---------- ③ 侧视锁屏：Boss 战 bot 实打，角色（逐顶点投影）不出画 ----------
  await E(() => { const G = window.__CD_TEST__.cheat.G; G.player.invul = 0; G.player.hp = 100; window.__CD_TEST__.setCamera(0, 0); });
  await step(60, false);
  // 维斯站到最前排右侧边缘附近
  await E(() => { const G = window.__CD_TEST__.cheat.G; G.boss.x = G.focusX + 6.5; G.boss.z = 2.5; G.player.x = G.focusX + 4.6; G.player.z = 2.4; });
  const w1 = await E(() => window.__probe.fight(600));
  ok('侧视 Boss 战 16:9（40 秒）：角色不出画', w1.over <= 0.005, w1);
  await page.setViewportSize({ width: 932, height: 430 }); await sleep(200); await step(30, false);
  await E(() => { const G = window.__CD_TEST__.cheat.G; G.player.hp = 100; G.boss.x = G.focusX - 6.5; G.boss.z = 2.5; G.player.x = G.focusX - 4.6; G.player.z = 2.3; });
  const w2 = await E(() => window.__probe.fight(600));
  ok('侧视 Boss 战 手机宽屏 2.17:1（40 秒）：角色不出画', w2.over <= 0.005, w2);
  await page.setViewportSize({ width: 1280, height: 720 }); await sleep(200); await step(30, false);
  // 最后一击：维斯在右缘被打飞（原录像 290 s）
  const kill = await E(() => {
    const T = window.__CD_TEST__, C = T.cheat, G = C.G;
    if (!G.boss) return { skipped: true };
    G.boss.x = G.focusX + 5.6; G.boss.z = 1.8; G.boss.state = 'idle';
    C.bossHp(1); C.hurtAll(5);
    let worst = -9, at = null;
    for (let i = 0; i < 70; i++) { T.step(2, false); for (const v of window.__probe.actorsNdc()) if (['enter', 'leave', 'flee', 'cut'].indexOf(v.state) < 0 && v.over > worst) { worst = v.over; at = v; } }
    return { worst, at };
  });
  await shot('side-boss-kill');
  ok('维斯在右缘被打飞（同时清场）：所有角色不出画', kill.skipped || kill.worst <= 0.005, kill);
  // 主角与敌人站在锁屏窗口最外侧、最前排：也完整入画
  const edge = await E(() => {
    const T = window.__CD_TEST__, G = T.cheat.G;
    G.player.state = 'idle'; G.player.x = G.focusX + 50; G.player.z = 2.5;
    T.step(2, true);
    return window.__probe.actorsNdc().filter(a => a.type === 'mustapha');
  });
  ok('主角贴右缘最前排：完整入画', edge.length && edge[0].over <= 0.005, edge);

  console.log('\n' + results.filter(r => r.pass).length + '/' + results.length + ' 通过');
  if (errs.length) console.log('页面错误', errs.slice(0, 5));
  require('fs').writeFileSync(out(pre + '-results.json'), JSON.stringify({ base: BASE, results, fpRows, errs }, null, 1));
  await b.close();
  if (strict && (results.some(r => !r.pass) || errs.length)) process.exitCode = 1;
})();

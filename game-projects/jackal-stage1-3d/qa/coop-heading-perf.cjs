// 联机（2 人合作）车头朝向与帧率回归：两个真实浏览器建房/加入。
// 覆盖：加入者按本人视角开车、车头跟着转向、主机与本人看到同一朝向、加入者渲染插值生效、房主本机不受影响，
// 并记录双端帧间隔与单机基线、快照体积。
// 用法：JK_BASE=http://127.0.0.1:8766/html/game/jackal-stage1-3d/index.html node qa/coop-heading-perf.cjs [输出目录]
const fs = require('node:fs');
const path = require('node:path');
const { BASE, results, check, snap, launch } = require('./lib');
const out = process.argv[2] || path.join(__dirname, 'out/coop-heading-perf');
fs.mkdirSync(out, { recursive: true });
const PI = Math.PI;
let browser;
const norm = a => ((a + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI;
// 加入者（好友）永远是 2 号位（slot 1）：主机上它是"别人"，本机上也同样是它
const remote = c => c.players.find(p => p.slot !== c.slot);
const friend = c => c.players.find(p => p.slot === 1);
const local = c => c.players.find(p => p.slot === c.slot);
async function coopSnap(page) { return page.evaluate(() => ({ coop: __JK_TEST__.coop(), ui: __JK_TEST__.snapshot().ui.uiMode })); }
async function untilCoop(page, fn, what, timeout = 20000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    const s = await coopSnap(page);
    last = s;
    if (s.coop && fn(s.coop, s.ui)) return s.coop;
    await page.waitForTimeout(80);
  }
  throw new Error('等待超时：' + what + ' 最后状态 ' + JSON.stringify(last));
}
async function openPage(ctx) {
  const page = await ctx.newPage();
  // 本地静态服务是单线程的，三个页面同时加载会排队；给足超时避免把排队当成游戏故障
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const url = new URL(BASE); url.searchParams.set('test', '1');
  await page.goto(url.href);
  await page.waitForFunction(() => !!window.__JK_TEST__);
  return { page, errors };
}
async function openLobby(ctx, name) {
  const g = await openPage(ctx);
  await g.page.click('[data-act="coop"]');
  await g.page.waitForFunction(() => !!window.__COOP_QA__, null, { timeout: 10000 });
  await g.page.fill('[data-field="name"]', name);
  return g;
}
async function hold(page, code, down) {
  await page.evaluate(([code, down]) => document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true })), [code, down]);
}
// 拖动空白处转视角：与真人鼠标/手指拖动同一通道，偏移量按实测 yaw 计算
async function dragLook(page, dxRatio, steps = 24) {
  const box = await page.locator('#stage').boundingBox();
  const y = box.y + box.height * 0.35;
  const x0 = box.x + box.width * 0.55, x1 = x0 + box.width * dxRatio;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(x0 + (x1 - x0) * i / steps, y);
  await page.mouse.up();
}
function summarize(frames) {
  const s = frames.slice().sort((a, b) => a - b);
  return { n: s.length, median: +(s[Math.floor(s.length / 2)] || 0).toFixed(1), p95: +(s[Math.floor(s.length * 0.95)] || 0).toFixed(1), max: +(s[s.length - 1] || 0).toFixed(1) };
}
async function runSoloPerf() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page } = await openPage(ctx);
  await page.click('[data-act="start"]');
  await page.waitForFunction(() => __JK_TEST__.snapshot().ui.uiMode === 'game', null, { timeout: 15000 });
  await page.evaluate(() => __JK_TEST__.perfStart());
  await hold(page, 'KeyW', true); await hold(page, 'KeyJ', true);
  await page.waitForTimeout(6000);
  await hold(page, 'KeyW', false); await hold(page, 'KeyJ', false);
  const r = summarize((await page.evaluate(() => __JK_TEST__.perfStop())).frames);
  await ctx.close();
  return r;
}
(async () => {
  browser = await launch();
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await openLobby(hostCtx, '房主');
  let guest;
  try {
    await host.page.fill('[data-field="roomName"]', '朝向回归');
    await host.page.click('[data-do="create"]');
    await host.page.waitForFunction(() => !!__COOP_QA__.connection.room, null, { timeout: 15000 });
    const roomCode = await host.page.evaluate(() => __COOP_QA__.connection.room.code);
    guest = await openLobby(guestCtx, '好友');
    await guest.page.fill('[data-field="code"]', roomCode);
    await guest.page.click('[data-do="join"]');
    await guest.page.waitForFunction(() => __COOP_QA__.connection.room?.players.length === 2, null, { timeout: 15000 });
    await guest.page.click('[data-do="ready"]');
    await host.page.waitForFunction(() => !document.querySelector('[data-do="start"]').disabled, null, { timeout: 15000 });
    await host.page.click('[data-do="start"]');
    for (const g of [host, guest]) await g.page.waitForFunction(() => __JK_TEST__.coop() && __JK_TEST__.snapshot().ui.uiMode === 'game', null, { timeout: 20000 });
    await untilCoop(host.page, c => c.players.length === 2, '主机看到两名玩家');
    await untilCoop(guest.page, c => c.stateCount > 3, '加入者收到主机快照');
    check('双人进入同一局并开始同步', true, { roomCode });

    // ① 加入者向上（北）开：主机与本人看到的车头都应转到北（0）
    const s98 = await coopSnap(host.page);
    const startY = remote(s98.coop).y;
    await hold(guest.page, 'KeyW', true);
    const north = await untilCoop(host.page, c => Math.abs(norm(remote(c).ang)) < 0.12 && remote(c).y > startY + 4, '主机看到好友车头朝北并前进');
    check('主机侧：好友车头随移动方向转向', Math.abs(norm(remote(north).ang)) < 0.12, { ang: remote(north).ang, y: remote(north).y });
    const selfNorth = await untilCoop(guest.page, c => Math.abs(norm(friend(c).ang)) < 0.12, '好友本机车头朝北');
    // 快照先到、渲染后走：等两帧再看模型车头，否则读到的是上一帧的姿态
    await guest.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const drawn = friend((await coopSnap(guest.page)).coop);
    check('好友本机：车头与主机一致（不再钉死在 180°）',
      Math.abs(norm(friend(selfNorth).ang)) < 0.12 && Math.abs(norm(drawn.body + drawn.ang)) < 0.02 && Math.abs(norm(drawn.ang)) < 0.12,
      { hostSideAng: friend(selfNorth).ang, ownAng: drawn.ang, ownBody: drawn.body });
    await hold(guest.page, 'KeyW', false);

    // ② 加入者拖动转视角后按同一方向开：车头应转到"本人视角的前方"，而不是主机视角
    const yawBefore = (await snap(guest.page)).cam.yaw;
    await dragLook(guest.page, -0.25);
    await guest.page.waitForTimeout(700);
    const yawAfter = (await snap(guest.page)).cam.yaw;
    const turned = Math.abs(norm(yawAfter - yawBefore));
    const want = -yawAfter;                       // 第三人称：世界前方 = -镜头 yaw（与单机换算一致）
    const p0 = remote((await coopSnap(host.page)).coop);
    await hold(guest.page, 'KeyW', true);
    const hostSee = await untilCoop(host.page, c => { const r = remote(c); return Math.hypot(r.x - p0.x, r.y - p0.y) > 3; }, '主机看到好友开出 3 格以上');
    await hold(guest.page, 'KeyW', false);
    const r2 = remote(hostSee);
    const dx = r2.x - p0.x, dy = r2.y - p0.y, dist = Math.hypot(dx, dy);
    const along = (dx * Math.sin(r2.ang) + dy * Math.cos(r2.ang)) / (dist || 1);  // 实走方向与车头一致
    check('主机侧：好友按自己的镜头方向转车头（联机视角各自独立）',
      turned > 0.3 && Math.abs(norm(r2.ang - want)) < 0.3 && dist > 2.5 && along > 0.85,
      { dragYaw: +turned.toFixed(3), want: +want.toFixed(3), got: r2.ang, drove: +dist.toFixed(2), along: +along.toFixed(2) });
    const selfSee = friend((await coopSnap(guest.page)).coop);
    check('好友本机：模型车头与本人视角一致', Math.abs(norm(selfSee.ang - want)) < 0.3, selfSee);

    // ③ 加入者看队友：房主开车，加入者按帧插值（真实帧率下的收敛用定点探针量测）
    await hold(host.page, 'KeyW', true);
    const frames = await guest.page.evaluate(async () => {
      const seen = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 1200) {
        const c = __JK_TEST__.coop();
        const o = c.players.find(p => p.slot === 0);
        if (o) seen.push([o.x, o.y, o.vis ? o.vis.x : null, o.vis ? o.vis.y : null, c.smooth]);
        await new Promise(r => requestAnimationFrame(r));
      }
      return seen;
    });
    const probe = await guest.page.evaluate(() => __JK_TEST__.interp());
    await hold(host.page, 'KeyW', false);
    const withVis = frames.filter(f => f[2] !== null);
    // 允许个别帧（快照刚到还没渲染、或车短暂不可见）vis 为空，但绝大多数帧必须由插值姿态驱动
    check('加入者渲染插值生效：队友的车按帧平滑而非逐快照跳格',
      withVis.length >= Math.max(3, frames.length - 1) && frames.every(f => f[4] === true)
      && !!probe && Math.abs(probe.steps[0]) < 1.2 && probe.reached > 1.2 && probe.reached < 3.8,
      { sampledFrames: withVis.length, of: frames.length, probe });

    // ④ 房主本机操作仍应正常（回归保护）
    const h0 = local(await untilCoop(host.page, () => false, '读取房主状态', 3000).catch(() => null) || (await coopSnap(host.page)).coop);
    await hold(host.page, 'KeyW', true);
    await untilCoop(host.page, c => Math.abs(norm(local(c).ang)) < 0.12 && local(c).y > h0.y, '房主车头朝北并前进');
    await hold(host.page, 'KeyW', false);
    check('房主本机开车头转向未受影响', true);

    // ⑤ 帧率与流量：双端各跑 6 秒同时开火，并与同机单机基线比较
    for (const g of [host, guest]) await g.page.evaluate(() => __JK_TEST__.perfStart());
    await hold(host.page, 'KeyW', true); await hold(guest.page, 'KeyW', true);
    await hold(host.page, 'KeyJ', true); await hold(guest.page, 'KeyJ', true);
    await host.page.waitForTimeout(6000);
    await hold(host.page, 'KeyW', false); await hold(guest.page, 'KeyW', false);
    await hold(host.page, 'KeyJ', false); await hold(guest.page, 'KeyJ', false);
    const perfHost = summarize((await host.page.evaluate(() => __JK_TEST__.perfStop())).frames);
    const perfGuest = summarize((await guest.page.evaluate(() => __JK_TEST__.perfStop())).frames);
    const solo = await runSoloPerf();
    const payload = await host.page.evaluate(() => JSON.stringify(__COOP_QA__.snapshot()).length);
    const net = await guest.page.evaluate(() => ({ stateCount: __COOP_QA__.connection.stateCount, rtt: __COOP_QA__.connection.rtt }));
    check('联机不额外掉帧：双端中位帧间隔与单机同量级', perfHost.median <= solo.median * 1.35 + 2 && perfGuest.median <= solo.median * 1.35 + 2, { solo, host: perfHost, guest: perfGuest });
    check('联机同步：快照体积与收包数', payload > 0 && payload < 40000 && net.stateCount > 40, { payloadBytes: payload, ...net });
    check('无页面错误', host.errors.length === 0 && (guest ? guest.errors.length === 0 : true), { host: host.errors.slice(0, 3), guest: guest && guest.errors.slice(0, 3) });
    await host.page.screenshot({ path: path.join(out, 'host.png') });
    await guest.page.screenshot({ path: path.join(out, 'guest.png') });
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, solo, perfHost, perfGuest, payload, net }, null, 2));
  } catch (e) {
    check('联机回归未抛错', false, String(e && e.stack || e));
    try { await host.page.screenshot({ path: path.join(out, 'fail-host.png') }); if (guest) await guest.page.screenshot({ path: path.join(out, 'fail-guest.png') }); } catch {}
  } finally {
    await browser.close();
    const failed = results.filter(r => !r.ok);
    console.log('共 ' + results.length + ' 项，失败 ' + failed.length);
    process.exit(failed.length ? 1 : 0);
  }
})();

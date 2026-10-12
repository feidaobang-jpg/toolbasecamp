// 第三关联机冒烟（2 人合作）：两个真实浏览器建房 / 加入，房主选第三关开局。
// 覆盖：双方都进第三关并持续同步、加入者能开车、Boss 战舰与 6 座炮塔同步到加入者一侧（位置一致）、
// 房主打完后双方都看到第三关结算，全程无脚本错误。需要本地联机大厅 ws://127.0.0.1:8792。
// 用法：JK_BASE=http://127.0.0.1:8766/html/game/jackal-stage1-3d/index.html node qa/coop-stage3.cjs
const fs = require('node:fs');
const path = require('node:path');
const { BASE, results, check, launch } = require('./lib');
const out = process.argv[2] || path.join(__dirname, 'out/coop-stage3');
fs.mkdirSync(out, { recursive: true });
let browser;
async function openLobby(ctx, name, stage) {
  const page = await ctx.newPage();
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const url = new URL(BASE); url.searchParams.set('test', '1'); if (stage) url.searchParams.set('stage', String(stage));
  await page.goto(url.href);
  await page.waitForFunction(() => !!window.__JK_TEST__);
  await page.click('[data-act="coop"]');
  await page.waitForFunction(() => !!window.__COOP_QA__, null, { timeout: 10000 });
  await page.fill('[data-field="name"]', name);
  return { page, errors };
}
const snapOf = (page) => page.evaluate(() => { const s = __JK_TEST__.snapshot(); return { stage: s.stage, mode: s.mode, music: s.ui.music, overlay: s.ui.overlay, boss: s.boss, coop: __JK_TEST__.coop(), ents: s.enemies.filter(e => e.type === 'ship' || e.type === 'shipgun').map(e => [e.type, +e.x.toFixed(1), +e.y.toFixed(1), e.hp]) }; });
async function until(page, fn, what, timeout = 25000) {
  const t0 = Date.now(); let last = null;
  while (Date.now() - t0 < timeout) { last = await snapOf(page); if (fn(last)) return last; await page.waitForTimeout(120); }
  throw new Error('等待超时：' + what + ' ' + JSON.stringify(last).slice(0, 600));
}
(async () => {
  browser = await launch();
  const hostCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await openLobby(hostCtx, '房主', 3);
  await host.page.fill('[data-field="roomName"]', '第三关联机');
  await host.page.click('[data-do="create"]');
  await host.page.waitForFunction(() => !!__COOP_QA__.connection.room, null, { timeout: 15000 });
  const roomCode = await host.page.evaluate(() => __COOP_QA__.connection.room.code);
  const guest = await openLobby(guestCtx, '好友');
  await guest.page.fill('[data-field="code"]', roomCode);
  await guest.page.click('[data-do="join"]');
  await guest.page.waitForFunction(() => __COOP_QA__.connection.room?.players.length === 2, null, { timeout: 15000 });
  await guest.page.click('[data-do="ready"]');
  await host.page.waitForFunction(() => !document.querySelector('[data-do="start"]').disabled, null, { timeout: 15000 });
  await host.page.click('[data-do="start"]');
  for (const g of [host, guest]) await g.page.waitForFunction(() => __JK_TEST__.coop() && __JK_TEST__.snapshot().ui.uiMode === 'game', null, { timeout: 20000 });
  const h0 = await until(host.page, s => s.stage === 3 && s.mode === 'play' && s.coop.players.length === 2, '房主进入第三关');
  const g0 = await until(guest.page, s => s.stage === 3 && s.mode === 'play' && s.coop.stateCount > 3, '加入者进入第三关并收到快照');
  check('双方都进入第三关（港口）并开始同步', h0.stage === 3 && g0.stage === 3 && g0.music === 'harbor', { roomCode, host: h0.mode, guest: g0.mode, music: g0.music });

  // 加入者按 W 往北开：房主一侧看到 2 号车在动
  const y0 = h0.coop.players.find(p => p.slot === 1).y;
  await guest.page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })));
  const moved = await until(host.page, s => s.coop.players.find(p => p.slot === 1).y > y0 + 3, '房主看到好友的车往北开');
  await guest.page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true })));
  check('加入者能开车，房主一侧同步到位置', true, { y0, y1: moved.coop.players.find(p => p.slot === 1).y });

  // 房主把两辆车带到 Boss 触发线后开进去
  await host.page.evaluate(() => {
    const c = __JK_TEST__.cheat;
    for (const t of ['soldier', 'officer', 'ejeep', 'cannon', 'boat', 'bulltank', 'tank', 'turret']) c.kill(t);
    c.destroy('第一道闸门'); c.destroy('第二道闸门'); c.destroy('第三道闸门');
    c.bossReady(); c.invuln(999);
  });
  await host.page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })));
  await until(host.page, s => s.boss.state === 'intro' || s.boss.state === 'fight', '房主触发 Boss');
  await host.page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true })));
  const hf = await until(host.page, s => s.boss.state === 'fight' && s.ents.length === 7 && s.ents[0][1] === -2, '战舰靠泊开战');
  const gf = await until(guest.page, s => s.boss.state === 'fight' && s.ents.length === 7 && s.ents[0][1] === -2, '加入者看到战舰靠泊开战');
  const same = JSON.stringify(hf.ents.map(e => e.slice(0, 3))) === JSON.stringify(gf.ents.map(e => e.slice(0, 3)));
  check('Boss 战舰与 6 座炮塔同步到加入者一侧，位置一致', same && gf.boss.pips.length === 6 && gf.music === 'boss', { host: hf.ents, guest: gf.ents, music: gf.music });
  await guest.page.screenshot({ path: path.join(out, 'guest-boss.png') });

  // 房主逐座击毁
  await host.page.evaluate(() => { const c = __JK_TEST__.cheat; for (const e of c.state().ents.filter(q => q.type === 'shipgun')) for (let k = 0; k < 5; k++) c.explodeAt(e.x, e.y, 'rocket'); });
  const gd = await until(guest.page, s => s.boss.state === 'done', '加入者看到战舰被击沉');
  check('6 座炮塔全毁后，加入者一侧也进入过关', gd.boss.killed === 6 && gd.mode === 'clear', gd.boss);
  const hr = await until(host.page, s => s.overlay === 'result', '房主结算', 15000);
  const gr = await until(guest.page, s => s.overlay === 'result', '加入者结算', 15000);
  const titleH = await host.page.textContent('#res-title'), titleG = await guest.page.textContent('#res-title');
  check('双方都看到「第三关完成」结算', /第三关完成/.test(titleH) && /第三关完成/.test(titleG), { titleH, titleG });
  check('全程无脚本错误（房主 / 加入者）', host.errors.length === 0 && guest.errors.length === 0, { host: host.errors.slice(0, 3), guest: guest.errors.slice(0, 3) });
  const pass = results.filter(r => r.ok).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ when: new Date().toISOString(), env: 'Playwright' + (process.env.JK_CHANNEL ? ' ' + process.env.JK_CHANNEL : '') + '，两个独立浏览器上下文，本地联机大厅', pass, total: results.length, results }, null, 1));
  await browser.close();
  if (pass !== results.length) process.exit(1);
})().catch(async e => { console.error('FATAL', e.message); try { await browser.close(); } catch (_) {} process.exit(2); });

// 第三关各阶段截图（手动时钟）：node qa/stage3-shots.js [前缀] [英雄0-3]
// 开场霍格放话 → 荒漠四人 → DESERT OF DEATH → 沃尔瑟 → 机修工送车 → 开车一路撞 → 霍格 → 车毁 → 徒步战 → 结算
const { launch, BASE, out, sleep } = require('./lib');
(async () => {
  const prefix = process.argv[2] || 'hr', hero = process.argv[3] || '2';
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const T = (fn, a) => page.evaluate(fn, a);
  const S = () => T(() => window.__CD_TEST__.snapshot());
  const step = (n) => T((n) => window.__CD_TEST__.step(n, false), n);
  const until = async (pred, maxFrames, chunk) => { for (let i = 0; i < maxFrames; i += (chunk || 10)) { const s = await S(); if (pred(s)) return s; await step(chunk || 10); } return S(); };
  const shot = async (name) => { await T(() => window.__CD_TEST__.step(1, true)); await page.screenshot({ path: out(prefix + '-' + name + '.png') }); console.log('shot', name); };
  const keyDown = (c) => T((c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true })), c);
  const keyUp = (c) => T((c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true })), c);
  // 往右走到 x（镜头跟着卷过去，受卷轴窗口限制，分多步挪）
  const walkTo = async (x, z) => { for (let i = 0; i < 200; i++) { const s = await S(); if (s.player.x >= x - 0.3 || s.waveOn || s.mode !== 'play') break; await T((a) => window.__CD_TEST__.cheat.tp(a[0], a[1]), [x, z]); await step(6); } };
  // 把这一波清掉（后面还没出场的也等出来再清）
  const clearWave = async () => { for (let i = 0; i < 60; i++) { await T(() => window.__CD_TEST__.cheat.killAll()); await step(30); if (!(await S()).waveOn) break; } };
  const brief = (s) => JSON.stringify({ mode: s.mode, area: s.areaId, p: s.player && [s.player.x, s.player.z, s.player.state, s.player.hp], en: s.enemies, road: s.road, banner: s.banner, dialog: s.dialog });

  await page.goto(BASE + '?test=1&seed=7&clean=1', { waitUntil: 'load' });
  await sleep(900);
  await T((h) => { localStorage.setItem('cd3d-stage1:stage', '2'); localStorage.setItem('cd3d-stage1:hero', h); }, hero);
  await page.reload({ waitUntil: 'load' }); await sleep(1500);
  console.log('stage label:', await T(() => document.querySelector('[data-opt=stage]').textContent));
  await page.screenshot({ path: out(prefix + '-00-menu.png') });
  await T(() => document.querySelector('[data-act=select]').focus());
  await page.keyboard.press('Enter'); await sleep(250); await page.keyboard.press('Enter'); await sleep(250);
  await T(() => window.__CD_TEST__.manual(true));
  let s = await S(); console.log('start', brief(s));
  await step(40); await shot('01-hogg-line');
  s = await until(x => x.mode === 'play', 900, 10); console.log('play', brief(s));
  await shot('02-desert-start');
  await step(60); await shot('03-desert-fight');
  // 清掉第一波，看 DESERT OF DEATH 字幕
  await clearWave(); s = await S(); await shot('04-desert-title'); console.log('after d1', brief(s));
  // 走到木桶边
  await walkTo(19.5, 1.6); await step(30); await shot('05-barrels');
  await walkTo(21, 1.2); s = await until(x => x.waveOn, 300, 10); await step(260); await shot('06-hammer-wave'); console.log('d2', brief(s));
  await clearWave();
  await walkTo(41.5, 0.8); s = await until(x => x.waveOn, 300, 10); await step(330); await shot('07-walther'); console.log('d3', brief(await S()));
  await clearWave();
  s = await until(x => x.mode === 'cut', 900, 10); console.log('car arrive', brief(s));
  await step(70); await shot('08-car-arrive');
  s = await until(x => !!x.dialog, 600, 5); await step(40); await shot('09-mechanic-line'); console.log('dialog', s.dialog);
  s = await until(x => !x.dialog, 600, 5); await step(14); await shot('10-flip-in');
  await step(60); await shot('11-drive-off');
  s = await until(x => x.areaId === 'road' && x.mode === 'play', 900, 5); console.log('road', brief(s));
  await step(50); await shot('12-road-start');
  for (const [t, name] of [[1.8, '13-razors'], [4.1, '14-gang'], [5.9, '15-tires'], [7.3, '16-walthers'], [11.9, '17-biker'], [16.4, '18-mesa-biker'], [20.2, '19-drums'], [22.7, '20-ferris-group'], [25.2, '21-barrels']]) {
    s = await until(x => x.road && x.road.t >= t, 3000, 3); await shot(name);
  }
  s = await S(); console.log('before hogg', brief(s), 'score', s.score, 'kills', JSON.stringify(s.kills));
  s = await until(x => x.road && x.road.phase === 'hogg', 600, 5); await step(90); await shot('22-hogg-enter'); console.log('hogg', brief(await S()));
  s = await until(x => x.road && x.road.nades.length > 0, 900, 3); await step(20); await shot('23-grenade-ring');
  await step(50); await shot('24-boom');
  await T(() => window.__CD_TEST__.cheat.road.ram()); await step(4); await shot('25-ram'); console.log('ram', brief(await S()));
  await T(() => window.__CD_TEST__.cheat.road.carHit()); await step(8); await shot('26-car-hit');
  await step(200); await shot('27-car-smoke');
  // 换视角看开车
  for (const [i, n] of [[1, 'oblique'], [2, 'front'], [3, 'fp']]) { await T((i) => window.__CD_TEST__.setCamera(i), i); await step(45); await shot('28-drive-' + n); }
  await T(() => window.__CD_TEST__.setCamera(0)); await step(30);
  await T(() => window.__CD_TEST__.cheat.road.wreck()); await step(10); await shot('29-wreck'); console.log('wreck', brief(await S()));
  await step(120); await shot('30-foot-start');
  s = await until(x => x.road && x.road.hogg && (x.road.hogg.mode === 'charge' || x.road.hogg.mode === 'cruise') && x.road.hogg.x > 1 && x.road.hogg.x < 12.5, 1500, 2); await shot('31-hogg-pass'); console.log('pass', brief(s));
  await step(400); await shot('32-foot-gang'); console.log('foot', brief(await S()));
  await T(() => { const G = window.__CD_TEST__.cheat.G; G.boss.hp = 1; });
  // 等霍格慢速经过时凑上去打
  for (let i = 0; i < 2400; i += 2) {
    const st = await T(() => { const t = window.__CD_TEST__, G = t.cheat.G, h = G.boss; if (!h || !h.alive) return 'dead'; const p = t.cheat.G.actors.find(a => a.side === 'player'); if (h.x > 1.5 && h.x < 12 && ['idle', 'walk'].includes(p.state)) { p.x = h.x - 0.9; p.z = h.z; p.face = Math.PI / 2; } return h.ai.mode; });
    if (st === 'dead') break;
    await keyDown('KeyJ'); await step(2); await keyUp('KeyJ');
  }
  await step(6); await shot('33-hogg-down'); console.log('down', brief(await S()));
  s = await until(x => !!x.dialog, 900, 5); await shot('34-win-line'); console.log('win', s.dialog);
  s = await until(x => x.mode === 'clear' && !x.script, 3000, 10); await T(() => window.__CD_TEST__.manual(false)); await sleep(1200);
  await page.screenshot({ path: out(prefix + '-35-result.png') });
  s = await S(); console.log('end', brief(s), 'score', s.score, 'cleared', s.cleared, 'overlay', s.ui.overlay);
  console.log('ERRORS', errs.length, errs.slice(0, 12).join('\n'));
  await b.close();
})().catch(e => { console.error('SCRIPT FAIL', e); process.exit(1); });

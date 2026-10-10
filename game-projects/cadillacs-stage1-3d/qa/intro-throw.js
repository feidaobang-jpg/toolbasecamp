// 第一关开场（照原作）与抓投回归（v0.9.0）：
// 开场远景翼龙飞过、EASTCOAST 2513 字幕、远景时不显示 HUD；主角走进楼顶；维斯两句台词；手下围上来被主角开场必杀全部震飞（不扣血）；
// 维斯跳楼走、「TOP OF THE BUILDING」、马上有新手下从右边上来；从第二关开始不放这段。
// 抓住后：上 / 下＋J 背摔（摔在身后）、反方向＋J 向后抛、不按方向 J 膝撞；正视里左 / 右＋J 也是背摔。
// node qa/intro-throw.js（CD_BASE 指向本地服务）
const { launch, BASE, out } = require('./lib');
const fs = require('fs');
(async () => {
  const b = await launch(), results = [], errors = [];
  const ok = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${info === undefined ? '' : JSON.stringify(info)}`); };
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => errors.push(e.message));
  const C = (fn, a) => page.evaluate(fn, a), K = page.keyboard;
  const step = (n, draw) => C(([n, d]) => window.__CD_TEST__.step(n, d), [n, !!draw]);
  const G = (fn, a) => C(new Function('a', 'const G = window.__CD_TEST__.cheat.G, p = G.player; return (' + fn + ')(a);'), a);
  async function start(hero, stage2) {
    await page.goto(BASE + '?test=1&seed=7');
    if (stage2) await C(() => localStorage.setItem('cd3d-stage1:stage', '1'));
    else await C(() => localStorage.removeItem('cd3d-stage1:stage'));
    await page.reload();
    await page.locator('#menu [data-act=select]').click(); await page.locator(`[data-hero="${hero}"]`).click();
    if (await page.locator('#sel-go').isVisible()) await page.locator('#sel-go').click();
    await C(() => window.__CD_TEST__.manual(true));
  }

  // ---------- 开场 ----------
  await start(0);
  await step(30, true);
  let s = await G(() => ({ cine: !!G.cineCam, pt: G.pteroFly.length, sub: G.banner && G.banner.sub, mode: G.mode, px: p.x, hud: getComputedStyle(document.getElementById('hud')).visibility, timer: getComputedStyle(document.getElementById('h-timer')).visibility }));
  ok('开场远景：镜头远景、两只翼龙、EASTCOAST 2513', s.cine && s.pt >= 2 && /2513/.test(s.sub || '') && s.mode === 'cut', s);
  ok('远景时不显示 HUD 与计时', s.hud === 'hidden' && s.timer === 'hidden', s);
  await page.screenshot({ path: out('intro-establishing.png') });
  const px0 = s.px;
  await step(240, true);
  s = await G(() => ({ cine: !!G.cineCam, px: p.x, state: p.state, hud: getComputedStyle(document.getElementById('hud')).visibility }));
  ok('远景结束后镜头回到侧视、HUD 回来，主角走进楼顶', !s.cine && s.hud !== 'hidden' && s.px > px0 + 1.5, { px0, ...s });
  const say = [];
  for (let i = 0; i < 60 * 8; i++) { await step(1); const d = await G(() => G.dialog && G.dialog.text); if (d && !say.includes(d)) say.push(d); if (say.length === 2 && !d) break; }
  ok('维斯两句台词（原作 WE ARE TIRED OF YOU INTERFERING… / MY MEN WILL TEACH YOU A LESSON!）', say.length === 2, say);
  let mega = null, hp0 = await G(() => p.hp);
  for (let i = 0; i < 60 * 3 && !mega; i++) { await step(1); mega = await G(() => p.move && p.move.id === 'mega' ? { free: !!p.move.free } : null); }
  ok('手下围上来后主角自动放必杀', !!mega, mega);
  await step(40, true); await page.screenshot({ path: out('intro-mega.png') });
  await step(40);
  s = await G(() => ({ gang: G.actors.filter(a => a.introGang).map(a => a.alive), hp: p.hp, dead: G.events.filter(e => e.type === 'kill').length }));
  ok('开场必杀把四个手下全部打倒', s.dead >= 4 && s.gang.every(a => !a), s);
  ok('开场这一下不扣血', s.hp === hp0, { hp0, hp: s.hp });
  for (let i = 0; i < 60 * 5; i++) { await step(1); if (await G(() => G.mode === 'play')) break; }
  s = await G(() => ({ mode: G.mode, banner: G.banner && G.banner.sub, vice: !!G.introVice }));
  ok('维斯跳楼离开，打出 TOP OF THE BUILDING 后开打', s.mode === 'play' && !s.vice && /TOP OF THE BUILDING/.test(s.banner || ''), s);
  await step(150);
  s = await G(() => G.actors.filter(a => a.side === 'enemy' && a.alive && !a.introGang).map(a => a.type));
  ok('开场后马上有新手下从右边上来', s.length >= 2, s);

  // 从第二关开始不放第一关开场
  await start(1, true);
  await step(30);
  s = await G(() => ({ area: G.area, cine: !!G.cineCam, pt: G.pteroFly.length }));
  ok('从第二关开始不放楼顶开场', s.area === 3 && !s.cine && s.pt === 0, s);

  // ---------- 抓投 ----------
  async function grabbed(cam) {
    await C(cam => { const T = window.__CD_TEST__; T.cheat.skipScript(); T.cheat.killAll(); T.step(120); if (cam !== undefined) T.setCamera(cam, 0); }, cam);
    await C(() => { const T = window.__CD_TEST__, G = T.cheat.G, p = G.player; for (const a of G.actors) if (a !== p) { a.alive = false; a.removed = true; a.model.root.visible = false; } G.actors = G.actors.filter(a => !a.removed); Object.assign(p, { x: 7, z: 0, vx: 0, vz: 0, face: Math.PI / 2, state: 'idle', st: 0, move: null, sub: {}, invul: 999, grab: null }); const id = T.cheat.enemy('ferris', 0.7, 0), e = G.actors.find(a => a.id === id); Object.assign(e, { hp: 200, maxHp: 200, cd: 999, state: 'idle', x: p.x + 0.7, z: 0, face: -Math.PI / 2 }); e.def = { ...e.def, aggr: 0, speed: 0 }; G.testFoe = e; });
    const fwd = cam === 2 ? 'KeyW' : 'KeyD';   // 正视里朝前走是 W
    await new Promise(r => setTimeout(r, 450));   // 双击方向＝冲刺按真实时间判定：两次按 D 之间留够间隔，免得误触冲刺
    await K.down(fwd); for (let i = 0; i < 30 && !(await G(() => p.state === 'grab')); i++) await step(1); await K.up(fwd); await step(2);
    return G(() => p.state === 'grab');
  }
  await start(0);
  for (const [name, key, cam] of [['侧视 上(W)＋J', 'KeyW'], ['侧视 下(S)＋J', 'KeyS'], ['正视 左/右(A)＋J', 'KeyA', 2]]) {
    const g = await grabbed(cam);
    await K.down(key); await step(1); await K.press('KeyJ'); await step(2); await K.up(key);
    const mid = await G(() => ({ clip: p.sub && p.sub.clip, state: p.state, sup: G.events.some(e => e.type === 'suplex') }));
    await step(70);
    const fin = await G(() => { const e = G.testFoe; return { ex: +e.x.toFixed(2), px: +p.x.toFixed(2), ez: +e.z.toFixed(2), pz: +p.z.toFixed(2), face: +p.face.toFixed(2), hp: Math.round(e.hp), state: e.state }; });
    const behind = ((fin.ex - fin.px) * Math.sin(fin.face) + (fin.ez - fin.pz) * Math.cos(fin.face)) < -0.3;
    ok(`${name}：背摔，敌人摔在身后并掉血`, g && mid.clip === 'suplex' && mid.sup && behind && fin.hp < 200, { g, mid, fin });
    if (name.startsWith('侧视 上')) { await step(1, true); await page.screenshot({ path: out('suplex-land.png') }); }
  }
  await C(() => window.__CD_TEST__.setCamera(0, 0));
  let g = await grabbed();
  await K.press('KeyJ'); await step(4);
  s = await G(() => ({ state: p.state, strikes: p.sub.strikes, foe: G.testFoe.state }));
  ok('不按方向 J：膝撞（仍抓着）', g && s.state === 'grab' && s.strikes === 1, s);
  await K.down('KeyA'); await step(1); await K.press('KeyJ'); await step(2); await K.up('KeyA');
  s = await G(() => ({ clip: p.sub && p.sub.clip, back: G.events.filter(e => e.type === 'throw').slice(-1)[0] }));
  ok('反方向＋J：向后抛', s.clip === 'throw' && s.back && s.back.back === true, s);

  ok('无页面错误', errors.length === 0, errors);
  const fail = results.filter(r => !r.pass).length;
  fs.writeFileSync(out('intro-throw.json'), JSON.stringify({ results, errors }, null, 2));
  console.log(`${results.length - fail}/${results.length} passed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();

// 李家坡的机制与剧情检查：语音按章加载、第一阶段火力点与七七二团冲锋、坡上的机枪封锁、土工掘进过场、
// 夜里挖壕（I 开挖 / 走动停手 / 照明弹 / 交通壕挡子弹 / 土埂拦人 / 鬼子摸上来）、手榴弹雨（信号弹、全营投弹、碉堡、超时由张大彪补）、
// 突击队三段战壕、射击孔（正面挨打、侧面扔手榴弹炸哑）、山崎（格子弹、收刀时吃子弹、拼刀、战友不打他）、结算
// 开火、投弹、互动都走键盘输入层；为了把场面摆到要测的状态，部分前置条件直接改了游戏状态（例如把主角摆到壕头）
const { open } = require('./lib.cjs');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };

(async () => {
  const { browser, page, errors } = await open({ ch: 'lijiapo' });
  const step = (sec) => page.evaluate((n) => { for (let i = 0; i < n; i++) __lj.step(1, false); __lj.step(0, true); }, Math.round(sec * 60));
  const key = (code, hold = 0.05) => page.evaluate(async ([c, h]) => { __lj.app.input.key(c, true, false); for (let i = 0; i < Math.max(1, Math.round(h * 60)); i++) __lj.step(1, false); __lj.app.input.key(c, false, false); }, [code, hold]);
  const begin = async (sp) => {
    await page.evaluate((p) => { const a = __lj.app; a.s.startPhase = p; a.s.lives = 'inf'; a.s.view = 0; a.demo = true; __lj.manual(true); if (a.state !== 'menu') a.toMenu(); a.start(false); }, sp);
    await page.waitForFunction(() => __lj.app.state === 'play', null, { timeout: 5000 });
  };
  const skip = async () => { await page.evaluate(() => { const g = __lj.game; if (g.scn) g.endScene(true); }); await step(0.1); };
  const clearFoes = (groups) => page.evaluate((gs) => { const g = __lj.game; for (const e of g.enemies) if (e.alive && (!gs || gs.includes(e.group))) g.killUnit(e, false); }, groups || null);

  // ---------- 菜单与语音 ----------
  const menu = await page.evaluate(() => ({ head: document.querySelector('#menu .sub strong').textContent, chapters: [...document.querySelectorAll('#menu .chapter')].map((b) => b.dataset.ch + (b.classList.contains('soon') ? ':soon' : '')), title: document.title }));
  check('菜单写“第二章 · 李家坡攻坚”，三章都能选（没有“制作中”）', /第二章 · 李家坡攻坚/.test(menu.head) && menu.chapters.join(',') === 'cangyunling,lijiapo,pingan', menu);
  await begin(1);
  await page.waitForFunction(() => Object.keys(__lj.app.audio.voices || {}).length >= 23, null, { timeout: 25000 }).catch(() => {});
  const vo = await page.evaluate(async () => { const idx = await (await fetch('assets/voice/index.json')).json(); return { list: idx.lijiapo, loaded: Object.keys(__lj.app.audio.voices) }; });
  check('李家坡语音 23 条（19 条原声 + 亮剑 / 骑兵连 / 精锐 / 发财）全部能下载解码，不加载别的章节', vo.list.length === 23 && vo.list.every((id) => vo.loaded.includes(id)) && !vo.loaded.includes('cy_bantian') && !vo.loaded.includes('xq_zhi'), { n: vo.list.length, missing: vo.list.filter((id) => !vo.loaded.includes(id)) });

  // ---------- 第一阶段 ----------
  await step(1);
  const p1 = await page.evaluate(() => ({ voice: __lj.app.audio.log.includes('voice:ljp_lengbandeng'), dialog: document.getElementById('dialog').textContent, ob: document.getElementById('objective').textContent }));
  check('开场原声孔捷“坐冷板凳”，目标是拔掉山脚左边的火力点', p1.voice && /孔捷/.test(p1.dialog) && /左边的火力点/.test(p1.ob), p1);
  await step(4);
  const ch772 = await page.evaluate(() => __lj.game.actors.filter((a) => a.st === 'run').length);
  await step(6);
  const ch772b = await page.evaluate(() => ({ down: __lj.game.actors.filter((a) => a.st === 'down' || a.st === 'back').length, bunkerShots: __lj.game.world.bunkers.some((b) => b.burst > 0 || b.flashT > -1) }));
  check('七七二团从出发线往坡上冲，冲到半坡被坡顶机枪压住（倒下或退回）', ch772 >= 8 && ch772b.down >= 4 && ch772b.bunkerShots, { ch772, ch772b });
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, 0, 6); });
  await step(0.2);
  const bnd = await page.evaluate(() => ({ z: __lj.game.hero.z, toast: document.getElementById('toast').textContent }));
  check('第一阶段冲坡顶会被拦下（z ≥ 12）并提示机枪封着坡', bnd.z >= 11.9 && /机枪封着/.test(bnd.toast), bnd);
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, 2, 26); for (const b of g.world.bunkers) { b.cd = 0; b.burst = 0; } });
  await step(0.1);
  const zone = await page.evaluate(() => ({ warn: __lj.game.fx.discs.some((d) => d.m.visible), bursts: __lj.game.world.bunkers.filter((b) => Math.abs(b.tx - __lj.game.hero.x) < 3 && Math.abs(b.tz - __lj.game.hero.z) < 3).length }));
  check('站进坡中间的封锁区，碉堡的机枪先在脚下亮红圈再扫过来', zone.warn && zone.bursts >= 2, zone);
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, -20, 50); __lj.app.audio.log.length = 0; });
  await clearFoes(['PL']);
  await step(0.6);
  const pl = await page.evaluate(() => ({ pl: __lj.game.flags.pl, voice: __lj.app.audio.log.includes('voice:ljp_dibaci'), med: __lj.game.pickups.length, p1x: __lj.game.enemies.filter((e) => e.alive && e.group === 'P1x').length, ob: document.getElementById('objective').textContent }));
  check('左边火力点拔掉：原声“七七二团又撤下来了……第八次了”，坡上下来一股增援，目标换成右边的火力点', pl.pl && pl.voice && pl.p1x >= 3 && /右边的火力点/.test(pl.ob), pl);
  await clearFoes(['PR', 'P1x']);
  await step(4);
  const sc1 = await page.evaluate(() => ({ scn: !!__lj.game.scn, voice: __lj.app.audio.log.includes('voice:ljp_tugong'), dialog: document.getElementById('dialog').textContent }));
  check('两个火力点都拔掉：过场里李云龙讲“缩短攻击距离”，参谋问“土工的方式进行掘进”', sc1.scn && sc1.voice && /地形/.test(sc1.dialog), sc1);
  await step(10);
  const dark = await page.evaluate(() => __lj.game.scene.fog.color.getHex());
  await skip();
  const n2 = await page.evaluate(() => ({ phase: __lj.game.phase, fog: __lj.game.scene.fog.color.getHex(), hemi: __lj.game.hemi.intensity }));
  check('过场里天慢慢黑下来，跳过后进第二阶段、夜里的光', dark !== 0xcdbfac && n2.phase === 2 && n2.fog === 0x161c2a && n2.hemi < 0.7, { dark: dark.toString(16), n2 });

  // ---------- 第二阶段：挖壕 ----------
  await step(1);
  const pr2 = await page.evaluate(() => { const g = __lj.game, tr = g.world.trench, q = tr.pointAt(tr.dug + 0.01), p = tr.pointAt(0); g.place(g.hero, p.x, p.z); return document.getElementById('prompt').textContent; });
  await step(0.2);
  const pr2b = await page.evaluate(() => ({ prompt: document.getElementById('prompt').textContent, use: document.getElementById('use') ? document.getElementById('use').textContent : '' }));
  check('站到壕头提示“按 F 挖交通壕”', /挖交通壕/.test(pr2b.prompt), { pr2, pr2b });
  const d0 = await page.evaluate(() => { const g = __lj.game; g.flareT = 99; return g.world.trench.dug; });
  await key('KeyF');
  await step(3);
  const dg = await page.evaluate(() => ({ digging: __lj.game.digging, dug: __lj.game.world.trench.dug, shovel: __lj.game.hero.model.shovel.visible, prompt: document.getElementById('prompt').textContent, berm: __lj.game.world.colliders.filter((c) => c.tag === 'berm' && c.on).length }));
  check('按 F 开挖：三秒挖出两米多（主角 + 两个战友），主角手里有铁锹，提示改成“按 F 停手”，挖出来的那截两边起了土埂', dg.digging && dg.dug - d0 > 2.5 && dg.shovel && /停手/.test(dg.prompt) && dg.berm >= 6, { d0, dg });
  await key('KeyW', 0.3);
  const st = await page.evaluate(() => ({ digging: __lj.game.digging, shovel: __lj.game.hero.model.shovel.visible }));
  check('一走动就停手、铁锹收起', !st.digging && !st.shovel, st);
  // 挖到二十米，测交通壕挡子弹、土埂拦人
  const cov = await page.evaluate(() => {
    const g = __lj.game, tr = g.world.trench; g.world.setDug(20);
    const deep = tr.pointAt(10), head = tr.pointAt(19.5), out = { x: deep.x + 6, z: deep.z };
    const rate = (p) => { g.hero.x = p.x; g.hero.z = p.z; let n = 0; for (let i = 0; i < 400; i++) if (g.heroCover()) n++; return n / 400; };
    return { deep: rate(deep), head: rate(head), out: rate(out) };
  });
  check('壕里八成多子弹打在土埂上，壕头挡一半不到，壕外不挡', cov.deep > 0.78 && cov.deep < 0.92 && cov.head > 0.35 && cov.head < 0.56 && cov.out === 0, cov);
  const wall = await page.evaluate(() => { const g = __lj.game, tr = g.world.trench, p = tr.pointAt(9); g.place(g.hero, p.x, p.z); g.cam.yaw = Math.atan2(-(-p.dz), -(p.dx)); return { x: p.x, z: p.z, nx: -p.dz, nz: p.dx }; });
  await key('KeyW', 0.8);
  const w2 = await page.evaluate((w) => { const h = __lj.game.hero; return Math.abs((h.x - w.x) * w.nx + (h.z - w.z) * w.nz); }, wall);
  await page.evaluate(() => __lj.app.input.key('KeyW', true, false)); await key('KeyK'); await step(0.6); await page.evaluate(() => __lj.app.input.key('KeyW', false, false));
  const w3 = await page.evaluate((w) => { const h = __lj.game.hero; return Math.abs((h.x - w.x) * w.nx + (h.z - w.z) * w.nz); }, wall);
  check('在壕里横着走被土埂挡住，跳起来能翻出壕外', w2 < 1.0 && w3 > 1.6, { w2, w3 });
  await page.evaluate(() => { __lj.game.flareT = 0; });
  await step(2.5);
  const fl = await page.evaluate(() => ({ lit: __lj.game.lit, light: Math.max(...__lj.game.flarePool.map((f) => f.light.intensity)), toast: document.getElementById('toast').textContent, ob: document.getElementById('objective').textContent }));
  check('照明弹升空点亮（点光源亮起），目标栏标“照明弹！”，提示退回壕里', fl.lit && fl.light > 1 && /照明弹/.test(fl.ob) && /照明弹/.test(fl.toast), fl);
  const sneak = await page.evaluate(() => ({ s1: __lj.game.flags.s1, n1: __lj.game.enemies.filter((e) => e.alive && e.group === 'N1').length }));
  check('挖到一成半，左边有鬼子摸下来（夜袭）', sneak.s1 && sneak.n1 >= 4, sneak);
  await page.evaluate(() => { const g = __lj.game, tr = g.world.trench; g.world.setDug(tr.total * 0.5); __lj.app.audio.log.length = 0; });
  await step(0.5);
  const half = await page.evaluate(() => ({ mt: __lj.game.flags.mt, mActive: __lj.game.enemies.filter((e) => e.alive && e.group === 'M' && e.active).length, s2: __lj.game.flags.s2, juetu: __lj.game.flags.jt }));
  check('挖到一半：坡顶掷弹筒开始砸壕头，右边又摸上来一股，日军发现“八路在掘土”', half.mt && half.mActive >= 1 && half.s2 && half.juetu, half);
  await clearFoes();
  await page.evaluate(() => { const g = __lj.game; g.world.setDug(g.world.trench.total); __lj.app.audio.log.length = 0; });
  await step(4);
  const sc2 = await page.evaluate(() => ({ scn: !!__lj.game.scn, voice: __lj.app.audio.log.includes('voice:ljp_zhangdabiao'), dialog: document.getElementById('dialog').textContent }));
  check('交通壕挖通：拂晓过场，张大彪“没人会活着退出战斗”', sc2.scn && sc2.voice && /全看你的/.test(sc2.dialog), sc2);
  await skip();
  const n3 = await page.evaluate(() => ({ phase: __lj.game.phase, fog: __lj.game.scene.fog.color.getHex(), nade: document.querySelector('#act-nade') ? document.querySelector('#act-nade').textContent : document.getElementById('touch').textContent }));
  check('进第三阶段（拂晓的光），手榴弹键变成“全营投弹”', n3.phase === 3 && n3.fog === 0x9e8c86 && /全营投弹/.test(n3.nade), n3);

  // ---------- 第三阶段：手榴弹雨 ----------
  await key('KeyG');
  const early = await page.evaluate(() => ({ toast: document.getElementById('toast').textContent, g: __lj.game.grenades }));
  check('信号弹之前按 G：提示等信号弹，一颗没扔', /信号弹/.test(early.toast) && early.g === 3600, early);
  await step(15.5);
  const sig = await page.evaluate(() => ({ signal: __lj.game.flags.signal, voice: __lj.app.audio.log.includes('voice:ljp_xinhao'), bar: document.getElementById('cannon-row').textContent }));
  check('原声“信号弹一响……两分钟之内必须全都扔出去”，信号弹后开始两分钟倒计时', sig.signal && sig.voice && /两分钟/.test(sig.bar), sig);
  // 把准星对到中间碉堡上
  const aimB = async (i) => { for (let r = 0; r < 3; r++) { await page.evaluate((k) => { const g = __lj.game, b = g.world.bunkers[k], c = g.camera.position; g.cam.yaw = Math.atan2(-(b.x - c.x), -(b.z + 1 - c.z)); g.cam.pitch = Math.atan2(b.y + 0.6 - c.y, Math.hypot(b.x - c.x, b.z + 1 - c.z)); }, i); await step(0.15); } };
  await aimB(1);
  const mk = await page.evaluate(() => ({ ok: __lj.game.mark.ok, vis: __lj.game.markMesh.visible, d: Math.hypot(__lj.game.mark.x - __lj.game.world.bunkers[1].x, __lj.game.mark.z - __lj.game.world.bunkers[1].z) }));
  check('准星压在碉堡上，黄圈罩住碉堡', mk.ok && mk.vis && mk.d < 4.5, mk);
  const hp0 = await page.evaluate(() => __lj.game.world.bunkers[1].hp);
  await key('KeyG');
  const v1 = await page.evaluate(() => ({ g: __lj.game.grenades, cd: __lj.game.volleyCd }));
  await step(2.4);
  const v2 = await page.evaluate(() => ({ hp: __lj.game.world.bunkers[1].hp, alive: __lj.game.world.bunkers[1].alive }));
  await key('KeyG');
  const v3 = await page.evaluate(() => ({ g: __lj.game.grenades, toast: document.getElementById('toast').textContent }));
  check('按 G 全营投一轮：三百六十颗，三秒多的间隔里再按只提示“还在往前传”', v1.g === 3240 && v1.cd > 3 && v3.g === 3240 && /往前传/.test(v3.toast), { v1, v3 });
  check('一轮手榴弹砸在碉堡上，碉堡掉血或直接炸塌', v2.hp < hp0 || !v2.alive, { hp0, v2 });
  for (let r = 0; r < 4 && await page.evaluate(() => __lj.game.world.bunkers[1].alive); r++) { await step(1.2); await aimB(1); await step(0.1); await key('KeyG'); await step(2.2); }
  const bd = await page.evaluate(() => ({ alive: __lj.game.world.bunkers[1].alive, ruin: __lj.game.world.bunkers[1].ruin.visible, col: __lj.game.world.bunkers[1].cols[0].on, byVolley: __lj.game.stats.bunkerVolley }));
  check('碉堡炸塌：换成一堆碎块，碰撞拿掉（成了缺口），记“手榴弹炸掉”', !bd.alive && bd.ruin && !bd.col && bd.byVolley === 1, bd);
  // 时间到了还剩碉堡：张大彪补
  await page.evaluate(() => { const g = __lj.game; g.rainT = 0.01; g.volleyCd = 0; for (const n of g.nades) g.scene.remove(n.mesh); g.nades.length = 0; __lj.app.audio.log.length = 0; });
  await step(9);
  const late = await page.evaluate(() => ({ left: __lj.game.world.bunkers.filter((b) => b.alive).length, help: __lj.game.stats.bunkerHelp, scn: !!__lj.game.scn, voice: __lj.app.audio.log.includes('voice:ljp_huopi') }));
  check('两分钟到了还剩碉堡：张大彪抱着集束手榴弹补上，接着放“老子要活劈了他”', late.left === 0 && late.help === 2 && late.scn && late.voice, late);
  await skip();
  const n4 = await page.evaluate(() => ({ phase: __lj.game.phase, groups: ['F', 'W', 'E'].map((x) => __lj.game.enemies.filter((e) => e.alive && e.group === x).length), fog: __lj.game.scene.fog.color.getHex(), loot: __lj.game.pickups.some((p) => p.type === 'loot') }));
  check('进第四阶段（白天）：南、西、东三段战壕都有鬼子，工事里有一箱歪把子', n4.phase === 4 && n4.groups.every((n) => n >= 4) && n4.fog === 0xd4d0c6 && n4.loot, n4);

  // ---------- 第四阶段 ----------
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, 0, -29.5); __lj.app.audio.log.length = 0; });
  await step(0.5);
  const qb = await page.evaluate(() => __lj.game.flags.qibing);
  await step(15.5);
  check('冲上坡顶：孙德胜“咱们是骑兵，没有马也该比步兵快”（排在张大彪“野狼的劲头”后面放）', qb && await page.evaluate(() => __lj.app.audio.log.includes('voice:ljp_qibing')), { qb });
  await clearFoes(['F']); await step(10.5);
  check('南面战壕肃清：和尚和战士“俺包圆了——平分”', await page.evaluate(() => __lj.app.audio.log.includes('voice:ljp_pingfen')), null);
  await clearFoes(['W', 'E']); await step(4.5);
  const back = await page.evaluate(() => __lj.game.enemies.filter((e) => e.alive && e.group === 'B').length);
  check('南面一拿下，北面的鬼子反扑上来（打退之前不进下一阶段）', back >= 4 && await page.evaluate(() => __lj.game.phase === 4), { back });
  await clearFoes(['B']); await step(4);
  const n5 = await page.evaluate(() => ({ phase: __lj.game.phase, sub: __lj.game.sub, cp: __lj.app.checkpoint() }));
  check('三段都肃清进第五阶段，存档记到第五阶段', n5.phase === 5 && n5.sub === 'ports' && n5.cp === 5, n5);

  // ---------- 第五阶段：射击孔 ----------
  await clearFoes(['G']);
  const front = await page.evaluate(() => { const g = __lj.game, p = g.world.cp.ports[0]; g.place(g.hero, p.x, p.z + 12); for (const q of g.world.cp.ports) { q.cd = 0; q.burst = 0; } return null; });
  await step(0.15);
  const pf = await page.evaluate(() => __lj.game.world.cp.ports.filter((q) => q.burst > 0).map((q) => q.k));
  await page.evaluate(() => { const g = __lj.game, p = g.world.cp.ports[0]; g.place(g.hero, p.x - 9, p.z - 1.5); for (const q of g.world.cp.ports) { q.cd = 0; q.burst = 0; } });
  await step(0.15);
  const ps = await page.evaluate(() => __lj.game.world.cp.ports.filter((q) => q.burst > 0).map((q) => q.k));
  check('站在指挥所正面：南面的射击孔开火；贴到侧面（射击孔扇面外）南面的孔打不到', pf.includes(0) && !ps.includes(0), { pf, ps, front });
  // 侧面扔手榴弹：准星压在孔边（先等镜头跟上主角）
  await step(0.6);
  const aimPort = () => page.evaluate(() => { const g = __lj.game, p = g.world.cp.ports[0], c = g.camera.position; g.hero.nades = 3; const tx = p.x - 0.3, tz = p.z + 0.5, ty = g.groundY(tx, tz); g.cam.yaw = Math.atan2(-(tx - c.x), -(tz - c.z)); g.cam.pitch = Math.atan2(ty - c.y, Math.hypot(tx - c.x, tz - c.z)); });
  await aimPort(); await step(0.2); await aimPort(); await step(0.05);
  const thr = await page.evaluate(() => { const g = __lj.game; return { aim: [+g.aim.x.toFixed(2), +g.aim.z.toFixed(2)], tgt: g.aim.target ? g.aim.target.type : null, h: [+g.hero.x.toFixed(2), +g.hero.z.toFixed(2)], nades: g.hero.nades, alive: g.hero.alive, cut: g.cut, sub: g.sub }; });
  await key('KeyG');
  const thr2 = await page.evaluate(() => __lj.game.nades.map((q) => [+q.x1.toFixed(2), +q.z1.toFixed(2)]));
  await step(1.2);
  const sil = await page.evaluate(() => ({ alive: __lj.game.world.cp.ports[0].alive, n: __lj.game.stats.ports }));
  check('从侧面把手榴弹扔到射击孔边上：这个孔哑了', !sil.alive && sil.n === 1, { sil, thr, thr2 });
  await page.evaluate(() => { const g = __lj.game; __lj.app.audio.log.length = 0; for (const p of g.world.cp.ports) if (p.alive) g.silencePort(p); });
  await step(1.5);
  const ys = await page.evaluate(() => ({ scn: !!__lj.game.scn, boss: !!__lj.game.boss, voice: __lj.app.audio.log.includes('voice:ljp_qishi'), dialog: document.getElementById('dialog').textContent }));
  check('四个孔都哑了：山崎带卫兵冲出来，原声“中世纪的骑士，动不动就决斗”', ys.scn && ys.boss && ys.voice && /骑士/.test(ys.dialog), ys);
  await skip();
  // 格子弹
  const b0 = await page.evaluate(() => { const g = __lj.game, b = g.boss; for (const e of g.enemies) if (e !== b) g.killUnit(e, true); g.place(g.hero, b.x, b.z + 9); b.state = 'walk'; b.cd = 99; b.yaw = Math.PI; g.cam.yaw = 0; const c = g.camera.position; return b.hp; });
  await page.evaluate(() => { const g = __lj.game, b = g.boss; for (let i = 0; i < 8; i++) g.bullets.push({ team: 0, x: b.x, y: b.y + 1.2, z: b.z + 3, dx: 0, dy: 0, dz: -1, sp: 90, life: 0.5, dmg: 1, ign: null, age: 0, hero: true }); });
  await step(0.2);
  const g1 = await page.evaluate(() => ({ hp: __lj.game.boss.hp, deflect: __lj.game.stats.deflect }));
  await page.evaluate(() => { const g = __lj.game, b = g.boss; b.state = 'recover'; b.stT = 5; for (let i = 0; i < 4; i++) g.bullets.push({ team: 0, x: b.x, y: b.y + 1.2, z: b.z + 3, dx: 0, dy: 0, dz: -1, sp: 90, life: 0.5, dmg: 1, ign: null, age: 0, hero: true }); });
  await step(0.2);
  const g2 = await page.evaluate(() => ({ hp: __lj.game.boss.hp }));
  check('山崎架着刀时子弹全被格开（不掉血），收刀喘气时子弹打得进去（伤害 ×1.5）', g1.hp === b0 && g1.deflect >= 6 && g2.hp < b0 - 4, { b0, g1, g2 });
  // 拼刀
  await page.evaluate(() => { const g = __lj.game, b = g.boss, h = g.hero; b.hp = 120; b.state = 'walk'; b.cd = 99; g.place(h, b.x, b.z + 4); g.cam.yaw = 0; h.dashCd = 0; b.state = 'dashTele'; b.stT = 5; b.dx = 0; b.dz = 1; });
  await key('KeyQ');
  await step(0.3);
  const cl = await page.evaluate(() => ({ state: __lj.game.boss.state, clash: __lj.game.stats.clash, hp: __lj.game.boss.hp }));
  check('山崎突刺时亮剑撞上去：拼刀，山崎被震住（stun）掉血', cl.state === 'stun' && cl.clash === 1 && cl.hp < 120, cl);
  const ally = await page.evaluate(() => { const g = __lj.game; return g.allies.filter((a) => a.target === g.boss).length; });
  await step(1);
  const ally2 = await page.evaluate(() => { const g = __lj.game; return g.allies.filter((a) => a.target === g.boss).length; });
  check('战友不朝山崎开枪（谁也不许开枪，给我留着）', ally === 0 && ally2 === 0, { ally, ally2 });
  await page.evaluate(() => { const g = __lj.game; __lj.app.audio.log.length = 0; g.hurtUnit(g.boss, 999, 0, 1, 'blade'); });
  await step(1);
  const win = await page.evaluate(() => ({ won: __lj.game.flags.won, voice: __lj.app.audio.log.includes('voice:ljp_candi'), dialog: document.getElementById('dialog').textContent, flag: __lj.game.world.flag.visible }));
  check('山崎倒下：“尽快解决残敌”，指挥所的太阳旗拔掉', win.won && win.voice && /残敌/.test(win.dialog) && !win.flag, win);
  await step(8);
  const res = await page.evaluate(() => ({ state: __lj.app.state, title: document.querySelector('#result .title2').textContent, stats: document.querySelector('#result .stats').textContent }));
  check('结算：标题“李家坡拿下来了！”，战报有交通壕、手榴弹雨、射击孔、拼刀', res.state === 'result' && /李家坡拿下来了/.test(res.title) && /交通壕/.test(res.stats) && /手榴弹雨/.test(res.stats) && /射击孔/.test(res.stats) && /拼刀/.test(res.stats), res);

  check('全程没有脚本报错', !errors.length, errors.slice(0, 5));
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length}`);
  require('fs').writeFileSync(require('path').join(__dirname, 'out-ljp-story.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

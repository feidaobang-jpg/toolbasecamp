// 苍云岭的机制与剧情检查：语音按章加载、默认章节、转移进度与停顿、抓舌头（打倒 / 打死换人 / 按 I 抓活的）、
// 炮组被堵与重整、迫击炮表尺与两发炮弹（柱子报偏差、打中走原作、两发都偏走坂田）、结局存档
// 开火、互动都走键盘输入层；为了把场面摆到要测的状态，部分前置条件直接改了游戏状态（例如把鬼子摆到阵地前）
const { open } = require('./lib.cjs');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };

(async () => {
  // ---------- 默认章节：没玩过的新玩家进来是第一章 ----------
  {
    const { browser, page } = await open({ ch: 'none' });
    const d = await page.evaluate(() => ({ ch: __lj.app.chapter.id, head: document.querySelector('#menu .sub strong').textContent, cur: document.querySelector('#menu .chapter.cur').dataset.ch, title: document.title }));
    check('新玩家默认进第一章苍云岭，菜单标题“第一章 · 苍云岭突围”', d.ch === 'cangyunling' && d.cur === 'cangyunling' && /第一章 · 苍云岭突围/.test(d.head), d);
    await browser.close();
  }
  const { browser, page, errors } = await open({ ch: 'cangyunling' });
  const step = (sec) => page.evaluate((n) => { for (let i = 0; i < n; i++) __lj.step(1, false); __lj.step(0, true); }, Math.round(sec * 60));
  const key = (code, hold = 0.05) => page.evaluate(async ([c, h]) => { __lj.app.input.key(c, true, false); for (let i = 0; i < Math.max(1, Math.round(h * 60)); i++) __lj.step(1, false); __lj.app.input.key(c, false, false); }, [code, hold]);
  const begin = async (sp) => {
    await page.evaluate((p) => { const a = __lj.app; a.s.startPhase = p; a.s.lives = 'inf'; a.s.view = 0; __lj.manual(true); if (a.state !== 'menu') a.toMenu(); a.start(false); }, sp);
    await page.waitForFunction(() => __lj.app.state === 'play', null, { timeout: 5000 });
  };
  const skip = async () => { await page.evaluate(() => { const g = __lj.game; if (g.scn) g.endScene(true); }); await step(0.1); };

  // ---------- 第一阶段：转移进度 ----------
  await begin(1);
  // ---------- 语音 ----------
  await page.waitForFunction(() => Object.keys(__lj.app.audio.voices || {}).length >= 28, null, { timeout: 25000 }).catch(() => {});
  const vo = await page.evaluate(async () => { const idx = await (await fetch('assets/voice/index.json')).json(); return { list: idx.cangyunling, loaded: Object.keys(__lj.app.audio.voices) }; });
  check('苍云岭语音 28 条（25 条原声 + 亮剑 / 骑兵连 / 天才）全部能下载解码，不加载平安县城的语音', vo.list.length === 28 && vo.list.every((id) => vo.loaded.includes(id)) && !vo.loaded.includes('xq_zhi'), { n: vo.list.length, missing: vo.list.filter((id) => !vo.loaded.includes(id)) });

  await step(10);
  const p1 = await page.evaluate(() => { const g = __lj.game; return { prog: g.prog, col: g.column.filter((c) => c.models[0].root.visible).length, bar: document.getElementById('cannon-row').textContent, low: document.getElementById('cannon-bar').classList.contains('low') }; });
  check('坚守山头：转移进度随时间上涨，左上角进度条叫“转移进度”且不标红，山后能看到转移队伍', p1.prog > 5 && p1.prog < 12 && /转移进度/.test(p1.bar) && !p1.low && p1.col > 0, p1);
  await page.evaluate(() => { const g = __lj.game; for (let i = 0; i < 3; i++) { const e = g.addUnit('enemy', 'rifle', -3 + i * 3, 50, { group: 'P1', hold: true }); e.active = true; } });
  const a1 = await page.evaluate(() => __lj.game.prog); await step(3);
  const a2 = await page.evaluate(() => ({ prog: __lj.game.prog, ob: document.getElementById('objective').textContent, stalled: __lj.game.stalled }));
  check('鬼子压到阵地前沿（三个以上）时转移停下，目标栏提示“鬼子压上来了”', a2.stalled && Math.abs(a2.prog - a1) < 0.01 && /压上来了/.test(a2.ob), { a1, a2 });
  await page.evaluate(() => { for (const e of __lj.game.enemies) if (e.z > 46) __lj.game.killUnit(e, true); });
  await step(1.5);
  check('打下去以后转移接着走', await page.evaluate((p) => __lj.game.prog > p + 0.5, a2.prog), null);
  await page.evaluate(() => { __lj.game.prog = 99.9; __lj.app.audio.log.length = 0; });
  await step(1);
  const done1 = await page.evaluate(() => ({ voice: __lj.app.audio.log.includes('voice:cy_zhuanyi'), dialog: document.getElementById('dialog').textContent }));
  await step(11);
  check('进度走满：原声“转移了没有——全部撤离”，随后进入第二阶段抓舌头', done1.voice && /转移了没有/.test(done1.dialog) && await page.evaluate(() => __lj.game.phase === 2), done1);

  // ---------- 第二阶段：抓舌头 ----------
  await step(0.5);
  const t0 = await page.evaluate(() => { const g = __lj.game, t = g.tongue, h = g.hero; for (const e of g.enemies) if (e !== t && e.type !== 'mortar') { e.alive = false; e.deadT = 9; } g.place(t, h.x + 2, h.z - 9); g.blast(t.x, t.z, 4, 6, 0); return { alive: t.alive, fail: g.stats.tongueFail }; });
  await step(0.2);
  const t1 = await page.evaluate(() => ({ fail: __lj.game.stats.tongueFail, tongue: !!__lj.game.tongue, toast: document.getElementById('toast').textContent }));
  await step(3);
  const t2 = await page.evaluate(() => ({ tongue: !!__lj.game.tongue && __lj.game.tongue.alive, idx: __lj.game.tongueIdx }));
  check('手榴弹把军曹炸死：记一次“下手太重”，提示要活的，两秒多后换一个军曹', !t0.alive || (t1.fail === 1 && /要活的/.test(t1.toast) && t2.tongue && t2.idx === 1), { t0, t1, t2 });
  // 用枪打倒：主角正对军曹，按住开火键
  await page.evaluate(() => { const g = __lj.game, t = g.tongue, h = g.hero; for (const e of g.enemies) if (e !== t && e.type !== 'mortar') { e.alive = false; e.deadT = 9; } g.place(h, 0, 40); g.place(t, 0, 33); t.hold = true; g.cam.yaw = 0; g.cam.pitch = -0.04; });
  await page.evaluate(() => __lj.app.input.key('KeyJ', true, false));
  for (let i = 0; i < 40 && !(await page.evaluate(() => __lj.game.tongue && __lj.game.tongue.downed)); i++) await step(0.1);
  await page.evaluate(() => __lj.app.input.key('KeyJ', false, false));
  const t3 = await page.evaluate(() => ({ downed: __lj.game.tongue.downed, alive: __lj.game.tongue.alive, label: document.getElementById('objective').textContent }));
  await step(1);
  const t4 = await page.evaluate(() => ({ alive: __lj.game.tongue.alive }));
  check('驳壳枪把军曹打倒在地（不死），目标改成“过去把军曹抓回来”，倒地后再挨枪也不会死', t3.downed && t3.alive && /抓回来/.test(t3.label) && t4.alive, { t3, t4 });
  await page.evaluate(() => { const g = __lj.game, t = g.tongue; g.place(g.hero, t.x, t.z + 1.6); __lj.app.audio.log.length = 0; });
  await step(0.3);
  const pr = await page.evaluate(() => document.getElementById('prompt').textContent);
  await key('KeyI');
  await step(1);
  const cap = await page.evaluate(() => ({ captured: __lj.game.flags.captured, scn: !!__lj.game.scn, voice: __lj.app.audio.log.includes('voice:cy_bantian'), prompt: document.getElementById('prompt').hidden }));
  await step(9);
  const cap2 = await page.evaluate(() => ({ voice: __lj.app.audio.log.includes('voice:cy_jingrui'), dialog: document.getElementById('dialog').textContent }));
  check('走到跟前提示“按 I 抓活的”，按 I 进入过场：原声“坂田联队”，过场里不再显示互动提示', /抓活的/.test(pr) && cap.captured && cap.scn && cap.voice && cap.prompt, { pr, cap });
  check('过场接着放“老子打的就是精锐，全体上刺刀”', cap2.voice && /精锐/.test(cap2.dialog), cap2);
  await skip();
  // 第三阶段的开场过场（望远镜）
  const b3 = await page.evaluate(() => ({ phase: __lj.game.phase, scn: !!__lj.game.scn, binoc: !!document.getElementById('binoc') && !document.getElementById('binoc').hidden, voice: __lj.app.audio.log.includes('voice:cy_paobudiao') }));
  check('抓完舌头进第三阶段，开场是望远镜里看坂田的指挥部（“老天爷帮忙啊”）', b3.phase === 3 && b3.scn && b3.binoc && b3.voice, b3);
  await skip();
  check('跳过过场后望远镜遮罩收起，接着放“前方五百米”', await page.evaluate(() => document.getElementById('binoc').hidden && __lj.app.audio.log.includes('voice:cy_qianfang')), null);

  // ---------- 第三阶段：送炮 ----------
  await page.evaluate(() => { const g = __lj.game; for (const e of g.enemies) if (e.type !== 'mortar') { e.alive = false; e.deadT = 9; } });
  const z0 = await page.evaluate(() => __lj.game.cannon.z); await step(3);
  const z1 = await page.evaluate(() => __lj.game.cannon.z);
  await page.evaluate(() => { const g = __lj.game, c = g.cannon; const e = g.addUnit('enemy', 'rifle', c.x + 6, c.z - 8, { group: 'X', hold: true, hp: 9999 }); e.active = true; e.stT = 99; });
  await step(0.5); const z2 = await page.evaluate(() => __lj.game.cannon.z); await step(2); const z3 = await page.evaluate(() => __lj.game.cannon.z);
  check('前头没鬼子炮组往前走；16 米内有鬼子就停下等你打通', z1 < z0 - 2 && Math.abs(z3 - z2) < 0.01, { z0, z1, z2, z3 });
  await page.evaluate(() => { const g = __lj.game; g.hurtCannon(999); });
  await step(3);
  const r3 = await page.evaluate(() => ({ phase: __lj.game.phase, retries: __lj.game.stats.retries, cz: __lj.game.cannon.z, scn: !!__lj.game.scn, alive: __lj.game.cannon.alive }));
  check('炮组被打散：记一次重整，从本阶段起点重新送（不再重放开场过场）', r3.phase === 3 && r3.retries === 1 && r3.cz > 55 && !r3.scn && r3.alive, r3);

  // ---------- 第四阶段：两发炮弹（两发都打偏 → 坂田） ----------
  await begin(4);
  await skip(); await step(1);
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, g.cannon.x + 0.4, g.cannon.z + 2.2); });
  await step(0.2); await key('KeyI'); await step(0.3);
  const m0 = await page.evaluate(() => ({ manned: __lj.game.cannon.manned, aim: document.getElementById('aim-info').textContent, cross: !document.getElementById('crosshair').hidden, arc: __lj.game.arc.visible }));
  check('上迫击炮：显示仰角和表尺，屏幕中间有准星，但没有落点预览线', m0.manned && /表尺 约 \d+ 米/.test(m0.aim) && m0.cross && !m0.arc, m0);
  const e0 = await page.evaluate(() => __lj.game.cannon.elev); await key('KeyW', 0.5); const e1 = await page.evaluate(() => __lj.game.cannon.elev);
  const r0 = await page.evaluate(() => __lj.game.flatRange(__lj.game.cannon.elev));
  check('W 抬高仰角，表尺跟着变近（越低越远）', e1 > e0 && r0 < (await page.evaluate((e) => __lj.game.flatRange(e), e0)), { e0, e1 });
  // 故意朝指挥部左后方打
  await page.evaluate(() => { const g = __lj.game; g.cam.yaw = g.cannon.aimYaw = 0.45; g.cannon.elev = 1.0; __lj.app.audio.log.length = 0; });
  await key('KeyJ');
  await step(1);
  const s1 = await page.evaluate(() => ({ shells: __lj.game.cannon.shells, cam: !!__lj.game.shellCam, cut: __lj.game.cut > 0 }));
  check('放第一发：炮弹 2→1，镜头跟着炮弹飞，期间不能操作', s1.shells === 1 && s1.cam && s1.cut, s1);
  for (let i = 0; i < 20 && (await page.evaluate(() => !!__lj.game.shellCam)); i++) await step(0.5);
  await step(0.3);
  const rep = await page.evaluate(() => ({ dialog: [...document.querySelectorAll('#dialog')].map((d) => d.textContent).join(), miss1: __lj.game.stats.miss1, manned: __lj.game.cannon.manned, phase: __lj.game.phase }));
  check('第一发没中：柱子报偏差（远了 / 近了 / 偏左 / 偏右多少米），人还在炮位上', rep.phase === 4 && /(远了|近了|偏左|偏右)/.test(rep.miss1) && rep.manned, rep);
  await step(4);
  await page.evaluate(() => { const g = __lj.game; g.cam.yaw = g.cannon.aimYaw = -0.3; g.cannon.elev = 1.2; });
  await key('KeyJ');
  for (let i = 0; i < 20 && (await page.evaluate(() => !!__lj.game.shellCam)); i++) await step(0.5);
  await step(0.5);
  const mb = await page.evaluate(() => ({ scn: !!__lj.game.scn, line: __lj.game.flags.line, saved: localStorage.getItem('lj_campaign_v1_ending_cangyunling'), voice: __lj.app.audio.log.includes('voice:bt_youyisi') }));
  check('两发都打偏：坂田的过场（“很有意思”），结局线记成 miss 并存档', mb.scn && mb.line === 'miss' && /miss/.test(mb.saved) && mb.voice, mb);
  await skip();
  const p5m = await page.evaluate(() => ({ phase: __lj.game.phase, sub: __lj.game.sub, boss: !!__lj.game.boss && __lj.game.boss.alive, look: __lj.game.boss && __lj.game.boss.model.look, tents: __lj.game.world.hqTents.alive, weapon: __lj.game.hero.weapon, bossName: document.querySelector('#boss span').textContent }));
  check('进第五阶段打坂田：Boss 是坂田（戴眼镜的外观），帐篷还在，手里换成歪把子', p5m.phase === 5 && p5m.sub === 'boss' && p5m.boss && p5m.look === 'sakata' && p5m.tents && p5m.weapon === 'lmg' && p5m.bossName === '坂田信哲', p5m);

  // ---------- 第四阶段：一发打中 → 原作 ----------
  await begin(4);
  await skip(); await step(1);
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, g.cannon.x + 0.4, g.cannon.z + 2.2); });
  await step(0.2); await key('KeyI'); await step(0.3);
  // 算一组正好落在帐篷上的方向和仰角（算上风偏）
  await page.evaluate(() => {
    const g = __lj.game, c = g.cannon, cfg = g.gunCfg;
    const land = (yaw, el) => { const cy = Math.cos(el); let x = c.x - Math.sin(yaw) * cfg.barrel * cy, y = cfg.pivotY + Math.sin(el) * cfg.barrel, z = c.z - Math.cos(yaw) * cfg.barrel * cy; let vx = -Math.sin(yaw) * cy * cfg.speed, vy = Math.sin(el) * cfg.speed, vz = -Math.cos(yaw) * cy * cfg.speed; const T = 2 * vy / cfg.grav, e = g.rangeErr[0]; vx += (Math.cos(yaw) * g.wind - Math.sin(yaw) * e) / T; vz += (-Math.sin(yaw) * g.wind - Math.cos(yaw) * e) / T; let hit = null; for (let i = 0; i < 900 && !hit; i++) { vy -= cfg.grav * 0.016; x += vx * 0.016; y += vy * 0.016; z += vz * 0.016; hit = g.shellHit(x, y, z); } return Math.hypot(x + 22, z + 125); };
    let best = null; for (let yaw = 0.05; yaw < 0.4; yaw += 0.004) for (let el = 0.85; el < 1.4; el += 0.004) { const d = land(yaw, el); if (!best || d < best.d) best = { yaw, el, d }; }
    g.cam.yaw = c.aimYaw = best.yaw; c.elev = best.el; __lj.app.audio.log.length = 0;
  });
  await key('KeyJ');
  let warned = false;
  for (let i = 0; i < 40 && (await page.evaluate(() => !!__lj.game.shellCam)); i++) { await step(0.25); warned = warned || await page.evaluate(() => __lj.app.audio.log.includes('voice:cy_dazhong')); }
  const hit = await page.evaluate(() => ({ line: __lj.game.flags.line, tents: __lj.game.world.hqTents.alive, ruin: __lj.game.world.hqTents.ruin.visible, hitShot: __lj.game.stats.hitShot, saved: localStorage.getItem('lj_campaign_v1_ending_cangyunling') }));
  check('第一发就打中：落地前一秒放“联队长，危险！——打中了”，帐篷变废墟，结局线记成 hit', warned && hit.line === 'hit' && !hit.tents && hit.ruin && hit.hitShot === 1 && /hit/.test(hit.saved), { warned, hit });
  await step(3.5); await skip();
  const p5h = await page.evaluate(() => ({ phase: __lj.game.phase, sub: __lj.game.sub, boss: __lj.game.boss, voice: __lj.app.audio.log.includes('voice:cy_chongle') }));
  check('打中以后第五阶段：没有 Boss，“柱子！弟兄们，冲啊！”冲进指挥部', p5h.phase === 5 && p5h.sub === 'charge' && !p5h.boss && p5h.voice, p5h);
  // 从第五阶段直接开局：沿用上次结局
  await begin(5); await step(0.5);
  const again = await page.evaluate(() => ({ sub: __lj.game.sub, tents: __lj.game.world.hqTents.alive }));
  check('从第五阶段直接开局沿用上次结局（打中＝没有坂田、帐篷已塌）', again.sub === 'charge' && !again.tents, again);
  await page.evaluate(() => { const g = __lj.game; for (const e of g.enemies) { e.alive = false; e.deadT = 9; } g.place(g.hero, -22, -116); });
  await step(1);
  const hold = await page.evaluate(() => ({ sub: __lj.game.sub, voice: __lj.app.audio.log.includes('voice:cy_dayu') }));
  await step(17.5);
  const out = await page.evaluate(() => ({ sub: __lj.game.sub, voice: __lj.app.audio.log.includes('voice:cy_tuweiba'), ob: document.getElementById('objective').textContent }));
  check('冲进指挥部：“这一网捞了多少大鱼”，顶住一阵后“突围吧——打出去”，目标改成从山口突围', hold.sub === 'hold' && hold.voice && out.sub === 'out' && out.voice && /山口/.test(out.ob), { hold, out });
  await page.evaluate(() => { const g = __lj.game; for (const e of g.enemies) { e.alive = false; e.deadT = 9; } g.place(g.hero, 10, -150); });
  await step(1);
  const win = await page.evaluate(() => ({ won: __lj.game.flags.won }));
  await step(4);
  win.voice = await page.evaluate(() => __lj.app.audio.log.includes('voice:cy_piaoliang'));
  await step(11);
  const res = await page.evaluate(() => ({ state: __lj.app.state, title: document.querySelector('#result .title2').textContent, stats: document.querySelector('#result .stats').textContent, best: localStorage.getItem('lj_campaign_v1_best_cangyunling'), cp: localStorage.getItem('lj_campaign_v1_cp_cangyunling') }));
  check('走到山口：突围成功，楚云飞“干得漂亮……团长叫李云龙”，结算写结局线，最高分记在苍云岭名下、清掉进度', win.won && win.voice && res.state === 'result' && /苍云岭/.test(res.title) && /原作/.test(res.stats) && res.best && !res.cp, { win, res });

  check('全程没有报错', !errors.length, errors);
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  require('fs').writeFileSync(require('path').join(__dirname, 'out-cy-story.json'), JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 1));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

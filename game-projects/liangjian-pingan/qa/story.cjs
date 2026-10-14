// 城楼剧情（v0.5.0）：语音清单、秀芹过场、跳过、两条结局、结局记忆与结算
// 场景前置（敲掉机枪堡和城门、把人放到某处、直接进入决战）用状态捷径，抉择本身都走真实按键：I 上炮、J 开炮 / 跳过、W 冲进城门。
// 完整从第一阶段打到结算的两条路线由 playthrough.cjs（ROUTE=classic / rescue）覆盖。
const { open, start, shot } = require('./lib.cjs');
const out = [];
const check = (name, ok, detail) => { out.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(detail))); };

(async () => {
  const { browser, page, errors } = await open();
  await page.evaluate(() => { __lj.manual(true); const a = __lj.app; a.s.startPhase = 3; a.s.view = 0; a.s.lives = 'inf'; });
  await start(page);
  const step = (sec, render = false) => page.evaluate(([n, r]) => __lj.step(n, r), [Math.round(sec * 60), render]);
  const press = async (code, hold = 0.05) => { await page.keyboard.down(code); await step(hold); await page.keyboard.up(code); await step(0.05); };
  const vlog = () => page.evaluate(() => __lj.app.audio.log.filter((s) => s.startsWith('voice:')).map((s) => s.slice(6)));
  const dialog = () => page.evaluate(() => { const d = document.getElementById('dialog'); return d.hidden ? '' : d.textContent; });
  const objective = () => page.evaluate(() => document.getElementById('objective').textContent);
  // 敲掉两个机枪堡和城门，清空语音记录
  const breach = () => page.evaluate(() => { const g = __lj.game; for (const b of g.world.bunkers) g.setBunker(b, false); g.setGate(false); g.audio.log.length = 0; });

  // ---------- 语音 ----------
  await page.waitForFunction(() => Object.keys(__lj.app.audio.voices || {}).length >= 20, null, { timeout: 20000 }).catch(() => {});
  const vo = await page.evaluate(async () => { const list = await (await fetch('assets/voice/index.json')).json(); return { list, loaded: Object.keys(__lj.app.audio.voices) }; });
  const need = ['yidalipao', 'hong', 'geiwohong', 'kaipao', 'shanben_bieda', 'suansha', 'li_bushi', 'xq_zhi', 'xq_kaipao', 'bie_kaipao', 'xq_xiabeizi', 'xq_qiaobuqi', 'kaipao3', 'yongzhesheng', 'chong', 'qibinglian', 'jingrui', 'liangjian', 'fuyu', 'tiancai'];
  check('语音清单 20 条（17 条原声 + 3 条合成）全部能下载解码，不再有 lashanglai', need.every((id) => vo.list.includes(id) && vo.loaded.includes(id)) && vo.list.length === 20 && !vo.list.includes('lashanglai'), vo);

  // ---------- 原作结局：完整看过场，朝城楼开炮 ----------
  await breach();
  await step(1.0);
  const fin = await page.evaluate(() => ({ finale: __lj.game.flags.finale, scn: !!__lj.game.scn }));
  await step(1.0, true);
  const host = await page.evaluate(() => { const g = __lj.game; return { scn: !!g.scn, cut: +g.cut.toFixed(1), cast: g.cast.length, guards: g.enemies.filter((e) => e.alive && e.group === 'tower').length, cam: g.cutCam && g.cutCam.py }; });
  const d0 = await dialog();
  check('城门、机枪堡都没了约 1.6 秒后进入城楼过场：秀芹和山本在城楼上，两侧有卫兵，镜头对着城楼', fin.finale === 1 && !fin.scn && host.scn && host.cast === 2 && host.guards === 2 && host.cam > 10 && /山本一木/.test(d0) && /这个女人/.test(d0), { fin, host, d0 });
  await shot(page, 'story-hostage-tower.png');
  await step(23.5);
  const v1 = await vlog();
  const order = ['shanben_bieda', 'suansha', 'xq_kaipao', 'bie_kaipao'];
  const inOrder = order.every((id, i) => v1.indexOf(id) >= 0 && (i === 0 || v1.indexOf(id) > v1.indexOf(order[i - 1])));
  const ch = await page.evaluate(() => { const g = __lj.game; return { choice: g.flags.choice, scn: !!g.scn, cut: g.cut > 0, ending: g.flags.ending }; });
  check('过场依次播放原声：山本“别打啦”→ 李云龙“算什么军人”→ 秀芹“你开炮啊”→ 张大彪“别开炮”，结束后进入抉择', inOrder && ch.choice === 1 && !ch.scn && !ch.cut && !ch.ending, { v1, ch });
  check('抉择时目标写明两条路', /朝城楼开炮/.test(await objective()) && /救秀芹/.test(await objective()), await objective());
  await step(5.5);
  check('迟迟不决定时秀芹在城楼上催（原声“值！团长，开炮！”）', (await vlog()).includes('xq_zhi'), await vlog());
  // 上炮：走到炮旁按 I
  await page.evaluate(() => { const g = __lj.game, c = g.cannon; g.place(g.hero, c.x + 0.4, c.z + 2.2); });
  await step(0.3);
  await press('KeyI');
  // 瞄准用捷径：在正前方找出落在城楼上的仰角区间，取中间值（手动转炮口瞄准由 playthrough 的自动操作覆盖）
  const elev = await page.evaluate(() => { const g = __lj.game, c = g.cannon, ok = []; for (let e = 0.03; e < 0.7; e += 0.002) if (g.simShell(0, e, false).type === 'tower') ok.push(e); if (!ok.length) return { manned: c.manned, e: null }; g.cam.yaw = 0; c.aimYaw = 0; c.elev = ok[ok.length >> 1]; return { manned: c.manned, e: +c.elev.toFixed(3), n: ok.length, hit: g.simShell(0, c.elev, false).type }; });
  await step(0.3, true);
  const aimCol = await page.evaluate(() => { const g = __lj.game; return { col: g.arc.material.color.getHex().toString(16), aim: document.getElementById('aim-info').textContent }; });
  check('上炮后瞄准城楼：落点标成红色并注明“秀芹在上面”', elev.manned && elev.hit === 'tower' && aimCol.col === 'ff6a55' && /秀芹在上面/.test(aimCol.aim), { elev, aimCol });
  const shells0 = await page.evaluate(() => __lj.game.stats.shells);
  await press('KeyJ');
  const of = await page.evaluate(() => { const g = __lj.game; return { ending: g.flags.ending, scn: !!g.scn, shells: g.stats.shells, saved: localStorage.getItem('lj_campaign_v1_ending_pingan') }; });
  check('朝城楼按 J：先进“开炮”过场（李云龙“不会拿士兵的生命去换自己的老婆”），炮还没出膛，结局记为原作', of.ending === 'classic' && of.scn && of.shells === shells0 && /classic/.test(of.saved || '') && (await vlog()).includes('li_bushi'), of);
  // 过场里乱拖视角，炮口也不能被带偏
  await page.evaluate(() => { const inp = __lj.app.input; for (let i = 0; i < 20; i++) inp._look(40, 10, 'mouse'); });
  await step(13.4);
  const fired = await page.evaluate(() => { const g = __lj.game; return { shells: g.stats.shells, scn: !!g.scn, kaipao3: g.audio.log.includes('voice:kaipao3'), inFlight: g.shells.length }; });
  await step(2.0, true);
  const down = await page.evaluate(() => { const g = __lj.game; return { towerDown: g.flags.towerDown, tower: g.world.tower.alive, cast: g.cast.length, guards: g.enemies.filter((e) => e.alive && e.group === 'tower').length }; });
  check('过场约 13 秒后真正开炮（原声“开炮！开炮！开炮！”），过场里拖视角也打中城楼：城楼塌、秀芹和山本的模型移除、城楼卫兵阵亡', fired.shells === shells0 + 1 && !fired.scn && fired.kaipao3 && down.towerDown === 1 && !down.tower && down.cast === 0 && down.guards === 0, { fired, down });
  await shot(page, 'story-classic-collapse.png');
  await step(4.6);
  const p4 = await page.evaluate(() => ({ phase: __lj.game.phase, dlg: [...__lj.app.ui.dlgQ.map((x) => x.text)], cur: document.getElementById('dialog').textContent }));
  check('原作结局进第四阶段：李云龙喊“给秀芹报仇”', p4.phase === 4 && /给秀芹报仇/.test(p4.cur + p4.dlg.join('')), p4);
  await page.evaluate(() => __lj.game.enterPhase(5, true));
  await step(0.2);
  const b5 = await page.evaluate(() => { const g = __lj.game, b = g.boss; return { hp: b.hp, max: b.maxHp, xq: !!g.xq, line: document.getElementById('dialog').textContent }; });
  check('原作结局的决战：山本带伤（八成血），院子里没有秀芹，开场台词对得上', b5.hp === Math.round(b5.max * 0.8) && !b5.xq && /敢轰/.test(b5.line), b5);
  await page.evaluate(() => { const g = __lj.game; g.hurtUnit(g.boss, 99999); });
  await step(10);
  const r1 = await page.evaluate(() => ({ state: __lj.app.state, title: document.querySelector('#result .title2').textContent, stats: document.querySelector('#result .stats') ? document.querySelector('#result .stats').textContent : document.getElementById('result').textContent }));
  check('原作结局结算：标题“平安县城，拿下了！”，第一行写“结局 城楼开炮（原作）”', r1.state === 'result' && /平安县城，拿下了/.test(r1.title) && /结局城楼开炮（原作）/.test(r1.stats), r1);

  // ---------- 改写结局：跳过过场，冲进城门救人 ----------
  await page.evaluate(() => { const a = __lj.app; a.toMenu(); a.s.startPhase = 3; a.start(false); });
  await step(0.3);
  // 抉择之前门洞仍然封着
  await page.evaluate(() => { const g = __lj.game; g.setGate(false); g.place(g.hero, 0, -12); g.cam.yaw = 0; });
  await page.keyboard.down('KeyW'); await step(1.5); await page.keyboard.up('KeyW'); await step(0.1);
  const blocked = await page.evaluate(() => +__lj.game.hero.z.toFixed(2));
  check('城楼抉择之前，门洞仍不放人进城', blocked >= -16.35, { z: blocked });
  await breach();
  await step(2.0);
  await step(1.2);
  await press('KeyJ');
  const sk = await page.evaluate(() => { const g = __lj.game; return { scn: !!g.scn, choice: g.flags.choice, cut: g.cut > 0, speaking: g.audio.speaking.size, dlg: document.getElementById('dialog').hidden, heroZ: +g.hero.z.toFixed(2) }; });
  check('过场中按 J 跳过：直接进入抉择，台词和字幕立即停掉；贴门站的人先退后两步', !sk.scn && sk.choice === 1 && !sk.cut && sk.speaking === 0 && sk.dlg && sk.heroZ >= -14.6, sk);
  const score0 = await page.evaluate(() => __lj.game.score);
  await page.evaluate(() => { __lj.game.cam.yaw = 0; });
  await page.keyboard.down('KeyW'); await step(1.6); await page.keyboard.up('KeyW'); await step(0.1);
  const rs = await page.evaluate(() => { const g = __lj.game; return { ending: g.flags.ending, cast: g.cast.length, onWall: g.enemies.filter((e) => e.alive && e.y > 2).length, saved: localStorage.getItem('lj_campaign_v1_ending_pingan'), dScore: g.score }; });
  check('抉择时按 W 冲进城门：走改写结局，城楼上的人撤走，城墙上不再有敌人，结局记为改写，加 2500 分', rs.ending === 'rescue' && rs.cast === 0 && rs.onWall === 0 && /rescue/.test(rs.saved || '') && rs.dScore - score0 >= 2500, Object.assign(rs, { score0 }));
  await step(1.8);
  const r4 = await page.evaluate(() => ({ phase: __lj.game.phase, tower: __lj.game.world.tower.alive, cur: document.getElementById('dialog').textContent, q: __lj.app.ui.dlgQ.map((x) => x.text).join('') }));
  check('改写结局进第四阶段：城楼没塌，李云龙喊“把秀芹抢回来”', r4.phase === 4 && r4.tower && /把秀芹抢回来/.test(r4.cur + r4.q), r4);
  await page.evaluate(() => __lj.game.enterPhase(5, true));
  await step(0.2);
  const x5 = await page.evaluate(() => { const g = __lj.game, b = g.boss, p = g.xq && g.xq.root.position; return { hp: b.hp, max: b.maxHp, xq: !!g.xq, at: p && [+p.x.toFixed(1), +p.z.toFixed(1)], inScene: !!(g.xq && g.xq.root.parent), line: document.getElementById('dialog').textContent }; });
  check('改写结局的决战：秀芹绑在院子里的木桩上，山本满血，开场台词拿秀芹要挟', x5.xq && x5.inScene && x5.hp === x5.max && /你的女人/.test(x5.line), x5);
  await step(6, true);
  await shot(page, 'story-rescue-boss.png');
  await page.evaluate(() => { const g = __lj.game; g.hurtUnit(g.boss, 99999); });
  await step(1.0, true);
  const free = await page.evaluate(() => ({ cast: __lj.game.cast.length, line: document.getElementById('dialog').textContent }));
  await shot(page, 'story-rescue-free.png');
  await step(10);
  const r2 = await page.evaluate(() => ({ state: __lj.app.state, title: document.querySelector('#result .title2').textContent, stats: document.getElementById('result').textContent }));
  check('打赢后给秀芹松绑（木桩留下、秀芹站起来），结算标题“秀芹也救回来了”，写“结局 救下秀芹（改写）”', free.cast === 2 && /秀芹/.test(free.line) && r2.state === 'result' && /秀芹也救回来了/.test(r2.title) && /结局救下秀芹（改写）/.test(r2.stats), { free, r2 });

  // ---------- 从第四、五阶段直接开局时沿用上次的结局 ----------
  const mem = await page.evaluate(() => {
    const a = __lj.app, out = {};
    a.toMenu(); a.s.startPhase = 4; a.start(false); __lj.step(5, false);
    out.rescue = { ending: a.game.flags.ending, tower: a.game.world.tower.alive };
    localStorage.setItem('lj_campaign_v1_ending_pingan', JSON.stringify('classic'));
    a.toMenu(); a.start(false); __lj.step(5, false);
    out.classic = { ending: a.game.flags.ending, tower: a.game.world.tower.alive, raw: localStorage.getItem('lj_campaign_v1_ending_pingan') };
    localStorage.removeItem('lj_campaign_v1_ending_pingan');
    a.toMenu(); a.start(false); __lj.step(5, false);
    out.none = { ending: a.game.flags.ending, tower: a.game.world.tower.alive };
    a.toMenu(); a.s.startPhase = 1; a.start(false); __lj.step(5, false);
    out.p1 = { ending: a.game.flags.ending, tower: a.game.world.tower.alive };
    return out;
  });
  check('从第四阶段直接开局：沿用上次结局（救人＝城楼还在，原作＝城楼已塌，没打过按原作）；从头开局不带结局', mem.rescue.ending === 'rescue' && mem.rescue.tower && mem.classic.ending === 'classic' && !mem.classic.tower && mem.none.ending === 'classic' && !mem.none.tower && mem.p1.ending === '' && mem.p1.tower, mem);

  check('全程没有报错', !errors.length, errors);
  require('fs').writeFileSync(require('path').join(__dirname, 'out-story.json'), JSON.stringify({ at: new Date().toISOString(), passed: out.filter((c) => c.ok).length, total: out.length, checks: out, errors }, null, 1));
  console.log(`${out.filter((c) => c.ok).length}/${out.length} passed`);
  await browser.close();
  process.exit(out.every((c) => c.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

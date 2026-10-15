// 拔刀近战与蹲下 / 趴下（v0.9.0，2026-10-15）：Q 拔刀、左键轻砍连招、按住蓄力重砍破防、右键格挡与弹开、Boss 拼刀；
// C 蹲、Z 趴、跳 / Shift 站起来，姿势改变挨枪高度、移动速度、镜头高度和手榴弹破片；骑兵连技能已去掉。
// 真实键盘 / 鼠标事件 + 手动步进（平安县城第一阶段的空场地，第五阶段山本）。
const { open, start, shot } = require('./lib.cjs');
const out = [];
const check = (name, ok, detail) => { out.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(detail))); };

(async () => {
  const { browser, page, errors } = await open({ ch: 'pingan' });
  await page.evaluate(() => { __lj.manual(true); __lj.app.s.view = 0; });
  await start(page);
  const step = (n) => page.evaluate((k) => __lj.step(k, true), n);
  const hold = async (key, n) => { await page.keyboard.down(key); await step(n); await page.keyboard.up(key); await step(2); };
  const tap = async (key, n = 2) => { await page.keyboard.press(key); await step(n); };
  // 截图前清掉开局 / 复活的无敌闪烁，免得正好截到主角隐藏的那一帧
  const snap = async (name) => { await page.evaluate(() => { __lj.game.hero.inv = 0; __lj.step(2, true); }); await shot(page, name); };
  // 干净场地：清掉敌人和定时台词；主角放到 (0, 80) 面朝 -z
  const clean = (phase = 1, view = 0) => page.evaluate(([ph, v]) => {
    const g = __lj.game; g.reset(ph, false);
    for (const e of g.enemies) if (e.type !== 'boss') { e.alive = false; e.deadT = 9; }
    g.timers.length = 0; g.cut = 0; g.scn = null; g.flags.counter = 1; g.flags.nA = 1; g.flags.nB = 1; g.flags.p1done = 1;
    g.app.s.view = v; g.setView(v); g.place(g.hero, 0, 80); g.cam.yaw = 0; g.cam.pitch = 0; g.hero.yaw = 0;
    __lj.app.ui.clearTransient(); __lj.step(6, true);
  }, [phase, view]);
  // 在主角正前方 d 米放一个敌人（站着不动、不开枪）
  const foe = (type, d, side = 0, o = {}) => page.evaluate(([t, dd, sx, oo]) => {
    const g = __lj.game, h = g.hero;
    const e = g.addUnit('enemy', t, h.x + sx, h.z - dd, Object.assign({ group: 'Q', hold: true, wake: 0 }, oo));
    e.active = true; e.stT = 99; e.yaw = 0; g.flags.qaFoe = e; return { hp: e.hp };
  }, [type, d, side, o]);
  const st = () => page.evaluate(() => { const g = __lj.game, h = g.hero, c = g.camera.position, e = g.flags.qaFoe; return { blade: h.blade, bladeK: h.bladeK, atk: h.atk && h.atk.kind, combo: h.combo, block: h.block, stance: h.stance, crouchK: h.crouchK, proneK: h.proneK, x: h.x, y: h.y, z: h.z, hp: h.hp, camY: c.y, top: g.heroTop(), stats: { cuts: g.stats.cuts, parry: g.stats.parry, blocks: g.stats.blocks, clash: g.stats.clash }, foe: e ? { hp: e.hp, alive: e.alive, stag: e.stagT || 0, state: e.state } : null }; });

  // ---------- 拔刀 / 收刀 ----------
  await clean();
  await tap('KeyQ', 20);
  let s = await st();
  const ui1 = await page.evaluate(() => ({ chips: [...document.querySelectorAll('#skills div')].map((d) => d.textContent), hint: document.getElementById('keyhint').textContent, sword: __lj.game.sword.visible }));
  check('Q 拔刀：刀在手，模型上的刀显示，状态条“Q 收刀”“左键 大刀”，底部提示讲挥刀 / 格挡', s.blade && s.bladeK > 0.9 && ui1.sword && /^Q收刀/.test(ui1.chips[2]) && /^左键大刀/.test(ui1.chips[0]) && /格挡/.test(ui1.hint), ui1);
  await page.keyboard.down('KeyJ'); await step(3); await page.keyboard.up('KeyJ'); await step(30);
  const mag = await page.evaluate(() => __lj.game.hero.mag);
  check('刀在手时按开火不开枪（弹匣不少）', mag === 20, { mag });
  await page.evaluate(() => { const g = __lj.game; g.app.s.view = 1; g.setView(1); __lj.step(4, true); });
  const fpv = await page.evaluate(() => ({ sword: __lj.game.viewSword.visible, gun: __lj.game.viewGun.group.visible }));
  check('第一人称拔刀：画面里换成大刀、枪收起来', fpv.sword && !fpv.gun, fpv);
  await tap('KeyQ', 20);
  const fpv2 = await page.evaluate(() => ({ sword: __lj.game.viewSword.visible, gun: __lj.game.viewGun.group.visible, blade: __lj.game.hero.blade }));
  check('再按 Q 收刀：换回枪', !fpv2.blade && !fpv2.sword && fpv2.gun, fpv2);

  // ---------- 轻砍 ----------
  await clean();
  await tap('KeyQ', 20);
  await foe('rifle', 1.8);
  await page.mouse.move(640, 360);
  await page.evaluate(() => { const i = __lj.game.input; i.key('KeyJ', true, false); });
  await step(3);
  await page.evaluate(() => { const i = __lj.game.input; i.key('KeyJ', false, false); });
  await step(30);
  s = await st();
  check('轻砍：正前方 1.8 米的步兵（2 血）一刀倒', s.foe && !s.foe.alive && s.stats.cuts === 1, s.foe);
  await foe('rifle', 1.8, 0, { yaw: 0 });
  await page.evaluate(() => { const g = __lj.game, e = g.flags.qaFoe; g.place(e, g.hero.x, g.hero.z + 1.8); });
  await page.evaluate(() => { const i = __lj.game.input; i.key('KeyJ', true, false); }); await step(3);
  await page.evaluate(() => { const i = __lj.game.input; i.key('KeyJ', false, false); }); await step(30);
  s = await st();
  check('轻砍砍不到身后的敌人', s.foe && s.foe.alive && s.foe.hp === 2, s.foe);
  // 连招：挥刀途中再按，接下一刀，三刀一套
  await clean(); await tap('KeyQ', 20);
  const combo = await page.evaluate(() => {
    const g = __lj.game, i = g.input, seen = [];
    const press = () => { i.key('KeyJ', true, false); __lj.step(2, false); i.key('KeyJ', false, false); };
    press();
    for (let f = 0; f < 120; f++) { __lj.step(1, false); if (g.hero.atk && !seen.includes(g.hero.combo + ':' + Math.floor(f / 4))) { if (!seen.length || seen[seen.length - 1].split(':')[0] !== String(g.hero.combo)) seen.push(g.hero.combo + ':' + Math.floor(f / 4)); } if (f === 14 || f === 38) press(); }
    return seen.map((x) => +x.split(':')[0]);
  });
  check('连招：挥刀途中再按两下，依次出第 1、2、3 刀', combo.join(',') === '0,1,2', { combo });

  // ---------- 重砍破防、军官格挡 ----------
  await clean(); await tap('KeyQ', 20);
  await foe('elite', 2.0);
  await page.evaluate(() => { const i = __lj.game.input; i.key('KeyJ', true, false); });
  await step(30);   // 按住半秒：蓄力
  const charging = await page.evaluate(() => ({ charge: __lj.game.hero.charge, chip: document.querySelector('#skills div').textContent }));
  await page.evaluate(() => { const i = __lj.game.input; i.key('KeyJ', false, false); });
  await step(40);
  s = await st();
  check('按住左键蓄力（状态条显示“蓄力”），松手重砍：精锐（7 血）掉 5 血并踉跄', charging.charge > 0.3 && /蓄力/.test(charging.chip) && s.foe.hp === 2 && s.foe.stag > 0, { charging, foe: s.foe });
  // 军官正对着时，轻砍有时被格开；重砍一定破防
  const guard = await page.evaluate(() => {
    const g = __lj.game, h = g.hero, res = { blocked: 0, hit: 0 };
    for (let k = 0; k < 40; k++) {
      const e = g.addUnit('enemy', 'officer', h.x, h.z - 2, { group: 'Q', hold: true }); e.active = true; e.yaw = Math.PI; e.stT = 99;
      const hp0 = e.hp; g.meleeStrike({ kind: 'light' }); if (e.hp === hp0) res.blocked++; else res.hit++;
      e.alive = false; e.deadT = 9; h.stagger = 0;
    }
    const e = g.addUnit('enemy', 'officer', h.x, h.z - 2, { group: 'Q', hold: true }); e.active = true; e.yaw = Math.PI; e.stT = 99;
    let heavyAll = true;
    for (let k = 0; k < 10; k++) { e.hp = 5; e.alive = true; e.stagT = 0; g.meleeStrike({ kind: 'heavy' }); if (e.hp !== 0) heavyAll = false; }
    e.alive = false;
    return { ...res, heavyAll };
  });
  check('军官正对着时会格开一部分轻砍（约三成），重砍每次都破防砍中', guard.blocked >= 5 && guard.blocked <= 25 && guard.heavyAll, guard);

  // ---------- 格挡与弹开 ----------
  // 军官贴脸砍一刀：mode = 'block'（早早按住格挡）/ 'parry'（刀落下前约 0.1 秒才按）/ 'none'（不挡）
  const officerSlash = (mode) => page.evaluate((md) => {
    const g = __lj.game, h = g.hero, i = g.input;
    const e = g.addUnit('enemy', 'officer', h.x, h.z - 1.6, { group: 'Q' }); e.active = true; e.yaw = Math.PI; e.target = h; e.think = 9; e.stT = 99; g.flags.qaFoe = e;
    const hp0 = h.hp; h.inv = 0;
    if (md === 'block') { i.src.rmb = true; i._sync(); __lj.step(30, false); }
    e.stT = 0;
    let downAt = -1;
    for (let f = 0; f < 90; f++) {
      if (e.slash >= 0 && downAt < 0) downAt = f;
      if (md === 'parry' && downAt >= 0 && f === downAt + 8) { i.src.rmb = true; i._sync(); }
      __lj.step(1, false);
      if (downAt >= 0 && f > downAt + 30) break;
    }
    i.src.rmb = false; i._sync(); __lj.step(2, false);
    const r = { hpLost: hp0 - h.hp, stag: e.stagT || 0, parry: g.stats.parry, blocks: g.stats.blocks };
    e.alive = false; e.deadT = 9;
    return r;
  }, mode);
  await clean(); await tap('KeyQ', 20);
  const bl = await officerSlash('block');
  check('右键按住格挡：军官的刀砍不掉血，算一次格挡，不是弹开', bl.hpLost === 0 && bl.blocks === 1 && bl.parry === 0, bl);
  await clean(); await tap('KeyQ', 20);
  const pr = await officerSlash('parry');
  check('刀到的一瞬间按下格挡＝弹开：不掉血，军官踉跄', pr.hpLost === 0 && pr.parry === 1 && pr.stag > 0.5, pr);
  await clean(); await tap('KeyQ', 20);
  const nb = await officerSlash('none');
  check('不格挡就挨刀（掉 1 血）', nb.hpLost === 1, nb);

  // ---------- Boss 拼刀（山本突进，第五阶段） ----------
  await clean(5);
  const boss = await page.evaluate(() => {
    const g = __lj.game, b = g.boss, h = g.hero, i = g.input;
    for (const e of g.enemies) if (e !== b) { e.alive = false; e.deadT = 9; }
    b.active = true; g.place(h, b.x, b.z + 9); h.yaw = 0; g.cam.yaw = 0;
    g.toggleBlade(); __lj.step(20, false);
    const bx = b.x, bz = b.z;
    const run = (pre) => {
      b.state = 'walk'; b.cd = 99; b.hp = 200; h.hp = h.maxHp; h.inv = 0; h.stagger = 0; g.place(b, bx, bz); g.place(h, bx, bz + 9); g.cam.yaw = 0; h.yaw = 0;
      g.stats.clash = 0; g.stats.blocks = 0;
      b.state = 'dashTele'; b.stT = 0.4; b.dx = 0; b.dz = 1; b.dashLen = 12; b.hitDone = false; b.yaw = 0;
      let pressed = false;
      for (let f = 0; f < 120; f++) {
        const d = Math.hypot(h.x - b.x, h.z - b.z);
        if (!pressed && b.state === 'dash' && d < 1.7 + 27 * pre) { i.src.rmb = true; i._sync(); pressed = true; }
        __lj.step(1, false);
        if (b.hitDone) break;
      }
      __lj.step(2, false);
      const r = { state: b.state, stT: +(b.stT || 0).toFixed(2), clash: g.stats.clash, blocks: g.stats.blocks, hp: h.hp, max: h.maxHp };
      i.src.rmb = false; i._sync(); __lj.step(30, false); h.stagger = 0;
      return r;
    };
    return { parry: run(0.1), block: run(0.6) };
  });
  check('山本突进：刀到前一瞬间格挡＝拼刀，山本硬直 2.8 秒', boss.parry.clash === 1 && boss.parry.state === 'stun' && boss.parry.hp === boss.parry.max, boss.parry);
  check('山本突进：早早举刀格挡＝挡住不掉血、被震退，不算拼刀', boss.block.clash === 0 && boss.block.blocks === 1 && boss.block.hp === boss.block.max, boss.block);

  // ---------- 蹲下 / 趴下 ----------
  await clean();
  const s0 = await st();
  await tap('KeyC', 30);
  const s1 = await st();
  check('C 蹲下：身高 2.05→1.4，镜头低约 0.5 米', s1.stance === 1 && Math.abs(s1.top - 1.4) < 0.02 && s0.camY - s1.camY > 0.4, { top: s1.top, cam: [s0.camY, s1.camY] });
  await tap('KeyC', 30);
  check('再按 C 站起来', (await st()).stance === 0, null);
  await tap('KeyZ', 50);
  const s2 = await st();
  check('Z 趴下：身高约 0.62，镜头低约 1.2 米', s2.stance === 2 && Math.abs(s2.top - 0.62) < 0.03 && s0.camY - s2.camY > 1.0, { top: s2.top, cam: [s0.camY, s2.camY] });
  await tap('Space', 40);
  const s3 = await st();
  check('趴着按空格是站起来，不起跳', s3.stance === 0 && s3.y < 0.05, s3);
  // 速度
  const speed = async (pre) => { await clean(); for (const k of pre) await tap(k, 40); const a = await st(); await hold('KeyW', 30); const b = await st(); return Math.hypot(b.x - a.x, b.z - a.z); };
  const vw = await speed([]), vc = await speed(['KeyC']), vp = await speed(['KeyZ']);
  check('蹲着走约站着的 0.55 倍、趴着爬约 0.25 倍', Math.abs(vc / vw - 0.55) < 0.06 && Math.abs(vp / vw - 0.25) < 0.05, { walk: vw.toFixed(2), crouch: vc.toFixed(2), prone: vp.toFixed(2) });
  // 蹲着按 Shift + W：站起来跑
  await clean(); await tap('KeyC', 30);
  await page.keyboard.down('ShiftLeft'); await hold('KeyW', 20); await page.keyboard.up('ShiftLeft'); await step(2);
  check('蹲着按 Shift 往前：站起来跑', (await st()).stance === 0, null);
  // 挨枪高度：1.7 米高的子弹打站着的人，打不到蹲着 / 趴着的
  const shotAt = (stanceKey, y) => page.evaluate(([k, yy]) => {
    const g = __lj.game, h = g.hero; h.inv = 0; const hp0 = h.hp;
    g.fireBullet(1, h.x, h.y + yy, h.z - 20, h.x, h.y + yy, h.z, 1, 60, null);
    __lj.step(30, false);
    return hp0 - h.hp;
  }, [stanceKey, y]);
  await clean(); const lostStand = await shotAt('', 1.7);
  await clean(); await tap('KeyC', 30); const lostCrouch = await shotAt('C', 1.7);
  await clean(); await tap('KeyZ', 50); const lostProne = await shotAt('Z', 0.9);
  await clean(); await tap('KeyZ', 50); const lostProneLow = await shotAt('Z', 0.3);
  check('1.7 米高的子弹打中站着的、打不中蹲着的；0.9 米的打不中趴着的，贴地 0.3 米的照样打中', lostStand === 1 && lostCrouch === 0 && lostProne === 0 && lostProneLow === 1, { lostStand, lostCrouch, lostProne, lostProneLow });
  // 敌人瞄蹲着、趴着的人瞄得更低
  const aimYs = await page.evaluate(() => { const g = __lj.game, h = g.hero, r = []; for (const [c, p] of [[0, 0], [1, 0], [0, 1]]) { h.crouchK = c; h.proneK = p; r.push(+(g.aimY(h) - h.y).toFixed(2)); } h.crouchK = 0; h.proneK = 1; return r; });
  check('敌人瞄主角胸口：站 1.1、蹲 0.75、趴 0.3 米', aimYs.join(',') === '1.1,0.75,0.3', aimYs);
  // 手榴弹破片：3 米外爆炸，站着挨炸、趴着没事
  const blastAt = (key) => page.evaluate(() => { const g = __lj.game, h = g.hero; h.inv = 0; const hp0 = h.hp; g.blast(h.x + 3, h.z, 3.8, 0, 1); return hp0 - h.hp; });
  await clean(); const bStand = await blastAt();
  await clean(); await tap('KeyZ', 50); const bProne = await blastAt();
  check('3 米外的手榴弹：站着掉 2 血，趴着躲过破片', bStand === 2 && bProne === 0, { bStand, bProne });
  // 趴下时第三人称模型放倒、枪口在低处
  await clean(); await tap('KeyZ', 50);
  await page.evaluate(() => { __lj.game.cam.pitch = -0.05; __lj.step(4, true); });
  const pose = await page.evaluate(() => { const g = __lj.game, h = g.hero; g.poseHero(0); const v = new (g.camera.position.constructor)(); h.model.armR.updateWorldMatrix(true, false); v.set(0, -h.model.muzzle, 0).applyMatrix4(h.model.armR.matrixWorld); return { rotX: +h.model.root.rotation.x.toFixed(2), muzzleY: +(v.y - h.y).toFixed(2), ahead: +(-(v.z - h.z)).toFixed(2) }; });
  check('趴下：模型向前放倒，枪口离地不到 0.6 米、在身前', pose.rotX < -1.4 && pose.muzzleY < 0.6 && pose.ahead > 0.3, pose);
  await snap('melee-prone-tp.png');
  await page.evaluate(() => { const g = __lj.game; g.app.s.view = 1; g.setView(1); __lj.step(6, true); });
  await snap('melee-prone-fp.png');
  await clean(); await tap('KeyC', 30); await snap('melee-crouch-tp.png');
  await clean(); await tap('KeyQ', 20);
  await page.evaluate(() => { const i = __lj.game.input; i.key('KeyJ', true, false); __lj.step(5, true); i.key('KeyJ', false, false); __lj.step(9, true); });
  await snap('melee-swing-tp.png');
  await page.evaluate(() => { const g = __lj.game, i = g.input; __lj.step(30, false); i.src.rmb = true; i._sync(); __lj.step(6, true); });
  await snap('melee-block-tp.png');
  await page.evaluate(() => { const g = __lj.game, i = g.input; g.app.s.view = 1; g.setView(1); __lj.step(4, true); });
  await snap('melee-block-fp.png');
  await page.evaluate(() => { const g = __lj.game, i = g.input; i.src.rmb = false; i._sync(); __lj.step(4, true); i.key('KeyJ', true, false); __lj.step(4, true); i.key('KeyJ', false, false); __lj.step(10, true); });
  await snap('melee-swing-fp.png');

  // ---------- 骑兵连技能去掉了 ----------
  await clean();
  const cav = await page.evaluate(() => {
    const g = __lj.game, i = g.input;
    i.key('KeyE', true, false); i.key('KeyE', false, false); i.key('KeyN', true, false); i.key('KeyN', false, false); __lj.step(10, false);
    return { btn: !!document.getElementById('act-cav'), chips: [...document.querySelectorAll('#skills div')].map((d) => d.textContent), gameKey: i.isGameKey('KeyE'), hasFn: typeof g.callCavalry };
  });
  check('骑兵连技能去掉：没有按钮和状态条，E / N 不是游戏键', !cav.btn && !cav.chips.some((c) => /骑兵/.test(c)) && !cav.gameKey && cav.hasFn === 'undefined', cav);

  // ---------- 触屏：拔刀键、姿势键、按住格挡 ----------
  await page.evaluate(() => { const a = __lj.app; a.setMode && a.setMode('touch'); });
  const touch = await page.evaluate(() => {
    const g = __lj.game, $ = (id) => document.getElementById(id);
    const tapBtn = (id) => { const b = $(id), r = b.getBoundingClientRect(), o = { pointerId: 7, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, pointerType: 'touch', bubbles: true }; b.dispatchEvent(new PointerEvent('pointerdown', o)); __lj.step(2, false); b.dispatchEvent(new PointerEvent('pointerup', o)); __lj.step(20, false); };
    const res = {};
    tapBtn('act-stance'); res.s1 = g.hero.stance; tapBtn('act-stance'); res.s2 = g.hero.stance; tapBtn('act-stance'); res.s3 = g.hero.stance;
    tapBtn('act-blade'); res.blade = g.hero.blade; res.fireLabel = $('act-fire').querySelector('span').textContent; res.adsLabel = $('act-ads').querySelector('span').textContent;
    const b = $('act-ads'), r = b.getBoundingClientRect(), o = { pointerId: 8, clientX: r.x + 5, clientY: r.y + 5, pointerType: 'touch', bubbles: true };
    b.dispatchEvent(new PointerEvent('pointerdown', o)); __lj.step(4, false); res.block = g.hero.block; b.dispatchEvent(new PointerEvent('pointerup', o)); __lj.step(4, false); res.after = g.hero.block; res.ads = g.hero.ads;
    return res;
  });
  check('触屏：姿势键站→蹲→趴→站，拔刀键拔刀后开火键叫“挥刀”、开镜键叫“格挡”，按住格挡、松开放下', touch.s1 === 1 && touch.s2 === 2 && touch.s3 === 0 && touch.blade && touch.fireLabel === '挥刀' && touch.adsLabel === '格挡' && touch.block && !touch.after && !touch.ads, touch);

  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  require('fs').writeFileSync(require('path').join(__dirname, 'out-melee.json'), JSON.stringify({ at: new Date().toISOString(), results: out, errors }, null, 1));
  const bad = out.filter((r) => !r.ok).length;
  console.log(`\n${out.length - bad}/${out.length} 通过`);
  await browser.close();
  process.exit(bad || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

// 选项与规则：每个选项的切换/保存/实际效果，命数与耐久，演示模式，暂停与重开的声音，起始阶段与继续，核心失败条件
const { open, shot } = require('./lib.cjs');
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const step = (page, n) => page.evaluate((k) => __lj.step(k, true), n);

// 朝主角打一发敌方子弹（走正常的子弹与受击流程）
const shootHero = (page) => page.evaluate(() => { const g = __lj.game, h = g.hero; g.fireBullet(1, h.x + 3, 1.2, h.z, h.x, 1.2, h.z, 1, 34, null); __lj.step(12, false); return { hp: h.hp, alive: h.alive, inv: h.inv }; });
const clean = (page, phase = 1) => page.evaluate((p) => { const g = __lj.game; g.reset(p, false); for (const e of g.enemies) { e.alive = false; e.deadT = 9; } g.timers.length = 0; g.place(g.hero, 0, 80); __lj.step(3, false); }, phase);

(async () => {
  const { browser, ctx, page, errors } = await open();
  // ---------- 主菜单每个选项：点一下切到下一个值，显示同步，刷新后保留 ----------
  const opts = ['startPhase', 'lives', 'armor', 'view', 'quality', 'volume', 'danmaku', 'touchKeys', 'fps'];
  const before = await page.evaluate(() => Object.assign({}, __lj.app.s));
  for (const k of opts) {
    const r = await page.evaluate((key) => { const b = document.querySelector(`#menu .btn[data-opt="${key}"]`); const t0 = b.querySelector('.ov').textContent; b.click(); return { t0, t1: b.querySelector('.ov').textContent, v: __lj.app.s[key], rect: b.getBoundingClientRect().height }; }, k);
    check(`选项「${k}」点击切换且显示更新`, r.t0 !== r.t1 && r.v !== before[k], r);
  }
  await page.evaluate(() => document.querySelector('#menu .btn[data-opt="demo"]').click());
  const saved = await page.evaluate(() => Object.assign({ demo: __lj.app.demo }, __lj.app.s));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__lj && document.getElementById('loading').hidden);
  await page.evaluate(() => { __lj.app.noAutoPause = true; });
  const after = await page.evaluate(() => Object.assign({ demo: __lj.app.demo }, __lj.app.s));
  check('刷新后设置保留', opts.every((k) => after[k] === saved[k]), { saved, after });
  check('演示模式不保存：刷新后回到关', saved.demo === true && after.demo === false, { saved: saved.demo, after: after.demo });
  // 恢复默认
  await page.evaluate(() => { const a = __lj.app; Object.assign(a.s, { startPhase: 1, lives: 'inf', armor: 'std', view: 0, quality: 'auto', volume: 80, danmaku: true, touchKeys: 'auto', fps: false, mode: 'auto' }); a.save(); a.applyQuality(); a.applyMode(); a.audio.setVolume(0.8); });

  // ---------- 声音：开局、暂停冻结、继续续播、暂停后重开仍有声 ----------
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  const a0 = await page.evaluate(() => { const au = __lj.app.audio; window.__an = au.ctx.createAnalyser(); au.comp.connect(window.__an); return { state: au.ctx.state, t: au.ctx.currentTime }; });
  const rms = () => page.evaluate(() => { const d = new Float32Array(window.__an.fftSize); window.__an.getFloatTimeDomainData(d); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); });
  let peak = 0;
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(100); peak = Math.max(peak, await rms()); }
  check('开局后音频在跑且有声音输出', a0.state === 'running' && peak > 0.002, { a0, peak });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const p1 = await page.evaluate(() => ({ state: __lj.app.state, ctx: __lj.app.audio.ctx.state, t: __lj.app.audio.ctx.currentTime }));
  await page.waitForTimeout(500);
  const p2 = await page.evaluate(() => ({ ctx: __lj.app.audio.ctx.state, t: __lj.app.audio.ctx.currentTime }));
  check('暂停：音频时钟冻结', p1.state === 'pause' && p1.ctx === 'suspended' && Math.abs(p2.t - p1.t) < 0.02, { p1, p2 });
  // 暂停菜单里调音量、切画质不应让音乐恢复
  await page.evaluate(() => { document.querySelector('#pause .btn[data-opt="volume"]').click(); document.querySelector('#pause .btn[data-opt="quality"]').click(); });
  await page.waitForTimeout(300);
  const p3 = await page.evaluate(() => ({ ctx: __lj.app.audio.ctx.state, vol: __lj.app.s.volume, gain: __lj.app.audio.master.gain.value }));
  check('暂停中调音量/画质不会恢复音乐，音量值生效', p3.ctx === 'suspended' && Math.abs(p3.gain - p3.vol / 100) < 0.001, p3);
  await page.evaluate(() => { const a = __lj.app; a.s.volume = 80; a.s.quality = 'auto'; a.save(); a.audio.setVolume(0.8); a.applyQuality(); });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const p4 = await page.evaluate(() => ({ state: __lj.app.state, ctx: __lj.app.audio.ctx.state, t: __lj.app.audio.ctx.currentTime }));
  check('继续：音频从暂停处续播', p4.state === 'play' && p4.ctx === 'running' && p4.t > p2.t + 0.2, p4);
  for (const [label, sel] of [['重新开始', 2], ['从本阶段重来', 1]]) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.evaluate((i) => document.querySelectorAll('#pause .col')[0].querySelectorAll('.btn')[i].click(), sel);
    await page.waitForTimeout(300);
    const r0 = await page.evaluate(() => ({ state: __lj.app.state, ctx: __lj.app.audio.ctx.state, t: __lj.app.audio.ctx.currentTime, gt: __lj.game.t }));
    let pk = 0;
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(100); pk = Math.max(pk, await rms()); }
    const r1 = await page.evaluate(() => __lj.app.audio.ctx.currentTime);
    check(`暂停后点「${label}」：音频恢复、时钟在走、出口有声音`, r0.state === 'play' && r0.ctx === 'running' && r1 > r0.t + 0.8 && pk > 0.002, { r0, r1, pk });
  }
  // 切后台（visibilitychange 模拟锁屏）自动暂停
  await page.evaluate(() => { __lj.app.noAutoPause = false; Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  const v1 = await page.evaluate(() => ({ state: __lj.app.state, ctx: __lj.app.audio.ctx.state }));
  check('切到后台自动暂停并冻结声音（visibilitychange 模拟）', v1.state === 'pause' && v1.ctx === 'suspended', v1);
  await page.evaluate(() => { delete document.hidden; __lj.app.noAutoPause = true; });
  // 暂停 → 返回主菜单 → 再开始，仍有声音
  await page.evaluate(() => document.querySelectorAll('#pause .col')[0].querySelectorAll('.btn')[3].click());
  await page.waitForTimeout(200);
  const m0 = await page.evaluate(() => ({ state: __lj.app.state, ctx: __lj.app.audio.ctx.state }));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  let pk2 = 0;
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(100); pk2 = Math.max(pk2, await rms()); }
  check('暂停后返回主菜单再开局：有声音', m0.state === 'menu' && m0.ctx === 'running' && pk2 > 0.002, { m0, pk2 });

  // ---------- 耐久与命数 ----------
  await page.evaluate(() => __lj.manual(true));
  for (const [armor, max] of [['std', 5], ['easy', 8], ['one', 1]]) {
    await page.evaluate((a) => { __lj.app.s.armor = a; }, armor);
    await clean(page);
    const hp0 = await page.evaluate(() => [__lj.game.hero.hp, __lj.game.hero.maxHp, document.querySelectorAll('#hp-pips i').length]);
    await step(page, 80);   // 等开局保护结束
    const h1 = await shootHero(page);
    const pips = await page.evaluate(() => document.querySelectorAll('#hp-pips i:not(.off)').length);
    if (max > 1) {
      const h2 = await shootHero(page);   // 无敌期内再中一发不扣
      check(`耐久「${armor}」：${max} 格，中弹扣 1 格，无敌期内不再扣`, hp0[0] === max && hp0[1] === max && h1.hp === max - 1 && h2.hp === max - 1 && h1.inv > 0, { hp0, h1, h2, pips });
    } else {
      check('耐久「一发」：1 格，中弹即倒', hp0[0] === 1 && h1.hp === 0 && !h1.alive, { hp0, h1 });
    }
  }
  // 急救包：满血留在原地，受伤后可捡
  await page.evaluate(() => { __lj.app.s.armor = 'std'; });
  await clean(page);
  const med = await page.evaluate(() => { const g = __lj.game, h = g.hero; const n0 = g.pickups.length; g.spawnMed(h.x, h.z); __lj.step(5, false); const kept = g.pickups.length - n0; h.hp = 2; __lj.step(5, false); return { kept, left: g.pickups.length - n0, hp: h.hp, meds: g.stats.meds }; });
  check('急救包：满血时留在原地，受伤后捡起 +3 格', med.kept === 1 && med.left === 0 && med.hp === 5, med);
  // 无限命：阵亡后从检查点复活、补满、有保护
  await clean(page);
  await step(page, 80);
  const dead = await page.evaluate(() => { const g = __lj.game, h = g.hero; h.hp = 1; g.fireBullet(1, h.x + 3, 1.2, h.z, h.x, 1.2, h.z, 1, 34, null); __lj.step(12, false); const d = { alive: h.alive, deaths: g.stats.deaths }; __lj.step(130, false); return Object.assign(d, { alive2: h.alive, hp: h.hp, inv: h.inv, state: __lj.app.state, lives: g.lives }); });
  check('无限命：阵亡后自动复活、耐久补满、有复活保护', !dead.alive && dead.deaths === 1 && dead.alive2 && dead.hp === 5 && dead.inv > 1 && dead.state === 'play', dead);
  // 连续多次阵亡仍可复活
  const multi = await page.evaluate(() => { const g = __lj.game, h = g.hero; let n = 0; for (let i = 0; i < 4; i++) { h.inv = 0; h.hp = 1; g.fireBullet(1, h.x + 3, 1.2, h.z, h.x, 1.2, h.z, 1, 34, null); __lj.step(12, false); if (!h.alive) n++; __lj.step(130, false); } return { n, alive: h.alive, state: __lj.app.state }; });
  check('无限命：连续阵亡 4 次仍能复活', multi.n === 4 && multi.alive && multi.state === 'play', multi);
  // 经典 3 命：用完进入失败结算
  await page.evaluate(() => { __lj.app.s.lives = '3'; });
  await clean(page);
  await step(page, 80);
  const classic = await page.evaluate(() => { const g = __lj.game, h = g.hero; const lives = [g.lives]; for (let i = 0; i < 3; i++) { h.inv = 0; h.hp = 1; g.fireBullet(1, h.x + 3, 1.2, h.z, h.x, 1.2, h.z, 1, 34, null); __lj.step(12, false); lives.push(g.lives); __lj.step(140, false); } return { lives, state: __lj.app.state, title: document.querySelector('#result .title2').textContent, hud: document.getElementById('lives').textContent }; });
  check('经典 3 命：三次阵亡后进入失败结算', classic.lives.join() === '3,2,1,0' && classic.state === 'result' && /受挫/.test(classic.title), classic);
  await shot(page, 'result-lose.png');
  await page.evaluate(() => { __lj.app.s.lives = 'inf'; __lj.app.toMenu(); });

  // ---------- 演示模式 ----------
  await page.evaluate(() => { __lj.app.demo = true; __lj.app.start(false); });
  await clean(page);
  await step(page, 80);
  const demo = await page.evaluate(() => { const g = __lj.game, h = g.hero; g.fireBullet(1, h.x + 3, 1.2, h.z, h.x, 1.2, h.z, 1, 34, null); __lj.step(12, true); return { hp: h.hp, badge: !document.getElementById('demo-badge').hidden, ring: g.demoRing.visible, flag: g.stats.demo }; });
  check('演示模式：无敌、右上有标识、主角脚下有护罩', demo.hp === 5 && demo.badge && demo.ring && demo.flag, demo);
  const best0 = await page.evaluate(() => { localStorage.setItem('lj_pingan_v1_best', '1'); const g = __lj.game; g.score = 99999; g.finish(true); return { best: localStorage.getItem('lj_pingan_v1_best'), total: document.querySelector('#result .total').textContent }; });
  check('演示局不计最高分并在结算注明', best0.best === '1' && /演示局/.test(best0.total), best0);
  await page.evaluate(() => { __lj.app.demo = false; localStorage.removeItem('lj_pingan_v1_best'); __lj.app.toMenu(); });

  // ---------- 画质 / 帧率 / 弹幕 ----------
  await page.evaluate(() => { __lj.app.start(false); });
  const q = await page.evaluate(() => { const a = __lj.app, out = {}; for (const v of ['high', 'low', 'auto']) { a.s.quality = v; a.applyQuality(); __lj.step(2, true); out[v] = { shadow: a.renderer.shadowMap.enabled, sun: a.game.sun.castShadow, pr: a.renderer.getPixelRatio(), actual: a.actualQuality(), label: document.querySelector('#pause .btn[data-opt="quality"] .ov').textContent }; } return out; });
  check('画质：高＝有阴影，流畅＝关阴影，自动显示当前实际档位', q.high.shadow && q.high.sun && !q.low.shadow && !q.low.sun && /自动（(高|流畅)）/.test(q.auto.label), q);
  const fps = await page.evaluate(() => { const a = __lj.app; a.cycle('fps', 1); __lj.step(40, true); const on = { hidden: document.getElementById('fps').hidden, text: document.getElementById('fps').textContent }; a.cycle('fps', 1); __lj.step(2, true); return { on, offHidden: document.getElementById('fps').hidden }; });
  check('帧率显示：开时角落出现读数，关时消失', !fps.on.hidden && /FPS/.test(fps.on.text) && fps.offHidden, fps);
  const dm = await page.evaluate(() => { const a = __lj.app; a.ui.danmaku(['测试一', '测试二']); const n1 = document.querySelectorAll('#danmaku span').length; a.cycle('danmaku', 1); const n2 = document.querySelectorAll('#danmaku span').length; a.ui.danmaku(['测试三']); const n3 = document.querySelectorAll('#danmaku span').length; a.cycle('danmaku', 1); return { n1, n2, n3 }; });
  check('弹幕：开时出现，关掉立即清空且不再出现', dm.n1 >= 2 && dm.n2 === 0 && dm.n3 === 0, dm);

  // ---------- 起始阶段直达 / 继续 ----------
  for (let p = 1; p <= 5; p++) {
    const r = await page.evaluate((n) => { const a = __lj.app; a.toMenu(); a.s.startPhase = n; a.ui.refresh(); const label = document.querySelector('#menu .btn[data-opt="startPhase"] .ov').textContent; a.start(false); __lj.step(5, true); const g = a.game; return { label, phase: g.phase, gate: g.world.gate.alive, tower: g.world.tower.alive, cannonPlaced: g.cannon.placed, cannonVisible: g.cannon.visible, weapon: g.hero.weapon, boss: !!g.boss, obj: document.getElementById('objective').textContent }; }, p);
    const ok = r.phase === p && r.label.includes(String(p)) && r.gate === (p < 4) && r.tower === (p < 4) && r.cannonPlaced === (p >= 3) && r.boss === (p === 5);
    check(`起始阶段 ${p}：标签、实际启动阶段与场景状态一致`, ok, r);
    if (p === 3) {
      const rs = await page.evaluate(() => { const a = __lj.app; a.pause(); document.querySelectorAll('#pause .col')[0].querySelectorAll('.btn')[2].click(); __lj.step(3, true); return a.game.phase; });
      check('从第 3 阶段开局后「重新开始」仍回到第 3 阶段', rs === 3, { rs });
    }
  }
  const cont = await page.evaluate(() => { const a = __lj.app; a.toMenu(); a.s.startPhase = 1; a.save(); a.start(false); a.game.enterPhase(2, false); __lj.step(3, true); a.toMenu(); const b = a.ui.btnCont; const r = { hidden: b.hidden, text: b.textContent }; b.click(); __lj.step(3, true); r.phase = a.game.phase; return r; });
  check('打到第 2 阶段后主菜单出现「继续 · 第2阶段」并能接着打', !cont.hidden && /第2阶段/.test(cont.text) && cont.phase === 2, cont);

  // ---------- 核心失败条件：炮被打坏，本阶段重来 ----------
  const fail = await page.evaluate(() => { const a = __lj.app, g = a.game; g.reset(2, false); __lj.step(60, false); const z0 = g.cannon.z; g.hurtCannon(999); const broke = !g.cannon.alive; __lj.step(200, false); return { z0, broke, phase: g.phase, alive: g.cannon.alive, hp: g.cannon.hp, z: g.cannon.z, retries: g.stats.retries, state: a.state }; });
  check('无限命下核心失败条件仍有效：意大利炮被打坏后本阶段重来', fail.broke && fail.phase === 2 && fail.alive && fail.hp === 30 && fail.retries === 1 && fail.z > 95 && fail.state === 'play', fail);

  // ---------- 隐私：没有作者网站链接、没有账号表单 ----------
  const priv = await page.evaluate(async () => { const texts = [document.documentElement.outerHTML]; for (const f of ['js/main.js', 'js/ui.js', 'js/game.js', 'js/ai.js', 'js/audio.js', 'js/input.js', 'js/world.js', 'js/models.js', 'js/fx.js', 'js/geo.js', 'js/util.js', 'style.css']) texts.push(await (await fetch(f)).text()); const all = texts.join('\n'); return { site: /zhengxiaohui/i.test(all), form: !!document.querySelector('form, input[type=password], input[type=tel], input[type=email]'), links: [...document.querySelectorAll('a[href]')].map((a) => a.href), urls: [...new Set(all.match(/https?:\/\/[^\s'"`)<]+/g) || [])].filter((u) => !/w3\.org/.test(u)) }; });
  check('隐私：包内没有作者网站地址、账号表单或跳出链接（只允许主动打开作者B站主页）', !priv.site && !priv.form && priv.links.length === 0 && priv.urls.every((u) => /space\.bilibili\.com\/16214353/.test(u)), priv);

  const bad = results.filter((r) => !r.ok);
  for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail)));
  console.log(`\n${results.length - bad.length}/${results.length} 通过`);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  require('fs').writeFileSync(require('path').join(__dirname, 'out-options.json'), JSON.stringify({ at: new Date().toISOString(), results, errors }, null, 1));
  await browser.close();
  process.exit(bad.length || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

// 李家坡自动通关：从指定阶段打到结算，检查流程不软锁、不报错，统计各阶段耗时 / 受击 / 阵亡
// 自动化操作只能验证流程和压力，不能代替真人试玩手感。
// 用法：node ljp-playthrough.cjs [起始阶段] [armor: std|easy|one]；SHOTS=1 时每个阶段开头截图
const { open, shot, start } = require('./lib.cjs');
const startPhase = +(process.argv[2] || 1);
const armor = process.argv[3] || 'std';
const SHOTS = process.env.SHOTS === '1';
const BOT = require('fs').readFileSync(require('path').join(__dirname, 'ljp-bot.browser.js'), 'utf8');

(async () => {
  const { browser, page, errors } = await open({ ch: 'lijiapo' });
  await page.evaluate(([sp, ar]) => { const a = __lj.app; a.s.startPhase = sp; a.s.armor = ar; a.s.view = 0; a.s.lives = 'inf'; }, [startPhase, armor]);
  await page.evaluate(() => __lj.manual(true));
  await start(page);
  await page.evaluate(async () => { window.__W = await import('./js/world-kit.js'); });
  await page.evaluate(async () => { window.__L = (await import('./js/chapters/lijiapo-world.js')).L; });
  await page.addScriptTag({ content: BOT });
  await page.evaluate(() => { window.__bot = window.__installLjpBot(); __lj.manual(true); });
  // 受伤来源统计（按调用栈里的函数名粗分：子弹 / 爆炸 / 刀）
  await page.evaluate(() => {
    const g = __lj.game, orig = g.hurtHero.bind(g); window.__hurt = {};
    g.hurtHero = function (dmg, sx, sz) {
      const before = g.hero.hp;
      orig(dmg, sx, sz);
      if (g.hero.hp < before) { const st = new Error().stack.split(String.fromCharCode(10))[2] || ''; const k = 'p' + g.phase + ':' + (/updateBullets/.test(st) ? 'bullet' : /blast/.test(st) ? 'blast' : /updateEnemy|_c|updateYamazaki/.test(st) ? 'melee' : st.trim().slice(3, 30)); window.__hurt[k] = (window.__hurt[k] || 0) + (before - g.hero.hp); }
    };
  });
  const log = [];
  let last = { phase: startPhase, t: 0, deaths: 0, hurt: 0 };
  let prevPhase = startPhase;
  const t0 = Date.now();
  let done = null, s = null;
  for (let i = 0; i < 6000 && !done; i++) {
    s = await page.evaluate(() => {
      for (let k = 0; k < 15; k++) { try { window.__bot(1 / 60); } catch (e) { return { crash: 'bot: ' + e.stack }; } try { __lj.step(1, false); } catch (e) { return { crash: 'game: ' + e.stack }; } }
      __lj.step(0, true);
      const g = __lj.game, st = g.stats;
      return { state: __lj.app.state, phase: g.phase, sub: g.sub, t: g.t, deaths: st.deaths, hurt: st.hurt, kills: st.kills, hp: g.hero.hp, hx: +g.hero.x.toFixed(1), hz: +g.hero.z.toFixed(1), dug: Math.round(g.world.trench.dug), lit: g.lit ? 1 : 0, digging: g.digging ? 1 : 0, volleys: st.volleys, grenades: g.grenades, bunkers: g.world.bunkers.filter((b) => b.alive).length, ports: g.world.cp.ports.filter((q) => q.alive).length, won: g.flags.won ? 1 : 0, boss: g.boss ? Math.round(g.boss.hp) : null, bstate: g.boss ? g.boss.state : '', deflect: st.deflect, clash: st.clash, enemies: g.enemies.filter((e) => e.alive).length, score: g.score };
    });
    if (s.crash) { console.log("CRASH", s.crash); break; }
    if (s.phase !== prevPhase) {
      log.push({ phase: last.phase, seconds: +(s.t - last.t).toFixed(1), deaths: s.deaths - last.deaths, hurt: s.hurt - last.hurt });
      last = { phase: s.phase, t: s.t, deaths: s.deaths, hurt: s.hurt };
      if (SHOTS) await shot(page, `ljp-play-phase${s.phase}.png`);
      prevPhase = s.phase;
    }
    if (i % 120 === 0) console.log(`t=${s.t.toFixed(0)}s phase=${s.phase}${s.sub ? '/' + s.sub : ''} hero=(${s.hx},${s.hz}) hp=${s.hp} deaths=${s.deaths} hurt=${s.hurt} kills=${s.kills} dug=${s.dug}${s.digging ? '(挖)' : ''}${s.lit ? '(照明)' : ''} volleys=${s.volleys} bunkers=${s.bunkers} ports=${s.ports} enemies=${s.enemies} boss=${s.boss}/${s.bstate} deflect=${s.deflect} clash=${s.clash}`);
    if (s.state === 'result') done = s;
    if (s.t > 1200) { console.log('超时：20 分钟没打完'); break; }
  }
  if (done) log.push({ phase: last.phase, seconds: +(done.t - last.t).toFixed(1), deaths: done.deaths - last.deaths, hurt: done.hurt - last.hurt });
  await page.waitForTimeout(200);
  if (SHOTS) await shot(page, 'ljp-play-result.png');
  const res = await page.evaluate(() => ({ title: document.querySelector('#result .title2').textContent, rank: document.querySelector('#result .rank').textContent, total: document.querySelector('#result .total').textContent, stats: document.querySelector('#result .stats').textContent, hidden: document.getElementById('result').hidden }));
  const voices = await page.evaluate(() => __lj.app.audio.log.filter((x) => x.startsWith('voice:')).map((x) => x.slice(6)));
  const hurtBy = await page.evaluate(() => window.__hurt);
  const out = { at: new Date().toISOString(), startPhase, armor, finished: !!done, gameSeconds: done ? +done.t.toFixed(1) : null, wallSeconds: Math.round((Date.now() - t0) / 1000), phases: log, hurtBy, final: done || s, result: res, voices, errors };
  console.log(JSON.stringify(out, null, 1));
  require('fs').writeFileSync(require('path').join(__dirname, `out-ljp-playthrough-p${startPhase}-${armor}.json`), JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(done && done.won && !errors.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

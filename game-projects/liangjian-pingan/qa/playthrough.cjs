// 自动通关：脚本按键 + 用拖动通道转准星（手动瞄准），从第一阶段打到结算，检查流程不软锁、不报错，并统计各阶段耗时/受击/阵亡
// 这是自动化操作，只用来验证流程和压力大小，不能代替真人试玩手感。
// 用法：node playthrough.cjs [起始阶段] [armor: std|easy|one] ；SHOTS=1 时在关键时刻截图
// ROUTE=rescue 时在城楼抉择处离开炮位冲进城门（改写结局），默认 classic 朝城楼开炮（原作结局）
const { open, shot, start } = require('./lib.cjs');
const startPhase = +(process.argv[2] || 1);
const armor = process.argv[3] || 'std';
const SHOTS = process.env.SHOTS === '1';
const ROUTE = process.env.ROUTE === 'rescue' ? 'rescue' : 'classic';

const BOT = require('fs').readFileSync(require('path').join(__dirname, 'bot.browser.js'), 'utf8');

(async () => {
  const { browser, page, errors } = await open();
  await page.evaluate(([sp, ar]) => { const a = __lj.app; a.s.startPhase = sp; a.s.armor = ar; a.s.view = 0; a.s.lives = 'inf'; }, [startPhase, armor]);
  // 先切到手动步进再开局，保证每次运行的时间线完全一致
  await page.evaluate(() => __lj.manual(true));
  await start(page);
  await page.evaluate(async () => { window.__W = await import('./js/world-kit.js'); });
  await page.evaluate((r) => { window.__route = r; }, ROUTE);
  await page.addScriptTag({ content: BOT });
  await page.evaluate(() => { window.__bot = window.__installBot(); __lj.manual(true); });
  const log = [];
  let last = { phase: startPhase, t: 0, deaths: 0, hurt: 0 };
  let prev = { shells: 0, cav: 0, loot: 0, clash: 0, tower: 0, won: 0, phase: startPhase, genius: 0 };
  const t0 = Date.now();
  let done = null;
  for (let i = 0; i < 4000 && !done; i++) {
    const s = await page.evaluate(() => {
      for (let k = 0; k < 15; k++) { window.__bot(1 / 60); __lj.step(1, false); }
      __lj.step(0, true);
      const g = __lj.game, st = g.stats;
      return { state: __lj.app.state, phase: g.phase, t: g.t, deaths: st.deaths, hurt: st.hurt, shells: st.shells, cav: st.cav, loot: st.loot, clash: st.clash, tower: g.flags.towerDown ? 1 : 0, won: g.flags.won ? 1 : 0, genius: st.genius, kills: st.kills, hp: g.hero.hp, hx: +g.hero.x.toFixed(1), hz: +g.hero.z.toFixed(1), boss: g.boss ? Math.round(g.boss.hp) : null, heads: st.heads, jumps: st.jumps, cannon: Math.round(g.cannon.hp), retries: st.retries, score: g.score, enemies: g.enemies.filter((e) => e.alive).length };
    });
    if (s.phase !== prev.phase) {
      log.push({ phase: last.phase, seconds: +(s.t - last.t).toFixed(1), deaths: s.deaths - last.deaths, hurt: s.hurt - last.hurt });
      last = { phase: s.phase, t: s.t, deaths: s.deaths, hurt: s.hurt };
      if (SHOTS) await shot(page, `play-phase${s.phase}-start.png`);
    }
    if (SHOTS) for (const k of ['shells', 'loot', 'clash', 'tower', 'won', 'genius']) if (s[k] > prev[k] && (k !== 'shells' || s[k] <= 2 || s.tower)) await shot(page, `play-${k}-${s[k]}.png`);
    prev = s;
    if (i % 120 === 0) console.log(`t=${s.t.toFixed(0)}s phase=${s.phase} hero=(${s.hx},${s.hz}) hp=${s.hp} deaths=${s.deaths} hurt=${s.hurt} kills=${s.kills} enemies=${s.enemies} cannon=${s.cannon} boss=${s.boss} retries=${s.retries}`);
    if (s.state === 'result') done = s;
    if (s.t > 900) { console.log('超时：15 分钟没打完'); break; }
  }
  if (done) {
    log.push({ phase: last.phase, seconds: +(done.t - last.t).toFixed(1), deaths: done.deaths - last.deaths, hurt: done.hurt - last.hurt });
    await page.waitForTimeout(200);
    if (SHOTS) await shot(page, 'play-result.png');
  }
  const res = await page.evaluate(() => ({ title: document.querySelector('#result .title2').textContent, rank: document.querySelector('#result .rank').textContent, total: document.querySelector('#result .total').textContent, stats: document.querySelector('#result .stats').textContent, hidden: document.getElementById('result').hidden }));
  const ending = await page.evaluate(() => __lj.game.flags.ending || '');
  const out = { at: new Date().toISOString(), startPhase, armor, route: ROUTE, ending, finished: !!done, gameSeconds: done ? +done.t.toFixed(1) : null, wallSeconds: Math.round((Date.now() - t0) / 1000), phases: log, final: done, result: res, errors };
  console.log(JSON.stringify(out, null, 1));
  require('fs').writeFileSync(require('path').join(__dirname, `out-playthrough-p${startPhase}-${armor}${ROUTE === 'rescue' ? '-rescue' : ''}.json`), JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(done && done.won && !errors.length && (startPhase > 3 || ending === ROUTE) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

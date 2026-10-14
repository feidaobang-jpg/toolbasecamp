// 苍云岭自动通关：从指定阶段打到结算，检查流程不软锁、不报错，统计各阶段耗时 / 受击 / 阵亡与结局线
// 自动化操作只能验证流程和压力，不能代替真人试玩手感。
// 用法：ROUTE=hit|hit2|miss node cy-playthrough.cjs [起始阶段] [armor: std|easy|one]；SHOTS=1 时关键时刻截图
const { open, shot, start } = require('./lib.cjs');
const startPhase = +(process.argv[2] || 1);
const armor = process.argv[3] || 'std';
const SHOTS = process.env.SHOTS === '1';
const ROUTE = ['hit', 'hit2', 'miss'].includes(process.env.ROUTE) ? process.env.ROUTE : 'hit';
const BOT = require('fs').readFileSync(require('path').join(__dirname, 'cy-bot.browser.js'), 'utf8');

(async () => {
  const { browser, page, errors } = await open({ ch: 'cangyunling' });
  await page.evaluate(([sp, ar]) => { const a = __lj.app; a.s.startPhase = sp; a.s.armor = ar; a.s.view = 0; a.s.lives = 'inf'; }, [startPhase, armor]);
  await page.evaluate(() => __lj.manual(true));
  await start(page);
  await page.evaluate(async () => { window.__W = await import('./js/world-kit.js'); });
  await page.evaluate((r) => { window.__route = r; }, ROUTE);
  await page.addScriptTag({ content: BOT });
  await page.evaluate(() => { window.__bot = window.__installCyBot(); __lj.manual(true); });
  const log = [];
  let last = { phase: startPhase, t: 0, deaths: 0, hurt: 0 };
  let prevPhase = startPhase, prevShots = 0;
  const t0 = Date.now();
  let done = null, s = null;
  for (let i = 0; i < 6000 && !done; i++) {
    s = await page.evaluate(() => {
      for (let k = 0; k < 15; k++) { window.__bot(1 / 60); __lj.step(1, false); }
      __lj.step(0, true);
      const g = __lj.game, st = g.stats;
      return { state: __lj.app.state, phase: g.phase, sub: g.sub, t: g.t, deaths: st.deaths, hurt: st.hurt, kills: st.kills, hp: g.hero.hp, hx: +g.hero.x.toFixed(1), hz: +g.hero.z.toFixed(1), prog: Math.round(g.prog), shots: g.shots, line: g.flags.line, won: g.flags.won ? 1 : 0, retries: st.retries, tongueFail: st.tongueFail, boss: g.boss ? Math.round(g.boss.hp) : null, cz: +g.cannon.z.toFixed(1), enemies: g.enemies.filter((e) => e.alive).length, score: g.score };
    });
    if (s.phase !== prevPhase) {
      log.push({ phase: last.phase, seconds: +(s.t - last.t).toFixed(1), deaths: s.deaths - last.deaths, hurt: s.hurt - last.hurt });
      last = { phase: s.phase, t: s.t, deaths: s.deaths, hurt: s.hurt };
      if (SHOTS) await shot(page, `cy-play-phase${s.phase}.png`);
      prevPhase = s.phase;
    }
    if (SHOTS && s.shots > prevShots) { await page.waitForTimeout(10); await shot(page, `cy-play-shot${s.shots}.png`); }
    prevShots = s.shots;
    if (i % 120 === 0) console.log(`t=${s.t.toFixed(0)}s phase=${s.phase}${s.sub ? '/' + s.sub : ''} hero=(${s.hx},${s.hz}) hp=${s.hp} deaths=${s.deaths} hurt=${s.hurt} kills=${s.kills} prog=${s.prog} mortarZ=${s.cz} shots=${s.shots} enemies=${s.enemies} boss=${s.boss} retries=${s.retries}`);
    if (s.state === 'result') done = s;
    if (s.t > 1200) { console.log('超时：20 分钟没打完'); break; }
  }
  if (done) log.push({ phase: last.phase, seconds: +(done.t - last.t).toFixed(1), deaths: done.deaths - last.deaths, hurt: done.hurt - last.hurt });
  await page.waitForTimeout(200);
  if (SHOTS) await shot(page, 'cy-play-result.png');
  const res = await page.evaluate(() => ({ title: document.querySelector('#result .title2').textContent, rank: document.querySelector('#result .rank').textContent, total: document.querySelector('#result .total').textContent, stats: document.querySelector('#result .stats').textContent, hidden: document.getElementById('result').hidden }));
  const voices = await page.evaluate(() => __lj.app.audio.log.filter((x) => x.startsWith('voice:')).map((x) => x.slice(6)));
  const want = ROUTE === 'miss' ? 'miss' : 'hit';
  const out = { at: new Date().toISOString(), startPhase, armor, route: ROUTE, line: (done || s).line, finished: !!done, gameSeconds: done ? +done.t.toFixed(1) : null, wallSeconds: Math.round((Date.now() - t0) / 1000), phases: log, final: done || s, result: res, voices, errors };
  console.log(JSON.stringify(out, null, 1));
  require('fs').writeFileSync(require('path').join(__dirname, `out-cy-playthrough-p${startPhase}-${armor}-${ROUTE}.json`), JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(done && done.won && !errors.length && done.line === want ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

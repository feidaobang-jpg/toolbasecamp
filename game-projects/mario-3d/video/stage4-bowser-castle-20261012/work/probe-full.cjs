// 探针：用 capture.cjs 的同一份页面驱动器把整条 1-4 计划跑完（不截帧，只看世界状态），
// 与离线模拟 trace 逐段对比，找出实机第一次偏离的位置。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path');
const W = __dirname;
const base = process.env.QA_BASE || 'http://127.0.0.1:8799/html/game/mario-3d/index.html';
const hero = JSON.parse(fs.readFileSync(process.env.PLAN_FILE || path.join(W, 'plan/stage4-heroic.json'), 'utf8'));
const DRIVER = require('./driver.cjs');

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('mario3d-v2:touch', '"show"'); localStorage.setItem('mario3d-v2:level', '"1-4"'); });
  await p.goto(base + '?level=1-4&test=1&q=high&clean=1', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__marioReady && window.__MARIO_TEST__);
  await p.evaluate(DRIVER);
  await p.locator('#menu [data-act=start]').click();
  const r = await p.evaluate(cfg => window.__drive(cfg), { preset: 'side', plan: hero.plan.split(' '), tail: null, via: 'keys', chunk: 30 });
  const live = r.trace;
  // 同一份计划再用模块级世界跑一遍（和 build-heroic-plan 完全一致的输入构造），逐段带 z/vy/grounded 对比
  const simRows = await p.evaluate(async (plan) => {
    const M = await import('./world.js?v=2.6.0');
    const session = M.createSession({ startLevel: '1-4', lives: 'inf', armor: 'std', demo: false });
    const w = M.createWorld(session);
    const ACTS = { RR: { mx: 1, run: 1 }, RRJ: { mx: 1, run: 1, jump: 1 }, R: { mx: 1 }, RJ: { mx: 1, jump: 1 }, I: {}, J: { jump: 1 }, L: { mx: -1 }, LJ: { mx: -1, jump: 1 } };
    const rows = [];
    for (let i = 0; i < plan.length; i++) {
      const a = plan[i], A = ACTS[a] || ACTS.RR, prev = i > 0 ? plan[i - 1] : null;
      for (let s = 0; s < 30; s++) {
        M.step(w, { mx: A.mx || 0, mz: 0, run: !!A.run, jump: !!A.jump, down: false,
          jumpPressed: s === 0 && !!A.jump && !(prev && ACTS[prev] && ACTS[prev].jump),
          firePressed: s === 0 && !!A.run && !(prev && ACTS[prev] && ACTS[prev].run) }, M.STEP);
        w.events.length = 0;
        if (w.mode !== 'play') break;
      }
      const q = w.player;
      rows.push([i, a, +q.x.toFixed(3), +q.y.toFixed(3), w.mode, w.session.stats.hits, w.session.stats.deaths, +q.z.toFixed(3), +q.vy.toFixed(2), q.grounded, 'sim', (A.jump ? 'K' : '-')]);
      if (w.mode !== 'play') break;
    }
    return rows;
  }, hero.plan.split(' '));
  const sim = simRows;
  fs.writeFileSync(path.join(W, 'plan', 'probe-live.json'), JSON.stringify({ plan: hero.plan, live, sim, marks: r.marks, final: r.final, errors: errs }, null, 1));
  let firstDev = null;
  for (let i = 0; i < live.length; i++) {
    const d = sim[i] ? Math.abs(live[i][2] - sim[i][2]) : null;
    if (d !== null && d > 0.12 && firstDev === null) firstDev = [i, live[i], sim[i], +d.toFixed(2)];
    if (sim[i] && (live[i][4] !== sim[i][4] || live[i][5] !== sim[i][5])) { firstDev = firstDev || [i, live[i], sim[i], 'state']; break; }
  }
  console.log('firstDeviation', JSON.stringify(firstDev));
  let shown = 0;
  for (let i = 0; i < live.length && shown < 14; i++) {
    const l = live[i], s = sim[i];
    if (!s) break;
    if (Math.abs(l[2] - s[2]) > 0.02 || Math.abs(l[3] - s[3]) > 0.02 || Math.abs(l[7] - s[7]) > 0.02 || l[4] !== s[4] || l[5] !== s[5]) { console.log('DIFF C' + i, 'live', JSON.stringify(l), '| sim', JSON.stringify(s)); shown++; }
  }
  console.log('liveTail', JSON.stringify(live.slice(-6)));
  console.log('simTail', JSON.stringify(sim.slice(-6)));
  console.log('marks', JSON.stringify(r.marks));
  console.log('final', JSON.stringify(r.final));
  console.log('errors', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.error(e.message || e); process.exit(1); });

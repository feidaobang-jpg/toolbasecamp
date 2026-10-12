// 小探针：完全照搬 capture.cjs 的驱动顺序（等卡片 → 逐段按键），逐段打印 x/mode/hits，
// 与离线模拟 trace 对比，找出实机与计划的偏差从哪一段开始。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path');
const W = __dirname;
const base = process.env.QA_BASE || 'http://127.0.0.1:8799/html/game/mario-3d/index.html';
const hero = JSON.parse(fs.readFileSync(path.join(W, 'plan/stage4-heroic.json'), 'utf8'));
const heroic = hero.plan.split(' ');

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('mario3d-v2:touch', '"show"'); localStorage.setItem('mario3d-v2:level', '"1-4"'); });
  await p.goto(base + '?level=1-4&test=1&q=high&clean=1', { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__marioReady && window.__MARIO_TEST__);
  await p.locator('#menu [data-act=start]').click();
  const out = await p.evaluate((plan) => (async () => {
    const q = __MARIO_TEST__; q.manual(true); await q.audio.samples.ready;
    const press = (code, down) => document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    const held = new Set();
    const setKeys = (want) => { for (const k of [...held]) if (!want.includes(k)) { press(k, false); held.delete(k); } for (const k of want) if (!held.has(k)) press(k, true); };
    const frame = () => new Promise(r => requestAnimationFrame(r));
    let clockT = performance.now(), owed = 0;
    const runSteps = async n => { let done = 0; while (done < n) { await frame(); const now = performance.now(); owed += (now - clockT) * 0.12; clockT = now; const k = Math.min(n - done, Math.floor(owed)); if (k > 0) { q.step(k); owed -= k; done += k; } } };
    const K = { RR: ['KeyD', 'KeyJ'], RRJ: ['KeyD', 'KeyJ', 'KeyK'], R: ['KeyD'], RJ: ['KeyD', 'KeyK'], I: [], J: ['KeyK'], L: ['KeyA'], LJ: ['KeyA', 'KeyK'] };
    const rows = [];
    let cards = 0;
    while (q.state().phase === 'card') { await runSteps(2); cards += 2; }
    rows.push(['cardSteps', cards]);
    for (let i = 0; i < Math.min(24, plan.length); i++) {
      const a = plan[i]; setKeys(K[a] || []);
      await runSteps(30);
      const s = q.state();
      rows.push([i + ' ' + a, JSON.stringify({ x: s.player.x, y: s.player.y, mode: s.mode, hits: s.session.stats.hits, deaths: s.session.stats.deaths, hearts: s.session.hearts, inv: s.player.inv, grounded: s.player.grounded })]);
      if (s.mode !== 'play') break;
    }
    setKeys([]);
    return rows;
  })(plan), heroic);
  out.forEach(r => console.log(...r));
  console.log('SIM 0..11', JSON.stringify(hero.trace.slice(0, 12).map(t => t[0] + ':' + t[1] + ' x=' + t[2] + ' y=' + t[3] + ' ' + t[4])));
  console.log('errors', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.error(e.message || e); process.exit(1); });

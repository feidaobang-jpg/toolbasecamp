// 本期录制的“英雄路线”规划：在同一条真实进度上分四段做深度优先搜索，
// 1) 拿到火焰花 → 2) 顶出 6 块隐藏金币砖 → 3) 火球打倒假库巴 → 4) 碰到斧头进入塌桥演出。
// 搜索只作用在克隆世界（同一份 world.js），每段找到后用真实键盘按同样节奏重放到真实游戏，
// 再把新状态交给下一段。读取火棒角度与库巴状态来挑时机，这一点与人玩不同，成片与台账都要写明。
// 用法：node game-projects/mario-3d/qa/serve.mjs 8799 & node game-projects/mario-3d/video/stage4-bowser-castle-20261012/work/plan-staged.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const W = __dirname, ROOT = path.resolve(W, '../../../../..');
const base = process.env.QA_BASE || 'http://127.0.0.1:8799/html/game/mario-3d/index.html';
const out = process.env.QA_OUT || path.join(W, 'plan');
const CHUNK = 30;   // 每个决策 0.25 秒
fs.mkdirSync(out, { recursive: true });

const STAGES = [
  { name: 'flower', goal: 'w.player.power==="fire"', label: '顶问号砖吃到火焰花' },
  { name: 'coins', goal: 'w.session.coins>=6', label: '顶出下沉房间 6 块隐藏金币砖' },
  { name: 'bowser', goal: 'w.rt.bowser.state==="dead"||w.rt.bowser.state==="gone"', label: '火球打 5 下让假库巴翻身' },
  { name: 'axe', goal: 'w.mode==="axe"', label: '碰斧头触发塌桥' },
];

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--use-angle=d3d11'] });
  const errors = [];
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '?level=1-4&test=1&q=high&clean=1', { waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.__marioReady && window.__MARIO_TEST__);
    await p.locator('#menu [data-act=start]').click();
    await p.evaluate(() => { __MARIO_TEST__.manual(true); });
    const setup = await p.evaluate(() => { const s = __MARIO_TEST__.session.settings; return { lives: s.lives, armor: s.armor, demo: s.demo, camera: __MARIO_TEST__.state().camera, power: __MARIO_TEST__.world.player.power }; });
    assert(setup.lives === 'inf' && setup.armor === 'std' && !setup.demo && setup.camera === 'side' && setup.power === 'small', JSON.stringify(setup));

    const staged = [];
    const checks = [];
    for (const st of STAGES) {
      const t0 = Date.now();
      const res = await p.evaluate(async ([CHUNK, goalSrc, MAX, name]) => {
        const W = await import('./world.js?v=2.6.0');
        const goal = new Function('w', 'return (' + goalSrc + ')');
        const ACTS = { RR: { mx: 1, run: 1 }, RRJ: { mx: 1, run: 1, jump: 1 }, R: { mx: 1 }, RJ: { mx: 1, jump: 1 }, I: {}, J: { jump: 1 }, L: { mx: -1 }, LJ: { mx: -1, jump: 1 } };
        const ORDER = ['RR', 'RRJ', 'R', 'RJ', 'I', 'J', 'L', 'LJ'];
        const run = (w, a, prev) => {
          const A = ACTS[a], P = prev ? ACTS[prev] : {};
          const hits = w.session.stats.hits, deaths = w.session.stats.deaths;
          for (let i = 0; i < CHUNK; i++) {
            W.step(w, { mx: A.mx || 0, mz: 0, run: !!A.run, jump: !!A.jump, down: false, jumpPressed: i === 0 && !!A.jump && !P.jump, firePressed: i === 0 && !!A.run && !P.run }, W.STEP);
            w.events.length = 0;
            if (w.mode !== 'play') break;
          }
          if (goal(w)) return 'goal';
          // 提前撞斧头、掉命或时间快耗尽都算这段失败
          if (w.mode !== 'play' || w.session.stats.hits > hits || w.session.stats.deaths > deaths || w.time < 20) return 'fail';
          return 'ok';
        };
        const key = (w, prev) => [
          Math.round(w.player.x * 3), Math.round(w.player.y * 3), Math.round(w.player.vx), Math.round(w.player.vy / 3),
          Math.round((w.clock % 3.33) * 4), prev && ACTS[prev].jump ? 1 : 0,
          w.player.power, w.session.coins, w.rt.bowser ? w.rt.bowser.state + ':' + w.rt.bowser.hp + ':' + Math.round(w.rt.bowser.x * 2) + ':' + w.rt.flames.length : '',
        ].join('|');
        const seen = new Set();
        const stack = [{ w: structuredClone(__MARIO_TEST__.world), acts: [], i: 0, prev: null }];
        let nodes = 0, best = 0, bestActs = [];
        while (stack.length && nodes < MAX) {
          const top = stack[stack.length - 1];
          if (top.i >= ORDER.length) { stack.pop(); continue; }
          const a = ORDER[top.i++]; const w = structuredClone(top.w); nodes++;
          const r = run(w, a, top.prev);
          if (r === 'goal') return { acts: stack.slice(1).map(s => s.a).concat(a), nodes, best: w.player.x, ms: performance.now() };
          if (r === 'fail') continue;
          const k = key(w, a); if (seen.has(k)) continue; seen.add(k);
          if (w.player.x > best) { best = w.player.x; bestActs = stack.slice(1).map(s => s.a).concat(a); }
          stack.push({ w, a, i: 0, prev: a, k });
          if (nodes % 2000 === 0) await new Promise(r => setTimeout(r, 0));
        }
        const w = structuredClone(__MARIO_TEST__.world); let prev = null;
        for (const a of bestActs) { run(w, a, prev); prev = a; }
        return { acts: null, nodes, best, at: { x: +w.player.x.toFixed(2), y: +w.player.y.toFixed(2), mode: w.mode, time: w.time }, tail: bestActs.slice(-14) };
      }, [CHUNK, st.goal, +(process.env.MAX_NODES || 120000), st.name]);

      console.log('plan', st.name, JSON.stringify({ chunks: res.acts && res.acts.length, nodes: res.nodes, best: res.best, seconds: +((Date.now() - t0) / 1000).toFixed(1), at: res.at, tail: res.tail }));
      assert(res.acts, st.name + ' 搜索失败，最远 x=' + res.best + ' ' + JSON.stringify(res.at));

      // 用真实键盘重放到真实游戏（手动时钟按真实时间推进）
      const ACT = { RR: { mx: 1, run: 1 }, RRJ: { mx: 1, run: 1, jump: 1 }, R: { mx: 1 }, RJ: { mx: 1, jump: 1 }, I: {}, J: { jump: 1 }, L: { mx: -1 }, LJ: { mx: -1, jump: 1 } };
      const held = new Set(), trace = [];
      for (const a of res.acts) {
        const A = ACT[a], want = new Set();
        if (A.mx) want.add(A.mx > 0 ? 'KeyD' : 'KeyA');
        if (A.run) want.add('KeyJ');
        if (A.jump) want.add('KeyK');
        for (const k of [...held]) if (!want.has(k)) { await p.keyboard.up(k); held.delete(k); }
        for (const k of want) if (!held.has(k)) { await p.keyboard.down(k); held.add(k); }
        const s = await p.evaluate(n => { const q = __MARIO_TEST__; q.step(n, false); const w = q.world; return { x: +w.player.x.toFixed(3), y: +w.player.y.toFixed(3), mode: w.mode, power: w.player.power, coins: w.session.coins, hits: q.session.stats.hits, deaths: q.session.stats.deaths, bowser: w.rt.bowser && w.rt.bowser.state, time: w.time }; }, CHUNK);
        trace.push([st.name, a, s.x, s.y, s.mode]);
        if (s.mode !== 'play') break;
      }
      for (const k of held) await p.keyboard.up(k);
      const s = await p.evaluate(g => { const w = __MARIO_TEST__.world; return { goalReached: new Function('w', 'return (' + g + ')')(w), x: +w.player.x.toFixed(2), mode: w.mode, power: w.player.power, coins: w.session.coins, bowser: w.rt.bowser && w.rt.bowser.state, hits: __MARIO_TEST__.session.stats.hits, deaths: __MARIO_TEST__.session.stats.deaths, time: w.time }; }, st.goal);
      assert(s.goalReached === true, st.name + ' 目标未达成：' + JSON.stringify(s));
      assert(s.hits === 0 && s.deaths === 0, st.name + ' 出现受伤或掉命：' + JSON.stringify(s));
      checks.push({ stage: st.name, label: st.label, ok: true, data: s });
      staged.push({ stage: st.name, label: st.label, acts: res.acts, nodes: res.nodes, after: s });
      fs.writeFileSync(path.join(out, 'stage-progress.json'), JSON.stringify({ setup, stages: staged, checks, errors }, null, 1));
    }

    const all = staged.flatMap(x => x.acts);
    fs.writeFileSync(path.join(out, 'stage4-heroic.json'), JSON.stringify({
      url: base, browser: b.version(), setup, chunk: CHUNK, chunkSeconds: CHUNK / 120,
      method: '分四段在同一真实进度上做 DFS（克隆世界、同一份 world.js），每段用真实键盘重放后再搜下一段；读取火棒角度和库巴状态挑时机，与人玩不同。',
      stages: staged.map(x => ({ stage: x.stage, label: x.label, chunks: x.acts.length, nodes: x.nodes, after: x.after })),
      checks,
      plan: all.join(' '), seconds: +(all.length * CHUNK / 120).toFixed(2), errors,
    }, null, 1));
    console.log('WROTE', path.join(out, 'stage4-heroic.json'), JSON.stringify({ chunks: all.length, seconds: +(all.length * CHUNK / 120).toFixed(2) }));
    assert(errors.length === 0, 'page errors: ' + errors.join(' | '));
  } finally { await b.close(); }
})().catch(e => { console.error(e.message || e); process.exit(1); });

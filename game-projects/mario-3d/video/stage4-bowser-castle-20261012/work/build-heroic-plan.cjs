// 生成本期用的“英雄路线”：以已验证的零受伤通关计划（qa/stage4-run.json）为底，
// 在下沉房间的几个位置插入跳跃，把上排隐藏金币砖顶出来，其余保持原计划不变。
// 每条候选都在离线克隆世界里用同一份 world.js 完整跑一遍，只有仍然零受伤、零掉命、能碰到斧头的方案才留下。
// 用法：node game-projects/mario-3d/qa/serve.mjs 8799 & node game-projects/mario-3d/video/stage4-bowser-castle-20261012/work/build-heroic-plan.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const W = __dirname, ROOT = path.resolve(W, '../../../../..');
const base = process.env.QA_BASE || 'http://127.0.0.1:8799/html/game/mario-3d/index.html';
const verified = JSON.parse(fs.readFileSync(path.join(ROOT, 'game-projects/mario-3d/media-kit/releases/v2.6.0-preview1/qa/stage4-run.json'), 'utf8'));
const CHUNK = 30;

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--use-angle=d3d11'] });
  const errors = [];
  try {
    const p = await (await b.newContext({ viewport: { width: 800, height: 600 } })).newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '?test=1', { waitUntil: 'networkidle' });
    await p.waitForFunction(() => window.__marioReady && window.__MARIO_TEST__);

    await p.evaluate(([CHUNK]) => {
      window.__sim = async (acts) => {
        const M = await import('./world.js?v=2.6.0');
        const session = M.createSession({ startLevel: '1-4', lives: 'inf', armor: 'std', demo: false });
        const w = M.createWorld(session);
        const ACTS = { RR: { mx: 1, run: 1 }, RRJ: { mx: 1, run: 1, jump: 1 }, R: { mx: 1 }, RJ: { mx: 1, jump: 1 }, I: {}, J: { jump: 1 }, L: { mx: -1 }, LJ: { mx: -1, jump: 1 } };
        let prev = null; const per = [];
        for (let i = 0; i < acts.length; i++) {
          const a = acts[i], A = ACTS[a] || ACTS.RR;
          const jumped = i > 0 ? acts[i - 1] : null;
          for (let s = 0; s < CHUNK; s++) {
            M.step(w, { mx: A.mx || 0, mz: 0, run: !!A.run, jump: !!A.jump, down: false,
              jumpPressed: s === 0 && !!A.jump && !(jumped && ACTS[jumped] && ACTS[jumped].jump),
              firePressed: s === 0 && !!A.run && !(jumped && ACTS[jumped] && ACTS[jumped].run) }, M.STEP);
            w.events.length = 0;
            if (w.mode !== 'play') break;
          }
          per.push([i, a, +w.player.x.toFixed(2), +w.player.y.toFixed(2), w.mode, w.session.coins, w.session.stats.hits]);
          if (w.mode !== 'play') break;
          prev = a;
        }
        const st = w.session.stats;
        return { mode: w.mode, x: +w.player.x.toFixed(2), y: +w.player.y.toFixed(2), coins: w.session.coins, secrets: st.secrets,
          hits: st.hits, deaths: st.deaths, score: w.session.score, time: w.time, power: w.player.power,
          bowser: w.rt.bowser && w.rt.bowser.state, bowserHp: w.rt.bowser && w.rt.bowser.hp, per };
      };
      window.__runSim = (acts) => __sim(acts);
    }, [CHUNK]);

    const sim = acts => p.evaluate(a => window.__runSim(a), acts);
    const okEnd = r => r.mode === 'axe' && r.hits === 0 && r.deaths === 0;

    const src = verified.plan.split(' ');
    const baseline = await sim(src);
    console.log('baseline', JSON.stringify({ mode: baseline.mode, coins: baseline.coins, secrets: baseline.secrets, hits: baseline.hits, deaths: baseline.deaths, time: baseline.time }));
    assert(okEnd(baseline), 'baseline plan no longer clears to axe: ' + JSON.stringify(baseline).slice(0, 300));

    // 上排隐藏金币砖在第 106 / 109 / 112 列（高 3 格，砖中心 x = 列号 + 0.5）；下排 107 / 110 / 113 高 7 格，先按可达性实测
    const targets = [{ name: 'hidden-106', x: 106.5, h: 3 }, { name: 'hidden-109', x: 109.5, h: 3 }, { name: 'hidden-112', x: 112.5, h: 3 },
                     { name: 'hidden-107-high', x: 107.5, h: 7 }, { name: 'hidden-110-high', x: 110.5, h: 7 }, { name: 'hidden-113-high', x: 113.5, h: 7 }];
    let plan = src.slice(), best = baseline, tried = 0;
    const inserted = [];
    // 允许“先减速再跳”“连跳”等成组改动，因为只改一格时冲刺速度（每 0.25 秒约 2.3 格）太粗，很难正好顶到砖
    const walkBefore = (i, n) => { const e = []; for (let k = i - n; k < i; k++) if (k >= 0) e.push([k, 'R']); return e; };
    const patterns = (i) => {
      const E = (arr) => arr;
      return [
        E([[i, 'RJ']]), E([[i, 'RRJ']]), E([[i, 'J']]),
        E(walkBefore(i, 1).concat([[i, 'RJ']])),
        E(walkBefore(i, 2).concat([[i, 'RJ']])),
        E(walkBefore(i, 2).concat([[i, 'RRJ']])),
        E(walkBefore(i, 3).concat([[i, 'RJ']])),
        E(walkBefore(i, 1).concat([[i + 1, 'RJ']])),
        E([[i, 'RJ'], [i + 2, 'RJ']]),
        E([[i, 'RRJ'], [i + 2, 'RJ']]),
        E([[i, 'RJ'], [i + 1, 'J'], [i + 3, 'RJ']]),
      ];
    };
    for (const t of targets) {
      const cur = await sim(plan); tried++;
      const cand = [];
      for (let i = 0; i < plan.length; i++) if (cur.per[i] && cur.per[i][2] > t.x - 5.2 && cur.per[i][2] < t.x + 0.6) cand.push(i);
      let local = { coins: cur.coins, acts: null, edit: null };
      for (const i of cand) {
        for (const edit of patterns(i)) {
          const trial = plan.slice();
          for (const [k, a] of edit) if (k >= 0 && k < trial.length) trial[k] = a;
          const r = await sim(trial); tried++;
          if (!okEnd(r)) continue;
          if (r.coins > local.coins) local = { coins: r.coins, acts: trial, edit, result: r };
        }
      }
      if (local.acts) { plan = local.acts; best = local.result; inserted.push({ target: t.name, edit: local.edit, coinsAfter: local.coins }); console.log('insert', t.name, JSON.stringify({ edit: local.edit, coins: local.coins })); }
      else console.log('skip', t.name, '没有既能顶到又不影响通关的插入点');
    }

    const final = await sim(plan);
    const checks = [
      { name: '英雄路线仍然零受伤、零掉命碰到斧头', ok: okEnd(final), data: { mode: final.mode, hits: final.hits, deaths: final.deaths, x: final.x } },
      { name: '顶出的隐藏砖数量按 secrets 记录', ok: final.secrets >= best.secrets, data: { coins: final.coins, secrets: final.secrets, score: final.score } },
      { name: '页面无脚本错误', ok: errors.length === 0, data: errors },
    ];
    fs.writeFileSync(path.join(W, 'plan', 'stage4-heroic.json'), JSON.stringify({
      built_at: new Date().toISOString(), source_plan: 'game-projects/mario-3d/media-kit/releases/v2.6.0-preview1/qa/stage4-run.json',
      method: '以已验证零受伤计划为底，在下沉房间逐点试插跳跃，每条候选都用同一份 world.js 在克隆世界完整跑一遍，只有仍零受伤通关的方案保留。搜索脚本读火棒角度与库巴状态，与人玩不同。',
      chunk: CHUNK, chunkSeconds: CHUNK / 120, sims: tried + 1, baseline: drop(baseline), inserts: inserted, final: drop(final), checks,
      plan: plan.join(' '), seconds: +(plan.length * CHUNK / 120).toFixed(2), trace: final.per,
    }, null, 1));
    console.log('FINAL', JSON.stringify({ chunks: plan.length, seconds: +(plan.length * CHUNK / 120).toFixed(2), coins: final.coins, secrets: final.secrets, hits: final.hits, score: final.score, sims: tried + 1 }));
    assert(checks.every(c => c.ok), 'checks failed: ' + JSON.stringify(checks.filter(c => !c.ok)));
  } finally { await b.close(); }
})().catch(e => { console.error(e.message || e); process.exit(1); });

function drop(r) { const { per, ...rest } = r; return rest; }

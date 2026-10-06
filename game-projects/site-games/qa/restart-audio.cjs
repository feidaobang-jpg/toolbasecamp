// 跨游戏回归：暂停后点「重新开始 / 重开本关」，新的一局声音（BGM 与音效）要恢复。
// 每个游戏：真实点击开始 → 玩一会 → 暂停（确认音频挂起）→ 点暂停菜单里的重开 → 等 2 秒，
// 检查页面里所有 AudioContext 都是 running 且时钟在走，并在扬声器出口挂分析器量实际音量（BGM 用 mp3 长样本的游戏重开后不会新建声源）。
// GAMES_BASE 默认本地 no-store 服务；GAMES_ONLY=cadillacs-stage1-3d,tank-3d 只跑部分；结果写 GAMES_OUT/results.json
let pw; try { pw = require('playwright'); } catch (e) { pw = require('D:/project/godot/absurd-3d-daily/node_modules/playwright'); }
const fs = require('fs'), path = require('path');
const BASE = process.env.GAMES_BASE || 'http://127.0.0.1:8791/html/game/';
const OUT = process.env.GAMES_OUT || path.resolve(__dirname, 'out/restart-audio');
fs.mkdirSync(OUT, { recursive: true });
// pause：打开暂停菜单；restart：暂停菜单里的重开按钮（西游降魔暂停面板只有「继续」，没有重开，单独记录）
const GAMES = {
  'cadillacs-stage1-3d': { start: 'button.primary[data-act=select]', start2: '#sel-go', pause: '#btn-pause', restart: '#pause [data-act=restart]' },
  'jackal-stage1-3d': { start: '[data-act=start]', pause: '#btn-pause', restart: '#pause [data-act=restart]' },
  'mario-3d': { start: '[data-act=start]', pause: '#btn-pause', restart: '#pause [data-act=restart]' },
  'tank-3d': { start: '[data-act=start]', pause: '#btn-pause', restart: '#pause [data-act=restart]' },
  'starship-defense': { start: '#btnStart', pauseKey: 'Escape', restart: '#btnRestartLv' },
  'journey-west-3d': { start: '#start', pause: '#pause', restart: null }
};
const only = process.env.GAMES_ONLY ? process.env.GAMES_ONLY.split(',') : Object.keys(GAMES);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(detail)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await pw.chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  for (const g of only) {
    const G = GAMES[g];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => {
      window.__acs = []; window.__starts = 0;
      for (const k of ['AudioContext', 'webkitAudioContext']) {
        const C = window[k]; if (!C || C.__wrapped) continue;
        const W = function (...a) { const c = new C(...a); window.__acs.push(c); return c; };
        W.prototype = C.prototype; W.__wrapped = true; window[k] = W;
      }
      // 凡是接到扬声器的节点，同时接一个分析器，用来量真实输出音量
      const oc = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (dst, ...a) {
        const r = oc.call(this, dst, ...a);
        try { if (dst instanceof AudioDestinationNode) { const c = this.context; if (!c.__an) { c.__an = c.createAnalyser(); c.__an.fftSize = 2048; } oc.call(this, c.__an); } } catch (e) { /* 忽略 */ }
        return r;
      };
      window.__level = () => Math.max(0, ...window.__acs.map(c => { if (!c.__an || c.state !== 'running') return 0; /* 挂起时分析器里是旧数据，不算 */ const b = new Float32Array(2048); c.__an.getFloatTimeDomainData(b); let s = 0; for (const v of b) s += v * v; return Math.sqrt(s / b.length); }));
      for (const N of ['AudioBufferSourceNode', 'OscillatorNode']) {
        const o = window[N] && window[N].prototype.start; if (!o) continue;
        window[N].prototype.start = function (...a) { window.__starts++; return o.apply(this, a); };
      }
      try { localStorage.clear(); } catch (e) { /* 无痕 */ }
    });
    const audio = () => p.evaluate(() => ({ states: window.__acs.map(c => c.state), times: window.__acs.map(c => +c.currentTime.toFixed(2)), starts: window.__starts }));
    const loud = async () => { let m = 0; for (let i = 0; i < 12; i++) { m = Math.max(m, await p.evaluate(() => window.__level())); await sleep(100); } return +m.toFixed(4); };
    try {
      await p.goto(BASE + g + '/index.html?test=1&seed=5', { waitUntil: 'load' });
      await sleep(1500);
      await p.locator(G.start).first().click();
      if (G.start2) { await sleep(600); await p.locator(G.start2).first().click(); }
      await sleep(5000);   // 超级玛丽开局先显示 WORLD 卡片，几秒后才起音乐
      const before = await audio(); before.rms = await loud();
      check(g + '：开局有声音', before.states.length && before.states.every(s => s === 'running') && before.rms > 0.002, before);
      if (G.pause) await p.locator(G.pause).first().click(); else await p.keyboard.press(G.pauseKey);
      await sleep(600);
      const paused = await audio();
      check(g + '：暂停时音频挂起', paused.states.some(s => s === 'suspended'), paused);
      if (!G.restart) { check(g + '：暂停面板无重开按钮（不适用）', true, null); }
      else {
        await p.locator(G.restart).first().click();
        await sleep(2000);
        const a1 = await audio(); await sleep(1000); const a2 = await audio(); a2.rms = await loud();
        await p.screenshot({ path: path.join(OUT, g + '-after-restart.png') });
        const ticking = a2.times.every((t, i) => t - a1.times[i] > 0.5);
        check(g + '：重开后音频恢复（running 且时钟在走）', a2.states.every(s => s === 'running') && ticking, { a1, a2 });
        check(g + '：重开后实际有声音输出', a2.rms > 0.002, { rms: a2.rms, startsPaused: paused.starts, startsAfter: a2.starts });
      }
      check(g + '：无运行异常', errors.length === 0, errors);
    } catch (e) { check(g + '：流程完成', false, e.message); }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 1) + '\n');
  console.log(results.filter(r => r.ok).length + '/' + results.length + ' passed');
  process.exitCode = results.every(r => r.ok) ? 0 : 1;
})();

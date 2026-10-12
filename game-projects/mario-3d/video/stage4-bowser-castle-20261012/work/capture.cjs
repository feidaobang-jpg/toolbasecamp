// 本期实机采集：手动时钟按真实时间推进（120 逻辑步/秒），按键在页面内派发到游戏自己的 keydown/keyup 处理，
// 画面用 CDP 截帧（含 HUD / WORLD 卡片 / 结算等 DOM 层），声音只取游戏自己的 AudioContext 输出，不录麦克风与系统声音。
// 路线来自 work/plan/stage4-heroic.json（以已验证零受伤通关计划为底，离线克隆世界里逐点试插跳跃顶隐藏砖）。
// 脚本会读火棒角度和库巴状态挑时机，这一点和真人操作不同，台账与成片说明都要写明。
// 用法：node game-projects/mario-3d/qa/serve.mjs 8799 & node game-projects/mario-3d/video/stage4-bowser-castle-20261012/work/capture.cjs [segment ...]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const W = __dirname, ROOT = path.resolve(W, '../../../../..');
const MEDIA = process.env.MEDIA_DIR || 'D:/project/task-artifacts/mario-stage4-video-20261012';
const base = process.env.QA_BASE || 'http://127.0.0.1:8799/html/game/mario-3d/index.html';
const CH = 30;   // 每个决策 0.25 秒 = 30 个 1/120 秒逻辑步
const heroic = JSON.parse(fs.readFileSync(path.join(W, 'plan/stage4-heroic.json'), 'utf8')).plan.split(' ');

const SEGMENTS = {
  'heroic-side': { via: 'keys', preset: 'side', start: 'level=1-4', plan: heroic, tail: 'result', seconds: 75 },
  'heroic-front': { via: 'keys', preset: 'front', start: 'level=1-4', plan: heroic, tail: 'result', seconds: 75 },
  'fp-corridor': { via: 'keys', preset: 'fp', start: 'level=1-4', plan: heroic, tail: null, seconds: 60 },
  'mobile-touch': { via: 'touch', preset: 'side', start: 'level=1-4', plan: heroic, tail: 'result', seconds: 75, viewport: [844, 390], touch: true },
  // 俯视母版：yaw 仍是 0，所以 KeyD 还是世界 +x，同一条键盘路线能直接跑。
  // 试过的两个视角不能用这份路线：斜视（yaw -0.62）和跑图中途转镜头（Q/E）都会让"向前"变成斜着走，实测第一秒就掉进岩浆。
  'top-run': { via: 'keys', preset: 'top', start: 'level=1-4', plan: heroic, tail: 'result', seconds: 75 },
  'menu-levels': { via: 'menu', preset: 'side', start: 'menu', seconds: 20 },   // 菜单里在"1-4 城堡"上停留 9 秒，再回车进关看开场
};

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.png': 'image/png', '.jpg': 'image/jpeg' };
function ff(args) { return new Promise((ok, no) => { const p = cp.spawn('ffmpeg', ['-hide_banner', '-y', ...args], { windowsHide: true }); let log = ''; p.stderr.on('data', d => log += d); p.on('exit', c => c ? no(Error(log.slice(-2500))) : ok()); }); }

async function encode(name) {
  const dir = path.join(MEDIA, 'capture', name), list = path.join(dir, 'frames.ffconcat');
  const rows = fs.readFileSync(list, 'utf8').split('\n').filter(x => x.length && !x.startsWith('option framerate'));
  const precise = rows.flatMap(x => x.startsWith('file ') ? [x, 'option framerate 1000'] : [x]).join('\n');
  fs.writeFileSync(list, precise);
  const duration = rows.filter(x => x.startsWith('duration ')).reduce((s, x) => s + Number(x.split(' ')[1]), 0);
  const audio = fs.existsSync(path.join(dir, 'audio.webm'));
  await ff(['-threads', '2', '-safe', '0', '-f', 'concat', '-i', list, ...(audio ? ['-i', path.join(dir, 'audio.webm')] : []),
    '-vf', 'fps=60,format=yuv420p', '-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '18', '-b:v', '0',
    ...(audio ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']), '-t', String(duration), '-movflags', '+faststart',
    path.join(MEDIA, 'capture', name + '.mp4')]);
  console.log(name, 'encoded', duration.toFixed(2), 's, audio', audio ? 'yes' : 'no');
}

const DRIVER = require('./driver.cjs');

async function run(name) {
  const seg = SEGMENTS[name]; assert(seg, 'unknown segment ' + name);
  const dir = path.join(MEDIA, 'capture', name); fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (/^\d{6}\.jpg$/.test(f) || f === 'audio.webm' || f === 'frames.ffconcat') fs.rmSync(path.join(dir, f));
  const vp = seg.viewport || [1920, 1080];
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 1, hasTouch: !!seg.touch, isMobile: false });
  const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
  // 电脑视角段按桌面默认隐藏触屏摇杆与动作键，免得 1080p 画面里挂着手机 HUD；只有手机段强制显示
  await p.addInitScript((cfg) => {
    localStorage.setItem('mario3d-v2:touch', JSON.stringify(cfg.showTouch ? 'show' : 'hide'));
    localStorage.setItem('mario3d-v2:level', JSON.stringify(cfg.lv));
    const original = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (d, ...r) { const res = original.call(this, d, ...r); if (d === this.context.destination) { const sink = this.context.createMediaStreamDestination(); original.call(this, sink); window.__qaGameAudio = sink; } return res; };
  }, { showTouch: seg.via === 'touch', lv: seg.start === 'menu' ? '1-1' : '1-4' });
  await p.goto(base + (seg.start === 'menu' ? '?test=1' : '?level=1-4&test=1&q=high&clean=1'), { waitUntil: 'networkidle' });
  await p.waitForFunction(() => window.__marioReady && window.__MARIO_TEST__);
  await p.evaluate(DRIVER);
  if (seg.via !== 'menu') await p.locator('#menu [data-act=start]').click();
  // 手机段：触屏 HUD 必须先真的渲染出来，驱动才有摇杆和动作键可点
  if (seg.via === 'touch') {
    const hud = await p.evaluate(() => window.__MARIO_TEST__.state().touchHidden);
    assert(hud === false, name + ' 触屏 HUD 未显示（touchHidden=' + hud + '），检查 localStorage mario3d-v2:touch 是否为 show');
  }
  // 手机段确认触屏摇杆与动作键真的渲染出来了（驱动靠点这些按钮，看不见就是白跑一趟）
  if (seg.via === 'touch') await p.waitForFunction(() => { const s = window.__MARIO_TEST__.state(); return s.touchHidden === false; }, null, { timeout: 15000 });

  const cdp = await ctx.newCDPSession(p);
  const frames = [], writes = []; let recording = true;
  cdp.on('Page.screencastFrame', e => {
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => { });
    if (!recording) return;
    const file = String(frames.length).padStart(6, '0') + '.jpg';
    frames.push({ file, timestamp: e.metadata.timestamp });
    writes.push(fs.promises.writeFile(path.join(dir, file), Buffer.from(e.data, 'base64')));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: Number(process.env.SHOT_Q || 90), maxWidth: vp[0], maxHeight: vp[1], everyNthFrame: 1 });
  await p.evaluate(() => { if (window.__qaGameAudio) { window.__chunks = []; window.__rec = new MediaRecorder(window.__qaGameAudio.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 }); window.__rec.ondataavailable = e => { if (e.data.size) window.__chunks.push(e.data); }; window.__rec.start(250); } });

  let result = null, menuScript = null, fail = "";
  if (seg.via === 'menu') menuScript = await p.evaluate(runMenu, seg.seconds);
  else {
    const cfg = { preset: seg.preset, plan: seg.plan, tail: seg.tail, via: seg.via, chunk: CH, orbit: seg.orbit };
    const pr = p.evaluate(d => window.__drive(d), cfg);
    await p.waitForFunction(() => window.__syncWall !== undefined, null, { timeout: 60000 });
    const wall = await p.evaluate(() => window.__syncWall);
    result = await pr;
    result.startWall = wall;
    // 电脑段要求整条已验证路线零受伤跑完（和离线世界计划一致才算母版）；
    // 手机段只要求不摔死并打通到结算：摇杆与跳键的按法本身和键盘不完全等价，被火棒蹭到几下是真实触屏操作，如实记在 hits 里。
    const strict = seg.via !== 'touch';
    fail = (result.final.deaths !== 0 ? 'deaths=' + result.final.deaths + ' ' : '')
      + (strict && result.final.hits !== 0 ? 'hits=' + result.final.hits + ' ' : '')
      + (strict && seg.tail === 'result' && result.final.mode !== 'clear' ? '未打通 mode=' + result.final.mode + ' x=' + result.final.x + ' ' : '')
      + (!strict && seg.tail === 'result' && result.final.overlay !== 'result' ? '未打通 overlay=' + result.final.overlay + ' x=' + result.final.x + ' ' : '')
      + (seg.via === 'touch' && result.final.touchHidden !== false ? '触屏 HUD 未显示 ' : '');
  }
  await new Promise(r => setTimeout(r, 400));
  recording = false; await cdp.send('Page.stopScreencast'); await Promise.all(writes);
  const audio = await p.evaluate(async () => { if (!window.__rec) return null; await new Promise(ok => { window.__rec.onstop = ok; window.__rec.stop(); }); return Array.from(new Uint8Array(await new Blob(window.__chunks).arrayBuffer())); });
  if (audio && audio.length) fs.writeFileSync(path.join(dir, 'audio.webm'), Buffer.from(audio));
  await ctx.close();

  let concat = 'ffconcat version 1.0\n';
  for (let i = 0; i < frames.length; i++) { concat += `file '${frames[i].file}'\n`; if (i + 1 < frames.length) concat += `duration ${Math.max(0.001, frames[i + 1].timestamp - frames[i].timestamp).toFixed(6)}\n`; }
  fs.writeFileSync(path.join(dir, 'frames.ffconcat'), concat);
  const gaps = frames.slice(1).map((x, i) => (x.timestamp - frames[i].timestamp) * 1000);
  const sorted = [...gaps].sort((a, b) => a - b);
  const cadence = { frames: frames.length, fps: +(frames.length * 1000 / gaps.reduce((s, x) => s + x, 0)).toFixed(1), p95_ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1), max_ms: +sorted.at(-1).toFixed(1), over_100ms: gaps.filter(x => x > 100).length };
  fs.writeFileSync(path.join(dir, 'capture.json'), JSON.stringify({
    segment: name, preset: seg.preset, via: seg.via, viewport: vp,
    url: base + (seg.start === 'menu' ? '?test=1' : '?level=1-4&test=1&q=high&clean=1'),
    method: '手动时钟按真实时间推进（120 逻辑步/秒），' + (seg.via === 'touch' ? '页面内派发 pointer 事件走触屏摇杆与动作键' : '页面内派发 keydown/keyup 到游戏自身的按键处理') + '；画面 CDP 截帧（含 HUD / 卡片 / 结算 DOM），声音只取游戏 AudioContext 输出',
    planSource: seg.plan ? 'work/plan/stage4-heroic.json' : null, planCheck: 'work/probe-full.cjs 已逐段核对实机与世界离线模拟一致（见 work/plan/probe-live.json）', cadence, marks: result && result.marks, events: result && result.events, trace: result && result.trace, final: result && result.final, menuScript,
    fail, startWall: result && result.startWall, firstFrameTimestamp: frames[0] && frames[0].timestamp, errors, buildCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(),
  }, null, 1));
  console.log(name, JSON.stringify({ frames: frames.length, cadence, final: result && result.final, fail, errors }));
  assert(!fail, name + ' 跑崩了：' + fail);
  assert(errors.length === 0, name + ' page errors: ' + errors.join(' | '));
  await encode(name);
}

async function runMenu(seconds) {
  const press = (code) => { document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); return new Promise(r => setTimeout(r, 90)).then(() => document.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const q = window.__MARIO_TEST__;
  const steps = []; let guard = 0;
  while (document.activeElement && (document.activeElement.getAttribute('data-opt') !== 'level') && guard++ < 10) { await press('ArrowDown'); steps.push({ t: +(performance.now() / 1000).toFixed(2), focus: q.state().focus }); }
  for (let i = 0; i < 3; i++) { await press('ArrowRight'); await wait(900); steps.push({ t: +(performance.now() / 1000).toFixed(2), focus: q.state().focus, level: q.settings.level, label: document.activeElement.textContent.trim() }); }
  await wait(9000);   // 在"1-4 城堡"这一项上多停一会儿，让解说讲选关时画面正好停在菜单上
  steps.push({ t: +(performance.now() / 1000).toFixed(2), focus: q.state().focus, level: q.settings.level, label: document.activeElement.textContent.trim(), dwell: true });
  await press('ArrowUp'); await wait(300);                 // 回到"开始游戏"
  steps.push({ t: +(performance.now() / 1000).toFixed(2), focus: q.state().focus, label: document.activeElement.textContent.trim() });
  await press('Enter');                                     // 键盘开始，1-4 直接进关
  const t0 = performance.now(); while ((performance.now() - t0) / 1000 < seconds) await wait(100);
  const s = q.state();
  return { steps, final: { level: s.level, overlay: s.overlay, phase: s.phase, camera: s.camera, x: s.player && +s.player.x.toFixed(2) } };
}

let browser;
(async () => {
  // 只重编码已采好的帧（采集判定改规则时用，不必重跑实机）：ENCODE_ONLY=名字1,名字2 node capture.cjs
  if (process.env.ENCODE_ONLY) { for (const n of process.env.ENCODE_ONLY.split(',')) await encode(n.trim()); return; }
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling'] });
  const only = process.argv.slice(2);
  const list = only.length ? only : Object.keys(SEGMENTS);
  try { for (const s of list) await run(s); } catch (e) { console.error(e.message || e); process.exitCode = 1; } finally { await browser.close(); }
})();

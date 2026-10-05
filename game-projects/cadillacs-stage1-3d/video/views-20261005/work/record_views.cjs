// v2 实机录制：穆斯塔法打完整关，按计划用 C 键真实切换视角（侧视 / 正视 / 第一人称），
// 1920×1080 逐帧截图（含 HUD）+ 同局事件离线重新合成音轨。输入来自页面内 bot（真实键盘事件），不是真人操作。
// 用法：node record_views.cjs [种子] [英雄]
const path = require('path'), fs = require('fs'), cp = require('child_process');
const GAME = path.resolve(__dirname, '../../..');
const { launch, BASE, sleep } = require(path.join(GAME, 'qa/lib'));
const { BOT_SRC } = require(path.join(GAME, 'qa/bot'));
(async () => {
  const seed = +(process.argv[2] || 7), hero = +(process.argv[3] || 2);
  const W = 1920, H = 1080, fps = 30;
  const OUT = path.join(__dirname, 'capture');
  const dir = path.join(OUT, 'frames-views');
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const b = await launch();
  const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(BASE + '?test=1&clean=1&q=high&seed=' + seed, { waitUntil: 'load' });
  await page.evaluate((h) => { localStorage.clear(); localStorage.setItem('cd3d-stage1:hero', String(h)); }, hero);
  await page.reload({ waitUntil: 'load' }); await sleep(900);
  await page.evaluate(() => window.__CD_TEST__.manual(true));
  await page.evaluate(BOT_SRC);
  // 页面内：视角调度（真实 C 键事件）+ 每帧推进
  await page.evaluate(() => {
    const T = window.__CD_TEST__, order = ['side', 'oblique', 'front', 'fp'];
    const C = { fired: new Set(), queue: 0, wait: 0, log: [], playT: 0, bossT: 0, frame: 0 };
    const press = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC', key: 'c', bubbles: true })); };
    function goto(target, why) {
      const cur = T.snapshot().ui.camera;
      const n = (order.indexOf(target) - order.indexOf(cur) + 4) % 4;
      if (n) { C.queue = n; C.wait = 0; C.log.push({ frame: C.frame, from: cur, to: target, presses: n, why }); }
    }
    function rules(s) {
      const once = (k, cond, target, why) => { if (!C.fired.has(k) && cond) { C.fired.add(k); goto(target, why); } };
      if (s.mode === 'play') C.playT++;
      once('roof-front', s.area === 0 && s.mode === 'play' && C.playT > 150, 'front', '楼顶第一波打到一半：切到主角身后');
      once('roof-fp', s.area === 0 && s.wave >= 2 && s.waveOn, 'fp', '楼顶第三波：第一人称');
      once('hall-side', s.area === 1 && s.mode === 'play', 'side', '进楼：侧视看骑士像与双开门');
      once('hall-front', s.area === 1 && s.wave >= 1 && s.waveOn, 'front', '开门出敌：正视看走廊');
      once('hall-fp', s.area === 1 && s.wave >= 2 && s.waveOn, 'fp', '飞刀与胖子冲撞：第一人称');
      once('street-side', s.area === 2 && s.mode === 'play' && !s.boss, 'side', '47街：侧视看破门而出');
      once('street-front', s.area === 2 && s.wave >= 1 && s.waveOn && !s.boss, 'front', '47街第二波：正视');
      if (s.boss && s.mode === 'play') C.bossT++;
      once('boss-front', s.boss && s.mode === 'play' && C.bossT > 1, 'front', 'Boss 战：正视');
      once('boss-fp', s.boss && s.mode === 'play' && C.bossT > 420, 'fp', 'Boss 战：第一人称面对岩跳龙');
      once('boss-side', s.boss && s.mode === 'play' && C.bossT > 960, 'side', 'Boss 战收尾：回到侧视');
    }
    window.__views = C;
    window.__frame = (o) => {
      const s = T.snapshot();
      rules(s);
      if (C.queue > 0) { if (C.wait <= 0) { press(); C.queue--; C.wait = 12; } else C.wait--; }
      window.__bot.tick(o);
      T.step(1, false); T.step(1, true);
      C.frame++;
      return { mode: s.mode, area: s.area, boss: !!s.boss, cam: s.ui.camera, ended: s.mode === 'clear' && !s.script };
    };
  });
  let frame = 0, startFrame = 0;
  const timeline = [];
  const mark = (desc) => { timeline.push({ t: +(frame / fps).toFixed(2), desc }); console.log('[' + (frame / fps).toFixed(1) + 's] ' + desc); };
  const snap = async () => { await page.screenshot({ path: path.join(dir, String(frame).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 90 }); frame++; };
  const idle = async (sec) => { for (let i = 0; i < sec * fps; i++) { await page.evaluate(() => { const T = window.__CD_TEST__; T.step(1, false); T.step(1, true); }); await snap(); } };
  mark('标题画面'); await idle(2.5);
  await page.keyboard.press('Enter'); mark('选人画面'); await idle(1.5);
  await page.keyboard.press('Enter'); await sleep(150);
  startFrame = frame;
  await page.evaluate(() => { window.__views.frame = 0; window.__CD_TEST__.audioLogStart(); });
  mark('开局');
  let lastKey = '', endAt = -1;
  for (let i = 0; i < 520 * fps; i++) {
    const r = await page.evaluate((o) => window.__frame(o), { jumps: true, noSkip: true });
    await snap();
    const key = r.area + '|' + r.mode + '|' + (r.boss ? 'B' : '') + '|' + r.cam;
    if (key !== lastKey) { lastKey = key; mark(['楼顶', '大楼内部', '第47街'][r.area] + (r.boss ? ' · Boss' : '') + ' · ' + r.mode + ' · 视角 ' + r.cam); }
    if (i % 30 === 0 && endAt < 0 && await page.evaluate(() => window.__CD_TEST__.events().some(e => e.type === 'end'))) { endAt = frame; mark('游戏结束事件'); }
    if (endAt > 0 && frame - endAt > 2.5 * fps) break;
  }
  await page.evaluate(() => window.__CD_TEST__.manual(false)); await sleep(1500); await page.evaluate(() => window.__CD_TEST__.manual(true));
  mark('结算画面'); await idle(3);
  const views = await page.evaluate(() => window.__views.log);
  const events = await page.evaluate(() => window.__CD_TEST__.audioLogStop());
  const gameEvents = await page.evaluate(() => window.__CD_TEST__.events());
  const total = frame / fps, off = startFrame / fps;
  const b64 = await page.evaluate(([ev, d]) => window.__CD_TEST__.audioOffline(ev, d), [events.map(e => Object.assign({}, e, { t: e.t + off })), total]);
  const wav = path.join(dir, 'audio.wav');
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  const build = await page.evaluate(() => fetch('js/game.min.js', { cache: 'no-store' }).then(r => r.arrayBuffer()).then(buf => crypto.subtle.digest('SHA-256', buf)).then(h => Array.from(new Uint8Array(h)).map(x => x.toString(16).padStart(2, '0')).join('')));
  await b.close();
  const mp4 = path.join(OUT, 'views-run-1080p.mp4');
  cp.execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(dir, '%05d.jpg'), '-i', wav, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]);
  fs.writeFileSync(path.join(OUT, 'views-run-1080p.timeline.json'), JSON.stringify({ seed, hero, fps, width: W, height: H, frames: frame, duration: +total.toFixed(2), gameStart: +off.toFixed(2), build_game_min_js_sha256: build, input: 'bot（页面内派发真实键盘事件，含 C 键切视角与 Q/E 转头），非真人', views: views.map(v => Object.assign({}, v, { t: +(off + v.frame / fps).toFixed(2) })), timeline, gameEvents: gameEvents.filter(e => ['area', 'wave', 'waveClear', 'bossStart', 'summon', 'bossDown', 'death', 'end', 'weapon', 'eat', 'mega', 'throw', 'grab', 'lift', 'drumThrow', 'shoot', 'exit'].indexOf(e.type) >= 0).map(e => Object.assign({}, e, { video_t: +(off + e.t).toFixed(2) })) }, null, 1));
  console.log('wrote', mp4, frame, 'frames', total.toFixed(1) + 's');
})();

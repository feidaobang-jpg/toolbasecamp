// 16:9 离线逐帧录制（offline-render）：手动时钟下 bot 用真实键盘事件游玩，每 1/30 秒渲染一帧并截图（含 DOM HUD），
// 同时记录音效调用的游戏时间，最后用游戏自身的合成器离线渲染同场音轨。
// 用法：[DODGE=0] node record.js <seed> <outDir> [maxGameSeconds] [titleSeconds]
const fs = require('fs');
const path = require('path');
const { BASE, snap, launch } = require('./lib');
const { makeBot } = require('./bot');
(async () => {
  const seed = process.argv[2] || '41', outDir = process.argv[3] || '/home/claude/jk/rec/full', maxT = +(process.argv[4] || 400), titleS = +(process.argv[5] || 3);
  const W = +(process.env.VW || 1280), H = +(process.env.VH || 720), FPS = 30;
  fs.mkdirSync(path.join(outDir, 'frames'), { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '?test=1&clean=1&q=high&seed=' + seed);
  await page.waitForTimeout(1500);
  await page.evaluate(() => __JK_TEST__.manual(true));
  const t0 = Date.now();
  let frame = 0;
  const timeline = [];
  const grab = async () => { await page.screenshot({ path: path.join(outDir, 'frames', String(frame).padStart(6, '0') + '.jpg'), type: 'jpeg', quality: 92 }); frame++; };
  // 标题画面
  for (let k = 0; k < titleS * FPS; k++) { await page.evaluate(() => __JK_TEST__.step(2, true)); await grab(); }
  await page.evaluate(() => __JK_TEST__.audioLogStart());
  const startFrame = frame;
  timeline.push({ frame, t_video: +(frame / FPS).toFixed(3), name: 'pressEnter' });
  await page.keyboard.press('Enter');
  const bot = makeBot(page, { seed: +seed, dodge: process.env.DODGE !== '0' });   // DODGE=0：关闭躲子弹（v0.2 护甲演示用）
  let seen = 0, after = -1, s = null, k = 0;
  while (true) {
    const r = await page.evaluate(() => __JK_TEST__.step(2, true));
    await grab();
    const ev = await page.evaluate((n) => __JK_TEST__.events().slice(n), seen);
    seen += ev.length;
    for (const e of ev) if (!['bomb', 'grenadeLand'].includes(e.name)) timeline.push({ frame: frame - 1, t_video: +((frame - 1) / FPS).toFixed(3), t_game: e.t, name: e.name, data: e.data });
    if (r.overlay === 'result' && after < 0) { after = frame; timeline.push({ frame, t_video: +(frame / FPS).toFixed(3), name: 'resultShown' }); }
    if (after >= 0 && frame - after > 4 * FPS) break;
    if (r.t > maxT) { timeline.push({ frame, name: 'timeLimit' }); break; }
    if (++k % 3 === 0 && r.overlay === null) { s = await snap(page); await bot.tick(s); }
    if (frame % 150 === 0) {
      const el = (Date.now() - t0) / 1000;
      fs.writeFileSync(path.join(outDir, 'progress.json'), JSON.stringify({ frame, gameT: r.t, mode: r.mode, elapsed_s: Math.round(el), s_per_frame: +(el / frame).toFixed(3) }));
    }
  }
  await bot.releaseAll();
  const audioEvents = await page.evaluate(() => __JK_TEST__.audioLogStop());
  const dur = frame / FPS;
  const shifted = audioEvents.map(e => ({ t: +(e.t + startFrame / FPS).toFixed(4), n: e.n, a: e.a }));
  const au = await page.evaluate(([ev, d]) => __JK_TEST__.audioOffline(ev, d), [shifted, dur]);
  fs.writeFileSync(path.join(outDir, 'audio.wav'), Buffer.from(au.wav, 'base64'));
  const final = await snap(page);
  fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify({ seed, fps: FPS, frames: frame, duration_s: +dur.toFixed(3), startFrame, viewport: [W, H], quality: 'high', dodge: process.env.DODGE !== '0', capture: 'offline-render：手动时钟逐帧渲染 + page.screenshot（含 DOM HUD）；bot 通过真实键盘事件操作；音轨由游戏合成器按音效事件的游戏时间离线渲染', audio: { events: audioEvents.length, peak: au.peak }, final: { mode: final.mode, score: final.score, deaths: final.deaths, delivered: final.delivered, kills: final.kills }, errors, elapsed_s: Math.round((Date.now() - t0) / 1000), timeline }, null, 1));
  await browser.close();
  console.log('done', frame, 'frames', dur, 's');
})();

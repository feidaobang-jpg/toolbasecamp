// 实时录制第三关：只用正常界面与键盘操作，测试接口只读取状态；按真实规则游玩（标准 3 格护甲、无限命、无敌关闭）。
// 用法：node record.cjs <模式> [秒数]
//   run            自动试玩机器人从第三关开头打到结算（默认斜俯视）
//   run-front      同上，开局先按 4 次 C 切到「低位正视」
//   fp             第一人称短片：开局按 5 次 C，按住 W 往北开并开火
//   idle           第三关进场后完全不操作 16 秒
//   idle1          第一关进场后完全不操作 22 秒（开局保护的改动后对照，和改动前的线上录像同机位）
// JK_BASE 指向要录的入口（默认线上网站现行版本）。画面 1920×1080，CDP 高质量 JPEG 逐帧带真实时间戳，游戏声音单独录。
const fs = require('fs'), path = require('path');
const { chromium } = require('../../../node_modules/playwright');
const { makeBot } = require('../../../qa/bot.js');
const BASE = process.env.JK_BASE || 'https://www.zhengxiaohui.cn/html/game/jackal-stage1-3d/index.html';
const mode = process.argv[2] || 'run', seconds = Number(process.argv[3] || 420), STAGE = mode === 'idle1' ? 1 : 3;
const dir = path.join(__dirname, 'capture', mode + '-' + Date.now());
fs.mkdirSync(dir, { recursive: true });
async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const p = await context.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  // 把通往扬声器的声音同时接到一个录音节点上
  await p.addInitScript(() => { const connect = AudioNode.prototype.connect; AudioNode.prototype.connect = function (dest, ...args) { if (dest instanceof AudioDestinationNode) { window.__captureAudio ||= this.context.createMediaStreamDestination(); return connect.call(this, window.__captureAudio, ...args); } return connect.call(this, dest, ...args); }; });
  await p.goto(BASE + '?test=1&clean=1&q=high');
  await p.waitForFunction(() => window.__JK_TEST__ && !document.getElementById('menu').hidden);
  await p.waitForTimeout(800);
  const stageBtn = p.locator('#menu [data-opt=stage]');
  const want = STAGE === 1 ? /第一关/ : /第三关/;
  for (let k = 0; k < 3 && !want.test(await stageBtn.innerText()); k++) await stageBtn.click();
  await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(dir, 'menu.png') });
  const state = () => p.evaluate(() => __JK_TEST__.snapshot());
  const cdp = await context.newCDPSession(p), frames = [], marks = [];
  let capturing = true;
  cdp.on('Page.screencastFrame', async e => { if (capturing) { const file = String(frames.length).padStart(6, '0') + '.jpg'; fs.writeFileSync(path.join(dir, file), Buffer.from(e.data, 'base64')); frames.push({ file, timestamp: e.metadata.timestamp }); } await cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {}); });
  await p.locator('#menu [data-act=start]').click();
  let s = await state();
  if (s.stage !== STAGE || s.settings.demo || s.settings.armor !== 'std' || s.settings.lives !== 'inf') throw Error('设置或关卡不对：' + JSON.stringify(s.settings) + ' stage ' + s.stage);
  await p.evaluate(() => { window.__chunks = []; window.__rec = new MediaRecorder(__captureAudio.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 192000 }); __rec.ondataavailable = e => __chunks.push(e.data); __rec.start(200); window.__audioStart = Date.now(); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 2 });
  const started = Date.now();
  const bot = makeBot(p, { stage: 3, dodge: true, seed: 20261012 });
  const mark = (name, extra) => marks.push({ wall: +((Date.now() - started) / 1000).toFixed(2), name, ...(extra || {}) });
  console.log(JSON.stringify({ dir, mode, started, version: await p.evaluate(() => __JK_TEST__.version) }));
  if (mode === 'idle' || mode === 'idle1') {
    await p.waitForTimeout(mode === 'idle1' ? 22000 : 16000); mark('idle-end');
  } else if (mode === 'fp') {
    await p.waitForTimeout(2200);
    for (let k = 0; k < 5; k++) { await p.keyboard.press('KeyC'); await p.waitForTimeout(350); }
    mark('fp-on', { camera: (await state()).ui.camera });
    await p.waitForTimeout(900);
    await bot.setKeys(['KeyW', 'KeyJ']); await p.waitForTimeout(1500);
    await bot.setKeys(['KeyW', 'KeyJ', 'KeyK']); await p.waitForTimeout(700);
    await bot.setKeys(['KeyJ']); await p.waitForTimeout(1500);
    await bot.setKeys(['KeyW', 'KeyJ', 'KeyK']); await p.waitForTimeout(2600);
    await bot.setKeys(['KeyW', 'KeyJ']); await p.waitForTimeout(3500);
    await bot.releaseAll(); await p.waitForTimeout(800); mark('fp-end');
  } else {
    if (mode === 'run-front') { await p.waitForTimeout(1900); for (let k = 0; k < 4; k++) { await p.keyboard.press('KeyC'); await p.waitForTimeout(300); } mark('front-on', { camera: (await state()).ui.camera }); }
    let lastLog = -30, lastMi = -1, lastMark = -9, seen = 0;
    while ((Date.now() - started) / 1000 < seconds) {
      s = await state();
      if (s.settings.demo) throw Error('无敌被打开了');
      const wall = (Date.now() - started) / 1000;
      if (wall - lastMark >= 1) { lastMark = wall; marks.push({ wall: +wall.toFixed(2), t: s.t, x: s.player.x, y: s.player.y, mi: bot.mi, armor: s.player.armor, weapon: s.weapon, carried: s.carried, delivered: s.delivered, deaths: s.deaths, boss: s.boss.state, killed: s.boss.killed }); }
      if (bot.mi !== lastMi) { lastMi = bot.mi; mark('mission', { mi: bot.mi, goal: (bot.MISSION[bot.mi] || {}).type, name: (bot.MISSION[bot.mi] || {}).name || null, t: s.t }); }
      if (wall - lastLog >= 15) { lastLog = wall; console.log(JSON.stringify({ wall: Math.round(wall), t: s.t, mode: s.mode, pos: [s.player.x, s.player.y], weapon: s.weapon, carried: s.carried, delivered: s.delivered, deaths: s.deaths, mi: bot.mi, boss: s.boss.state + ':' + s.boss.killed })); }
      if (s.ui.overlay === 'result') { await bot.releaseAll(); mark('result'); await p.waitForTimeout(6000); break; }
      await bot.tick(s); await p.waitForTimeout(90);
    }
  }
  await bot.releaseAll();
  await cdp.send('Page.stopScreencast'); capturing = false;
  const audio = await p.evaluate(async () => { await new Promise(ok => { __rec.onstop = ok; __rec.stop(); }); return { start: __audioStart, data: Array.from(new Uint8Array(await new Blob(__chunks).arrayBuffer())) }; });
  fs.writeFileSync(path.join(dir, 'game-audio.webm'), Buffer.from(audio.data));
  const events = await p.evaluate(() => __JK_TEST__.events());
  const fin = await state();
  fs.writeFileSync(path.join(dir, 'capture.json'), JSON.stringify({ mode, base: BASE, version: await p.evaluate(() => __JK_TEST__.version), started, audioStart: audio.start, frames, marks, events, botLog: bot.log, finalState: { mode: fin.mode, overlay: fin.ui.overlay, t: fin.t, score: fin.score, deaths: fin.deaths, delivered: fin.delivered, weapon: fin.weapon, kills: fin.kills, boss: fin.boss, settings: fin.settings, camera: fin.ui.camera }, errors, capture_mode: 'realtime-keyboard-automation', gameplay_modified: false }, null, 1));
  console.log(JSON.stringify({ complete: true, dir, frames: frames.length, events: events.length, final: { mode: fin.mode, overlay: fin.ui.overlay, deaths: fin.deaths, delivered: fin.delivered, boss: fin.boss.state } }));
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });

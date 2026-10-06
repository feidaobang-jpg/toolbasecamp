// Complete BGM regression: decoded duration, real game source, accelerated crossing
// of the old 70s boundary, pause/continue and optional 75s real-time audio capture.
// GAMES_URLS may point at Toy previews; viewport emulation is not a physical phone.
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch { pw = require('D:/project/godot/absurd-3d-daily/node_modules/playwright'); }
const ROOT = path.resolve(__dirname, '../../..');
const OUT = process.env.GAMES_OUT || path.resolve(__dirname, 'out/full-bgm');
const URLS = JSON.parse(process.env.GAMES_URLS || '{}');
const ASSETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'game-projects/site-games/releases/bgm-full-20261007/audio-sources.json'), 'utf8')).assets;
const GAMES = {
  'jackal-stage1-3d': { start: '[data-act=start]', pause: '#btn-pause', resume: '#pause [data-act=resume]' },
  'mario-3d': { start: '[data-act=start]', pause: '#btn-pause', resume: '#pause [data-act=resume]' },
  'cadillacs-stage1-3d': { start: 'button.primary[data-act=select]', start2: '#sel-go', pause: '#btn-pause', resume: '#pause [data-act=resume]' }
};
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(detail)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
let server, browser;
(async () => {
  if (!process.env.GAMES_BASE) {
    server = http.createServer((req, res) => {
      const file = path.resolve(ROOT, 'public', '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(path.join(ROOT, 'public') + path.sep)) { res.writeHead(403).end(); return; }
      const mime = { '.js':'application/javascript', '.html':'text/html', '.css':'text/css', '.mp3':'audio/mpeg', '.wav':'audio/wav' }[path.extname(file)] || 'application/octet-stream';
      fs.readFile(file, (err, data) => { if (err) res.writeHead(404).end(); else { res.writeHead(200, { 'Content-Type':mime, 'Cache-Control':'no-store' }); res.end(data); } });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
  }
  const base = process.env.GAMES_BASE || `http://127.0.0.1:${server.address().port}/html/game/`;
  browser = await pw.chromium.launch({ executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args:['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  for (const [game, selectors] of Object.entries(GAMES)) for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport:mobile ? { width:844, height:390 } : { width:1280, height:720 }, isMobile:mobile, hasTouch:mobile });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.__bgmSources = []; window.__bgmContexts = [];
      const Native = window.AudioContext;
      window.AudioContext = class extends Native { constructor(...args) { super(...args); window.__bgmContexts.push(this); } };
      const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.buffer?.duration > 70.5) {
          this.__bgmAt = this.context.currentTime; this.__bgmStopped = false;
          window.__bgmSources.push(this);
        }
        return start.apply(this, args);
      };
      AudioBufferSourceNode.prototype.stop = function (...args) { this.__bgmStopped = true; return stop.apply(this, args); };
      window.__bgmState = () => ({ contexts:window.__bgmContexts.map(c => ({state:c.state,time:c.currentTime})), sources:window.__bgmSources.map(s => ({duration:s.buffer.duration,loop:s.loop,stopped:s.__bgmStopped,elapsed:(s.context.currentTime-s.__bgmAt)*s.playbackRate.value})) });
    });
    let frame = page.mainFrame();
    try {
      const url = URLS[game] || base + game + '/index.html';
      await page.goto(url + (url.includes('?') ? '&' : '?') + 'test=1&seed=5', { waitUntil:'load' });
      if (/bilibili\.com\/toy\//.test(url)) {
        await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => /bilibilitoy\.com/.test(f.src)), null, { timeout:30000 });
        frame = page.frames().find(f => /bilibilitoy\.com/.test(f.url()));
      }
      const decoded = await frame.evaluate(async assets => {
        const ctx = new AudioContext(), out = [];
        for (const a of assets) {
          const response = await fetch(new URL(a.file + '?v=bgmfull1', location.href));
          if (!response.ok) throw Error(`${a.file}: ${response.status}`);
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          out.push({ file:a.file, expected:a.after_seconds, decoded:buffer.duration, channels:buffer.numberOfChannels, complete:Math.abs(buffer.duration-a.source_seconds) < 0.1 });
        }
        await ctx.close(); return out;
      }, ASSETS.filter(a => a.game === game));
      check(game + (mobile ? ' mobile' : ' desktop') + ' full decoded tracks', decoded.every(d => d.complete && d.decoded > 70.5), decoded);
      await frame.locator(selectors.start).first().click();
      if (selectors.start2) { await sleep(700); await frame.locator(selectors.start2).click(); }
      await frame.waitForFunction(() => window.__bgmSources.some(s => !s.__bgmStopped), null, { timeout:20000 });
      await frame.evaluate(() => { for (const s of window.__bgmSources) if (!s.__bgmStopped) s.playbackRate.value = 32; });
      const initial = await frame.evaluate(() => window.__bgmState());
      await sleep(2600);
      const boundary = await frame.evaluate(() => window.__bgmState());
      check(game + (mobile ? ' mobile' : ' desktop') + ' crosses 70s without restart (32x audio test)', boundary.sources.length === initial.sources.length && boundary.sources.some(s => !s.stopped && s.loop && s.elapsed > 70 && s.elapsed < s.duration), { initial,boundary });
      await frame.locator(selectors.pause).click(); await sleep(500);
      const paused = await frame.evaluate(() => window.__bgmState()); await sleep(500);
      const paused2 = await frame.evaluate(() => window.__bgmState());
      check(game + ' pause freezes BGM', paused.contexts.some(c => c.state === 'suspended') && paused.sources.every((s,i) => Math.abs(s.elapsed-paused2.sources[i].elapsed) < 0.1), paused2);
      await frame.locator(selectors.resume).click(); await sleep(600);
      const resumed = await frame.evaluate(() => window.__bgmState());
      check(game + ' continue preserves source', resumed.sources.length === paused.sources.length && resumed.sources.some((s,i) => !s.stopped && s.elapsed > paused.sources[i].elapsed+5), resumed);
      await page.screenshot({ path:path.join(OUT, `${game}-${mobile?'mobile':'desktop'}.png`) });
      check(game + ' no runtime exceptions', errors.length === 0, errors);
      if (process.env.BGM_REALTIME === '1' && game === 'jackal-stage1-3d' && !mobile) {
        await frame.evaluate(() => {
          const s = window.__bgmSources.find(s => !s.__bgmStopped); s.playbackRate.value = 1;
          const tap = s.context.createMediaStreamDestination(); s.connect(tap);
          window.__bgmChunks=[]; window.__bgmRecorder=new MediaRecorder(tap.stream,{mimeType:'audio/webm'});
          window.__bgmRecorder.ondataavailable=e=>window.__bgmChunks.push(e.data);
          window.__bgmRecorder.start(); window.__realtimeAt=s.context.currentTime;
        });
        const count = resumed.sources.length;
        await sleep(75000);
        const realtime = await frame.evaluate(() => window.__bgmState());
        check(game + ' 75s real-time continuous game BGM', realtime.sources.length === count && realtime.sources.some(s=>!s.stopped), realtime);
        const recording = await frame.evaluate(async () => {
          await new Promise(r=>{window.__bgmRecorder.onstop=r; window.__bgmRecorder.stop();});
          const b=new Uint8Array(await new Blob(window.__bgmChunks,{type:'audio/webm'}).arrayBuffer());
          let text='';for(let i=0;i<b.length;i+=32768)text+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(text);
        });
        fs.writeFileSync(path.join(OUT,'jackal-real-time-bgm.webm'),Buffer.from(recording,'base64'));
      }
    } catch (e) { check(game + ' workflow', false, e.message); }
    await context.close();
  }
})().catch(e => check('test runner',false,e.stack)).finally(async () => {
  if (browser) await browser.close(); if (server) server.close();
  fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({at:new Date().toISOString(),physical_phone:false,results},null,2)+'\n');
  process.exitCode=results.every(r=>r.ok)?0:1;
});

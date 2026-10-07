// Original recordings must load, fire from gameplay, survive restart, mute and fall back on failure.
const { launch, BASE, out } = require('./lib');
const fs = require('fs');
(async () => {
  const browser = await launch(), results = [], errors = [];
  const check = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(info ?? '')}`); };
  const phone = process.env.CD_PHONE === '1';
  const host = await browser.newPage(phone ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' } : { viewport: { width: 1280, height: 720 } });
  host.on('pageerror', e => errors.push(e.message));
  await host.addInitScript(() => {
    window.audioProbe = { contexts: [], samples: [], oscillators: 0 };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target, ...args) {
      if (target === this.context.destination && !this.context.outputMeter) {
        const meter = this.context.createAnalyser(); meter.fftSize = 2048;
        this.context.outputMeter = meter; connect.call(this, meter);
      }
      return connect.call(this, target, ...args);
    };
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args); window.audioProbe.contexts.push(this);
        const makeSource = this.createBufferSource.bind(this);
        this.createBufferSource = () => {
          const s = makeSource(), start = s.start.bind(s);
          s.start = (...a) => { window.audioProbe.samples.push({ duration: s.buffer?.duration, at: a[0] ?? this.currentTime }); return start(...a); };
          return s;
        };
        const makeOsc = this.createOscillator.bind(this);
        this.createOscillator = () => { window.audioProbe.oscillators++; return makeOsc(); };
      }
    };
  });
  let page = host;
  async function navigate() {
    await host.goto(BASE + '?test=1&seed=21');
    page = host.frames().find(f => /www\.bilibilitoy\.com/.test(f.url())) || host;
    await page.waitForFunction(() => window.__CD_TEST__);
    if (await page.evaluate(() => window.__CD_TEST__.snapshot().ui.audio.volume === 0)) {
      await page.locator('#menu [data-opt="volume"]').click();
    }
  }
  const state = () => page.evaluate(() => window.__CD_TEST__.snapshot());
  const megaInput = () => phone ? page.locator('#btn-mega').tap() : host.keyboard.press('KeyU');
  async function start(hero) {
    await navigate();
    await page.locator('#menu [data-act=select]').click();
    await page.locator(`[data-hero="${hero}"]`).click();
    if (await page.locator('#sel-go').isVisible()) await page.locator('#sel-go').click();
    await page.waitForFunction(() => window.__CD_TEST__.snapshot().ui.audio.originalsLoaded.length === 11);
    await page.evaluate(() => { const T = window.__CD_TEST__; T.manual(true); T.cheat.skipScript(); T.cheat.killAll(); T.audioLogStart(); T.step(120); });
    check(`hero ${hero}: all recordings decoded`, (await state()).ui.audio.failed.length === 0);
  }
  for (let hero = 0; hero < 4; hero++) {
    await start(hero);
    const before = await page.evaluate(() => window.audioProbe.samples.length);
    await megaInput();
    await page.evaluate(() => window.__CD_TEST__.step(5, true));
    const log = await page.evaluate(() => window.__CD_TEST__.audioLogStop());
    const mega = log.find(e => e.name === 'mega');
    check(`hero ${hero}: U plays own original voice`, mega?.source === 'original' && mega.sample === ['mega-jack', 'mega-hannah', 'mega-mustapha', 'mega-mess'][hero], mega);
    check(`hero ${hero}: actual buffer source started`, await page.evaluate(n => window.audioProbe.samples.length > n, before));
  }
  for (let hero = 0; hero < 4; hero++) {
    await start(hero);
    await page.evaluate(() => { const T = window.__CD_TEST__, G = T.cheat.G, p = G.player; p.invul = 999; const id = T.cheat.enemy('ferris', 1.05, 0), e = G.actors.find(a => a.id === id); Object.assign(e, { hp: 999, maxHp: 999, cd: 999, z: p.z, x: p.x + 1.05 }); e.def = { ...e.def, aggr: 0, speed: 0 }; T.audioLogStart(); });
    for (let k = 0; k < 4; k++) { await host.keyboard.press('KeyJ'); await page.evaluate(() => window.__CD_TEST__.step(9)); }
    await page.evaluate(() => window.__CD_TEST__.step(40));
    const clog = await page.evaluate(() => window.__CD_TEST__.audioLogStop());
    const hitsL = clog.filter(e => ['punch', 'punchHeavy', 'kick', 'kickHeavy'].includes(e.name)), fin = clog.filter(e => e.name === 'finisher');
    check(`hero ${hero}: four combo hits all use the original impact`, hitsL.length >= 4 && hitsL.every(e => e.sample === 'hit' && e.source === 'original'), hitsL.map(e => e.name + ':' + e.sample));
    check(`hero ${hero}: only the last hit adds the hero's own shout`, fin.length === 1 && fin[0].sample === 'finisher-' + ['jack', 'hannah', 'mustapha', 'mess'][hero] && fin[0].t >= hitsL[hitsL.length - 1].t - 0.001, fin);
  }
  await start(0);
  const log = await page.evaluate(() => window.__CD_TEST__.audioLogStop());
  check('wave completion plays original GO', log.some(e => e.name === 'go' && e.source === 'original'), log.filter(e => e.name === 'go'));
  const goSamples = await page.evaluate(() => window.audioProbe.samples.filter(s => Math.abs(s.duration - 0.52) < 0.01));
  const gaps = goSamples.slice(-3).map((s, i, a) => i ? +(s.at - a[i - 1].at).toFixed(3) : 0).slice(1);
  check('GO is called three times 0.59 s apart (arcade timing)', goSamples.length >= 3 && gaps.every(g => Math.abs(g - 0.59) < 0.01), gaps);
  const cues = ['punch', 'punchHeavy', 'kick', 'kickHeavy', 'finisher', 'bodyfall', 'go', 'mega'];
  const events = cues.map((name, i) => ({ t: i * 1.4, name, vol: 1, hero: 'jack' }));
  const wav = await page.evaluate(e => window.__CD_TEST__.audioOffline(e, 13), events);
  const bytes = Buffer.from(wav, 'base64'); fs.writeFileSync(out('original-audio.wav'), bytes);
  let peak = 0, sum = 0;
  for (let i = 44; i < bytes.length; i += 2) { const x = bytes.readInt16LE(i) / 32768; peak = Math.max(peak, Math.abs(x)); sum += x * x; }
  check('offline capture contains audible original effects without clipping', peak > 0.1 && peak < 0.99, { peak, rms: Math.sqrt(sum / ((bytes.length - 44) / 2)) });
  await page.evaluate(() => window.__CD_TEST__.manual(false));
  await host.keyboard.press('Escape');
  await page.waitForFunction(() => window.__CD_TEST__.snapshot().ui.paused);
  check('pause freezes the same AudioContext used by recordings', await page.evaluate(() => window.audioProbe.contexts.every(c => c.state === 'suspended')));
  const pausedT = await page.evaluate(() => window.audioProbe.contexts[0].currentTime);
  await host.waitForTimeout(150);
  check('paused audio clock does not advance', await page.evaluate(t => window.audioProbe.contexts[0].currentTime === t, pausedT));
  const restart = page.locator('#pause [data-act="restart"]');
  await restart.click();
  await page.waitForFunction(() => window.audioProbe.contexts.every(c => c.state === 'running'));
  check('restart resumes audio', (await state()).ui.audio.ctx === 'running');
  await page.evaluate(() => { const T = window.__CD_TEST__; T.cheat.skipScript(); });
  await host.keyboard.press('Escape'); await page.waitForFunction(() => window.__CD_TEST__.snapshot().ui.paused);
  while ((await state()).ui.audio.volume > 0) await page.locator('#pause [data-opt="volume"]').click();
  await host.keyboard.press('Escape'); await page.waitForFunction(() => !window.__CD_TEST__.snapshot().ui.paused);
  await host.waitForTimeout(150);
  const silent = await page.evaluate(() => {
    const meter = window.audioProbe.contexts[0].outputMeter, data = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(data); return Math.max(...data.map(Math.abs));
  });
  check('menu mute makes the speaker output silent', silent < 0.00001, silent);
  // Simulated loading failure must leave the game usable and synthesize the event immediately.
  await host.route('**/cd-*.wav*', r => r.abort());
  await navigate();
  await page.locator('#menu [data-act=select]').click(); await page.locator('[data-hero="0"]').click();
  if (await page.locator('#sel-go').isVisible()) await page.locator('#sel-go').click();
  await page.waitForFunction(() => window.__CD_TEST__.snapshot().ui.audio.failed.length === 11);
  await page.evaluate(() => { const T = window.__CD_TEST__; T.manual(true); T.cheat.skipScript(); T.audioLogStart(); T.step(120); });
  const oscBefore = await page.evaluate(() => window.audioProbe.oscillators);
  await megaInput(); await page.evaluate(() => window.__CD_TEST__.step(5));
  const fallback = await page.evaluate(() => window.__CD_TEST__.audioLogStop().find(e => e.name === 'mega'));
  check('missing recording uses synthesized fallback', fallback?.source === 'fallback' && await page.evaluate(n => window.audioProbe.oscillators > n, oscBefore), fallback);
  check('no JavaScript errors', errors.length === 0, errors);
  fs.writeFileSync(out('original-audio.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close(); process.exit(results.some(r => !r.pass) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

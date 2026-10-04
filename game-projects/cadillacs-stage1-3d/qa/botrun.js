// 让 bot 用手动时钟打完整关：node qa/botrun.js [英雄序号 0-3] [种子] [耐久 std|easy|classic]
const { launch, BASE, out, sleep } = require('./lib');
const { BOT_SRC } = require('./bot');
(async () => {
  const hero = +(process.argv[2] || 2), seed = +(process.argv[3] || 7), dur = process.argv[4] || 'std';
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(BASE + '?test=1&seed=' + seed, { waitUntil: 'load' });
  await sleep(800);
  await page.evaluate(([h, d]) => { localStorage.setItem('cd3d-stage1:hero', String(h)); localStorage.setItem('cd3d-stage1:dur', JSON.stringify(d)); }, [hero, dur]);
  await page.reload({ waitUntil: 'load' }); await sleep(800);
  await page.keyboard.press('Enter'); await sleep(200);
  await page.keyboard.press('Enter'); await sleep(300);
  await page.evaluate(() => window.__CD_TEST__.manual(true));
  await page.evaluate(BOT_SRC);
  const t0 = Date.now();
  let snap;
  for (let i = 0; i < 40; i++) {
    snap = await page.evaluate(() => window.__bot.run(15, { jumps: true }));
    const ev = await page.evaluate(() => window.__CD_TEST__.events());
    const ended = ev.find(e => e.type === 'end');
    console.log('t=' + snap.t, 'area', snap.area, 'mode', snap.mode, 'x', snap.player.x, 'hp', snap.player.hp, 'wave', snap.wave, 'enemies', snap.enemies, 'score', snap.score, snap.boss ? 'boss ' + JSON.stringify(snap.boss) : '');
    if (ended) break;
  }
  const ev = await page.evaluate(() => window.__CD_TEST__.events());
  const counts = {}; ev.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
  console.log('events', JSON.stringify(counts));
  console.log('end', JSON.stringify(ev.filter(e => ['end', 'death', 'area', 'bossStart', 'bossDown', 'summon'].indexOf(e.type) >= 0)));
  console.log('kills', JSON.stringify(snap.kills), 'bot', JSON.stringify(await page.evaluate(() => window.__bot.stats)), 'real', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  const endE = ev.find(e => e.type === 'end');
  require('fs').appendFileSync(out('bot-runs.jsonl'), JSON.stringify({ date: new Date().toISOString(), hero, seed, dur, win: !!(endE && endE.win), gameSeconds: endE ? endE.t : snap.t, score: snap.score, deaths: ev.filter(e => e.type === 'death').length, summons: ev.filter(e => e.type === 'summon').length, kills: snap.kills, errors: errs.length }) + String.fromCharCode(10));
  await page.evaluate(() => window.__CD_TEST__.manual(false));
  await sleep(1200);
  await page.screenshot({ path: out('botrun-end-h' + hero + '.png') });
  console.log(errs.slice(0, 10).join('\n'));
  await b.close();
})();

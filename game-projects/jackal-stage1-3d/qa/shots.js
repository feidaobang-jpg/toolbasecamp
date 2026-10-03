// bot 游玩（手动时钟）时在关键事件处渲染并截图
const fs = require('fs');
const { BASE, snap, launch } = require('./lib');
const { makeBot } = require('./bot');
(async () => {
  const seed = process.argv[2] || '11', outDir = process.argv[3] || 'out/shots', W = +(process.argv[4] || 1280), H = +(process.argv[5] || 720);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => console.log('ERR', e.message));
  await page.goto(BASE + '?test=1&clean=1&q=high&seed=' + seed);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter');
  await page.evaluate(() => __JK_TEST__.manual(true));
  const bot = makeBot(page);
  const want = { kill: 2, staticDestroyed: 3, powFreed: 2, upgrade: 2, powPicked: 1, powDelivered: 1, bossFight: 1, bossDamaged: 2, bossTankDown: 2, stageClear: 1, starRevealed: 1, playerDown: 1, respawn: 1, checkpoint: 2 };
  const got = {}; const delayed = [];
  let seen = 0, n = 0, s;
  const shoot = async (name) => { await page.evaluate(() => __JK_TEST__.step(1, true)); const f = outDir + '/' + String(++n).padStart(2, '0') + '-' + name + '.png'; await page.screenshot({ path: f }); console.log('shot', f); };
  await shoot('intro');
  while (true) {
    const r = await page.evaluate(() => __JK_TEST__.step(6, false));
    if (r.overlay === 'result') { await page.waitForTimeout(500); await page.screenshot({ path: outDir + '/' + String(++n).padStart(2, '0') + '-result.png' }); break; }
    if (r.t > 600) break;
    s = await snap(page);
    const ev = await page.evaluate((k) => __JK_TEST__.events().slice(k), seen);
    seen += ev.length;
    for (const e of ev) {
      if (want[e.name] && (got[e.name] || 0) < want[e.name]) { got[e.name] = (got[e.name] || 0) + 1; delayed.push({ at: s.t + (e.name === 'stageClear' ? 2.5 : e.name === 'bossFight' ? 4 : e.name === 'staticDestroyed' ? 0.25 : 0.12), name: e.name + (e.data && e.data.name ? '-' + e.data.name : e.data && e.data.type ? '-' + e.data.type : '') }); }
    }
    for (let i = delayed.length - 1; i >= 0; i--) if (s.t >= delayed[i].at) { const d = delayed.splice(i, 1)[0]; await shoot(d.name); }
    await bot.tick(s);
  }
  await browser.close();
})();

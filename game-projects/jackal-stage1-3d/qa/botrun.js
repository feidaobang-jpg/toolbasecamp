// 手动时钟下让 bot 打完整关（逻辑逐步推进、不逐帧渲染），输出结果与事件摘要
const fs = require('fs');
const { BASE, snap, launch } = require('./lib');
const { makeBot } = require('./bot');
(async () => {
  const seed = process.argv[2] || '11', limit = +(process.argv[3] || 900), out = process.argv[4];
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: +(process.env.VW || 1280), height: +(process.env.VH || 720) } });
  // ARMOR=classic：v0.2 的「经典一发」对照（预先写入菜单设置）
  if (process.env.ARMOR) await page.addInitScript((v) => { try { localStorage.setItem('jk3d-stage1:armor', JSON.stringify(v)); } catch (e) {} }, process.env.ARMOR);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '?test=1&clean=1&q=' + (process.env.Q || 'low') + '&seed=' + seed);
  await page.waitForTimeout(800);
  await page.evaluate(() => __JK_TEST__.manual(true));
  await page.keyboard.press('Enter');
  const bot = makeBot(page, { seed: +seed, dodge: process.env.DODGE !== '0' });   // DODGE=0：关闭躲子弹，模拟手生的玩家
  let s, k = 0, last = 0;
  const t0 = Date.now();
  while (true) {
    const r = await page.evaluate(() => __JK_TEST__.step(6, false));
    if (r.overlay === 'result') break;
    if (r.t > limit) break;
    s = await snap(page);
    await bot.tick(s);
    if (++k % 100 === 0) { console.log('t=' + s.t, 'pos', s.player.x, s.player.y, 'mi', bot.mi, (bot.MISSION[bot.mi] || {}).type, 'deaths', s.deaths, 'carried', s.carried, 'deliv', s.delivered, 'w', s.weapon, 'boss', JSON.stringify(s.boss)); }
  }
  if (process.env.SHOT) { await page.evaluate(() => __JK_TEST__.step(30, false)); await page.evaluate(() => __JK_TEST__.step(1, true)); await page.screenshot({ path: process.env.SHOT }); }   // 结算画面截图
  s = await snap(page);
  const ev = await page.evaluate(() => __JK_TEST__.events());
  const end = ev.find(e => e.name === 'end');
  const summary = { seed, real_s: Math.round((Date.now() - t0) / 1000), mode: s.mode, overlay: s.ui.overlay, t: s.t, deaths: s.deaths, delivered: s.delivered, freed: s.freed, kills: s.kills, score: s.score, weapon: s.weapon, end: end && end.data, armorMode: s.settings.armor, dodge: process.env.DODGE !== '0', hits: ev.filter(e => e.name === 'playerHit').length, kitsDropped: ev.filter(e => e.name === 'kitDropped').length, kitsPicked: ev.filter(e => e.name === 'kitPicked').length, refills: ev.filter(e => e.name === 'checkpoint' && e.data.refill).length, errors, botLog: bot.log.slice(-30), deathsAt: ev.filter(e => e.name === 'playerDown').map(e => e.data) };
  console.log(JSON.stringify(summary, null, 1));
  if (out) fs.writeFileSync(out, JSON.stringify({ summary, events: ev }, null, 1));
  await browser.close();
})();

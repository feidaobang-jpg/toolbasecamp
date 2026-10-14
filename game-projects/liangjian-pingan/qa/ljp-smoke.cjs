// 李家坡冒烟：从每个阶段开局跑一段（手动步进），截图并收集报错。用法：node cy-smoke.cjs [阶段…]
const { open, shot, start } = require('./lib.cjs');
const phases = process.argv.slice(2).map(Number).filter(Boolean);

(async () => {
  const { browser, page, errors } = await open({ ch: 'lijiapo' });
  const out = {};
  await shot(page, 'ljp-title.png');
  for (const sp of phases.length ? phases : [1, 2, 3, 4, 5]) {
    await page.evaluate((p) => { const a = __lj.app; a.s.startPhase = p; a.s.lives = 'inf'; a.s.view = 0; }, sp);
    await page.evaluate(() => __lj.manual(true));
    await page.evaluate(() => { const a = __lj.app; if (a.state !== 'menu') a.toMenu(); a.start(false); });
    await page.waitForFunction(() => __lj.app.state === 'play', null, { timeout: 5000 });
    const rows = [];
    for (let k = 0; k < 8; k++) {
      const s = await page.evaluate(() => { for (let i = 0; i < 60; i++) __lj.step(1, false); __lj.step(0, true); const g = __lj.game; return { phase: g.phase, t: +g.t.toFixed(1), cut: +g.cut.toFixed(1), enemies: g.enemies.filter((e) => e.alive).length, obj: document.getElementById('objective').textContent, dug: +g.world.trench.dug.toFixed(1), lit: g.lit, voices: __lj.app.audio.log.filter((x) => x.startsWith('voice:')).slice(-3) }; });
      rows.push(s);
      if (k === 2 || k === 7) await shot(page, `ljp-p${sp}-${k}.png`);
    }
    out['p' + sp] = rows;
  }
  console.log(JSON.stringify(out, null, 1));
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})();

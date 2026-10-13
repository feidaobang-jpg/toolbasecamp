// 冒烟：能加载、能开局、五个阶段各自能启动并跑上几秒不报错，顺手截图
const { open, shot } = require('./lib.cjs');

(async () => {
  const { browser, page, errors } = await open();
  const log = [];
  await page.waitForTimeout(600);
  await shot(page, 'smoke-menu.png');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  log.push(await page.evaluate(() => ({ state: __lj.app.state, phase: __lj.game.phase, enemies: __lj.game.enemies.length, allies: __lj.game.allies.length, info: __lj.info() })));
  await page.evaluate(() => __lj.manual(true));
  for (let p = 1; p <= 5; p++) {
    await page.evaluate((n) => { __lj.game.reset(n, false); __lj.step(240, true); }, p);
    await shot(page, `smoke-phase${p}.png`);
    log.push(await page.evaluate(() => ({ phase: __lj.game.phase, t: +__lj.game.t.toFixed(1), hero: [+__lj.game.hero.x.toFixed(1), +__lj.game.hero.z.toFixed(1)], hp: __lj.game.hero.hp, enemies: __lj.game.enemies.filter((e) => e.alive).length, info: __lj.info() })));
  }
  console.log(JSON.stringify(log, null, 1));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

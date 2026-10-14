// 苍云岭过场与关键画面截图（只看镜头和摆位，不验证玩法）：抓舌头、望远镜、楚云飞、炮弹跟拍、柱子报偏差、坂田、结尾
const { open, shot } = require('./lib.cjs');
const run = (page, sec) => page.evaluate((n) => { for (let i = 0; i < n; i++) __lj.step(1, false); __lj.step(0, true); }, Math.round(sec * 60));

(async () => {
  const { browser, page, errors } = await open({ ch: 'cangyunling' });
  const begin = async (sp) => {
    await page.evaluate((p) => { const a = __lj.app; a.s.startPhase = p; a.s.lives = 'inf'; a.s.view = 0; __lj.manual(true); if (a.state !== 'menu') a.toMenu(); a.start(false); }, sp);
    await page.waitForFunction(() => __lj.app.state === 'play', null, { timeout: 5000 });
  };
  const notes = [];
  // 抓舌头过场：把军曹放到主角跟前、打倒，再按 I
  await begin(2);
  await run(page, 1);
  await page.evaluate(() => { const g = __lj.game, t = g.tongue, h = g.hero; for (const e of g.enemies) if (e !== t && e.type !== 'mortar') { e.alive = false; e.deadT = 9; } g.place(t, h.x + 1, h.z - 1.2); g.hurtUnit(t, 99, 0, -1, 'bullet'); });
  await run(page, 0.5);
  notes.push(await page.evaluate(() => ({ downed: __lj.game.tongue.downed, alive: __lj.game.tongue.alive, use: document.getElementById('prompt').textContent })));
  await shot(page, 'cy-scene-downed.png');
  await page.evaluate(() => { __lj.app.input.key('KeyI', true, false); __lj.app.input.key('KeyI', false, false); });
  await run(page, 2); await shot(page, 'cy-scene-capture1.png');
  await run(page, 9); await shot(page, 'cy-scene-capture2.png');
  await run(page, 14); await run(page, 3); await shot(page, 'cy-scene-binoc.png');
  await run(page, 8); await shot(page, 'cy-scene-talk.png');
  // 楚云飞：直接把炮组送到炮位
  await page.evaluate(() => { const g = __lj.game; g.endScene(true); g.pathI = 7; for (const e of g.enemies) { e.alive = false; e.deadT = 9; } });
  await run(page, 1.5); await shot(page, 'cy-scene-chu1.png');
  await run(page, 6); await shot(page, 'cy-scene-chu2.png');
  await run(page, 7);
  // 第四阶段：上炮、瞄一个偏的点放炮
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, g.cannon.x + 0.4, g.cannon.z + 2.2); });
  await run(page, 0.3);
  await page.evaluate(() => { __lj.app.input.key('KeyI', true, false); __lj.app.input.key('KeyI', false, false); });
  await run(page, 0.5);
  await page.evaluate(() => { const g = __lj.game; g.cam.yaw = g.cannon.aimYaw = 0.2; g.cannon.elev = 1.08; });
  await run(page, 0.5); await shot(page, 'cy-scene-aim-tp.png');
  await page.evaluate(() => { __lj.game.setView(1); });
  await run(page, 0.5); await shot(page, 'cy-scene-aim-fp.png');
  notes.push(await page.evaluate(() => document.getElementById('aim-info').textContent));
  await page.evaluate(() => { const i = __lj.app.input; i.key('KeyJ', true, false); });
  await run(page, 0.1); await page.evaluate(() => { __lj.app.input.key('KeyJ', false, false); });
  await run(page, 2); await shot(page, 'cy-scene-shell.png');
  await run(page, 3.0); await shot(page, 'cy-scene-impact.png');
  await run(page, 2.5); await shot(page, 'cy-scene-report.png');
  notes.push(await page.evaluate(() => ({ dialog: document.getElementById('dialog').textContent, toast: document.getElementById('toast').textContent, shells: __lj.game.cannon.shells })));
  // 第五阶段坂田
  await page.evaluate(() => { const a = __lj.app; a.saveEnding('miss'); });
  await begin(5);
  await run(page, 3); await shot(page, 'cy-scene-boss.png');
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, -22, -104); });
  await run(page, 6); await shot(page, 'cy-scene-boss2.png');
  await page.evaluate(() => { const g = __lj.game; g.hurtUnit(g.boss, 999, 0, 0, 'bullet'); });
  await run(page, 4); await page.evaluate(() => { const g = __lj.game; g.place(g.hero, 10, -150); });
  await run(page, 1); await shot(page, 'cy-scene-win1.png');
  await run(page, 4); await shot(page, 'cy-scene-win2.png');
  console.log(JSON.stringify(notes, null, 1));
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})();

// 李家坡关键画面截图（人工看）：七七二团冲锋、土工掘进过场、夜里挖壕和照明弹、交通壕、拂晓过场、手榴弹雨、碉堡炸塌、突击、射击孔、山崎
// 场面用状态捷径摆出来，截图只用来人工看画面，不代替机制检查（见 ljp-story.cjs）
const { open, shot } = require('./lib.cjs');

(async () => {
  const { browser, page, errors } = await open({ ch: 'lijiapo' });
  const step = (sec) => page.evaluate((n) => { for (let i = 0; i < n; i++) __lj.step(1, false); __lj.step(0, true); }, Math.round(sec * 60));
  const begin = async (sp) => {
    await page.evaluate((p) => { const a = __lj.app; a.s.startPhase = p; a.s.lives = 'inf'; a.s.view = 0; a.demo = true; __lj.manual(true); if (a.state !== 'menu') a.toMenu(); a.start(false); }, sp);
    await page.waitForFunction(() => __lj.app.state === 'play', null, { timeout: 5000 });
  };
  const look = (x, y, z) => page.evaluate(([tx, ty, tz]) => { const g = __lj.game, c = g.camera.position; g.cam.yaw = Math.atan2(-(tx - c.x), -(tz - c.z)); g.cam.pitch = Math.atan2(ty - c.y, Math.hypot(tx - c.x, tz - c.z)); }, [x, y, z]);
  const snap = async (name) => { await step(0.05); await shot(page, `ljp-scene-${name}.png`); };

  // 第一阶段：七七二团冲锋，坡顶机枪压制
  await begin(1);
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, -14, 44); g.chargeT = 0; });
  await step(4.2); await look(0, 8, 0); await step(0.3); await look(0, 8, 0); await snap('p1-charge');
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, -22, 27); });
  await step(0.5); await look(-30, 3, 24); await step(0.3); await look(-30, 3, 24); await snap('p1-post');
  // 土工掘进过场
  await page.evaluate(() => { const g = __lj.game; for (const e of g.enemies) g.killUnit(e, true); g.digScene(); });
  await step(2); await snap('cut-dig1');
  await step(5.5); await snap('cut-dig2');
  await step(12); await snap('cut-dig3');
  await page.evaluate(() => { if (__lj.game.scn) __lj.game.endScene(true); });
  // 第二阶段：挖壕、照明弹
  await step(0.5);
  await page.evaluate(() => { const g = __lj.game, tr = g.world.trench; g.world.setDug(24); const p = tr.pointAt(23); g.place(g.hero, p.x, p.z); g.flareT = 999; g.startDig(); });
  await step(1.5); await look(4, 6, 10); await step(0.2); await look(4, 6, 10); await snap('p2-dig-dark');
  await page.evaluate(() => { const g = __lj.game, q = g.world.trench.pointAt(g.world.trench.dug); g.launchFlare(-6, -36, q.x + 2, q.z - 10); });
  await step(3.5); await snap('p2-flare');
  await page.evaluate(() => { const g = __lj.game; g.digging = false; const p = g.world.trench.pointAt(14); g.place(g.hero, p.x + 4, p.z + 2); });
  await step(0.5); await look(-2, 4, 26); await step(0.3); await look(-2, 4, 26); await snap('p2-trench');
  await page.evaluate(() => { const g = __lj.game; g.cam.view = 1; });
  await page.evaluate(() => { const g = __lj.game, p = g.world.trench.pointAt(20); g.place(g.hero, p.x, p.z); });
  await step(0.5); await look(4, 6, 10); await step(0.3); await look(4, 6, 10); await snap('p2-trench-fp');
  await page.evaluate(() => { __lj.game.cam.view = 0; });
  // 拂晓过场
  await page.evaluate(() => { const g = __lj.game; for (const e of g.enemies) g.killUnit(e, true); g.world.setDug(g.world.trench.total); g.dawnScene(); });
  await step(3); await snap('cut-dawn1');
  await step(14); await snap('cut-dawn2');
  await page.evaluate(() => { if (__lj.game.scn) __lj.game.endScene(true); });
  // 第三阶段：手榴弹雨
  await step(15.5);
  await look(0, 15, -31); await step(0.3); await look(0, 15, -31); await snap('p3-mark');
  await page.evaluate(() => { __lj.app.input.key('KeyG', true, false); __lj.step(1, false); __lj.app.input.key('KeyG', false, false); });
  await step(1.3); await snap('p3-rain');
  await page.evaluate(() => { const g = __lj.game; g.destroyBunker(g.world.bunkers[1], true); });
  await step(2.5); await snap('p3-ruin');
  // 第四阶段
  await begin(4);
  await page.evaluate(() => { const g = __lj.game; g.place(g.hero, -6, -31); });
  await step(2.5); await look(-6, 15, -45); await step(0.2); await look(-6, 15, -45); await snap('p4-charge');
  // 第五阶段：射击孔、山崎
  await begin(5);
  await page.evaluate(() => { const g = __lj.game; for (const e of g.enemies) g.killUnit(e, true); g.place(g.hero, 3, -36); });
  await step(1); await look(0, 15.5, -46); await step(0.3); await look(0, 15.5, -46); await snap('p5-ports');
  await page.evaluate(() => { const g = __lj.game; for (const p of g.world.cp.ports) if (p.alive) g.silencePort(p); });
  await step(3); await snap('cut-yamazaki');
  await page.evaluate(() => { if (__lj.game.scn) __lj.game.endScene(true); });
  await page.evaluate(() => { const g = __lj.game, b = g.boss; for (const e of g.enemies) if (e !== b) g.killUnit(e, true); g.place(g.hero, b.x + 2, b.z + 7); });
  await step(1.6); await look(-0, 15.4, -44); await snap('p5-boss');
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(2); });

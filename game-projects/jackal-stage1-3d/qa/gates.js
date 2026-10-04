// 大门投弹回归：使用正式包和真实键盘/触屏输入，测试钩子仅定位与推进时钟。
// JK_BASE 可指向网站、当地服务或 Toy 预览；JK_CHANNEL=msedge 使用本机 Edge。
const assert = require('node:assert/strict');
const { BASE, launch } = require('./lib');

(async () => {
  const browser = await launch();
  const results = [];
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext(mobile
        ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const step = n => page.evaluate(n => __JK_TEST__.step(n, false), n);
      for (const c of [
        { name: '第一关贴门', stage: 1, x: 0, y: 53, dir: 0, gone: true },
        { name: '第一关顶住门', stage: 1, x: 0, y: 54, dir: 0, gone: true },
        { name: '第一关原距离', stage: 1, x: 0, y: 47, dir: 0, gone: true },
        { name: '第一关斜向', stage: 1, x: -2, y: 53, dir: 1, gone: true },
        { name: '第一关门后向南', stage: 1, x: 0, y: 59, dir: 4, gone: true },
        { name: '第一关火箭', stage: 1, x: 0, y: 53, dir: 0, weapon: 2, gone: true },
        { name: '第二关前门', stage: 2, x: 4, y: 79, dir: 0, gone: true },
        { name: '第二关后门', stage: 2, x: 15, y: 106, dir: 0, gate: 1, gone: true },
        { name: '第二关后门向南', stage: 2, x: 15, y: 112, dir: 4, gate: 1, gone: true },
        { name: '背对门不吸附', stage: 1, x: 0, y: 53, dir: 4, gone: false, land: [0, 44] },
        { name: '超出射程不吸附', stage: 1, x: 0, y: 40, dir: 0, gone: false, land: [0, 49] },
        { name: '机枪仍不能破门', stage: 1, x: 0, y: 53, dir: 0, gun: true, gone: false }
      ]) {
        await page.goto(BASE + (BASE.includes('?') ? '&' : '?') + 'test=1&seed=7&q=low');
        await page.waitForFunction(() => typeof __JK_TEST__ !== 'undefined');
        await page.evaluate(stage => {
          localStorage.setItem('jk3d-stage1:unlocked', '2');
          localStorage.setItem('jk3d-stage1:stage', String(stage));
        }, c.stage);
        await page.reload();
        await page.waitForFunction(() => typeof __JK_TEST__ !== 'undefined');
        if (mobile) await page.locator('#menu [data-act=start]').tap();
        else await page.keyboard.press('Enter');
        await page.evaluate(c => {
          const t = __JK_TEST__; t.manual(true); t.step(140, false);
          // 第二关轰炸机会截住第三颗手雷；隔离空中敌人，专测静态门的落点。
          t.cheat.kill('bomber');
          t.cheat.teleport(c.x, c.y); t.cheat.invuln(60); t.cheat.weapon(c.weapon || 1);
          t.cheat.state().P.dir = c.dir;
        }, c);
        const before = await page.evaluate(() => __JK_TEST__.snapshot());
        assert.equal(before.stage, c.stage);
        for (let shot = 0; shot < 2; shot++) {
          if (mobile) await page.locator(c.gun ? '#btn-fire' : '#btn-bomb').tap();
          else await page.keyboard.down(c.gun ? 'KeyJ' : 'KeyK');
          await step(2);
          if (!mobile) await page.keyboard.up(c.gun ? 'KeyJ' : 'KeyK');
          await step(45);
          const s = await page.evaluate(() => __JK_TEST__.snapshot());
          assert.equal(s.gates[c.gate || 0].alive, !c.gone || shot === 0, c.name + ' shot ' + (shot + 1));
        }
        if (c.land) {
          const lands = await page.evaluate(() => __JK_TEST__.events().filter(e => e.name === 'grenadeLand'));
          assert.deepEqual([lands.at(-1).data.x, lands.at(-1).data.y], c.land);
        }
        if (c.gone && !c.weapon) {
          // 门摧毁后再次投掷，落点恢复正常九米，不能被残骸继续截住。
          if (mobile) await page.locator('#btn-bomb').tap();
          else await page.keyboard.down('KeyK');
          await step(2);
          if (!mobile) await page.keyboard.up('KeyK');
          await step(45);
          const land = await page.evaluate(() => __JK_TEST__.events().filter(e => e.name === 'grenadeLand').at(-1).data);
          assert.ok(Math.abs(Math.hypot(land.x - c.x, land.y - c.y) - 9) < 0.15, c.name + ' destroyed gate: ' + JSON.stringify(land));
        }
        results.push({ device: mobile ? 'touch' : 'desktop', name: c.name, pass: true });
        console.log('PASS ' + results.at(-1).device + ' ' + c.name);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(JSON.stringify({ passed: results.length, base: BASE, results }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

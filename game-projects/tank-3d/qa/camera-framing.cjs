// 实际浏览器检查斜俯视跟随、全图、真实输入及横竖布局；可复用于网站和 Toy 预览。
// TANK_URL / TANK_OUT / PLAYWRIGHT_MODULE；TANK_BASELINE_SCENE 可注入已保存的旧构建做同局面对照。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const url = process.env.TANK_URL || 'http://127.0.0.1:8783/public/html/game/tank-3d/index.html';
const out = process.env.TANK_OUT;
const baseline = process.env.TANK_BASELINE_SCENE;
const results = [];
const record = (name, data) => { results.push({ name, data }); console.log(name, JSON.stringify(data)); };
function pose(q, x = 96, y = 96) {
  const p = q.world.player;
  Object.assign(p, { x, y, ox: x, oy: y, invuln: 0, shield: 0, dir: 0 });
  q.view.snap = true; q.view.shake = 0;
  q.view.update(1 / 60, 1);
}
function measurement() {
  const q = __TANK_TEST__, c = q.view.camera, p = q.world.player;
  c.updateMatrixWorld();
  const W = q.state().display.W, H = q.state().display.H;
  const project = (x, y, z) => { const v = c.position.clone().set(x, y, z).project(c); return { x: (v.x + 1) * W / 2, y: (1 - v.y) * H / 2, z: v.z }; };
  const x = (p.x + 8) / 8 - 13, z = (p.y + 8) / 8 - 13;
  const feet = project(x, 0, z), head = project(x, 1.3, z);
  const corners = [-13, 13].flatMap(x => [-13, 13].map(z => project(x, 0, z)));
  return { camera: c.position.toArray(), feet, head, tankHeight: feet.y - head.y, corners, W, H, state: q.state(), stats: q.renderInfo() };
}
(async () => {
  assert.ok(out, 'TANK_OUT required'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) {
      const mobile = viewport.width !== 1280;
      const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, recordVideo: { dir: out, size: viewport } });
      const page = await ctx.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
      if (baseline) await page.route('**/scene.js*', route => route.fulfill({ body: fs.readFileSync(baseline), contentType: 'text/javascript' }));
      let game = page;
      await page.goto(url + (url.includes('?') ? '&' : '?') + 'test=1');
      if (/bilibili\.com\/toy\//.test(url)) {
        await page.locator('iframe[src*="bilibilitoy.com"]').waitFor();
        game = await (await page.locator('iframe[src*="bilibilitoy.com"]').elementHandle()).contentFrame();
        await game.goto(game.url().split('?')[0] + '?test=1');
      }
      await game.waitForFunction(() => window.__TANK_TEST__ && window.__tankReady);
      assert.deepEqual(await game.evaluate(()=>[__TANK_TEST__.settings.camera.classic,__TANK_TEST__.settings.camera.remix]),[1,0],'classic top/remix oblique defaults preserved');
      if (mobile) await game.locator('[data-control-mode=show]').first().click();
      await game.locator('[data-act=start]').first().click();
      await game.evaluate(() => { const q = __TANK_TEST__; q.manual(true); q.skipCurtain(); q.step(180); q.view.setPreset(0); });
      await game.evaluate(pose.toString() + '(__TANK_TEST__)');
      const start = await game.evaluate(measurement);
      await page.screenshot({ path: path.join(out, `${viewport.width}x${viewport.height}-oblique.png`) });
      record('oblique', { viewport, ...start });
      if (!baseline) {
        // 通过测试传送覆盖四角和中心，检查旋转后主角不落到屏幕外。
        for (const [x, y] of [[0, 0], [192, 0], [0, 192], [192, 192], [96, 96]]) {
          for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
            await game.evaluate(([x,y,yaw,fn]) => { const q = __TANK_TEST__; q.view.yawOffset = yaw; (0,eval)(`(${fn})(__TANK_TEST__,${x},${y})`); }, [x, y, yaw, pose.toString()]);
            const m = await game.evaluate(measurement);
            assert.ok(m.feet.x > 0 && m.feet.x < m.W && m.head.y > 0 && m.feet.y < m.H, 'tank stays visible');
          }
        }
        await game.evaluate(pose.toString() + '(__TANK_TEST__)');
        const oldCamera = await game.evaluate(() => __TANK_TEST__.view.camera.position.toArray());
        await game.evaluate(() => { const q=__TANK_TEST__; q.world.terrain.brick.fill(0);q.world.terrain.steel.fill(0);q.world.terrain.water.fill(0);q.world.bots.length=0;q.world.rosterIndex=q.world.roster.length;q.world.remaining=99;q.view.yawOffset=0; });
        await game.press('#app','w'); // 真实键盘通道；长按在模拟帧里推进。
        await game.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW',bubbles:true})));
        await game.evaluate(() => __TANK_TEST__.step(30));
        await game.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW',bubbles:true})));
        const moved = await game.evaluate(measurement);
        assert.ok(moved.state.player.y < 96, 'actual movement');
        assert.ok(Math.abs(moved.camera[2]-oldCamera[2]) > .1, 'camera follows actual movement');
        await game.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyJ',bubbles:true})));
        await game.evaluate(() => __TANK_TEST__.step(1));
        await game.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyJ',bubbles:true})));
        assert.ok(await game.evaluate(() => __TANK_TEST__.world.playerShots > 0), 'actual shooting');
        record('movement-and-shooting', { viewport, player: moved.state.player, camera: moved.camera });
      }
      await game.evaluate(() => {const q=__TANK_TEST__;q.view.setPreset(1);q.view.update(1/60,1);});
      const top = await game.evaluate(measurement);
      assert.ok(top.corners.every(p => p.x >= 0 && p.x <= top.W && p.y >= 0 && p.y <= top.H), 'top retains full battlefield');
      record('top-full-map', { viewport, camera: top.camera, corners: top.corners });
      await page.screenshot({ path: path.join(out, `${viewport.width}x${viewport.height}-top.png`) });
      if (!baseline) {
        for (let i=2;i<5;i++) { await game.evaluate(i=>{const q=__TANK_TEST__;q.view.setPreset(i);q.view.update(1/60,1);},i); await page.screenshot({path:path.join(out,`${viewport.width}x${viewport.height}-preset${i}.png`)}); }
        await game.evaluate(()=>{const q=__TANK_TEST__;q.view.setPreset(0);q.world.player.invuln=999;q.manual(false);q.perfStart();});
        await game.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE',bubbles:true})));
        await page.waitForTimeout(4500);
        await game.evaluate(() => document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyE',bubbles:true})));
        const perf = await game.evaluate(()=>{const q=__TANK_TEST__;const p=q.perfStop();q.manual(true);return {...p,renderer:q.view.renderer.getContext().getParameter(q.view.renderer.getContext().RENDERER),stats:q.renderInfo()};});
        const sorted=perf.frames.slice().sort((a,b)=>a-b),avg=sorted.reduce((a,b)=>a+b,0)/sorted.length;
        assert.ok(sorted.length>30,'realtime render frames collected');
        record('continuous-orbit-performance',{viewport,frames:sorted.length,averageFps:1000/avg,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],over50ms:sorted.filter(n=>n>50).length,renderer:perf.renderer,stats:perf.stats});
      }
      assert.deepEqual(errors, []); await ctx.close();
    }
    fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify({url,baseline:!!baseline,results,physicalPhone:false},null,2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });

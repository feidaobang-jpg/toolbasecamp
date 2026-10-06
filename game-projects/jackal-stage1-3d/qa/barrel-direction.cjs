// 对照实际炮管的世界方向与实际生成的子弹，覆盖两关、八方向及坦克相对炮塔。
// JK_EXPECT_REVERSED=1 用于留存修复前证据；正常运行要求炮管与中心弹同向。
const fs = require('fs');
const path = require('path');
const { BASE, launch } = require('./lib');

(async () => {
  const browser = await launch();
  const out = process.env.JK_BARREL_OUT || 'out/barrel-direction';
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  const errors = [];
  try {
    const mobile = process.env.JK_MOBILE === '1';
    const viewport = mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 };
    const host = await browser.newPage({ viewport, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    host.on('pageerror', e => errors.push(e.message));
    let page = host;
    if (process.env.JK_TOY_WRAPPER) {
      await host.goto(process.env.JK_TOY_WRAPPER);
      await host.locator('iframe').waitFor();
      page = host.frames().find(f => /bilibilitoy/.test(f.url()));
      if (!page) throw Error('Missing Toy game frame');
    }
    for (const stage of [1, 2]) {
      await page.goto(BASE + '?test=1&stage=' + stage + '&seed=3&q=high');
      await page.waitForFunction(() => window.__JK_TEST__);
      await page.locator('#menu [data-act=start]').click();
      await page.evaluate(() => {
        __JK_TEST__.manual(true);
        __JK_TEST__.cheat.invuln(999);
        __JK_TEST__.step(260, true);
        __JK_TEST__.cheat.invuln(999);
      });
      for (const type of stage === 1 ? ['mg', 'cannon', 'tank'] : ['turret']) {
        for (let dir = 0; dir < 8; dir++) {
          const result = await page.evaluate(({ type, dir }) => {
            const qa = __JK_TEST__, st = qa.cheat.state();
            const e = st.ents.find(e => e.alive && e.type === type);
            if (!e) throw Error('Missing shooter: ' + type);
            st.ents.forEach(q => { q.fireT = 999; q.burst = 0; });
            e.x = 0; e.y = 14;
            const a = dir * Math.PI / 4;
            qa.cheat.teleport(Math.sin(a) * 3.5, 14 + Math.cos(a) * 3.5);
            qa.step(2, true); // 先更新镜头视锥，不能用上一次目标位置的激活范围。
            e.tAng = a;
            st.ebul.length = 0;
            e.fireT = 0;
            if (type === 'mg') { e.burst = 1; e.burstT = 0; }
            qa.step(1, true);
            const bullets = st.ebul.filter(b => b.kind !== 'missile');
            const shot = bullets.sort((l, r) => Math.abs(l.a - e.tAng) - Math.abs(r.a - e.tAng))[0];
            if (!shot) throw Error('No actual shot: ' + type + ' / ' + dir + ' ' + JSON.stringify({ mode: qa.snapshot().mode, ui: qa.snapshot().ui.overlay, active: e.active, visible: qa._cam.inView(e.x, e.y, 1.2), player: qa.snapshot().player, burst: e.burst, burstT: e.burstT, fireT: e.fireT }));
            qa._scene.updateMatrixWorld(true);
            const forward = e.obj.root.position.clone().set(0, 0, -1).transformDirection(e.obj.turret.matrixWorld);
            const speed = Math.hypot(shot.vx, shot.vy);
            const dot = (forward.x * shot.vx - forward.z * shot.vy) / speed;
            const tip = e.obj.root.position.clone().set(0, 1.2, -2.06).applyMatrix4(e.obj.turret.matrixWorld);
            const muzzleError = type === 'turret' ? Math.max(...bullets.map(b => {
              const age = 1.8 - b.life;
              return Math.hypot(tip.x - (b.x - b.vx * age), tip.z + b.y - b.vy * age, tip.y - b.h);
            })) : null;
            return { type, dir, dot, muzzleError, angle: shot.a, shots: bullets.length };
          }, { type, dir });
          const fixed = ['mg', 'cannon', 'turret'].includes(type);
          const reversed = process.env.JK_EXPECT_REVERSED === '1' && fixed;
          // 机枪巢原有小幅随机散布保留；允许约 6°，但不能反向或偏向另一轴。
          result.ok = reversed ? result.dot < -0.995 : result.dot > 0.995 && (result.muzzleError === null || result.muzzleError < 0.1 && result.shots === 3);
          result.stage = stage;
          results.push(result);
          if (type === 'turret' && dir === 4) await host.screenshot({ path: path.join(out, 'turret-south.png') });
        }
      }
    }
    const report = { version: await page.evaluate(() => __JK_TEST__.version), viewport, mobileSimulation: mobile, expectedReversed: process.env.JK_EXPECT_REVERSED === '1', pass: results.filter(r => r.ok).length, total: results.length, errors, results };
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ version: report.version, pass: report.pass, total: report.total, errors, failures: results.filter(r => !r.ok) }));
    if (report.pass !== report.total || errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();

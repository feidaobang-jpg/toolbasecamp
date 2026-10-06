// 回归：无敌不限时、暂停菜单切换、关闭后恢复超时死亡；支持网站及 Toy 外壳链接。
const { launch, BASE } = require('./lib');
const fs = require('fs');
const target = process.argv[2] || BASE;
const results = [];
const check = (name, pass, info) => {
  results.push({ name, pass: !!pass, info });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(info));
};
(async () => {
  for (const mobile of [false, true]) {
    const browser = await launch();
    try {
      const page = await browser.newPage({ viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 }, hasTouch: mobile, isMobile: mobile });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const url = new URL(target); url.searchParams.set('test', '1'); url.searchParams.set('seed', '5');
      await page.goto(url.href, { waitUntil: 'load' });
      let frame = page.mainFrame();
      if (/bilibili\.com/.test(url.hostname)) {
        await page.waitForSelector('iframe');
        await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(f => /bilibilitoy\.com/.test(f.src)));
        frame = page.frames().find(f => /bilibilitoy\.com/.test(f.url()));
        const inner = new URL(frame.url()); inner.searchParams.set('test', '1'); inner.searchParams.set('seed', '5');
        await frame.goto(inner.href, { waitUntil: 'load' });
      }
      await frame.waitForFunction(() => !!window.__CD_TEST__);
      await frame.evaluate(() => { localStorage.clear(); window.__CD_TEST__.manual(true); });
      // 新上下文默认无敌关闭；真实点击开始、选人和暂停菜单。
      const click = sel => mobile ? frame.tap(sel) : frame.click(sel);
      await click('#menu [data-act=select]'); await click('#sel-go');
      await frame.evaluate(() => { const t = window.__CD_TEST__; t.cheat.skipScript(); t.step(1); });
      const label = mobile ? '触屏' : '电脑';
      const snapshot = () => frame.evaluate(() => window.__CD_TEST__.snapshot());
      const toggle = async () => {
        await click('#btn-pause');
        await click('#pause [data-opt=demo]');
        await click('#pause [data-act=resume]');
        await frame.evaluate(() => window.__CD_TEST__.step(1));
      };
      await frame.evaluate(() => { const t = window.__CD_TEST__; t.cheat.setTimer(1); t.step(6); });
      let s = await snapshot(); check(label + '：普通模式倒计时', s.timer === .9 && !s.settings.demo, s.timer);
      const before = { area: s.area, hp: s.player.hp, timer: s.timer };
      await toggle();
      s = await snapshot();
      check(label + '：本局开启无敌保留血量与时间', s.settings.demo && s.area === before.area && s.player.hp === before.hp && s.timer === before.timer, s.timer);
      check(label + '：无限时间显示且无警告', s.hud.timer === '无限时间' && await frame.evaluate(() => !document.getElementById('h-timer').classList.contains('warn')), s.hud.timer);
      for (let area = 0; area < 6; area++) {
        await frame.evaluate(area => { const t = window.__CD_TEST__; t.cheat.area(area); t.cheat.skipScript(); t.cheat.setTimer(.1); t.step(120); }, area);
        s = await snapshot();
        check(label + '：区域' + area + '无敌不超时、不扣血', s.mode === 'play' && s.timer === .1 && s.player.hp > 0 && s.hud.timer === '无限时间', { mode: s.mode, timer: s.timer, hp: s.player.hp });
      }
      // 从零剩余时间也能保持无敌；关闭后恢复普通限时死亡。
      await frame.evaluate(() => { const t = window.__CD_TEST__; t.cheat.area(0); t.cheat.skipScript(); t.cheat.setTimer(0); t.step(1); });
      s = await snapshot(); check(label + '：零时间开启无敌不死', s.player.hp > 0 && s.timer === 0, s.player.hp);
      await frame.evaluate(() => window.__CD_TEST__.cheat.setTimer(1));
      await toggle();
      s = await snapshot(); check(label + '：关闭恢复剩余时间且本局记为演示', !s.settings.demo && s.timer === 1 && s.demoUsed && s.hud.timer !== '无限时间', { timer: s.timer, demoUsed: s.demoUsed });
      await frame.evaluate(() => window.__CD_TEST__.step(90));
      s = await snapshot(); check(label + '：普通模式仍会超时死亡', s.player.hp === 0, s.player.hp);
      check(label + '：无运行异常', errors.length === 0, errors);
    } finally { await browser.close(); }
  }
  if (process.env.CD_TIMER_REPORT) fs.writeFileSync(process.env.CD_TIMER_REPORT, JSON.stringify({ target, results }, null, 2) + '\n');
  if (results.some(r => !r.pass)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });

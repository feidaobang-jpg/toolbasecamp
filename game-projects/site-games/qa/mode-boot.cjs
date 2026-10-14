// 模式开局冒烟（2026-10-14 拆分清理）：删掉两款互相残留的死代码后，菜单里仍然列出的每个模式都要能真实点进去、开局不报错。
// 背景：虫潮的「抗战战役」和枪火的「虫族模式 / 房车生存」是另一款游戏搬走后留下的无人可进代码，本次连同分支一起删除；
//       这个脚本负责证明"该留下的都还在"，不用 DOM 存在或接口存在代替真实点击开局。
// 用法：
//   PORT=8799 node game-projects/liangjian-pingan/qa/serve.mjs        # 另开一个终端
//   node game-projects/site-games/qa/mode-boot.cjs
// 覆盖 CHONG_URL / GUN_URL / QA_OUT 环境变量。
const path = require('path');
const fs = require('fs');
const PW = process.env.PLAYWRIGHT_DIR
  || (fs.existsSync('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
    ? 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
    : 'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const { chromium } = require(PW);
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const CHONG = process.env.CHONG_URL || 'http://127.0.0.1:8799/html/game/starship-defense/index.html';
const GUN = process.env.GUN_URL || 'http://127.0.0.1:8799/html/game/gunfire-assembly/index.html';
const OUT = process.env.QA_OUT || path.join(__dirname, '../releases/game-split-hygiene-20261014');
const results = {}; const fail = [];
const check = (name, ok, detail) => { results[name] = { ok: !!ok, ...(detail !== undefined ? { detail } : {}) }; if (!ok) fail.push(name); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(detail === undefined ? null : detail).slice(0, 400))); };

// 每个模式一次全新加载：点击菜单按钮 → 点开始 → 读运行时状态，确认这个模式真的跑起来了。
const SNAP = () => {
  const q = window.__gameQA || {};
  return {
    state: q.Game && q.Game.state, testMode: !!(q.Game && q.Game.testMode), chapter: q.Game && q.Game.chapter,
    rv: !!(q.rvBreakout && q.rvBreakout.state && q.rvBreakout.state.active),
    zerg: q.zergOn ? q.zergOn() : false,
    acid: q.acidOn ? q.acidOn() : false,
    bank: q.bankOn ? q.bankOn() : false,
    battle: q.battleOn ? q.battleOn() : false,
    versus: !!(q.versus && q.versus.active),
    resistance: q.resistanceCampaign !== undefined, // 删除后这个接口不应再出现
  };
};

const CASES = [
  { url: CHONG, name: '虫潮 · 基地防守主战役', btn: '#btnCampaign', want: s => s.state !== 'menu' && !s.testMode && !s.rv && !s.zerg && !s.acid && !s.bank && !s.versus },
  { url: CHONG, name: '虫潮 · 房车生存', btn: '#btnRV', pre: ['#earlyModes summary'], then: '#rvStart', want: s => s.rv === true },
  { url: CHONG, name: '虫潮 · 虫族模式', btn: '#btnZerg', pre: ['#earlyModes summary'], then: '#zergStart', want: s => s.zerg === true },
  { url: CHONG, name: '虫潮 · 酸液围场', btn: '#btnAcid', pre: ['#earlyModes summary'], then: '#acidStart', want: s => s.acid === true },
  { url: CHONG, name: '虫潮 · 银行塔防对战', btn: '#btnBankVersus', pre: ['#earlyModes summary'], want: s => s.bank === true || s.versus === true, ai: true },
  { url: CHONG, name: '虫潮 · 自由测试', btn: '#btnTest', pre: ['[data-menu-panel="menuMorePanel"]'], want: s => s.testMode === true && s.state !== 'menu' },
  { url: GUN, name: '枪火 · 战地模式（早期体验入口）', btn: '#btnVersus', pre: ['#earlyGunfire summary'], want: s => s.battle === true && s.state !== 'menu', ai: true },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling'] });
  for (const c of CASES) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    try {
      await page.goto(c.url + '?qa=1', { waitUntil: 'load' });
      await page.waitForFunction(() => window.__gameQA, null, { timeout: 30000 });
      await page.waitForTimeout(500);
      for (const sel of (c.pre || [])) { await page.locator(sel).first().click({ timeout: 8000 }); await page.waitForTimeout(300); }
      await page.click(c.btn); await page.waitForTimeout(400);
      // 开始按钮在不同模式下来回切换：战役用 #btnStart，其他模式用 #btnModeStart
      let started = null;
      for (const id of ['#btnModeStart', '#btnStart']) {
        const el = await page.$(id);
        if (el && await el.isVisible()) { started = id; await el.click(); break; }
      }
      await page.waitForTimeout(600);
      if (c.then) { await page.click(c.then); await page.waitForTimeout(600); }
      if (c.ai) {
        const ai = await page.$('[data-vs-ai="normal"]');
        if (ai && await ai.isVisible()) await ai.click();
      }
      await page.waitForFunction(() => { const s = window.__gameQA; return s && s.Game && s.Game.state !== 'menu'; }, null, { timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const snap = await page.evaluate(SNAP);
      const diag = c.want(snap) ? undefined : await page.evaluate(() => ({
        startText: document.getElementById('btnModeStart') && document.getElementById('btnModeStart').textContent,
        visiblePanels: [...document.querySelectorAll('[id$="Menu"],[id$="Panel"],.menuDialog')].filter(e => !e.classList.contains('hidden') && e.offsetParent).map(e => e.id).slice(0, 10),
      }));
      check(c.name + '：能点进去并真正开局', c.want(snap), { 状态: snap.state, 房车: snap.rv, 虫族: snap.zerg, 酸液: snap.acid, 银行: snap.bank, 战地: snap.battle, 联机: snap.versus, 测试: snap.testMode, 按过的开始键: started, diag });
      check(c.name + '：开局过程没有报错', errors.length === 0, errors.slice(0, 5));
    } catch (e) {
      check(c.name + '：脚本执行完成', false, String(e.message).slice(0, 200));
    } finally { await page.close(); }
  }

  /* ---------- 跨游戏残留确实清干净：两款各自不再有对方的模式代码 ---------- */
  {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await page.goto(CHONG + '?qa=1', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__gameQA, null, { timeout: 30000 });
    const chong = await page.evaluate(async () => {
      const text = await (await fetch('./game.compat.js', { cache: 'no-store' })).text();
      return {
        hasWarEntry: !!document.getElementById('btnResistance'),
        qaExposesResistance: '__gameQA' in window && 'resistanceCampaign' in window.__gameQA,
        bundleHasWarUi: ['warReticle', 'warResult', 'warMenu'].filter(id => text.includes(id)),
      };
    });
    check('虫潮已不再打包抗战战役代码，菜单也没有入口', chong.hasWarEntry === false && chong.qaExposesResistance === false && chong.bundleHasWarUi.length === 0, chong);
    await page.goto(GUN + '?qa=1', { waitUntil: 'load' });
    await page.waitForFunction(() => window.__gameQA, null, { timeout: 30000 });
    const gun = await page.evaluate(async () => {
      const text = await (await fetch('./game.compat.js', { cache: 'no-store' })).text();
      return {
        qaKeys: Object.keys(window.__gameQA).filter(k => /zerg|rvBreakout/i.test(k)),
        hasZergHud: !!document.getElementById('zergHud'),
        bundleKeys: ['chongchao-rv-breakout-v1', 'chongchao-zerg-best-v2'].filter(k => text.includes(k)),
      };
    });
    check('枪火已不再暴露虫族模式与房车生存的运行时接口和存档键', gun.qaKeys.length === 0 && gun.hasZergHud === false && gun.bundleKeys.length === 0, gun);
    await page.close();
  }

  fs.writeFileSync(path.join(OUT, 'mode-boot.json'), JSON.stringify({ fail, results }, null, 1), 'utf8');
  await browser.close();
  console.log(fail.length ? 'FAIL ' + fail.length + ' 项：' + fail.join(' / ') : 'ALL PASS ' + Object.keys(results).length);
  process.exit(fail.length ? 1 : 0);
})();

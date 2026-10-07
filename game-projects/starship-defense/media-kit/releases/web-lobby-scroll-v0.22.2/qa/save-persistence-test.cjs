const { chromium } = require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
  const url = 'http://127.0.0.1:8939/html/game/starship-defense/index.html?qa=1';
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0,120)));
  await page.goto(url);
  await page.waitForFunction(() => window.__gameQA && window.__ccReady, null, { timeout: 30000 });
  const wrote = await page.evaluate(() => {
    const Q = window.__gameQA;
    Q.newGame(false);
    Q.Game.gold = 1234; Q.Game.chapter = 2; Q.Game.level = 3;
    Q.autoSave();
    const raw = localStorage.getItem('sst_save_auto');
    return raw ? JSON.parse(raw).gold : null;
  });
  await page.reload();
  await page.waitForFunction(() => window.__gameQA && window.__ccReady, null, { timeout: 30000 });
  const restored = await page.evaluate(() => {
    const Q = window.__gameQA;
    const d = Q.slotInfo('sst_save_auto');
    if (!d) return { ok:false, why:'no save after reload' };
    Q.loadGame(d);
    return { ok: Q.Game.gold === 1234 && Q.Game.chapter === 2 && Q.Game.level === 3, gold: Q.Game.gold, ch: Q.Game.chapter, lv: Q.Game.level, state: Q.Game.state };
  });
  const legacyOk = await page.evaluate(() => {
    const Q = window.__gameQA;
    const d = Q.slotInfo('sst_save_auto');
    const old = JSON.parse(JSON.stringify(d));
    delete old.vehiclesOwned; delete old.squadCount; old.time = Date.now() - 86400000;
    localStorage.setItem('sst_save_auto', JSON.stringify(old));
    const d2 = Q.slotInfo('sst_save_auto');
    try { Q.loadGame(d2); return { ok: Q.Game.state === 'prep', gold: Q.Game.gold, ch: Q.Game.chapter }; }
    catch (e) { return { ok:false, why: String(e).slice(0,120) }; }
  });
  console.log(JSON.stringify({ wrote, restored, legacyOk, errors }));
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });

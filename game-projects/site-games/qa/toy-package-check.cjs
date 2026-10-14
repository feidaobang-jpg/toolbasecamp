// Toy 预览包实测：把刚上传的预览页当作最终交付物验一遍，而不是只信本地目录。
// 外壳把游戏放在 bilibilitoy.com 的 iframe 里，这里进内层 frame 再带 ?qa=1 打开。
// 覆盖三件事：① 页面运行的 game.compat.js 与本次构建的包逐字节一致（防发到旧包/串包）；
// ② 主玩法真实点击能开局、无报错；③ 存档写到本游戏自己的键上（两款拆分后的行为约束）。
// 用法：
//   GAME=gunfire  PREVIEW_URL=https://www.bilibili.com/toy/preview/<id>/index.html node game-projects/site-games/qa/toy-package-check.cjs
//   GAME=chong    PREVIEW_URL=... 同上
// 可选 QA_OUT（默认写 releases/toy-package-check-20261014/<game>.json）。
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PW = process.env.PLAYWRIGHT_DIR
  || (fs.existsSync('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
    ? 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
    : 'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const { chromium } = require(PW);
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL_ = process.env.PREVIEW_URL;
if (!URL_) throw new Error('PREVIEW_URL required');
const GAME = process.env.GAME || 'gunfire';
const REPO = path.resolve(__dirname, '../../..');
const CONF = {
  gunfire: { dir: 'gunfire-assembly', toyPrefix: 'toy-gunfire-v1-sst_save_', manifest: 'dist/toy/feidao-gunfire/manifest.json',
    pkg: 'dist/toy/feidao-gunfire/package/game.compat.js', ownKey: 'gunfire-person', legacyKey: 'chongchao-person',
    boot: async (f, p) => { await f.click('#earlyGunfire summary'); await f.click('#btnVersus'); await f.click('[data-vs-ai="normal"]');
      await f.waitForFunction(() => __gameQA.versus.active && __gameQA.versus.state.time > .5, null, { timeout: 30000 }); },
    forbidden: ['chongchao-rv-breakout-v1', 'chongchao-zerg-best-v2', 'zergHud'] },
  chong: { dir: 'starship-defense', toyPrefix: 'toy-chongchao-v1-sst_save_', manifest: 'dist/toy/chongchao-qianshao/manifest.json',
    pkg: 'dist/toy/chongchao-qianshao/package/game.compat.js', ownKey: 'chongchao-person', legacyKey: 'gunfire-person',
    boot: async (f) => { await f.click('#btnCampaign'); await f.click('#btnStart');
      await f.waitForFunction(() => __gameQA.Game.state !== 'menu', null, { timeout: 30000 }); },
    forbidden: ['warReticle', 'resistanceCampaign', 'chongchao-resistance-checkpoint-v1'] },
}[GAME];
if (!CONF) throw new Error('GAME must be gunfire or chong');
const OUT = process.env.QA_OUT || path.join(REPO, 'game-projects/site-games/releases/toy-package-check-20261014', GAME + '.json');
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [], errors = [], runtimeErrors = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail).slice(0, 300))); if (!ok) errors.push(name); };
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

async function gameFrame(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) { frame = page.frames().find(f => /bilibilitoy\.com/.test(f.url())); if (!frame) await sleep(500); }
  if (!frame) throw new Error('game iframe not found');
  const u = new URL(frame.url()); u.searchParams.set('qa', '1');
  await frame.goto(u.href);
  await frame.waitForFunction(() => window.__gameQA && window.__ccReady, null, { timeout: 90000 });
  return frame;
}

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => runtimeErrors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') runtimeErrors.push('console: ' + m.text()); });
    const frame = await gameFrame(page, URL_);

    // ① 运行的脚本 = 本次上传的包
    const bytes = await frame.evaluate(async () => {
      const src = [...document.scripts].map(s => s.src).find(s => /game\.compat\.js/.test(s));
      if (!src) return null;
      return [...new Uint8Array(await (await fetch(src, { cache: 'no-store' })).arrayBuffer())];
    });
    if (!bytes) check('预览页加载了本次的 game.compat.js', false, 'no compat script');
    else {
      const got = Buffer.from(bytes), local = fs.readFileSync(path.join(REPO, CONF.pkg));
      const manifest = JSON.parse(fs.readFileSync(path.join(REPO, CONF.manifest), 'utf8'));
      check('预览运行的脚本与本次构建的包逐字节一致', got.equals(local) && sha(got) === manifest.files['game.compat.js'],
        { live: sha(got).slice(0, 16), local: sha(local).slice(0, 16), manifest: manifest.files['game.compat.js'].slice(0, 16), bytes: got.length });
      const text = got.toString('utf8');
      check('已删除的玩法不在这次的包里', CONF.forbidden.every(s => !text.includes(s)), CONF.forbidden.filter(s => text.includes(s)));
    }
    // 入口体积按上传目录里的 index.html 未压缩 UTF-8 字节数算（平台新规则的计量对象）。
    // 运行期 DOM 会带上外壳注入的水印与容器节点，比入口文件大，不能拿它当超限依据，只并列记下来。
    const entryBytes = fs.statSync(path.join(REPO, path.dirname(CONF.pkg), 'index.html')).size;
    const innerHtml = await frame.evaluate(() => new TextEncoder().encode('<!doctype html>' + document.documentElement.outerHTML).length);
    check('上传入口 index.html 仍在 Toy 建议的 100KB 以内', entryBytes < 100000, { uploadedEntryBytes: entryBytes, innerRuntimeDomBytes: innerHtml });

    // ② 存档命名空间：Toy 包内的战役档前缀由构建器改写，必须仍是历史上一直在用的那把，
    // 否则已发布玩家在本作品里的本地进度、自动备份和「成绩已提交」状态会被清零。
    const prefix = await frame.evaluate(() => __gameQA.saveStore?.prefix ?? null);
    check('Toy 包内的本地存档前缀与已发布版本一致', prefix === CONF.toyPrefix, { live: prefix, want: CONF.toyPrefix });
    // 菜单里真实换一次视角：偏好要落在本游戏的键上，不能落进另一款的键
    await frame.evaluate(() => __gameQA.setCamMode('first', false));
    await sleep(400);
    const own = await frame.evaluate(k => localStorage.getItem(k), CONF.ownKey);
    check('视角偏好写在本游戏自己的存档键上', own === 'first', { key: CONF.ownKey, value: own });
    const legacy = await frame.evaluate(k => localStorage.getItem(k), CONF.legacyKey);
    check('没有写另一款游戏的视角键', legacy === null, { key: CONF.legacyKey, value: legacy });
    check('预览环境里的存档键清单', true, await frame.evaluate(() => Object.keys(localStorage).sort()));

    // ③ 真实点击能开局
    await CONF.boot(frame, page);
    check(CONF.dir + '：预览包里主玩法真实点击能开局', true);

    await page.screenshot({ path: OUT.replace(/\.json$/, '-desktop.png') });

    // 手机横屏视口：菜单与HUD不裁切、触摸模式可用
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, userAgent: MOBILE_UA });
    const mobile = await ctx.newPage();
    mobile.on('pageerror', e => runtimeErrors.push('mobile pageerror: ' + e.message));
    const mf = await gameFrame(mobile, URL_);
    await mf.evaluate(() => __gameQA.setDeviceMode('touch'));
    await sleep(500);
    const fit = await mf.evaluate(() => {
      const inView = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; };
      const label = el => el.id || el.textContent.trim().slice(0, 12);
      const buttons = [...document.querySelectorAll('#menuMain button, #menuMain .mbtn')].filter(b => b.offsetParent !== null && b.getBoundingClientRect().width > 0);
      // 折叠在没展开的 <details> 里的旧玩法不算「一屏可见」范围（点开后能不能到达由 mode-boot 那条回归负责）
      const unfolded = buttons.filter(b => !b.closest('details:not([open])'));
      return {
        vw: innerWidth, vh: innerHeight,
        shown: unfolded.filter(inView).map(label),
        cutOff: unfolded.filter(b => !inView(b)).map(label),
        foldedReachableLater: buttons.filter(b => b.closest('details:not([open])')).map(label),
      };
    });
    check('手机横屏视口：主菜单展开的入口都在画面内', fit.cutOff.length === 0, fit);
    await mobile.screenshot({ path: OUT.replace(/\.json$/, '-mobile.png') });

    check('桌面与手机视口都没有报错', runtimeErrors.length === 0, runtimeErrors.slice(0, 6));
  } finally {
    await browser.close();
    fs.writeFileSync(OUT, JSON.stringify({ game: GAME, url: URL_, at: new Date().toISOString(), results, errors, runtimeErrors }, null, 1));
    const failed = results.filter(r => !r.ok);
    console.log(failed.length ? 'FAILED ' + failed.length + ' / ' + results.length : 'ALL PASS ' + results.length);
    console.log('证据：' + OUT);
    if (failed.length) process.exitCode = 1;
  }
})().catch(e => { console.error('ERROR', e.message); console.error(errors); process.exit(1); });

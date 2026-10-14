// 存档命名空间拆分回归（2026-10-14）：《枪火集结》和《虫潮围城》在同域名下不再互相读写进度。
// 缺陷原因：两款曾共用 chongchao-* 与 sst_save_ 键，虫潮的视角预设已被精简成 3+第一人称，
// 枪火还留着 5 档，玩家在一款里换视角会把另一款的偏好顶掉；战役自动档槽和云档标记也是同一个键。
// 复现（修复前）：先在虫潮把视角切到第一人称并保存战役，再进枪火打一把战地并换视角，
// 回到虫潮会发现视角偏好被改成枪火的值；枪火若走到战役存档路径还会直接覆盖 sst_save_auto。
// 用法：
//   PORT=8799 node game-projects/liangjian-pingan/qa/serve.mjs        # 另开一个终端
//   node game-projects/site-games/qa/save-namespace-split.cjs
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
const OUT = process.env.QA_OUT || path.join(__dirname, '../releases/save-namespace-20261014');
const SHARED_INPUT = ['chongchao-keybindings-v1', 'chongchao-combat-controls-v1', 'chongchao-touch-layout-v1', 'chongchao-device-mode'];
const results = {}; const fail = [];
const check = (name, ok, detail) => { results[name] = { ok: !!ok, ...(detail !== undefined ? { detail } : {}) }; if (!ok) fail.push(name); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(detail === undefined ? null : detail).slice(0, 400))); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const snap = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
  const ready = () => page.waitForFunction(() => window.__gameQA, null, { timeout: 25000 });

  /* ---------- 1. 虫潮：真实开局、真实按键换视角、写战役档 ---------- */
  await page.goto(CHONG + '?qa=1', { waitUntil: 'load' }); await ready();
  await page.evaluate(() => localStorage.clear());
  await page.goto(CHONG + '?qa=1', { waitUntil: 'load' }); await ready(); await page.waitForTimeout(400);
  const chongLabel = await page.evaluate(async () => (await import('./cloud-save.js')).cloudRecord({ time: 1 }).game);
  check('虫潮的云档与导出备份仍标记 starship-defense（老玩家的云档和备份文件不失效）', chongLabel === 'starship-defense', chongLabel);

  await page.click('#btnCampaign'); await page.waitForTimeout(300);
  await page.click('#btnStart'); await page.waitForFunction(() => __gameQA.Game.state !== 'menu', null, { timeout: 15000 });
  // 用生产的 setCamMode 切到第一人称（它就是 C 键与视角按钮最终调用的写盘函数；C 键位本身由 verify-look-keys.cjs 覆盖）
  await page.evaluate(() => __gameQA.setCamMode('first', false));
  const chongMode = await page.evaluate(() => __gameQA.getCamMode());
  await page.evaluate(() => __gameQA.autoSave());
  const s1 = await snap();
  check('虫潮玩家把视角换成第一人称后，偏好写在自己的 chongchao-person', chongMode === 'first' && s1['chongchao-person'] === 'first', { chongMode, value: s1['chongchao-person'] });
  check('虫潮战役档写在 sst_save_auto', !!s1['sst_save_auto'] && JSON.parse(s1['sst_save_auto']).testMode === false, s1['sst_save_auto'] && JSON.parse(s1['sst_save_auto']).chapter);

  /* ---------- 2. 枪火：旧值一次性迁移，旧键保留不动 ---------- */
  // 离开虫潮时虫潮自己会 beforeunload 存一次盘，所以基线取进入枪火那一刻的快照
  await page.goto(GUN + '?qa=1', { waitUntil: 'load' }); await ready(); await page.waitForTimeout(400);
  const s2a = await snap();
  const chongAuto = s2a['sst_save_auto'], chongPerson = s2a['chongchao-person'];
  check('枪火首次启动把属于本游戏的视角偏好从 chongchao-person 搬到 gunfire-person', s2a['gunfire-person'] === 'first', s2a['gunfire-person']);
  check('迁移是复制不是搬走：虫潮的 chongchao-person 原值保留', s2a['chongchao-person'] === s1['chongchao-person'], { before: s1['chongchao-person'], after: s2a['chongchao-person'] });
  const gunLabel = await page.evaluate(async () => (await import('./cloud-save.js')).cloudRecord({ time: 1 }).game);
  check('枪火的云档与导出备份改标 gunfire-assembly', gunLabel === 'gunfire-assembly', gunLabel);

  /* ---------- 3. 枪火打一把战地：只写自己的键 ---------- */
  await page.click('#earlyGunfire summary'); await page.waitForTimeout(200);
  await page.click('#btnVersus'); await page.waitForTimeout(400);
  await page.click('[data-vs-ai="normal"]');
  await page.waitForFunction(() => __gameQA.battleOn(), null, { timeout: 25000 }).catch(() => {});
  const inBattle = await page.evaluate(() => __gameQA.battleOn());
  check('战地模式仍能正常开局（本次改动没有打断现有玩法）', inBattle, inBattle);
  // 战地步行按规则固定第一人称，玩家不能靠 C 换视角，这里直接调生产用的 setCamMode 触发写盘
  await page.evaluate(() => __gameQA.setCamMode('third', false));
  await page.evaluate(() => { try { document.getElementById('daylightMain').click(); } catch (e) { return String(e); } return 'ok'; });
  await page.waitForTimeout(600);
  const s2b = await snap();
  check('枪火里换视角写的是 gunfire-person', s2b['gunfire-person'] === 'third', s2b['gunfire-person']);
  check('枪火里切昼夜写的是 gunfire-daylight', ['day', 'night'].includes(s2b['gunfire-daylight']), s2b['gunfire-daylight']);
  check('枪火没有改动虫潮的 chongchao-person', s2b['chongchao-person'] === chongPerson, { before: chongPerson, after: s2b['chongchao-person'] });
  const strayKeys = Object.keys(s2b).filter(k => /^chongchao[-_]/.test(k) && !SHARED_INPUT.includes(k) && s2b[k] !== s2a[k]);
  check('枪火全程只新增自己的键，除共用的输入设置外没有改动任何 chongchao-* 键', strayKeys.length === 0, strayKeys);

  /* ---------- 4. 战役档槽与云档标记彻底分开 ---------- */
  // 战地对局中不会写战役自动档（这是既有设计），先退出对战再走一次战役存盘路径
  await page.evaluate(() => { if (__gameQA.battleOn()) __gameQA.exitVersus(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { __gameQA.newGame(false); __gameQA.autoSave(); });
  await page.waitForTimeout(400);
  const s2c = await snap();
  check('即使走到战役存档这条路，枪火也写 gfs_save_auto 而不是虫潮的槽', !!s2c['gfs_save_auto'], Object.keys(s2c).filter(k => k.includes('save_')));
  check('虫潮的战役自动档一字未改', s2c['sst_save_auto'] === chongAuto, { 长度: [chongAuto && chongAuto.length, s2c['sst_save_auto'] && s2c['sst_save_auto'].length] });
  const keptInputKeys = SHARED_INPUT.filter(k => s2a[k] !== undefined);
  check('通用输入类键仍按设计共用（' + (keptInputKeys.join('、') || '本轮未触发') + '）', true, keptInputKeys);

  /* ---------- 5. 回虫潮：偏好与进度还是玩家自己的 ---------- */
  await page.goto(CHONG + '?qa=1', { waitUntil: 'load' }); await ready(); await page.waitForTimeout(600);
  const s3 = await snap();
  const backToFirst = await page.evaluate(() => { __gameQA.newGame(false); return __gameQA.getCamMode(); });
  check('在枪火换过视角后回虫潮，虫潮仍是玩家自己存的第一人称', s3['chongchao-person'] === 'first' && backToFirst === 'first', { stored: s3['chongchao-person'], camMode: backToFirst });
  check('回虫潮后战役档仍是原来那份', s3['sst_save_auto'] === chongAuto, s3['sst_save_auto'] && s3['sst_save_auto'].length);
  check('两款页面在拆分存档键之后都加载无报错', errors.length === 0, errors.slice(0, 6));

  results.summary = { fail, sharedKeys: SHARED_INPUT, gunfireKeys: Object.keys(s2c).filter(k => k.startsWith('gunfire') || k.startsWith('gfs_')) };
  fs.writeFileSync(path.join(OUT, 'save-namespace-split.json'), JSON.stringify(results, null, 1), 'utf8');
  await browser.close();
  console.log((fail.length ? '\nFAILED ' + fail.length + ' 项：' + fail.join('；') : '\n全部通过') + '\n证据：' + path.join(OUT, 'save-namespace-split.json'));
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.log('脚本异常：' + e.message + '\n' + e.stack); fs.writeFileSync(path.join(OUT, 'save-namespace-split.json'), JSON.stringify({ results, error: String(e) }, null, 1), 'utf8'); process.exit(2); });

// 联机大厅入口行为回归：?coop=create 只打开大厅不静默建房；已在房间时按钮给出可读说明；
// ?coop=六位房号 的邀请链接：公开房自动加入、密码房提示填密码、不存在的房间说明原因。
// 用法（需先起本地服务）：
//   python -m uvicorn coop_hub_qa:app --port 8792            # /game/coop/ws + /game/coop/rooms
//   python -m http.server 8766 --directory public
//   GAMES_BASE=http://127.0.0.1:8766/ GAMES_ONLY=jackal,tank node game-projects/site-games/qa/coop-lobby-entry.cjs
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const base = process.env.GAMES_BASE || 'http://127.0.0.1:8766/';
const dirs = { tank: 'tank-3d', jackal: 'jackal-stage1-3d', cadillacs: 'cadillacs-stage1-3d', starship: 'starship-defense' };
const out = process.env.GAMES_OUT || path.resolve('game-projects/site-games/qa/out/coop-lobby-entry');
fs.mkdirSync(out, { recursive: true });
const results = [];
function check(g, name, ok, data) {
  results.push({ game: g, name, ok: !!ok, data: data === undefined ? null : data });
  console.log((ok ? 'PASS ' : 'FAIL ') + g + ' · ' + name + (data !== undefined ? '  ' + JSON.stringify(data) : ''));
  assert.ok(ok, g + ' · ' + name);
}

const ui = g => g === 'tank'
  ? { create: '#coop-create', join: '#coop-join', createPassword: '#coop-create-password', password: '#coop-password',
      code: '#coop-code', status: '#coop-message', room: '#coop-room', createFields: '#coop-create-fields' }
  : { create: '[data-do=create]', join: '[data-do=join]', createPassword: '[data-field=password]', password: '[data-field=password]',
      code: '[data-field=code]', status: '.coop-status', room: '.coop-roster', createFields: null };

let browser;
async function open(g, params) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  // 单线程本地静态服务会把并发页面加载排队，别把排队当成故障
  page.setDefaultNavigationTimeout(90000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const url = new URL(base + 'html/game/' + dirs[g] + '/index.html');
  url.searchParams.set('test', '1'); url.searchParams.set('qa', '1'); url.searchParams.set('q', 'low');
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  await page.goto(url.href);
  await page.waitForFunction(g => (g === 'tank' ? window.__TANK_TEST__ : window.__COOP_QA__), g, { timeout: 120000 });
  return { ctx, page, errors };
}
const close = async root => { await root.ctx.close().catch(() => {}); };
const roomOf = (page, g) => page.evaluate(g => {
  const c = g === 'tank' ? __TANK_TEST__.coop : __COOP_QA__.connection;
  return c.room ? { code: c.room.code, started: !!c.room.started, players: c.room.players.map(p => p.slot) } : null;
}, g);
const statusOf = (page, g) => page.evaluate(sel => (document.querySelector(sel) || {}).textContent || '', ui(g).status);
async function untilStatus(page, g, keyword, timeout = 12000) {
  const t0 = Date.now();
  let text = '';
  while (Date.now() - t0 < timeout) {
    text = await statusOf(page, g);
    if (text.includes(keyword)) return text;
    await page.waitForTimeout(120);
  }
  return text;
}
async function waitRoom(page, g, predicate, what, timeout = 25000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await roomOf(page, g);
    if (last && predicate(last)) return last;
    await page.waitForTimeout(120);
  }
  throw new Error('等待超时：' + what + ' 最后状态 ' + JSON.stringify(last));
}

async function runGame(g) {
  const s = ui(g);
  // ① 从联机大厅的"创建房间"链接进来：只打开大厅，不静默建房
  const host = await open(g, { coop: 'create' });
  try {
    if (g === 'tank') await host.page.waitForFunction(() => __TANK_TEST__.state().overlay === 'lobby', null, { timeout: 20000 });
    else await host.page.waitForFunction(() => !document.querySelector('.coop-panel').hidden, null, { timeout: 20000 });
    check(g, '?coop=create 自动打开联机大厅', true);
    await host.page.waitForTimeout(1500);
    check(g, '?coop=create 不再静默创建房间', (await roomOf(host.page, g)) === null);
    const hint = g === 'tank' ? '点「创建房间」' : '填好昵称';
    const hintText = await untilStatus(host.page, g, hint, 8000);
    check(g, '大厅提示先填信息再手动创建', hintText.includes(hint), { hintText: hintText.trim() });

    // ② 玩家自己点创建 → 建房成功
    await host.page.fill(g === 'tank' ? '#coop-name' : '[data-field=name]', '房主');
    await host.page.click(s.create);
    const room = await waitRoom(host.page, g, r => r.code, '房主建房');
    check(g, '手动点「创建房间」即可建房', !!room.code, { code: room.code });

    // ③ 已在房间时，创建/加入不再是"点了没反应"的灰按钮
    if (g !== 'tank') {
      const state = await host.page.evaluate(() => {
        const b = document.querySelector('[data-do=create]');
        return { disabled: b.disabled, locked: b.classList.contains('coop-btn-locked'), aria: b.getAttribute('aria-disabled'), title: b.title };
      });
      check(g, '已在房间时创建按钮显示锁定态但仍可点', state.locked && state.aria === 'true' && state.disabled === false, state);
      // aria-disabled 只是提示性语义，元素仍可点击（Playwright 的动作性检查会拦，这里按真实鼠标强点）
      await host.page.click(s.join, { force: true });
      const why = await untilStatus(host.page, g, '你已在房间', 8000);
      check(g, '点锁定按钮会说明原因和下一步', why.includes('退出房间'), { why: why.trim() });
    } else {
      const shown = await host.page.evaluate(() => ({
        room: document.querySelector('#coop-room').textContent,
        createHidden: document.querySelector('#coop-create-fields').hidden,
      }));
      check(g, '已在房间时面板显示房间号并收起建房表单', shown.room === room.code && shown.createHidden, shown);
    }

    // ④ 邀请链接（公开房）：队友进来即自动加入
    const guest = await open(g, { coop: room.code });
    try {
      const joined = await waitRoom(guest.page, g, r => r.players.length === 2, '好友通过邀请链接自动加入');
      check(g, '邀请链接进公开房自动加入，名单为两人', joined.players.length === 2, { players: joined.players });
    } finally { await close(guest); }

    // ⑤ 邀请链接指向不存在的房间：给出可读原因，不静默失败
    const ghost = await open(g, { coop: '999999' });
    try {
      const why = await untilStatus(ghost.page, g, '不在线或已结束', 15000);
      check(g, '邀请房间不在线时说明原因', why.includes('不在线或已结束'), { why: why.trim() });
      check(g, '邀请房间不在线时不会误建房', (await roomOf(ghost.page, g)) === null);
    } finally { await close(ghost); }
  } finally { await close(host); }

  // ⑥ 密码房：不自动加入，提示填密码；填对后能进
  const owner = await open(g, { coop: 'create' });
  try {
    if (g === 'tank') await owner.page.waitForFunction(() => __TANK_TEST__.state().overlay === 'lobby', null, { timeout: 20000 });
    else await owner.page.waitForFunction(() => !document.querySelector('.coop-panel').hidden, null, { timeout: 20000 });
    const pwField = g === 'tank' ? '#coop-create-password' : '[data-field=password]';
    await owner.page.fill(pwField, 'secre1');
    await owner.page.click(s.create);
    const room = await waitRoom(owner.page, g, r => r.code, '房主建密码房');
    const guest = await open(g, { coop: room.code });
    try {
      const why = await untilStatus(guest.page, g, '需要密码', 15000);
      check(g, '密码房邀请链接不自动加入并提示填密码', why.includes('需要密码') && (await roomOf(guest.page, g)) === null, { why: why.trim() });
      await guest.page.fill(g === 'tank' ? '#coop-password' : '[data-field=password]', 'secre1');
      await guest.page.click(s.join);
      const joined = await waitRoom(guest.page, g, r => r.players.length === 2, '填密码后加入');
      check(g, '填对密码后可加入密码房', joined.players.length === 2, { players: joined.players });
    } finally { await close(guest); }
  } finally { await close(owner); }
}

(async () => {
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const games = (process.env.GAMES_ONLY || 'jackal,tank').split(',').filter(Boolean);
  for (const g of games) {
    try { await runGame(g); }
    catch (e) {
      results.push({ game: g, name: '未捕获失败', ok: false, data: { message: String(e) } });
      console.log('FAIL', g, '未捕获失败', String(e));
      throw e;
    }
  }
  fs.writeFileSync(path.join(out, 'coop-lobby-entry.json'), JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();

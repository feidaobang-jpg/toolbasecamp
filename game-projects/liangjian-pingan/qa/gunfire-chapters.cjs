// 枪火集结抗战战役（0.4.0）：三章都重做完，旧版章节选择和旧李家坡关卡删除；大厅只留一个「抗战战役 · 亮剑三章」入口，直达亮剑战役页面，
// 在那边的菜单里选章（苍云岭 / 李家坡 / 平安县城）、继续进度、返回大厅；旧的平安县城地址仍跳到重做版
const path = require('path');
const fs = require('fs');
const PW = process.env.PLAYWRIGHT_DIR || 'D:/project/godot/absurd-3d-daily/node_modules/playwright';
const { chromium } = require(PW);
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = process.env.GUNFIRE_URL || 'http://localhost:8795/html/game/gunfire-assembly/index.html';
const out = [];
const check = (name, ok, detail) => { out.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(detail))); };

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=d3d11'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => { if (!/assets\/voice\//.test(r.url())) errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const boot = async () => { await page.goto(URL + '?qa=1'); await page.waitForFunction(() => window.__gameQA && window.__ccReady, null, { timeout: 30000 }); };
  const R = (fn, arg) => page.evaluate(fn, arg);
  const ljMenu = async (re) => { await page.waitForURL(re, { timeout: 10000 }).catch(() => {}); await page.waitForFunction(() => window.__lj && document.getElementById('loading').hidden, null, { timeout: 20000 }).catch(() => {}); return R(() => ({ url: location.pathname + location.search, head: (document.querySelector('#menu .sub strong') || {}).textContent, chapters: [...document.querySelectorAll('#menu .chapter')].map((b) => b.dataset.ch + (b.classList.contains('soon') ? ':soon' : '')) })); };

  await boot();
  const lobby = await R(() => ({ ver: document.getElementById('gameVersion').textContent, cards: [...document.querySelectorAll('#lobbyModes > .lobbyCard')].map((b) => b.id + ':' + b.textContent.replace(/\s+/g, ' ').trim()), oldCard: !!document.getElementById('btnResistance'), warMenu: !!document.getElementById('warMenu'), lead: document.querySelector('.lobbyLead').textContent, qa: Object.keys(window.__gameQA).filter((k) => /resist/i.test(k)) }));
  check('大厅只留一个「抗战战役 · 亮剑三章」入口（写着苍云岭、李家坡、平安县城三章重做），旧的章节选择入口和战役菜单都没了', /^v\d+\.\d+\.\d+$/.test(lobby.ver) && lobby.cards.length === 1 && /btnPingan:抗战战役 · 亮剑三章/.test(lobby.cards[0]) && /苍云岭、李家坡、平安县城/.test(lobby.cards[0]) && !lobby.oldCard && !lobby.warMenu && /李家坡/.test(lobby.lead) && !lobby.qa.length, lobby);
  const hist = await R(() => { const b = document.getElementById('updatesList') || document.body; return b.textContent.includes('李家坡重做'); });
  check('更新记录有 0.4.0「李家坡重做，三章全部换新」', hist, null);

  await Promise.all([page.waitForURL(/liangjian\/index\.html/, { timeout: 10000 }).catch(() => {}), page.click('#btnPingan')]);
  let m = await ljMenu(/liangjian\/index\.html/);
  check('点入口进亮剑战役页面，菜单里三章都能选（没有“制作中”）', /\/gunfire-assembly\/liangjian\/index\.html/.test(m.url) && m.chapters.join(',') === 'cangyunling,lijiapo,pingan', m);
  await Promise.all([page.waitForURL(/ch=lijiapo/, { timeout: 10000 }).catch(() => {}), R(() => document.querySelector('#menu .chapter[data-ch="lijiapo"]').click())]);
  m = await ljMenu(/ch=lijiapo/);
  check('菜单里换到第二章：标题“第二章 · 李家坡攻坚”', /ch=lijiapo/.test(m.url) && /第二章 · 李家坡攻坚/.test(m.head || ''), m);
  await R(() => document.querySelector('#menu .btn.primary').click());
  await page.waitForTimeout(2000);
  const play = await R(() => ({ menu: document.getElementById('menu').hidden, obj: document.getElementById('objective').textContent }));
  check('李家坡能开局，第一阶段目标是拔掉山脚的火力点', play.menu && /火力点/.test(play.obj), play);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.goto(page.url());
  await ljMenu(/ch=lijiapo/);
  await Promise.all([page.waitForURL(/gunfire-assembly\/index\.html/, { timeout: 10000 }).catch(() => {}), R(() => [...document.querySelectorAll('#menu button')].find((b) => /返回大厅/.test(b.textContent)).click())]);
  check('亮剑战役菜单的“返回大厅”回到枪火集结大厅', /\/gunfire-assembly\/index\.html/.test(page.url()), page.url());
  await boot();
  await Promise.all([page.waitForURL(/liangjian\/index\.html/, { timeout: 10000 }).catch(() => {}), page.click('#btnPingan')]);
  m = await ljMenu(/liangjian\/index\.html/);
  check('再从大厅进来，落在上次玩的李家坡', /第二章 · 李家坡攻坚/.test(m.head || ''), m);

  // ---------- 旧的平安县城地址 ----------
  await Promise.all([page.waitForURL(/liangjian\/index\.html.*ch=pingan/, { timeout: 10000 }).catch(() => {}), page.goto(URL.replace('index.html', 'pingan/index.html?qa=1'))]);
  await page.waitForTimeout(500);
  check('旧的 pingan/index.html 地址跳到亮剑战役的平安县城', /liangjian\/index\.html\?.*ch=pingan/.test(page.url()), page.url());

  // ---------- 旧抗战战役的文件已删 ----------
  const gone = await R(async () => { const r = []; for (const f of ['resistance-campaign.js', 'resistance-ui.js', 'resistance-assets.js']) r.push((await fetch('../' + f, { cache: 'no-store' })).status); return r; });
  check('旧抗战战役的脚本已删（resistance-*.js 取不到）', gone.every((s) => s === 404), gone);

  check('全程没有报错', !errors.filter((e) => !/resistance-.*404|404.*resistance|Failed to load resource/.test(e)).length, errors);
  fs.writeFileSync(process.env.QA_OUT || path.join(__dirname, 'out-gunfire-chapters.json'), JSON.stringify({ at: new Date().toISOString(), passed: out.filter((c) => c.ok).length, total: out.length, checks: out, errors }, null, 1));
  console.log(`${out.filter((c) => c.ok).length}/${out.length} passed`);
  await browser.close();
  process.exit(out.every((c) => c.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

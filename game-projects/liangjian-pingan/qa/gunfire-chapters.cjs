// 枪火集结抗战战役（0.3.0）：第一章苍云岭、第三章平安县城跳到亮剑战役页面（重做版）；第二章李家坡照常开局、移动、开枪、扔雷、结算；旧存档按新章节顺序迁移，删掉的骑兵连转到苍云岭
// 场景推进（清场、推进阶段）用 QA 捷径，移动、开枪、手榴弹走真实按键。
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const boot = async () => { await page.goto(URL + '?qa=1'); await page.waitForFunction(() => window.__gameQA && window.__gameQA.resistanceCampaign && window.__ccReady, null, { timeout: 30000 }); };
  await boot();
  const R = (fn, arg) => page.evaluate(fn, arg);

  await page.click('#btnResistance');
  const menu = await R(() => ({ shown: !document.getElementById('warMenu').classList.contains('hidden'), cards: [...document.querySelectorAll('#warChapters button')].map((b) => b.textContent), oldUi: ['warTow', 'warCannonTools', 'warImpact'].filter((id) => document.getElementById(id)), keys: document.getElementById('warKeysDesktop').textContent + document.getElementById('warKeysTouch').textContent }));
  check('战役菜单三章按原作顺序：苍云岭（重做版）、李家坡、平安县城（重做版、秀芹、双结局）；骑兵连章节和上下马说明都已删除', menu.shown && menu.cards.length === 3 && /苍云岭/.test(menu.cards[0]) && /重做版/.test(menu.cards[0]) && /李家坡/.test(menu.cards[1]) && /平安县城/.test(menu.cards[2]) && /秀芹/.test(menu.cards[2]) && /双结局/.test(menu.cards[2]) && !menu.cards.some((c) => /骑兵连 ·/.test(c)) && !/上下马|骑马/.test(menu.keys) && !menu.oldUi.length, menu);

  // ---------- 第一章苍云岭：跳到亮剑战役页面 ----------
  await Promise.all([page.waitForURL(/liangjian\/index\.html\?ch=cangyunling/, { timeout: 10000 }).catch(() => {}), page.click('#warChapters button[data-chapter="0"]')]);
  check('第一章卡片跳到亮剑战役的苍云岭', /\/gunfire-assembly\/liangjian\/index\.html\?ch=cangyunling/.test(page.url()), page.url());
  await boot();
  await page.click('#btnResistance');

  // ---------- 第二章李家坡（旧版，本包里的实现） ----------
  await page.click('#warChapters button[data-chapter="1"]');
  await page.waitForTimeout(300);
  let st = await R(() => { const s = __gameQA.resistanceCampaign.state; return { active: s.active, chapter: s.chapter, z: s.player.root.position.z, ammo: JSON.stringify(s.ammo), grenades: s.grenades, title: document.getElementById('warTitle').textContent }; });
  check('第二章李家坡：点卡片开局', st.active && st.chapter === 1 && /李家坡/.test(st.title), st);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  const z1 = await R(() => __gameQA.resistanceCampaign.state.player.root.position.z);
  await page.keyboard.down('KeyJ'); await page.waitForTimeout(900); await page.keyboard.up('KeyJ');
  await page.keyboard.press('KeyU'); await page.waitForTimeout(300);
  const after = await R(() => { const s = __gameQA.resistanceCampaign.state; return { ammo: JSON.stringify(s.ammo), grenades: s.grenades }; });
  check('李家坡：W 前进、J 开枪耗弹、U 扔手榴弹', Math.abs(z1 - st.z) > 0.5 && after.ammo !== st.ammo && after.grenades === st.grenades - 1, { z0: st.z, z1, before: st, after });
  const fin1 = await R(() => { const r = __gameQA.resistanceCampaign, s = r.state; s.invulnerable = 999; for (let i = 0; i < 3; i++) { s.units.filter((u) => u.team === 'enemy' && !u.dead).forEach((u) => r.damage(u, 999)); r.advance(); } return { over: s.over, finished: s.finished, result: !document.getElementById('warResult').classList.contains('hidden') }; });
  check('李家坡：推进到结算，结算页正常显示', fin1.over && fin1.finished && fin1.result, fin1);
  const saved = await R(() => JSON.parse(localStorage.getItem('chongchao-resistance-checkpoint-v1')));
  check('李家坡的检查点按新顺序存（schema 2，第二章）', saved && saved.schema === 2 && saved.chapter === 1, saved);

  // ---------- 李家坡结算“下一章”跳到平安县城 ----------
  await Promise.all([page.waitForURL(/ch=pingan/, { timeout: 10000 }).catch(() => {}), page.click('#warNext')]);
  check('李家坡结算点“下一章”跳到亮剑战役的平安县城', /\/gunfire-assembly\/liangjian\/index\.html\?ch=pingan/.test(page.url()), page.url());

  // ---------- 旧存档迁移 ----------
  const oldSave = async (chapter, phase) => { await boot(); await R((d) => localStorage.setItem('chongchao-resistance-checkpoint-v1', JSON.stringify(d)), { schema: 1, chapter, phase, elapsed: 30, kills: 5, finished: false }); await boot(); await page.click('#btnResistance'); return R(() => ({ disabled: document.getElementById('warContinue').disabled, info: document.getElementById('warSaveInfo').textContent })); };
  let cont = await oldSave(2, 2);
  await Promise.all([page.waitForURL(/ch=pingan/, { timeout: 10000 }).catch(() => {}), page.click('#warContinue')]);
  check('旧版第三章存档：菜单注明“平安县城 · 重做版”，点“继续检查点”跳到重做版平安县城', !cont.disabled && /平安县城/.test(cont.info) && /重做版/.test(cont.info) && /ch=pingan/.test(page.url()), { cont, url: page.url() });
  cont = await oldSave(1, 1);
  await Promise.all([page.waitForURL(/ch=cangyunling/, { timeout: 10000 }).catch(() => {}), page.click('#warContinue')]);
  check('已删除的骑兵连章节的旧存档：转成第一章苍云岭（重做版），继续检查点跳过去', !cont.disabled && /苍云岭/.test(cont.info) && /重做版/.test(cont.info) && /ch=cangyunling/.test(page.url()), { cont, url: page.url() });
  cont = await oldSave(0, 1);
  await page.click('#warContinue'); await page.waitForTimeout(300);
  st = await R(() => { const s = __gameQA.resistanceCampaign.state; return { active: s.active, chapter: s.chapter, phase: s.phase, info: document.getElementById('warTitle').textContent }; });
  check('旧版李家坡存档（第二阶段）：继续检查点回到李家坡第二阶段', /李家坡/.test(cont.info) && st.active && st.chapter === 1 && st.phase === 1, { cont, st });
  await R(() => __gameQA.resistanceCampaign.stop());

  // ---------- 旧的平安县城地址 ----------
  await Promise.all([page.waitForURL(/liangjian\/index\.html.*ch=pingan/, { timeout: 10000 }).catch(() => {}), page.goto(URL.replace('index.html', 'pingan/index.html?qa=1'))]);
  await page.waitForTimeout(500);
  check('旧的 pingan/index.html 地址跳到亮剑战役的平安县城', /liangjian\/index\.html\?.*ch=pingan/.test(page.url()), page.url());

  check('全程没有报错', !errors.length, errors);
  fs.writeFileSync(path.join(__dirname, 'out-gunfire-chapters.json'), JSON.stringify({ at: new Date().toISOString(), passed: out.filter((c) => c.ok).length, total: out.length, checks: out, errors }, null, 1));
  console.log(`${out.filter((c) => c.ok).length}/${out.length} passed`);
  await browser.close();
  process.exit(out.every((c) => c.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

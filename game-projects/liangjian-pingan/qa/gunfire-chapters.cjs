// 枪火集结抗战战役（v0.2.3 删掉旧第三章代码之后）：第一、二章照常开局、移动、开枪、扔雷、上马、结算；第三章与旧第三章存档都跳到重做版
// 场景推进（清场、推进阶段）用 QA 捷径，移动、开枪、手榴弹、上马走真实按键。
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
  const menu = await R(() => ({ shown: !document.getElementById('warMenu').classList.contains('hidden'), cards: [...document.querySelectorAll('#warChapters button')].map((b) => b.textContent), oldUi: ['warTow', 'warCannonTools', 'warImpact'].filter((id) => document.getElementById(id)) }));
  check('战役菜单三章都在；第三章卡片写明重做版、秀芹与双结局；旧的拉炮 / 炮位控件已删除', menu.shown && menu.cards.length === 3 && /重做版/.test(menu.cards[2]) && /秀芹/.test(menu.cards[2]) && /双结局/.test(menu.cards[2]) && !menu.oldUi.length, menu);

  // ---------- 第一章 ----------
  await page.click('#warChapters button[data-chapter="0"]');
  await page.waitForTimeout(300);
  let st = await R(() => { const s = __gameQA.resistanceCampaign.state; return { active: s.active, chapter: s.chapter, z: s.player.root.position.z, ammo: JSON.stringify(s.ammo), grenades: s.grenades }; });
  check('第一章：点卡片开局', st.active && st.chapter === 0, st);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(700); await page.keyboard.up('KeyW');
  const z1 = await R(() => __gameQA.resistanceCampaign.state.player.root.position.z);
  await page.keyboard.down('KeyJ'); await page.waitForTimeout(900); await page.keyboard.up('KeyJ');
  await page.keyboard.press('KeyU'); await page.waitForTimeout(300);
  const after = await R(() => { const s = __gameQA.resistanceCampaign.state; return { ammo: JSON.stringify(s.ammo), grenades: s.grenades }; });
  check('第一章：W 前进、J 开枪耗弹、U 扔手榴弹', Math.abs(z1 - st.z) > 0.5 && after.ammo !== st.ammo && after.grenades === st.grenades - 1, { z0: st.z, z1, before: st, after });
  const fin1 = await R(() => { const r = __gameQA.resistanceCampaign, s = r.state; s.invulnerable = 999; for (let i = 0; i < 3; i++) { s.units.filter((u) => u.team === 'enemy' && !u.dead).forEach((u) => r.damage(u, 999)); r.advance(); } return { over: s.over, finished: s.finished, result: !document.getElementById('warResult').classList.contains('hidden'), title: document.getElementById('warResultTitle').textContent, next: !document.getElementById('warNext').classList.contains('hidden') }; });
  check('第一章：推进到结算，结算页正常显示', fin1.over && fin1.finished && fin1.result, fin1);

  // ---------- 第二章（结算页“下一章”） ----------
  await page.click('#warNext');
  await page.waitForTimeout(300);
  st = await R(() => { const s = __gameQA.resistanceCampaign.state; return { active: s.active, chapter: s.chapter, mounted: s.player.mounted }; });
  await page.keyboard.press('KeyI'); await page.waitForTimeout(200);
  const m = await R(() => __gameQA.resistanceCampaign.state.player.mounted);
  const zb = await R(() => __gameQA.resistanceCampaign.state.player.root.position.z);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
  const za = await R(() => __gameQA.resistanceCampaign.state.player.root.position.z);
  check('第二章：从第一章结算“下一章”进入，I 上马、W 骑行', st.active && st.chapter === 1 && !st.mounted && m && Math.abs(za - zb) > 0.5, { st, m, zb, za });
  const fin2 = await R(() => { const r = __gameQA.resistanceCampaign, s = r.state; s.invulnerable = 999; for (let i = 0; i < 3; i++) { s.units.filter((u) => u.team === 'enemy' && !u.dead).forEach((u) => r.damage(u, 999)); r.advance(); } return { over: s.over, finished: s.finished, result: !document.getElementById('warResult').classList.contains('hidden') }; });
  check('第二章：推进到结算，结算页正常显示', fin2.over && fin2.finished && fin2.result, fin2);

  // ---------- 第三章：结算页“下一章”跳到重做版 ----------
  await Promise.all([page.waitForURL(/\/pingan\/index\.html/, { timeout: 10000 }).catch(() => {}), page.click('#warNext')]);
  check('第二章结算点“下一章”跳到平安县城重做版', /\/gunfire-assembly\/pingan\/index\.html/.test(page.url()), page.url());

  // ---------- 旧第三章存档：继续检查点也跳到重做版 ----------
  await boot();
  await R(() => localStorage.setItem('chongchao-resistance-checkpoint-v1', JSON.stringify({ schema: 1, chapter: 2, phase: 2, elapsed: 30, kills: 5, finished: false, cannonPose: { x: 1, z: 60, yaw: 0 } })));
  await boot();
  await page.click('#btnResistance');
  const cont = await R(() => ({ disabled: document.getElementById('warContinue').disabled, info: document.getElementById('warSaveInfo').textContent }));
  await Promise.all([page.waitForURL(/\/pingan\/index\.html/, { timeout: 10000 }).catch(() => {}), page.click('#warContinue')]);
  check('旧版第三章存档：菜单注明“重做版”，点“继续检查点”跳到重做版', !cont.disabled && /重做版/.test(cont.info) && /\/pingan\/index\.html/.test(page.url()), { cont, url: page.url() });

  check('全程没有报错', !errors.length, errors);
  fs.writeFileSync(path.join(__dirname, 'out-gunfire-chapters.json'), JSON.stringify({ at: new Date().toISOString(), passed: out.filter((c) => c.ok).length, total: out.length, checks: out, errors }, null, 1));
  console.log(`${out.filter((c) => c.ok).length}/${out.length} passed`);
  await browser.close();
  process.exit(out.every((c) => c.ok) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

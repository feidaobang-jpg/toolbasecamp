// v0.2 截图（手动时钟渲染，1280×720 高画质）：耐久菜单、营房掉修理包、受击闪红、残甲冒烟、捡修理包、检查点补满、经典一发、结算。
// 说明：受击画面用测试钩子 bulletsAt 在吉普西侧 3 米处放一颗敌弹（真实的敌弹判定与受击流程），其余为键盘操作或正常流程。
const fs = require('fs');
const { BASE, snap, launch } = require('./lib');
(async () => {
  const outDir = process.argv[2] || 'out/shots-v02';
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '?test=1&q=high&seed=41&clean=1');
  await page.waitForTimeout(1500);
  await page.evaluate(() => __JK_TEST__.manual(true));
  const steps = (n) => page.evaluate((n) => { for (let i = 0; i < n; i++) __JK_TEST__.step(1, false); }, n);
  const cheat = (fn, arg) => page.evaluate(([fn, arg]) => __JK_TEST__.cheat[fn].apply(null, arg || []), [fn, arg]);
  const log = [];
  const shot = async (name, note) => { await page.evaluate(() => __JK_TEST__.step(1, true)); await page.screenshot({ path: outDir + '/' + name + '.png' }); const s = await snap(page); log.push({ name, note, t: s.t, armor: s.player && s.player.armor, toast: s.ui.toast }); console.log(name, s.player && s.player.armor, s.ui.toast); };
  const shootMe = async () => { const q = await snap(page); await page.evaluate(([x, y]) => __JK_TEST__.cheat.bulletsAt(x - 3, y, Math.PI / 2), [q.player.x, q.player.y]); };
  for (let k = 0; k < 40; k++) await page.evaluate(() => __JK_TEST__.step(2, false));
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await shot('s-v02-title-armor-option', '主菜单新增「耐久：标准 3 格 / 经典一发」，焦点在该项');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await steps(130);
  // 营房 H0：键盘扔手雷 → 掉修理包
  await cheat('teleport', [-14.5, 26.5]); await cheat('invuln', [3]);
  await page.keyboard.down('KeyW'); await steps(3); await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyK'); await steps(2); await page.keyboard.up('KeyK');
  await steps(62);
  await shot('s-v02-hut-kit-drop', '手雷炸开营房 H0：放出俘虏，同时掉出黄色修理包');
  // 受击
  await cheat('teleport', [-20, 12]); await cheat('invuln', [0]);
  await page.evaluate(() => { __JK_TEST__.cheat.state().P.shield = 0; });
  await steps(3);
  await shootMe(); await steps(19);
  await shot('s-v02-hit-flash', '敌弹命中：吉普闪白、画面四周闪红，HUD 护甲 3 → 2（敌弹由测试钩子放置）');
  await steps(90);
  await shootMe(); await steps(19); await steps(70);
  await shot('s-v02-armor1-smoke', '只剩 1 格护甲：HUD 护甲变红闪烁，车尾冒黑烟');
  await cheat('invuln', [30]);   // 之后几张只演示修理包与检查点，先挡住周围敌弹
  const p = (await snap(page)).player;
  await page.evaluate(([x, y]) => __JK_TEST__.cheat.kitAt(x, y + 4.5), [p.x, p.y]);
  await steps(30); await cheat('invuln', [0]);
  await shot('s-v02-kit-ahead', '修理包在前方（测试钩子放置，外观与营房掉落的一致）');
  await cheat('invuln', [30]);
  await page.keyboard.down('KeyW'); await steps(36); await page.keyboard.up('KeyW');
  await steps(4); await cheat('invuln', [0]);
  await shot('s-v02-kit-picked', '开过修理包：护甲 +1，提示「修理包：护甲 +1」');
  await cheat('invuln', [30]);
  // 检查点补满
  await cheat('armor', [1]); await cheat('teleport', [8, 45.6]); await cheat('invuln', [60]); await steps(20);
  await page.keyboard.down('KeyW'); await steps(22); await page.keyboard.up('KeyW');
  await steps(8); await cheat('invuln', [0]);   // 关掉闪烁，保证这一帧吉普可见
  await shot('s-v02-checkpoint-refill', '经过检查点「营地外」：护甲自动补满，提示「护甲已补满」');
  // 经典一发
  await page.keyboard.press('Escape'); await steps(1);
  const items = await page.$$eval('#pause .items > *', els => els.map(e => e.getAttribute('data-act') || e.getAttribute('data-opt')));
  for (let k = 0; k < items.indexOf('title'); k++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight');
  await steps(2);
  await shot('s-v02-title-classic', '主菜单切到「耐久：经典一发」');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Enter');
  await steps(190);
  await shot('s-v02-classic-hud', '经典一发：HUD 只有 1 格（金色）并标注「一发」');
  // 复原设置
  await page.keyboard.press('Escape'); await steps(1);
  for (let k = 0; k < items.indexOf('title'); k++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowLeft');
  fs.writeFileSync(outDir + '/shots.json', JSON.stringify({ when: new Date().toISOString(), seed: 41, viewport: [1280, 720], quality: 'high', capture: 'manual-clock render + page.screenshot', errors, shots: log }, null, 1));
  await browser.close();
})();

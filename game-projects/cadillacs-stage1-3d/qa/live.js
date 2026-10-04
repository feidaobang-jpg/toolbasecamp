// 线上冒烟：游戏列表卡片 + 公网游戏页可开局、无报错
const { launch, out, sleep } = require('./lib');
(async () => {
  const b = await launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('https://www.zhengxiaohui.cn/games.html', { waitUntil: 'networkidle' });
  await sleep(1500);
  const card = await page.evaluate(() => { const a = Array.from(document.querySelectorAll('a')).find(x => /cadillacs-stage1-3d/.test(x.href)); return a ? { href: a.href, text: a.textContent.trim().slice(0, 40), img: (a.querySelector('img') || {}).src || null } : null; });
  console.log('card', JSON.stringify(card));
  if (card) { await page.evaluate(() => { const a = Array.from(document.querySelectorAll('a')).find(x => /cadillacs-stage1-3d/.test(x.href)); a.scrollIntoView({ block: 'center' }); }); await sleep(600); await page.screenshot({ path: out('live-games.png') }); }
  const g = await b.newPage({ viewport: { width: 1280, height: 720 } });
  g.on('pageerror', e => errs.push('game pageerror: ' + e.message));
  g.on('console', m => { if (m.type() === 'error') errs.push('game console: ' + m.text()); });
  await g.goto('https://www.zhengxiaohui.cn/html/game/cadillacs-stage1-3d/index.html', { waitUntil: 'load' });
  await sleep(2500);
  await g.keyboard.press('Enter'); await sleep(400); await g.keyboard.press('Enter'); await sleep(1500);
  for (let i = 0; i < 6; i++) { await g.keyboard.press('KeyJ'); await sleep(300); }
  await g.keyboard.down('KeyD'); await sleep(1200); await g.keyboard.up('KeyD');
  for (let i = 0; i < 6; i++) { await g.keyboard.press('KeyJ'); await sleep(180); }
  await g.screenshot({ path: out('live-game.png') });
  const hud = await g.evaluate(() => ({ hud: !document.getElementById('hud').hidden, timer: document.getElementById('h-timer').textContent, score: document.getElementById('h-score').textContent, loading: document.getElementById('loading').hidden }));
  console.log('game', JSON.stringify(hud));
  console.log(errs.slice(0, 8).join('\n') || 'no errors');
  await b.close();
})();

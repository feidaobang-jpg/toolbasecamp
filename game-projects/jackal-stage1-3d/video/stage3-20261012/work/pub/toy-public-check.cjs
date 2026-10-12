// Toy 公开入口核验（公开页匿名访问会弹登录提示，所以用已登录的投稿窗口看）：只读，不改任何东西。
// 用法：node toy-public-check.cjs  → 逐个打开五款游戏的公开入口，在游戏框架里数按 C 的视角个数、看菜单是否完整、读版本
const { open, sleep } = require('./lib.cjs');
const GAMES = [['feidao-jackal-3d', 'remake'], ['feidao-cadillacs-3d', 'remake'], ['feidao-mario-3d', 'remake'], ['feidao-tank-3d', 'remake'], ['chongchao-qianshao', 'chongchao']];
(async () => {
  const ctx = await open({ viewport: { width: 1280, height: 720 } }); const p = ctx.pages()[0] || await ctx.newPage(); const out = [];
  for (const [slug, kind] of GAMES) {
    const r = { slug };
    try {
      await p.goto('https://www.bilibili.com/toy/' + slug + '/index.html', { waitUntil: 'load', timeout: 60000 });
      const fh = await p.waitForSelector('iframe[src*="bilibilitoy"], iframe', { timeout: 30000 }); const g = await fh.contentFrame(); r.frame = g.url().split('?')[0].slice(0, 80);
      if (kind === 'chongchao') {
        await g.goto(g.url().split('?')[0] + '?qa=1'); await g.waitForFunction(() => window.__gameQA && window.__ccReady, null, { timeout: 45000 });
        r.seq = await g.evaluate(async () => { const q = window.__gameQA; q.newGame(true); q.setCamMode('third', false); q.setCameraView(0, false); const o = [[q.getCamMode(), q.getCamView()]]; for (let i = 0; i < 4; i++) { q.cycleCamView(); await new Promise(z => setTimeout(z, 200)); o.push([q.getCamMode(), q.getCamView()]); } return o; });
        r.version = await g.evaluate(() => (document.body.innerText.match(/v?0\.\d+\.\d+/) || [''])[0]);
        r.ok = JSON.stringify(r.seq) === JSON.stringify([['third', 0], ['third', 1], ['third', 2], ['first', 2], ['third', 0]]) && /0\.36\.4/.test(r.version);
      } else {
        await g.waitForFunction(() => { const m = document.getElementById('menu'); return m && !m.hidden; }, null, { timeout: 45000 }); await sleep(2000);
        r.views = []; for (let i = 0; i < 5; i++) { r.views.push((await g.locator('#cam-label').innerText()).trim()); await g.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true }))); await sleep(250); }
        r.menu = await g.evaluate(() => { const vh = innerHeight, vw = innerWidth; const els = [...document.querySelectorAll('#menu .items > *')].filter(e => e.getBoundingClientRect().width > 4); return { frame: [vw, vh], off: els.filter(e => { const b = e.getBoundingClientRect(); return b.bottom > vh + 1 || b.top < -1; }).length, cols: getComputedStyle(document.querySelector('#menu .items')).gridTemplateColumns.split(' ').length }; });
        r.ok = new Set(r.views.slice(0, 4)).size === 4 && r.views[4] === r.views[0] && r.menu.off === 0;
      }
    } catch (e) { r.error = String(e).slice(0, 200); r.ok = false; }
    out.push(r); console.log(JSON.stringify(r));
  }
  await ctx.close();
  console.log(out.every(r => r.ok) ? 'ALL OK' : 'SOME FAILED');
})().catch(e => { console.error('FAIL', e); process.exit(1); });

// Exercise the exact self-contained TapTap build, with all external requests blocked.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'dist/taptap/chongchao-qianshao');
const reportDir = process.env.TAPTAP_REPORT_DIR ? path.resolve(process.env.TAPTAP_REPORT_DIR) : path.join(__dirname, 'media-kit/releases/taptap-trial-20261006');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
fs.mkdirSync(reportDir, {recursive:true});
const server = http.createServer((req,res) => {
  const requested = path.resolve(output, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!requested.startsWith(output + path.sep) || !fs.existsSync(requested) || !fs.statSync(requested).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, {'content-type':mime[path.extname(requested)] || 'application/octet-stream'});
  fs.createReadStream(requested).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const gameURL = origin + '/chongchao-qianshao/index.html?qa=1';
  const browser = await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const results = [];
  try {
    for (const size of [{name:'desktop',width:1920,height:1080},{name:'phone-landscape',width:844,height:390},{name:'phone-portrait',width:390,height:844}]) {
      const context = await browser.newContext({viewport:{width:size.width,height:size.height},hasTouch:size.name !== 'desktop'});
      const page = await context.newPage();
      const errors = [], external = [], failedResources = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {if(response.status() >= 400) failedResources.push({url:response.url(),status:response.status()});});
      await page.route('**/*', route => {
        const url = route.request().url();
        if (!url.startsWith(origin + '/')) {external.push(url);return route.abort();}
        return route.continue();
      });
      await page.goto(gameURL);
      await page.waitForFunction(() => window.__ccReady && window.__gameQA);
      // 2026-10-07 云存档版起，TapTap 包保留「档案站」（网站账号云备份与本地导入导出），只去掉 Toy 排行与视频导航。
      assert.equal(await page.locator('#btnPlatformMenu').count(),1);
      assert.equal(await page.locator('a.gameBack').count(),0);
      await page.screenshot({path:path.join(reportDir,size.name+'-menu.png')});
      await page.locator('#btnStart').click();
      await page.waitForFunction(() => __gameQA.Game.state === 'prep');
      const initial = await page.evaluate(() => ({chapter:__gameQA.Game.chapter,level:__gameQA.Game.level,difficulty:__gameQA.Game.difficulty}));
      await page.screenshot({path:path.join(reportDir,size.name+'-base.png')});
      await page.locator(size.name === 'desktop' ? '#menuButton' : '#vP').click();
      await page.locator('#deviceMode').selectOption('touch');
      assert.ok(await page.locator('#stage').evaluate(e=>e.classList.contains('touch-mode')));
      await page.locator('#deviceMode').selectOption('desktop');
      assert.equal(await page.locator('#stage').evaluate(e=>e.classList.contains('touch-mode')),false);
      await page.locator('#deviceMode').selectOption(size.name === 'desktop' ? 'desktop' : 'touch');
      assert.deepEqual(await page.evaluate(() => ({chapter:__gameQA.Game.chapter,level:__gameQA.Game.level,difficulty:__gameQA.Game.difficulty})),initial);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('taptap-chongchao-v1-sst_save_auto')));
      assert.ok(saved && saved.chapter === initial.chapter);
      assert.equal(await page.evaluate(() => localStorage.getItem('sst_save_auto')),null);
      await page.locator('#btnResume').click();
      if (size.name === 'desktop') {
        const before = await page.evaluate(() => ({x:__gameQA.player.pos.x,z:__gameQA.player.pos.z}));
        await page.keyboard.down('KeyW');await page.waitForTimeout(400);await page.keyboard.up('KeyW');
        const after = await page.evaluate(() => ({x:__gameQA.player.pos.x,z:__gameQA.player.pos.z}));
        assert.ok(Math.hypot(after.x-before.x,after.z-before.z) > 0.1);
      } else {
        await page.locator('#vJ').dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',isPrimary:true,bubbles:true});
        assert.equal(await page.evaluate(() => __gameQA.Input.keys.J),true);
        await page.locator('#vJ').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',isPrimary:true,bubbles:true});
        assert.equal(await page.evaluate(() => __gameQA.Input.keys.J),false);
      }
      await page.locator('#readyBtn').click();
      await page.waitForFunction(() => __gameQA.Game.state === 'battle');
      await page.waitForTimeout(3000);
      await page.screenshot({path:path.join(reportDir,size.name+'-battle.png')});
      await page.locator(size.name === 'desktop' ? '#menuButton' : '#vP').click();
      const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('taptap-chongchao-v1-sst_save_auto')));
      await page.reload();await page.waitForFunction(() => window.__ccReady);
      await page.locator('#btnContinue').click();
      await page.waitForFunction(() => __gameQA.Game.state !== 'menu');
      assert.equal(await page.evaluate(() => __gameQA.Game.chapter),progress.chapter);
      assert.equal(await page.evaluate(() => __gameQA.Game.level),progress.level);
      // 虫潮对战（v0.26.0）：同一包里从主菜单进入对战电脑，打开出兵面板并派兵，退出后回到主菜单。
      await page.evaluate(() => document.getElementById('btnQuit').click());
      await page.waitForFunction(() => __gameQA.Game.state === 'menu');
      await page.locator('#btnVersus').click();await page.locator('[data-vs-ai="normal"]').click();
      await page.waitForFunction(() => __gameQA.versus.state.active);
      await page.evaluate(() => {const v=__gameQA.versus;v.state.time=21;v.seat('blue0').gold=2000;});
      await page.locator(size.name === 'desktop' ? '#stage' : '#vR').click({position: size.name === 'desktop' ? {x:500,y:400} : undefined});
      if (size.name === 'desktop') await page.keyboard.press('KeyR');
      await page.waitForFunction(() => !document.getElementById('vsPanel').classList.contains('hidden'));
      await page.locator('#vsGrid .vs-card').nth(1).click();
      await page.waitForFunction(() => __gameQA.versus.state.units.filter(u => u.team === 'blue').length >= 6);
      await page.waitForTimeout(1500);
      await page.screenshot({path:path.join(reportDir,size.name+'-versus.png')});
      assert.equal(await page.evaluate(() => localStorage.getItem('taptap-chongchao-v1-sst_save_auto') !== null),true);
      assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(failedResources,[]);
      results.push({viewport:size,boot:true,new_game:true,mode_switch_preserves_progress:true,input:true,battle:true,reload_save:true,versus:true,errors,external_requests:external,failed_resources:failedResources,device:'desktop browser simulation'});
      await context.close();
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'));
    const report = {status:'passed',tested_at:new Date().toISOString(),package_sha256:manifest.zip_sha256,version:manifest.version,results,real_phone_test:false};
    fs.writeFileSync(path.join(reportDir,'qa.json'),JSON.stringify(report,null,2)+'\n','utf8');
    console.log(JSON.stringify(report,null,2));
  } finally {
    await browser.close();await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {console.error(error);server.close();process.exitCode=1;});

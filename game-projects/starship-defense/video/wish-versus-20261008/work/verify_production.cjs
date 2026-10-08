const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.join(__dirname,'qa');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});const reports=[];
 try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://www.zhengxiaohui.cn/games.html');await page.waitForSelector('.gvb-fulfilled-row');
  const fulfilled=await page.locator('.gvb-fulfilled-row').innerText();assert.match(fulfilled,/双人对战塔防/);assert.match(fulfilled,/11 票/);
  assert.equal(await page.locator('.gvb-cols section').nth(1).getByText('双人对战塔防',{exact:true}).count(),0);
  await page.locator('#game-vote-board').screenshot({path:path.join(out,'production-hub-'+viewport.width+'.png')});
  await page.goto('https://www.zhengxiaohui.cn/game-vote.html?progress=fulfilled#gv-wish-board');await page.waitForSelector('#gv-wishlist .gv-progress');
  const text=await page.locator('#gv-wishlist').innerText();assert.match(text,/升级你的银行/);assert.match(text,/11 票/);
  assert.equal(await page.locator('#gv-wishlist .gv-vote-btn').count(),0);
  const urls=await page.locator('#gv-wishlist a').evaluateAll(a=>a.map(e=>e.href));assert.equal(urls.length,2);assert.ok(urls[0].includes('/html/game/starship-defense/index.html'));assert.ok(urls[1].includes('toy/chongchao-qianshao/index.html'));
  await page.locator('#gv-wish-board').screenshot({path:path.join(out,'production-fulfilled-'+viewport.width+'.png')});
  assert.deepEqual(errors,[]);reports.push({viewport,fulfilled,urls,errors});await page.close();
 }}finally{await browser.close();}
 fs.writeFileSync(path.join(out,'production-wishlist.json'),JSON.stringify({at:new Date().toISOString(),production_writes:0,reports},null,2));console.log('PRODUCTION PASS',reports.length);
})().catch(e=>{console.error(e);process.exit(1);});

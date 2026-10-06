// Exercise the root URL used by the desktop launcher, including the popup link.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
let browser;
(async()=>{
  const root=process.env.LIVE_TEST_URL||'http://127.0.0.1:18765';
  const out=path.resolve(__dirname,'../../media-kit/releases/live-v0.1.0/entry-fix');await fs.mkdir(out,{recursive:true});
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],badResponses=[],failedRequests=[];
  const watch=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()});});p.on('requestfailed',r=>failedRequests.push({url:r.url(),error:r.failure()?.errorText}));};
  context.on('page',watch);const consolePage=await context.newPage();await consolePage.goto(root+'/');
  assert(consolePage.url().endsWith('/html/game/starship-defense/live-console.html'));
  await consolePage.waitForFunction(()=>document.querySelector('#connection').textContent!=='正在检测本机服务。未连接B站时只运行演示；模拟事件不会产生真实礼物或收益。');
  assert.equal(await consolePage.locator('.cards').evaluate(el=>getComputedStyle(el).display),'grid');
  await consolePage.locator('#diagnose').click();await consolePage.locator('#health').filter({hasText:'live-v0.1.0'}).waitFor();
  await consolePage.locator('#rules').click();await consolePage.locator('#ruleDialog[open]').waitFor();await consolePage.locator('#closeRules').click();
  const popupPromise=consolePage.waitForEvent('popup');await consolePage.getByRole('link',{name:'打开直播画面',exact:true}).click();const game=await popupPromise;
  await game.frameLocator('#game').locator('#btnStart').waitFor();await consolePage.locator('[data-control="start"]').click();
  await game.locator('#startPanel').waitFor({state:'hidden'});await consolePage.locator('#state').filter({hasText:'AI 独播'}).waitFor();
  await consolePage.locator('[data-comment="加入"]').click();await game.locator('#viewers').filter({hasText:'1 人'}).waitFor();
  await consolePage.locator('[data-support="tank"]').click();await consolePage.locator('#events').filter({hasText:'坦克抵达停机坪'}).waitFor();
  for(const [mode,label] of [['assist','我操作 · AI辅助'],['host','我主持 · AI操作'],['auto','AI 独播']]){
    await consolePage.locator('[data-mode="'+mode+'"]').click();await consolePage.locator('#state').filter({hasText:label}).waitFor();
  }
  // Start/phase announcements have a six-second speech cooldown; ask after
  // the opening announcement instead of requiring every rapid chat to speak.
  await consolePage.waitForTimeout(7000);
  await consolePage.locator('#comment').fill('你是这场游戏里的谁');await consolePage.locator('#send').click();
  await consolePage.locator('#events').filter({hasText:'本地AI'}).waitFor({timeout:25000});
  await consolePage.locator('[data-control="pause"]').click();await game.locator('#status').filter({hasText:'已暂停'}).waitFor();
  await consolePage.locator('[data-control="resume"]').click();await game.locator('#status').filter({hasText:'运行中'}).waitFor();
  await consolePage.locator('#diagnose').click();await consolePage.locator('#health').filter({hasText:'"gameConnected": true'}).waitFor();
  await consolePage.screenshot({path:path.join(out,'after-console.png'),fullPage:true});await game.screenshot({path:path.join(out,'after-game.png')});
  const result={root,canonical:consolePage.url(),game:game.url(),at:new Date().toISOString(),errors,badResponses,failedRequests,checks:['root redirect','CSS and JS','rules','health','popup link','start','join','tank','three modes','local AI reply','pause/resume']};
  await fs.writeFile(path.join(out,'after.json'),JSON.stringify(result,null,2));
  assert.deepEqual(errors,[]);assert.deepEqual(badResponses,[]);assert.deepEqual(failedRequests,[]);
  await context.close();await browser.close();console.log(JSON.stringify({ok:true,out,result}));
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});

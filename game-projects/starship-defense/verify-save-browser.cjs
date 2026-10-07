// Actual game and channel packages; cloud APIs are isolated mocks, never player data.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),out=process.env.SAVE_QA_OUT||path.join(__dirname,'media-kit/releases/web-cloudsave-v0.24.0/qa/browser');
const base='http://127.0.0.1:8941';
const save={testMode:false,cls:'gunner',campaignId:'qa-campaign',loop:1,chapter:2,level:3,gold:1234,score:200,weapons:['lmg'],curWeapon:'lmg',items:{medkit:2},time:Date.now()-86400000,buildings:[],vehiclesOwned:[],squadCount:0};
const record=()=>({schema:2,game:'starship-defense',revision:'qa-r1',save:structuredClone(save)});
const cases=[['web',{width:1280,height:720}],['web',{width:390,height:844}],['web',{width:844,height:390}],['toy',{width:1280,height:720}],['toy',{width:390,height:844}],['taptap',{width:844,height:390}],['taptap',{width:390,height:844}]];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']}),results=[];
 try{for(const [channel,viewport] of cases){
  const mobile=viewport.width<1000,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'}:{})}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));let cloud=record(),backups=[],writes=[],gets=0;
  const prefix=channel==='toy'?'toy-chongchao-v1-sst_save_':channel==='taptap'?'taptap-chongchao-v1-sst_save_':'sst_save_';
  const route=channel==='web'?'/public/html/game/starship-defense/index.html':channel==='taptap'?'/dist/taptap/chongchao-qianshao/chongchao-qianshao/index.html':'https://www.bilibilitoy.com/toy/qa-cloudsave/index.html';
  if(channel==='toy'){
   const dir=path.join(root,'dist/toy/chongchao-qianshao/package');
   await p.route('https://www.bilibilitoy.com/toy/qa-cloudsave/**',r=>{const file=decodeURIComponent(new URL(r.request().url()).pathname.replace('/toy/qa-cloudsave/',''));return r.fulfill({path:path.join(dir,file)});});
   await context.addInitScript(({save})=>{
    window.__cloudMock={values:{chongchao_auto_v2:JSON.stringify({schema:2,game:'starship-defense',revision:'qa-r1',save})},writes:[]};
    window.toy={isSupport:async()=>true,getCloudStorage:async()=>structuredClone(window.__cloudMock.values),setCloudStorage:async items=>{window.__cloudMock.writes.push(items);Object.assign(window.__cloudMock.values,items);},getAuthorProfile:async()=>({status:'denied'}),getRankList:async()=>[]};
   },{save});
  }else{
   await p.route('https://www.zhengxiaohui.cn/api/game/saves/**',async r=>{
    const req=r.request(),url=new URL(req.url());
    if(req.method()==='OPTIONS')return r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT','Access-Control-Allow-Headers':'authorization,content-type'}});
    if(url.pathname.endsWith('/login'))return r.fulfill({json:{token:'isolated-qa-token'},headers:{'Access-Control-Allow-Origin':'*'}});
    if(req.method()==='PUT'){
     const body=req.postDataJSON();assert.equal(body.expected_revision,cloud?.revision||null);if(cloud)backups=[cloud,...backups].slice(0,3);cloud={schema:2,game:'starship-defense',revision:'qa-r'+(writes.length+2),save:body.save};writes.push(body);
     return r.fulfill({json:{current:cloud,backups},headers:{'Access-Control-Allow-Origin':'*'}});
    }
    gets++;return r.fulfill({json:{current:cloud,backups,account_id:1},headers:{'Access-Control-Allow-Origin':'*'}});
   });
  }
  await context.addInitScript(({prefix,save,channel})=>{
   // Seed once per isolated context; reloads retain subsequent edits and deletions.
   if(!sessionStorage.getItem('qa-seeded')){localStorage.setItem(prefix+'auto',JSON.stringify(save));if(channel!=='toy')localStorage.setItem(prefix+'site-token','isolated-qa-token');sessionStorage.setItem('qa-seeded','yes');}
  },{prefix,save,channel});
  const url=route.startsWith('https:')?route:base+route;await p.goto(url);await p.locator('#btnContinue').waitFor({state:'visible'});await p.locator('#btnContinue').click();
  await p.locator('#hud').waitFor({state:'visible'});
  if(channel==='toy')await p.waitForFunction(()=>window.__cloudMock.writes.length>0,{},{timeout:12000});
  else {for(let i=0;i<120&&writes.length===0;i++)await p.waitForTimeout(100);assert(writes.length>0,'ordinary game checkpoint uploads automatically');}
  assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')).gold,prefix),1234);
  // Lose the complete local game namespace while preserving the test login.
  await p.evaluate(prefix=>{for(const key of Object.keys(localStorage))if(key.startsWith(prefix)&&!key.endsWith('site-token'))localStorage.removeItem(key);},prefix);
  // Toy's mock backend must survive a game reload, just as the real server does.
  if(channel==='toy'){
   const values=await p.evaluate(()=>window.__cloudMock.values);await context.addInitScript(values=>{window.__cloudMock.values=values;},values);
  }
  await p.reload();await p.locator('#btnPlatformMenu').waitFor({state:'visible'});await p.locator('#btnPlatformMenu').click();await p.locator('#cloudLoad').waitFor({state:'visible'});
  await p.locator('#cloudLoad').click();await p.locator('#confirmOk').click();await p.locator('#hud').waitFor({state:'visible'});
  const restored=await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')),prefix);assert.equal(restored.gold,1234);assert.equal(restored.level,3);
  await p.locator('#saveHealth').click();const downloadPromise=p.waitForEvent('download');await p.locator('#saveExport').click();const download=await downloadPromise;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.game,'starship-defense');assert.equal(exported.save.gold,1234);assert(!JSON.stringify(exported).includes('token'));
  await p.locator('#saveImportFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await p.locator('#cloudSaveStatus').filter({hasText:'格式错误'}).waitFor();assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')).gold,prefix),1234);
  const imported={...exported.save,campaignId:'qa-imported',gold:2222};await p.locator('#saveImportFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema:1,game:'starship-defense',save:imported}))});await p.locator('#confirmOk').click();
  assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')).gold,prefix),2222);assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'cloud-backup')).gold,prefix),1234);
  await p.locator('#saveHealth').click();await p.locator('#saveHistory').click();assert(await p.locator('#localHistory button').count()>0);
  if(channel!=='toy'){
   await p.locator('#saveLogout').click();await p.locator('#saveLoginToggle').click();await p.locator('#saveAccount').fill('qa@example.invalid');await p.locator('#savePassword').fill('qa-only-password');
   assert.equal(await p.locator('#savePassword').evaluate(e=>document.activeElement===e),true);await p.locator('#saveLoginSubmit').click();await p.locator('#saveLoginForm').waitFor({state:'hidden'});assert.equal(await p.locator('#savePassword').inputValue(),'');
   assert.equal(await p.evaluate(()=>Object.values(localStorage).some(x=>x.includes('qa-only-password'))),false);
   assert.match(await p.locator('#cloudSaveStatus').innerText(),/不同|连接/);
  }
  await p.screenshot({path:path.join(out,channel+'-'+viewport.width+'x'+viewport.height+'.png')});
  // Demonstrate storage failure in the real game's pause checkpoint.
  await p.locator('#platformClose').click();await p.evaluate(prefix=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith(prefix))throw new DOMException('quota','QuotaExceededError');return old.call(this,k,v);};},prefix);
  await p.locator(mobile?'#vP':'#menuButton').click();await p.locator('#saveHealth').filter({hasText:'本地保存失败'}).waitFor();assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')).gold,prefix),2222);
  assert.equal(errors.length,0,errors.join('\n'));results.push({channel,viewport,passed:true,checks:['one-day-old legacy save','automatic cloud checkpoint','empty-device cloud restore','export without credentials','bad import rejected','confirmed import preserves former local save','history recovery entries','storage failure keeps primary',...(channel==='toy'?[]:['account login keyboard focus','password not persisted'])],errors});console.log('PASS '+channel+' '+viewport.width+'x'+viewport.height);await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({method:'Edge headless; actual game bundles; cloud APIs mocked in isolated contexts, no player account writes; mobile viewports are simulations',results},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

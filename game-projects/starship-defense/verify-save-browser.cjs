// Actual game and channel packages; cloud APIs are isolated mocks, never player data.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../..'),out=process.env.SAVE_QA_OUT||path.join(__dirname,'media-kit/releases/web-fps-rules-v0.34.0-privacy1/qa/browser');
const save={testMode:false,cls:'gunner',campaignId:'qa-campaign',loop:1,chapter:2,level:3,gold:1234,score:200,weapons:['lmg'],curWeapon:'lmg',items:{medkit:2},time:Date.now()-86400000,buildings:[],vehiclesOwned:[],squadCount:0};
const cases=[['toy',{width:1280,height:720}],['toy',{width:390,height:844}],['toy',{width:844,height:390}]];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']}),results=[];
 try{for(const [channel,viewport] of cases){
  const mobile=viewport.width<1000,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1,...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'}:{})}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const prefix=channel==='toy'?'toy-chongchao-v1-sst_save_':channel==='taptap'?'taptap-chongchao-v1-sst_save_':'sst_save_';
  const route='https://www.bilibilitoy.com/toy/qa-cloudsave/index.html';
  if(channel==='toy'){
   const dir=path.join(root,'dist/toy/chongchao-qianshao/package');
   await p.route('https://www.bilibilitoy.com/toy/qa-cloudsave/**',r=>{const file=decodeURIComponent(new URL(r.request().url()).pathname.replace('/toy/qa-cloudsave/',''));return r.fulfill({path:path.join(dir,file)});});
   await context.addInitScript(({save})=>{
    window.__cloudMock={values:{chongchao_auto_v2:JSON.stringify({schema:2,game:'starship-defense',revision:'qa-r1',save})},writes:[],reads:0,denied:false};
    window.toy={isSupport:async()=>true,getCloudStorage:async()=>{window.__cloudMock.reads++;if(window.__cloudMock.denied)throw Error('用户未登录');return structuredClone(window.__cloudMock.values);},setCloudStorage:async items=>{window.__cloudMock.writes.push(items);Object.assign(window.__cloudMock.values,items);},getAuthorProfile:async()=>({status:'denied'}),getRankList:async()=>[]};
   },{save});
  }
  await context.addInitScript(({prefix,save,channel})=>{
   // Seed once per isolated context; reloads retain subsequent edits and deletions.
   if(!sessionStorage.getItem('qa-seeded')){localStorage.setItem(prefix+'auto',JSON.stringify(save));sessionStorage.setItem('qa-seeded','yes');}
  },{prefix,save,channel});
  const url=route;await p.goto(url);await p.locator('#btnContinue').waitFor({state:'visible'});
  assert.equal(await p.evaluate(()=>window.__cloudMock.reads),0,'startup requested account cloud storage');
  await p.locator('#btnPlatformMenu').click();assert.equal(await p.evaluate(()=>window.__cloudMock.reads),0,'opening local saves requested cloud storage');
  assert((await p.locator('#cloudInfo').innerText()).includes('尚未查看'),'unread cloud save was incorrectly reported as absent');
  assert.equal(await p.locator('#cloudAuto').isChecked(),false,'new players were opted into account storage');
  await p.evaluate(()=>window.__cloudMock.denied=true);await p.locator('#cloudRead').click();await p.locator('#cloudSaveStatus').filter({hasText:'未登录'}).waitFor();
  await p.locator('#platformClose').click();await p.locator('#btnPlatformMenu').click();
  assert((await p.locator('#cloudInfo').innerText()).includes('尚未查看'),'failed cloud request was incorrectly reported as an empty cloud save');
  assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')).gold,prefix),1234);
  await p.evaluate(()=>window.__cloudMock.denied=false);
  await p.locator('#cloudRead').click();await p.waitForFunction(()=>window.__cloudMock.reads>0);
  await p.locator('#cloudAuto').check();await p.locator('#platformClose').click();await p.locator('#btnContinue').click();
  await p.locator('#hud').waitFor({state:'visible'});
  if(channel==='toy')await p.waitForFunction(()=>window.__cloudMock.writes.length>0,{},{timeout:12000});
  assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')).gold,prefix),1234);
  // Lose the local game namespace; restore through the official Toy provider.
  await p.evaluate(prefix=>{for(const key of Object.keys(localStorage))if(key.startsWith(prefix))localStorage.removeItem(key);},prefix);
  // Toy's mock backend must survive a game reload, just as the real server does.
  if(channel==='toy'){
   const values=await p.evaluate(()=>window.__cloudMock.values);await context.addInitScript(values=>{window.__cloudMock.values=values;},values);
  }
  await p.reload();await p.locator('#btnPlatformMenu').waitFor({state:'visible'});await p.locator('#btnPlatformMenu').click();assert.equal(await p.evaluate(()=>window.__cloudMock.reads),0);await p.locator('#cloudRead').click();await p.locator('#cloudLoad').waitFor({state:'visible'});
  await p.locator('#cloudLoad').click();await p.locator('#confirmOk').click();await p.locator('#hud').waitFor({state:'visible'});
  const restored=await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')),prefix);assert.equal(restored.gold,1234);assert.equal(restored.level,3);
  await p.locator('#saveHealth').click();const downloadPromise=p.waitForEvent('download');await p.locator('#saveExport').click();const download=await downloadPromise;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.game,'starship-defense');assert.equal(exported.save.gold,1234);assert(!JSON.stringify(exported).includes('token'));
  await p.locator('#saveImportFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await p.locator('#cloudSaveStatus').filter({hasText:'格式错误'}).waitFor();assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')).gold,prefix),1234);
  const imported={...exported.save,campaignId:'qa-imported',gold:2222};await p.locator('#saveImportFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema:1,game:'starship-defense',save:imported}))});await p.locator('#confirmOk').click();
  assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')).gold,prefix),2222);assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'cloud-backup')).gold,prefix),1234);
  await p.locator('#saveHealth').click();await p.locator('#saveHistory').click();assert(await p.locator('#localHistory button').count()>0);

  await p.screenshot({path:path.join(out,channel+'-'+viewport.width+'x'+viewport.height+'.png')});
  // Demonstrate storage failure in the real game's pause checkpoint.
  await p.locator('#platformClose').click();await p.evaluate(prefix=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith(prefix))throw new DOMException('quota','QuotaExceededError');return old.call(this,k,v);};},prefix);
  await p.locator(mobile?'#vP':'#menuButton').click();await p.locator('#saveHealth').filter({hasText:'本地保存失败'}).waitFor();assert.equal(await p.evaluate(prefix=>JSON.parse(localStorage.getItem(prefix+'auto')).gold,prefix),2222);
  assert.equal(errors.length,0,errors.join('\n'));results.push({channel,viewport,passed:true,checks:['no startup or local-panel account storage request','cloud opt-in only on player action','one-day-old legacy save','opted-in automatic cloud checkpoint','empty-device cloud restore','export without credentials','bad import rejected','confirmed import preserves former local save','history recovery entries','storage failure keeps primary'],errors});console.log('PASS '+channel+' '+viewport.width+'x'+viewport.height);await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({method:'Edge headless; actual game bundles; cloud APIs mocked in isolated contexts, no player account writes; mobile viewports are simulations',results},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

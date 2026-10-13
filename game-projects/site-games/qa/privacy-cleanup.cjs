// Verify actual runtime packages in isolated browsers; never use a player account.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),http=require('http');
const root=path.resolve(__dirname,'../../..');
const out=process.env.PRIVACY_QA_OUT||path.join(process.env.LOCALAPPDATA||require('os').tmpdir(),'CodexGameQA','privacy-cleanup-20261011');
const games=['starship-defense','gunfire-assembly','tank-3d','mario-3d','jackal-stage1-3d','cadillacs-stage1-3d'].filter(game=>!process.env.PRIVACY_QA_GAMES||process.env.PRIVACY_QA_GAMES.split(',').includes(game));
assert(games.length,'PRIVACY_QA_GAMES must select at least one known game');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.mp3':'audio/mpeg','.wav':'audio/wav'};
function packageDir(game){const meta=JSON.parse(fs.readFileSync(path.join(root,'game-projects',game,'media-kit/game.json')));return ['starship-defense','gunfire-assembly'].includes(game)?path.join(root,'dist/toy',game==='starship-defense'?'chongchao-qianshao':'feidao-gunfire','package'):path.join(root,'game-projects',game,'dist',(game==='tank-3d'?'':'toy-')+meta.current_version,'package');}
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const game of games){for(const file of walk(packageDir(game)).filter(f=>/\.(html|js|css)$/.test(f))){
 const text=fs.readFileSync(file,'utf8');
 assert(!/saveLogin|saveAccount|savePassword|SiteSaveProvider|\/api\/game\/saves|auth\/register|games\.html|返回游戏列表/.test(text),file+' contains removed account/navigation code');
 // The multiplayer transport is retained; it is the only remaining author-site URL.
 for(const match of text.matchAll(/(?:https?|wss?):\/\/(?:www\.)?zhengxiaohui\.cn[^\s'"<>]*/g))assert.equal(match[0],'wss://www.zhengxiaohui.cn/api',file+' website navigation');
}}
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});const results=[];
 try{for(const game of games)for(const viewport of [{width:1280,height:720},{width:844,height:390},{width:390,height:844}]){
  const context=await browser.newContext({viewport,hasTouch:viewport.width<1000,isMobile:viewport.width<1000});
  const page=await context.newPage(),errors=[],forbidden=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(/\/api\/game\/saves|\/html\/auth\//.test(req.url()))forbidden.push(req.url());});
  await context.addInitScript(()=>{window.__authorCalls=[];window.toy={isSupport:async()=>true,navigate:async args=>{window.__authorCalls.push(args);},getCloudStorage:async()=>({}),setCloudStorage:async()=>{},getAuthorProfile:async()=>({status:'denied'}),getRankList:async()=>[]};});
  const dir=packageDir(game),prefix='https://www.bilibilitoy.com/toy/privacy-qa-'+game+'/';
  await page.route(prefix+'**',r=>{const file=path.resolve(dir,decodeURIComponent(new URL(r.request().url()).pathname.split('/').slice(3).join('/')));return file.startsWith(dir+path.sep)&&fs.existsSync(file)?r.fulfill({path:file,contentType:mime[path.extname(file)]||'application/octet-stream'}):r.fulfill({status:404});});
  await page.goto(prefix+'index.html');const author=page.locator(['starship-defense','gunfire-assembly'].includes(game)?'#settingsRow [data-author-home]':'#menu [data-author-home]');
  await author.waitFor({state:'visible'});await page.waitForFunction(()=>window.toy&&document.querySelector('[data-author-home]'));
  await author.scrollIntoViewIfNeeded();await author.focus();await author.press('Enter');
  await page.waitForFunction(()=>window.__authorCalls.length===1);assert.deepEqual(await page.evaluate(()=>window.__authorCalls[0]),{type:'space',id:'16214353'});
  if(['starship-defense','gunfire-assembly'].includes(game)){await page.locator('#btnPlatformMenu').click();await page.locator('#platformPanel').waitFor({state:'visible'});assert.equal(await page.locator('#cloudSaveTools').isVisible(),true);assert.equal(await page.locator('#saveAccount,#savePassword,#saveLoginForm').count(),0);}
  assert.deepEqual(forbidden,[]);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,game+'-'+viewport.width+'x'+viewport.height+'.png')});
  results.push({game,viewport,channel:'toy-package',checks:['packaged code contains no website credentials or navigation','author homepage keyboard/SDK navigation','menu reachable','no credential requests','no page errors'],passed:true});await context.close();
 }
 // Website fallback: old saves remain readable; local export/import must work without cloud sync.
 const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),forbidden=[];
 page.on('request',r=>{if(/\/api\/game\/saves|\/html\/auth\//.test(r.url()))forbidden.push(r.url());});
 const save={testMode:false,cls:'gunner',campaignId:'qa-campaign',loop:1,chapter:2,level:3,gold:1234,score:200,weapons:['lmg'],curWeapon:'lmg',items:{medkit:2},time:Date.now()-86400000,buildings:[],vehiclesOwned:[],squadCount:0};
 await context.addInitScript(s=>localStorage.setItem('sst_save_auto',JSON.stringify(s)),save);
 await page.goto(base+'/public/html/game/starship-defense/index.html');await page.locator('#btnContinue').click();await page.locator('#hud').waitFor({state:'visible'});await page.locator('#saveHealth').click();
 assert.equal(await page.locator('#cloudSaveTools').isVisible(),false);assert.equal(await page.locator('#saveAccount,#savePassword,#saveLoginForm').count(),0);
 const downloadPromise=page.waitForEvent('download');await page.locator('#saveExport').click();const download=await downloadPromise,exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.save.gold,1234);
 await page.locator('#saveImportFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});await page.locator('#localSaveStatus').filter({hasText:'格式错误'}).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sst_save_auto')).gold),1234);
 const imported={...exported.save,campaignId:'qa-imported',gold:2222};await page.locator('#saveImportFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema:1,game:'starship-defense',save:imported}))});await page.locator('#confirmOk').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sst_save_auto')).gold),2222);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('sst_save_cloud-backup')).gold),1234);assert.deepEqual(forbidden,[]);
 await page.screenshot({path:path.join(out,'website-local-save.png')});results.push({game:'starship-defense',channel:'website',checks:['legacy save retained','local export/import','previous save backup','no account form','no account requests'],passed:true});await context.close();
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({method:'Isolated headless Edge; Toy SDK mocked; mobile viewport simulations',results},null,2));console.log(JSON.stringify({passed:true,cases:results.length,output:out}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

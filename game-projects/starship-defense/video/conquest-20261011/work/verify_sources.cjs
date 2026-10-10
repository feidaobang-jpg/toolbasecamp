// Read back the public entry points; never updates a Toy or a video account.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const R=__dirname,Q=path.join(R,'qa'),B=path.join(R,'build-current');fs.mkdirSync(Q,{recursive:true});fs.mkdirSync(B,{recursive:true});
(async()=>{
 const receipt={at:new Date().toISOString(),website:{},toy:{},sources:[]};
 const build=JSON.parse(fs.readFileSync(path.join(R,'capture/match-01/build.json'),'utf8'));
 for(const url of [build.url,...build.scripts.filter(x=>x.startsWith('https://'))]){
  const response=await fetch(url);if(!response.ok)throw Error('Source HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer());const name=new URL(url).pathname.split('/').pop();fs.writeFileSync(path.join(B,name),bytes);receipt.sources.push({url,file:'build-current/'+name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 }
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:720}});
  await p.goto('https://www.zhengxiaohui.cn/games.html',{waitUntil:'domcontentloaded'});receipt.website={url:p.url(),game_visible:(await p.locator('body').innerText()).includes('虫潮围城')};
  await p.goto('https://www.bilibili.com/toy/chongchao-qianshao/index.html',{waitUntil:'domcontentloaded',timeout:60000});
  let game=null;const limit=Date.now()+35000;
  while(Date.now()<limit&&!game){for(const f of p.frames())if(await f.locator('#btnVersus').count().catch(()=>0))game=f;if(!game)await p.waitForTimeout(700);}
  receipt.toy={entry_url:p.url(),frames:p.frames().map(f=>f.url()),runtime_game_found:!!game};
  if(game){await game.locator('#btnVersus').click();await game.locator('[data-vs-size="4"]').click();await game.locator('[data-vs-ai="normal"]').click();await p.waitForTimeout(1200);receipt.toy.mode=(await game.locator('#bfFlags').innerText());receipt.toy.points_visible=['旧镇','通信站','补给仓库'].every(x=>receipt.toy.mode.includes(x));await p.screenshot({path:path.join(Q,'toy-public-mode.png')});}
  else{await p.screenshot({path:path.join(Q,'toy-public-entry.png')});receipt.toy.limitation='Public runtime did not become accessible in this anonymous browser.';}
 }finally{await browser.close();fs.writeFileSync(path.join(Q,'public-sources.json'),JSON.stringify(receipt,null,2));}
 console.log(JSON.stringify({website:receipt.website,toy:receipt.toy,source_files:receipt.sources.length}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

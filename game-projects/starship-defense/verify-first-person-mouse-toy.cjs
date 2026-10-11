// Actual Toy shell/iframe verification, without a mocked SDK or player login.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const URL=process.env.PREVIEW_URL;if(!URL)throw Error('PREVIEW_URL required');
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-fps-mouse-v0.36.2/qa/toy');
const manifest=JSON.parse(fs.readFileSync(process.env.TOY_MANIFEST||path.join(__dirname,'../../dist/toy/chongchao-qianshao/manifest.json')));
fs.mkdirSync(OUT,{recursive:true});const results=[],errors=[],forbidden=[];
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 try{for(const touch of [false,true]){
  const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1280,height:720},isMobile:touch,hasTouch:touch});
  await context.addInitScript(t=>{try{localStorage.setItem('chongchao-person','first');localStorage.setItem('chongchao-device-mode',t?'touch':'desktop');localStorage.setItem('chongchao-combat-controls-v1',JSON.stringify({input:'mouse',aim:'manual',fire:'hold'}));}catch(_e){}},touch);
  const p=await context.newPage();p.on('pageerror',e=>{if(/game\.compat\.js/.test(e.stack||''))errors.push(e.message);});
  p.on('request',r=>{if(/\/api\/game\/saves|\/html\/auth\//.test(r.url()))forbidden.push(r.url());});
  await p.goto(URL,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>/bilibilitoy\.com/.test(f.src)),null,{timeout:60000});
  let f;for(let i=0;i<60&&!f;i++){f=p.frames().find(f=>/bilibilitoy\.com/.test(f.url()));if(!f)await p.waitForTimeout(500);}assert(f);
  const url=new global.URL(f.url());url.searchParams.set('qa','1');await f.goto(url.href);await f.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
  const hash=await f.evaluate(async()=>{const src=[...document.scripts].map(s=>s.src).find(s=>/game\.compat\.js/.test(s));return [...new Uint8Array(await(await fetch(src,{cache:'no-store'})).arrayBuffer())];});
  assert.equal(crypto.createHash('sha256').update(Buffer.from(hash)).digest('hex'),manifest.files['game.compat.js']);
  await f.click('#btnStart');await p.waitForTimeout(400);await f.evaluate(()=>{__gameQA.AudioSys.master.gain.value=0;__gameQA.player.invulnerable=999;});
  const a=await f.evaluate(()=>({yaw:__gameQA.getCamYaw(),pitch:__gameQA.getCamPitch(),lock:document.pointerLockElement?.id}));
  if(!touch){
   assert.equal(a.lock,'c3d');const box=await f.locator('#c3d').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.5;
   await p.mouse.move(x,y);await p.waitForTimeout(250);const yaw=await f.evaluate(()=>__gameQA.getCamYaw());
   await p.mouse.move(x+130,y-45,{steps:8});await p.waitForTimeout(350);assert.notEqual(await f.evaluate(()=>__gameQA.getCamYaw()),yaw);
   await p.mouse.down();assert.equal(await f.evaluate(()=>__gameQA.CombatControls.held),true);await p.mouse.up();
   await p.keyboard.press('Escape');await p.waitForTimeout(300);assert.equal(await f.evaluate(()=>document.pointerLockElement),null);assert.equal(await f.evaluate(()=>__gameQA.Game.state),'paused');
   await f.click('#btnResume');await f.waitForFunction(()=>document.pointerLockElement?.id==='c3d');
   results.push({device:'desktop',checks:['actual iframe matches uploaded script','automatic mouse capture','unheld movement aims','left button fires','Escape releases and pauses','resume recaptures'],passed:true});
  }else{
   assert.equal(a.lock,undefined);const box=await f.locator('#lookZone').boundingBox(),cdp=await context.newCDPSession(p),x=box.x+box.width*.45,y=box.y+box.height*.5;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+70,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await p.waitForTimeout(350);assert.notEqual(await f.evaluate(()=>__gameQA.getCamYaw()),a.yaw);
   results.push({device:'phone-portrait-simulation',checks:['actual iframe matches uploaded script','no mouse capture','rotated blank-area touch aims'],passed:true});
  }
  await p.screenshot({path:path.join(OUT,touch?'toy-phone.png':'toy-desktop.png')});await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
 console.log(JSON.stringify({passed:true,cases:results.length,url:URL,results}));
 }finally{await browser.close();fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({url:URL,method:'Actual Toy iframe; headless Edge real mouse/keyboard and CDP phone touch simulation',results,errors,forbidden},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});

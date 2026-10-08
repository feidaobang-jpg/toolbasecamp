// Verify the exact channel build. Mobile is a viewport/touch simulation.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url=process.env.GAME_URL,output=process.env.QA_OUTPUT;
if(!url||!output)throw new Error('GAME_URL and QA_OUTPUT required');fs.mkdirSync(output,{recursive:true});
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});const results=[];
try{for(const mobile of [false,true]){
 const p=await b.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));if(process.env.BLOCK_JS==='1')await p.route('**/*.js*',r=>r.abort());
 await p.goto(url);let f=p.mainFrame();
 if(/bilibili\.com\/toy/.test(url)){await p.waitForFunction(()=>[...document.querySelectorAll('iframe')].some(f=>/bilibilitoy\.com/.test(f.src)));f=p.frames().find(f=>/bilibilitoy\.com/.test(f.url()));}
 const u=new URL(f.url());u.searchParams.set('qa','1');await f.goto(u.href);await f.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
 const prefix=process.env.SAVE_PREFIX||'sst_save_';await f.evaluate(key=>localStorage.setItem(key,'{"campaign":"kept"}'),prefix+'auto');
 await f.click('#btnRV');await f.click('#rvStart');await f.waitForFunction(()=>__gameQA.rvBreakout.state.active);
 const z=await f.evaluate(()=>__gameQA.player.pos.z);await f.press('#stage','w');
 await p.keyboard.down('KeyW');await p.waitForTimeout(1600);await p.keyboard.up('KeyW');
 assert.ok(await f.evaluate(old=>__gameQA.player.pos.z>old+8,z));
 if(mobile){const i=await f.locator('#vI').boundingBox();await p.touchscreen.tap(i.x+i.width/2,i.y+i.height/2);}else await f.press('#stage','i');
 await p.waitForTimeout(200);assert.equal(await f.evaluate(()=>!!__gameQA.player.inVehicle),false);
 await f.evaluate(()=>{__gameQA.setDeviceMode('desktop');});await f.press('#stage','Escape');await f.waitForSelector('#menuPause:not(.hidden)');await f.click('#btnResume');
 await f.evaluate(()=>__gameQA.autoSave());await f.goto(f.url());await f.waitForFunction(()=>window.__gameQA&&window.__ccReady);await f.click('#btnRV');await f.click('#rvContinue');
 assert.ok(await f.evaluate(old=>__gameQA.rvBreakout.state.rv.mesh.position.z>old+8,z));assert.equal(await f.evaluate(key=>localStorage.getItem(key),prefix+'auto'),'{"campaign":"kept"}');
 await f.evaluate(()=>{__gameQA.rvBreakout.finish(false);});await f.click('#rvRetry');assert.ok(await f.evaluate(()=>__gameQA.rvBreakout.state.rv.hp===1400));
 if(mobile){await f.evaluate(()=>__gameQA.setDeviceMode('touch'));await p.setViewportSize({width:844,height:390});await p.screenshot({path:path.join(output,'mobile-landscape.png')});await p.setViewportSize({width:390,height:844});}
 await p.screenshot({path:path.join(output,mobile?'mobile-portrait.png':'desktop.png')});assert.deepEqual(errors,[]);
 results.push({mobile,pass:true,checks:['startup','drive','I exit','pause/resume','independent save/reload','campaign save preserved','retry','responsive controls'],blocked_external_js:process.env.BLOCK_JS==='1'});await p.close();
}fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({url,results,limitations:['Mobile simulation; not physical TapTap/Toy app','QA direct failure boundary; ordinary keyboard and DOM controls used']},null,2));console.log('PASS channel',url,results.length);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

// Test and capture the exact H5 package with normal controls; no game-state mutation.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const GL_ARGS=process.env.QA_SWIFTSHADER?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[];
const root=path.resolve(__dirname,'../..'),source=path.join(root,'dist/taptap/tank-3d');
const out=process.env.TAPTAP_REPORT_DIR||path.join(root,'dist/taptap/tank-3d/qa');
const server=http.createServer((req,res)=>{const file=path.resolve(source,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(source+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('content-type',{'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.mp3':'audio/mpeg'}[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
(async()=>{
 // A distinct loopback hostname keeps the unchanged package on its production relay.
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.2',r));
 const url='http://127.0.0.2:'+server.address().port+'/tank-3d/index.html';
 let browser=await chromium.launch({channel:'msedge',headless:true,args:GL_ARGS});
 const results=[];
 try{
  for(const [name,w,h,mobile] of [['desktop',1920,1080,false],['landscape',844,390,true],['portrait',390,844,true]]){
   const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:mobile,isMobile:mobile,recordVideo:!mobile?{dir:path.join(out,'raw-video'),size:{width:w,height:h}}:undefined});
   const p=await context.newPage(),errors=[],failed=[];
   p.on('pageerror',e=>errors.push(String(e)));p.on('response',r=>{if(r.status()>=400)failed.push(r.url()+':'+r.status());});
   await p.goto(url+'?test=1');await p.waitForFunction(()=>window.__tankReady&&window.__TANK_TEST__);
   await p.screenshot({path:path.join(out,name+'-menu.png')});
   await p.locator('#start-btn').click();await p.waitForFunction(()=>window.__TANK_TEST__.state().phase==='play');
   await p.keyboard.down('KeyW');await p.waitForTimeout(700);await p.keyboard.up('KeyW');await p.keyboard.press('KeyJ');
   const before=await p.evaluate(()=>window.__TANK_TEST__.state());
   await p.keyboard.press('Escape');
   const modes=p.locator('#pause [data-control-mode]');
   await modes.filter({hasText:'手机'}).click();await p.locator('#pause [data-act="resume"]').click();
   assert.equal(await p.evaluate(()=>window.__TANK_TEST__.state().touchHidden),false);
   await p.keyboard.press('Escape');await modes.filter({hasText:'电脑'}).click();await p.locator('#pause [data-act="resume"]').click();
   assert.equal(await p.evaluate(()=>window.__TANK_TEST__.state().touchHidden),true);
   const after=await p.evaluate(()=>window.__TANK_TEST__.state());assert.equal(after.stage,before.stage);assert.equal(after.mode,before.mode);
   await p.screenshot({path:path.join(out,name+'-battle.png')});
   if(!mobile){
    for(let i=0;i<3;i++){
     await p.keyboard.press('KeyC');await p.keyboard.down(i===1?'KeyW':'KeyA');await p.waitForTimeout(600);await p.keyboard.up(i===1?'KeyW':'KeyA');
     for(let j=0;j<12;j++){await p.keyboard.press('KeyJ');await p.waitForTimeout(350);}
     await p.screenshot({path:path.join(out,'gameplay-0'+(i+1)+'.jpg'),type:'jpeg',quality:90});
    }
    await p.keyboard.press('Escape');await p.locator('#pause [data-act="title"]').click();
    await p.locator('#menu [data-game-mode="classic"]').click();
    assert.equal(await p.locator('#menu [data-game-mode="classic"]').getAttribute('aria-pressed'),'true');
    await p.locator('#menu [data-game-mode="remix"]').click();await p.locator('#start-btn').click();await p.waitForFunction(()=>window.__TANK_TEST__.state().phase==='play');
    assert.equal(await p.evaluate(()=>window.__TANK_TEST__.state().mode),'remix');
    for(let j=0;j<12;j++){await p.keyboard.press('KeyJ');await p.waitForTimeout(400);}
    await p.screenshot({path:path.join(out,'remix-battle.jpg'),type:'jpeg',quality:90});
    const v=p.video();await context.close();const video=await v.path();
    const ff=spawnSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-ss','8','-i',video,'-t','20','-an','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'gameplay.mp4')],{encoding:'utf8'});if(ff.status!==0)throw Error(ff.stderr||ff.error?.message);
   }else await context.close();
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);results.push({device:name,viewport:[w,h],start:true,control_mode_switch:true,progress_preserved:true,errors,failed});console.log('Verified '+name);
  }
  await browser.close();
  browser=await chromium.launch({channel:'msedge',headless:true,args:GL_ARGS});
  const context=await browser.newContext({viewport:{width:1280,height:900}});const p=await context.newPage();
  await p.goto(url+'?test=1');await p.waitForFunction(()=>window.__tankReady);await p.locator('#menu [data-act="coop"]').click();
  await p.locator('#coop-name').fill('Tap包体验证');await p.locator('#coop-room-name').fill('Tap包体验证');await p.locator('#coop-create-password').fill('tapqa2026');await p.locator('#coop-create').click();
  await p.waitForFunction(()=>window.__TANK_TEST__.coop.room,null,{timeout:20000});
  const code=await p.locator('#coop-room').innerText();
  const guestContext=await browser.newContext({viewport:{width:1280,height:900}});const q=await guestContext.newPage();
  await q.goto(url+'?test=1');await q.waitForFunction(()=>window.__tankReady);await q.locator('#menu [data-act="coop"]').click();await q.locator('#coop-code').fill(code);await q.locator('#coop-password').fill('tapqa2026');await q.locator('#coop-join').click();await q.waitForFunction(()=>window.__TANK_TEST__.coop.room,null,{timeout:20000});await q.locator('#coop-ready').click();
  await p.locator('#coop-start').click();await p.waitForFunction(()=>window.__TANK_TEST__.state().phase==='play');await q.waitForFunction(()=>window.__TANK_TEST__.state().coop.states>5,null,{timeout:15000});
  results.push({co_op:'two real browser clients using production relay',joined:true,ready:true,started:true,state_sync:true});await p.screenshot({path:path.join(out,'coop-battle.png')});await guestContext.close();await context.close();
  const report={package_sha256:JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8')).zip_sha256,results,method:'Normal buttons and keyboard; test hook read-only observations, no invulnerability or scene mutation.',real_mobile_test:false,taptap_client_test:false,captured_at:new Date().toISOString()};
  fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});

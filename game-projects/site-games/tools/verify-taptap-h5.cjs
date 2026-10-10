// Exercise the actual standalone H5 package with normal inputs; test hooks only observe.
// Usage: node game-projects/site-games/tools/verify-taptap-h5.cjs <game-directory>
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const slug=process.argv[2];
const verificationOnly=process.argv.includes('--verification-only');
const requestedLevel=process.env.VERIFY_LEVEL||'';
assert(!requestedLevel||slug==='mario-3d'&&['1-1','1-2','1-3'].includes(requestedLevel));
assert(['jackal-stage1-3d','cadillacs-stage1-3d','mario-3d','journey-west-3d'].includes(slug));
const root=path.resolve(__dirname,'../../..'),base=path.join(root,'dist/taptap',slug,slug);
const out=path.join(root,'dist/taptap-publish-four-20261007/qa',slug+(verificationOnly?'-verification':'')+(requestedLevel?'-'+requestedLevel:''));fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
  const file=path.resolve(base,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!file.startsWith(base+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':({'js':'text/javascript','css':'text/css','html':'text/html','mp3':'audio/mpeg','wav':'audio/wav','svg':'image/svg+xml'})[path.extname(file).slice(1)]||'application/octet-stream'}).end(data);});
});
function snapshot(page){return page.evaluate(()=>{
  if(window.__JK_TEST__)return __JK_TEST__.snapshot();
  if(window.__CD_TEST__)return __CD_TEST__.snapshot();
  if(window.__MARIO_TEST__)return __MARIO_TEST__.state();
  const w=__CAMERA_QA__.world;return {mode:w.status,t:w.time,weapon:w.weapon,player:{x:w.player.x,z:w.player.z,hp:w.player.hp,dashCd:w.player.dashCd},score:w.score};
});}
async function start(page){
  await page.locator(slug==='journey-west-3d'?'#start':slug==='cadillacs-stage1-3d'?'#menu [data-act=select]':'#menu [data-act=start]').click();
  if(slug==='cadillacs-stage1-3d')await page.locator('#sel-go').click();
  await page.waitForFunction(()=>window.__JK_TEST__?.snapshot().mode==='play'||window.__CD_TEST__?.snapshot().mode==='play'||window.__MARIO_TEST__?.state().phase==='play'||window.__CAMERA_QA__?.world.status==='playing',{},{timeout:20000});
}
function time(s){return s.t??s.time;}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port+'/index.html?test=1&q=high&seed=7'+(requestedLevel?'&level='+requestedLevel:'');
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
  const results={slug,requested_level:requestedLevel||null,package_sha256:JSON.parse(fs.readFileSync(path.join(base,'../manifest.json'),'utf8')).zip_sha256,scenarios:[],real_phone_test:false,taptap_client_test:false,method:'Normal keyboard and pointer input; read-only existing state hooks. Canvas/audio capture does not change gameplay.'};
  try{
    for(const viewport of [{width:1920,height:1080},{width:844,height:390},{width:390,height:844}]){
      const mobile=viewport.width<1000,context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,userAgent:mobile?'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36':undefined});
      const page=await context.newPage(),errors=[],failed=[],external=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
      page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
      await page.addInitScript(()=>{
        window.__recordAudio=[];
        const original=AudioNode.prototype.connect;
        AudioNode.prototype.connect=function(target,...rest){const result=original.call(this,target,...rest);if(target instanceof AudioDestinationNode){const dest=this.context.createMediaStreamDestination();original.call(this,dest);window.__recordAudio.push(dest.stream);}return result;};
      });
      await page.goto(url);await page.waitForFunction(()=>!!(window.__JK_TEST__||window.__CD_TEST__||window.__MARIO_TEST__||window.__CAMERA_QA__));
      await start(page);const before=await snapshot(page);if(requestedLevel)assert.equal(before.level,requestedLevel,'requested level starts through menu');
      await page.keyboard.down('KeyD');await page.waitForTimeout(500);await page.keyboard.up('KeyD');const after=await snapshot(page);
      assert(Math.hypot(after.player.x-before.player.x,(after.player.z??after.player.y)-(before.player.z??before.player.y))>.1,'movement works');
      const actionBefore=await snapshot(page);
      await page.keyboard.down('KeyJ');await page.waitForTimeout(200);await page.keyboard.up('KeyJ');
      await page.waitForTimeout(800);const jumpBefore=await snapshot(page);
      await page.keyboard.down('KeyK');await page.waitForTimeout(140);await page.keyboard.up('KeyK');
      const actionAfter=await snapshot(page);
      if(slug==='jackal-stage1-3d')assert(actionAfter.mgShots>actionBefore.mgShots,'machine gun fires');
      else if(slug==='journey-west-3d')assert(actionAfter.weapon!==actionBefore.weapon&&actionAfter.player.dashCd>0,'weapon switch and dash work');
      else assert(actionAfter.player.y>jumpBefore.player.y+.05,'jump works: '+JSON.stringify({before:jumpBefore.player,after:actionAfter.player}));
      await page.keyboard.press('Escape');const paused=await snapshot(page);await page.waitForTimeout(300);assert.equal(time(await snapshot(page)),time(paused),'pause freezes the game');
      const modeButtons=page.locator('[data-control-mode]:visible');assert.equal(await modeButtons.count(),3);
      const progress=await snapshot(page);
      await page.locator('[data-control-mode=show]:visible').click();await page.locator('[data-control-mode=hide]:visible').click();
      const switched=await snapshot(page);assert.equal(switched.player.x,progress.player.x,'mode switch preserves progress');
      await page.locator('[data-control-mode=auto]:visible').click();await page.keyboard.press('Escape');
      await page.locator(slug==='journey-west-3d'?'#game':'#app').focus();
      if(!mobile&&!verificationOnly){
        await page.evaluate(()=>{const canvas=document.querySelector('canvas'),stream=canvas.captureStream(30);for(const s of __recordAudio)for(const track of s.getAudioTracks())stream.addTrack(track);window.__videoChunks=[];window.__videoRecorder=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:8000000});__videoRecorder.ondataavailable=e=>{if(e.data.size)__videoChunks.push(e.data);};__videoRecorder.start(500);});
        for(let i=0;i<20;i++){
          const state=await snapshot(page);
          if(slug==='mario-3d'&&state.overlay)await page.keyboard.press('Enter');
          await page.keyboard.down(slug==='jackal-stage1-3d'?'KeyW':i%8<4?'KeyD':'KeyA');
          await page.keyboard.down(slug==='jackal-stage1-3d'?'KeyU':'KeyJ');
          if(i%3===0)await page.keyboard.press(slug==='journey-west-3d'?'KeyK':'KeyK');
          await page.waitForTimeout(1000);
          for(const k of ['KeyW','KeyD','KeyA','KeyU','KeyJ'])await page.keyboard.up(k);
          if([3,9,15].includes(i)){await page.screenshot({path:path.join(out,'screenshot-'+i+'.jpg'),type:'jpeg',quality:92});}
        }
        const video=await page.evaluate(()=>new Promise(resolve=>{__videoRecorder.onstop=()=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(__videoChunks,{type:'video/webm'}));};__videoRecorder.stop();}));
        fs.writeFileSync(path.join(out,'gameplay.webm'),Buffer.from(video,'base64'));
      }
      await page.screenshot({path:path.join(out,'viewport-'+viewport.width+'x'+viewport.height+'.jpg'),type:'jpeg',quality:90});
      const keys=await page.evaluate(()=>Object.keys(localStorage));
      if(slug!=='journey-west-3d')assert(keys.length>0&&keys.every(k=>k.startsWith('taptap-')),'platform save namespace isolated');
      assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.deepEqual(external,[]);
      results.scenarios.push({viewport,mobile,movement:true,actions:true,pause:true,mode_switch_preserves_progress:true,storage_keys:keys,errors,failed,external});
      await context.close();
    }
    results.status='passed';fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({slug,status:results.status,scenarios:results.scenarios.length,out}));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});

// 第四关通关录像：按 stage4-run.json 里已验证的按键路线，在页面里按真实时间推进（每秒 120 个逻辑步）并派发键盘事件（同一套按键处理），
// 用 MediaRecorder 录画布 + 游戏自身音频（不录麦克风与系统声音），从开局一直录到结算。录像只留本机。
// 用法：node game-projects/mario-3d/qa/serve.mjs 8798 & node game-projects/mario-3d/qa/stage4-record.cjs [视角id] [输出名]
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.QA_BASE||'http://127.0.0.1:8798/html/game/mario-3d/index.html';
const rel=path.resolve(__dirname,'../media-kit/releases/v2.6.0-preview1');
const [preset='side',name='stage4-fullrun-side']=process.argv.slice(2);
const plan=JSON.parse(fs.readFileSync(path.join(rel,'qa/stage4-run.json'),'utf8')).plan.split(' ');
(async()=>{
 const outDir=path.join(rel,'captures');fs.mkdirSync(outDir,{recursive:true});
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
 try{
  const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{const original=AudioNode.prototype.connect;AudioNode.prototype.connect=function(d,...r){const res=original.call(this,d,...r);if(d===this.context.destination){const sink=this.context.createMediaStreamDestination();original.call(this,sink);window.__qaGameAudio=sink;}return res;};});
  await p.goto(base+'?level=1-4&test=1&q=high&clean=1',{waitUntil:'networkidle'});
  await p.waitForFunction(()=>window.__marioReady&&window.__MARIO_TEST__);
  await p.locator('#menu [data-act=start]').click();
  const result=await p.evaluate(async([plan,preset])=>{
   const q=__MARIO_TEST__;q.manual(true);
   await q.audio.samples.ready;
   const press=(code,down)=>document.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true}));
   while(q.state().camera!==preset){press('KeyC',true);press('KeyC',false);}
   const stream=document.querySelector('#screen').captureStream(60);for(const t of window.__qaGameAudio.stream.getAudioTracks())stream.addTrack(t);
   const chunks=[],rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:12e6});rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   const frame=()=>new Promise(r=>requestAnimationFrame(r));
   // 正好推进 n 个逻辑步，按真实时间每秒 120 步匀速走，每帧画一次（无头浏览器帧率高于 60，不能按帧数推进）
   let clockT=performance.now(),owed=0;
   const runSteps=async n=>{let done=0;while(done<n){await frame();const now=performance.now();owed+=(now-clockT)*0.12;clockT=now;const k=Math.min(n-done,Math.floor(owed));if(k>0){q.step(k);owed-=k;done+=k;}}};
   rec.start();const t0=performance.now(),marks=[];
   // 操作随镜头：侧视里 D 向前；正视（镜头在身后）里 W 向前、S 向后
   const F=preset==='front'?'KeyW':'KeyD',B=preset==='front'?'KeyS':'KeyA';
   const ACT={RR:[F,'KeyJ'],RRJ:[F,'KeyJ','KeyK'],R:[F],RJ:[F,'KeyK'],I:[],J:['KeyK'],L:[B],LJ:[B,'KeyK']};
   // 先放完 WORLD 卡片（2.2 秒）
   clockT=performance.now();while(q.state().phase==='card')await runSteps(2);
   marks.push(['play',(performance.now()-t0)/1000]);
   const held=new Set();
   for(const a of plan){
    const want=new Set(ACT[a]);
    for(const k of [...held])if(!want.has(k)){press(k,false);held.delete(k);}
    for(const k of want)if(!held.has(k)){press(k,true);held.add(k);}
    await runSteps(30);
    if(q.world.mode!=='play')break;
   }
   for(const k of held)press(k,false);
   marks.push(['axe',(performance.now()-t0)/1000,q.world.mode]);
   for(let i=0;i<60*14&&q.state().overlay!=='result';i++)await runSteps(2);
   for(let i=0;i<90;i++)await frame();
   marks.push(['result',(performance.now()-t0)/1000,q.state().overlay]);
   await new Promise(r=>{rec.onstop=r;rec.stop();});
   const blob=new Blob(chunks,{type:'video/webm'}),buf=new Uint8Array(await blob.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=16384)bin+=String.fromCharCode(...buf.subarray(i,i+16384));
   return{base64:btoa(bin),marks,hits:q.session.stats.hits,deaths:q.session.stats.deaths,audio:stream.getAudioTracks().length};
  },[plan,preset]);
  const file=path.join(outDir,name+'.webm');fs.writeFileSync(file,Buffer.from(result.base64,'base64'));delete result.base64;
  assert(result.hits===0&&result.deaths===0&&result.audio===1&&result.marks.at(-1)[2]==='result',JSON.stringify(result));
  fs.writeFileSync(path.join(outDir,name+'.timeline.json'),JSON.stringify({file:name+'.webm',preset,url:base,method:'in-page driver: 1/60 s per frame, KeyboardEvent dispatch through the game key handlers, verified plan from qa/stage4-run.json; MediaRecorder canvas + game AudioContext only',...result,errors},null,1));
  console.log(JSON.stringify({file,...result,errors}));
 }finally{await b.close();}
})().catch(e=>{console.error(e.message||e);process.exit(1);});

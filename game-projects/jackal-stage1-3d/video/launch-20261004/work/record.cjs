// Realtime capture: normal UI/keyboard only; the test API is read-only here.
const fs=require('fs'), path=require('path'), http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {makeBot}=require('./gameplay-bot.cjs');
const root=__dirname, build=path.resolve(root,'../../../dist/toy-v0.3/package');
const controls=process.argv[2]==='controls';
const stage=controls?1:Number(process.argv[2]||1), seconds=Number(process.argv[3]||480);
const dir=path.join(root,'capture',`stage${stage}-${Date.now()}`);fs.mkdirSync(dir,{recursive:true});
async function main(){
 const server=http.createServer((req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';const p=path.resolve(build,rel);if(!p.startsWith(build+path.sep)){res.statusCode=403;return res.end();}fs.readFile(p,(e,d)=>{if(e){res.statusCode=404;return res.end();}res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(d);});});
 const saveFile=path.join(root,'browser-state.json');
 const saved=!controls&&fs.existsSync(saveFile)?JSON.parse(fs.readFileSync(saveFile)):null;
 const savedPort=saved?.origins?.[0]?Number(new URL(saved.origins[0].origin).port):0;
 await new Promise(r=>server.listen(savedPort,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,...(saved?{storageState:saved}:{})});const p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...args){if(dest instanceof AudioDestinationNode){window.__captureAudio ||= this.context.createMediaStreamDestination();return connect.call(this,window.__captureAudio,...args);}return connect.call(this,dest,...args);};});
 await p.goto(`http://127.0.0.1:${server.address().port}/index.html?test=1`);await p.waitForFunction(()=>window.__JK_TEST__);
 if(stage===2&&!saved){
  // A fresh profile must earn stage two by clearing stage one normally.
  await p.getByRole('button',{name:/开始游戏/}).click();
  const warm=makeBot(p,{stage:1,dodge:true});let clear=false;
  for(let i=0;i<4000;i++){const q=await p.evaluate(()=>__JK_TEST__.snapshot());if(q.mode==='clear'){clear=true;break;}await warm.tick(q);await p.waitForTimeout(90);}
  await warm.releaseAll();if(!clear)throw Error('Stage one did not clear');
  await p.locator('[data-act="next"]').click({timeout:15000});
  await context.storageState({path:saveFile});
 }
 if(stage===2&&saved){const button=p.getByRole('button',{name:/起始关卡/});if(!(await button.innerText()).includes('第二关'))await button.click();await p.getByRole('button',{name:/开始游戏/}).click();}
 await p.screenshot({path:path.join(dir,'menu.png')});
 if(stage===1)await p.getByRole('button',{name:/开始游戏/}).click();
 const state=()=>p.evaluate(()=>__JK_TEST__.snapshot());let s=await state();
 if(s.stage!==stage||s.settings.demo||s.settings.armor!=='std'||s.settings.gun!=='follow')throw Error('Unexpected game settings or stage');
 await p.evaluate(()=>{window.__chunks=[];window.__rec=new MediaRecorder(__captureAudio.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});__rec.ondataavailable=e=>__chunks.push(e.data);__rec.start(200);window.__audioStart=Date.now();});
 const cdp=await context.newCDPSession(p), frames=[], states=[], started=Date.now();
 let capturing=true;cdp.on('Page.screencastFrame',async e=>{if(capturing){const file=`${String(frames.length).padStart(6,'0')}.jpg`;fs.writeFileSync(path.join(dir,file),Buffer.from(e.data,'base64'));frames.push({file,timestamp:e.metadata.timestamp});}await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});});
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:93,maxWidth:1920,maxHeight:1080,everyNthFrame:2});
 const bot=makeBot(p,{stage,dodge:true});let lastLog=-30;
 console.log(JSON.stringify({dir,stage,started}));
 if(controls){
  await p.waitForTimeout(1800);await bot.setKeys(['KeyW','KeyJ']);await p.waitForTimeout(1700);await bot.setKeys(['KeyD','KeyJ']);await p.waitForTimeout(1400);await bot.releaseAll();
  for(let i=0;i<3;i++){await p.keyboard.press('KeyC');await p.waitForTimeout(2800);await p.screenshot({path:path.join(dir,`camera-${i}.png`)});}
 }
 while(!controls&&(Date.now()-started)/1000<seconds){
  s=await state();if(s.settings.demo)throw Error('Demo unexpectedly enabled');
  const wall=(Date.now()-started)/1000;
  if(wall-lastLog>=15){lastLog=wall;const st={wall,...s,mission:bot.mi};states.push(st);fs.writeFileSync(path.join(dir,'progress.json'),JSON.stringify(st,null,2));await p.screenshot({path:path.join(dir,'latest.png')});console.log(JSON.stringify({wall:Math.round(wall),t:s.t,stage:s.stage,mode:s.mode,position:s.player,weapon:s.weapon,carried:s.carried,delivered:s.delivered,deaths:s.deaths,mission:bot.mi,frames:frames.length}));}
  if(['clear','over','result','win'].includes(s.mode)||s.ui.overlay==='result'){await bot.releaseAll();await p.waitForTimeout(5000);break;}
  if(fs.existsSync(path.join(dir,'stop'))){await bot.releaseAll();break;}
  const commandFile=path.join(dir,'command.json');
  if(fs.existsSync(commandFile)){const command=JSON.parse(fs.readFileSync(commandFile));fs.renameSync(commandFile,path.join(dir,`command-${Date.now()}.json`));await bot.setKeys(command.keys||[]);await p.waitForTimeout(Math.min(command.ms||500,10000));await bot.releaseAll();continue;}
  await bot.tick(s);await p.waitForTimeout(90);
 }
 await bot.releaseAll();await p.keyboard.press('Escape');await p.waitForTimeout(1500);
 await cdp.send('Page.stopScreencast');capturing=false;
 const audio=await p.evaluate(async()=>{await new Promise(ok=>{__rec.onstop=ok;__rec.stop();});return {start:__audioStart,data:Array.from(new Uint8Array(await new Blob(__chunks).arrayBuffer()))};});
 fs.writeFileSync(path.join(dir,'game-audio.webm'),Buffer.from(audio.data));
 const events=await p.evaluate(()=>__JK_TEST__.events());
 fs.writeFileSync(path.join(dir,'capture.json'),JSON.stringify({stage,started,audioStart:audio.start,frames,states,events,botLog:bot.log,finalState:await state(),errors,capture_mode:'realtime-keyboard-automation',gameplay_modified:false},null,2));
 console.log(JSON.stringify({complete:true,dir,frames:frames.length,events:events.length}));
 if(!controls)await context.storageState({path:saveFile});await browser.close();server.close();
}
main().catch(e=>{console.error(e);process.exit(1);});

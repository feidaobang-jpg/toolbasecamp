// Real-time normal gameplay. QA is read-only observation; all actions use public UI and keys.
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=__dirname,WEB=path.resolve(ROOT,'../../../../../public');
const SIZE=Number(process.env.MOVIE_SIZE||4),PORT=Number(process.env.MOVIE_PORT||8891);
const out=path.join(ROOT,process.env.MOVIE_DIR||'capture');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const file=path.resolve(WEB,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(WEB+path.sep)){res.statusCode=403;return res.end();}
 fs.readFile(file,(e,data)=>{if(e){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);});
}).listen(PORT,'127.0.0.1');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const page=await context.newPage(),errors=[],events=[],states=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(dest,...args){
   if(dest instanceof AudioDestinationNode){
    if(!this.context.__movieDest)this.context.__movieDest=this.context.createMediaStreamDestination();
    window.__movieAudio=this.context.__movieDest;window.__movieAudioContext=this.context;
    return connect.call(this,this.context.__movieDest,...args);
   }
   return connect.call(this,dest,...args);
  };
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/html/game/starship-defense/index.html?qa=1');
 await page.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
 const cdp=await context.newCDPSession(page);let shot=null,lastSaved=0;
 cdp.on('Page.screencastFrame',async e=>{
  if(shot&&e.metadata.timestamp-lastSaved>=.065){lastSaved=e.metadata.timestamp;
   const file=String(shot.frames.length).padStart(6,'0')+'.jpg';fs.writeFileSync(path.join(shot.dir,file),Buffer.from(e.data,'base64'));shot.frames.push({file,timestamp:e.metadata.timestamp});}
  await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});
 });
 const mark=(text)=>{const row={t:(Date.now()-started)/1000,text};events.push(row);console.log(JSON.stringify(row));};
 let started=Date.now();
 const observe=()=>page.evaluate(()=>{
  const q=__gameQA,v=q.versus,s=v.state,me=v.seat(s.localPid);
  return {t:s.time,over:s.over,winner:s.winner,local:s.localPid,size:v.size,state:q.Game.state,test:q.Game.testMode,
   pos:q.player.pos.toArray(),yaw:q.getCamYaw(),cam:q.getCamMode(),hp:q.player.hp,dead:q.player.dead,
   gold:me?.gold,bank:me?.bank,cd:me?.cd,pop:v.popOf(s.localPid),panel:!document.getElementById('vsPanel').classList.contains('hidden'),
   blueHp:v.hq('blue')?.hp,redHp:v.hq('red')?.hp,
   units:s.units.filter(u=>!u.dead&&u.mesh).map(u=>({x:u.mesh.position.x,z:u.mesh.position.z,team:u.team,hp:u.hp})),
   heroes:q.coopHumans.map(h=>({x:h.pos.x,z:h.pos.z,team:h.team,dead:h.dead,ai:h.vsAI})),
   bankCard:document.querySelector('#vsBankCard')?.textContent,menu:document.getElementById('vsResult')?.textContent};
 });
 async function startShot(name){const dir=path.join(out,name);fs.mkdirSync(dir,{recursive:true});shot={name,dir,frames:[],started:Date.now()};
  await page.evaluate(()=>{if(!window.__movieAudio)return;window.__movieChunks=[];window.__movieRec=new MediaRecorder(__movieAudio.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});__movieRec.ondataavailable=e=>__movieChunks.push(e.data);__movieRec.start(500);window.__movieAudioStart=Date.now();});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:94,maxWidth:1920,maxHeight:1080,everyNthFrame:2});
 }
 async function stopShot(){await cdp.send('Page.stopScreencast');const s=shot;shot=null;
  const a=await page.evaluate(async()=>{if(!window.__movieRec)return null;await new Promise(r=>{__movieRec.onstop=r;__movieRec.stop();});return {start:__movieAudioStart,bytes:Array.from(new Uint8Array(await new Blob(__movieChunks).arrayBuffer()))};});
  if(a){fs.writeFileSync(path.join(s.dir,'game-audio.webm'),Buffer.from(a.bytes));s.audioStart=a.start;}
  s.duration=(Date.now()-s.started)/1000;s.finalState=await observe();delete s.dir;fs.writeFileSync(path.join(out,s.name,'capture.json'),JSON.stringify(s,null,2));console.log('SHOT',s.name,s.frames.length);
 }
 const held=new Set();
 async function keys(wanted){for(const k of [...held])if(!wanted.includes(k)){await page.keyboard.up(k);held.delete(k);}for(const k of wanted)if(!held.has(k)){await page.keyboard.down(k);held.add(k);}}
 try{
  await page.click('#btnVersus');await page.click('[data-vs-size="'+SIZE+'"]');
  await page.screenshot({path:path.join(out,SIZE+'v'+SIZE+'-menu.png')});
  if(process.env.MOVIE_MODE==='menu'){
   await startShot('01-menu');
   for(const n of [1,2,3,4]){await page.click('[data-vs-size="'+n+'"]');await sleep(1500);}
   await sleep(2500);await stopShot();return;
  }
  await page.click('[data-vs-ai="easy"]');await page.waitForFunction(()=>__gameQA.versus.state.active);
  await page.keyboard.press('KeyC');await page.keyboard.press('KeyC');
  if(process.env.MOVIE_MODE==='units'){
   await startShot('01-unit-deployment');
   await page.keyboard.press('KeyR');await sleep(2000);
   await page.keyboard.press('Digit1');await sleep(2200);
   await page.keyboard.press('Digit2');await sleep(2500);
   await page.keyboard.press('KeyR');
   await keys(['KeyW']);await sleep(7000);await keys([]);await sleep(15000);
   await page.screenshot({path:path.join(out,'unit-deployment.png')});await stopShot();
   fs.writeFileSync(path.join(out,'session.json'),JSON.stringify({at:new Date().toISOString(),kind:'normal-rules unit tutorial; fresh match, no result claim',gameplay_modified:false,final:await observe(),errors},null,2));return;
  }
  if(process.env.MOVIE_MODE==='team'){
   await startShot('01-team-transfer');
   await page.keyboard.press('KeyT');await sleep(3500);mark('team page before transfer');
   const before=await observe();await page.keyboard.press('Digit1');await sleep(4000);mark('normal 200 gold team transfer');
   await page.screenshot({path:path.join(out,'team-transfer.png')});
   const after=await observe();await page.keyboard.press('KeyT');await sleep(3000);await stopShot();
   fs.writeFileSync(path.join(out,'session.json'),JSON.stringify({at:new Date().toISOString(),gameplay_modified:false,kind:'normal-rules UI demonstration, no match-result claim',before,after,events,errors},null,2));return;
  }
  await startShot('01-bank-and-opening');mark(SIZE+'v'+SIZE+' normal rules: one player and '+(SIZE*2-1)+' easy computer seats');
  await page.keyboard.press('KeyR');await sleep(1500);await page.keyboard.press('Digit0');mark('bank upgrade via normal keyboard');await sleep(2500);await page.keyboard.press('KeyR');
  const until=Date.now()+17.5*60*1000;let lastAction=0,lastGrenade=0,lastSnapshot=0;
  const windows=[[30,62,'02-first-deployment'],[160,210,'03-early-battle'],[370,425,'04-late-battle'],[580,640,'05-final-push']];
  let windowIndex=0;
  while(Date.now()<until){
   const s=await observe();states.push({...s,units:s.units.length,heroes:s.heroes.length,wallTime:(Date.now()-started)/1000});
   if(s.over){await keys([]);if(!shot)await startShot('06-real-result');mark('real result reached');await sleep(6000);await page.screenshot({path:path.join(out,'real-result.png')});await stopShot();break;}
   if(shot&&s.t>19&&shot.name==='01-bank-and-opening')await stopShot();
   const win=windows[windowIndex];
   if(win&&s.t>=win[0]&&!shot){await startShot(win[2]);mark('capture '+win[2]);}
   if(win&&s.t>=win[1]&&shot?.name===win[2]){await stopShot();windowIndex++;}
   if(s.dead){await keys([]);await sleep(600);continue;}
   if(Date.now()-lastAction>6500&&s.gold>=120&&s.t>22){
    await keys([]);await page.keyboard.press('KeyR');await sleep(300);
    const card=s.t<180?(s.pop<=4?'Digit1':'Digit2'):(s.gold>=600&&s.pop<=6?'Digit8':'Digit2');
    await page.keyboard.press(card);await sleep(700);await page.keyboard.press('KeyR');lastAction=Date.now();mark('deploy '+card+' from '+Math.round(s.gold)+' gold');
   }
   // Follow the left attacking lane, defend nearby enemies, and stay behind our advancing units.
   const enemies=[...s.units,...s.heroes].filter(u=>u.team==='red'&&!u.dead&&u.hp!==0);
   const nearest=enemies.sort((a,b)=>Math.hypot(a.x-s.pos[0],a.z-s.pos[2])-Math.hypot(b.x-s.pos[0],b.z-s.pos[2]))[0];
   const close=nearest&&Math.hypot(nearest.x-s.pos[0],nearest.z-s.pos[2])<30;
   const lane=52*({1:1,2:1.12,3:1.24,4:1.36}[SIZE]);
   let goal={x:-lane,z:965};
   if(s.t<45)goal={x:-lane,z:844};
   else if(s.hp<40)goal=s.pos[2]>846?{x:-lane,z:840}:{x:0,z:817};
   else if(close)goal={x:nearest.x,z:nearest.z};
   else if(s.t<180)goal={x:-lane,z:900};
   const dx=goal.x-s.pos[0],dz=goal.z-s.pos[2],f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw);
   const wanted=[];if(Math.hypot(dx,dz)>12){if(Math.abs(f)>5)wanted.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>5)wanted.push(r>0?'KeyD':'KeyA');}
   if(close)wanted.push('KeyJ');await keys(wanted);
   if(close&&s.t>60&&Date.now()-lastGrenade>10000){await page.keyboard.press('KeyU');lastGrenade=Date.now();mark('grenade at nearby enemy');}
   if(Date.now()-lastSnapshot>60000){await page.screenshot({path:path.join(out,'minute-'+Math.floor(s.t/60)+'.png')});lastSnapshot=Date.now();console.log('STATE',JSON.stringify({...s,units:s.units.length,heroes:s.heroes.length}));}
   await sleep(650);
  }
  await keys([]);if(shot)await stopShot();
  fs.writeFileSync(path.join(out,'session.json'),JSON.stringify({at:new Date().toISOString(),gameplay_modified:false,time_scale:1,mode:SIZE+'v'+SIZE+': one player plus '+(SIZE*2-1)+' AI',events,states,errors,final:await observe()},null,2));
 }finally{await context.close();await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exit(1);});

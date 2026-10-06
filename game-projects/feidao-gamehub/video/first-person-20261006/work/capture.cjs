// Real-time, unmodified gameplay; QA APIs are used only to observe state.
const fs=require('fs'),path=require('path'),http=require('http'),cp=require('child_process');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const W=__dirname,ROOT=path.resolve(W,'../../../../..'),PUB=path.join(ROOT,'public');
const {makeBot}=require(path.join(ROOT,'game-projects/jackal-stage1-3d/video/launch-20261004/work/gameplay-bot.cjs'));
const {BOT_SRC}=require(path.join(ROOT,'game-projects/cadillacs-stage1-3d/qa/bot.js'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{const f=path.resolve(PUB,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(PUB+path.sep)){res.statusCode=403;return res.end();}fs.readFile(f,(e,b)=>{if(e){res.statusCode=404;return res.end();}res.setHeader('Content-Type',mime[path.extname(f)]||'application/octet-stream');res.end(b);});});
function ff(args){return new Promise((ok,no)=>{const p=cp.spawn('ffmpeg',['-hide_banner','-y',...args],{windowsHide:true});let log='';p.stderr.on('data',d=>log+=d);p.on('exit',c=>c?no(Error(log.slice(-2000))):ok());});}
async function encode(game){
 const dir=path.join(W,'capture',game),list=path.join(dir,'frames.ffconcat');
 // Image2 defaults to a 1/25 time base. Preserve millisecond acquisition times
 // before selecting real frames for CFR delivery; no motion interpolation.
 const rows=fs.readFileSync(list,'utf8').split('\n').filter(x=>!x.startsWith('option framerate'));
 const precise=rows.flatMap(x=>x.startsWith('file ')?[x,'option framerate 1000']:[x]).join('\n');fs.writeFileSync(list,precise);
 const duration=rows.filter(x=>x.startsWith('duration ')).reduce((s,x)=>s+Number(x.split(' ')[1]),0),audio=fs.existsSync(path.join(dir,'audio.webm'));
 await ff(['-threads','2','-safe','0','-f','concat','-i',list,...(audio?['-i',path.join(dir,'audio.webm')]:[]),'-vf','fps=60,format=yuv420p','-c:v','h264_nvenc','-preset','p4','-cq','18','-b:v','0',...(audio?['-c:a','aac','-b:a','192k']:['-an']),'-t',String(duration),'-movflags','+faststart',path.join(W,'capture',game+'.mp4')]);
 console.log(game,'encoded with millisecond frame timestamps');
}
async function run(game,seconds){
 const dir=path.join(W,'capture',game);fs.mkdirSync(dir,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...args){if(dest instanceof AudioDestinationNode){if(!this.context.__dest){this.context.__dest=this.context.createMediaStreamDestination();window.__audioDest=this.context.__dest;}connect.call(this,this.context.__dest,...args);}return connect.call(this,dest,...args);};});
 await p.goto('http://127.0.0.1:8916/html/game/'+game+'/index.html?test=1&qa=1&clean=1&q=high&seed=7');await delay(1400);
 const snapshot=()=>p.evaluate(g=>{if(g==='tank-3d')return __TANK_TEST__.state();if(g==='mario-3d')return __MARIO_TEST__.state();if(g==='jackal-stage1-3d')return __JK_TEST__.snapshot();if(g==='cadillacs-stage1-3d')return __CD_TEST__.snapshot();const q=__gameQA;return {state:q.Game.state,hp:q.player.hp,pos:q.player.pos.toArray(),base:q.base.hp,score:q.Game.score,test:q.Game.testMode,camera:q.getCamMode(),yaw:q.getCamYaw(),monsters:q.monsters.filter(m=>!m.dead).map(m=>({x:m.mesh.position.x,z:m.mesh.position.z,hp:m.hp,kind:m.kind}))};},game);
 if(game==='starship-defense'){await p.locator('#btnStart').click();await delay(800);await p.locator('#readyBtn').click();}else if(game==='cadillacs-stage1-3d'){await p.locator('[data-act="select"]').first().click();await delay(300);await p.locator('#sel-go').click();}else{await p.locator('[data-act="start"]').click();}
 await delay(2600);let bot;if(game==='jackal-stage1-3d')bot=makeBot(p,{stage:1,apply:false});
 if(game==='cadillacs-stage1-3d'){
  // The current shared look controller makes E reduce the world heading.
  // Adapt the old recording bot's look decisions, without changing the game.
  const currentBot=BOT_SRC.replace("key('KeyE', need && d > 0); key('KeyQ', need && d < 0);","key('KeyE', need && d < 0); key('KeyQ', need && d > 0);");
  await p.evaluate(currentBot);await p.evaluate(()=>__bot.live(true,{jumps:true,noSkip:true}));
 }
 const cdp=await context.newCDPSession(p),frames=[],events=[],states=[],writes=[];let recording=true;
 // Acknowledge immediately; JPEG persistence must not block the browser frame producer.
 cdp.on('Page.screencastFrame',e=>{cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});if(recording){const file=String(frames.length).padStart(6,'0')+'.jpg';frames.push({file,timestamp:e.metadata.timestamp});writes.push(fs.promises.writeFile(path.join(dir,file),Buffer.from(e.data,'base64')));}});
 await p.evaluate(()=>{window.__recordRaf={last:0,gaps:[]};function tick(t){const a=__recordRaf;if(a.last)a.gaps.push(t-a.last);a.last=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);});
 await p.evaluate(()=>{if(!window.__audioDest)return;window.__chunks=[];window.__rec=new MediaRecorder(__audioDest.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});__rec.ondataavailable=e=>__chunks.push(e.data);__rec.start(250);});
 const start=Date.now();await cdp.send('Page.startScreencast',{format:'jpeg',quality:85,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
 const held=new Set();async function keys(want){for(const k of [...held])if(!want.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
 const camera=s=>s.camera||s.ui?.camera;
 async function switchTo(target){if(game==='cadillacs-stage1-3d')await p.evaluate(()=>__bot.live(false));await keys([]);const from=camera(await snapshot());for(let i=0;i<7;i++){const now=camera(await snapshot());if(target==='fp'?(now==='fp'||now==='first'):(now!=='fp'&&now!=='first'))break;await p.keyboard.press('KeyC');await delay(180);}events.push({t:(Date.now()-start)/1000,action:'C camera',from,to:camera(await snapshot())});if(game==='cadillacs-stage1-3d'){if(target==='fp'){for(let i=0;i<25;i++){const s=await snapshot(),f=s.cam.axes.fwd,goal=Math.atan2(f.x,f.z);if(Math.abs(Math.atan2(Math.sin(s.player.face-goal),Math.cos(s.player.face-goal)))<.12)break;await delay(100);}}await p.evaluate(()=>__bot.live(true,{jumps:true,noSkip:true}));}}
 let switched=false,returned=false,lastLog=-5,lastJump=-9,jumpUntil=0,lastGrenade=-9,turnUntil=0;
 while((Date.now()-start)/1000<seconds){const t=(Date.now()-start)/1000;
  if(!switched&&t>14){await switchTo('fp');switched=true;}
  if(!returned&&t>seconds-12){await switchTo('third');returned=true;}
  const s=await snapshot();if(t-lastLog>=2){states.push({t:+t.toFixed(3),state:s});lastLog=t;}
  if(game==='tank-3d'){
   const decision=await p.evaluate(()=>{const T=__TANK_TEST__,w=T.world,p=w?.player;if(!p||p.state!=='active'||T.state().overlay)return [];const bots=w.bots.filter(b=>b.state==='active').sort((a,b)=>Math.abs(a.x-p.x)+Math.abs(a.y-p.y)-Math.abs(b.x-p.x)-Math.abs(b.y-p.y));if(!bots.length)return [];const b=bots[0],dx=b.x-p.x,dy=b.y-p.y;let dir=Math.abs(dx)<10?(dy<0?0:2):Math.abs(dy)<10?(dx>0?1:3):Math.abs(dx)>Math.abs(dy)?(dx>0?1:3):(dy<0?0:2);const q=((Math.round(T.view.cameraYaw()/(Math.PI/2))%4)+4)%4;const towardEagle=(p.y>176&&(dir===1||dir===3))||(dir===2&&p.x>76&&p.x<116);return [(['KeyW','KeyD','KeyS','KeyA'])[(dir+q)%4],...(!towardEagle?['KeyJ']:[])];});await keys(decision);if(decision.includes('KeyJ')){await p.keyboard.up('KeyJ');held.delete('KeyJ');}
  }else if(game==='mario-3d'){
   const d=await p.evaluate(()=>{const T=__MARIO_TEST__,w=T.world,p=w?.player;if(!p||w.mode!=='play')return null;const tile=(c,h)=>w.tiles.get(c*512+h+64);let gap=false,wall=false;for(let c=Math.floor(p.x+0.6);c<=Math.floor(p.x+2.1);c++){if(!tile(c,-1))gap=true;if(tile(c,Math.floor(p.y+0.3)))wall=true;}const enemy=w.rt.enemies.some(e=>!e.gone&&e.state==='walk'&&e.x>p.x&&e.x-p.x<2.6&&Math.abs(e.y-p.y)<2);const yaw=T.view.cameraYaw();return {ground:p.grounded,jump:gap||wall||enemy,yaw,z:p.z,x:p.x};});
   if(d){if(d.ground&&d.jump&&t-lastJump>.5){lastJump=t;jumpUntil=t+.52;events.push({t,action:'jump',x:d.x});}const mx=1,mz=-d.z*.7,c=Math.cos(d.yaw),sn=Math.sin(d.yaw),ax=c*mx-sn*mz,ay=-sn*mx-c*mz;const k=[];if(Math.abs(ax)>.25)k.push(ax>0?'KeyD':'KeyA');if(Math.abs(ay)>.25)k.push(ay>0?'KeyW':'KeyS');if(t<jumpUntil)k.push('KeyK');await keys(k);}else await keys([]);
  }else if(game==='jackal-stage1-3d'){
   const d=await bot.tick(s),ax=s.cam.axes,v=d.dir>=0?{x:Math.sin(d.dir*Math.PI/4),y:Math.cos(d.dir*Math.PI/4)}:{x:0,y:0};const x=v.x*ax.right.x+v.y*ax.right.y,y=v.x*ax.fwd.x+v.y*ax.fwd.y;const k=[];if(Math.abs(x)>.3)k.push(x>0?'KeyD':'KeyA');if(Math.abs(y)>.3)k.push(y>0?'KeyW':'KeyS');if(d.keys.includes('KeyJ'))k.push('KeyJ');if(d.bomb)k.push('KeyK');await keys(k);
  }else if(game==='starship-defense'){
   if(s.state==='battle'||s.state==='prep'){const enemies=s.monsters.sort((a,b)=>Math.hypot(a.x-s.pos[0],a.z-s.pos[2])-Math.hypot(b.x-s.pos[0],b.z-s.pos[2]));const target=enemies[0];let k=[];if(target){const dx=target.x-s.pos[0],dz=target.z-s.pos[2],dist=Math.hypot(dx,dz),goal=Math.atan2(dx,dz);let diff=goal-s.yaw;while(diff>Math.PI)diff-=2*Math.PI;while(diff< -Math.PI)diff+=2*Math.PI;if(Math.abs(diff)>.18)k.push(diff>0?'KeyQ':'KeyE');
    const move=await p.evaluate(([tx,tz,dist])=>{const q=__gameQA,p=q.player.pos;const target=p.clone().set(tx,p.y,tz);const guide=q.navDir({mesh:{position:p.clone()}},target);let dx=guide?guide.x:tx-p.x,dz=guide?guide.z:tz-p.z;if(dist<5){dx=-dx;dz=-dz;}else if(dist<=12)return {x:0,z:0};let best=null;for(let i=0;i<16;i++){const a=i*Math.PI/8,vx=Math.sin(a),vz=Math.cos(a),nx=p.x+vx*1.2,nz=p.z+vz*1.2,ny=q.groundY(nx,nz);if(q.collideWalls(nx,nz,.7,Math.max(p.y,ny))||ny>p.y+.5)continue;const cost=-(vx*dx+vz*dz)/Math.max(1,Math.hypot(dx,dz));if(!best||cost<best.cost)best={x:vx,z:vz,cost};}return best||{x:0,z:0};},[target.x,target.z,dist]);
    const f=move.x*Math.sin(s.yaw)+move.z*Math.cos(s.yaw),r=-move.x*Math.cos(s.yaw)+move.z*Math.sin(s.yaw);if(Math.abs(f)>.3)k.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>.3)k.push(r>0?'KeyD':'KeyA');if(t-lastGrenade>7&&dist<20){await p.keyboard.press('KeyU');lastGrenade=t;events.push({t,action:'grenade',target:target.kind});}k.push('KeyJ');}await keys(k);}else await keys([]);
  }
  await delay(game==='cadillacs-stage1-3d'?160:100);
 }
 await keys([]);if(game==='cadillacs-stage1-3d')await p.evaluate(()=>__bot.live(false));await cdp.send('Page.stopScreencast');recording=false;await Promise.all(writes);
 const audio=await p.evaluate(async()=>{if(!window.__rec)return null;await new Promise(ok=>{__rec.onstop=ok;__rec.stop();});return Array.from(new Uint8Array(await new Blob(__chunks).arrayBuffer()));});if(audio)fs.writeFileSync(path.join(dir,'audio.webm'),Buffer.from(audio));
 const end=await snapshot();const raf=await p.evaluate(()=>__recordRaf.gaps);await browser.close();
 const gapStats=a=>{const sorted=[...a].sort((a,b)=>a-b);return {count:a.length,fps:a.length*1000/a.reduce((s,x)=>s+x,0),p95_ms:sorted[Math.floor(a.length*.95)],max_ms:sorted.at(-1),over_100ms:a.filter(x=>x>100).length};};const gaps=frames.slice(1).map((x,i)=>(x.timestamp-frames[i].timestamp)*1000);const cadence={capture:gapStats(gaps),animation:gapStats(raf)};
 let concat='ffconcat version 1.0\n';for(let i=0;i<frames.length;i++){concat+=`file '${frames[i].file}'\n`;if(i+1<frames.length)concat+=`duration ${Math.max(.001,frames[i+1].timestamp-frames[i].timestamp).toFixed(6)}\n`;}
 fs.writeFileSync(path.join(dir,'frames.ffconcat'),concat);fs.writeFileSync(path.join(dir,'capture.json'),JSON.stringify({game,seconds,frames:frames.length,firstTimestamp:frames[0]?.timestamp,events,states,end,errors,normalGameplay:true,cadence,recording:{viewport:[1920,1080],jpegQuality:85,everyNthFrame:1,encoder:'h264_nvenc',fps:60,imageTimebase:'1/1000'},buildCommit:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT}).toString().trim()},null,2));
 console.log(game,'CADENCE',JSON.stringify(cadence));
 console.log(game,'captured',frames.length,'frames',JSON.stringify(end).slice(0,300));
 await encode(game);
}
server.listen(8916,'127.0.0.1',async()=>{try{const encodeOnly=process.argv.includes('--encode-only'),games=process.argv.slice(2).filter(x=>x!=='--encode-only');for(const game of (games.length?games:['tank-3d','mario-3d','jackal-stage1-3d','cadillacs-stage1-3d','starship-defense'])){if(encodeOnly)await encode(game);else await run(game,Number(process.env.CAPTURE_SECONDS)||(game==='starship-defense'?95:65));}}catch(e){console.error(e);process.exitCode=1;}finally{server.close();}});

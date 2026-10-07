// Capture public, unmodified gameplay. Test hooks observe; all actions use real keys/UI.
const fs=require('fs'),path=require('path'),cp=require('child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const W=__dirname,ROOT=path.resolve(W,'../../../../..'),OUT=path.join(W,'capture');
const URL=process.env.GAME_URL||'https://www.zhengxiaohui.cn/html/game/tank-3d/index.html?test=1&q=high';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const state=p=>p.evaluate(()=>__TANK_TEST__.state());
async function ff(args){await new Promise((ok,no)=>{let log='';const p=cp.spawn('ffmpeg',['-hide_banner','-y',...args],{windowsHide:true});p.stderr.on('data',x=>log+=x);p.on('exit',c=>c?no(Error(log.slice(-2000))):ok());});}
async function open(name){
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...args){if(dest instanceof AudioDestinationNode){if(!this.context.__dest){this.context.__dest=this.context.createMediaStreamDestination();window.__audioDest=this.context.__dest;}connect.call(this,this.context.__dest,...args);}return connect.call(this,dest,...args);};});
 await p.goto(URL);await p.waitForFunction(()=>window.__tankReady&&window.__TANK_TEST__);
 // These are ordinary persistent player settings, read at startup.
 await p.evaluate(()=>{localStorage.setItem('tank3d-v2:camera.classic','0');localStorage.setItem('tank3d-v2:quality','"high"');});await p.reload();await p.waitForFunction(()=>window.__tankReady);
 const sources=await p.evaluate(async()=>{const j=await Promise.all(['main.js','sim.js','coop.js','scene.js','levels.js'].map(async n=>[n,await (await fetch(n)).text()]));return Object.fromEntries(j);});
 const crypto=require('crypto');const hashes=Object.fromEntries(Object.entries(sources).map(([n,t])=>[n,crypto.createHash('sha256').update(t).digest('hex')]));
 return {browser,ctx,p,name,errors,hashes};
}
async function begin(client,slug){
 const dir=path.join(OUT,slug);fs.mkdirSync(dir,{recursive:true});const frames=[],writes=[],cdp=await client.ctx.newCDPSession(client.p);let active=true;
 cdp.on('Page.screencastFrame',e=>{cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});if(!active)return;const file=String(frames.length).padStart(6,'0')+'.jpg';frames.push({file,t:e.metadata.timestamp,receivedAt:Date.now()/1000});writes.push(fs.promises.writeFile(path.join(dir,file),Buffer.from(e.data,'base64')));});
 await client.p.evaluate(()=>{if(!window.__audioDest)return;window.__recordChunks=[];window.__record=new MediaRecorder(__audioDest.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});__record.ondataavailable=e=>__recordChunks.push(e.data);__record.start(250);});
 const start=Date.now();await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1920,maxHeight:1080,everyNthFrame:2});
 return {slug,dir,start,frames,async stop(){await cdp.send('Page.stopScreencast');active=false;await Promise.all(writes);const audio=await client.p.evaluate(async()=>{if(!window.__record)return null;await new Promise(ok=>{__record.onstop=ok;__record.stop();});return Array.from(new Uint8Array(await new Blob(__recordChunks).arrayBuffer()));});if(audio)fs.writeFileSync(path.join(dir,'audio.webm'),Buffer.from(audio));
 // CDP can deliver stale frames. Drop non-increasing timestamps rather than
 // clamping negative gaps, which extends playback and truncates the ending.
 const ordered=[];for(const f of frames)if(!ordered.length||f.t>ordered.at(-1).t)ordered.push(f);
 let txt='ffconcat version 1.0\n';for(let i=0;i<ordered.length;i++){txt+=`file '${ordered[i].file}'\noption framerate 1000\n`;if(i+1<ordered.length)txt+=`duration ${(ordered[i+1].t-ordered[i].t).toFixed(6)}\n`;}
 fs.writeFileSync(path.join(dir,'frame-times.json'),JSON.stringify(frames));
 fs.writeFileSync(path.join(dir,'frames.ffconcat'),txt);const duration=ordered.at(-1).t-ordered[0].t;
 const gaps=frames.slice(1).map((f,i)=>(f.t-frames[i].t)*1000).sort((a,b)=>a-b);
 const manifest={slug,url:URL,capture_mode:'realtime-automation',normalGameplay:true,testHookUsage:'read-only observation; no health/map/timing/score/seed changes',width:1920,height:1080,frames:frames.length,duration,startedAt:new Date(start).toISOString(),end:await state(client.p),errors:client.errors,hashes:client.hashes,cadence:{fps:frames.length/duration,p95:gaps[Math.floor(gaps.length*.95)],max:gaps.at(-1)},audio:!!audio};
 fs.writeFileSync(path.join(dir,'capture.json'),JSON.stringify(manifest,null,2));
 await ff(['-threads','2','-safe','0','-f','concat','-i',path.join(dir,'frames.ffconcat'),...(audio?['-i',path.join(dir,'audio.webm')]:[]),'-vf','fps=30,format=yuv420p','-c:v','h264_nvenc','-preset','p5','-cq','18','-b:v','0',...(audio?['-c:a','aac','-b:a','192k']:['-an']),'-t',String(duration),'-movflags','+faststart',path.join(OUT,slug+'.mp4')]);console.log('CAPTURE',slug,JSON.stringify({duration,frames:frames.length,cadence:manifest.cadence,end:manifest.end.status,stats:manifest.end.run?.stats,errors:client.errors}));return manifest;}};
}
// A deliberate defender: align on threats, break obstructing bricks, avoid firing at the base.
async function decision(p,slot){return p.evaluate(slot=>{
 const T=__TANK_TEST__,s=T.state(),w=T.world,p=w?.seats?.[slot]?.tank;if(!p||p.state!=='active'||s.overlay||s.phase!=='play')return {dir:-1,fire:false};
 const enemies=w.bots.filter(b=>b.state==='active');const dx=[0,1,0,-1],dy=[-1,0,1,0];
 const blocks=(x,y)=>{if(x<0||y<0||x>192||y>192)return 1e5;let brick=0;for(let cy=y>>3;cy<=((y+15)>>3);cy++)for(let cx=x>>3;cx<=((x+15)>>3);cx++){const c=cy*26+cx;if((cx>=12&&cx<=13&&cy>=24)||w.terrain.steel[c]||(w.terrain.water[c]&&!p.boats))return 1e5;const q=(cy*2)*52+cx*2;if(w.terrain.brick[q]||w.terrain.brick[q+1]||w.terrain.brick[q+52]||w.terrain.brick[q+53])brick++;}return brick?4:0;};
 const safeShot=(x,y,dir)=>!(dir===2&&x>77&&x<115)&&!(y>176&&((dir===1&&x<100)||(dir===3&&x>96)));
 let target=enemies.slice().sort((a,b)=>((Math.abs(a.x-p.x)+Math.abs(a.y-p.y))-.9*a.y+(slot===0&&a.x>112?35:slot===1&&a.x<80?35:0))-((Math.abs(b.x-p.x)+Math.abs(b.y-p.y))-.9*b.y+(slot===0&&b.x>112?35:slot===1&&b.x<80?35:0)))[0];
 // A straight shot is intentional even when it first removes intervening brick.
 if(target){let dir=-1;if(Math.abs(target.x-p.x)<8)dir=target.y<p.y?0:2;else if(Math.abs(target.y-p.y)<8)dir=target.x<p.x?3:1;
 if(dir>=0&&safeShot(p.x,p.y,dir))return {dir,fire:true,reason:'engage aligned threat',target:{x:target.x,y:target.y,type:target.type}};}
 let goal=target?{x:Math.round(target.x/8)*8,y:Math.max(112,Math.min(160,Math.round(target.y/8)*8))}:{x:slot===0?64:128,y:144};
 if(w.powerup&&Math.hypot(w.powerup.x-p.x,w.powerup.y-p.y)<35)goal={x:Math.round(w.powerup.x/8)*8,y:Math.round(w.powerup.y/8)*8};
 // Dijkstra to a useful firing lane; brick cells are traversable by shooting, not teleporting.
 const sx=Math.round(p.x/8),sy=Math.round(p.y/8),sid=sy*25+sx,dist=Array(625).fill(1e9),first=Array(625).fill(-1),queue=[sid];dist[sid]=0;let best=sid,score=1e9;
 while(queue.length){queue.sort((a,b)=>dist[b]-dist[a]);const id=queue.pop(),x=id%25,y=Math.floor(id/25),cost=dist[id]+(Math.abs(x*8-goal.x)+Math.abs(y*8-goal.y))*.2;if(cost<score){best=id;score=cost;}if(dist[id]>40)continue;
 for(let d=0;d<4;d++){const nx=x+dx[d],ny=y+dy[d];if(nx<0||ny<0||nx>24||ny>24)continue;const ni=ny*25+nx,v=blocks(nx*8,ny*8);if(v>1000)continue;const nd=dist[id]+1+v;if(nd<dist[ni]){dist[ni]=nd;first[ni]=id===sid?d:first[id];queue.push(ni);}}}
 let dir=first[best];if(dir<0&&target){dir=Math.abs(target.x-p.x)<Math.abs(target.y-p.y)?(target.x>p.x?1:3):(target.y>p.y?2:0);}
 const fire=dir>=0&&safeShot(p.x,p.y,dir)&&(!!target||blocks(p.x+dx[dir]*8,p.y+dy[dir]*8)>0);
 const q=((Math.round(T.view.cameraYaw()/(Math.PI/2))%4)+4)%4;return {dir,fire,q,reason:target?'intercept threat':'guard lane',target:goal};
 },slot);}
async function input(p,d){const codes=['KeyW','KeyD','KeyS','KeyA'];const want=d.dir<0?[]:[codes[(d.dir+(d.q||0))%4]];if(!p.held)p.held=new Set();for(const k of p.held)if(!want.includes(k)){await p.keyboard.up(k);p.held.delete(k);}for(const k of want)if(!p.held.has(k)){await p.keyboard.down(k);p.held.add(k);}if(d.fire)await p.keyboard.press('KeyJ',{delay:15});}
(async()=>{fs.mkdirSync(OUT,{recursive:true});const clients=[],manifests=[],events=[];try{
 const h=await open('host');clients.push(h);const g=await open('guest');clients.push(g);
 await h.p.click('[data-act="coop"]');await g.p.click('[data-act="coop"]');
 const a=await begin(h,'01-host-lobby'),b=await begin(g,'02-guest-lobby');
 await h.p.fill('#coop-name','一号守左路');await h.p.fill('#coop-room-name','联机实录');await h.p.selectOption('#coop-capacity','4');await h.p.fill('#coop-create-password','tankvideo');await delay(1200);await h.p.click('#coop-create');await h.p.waitForFunction(()=>__TANK_TEST__.coop.room);
 const code=(await state(h.p)).coop.room.code;await delay(1500);await g.p.fill('#coop-name','二号守右路');await g.p.fill('#coop-code',code);await g.p.fill('#coop-password','tankvideo');await delay(900);await g.p.click('#coop-join');await g.p.waitForFunction(()=>__TANK_TEST__.coop.room?.players.length===2);await delay(1000);await g.p.click('#coop-ready');await h.p.waitForFunction(()=>!document.getElementById('coop-start').disabled);await delay(2000);
 manifests.push(await a.stop(),await b.stop());await h.p.screenshot({path:path.join(OUT,'lobby.png')});
 const battle=await begin(h,'03-coop-battle');await h.p.click('#coop-start');await h.p.waitForFunction(()=>__TANK_TEST__.state().phase==='play');await g.p.waitForFunction(()=>__TANK_TEST__.state().phase==='play');
 const seconds=Number(process.env.CAPTURE_SECONDS||145);let last=-5,switched=false,returnView=false,ended=false;
 while((Date.now()-battle.start)/1000<seconds){const t=(Date.now()-battle.start)/1000,s=await state(h.p);
 if(t-last>1){events.push({t:+t.toFixed(3),host:s,guest:await state(g.p)});last=t;if(Math.floor(t)%10===0)console.log('BATTLE',Math.floor(t),s.run?.stats,s.player&&[s.player.x,s.player.y],s.status,s.overlay);}
 if(s.stage>1||s.status==='gameover'){ended=true;await input(h.p,{dir:-1});await input(g.p,{dir:-1});await delay(6500);break;}
 // Keep the full battlefield for the main round, switch the guest view through normal C keys.
 if(!switched&&t>25){await g.p.keyboard.press('KeyC');switched=true;await g.p.screenshot({path:path.join(OUT,'guest-top.png')});}
 if(!returnView&&t>45){await g.p.keyboard.press('KeyC');returnView=true;await g.p.screenshot({path:path.join(OUT,'guest-close.png')});}
 await input(h.p,await decision(h.p,0));await input(g.p,await decision(g.p,1));await delay(110);
 }
 await input(h.p,{dir:-1});await input(g.p,{dir:-1});await h.p.screenshot({path:path.join(OUT,'battle-end.png')});manifests.push(await battle.stop());
 const detail={topic:'2–4 player cooperative base defense',captureClients:'two independently controlled browser clients, not two human friends',manifests,events,realRoundEnded:ended,createdAt:new Date().toISOString()};
 const brief=s=>({phase:s.phase,overlay:s.overlay,stage:s.stage,players:s.players,player:s.player,run:s.run,botCount:s.bots?.length,keys:s.keys,coop:{slot:s.coop.slot,host:s.coop.host,rtt:s.coop.rtt,states:s.coop.states}});
 fs.mkdirSync(path.join(W,'tmp'),{recursive:true});fs.writeFileSync(path.join(W,'tmp/capture-index-full.json'),JSON.stringify(detail,null,2));
 fs.writeFileSync(path.join(W,'capture-index.json'),JSON.stringify({...detail,raw_detail_file:'tmp/capture-index-full.json',manifests:manifests.map(m=>({...m,end:{...brief(m.end),room:m.end.coop.room}})),events:events.map(e=>({t:e.t,host:brief(e.host),guest:brief(e.guest)}))},null,2));
 console.log('DONE',JSON.stringify((await state(h.p)).run));
 }finally{for(const c of clients)await c.browser.close();}})().catch(e=>{console.error(e);process.exit(1);});

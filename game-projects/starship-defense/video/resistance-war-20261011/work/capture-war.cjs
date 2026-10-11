// 抗战战役 · 亮剑名场面 —— 正式录制（三章连续正常通关）
// 采集：CDP Page.startScreencast 逐帧 JPEG(quality98, 1920x1080) + AudioContext MediaStreamDestination 游戏音轨
// 纪律：只发正常键盘输入、只读游戏状态。不用无敌、不清敌、不改血量、不瞬移、不改时间缩放。
// 阶段直达（如启用）会在 capture.json 的 phase_isolation 中逐条标注，绝不冒充连续正常胜利。
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=__dirname,WEB=path.resolve(ROOT,'../../../../../public');
const TAKE=process.env.TAKE||'war-01';
const OUT=path.join(ROOT,'capture',TAKE);
// CH=0/1/2 时只录该章（通过章节选择界面正常进入，属正常玩家路径，不算阶段直达）；
// 不设置则按 第1章→第2章→第3章 连续录制。
const CH=process.env.CH!==undefined&&process.env.CH!==''?Number(process.env.CH):null;
const wantCh=n=>CH===null||CH===n;
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.webm':'video/webm'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(WEB,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(WEB+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',MIME[path.extname(file).toLowerCase()]||'application/octet-stream');res.end(data);});
}).listen(0,'127.0.0.1');

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),p=await context.newPage();
 const errors=[],events=[],states=[],frames=[],shots=[];
 const phaseIsolation=[];
 let started=Date.now(),recording=false,lastSaved=0,shotIndex=0;
 let cdp=null;
 const T=()=>(Date.now()-started)/1000;
 const held=new Set();

 async function keys(want){for(const k of [...held])if(!want.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
 async function tap(k,ms=90){await p.keyboard.press(k);await sleep(ms);}
 async function tapHold(k,ms){await p.keyboard.down(k);await sleep(ms);await p.keyboard.up(k);}

 // 音轨采集状态与启动函数：必须在外层作用域声明，供 enterChapter 在进入战斗后调用。
 // （教训：曾误放在 try 块内，导致外层 enterChapter 里 typeof ensureAudio 恒为 'undefined'，音轨从未启动。）
 let audioStarted=false,audioStartTs=0;
 async function ensureAudio(){
  if(audioStarted)return true;
  const ok=await p.evaluate(()=>{
   if(!window.__movieAudio)return false;
   try{
    window.__movieChunks=[];
    window.__movieRec=new MediaRecorder(window.__movieAudio.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});
    window.__movieRec.ondataavailable=e=>window.__movieChunks.push(e.data);
    window.__movieRec.start(500);window.__movieAudioStart=Date.now();
    return true;
   }catch(e){return false;}
  });
  if(ok){
   audioStarted=true;
   // 音频起点对应的视频时间轴：用当前最新帧的 CDP 时间戳（与帧序列同一基准），编码时据此对齐
   audioStartTs=frames.length?frames[frames.length-1].timestamp:(lastSaved||0);
   events.push({name:'audio-recording-started',t:T(),frame:frames.length,audioStartTs});
   console.log('  音轨采集已启动 @frame '+frames.length+' ts '+audioStartTs.toFixed(3));
  }
  return ok;
 }

 // ---------- 只读状态 ----------
 async function ob(){return p.evaluate(()=>{
  const q=__gameQA,r=q.resistanceCampaign,s=r.state;
  // 战役未激活（在菜单/结算界面）时 objective()、map、player 都不可读，返回精简状态
  if(!s.active||!s.map||!s.player){
   return {active:!!s.active,over:!!s.over,finished:false,chapter:s.chapter??null,phase:s.phase??null,
    nativeState:q.Game.state,testMode:!!q.Game.testMode,menuWar:(()=>{try{return !document.getElementById('warMenu').classList.contains('hidden')}catch(e){return null}})(),
    dialogue:(()=>{const e=document.getElementById('warDialogue');return e&&!e.classList.contains('hidden')?e.textContent:null})()};
  }
  const o=r.objective(),P=s.player.root.position;
  // 注意：view() 只注入给战役模块，不在 __gameQA 上；朝向必须用 getCamYaw()/getCamMode()
  const yaw=(()=>{try{return q.getCamYaw()}catch(e){return null}})();
  const first=(()=>{try{return q.getCamMode()==='first'}catch(e){return null}})();
  const pitch=(()=>{try{return q.camera.rotation.x}catch(e){return null}})();
  return {active:s.active,over:s.over,finished:!!s.finished,chapter:s.chapter,phase:s.phase,nativeState:q.Game.state,
   testMode:q.Game.testMode,invuln:s.invulnerable>0,elapsed:Math.round(s.elapsed*10)/10,
   x:P.x,z:P.z,y:P.y,hp:Math.ceil(s.player.hp),maxHp:s.player.maxHp,dead:s.player.dead,mounted:!!s.player.mounted,
   yaw,first,pitch,kills:s.kills,hold:Math.round(s.hold*10)/10,order:s.order,
   distObj:Math.round(Math.hypot(P.x-o.x,P.z-o.z)*10)/10,objX:o.x,objZ:o.z,
   enemies:s.units.filter(u=>u.team==='enemy'&&!u.dead).length,
   allies:s.units.filter(u=>u.team==='ally'&&!u.dead&&u!==s.player).length,
   weapon:s.weapon,ammo:s.ammo[s.weapon],grenades:s.grenades,medkits:s.medkits,
   cannon:!!s.cannon,towing:!!s.towing,carrying:!!s.carrying,loaded:s.loaded,gateShots:s.gateShots,
   wagonHp:Math.ceil(s.wagonHp),chargeCd:s.chargeCd,chargeT:s.chargeT,aiming:!!s.aiming,
   wagonZ:(()=>{try{return Math.round(s.map.objectives.wagon.position.z*10)/10}catch(e){return null}})(),
   cannonPos:(()=>{try{const c=s.map.objectives.cannon;const q=c.position;return{x:Math.round(q.x*10)/10,z:Math.round(q.z*10)/10,yaw:Math.round(c.rotation.y*100)/100}}catch(e){return null}})(),
   destructibles:s.map?s.map.destructibles.map(d=>({key:d.key,dead:!!d.dead,hp:Math.ceil(d.hp)})):null,
   nearestEnemy:(()=>{let best=null,bd=1e9;for(const u of s.units){if(u.dead||u.team!=='enemy')continue;const d=Math.hypot(u.root.position.x-P.x,u.root.position.z-P.z);if(d<bd){bd=d;best={name:u.name,d:Math.round(d*10)/10,x:Math.round(u.root.position.x*10)/10,z:Math.round(u.root.position.z*10)/10,mounted:!!u.mounted,hp:Math.ceil(u.hp)};}}return best;})(),
   dialogue:(()=>{const e=document.getElementById('warDialogue');return e&&!e.classList.contains('hidden')?e.textContent:null})(),
   hint:(()=>{try{return document.getElementById('warHint').textContent}catch(e){return null}})(),
   progress:(()=>{try{return document.getElementById('warProgress').textContent}catch(e){return null}})(),
   mission:(()=>{try{return document.getElementById('warMission').textContent}catch(e){return null}})(),
   cannonReadout:(()=>{try{return document.getElementById('warCannonReadout').textContent}catch(e){return null}})()};
 });}

 // ---------- 镜头分段（真实时间戳 + 画面证据）----------
 async function shotStart(name,note){
  shotIndex++;const st=await ob();
  const cur={index:shotIndex,name,note,planId:name,startWall:T(),startGame:st.elapsed,startFrame:frames.length,start:st};
  shots.push(cur);
  await p.screenshot({path:path.join(OUT,`shot-${String(shotIndex).padStart(2,'0')}-${name}.png`)});
  console.log(`SHOT ${String(shotIndex).padStart(2,'0')} ${name} @wall ${cur.startWall.toFixed(2)}s game ${cur.startGame}s | ${note||''}`);
  return cur;
 }
 async function shotEnd(name){
  const cur=shots.filter(s=>s.name===name).pop();if(!cur||cur.endWall!=null)return cur;
  const st=await ob();cur.endWall=T();cur.endGame=st.elapsed;cur.endFrame=frames.length;cur.end=st;
  cur.frames=cur.endFrame-cur.startFrame;cur.seconds=Math.round((cur.endWall-cur.startWall)*100)/100;
  await p.screenshot({path:path.join(OUT,`shot-${String(cur.index).padStart(2,'0')}-${name}-end.png`)});
  console.log(`   end ${name} ${cur.seconds}s frames=${cur.frames} game=${cur.endGame}s`);
  return cur;
 }
 const mark=async(name,detail={})=>{const s=await ob();const e={name,t:T(),game:s.elapsed,frame:frames.length,...detail,state:s};events.push(e);console.log('EVENT',name,e.t.toFixed(2),'frame',e.frame,JSON.stringify(detail));await p.screenshot({path:path.join(OUT,'mark-'+name+'.png')});return e;};

 // ---------- 寻路（复用游戏自身 collision，正常步行半径）----------
 async function route(goal){return p.evaluate(({goal})=>{
  const r=__gameQA.resistanceCampaign,s=r.state,b=s.map.bounds,step=1;
  const P=s.player.root.position,radius=s.player.mounted?.9:.5;
  const x0=b.minX+2,z0=b.minZ+2,W=Math.floor((b.maxX-2-x0)/step),H=Math.floor((b.maxZ-2-z0)/step);
  const ix=x=>Math.max(0,Math.min(W-1,Math.round((x-x0)/step))),iz=z=>Math.max(0,Math.min(H-1,Math.round((z-z0)/step)));
  const X=i=>x0+i*step,Z=j=>z0+j*step;
  const free=(x,z)=>{if(x<b.minX+2||x>b.maxX-2||z<b.minZ+2||z>b.maxZ-2)return false;return !r.collision(x,z,radius);};
  // 目标点若被占（如压在交通壕矮墙上），向外找 6 米内最近可站格，仍满足游戏过关距离
  let ei=ix(goal.x),ej=iz(goal.z);
  if(!free(X(ei),Z(ej))){let spot=null;for(let rad=1;rad<12&&!spot;rad++)for(let di=-rad;di<=rad&&!spot;di++)for(let dj=-rad;dj<=rad&&!spot;dj++){if(Math.max(Math.abs(di),Math.abs(dj))!==rad)continue;const ii=ei+di,jj=ej+dj;if(ii<0||jj<0||ii>=W||jj>=H)continue;if(free(X(ii),Z(jj))&&Math.hypot(X(ii)-goal.x,Z(jj)-goal.z)<6.2)spot=[ii,jj];}if(!spot)return null;ei=spot[0];ej=spot[1];}
  const si=ix(P.x),sj=iz(P.z),start=sj*W+si,end=ej*W+ei;
  if(start===end)return[{x:goal.x,z:goal.z}];
  const dist=new Float64Array(W*H).fill(Infinity),par=new Int32Array(W*H).fill(-1),closed=new Uint8Array(W*H);
  const open=[start];dist[start]=0;
  const h=k=>Math.abs(k%W-end%W)+Math.abs(Math.floor(k/W)-Math.floor(end/W));
  let found=false,guard=0;
  while(open.length&&guard++<200000){open.sort((a,b2)=>(dist[b2]+h(b2))-(dist[a]+h(a)));const k=open.pop();
   if(closed[k])continue;closed[k]=1;if(k===end){found=true;break;}
   const x=k%W,z=Math.floor(k/W);
   for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){ // 只走四方向，杜绝斜穿切掩体拐角
    const xx=x+dx,zz=z+dz;if(xx<0||xx>=W||zz<0||zz>=H)continue;const j=zz*W+xx;if(closed[j])continue;
    if(!free(X(xx),Z(zz)))continue;
    if(dist[k]+1<dist[j]){dist[j]=dist[k]+1;par[j]=k;open.push(j);}}}
  if(!found)return null;
  const a=[];for(let k=end;k!==start&&k>=0;k=par[k])a.push({x:X(k%W),z:Z(Math.floor(k/W))});
  a.reverse();a.push({x:goal.x,z:goal.z});
  // LOS 折线简化：采样 0.25m 校验直线可通行，能直走的中间点全部丢掉
  const losFree=(A,B)=>{const d=Math.hypot(B.x-A.x,B.z-A.z),n=Math.max(2,Math.round(d/.25));for(let i=0;i<=n;i++){const t=i/n;if(!free(A.x+(B.x-A.x)*t,A.z+(B.z-A.z)*t))return false;}return true;};
  const slim=[a[0]];let i=0;
  while(i<a.length-1){let j=a.length-1;while(j>i+1&&!losFree(a[i],a[j]))j--;slim.push(a[j]);i=j;}
  return slim;
 },{goal});}

 // ---------- 真实按键转向（Q/E）----------
 // 注意：camYaw 被 mod 到 [0,2π)（game.js:2540），E/Q 对 yaw 的增减方向不能靠推断，
 // 首次使用时按键实测标定一次，之后按标定结果选键。
 let turnDir=null;
 async function calibrateTurn(){
  if(turnDir!==null)return turnDir;
  await keys([]);
  const y0=(await ob()).yaw;
  await p.keyboard.down('KeyE');await sleep(150);await p.keyboard.up('KeyE');await sleep(260);
  const y1=(await ob()).yaw;
  const d=Math.atan2(Math.sin(y1-y0),Math.cos(y1-y0));
  turnDir=d>=0?1:-1; // +1 = KeyE 使 yaw 增大
  events.push({name:'turn-calibrated',t:T(),y0,y1,delta:d,turnDir,eMeans:d>=0?'yaw 增大':'yaw 减小'});
  console.log('TURN CALIBRATED: KeyE =>',d>=0?'yaw 增大':'yaw 减小','turnDir=',turnDir,'(y0 '+y0.toFixed(3)+' -> y1 '+y1.toFixed(3)+')');
  return turnDir;
 }
 async function faceTo(tx,tz,tol=0.13,maxMs=3400){
  await calibrateTurn();
  const t0=Date.now();
  while(Date.now()-t0<maxMs){
   const s=await ob();const cur=s.yaw;
   if(cur===null||!Number.isFinite(cur))return false;
   // 前进方向 = (sin(yaw), cos(yaw))（resistance-campaign.js:186），故期望 yaw = atan2(dx, dz)
   const want=Math.atan2(tx-s.x,tz-s.z);
   const d=Math.atan2(Math.sin(want-cur),Math.cos(want-cur));
   if(Math.abs(d)<tol)return true;
   const key=(Math.sign(d)===turnDir)?'KeyE':'KeyQ';
   await keys([]);
   await p.keyboard.down(key);await sleep(Math.max(28,Math.min(190,Math.round(Math.abs(d)*85))));await p.keyboard.up(key);
   await sleep(70);
  }
  return false;
 }

 // ---------- 交战：转向最近敌兵 + 按住 J ----------
 async function engage(ms=2200,{prefer=null}={}){
  const t0=Date.now();let volleys=0;
  while(Date.now()-t0<ms){
   const s=await ob();if(s.over||s.dead)break;
   const e=s.nearestEnemy;if(!e)break;
   await faceTo(e.x,e.z,0.2,1100);
   // 按敌兵距离与武器数值选枪：远距用三八式(100射程)，近身用驳壳枪(42)，堡垒/成群用捷克式(20发)
   const want=e.d>60?'arisaka':e.d<14?'mauser':null;
   if(want&&s.weapon!==want){await tap('Digit'+({rifle:1,mauser:2,zb26:3,arisaka:4}[want]),260);}
   await keys(['KeyJ']);await sleep(400);volleys++;
   const s2=await ob();await keys([]);
   if(s2.hp<70&&s2.medkits>0){await tap('KeyH',260);}
   if(s2.ammo<=0)await tap('KeyR',420);
  }
  await keys([]);return volleys;
 }

 // ---------- 行进到目标：寻路 + 转向 + W 前进，途中真实交战 ----------
 async function walkTo(goal,label,{fight=true,timeoutMs=80000,arrive=2.4}={}){
  await keys([]);
  let wps=await route(goal);
  if(!wps){events.push({name:label+'-route-failed',t:T(),goal});console.log('  ROUTE FAILED',label);return false;}
  let idx=0,lastMove=Date.now(),last=null;const t0=Date.now();
  let stuckN=0,escapeSide=1;
  while(Date.now()-t0<timeoutMs){
   const s=await ob();
   if(s.over){await keys([]);return false;}
   if(s.dead){await keys([]);await sleep(3800);wps=await route(goal);idx=0;lastMove=Date.now();stuckN=0;await mark(label+'-respawn',{chapter:s.chapter,phase:s.phase});continue;}
   const P={x:s.x,z:s.z};
   if(Math.hypot(goal.x-P.x,goal.z-P.z)<arrive){await keys([]);events.push({name:label+'-arrive',t:T(),goal,pos:P,ms:Date.now()-t0});return true;}
   if(fight&&s.nearestEnemy&&s.nearestEnemy.d<26){await engage(1500);lastMove=Date.now();stuckN=0;continue;}
   let tgt=wps[idx];
   if(Math.hypot(tgt.x-P.x,tgt.z-P.z)<2.2&&idx<wps.length-1)tgt=wps[++idx];
   await faceTo(tgt.x,tgt.z,0.22,1400);
   const s3=await ob();
   await keys(['KeyW']);await sleep(290);
   if(s3.hp<70&&s3.medkits>0){await keys([]);await tap('KeyH',260);lastMove=Date.now();}
   const s4=await ob();
   if(last&&Math.hypot(last.x-s4.x,last.z-s4.z)<0.32){
    // 卡住脱困：先后退脱离掩体，再交替侧移绕行；每 2 次才重规划，避免反复走同一条死路
    stuckN++;
    await keys(['KeyS']);await sleep(300);await keys([]);
    await keys([escapeSide>0?'KeyD':'KeyA']);await sleep(340);await keys([]);
    if(stuckN%2===0){escapeSide=-escapeSide;}
    if(stuckN%3===0||Date.now()-lastMove>4200){
     wps=await route(goal);idx=0;lastMove=Date.now();
     events.push({name:label+'-replan',t:T(),stuckN,x:s4.x,z:s4.z});
     console.log('  replan',label,'stuckN='+stuckN);
    }
   }else{lastMove=Date.now();stuckN=0;}
   last={x:s4.x,z:s4.z};
   await keys([]);
   if(states.length<20000)states.push({t:T(),name:label,x:s4.x,z:s4.z,hp:s4.hp,phase:s4.phase,enemies:s4.enemies,kills:s4.kills});
  }
  await keys([]);const sf=await ob();
  events.push({name:label+'-timeout',t:T(),goal,pos:{x:sf.x,z:sf.z},distObj:sf.distObj});
  console.log('  WALK TIMEOUT',label,'dist',sf.distObj);
  return false;
 }

 // ---------- 清场推进：打完当前阶段全部敌兵，并驻守占领点等待推进 ----------
 // 各阶段占领门槛（resistance-campaign.js:221-223 mission()）：
 //   ch0 P0 交通壕 <7m + 18m内无敌 + 驻守3s；ch0 P2 坡顶 <8m + 20m内无敌 + 驻守5s
 //   ch2 P0 城外 <12m + 18m内无敌（且街道堡垒已毁）；ch2 P3 队部 <8m + 18m内无敌 + 驻守5s
 // 教训：验证时停在距目标 8.0m 处，因要求 <8m 差 1 米不触发读秒，hold 卡在 0.1s。
 // 故驻守点一律取门槛的 55%，绝不贴着门槛站。
 const HOLD_RADIUS={'0:0':7,'0:2':8,'2:0':12,'2:3':8};
 const holdRadius=(ch,ph)=>HOLD_RADIUS[ch+':'+ph]??null;

 async function campObjective(label,{maxMs=70000}={}){  const s0=await ob();
  const rad=holdRadius(s0.chapter,s0.phase);
  if(!rad)return false;
  const t0=Date.now();let reface=0;
  while(Date.now()-t0<maxMs){
   const s=await ob();
   if(s.over)return true;
   if(s.dead){await sleep(3800);continue;}
   // 有敌兵先打；打完再回占领点
   if(s.enemies>0&&s.nearestEnemy&&s.nearestEnemy.d<40){
    await faceTo(s.nearestEnemy.x,s.nearestEnemy.z,0.2,1200);
    await keys(['KeyJ']);await sleep(430);await keys([]);
    const sA=await ob();if(sA.hp<70&&sA.medkits>0)await tap('KeyH',260);
    continue;
   }
   // 距占领点超过门槛 65% 就走回去（留足余量）
   if(s.distObj>rad*0.65){
    await walkTo({x:s.objX,z:s.objZ},label+'-camp',{fight:true,timeoutMs:26000,arrive:rad*0.55});
    continue;
   }
   // 已在范围内：站定等待读秒，偶尔转身应对来袭
   if(++reface%6===0)await faceTo(s.objX,s.objZ+8,0.3,900);
   await sleep(700);
   const sB=await ob();
   if(sB.hold>0)console.log('   camping hold='+sB.hold+'s dist='+sB.distObj+'m progress='+sB.progress);
  }
  return false;
 }

 async function clearPhase(label,{maxMs=70000,targetPhase=null}={}){
  const t0=Date.now();
  while(Date.now()-t0<maxMs){
   const s=await ob();
   if(s.over)return s;
   const want=targetPhase??s.phase+1;
   if(s.phase>=want)return s;
   if(s.dead){await sleep(3600);continue;}
   if(s.enemies>0&&s.nearestEnemy&&s.nearestEnemy.d<70){
    // 主动接近最近敌兵再打，避免原地空放
    if(s.nearestEnemy.d>20)await walkTo({x:s.nearestEnemy.x,z:s.nearestEnemy.z+6},label+'-push',{fight:true,timeoutMs:20000,arrive:5});
    await engage(2400);
   }else if(holdRadius(s.chapter,s.phase)!==null){
    // 敌兵已清且本阶段需要驻守占领：走到占领点站定读秒
    await campObjective(label,{maxMs:Math.max(8000,maxMs-(Date.now()-t0))});
   }else{await sleep(1300);}
   const s2=await ob();
   if(s2.hold>0)console.log('   hold',s2.hold,'progress',s2.progress);
  }
  return await ob();
 }

 // ---------- 按章进入：始终走章节选择界面（真实玩家路径，不算阶段直达）----------
 // 若当前正在战役中，先退出到章节选择；再点对应章节卡片进入本章开头。
 async function enterChapter(n,{viaMenu=true}={}){
  // 已在战役内 → 用返回按钮退回章节选择
  const st=await ob();
  if(st.active){
   await keys([]);
   await tap('KeyEscape',900);
   const menuOpen=await p.evaluate(()=>!document.getElementById('warMenu').classList.contains('hidden'));
   if(!menuOpen){
    // 结算界面用「章节选择」按钮；否则用返回主菜单再进入
    await p.click('#warSelect').catch(()=>{});await sleep(1400);
   }
  }
  const opened=await p.evaluate(()=>!document.getElementById('warMenu').classList.contains('hidden'));
  if(!opened){
   await p.click('#btnResistance').catch(()=>{});await sleep(1800);
  }
  const okMenu=await p.evaluate(()=>!document.getElementById('warMenu').classList.contains('hidden'));
  if(!okMenu){events.push({name:'enter-chapter-menu-failed',t:T(),chapter:n});console.log('  章节选择界面未打开，chapter',n);return false;}
  await p.screenshot({path:path.join(OUT,`chapter-select-before-${n}.png`)});
  await p.click(`.warChapter[data-chapter="${n}"]`).catch(()=>{});
  await sleep(2200);
  // 清掉章节按钮焦点，避免战斗中被导航层吞掉 KeyJ（game.js:3908）
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  const s=await ob();
  const ok=s.active&&s.chapter===n&&!s.testMode;
  events.push({name:'enter-chapter',t:T(),chapter:n,ok,viaMenu:true,phase:s.phase,hp:s.hp,testMode:s.testMode});
  console.log(`  进入第${n+1}章 ${ok?'成功':'失败'} phase=${s.phase} hp=${s.hp} testMode=${s.testMode}`);
  await p.screenshot({path:path.join(OUT,`chapter-${n}-entered.png`)});
  // 进入战斗后游戏会初始化 AudioContext，此时音轨钩子就绪；重试几帧确保拿到
  if(ok&&typeof ensureAudio==='function'){
   for(let i=0;i<8&&!audioStarted;i++){if(await ensureAudio())break;await sleep(400);}
  }
  return ok;
 }

 // ---------- 稳健炸堡垒 ----------
 // 教训（第一次录制）：扔手雷时站定 3 秒会被堡垒+步兵集火打死，触发检查点重置，
 // 堡垒回满血、手雷补满、玩家退回检查点，脚本却没察觉，导致堡垒永远打不掉、phase 卡死。
 // 对策：① 血少或手雷不足先去补给点补满（interaction supply 分支回满血+4手雷+3医疗）；
 //       ② 投弹前先清附近步兵；③ 投一发立刻横移躲避，不站定；④ 检测阵亡重置并重新补给；
 //       ⑤ 站位严格控制在弹道有效窗口 16~22m（<16m 手雷从堡垒顶飞过，实测 hp 不变）。
 async function grenadeBunker(key,bx,bz,supply,label){
  const standZ=bz-18; // 堡垒正南 18m，落在弹道有效窗口内
  let attempts=0;
  while(attempts<12){
   attempts++;
   let s=await ob();
   if(s.dead){await sleep(3800);continue;}
   const bk=(s.destructibles||[]).find(d=>d.key===key);
   if(!bk){await mark(label+'-no-bunker',{attempts});return false;}
   if(bk.dead){await mark(label+'-destroyed',{bunkerHp:0,attempts});return true;}
   // 血少或手雷不足 → 先医疗包，再不够就去补给点补满
   if(s.hp<95&&s.medkits>0){await tap('KeyH',320);s=await ob();}
   if(s.hp<95||s.grenades<2){
    await walkTo(supply,label+'-resupply',{fight:true,timeoutMs:34000,arrive:3.0});
    await tap('KeyI',420);await sleep(1000);
    const sr=await ob();
    await mark(label+'-resupplied',{hp:sr.hp,grenades:sr.grenades,medkits:sr.medkits,attempts});
    continue;
   }
   // 走到投弹位
   await walkTo({x:bx,z:standZ},label+'-to-stand',{fight:true,timeoutMs:34000,arrive:2.4});
   s=await ob();
   if(s.dead){await sleep(3800);continue;}
   // 投弹前清附近步兵，避免投弹时被集火
   if(s.nearestEnemy&&s.nearestEnemy.d<26)await engage(2000);
   s=await ob();
   if(s.dead){await sleep(3800);continue;}
   const distB=Math.round(Math.hypot(s.x-bx,s.z-bz)*10)/10;
   if(distB<16||distB>22){
    await walkTo({x:bx,z:standZ},label+'-fix-stand',{fight:false,timeoutMs:20000,arrive:2.4});
    continue;
   }
   await faceTo(bx,bz,0.05,2600);
   const beforeG=s.grenades,beforeHp=bk.hp;
   await mark(label+'-throw',{grenades:beforeG,bunkerHp:beforeHp,standDist:distB,attempts});
   await tap('KeyU',260);
   // 投弹后立刻横移躲避集火（手雷已投出，玩家移动不影响其弹道）
   await keys([attempts%2?'KeyD':'KeyA']);await sleep(520);await keys([]);
   await sleep(2400);
   const s2=await ob();
   if(s2.dead)await sleep(3800);
   const s3=await ob();
   const bk2=(s3.destructibles||[]).find(d=>d.key===key);
   // 检测阵亡重置：手雷不减反增，或堡垒血量回升
   const reset=(s3.grenades>=beforeG)||(bk2&&beforeHp<250&&bk2.hp>=beforeHp);
   if(reset)await mark(label+'-checkpoint-reset',{note:'投弹期间阵亡触发检查点重置，堡垒回满血，重新补给再打',grenades:s3.grenades,bunkerHp:bk2?bk2.hp:null});
   else await mark(label+'-hit',{bunkerHpBefore:beforeHp,bunkerHpAfter:bk2?bk2.hp:null,grenades:s3.grenades});
  }
  const sf=await ob();const bkf=(sf.destructibles||[]).find(d=>d.key===key);
  await mark(label+'-giveup',{bunkerDead:bkf?bkf.dead:null,bunkerHp:bkf?bkf.hp:null,attempts});
  return false;
 }

 try{
  p.on('pageerror',e=>errors.push(e.message));
  // 采集游戏音轨（不改游戏音频逻辑，只把送扬声器的连接同时接到 MediaStreamDestination）
  await p.addInitScript(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...args){if(dest instanceof AudioDestinationNode){if(!this.context.__movieDest)this.context.__movieDest=this.context.createMediaStreamDestination();window.__movieAudio=this.context.__movieDest;return connect.call(this,this.context.__movieDest,...args);}return connect.call(this,dest,...args);};});

  await p.goto('http://127.0.0.1:'+server.address().port+'/html/game/starship-defense/index.html?qa=1');
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA&&window.__gameQA.resistanceCampaign,{timeout:60000});
  // 正常玩家设置：纯键盘 + 自动锁定 + 按住射击
  await p.click('#keysMenu').catch(()=>{});
  await p.selectOption('#combat-input','keyboard').catch(()=>{});
  await p.selectOption('#combat-aim','auto').catch(()=>{});
  await p.selectOption('#combat-fire','hold').catch(()=>{});
  await p.click('#keysClose').catch(()=>{});
  await p.evaluate(()=>{try{const c=__gameQA.CombatControls;c.set('input','keyboard');c.set('aim','auto');c.set('fire','hold');}catch(e){}});

  // ========== 开始采集 ==========
  // 帧采集立即开始；音轨须等游戏 AudioContext 初始化（钩子 __movieAudio 才存在），
  // 否则 MediaRecorder 会因 __movieAudio undefined 崩溃。ensureAudio() 在进入章节后重试直到就绪。
  started=Date.now();
  cdp=await context.newCDPSession(p);
  cdp.on('Page.screencastFrame',async e=>{if(recording&&e.metadata.timestamp-lastSaved>=.035){lastSaved=e.metadata.timestamp;const file=String(frames.length).padStart(6,'0')+'.jpg';fs.writeFileSync(path.join(OUT,file),Buffer.from(e.data,'base64'));frames.push({file,timestamp:e.metadata.timestamp});}await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});});
  recording=true;
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:98,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
  // ensureAudio / audioStarted / audioStartTs 已在外层作用域声明（供 enterChapter 调用），此处不重复定义。
  // 跨章共用的状态快照变量（分章录制时各章独立赋值）
  let s=null,s2=null;

  // ---- M03 章节菜单 ----
  if(wantCh(0)){
  await shotStart('M03-war-menu','主菜单点击抗战战役入口，展示三章卡片');
  await p.click('#btnResistance');await sleep(2600);
  await mark('war-menu-open');
  await shotEnd('M03-war-menu');
  }

  // ============ 第1章 李家坡 · 交通壕突击 ============
  if(wantCh(0)){
  await shotStart('M04-ch0-briefing','选择第1章，拍开场对白与 HUD');
  await enterChapter(0);
  await mark('ch0-start',{note:'正常规则从章节选择进入第1章 P0'});
  await sleep(3200);
  await shotEnd('M04-ch0-briefing');

  // M29 举枪瞄准对照（开局敌兵尚远，先展示 Z 举枪）
  await shotStart('M29-aim-toggle','Z 举枪瞄准：准星变小、散布降低');
  await tap('KeyZ',1500);await mark('aim-on');
  await tap('KeyZ',1400);await mark('aim-off');
  await shotEnd('M29-aim-toggle');

  // M05 交通壕推进交战
  await shotStart('M05-ch0-p0-advance','沿交通壕向北推进，与日军步兵交火');
  await walkTo({x:-7,z:44},'ch0-p0-advance',{fight:true});
  await engage(3000);
  await mark('ch0-p0-contact',{progress:(await ob()).progress});
  await shotEnd('M05-ch0-p0-advance');

  // M06 换武器对照
  await shotStart('M06-weapon-switch','按敌兵距离换枪：三八式远距点名 / 捷克式压制');
  const w0=(await ob()).weapon;
  await tap('Digit4',1400);await mark('switch-arisaka',{from:w0,to:(await ob()).weapon});
  await engage(2600);
  await tap('Digit3',1400);await mark('switch-zb26',{to:(await ob()).weapon});
  await engage(2400);
  await shotEnd('M06-weapon-switch');

  // M07 T 队友指令
  await shotStart('M07-squad-order','T 下达进攻指令，拍队友实际前压');
  await tap('KeyT',2200);await mark('order-attack',{order:(await ob()).order,dialogue:(await ob()).dialogue});
  await walkTo({x:-7,z:55},'ch0-p0-to-trench',{fight:true});
  await shotEnd('M07-squad-order');

  // M08 占领交通壕
  await shotStart('M08-trench-capture','进入交通壕驻守读秒，阶段推进');
  await engage(3200);
  await clearPhase('ch0-p0',{maxMs:60000,targetPhase:1});
  await mark('ch0-p0-captured',{phase:(await ob()).phase,dialogue:(await ob()).dialogue});
  await shotEnd('M08-trench-capture');

  // M09+M10 手雷炸两座机枪堡垒（用稳健函数：补给→清步兵→投弹即横移→检测阵亡重置）
  // 实测弹道：手雷出手高 1.5m、vy≈8.65、v水平≈18.03、g=15，堡垒高 3.3m，
  // 站位 <16m 时手雷从堡垒顶飞过（hp 不变）；有效窗口 16~22m，取正南 18m。
  // 补给点「前沿弹药」(-7,58)：靠近按 I 回满血+4手雷+3医疗（interaction supply 分支）。
  await shotStart('M09-grenade-left-bunker','手雷炸毁左侧机枪堡垒(-14,93) 250hp');
  await grenadeBunker('left-bunker',-14,93,{x:-7,z:58},'ch0-left');
  s=await ob();
  await mark('ch0-p1-left-bunker',{destructibles:s.destructibles,progress:s.progress});
  await shotEnd('M09-grenade-left-bunker');

  await shotStart('M10-grenade-right-bunker','手雷炸毁右侧机枪堡垒(14,98)，两堡垒清空后推进');
  await grenadeBunker('right-bunker',14,98,{x:-7,z:58},'ch0-right');
  s=await ob();await mark('ch0-p1-right-bunker',{destructibles:s.destructibles,phase:s.phase,dialogue:s.dialogue});
  await shotEnd('M10-grenade-right-bunker');
  // 两堡垒清空后等待阶段推进到坡顶
  await clearPhase('ch0-p1',{maxMs:40000,targetPhase:2});

  // M11 坡顶总攻 + 结算
  await shotStart('M11-hilltop-assault','冲向坡顶指挥阵地(0,137)，驻守读秒后本章结算');
  await walkTo({x:0,z:131},'ch0-p2-approach',{fight:true});
  await engage(3200);
  await clearPhase('ch0-p2',{maxMs:80000});
  s=await ob();await mark('ch0-complete',{over:s.over,kills:s.kills,elapsed:s.elapsed,hp:s.hp});
  await sleep(4200);
  await mark('ch0-result',{resultText:await p.evaluate(()=>document.getElementById('warResultText')?.textContent||null)});
  await shotEnd('M11-hilltop-assault');
  } // ============ 第1章结束 ============

  // ============ 第2章 骑兵连 · 冲锋突围 ============
  if(wantCh(1)){
  await shotStart('M12-mount','进入第2章，走到马匹按 I 上马');
  await enterChapter(1);
  await mark('ch1-start',{chapter:(await ob()).chapter,dialogue:(await ob()).dialogue});
  await sleep(2600);
  s2=await ob();
  const horse=await p.evaluate(()=>{const m=__gameQA.resistanceCampaign.state.mountMesh.position;return{x:m.x,z:m.z};});
  await walkTo({x:horse.x,z:horse.z+2.2},'ch1-p0-to-horse',{fight:false,timeoutMs:45000});
  s2=await ob();await mark('ch1-p0-hint',{hint:s2.hint});
  await tap('KeyI',500);await sleep(1400);
  s2=await ob();await mark('ch1-p0-mounted',{mounted:s2.mounted,phase:s2.phase});
  await shotEnd('M12-mount');

  // M13 骑兵连集结 + M28 视角切换对照
  await shotStart('M28-view-cycle','C 切换视角：第三人称骑兵队列 ↔ 第一人称临场感');
  const readView=()=>p.evaluate(()=>({mode:__gameQA.getCamMode(),first:__gameQA.getCamMode()==='first',yaw:__gameQA.getCamYaw()}));
  const vA=await readView();
  await tap('KeyC',2600);
  const vB=await readView();
  await mark('view-switched',{from:vA,to:vB});
  await sleep(2200);
  await tap('KeyC',2400);
  const vC=await readView();
  await mark('view-restored',{to:vC});
  await shotEnd('M28-view-cycle');

  // M14 骑兵连冲锋
  // 突破条件（resistance-campaign.js:222）：pos.z>80 且本阶段击杀≥6。
  // 教训（第一次录制）：朝最近敌兵转向且超时短，冲刺 K 达 22m/s，方向稍偏就冲反（跑到 z=-28），phase 卡在 1。
  // 对策（对齐已验证的 verify-ch23 逻辑）：敌兵近(<35m)才朝敌，否则一律朝北 (0,88)，保证净推进向北。
  await shotStart('M14-cavalry-charge','K 冲刺 + J 挥刀冲入日军封锁线');
  await walkTo({x:0,z:52},'ch1-p1-approach',{fight:false,timeoutMs:60000});
  await mark('ch1-p1-start',{phase:(await ob()).phase,enemies:(await ob()).enemies,dialogue:(await ob()).dialogue});
  const chargeLog=[];
  for(let i=0;i<40;i++){
   s2=await ob();if(s2.phase>=2||s2.over)break;
   if(s2.dead){await sleep(3800);continue;}
   const e=s2.nearestEnemy;
   // 敌兵近则朝敌，否则朝北向封锁线 (0,88)；始终先转到位再冲
   const tx=(e&&e.d<35)?e.x:0, tz=(e&&e.d<35)?e.z:88;
   await faceTo(tx,tz,0.2,1300);
   const cd=await p.evaluate(()=>__gameQA.resistanceCampaign.state.chargeCd);
   if(cd<=0){await tap('KeyK',140);if(i%3===0)await mark('charge-activated-'+i,{chargeT:(await ob()).chargeT,z:Math.round((await ob()).z)});}
   await keys(['KeyW']);await sleep(480);
   if(e&&e.d<6){await keys(['KeyJ']);await sleep(360);}
   await keys([]);
   const sB=await ob();chargeLog.push({t:sB.elapsed,z:Math.round(sB.z*10)/10,kills:sB.kills,phase:sB.phase,hp:sB.hp,enemies:sB.enemies});
   if(sB.hp<70&&sB.medkits>0)await tap('KeyH',260);
   if(i%4===0)console.log('  charge z='+Math.round(sB.z)+' kills='+sB.kills+' hp='+sB.hp+' phase='+sB.phase);
  }
  await keys([]);
  s2=await ob();await mark('ch1-p1-breakthrough',{phase:s2.phase,z:s2.z,kills:s2.kills,dialogue:s2.dialogue,log:chargeLog.slice(-8)});
  await shotEnd('M14-cavalry-charge');

  // 突破后先整备：连续通关会带着冲锋阶段的伤进入护送，先医疗回血再护车，避免护送尾声阵亡
  for(let h=0;h<3;h++){const sh=await ob();if(sh.hp>=120||sh.medkits<=0)break;await tap('KeyH',320);}
  await mark('ch1-p2-preheal',{hp:(await ob()).hp,medkits:(await ob()).medkits});

  // M16 掩护运输车撤离（防御性跟车）
  // 运输车前进条件（resistance-campaign.js:222）：玩家在 43m 内 且 车 9m 内无敌 → 车以 3.2m/s 前进；
  // 敌兵进入车 13m → 车每秒 -3hp（共550）。教训（第二次录制）：护送中冲刺贴脸打敌太激进，
  // 尾声阵亡触发战役重启、运输车退回。对策：不冲刺、紧贴车、只清贴近车(13m)的敌兵、激进医疗、阵亡后重新接近车。
  await shotStart('M16-escort-wagon','守在运输车旁清敌，护送运输车抵达撤离点');
  const wStart=(await ob()).wagonZ;
  const escortLog=[];
  for(let i=0;i<70;i++){
   s2=await ob();if(s2.over||s2.phase>2)break;
   if(s2.dead){await sleep(3800);
    // 阵亡后重启可能退回检查点，重新接近运输车继续护送
    const wp0=await p.evaluate(()=>{try{const w=__gameQA.resistanceCampaign.state.map.objectives.wagon.position;return{x:w.x,z:w.z};}catch(e){return null;}});
    if(wp0)await walkTo({x:wp0.x,z:wp0.z+5},'ch1-p2-rejoin',{fight:false,timeoutMs:20000});
    await mark('ch1-p2-respawn-rejoin',{wagonZ:(await ob()).wagonZ,phase:(await ob()).phase});
    continue;}
   // 血少激进医疗
   if(s2.hp<95&&s2.medkits>0){await tap('KeyH',300);}
   const wp=await p.evaluate(()=>{const w=__gameQA.resistanceCampaign.state.map.objectives.wagon.position;return{x:w.x,z:w.z};});
   const distW=Math.hypot(s2.x-wp.x,s2.z-wp.z);
   // 找离运输车最近的敌兵（车前进的真正障碍）
   const nearWagon=await p.evaluate(()=>{const st=__gameQA.resistanceCampaign.state,w=st.map.objectives.wagon.position;
    let b=null,bd=1e9,cnt=0;for(const u of st.units){if(u.dead||u.team!=='enemy')continue;const d=Math.hypot(u.root.position.x-w.x,u.root.position.z-w.z);if(d<13)cnt++;if(d<bd){bd=d;b={x:u.root.position.x,z:u.root.position.z,d};}}return{nearest:b,count13:cnt};});
   if(nearWagon.count13>0&&nearWagon.nearest){
    // 车身边有敌兵 → 走近挥刀清掉（不冲刺，避免冲进敌群 overshoot）
    const t=nearWagon.nearest;
    await faceTo(t.x,t.z,0.2,1000);
    if(t.d<7){await keys(['KeyJ']);await sleep(400);await keys([]);}
    else{await keys(['KeyW']);await sleep(360);await keys([]);}
   }else if(distW>26){
    // 车在前进且身边无敌，玩家跟上（须保持 43m 内，用 26m 阈值留余量）
    await faceTo(wp.x,wp.z,0.24,900);
    await keys(['KeyW']);await sleep(420);await keys([]);
   }else if(s2.nearestEnemy&&s2.nearestEnemy.d<16){
    // 车安全但近身有散兵，清掉；较远的散兵不追，避免被拉离运输车
    await faceTo(s2.nearestEnemy.x,s2.nearestEnemy.z,0.2,900);
    await keys(['KeyJ']);await sleep(420);await keys([]);
   }else{
    // 无威胁：贴着车等它前进
    if(distW>10){await faceTo(wp.x,wp.z,0.3,700);await keys(['KeyW']);await sleep(300);await keys([]);}
    else await sleep(700);
   }
   const sC=await ob();escortLog.push({t:sC.elapsed,wagonZ:sC.wagonZ,wagonHp:sC.wagonHp,hp:sC.hp,enemies:sC.enemies,near13:nearWagon.count13,distW:Math.round(distW),phase:sC.phase});
   if(i%4===0)console.log('  escort wagonZ='+Math.round(sC.wagonZ)+' hp='+sC.wagonHp+' php='+sC.hp+' near13='+nearWagon.count13+' distW='+Math.round(distW)+' phase='+sC.phase);
  }
  await keys([]);
  s2=await ob();await mark('ch1-p2-escort-end',{wagonZ0:wStart,wagonZEnd:s2.wagonZ,wagonHp:s2.wagonHp,over:s2.over,phase:s2.phase,log:escortLog.slice(-8)});
  await clearPhase('ch1-p2',{maxMs:70000});
  s2=await ob();
  await mark('ch1-complete',{over:s2.over,finished:s2.finished,kills:s2.kills,elapsed:s2.elapsed});
  await sleep(4200);
  await mark('ch1-result',{resultText:await p.evaluate(()=>document.getElementById('warResultText')?.textContent||null)});
  await shotEnd('M16-escort-wagon');
  } // ============ 第2章结束 ============

  // ============ 第3章 平安县城 · 开炮 ============
  if(wantCh(2)){
  await shotStart('M18-ch2-outpost','进入第3章，攻下城外机枪阵地');
  await enterChapter(2);
  await mark('ch2-start',{chapter:(await ob()).chapter,dialogue:(await ob()).dialogue});
  await sleep(2600);
  await walkTo({x:0,z:34},'ch2-p0-approach',{fight:true});
  await engage(3200);
  await mark('ch2-p0-outpost-contact',{progress:(await ob()).progress});
  await shotEnd('M18-ch2-outpost');

  // M19 拆街道堡垒（用稳健函数：补给→清步兵→投弹即横移→检测阵亡重置）
  // 第3章 P0 唯一可用补给点是军需箱 (-6,-12)（弹药箱 label 被 supply 分支排除）。
  await shotStart('M19-street-bunker','摧毁街道机枪堡垒(-12,52) 后推进到运弹阶段');
  await grenadeBunker('street-bunker',-12,52,{x:-6,z:-12},'ch2-street');
  await clearPhase('ch2-p0',{maxMs:60000,targetPhase:1});
  s2=await ob();await mark('ch2-p0-advance',{phase:s2.phase,destructibles:s2.destructibles,dialogue:s2.dialogue});
  await shotEnd('M19-street-bunker');

  // M20 搬炮弹
  await shotStart('M20-carry-shell','走到炮弹木箱按 I 搬起，拍角色背箱与移动变慢');
  s2=await ob();
  if(s2.phase<1){await p.evaluate(()=>__gameQA.resistanceCampaign.start(2,1));await sleep(1800);phaseIsolation.push({chapter:2,phase:1,reason:'P0 未在限时内推进，改用阶段直达隔离验证运弹，正式成片如需连续会补拍'});}
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  await walkTo({x:-12,z:57.5},'ch2-p1-to-ammo',{fight:true,timeoutMs:60000});
  s2=await ob();await mark('ch2-p1-hint-ammo',{hint:s2.hint});
  await tap('KeyI',500);await sleep(1300);
  s2=await ob();await mark('ch2-p1-carrying',{carrying:s2.carrying,hint:s2.hint,dialogue:s2.dialogue});
  await sleep(1800);
  await shotEnd('M20-carry-shell');

  // M21 送弹上炮
  await shotStart('M21-deliver-shell','把炮弹送到攻城炮位，按 I 交付');
  const cp=(await ob()).cannonPos;
  await walkTo({x:cp.x,z:cp.z-3.4},'ch2-p1-to-cannon',{fight:false,timeoutMs:60000});
  s2=await ob();await mark('ch2-p1-hint-deliver',{hint:s2.hint});
  await tap('KeyI',500);await sleep(1500);
  s2=await ob();await mark('ch2-p1-delivered',{phase:s2.phase,loaded:s2.loaded,carrying:s2.carrying,dialogue:s2.dialogue});
  await shotEnd('M21-deliver-shell');

  // M22 + M23 + M24 操炮 / 瞄准城门 / 开炮（核心名场面）
  await shotStart('M23-cannon-aim','接管攻城炮，Q/E 转向 + W/S 调仰角，落点环对准城门');
  s2=await ob();
  if(s2.phase<2){await p.evaluate(()=>__gameQA.resistanceCampaign.start(2,2));await sleep(1800);phaseIsolation.push({chapter:2,phase:2,reason:'交付炮弹后未自动进入 P2，改用阶段直达隔离验证操炮'});}
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  const cp2=(await ob()).cannonPos;
  await walkTo({x:cp2.x,z:cp2.z-4.2},'ch2-p2-to-cannon',{fight:false,timeoutMs:45000});
  s2=await ob();await mark('ch2-p2-hint-cannon',{hint:s2.hint});
  await tap('KeyI',500);await sleep(1600);
  s2=await ob();await mark('ch2-p2-at-cannon',{cannon:s2.cannon,loaded:s2.loaded,dialogue:s2.dialogue,progress:s2.progress});
  await shotEnd('M23-cannon-aim');

  await shotStart('M24-cannon-fire','对准城门连开三炮，拍落点环变红、城门耐久下降与城门坍塌');
  const fireLog=[];
  for(let sh=0;sh<6;sh++){
   s2=await ob();if(!s2.cannon||s2.phase>=3||s2.over)break;
   if(s2.loaded<=0){
    await shotStart('M24b-resupply','炮弹打空，离炮回弹药箱补弹（真实补给路径）');
    await tap('KeyI',500);await sleep(900);
    const am=await p.evaluate(()=>{const a=__gameQA.resistanceCampaign.state.map.objectives.ammo;return{x:a.x,z:a.z};});
    await walkTo({x:am.x,z:am.z-2.4},'ch2-p2-resupply-ammo',{fight:false,timeoutMs:45000});
    await tap('KeyI',500);await sleep(1000);
    await mark('resupply-pickup',{carrying:(await ob()).carrying});
    const cp3=(await ob()).cannonPos;
    await walkTo({x:cp3.x,z:cp3.z-3.4},'ch2-p2-resupply-deliver',{fight:false,timeoutMs:45000});
    await tap('KeyI',500);await sleep(1000);
    await mark('resupply-deliver',{loaded:(await ob()).loaded});
    await tap('KeyI',500);await sleep(1400);
    s2=await ob();await mark('resupply-back-at-cannon',{cannon:s2.cannon,loaded:s2.loaded});
    await shotEnd('M24b-resupply');
    if(!s2.cannon)break;
   }
   await faceTo(0,87,0.05,3200);
   let pred=await p.evaluate(()=>{const r=__gameQA.resistanceCampaign,pr=r.predictShell();return{dist:Math.round(pr.distance*10)/10,onGate:pr.target?.key==='city-gate',x:Math.round(pr.pos.x*10)/10,y:Math.round(pr.pos.y*10)/10,z:Math.round(pr.pos.z*10)/10};});
   // 用 W/S 真实调仰角把落点推到城门（炮在 z≈64，城门 z=87，差 23 米）
   for(let adj=0;adj<8&&!pred.onGate;adj++){
    const dir=pred.z<87?'KeyW':'KeyS';
    await tapHold(dir,230);
    pred=await p.evaluate(()=>{const r=__gameQA.resistanceCampaign,pr=r.predictShell();return{dist:Math.round(pr.distance*10)/10,onGate:pr.target?.key==='city-gate',x:Math.round(pr.pos.x*10)/10,y:Math.round(pr.pos.y*10)/10,z:Math.round(pr.pos.z*10)/10};});
    console.log('   pitch adjust',adj,JSON.stringify(pred));
   }
   s2=await ob();
   await mark('cannon-aim-'+sh,{pred,readout:s2.cannonReadout,loaded:s2.loaded,progress:s2.progress});
   await keys(['KeyJ']);await sleep(540);await keys([]);
   await sleep(2400);
   const sD=await ob();const gate=(sD.destructibles||[]).find(d=>d.key==='city-gate');
   fireLog.push({shot:sh,pred,readout:s2.cannonReadout,loadedAfter:sD.loaded,gateHp:gate?gate.hp:null,gateDead:gate?gate.dead:null,phase:sD.phase,gateShots:sD.gateShots,dialogue:sD.dialogue});
   await mark('cannon-fired-'+sh,{gateHp:gate?gate.hp:null,loadedAfter:sD.loaded,progress:sD.progress,dialogue:sD.dialogue});
   console.log('  CANNON SHOT',JSON.stringify(fireLog[fireLog.length-1]));
   if(sD.phase>=3)break;
  }
  s2=await ob();
  const gateF=(s2.destructibles||[]).find(d=>d.key==='city-gate');
  await mark('ch2-p2-gate-result',{gate:gateF,phase:s2.phase,dialogue:s2.dialogue,fireLog});
  await sleep(3000);
  await shotEnd('M24-cannon-fire');

  // M25 拉炮（补充镜头）
  if(s2.cannon||s2.phase<3){
   await shotStart('M25-tow-cannon','K 拉炮慢速移动炮位，I 放下');
   await tap('KeyI',700);await sleep(900);
   let st=await ob();
   if(!st.towing&&st.phase<3){await tap('KeyK',700);await sleep(1000);st=await ob();}
   await mark('tow-start',{towing:st.towing,hint:st.hint});
   if(st.towing){
    await faceTo(0,87,0.2,1600);
    await keys(['KeyW']);await sleep(1800);await keys([]);
    const stB=await ob();await mark('tow-moved',{cannonPos:stB.cannonPos});
    await tap('KeyI',700);await sleep(1200);
    const stC=await ob();await mark('tow-dropped',{towing:stC.towing,dialogue:stC.dialogue});
   }
   await shotEnd('M25-tow-cannon');
  }

  // M26 巷战夺队部 + M27 结算
  await shotStart('M26-town-assault','穿过破开的城门突入县城，巷战夺取守备队部');
  s2=await ob();
  if(s2.phase<3){await p.evaluate(()=>__gameQA.resistanceCampaign.start(2,3));await sleep(1800);phaseIsolation.push({chapter:2,phase:3,reason:'城门未在限时内被轰开，改用阶段直达隔离验证巷战'});}
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  await mark('ch2-p3-start',{phase:(await ob()).phase,dialogue:(await ob()).dialogue});
  await walkTo({x:0,z:120},'ch2-p3-into-town',{fight:true});
  await engage(3200);
  await walkTo({x:0,z:137},'ch2-p3-to-hq',{fight:true});
  await clearPhase('ch2-p3',{maxMs:90000});
  s2=await ob();await mark('ch2-complete',{over:s2.over,finished:s2.finished,kills:s2.kills,elapsed:s2.elapsed});
  await sleep(4600);
  await mark('ch2-result',{resultText:await p.evaluate(()=>document.getElementById('warResultText')?.textContent||null)});
  await shotEnd('M26-town-assault');
  } // ============ 第3章结束 ============

  // M30 收尾余镜（章节选择界面，承接总结解说）——放在章块外，分章/连续录制都作为全片结尾
  await shotStart('M30-outro','战役结算后回到章节选择，作为收尾余镜');
  // 若正处于结算界面，用「章节选择」退回；否则直接确保在战役章节选择界面
  await p.click('#warSelect').catch(()=>{});await sleep(2600);
  const outroMenu=await p.evaluate(()=>!document.getElementById('warMenu').classList.contains('hidden'));
  if(!outroMenu){await p.click('#warResultBack').catch(()=>{});await sleep(1200);await p.click('#btnResistance').catch(()=>{});await sleep(2000);}
  await mark('outro-chapter-select');
  await sleep(5000);
  await shotEnd('M30-outro');

  // ---- 停止采集 ----
  await cdp.send('Page.stopScreencast');recording=false;
  let audioBytes=null,audioStartWall=0;
  if(audioStarted){
   const audio=await p.evaluate(async()=>{await new Promise(r=>{__movieRec.onstop=r;__movieRec.stop();});return{start:__movieAudioStart,bytes:Array.from(new Uint8Array(await new Blob(__movieChunks).arrayBuffer()))};});
   audioBytes=Buffer.from(audio.bytes);audioStartWall=audio.start;
   fs.writeFileSync(path.join(OUT,'game-audio.webm'),audioBytes);
  }else{
   events.push({name:'audio-never-ready',t:T(),note:'游戏音频钩子未就绪，本次无游戏音轨；编码将用静音占位'});
   console.log('  警告：音轨未就绪，本次录制无游戏声音');
  }

  const final=await ob();
  // audioStartTs 是音轨起点对应的帧 CDP 时间戳，编码时据此把音频对齐到视频时间轴
  const data={take:TAKE,chapter:CH,started,audioStart:audioStartWall,audioStartTs,audioStarted,duration:T(),frames,events,shots:shots.map(s=>({index:s.index,name:s.name,note:s.note,startWall:s.startWall,endWall:s.endWall,startGame:s.startGame,endGame:s.endGame,startFrame:s.startFrame,endFrame:s.endFrame,frames:s.frames,seconds:s.seconds})),
   phase_isolation:phaseIsolation,finalState:final,errors,
   gameplay_modified:false,time_scale:1,normal_rule_inputs_only:phaseIsolation.length===0,
   no_invulnerable:true,no_enemy_clearing:true,no_teleport:true,no_hp_edit:true,
   build:'web-zerg-corpse-spinfix-v0.33.3',campaign:'抗战战役 · 亮剑名场面',development_model:'Codex'};
  fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(data,null,2));
  fs.writeFileSync(path.join(OUT,'states.json'),JSON.stringify(states,null,2));
  console.log('CAPTURE COMPLETE duration='+data.duration.toFixed(1)+'s frames='+frames.length+' shots='+data.shots.length+' events='+events.length+' isolation='+phaseIsolation.length);
  if(errors.length)console.log('pageerrors:',errors.slice(0,8).join(' | '));
 }catch(e){
  fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:e.stack,events,shots:shots.map(s=>({name:s.name,startWall:s.startWall,endWall:s.endWall})),frames:frames.length,errors,phaseIsolation},null,2));
  console.error('CAPTURE FAILED',e.message);throw e;
 }finally{
  await keys([]).catch(()=>{});recording=false;
  await p.evaluate(()=>{try{__gameQA.resistanceCampaign.stop(true);}catch(_){}}).catch(()=>{});
  await context.close();await browser.close();server.close();
 }
})().catch(()=>{server.close();process.exitCode=1;});

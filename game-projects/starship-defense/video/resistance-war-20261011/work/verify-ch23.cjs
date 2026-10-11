// 专项验证：第2章骑兵连（上马/冲刺/军刀/护送运输车）+ 第3章攻城炮（搬弹/操炮/破门）
// 这两章机制最复杂且此前从未验证，是本期视频的核心名场面。
// 纪律：只发正常键盘输入、只读状态。不用无敌、不清敌、不改血量、不瞬移。
// 阶段直达仅用于隔离验证后续阶段机制，会逐条记录，正式成片走连续正常通关。
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=__dirname,WEB=path.resolve(ROOT,'../../../../../public'),OUT=path.join(ROOT,'verify-ch23');
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(WEB,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(WEB+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',MIME[path.extname(file).toLowerCase()]||'application/octet-stream');res.end(data);});
}).listen(0,'127.0.0.1');
const results=[],isolation=[];
const rec=(n,ok,d)=>{results.push({name:n,ok,detail:d});console.log((ok?'PASS  ':'FAIL  ')+n+'  '+JSON.stringify(d).slice(0,420));};

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const held=new Set();
 async function keys(w){for(const k of [...held])if(!w.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of w)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
 async function tap(k,ms=90){await p.keyboard.press(k);await sleep(ms);}
 async function tapHold(k,ms){await p.keyboard.down(k);await sleep(ms);await p.keyboard.up(k);}

 async function ob(){return p.evaluate(()=>{
  const q=__gameQA,r=q.resistanceCampaign,s=r.state,o=r.objective(),P=s.player.root.position;
  return {active:s.active,over:s.over,finished:!!s.finished,chapter:s.chapter,phase:s.phase,testMode:q.Game.testMode,
   x:P.x,z:P.z,hp:Math.ceil(s.player.hp),maxHp:s.player.maxHp,dead:s.player.dead,mounted:!!s.player.mounted,
   yaw:(()=>{try{return q.getCamYaw()}catch(e){return null}})(),kills:s.kills,hold:Math.round(s.hold*10)/10,
   elapsed:Math.round(s.elapsed*10)/10,distObj:Math.round(Math.hypot(P.x-o.x,P.z-o.z)*10)/10,
   enemies:s.units.filter(u=>u.team==='enemy'&&!u.dead).length,
   enemyCavalry:s.units.filter(u=>u.team==='enemy'&&!u.dead&&u.mounted).length,
   chargeT:s.chargeT,chargeCd:s.chargeCd,saberT:s.saberT||0,
   cannon:!!s.cannon,towing:!!s.towing,carrying:!!s.carrying,loaded:s.loaded,gateShots:s.gateShots,
   wagonHp:Math.ceil(s.wagonHp),grenades:s.grenades,medkits:s.medkits,ammo:s.ammo[s.weapon],weapon:s.weapon,
   wagon:(()=>{try{const w=s.map.objectives.wagon.position;return{x:Math.round(w.x*10)/10,z:Math.round(w.z*10)/10}}catch(e){return null}})(),
   cannonPos:(()=>{try{const c=s.map.objectives.cannon;const q=c.position;return{x:Math.round(q.x*10)/10,z:Math.round(q.z*10)/10,yaw:Math.round(c.rotation.y*100)/100}}catch(e){return null}})(),
   destructibles:s.map?s.map.destructibles.map(d=>({key:d.key,dead:!!d.dead,hp:Math.ceil(d.hp)})):null,
   nearestEnemy:(()=>{let b=null,bd=1e9;for(const u of s.units){if(u.dead||u.team!=='enemy')continue;const d=Math.hypot(u.root.position.x-P.x,u.root.position.z-P.z);if(d<bd){bd=d;b={d:Math.round(d*10)/10,x:Math.round(u.root.position.x*10)/10,z:Math.round(u.root.position.z*10)/10,mounted:!!u.mounted,hp:Math.ceil(u.hp)};}}return b;})(),
   enemyNearWagon:(()=>{try{const w=s.map.objectives.wagon.position;let n=0,min=1e9;for(const u of s.units){if(u.dead||u.team!=='enemy')continue;const d=Math.hypot(u.root.position.x-w.x,u.root.position.z-w.z);if(d<13)n++;if(d<min)min=d;}return{count:n,min:min<1e9?Math.round(min*10)/10:null}}catch(e){return null}})(),
   hint:(()=>{try{return document.getElementById('warHint').textContent}catch(e){return null}})(),
   progress:(()=>{try{return document.getElementById('warProgress').textContent}catch(e){return null}})(),
   cannonReadout:(()=>{try{return document.getElementById('warCannonReadout').textContent}catch(e){return null}})(),
   dialogue:(()=>{const e=document.getElementById('warDialogue');return e&&!e.classList.contains('hidden')?e.textContent:null})()};
 });}

 let turnDir=null;
 async function calibrate(){if(turnDir!==null)return turnDir;
  await keys([]);const y0=(await ob()).yaw;
  await p.keyboard.down('KeyE');await sleep(150);await p.keyboard.up('KeyE');await sleep(260);
  const y1=(await ob()).yaw;const d=Math.atan2(Math.sin(y1-y0),Math.cos(y1-y0));
  turnDir=d>=0?1:-1;console.log('TURN CALIBRATED: KeyE =>',d>=0?'yaw 增大':'yaw 减小');return turnDir;}
 async function faceTo(tx,tz,tol=0.13,maxMs=3400){
  await calibrate();const t0=Date.now();
  while(Date.now()-t0<maxMs){const s=await ob();const cur=s.yaw;
   if(cur===null||!Number.isFinite(cur))return false;
   const want=Math.atan2(tx-s.x,tz-s.z);
   const d=Math.atan2(Math.sin(want-cur),Math.cos(want-cur));
   if(Math.abs(d)<tol)return true;
   const key=(Math.sign(d)===turnDir)?'KeyE':'KeyQ';
   await keys([]);await p.keyboard.down(key);await sleep(Math.max(28,Math.min(190,Math.round(Math.abs(d)*85))));await p.keyboard.up(key);await sleep(70);}
  return false;}
 async function route(goal){return p.evaluate(({goal})=>{
  const r=__gameQA.resistanceCampaign,s=r.state,b=s.map.bounds,step=1;
  const P=s.player.root.position,radius=s.player.mounted?.9:.5;
  const x0=b.minX+2,z0=b.minZ+2,W=Math.floor((b.maxX-2-x0)/step),H=Math.floor((b.maxZ-2-z0)/step);
  const ix=x=>Math.max(0,Math.min(W-1,Math.round((x-x0)/step))),iz=z=>Math.max(0,Math.min(H-1,Math.round((z-z0)/step)));
  const X=i=>x0+i*step,Z=j=>z0+j*step;
  const free=(x,z)=>{if(x<b.minX+2||x>b.maxX-2||z<b.minZ+2||z>b.maxZ-2)return false;return !r.collision(x,z,radius);};
  let ei=ix(goal.x),ej=iz(goal.z);
  if(!free(X(ei),Z(ej))){let spot=null;for(let rad=1;rad<14&&!spot;rad++)for(let di=-rad;di<=rad&&!spot;di++)for(let dj=-rad;dj<=rad&&!spot;dj++){if(Math.max(Math.abs(di),Math.abs(dj))!==rad)continue;const ii=ei+di,jj=ej+dj;if(ii<0||jj<0||ii>=W||jj>=H)continue;if(free(X(ii),Z(jj))&&Math.hypot(X(ii)-goal.x,Z(jj)-goal.z)<6.2)spot=[ii,jj];}if(!spot)return null;ei=spot[0];ej=spot[1];}
  const si=ix(P.x),sj=iz(P.z),start=sj*W+si,end=ej*W+ei;
  if(start===end)return[{x:goal.x,z:goal.z}];
  const dist=new Float64Array(W*H).fill(Infinity),par=new Int32Array(W*H).fill(-1),closed=new Uint8Array(W*H);
  const open=[start];dist[start]=0;
  const h=k=>Math.abs(k%W-end%W)+Math.abs(Math.floor(k/W)-Math.floor(end/W));
  let found=false,guard=0;
  while(open.length&&guard++<200000){open.sort((a,b2)=>(dist[b2]+h(b2))-(dist[a]+h(a)));const k=open.pop();
   if(closed[k])continue;closed[k]=1;if(k===end){found=true;break;}
   const x=k%W,z=Math.floor(k/W);
   for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
    const xx=x+dx,zz=z+dz;if(xx<0||xx>=W||zz<0||zz>=H)continue;const j=zz*W+xx;if(closed[j])continue;
    if(!free(X(xx),Z(zz)))continue;
    if(dist[k]+1<dist[j]){dist[j]=dist[k]+1;par[j]=k;open.push(j);}}}
  if(!found)return null;
  const a=[];for(let k=end;k!==start&&k>=0;k=par[k])a.push({x:X(k%W),z:Z(Math.floor(k/W))});
  a.reverse();a.push({x:goal.x,z:goal.z});
  const losFree=(A,B)=>{const d=Math.hypot(B.x-A.x,B.z-A.z),n=Math.max(2,Math.round(d/.25));for(let i=0;i<=n;i++){const t=i/n;if(!free(A.x+(B.x-A.x)*t,A.z+(B.z-A.z)*t))return false;}return true;};
  const slim=[a[0]];let i=0;
  while(i<a.length-1){let j=a.length-1;while(j>i+1&&!losFree(a[i],a[j]))j--;slim.push(a[j]);i=j;}
  return slim;},{goal});}
 async function walkTo(goal,label,{fight=true,timeoutMs=70000,arrive=2.4}={}){
  await keys([]);let wps=await route(goal);
  if(!wps){console.log('  ROUTE FAILED',label);return false;}
  let idx=0,lastMove=Date.now(),last=null,stuckN=0,side=1;const t0=Date.now();
  while(Date.now()-t0<timeoutMs){
   const s=await ob();
   if(s.over){await keys([]);return false;}
   if(s.dead){await keys([]);await sleep(3800);wps=await route(goal);idx=0;lastMove=Date.now();stuckN=0;continue;}
   const P={x:s.x,z:s.z};
   if(Math.hypot(goal.x-P.x,goal.z-P.z)<arrive){await keys([]);console.log('  arrive',label,(Date.now()-t0)+'ms');return true;}
   if(fight&&s.nearestEnemy&&s.nearestEnemy.d<26){
    await faceTo(s.nearestEnemy.x,s.nearestEnemy.z,0.2,1100);
    await keys(['KeyJ']);await sleep(420);await keys([]);
    const sA=await ob();if(sA.hp<70&&sA.medkits>0)await tap('KeyH',260);
    lastMove=Date.now();stuckN=0;continue;}
   let tgt=wps[idx];
   if(Math.hypot(tgt.x-P.x,tgt.z-P.z)<2.2&&idx<wps.length-1)tgt=wps[++idx];
   await faceTo(tgt.x,tgt.z,0.22,1400);
   const s3=await ob();
   await keys(['KeyW']);await sleep(290);
   if(s3.hp<70&&s3.medkits>0){await keys([]);await tap('KeyH',260);lastMove=Date.now();}
   const s4=await ob();
   if(last&&Math.hypot(last.x-s4.x,last.z-s4.z)<0.32){
    stuckN++;await keys(['KeyS']);await sleep(300);await keys([]);
    await keys([side>0?'KeyD':'KeyA']);await sleep(340);await keys([]);
    if(stuckN%2===0)side=-side;
    if(stuckN%3===0||Date.now()-lastMove>4200){wps=await route(goal);idx=0;lastMove=Date.now();console.log('  replan',label,'stuck',stuckN);}
   }else{lastMove=Date.now();stuckN=0;}
   last={x:s4.x,z:s4.z};await keys([]);
  }
  await keys([]);const sf=await ob();console.log('  WALK TIMEOUT',label,'pos',Math.round(sf.x*10)/10,Math.round(sf.z*10)/10);return false;}

 try{
  await p.goto('http://127.0.0.1:'+server.address().port+'/html/game/starship-defense/index.html?qa=1');
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA&&window.__gameQA.resistanceCampaign,{timeout:60000});
  await p.evaluate(()=>{const c=__gameQA.CombatControls;c.set('input','keyboard');c.set('aim','auto');c.set('fire','hold');});

  // ================= 第2章 骑兵连 =================
  await p.evaluate(()=>{const q=__gameQA;q.resistanceCampaign.start(1,0);q.CombatControls.set('fire','hold');});
  await sleep(1800);
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  isolation.push({chapter:1,phase:0,reason:'专项验证从本章开头 start(1,0) 进入，属正常开局'});
  let s=await ob();
  rec('ch1-enter',s.active&&s.chapter===1&&!s.testMode,{chapter:s.chapter,phase:s.phase,mounted:s.mounted,hp:s.hp,allies:s.enemies});
  await p.screenshot({path:path.join(OUT,'ch1-start.png')});

  // P0 上马：走到马匹按 I
  const horse=await p.evaluate(()=>{const m=__gameQA.resistanceCampaign.state.mountMesh.position;return{x:m.x,z:m.z};});
  rec('ch1-horse-found',!!horse,{horse:{x:Math.round(horse.x*10)/10,z:Math.round(horse.z*10)/10}});
  await walkTo({x:horse.x,z:horse.z+2.4},'ch1-to-horse',{fight:false,timeoutMs:40000,arrive:3.2});
  s=await ob();rec('ch1-p0-hint',(s.hint||'').includes('上马'),{hint:s.hint,distToHorse:Math.round(Math.hypot(s.x-horse.x,s.z-horse.z)*10)/10});
  await tap('KeyI',400);await sleep(1200);
  s=await ob();rec('ch1-p0-mounted',s.mounted&&s.phase>=1,{mounted:s.mounted,phase:s.phase,dialogue:s.dialogue,hint:s.hint});
  await p.screenshot({path:path.join(OUT,'ch1-mounted.png')});

  // P1 冲破封锁线：需 z>80 且本阶段击杀≥6
  const killsAtP1=s.kills;
  s=await ob();rec('ch1-p1-start',s.phase===1,{phase:s.phase,enemies:s.enemies,cavalry:s.enemyCavalry,z:Math.round(s.z),killsBaseline:killsAtP1});
  const chargeLog=[];
  for(let i=0;i<34;i++){
   s=await ob();if(s.phase>=2||s.over)break;
   if(s.dead){await sleep(3800);continue;}
   const e=s.nearestEnemy;
   // 朝封锁线方向推进，途中朝最近敌兵转向
   const targetZ=Math.min(88,e&&e.d<35?e.z:88);
   const targetX=e&&e.d<35?e.x:0;
   await faceTo(targetX,targetZ,0.22,900);
   const cd=await p.evaluate(()=>__gameQA.resistanceCampaign.state.chargeCd);
   if(cd<=0){await tap('KeyK',140);}
   await keys(['KeyW']);await sleep(480);
   const s2=await ob();
   if(e&&e.d<6){await keys(['KeyJ']);await sleep(360);}
   await keys([]);
   const s3=await ob();
   chargeLog.push({t:s3.elapsed,z:Math.round(s3.z*10)/10,kills:s3.kills,phase:s3.phase,hp:s3.hp,charge:s3.chargeT>0,saber:s3.saberT>0});
   if(s3.hp<70&&s3.medkits>0)await tap('KeyH',260);
   if(i%4===0)console.log('  charge z='+Math.round(s3.z)+' kills='+s3.kills+' hp='+s3.hp+' phase='+s3.phase);
  }
  await keys([]);
  s=await ob();
  rec('ch1-p1-breakthrough',s.phase>=2,{phase:s.phase,z:Math.round(s.z*10)/10,killsThisPhase:s.kills-killsAtP1,killsTotal:s.kills,hp:s.hp,dialogue:s.dialogue,tail:chargeLog.slice(-8)});
  await p.screenshot({path:path.join(OUT,'ch1-breakthrough.png')});

  // P2 护送运输车：wagon.z 76 → 146，玩家在 43m 内且 wagon 9m 内无敌才前进
  if(s.phase>=2){
   s=await ob();const w0=s.wagon.z;
   rec('ch1-p2-start',true,{wagon:w0,wagonHp:s.wagonHp,enemies:s.enemies,dialogue:s.dialogue,progress:s.progress});
   const escortLog=[];
   for(let i=0;i<52;i++){
    s=await ob();if(s.over||s.phase>2)break;
    if(s.dead){await sleep(3800);continue;}
    const w=s.wagon;
    const distToWagon=Math.hypot(s.x-w.x,s.z-w.z);
    // 优先清掉运输车 9m 内的敌兵（否则车不前进）
    const near=s.enemyNearWagon;
    if(near&&near.count>0){
     const e=s.nearestEnemy;
     // 找运输车附近的敌兵
     const target=await p.evaluate(()=>{const st=__gameQA.resistanceCampaign.state,w=st.map.objectives.wagon.position;
      let b=null,bd=1e9;for(const u of st.units){if(u.dead||u.team!=='enemy')continue;const d=Math.hypot(u.root.position.x-w.x,u.root.position.z-w.z);if(d<bd){bd=d;b={x:u.root.position.x,z:u.root.position.z,d};}}return b;});
     if(target&&target.d<20){
      await faceTo(target.x,target.z,0.18,1000);
      // 骑马时用军刀（J），距离远时也可以下马射击；这里直接冲锋撞+挥刀
      const cd2=await p.evaluate(()=>__gameQA.resistanceCampaign.state.chargeCd);
      if(cd2<=0)await tap('KeyK',120);
      if(target.d<6){await keys(['KeyJ']);await sleep(400);await keys([]);}
      else{await faceTo(target.x,target.z,0.22,700);await keys(['KeyW']);await sleep(340);await keys([]);}
     }else await sleep(600);
    }else if(distToWagon>34){
     // 车在前进，跟上车（须在 43m 内）
     await faceTo(w.x,w.z,0.24,900);
     await keys(['KeyW']);await sleep(420);await keys([]);
    }else if(s.nearestEnemy&&s.nearestEnemy.d<45){
     await faceTo(s.nearestEnemy.x,s.nearestEnemy.z,0.2,900);
     await keys(['KeyJ']);await sleep(420);await keys([]);
    }else{
     // 无敌人且在车旁，等车前进
     await sleep(700);
    }
    const sC=await ob();
    escortLog.push({t:sC.elapsed,wz:Math.round(sC.wagon.z*10)/10,whp:sC.wagonHp,hp:sC.hp,enemies:sC.enemies,nearWagon:sC.enemyNearWagon?.count,distW:Math.round(Math.hypot(sC.x-sC.wagon.x,sC.z-sC.wagon.z)*10)/10,phase:sC.phase});
    if(sC.hp<75&&sC.medkits>0)await tap('KeyH',260);
    if(i%4===0)console.log('  escort wagonZ='+Math.round(sC.wagon.z)+' hp='+sC.wagonHp+' near='+sC.enemyNearWagon?.count+' enemies='+sC.enemies);
   }
   await keys([]);
   s=await ob();
   rec('ch1-p2-escort-done',s.over||s.wagon.z>=146,{wagonZ0:w0,wagonZEnd:Math.round(s.wagon.z*10)/10,wagonHp:s.wagonHp,over:s.over,phase:s.phase,tail:escortLog.slice(-10)});
   rec('ch1-complete',s.over&&s.finished,{over:s.over,finished:s.finished,kills:s.kills,elapsed:s.elapsed,hp:s.hp});
   await p.screenshot({path:path.join(OUT,'ch1-result.png')});
  }else{
   rec('ch1-p2-skipped',false,{reason:'未突破封锁线，无法进入护送阶段',phase:s.phase});
  }

  // ================= 第3章 平安县城 · 攻城炮 =================
  await p.evaluate(()=>{const q=__gameQA;q.resistanceCampaign.start(2,2);q.CombatControls.set('fire','hold');});
  await sleep(1800);
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  isolation.push({chapter:2,phase:2,reason:'专项验证操炮机制，从 P2 隔离进入（loaded=3）；正式成片走 P0→P1→P2 连续正常通关'});
  s=await ob();
  rec('ch2-p2-enter',s.active&&s.chapter===2&&s.phase===2,{chapter:s.chapter,phase:s.phase,loaded:s.loaded,cannonPos:s.cannonPos,destructibles:s.destructibles});
  await p.screenshot({path:path.join(OUT,'ch2-p2-start.png')});

  // 走到炮位按 I 操炮
  const cp=s.cannonPos;
  await walkTo({x:cp.x,z:cp.z-4.4},'ch2-to-cannon',{fight:false,timeoutMs:40000,arrive:3.4});
  s=await ob();rec('ch2-p2-hint',(s.hint||'').includes('操炮'),{hint:s.hint,distToCannon:Math.round(Math.hypot(s.x-cp.x,s.z-cp.z)*10)/10});
  await tap('KeyI',400);await sleep(1400);
  s=await ob();rec('ch2-p2-at-cannon',s.cannon,{cannon:s.cannon,loaded:s.loaded,dialogue:s.dialogue,progress:s.progress,readout:s.cannonReadout});
  await p.screenshot({path:path.join(OUT,'ch2-at-cannon.png')});

  // 操炮瞄准城门 (0,87)：炮在 (0,64)，水平距离 23m
  if(s.cannon){
   const gate0=(s.destructibles||[]).find(d=>d.key==='city-gate');
   rec('ch2-gate-initial',!!gate0&&!gate0.dead,{gate:gate0,progress:s.progress});

   // 转向：操炮时 Q/E 仍走 updLook，A/D 走 cannon 分支 setLook。这里用 Q/E
   await faceTo(0,87,0.04,4000);
   let pred=await p.evaluate(()=>{const r=__gameQA.resistanceCampaign,pr=r.predictShell();
    return{dist:Math.round(pr.distance*10)/10,onGate:pr.target?.key==='city-gate',
     x:Math.round(pr.pos.x*10)/10,y:Math.round(pr.pos.y*10)/10,z:Math.round(pr.pos.z*10)/10,
     targetKey:pr.target?.key||null};});
   console.log('  初始落点',JSON.stringify(pred),'readout',s.cannonReadout);

   // 调仰角：cannon 分支 W(up,axis.y=-1) → pitch += 0.25dt 抬高；S → 降低
   const pitchLog=[];
   for(let adj=0;adj<14&&!pred.onGate;adj++){
    const before=pred.z;
    // 落点不到城门 → 抬高（W）；落点超过城门 → 压低（S）
    const key=before<87?'KeyW':'KeyS';
    await tapHold(key,200);await sleep(160);
    pred=await p.evaluate(()=>{const r=__gameQA.resistanceCampaign,pr=r.predictShell();
     return{dist:Math.round(pr.distance*10)/10,onGate:pr.target?.key==='city-gate',
      x:Math.round(pr.pos.x*10)/10,y:Math.round(pr.pos.y*10)/10,z:Math.round(pr.pos.z*10)/10,
      targetKey:pr.target?.key||null};});
    const pitch=await p.evaluate(()=>{try{return Math.round(__gameQA.camera.rotation.x*1000)/1000}catch(e){return null}});
    pitchLog.push({adj,key,predZ:before,newZ:pred.z,onGate:pred.onGate,targetKey:pred.targetKey,pitch});
    console.log(`  仰角调整${adj}: ${key} 落点z ${before}→${pred.z} onGate=${pred.onGate} target=${pred.targetKey}`);
    // 若目标键始终不是城门，尝试微调 yaw
    if(adj>3&&!pred.onGate&&Math.abs(pred.z-87)<3){
     await faceTo(0,87,0.02,2000);
     pred=await p.evaluate(()=>{const r=__gameQA.resistanceCampaign,pr=r.predictShell();
      return{dist:Math.round(pr.distance*10)/10,onGate:pr.target?.key==='city-gate',x:Math.round(pr.pos.x*10)/10,y:Math.round(pr.pos.y*10)/10,z:Math.round(pr.pos.z*10)/10,targetKey:pr.target?.key||null};});
     console.log('  yaw微调后',JSON.stringify(pred));
    }
   }
   const aim=(await ob());
   rec('ch2-cannon-aimed-on-gate',pred.onGate,{pred,readout:aim.cannonReadout,impactClass:await p.evaluate(()=>document.getElementById('warImpact')?.className||null),pitchLog:pitchLog.slice(-6)});
   await p.screenshot({path:path.join(OUT,'ch2-aimed.png')});

   // 开炮 3 发（J，冷却 2.8s）
   const fireLog=[];
   for(let sh=0;sh<5;sh++){
    const st=await ob();
    if(!st.cannon||st.phase>=3||st.over)break;
    if(st.loaded<=0){rec('ch2-needs-resupply',false,{loaded:st.loaded,note:'炮弹耗尽且本轮未验证补弹路径'});break;}
    // 每发前重新对准
    await faceTo(0,87,0.05,2500);
    const pr=await p.evaluate(()=>{const r=__gameQA.resistanceCampaign,p2=r.predictShell();return{onGate:p2.target?.key==='city-gate',z:Math.round(p2.pos.z*10)/10};});
    await keys(['KeyJ']);await sleep(560);await keys([]);
    await sleep(2500);
    const sD=await ob();const gate=(sD.destructibles||[]).find(d=>d.key==='city-gate');
    fireLog.push({shot:sh,aimOnGate:pr.onGate,loadedAfter:sD.loaded,gateHp:gate?gate.hp:null,gateDead:gate?gate.dead:null,phase:sD.phase,gateShots:sD.gateShots,dialogue:sD.dialogue,progress:sD.progress});
    console.log('  开炮'+(sh+1)+': '+JSON.stringify(fireLog[fireLog.length-1]));
    await p.screenshot({path:path.join(OUT,`ch2-fire-${sh}.png`)});
    if(sD.phase>=3)break;
   }
   s=await ob();const gateF=(s.destructibles||[]).find(d=>d.key==='city-gate');
   rec('ch2-gate-destroyed',!!gateF&&gateF.dead,{gate:gateF,phase:s.phase,dialogue:s.dialogue,fireLog});
   await p.screenshot({path:path.join(OUT,'ch2-gate-result.png')});

   // 若破门成功，继续验证 P3 巷战
   if(s.phase>=3){
    await walkTo({x:0,z:112},'ch2-p3-into-town',{fight:true,timeoutMs:60000});
    await sleep(800);
    const stA=await ob();rec('ch2-p3-entered-town',stA.phase===3,{phase:stA.phase,x:Math.round(stA.x),z:Math.round(stA.z),enemies:stA.enemies,dialogue:stA.dialogue});
    for(let i=0;i<16;i++){
     const sE=await ob();if(sE.over)break;
     if(sE.dead){await sleep(3800);continue;}
     if(sE.nearestEnemy&&sE.nearestEnemy.d<50){
      await faceTo(sE.nearestEnemy.x,sE.nearestEnemy.z,0.18,1200);
      await keys(['KeyJ']);await sleep(430);await keys([]);
      const sF=await ob();if(sF.hp<70&&sF.medkits>0)await tap('KeyH',260);
     }else{
      await walkTo({x:0,z:137},'ch2-p3-to-hq',{fight:true,timeoutMs:26000});
     }
     if(i%3===0){const sG=await ob();console.log('  巷战 phase='+sG.phase+' enemies='+sG.enemies+' hold='+sG.hold+' z='+Math.round(sG.z));}
    }
    await keys([]);
    s=await ob();
    rec('ch2-complete',s.over&&s.finished,{over:s.over,finished:s.finished,kills:s.kills,elapsed:s.elapsed,hp:s.hp});
    await p.screenshot({path:path.join(OUT,'ch2-result.png')});
   }
  }else{
   rec('ch2-cannon-skipped',false,{reason:'未能接管攻城炮',hint:s.hint});
  }

  fs.writeFileSync(path.join(OUT,'verify-ch23-report.json'),JSON.stringify({
   generated:new Date().toISOString(),normal_rule_inputs_only:isolation.length===0,
   phase_isolation:isolation,no_invulnerable:true,no_enemy_clearing:true,no_teleport:true,no_hp_edit:true,
   results,errors},null,2));
  const failed=results.filter(r=>!r.ok);
  console.log('\n==== 第2/3章专项验证 ==== 通过 '+results.filter(r=>r.ok).length+' / '+results.length);
  if(failed.length){console.log('未通过:');failed.forEach(f=>console.log(' - '+f.name+' :: '+JSON.stringify(f.detail).slice(0,300)));}
  if(errors.length)console.log('pageerrors:',errors.slice(0,6).join(' | '));
 }catch(e){
  fs.writeFileSync(path.join(OUT,'verify-ch23-failure.json'),JSON.stringify({error:e.stack,results,isolation,errors},null,2));
  console.error('CH23 VERIFY FAILED',e.message);throw e;
 }finally{
  await keys([]).catch(()=>{});
  await p.evaluate(()=>{try{__gameQA.resistanceCampaign.stop(true);}catch(_){}}).catch(()=>{});
  await context.close();await browser.close();server.close();
 }
})().catch(()=>{server.close();process.exitCode=1;});

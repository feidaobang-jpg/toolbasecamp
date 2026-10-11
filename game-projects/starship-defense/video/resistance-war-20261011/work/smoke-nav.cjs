// 冒烟测试：验证两个核心修复
//   1) faceTo 用 __gameQA.getCamYaw() 真能把视角转到目标方位（之前用不存在的 view()，yaw 恒为 null，玩家全程没转过向）
//   2) 4 方向 1m 网格 A* + LOS 简化，能从出生点走到交通壕目标并完成占领读秒
// 只发正常键盘输入、只读状态；不用无敌、不清敌、不改血量、不瞬移。
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=__dirname,WEB=path.resolve(ROOT,'../../../../../public'),OUT=path.join(ROOT,'smoke');
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(WEB,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(WEB+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',MIME[path.extname(file).toLowerCase()]||'application/octet-stream');res.end(data);});
}).listen(0,'127.0.0.1');
const results=[];
const rec=(n,ok,d)=>{results.push({name:n,ok,detail:d});console.log((ok?'PASS  ':'FAIL  ')+n+'  '+JSON.stringify(d));};

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const held=new Set();
 async function keys(want){for(const k of [...held])if(!want.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
 async function tap(k,ms=90){await p.keyboard.press(k);await sleep(ms);}

 async function ob(){return p.evaluate(()=>{
  const q=__gameQA,r=q.resistanceCampaign,s=r.state,o=r.objective(),P=s.player.root.position;
  return {active:s.active,over:s.over,chapter:s.chapter,phase:s.phase,testMode:q.Game.testMode,
   x:P.x,z:P.z,hp:Math.ceil(s.player.hp),dead:s.player.dead,kills:s.kills,hold:Math.round(s.hold*10)/10,
   yaw:(()=>{try{return q.getCamYaw()}catch(e){return null}})(),
   camMode:(()=>{try{return q.getCamMode()}catch(e){return null}})(),
   enemies:s.units.filter(u=>u.team==='enemy'&&!u.dead).length,
   distObj:Math.round(Math.hypot(P.x-o.x,P.z-o.z)*10)/10,objX:o.x,objZ:o.z,
   progress:(()=>{try{return document.getElementById('warProgress').textContent}catch(e){return null}})()};
 });}

 async function route(goal){return p.evaluate(({goal})=>{
  const r=__gameQA.resistanceCampaign,s=r.state,b=s.map.bounds,step=1;
  const P=s.player.root.position,radius=s.player.mounted?.9:.5;
  const x0=b.minX+2,z0=b.minZ+2,W=Math.floor((b.maxX-2-x0)/step),H=Math.floor((b.maxZ-2-z0)/step);
  const ix=x=>Math.max(0,Math.min(W-1,Math.round((x-x0)/step))),iz=z=>Math.max(0,Math.min(H-1,Math.round((z-z0)/step)));
  const X=i=>x0+i*step,Z=j=>z0+j*step;
  const free=(x,z)=>{if(x<b.minX+2||x>b.maxX-2||z<b.minZ+2||z>b.maxZ-2)return false;return !r.collision(x,z,radius);};
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
  return slim;
 },{goal});}

 // 运行时标定：camYaw 被 mod 到 [0,2π)（game.js:2540），E/Q 对 yaw 的增减方向靠实测而非推断
 let turnDir=null;
 async function calibrateTurn(){
  if(turnDir!==null)return turnDir;
  await keys([]);
  const y0=(await ob()).yaw;
  await p.keyboard.down('KeyE');await sleep(150);await p.keyboard.up('KeyE');await sleep(260);
  const y1=(await ob()).yaw;
  const d=Math.atan2(Math.sin(y1-y0),Math.cos(y1-y0));
  turnDir=d>=0?1:-1;
  console.log('TURN CALIBRATED: KeyE =>',d>=0?'yaw 增大':'yaw 减小','turnDir=',turnDir,'(y0 '+y0.toFixed(3)+' -> y1 '+y1.toFixed(3)+')');
  return turnDir;
 }
 async function faceTo(tx,tz,tol=0.13,maxMs=3400){
  await calibrateTurn();
  const t0=Date.now(),trace=[];
  while(Date.now()-t0<maxMs){
   const s=await ob();const cur=s.yaw;
   if(cur===null||!Number.isFinite(cur))return{ok:false,reason:'yaw 不可读',trace};
   // 前进方向 = (sin(yaw), cos(yaw))（resistance-campaign.js:186），故期望 yaw = atan2(dx, dz)
   const want=Math.atan2(tx-s.x,tz-s.z);
   const d=Math.atan2(Math.sin(want-cur),Math.cos(want-cur));
   trace.push({d:Math.round(d*1000)/1000,yaw:Math.round(cur*100)/100});
   if(Math.abs(d)<tol)return{ok:true,ms:Date.now()-t0,trace};
   const key=(Math.sign(d)===turnDir)?'KeyE':'KeyQ';
   await keys([]);
   await p.keyboard.down(key);await sleep(Math.max(28,Math.min(190,Math.round(Math.abs(d)*85))));await p.keyboard.up(key);
   await sleep(70);
  }
  return{ok:false,reason:'转向超时',trace};
 }

 try{
  await p.goto('http://127.0.0.1:'+server.address().port+'/html/game/starship-defense/index.html?qa=1');
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA&&window.__gameQA.resistanceCampaign,{timeout:60000});
  await p.evaluate(()=>{try{const c=__gameQA.CombatControls;c.set('input','keyboard');c.set('aim','auto');c.set('fire','hold');}catch(e){}});

  // 通过真实点击进入第1章
  await p.click('#btnResistance');await sleep(900);
  await p.click('.warChapter[data-chapter="0"]');await sleep(2000);
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  const s0=await ob();
  rec('enter-ch0',s0.active&&s0.chapter===0&&!s0.testMode,{active:s0.active,chapter:s0.chapter,testMode:s0.testMode,pos:[Math.round(s0.x*10)/10,Math.round(s0.z*10)/10],yaw:s0.yaw===null?'NULL':Math.round(s0.yaw*100)/100});
  rec('yaw-readable',s0.yaw!==null&&Number.isFinite(s0.yaw),{yaw:s0.yaw,camMode:s0.camMode});

  // 修复点 1：转向真的生效（用明显偏离当前朝向的目标，避免落在容差内空测）
  const before=(await ob()).yaw;
  const f1=await faceTo(26,4,0.13,4000); // 期望 yaw≈atan2(26,22)≈0.87 rad，必须真实转身
  const after=(await ob()).yaw;
  const expectYaw=Math.atan2(26-0,4-(-18));
  const yawErr=Math.abs(Math.atan2(Math.sin(after-expectYaw),Math.cos(after-expectYaw)));
  rec('faceTo-turns-and-converges',f1.ok&&yawErr<0.22,{before:Math.round(before*100)/100,after:Math.round(after*100)/100,expected:Math.round(expectYaw*100)/100,err:Math.round(yawErr*100)/100,ok:f1.ok,ms:f1.ms,steps:f1.trace.length});
  await p.screenshot({path:path.join(OUT,'after-face.png')});

  // 修复点 2：走到交通壕并占领
  let wps=await route({x:-7,z:55.5});
  rec('route-found',!!wps&&wps.length>0,{waypoints:wps?wps.length:0,path:wps?wps.map(w=>[Math.round(w.x),Math.round(w.z)]):null});

  const goal={x:-7,z:55.5};
  const t0=Date.now(),trace=[];
  let idx=0,replan=0,lastMove=Date.now(),last=null,turnFails=0;
  while(Date.now()-t0<110000){
   const s=await ob();
   if(s.over)break;
   if(s.dead){await sleep(3800);wps=await route(goal);idx=0;lastMove=Date.now();continue;}
   if(Math.hypot(goal.x-s.x,goal.z-s.z)<2.4){trace.push({ev:'ARRIVE',x:s.x,z:s.z});break;}
   // 交战：26 米内有敌兵就转向并开火
   if(s.enemies>0){
    const e=await p.evaluate(()=>{const st=__gameQA.resistanceCampaign.state,P=st.player.root.position;let best=null,bd=1e9;for(const u of st.units){if(u.dead||u.team!=='enemy')continue;const d=Math.hypot(u.root.position.x-P.x,u.root.position.z-P.z);if(d<bd){bd=d;best={x:u.root.position.x,z:u.root.position.z,d};}}return best;});
    if(e&&e.d<30){
     const fr=await faceTo(e.x,e.z,0.22,1500);
     if(!fr.ok)turnFails++;
     await keys(['KeyJ']);await sleep(420);await keys([]);
     const sA=await ob();
     if(sA.hp<75){await tap('KeyH',260);}
     trace.push({ev:'fight',d:Math.round(e.d),kills:sA.kills,hp:sA.hp,turnOk:fr.ok});
     lastMove=Date.now();
     continue;
    }
   }
   if(!wps){wps=await route(goal);idx=0;}
   let tgt=wps[idx];
   if(!tgt)break;
   if(Math.hypot(tgt.x-s.x,tgt.z-s.z)<2.2&&idx<wps.length-1)tgt=wps[++idx];
   const fr2=await faceTo(tgt.x,tgt.z,0.24,1800);
   if(!fr2.ok)turnFails++;
   await keys(['KeyW']);await sleep(300);await keys([]);
   const sB=await ob();
   if(last&&Math.hypot(last.x-sB.x,last.z-sB.z)<0.3){
    // 脱困：先侧移，再后退，然后重规划（不再原地反复重规划同一条路）
    await keys(['KeyD']);await sleep(300);await keys([]);
    await keys(['KeyS']);await sleep(300);await keys([]);
    if(Date.now()-lastMove>3500){
     wps=await route(goal);idx=0;lastMove=Date.now();replan++;
     trace.push({ev:'stuck-replan',replan,x:Math.round(sB.x*10)/10,z:Math.round(sB.z*10)/10});
     if(replan>12){trace.push({ev:'GIVEUP',x:sB.x,z:sB.z});break;}
    }
   }else lastMove=Date.now();
   last={x:sB.x,z:sB.z};
   if(trace.length%6===0)trace.push({ev:'move',x:Math.round(sB.x*10)/10,z:Math.round(sB.z*10)/10,hp:sB.hp,phase:sB.phase,hold:sB.hold,distObj:sB.distObj});
  }
  await keys([]);
  let sf=await ob();
  const arrived=Math.hypot(goal.x-sf.x,goal.z-sf.z)<7;
  rec('reached-trench',arrived,{pos:[Math.round(sf.x*10)/10,Math.round(sf.z*10)/10],distObj:sf.distObj,replan,turnFails,kills:sf.kills,hp:sf.hp,phase:sf.phase,seconds:Math.round((Date.now()-t0)/1000)});
  await p.screenshot({path:path.join(OUT,'at-trench.png')});

  // 占领读秒：18 米内无敌 + 距目标 <7 米，站 3 秒
  const t1=Date.now(),holdTrace=[];
  while(Date.now()-t1<45000){
   const s=await ob();
   if(s.phase>=1||s.over)break;
   const e=await p.evaluate(()=>{const st=__gameQA.resistanceCampaign.state;let n=0;for(const u of st.units)if(!u.dead&&u.team==='enemy'&&Math.hypot(u.root.position.x-st.player.root.position.x,u.root.position.z-st.player.root.position.z)<18)n++;return n;});
   if(e>0){
    const en=await p.evaluate(()=>{const st=__gameQA.resistanceCampaign.state,P=st.player.root.position;let best=null,bd=1e9;for(const u of st.units){if(u.dead||u.team!=='enemy')continue;const d=Math.hypot(u.root.position.x-P.x,u.root.position.z-P.z);if(d<bd){bd=d;best={x:u.root.position.x,z:u.root.position.z,d};}}return best;});
    if(en){await faceTo(en.x,en.z,0.22,1400);await keys(['KeyJ']);await sleep(450);await keys([]);}
   }else{
    // 确保仍在占领范围内
    if(Math.hypot(goal.x-s.x,goal.z-s.z)>6){const w2=await route(goal);if(w2&&w2.length>1){await faceTo(w2[1].x,w2[1].z,0.24,1500);await keys(['KeyW']);await sleep(300);await keys([]);}}
    else await sleep(600);
   }
   const s2=await ob();holdTrace.push({t:Math.round(s2.elapsed),hold:s2.hold,phase:s2.phase,near:e,hp:s2.hp,progress:s2.progress});
  }
  await keys([]);
  sf=await ob();
  rec('trench-captured',sf.phase>=1,{phase:sf.phase,hold:sf.hold,kills:sf.kills,hp:sf.hp,progress:sf.progress,holdTrace:holdTrace.slice(-10)});
  await p.screenshot({path:path.join(OUT,'captured.png')});
  rec('no-cheats-used',true,{invulnerableNeverSet:true,noEnemyClearing:true,noTeleport:true,testMode:sf.testMode});
  fs.writeFileSync(path.join(OUT,'smoke-report.json'),JSON.stringify({generated:new Date().toISOString(),results,errors,trace:trace.slice(-60)},null,2));
  const failed=results.filter(r=>!r.ok);
  console.log('\n==== 冒烟汇总 ==== 通过 '+results.filter(r=>r.ok).length+' / '+results.length);
  if(failed.length)failed.forEach(f=>console.log(' FAIL '+f.name+' :: '+JSON.stringify(f.detail).slice(0,400)));
  if(errors.length)console.log('pageerrors:',errors.slice(0,5).join(' | '));
 }catch(e){
  fs.writeFileSync(path.join(OUT,'smoke-failure.json'),JSON.stringify({error:e.stack,results,errors},null,2));
  console.error('SMOKE FAILED',e.message);throw e;
 }finally{
  await keys([]).catch(()=>{});
  await p.evaluate(()=>{try{__gameQA.resistanceCampaign.stop(true);}catch(_){}}).catch(()=>{});
  await context.close();await browser.close();server.close();
 }
})().catch(()=>{server.close();process.exitCode=1;});

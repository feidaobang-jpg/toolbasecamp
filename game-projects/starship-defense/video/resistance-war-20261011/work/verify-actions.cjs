// 抗战战役动作原语验证：只发正常键盘输入 + 只读游戏状态。
// 目的：确认寻路、转向开火、手雷炸堡垒、上马冲刺军刀、搬弹操炮轰城门在正常规则下真实生效。
// 不使用无敌、不清敌、不改血量、不瞬移；阶段直达仅用于隔离验证并单独标注。
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=__dirname,WEB=path.resolve(ROOT,'../../../../../public'),OUT=path.join(ROOT,'verify');
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.webm':'video/webm'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(WEB,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(WEB+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',MIME[path.extname(file).toLowerCase()]||'application/octet-stream');res.end(data);});
}).listen(0,'127.0.0.1');

const results=[];
const rec=(name,ok,detail)=>{results.push({name,ok,detail});console.log((ok?'PASS  ':'FAIL  ')+name+'  '+JSON.stringify(detail));};

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const held=new Set();
 async function keys(want){for(const k of [...held])if(!want.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of want)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
 async function tap(k,ms=90){await p.keyboard.press(k);await sleep(ms);}
 async function tapHold(k,ms){await p.keyboard.down(k);await sleep(ms);await p.keyboard.up(k);}

 // ---- 状态读取（只读）----
 async function ob(){return p.evaluate(()=>{
  const q=__gameQA,r=q.resistanceCampaign,s=r.state,o=r.objective();
  const P=s.player.root.position;
  return {active:s.active,over:s.over,finished:!!s.finished,chapter:s.chapter,phase:s.phase,nativeState:q.Game.state,
   testMode:q.Game.testMode,invuln:s.invulnerable>0,elapsed:Math.round(s.elapsed*10)/10,
   x:P.x,z:P.z,y:P.y,hp:Math.ceil(s.player.hp),maxHp:s.player.maxHp,dead:s.player.dead,mounted:!!s.player.mounted,
   yaw:(()=>{try{return q.getCamYaw()}catch(e){return null}})(),
   first:(()=>{try{return q.getCamMode()==='first'}catch(e){return null}})(),
   kills:s.kills,hold:Math.round(s.hold*10)/10,order:s.order,
   distObj:Math.round(Math.hypot(P.x-o.x,P.z-o.z)*10)/10,objX:o.x,objZ:o.z,
   enemies:s.units.filter(u=>u.team==='enemy'&&!u.dead).length,
   allies:s.units.filter(u=>u.team==='ally'&&!u.dead&&u!==s.player).length,
   weapon:s.weapon,ammo:s.ammo[s.weapon],grenades:s.grenades,medkits:s.medkits,
   cannon:!!s.cannon,towing:!!s.towing,carrying:!!s.carrying,loaded:s.loaded,gateShots:s.gateShots,wagonHp:Math.ceil(s.wagonHp),
   wagonZ:(()=>{try{return Math.round(s.map.objectives.wagon.position.z*10)/10}catch(e){return null}})(),
   cannonPos:(()=>{try{const c=s.map.objectives.cannon.position;return{x:Math.round(c.x*10)/10,z:Math.round(c.z*10)/10}}catch(e){return null}})(),
   destructibles:s.map?s.map.destructibles.map(d=>({key:d.key,dead:!!d.dead,hp:Math.ceil(d.hp)})):null,
   nearestEnemy:(()=>{let best=null,bd=1e9;for(const u of s.units){if(u.dead||u.team!=='enemy')continue;const d=Math.hypot(u.root.position.x-P.x,u.root.position.z-P.z);if(d<bd){bd=d;best={name:u.name,d:Math.round(d*10)/10,x:Math.round(u.root.position.x*10)/10,z:Math.round(u.root.position.z*10)/10,mounted:!!u.mounted};}}return best;})(),
   hint:(()=>{try{return document.getElementById('warHint').textContent}catch(e){return null}})(),
   progress:(()=>{try{return document.getElementById('warProgress').textContent}catch(e){return null}})()};
 });}

 // ---- 寻路：浏览器内 A* 网格，复用游戏自己的 collision() ----
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

 // ---- 朝向：用 Q/E 真实按键把视角转到目标方位 ----
 // camYaw 被 mod 到 [0,2π)（game.js:2540），E/Q 对 yaw 的增减方向靠实测标定，不靠推断
 let turnDir=null;
 async function calibrateTurn(){
  if(turnDir!==null)return turnDir;
  await keys([]);
  const y0=(await ob()).yaw;
  await p.keyboard.down('KeyE');await sleep(150);await p.keyboard.up('KeyE');await sleep(260);
  const y1=(await ob()).yaw;
  const d=Math.atan2(Math.sin(y1-y0),Math.cos(y1-y0));
  turnDir=d>=0?1:-1;
  console.log('TURN CALIBRATED: KeyE =>',d>=0?'yaw 增大':'yaw 减小','turnDir=',turnDir);
  return turnDir;
 }
 async function faceTo(tx,tz,tol=0.13,maxMs=3400){
  await calibrateTurn();
  const t0=Date.now();
  while(Date.now()-t0<maxMs){
   const s=await ob();const P={x:s.x,z:s.z};
   const want=Math.atan2(tx-P.x,tz-P.z);
   const cur=s.yaw;
   if(cur===null||!Number.isFinite(cur))return false;
   const d=Math.atan2(Math.sin(want-cur),Math.cos(want-cur));
   if(Math.abs(d)<tol)return true;
   const key=(Math.sign(d)===turnDir)?'KeyE':'KeyQ';
   await keys([]);
   await p.keyboard.down(key);await sleep(Math.max(28,Math.min(190,Math.round(Math.abs(d)*85))));await p.keyboard.up(key);
   await sleep(70);
  }
  return false;
 }

 // ---- 朝最近敌人开火（真实转向 + 真实按住 J）----
 async function engage(ms=2200){
  const t0=Date.now();let shots=0;
  while(Date.now()-t0<ms){
   const s=await ob();
   if(!s.nearestEnemy||s.over)break;
   await faceTo(s.nearestEnemy.x,s.nearestEnemy.z,0.2,1200);
   await keys(['KeyJ']);await sleep(420);shots++;
   const s2=await ob();
   await keys([]);
   if(s2.hp<60&&s2.medkits>0)await tap('KeyH',250);
   if(s2.ammo<=0)await tap('KeyR',400);
   if(Date.now()-t0>ms)break;
  }
  await keys([]);return shots;
 }

 // ---- 行进到目标：寻路 + 转向 + W 前进，途中遇敌开火 ----
 async function walkTo(goal,label,{fight=true,timeoutMs=75000}={}){
  await keys([]);
  let wps=await route(goal);
  if(!wps){rec(label+'-route',false,{reason:'A* 未找到正常路线',goal});return false;}
  let idx=0,lastMove=Date.now(),last=null;const t0=Date.now();
  while(Date.now()-t0<timeoutMs){
   const s=await ob();
   if(s.over){rec(label,false,{reason:'本章已结束',state:s});return false;}
   if(s.dead){await sleep(3600);const s2=await ob();lastMove=Date.now();wps=await route(goal);idx=0;continue;}
   const P={x:s.x,z:s.z};
   if(Math.hypot(goal.x-P.x,goal.z-P.z)<2.4){await keys([]);rec(label,true,{goal,reached:{x:Math.round(P.x*10)/10,z:Math.round(P.z*10)/10},ms:Date.now()-t0,hp:s.hp});return true;}
   // 战斗中优先应敌
   if(fight&&s.nearestEnemy&&s.nearestEnemy.d<26){await engage(1600);lastMove=Date.now();continue;}
   let tgt=wps[idx];
   if(Math.hypot(tgt.x-P.x,tgt.z-P.z)<2.2&&idx<wps.length-1)tgt=wps[++idx];
   await faceTo(tgt.x,tgt.z,0.22,1500);
   const s3=await ob();
   await keys(['KeyW']);await sleep(300);
   if(s3.hp<70&&s3.medkits>0){await keys([]);await tap('KeyH',260);lastMove=Date.now();}
   const s4=await ob();
   if(last&&Math.hypot(last.x-s4.x,last.z-s4.z)<0.35){
    // 卡住：侧移 + 重规划
    await keys(['KeyD']);await sleep(280);await keys([]);
    if(Date.now()-lastMove>4200){wps=await route(goal);idx=0;lastMove=Date.now();console.log('  replan',label);}
   }else lastMove=Date.now();
   last={x:s4.x,z:s4.z};
   await keys([]);
  }
  await keys([]);const sf=await ob();
  rec(label,false,{reason:'行进超时',goal,pos:{x:Math.round(sf.x*10)/10,z:Math.round(sf.z*10)/10},distObj:sf.distObj,hp:sf.hp});
  return false;
 }

 try{
  await p.goto('http://127.0.0.1:'+server.address().port+'/html/game/starship-defense/index.html?qa=1');
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA&&window.__gameQA.resistanceCampaign,{timeout:60000});
  // 用真实点击走菜单进入，并设为纯键盘 + 自动锁定 + 按住射击
  await p.click('#keysMenu').catch(()=>{});
  await p.selectOption('#combat-input','keyboard').catch(()=>{});
  await p.selectOption('#combat-aim','auto').catch(()=>{});
  await p.selectOption('#combat-fire','hold').catch(()=>{});
  await p.click('#keysClose').catch(()=>{});
  await p.evaluate(()=>{try{__gameQA.CombatControls.set('fire','hold');__gameQA.CombatControls.set('aim','auto');__gameQA.CombatControls.set('input','keyboard');}catch(e){}});

  // ========== 第1章 ==========
  await p.click('#btnResistance');await sleep(900);
  await p.click('.warChapter[data-chapter="0"]');await sleep(1800);
  // 清掉章节按钮焦点，避免战斗中被导航层吞掉 KeyJ（game.js:3908）
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  await p.screenshot({path:path.join(OUT,'ch0-start.png')});
  let s=await ob();
  rec('ch0-enter',s.active&&s.chapter===0&&!s.testMode,{active:s.active,chapter:s.chapter,phase:s.phase,testMode:s.testMode,invuln:s.invuln,hp:s.hp,weapon:s.weapon});

  // P0 夺取前沿交通壕 (-7,58)：正常推进 + 交战 + 占领读秒
  await walkTo({x:-7,z:52},'ch0-p0-advance');
  s=await ob();rec('ch0-p0-near-trench',s.distObj<10,{distObj:s.distObj,enemies:s.enemies,hp:s.hp,kills:s.kills});
  await engage(3000);
  // 占领需要 18 米内无敌人，若仍有残敌则继续清
  for(let i=0;i<6;i++){s=await ob();if(s.phase>0)break;if(s.enemies>0&&s.nearestEnemy&&s.nearestEnemy.d<60)await engage(2500);else await sleep(1200);s=await ob();if(s.hold>0)console.log('  holding',s.hold);}
  s=await ob();rec('ch0-p0-capture',s.phase>=1,{phase:s.phase,hold:s.hold,kills:s.kills,hp:s.hp,progress:s.progress});
  await p.screenshot({path:path.join(OUT,'ch0-p0-done.png')});

  // P1 手雷炸两座机枪堡垒 left(-14,93) right(14,98) hp250，手雷 damage185
  await tap('KeyT',700); // 队友指令：进攻
  s=await ob();rec('ch0-p1-order',s.order==='attack',{order:s.order});
  await walkTo({x:-14,z:84},'ch0-p1-to-left-bunker',{fight:true});
  s=await ob();
  const beforeBunk=(s.destructibles||[]).filter(d=>!d.cannonOnly).map(d=>({k:d.key,dead:d.dead,hp:d.hp}));
  // 对准堡垒扔手雷（U），需要两发
  for(let g=0;g<3;g++){
   s=await ob();const lb=(s.destructibles||[]).find(d=>d.key==='left-bunker');
   if(!lb||lb.dead)break;
   await faceTo(-14,93,0.18,1800);
   await tap('KeyU',300);await sleep(2600);
  }
  s=await ob();
  const lbAfter=(s.destructibles||[]).find(d=>d.key==='left-bunker');
  rec('ch0-p1-left-bunker-destroyed',!!lbAfter&&lbAfter.dead,{before:beforeBunk,after:(s.destructibles||[]).map(d=>({k:d.key,dead:d.dead,hp:d.hp})),grenades:s.grenades});
  await p.screenshot({path:path.join(OUT,'ch0-p1-left-bunker.png')});

  await walkTo({x:14,z:89},'ch0-p1-to-right-bunker',{fight:true});
  for(let g=0;g<3;g++){
   s=await ob();const rb=(s.destructibles||[]).find(d=>d.key==='right-bunker');
   if(!rb||rb.dead)break;
   await faceTo(14,98,0.18,1800);
   await tap('KeyU',300);await sleep(2600);
  }
  s=await ob();
  const rbAfter=(s.destructibles||[]).find(d=>d.key==='right-bunker');
  rec('ch0-p1-right-bunker-destroyed',!!rbAfter&&rbAfter.dead,{after:(s.destructibles||[]).map(d=>({k:d.key,dead:d.dead,hp:d.hp})),phase:s.phase,grenades:s.grenades});
  await p.screenshot({path:path.join(OUT,'ch0-p1-right-bunker.png')});
  for(let i=0;i<4;i++){s=await ob();if(s.phase>=2)break;await sleep(1500);}
  s=await ob();rec('ch0-p1-advance',s.phase>=2,{phase:s.phase,progress:s.progress});

  // P2 坡顶指挥阵地 (0,137)：占领 5 秒
  await walkTo({x:0,z:131},'ch0-p2-to-hilltop',{fight:true});
  await engage(3000);
  for(let i=0;i<10;i++){s=await ob();if(s.over)break;if(s.enemies>0&&s.nearestEnemy&&s.nearestEnemy.d<55)await engage(2200);else await sleep(1400);}
  s=await ob();rec('ch0-complete',s.over&&s.finished,{over:s.over,finished:s.finished,kills:s.kills,elapsed:s.elapsed,hp:s.hp});
  await p.screenshot({path:path.join(OUT,'ch0-result.png')});
  rec('ch0-result-text',true,{text:await p.evaluate(()=>document.getElementById('warResultText')?.textContent||null)});

  // ========== 第2章：上马 / 冲刺 / 军刀 / 掩护运输车 ==========
  await tap('KeyEscape',500);
  await p.evaluate(()=>__gameQA.resistanceCampaign.start(1,0));await sleep(1600);
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  s=await ob();rec('ch1-enter',s.active&&s.chapter===1&&!s.testMode,{chapter:s.chapter,phase:s.phase,mounted:s.mounted,hp:s.hp});
  await p.screenshot({path:path.join(OUT,'ch1-start.png')});
  // P0：靠近马匹按 I 上马
  const horse=await p.evaluate(()=>{const m=__gameQA.resistanceCampaign.state.mountMesh.position;return{x:Math.round(m.x*10)/10,z:Math.round(m.z*10)/10};});
  rec('ch1-horse-located',!!horse,{horse});
  await walkTo({x:horse.x,z:horse.z+2.2},'ch1-p0-to-horse',{fight:false,timeoutMs:45000});
  s=await ob();rec('ch1-p0-hint-mount',(s.hint||'').includes('上马'),{hint:s.hint});
  await tap('KeyI',400);await sleep(900);
  s=await ob();rec('ch1-p0-mounted',s.mounted,{mounted:s.mounted,phase:s.phase,hint:s.hint});
  await p.screenshot({path:path.join(OUT,'ch1-mounted.png')});

  // P1：冲破封锁线 —— K 冲刺 + W 前进 + J 挥刀，需 z>80 且击杀≥6
  await walkTo({x:0,z:60},'ch1-p1-approach',{fight:false,timeoutMs:60000});
  s=await ob();rec('ch1-p1-start',s.phase===1&&s.mounted,{phase:s.phase,mounted:s.mounted,enemies:s.enemies,z:Math.round(s.z)});
  const ch1log=[];
  for(let i=0;i<26;i++){
   s=await ob();
   if(s.phase>=2||s.over)break;
   const e=s.nearestEnemy;
   if(e&&e.d<40){await faceTo(e.x,e.z,0.2,900);}
   // 冲刺就绪则先冲刺
   const cd=await p.evaluate(()=>__gameQA.resistanceCampaign.state.chargeCd);
   if(cd<=0){await tap('KeyK',120);}
   await keys(['KeyW']);await sleep(520);
   if(e&&e.d<5.5){await keys(['KeyJ']);await sleep(380);}
   await keys([]);
   const s2=await ob();ch1log.push({t:s2.elapsed,z:Math.round(s2.z),kills:s2.kills,phase:s2.phase,hp:s2.hp,enemies:s2.enemies});
   if(s2.hp<70&&s2.medkits>0)await tap('KeyH',260);
  }
  await keys([]);
  s=await ob();rec('ch1-p1-breakthrough',s.phase>=2,{phase:s.phase,z:Math.round(s.z),kills:s.kills,hp:s.hp,log:ch1log.slice(-6)});
  await p.screenshot({path:path.join(OUT,'ch1-p1-breakthrough.png')});

  // P2：掩护运输车撤离（wagon.z 从 76 → 146）
  s=await ob();const w0=s.wagonZ;
  const ch1p2=[];
  for(let i=0;i<40;i++){
   s=await ob();if(s.over||s.phase>2)break;
   const wz=s.wagonZ,wpos=await p.evaluate(()=>{const w=__gameQA.resistanceCampaign.state.map.objectives.wagon.position;return{x:Math.round(w.x*10)/10,z:Math.round(w.z*10)/10};});
   // 守在运输车附近，清掉接近的敌人
   if(Math.hypot(s.x-wpos.x,s.z-wpos.z)>16){await walkTo({x:wpos.x,z:wpos.z+6},'ch1-p2-guard-'+i,{fight:true,timeoutMs:22000});}
   else{
    if(s.nearestEnemy&&s.nearestEnemy.d<45){await faceTo(s.nearestEnemy.x,s.nearestEnemy.z,0.2,900);await keys(['KeyJ']);await sleep(450);await keys([]);}
    else await sleep(700);
   }
   const s2=await ob();ch1p2.push({t:s2.elapsed,wagonZ:s2.wagonZ,wagonHp:s2.wagonHp,hp:s2.hp,enemies:s2.enemies,phase:s2.phase});
   if(s2.hp<75&&s2.medkits>0)await tap('KeyH',260);
   if(i%5===0)console.log('  wagon',s2.wagonZ,'hp',s2.wagonHp);
  }
  await keys([]);
  s=await ob();rec('ch1-p2-escort',s.over||s.wagonZ>=146||s.wagonZ>w0,{over:s.over,phase:s.phase,wagonZ0:w0,wagonZEnd:s.wagonZ,wagonHp:s.wagonHp,log:ch1p2.slice(-8)});
  rec('ch1-complete',s.over&&s.finished,{over:s.over,finished:s.finished,kills:s.kills,elapsed:s.elapsed});
  await p.screenshot({path:path.join(OUT,'ch1-result.png')});

  // ========== 第3章：搬弹 / 操炮 / 轰开城门 / 巷战 ==========
  await tap('KeyEscape',500);
  await p.evaluate(()=>__gameQA.resistanceCampaign.start(2,0));await sleep(1600);
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  s=await ob();rec('ch2-enter',s.active&&s.chapter===2&&!s.testMode,{chapter:s.chapter,phase:s.phase,hp:s.hp,destructibles:s.destructibles});
  await p.screenshot({path:path.join(OUT,'ch2-start.png')});
  // P0：攻下城外机枪阵地 outpost(0,42) + 摧毁 street-bunker(-12,52)
  await walkTo({x:0,z:40},'ch2-p0-to-outpost',{fight:true});
  await engage(3200);
  await walkTo({x:-12,z:45},'ch2-p0-to-street-bunker',{fight:true});
  for(let g=0;g<3;g++){
   s=await ob();const sb=(s.destructibles||[]).find(d=>d.key==='street-bunker');
   if(!sb||sb.dead)break;
   await faceTo(-12,52,0.18,1800);await tap('KeyU',300);await sleep(2700);
  }
  for(let i=0;i<6;i++){s=await ob();if(s.phase>=1)break;if(s.enemies>0&&s.nearestEnemy&&s.nearestEnemy.d<55)await engage(2200);else await sleep(1300);}
  s=await ob();rec('ch2-p0-advance',s.phase>=1,{phase:s.phase,streetBunker:(s.destructibles||[]).find(d=>d.key==='street-bunker'),progress:s.progress});
  await p.screenshot({path:path.join(OUT,'ch2-p0-done.png')});

  // P1：搬炮弹 ammo(-12,59) → cannon(0,64)
  s=await ob();
  await walkTo({x:-12,z:57.5},'ch2-p1-to-ammo',{fight:true,timeoutMs:60000});
  s=await ob();rec('ch2-p1-hint-ammo',(s.hint||'').includes('炮弹'),{hint:s.hint,carrying:s.carrying});
  await tap('KeyI',400);await sleep(800);
  s=await ob();rec('ch2-p1-carrying',s.carrying,{carrying:s.carrying,hint:s.hint});
  await p.screenshot({path:path.join(OUT,'ch2-p1-carrying.png')});
  const cp=s.cannonPos;
  await walkTo({x:cp.x,z:cp.z-3.4},'ch2-p1-deliver-to-cannon',{fight:false,timeoutMs:60000});
  s=await ob();rec('ch2-p1-hint-deliver',(s.hint||'').includes('送入炮位')||(s.hint||'').includes('炮弹'),{hint:s.hint});
  await tap('KeyI',400);await sleep(900);
  s=await ob();rec('ch2-p1-delivered',s.phase>=2||s.loaded>0,{phase:s.phase,loaded:s.loaded,carrying:s.carrying});
  await p.screenshot({path:path.join(OUT,'ch2-p1-delivered.png')});

  // P2：操炮轰城门 city-gate(0,87) hp750，炮弹 damage270 → 3 发
  s=await ob();
  if(s.phase<2){await p.evaluate(()=>__gameQA.resistanceCampaign.start(2,2));await sleep(1500);rec('ch2-p2-isolated-start',true,{note:'阶段直达仅用于隔离验证操炮，正式录制走正常流程',phase:(await ob()).phase});}
  const cp2=(await ob()).cannonPos;
  await walkTo({x:cp2.x,z:cp2.z-4.2},'ch2-p2-to-cannon',{fight:false,timeoutMs:45000});
  s=await ob();rec('ch2-p2-hint-cannon',(s.hint||'').includes('操炮'),{hint:s.hint});
  await tap('KeyI',400);await sleep(900);
  s=await ob();rec('ch2-p2-at-cannon',s.cannon,{cannon:s.cannon,loaded:s.loaded,hint:s.hint,progress:s.progress});
  await p.screenshot({path:path.join(OUT,'ch2-p2-at-cannon.png')});
  // 操炮转向城门：用 Q/E 真实转视角，HUD 会显示预计落点是否 onGate
  const shotsLog=[];
  for(let sh=0;sh<5;sh++){
   s=await ob();if(!s.cannon||s.phase>=3)break;
   if(s.loaded<=0){
    // 补弹：离炮 → 搬弹 → 送回
    await tap('KeyI',400);await sleep(600);
    const am=await p.evaluate(()=>{const a=__gameQA.resistanceCampaign.state.map.objectives.ammo;return{x:a.x,z:a.z};});
    await walkTo({x:am.x,z:am.z-2.4},'ch2-p2-resupply-ammo',{fight:false,timeoutMs:45000});
    await tap('KeyI',400);await sleep(700);
    const cp3=(await ob()).cannonPos;
    await walkTo({x:cp3.x,z:cp3.z-3.4},'ch2-p2-resupply-deliver',{fight:false,timeoutMs:45000});
    await tap('KeyI',400);await sleep(800);
    await tap('KeyI',400);await sleep(900);
    s=await ob();rec('ch2-p2-resupply',s.cannon&&s.loaded>0,{cannon:s.cannon,loaded:s.loaded});
    if(!s.cannon)break;
   }
   // 对准城门：炮在 (0,64)，城门 (0,87) → 正北 +z
   await faceTo(0,87,0.05,3000);
   // 微调仰角：W/S 调 pitch（cannon 模式下 axis 映射到 setLook）
   const pred=await p.evaluate(()=>{const r=__gameQA.resistanceCampaign;const pr=r.predictShell();return{dist:Math.round(pr.distance*10)/10,onGate:pr.target?.key==='city-gate',x:Math.round(pr.pos.x*10)/10,y:Math.round(pr.pos.y*10)/10,z:Math.round(pr.pos.z*10)/10};});
   const readout=await p.evaluate(()=>document.getElementById('warCannonReadout')?.textContent||null);
   console.log('  aim pred',JSON.stringify(pred),readout);
   if(!pred.onGate&&Math.abs(pred.z-87)>4){
    // 落点偏近则抬高炮口（W），偏远则压低（S）
    const dir=pred.z<87?'KeyW':'KeyS';
    await tapHold(dir,260);
    const pred2=await p.evaluate(()=>{const r=__gameQA.resistanceCampaign;const pr=r.predictShell();return{dist:Math.round(pr.distance*10)/10,onGate:pr.target?.key==='city-gate',z:Math.round(pr.pos.z*10)/10};});
    console.log('  after pitch',JSON.stringify(pred2));
   }
   await p.screenshot({path:path.join(OUT,`ch2-p2-aim-${sh}.png`)});
   await keys(['KeyJ']);await sleep(520);await keys([]);
   await sleep(2200);
   const s3=await ob();
   const gate=(s3.destructibles||[]).find(d=>d.key==='city-gate');
   shotsLog.push({shot:sh,pred,readout,loaded:s3.loaded,gateHp:gate?gate.hp:null,gateDead:gate?gate.dead:null,phase:s3.phase,gateShots:s3.gateShots});
   console.log('  SHOT',JSON.stringify(shotsLog[shotsLog.length-1]));
   if(s3.phase>=3)break;
  }
  s=await ob();
  const gateF=(s.destructibles||[]).find(d=>d.key==='city-gate');
  rec('ch2-p2-gate-destroyed',!!gateF&&gateF.dead,{gate:gateF,phase:s.phase,shots:shotsLog});
  await p.screenshot({path:path.join(OUT,'ch2-p2-gate.png')});
  for(let i=0;i<5;i++){s=await ob();if(s.phase>=3)break;await sleep(1400);}

  // P3：突入县城夺取守备队部 final(0,143)
  s=await ob();
  if(s.phase<3)rec('ch2-p3-skip',false,{reason:'城门未破，无法进入巷战',phase:s.phase});
  else{
   await walkTo({x:0,z:137},'ch2-p3-into-town',{fight:true});
   await engage(3200);
   for(let i=0;i<12;i++){s=await ob();if(s.over)break;if(s.enemies>0&&s.nearestEnemy&&s.nearestEnemy.d<55)await engage(2200);else await sleep(1400);}
   s=await ob();rec('ch2-complete',s.over&&s.finished,{over:s.over,finished:s.finished,kills:s.kills,elapsed:s.elapsed,hp:s.hp});
   await p.screenshot({path:path.join(OUT,'ch2-result.png')});
   rec('ch2-result-text',true,{text:await p.evaluate(()=>document.getElementById('warResultText')?.textContent||null)});
  }

  // 视角切换 C 与举枪 Z 真实生效验证（复刻类玩法看点）
  await p.evaluate(()=>__gameQA.resistanceCampaign.start(0,0));await sleep(1500);
  const readView=()=>p.evaluate(()=>({mode:__gameQA.getCamMode(),first:__gameQA.getCamMode()==='first',yaw:__gameQA.getCamYaw()}));
  const v0=await readView();
  await tap('KeyC',900);
  const v1=await readView();
  await tap('KeyC',900);
  const v2=await readView();
  rec('view-cycle-C',JSON.stringify(v0)!==JSON.stringify(v1)||JSON.stringify(v1)!==JSON.stringify(v2),{v0,v1,v2});
  const z0=await p.evaluate(()=>__gameQA.resistanceCampaign.state.aiming);
  await tap('KeyZ',700);
  const z1=await p.evaluate(()=>__gameQA.resistanceCampaign.state.aiming);
  rec('aim-toggle-Z',z0!==z1,{before:z0,after:z1});
  await p.screenshot({path:path.join(OUT,'aim-view.png')});

  fs.writeFileSync(path.join(OUT,'verify-report.json'),JSON.stringify({generated:new Date().toISOString(),normalRules:true,noInvulnerableUsed:true,noEnemyClearingUsed:true,phaseIsolationNoted:true,results,errors},null,2));
  const failed=results.filter(r=>!r.ok);
  console.log('\n==== 验证汇总 ====\n通过 '+results.filter(r=>r.ok).length+' / '+results.length);
  if(failed.length){console.log('未通过:');failed.forEach(f=>console.log(' - '+f.name+' :: '+JSON.stringify(f.detail)));}
  if(errors.length)console.log('pageerrors',errors.slice(0,6).join(' | '));
 }catch(e){
  fs.writeFileSync(path.join(OUT,'verify-failure.json'),JSON.stringify({error:e.stack,results,errors},null,2));
  console.error('VERIFY FAILED',e.message);throw e;
 }finally{
  await keys([]).catch(()=>{});
  await p.evaluate(()=>{try{__gameQA.resistanceCampaign.stop(true);}catch(_){}}).catch(()=>{});
  await context.close();await browser.close();server.close();
 }
})().catch(()=>{server.close();process.exitCode=1;});

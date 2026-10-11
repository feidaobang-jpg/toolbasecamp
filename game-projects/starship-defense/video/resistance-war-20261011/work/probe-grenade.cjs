// 手雷弹道实测：不同站位距离对机枪堡垒(250hp, 高3.3m)的实际伤害
// 理论推算（resistance-campaign.js:159 grenade）：出手高 1.5m，dir=(sin,0.48,cos)/1.1092，
// speed=20 → vy≈8.65, vhoriz≈18.03, g=15；y>3.3 的区间是水平 4.9m~15.9m，
// 即站得太近手雷会从堡垒头顶飞过。本脚本实测确认有效窗口。
// 纪律：只用正常键盘输入与正常规则；阶段直达(start(0,1))仅用于隔离测试弹道，会单独标注，
//       不用于正式成片的连续通关叙事。
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=__dirname,WEB=path.resolve(ROOT,'../../../../../public'),OUT=path.join(ROOT,'ballistic');
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(WEB,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(WEB+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',MIME[path.extname(file).toLowerCase()]||'application/octet-stream');res.end(data);});
}).listen(0,'127.0.0.1');

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const trials=[];
 try{
  await p.goto('http://127.0.0.1:'+server.address().port+'/html/game/starship-defense/index.html?qa=1');
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA&&window.__gameQA.resistanceCampaign,{timeout:60000});
  await p.evaluate(()=>{const c=__gameQA.CombatControls;c.set('input','keyboard');c.set('aim','auto');c.set('fire','hold');});

  // 理论预测：给定站位距离，算出手雷落点高度与水平距离
  const predict=d=>{const vy=0.48/Math.hypot(1,0.48)*20,vh=1/Math.hypot(1,0.48)*20;
   const t=d/vh,y=1.5+vy*t-7.5*t*t;
   // 落地时间
   const tl=(vy+Math.sqrt(vy*vy+4*7.5*1.4))/(2*7.5);
   return{t:Math.round(t*1000)/1000,yAtBunker:Math.round(y*100)/100,landsAt:Math.round(vh*tl*10)/10,
    passesOver:y>3.3};};
  console.log('理论预测（堡垒高 3.3m，落在地面距离 landsAt）:');
  for(const d of [6,9,12,15,16,17,19,21,23,25,28]){
   const pr=predict(d);
   console.log(`  站 ${String(d).padStart(2)}m: 到堡垒时高 ${String(pr.yAtBunker).padStart(6)}m  ${pr.passesOver?'← 飞过堡垒顶':'命中堡垒'}   落地距离 ${pr.landsAt}m`);
  }

  // 实测：left-bunker 在 (-14,93)，从正南方不同距离投弹
  for(const dist of [9,16,18,20,23,26]){
   await p.evaluate(d=>{const q=__gameQA,r=q.resistanceCampaign;
    // 阶段直达仅用于隔离弹道测试，正式录制走正常流程
    r.start(0,1);q.CombatControls.set('fire','hold');
    r.state.grenades=8;r.state.grenadeCd=0;
    // 清掉本阶段敌兵以免干扰弹道观测（隔离测试，非正式录像）
    for(const u of r.state.units)if(u.team==='enemy'&&!u.dead)r.damage(u,9999);
    const s=r.state;const bx=-14,bz=93;
    // 站在堡垒正南 dist 米处；若该点不可站，沿正南方向找最近可站点
    let stand=null;
    for(let back=0;back<=6;back++){const z=bz-(d+back);if(!r.collision(bx,z,.5)){stand={x:bx,z};break;}}
    if(!stand)return {error:'no stand spot for dist '+d};
    s.player.root.position.set(stand.x,0,stand.z);
    return {stand,dist:Math.round(Math.hypot(stand.x-bx,stand.z-bz)*10)/10};
   },dist);
   await sleep(900);
   const placed=await p.evaluate(()=>{const s=__gameQA.resistanceCampaign.state;
    const b=s.map.destructibles.find(d=>d.key==='left-bunker');
    return {x:s.player.root.position.x,z:s.player.root.position.z,grenades:s.grenades,
     bunkerHp:b?b.hp:null,bunkerDead:b?b.dead:null,
     distToBunker:Math.round(Math.hypot(s.player.root.position.x+14,s.player.root.position.z-93)*10)/10,
     yaw:__gameQA.getCamYaw()};});
   if(placed.error){trials.push({dist,skipped:placed.error});console.log(`dist ${dist}: ${placed.error}`);continue;}

   // 转向堡垒（用实测标定的方向）
   const wantYaw=Math.atan2(-14-placed.x,93-placed.z);
   let calib=await p.evaluate(()=>{const q=__gameQA;return q.getCamYaw();});
   await p.keyboard.down('KeyE');await sleep(120);await p.keyboard.up('KeyE');await sleep(200);
   const afterE=await p.evaluate(()=>__gameQA.getCamYaw());
   const eSign=Math.atan2(Math.sin(afterE-calib),Math.cos(afterE-calib))>=0?1:-1;
   for(let i=0;i<40;i++){
    const cur=await p.evaluate(()=>__gameQA.getCamYaw());
    const d=Math.atan2(Math.sin(wantYaw-cur),Math.cos(wantYaw-cur));
    if(Math.abs(d)<0.05)break;
    const key=(Math.sign(d)===eSign)?'KeyE':'KeyQ';
    await p.keyboard.down(key);await sleep(45);await p.keyboard.up(key);await sleep(60);
   }
   const aimed=await p.evaluate(()=>({yaw:__gameQA.getCamYaw()}));

   // 投弹并观察落点
   await p.keyboard.press('KeyU');
   const traj=[];
   for(let i=0;i<26;i++){
    await sleep(90);
    const g=await p.evaluate(()=>{const s=__gameQA.resistanceCampaign.state;
     const shot=s.shots.find(b=>b.grenade);
     const bk=s.map.destructibles.find(d=>d.key==='left-bunker');
     if(!shot)return{gone:true,bunkerHp:bk?bk.hp:null,bunkerDead:bk?bk.dead:null};
     const mp=shot.mesh.position;
     return{x:Math.round(mp.x*10)/10,y:Math.round(mp.y*100)/100,z:Math.round(mp.z*10)/10,
      distFromBunker:Math.round(Math.hypot(mp.x+14,mp.z-93)*10)/10,
      bunkerHp:bk?bk.hp:null};});
    traj.push(g);
    if(g.gone)break;
   }
   const final=await p.evaluate(()=>{const s=__gameQA.resistanceCampaign.state;
    const b=s.map.destructibles.find(d=>d.key==='left-bunker');
    return{bunkerHp:b?Math.ceil(b.hp):null,bunkerDead:b?b.dead:null,grenades:s.grenades};});
   const hit=final.bunkerHp<250;
   trials.push({standDist:placed.distToBunker,placed,aimYawErr:Math.round(Math.atan2(Math.sin(wantYaw-aimed.yaw),Math.cos(wantYaw-aimed.yaw))*100)/100,
    minYInFlight:Math.min(...traj.filter(t=>t.y!=null).map(t=>t.y)),
    maxDistFromBunkerInFlight:traj.filter(t=>t.distFromBunker!=null).length?Math.min(...traj.filter(t=>t.distFromBunker!=null).map(t=>t.distFromBunker)):null,
    trajectory:traj.slice(0,14),final,hit,predicted:predict(placed.distToBunker)});
   console.log(`站 ${String(placed.distToBunker).padStart(4)}m: ${hit?'命中 → hp '+final.bunkerHp:'未命中（hp '+final.bunkerHp+'）'}  飞行中离堡垒最近 ${Math.min(...traj.filter(t=>t.distFromBunker!=null).map(t=>t.distFromBunker))}m  最低高度 ${Math.min(...traj.filter(t=>t.y!=null).map(t=>t.y))}m  预测${predict(placed.distToBunker).passesOver?'飞过':'命中'}`);
   await p.screenshot({path:path.join(OUT,`dist-${Math.round(placed.distToBunker)}.png`)});
  }

  // 补测：站在有效窗口内连投两发能否摧毁 250hp 堡垒
  await p.evaluate(()=>{const q=__gameQA,r=q.resistanceCampaign;
   r.start(0,1);q.CombatControls.set('fire','hold');
   r.state.grenades=8;r.state.grenadeCd=0;
   for(const u of r.state.units)if(u.team==='enemy'&&!u.dead)r.damage(u,9999);
   const s=r.state;s.player.root.position.set(-14,0,75);
   s.invulnerable=0;});
  await sleep(900);
  const wantYaw2=Math.atan2(-14-(-14),93-75);
  for(let g=0;g<3;g++){
   const cur=await p.evaluate(()=>__gameQA.getCamYaw());
   const d=Math.atan2(Math.sin(wantYaw2-cur),Math.cos(wantYaw2-cur));
   if(Math.abs(d)>0.05){await p.keyboard.down(d<0?'KeyQ':'KeyQ');await sleep(40);await p.keyboard.up('KeyQ');}
   await p.keyboard.press('KeyU');await sleep(2800);
   const st=await p.evaluate(()=>{const s=__gameQA.resistanceCampaign.state;const b=s.map.destructibles.find(x=>x.key==='left-bunker');
    return{hp:b?Math.ceil(b.hp):null,dead:b?b.dead:null,grenades:s.grenades,phase:s.phase};});
   console.log(`  连投第${g+1}发（站18m）: 堡垒 hp=${st.hp} dead=${st.dead} 剩余手雷=${st.grenades}`);
   if(st.dead)break;
  }
  const twoShot=await p.evaluate(()=>{const b=__gameQA.resistanceCampaign.state.map.destructibles.find(x=>x.key==='left-bunker');return{dead:!!b.dead,hp:Math.ceil(b.hp)};});
  trials.push({twoGrenadeKillTest:twoShot,standDist:18});

  fs.writeFileSync(path.join(OUT,'ballistic-report.json'),JSON.stringify({
   generated:new Date().toISOString(),
   note:'阶段直达与清敌仅用于隔离弹道测试，不用于正式成片的连续正常通关叙事',
   grenadeParams:{launchHeight:1.5,dirY:0.48,speed:20,gravity:15,life:2.2,damage:185,blastRadius:7,destructibleBlastBonus:2},
   bunker:{hp:250,height:3.3},trials,errors},null,2));
  console.log('\n报告:',path.join(OUT,'ballistic-report.json'));
  if(errors.length)console.log('pageerrors:',errors.slice(0,5).join(' | '));
 }catch(e){
  fs.writeFileSync(path.join(OUT,'ballistic-failure.json'),JSON.stringify({error:e.stack,trials,errors},null,2));
  console.error('BALLISTIC FAILED',e.message);throw e;
 }finally{
  await p.evaluate(()=>{try{__gameQA.resistanceCampaign.stop(true);}catch(_){}}).catch(()=>{});
  await context.close();await browser.close();server.close();
 }
})().catch(()=>{server.close();process.exitCode=1;});

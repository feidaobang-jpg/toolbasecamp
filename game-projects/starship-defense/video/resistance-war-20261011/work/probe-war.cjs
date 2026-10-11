// 抗战战役三章地图与规则探测。只读取正常游戏状态，不修改任何玩法数值。
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=__dirname,WEB=path.resolve(ROOT,'../../../../../public'),OUT=path.join(ROOT,'probe');
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MIME={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.webm':'video/webm'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(WEB,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(WEB+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',MIME[path.extname(file).toLowerCase()]||'application/octet-stream');res.end(data);});
}).listen(0,'127.0.0.1');

const num=v=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*100)/100:null;
const pos=o=>{if(!o)return null;if(o.position)return{x:num(o.position.x),y:num(o.position.y),z:num(o.position.z)};if(typeof o==='object')return{x:num(o.x),y:num(o.y),z:num(o.z)};return o;};

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
 const report={generated:new Date().toISOString(),errors,menu:null,chapters:[]};
 try{
  await p.goto('http://127.0.0.1:'+server.address().port+'/html/game/starship-defense/index.html?qa=1');
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA&&window.__gameQA.resistanceCampaign,{timeout:60000});

  // 主菜单入口与章节文案
  report.menu=await p.evaluate(()=>{
   const q=__gameQA,r=q.resistanceCampaign,btn=document.getElementById('btnResistance');
   return {buttonFound:!!btn,buttonText:btn?.textContent||null,buttonVisible:btn?!!btn.offsetParent:null,
    chapters:r.WAR_CHAPTERS.map(c=>({name:c.name,tag:c.tag,brief:c.brief,stages:c.stages})),
    guns:r.PERIOD_GUNS,existingCheckpoint:r.read()};
  });
  fs.writeFileSync(path.join(OUT,'menu.json'),JSON.stringify(report.menu,null,2));
  await p.screenshot({path:path.join(OUT,'main-menu.png')});

  // 逐章 dump 地图、目标、可破坏物、补给点、初始兵力
  for(let ch=0;ch<3;ch++){
   await p.evaluate(c=>{const q=__gameQA;q.resistanceCampaign.start(c,0);q.CombatControls.set('fire','hold');},ch);
   await sleep(1200);
   const data=await p.evaluate(()=>{
    const r=__gameQA.resistanceCampaign,s=r.state,m=s.map;
    const objs={};for(const k of Object.keys(m.objectives))objs[k]=m.objectives[k];
    return {
     chapter:s.chapter,phase:s.phase,nativeState:__gameQA.Game.state,testMode:__gameQA.Game.testMode,
     bounds:m.bounds,
     objectiveNow:r.objective(),
     objectivesRaw:Object.fromEntries(Object.entries(objs).map(([k,v])=>[k,v&&typeof v==='object'?{hasPosition:!!v.position,x:v.x??null,z:v.z??null}:v])),
     destructibles:m.destructibles.map(d=>({key:d.key,x:d.x,z:d.z,hp:d.hp,maxHp:d.maxHp,cannonOnly:!!d.cannonOnly,dead:!!d.dead,cw:d.collider?.w,cd:d.collider?.d,chh:d.collider?.h})),
     stations:(m.stations||[]).map(st=>({label:st.label,x:st.x,z:st.z})),
     colliderCount:m.colliders.length,
     colliders:m.colliders.map(c=>({x:c.x,z:c.z,w:c.w,d:c.d,h:c.h,disabled:!!c.disabled})),
     playerSpawn:{x:s.player.root.position.x,y:s.player.root.position.y,z:s.player.root.position.z},
     player:{hp:s.player.hp,maxHp:s.player.maxHp,mounted:!!s.player.mounted,name:s.player.name},
     units:s.units.map(u=>({name:u.name,team:u.team,x:u.root.position.x,z:u.root.position.z,mounted:!!u.mounted,hp:u.hp,maxHp:u.maxHp,weapon:u.weapon})),
     loadout:{weapon:s.weapon,ammo:s.ammo,grenades:s.grenades,medkits:s.medkits},
     wagonHp:s.wagonHp,loaded:s.loaded,cannon:!!s.cannon,carrying:!!s.carrying,towing:!!s.towing,order:s.order
    };
   });
   // 解析带 position 的 Object3D 目标（cannon/wagon 等）
   const live=await p.evaluate(()=>{
    const m=__gameQA.resistanceCampaign.state.map,o={};
    for(const k of Object.keys(m.objectives)){const v=m.objectives[k];
     if(v&&v.isObject3D)o[k]={kind:'Object3D',x:v.position.x,y:v.position.y,z:v.position.z,yaw:v.rotation.y};
     else if(v&&typeof v==='object')o[k]={kind:'plain',x:v.x,y:v.y,z:v.z};
     else o[k]={kind:'scalar',value:v};}
    return o;
   });
   data.objectives=live;
   fs.writeFileSync(path.join(OUT,`map-ch${ch}-phase0.json`),JSON.stringify(data,null,2));
   await p.screenshot({path:path.join(OUT,`ch${ch}-phase0.png`)});
   report.chapters.push({chapter:ch,name:report.menu.chapters[ch].name,objectives:live,
    destructibles:data.destructibles,stations:data.stations,playerSpawn:data.playerSpawn,
    enemyCount:data.units.filter(u=>u.team==='enemy').length,allyCount:data.units.filter(u=>u.team==='ally').length,
    bounds:data.bounds,colliderCount:data.colliderCount,loadout:data.loadout});
   console.log(`CH${ch} ${report.menu.chapters[ch].name} 敌${data.units.filter(u=>u.team==='enemy').length} 友${data.units.filter(u=>u.team==='ally').length} 目标`,JSON.stringify(live));

   // 逐阶段 dump 敌兵出生点与目标变化（只切阶段，不改血量、不清敌）
   const stages=report.menu.chapters[ch].stages;
   for(let ph=1;ph<stages.length;ph++){
    await p.evaluate(([c,pp])=>{const q=__gameQA;q.resistanceCampaign.start(c,pp);q.CombatControls.set('fire','hold');},[ch,ph]);
    await sleep(900);
    const pd=await p.evaluate(()=>{
     const r=__gameQA.resistanceCampaign,s=r.state;
     const o={};for(const k of Object.keys(s.map.objectives)){const v=s.map.objectives[k];
      o[k]=v&&v.isObject3D?{kind:'Object3D',x:v.position.x,y:v.position.y,z:v.position.z}:v&&typeof v==='object'?{kind:'plain',x:v.x,y:v.y,z:v.z}:{kind:'scalar',value:v};}
     return {phase:s.phase,objectiveNow:r.objective(),objectives:o,loaded:s.loaded,
      destructibles:s.map.destructibles.map(d=>({key:d.key,dead:!!d.dead,cannonOnly:!!d.cannonOnly,hp:d.hp})),
      enemies:s.units.filter(u=>u.team==='enemy'&&!u.dead).map(u=>({name:u.name,x:u.root.position.x,z:u.root.position.z,mounted:!!u.mounted})),
      playerSpawn:{x:s.player.root.position.x,z:s.player.root.position.z},wagonHp:s.wagonHp};
    });
    fs.writeFileSync(path.join(OUT,`map-ch${ch}-phase${ph}.json`),JSON.stringify(pd,null,2));
    await p.screenshot({path:path.join(OUT,`ch${ch}-phase${ph}.png`)});
    report.chapters[ch][`phase${ph}`]={objectiveNow:pd.objectiveNow,objectives:pd.objectives,enemyCount:pd.enemies.length,enemies:pd.enemies,playerSpawn:pd.playerSpawn,loaded:pd.loaded,wagonHp:pd.wagonHp,destructibles:pd.destructibles};
    console.log(`  CH${ch} P${ph} ${stages[ph]} 敌${pd.enemies.length} 目标`,JSON.stringify(pd.objectiveNow));
   }
  }

  // 正常难度可行性实测：第1章 phase0 只用真实键盘推进，观察血量与击杀
  await p.evaluate(()=>{const q=__gameQA;q.resistanceCampaign.start(0,0);q.CombatControls.set('fire','hold');});
  await sleep(1000);
  const trial=[];
  for(let i=0;i<40;i++){
   await p.keyboard.down('KeyW');await sleep(320);await p.keyboard.up('KeyW');
   const st=await p.evaluate(()=>{const r=__gameQA.resistanceCampaign,s=r.state;
    return {t:Math.round(s.elapsed*10)/10,phase:s.phase,hp:Math.ceil(s.player.hp),kills:s.kills,
     x:Math.round(s.player.root.position.x*10)/10,z:Math.round(s.player.root.position.z*10)/10,
     enemies:s.units.filter(u=>u.team==='enemy'&&!u.dead).length,hold:Math.round(s.hold*10)/10,
     distToObj:Math.round(Math.hypot(s.player.root.position.x-r.objective().x,s.player.root.position.z-r.objective().z)*10)/10};});
   trial.push(st);
   if(st.enemies>0&&st.distToObj<45)await p.keyboard.down('KeyJ'),await sleep(400),await p.keyboard.up('KeyJ');
   if(i%8===0)console.log('TRIAL',JSON.stringify(st));
   if(st.phase>0)break;
  }
  fs.writeFileSync(path.join(OUT,'trial-ch0-normal.json'),JSON.stringify(trial,null,2));
  report.trialCh0Normal=trial;
  await p.screenshot({path:path.join(OUT,'trial-ch0-end.png')});

  report.errors=errors;
  fs.writeFileSync(path.join(OUT,'probe-report.json'),JSON.stringify(report,null,2));
  console.log('PROBE COMPLETE. errors=',errors.length);
  if(errors.length)console.log(errors.slice(0,8).join('\n'));
 }catch(e){
  report.fatal=e.stack;report.errors=errors;
  fs.writeFileSync(path.join(OUT,'probe-failure.json'),JSON.stringify(report,null,2));
  console.error('PROBE FAILED',e.message);throw e;
 }finally{
  await p.evaluate(()=>{try{__gameQA.resistanceCampaign.stop(true);}catch(_){}}).catch(()=>{});
  await context.close();await browser.close();server.close();
 }
})().catch(()=>{server.close();process.exitCode=1;});

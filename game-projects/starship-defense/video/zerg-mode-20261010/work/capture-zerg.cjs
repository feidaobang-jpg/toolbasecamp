// 虫族模式实机采集 v6：线上部署版本，QA 钩子只读观察，输入全部为真实键盘事件，正常规则不改数值。
// 打法：飞虫空袭流（FLYRUSH）。第一命贴门咬门攒生物量（门×0.25），死亡后（deaths≥1 且 ≥90）转入空投阶段：
//       导航到侧翼位 (±27,0)——只被 2-3 座边缘炮塔覆盖，距门 27 在酸液射程（30）内；
//       站桩先调向再喷酸（酸液自动锁定锥角内目标，18.75/发），≥90 即空投飞虫（2 只/次）越墙直扑基地；
//       FLYRUSH 下禁战士（60）与蜕皮（40），血线靠「死亡=满血重置」的 6 条命预算，经济全部投入飞虫。
const fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const OUT=path.join(__dirname,'capture',process.env.TAKE||'zerg-run1');fs.mkdirSync(OUT,{recursive:true});
const GAME_URL=process.env.GAME_URL||'https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const SMOKE=!!process.env.SMOKE;const SIEGE=!!process.env.SIEGE;const FLYRUSH=!!process.env.FLYRUSH;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const p=await context.newPage();
  const errors=[],events=[],states=[],frames=[];let started=0,recording=false,lastSaved=0;
  const held=new Set();
  async function keys(wanted){for(const k of [...held])if(!wanted.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of wanted)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
  async function observe(){return p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{
    state:q.Game.state,zergOn:q.zergOn(),over:z.over,timeLeft:Math.round(z.timeLeft),biomass:Math.round(z.biomass),deaths:z.deaths,
    bug:!!(b&&!b.dead),bx:b?+b.mesh.position.x.toFixed(1):null,bz:b?+b.mesh.position.z.toFixed(1):null,
    bhp:b?Math.round(b.hp):0,bmax:b?Math.round(b.maxHp):0,binv:b?+(+b.invuln).toFixed(1):0,
    clawCd:+(+z.clawCd).toFixed(2),spitCd:+(+z.spitCd).toFixed(2),sumCd:+(+z.sumCd).toFixed(2),flyCd:+(+z.flyCd).toFixed(2),moltCd:+(+z.moltCd).toFixed(2),dashCd:+(+z.dashCd).toFixed(2),
    yaw:+q.getCamYaw().toFixed(3),
    swarm:q.monsters.filter(m=>!m.dead&&m!==b).length,
    squads:q.squad.filter(s=>!s.dead).map(s=>({x:+s.mesh.position.x.toFixed(1),z:+s.mesh.position.z.toFixed(1)})),
    turrets:q.buildings.filter(t=>!t.dead).map(t=>({x:+t.mesh.position.x.toFixed(1),z:+t.mesh.position.z.toFixed(1),hp:Math.round(t.hp||0)})),
    gateX:+q.gate.mesh.position.x.toFixed(1),gateZ:+q.gate.mesh.position.z.toFixed(1),gateHp:Math.round(q.gate.hp),gateDead:q.gate.dead,
    baseX:+q.base.mesh.position.x.toFixed(1),baseZ:+q.base.mesh.position.z.toFixed(1),baseHp:Math.round(q.base.hp),baseMax:Math.round(q.base.maxHp),
    overTitle:(document.getElementById('overTitle')||{}).textContent||'',result:(document.getElementById('overInfo')||{}).innerText||''};});}
  async function mark(name){const s=await observe();const e={name,t:+((Date.now()-started)/1000).toFixed(2),game:s.timeLeft,state:{...s,squads:s.squads.length,turrets:s.turrets.length}};events.push(e);console.log('EVENT',name,e.t,'gate',s.gateHp,'base',s.baseHp,'bio',s.biomass,'swarm',s.swarm,'hp',s.bhp);await p.screenshot({path:path.join(OUT,name+'.png')});}
  try{
    p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...args){if(dest instanceof AudioDestinationNode){if(!this.context.__movieDest)this.context.__movieDest=this.context.createMediaStreamDestination();window.__movieAudio=this.context.__movieDest;return connect.call(this,this.context.__movieDest,...args);}return connect.call(this,dest,...args);};});
    await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
    await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
    try{if(await p.locator('#keysMenu').isVisible().catch(()=>false)){await p.click('#keysMenu');await p.selectOption('#combat-input','keyboard');await p.click('#keysClose');}}catch(e){console.log('settings skip',e.message);}
    await p.screenshot({path:path.join(OUT,'menu-zerg-entry.png')});
    await p.click('#btnZerg');
    await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
    await sleep(1500);started=Date.now();
    const cdp=await context.newCDPSession(p);
    await p.evaluate(()=>{window.__movieChunks=[];window.__movieRec=new MediaRecorder(window.__movieAudio.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});__movieRec.ondataavailable=e=>__movieChunks.push(e.data);__movieRec.start(500);window.__movieAudioStart=Date.now();});
    cdp.on('Page.screencastFrame',async e=>{if(recording&&e.metadata.timestamp-lastSaved>=.035){lastSaved=e.metadata.timestamp;const file=String(frames.length).padStart(6,'0')+'.jpg';fs.writeFileSync(path.join(OUT,file),Buffer.from(e.data,'base64'));frames.push({file,timestamp:e.metadata.timestamp});}await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});});
    recording=true;await cdp.send('Page.startScreencast',{format:'jpeg',quality:98,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
    await mark('start');
    const watchdog=Date.now()+(SMOKE?(+process.env.SMOKE_T||28000)+25000:560000);
    let lastPos=null,stuckN=0,firstBite=false,breached=false,coreEngaged=false,lastStateLog=0,progLog=0,viewDone=false,viewBackAt=0,viewTried=false,flyMode=false;
    const SIDE_X=+(process.env.SIDE_X||27);let sideLock=null,lastDeaths=0,flyerN=0;
    while(Date.now()<watchdog){
      const s=await observe();
      if(s.state!=='battle')break;
      if(Date.now()-lastStateLog>1500){states.push({t:+((Date.now()-started)/1000).toFixed(1),...s,squads:s.squads.length,turrets:s.turrets.length});lastStateLog=Date.now();}
      if(s.over){if(!events.some(e=>e.name==='round-over'))await mark('round-over');break;}
      if(!s.bug){await keys([]);await sleep(400);if(s.deaths>0&&!events.some(e=>e.name==='bug-down-'+s.deaths))await mark('bug-down-'+s.deaths);continue;}
      if(!SMOKE&&!firstBite&&s.gateHp<2500){firstBite=true;await mark('first-bite');}
      if(FLYRUSH&&!flyMode&&s.gateHp<2500&&s.deaths>=1&&s.biomass>=90){flyMode=true;console.log('FLYMODE ON bio',s.biomass,'base',s.baseHp);}
      if(!SMOKE&&!breached&&s.gateDead){breached=true;await mark('gate-breached');}
      if(!SMOKE&&breached&&!coreEngaged&&Math.hypot(s.baseX-s.bx,s.baseZ-s.bz)<16){coreEngaged=true;await mark('core-engage');}
      let gx,gz,kind;
      if(!s.gateDead){gx=s.gateX;gz=s.gateZ;kind='gate';}
      else if(s.baseHp>0){gx=s.baseX;gz=s.baseZ;kind='base';}
      else break;
      const near=s.squads.map(u=>({u,d:Math.hypot(u.x-s.bx,u.z-s.bz)})).sort((a,b)=>a.d-b.d)[0];
      const nearT=s.turrets.map(t=>({t,d:Math.hypot(t.x-s.bx,t.z-s.bz)})).sort((a,b)=>a.d-b.d)[0];
      let tx=gx,tz=gz,tkind=kind;
      if(near&&near.d<9&&s.clawCd<=0){tx=near.u.x;tz=near.u.z;tkind='squad';}
      else if(s.gateDead&&nearT&&nearT.d<9&&s.clawCd<=0){tx=nearT.t.x;tz=nearT.t.z;tkind='turret';}
      const dt2=Math.hypot(tx-s.bx,tz-s.bz),dg=Math.hypot(gx-s.bx,gz-s.bz);
      if(Date.now()-progLog>8000){progLog=Date.now();console.log('PROG',Math.round((Date.now()-started)/1000)+'s','gate',s.gateHp,'base',s.baseHp,'hp',Math.round(s.bhp/s.bmax*100)+'%','bio',s.biomass,'swarm',s.swarm,'deaths',s.deaths,'dg',Math.round(dg),'kind',tkind,'inv',s.binv,'tuhp',s.turrets.reduce((a,t)=>a+t.hp,0),'fly',flyMode);}
      const hpPct=s.bhp/s.bmax;
      const HOLD_DG=+process.env.HOLD_DG||0;
      if(!HOLD_DG&&!FLYRUSH&&!flyMode&&hpPct<.8&&dg<15&&s.moltCd<=0&&s.biomass>=40){await p.keyboard.press('KeyO');if(!events.some(e=>e.name==='molt-1'))await mark('molt-1');}
      if(!HOLD_DG&&!FLYRUSH&&!flyMode&&dg<22&&s.biomass>=60&&s.sumCd<=0&&s.swarm<40){await p.keyboard.press('KeyU');if(!events.some(e=>e.name==='summon-warrior-1'))await mark('summon-warrior-1');}
      else if(!HOLD_DG&&dg<22&&s.biomass>=110&&s.flyCd<=0&&s.swarm<46){await p.keyboard.press('KeyI');if(!events.some(e=>e.name==='summon-flyer-1'))await mark('summon-flyer-1');}
      else if(!HOLD_DG&&!FLYRUSH&&!flyMode&&dg>=22&&s.biomass>=100&&s.sumCd<=0&&s.swarm<40){await p.keyboard.press('KeyU');if(!events.some(e=>e.name==='summon-warrior-1'))await mark('summon-warrior-1');}
      if(!SMOKE&&!viewDone&&!viewTried&&dg>25&&dg<60){viewDone=true;viewTried=true;await p.keyboard.press('KeyC');viewBackAt=Date.now()+4000;await mark('view-1st');}
      if(viewBackAt&&Date.now()>viewBackAt){viewBackAt=0;await p.keyboard.press('KeyC');await sleep(400);await mark('view-3rd');}
      const dx=tx-s.bx,dz=tz-s.bz,f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw);
      const want=[];if(Math.abs(f)>1.2)want.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>1.2)want.push(r>0?'KeyD':'KeyA');
      if(s.deaths!==lastDeaths){lastDeaths=s.deaths;sideLock=null;}
      if(HOLD_DG&&dg<=HOLD_DG){await keys([]);}
      else if(FLYRUSH&&flyMode&&!s.gateDead){
        const sx=sideLock*SIDE_X,sz=0,dSide=Math.hypot(sx-s.bx,sz-s.bz);
        if(s.biomass>=90&&s.flyCd<=0&&s.swarm<50){
          flyerN++;events.push({name:'flyer-'+flyerN,t:+((Date.now()-started)/1000).toFixed(2)});console.log('FLYER',flyerN,'bio',s.biomass,'base',s.baseHp);
          await p.keyboard.press('KeyI');if(flyerN===1)await mark('summon-flyer-1');await sleep(600);
        }
        else if(dSide>4){
          const dx=sx-s.bx,dz=sz-s.bz,f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw);
          const w=[];if(Math.abs(f)>1)w.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>1)w.push(r>0?'KeyD':'KeyA');
          await keys(w);
          if(s.dashCd<=0&&dSide>25){await p.keyboard.press('KeyL');if(!events.some(e=>e.name==='dash-1'))await mark('dash-1');}
        }
        else if(s.spitCd<=0){
          const dx=s.gateX-s.bx,dz=s.gateZ-s.bz,f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw);
          const w=[];if(Math.abs(f)>.35)w.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>.35)w.push(r>0?'KeyD':'KeyA');
          if(w.length){await keys(w);await sleep(300);}
          await keys([]);await sleep(70);await p.keyboard.press('KeyK');await sleep(320);
          if(!events.some(e=>e.name==='acid-1'))await mark('acid-1');
        }
        else{await keys([]);await sleep(150);}
      }
      else if(SIEGE&&!s.gateDead&&s.turrets.length>0&&dg<30&&dg>=26){
        await keys([]);
        if(SIEGE&&hpPct<.8&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');if(!events.some(e=>e.name==='molt-1'))await mark('molt-1');}
        if(s.spitCd<=0){await keys(want.length?want:['KeyW']);await sleep(160);await p.keyboard.press('KeyK');await keys([]);await sleep(200);if(!events.some(e=>e.name==='acid-1'))await mark('acid-1');}
        if(!flyMode&&s.biomass>=140&&s.flyCd<=0&&s.swarm<46){await p.keyboard.press('KeyI');if(!events.some(e=>e.name==='summon-flyer-1'))await mark('summon-flyer-1');}
      }
      else if(SIEGE&&!s.gateDead&&s.turrets.length>0&&dg<26){await keys(want.map(k=>({KeyW:'KeyS',KeyS:'KeyW',KeyA:'KeyD',KeyD:'KeyA'})[k]||k));}
      else if(dt2>4.6){
        if(lastPos&&Math.hypot(s.bx-lastPos.x,s.bz-lastPos.z)<.5)stuckN++;else stuckN=0;
        lastPos={x:s.bx,z:s.bz};
        if(stuckN>5){await keys(stuckN%10<5?['KeyA']:['KeyD']);}
        else{
          await keys(want);
          if(s.dashCd<=0&&dg>25){await p.keyboard.press('KeyL');if(!events.some(e=>e.name==='dash-1'))await mark('dash-1');}
        }
      }else{
        await keys([]);
        if(FLYRUSH&&!flyMode&&s.gateHp<2500&&(s.biomass>=100||hpPct<.3)){/* 生物量够首 cast 或血线见底：站桩送死回虫洞，进入飞虫阶段 */}
        else if(s.clawCd<=0){await p.keyboard.press('KeyJ');if(tkind==='squad'&&!events.some(e=>e.name==='bite-squad'))await mark('bite-squad');if(tkind==='turret'&&!events.some(e=>e.name==='bite-building'))await mark('bite-building');}
        else if(s.spitCd<=0&&dg<20){await keys(want.length?want:['KeyW']);await sleep(160);await p.keyboard.press('KeyK');await keys([]);await sleep(200);if(!events.some(e=>e.name==='acid-1'))await mark('acid-1');}
      }
      if(SMOKE&&(Date.now()-started)>(+process.env.SMOKE_T||28000)){await mark('smoke-stop');break;}
      await sleep(230);
    }
    await keys([]);
    const fin=await observe();
    if(fin.over&&!events.some(e=>e.name==='round-over'))await mark('round-over');
    await sleep(SMOKE?1500:7000);
    await mark('final-result');
    await cdp.send('Page.stopScreencast');recording=false;
    const audio=await p.evaluate(async()=>{await new Promise(r=>{__movieRec.onstop=r;__movieRec.stop();});return{start:__movieAudioStart,bytes:Array.from(new Uint8Array(await new Blob(__movieChunks).arrayBuffer()))};});
    fs.writeFileSync(path.join(OUT,'game-audio.webm'),Buffer.from(audio.bytes));
    const data={take:process.env.TAKE||'zerg-run1',url:GAME_URL,started,audioStart:audio.start,duration_s:+((Date.now()-started)/1000).toFixed(2),frames:frames.length,events,states,errors,finalState:fin,
      build:'线上部署 https://www.zhengxiaohui.cn（2026-10-10；zerg-mode.js SHA256 与本地 fde6e977 副本一致）',
      gameplay_modified:false,time_scale:1,normal_rule_inputs_only:true,qa_hook_usage:'read-only observe'};
    fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(data,null,2));
    fs.writeFileSync(path.join(OUT,'frames.json'),JSON.stringify(frames));
    console.log('CAPTURE COMPLETE',data.duration_s,'frames',frames.length,'events',events.length,'overTitle',fin.overTitle);
  }catch(e){
    fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:e.stack,events,frames:frames.length,errors},null,2));
    throw e;
  }finally{await keys([]).catch(()=>{});recording=false;await context.close().catch(()=>{});await browser.close().catch(()=>{});}
})().catch(e=>{console.error('CAPTURE-FAIL',e.message);process.exit(1);});

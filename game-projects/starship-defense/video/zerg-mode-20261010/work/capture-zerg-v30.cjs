// 虫族模式实机采集 v30：西侧绕后偷家。线上部署版本，QA 钩子只读观察，输入全部为真实键盘事件，正常规则不改数值。
// v30 依据（v29i 冒烟 201.7s 破门后 9s 溃散 + probe-walls/probe-tower-acid/probe-core-lane 三探针实测）：
//   ① 城墙不向西延伸：x=-40 南北走廊（z 20→-60）全程可走，西侧路线距狙击塔(8,-20) 48-57u；
//     炮塔索敌=最近目标（无 LOS），城内 6 守军巡院子比绕后母虫更近 → 火力被吸走，西路近零承伤（v29i 行军全程 hp100% 实证）。
//   ② 核心口袋 (-16,-46) 可站，距核心 5.7u：探针实测爪击 60/口、酸击 75/发均可命中（围墙挡不到）。
//     但口袋承伤 238dps（狙击84+堡垒100+加农37.5+守军），无盾站桩 4s 蒸发。
//   ③ summon() 战士虫在母虫身边 ±4u 即时出巢（zerg-mode.js L172-186）→ 到口袋即召兵当肉盾；
//     爪核心 65 生物量/s（dmg60×0.6 回收）+ 守军 +25/杀 → 蜕皮(40/8s +35%血)与召群(60/6s)自循环。
//   ④ 路线：巢(1,176)→v29 已验证走廊[(-69,140),(-69,90),(-69,20)]→西路[(-52,20),(-40,20),(-40,-30),(-36,-44),(-26,-46)]→口袋(-16,-46)。
//     全程 ~270u 疾跑 ~115s；进入狙击圈(dg<45)起召兵吸火力；核心 2000 血爪+酸 177dps ≈ 12-18s 拆完 → 虫族胜利。
//   ⑤ 阵亡可接受（≤2 次）：重生回巢穴重走全程（~140s），一局 360s 内仍可完成。
// v28.1/v29.1 保留：周期落盘 frames.json/capture-partial.json 每 30s；四向防卡 STUCK_SEQ；AIM-RECAL 转向重校准。
const fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const OUT=path.join(__dirname,'capture',process.env.TAKE||'zerg-run10');fs.mkdirSync(OUT,{recursive:true});
const GAME_URL=process.env.GAME_URL||'https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const SMOKE=!!process.env.SMOKE;const NOREC=!!process.env.NOREC;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const POCKET=[-16,-46],CORE=[-12,-42];
const ROUTE=[[-69,140],[-69,90],[-69,20],[-52,20],[-40,20],[-40,-30],[-36,-44],[-26,-46],POCKET];
const STUCK_SEQ=[['KeyS','KeyA'],['KeyS','KeyD'],['KeyW','KeyA'],['KeyW','KeyD']];
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const p=await context.newPage();
  const errors=[],events=[],states=[],frames=[];let started=0,recording=false,lastSaved=0,lastFlush=0;
  const held=new Set();let lastMoveAt=0;
  async function keys(wanted){for(const k of [...held])if(!wanted.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of wanted)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}if(wanted.length)lastMoveAt=Date.now();}
  async function observe(){return p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{
    state:q.Game.state,zergOn:q.zergOn(),over:z.over,timeLeft:Math.round(z.timeLeft),biomass:Math.round(z.biomass),deaths:z.deaths,
    bug:!!(b&&!b.dead),bx:b?+b.mesh.position.x.toFixed(1):null,bz:b?+b.mesh.position.z.toFixed(1):null,
    bhp:b?Math.round(b.hp):0,bmax:b?Math.round(b.maxHp):0,binv:b?+(+b.invuln).toFixed(1):0,
    clawCd:+(+z.clawCd).toFixed(2),spitCd:+(+z.spitCd).toFixed(2),sumCd:+(+z.sumCd).toFixed(2),flyCd:+(+z.flyCd).toFixed(2),moltCd:+(+z.moltCd).toFixed(2),dashCd:+(+z.dashCd).toFixed(2),dashT:+(+z.dashT).toFixed(2),
    yaw:+q.getCamYaw().toFixed(3),camMode:(q.getCamMode&&q.getCamMode())||'',
    swarm:q.monsters.filter(m=>!m.dead&&m!==b).length,
    squads:q.squad.filter(s=>!s.dead).map(s=>({x:+s.mesh.position.x.toFixed(1),z:+s.mesh.position.z.toFixed(1)})),
    turrets:q.buildings.filter(t=>!t.dead).map(t=>({kind:t.kind,x:+t.mesh.position.x.toFixed(1),z:+t.mesh.position.z.toFixed(1),hp:Math.round(t.hp||0)})),
    gateHp:Math.round(q.gate.hp),gateDead:q.gate.dead,
    baseX:+q.base.pos.x.toFixed(1),baseZ:+q.base.pos.z.toFixed(1),baseHp:Math.round(q.base.hp),baseMax:Math.round(q.base.maxHp),
    overTitle:(document.getElementById('overTitle')||{}).textContent||''};});}
  async function mark(name){const s=await observe();const e={name,t:+((Date.now()-started)/1000).toFixed(2),game:s.timeLeft,state:{...s,squads:s.squads.length,turrets:s.turrets.length}};events.push(e);console.log('EVENT',name,e.t,'core',s.baseHp,'bio',s.biomass,'swarm',s.swarm,'hp',s.bhp);if(!NOREC)await p.screenshot({path:path.join(OUT,name+'.png')});}
  // 转向：3 次无进展自动重校准（v29.1 AIM-RECAL）
  async function aimAt(tx,tz,s0){let s=s0;const want=Math.atan2(tx-s.bx,tz-s.bz);let err=wrap(want-s.yaw),turnKey=err>0?'ArrowRight':'ArrowLeft',aimMiss=0;
    for(let i=0;i<14&&Math.abs(err)>.06;i++){const e0=err;await p.keyboard.down(turnKey);await sleep(55);await p.keyboard.up(turnKey);await sleep(45);
      s=await observe();if(!s.bug)break;err=wrap(want-s.yaw);
      if(Math.abs(err)-Math.abs(e0)<.05){if(++aimMiss>=3){console.log('AIM-RECAL：转向 3 次无进展，重校准 turnKey（err',e0.toFixed(2),'->',err.toFixed(2),'）');turnKey=err>0?'ArrowRight':'ArrowLeft';aimMiss=0;}}
      else aimMiss=0;}
    return s;}
  try{
    p.on('pageerror',e=>errors.push(e.message));
    await p.addInitScript(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...args){if(dest instanceof AudioDestinationNode){if(!this.context.__movieDest)this.context.__movieDest=this.context.createMediaStreamDestination();window.__movieAudio=this.context.__movieDest;return connect.call(this,this.context.__movieDest,...args);}return connect.call(this,dest,...args);};});
    await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
    await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
    try{if(await p.locator('#keysMenu').isVisible().catch(()=>false)){await p.click('#keysMenu');await p.selectOption('#combat-input','keyboard');await p.click('#keysClose');}}catch(e){console.log('settings skip',e.message);}
    if(!NOREC)await p.screenshot({path:path.join(OUT,'menu-zerg-entry.png')});
    await p.click('#btnZerg');
    await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
    await sleep(1500);started=Date.now();
    const cdp=await context.newCDPSession(p);
    if(!NOREC){
      await p.evaluate(()=>{window.__movieChunks=[];window.__movieRec=new MediaRecorder(window.__movieAudio.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});__movieRec.ondataavailable=e=>__movieChunks.push(e.data);__movieRec.start(500);window.__movieAudioStart=Date.now();});
      cdp.on('Page.screencastFrame',async e=>{if(recording&&e.metadata.timestamp-lastSaved>=.035){lastSaved=e.metadata.timestamp;const file=String(frames.length).padStart(6,'0')+'.jpg';fs.writeFileSync(path.join(OUT,file),Buffer.from(e.data,'base64'));frames.push({file,timestamp:e.metadata.timestamp});}await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});});
      recording=true;await cdp.send('Page.startScreencast',{format:'jpeg',quality:98,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
    }
    await mark('start');
    // ===== 策略层 v30：nest(1,176) core(-12,-42) pocket(-16,-46)；ROUTE 西侧绕后 =====
    let phase='flank',wpIdx=0,wpSince=Date.now(),lastPos=null,stuckN=0,marchRetries=0;
    let progLog=0,viewDone=false,viewBackAt=0,biteN=0,acidN=0,moltN=0,warN=0,dashN=0,winMarked=false;
    const towerSeen=new Map(); // kind -> alive? 用于塔亡事件
    const watchdog=Date.now()+(SMOKE?(+process.env.SMOKE_T||28000)+25000:470000);
    while(Date.now()<watchdog){
      let s=await observe();
      if(s.state!=='battle')break;
      if(Date.now()-progLog>1500&&states[states.length-1]?.t!==+((Date.now()-started)/1000).toFixed(1))states.push({t:+((Date.now()-started)/1000).toFixed(1),...s,squads:s.squads.length,turrets:s.turrets.length});
      if(frames.length&&Date.now()-lastFlush>30000){lastFlush=Date.now();
        try{fs.writeFileSync(path.join(OUT,'frames.json'),JSON.stringify(frames));
          fs.writeFileSync(path.join(OUT,'capture-partial.json'),JSON.stringify({take:process.env.TAKE||'zerg-run10',started,duration_s:+((Date.now()-started)/1000).toFixed(2),frames:frames.length,events,states,errors},null,2));}catch(e){}}
      if(s.over){if(!winMarked){winMarked=true;await mark(s.baseHp<=0?'victory':'round-over');}break;}
      if(!s.bug){await keys([]);if(s.deaths>0&&!events.some(e=>e.name==='bug-down-'+s.deaths))await mark('bug-down-'+s.deaths);
        wpIdx=0;wpSince=Date.now();lastPos=null;stuckN=0;marchRetries=0;phase='flank';
        await sleep(400);continue;}
      const hpPct=s.bhp/s.bmax;
      // 塔亡事件（供剪辑索引）
      for(const t of s.turrets){if(!towerSeen.has(t.kind+t.x+','+t.z))towerSeen.set(t.kind+t.x+','+t.z,t.hp);}
      for(const [key,hp] of towerSeen){if(hp>0&&!s.turrets.some(t=>t.kind+t.x+','+t.z===key)){towerSeen.set(key,-1);if(key.startsWith('sniper'))await mark('sniper-dead');else if(key.startsWith('bunker'))await mark('bunker-dead');else if(key.startsWith('cannon'))await mark('cannon-dead');else if(key.startsWith('mgTurret'))await mark('mg-dead');}}
      for(const th of [75,50,25]){
        if(!events.some(e=>e.name==='core-'+th)&&s.baseHp<=s.baseMax*th/100&&s.baseHp>0)await mark('core-'+th);
      }
      if(phase==='flank'&&wpIdx>=ROUTE.length){phase='corekill';await mark('pocket-arrive');}
      // ===== 口袋决战：爪+酸核心，召兵当盾，蜕皮续命，近身守军顺手撕 =====
      if(phase==='corekill'){
        const dCore=Math.hypot(CORE[0]-s.bx,CORE[1]-s.bz);
        const chaser=s.squads.map(q=>({q,d:Math.hypot(q.x-s.bx,q.z-s.bz)})).sort((a,b)=>a.d-b.d)[0];
        if(dCore>7.5){ // 被击退/没站到位：回口袋
          s=await aimAt(POCKET[0],POCKET[1],s);
          const dx=POCKET[0]-s.bx,dz=POCKET[1]-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
          const w=[];if(f>.5)w.push('KeyW');else if(f<-.5)w.push('KeyS');if(r>.5)w.push('KeyD');else if(r<-.5)w.push('KeyA');
          if(w.length){if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}await keys(w);
            if(lastPos&&Math.hypot(s.bx-lastPos.x,s.bz-lastPos.z)<.4)stuckN++;else{stuckN=0;lastPos={x:s.bx,z:s.bz};}
            if(stuckN>8&&s.dashCd<=0){await p.keyboard.press('KeyL');dashN++;}}
          else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys([]);}
          await sleep(120);continue;}
        if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        await keys([]);
        // 攻击优先级：3u 内守军先撕（自保+25 生物量），否则爪核心
        const atk=chaser&&chaser.d<3?[chaser.q.x,chaser.q.z]:CORE;
        if(atk!==CORE)await p.evaluate(()=>{const q=__gameQA;const q2=q.squad.filter(x=>!x.dead).map(x=>({x:x.mesh.position.x,z:x.mesh.position.z,d:Math.hypot(x.mesh.position.x-q.zerg.bug.mesh.position.x,x.mesh.position.z-q.zerg.bug.mesh.position.z)})).sort((a,b)=>a.d-b.d)[0];if(q2)q.setCamYaw(Math.atan2(q2.x-q.zerg.bug.mesh.position.x,q2.z-q.zerg.bug.mesh.position.z));});
        else s=await aimAt(CORE[0],CORE[1],s);
        if(s.clawCd<=0){await p.keyboard.press('KeyJ');biteN++;}
        else if(s.spitCd<=0&&atk===CORE){s=await aimAt(CORE[0],CORE[1],s);await p.keyboard.press('KeyK');acidN++;if(acidN===1)await mark('core-acid-1');}
        if(hpPct<.7&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
        else if(s.sumCd<=0&&s.biomass>=60&&s.swarm<26){await p.keyboard.press('KeyU');warN++;if(warN===1)await mark('summon-screen-1');await sleep(300);}
        await sleep(80);continue;
      }
      // ===== 西侧绕后行军：疾跑+四向防卡+冲刺脱困；进狙击圈前召兵吸火力；守军贴身顺手撕 =====
      if(wpIdx>=ROUTE.length){await sleep(200);continue;}
      const [gx,gz]=ROUTE[wpIdx];
      const dg=Math.hypot(gx-s.bx,gz-s.bz);
      const dCoreNow=Math.hypot(CORE[0]-s.bx,CORE[1]-s.bz);
      if(Date.now()-progLog>6000){progLog=Date.now();
        console.log('PROG',Math.round((Date.now()-started)/1000)+'s','flank',wpIdx,'dg',Math.round(dg),'at',s.bx+','+s.bz,'hp',Math.round(hpPct*100)+'%','bio',s.biomass,'swarm',s.swarm,'deaths',s.deaths,'core',s.baseHp,'bite',biteN,'acid',acidN,'molt',moltN);}
      if(!SMOKE&&!viewDone&&wpIdx===1&&dg>40){viewDone=true;await p.keyboard.press('KeyC');viewBackAt=Date.now()+4000;await mark('view-1st');}
      if(viewBackAt&&Date.now()>viewBackAt){viewBackAt=0;await p.keyboard.press('KeyC');await sleep(400);await mark('view-3rd');}
      s=await aimAt(gx,gz,s);
      const dx=gx-s.bx,dz=gz-s.bz,mag=Math.hypot(dx,dz)||1;
      const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
      const want=[];if(f>.5)want.push('KeyW');else if(f<-.5)want.push('KeyS');if(r>.5)want.push('KeyD');else if(r<-.5)want.push('KeyA');
      if(lastPos&&Math.hypot(s.bx-lastPos.x,s.bz-lastPos.z)<.5)stuckN++;else stuckN=0;
      lastPos={x:s.bx,z:s.bz};
      if(stuckN>40){ // 四向点按救不了 → 长按 2.2s 持续脱困 + 冲刺
        const dir=STUCK_SEQ[Math.floor(stuckN/40)%4];
        await keys(dir);if(s.dashCd<=0)await p.keyboard.press('KeyL');await sleep(2200);await keys([]);
        stuckN=0;lastPos=null;console.log('UNWEDGE hold',dir.join('+'),'at',s.bx+','+s.bz);
      }else{
        if(stuckN>5)await keys(STUCK_SEQ[Math.floor(stuckN/7)%4]);else await keys(want);
        if(s.dashCd<=0&&stuckN>5)await p.keyboard.press('KeyL');
        if(stuckN>26){console.log('STUCK-SKIP wp',wpIdx,'at',s.bx,s.bz);wpIdx++;lastPos=null;stuckN=0;wpSince=Date.now();}
      }
      if(want.length){if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
      else if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
      if(dg<=7){wpIdx++;lastPos=null;stuckN=0;wpSince=Date.now();marchRetries=0;continue;}
      if(Date.now()-wpSince>25000){console.log('WP-TIMEOUT skip',wpIdx,'at',s.bx+','+s.bz);wpIdx++;lastPos=null;stuckN=0;wpSince=Date.now();continue;}
      // 进狙击圈（距核心<45）起召兵：3 战士即时出巢扑向人类，吸走塔火
      if(dCoreNow<45&&s.sumCd<=0&&s.biomass>=100&&s.swarm<12){await p.keyboard.press('KeyU');warN++;await mark('flank-summon-'+warN);await sleep(300);}
      // 行军蜕皮保底
      if(hpPct<.45&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-march-'+moltN);await sleep(250);}
      await sleep(120);
    }
    await keys([]);
    const fin=await observe();
    if(fin.over&&!winMarked){winMarked=true;await mark(fin.baseHp<=0?'victory':'round-over');}
    await sleep(SMOKE||NOREC?1500:7000);
    await mark('final-result');
    let audioStart=0;
    if(!NOREC){
      await cdp.send('Page.stopScreencast');recording=false;
      const audio=await p.evaluate(async()=>{await new Promise(r=>{__movieRec.onstop=r;__movieRec.stop();});return{start:__movieAudioStart,bytes:Array.from(new Uint8Array(await new Blob(__movieChunks).arrayBuffer()))};});
      fs.writeFileSync(path.join(OUT,'game-audio.webm'),Buffer.from(audio.bytes));
      audioStart=audio.start;
    }
    const data={take:process.env.TAKE||'zerg-run10',url:GAME_URL,started,audioStart,duration_s:+((Date.now()-started)/1000).toFixed(2),frames:frames.length,events,states,errors,finalState:fin,
      build:'线上部署 https://www.zhengxiaohui.cn（2026-10-10 飞虫修复版：zerg-mode.js/game.compat.js 已核验）',
      strategy:'v30 西侧绕后偷家（三探针实证：城墙不向西延伸 x=-40 全程可走；口袋(-16,-46)距核心5.7 爪60/酸75可命中；summon 即身出巢±4u）：v29走廊[(-69,140),(-69,90),(-69,20)]→西路[(-52,20),(-40,20),(-40,-30),(-36,-44),(-26,-46)]→口袋；进狙击圈(dg<45)召兵吸火力（炮塔索敌=最近目标，守军更近）；口袋决战=爪+酸核心177dps+召群肉盾+蜕皮40/8s+近身守军撕+25；核心2000血≈12-18s拆完',
      gameplay_modified:false,time_scale:1,normal_rule_inputs_only:true,qa_hook_usage:'read-only observe',no_recording:NOREC};
    fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(data,null,2));
    if(!NOREC)fs.writeFileSync(path.join(OUT,'frames.json'),JSON.stringify(frames));
    console.log('CAPTURE COMPLETE',data.duration_s,'frames',frames.length,'events',events.length,'overTitle',fin.overTitle);
  }catch(e){
    fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:e.stack,events,frames:frames.length,errors},null,2));
    throw e;
  }finally{await keys([]).catch(()=>{});recording=false;await context.close().catch(()=>{});await browser.close().catch(()=>{});}
})().catch(e=>{console.error('CAPTURE-FAIL',e.message);process.exit(1);});

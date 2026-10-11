// 虫族模式实机采集 v29：线上部署版本，QA 钩子只读观察，输入全部为真实键盘事件，正常规则不改数值。
// v29 打法重构（run7/run8 复盘：8 局全败，破门后冲核必被堡垒100dps+狙击84dps+加农37.5dps 融化）：
//   实测建筑血量（game.compat.js）：机枪 hp250/r26/50dps ×4，狙击 hp280/r55/84dps，加农 hp350/r36/37.5dps，
//   堡垒 hp1200/r30/100dps，对空 ×2 只锁飞虫（r52/97dps）——地面免疫，故全程禁召飞虫。
//   ① 围攻位(1,12) 距前线双机枪 28.7/29.7：酸程 30 内、机枪射程 26 外——磨门到 900 血时先安全酸死双机枪；
//   ② 双机枪亡后母虫贴门爪+酸 177dps 速破门（兽群分摊狙击/堡垒火力，血<50% 蜕皮续命，死亡可接受——兽群会啃完城门）；
//   ③ 破门后就绪=兽群>=8+血65%+dash 好 → dash 冲走廊（兽群跟进出巢顶火力），否则退围攻位当"召唤引擎"（60 生物量/6s）；
//   ④ 核心贴脸爪 60×0.6=36 生物量/口=65/s 自循环，召唤虫就地出巢即时分摊，蜕皮 8s 续命——滚雪球到胜。
// v28.1 保留：周期落盘 frames.json/capture-partial.json 每 30s 防崩溃丢帧。
const fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const OUT=path.join(__dirname,'capture',process.env.TAKE||'zerg-run2');fs.mkdirSync(OUT,{recursive:true});
const GAME_URL=process.env.GAME_URL||'https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const SMOKE=!!process.env.SMOKE;const NOREC=!!process.env.NOREC;const GATE_ONLY=!!process.env.GATE_ONLY;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
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
    turrets:q.buildings.filter(t=>!t.dead).map(t=>({x:+t.mesh.position.x.toFixed(1),z:+t.mesh.position.z.toFixed(1),hp:Math.round(t.hp||0)})),
    gateX:+q.gate.mesh.position.x.toFixed(1),gateZ:+q.gate.mesh.position.z.toFixed(1),gateHp:Math.round(q.gate.hp),gateDead:q.gate.dead,
    baseX:+q.base.pos.x.toFixed(1),baseZ:+q.base.pos.z.toFixed(1),baseHp:Math.round(q.base.hp),baseMax:Math.round(q.base.maxHp),
    overTitle:(document.getElementById('overTitle')||{}).textContent||''};});}
  async function mark(name){const s=await observe();const e={name,t:+((Date.now()-started)/1000).toFixed(2),game:s.timeLeft,state:{...s,squads:s.squads.length,turrets:s.turrets.length}};events.push(e);console.log('EVENT',name,e.t,'gate',s.gateHp,'base',s.baseHp,'bio',s.biomass,'swarm',s.swarm,'hp',s.bhp);if(!NOREC)await p.screenshot({path:path.join(OUT,name+'.png')});}
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
    // ===== 策略层 v29（nest(1,176) gate(0,-16) base(-12,-42)；前线机枪(±15,-13)；GATE_FACE=门北脸）=====
    const MARCH=[[-69,140],[-69,90],[-69,20],[-14,18],[1,11]];
    const ASSAULT=[[0,-12],[-4,-22],[-11.8,-42]];
    const SIEGE=[1,11],FARM=[-11.8,-42],GATE_FACE=[0,-13.2];
    const MGS=[[-15,-13],[15,-13]];          // 前线双机枪：围攻位可安全酸
    const MGKILL_GHP=900;                    // 城门剩余 900 时转杀机枪
    let wpIdx=0,phase='march',way=MARCH,turnKey=null,turnRate=1.9;
  let lastPos=null,stuckN=0,wpSince=Date.now(),progLog=0;
  let biteN=0,acidN=0,moltN=0,warN=0,dashN=0,viewDone=false,viewBackAt=0;
  let gateMarks=new Set(),baseMarks=new Set(),siegeMarked=false,farmMarked=false,rushMarked=false;
  let lastAcidGateN=0,lastGateHp=-1,missAcid=0,acidGateN=0;
  let takedownAt=0;const mgMarked=new Set(),mgDown=new Set();
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    // Q/E 自适应转向：校准一次方向，之后按误差比例转（真实键盘输入）
    async function aimAt(tx,tz,obs){
      const dx=tx-obs.bx,dz=tz-obs.bz;const want=Math.atan2(dx,dz);let err=wrap(want-obs.yaw);
      if(Math.abs(err)<.12)return obs;
      if(!turnKey){
        const y0=obs.yaw;await p.keyboard.down('KeyE');await sleep(160);await p.keyboard.up('KeyE');
        const y1=(await observe()).yaw,d=wrap(y1-y0);turnKey=d>0?'KeyE':'KeyQ';turnRate=Math.abs(d)/.16||1;
        err=wrap(want-y1);obs={...obs,yaw:y1};
      }
      const dur=Math.min(500,Math.max(60,Math.abs(err)/turnRate*1000));
      await p.keyboard.down(turnKey);await sleep(dur);await p.keyboard.up(turnKey);
      lastMoveAt=Date.now();
      return await observe();
    }
    const watchdog=Date.now()+(SMOKE?(+process.env.SMOKE_T||28000)+25000:470000);
    while(Date.now()<watchdog){
      let s=await observe();
      if(s.state!=='battle')break;
      if(Date.now()-progLog>1500&&states[states.length-1]?.t!==+((Date.now()-started)/1000).toFixed(1))states.push({t:+((Date.now()-started)/1000).toFixed(1),...s,squads:s.squads.length,turrets:s.turrets.length});
      // v28.1 周期落盘：每 30s 保底一份，防浏览器崩溃丢整局帧索引
      if(frames.length&&Date.now()-lastFlush>30000){lastFlush=Date.now();
        try{fs.writeFileSync(path.join(OUT,'frames.json'),JSON.stringify(frames));
          fs.writeFileSync(path.join(OUT,'capture-partial.json'),JSON.stringify({take:process.env.TAKE||'zerg-run2',started,duration_s:+((Date.now()-started)/1000).toFixed(2),frames:frames.length,events,states,errors},null,2));}catch(e){}}
      if(s.over){if(!events.some(e=>e.name==='round-over'))await mark('round-over');break;}
      if(!s.bug){await keys([]);if(s.deaths>0&&!events.some(e=>e.name==='bug-down-'+s.deaths))await mark('bug-down-'+s.deaths);
        wpIdx=0;phase='march';way=[...MARCH];wpSince=Date.now();lastPos=null;stuckN=0;await sleep(400);continue;}
      const hpPct=s.bhp/s.bmax;
      // 阶段推进与节点标记
      if(s.gateDead&&!gateMarks.has('gate-dead')){gateMarks.add('gate-dead');await mark('gate-dead');
        wpIdx=0;way=ASSAULT;wpSince=Date.now();lastPos=null;stuckN=0;
        if(s.swarm>=8&&hpPct>=.65&&s.dashCd<=.3){phase='assault';await mark('hot-charge');}
        else{phase='takedown';takedownAt=Date.now();await mark('takedown-hold');}}
      for(const th of [75,50,25]){
        if(!gateMarks.has('gate-'+th)&&!s.gateDead&&s.gateHp<=2500*th/100&&s.gateHp>0){gateMarks.add('gate-'+th);await mark('gate-'+th);}
        if(!baseMarks.has('base-'+th)&&s.baseHp<=s.baseMax*th/100&&s.baseHp>0){baseMarks.add('base-'+th);await mark('base-'+th);}
      }
      if(phase==='assault'&&Math.hypot(s.bx-FARM[0],s.bz-FARM[1])<9){phase='grind';}
      if(GATE_ONLY&&s.gateDead){await mark('gate-only-stop');break;}
      const mgAlive=MGS.filter(([x,z])=>s.turrets.some(t=>Math.abs(t.x-x)<2.5&&Math.abs(t.z-z)<2.5)).length;
      // ===== 围攻期(1,12)：酸磨城门；gate<=900 先酸死前线双机枪（安全位白嫖）；双机枪亡+血70% → 贴门速破门 =====
      if(phase==='siege'&&!s.gateDead&&mgAlive===0&&s.gateHp<=MGKILL_GHP&&hpPct>=.75&&s.biomass>=40){
        phase='gaterush';way=[GATE_FACE];wpIdx=0;wpSince=Date.now();lastPos=null;stuckN=0;
        if(!rushMarked){rushMarked=true;await mark('gate-rush');}
        await sleep(120);continue;
      }
      // ===== 破门后兵海决胜。就绪=兽群>=8+血65%+dash 好 → dash 冲走廊；否则围攻位召唤引擎（60/6s）；
      //      禁 yolo 送死，仅 timeLeft<50 兽命换时间强冲。=====
      if(phase==='takedown'){
        const ready=s.swarm>=8&&hpPct>=.65&&s.dashCd<=.3;
        if(ready||s.timeLeft<50){phase='assault';wpIdx=0;way=ASSAULT;wpSince=Date.now();lastPos=null;stuckN=0;await mark(ready?'assault-go':'assault-desperate');await sleep(120);continue;}
        if(Math.hypot(SIEGE[0]-s.bx,SIEGE[1]-s.bz)>3){
          s=await aimAt(SIEGE[0],SIEGE[1],s);
          const dx=SIEGE[0]-s.bx,dz=SIEGE[1]-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag;
          if(f>.3){await keys(['KeyW']);if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
          else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys(f<-.3?['KeyS']:[]);}
          await sleep(150);continue;
        }
        await keys([]);
        if(hpPct<.7&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
        else if(s.biomass>=60&&s.sumCd<=0&&s.swarm<40){await p.keyboard.press('KeyU');warN++;await sleep(350);}
        await sleep(150);continue;
      }
      // 目标点选择
      let gx,gz,place;
      if(phase==='siege'){[gx,gz]=SIEGE;place='siege';}
      else if(phase==='gaterush'){[gx,gz]=GATE_FACE;place='gaterush';}
      else if(phase==='grind'){[gx,gz]=FARM;place='grind';}
      else if(wpIdx<way.length){[gx,gz]=way[wpIdx];place='march';}
      else if(s.gateDead){[gx,gz]=FARM;phase='grind';place='grind';}
      else{[gx,gz]=SIEGE;phase='siege';place='siege';}
      const tgt=phase==='siege'||phase==='gaterush'?[s.gateX,s.gateZ]:phase==='grind'?[s.baseX,s.baseZ]:null;
      const dg=Math.hypot(gx-s.bx,gz-s.bz);
      if(Date.now()-progLog>6000){progLog=Date.now();
        if(place==='siege'&&acidGateN>lastAcidGateN&&s.gateHp===lastGateHp){missAcid+=acidGateN-lastAcidGateN;console.log('ACID-MISS total',missAcid,'dGate',Math.round(Math.hypot(s.gateX-s.bx,s.gateZ-s.bz)));}
        lastAcidGateN=acidGateN;lastGateHp=s.gateHp;
        console.log('PROG',Math.round((Date.now()-started)/1000)+'s',place,wpIdx,'dg',Math.round(dg),'at',s.bx+','+s.bz,'hp',Math.round(hpPct*100)+'%','bio',s.biomass,'swarm',s.swarm,'deaths',s.deaths,'gate',s.gateHp,'base',s.baseHp,'mg',mgAlive,'bite',biteN,'acid',acidN,'molt',moltN);}
      // 行军途中的视角演示
      if(!SMOKE&&!viewDone&&place==='march'&&wpIdx===1&&dg>40){viewDone=true;await p.keyboard.press('KeyC');viewBackAt=Date.now()+4000;await mark('view-1st');}
      if(viewBackAt&&Date.now()>viewBackAt){viewBackAt=0;await p.keyboard.press('KeyC');await sleep(400);await mark('view-3rd');}
      // 跑图（含冲锋）。冲锋段全程疾跑+门区补冲刺+途中召唤——步行穿火区必死。
      if(place==='march'||place==='assault'){
        s=await aimAt(gx,gz,s);
        const dx=gx-s.bx,dz=gz-s.bz,mag=Math.hypot(dx,dz)||1;
        const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
        const want=[];if(f>.5)want.push('KeyW');else if(f<-.5)want.push('KeyS');if(r>.5)want.push('KeyD');else if(r<-.5)want.push('KeyA');
        if(lastPos&&Math.hypot(s.bx-lastPos.x,s.bz-lastPos.z)<.5)stuckN++;else stuckN=0;
        lastPos={x:s.bx,z:s.bz};
        const inAssault=phase==='assault'||(s.gateDead&&wpIdx>=MARCH.length);
        if(stuckN>5){
          await keys(stuckN%14<7?['KeyA']:['KeyD']);
          if(s.dashCd<=0)await p.keyboard.press('KeyL');
          if(stuckN>30){console.log('STUCK-SKIP wp',wpIdx,'at',s.bx,s.bz);wpIdx++;lastPos=null;stuckN=0;}
        }else await keys(want);
        const sprint=inAssault||dg>30;
        if(want.length&&sprint){if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
        else if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        if(dg<=7){
          wpIdx++;lastPos=null;stuckN=0;wpSince=Date.now();
          if(place==='march'&&wpIdx>=way.length&&!s.gateDead){phase='siege';if(!siegeMarked){siegeMarked=true;await mark('siege-start');}}
          else if(place==='march'&&wpIdx>=way.length&&s.gateDead){phase='takedown';takedownAt=Date.now();await mark('takedown-resume');}
          continue;
        }
        if(Date.now()-wpSince>25000){console.log('WP-TIMEOUT skip',wpIdx,'at',s.bx+','+s.bz);wpIdx++;lastPos=null;stuckN=0;wpSince=Date.now();continue;}
        // 冲锋伴随：战士虫持续出巢顶火力，路过酸程内炮塔顺手点名
        if(inAssault){
          if(s.biomass>=60&&s.sumCd<=0&&s.swarm<44){await p.keyboard.press('KeyU');warN++;await sleep(300);}
          if(s.spitCd<=0){const nt=s.turrets.map(t=>({t,d:Math.hypot(t.x-s.bx,t.z-s.bz)})).sort((x,y)=>x.d-y.d)[0];
            if(nt&&nt.d<27){const s2=await aimAt(nt.t.x,nt.t.z,await observe());await p.keyboard.press('KeyK');acidN++;await sleep(150);}}
        }
        // dash 时机：冲锋只在门洞走廊 bz∈(-24,-4)（火力最密处）按；重走行军 dg>35 随手用
        if(s.dashCd<=0&&s.binv<=0&&(inAssault?(s.bz<-4&&s.bz>-24):dg>35)){await p.keyboard.press('KeyL');dashN++;if(dashN===1)await mark('dash-1');}
        if(!s.gateDead&&hpPct<.45&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-march-'+moltN);await sleep(250);}
        if(s.gateDead&&!inAssault&&hpPct<.7&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(200);}
      }else if(place==='siege'){
        // ===== 围攻 (1,12)距门28.1：站桩酸磨门+提前养兵。gate<=900 且双机枪存活 → 优先酸机枪
        //      （距 28.7/29.7 在酸程 30 内、机枪射程 26 外=零还手）。spit() 沿 camForward 锥形索敌(dot>0.2)，
        //      只有静止≥400ms、转向后≥380ms 相机跟上才开酸，否则盲发 MISS。=====
        if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        await keys([]);
        const dGate=Math.hypot(s.gateX-s.bx,s.gateZ-s.bz);
        if(dGate>29.5||dg>3){s=await aimAt(gx,gz,s);
          const dx=gx-s.bx,dz=gz-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
          const w=[];if(f>.5)w.push('KeyW');if(r>.5)w.push('KeyD');else if(r<-.5)w.push('KeyA');
          if(w.length){await keys(w);await sleep(140);await keys([]);}
        }
        const mgWin=mgAlive>0;              // 一到位就先酸死前线双机枪：其 r26 罩住整个门前沿，不杀则战士虫出巢即被扫光、
                                            // 虫群永远攒不起来、城门没人啃；杀完后虫群才能在门前站住分摊狙击火力
        const mgT=mgWin?s.turrets.map(t=>({t,d:Math.hypot(t.x-SIEGE[0],t.z-SIEGE[1])})).filter(o=>MGS.some(([mx,mz])=>Math.abs(o.t.x-mx)<2.5&&Math.abs(o.t.z-mz)<2.5)).sort((a,b)=>a.d-b.d)[0]:null;
        if(!held.size&&s.spitCd<=0&&Date.now()-lastMoveAt>400&&(mgT&&mgT.d<=30.6||!mgT&&dGate<=30)){
          const at=mgT?{x:mgT.t.x,z:mgT.t.z}:{x:s.gateX,z:s.gateZ};
          const y0=s.yaw;s=await aimAt(at.x,at.z,s);
          if(Math.abs(wrap(s.yaw-y0))>.1)await sleep(380);
          if(!held.size){await p.keyboard.press('KeyK');acidN++;if(mgT){if(!mgMarked.has(mgT.t.x+','+mgT.t.z)){mgMarked.add(mgT.t.x+','+mgT.t.z);await mark('acid-mg');}}else{acidGateN++;if(acidGateN===1)await mark('acid-1');}}
        }
        const moltTh=mgAlive?.7:(s.gateHp<=800?.95:.55);
        if(hpPct<moltTh&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
        else if(s.sumCd<=0&&s.swarm<(mgWin?14:40)&&((!mgWin||warN===0)&&s.biomass>=60||mgWin&&s.biomass>=110)){await p.keyboard.press('KeyU');warN++;if(warN===1)await mark('summon-warrior-1');await sleep(350);}
      }else{
        // ===== 贴脸输出（gaterush=门北脸爪+酸 177dps 速破门 / grind=核心爪+酸+就地召唤滚雪球）=====
        if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        await keys([]);
        if(dg>1.5){s=await aimAt(gx,gz,s);
          const dx=gx-s.bx,dz=gz-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
          const w=[];if(f>.5)w.push('KeyW');if(r>.5)w.push('KeyD');else if(r<-.5)w.push('KeyA');
          if(w.length){await keys(w);await sleep(130);await keys([]);}
        }
        if(s.clawCd<=0){await p.keyboard.press('KeyJ');biteN++;if(!farmMarked){farmMarked=true;await mark(place==='gaterush'?'gate-claw':'core-engage');}}
        else if(s.spitCd<=0&&tgt){s=await aimAt(tgt[0],tgt[1],s);await p.keyboard.press('KeyK');acidN++;}
        if(place==='gaterush'){
          if(hpPct<.5&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
          else if(s.biomass>=60&&s.sumCd<=0&&s.swarm<44){await p.keyboard.press('KeyU');warN++;await sleep(300);}
        }else{
          if(hpPct<.95&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
          else if(s.biomass>=60&&s.sumCd<=0&&s.swarm<44){await p.keyboard.press('KeyU');warN++;await sleep(300);}
        }
      }
      if((SMOKE||NOREC)&&(Date.now()-started)>(+process.env.SMOKE_T||28000)){await mark('smoke-stop');break;}
      await sleep(place==='siege'?60:200);
    }
    await keys([]);
    const fin=await observe();
    if(fin.over&&!events.some(e=>e.name==='round-over'))await mark('round-over');
    await sleep(SMOKE||NOREC?1500:7000);
    await mark('final-result');
    let audioStart=0;
    if(!NOREC){
      await cdp.send('Page.stopScreencast');recording=false;
      const audio=await p.evaluate(async()=>{await new Promise(r=>{__movieRec.onstop=r;__movieRec.stop();});return{start:__movieAudioStart,bytes:Array.from(new Uint8Array(await new Blob(__movieChunks).arrayBuffer()))};});
      fs.writeFileSync(path.join(OUT,'game-audio.webm'),Buffer.from(audio.bytes));
      audioStart=audio.start;
    }
    const data={take:process.env.TAKE||'zerg-run2',url:GAME_URL,started,audioStart,duration_s:+((Date.now()-started)/1000).toFixed(2),frames:frames.length,events,states,errors,finalState:fin,
      build:'线上部署 https://www.zhengxiaohui.cn（2026-10-10 飞虫修复版：zerg-mode.js/game.compat.js 已核验含 flightAfterExit）',
      strategy:'v29 三段决胜：①围攻位(1,12)酸磨门+60生物量/6s提前养兵（禁飞虫：对空炮r52专锁飞虫）→gate900转酸前线双机枪(28.7/29.7在酸程30内机枪射程26外零还手)→②双机枪亡+血70%贴门爪+酸177dps速破门(兽群分摊狙击/堡垒火力,血50%蜕皮,死亡可接受兽群啃门)→③破门后兽群>=8+血65%+dash好才dash冲走廊(否则围攻位召唤引擎60/6s),核心贴脸爪65生物量/s自循环+就地召唤滚雪球;建筑血量实测:机枪250/狙击280/加农350/堡垒1200/对空400',
      gameplay_modified:false,time_scale:1,normal_rule_inputs_only:true,qa_hook_usage:'read-only observe',no_recording:NOREC};
    fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(data,null,2));
    if(!NOREC)fs.writeFileSync(path.join(OUT,'frames.json'),JSON.stringify(frames));
    console.log('CAPTURE COMPLETE',data.duration_s,'frames',frames.length,'events',events.length,'overTitle',fin.overTitle);
  }catch(e){
    fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:e.stack,events,frames:frames.length,errors},null,2));
    throw e;
  }finally{await keys([]).catch(()=>{});recording=false;await context.close().catch(()=>{});await browser.close().catch(()=>{});}
})().catch(e=>{console.error('CAPTURE-FAIL',e.message);process.exit(1);});

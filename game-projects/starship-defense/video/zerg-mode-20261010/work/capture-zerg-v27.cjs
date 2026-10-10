// 虫族模式实机采集 v28：线上部署版本，QA 钩子只读观察，输入全部为真实键盘事件，正常规则不改数值。
// v27 冒烟复盘：机枪双亡判定有效，但 takedown 等待期站围攻位(1,12)被狙击塔(r55 覆盖)点名耗死——
//     bio 15 无兵可召无血可蜕，9 秒都没活到 45s 超时。另：穿门洞到核心全程 52u 都在堡垒 r30 火圈内，
//     满血+完美 dash 理论承伤 1370>950——**唯一活路是战士虫分摊**（炮塔索敌=最近目标，swarm 越多母虫承伤越低）。
// v28 决胜版（兵海分摊+圈外等待）：
//   ① hot-charge 四条件：hp>=75% + 机枪双亡 + dash 就绪 + swarm>=8（兵海是穿火硬门槛）；
//   ② takedown 等待位置二分：机枪有活口→围攻位白嫖酸；机枪全亡→退 (1,45) 狙击圈外(距65.5>55)，
//     蹭虫洞免费增援(每14s×2只)攒到 swarm>=8 再冲，等待期付得起就蜕皮；
//   ③ 磨门后期 gateHp<=800 蜕皮阈值 .95 提前拉满；重生只走 MARCH 统一走养兵门槛；
//   ④ 冲锋 dash 精确在门洞走廊 bz∈(-24,-4) 按 L；冲锋中禁蜕皮；45s 超时/timeLeft<55 强制冲（最后一命 hp70%）。
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
  const errors=[],events=[],states=[],frames=[];let started=0,recording=false,lastSaved=0;
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
    // ===== 策略层 v26（地图实测 nest(1,176) gate(0,-16) base(-12,-42)，前排塔(±15,-13)被墙挡弹）=====
    const MARCH=[[-69,140],[-69,90],[-69,20],[-30,16],[1,12]];
    const PASS=[[0,-12],[-6,-14]];
    const ASSAULT=[[0,-12],[-4,-22],[-11.8,-42]];
    const REGROUP=[1,45];
    const SIEGE=[1,12],FARM=[-11.8,-42];
    let wpIdx=0,phase='march',way=MARCH,turnKey=null,turnRate=1.9;
  let lastPos=null,stuckN=0,wpSince=Date.now(),progLog=0,strafeDir=1,strafeAt=0;
  let biteN=0,acidN=0,moltN=0,warN=0,flyN=0,dashN=0,viewDone=false,viewBackAt=0;
  let turretBlocked=false,acidOnT=0,lastTurretHp=-1,passIdx=0;let gateMarks=new Set(),baseMarks=new Set(),siegeMarked=false,farmMarked=false,regroup=false,regroupN=0;
  let missAcid=0,lastAcidN=0,lastGateHp=-1,regroupAt=0;
  let takedownAt=0;const MGS=[[-15,-13],[15,-13]];const mgMarked=new Set(),mgDown=new Set();
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
      if(s.over){if(!events.some(e=>e.name==='round-over'))await mark('round-over');break;}
      if(!s.bug){await keys([]);if(s.deaths>0&&!events.some(e=>e.name==='bug-down-'+s.deaths))await mark('bug-down-'+s.deaths);
        wpIdx=0;phase='march';way=[...MARCH];wpSince=Date.now();lastPos=null;stuckN=0;await sleep(400);continue;}
      const hpPct=s.bhp/s.bmax;
      // 阶段推进与节点标记
      if(s.gateDead&&!gateMarks.has('gate-dead')){gateMarks.add('gate-dead');await mark('gate-dead');
        wpIdx=0;way=ASSAULT;wpSince=Date.now();lastPos=null;stuckN=0;
        const mgAlive=MGS.filter(([x,z])=>s.turrets.some(t=>Math.abs(t.x-x)<2.5&&Math.abs(t.z-z)<2.5)).length;
        if(hpPct>=.75&&mgAlive===0&&s.dashCd<=.3&&s.swarm>=8){phase='assault';await mark('hot-charge');}
        else{phase='takedown';takedownAt=Date.now();await mark(mgAlive>0?'regroup-mg':'regroup-soldiers');}}
      for(const th of [75,50,25]){
        if(!gateMarks.has('gate-'+th)&&!s.gateDead&&s.gateHp<=2500*th/100&&s.gateHp>0){gateMarks.add('gate-'+th);await mark('gate-'+th);}
        if(!baseMarks.has('base-'+th)&&s.baseHp<=s.baseMax*th/100&&s.baseHp>0){baseMarks.add('base-'+th);await mark('base-'+th);}
      }
      if(phase==='assault'&&Math.hypot(s.bx-FARM[0],s.bz-FARM[1])<9){phase='grind';}
      if(GATE_ONLY&&s.gateDead){await mark('gate-only-stop');break;}
      // v26：v22/v25 的集结点撤退与就绪整编均已证伪（run4 零收入死锁 / run7 站桩被狙耗死），不再使用。
      const rush=false,regroup=false;
      if(regroup){
        if(Date.now()-regroupAt>18000){console.log('REGROUP-TIMEOUT back to grind');regroup=false;await keys([]);}
        else if(s.moltCd<=0&&s.biomass>=40){await p.keyboard.press('KeyO');moltN++;regroup=false;await mark('molt-'+moltN);await sleep(250);await keys([]);}
        else if(Math.hypot(REGROUP[0]-s.bx,REGROUP[1]-s.bz)>2.5){s=await aimAt(REGROUP[0],REGROUP[1],s);await keys(['KeyW']);if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
        else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys([]);}
        await sleep(180);continue;
      }
      // ===== v28 破门后兵海决胜：穿火唯一活路=战士分摊（炮塔索敌=最近目标）。就绪=机枪双亡+swarm>=8
      //      +hp75%+dash好；等待位置二分：机枪活口→围攻位白嫖酸（其射程26<距29.7<酸程30），
      //      机枪全亡→退 (1,45) 狙击圈外蹭免费增援（每14s×2只）攒兵。45s 超时强制冲。=====
      if(phase==='takedown'){
        const lastLife=s.deaths>=4;
        const mgs=MGS.map(([x,z],i)=>({i,x,z,t:s.turrets.find(t=>Math.abs(t.x-x)<2.5&&Math.abs(t.z-z)<2.5)}));
        for(const m of mgs)if(!m.t&&!mgDown.has(m.i)){mgDown.add(m.i);await mark('mg-down-'+(m.i+1));}
        const alive=mgs.filter(m=>m.t);
        const ready=alive.length===0&&s.swarm>=8&&hpPct>=(lastLife?.7:.75)&&s.dashCd<=.3;
        if(ready||Date.now()-takedownAt>45000||s.timeLeft<55){phase='assault';wpIdx=0;way=ASSAULT;wpSince=Date.now();lastPos=null;stuckN=0;await mark(ready?'assault-go':'assault-yolo');await sleep(120);continue;}
        const home=alive.length?SIEGE:REGROUP;
        if(Math.hypot(home[0]-s.bx,home[1]-s.bz)>3){
          s=await aimAt(home[0],home[1],s);
          const dx=home[0]-s.bx,dz=home[1]-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag;
          if(f>.3){await keys(['KeyW']);if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
          else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys(f<-.3?['KeyS']:[]);}
          await sleep(150);continue;
        }
        await keys([]);
        const m=alive[0];
        if(m&&Date.now()-lastMoveAt>400&&s.spitCd<=0){
          const y0=s.yaw;s=await aimAt(m.x,m.z,s);
          if(Math.abs(wrap(s.yaw-y0))>.1)await sleep(380);
          if(!held.size&&s.spitCd<=0){await p.keyboard.press('KeyK');acidN++;if(!mgMarked.has(m.i)){mgMarked.add(m.i);await mark('acid-mg-'+(m.i+1));}}
        }
        if(hpPct<.95&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
        else if(s.biomass>=130&&s.sumCd<=0&&s.swarm<40){await p.keyboard.press('KeyU');warN++;await sleep(350);}
        await sleep(120);continue;
      }
      // 目标点选择
      let gx,gz,place;
      if(phase==='siege'){[gx,gz]=SIEGE;place='siege';}
      else if(phase==='grind'){[gx,gz]=FARM;place='grind';}
      else if(wpIdx<way.length){[gx,gz]=way[wpIdx];place='march';}
      else if(s.gateDead){[gx,gz]=FARM;phase='grind';place='grind';}
      else{[gx,gz]=SIEGE;phase='siege';place='siege';}
      const tgt=phase==='siege'?[s.gateX,s.gateZ]:phase==='grind'?[s.baseX,s.baseZ]:null;
      const dg=Math.hypot(gx-s.bx,gz-s.bz);
      if(Date.now()-progLog>6000){progLog=Date.now();
        if(place==='siege'&&acidN>lastAcidN&&s.gateHp===lastGateHp){missAcid+=acidN-lastAcidN;console.log('ACID-MISS total',missAcid,'dGate',Math.round(Math.hypot(s.gateX-s.bx,s.gateZ-s.bz)));}
        lastAcidN=acidN;lastGateHp=s.gateHp;
        console.log('PROG',Math.round((Date.now()-started)/1000)+'s',place,wpIdx,'dg',Math.round(dg),'at',s.bx+','+s.bz,'hp',Math.round(hpPct*100)+'%','bio',s.biomass,'swarm',s.swarm,'deaths',s.deaths,'gate',s.gateHp,'base',s.baseHp,'bite',biteN,'acid',acidN,'molt',moltN);}
      // 行军途中的视角演示
      if(!SMOKE&&!viewDone&&place==='march'&&wpIdx===1&&dg>40){viewDone=true;await p.keyboard.press('KeyC');viewBackAt=Date.now()+4000;await mark('view-1st');}
      if(viewBackAt&&Date.now()>viewBackAt){viewBackAt=0;await p.keyboard.press('KeyC');await sleep(400);await mark('view-3rd');}
      // 跑图（含冲锋）。冲锋段全程疾跑+门区补冲刺+途中蜕皮/召唤——步行穿火区必死（v14 教训）。
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
        // 冲锋伴随：战士虫持续出巢顶火力（门伤返 0.25 生物量此时最富），路过酸程内炮塔顺手点名
        if(inAssault){
          if(s.biomass>=60&&s.sumCd<=0&&s.swarm<46){await p.keyboard.press('KeyU');warN++;await sleep(300);}
          if(s.spitCd<=0){const nt=s.turrets.map(t=>({t,d:Math.hypot(t.x-s.bx,t.z-s.bz)})).sort((x,y)=>x.d-y.d)[0];
            if(nt&&nt.d<27){const s2=await aimAt(nt.t.x,nt.t.z,await observe());await p.keyboard.press('KeyK');acidN++;await sleep(150);}}
        }
        // v27 dash 时机：冲锋只在门洞走廊 bz∈(-24,-4)（火力最密处）按；重走行军 dg>35 随手用（到围攻位早已冷却）
        if(s.dashCd<=0&&s.binv<=0&&(inAssault?(s.bz<-4&&s.bz>-24):dg>35)){await p.keyboard.press('KeyL');dashN++;if(dashN===1)await mark('dash-1');}
        if(!s.gateDead&&hpPct<.45&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-march-'+moltN);await sleep(250);}
        // 冲锋中禁蜕皮（动作窗口=死）；仅重走行军时蜕
        if(s.gateDead&&!inAssault&&hpPct<.7&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(200);}
      }else if(place==='siege'){
        // ===== 围攻 (1,12)距门28.1：站桩酸磨门+战士诱饵。spit() 沿 camForward 锥形索敌(dot>0.2)，
        //      只有静止≥400ms、转向后≥380ms 相机跟上才开酸，否则盲发 MISS（run4 四发零伤害）。
        //      v27：磨门后期 gateHp<=800 蜕皮阈值提前 .95 拉满血线再破门（run8 教训：500 太晚）。=====
        if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        await keys([]);
        const dGate=Math.hypot(s.gateX-s.bx,s.gateZ-s.bz);
        if(dGate>29.5||dg>3){s=await aimAt(gx,gz,s);
          const dx=gx-s.bx,dz=gz-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
          const w=[];if(f>.5)w.push('KeyW');if(r>.5)w.push('KeyD');else if(r<-.5)w.push('KeyA');
          if(w.length){await keys(w);await sleep(140);await keys([]);}
        }
        if(!held.size&&s.spitCd<=0&&dGate<=30&&Date.now()-lastMoveAt>400){
          const y0=s.yaw;s=await aimAt(s.gateX,s.gateZ,s);
          if(Math.abs(wrap(s.yaw-y0))>.1)await sleep(380);
          if(!held.size){await p.keyboard.press('KeyK');acidN++;if(acidN===1)await mark('acid-1');}
        }
        const moltTh=s.gateHp<=800?.95:.55;
        if(hpPct<moltTh&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
        else if(s.biomass>=130&&s.sumCd<=0&&s.swarm<40){await p.keyboard.press('KeyU');warN++;if(warN===1)await mark('summon-warrior-1');await sleep(350);}
        else if(flyN===0&&hpPct>.6&&s.biomass>=130&&s.flyCd<=0&&s.swarm<40){await p.keyboard.press('KeyI');flyN++;if(flyN===1)await mark('summon-flyer-1');await sleep(350);}
      }else{
        // ===== 核心北侧收割：贴脸撕咬+酸液，咬核心 36/口 蜕皮循环，打到死为止 =====
        if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        await keys([]);
        if(dg>1.5){s=await aimAt(gx,gz,s);
          const dx=gx-s.bx,dz=gz-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
          const w=[];if(f>.5)w.push('KeyW');if(r>.5)w.push('KeyD');else if(r<-.5)w.push('KeyA');
          if(w.length){await keys(w);await sleep(130);await keys([]);}
        }
        if(s.clawCd<=0){await p.keyboard.press('KeyJ');biteN++;if(!farmMarked){farmMarked=true;await mark('core-engage');}}
        else if(s.spitCd<=0&&tgt){s=await aimAt(tgt[0],tgt[1],s);await p.keyboard.press('KeyK');acidN++;}
        if(hpPct<.95&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
        else if(s.biomass>=70&&s.sumCd<=0&&s.swarm<44){await p.keyboard.press('KeyU');warN++;await sleep(300);}
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
      strategy:'v28 兵海分摊版：磨门后期(gateHp<=800)蜕皮.95提前拉满→破门仅当hp75%+机枪双亡+swarm>=8+dash好才hot-charge→否则takedown等待期退(1,45)狙击圈外蹭免费增援攒兵海(机枪有活口时才去围攻位白嫖酸),就绪=机枪双亡+swarm8+hp75%+dash好,45s超时强制→重生只走MARCH→冲锋dash精确门洞走廊bz(-24,-4),禁蜕皮→核心贴脸撕咬+战士分摊滚雪球',
      gameplay_modified:false,time_scale:1,normal_rule_inputs_only:true,qa_hook_usage:'read-only observe',no_recording:NOREC};
    fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(data,null,2));
    if(!NOREC)fs.writeFileSync(path.join(OUT,'frames.json'),JSON.stringify(frames));
    console.log('CAPTURE COMPLETE',data.duration_s,'frames',frames.length,'events',events.length,'overTitle',fin.overTitle);
  }catch(e){
    fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:e.stack,events,frames:frames.length,errors},null,2));
    throw e;
  }finally{await keys([]).catch(()=>{});recording=false;await context.close().catch(()=>{});await browser.close().catch(()=>{});}
})().catch(e=>{console.error('CAPTURE-FAIL',e.message);process.exit(1);});

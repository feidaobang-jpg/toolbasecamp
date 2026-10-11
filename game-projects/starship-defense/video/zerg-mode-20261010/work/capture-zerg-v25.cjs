// 虫族模式实机采集 v24：线上部署版本，QA 钩子只读观察，输入全部为真实键盘事件，正常规则不改数值。
// 威胁模型（源码实测）：狙击塔(8,-20) hp280 dmg160/1.9s(r55)=84dps 是围攻位唯一威胁；堡垒(-8,-20)
//     100dps(r30)、机枪 50dps(r26)、加农 37.5dps(r36) 全在围攻位(1,12)圈外。狙击塔破门前拆不掉
//     （够到它的位置都在堡垒+加农 ~220dps 交叉火力里），只能诱饵+蜕皮硬抗。
// v24 节奏修复（run5 五死溃散复盘）：① 蜕皮阈值 .85→.55（.85 每次浪费 ~165 回血值≈1600 门伤当量/局）
//     ② 生物量 100 才召战士（永远留 40 蜕皮保底，杜绝"没钱蜕皮站桩等死"）③ 围攻循环 200→60ms
//     ④ 整编门槛 .4→.35、静止 500→400ms。破门前酸液会优先命中城门前守军（击杀+25 生物量=资源）。
// v23 在 v22 基础上：围攻期静止开酸（相机跟上才喷）+ 整编经济门槛 + 终局 rush；破门冲锋途中持续召战士顶火力。
// 打法（v20 战士诱饵磨门——v19 探针证伪：酸液真实射程 30（zerg-mode.js humansNear(pos,30)+弹丸 range:30），
//       狙击塔(8,-20)在墙内距围攻位 33.7 够不到、弹道还被门柱(门洞 x∈[-6,6])挡，且其射程 55 覆盖一切
//       能酸到城门(≤30)的位置，破门前狙击塔不可拆；但炮塔索敌=最近怪物(game.js updBuildings 无 LOS)，
//       战士虫冲门全程比母虫更近，天然当全塔诱饵）：
//   行军：西侧虫洞沿 x=-69 直落 z=62，切 (-55,48)(-55,44)，绕 (-20,16)(-6,22) 南侧走廊进场；wpIdx>=5 起边走边召战士先顶火力。
//   围攻 (1,12)：距门 28.1（酸程 30 内，横移不脱靶）、机枪(±15,-13)≥27.7 圈外、守军 24 圈外、加农 36 圈外；
//         纯酸磨门（75伤/1.1s）+战士虫 60bio×3 持续出巢冲门（诱饵+磨门），门伤返 0.25 自我造血；
//         蜕皮 40bio+35%HP 兜底；飞虫 90bio×2 一次性越墙演示（会被防空打掉，镜头素材用）。
//   破门冲锋：穿门洞直插基地核心北侧 (-11.8,-48.5)——咬核心返 0.6/伤害(36/口=65/s 生物量)支撑蜕皮连发，战士虫随行。
//   阵亡=虫洞随机重生重走路线；5 次阵亡或超时判负。
// NOREC=1 纯探针：只记日志与事件，不落帧不录音频（必须配 SMOKE_T>轮次时长，否则 28s 自动停）。GATE_ONLY=1 破门即停。
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
    overTitle:(document.getElementById('overTitle')||{}).textContent||'',result:(document.getElementById('overInfo')||{}).innerText||''};});}
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
    // ===== 策略层 v24（地图实测 nest(1,176) gate(0,-16) base(-12,-42)，前排塔(±15,-13)被墙挡弹）=====
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
        wpIdx=0;phase='march';way=s.gateDead&&mgDown.size>=2?[...MARCH,...ASSAULT]:[...MARCH];wpSince=Date.now();lastPos=null;stuckN=0;await sleep(400);continue;}
      const hpPct=s.bhp/s.bmax;
      // 阶段推进与节点标记
      if(s.gateDead&&!gateMarks.has('gate-dead')){gateMarks.add('gate-dead');await mark('gate-dead');phase='takedown';takedownAt=Date.now();wpIdx=0;way=ASSAULT;wpSince=Date.now();lastPos=null;stuckN=0;}
      for(const th of [75,50,25]){
        if(!gateMarks.has('gate-'+th)&&!s.gateDead&&s.gateHp<=2500*th/100&&s.gateHp>0){gateMarks.add('gate-'+th);await mark('gate-'+th);}
        if(!baseMarks.has('base-'+th)&&s.baseHp<=s.baseMax*th/100&&s.baseHp>0){baseMarks.add('base-'+th);await mark('base-'+th);}
      }
      if(phase==='assault'&&Math.hypot(s.bx-FARM[0],s.bz-FARM[1])<9){phase='grind';}
      if(GATE_ONLY&&s.gateDead){await mark('gate-only-stop');break;}
      // v25 整编机制停用（双重复盘）：没钱时撤退=零收入死锁(run4)，hp<.35 才撤=门口被狙死(冒烟)。
      //     站桩打门本身就是收入(门伤0.25/伤害+守军击杀25)，召唤阈值130永远留70保底蜕皮才是真保险。
      const rush=false;
      const regroup=false;
      if(regroup){
        if(Date.now()-regroupAt>18000){console.log('REGROUP-TIMEOUT back to grind');regroup=false;await keys([]);}
        else if(s.moltCd<=0&&s.biomass>=40){await p.keyboard.press('KeyO');moltN++;regroup=false;await mark('molt-'+moltN);await sleep(250);await keys([]);}
        else if(Math.hypot(REGROUP[0]-s.bx,REGROUP[1]-s.bz)>2.5){s=await aimAt(REGROUP[0],REGROUP[1],s);await keys(['KeyW']);if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
        else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys([]);}
        await sleep(180);continue;
      }
      // ===== v25 破门后拆机枪塔阶段（run6b 复盘：门洞交叉火力 321dps=MG100+堡垒100+狙击84+加农37.5，
      //      满血也只活 3 秒。两座内圈机枪(±15,-13) 射程 26 < 围攻位距离 28.6，酸程 30 刚好白嫖——
      //      各 4 发酸(250hp) 拆掉后交叉火力降到 221dps，满血+冲刺可冲过门洞）=====
      if(phase==='takedown'){
        if(Date.now()-takedownAt>30000||s.timeLeft<90){phase='assault';wpIdx=0;wpSince=Date.now();lastPos=null;stuckN=0;await mark('assault-go');await sleep(120);continue;}
        const mgs=MGS.map(([x,z],i)=>({i,x,z,t:s.turrets.find(t=>Math.abs(t.x-x)<2.5&&Math.abs(t.z-z)<2.5)}));
        for(const m of mgs)if(!m.t&&!mgDown.has(m.i)){mgDown.add(m.i);await mark('mg-down-'+(m.i+1));}
        const m=mgs.find(m=>m.t);
        if(!m){
          const lastLife=s.deaths>=4;
          const ready=hpPct>=(lastLife?.95:.85)&&s.biomass>=(lastLife?100:60)&&s.dashCd<=.5;
          if(ready||s.timeLeft<75){phase='assault';wpIdx=0;wpSince=Date.now();lastPos=null;stuckN=0;await mark('assault-go');await sleep(120);continue;}
          await keys([]);
          if(hpPct<.95&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
          else if(s.biomass>=130&&s.sumCd<=0&&s.swarm<38){await p.keyboard.press('KeyU');warN++;await mark('assault-prep');await sleep(350);}
          await sleep(120);continue;
        }
        if(Math.hypot(SIEGE[0]-s.bx,SIEGE[1]-s.bz)>3){
          s=await aimAt(SIEGE[0],SIEGE[1],s);
          const dx=SIEGE[0]-s.bx,dz=SIEGE[1]-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag;
          if(f>.3){await keys(['KeyW']);if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
          else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys(f<-.3?['KeyS']:[]);}
          await sleep(150);continue;
        }
        await keys([]);
        if(Date.now()-lastMoveAt>400&&s.spitCd<=0){
          const y0=s.yaw;s=await aimAt(m.x,m.z,s);
          if(Math.abs(wrap(s.yaw-y0))>.1)await sleep(380);
          if(!held.size&&s.spitCd<=0){await p.keyboard.press('KeyK');acidN++;if(!mgMarked.has(m.i)){mgMarked.add(m.i);await mark('acid-mg-'+(m.i+1));}}
        }
        if(hpPct<.9&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
        else if(s.biomass>=130&&s.sumCd<=0&&s.swarm<38){await p.keyboard.press('KeyU');warN++;await sleep(350);}
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
      // 跑图（含冲锋）。v15：冲锋段全程疾跑+门区补冲刺+途中蜕皮/召唤——v14 三命皆殁于步行穿火区。
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
          else if(place==='march'&&wpIdx>=way.length&&s.gateDead&&mgDown.size<2){phase='takedown';takedownAt=Date.now();await mark('takedown-resume');}
          continue;
        }
        if(Date.now()-wpSince>25000){console.log('WP-TIMEOUT skip',wpIdx,'at',s.bx+','+s.bz);wpIdx++;lastPos=null;stuckN=0;wpSince=Date.now();continue;}
        // v23 破门冲锋伴随：战士虫持续出巢顶火力（门伤返 0.25 生物量此时最富），路过酸程内炮塔顺手点名
        if(inAssault){
          if(s.biomass>=60&&s.sumCd<=0&&s.swarm<46){await p.keyboard.press('KeyU');warN++;await sleep(300);}
          if(s.spitCd<=0){const nt=s.turrets.map(t=>({t,d:Math.hypot(t.x-s.bx,t.z-s.bz)})).sort((x,y)=>x.d-y.d)[0];
            if(nt&&nt.d<27){const s2=await aimAt(nt.t.x,nt.t.z,await observe());await p.keyboard.press('KeyK');acidN++;await sleep(150);}}
        }
        if(s.dashCd<=0&&s.binv<=0&&(inAssault?dg<26:dg>35)){await p.keyboard.press('KeyL');dashN++;if(dashN===1)await mark('dash-1');}
        if(!s.gateDead&&hpPct<.45&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-march-'+moltN);await sleep(250);}
        if(s.gateDead&&hpPct<.95&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(200);}
      }else if(place==='siege'){
        // ===== 围攻 (1,12)距门28.1：站桩酸磨门+战士诱饵。run4 教训：spit() 沿 camForward 锥形索敌(dot>0.2)，
        //      身体一转相机滞后→锥内找不到目标→盲发 MISS（run4 四发零伤害）；只有静止≥500ms、
        //      转向后≥380ms 相机跟上才开酸。狙击塔(8,-20) hp280 破门前拆不掉，战士虫当诱饵吸收。 =====
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
        if(hpPct<.7&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
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
      strategy:'v25 拆塔决胜版：行军(x=-69走廊)→(1,12)站桩酸磨门(蜕皮.55/召战士留70保底/整编hp<.35且bio>=40+18s超时+终局rush)——破门后先在围攻位酸拆两座内圈机枪(±15,-13)各4发(run6b教训:门洞交叉火力321dps满血3秒融化,MG射程26<28.6白嫖)→就绪门槛(满血85%+/bio60+/冲刺好)→门洞冲刺进核心(-12,-42)贴脸撕咬(核心伤返0.6生物量滚雪球,蜕皮.95连发,战士持续出巢顶堡垒/狙击火力)',
      gameplay_modified:false,time_scale:1,normal_rule_inputs_only:true,qa_hook_usage:'read-only observe',no_recording:NOREC};
    fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(data,null,2));
    if(!NOREC)fs.writeFileSync(path.join(OUT,'frames.json'),JSON.stringify(frames));
    console.log('CAPTURE COMPLETE',data.duration_s,'frames',frames.length,'events',events.length,'overTitle',fin.overTitle);
  }catch(e){
    fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:e.stack,events,frames:frames.length,errors},null,2));
    throw e;
  }finally{await keys([]).catch(()=>{});recording=false;await context.close().catch(()=>{});await browser.close().catch(()=>{});}
})().catch(e=>{console.error('CAPTURE-FAIL',e.message);process.exit(1);});

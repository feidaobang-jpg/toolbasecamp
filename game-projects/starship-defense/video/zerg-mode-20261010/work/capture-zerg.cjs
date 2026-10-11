// 虫族模式实机采集 v26：线上部署版本，QA 钩子只读观察，输入全部为真实键盘事件，正常规则不改数值。
// v26 速射修复（v25 探针 345s 五死仍差 875 门血）：酸液实际只打出 0.17 发/秒，瓶颈是"静止 400ms+转向后
//     380ms 才开酸"这条旧规则——getCamYaw() 返回的就是相机朝向，相机锥内已对齐城门即可立即开火，
//     于是改为"按相机 yaw 校准（|err|≤0.2）→ 立刻 KeyK"。2500 门血 ÷75 伤 = 34 发命中 ≈ 45 秒破门，
//     省下 ~150 秒留给终局（v25 的 rally 集结+assault 穿门+grind 贴核心收割）。
// v25 终局重做（run5/run6b 破门后 3 秒暴毙复盘）：穿门洞直接冲核心=独自吃院内塔群 ~320dps 集火，母虫 950HP 必死。
//     改为 rally 整备位 (1,2)：破门后先在门口南侧集结，持续召战士（60bio），等≥8 只战士已入场（z<0）
//     且母虫血>85% 才随虫潮一起穿门——炮塔索敌=最近怪物无LOS，战士先行吸收火力；穿门后全程疾跑+边走边蜕，
//     到位即贴核心连撕（36bio/口）支撑蜕皮连发，攻不下来也保留完整"虫群涌入城内"高潮镜头。
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
  const held=new Set();
  async function keys(wanted){for(const k of [...held])if(!wanted.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of wanted)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}if(wanted.length)lastMoveAt=Date.now();}
  async function observe(){return p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{
    state:q.Game.state,zergOn:q.zergOn(),over:z.over,timeLeft:Math.round(z.timeLeft),biomass:Math.round(z.biomass),deaths:z.deaths,
    bug:!!(b&&!b.dead),bx:b?+b.mesh.position.x.toFixed(1):null,bz:b?+b.mesh.position.z.toFixed(1):null,
    bhp:b?Math.round(b.hp):0,bmax:b?Math.round(b.maxHp):0,binv:b?+(+b.invuln).toFixed(1):0,
    clawCd:+(+z.clawCd).toFixed(2),spitCd:+(+z.spitCd).toFixed(2),sumCd:+(+z.sumCd).toFixed(2),flyCd:+(+z.flyCd).toFixed(2),moltCd:+(+z.moltCd).toFixed(2),dashCd:+(+z.dashCd).toFixed(2),dashT:+(+z.dashT).toFixed(2),
    yaw:+q.getCamYaw().toFixed(3),camMode:(q.getCamMode&&q.getCamMode())||'',
    swarm:q.monsters.filter(m=>!m.dead&&m!==b).length,
    bugs:q.monsters.filter(m=>!m.dead&&m!==b).map(m=>({x:+m.mesh.position.x.toFixed(1),z:+m.mesh.position.z.toFixed(1)})),
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
    // ===== 策略层 v25（地图实测 nest(1,176) gate(0,-16) base(-12,-42)，前排塔(±15,-13)被墙挡弹）=====
    // MARCH = run3 录到 174s 破门的 v20 已验证路线（西侧 x=-69 走廊直落，南侧走廊进场）
    const MARCH=[[-69,140],[-69,90],[-69,62],[-55,48],[-55,44],[-20,16],[-6,22],[1,12]];
    const ASSAULT=[[0,-12],[-4,-22],[-11.8,-42]];
    const REGROUP=[1,40],RALLY_RUS=[0,30];
    const SIEGE=[1,12],FARM=[-11.8,-42];
    let wpIdx=0,phase='march',way=MARCH,turnKey=null,turnRate=1.9;
  let lastPos=null,stuckN=0,wpSince=Date.now(),progLog=0,strafeDir=1,strafeAt=0;
  let biteN=0,acidN=0,moltN=0,warN=0,flyN=0,dashN=0,viewDone=false,viewBackAt=0;
  let turretBlocked=false,acidOnT=0,lastTurretHp=-1,passIdx=0,lastMoveAt=0,regroupAt=0;
  let lastAcidN=0,lastGateHp=-1,missAcid=0,rallyAt=0;let gateMarks=new Set(),baseMarks=new Set(),siegeMarked=false,farmMarked=false,regroup=false,regroupN=0;
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
    // 朝目标点真实前进（Q/E 校准朝向 + WASD 推进，可选 Shift 疾跑）
    async function goTo(tx,tz,obs,sprint){
      obs=await aimAt(tx,tz,obs);
      const dx=tx-obs.bx,dz=tz-obs.bz,mag=Math.hypot(dx,dz)||1;
      const f=(dx*Math.sin(obs.yaw)+dz*Math.cos(obs.yaw))/mag,r=(-dx*Math.cos(obs.yaw)+dz*Math.sin(obs.yaw))/mag;
      const w=[];if(f>.5)w.push('KeyW');else if(f<-.5)w.push('KeyS');if(r>.5)w.push('KeyD');else if(r<-.5)w.push('KeyA');
      await keys(w);
      if(w.length&&sprint){if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
      else if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
      return obs;
    }
    const watchdog=Date.now()+(SMOKE?(+process.env.SMOKE_T||28000)+25000:470000);
    while(Date.now()<watchdog){
      let s=await observe();
      if(s.state!=='battle')break;
      if(Date.now()-progLog>1500&&states[states.length-1]?.t!==+((Date.now()-started)/1000).toFixed(1)){const{bugs,...rest}=s;states.push({t:+((Date.now()-started)/1000).toFixed(1),...rest,squads:s.squads.length,turrets:s.turrets.length,inside:bugs.filter(u=>u.z<-17).length});}
      if(s.over){if(!events.some(e=>e.name==='round-over'))await mark('round-over');break;}
      if(!s.bug){await keys([]);if(s.deaths>0&&!events.some(e=>e.name==='bug-down-'+s.deaths))await mark('bug-down-'+s.deaths);
        wpIdx=0;way=MARCH;wpSince=Date.now();lastPos=null;stuckN=0;phase=s.gateDead?'rally':'march';if(s.gateDead)rallyAt=Date.now();await sleep(400);continue;}
      const hpPct=s.bhp/s.bmax;
      // 阶段推进与节点标记
      if(s.gateDead&&!gateMarks.has('gate-dead')){gateMarks.add('gate-dead');await mark('gate-dead');phase='rally';rallyAt=Date.now();wpIdx=0;way=MARCH;wpSince=Date.now();lastPos=null;stuckN=0;}
      for(const th of [75,50,25]){
        if(!gateMarks.has('gate-'+th)&&!s.gateDead&&s.gateHp<=2500*th/100&&s.gateHp>0){gateMarks.add('gate-'+th);await mark('gate-'+th);}
        if(!baseMarks.has('base-'+th)&&s.baseHp<=s.baseMax*th/100&&s.baseHp>0){baseMarks.add('base-'+th);await mark('base-'+th);}
      }
      if(phase==='assault'&&Math.hypot(s.bx-FARM[0],s.bz-FARM[1])<9){phase='grind';}
      if(GATE_ONLY&&s.gateDead){await mark('gate-only-stop');break;}
      // v23 低血整编：残血且蜕皮未就绪→撤到 (1,45) 安全区，蜕皮好了再回来；
      // run4 死锁教训：整编点无任何收入来源（生物量只来自母虫自己打出的伤害），bio<40 时永远付不起
      // 蜕皮 40→站桩到超时。修复：整编必须 bio>=40 才触发；18s 未完成强制返回磨门；终局 110s 内 rush 不整编。
      // v26：破门后不再后撤整编（rally/grind 原地蜕皮更划算，且战果由虫群继续产出生物量），只保留破门前整编。
      const rush=!s.gateDead&&s.timeLeft<110;
      if(!regroup&&!rush&&!s.gateDead&&hpPct<.35&&s.moltCd>2.5&&s.biomass>=40){regroup=true;regroupAt=Date.now();await mark('regroup-'+(++regroupN));}
      if(regroup){
        if(Date.now()-regroupAt>18000){console.log('REGROUP-TIMEOUT back to grind');regroup=false;await keys([]);}
        else if(s.moltCd<=0&&s.biomass>=40){await p.keyboard.press('KeyO');moltN++;regroup=false;await mark('molt-'+moltN);await sleep(250);await keys([]);}
        else if(Math.hypot(REGROUP[0]-s.bx,REGROUP[1]-s.bz)>2.5){s=await aimAt(REGROUP[0],REGROUP[1],s);await keys(['KeyW']);if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
        else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys([]);}
        await sleep(180);continue;
      }
      // ===== v27 破门即决：破门前狙击塔 r55 覆盖 (0,30) 集结位（v26b 实测在那儿连死两次），而战士虫
      //      不会穿过门洞（inside 恒为 0），等虫潮进院是空头支票 → 改为破门后原地蜕皮补满血就立即穿门，
      //      最多等 14 秒；穿门全程疾跑+冲刺，院内塔群集火靠撕核心×0.6 返生物量连蜕皮对冲。 =====
      if(phase==='rally'){
        const inside=s.bugs.filter(u=>u.z<-17).length;
        const waited=Date.now()-rallyAt;
        if(Date.now()-progLog>4000){progLog=Date.now();console.log('RALLY',Math.round(waited/1000)+'s','inside',inside,'swarm',s.swarm,'bio',s.biomass,'hp',Math.round(hpPct*100)+'%','base',s.baseHp);}
        if((hpPct>.8&&waited>2500)||waited>14000){
          phase='assault';way=ASSAULT;wpIdx=0;wpSince=Date.now();lastPos=null;stuckN=0;await keys([]);await mark('assault-start');
        }else{
          await keys([]);if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
          if(s.biomass>=60&&s.sumCd<=0&&s.swarm<48){await p.keyboard.press('KeyU');warN++;if(warN===1)await mark('summon-warrior-1');}
          if(hpPct<.92&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);}
        }
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
        if(s.gateDead&&hpPct<.95&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(200);}
      }else if(place==='siege'){
        // ===== v26 速射围攻：站桩 (1,12)（距门 28.1，酸程 30 内），以相机 yaw 为准校准后立即开酸。
        //   v25 探针实测只有 0.17 发/秒（理论 0.9），瓶颈是旧规则"静止 400ms+转向后 380ms 才开酸"——
        //   而 getCamYaw() 读的就是相机本身朝向，相机对齐即锥内锁定目标，无需再等；
        //   磨门 2500 血 ÷75 = 34 发命中，按 0.9 发/秒约 45 秒可破，早破=早留命给终局。
        //   承伤仍靠：蜕皮（40bio 回 332，门伤×0.25 每发回 18.75bio 自我造血）+ 战士虫诱饵
        //   （炮塔索敌取最近怪物、无 LOS，破门前狙击塔(8,-20) r55 拆不掉，只能让它啃）。 =====
        if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        await keys([]);
        const dGate=Math.hypot(s.gateX-s.bx,s.gateZ-s.bz);
        if(dGate>29.3||dGate<25||dg>3){
          s=await goTo(gx,gz,s,false);
        }else{
          if(s.spitCd<=0){
            const errG=wrap(Math.atan2(s.gateX-s.bx,s.gateZ-s.bz)-s.yaw);
            if(Math.abs(errG)>.08)s=await aimAt(s.gateX,s.gateZ,s);
            if(Math.abs(wrap(Math.atan2(s.gateX-s.bx,s.gateZ-s.bz)-s.yaw))<=.2){await p.keyboard.press('KeyK');acidN++;if(acidN===1)await mark('acid-1');}
          }
          if((hpPct<.6||s.gateHp<=150&&hpPct<.92)&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);}
          else if(s.biomass>=120&&s.sumCd<=0&&s.swarm<36){await p.keyboard.press('KeyU');warN++;if(warN===1)await mark('summon-warrior-1');}
          else if(flyN<2&&hpPct>.7&&s.biomass>=150&&s.flyCd<=0&&s.swarm<36){await p.keyboard.press('KeyI');flyN++;if(flyN===1)await mark('summon-flyer-1');}
        }
      }else{
        // ===== v27 城内收割：贴核心撕咬（核心伤×0.6=36bio/口）+酸液+蜕皮连发；够不到核心就先拆眼前的塔 =====
        if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        const coreD=Math.hypot(s.baseX-s.bx,s.baseZ-s.bz);
        const nearB=s.turrets.map(t=>({t,d:Math.hypot(t.x-s.bx,t.z-s.bz)})).sort((a,b)=>a.d-b.d)[0];
        const goCore=coreD<=6.5||!nearB||nearB.d>coreD;
        const mx=goCore?s.baseX:nearB.t.x,mz=goCore?s.baseZ:nearB.t.z;
        const md=Math.hypot(mx-s.bx,mz-s.bz);
        if(md>4.8)s=await goTo(mx,mz,s,false);
        else{
          await keys([]);
          if(s.clawCd<=0&&md<=5.5){await p.keyboard.press('KeyJ');biteN++;if(goCore&&!farmMarked){farmMarked=true;await mark('core-engage');}}
          else if(s.spitCd<=0){const s2=await aimAt(mx,mz,s);if(Math.abs(wrap(Math.atan2(mx-s2.bx,mz-s2.bz)-s2.yaw))<=.2){await p.keyboard.press('KeyK');acidN++;}}
        }
        if(hpPct<.8&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);}
        else if(s.biomass>=60&&s.sumCd<=0&&s.swarm<44){await p.keyboard.press('KeyU');warN++;}
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
      strategy:'v26 速射磨门+破门集结：行军(v20 已验证 x=-69 走廊+南侧进场)→(1,12)站桩，按相机 yaw 校准后立即开酸（去掉静止400ms/转向后380ms 的旧门控，理论 0.9 发/秒、45 秒破 2500 门血），承伤靠蜕皮（门伤×0.25 每发回 18.75bio 自造血）+战士诱饵（炮塔取最近怪物无 LOS，狙击塔 r55 破门前拆不掉）；bio≥120 才召战士留蜕皮本；破门后 rally(1,2) 狂召战士，等≥8 只入场（院内 z<-17）且母虫>85% 血再随虫潮穿门→贴核心(-11.8,-42)连撕 36bio/口+蜕皮连发收割；整编 hp<.35 且 bio≥40（run4 死锁教训）+18s 超时+终局 110s rush',
      gameplay_modified:false,time_scale:1,normal_rule_inputs_only:true,qa_hook_usage:'read-only observe',no_recording:NOREC};
    fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(data,null,2));
    if(!NOREC)fs.writeFileSync(path.join(OUT,'frames.json'),JSON.stringify(frames));
    console.log('CAPTURE COMPLETE',data.duration_s,'frames',frames.length,'events',events.length,'overTitle',fin.overTitle);
  }catch(e){
    fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:e.stack,events,frames:frames.length,errors},null,2));
    throw e;
  }finally{await keys([]).catch(()=>{});recording=false;await context.close().catch(()=>{});await browser.close().catch(()=>{});}
})().catch(e=>{console.error('CAPTURE-FAIL',e.message);process.exit(1);});

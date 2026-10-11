// 虫族模式实机采集 v31：线上部署版本，QA 钩子只读观察，输入全部为真实键盘事件，正常规则不改数值。
// v31 三塔清除+大兽群决胜（v29i 复盘：201.7s 破门成功，但破门后 9s 内第 5 死溃散——
//   v29 的 swarm>=8 小兽群冲走廊，母虫成了堡垒100dps+狙击84dps+加农37.5dps 的最近目标）：
//   ① 围攻位(1,11) 酸磨门+养兵逻辑全部沿用 v29.1（前线双机枪交给锥形溅射与兽群）；
//   ② 【新增 eastclear】前线双机枪亡且狙击塔(8,-20)存活 → 前出东侧 (20,6) 决斗：
//      该点距狙击 28.6（酸程 30 内）、距东机枪(27,-20) 26.9（其射程 26 外=零还手）、
//      距堡垒 38.2/加农 37.7（安全）、距门 29.7（锥形锁定中比狙击远，不抢锁）。
//      先酸狙击（吃 84dps 约 4s，半血即蜕皮）再零还手酸东机枪；前 3 发验证命中，
//      弧线若被城墙阻挡（弹道碰撞）立即放弃回围攻位，不浪费弹药与时间。
//   ③ 破门后 takedown 在围攻位养兵：molt 到满血、召唤到 swarm>=18 且 swarmIn>=6
//      （swarmIn=已进墙内(z<-19)的兽群数——先头部队进院拉住堡垒/加农火力再跟进），
//      不再 v29 那样 8 只就冲。紧急 timeLeft<55 照冲。
//   ④ 【新增 clearkeep】跟进到门内安全位 (0,-18)（加农 8u/堡垒 8.2u/狙击 8.2u 全在酸程），
//      站桩按 狙击→加农→堡垒 优先级点名（就近锁定不被抢），召唤虫就地出巢分摊，
//      三塔清完才前移——此后核心口袋只剩对空炮（地面免疫）= 无火力拆核心。
//   ⑤ grind 沿用 v29.1：核心贴脸爪+酸自循环，蜕皮/召唤滚雪球到胜。
// v31.1（smoke 复盘：217s 第5死溃散，城门 175/2500 差 10s）：
//   ① eastclear 证伪成立（3 发酸液狙击塔无伤=弧线被城墙阻挡，白费35s+1命）→ 默认禁用（EASTCLEAR=1 才启用），
//     破门前狙击塔(84dps/55r)不可杀不可躲，只能蜕皮硬抗+兽群分摊，clearkeep 破门后在门内击杀；
//   ② 围攻期经济死锁修复：蜕皮(40/8s)吃光收入(约17/s)后余额恒 20-96 够不到召兵门槛 100 →
//     兽群恒 2-4 只、狙击全程单点母虫、4 次阵亡全因狙击。召兵门槛降为 60（=成本价），
//     上限 14；蜕皮阈值 mgAlive===0 时提到 0.8（gate<=800 仍 0.95）；
//   ③ gaterush 门槛收紧为 hp>=.8+bio>=80（2 次蜕皮余量）+swarm>=5（分摊火力），
//     smoke 中 625 血城门爪 6 口 5s 后阵亡——差 1s，兽群到位即可破门；
//   ④ takedown 集结条件放宽 swarmIn>=4+swarm>=12（pre-breach 兽群本就难养，别空等）。
// v29.1 保留：四向防卡 STUCK_SEQ、路点连跳 marchRetries 恢复、siege 长途回位、
//   城破重生直奔 takedown（keepCleared 时直奔 coremove）、周期落盘 30s。
const fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const OUT=path.join(__dirname,'capture',process.env.TAKE||'zerg-run2');fs.mkdirSync(OUT,{recursive:true});
const GAME_URL=process.env.GAME_URL||'https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const SMOKE=!!process.env.SMOKE;const NOREC=!!process.env.NOREC;const GATE_ONLY=!!process.env.GATE_ONLY;
const EASTCLEAR=process.env.EASTCLEAR==='1'; // v31.1：默认禁用（酸弧被城墙阻挡已证伪）
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
    swarmIn:q.monsters.filter(m=>!m.dead&&m!==b&&m.mesh.position.z<-19).length,
    squads:q.squad.filter(s=>!s.dead).map(s=>({x:+s.mesh.position.x.toFixed(1),z:+s.mesh.position.z.toFixed(1)})),
    turrets:q.buildings.filter(t=>!t.dead).map(t=>({x:+t.mesh.position.x.toFixed(1),z:+t.mesh.position.z.toFixed(1),hp:Math.round(t.hp||0)})),
    gateX:+q.gate.mesh.position.x.toFixed(1),gateZ:+q.gate.mesh.position.z.toFixed(1),gateHp:Math.round(q.gate.hp),gateDead:q.gate.dead,
    baseX:+q.base.pos.x.toFixed(1),baseZ:+q.base.pos.z.toFixed(1),baseHp:Math.round(q.base.hp),baseMax:Math.round(q.base.maxHp),
    overTitle:(document.getElementById('overTitle')||{}).textContent||''};});}
  async function mark(name){const s=await observe();const e={name,t:+((Date.now()-started)/1000).toFixed(2),game:s.timeLeft,state:{...s,squads:s.squads.length,turrets:s.turrets.length}};events.push(e);console.log('EVENT',name,e.t,'gate',s.gateHp,'base',s.baseHp,'bio',s.biomass,'swarm',s.swarm,'swarmIn',s.swarmIn,'hp',s.bhp);if(!NOREC)await p.screenshot({path:path.join(OUT,name+'.png')});}
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
    // ===== 策略层 v31（nest(1,176) gate(0,-16) base(-12,-42)；前线机枪(±15,-13)；
    //       狙击(8,-20) 东机枪(27,-20) 加农(0,-26) 堡垒(-8,-20) 对空(±20,-24 只锁飞虫)）=====
    const MARCH=[[-69,140],[-69,90],[-69,20],[-14,18],[1,11]];
    const SIEGE=[1,11],GATE_FACE=[0,-13.2],FARM=[-11.8,-42];
    const MGS=[[-15,-13],[15,-13]];          // 前线双机枪：围攻位可安全酸（交给溅射/兽群）
    const SNIPER=[8,-20],MGE=[27,-20],EAST_STG=[20,6];
    const KEEWAY=[[0,-16.5],[0,-18]];        // 破门后跟进路线（门洞直进到门内安全位）
    const COREPATH=[[-2,-24],[-8,-32],[-11.8,-42]]; // 三塔清完 → 核心口袋
    const MGKILL_GHP=900;
    let wpIdx=0,phase='march',way=[...MARCH],turnKey=null,turnRate=1.9,aimMiss=0;
  let lastPos=null,stuckN=0,wpSince=Date.now(),progLog=0,marchRetries=0;
  const STUCK_SEQ=[['KeyS','KeyA'],['KeyS','KeyD'],['KeyW','KeyA'],['KeyW','KeyD']];
  let biteN=0,acidN=0,moltN=0,warN=0,dashN=0,viewDone=false,viewBackAt=0;
  let gateMarks=new Set(),baseMarks=new Set(),siegeMarked=false,farmMarked=false,rushMarked=false;
  let lastAcidGateN=0,lastGateHp=-1,missAcid=0,acidGateN=0;
  let takedownAt=0;const mgMarked=new Set(),mgDown=new Set();
  let eastAttempted=false,eastShots=0,eastSniperHp0=-1,eastAborted=false,eastDoneMarked=false,eastSince=0;
  let keepCleared=false,keepAt=false,keepSince=0;
  const TOWERS={mgA:[-15,-13],mgB:[15,-13],mgC:[-27,-13],mgD:[27,-20],sniper:[8,-20],cannon:[0,-26],bunker:[-8,-20]};
  const towerSeen=new Set();
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const turAlive=(s,k)=>{const [x,z]=TOWERS[k];return s.turrets.some(t=>Math.abs(t.x-x)<2.5&&Math.abs(t.z-z)<2.5);};
    // Q/E 自适应转向：校准一次方向，之后按误差比例转（真实键盘输入）
    async function aimAt(tx,tz,obs){
      const dx=tx-obs.bx,dz=tz-obs.bz;const want=Math.atan2(dx,dz);let err=wrap(want-obs.yaw);
      if(Math.abs(err)<.12){aimMiss=0;return obs;}
      if(!turnKey){
        const y0=obs.yaw;await p.keyboard.down('KeyE');await sleep(160);await p.keyboard.up('KeyE');
        const y1=(await observe()).yaw,d=wrap(y1-y0);turnKey=d>0?'KeyE':'KeyQ';turnRate=Math.abs(d)/.16||1;
        err=wrap(want-y1);obs={...obs,yaw:y1};
      }
      const dur=Math.min(500,Math.max(60,Math.abs(err)/turnRate*1000));
      await p.keyboard.down(turnKey);await sleep(dur);await p.keyboard.up(turnKey);
      lastMoveAt=Date.now();
      const s2=await observe();const err2=wrap(want-s2.yaw);
      if(Math.abs(err)-Math.abs(err2)<.05){if(++aimMiss>=3){console.log('AIM-RECAL：转向 3 次无进展，重校准 turnKey（err',err.toFixed(2),'->',err2.toFixed(2),'）');turnKey=null;aimMiss=0;}}
      else aimMiss=0;
      return s2;
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
        wpIdx=0;wpSince=Date.now();lastPos=null;stuckN=0;
        if(s.gateDead){if(keepCleared){phase='coremove';way=[...COREPATH];wpIdx=0;wpSince=Date.now();console.log('RESPAWN-COREMOVE：三塔已清，重生后直奔核心口袋');}
          else{phase='takedown';takedownAt=Date.now();console.log('RESPAWN-TAKEDOWN：城门已破，重生后直奔集结点');}}
        else{phase='march';way=[...MARCH];marchRetries=0;}
        await sleep(400);continue;}
      const hpPct=s.bhp/s.bmax;
      // 塔楼阵亡标记（比上一帧少了就记一次）
      for(const k of Object.keys(TOWERS)){
        if(turAlive(s,k))towerSeen.add(k);
        else if(towerSeen.has(k)){towerSeen.delete(k);if(!events.some(e=>e.name==='tower-'+k+'-down'))await mark('tower-'+k+'-down');}
      }
      // 阶段推进与节点标记
      if(s.gateDead&&!gateMarks.has('gate-dead')){gateMarks.add('gate-dead');await mark('gate-dead');
        wpIdx=0;way=[...KEEWAY];wpSince=Date.now();lastPos=null;stuckN=0;
        phase='takedown';takedownAt=Date.now();await mark('takedown-hold');}
      for(const th of [75,50,25]){
        if(!gateMarks.has('gate-'+th)&&!s.gateDead&&s.gateHp<=2500*th/100&&s.gateHp>0){gateMarks.add('gate-'+th);await mark('gate-'+th);}
        if(!baseMarks.has('base-'+th)&&s.baseHp<=s.baseMax*th/100&&s.baseHp>0){baseMarks.add('base-'+th);await mark('base-'+th);}
      }
      if(phase==='assault'&&Math.hypot(KEEWAY[KEEWAY.length-1][0]-s.bx,KEEWAY[KEEWAY.length-1][1]-s.bz)<9){phase='clearkeep';}
      if(GATE_ONLY&&s.gateDead){await mark('gate-only-stop');break;}
      const mgAlive=MGS.filter(([x,z])=>s.turrets.some(t=>Math.abs(t.x-x)<2.5&&Math.abs(t.z-z)<2.5)).length;
      const sniperAlive=turAlive(s,'sniper'),mgeAlive=turAlive(s,'mgD'),cannonAlive=turAlive(s,'cannon'),bunkerAlive=turAlive(s,'bunker');
      // ===== eastclear 触发：围攻期、前线双机枪已亡、狙击仍在、资源健康 → 东侧决斗（v31.1 默认禁用）=====
      if(EASTCLEAR&&phase==='siege'&&!s.gateDead&&!eastAttempted&&!eastAborted&&mgAlive===0&&sniperAlive&&s.timeLeft>110&&hpPct>=.72&&s.biomass>=80){
        eastAttempted=true;phase='eastclear';eastSince=Date.now();eastShots=0;eastSniperHp0=-1;
        wpIdx=0;wpSince=Date.now();lastPos=null;stuckN=0;way=[EAST_STG];
        await mark('east-clear-go');await sleep(120);continue;
      }
      // ===== eastclear：前出 (20,6) 决斗狙击塔（先狙击后东机枪），前 3 发无伤=弧线被墙挡 → 放弃 =====
      if(phase==='eastclear'){
        const dgE=Math.hypot(EAST_STG[0]-s.bx,EAST_STG[1]-s.bz);
        if(!sniperAlive&&!mgeAlive){phase='siege';if(!eastDoneMarked){eastDoneMarked=true;await mark('east-clear-done');}await sleep(120);continue;}
        if(Date.now()-eastSince>60000){eastAborted=true;phase='siege';console.log('EAST-ABORT：60s 未完成决斗，回围攻位');await mark('east-abort-timeout');await sleep(120);continue;}
        if(dgE>3){
          s=await aimAt(EAST_STG[0],EAST_STG[1],s);
          const dx=EAST_STG[0]-s.bx,dz=EAST_STG[1]-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
          const want=[];if(f>.5)want.push('KeyW');else if(f<-.5)want.push('KeyS');if(r>.5)want.push('KeyD');else if(r<-.5)want.push('KeyA');
          if(lastPos&&Math.hypot(s.bx-lastPos.x,s.bz-lastPos.z)<.5)stuckN++;else stuckN=0;
          lastPos={x:s.bx,z:s.bz};
          if(stuckN>40){const dir=STUCK_SEQ[Math.floor(stuckN/40)%4];await keys(dir);if(s.dashCd<=0)await p.keyboard.press('KeyL');await sleep(2200);await keys([]);stuckN=0;lastPos=null;console.log('UNWEDGE-EAST',dir.join('+'),'at',s.bx+','+s.bz);}
          else if(stuckN>5){await keys(STUCK_SEQ[Math.floor(stuckN/7)%4]);if(s.dashCd<=0)await p.keyboard.press('KeyL');}
          else await keys(want);
          if(hpPct<.5&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-east-'+moltN);await sleep(250);}
          await sleep(150);continue;
        }
        await keys([]);
        if(hpPct<.5&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-east-'+moltN);await sleep(250);continue;}
        if(!held.size&&s.spitCd<=0&&Date.now()-lastMoveAt>400){
          const tgt=sniperAlive?SNIPER:MGE;
          const tnow=s.turrets.find(t=>Math.abs(t.x-tgt[0])<2.5&&Math.abs(t.z-tgt[1])<2.5);
          if(tgt===SNIPER&&eastShots===0&&tnow)eastSniperHp0=tnow.hp;
          const y0=s.yaw;s=await aimAt(tgt[0],tgt[1],s);
          if(Math.abs(wrap(s.yaw-y0))>.1)await sleep(380);
          if(!held.size){
            await p.keyboard.press('KeyK');acidN++;eastShots++;
            if(tgt===SNIPER&&eastShots===3){
              const t2=(await observe()).turrets.find(t=>Math.abs(t.x-SNIPER[0])<2.5&&Math.abs(t.z-SNIPER[1])<2.5);
              if(t2&&eastSniperHp0>0&&Math.abs(t2.hp-eastSniperHp0)<1){eastAborted=true;phase='siege';console.log('EAST-ABORT：3 发酸液狙击塔无伤，弧线被城墙阻挡，回围攻位');await mark('east-abort');continue;}
            }
            await sleep(150);continue;
          }
        }else if(s.biomass>=150&&s.sumCd<=0&&s.swarm<40){await p.keyboard.press('KeyU');warN++;await sleep(350);}
        await sleep(120);continue;
      }
      // ===== 围攻期(1,11)：gate<=900 且双机枪存活 → 不变（酸永远优先城门收入线）=====
      if(phase==='siege'&&!s.gateDead&&mgAlive===0&&s.gateHp<=MGKILL_GHP&&hpPct>=.8&&s.biomass>=80&&s.swarm>=3){
        phase='gaterush';way=[GATE_FACE];wpIdx=0;wpSince=Date.now();lastPos=null;stuckN=0;
        if(!rushMarked){rushMarked=true;await mark('gate-rush');}
        await sleep(120);continue;
      }
      // ===== 破门后 takedown：围攻位=零火力安全屋（狙击/东机枪已清或不可达），养到 swarm>=18 且
      //      swarmIn>=6（先头进墙拉火力）才冲；紧急 timeLeft<55 照冲。=====
      if(phase==='takedown'){
        const ready=s.swarmIn>=4&&s.swarm>=12&&hpPct>=.75&&s.dashCd<=.3;
        if(ready||s.timeLeft<55){phase='assault';wpIdx=0;way=[...KEEWAY];wpSince=Date.now();lastPos=null;stuckN=0;await mark(ready?'assault-go':'assault-desperate');await sleep(120);continue;}
        if(Math.hypot(SIEGE[0]-s.bx,SIEGE[1]-s.bz)>3){
          s=await aimAt(SIEGE[0],SIEGE[1],s);
          const dx=SIEGE[0]-s.bx,dz=SIEGE[1]-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag;
          if(f>.3){await keys(['KeyW']);if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
          else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys(f<-.3?['KeyS']:[]);}
          if(f>.3||f<-.3){if(lastPos&&Math.hypot(s.bx-lastPos.x,s.bz-lastPos.z)<.5)stuckN++;else{stuckN=0;lastPos={x:s.bx,z:s.bz};}
            if(stuckN>40){const dir=STUCK_SEQ[Math.floor(stuckN/40)%4];if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys(dir);if(s.dashCd<=0)await p.keyboard.press('KeyL');await sleep(2200);await keys([]);stuckN=0;lastPos=null;console.log('UNWEDGE-TD',dir.join('+'),'at',s.bx+','+s.bz);}
            else if(stuckN>8){await keys(STUCK_SEQ[Math.floor(stuckN/6)%4]);if(s.dashCd<=0)await p.keyboard.press('KeyL');}}
          else{lastPos=null;stuckN=0;}
          await sleep(150);continue;
        }
        await keys([]);
        if(hpPct<.95&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
        else if(s.biomass>=60&&s.sumCd<=0&&s.swarm<46){await p.keyboard.press('KeyU');warN++;await sleep(350);}
        await sleep(150);continue;
      }
      // ===== clearkeep：门内安全位 (0,-18) 站桩点名 狙击→加农→堡垒；清完才前移 =====
      if(phase==='clearkeep'){
        const dgK=Math.hypot(KEEWAY[KEEWAY.length-1][0]-s.bx,KEEWAY[KEEWAY.length-1][1]-s.bz);
        if(!keepAt){if(dgK>3){s=await aimAt(KEEWAY[KEEWAY.length-1][0],KEEWAY[KEEWAY.length-1][1],s);
            const dx=KEEWAY[KEEWAY.length-1][0]-s.bx,dz=KEEWAY[KEEWAY.length-1][1]-s.bz,mag=Math.hypot(dx,dz)||1;
            const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag;
            if(f>.3){await keys(['KeyW']);if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
            else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys(f<-.3?['KeyS']:[]);}
            if(lastPos&&Math.hypot(s.bx-lastPos.x,s.bz-lastPos.z)<.4)stuckN++;else{stuckN=0;lastPos={x:s.bx,z:s.bz};}
            if(stuckN>40){const dir=STUCK_SEQ[Math.floor(stuckN/40)%4];if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys(dir);if(s.dashCd<=0)await p.keyboard.press('KeyL');await sleep(2200);await keys([]);stuckN=0;lastPos=null;console.log('UNWEDGE-KEEP',dir.join('+'),'at',s.bx+','+s.bz);}
            await sleep(150);continue;}
          keepAt=true;keepSince=Date.now();await mark('keep-enter');}
        await keys([]);if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        const tgtP=!sniperAlive&&!cannonAlive&&!bunkerAlive?null:(sniperAlive?SNIPER:(cannonAlive?[0,-26]:[-8,-20]));
        if(!tgtP||s.timeLeft<50){
          keepCleared=true;phase='coremove';way=[...COREPATH];wpIdx=0;wpSince=Date.now();lastPos=null;stuckN=0;
          await mark('keep-cleared');await sleep(120);continue;}
        if(Date.now()-keepSince>120000){keepCleared=true;phase='coremove';way=[...COREPATH];wpIdx=0;wpSince=Date.now();lastPos=null;stuckN=0;console.log('KEEP-TIMEOUT：120s 未清完三塔，强制前移');await mark('keep-timeout');await sleep(120);continue;}
        if(hpPct<.6&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-keep-'+moltN);await sleep(250);continue;}
        if(!held.size&&s.spitCd<=0&&Date.now()-lastMoveAt>400){
          const y0=s.yaw;s=await aimAt(tgtP[0],tgtP[1],s);
          if(Math.abs(wrap(s.yaw-y0))>.1)await sleep(380);
          if(!held.size){await p.keyboard.press('KeyK');acidN++;await sleep(150);continue;}
        }else if(s.biomass>=90&&s.sumCd<=0&&s.swarm<46){await p.keyboard.press('KeyU');warN++;await sleep(350);}
        await sleep(120);continue;
      }
      // 目标点选择
      let gx,gz,place;
      if(phase==='siege'){[gx,gz]=SIEGE;place='siege';}
      else if(phase==='gaterush'){[gx,gz]=GATE_FACE;place='gaterush';}
      else if(phase==='grind'){[gx,gz]=FARM;place='grind';}
      else if(wpIdx<way.length){[gx,gz]=way[wpIdx];place='march';}
      else if(s.gateDead){[gx,gz]=FARM;phase='grind';place='grind';}
      else if(Math.hypot(SIEGE[0]-s.bx,SIEGE[1]-s.bz)>10&&marchRetries<2){marchRetries++;let bi=0,bd=1e9;way.forEach(([x,z],i)=>{const d=Math.hypot(x-s.bx,z-s.bz);if(d<bd){bd=d;bi=i;}});wpIdx=bi;lastPos=null;stuckN=0;wpSince=Date.now();console.log('MARCH-RETRY',marchRetries,'：连跳后从最近路点恢复 wp'+bi+'（距 '+Math.round(bd)+'u），当前',s.bx+','+s.bz);[gx,gz]=way[bi];place='march';}
      else{[gx,gz]=SIEGE;phase='siege';place='siege';}
      const tgt=phase==='siege'||phase==='gaterush'?[s.gateX,s.gateZ]:phase==='grind'?[s.baseX,s.baseZ]:null;
      const dg=Math.hypot(gx-s.bx,gz-s.bz);
      if(Date.now()-progLog>6000){progLog=Date.now();
        if(place==='siege'&&acidGateN>lastAcidGateN&&s.gateHp===lastGateHp){missAcid+=acidGateN-lastAcidGateN;console.log('ACID-MISS total',missAcid,'dGate',Math.round(Math.hypot(s.gateX-s.bx,s.gateZ-s.bz)));}
        lastAcidGateN=acidGateN;lastGateHp=s.gateHp;
        console.log('PROG',Math.round((Date.now()-started)/1000)+'s',phase,wpIdx,'dg',Math.round(dg),'at',s.bx+','+s.bz,'hp',Math.round(hpPct*100)+'%','bio',s.biomass,'swarm',s.swarm,'in',s.swarmIn,'deaths',s.deaths,'gate',s.gateHp,'base',s.baseHp,'mg',mgAlive,'snp',sniperAlive?'Y':'N','bite',biteN,'acid',acidN,'molt',moltN);}
      // 行军途中的视角演示
      if(!SMOKE&&!viewDone&&place==='march'&&wpIdx===1&&dg>40){viewDone=true;await p.keyboard.press('KeyC');viewBackAt=Date.now()+4000;await mark('view-1st');}
      if(viewBackAt&&Date.now()>viewBackAt){viewBackAt=0;await p.keyboard.press('KeyC');await sleep(400);await mark('view-3rd');}
      // 跑图（含冲锋/前移）。冲锋段全程疾跑+门区补冲刺+途中召唤——步行穿火区必死。
      if(place==='march'){
        s=await aimAt(gx,gz,s);
        const dx=gx-s.bx,dz=gz-s.bz,mag=Math.hypot(dx,dz)||1;
        const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
        const want=[];if(f>.5)want.push('KeyW');else if(f<-.5)want.push('KeyS');if(r>.5)want.push('KeyD');else if(r<-.5)want.push('KeyA');
        if(lastPos&&Math.hypot(s.bx-lastPos.x,s.bz-lastPos.z)<.5)stuckN++;else stuckN=0;
        lastPos={x:s.bx,z:s.bz};
        const inAssault=phase==='assault'||phase==='coremove';
        if(stuckN>40){ // 四向点按救不了楔死地形 → 长按 2.2s 持续脱困（轮换四斜向）+ 冲刺
          const dir=STUCK_SEQ[Math.floor(stuckN/40)%4];
          await keys(dir);if(s.dashCd<=0)await p.keyboard.press('KeyL');await sleep(2200);await keys([]);
          stuckN=0;lastPos=null;console.log('UNWEDGE hold',dir.join('+'),'at',s.bx+','+s.bz);
        }else{
          if(stuckN>5)await keys(STUCK_SEQ[Math.floor(stuckN/7)%4]);else await keys(want);
          if(s.dashCd<=0&&stuckN>5)await p.keyboard.press('KeyL');
          if(stuckN>26){console.log('STUCK-SKIP wp',wpIdx,'at',s.bx,s.bz);wpIdx++;lastPos=null;stuckN=0;}
        }
        const sprint=inAssault||dg>30;
        if(want.length&&sprint){if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}}
        else if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        if(dg<=7){
          wpIdx++;lastPos=null;stuckN=0;wpSince=Date.now();marchRetries=0;
          if(place==='march'&&wpIdx>=way.length){
            if(phase==='assault'){phase='clearkeep';}
            else if(phase==='coremove'){phase='grind';if(!farmMarked){farmMarked=true;await mark('core-engage');}}
            else if(s.gateDead){phase='takedown';takedownAt=Date.now();await mark('takedown-resume');}
            else{phase='siege';if(!siegeMarked){siegeMarked=true;await mark('siege-start');}}
          }
          continue;
        }
        if(Date.now()-wpSince>25000){console.log('WP-TIMEOUT skip',wpIdx,'at',s.bx+','+s.bz);wpIdx++;lastPos=null;stuckN=0;wpSince=Date.now();continue;}
        // 冲锋/前移伴随：战士虫持续出巢顶火力，路过酸程内炮塔顺手点名
        if(inAssault){
          if(s.biomass>=60&&s.sumCd<=0&&s.swarm<46){await p.keyboard.press('KeyU');warN++;await sleep(300);}
          if(s.spitCd<=0){const nt=s.turrets.map(t=>({t,d:Math.hypot(t.x-s.bx,t.z-s.bz)})).sort((x,y)=>x.d-y.d)[0];
            if(nt&&nt.d<27){const s2=await aimAt(nt.t.x,nt.t.z,await observe());await p.keyboard.press('KeyK');acidN++;await sleep(150);}}
        }
        // dash 时机：冲锋只在门洞走廊 bz∈(-24,-4)（火力最密处）按；重走行军 dg>35 随手用
        if(s.dashCd<=0&&s.binv<=0&&(phase==='assault'?(s.bz<-4&&s.bz>-24):dg>35)){await p.keyboard.press('KeyL');dashN++;if(dashN===1)await mark('dash-1');}
        if(!s.gateDead&&hpPct<.45&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-march-'+moltN);await sleep(250);}
        if(s.gateDead&&!inAssault&&hpPct<.6&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(200);}
      }else if(place==='siege'){
        // ===== 围攻 (1,11)距门28.1：站桩酸磨门+提前养兵（v29.1 原逻辑）=====
        const dGate=Math.hypot(s.gateX-s.bx,s.gateZ-s.bz);
        if(dGate>29.5||dg>3){s=await aimAt(gx,gz,s);
          const dx=gx-s.bx,dz=gz-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
          const w=[];if(f>.5)w.push('KeyW');else if(f<-.5)w.push('KeyS');if(r>.5)w.push('KeyD');else if(r<-.5)w.push('KeyA');
          if(dg>10){ // 长途回位（重生软锁恢复）：疾跑+四向防卡+冲刺
            if(w.length){if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}await keys(w);
              if(lastPos&&Math.hypot(s.bx-lastPos.x,s.bz-lastPos.z)<.4)stuckN++;else{stuckN=0;lastPos={x:s.bx,z:s.bz};}
              if(stuckN>40){const dir=STUCK_SEQ[Math.floor(stuckN/40)%4];if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys(dir);if(s.dashCd<=0)await p.keyboard.press('KeyL');await sleep(2200);await keys([]);stuckN=0;lastPos=null;console.log('UNWEDGE-SIEGE',dir.join('+'),'at',s.bx+','+s.bz);}
              else if(stuckN>8){await keys(STUCK_SEQ[Math.floor(stuckN/6)%4]);if(s.dashCd<=0)await p.keyboard.press('KeyL');}}
            else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys([]);lastPos=null;stuckN=0;}
          }else{
            if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
            if(w.length){await keys(w);await sleep(140);await keys([]);}
            lastPos=null;stuckN=0;
          }
        }else{if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}await keys([]);lastPos=null;stuckN=0;}
        const mgWin=mgAlive>0&&dg<=5;       // 机枪存活窗口（仅用于召兵数量上限/蜕皮阈值）
        if(!held.size&&s.spitCd<=0&&Date.now()-lastMoveAt>400&&dg<=5&&dGate<=30.5){
          const at={x:s.gateX,z:s.gateZ};   // 酸永远优先城门：收入生命线
          const y0=s.yaw;s=await aimAt(at.x,at.z,s);
          if(Math.abs(wrap(s.yaw-y0))>.1)await sleep(380);
          if(!held.size){await p.keyboard.press('KeyK');acidN++;acidGateN++;if(acidGateN===1)await mark('acid-1');}
        }
        const moltTh=mgAlive?.7:(s.gateHp<=800?.95:.8); // v31.1：mgAlive===0 时 0.8（狙击单点期勤蜕皮），临破门 0.95 满血冲
        if(hpPct<moltTh&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
        else if(s.sumCd<=0&&s.swarm<14&&s.biomass>=60){await p.keyboard.press('KeyU');warN++;if(warN===1)await mark('summon-warrior-1');await sleep(350);}
      }else{
        // ===== 贴脸输出（gaterush=门北脸爪+酸速破门 / grind=核心爪+酸+就地召唤滚雪球）=====
        if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
        await keys([]);
        if(dg>1.5){s=await aimAt(gx,gz,s);
          const dx=gx-s.bx,dz=gz-s.bz,mag=Math.hypot(dx,dz)||1;
          const f=(dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw))/mag,r=(-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw))/mag;
          const w=[];if(f>.5)w.push('KeyW');else if(f<-.5)w.push('KeyS');if(r>.5)w.push('KeyD');else if(r<-.5)w.push('KeyA');
          if(w.length){await keys(w);await sleep(130);await keys([]);}
        }
        if(s.clawCd<=0){await p.keyboard.press('KeyJ');biteN++;if(!farmMarked){farmMarked=true;await mark(place==='gaterush'?'gate-claw':'core-engage');}}
        else if(s.spitCd<=0&&tgt){s=await aimAt(tgt[0],tgt[1],s);await p.keyboard.press('KeyK');acidN++;}
        if(place==='gaterush'){
          if(hpPct<.5&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
          else if(s.biomass>=60&&s.sumCd<=0&&s.swarm<46){await p.keyboard.press('KeyU');warN++;await sleep(300);}
        }else{
          if(hpPct<.95&&s.biomass>=40&&s.moltCd<=0){await p.keyboard.press('KeyO');moltN++;await mark('molt-'+moltN);await sleep(250);}
          else if(s.biomass>=60&&s.sumCd<=0&&s.swarm<46){await p.keyboard.press('KeyU');warN++;await sleep(300);}
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
      strategy:'v31 三塔清除+大兽群决胜：①围攻位(1,11)酸磨门+养兵（v29.1 原逻辑）→②前线双机枪亡后前出东侧(20,6)决斗狙击塔(28.6 在酸程30内；东机枪27,-20距26.9零还手顺手清；前3发无伤=弧线被墙挡即放弃)→③贴门爪+酸速破门→④破门后围攻位养兵到 swarm>=18且 swarmIn>=6（先头进墙拉火力）才冲，紧急timeLeft<55照冲→⑤跟进门内安全位(0,-18)站桩点名 狙击→加农→堡垒（召唤虫就地出巢分摊+蜕皮续命），三塔清完才前移→⑥核心口袋无火力（对空炮地面免疫）贴脸爪+酸滚雪球到胜；建筑血量实测:机枪250/狙击280/加农350/堡垒1200/对空400，酸75/1.1s 锥形锁30内最近dot>0.2，爪60/0.55s，蜕皮40回35%maxHp/8s，召唤60出3战士/6s',
      gameplay_modified:false,time_scale:1,normal_rule_inputs_only:true,qa_hook_usage:'read-only observe',no_recording:NOREC};
    fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(data,null,2));
    if(!NOREC)fs.writeFileSync(path.join(OUT,'frames.json'),JSON.stringify(frames));
    console.log('CAPTURE COMPLETE',data.duration_s,'frames',frames.length,'events',events.length,'overTitle',fin.overTitle);
  }catch(e){
    fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:e.stack,events,frames:frames.length,errors},null,2));
    throw e;
  }finally{await keys([]).catch(()=>{});recording=false;await context.close().catch(()=>{});await browser.close().catch(()=>{});}
})().catch(e=>{console.error('CAPTURE-FAIL',e.message);process.exit(1);});

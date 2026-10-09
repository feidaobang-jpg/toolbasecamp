// 第三关审核版回归：真实键盘 + 固定时钟；局部状态注入明确标作 fixture。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,BASE}=require('./lib');
const dest=path.resolve(__dirname,'../media-kit/releases/v0.11.0-preview.1/captures');fs.mkdirSync(dest,{recursive:true});
(async()=>{const browser=await launch();const results=[],errors=[];let page;
 const check=(name,value,detail)=>{results.push({name,pass:!!value,detail});console.log((value?'PASS ':'FAIL ')+name,detail||'');assert.ok(value,name);};
 try{
  page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'?test=1&seed=3109');await page.waitForFunction(()=>window.__CD_TEST__);
  await page.evaluate(()=>{__CD_TEST__.manual(true);localStorage.setItem('cd3d-stage1:volume','0');});
  const state=()=>page.evaluate(()=>__CD_TEST__.snapshot());
  const step=async n=>{await page.evaluate(n=>__CD_TEST__.step(n,true),n);};
  const tap=async key=>{await page.keyboard.down(key);await step(2);await page.keyboard.up(key);await step(2);};
  await page.locator('[data-opt="stage"]').click();await page.locator('[data-opt="stage"]').click();
  check('空存档可直接选择第三关',(await page.locator('[data-opt="stage"]').innerText()).includes('第三关'));
  await page.locator('#menu [data-act="select"]').click();await tap('Enter');await step(20);
  check('第三关从荒漠步战开始',(await state()).areaId==='desert');
  await page.screenshot({path:path.join(dest,'desert.png')});
  // Fixture：清除开场波次，只加速清波，不跳过电台交互与区域切换。
  for(let i=0;i<2;i++){
    await page.evaluate(i=>{__CD_TEST__.cheat.G.focusX=i?21:7;__CD_TEST__.cheat.tp(i?20:4,.5);},i);await step(300);
    await page.evaluate(()=>__CD_TEST__.cheat.killAll());await step(240);
  }
  await page.evaluate(()=>{__CD_TEST__.cheat.G.focusX=29;__CD_TEST__.cheat.tp(29,.5);});await step(10);await tap('j');await step(240);
  let s=await state();check('电台攻击键叫车并进入驾驶',s.areaId==='hellroad'&&s.road.phase==='drive',{area:s.areaId,wave:s.wave,on:s.waveOn,player:s.player,errors});
  const before=s.road.z;await page.keyboard.down('w');await step(25);await page.keyboard.up('w');check('方向键改变车辆纵深',(await state()).road.z<before-.5);
  await tap('j');s=await state();check('J触发加速撞击',s.road.ram>0);
  await page.keyboard.down('k');await step(4);check('K按住刹车速度降低',(await state()).road.speed===8);await page.keyboard.up('k');
  await tap('Escape');const paused=await state();await step(120);s=await state();check('暂停冻结公路距离和耐久',s.road.distance===paused.road.distance&&s.road.carHp===paused.road.carHp);
  await tap('Escape');
  // Fixture：无敌仅用于四种镜头截图，不作为驾驶通关证据。
  await page.evaluate(()=>{__CD_TEST__.cheat.G.settings.demo=true;});
  for(let i=0;i<4;i++){await page.evaluate(i=>__CD_TEST__.setCamera(i),i);await step(30);await page.screenshot({path:path.join(dest,'drive-view-'+i+'.png')});}
  await page.evaluate(()=>{__CD_TEST__.setCamera(0);__CD_TEST__.cheat.G.settings.demo=false;});
  // 自然推进到首领，然后按真实按键追击；不改Boss血量。
  for(let i=0;i<2400;i+=15){s=await state();if(s.boss)break;await step(15);}
  s=await state();check('行驶到距离后霍格出现',s.boss?.type==='hogg');
  await page.screenshot({path:path.join(dest,'hogg-chase.png')});
  // 驾车击败路线使用输入机器人；记录实际剩余车体及模式。
  for(let i=0;i<7200;i+=6){s=await state();if(s.mode==='clear'||s.road.phase!=='drive')break;
    const actors=await page.evaluate(()=>__CD_TEST__.cheat.actors()),b=actors.find(a=>a.type==='hogg');
    for(const k of ['w','s','a','d'])await page.keyboard.up(k);
    if(Math.abs(b.z-s.road.z)>.15)await page.keyboard.down(b.z<s.road.z?'w':'s');
    if(s.road.x<18.7)await page.keyboard.down('d');
    await tap('j');await step(6);
  }
  s=await state();check('正常耐久驾驶可以击败霍格',s.mode==='clear'&&s.boss.hp===0,{phase:s.road.phase,hp:s.road.carHp,boss:s.boss.hp});
  await step(900);await page.waitForTimeout(500);check('第三关通关结算',(await page.locator('#res-title').innerText()).includes('第三关'));
  await page.screenshot({path:path.join(dest,'clear.png')});
  // Fixture：直接加载公路并撞毁，验证步战分支。
  await page.locator('#result [data-act="restart"]').click();await step(10);
  await page.evaluate(()=>{__CD_TEST__.cheat.area(7);__CD_TEST__.cheat.wreck();});await step(120);
  s=await state();check('毁车恢复步战且保留Boss',s.road.phase==='foot'&&s.player.state!=='incar'&&s.boss.type==='hogg');
  await step(600);check('霍格有冲撞、手雷和援军',await page.evaluate(()=>['hoggCharge','hoggGrenade','hoggReinforcement'].every(t=>__CD_TEST__.events().some(e=>e.type===t))));
  await page.screenshot({path:path.join(dest,'hogg-foot.png')});
  await page.evaluate(()=>{__CD_TEST__.cheat.give('rifle',999);__CD_TEST__.cheat.G.settings.demo=true;});
  // 无敌用于确保能检测足够次数的有效枪击；单独验收伤害与死亡见下方。
  for(let i=0;i<3600;i+=15){s=await state();if(s.mode==='clear')break;await page.evaluate(()=>{const G=__CD_TEST__.cheat.G,b=G.boss,p=G.player;if(b.ridePhase==='recover'){p.x=b.x<16?b.x+2:b.x-2;p.z=b.z;p.face=b.x>p.x?Math.PI/2:-Math.PI/2;}});await tap('j');await step(15);}
  check('步战武器能击败霍格',(await state()).mode==='clear');
  // Fixture：只布置一次近身摩托冲撞，伤害、死亡、续关和重玩由正常游戏逻辑执行。
  const setupCharge=hp=>page.evaluate(hp=>{const T=__CD_TEST__;T.cheat.newGame({area:7,lives:'classic',dur:'classic'});T.cheat.wreck();const G=T.cheat.G,p=G.player,b=G.boss;G.lives=1;p.hp=hp;p.invul=0;p.y=0;p.vy=0;p.x=16;p.z=0;p.state='idle';b.x=14.8;b.z=0;b.ridePhase='charge';b.chargeDir=1;b.hitSlots=[];b.rideT=0;G.road.summon=99;},hp);
  await setupCharge(100);await step(6);s=await state();check('摩托冲撞按正常规则扣血',s.player.hp<100&&s.player.hp>0,{hp:s.player.hp});
  await setupCharge(1);await step(130);check('经典最后一命阵亡进入续关',(await state()).mode==='cont');
  await tap('j');s=await state();check('真实J键续关保留步战关卡',s.mode==='play'&&s.road.phase==='foot'&&s.player.hp===100);
  await setupCharge(1);await step(850);await page.waitForTimeout(500);check('续关倒计时结束出现失败结算',(await state()).mode==='over'&&await page.locator('#result').isVisible());
  await page.locator('#result [data-act="restart"]').click();await step(20);check('失败重玩返回所选第三关起点',(await state()).areaId==='desert');
  check('无运行时错误',errors.length===0,errors);
 }catch(e){console.error(e);process.exitCode=1;}finally{fs.writeFileSync(path.join(dest,'../qa.json'),JSON.stringify({results,errors},null,2));await browser.close();}
})();

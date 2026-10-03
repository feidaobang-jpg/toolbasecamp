// Deterministic objective/state checks plus real DOM controls and desktop/mobile captures.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const url=process.env.GAME_URL||'http://127.0.0.1:8891/html/game/starship-defense/index.html';
const output=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-operations-v0.13.0');
const checks=[];function check(name,ok,details){checks.push({name,ok:!!ok,details});console.log((ok?'PASS ':'FAIL ')+name+(ok?'':' '+JSON.stringify(details)));}
(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 try{
 const p=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);await p.keyboard.press('Enter');
 await p.locator('#menuButton').click();check('常驻菜单按钮打开暂停菜单',await p.locator('#menuPause').isVisible());await p.locator('#btnResume').click();
 await p.keyboard.press('Escape');check('Esc 打开菜单',await p.locator('#menuPause').isVisible());await p.keyboard.press('Escape');await p.keyboard.press('KeyP');check('P 打开菜单',await p.locator('#menuPause').isVisible());await p.locator('#btnResume').click();
 await p.locator('#opsButton').click();check('副本第一页三个任务',await p.locator('[data-operation]').count()===3);await p.getByRole('button',{name:'下一页',exact:true}).click();check('新手能看到后续章节要求',await p.locator('[data-operation="rescue"]').isDisabled());
 let d=await p.evaluate(()=>{const q=__gameQA;return {locked:q.operations.start('rescue'),difficulty:q.operations.start('depot','hard')};});check('章节与难度在逻辑层同样锁定',!d.locked&&!d.difficulty,d);
 const ids=['depot','signal','hunter','rescue','eggs','convoy','toxic','outposts','mother'];
 for(const id of ids){
  d=await p.evaluate(id=>{
   const q=__gameQA;q.closePanels();q.newGame(false);q.Game.chapter=6;q.Game.level=2;q.Game.gold=1000;q.clearEntities(false);q.player.invulnerable=0;
   const started=q.operations.start(id);q.Game.state='paused';q.player.invulnerable=0;
   const before={chapter:q.Game.chapter,level:q.Game.level,medkits:q.Game.items.medkit},a=q.operations.active;let negative=true,stationary=true;
   const tick=dt=>q.operations.update(dt),kill=()=>{for(const m of [...q.monsters])if(!m.operationStatic)q.damageMonster(m,1e8);q.updMonsters(0);};
   if(id==='signal'){q.player.pos.x+=50;tick(5);negative=a.held===0;q.player.pos.x-=50;}
   if(id==='eggs'||id==='mother'){
    const pos=a.objects[0].enemy.mesh.position.clone();q.updMonsters(1);stationary=pos.distanceTo(a.objects[0].enemy.mesh.position)<.001;
    if(id==='mother'){tick(.1);negative=!a.boss;}
    for(const o of a.objects)q.damageMonster(o.enemy,1e8);tick(.1);
    if(id==='mother'){negative=negative&&!!a.boss;q.damageMonster(a.boss,1e8);tick(.1);}
   }else if(id==='rescue'){
    for(const o of a.objects){q.player.pos.copy(o.mesh.position);tick(.01);negative=negative&&o.joined;
     // Walk the player toward extraction; civilian follows behind without teleporting.
     for(let n=0;n<500&&!o.safe;n++){kill();const v=o.mesh.position.clone(),dx=a.center.x-v.x,dz=a.center.z-v.z,len=Math.hypot(dx,dz)||1;q.player.pos.set(v.x+dx/len*4,q.groundY(v.x,v.z),v.z+dz/len*4);tick(.1);}
    }
   }else if(id==='convoy'){
    const o=a.objects[0],z=o.mesh.position.z;q.player.pos.x+=30;tick(2);negative=o.mesh.position.z===z;
    for(let n=0;n<500&&q.operations.active;n++){kill();q.player.pos.copy(o.mesh.position);tick(.1);}
   }else if(id==='toxic'||id==='outposts'){
    if(id==='outposts'){q.player.pos.copy(a.objects[1].mesh.position);tick(3);negative=a.objects[1].held===0;}
    for(const o of a.objects){q.player.pos.copy(o.mesh.position);for(let n=0;n<200&&!o.done;n++){kill();tick(.1);}}
    if(id==='toxic'){negative=!!q.operations.active&&q.player.hp===q.player.maxHp;q.player.pos.set(a.center.x,0,a.center.z);tick(.1);}
   }else for(let n=0;n<180&&q.operations.active;n++){tick(1);kill();}
   const ended=!q.operations.active,completed=q.Game.opsCompleted[id],gold=q.Game.gold;
   if(ended){q.operations.start(id);q.operations.finish(true);}
   const save=q.saveData();q.applySave(save);
   return {started,ended,negative,stationary,completed,gold,noRepeatReward:q.Game.gold===gold,before,chapter:q.Game.chapter,level:q.Game.level,saved:q.Game.opsCompleted[id],medkits:q.Game.items.medkit};
  },id);
  check(id+' 完成真实目标、保存成绩且不推进主线',d.started&&d.ended&&d.completed==='1:6'&&d.saved===d.completed&&d.chapter===d.before.chapter&&d.level===d.before.level,d);
  check(id+' 边界条件与重复领奖',d.negative&&d.stationary&&d.noRepeatReward,d);
 }
 d=await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.Game.chapter=6;q.clearEntities(false);q.operations.start('eggs');q.Game.state='paused';const a=q.operations.active;q.operations.update(90);const hatched=a.objects.every(o=>o.hatched&&!o.enemy.operationStatic);for(const o of a.objects)q.damageMonster(o.enemy,1e8);q.operations.update(.1);return {hatched,ended:!q.operations.active};});check('虫卵超时孵化后可清除幼虫通关',d.hatched&&d.ended,d);
 d=await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.Game.chapter=6;q.clearEntities(false);q.operations.start('convoy');q.Game.state='paused';const a=q.operations.active,o=a.objects[0];o.hp=1;const m=q.spawnMonster('mob',o.mesh.position.x,o.mesh.position.z,{wild:true});m.mesh.position.copy(o.mesh.position);q.operations.update(1);return {ended:!q.operations.active,done:q.Game.opsCompleted.convoy,state:q.Game.state};});check('运输车损毁失败返回基地，不发首通奖励',d.ended&&!d.done&&d.state==='prep',d);
 d=await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.Game.chapter=6;q.clearEntities(false);q.operations.start('depot','hard');q.Game.state='paused';q.operations.update(1);const hard=q.monsters[0].maxHp;q.operations.finish(true);q.operations.start('depot');q.Game.state='paused';q.operations.update(1);const normal=q.monsters[0].maxHp;q.operations.finish(true);const save=q.saveData();q.applySave(save);return {ratio:hard/normal,normal:q.Game.opsCompleted.depot,hard:q.Game.opsCompleted.depot_hard,valid:q.validateNormalSave?q.validateNormalSave(save,{weapons:q.WEAPONS,buildings:q.BUILDINGS,vehicles:q.VEHICLES}):true};});check('困难敌人更强、难度奖励独立并可读档',Math.abs(d.ratio-1.5)<.001&&d.normal==='1:6'&&d.hard==='1:6'&&d.valid,d);
 d=await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.clearEntities(false);q.Game.state='paused';q.Game.gold=100000;q.player.pos.set(0,0,40);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);return ['mgTurret','wall','bunker'].map(k=>{q.startPlacement(k);const r={kind:k,distance:Math.hypot(q.place.x-q.player.pos.x,q.place.z-q.player.pos.z),valid:q.place.valid};q.cancelPlacement();return r;});});check('设施虚影距玩家 3～4 米且可放置',d.every(x=>x.distance>=3&&x.distance<=4&&x.valid),d);
 d=await p.evaluate(()=>{const q=__gameQA;return {height:q.groundY(-42,49),blocked:q.fortress.blocked(-42,49,.8),ceiling:q.fortress.ceilingAt(-42,49,4)};});check('原山洞改成无隐形碰撞的可行走缓坡',d.height>3&&!d.blocked&&d.ceiling===Infinity,d);
 d=await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.clearEntities(false);q.player.pos.set(30,0,34);q.player.hp=30;const before=q.player.hp;q.updPlayer(1);return {healed:q.player.hp>before};});check('野战医疗站实际回血',d.healed,d);
 await p.evaluate(()=>{const q=__gameQA;q.Game.chapter=6;q.operations.open();});await p.screenshot({path:path.join(output,'desktop-missions.png')});
 await p.locator('#opsClose').click();await p.evaluate(()=>{const q=__gameQA;q.Game.state='prep';q.operations.start('eggs');q.Game.state='paused';q.setCamYaw(0);q.updCamera(1);});await p.screenshot({path:path.join(output,'egg-mission.png')});

 d=await p.evaluate(()=>{const q=__gameQA;q.operations.finish(false);q.Game.chapter=6;q.operations.start('eggs');q.Game.state='paused';const m=q.operations.active.objects[0].enemy,from=m.mesh.position.clone();from.z-=5;from.y+=m.hitH;const hp=m.hp;q.fireBullet(from,from.clone().set(0,0,1),q.WEAPONS.laser,true);return {hit:m.hp<hp};});check('虫卵可被实际武器射线击中',d.hit,d);
 await p.evaluate(()=>{const q=__gameQA;q.operations.finish(false);q.clearEntities(false);q.Game.state='paused';q.camera.position.set(30,5,14);q.camera.lookAt(30,3,34);});await p.screenshot({path:path.join(output,'medical-station.png')});
 await p.evaluate(()=>{const q=__gameQA;q.camera.position.set(-20,8,26);q.camera.lookAt(-42,2,49);});await p.screenshot({path:path.join(output,'approach-slope.png')});
 const mobile=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(url+'?qa=1');await mobile.waitForFunction(()=>window.__gameQA&&window.__ccReady);await mobile.locator('#btnStart').click();await mobile.locator('#vP').click();check('手机点击常驻菜单入口',await mobile.locator('#menuPause').isVisible());await mobile.locator('#opsPause').click();await mobile.screenshot({path:path.join(output,'mobile-missions.png')});
 const bounds=await mobile.locator('#operationsPanel').boundingBox();check('手机副本面板未越出屏幕',bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=845&&bounds.y+bounds.height<=391,bounds);
 check('浏览器无脚本异常',errors.length===0,errors);
 fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({url,checks},null,2));if(checks.some(c=>!c.ok))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

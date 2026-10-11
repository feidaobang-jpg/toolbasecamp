// 枪战规则（战地、抗战）：步行固定第一人称、手动瞄准、按住射击；载具和骑马用第三人称跟随。
// 需要本地静态服务；真实按键/鼠标验证输入路径，QA 接口只用来摆放目标和读取状态。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const URL=process.env.GAME_URL||'http://127.0.0.1:8961/html/game/starship-defense/index.html';
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-fps-rules-v0.34.0/qa');
fs.mkdirSync(OUT,{recursive:true});const results=[],errors=[];
const pass=(name,data)=>{results.push({name,data});console.log('PASS',name,JSON.stringify(data??''));};
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
try{
 const context=await browser.newContext({viewport:{width:1280,height:720}}),p=await context.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 const load=async(pg=p)=>{await pg.goto(URL+'?qa=1&test=1');await pg.waitForFunction(()=>window.__gameQA&&window.__ccReady);};
 const frames=(n,pg=p)=>pg.evaluate(n=>new Promise(done=>{const step=()=>--n<=0?done():requestAnimationFrame(step);requestAnimationFrame(step);}),n);
 // 战地：只留一个被钉住的敌方步兵当靶子，摆在玩家正前方 dist 米处，其余单位和载具电脑都停掉。
 const arena=(dist=18,pg=p)=>pg.evaluate(dist=>{
   const q=__gameQA,v=q.versus,h=q.player;cancelAnimationFrame(window.__pin);
   v.state.units.forEach(u=>{u.dead=true;u.mesh.visible=false;});q.vehicles.forEach(x=>{x.bfAIStart=Infinity;x.bfDriver=null;});
   for(const o of q.coopHumans)if(o!==h){o.pos.set(0,0,1037);o.mesh.position.copy(o.pos);o.invulnerable=1e6;}
   const e=window.__target&&v.state.units.includes(window.__target)?window.__target:v.state.units.find(u=>u.team==='red');e.dead=false;e.hp=e.maxHp=1e6;e.mesh.visible=true; // 血量给足，靶子不会被打死后移出名单
   h.pos.set(0,0,767);h.mesh.position.copy(h.pos);h.invulnerable=1e6;h.bfReload=null;h.bfAmmo[q.Game.curWeapon]=q.WEAPONS[q.Game.curWeapon].mag;h.fireCd=0;
   q.setCamYaw(0);q.setCamPitch(0);window.__target=e;
   const spot=()=>{e.mesh.position.set(h.pos.x,q.groundY(h.pos.x,h.pos.z+dist),h.pos.z+dist);if(e.pos)e.pos.copy(e.mesh.position);e.cd=999;window.__pin=requestAnimationFrame(spot);};spot();
   return {mag:q.WEAPONS[q.Game.curWeapon].mag,weapon:q.Game.curWeapon};
 },dist);
 const bf=(pg=p)=>pg.evaluate(()=>{const q=__gameQA,h=q.player,e=window.__target;return {mode:q.getCamMode(),ammo:h.bfAmmo[q.Game.curWeapon],reload:!!h.bfReload,hp:e.hp,max:e.maxHp,yaw:q.getCamYaw(),pitch:q.getCamPitch(),aiming:document.getElementById('vZ').getAttribute('aria-pressed'),pref:localStorage.getItem('chongchao-person')};});

 /* ---------------- 战地 ---------------- */
 await load();
 await p.evaluate(()=>{localStorage.setItem('chongchao-person','third');__gameQA.setCameraView(2,false);});
 await p.click('#btnVersus');await p.click('[data-vs-ai="normal"]');await p.waitForTimeout(500);
 let st=await p.evaluate(()=>{const q=__gameQA;return {mode:q.getCamMode(),fps:q.fpsRules(),manual:q.manualHuman(),assist:q.aimAssistKind(),person:document.getElementById('personBtn').classList.contains('hidden'),cross:!document.getElementById('crosshair').classList.contains('hidden'),pref:localStorage.getItem('chongchao-person'),settings:q.CombatControls.settings};});
 assert.equal(st.mode,'first');assert.ok(st.fps&&st.manual&&st.person&&st.cross);assert.equal(st.assist,null);assert.equal(st.pref,'third');assert.deepEqual(st.settings,{input:'mouse',aim:'auto',fire:'auto'});
 pass('战地开局：俯视预设也被固定为第一人称，人称按钮隐藏，保存的视角偏好和默认自动设置都没被改写',st);
 await p.keyboard.press('KeyC');await frames(3);
 const cFoot=await p.evaluate(()=>({mode:__gameQA.getCamMode(),msg:document.getElementById('msg').textContent,pref:localStorage.getItem('chongchao-person')}));
 assert.equal(cFoot.mode,'first');assert.match(cFoot.msg,/固定第一人称/);assert.equal(cFoot.pref,'third');pass('战地步行按 C 不切视角，只提示',cFoot);

 const info=await arena();await p.waitForTimeout(1300);let s=await bf();
 assert.equal(s.ammo,info.mag);assert.equal(s.hp,s.max);pass('默认设置（自动瞄准+自动攻击）下敌人站在准星上 1.3 秒也不会自动开火',{ammo:s.ammo,hp:s.hp});
 await p.keyboard.down('KeyJ');await p.waitForTimeout(700);await p.keyboard.up('KeyJ');await p.waitForTimeout(250);s=await bf();
 assert.ok(s.ammo<info.mag||s.reload);assert.ok(s.hp<s.max);pass('准星对准后按住 J 才开火并命中',{ammo:s.ammo,hp:s.hp,max:s.max});
 await arena();await p.evaluate(()=>__gameQA.setCamYaw(.35));await p.keyboard.down('KeyJ');await p.waitForTimeout(700);await p.keyboard.up('KeyJ');await p.waitForTimeout(250);s=await bf();
 assert.ok(s.ammo<info.mag||s.reload);assert.equal(s.hp,s.max);pass('准星偏开 20° 时照样出弹但打不中：不再自动锁定',{ammo:s.ammo,hp:s.hp});

 // 轻度吸附：键鼠没有；触屏 7° 内吸附；纯键盘吸附不看高低差。
 const assist=await p.evaluate(()=>{
   const q=__gameQA,h=q.player,e=window.__target,out={};
   const centre=()=>e.mesh.position.clone().add({x:0,y:e.hitH||1,z:0});
   const miss=deg=>{q.setCamYaw(deg*Math.PI/180);q.setCamPitch(0);const from=h.pos.clone();from.y+=1.35;return +q.playerAim(from,40).target.distanceTo(centre()).toFixed(2);};
   out.mouse5=miss(5);
   q.setDeviceMode('touch');out.touch5=miss(5);out.touch10=miss(10);out.touchKind=q.aimAssistKind();
   q.setDeviceMode('desktop');q.CombatControls.set('input','keyboard');out.keyboardKind=q.aimAssistKind();
   cancelAnimationFrame(window.__pin);e.mesh.position.y+=6;if(e.pos)e.pos.copy(e.mesh.position);
   out.keyboardHigh5=miss(5);q.setDeviceMode('touch');out.touchHigh5=miss(5);
   q.setDeviceMode('desktop');q.CombatControls.set('input','mouse');return out;
 });
 assert.ok(assist.mouse5>1);assert.ok(assist.touch5<.05);assert.ok(assist.touch10>1);assert.equal(assist.touchKind,'touch');assert.equal(assist.keyboardKind,'keyboard');assert.ok(assist.keyboardHigh5<.05);assert.ok(assist.touchHigh5>1);
 pass('吸附范围：键鼠偏 5° 不吸附；触屏偏 5° 吸附、偏 10° 不吸附；纯键盘对高处目标也吸附（数值为落点到目标中心的米数）',assist);

 // 真实鼠标：右键拖动只转视角，原地点右键举枪，左键按住开火，右键拖动中补按左键也开火。
 await arena();const box=await p.locator('#c3d').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
 await p.mouse.move(cx,cy);await p.mouse.down({button:'right'});await p.mouse.move(cx+160,cy,{steps:8});await p.mouse.up({button:'right'});await p.waitForTimeout(350);
 const drag=await bf();assert.ok(Math.min(drag.yaw,Math.PI*2-drag.yaw)>.3);assert.equal(drag.ammo,info.mag);assert.equal(drag.aiming,'false');
 pass('右键拖动只转视角：不开火、不举枪',{yaw:+drag.yaw.toFixed(2),ammo:drag.ammo});
 await p.mouse.click(cx,cy,{button:'right'});await frames(3);const sightOn=(await bf()).aiming,fov=await p.evaluate(()=>__gameQA.camera.fov);
 await p.mouse.click(cx,cy,{button:'right'});await frames(3);const sightOff=(await bf()).aiming;
 assert.equal(sightOn,'true');assert.equal(fov,52);assert.equal(sightOff,'false');pass('右键原地点一下举枪，再点放下',{fov});
 await p.mouse.down();await p.waitForTimeout(450);await p.mouse.up();await p.waitForTimeout(100);const left=await bf();assert.ok(left.ammo<info.mag||left.reload);
 await arena();await p.mouse.move(cx,cy);await p.mouse.down({button:'right'});await p.mouse.move(cx+30,cy,{steps:3});await p.mouse.down({button:'left'});await p.waitForTimeout(450);await p.mouse.up({button:'left'});await p.waitForTimeout(100);const chord=await bf();await p.mouse.up({button:'right'});
 assert.ok(chord.ammo<info.mag||chord.reload);pass('按住左键开火；右键拖视角时补按左键同样开火',{left:left.ammo,chord:chord.ammo});

 // 载具：上车切第三人称跟随，准星在屏幕中心，C 切两档距离，下车回第一人称。
 await arena();
 await p.evaluate(()=>{const q=__gameQA,v=q.vehicles.find(v=>v.team==='blue'&&v.kind==='tank'),h=q.player;v.mesh.position.set(0,0,760);v.yaw=0;v.mesh.rotation.y=0;h.pos.set(0,0,757);h.mesh.position.copy(h.pos);});
 await p.keyboard.press('KeyI');await p.waitForTimeout(600);
 const ride=await p.evaluate(()=>{const q=__gameQA,d=q.camera.getWorldDirection(q.camera.position.clone()),yaw=q.getCamYaw(),pitch=q.getCamPitch();
   return {kind:q.player.inVehicle?.kind,mode:q.getCamMode(),pitch,cross:!document.getElementById('crosshair').classList.contains('hidden'),forward:d.x*Math.sin(yaw)*Math.cos(pitch)+d.y*Math.sin(pitch)+d.z*Math.cos(yaw)*Math.cos(pitch),view:q.getVehicleView(),pref:localStorage.getItem('chongchao-person')};});
 assert.equal(ride.kind,'tank');assert.equal(ride.mode,'third');assert.ok(ride.cross);assert.ok(ride.forward>.999);assert.equal(ride.pref,'third');
 pass('上坦克切第三人称跟随：镜头朝准星方向看，准星显示，不写视角偏好',ride);
 await p.screenshot({path:path.join(OUT,'battlefield-tank-view.png')});
 await p.keyboard.press('KeyC');await frames(3);const far=await p.evaluate(()=>({view:__gameQA.getVehicleView(),msg:document.getElementById('msg').textContent}));
 await p.keyboard.press('KeyC');await frames(3);const near=await p.evaluate(()=>__gameQA.getVehicleView());
 assert.equal(far.view,1);assert.match(far.msg,/远距跟随/);assert.equal(near,0);pass('载具里 C 在近身/远距两档之间切换',far);
 // 把靶子摆到准星落点上：开炮命中；炮口转开 25° 后不命中。
 const shell=async yaw=>{
   await p.evaluate(yaw=>{const q=__gameQA,e=window.__target,v=q.player.inVehicle;cancelAnimationFrame(window.__pin);q.setCamYaw(0);q.setCamPitch(-.2);q.updCamera(.016);
     const spot=q.crosshairPoint(v.cfg.range).clone();e.hp=e.maxHp=1e6;const pin=()=>{e.mesh.position.set(spot.x,q.groundY(spot.x,spot.z),spot.z);if(e.pos)e.pos.copy(e.mesh.position);e.cd=999;window.__pin=requestAnimationFrame(pin);};pin();
     window.__spot=spot.distanceTo(v.mesh.position);q.setCamYaw(yaw);q.player.fireCd=0;},yaw);
   await frames(4);await p.keyboard.down('KeyJ');await p.waitForTimeout(1500);await p.keyboard.up('KeyJ');await p.waitForTimeout(500);
   return p.evaluate(()=>({hp:window.__target.hp,max:window.__target.maxHp,distance:+window.__spot.toFixed(1)}));
 };
 const onTarget=await shell(0),offTarget=await shell(.44);
 assert.ok(onTarget.distance>8);assert.ok(onTarget.hp<onTarget.max);assert.equal(offTarget.hp,offTarget.max);
 pass('坦克按准星落点开炮：对准命中，炮口转开 25° 不命中',{onTarget,offTarget});
 // 联机：房主只凭朝向、俯仰和镜头距离还原客人的准星；电脑英雄仍走自动瞄准。
 const net=await p.evaluate(()=>{const q=__gameQA,v=q.player.inVehicle;q.setCamYaw(.2);q.setCamPitch(-.15);q.updCamera(.016);
   const local=q.crosshairPoint(v.cfg.range).clone(),sent=q.starshipInput();
   q.Input.network={yaw:sent.yaw,pitch:sent.pitch,look:sent.look,autoAim:sent.autoAim,edges:[]};const host=q.crosshairPoint(v.cfg.range).clone(),manual=q.manualHuman();
   q.Input.network={yaw:0,autoAim:true,autoFire:false,fire:false,edges:[]};const computer=q.manualHuman();q.Input.network=null;
   return {gap:+local.distanceTo(host).toFixed(2),manual,computer,sent:{pitch:sent.pitch,look:+sent.look.toFixed(2),fire:sent.fire,autoFire:sent.autoFire,autoAim:sent.autoAim}};});
 assert.ok(net.gap<1.5);assert.ok(net.manual);assert.equal(net.computer,false);assert.equal(net.sent.fire,false);assert.equal(net.sent.autoFire,false);assert.equal(net.sent.autoAim,false);assert.ok(net.sent.look>3);
 pass('联机输入只用服务端放行的字段，房主还原的载具准星落点与客人本机相差不到 1.5 米；电脑英雄不受影响',net);
 await p.keyboard.press('KeyI');await p.waitForTimeout(400);
 const foot=await p.evaluate(()=>{const q=__gameQA;q.setCamYaw(.3);q.setCamPitch(-.1);const local=q.crosshairPoint(40).clone(),sent=q.starshipInput();q.Input.network={yaw:sent.yaw,pitch:sent.pitch,look:sent.look,autoAim:false,edges:[]};const host=q.crosshairPoint(40).clone();q.Input.network=null;
   return {mode:q.getCamMode(),vehicle:!!q.player.inVehicle,look:sent.look,gap:+local.distanceTo(host).toFixed(3),vC:document.getElementById('vC').classList.contains('hidden')};});
 assert.equal(foot.mode,'first');assert.equal(foot.vehicle,false);assert.equal(foot.look,0);assert.ok(foot.gap<.01);assert.ok(foot.vC);
 pass('下车回第一人称，触屏切换视角键收起；步行时房主还原的准星与本机一致',foot);
 await p.screenshot({path:path.join(OUT,'battlefield-first-person.png')});

 // 设置面板：瞄准/射击两项在战地里锁住，保存的值不变。
 await p.evaluate(()=>{cancelAnimationFrame(window.__pin);document.getElementById('menuButton').click();});await p.click('#keysPause');
 const lock=await p.evaluate(()=>({aim:document.getElementById('combat-aim').disabled,fire:document.getElementById('combat-fire').disabled,input:document.getElementById('combat-input').disabled,note:document.getElementById('combat-fixed').textContent,saved:__gameQA.CombatControls.settings}));
 assert.ok(lock.aim&&lock.fire&&!lock.input);assert.match(lock.note,/固定/);assert.equal(lock.saved.aim,'auto');assert.equal(lock.saved.fire,'auto');pass('战地里设置面板的瞄准、射击两项锁住并说明原因，保存值不变',lock);
 await p.screenshot({path:path.join(OUT,'battlefield-settings-locked.png')});
 // 退出后恢复战役的视角偏好；偏好是第一人称时同样保留。
 const leave=await p.evaluate(()=>{const q=__gameQA;q.closePanels();q.exitVersus();const third={mode:q.getCamMode(),pref:localStorage.getItem('chongchao-person'),person:document.getElementById('personBtn').classList.contains('hidden'),vC:document.getElementById('vC').classList.contains('hidden')};
   localStorage.setItem('chongchao-person','first');q.startVersusAI('normal',1);q.syncBattlefieldView();q.exitVersus();return {third,first:{mode:q.getCamMode(),pref:localStorage.getItem('chongchao-person')}};});
 assert.equal(leave.third.mode,'third');assert.equal(leave.third.pref,'third');assert.equal(leave.third.person,false);assert.equal(leave.third.vC,false);assert.equal(leave.first.mode,'first');assert.equal(leave.first.pref,'first');
 pass('退出战地恢复战役视角偏好（第三人称、第一人称两种都保留），按钮恢复显示',leave);

 /* ---------------- 抗战 ---------------- */
 await load();await p.evaluate(()=>{localStorage.setItem('chongchao-person','third');__gameQA.setCameraView(2,false);});
 await p.click('#btnResistance');await p.click('[data-chapter="0"]');await p.waitForTimeout(400);
 const war=(pg=p)=>pg.evaluate(()=>{const q=__gameQA,s=q.resistanceCampaign.state,e=window.__foe;return {mode:q.getCamMode(),view:q.getCamView(),ammo:s.ammo[s.weapon],hp:e?.hp,reticle:document.getElementById('warReticle').classList.contains('target'),pref:localStorage.getItem('chongchao-person')};});
 // 只留一个敌兵，摆在正前方 16 米并钉住。
 const range=(pg=p)=>pg.evaluate(()=>{const q=__gameQA,r=q.resistanceCampaign,s=r.state;cancelAnimationFrame(window.__pin);s.invulnerable=1e6;for(const b of s.shots)b.mesh.removeFromParent();s.shots.length=0; // 清掉队友已经打出去的子弹
   s.units.filter(u=>u!==s.player).forEach(u=>{u.dead=true;u.revive=1e6;u.root.visible=false;});const e=s.units.find(u=>u.team==='enemy');e.dead=false;e.hp=e.maxHp=85;e.root.visible=true;e.root.rotation.z=0;window.__foe=e;
   s.player.root.position.set(0,0,-18);q.setCamYaw(0);q.setCamPitch(0);s.reload=0;s.fireCd=0;s.ammo[s.weapon]=r.PERIOD_GUNS[s.weapon].mag;
   const pin=()=>{e.root.position.set(0,0,-2);e.cd=999;window.__pin=requestAnimationFrame(pin);};pin();return r.PERIOD_GUNS[s.weapon].mag;});
 let w=await war();assert.equal(w.mode,'first');
 await p.keyboard.press('KeyC');await frames(3);w=await war();assert.equal(w.mode,'first');assert.equal(w.pref,'third');
 assert.ok(await p.evaluate(()=>document.getElementById('personBtn').classList.contains('hidden')));pass('抗战步行固定第一人称，按 C 不切视角，人称按钮隐藏，偏好未改写',w);
 const mag=await range();await p.waitForTimeout(1300);w=await war();
 assert.equal(w.ammo,mag);assert.equal(w.hp,85);assert.ok(w.reticle);pass('抗战默认设置下敌人在准星上 1.3 秒也不自动开火，准星提示已对准',w);
 await p.keyboard.down('KeyJ');await p.waitForTimeout(350);await p.keyboard.up('KeyJ');await p.waitForTimeout(300);w=await war();
 assert.ok(w.ammo<mag);assert.ok(w.hp<85);pass('抗战按住 J 开火并命中',w);
 await range();await p.evaluate(()=>__gameQA.setCamYaw(5*Math.PI/180));await p.waitForTimeout(300);const mouseReticle=(await war()).reticle;
 await p.keyboard.down('KeyJ');await p.waitForTimeout(350);await p.keyboard.up('KeyJ');await p.waitForTimeout(300);const mouseOff={reticle:mouseReticle,...await war()};
 assert.equal(mouseOff.reticle,false);assert.ok(mouseOff.ammo<mag);assert.equal(mouseOff.hp,85);
 pass('抗战准星偏 5°：键鼠出弹但打不中，准星不提示',{ammo:mouseOff.ammo,hp:mouseOff.hp});
 await p.evaluate(()=>cancelAnimationFrame(window.__pin));
 // 骑马：第三人称跟随，C 在两档之间切换，下马回第一人称。
 await p.evaluate(()=>{const r=__gameQA.resistanceCampaign;r.start(1,1);r.state.invulnerable=1e6;});await frames(4);
 const mounted=await p.evaluate(()=>({mode:__gameQA.getCamMode(),view:__gameQA.getCamView(),mounted:__gameQA.resistanceCampaign.state.player.mounted}));
 await p.keyboard.press('KeyC');await frames(4);const toggled=await p.evaluate(()=>__gameQA.getCamView());
 await p.screenshot({path:path.join(OUT,'resistance-mounted.png')});
 await p.keyboard.press('KeyI');await frames(4);const walk=await p.evaluate(()=>({mode:__gameQA.getCamMode(),mounted:__gameQA.resistanceCampaign.state.player.mounted}));
 assert.ok(mounted.mounted);assert.equal(mounted.mode,'third');assert.ok(mounted.view<=1);assert.notEqual(toggled,mounted.view);assert.ok(toggled<=1);assert.equal(walk.mounted,false);assert.equal(walk.mode,'first');
 pass('抗战骑马用第三人称跟随，C 在两档间切换，下马回第一人称',{mounted,toggled,walk});
 const out=await p.evaluate(()=>{const q=__gameQA;q.resistanceCampaign.stop();return {mode:q.getCamMode(),view:q.getCamView(),pref:localStorage.getItem('chongchao-person'),person:document.getElementById('personBtn').classList.contains('hidden'),vC:document.getElementById('vC').classList.contains('hidden'),fps:q.fpsRules()};});
 assert.equal(out.mode,'third');assert.equal(out.view,2);assert.equal(out.pref,'third');assert.equal(out.person,false);assert.equal(out.vC,false);assert.equal(out.fps,false);
 pass('退出抗战后视角恢复到进入前的预设，偏好未改写，按钮恢复显示',out);

 /* ---------------- 手机横屏视口 + 真实触摸 ---------------- */
 const phone=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true}),t=await phone.newPage(),cdp=await phone.newCDPSession(t);
 t.on('pageerror',e=>errors.push('touch: '+e.message));
 const finger=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y])=>({x,y,id:1}))});
 const centre=async id=>{const b=await t.locator(id).boundingBox();return [b.x+b.width/2,b.y+b.height/2];};
 await load(t);await t.evaluate(()=>__gameQA.setDeviceMode('touch'));
 await t.tap('#btnVersus');await t.tap('[data-vs-ai="normal"]');await t.waitForTimeout(500);
 const tInfo=await arena(18,t),tView=await t.evaluate(()=>({mode:__gameQA.getCamMode(),assist:__gameQA.aimAssistKind(),vC:document.getElementById('vC').classList.contains('hidden'),hint:document.getElementById('msg').textContent}));
 assert.equal(tView.mode,'first');assert.equal(tView.assist,'touch');assert.ok(tView.vC);
 const [fx,fy]=await centre('#vJ');
 await finger('touchStart',[[fx,fy]]);for(let i=1;i<=6;i++){await finger('touchMove',[[fx-i*12,fy]]);await frames(1,t);}await t.waitForTimeout(400);
 const dragFire=await bf(t);await finger('touchEnd',[]);await frames(2,t);
 assert.ok(Math.min(dragFire.yaw,Math.PI*2-dragFire.yaw)>.2);assert.ok(dragFire.ammo<tInfo.mag||dragFire.reload);
 pass('手机视口真实触摸：战地步行第一人称、切换视角键收起；按住射击键拖动能边开火边转视角',{yaw:+dragFire.yaw.toFixed(2),ammo:dragFire.ammo,...tView});
 // 松开射击键就停火；拖空白处只转视角不开火。
 await arena(18,t);await t.waitForTimeout(900);const idle=await bf(t);
 await finger('touchStart',[[422,150]]);for(let i=1;i<=6;i++){await finger('touchMove',[[422+i*14,150]]);await frames(1,t);}await finger('touchEnd',[]);await t.waitForTimeout(300);const look=await bf(t);
 assert.equal(idle.ammo,tInfo.mag);assert.equal(look.ammo,tInfo.mag);assert.ok(Math.min(look.yaw,Math.PI*2-look.yaw)>.2);
 pass('手机视口：不按射击键不开火（敌人在准星上也一样），拖空白处只转视角',{ammo:look.ammo,yaw:+look.yaw.toFixed(2)});
 await t.screenshot({path:path.join(OUT,'battlefield-touch.png')});
 await t.evaluate(()=>{cancelAnimationFrame(window.__pin);__gameQA.exitVersus();});
 await load(t);await t.evaluate(()=>__gameQA.setDeviceMode('touch'));await t.tap('#btnResistance');await t.tap('[data-chapter="0"]');await t.waitForTimeout(400);
 const tMag=await range(t);await t.evaluate(()=>__gameQA.setCamYaw(5*Math.PI/180));await t.waitForTimeout(1200);const tIdle=await war(t);
 const [wx,wy]=await centre('#vJ');await finger('touchStart',[[wx,wy]]);await t.waitForTimeout(350);await finger('touchEnd',[]);await t.waitForTimeout(300);const touchOff=await war(t);
 assert.equal(tIdle.mode,'first');assert.equal(tIdle.ammo,tMag);assert.equal(tIdle.hp,85);assert.ok(tIdle.reticle);assert.ok(touchOff.ammo<tMag);assert.ok(touchOff.hp<85);
 assert.ok(await t.evaluate(()=>document.getElementById('vC').classList.contains('hidden')));
 pass('手机视口抗战：准星偏 5° 时不自动开火；按住射击键后轻度吸附命中；步行时切换视角键收起',{idle:{ammo:tIdle.ammo,hp:tIdle.hp},fired:{ammo:touchOff.ammo,hp:touchOff.hp}});
 await t.screenshot({path:path.join(OUT,'resistance-touch.png')});
 await t.evaluate(()=>cancelAnimationFrame(window.__pin));await phone.close();

 /* ---------------- 主战役回归：仍是多视角 + 自动瞄准 ---------------- */
 await load();await p.evaluate(()=>{localStorage.setItem('chongchao-person','third');const q=__gameQA;q.newGame(true);q.sandboxWave.enabled=false;});await frames(5);
 const camp=await p.evaluate(()=>{const q=__gameQA,h=q.player;for(const m of [...q.monsters])m.dead=true;q.monsters.length=0;
   q.setCamYaw(0);const m=q.spawnMonster('mob',h.pos.x+14,h.pos.z,{quiet:true});m.emerge=0;const from=h.pos.clone();from.y+=1.35;
   const aim=q.playerAim(from,q.WEAPONS[q.Game.curWeapon].range,null);
   return {fps:q.fpsRules(),mode:q.getCamMode(),lockedOn:aim.mo===m,autoFire:q.Input.firing(true),idle:q.Input.firing(false),person:document.getElementById('personBtn').classList.contains('hidden'),aimDisabled:document.getElementById('combat-aim').disabled};});
 assert.equal(camp.fps,false);assert.equal(camp.mode,'third');assert.ok(camp.lockedOn);assert.ok(camp.autoFire);assert.equal(camp.idle,false);assert.equal(camp.person,false);assert.equal(camp.aimDisabled,false);
 await p.keyboard.press('KeyC');await frames(3);const cycled=await p.evaluate(()=>__gameQA.getCamView());assert.equal(cycled,1);
 const yaw0=await p.evaluate(()=>__gameQA.getCamYaw());const b2=await p.locator('#c3d').boundingBox();await p.mouse.move(b2.x+640,b2.y+360);await p.mouse.down({button:'right'});await p.mouse.move(b2.x+800,b2.y+360,{steps:6});await p.mouse.up({button:'right'});await p.waitForTimeout(300);
 const yaw1=await p.evaluate(()=>__gameQA.getCamYaw());assert.ok(Math.abs(yaw1-yaw0)<1e-6);
 pass('主战役不受影响：第三人称、侧面 90° 的虫子仍被自动锁定并自动开火，C 照常切视角，右键拖动没有新增行为',{...camp,cycled});
 await p.screenshot({path:path.join(OUT,'campaign-regression.png')});
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({url:URL,date:new Date().toISOString(),results,errors},null,1));
 console.log('ALL PASS',results.length);
}finally{await browser.close();}
})().catch(e=>{console.error('FAIL',e.message);console.error(errors);process.exit(1);});

// v0.9.7: K/Space jump (no gameplay use) became a dash; helicopter altitude moved to Y (up) / H (down).
// Real keyboard input; game state is set up through ?qa=1 hooks.
// BEFORE=1 measures the old jump on an older build (GAME_URL) and writes before.json instead.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases',process.env.RELEASE||'web-dash-v0.9.7'),captures=path.join(release,'captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const BEFORE=process.env.BEFORE==='1';
const results={},fail=[];const check=(n,ok,d)=>{results[n]={ok:!!ok,...(d!==undefined?{detail:d}:{})};if(!ok)fail.push(n);};
const edge={executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']};
// Open field in front of the base gate, camera behind the player looking +z.
const SETUP=`(()=>{const q=__gameQA;q.Game.state='prep';q.clearEntities(false);q.squad.forEach(s=>s.mesh.position.set(-30,0,-30));
  q.setCamMode('third',false);q.setCameraView(0,false);q.setCamYaw(0);q.player.yaw=0;q.player.dead=false;q.player.inVehicle=null;q.player.mesh.visible=true;
  q.player.hp=q.player.maxHp;q.player.invulnerable=0;q.player.dashCd=0;q.player.dashInv=0;q.player.dashT=0;
  q.player.pos.set(0,q.groundY(0,20),20);q.player.vy=0;q.player.mesh.position.copy(q.player.pos);q.Input.reset();})()`;
const pos=p=>p.evaluate(()=>{const v=__gameQA.player.pos;return{x:+v.x.toFixed(2),y:+v.y.toFixed(2),z:+v.z.toFixed(2)};});
async function open(b,opts={}){
  const c=await b.newContext({viewport:{width:1280,height:720},...opts});
  const p=await c.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
  await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(500);
  await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(400);
  await p.keyboard.press('Enter');await p.waitForTimeout(500);return p;
}
// Mobs pressed against the player, frozen in place so the only variable is the player's action.
const RING=`(()=>{const q=__gameQA,out=[];for(let i=0;i<6;i++){const a=i/6*Math.PI*2;const m=q.spawnMonster('mob',Math.sin(a)*1.6,20+Math.cos(a)*1.6,{quiet:true});
  m.emerge=0;m.hp=m.maxHp=1e6;m.speed=0;m.atkCd=.2;m.dmg=8;out.push(m);}return out.length;})()`;

(async()=>{
 fs.mkdirSync(captures,{recursive:true});
 const b=await chromium.launch(edge);
 const p=await open(b);

 if(BEFORE){
  // Old jump: how high, does it dodge a bite, does it clear a 1-tile wall?
  await p.evaluate(SETUP);
  let peak=0;await p.keyboard.press('KeyK');for(let i=0;i<20;i++){await p.waitForTimeout(40);peak=Math.max(peak,await p.evaluate(()=>__gameQA.player.pos.y-__gameQA.groundY(__gameQA.player.pos.x,__gameQA.player.pos.z)));}
  check('old jump peak height (m)',true,+peak.toFixed(2));
  await p.evaluate(SETUP);await p.evaluate(RING);const h0=await p.evaluate(()=>__gameQA.player.hp);
  await p.keyboard.press('KeyK');await p.waitForTimeout(700);
  const h1=await p.evaluate(()=>__gameQA.player.hp);await p.evaluate(()=>{__gameQA.clearEntities(false);});
  check('old jump: bites still land while airborne',h1<h0,{hpBefore:h0,hpAfterJump:+h1.toFixed(1)});
  await p.evaluate(SETUP);await p.evaluate(()=>{__gameQA.placeBuilding('wall',0,23,0);});
  await p.keyboard.down('KeyW');await p.keyboard.press('KeyK');await p.waitForTimeout(900);await p.keyboard.up('KeyW');
  const pw=await pos(p);check('old jump: cannot clear a wall',pw.z<23,pw);
  await b.close();
  const summary={version:'web-webview-fix-v0.9.6',checked_at:new Date().toISOString(),url,results};
  fs.writeFileSync(path.join(release,'before.json'),JSON.stringify(summary,null,1));console.log(JSON.stringify(results,null,1));return;
 }

 // 1. K dashes forward when standing still (facing direction)
 await p.evaluate(SETUP);let a=await pos(p);
 await p.keyboard.press('KeyK');await p.waitForTimeout(90);
 const mid=await p.evaluate(()=>({dashT:__gameQA.player.dashT,inv:__gameQA.player.dashInv,fov:__gameQA.camera.fov}));
 await p.screenshot({path:path.join(captures,'dash-third-person.jpg'),quality:85});
 await p.waitForTimeout(400);let c=await pos(p);
 check('K while standing dashes ~6.5 m forward',c.z-a.z>5.5&&c.z-a.z<7.5&&Math.abs(c.x-a.x)<.3,{from:a,to:c,mid});
 check('dash widens the view briefly',mid.fov>63,mid);
 const hud=await p.evaluate(()=>({txt:document.getElementById('dashTxt').textContent,cd:__gameQA.player.dashCd,fov:__gameQA.camera.fov}));
 check('HUD shows the cooldown; view back to normal',/冲刺 \d\.\ds/.test(hud.txt)&&hud.cd>1.5&&Math.abs(hud.fov-62)<1,hud);

 // 2. cooldown: pressing again right away does nothing; after 2.5 s it works again
 a=await pos(p);await p.keyboard.press('Space');await p.waitForTimeout(400);c=await pos(p);
 check('second dash during cooldown is ignored',Math.abs(c.z-a.z)<.2,{from:a,to:c});
 await p.waitForTimeout(2200);const ready=await p.evaluate(()=>document.getElementById('dashTxt').textContent),fovRest=await p.evaluate(()=>__gameQA.camera.fov);
 a=await pos(p);await p.keyboard.press('Space');await p.waitForTimeout(450);c=await pos(p);
 check('after the cooldown Space dashes again; HUD said ready; view fully back',c.z-a.z>5.5&&ready.includes('就绪')&&fovRest===62,{ready,fovRest,from:a,to:c});

 // 3. dash follows the move direction (hold A = screen left = +x at this yaw)
 await p.evaluate(SETUP);a=await pos(p);
 await p.keyboard.down('KeyA');await p.waitForTimeout(60);await p.keyboard.press('KeyK');await p.waitForTimeout(250);await p.keyboard.up('KeyA');c=await pos(p);
 check('dash goes where you are moving',c.x-a.x>6&&Math.abs(c.z-a.z)<.5,{from:a,to:c});

 // 4. surrounded by biting mobs: standing still vs dashing out
 await p.evaluate(SETUP);await p.evaluate(RING);let h0=await p.evaluate(()=>__gameQA.player.hp);
 await p.waitForTimeout(700);let h1=await p.evaluate(()=>__gameQA.player.hp);
 await p.evaluate(()=>__gameQA.clearEntities(false));
 await p.evaluate(SETUP);await p.evaluate(RING);h0=await p.evaluate(()=>__gameQA.player.hp);
 await p.keyboard.down('KeyW');await p.keyboard.press('KeyK');await p.waitForTimeout(700);await p.keyboard.up('KeyW');
 const h2=await p.evaluate(()=>__gameQA.player.hp);c=await pos(p);
 await p.evaluate(()=>__gameQA.clearEntities(false));
 check('dashing out of a ring of biting mobs takes no damage (standing still does)',h1<h0&&h2===h0&&c.z>26,{standLoss:+(h0-h1).toFixed(1),dashLoss:+(h0-h2).toFixed(1),endedAt:c});

 // 5. acid spit passes through during the dash, hits afterwards
 const acid=await p.evaluate(()=>{const q=__gameQA,P=q.player,out={};
  const shoot=()=>{const from=P.pos.clone();from.x+=4;from.y+=1.2;const d=P.pos.clone();d.y+=1.2;d.sub(from).normalize();q.fireBullet(from,d,{dmg:10,speed:22,range:40,spread:0,color:0x99ff33},false);};
  const run=()=>{const hp=P.hp,n=q.bullets.length;for(let i=0;i<20;i++)q.updBullets(.016);return{lost:hp-P.hp,flying:q.bullets.length};};
  P.hp=P.maxHp;P.dashInv=.3;shoot();out.dashing=run();P.dashInv=0;
  q.clearEntities(false);
  P.hp=P.maxHp;shoot();out.normal=run();return out;});
 check('acid passes through during the dash, hits otherwise',acid.dashing.lost===0&&acid.normal.lost>0,acid);

 // 6. a wall stops the dash (no tunnelling)
 await p.evaluate(SETUP);await p.evaluate(()=>{__gameQA.placeBuilding('wall',0,23,0);});
 await p.keyboard.press('KeyK');await p.waitForTimeout(450);c=await pos(p);
 const inWall=await p.evaluate(()=>__gameQA.collideWalls(__gameQA.player.pos.x,__gameQA.player.pos.z,.5));
 check('dash stops at a wall instead of passing through',c.z<23&&c.z>21&&!inWall,{to:c,inWall});
 await p.evaluate(()=>{const q=__gameQA;q.damageBuilding(q.buildings[q.buildings.length-1],1e6);q.clearEntities(false);});

 // 7. first person: dash along the camera
 await p.evaluate(SETUP);await p.evaluate(()=>{__gameQA.setCamMode('first',false);__gameQA.setCamYaw(Math.PI/2);});a=await pos(p);
 await p.keyboard.press('KeyK');await p.waitForTimeout(90);await p.screenshot({path:path.join(captures,'dash-first-person.jpg'),quality:85});
 await p.waitForTimeout(400);c=await pos(p);
 check('first person: dash goes where the camera looks',c.x-a.x>5.5&&Math.abs(c.z-a.z)<.5,{from:a,to:c});
 await p.evaluate(()=>__gameQA.setCamMode('third',false));

 // 8. helicopter: Y up, H down (no medkit), U only shows the new keys, K does not dash
 await p.evaluate(SETUP);
 const heli0=await p.evaluate(()=>{const q=__gameQA;q.Game.vehiclesOwned.push('heli');const v=q.spawnVehicle('heli');v.mesh.position.set(0,0,30);v.alt=4;q.enterVehicle(v);
   q.Game.items.medkit=2;q.player.hp=40;window.__heli=v;return{alt:v.alt,msg:document.getElementById('msg').textContent};});
 await p.keyboard.down('KeyY');await p.waitForTimeout(500);await p.keyboard.up('KeyY');const altUp=await p.evaluate(()=>__heli.alt);
 await p.keyboard.down('KeyH');await p.waitForTimeout(500);await p.keyboard.up('KeyH');
 const afterH=await p.evaluate(()=>({alt:__heli.alt,medkit:__gameQA.Game.items.medkit,hp:__gameQA.player.hp,msg:document.getElementById('msg').textContent}));
 await p.keyboard.press('KeyU');await p.waitForTimeout(80);const uMsg=await p.evaluate(()=>document.getElementById('msg').textContent);
 const tip=await p.evaluate(()=>__gameQA.interactionTarget()?.tip||'');
 const hd=await p.evaluate(()=>({dashCd:__gameQA.player.dashCd,hudDash:document.getElementById('dashTxt').textContent}));
 await p.keyboard.press('KeyK');await p.waitForTimeout(80);const kInHeli=await p.evaluate(()=>__gameQA.player.dashCd);
 check('boarding the helicopter explains Y/H',heli0.msg.includes('Y 升高')&&heli0.msg.includes('H 降低'),heli0);
 check('Y raises the helicopter',altUp>heli0.alt+2.5,{start:heli0.alt,altUp});
 check('H lowers it and does not touch medkits',afterH.alt<altUp-2.5&&afterH.medkit===2&&afterH.hp===40&&!afterH.msg.includes('医疗包'),{altUp,afterH});
 check('U in the helicopter points to Y/H; interact tip shows Y/H',uMsg.includes('Y 升高')&&tip.includes('Y 升高 / H 降低'),{uMsg,tip});
 check('no dash and no dash HUD while flying',kInHeli===0&&hd.hudDash==='',{hd,kInHeli});
 // on foot again H still heals
 await p.keyboard.press('KeyI');await p.waitForTimeout(150);await p.keyboard.press('KeyH');await p.waitForTimeout(80);
 const foot=await p.evaluate(()=>({inVehicle:!!__gameQA.player.inVehicle,medkit:__gameQA.Game.items.medkit,hp:__gameQA.player.hp}));
 check('back on foot H uses a medkit',!foot.inVehicle&&foot.medkit===1&&foot.hp>40,foot);
 check('no page errors (desktop)',p.errors.length===0,p.errors);
 await p.context().close();

 // 9. phone: 冲 button with cooldown ring; in the helicopter 升 / 降
 const m=await open(b,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,userAgent:'Mozilla/5.0 (Linux; Android 12; Phone) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'});
 await m.evaluate(SETUP);
 const lab0=await m.evaluate(()=>({k:document.getElementById('vK').textContent,h:document.getElementById('vH').textContent,touch:__gameQA.isTouch}));
 const kb=await m.locator('#vK').boundingBox();a=await pos(m);
 await m.touchscreen.tap(kb.x+kb.width/2,kb.y+kb.height/2);await m.waitForTimeout(300);c=await pos(m);
 const ring=await m.evaluate(()=>{const k=document.getElementById('vK');return{cls:k.className,cd:k.style.getPropertyValue('--cd'),bg:getComputedStyle(k).backgroundImage.slice(0,40)};});
 await m.screenshot({path:path.join(captures,'phone-dash-cooldown.jpg'),quality:85});
 check('phone: button reads 冲, tapping it dashes, cooldown ring shows',lab0.k==='冲'&&lab0.h==='医疗'&&c.z-a.z>5.5&&ring.cls.includes('cd')&&ring.bg.includes('conic'),{lab0,from:a,to:c,ring});
 await m.evaluate(()=>{const q=__gameQA;q.Game.vehiclesOwned.push('heli');const v=q.spawnVehicle('heli');v.mesh.position.set(0,0,30);v.alt=4;q.enterVehicle(v);window.__heli=v;});
 await m.waitForTimeout(150);
 const lab1=await m.evaluate(()=>({k:document.getElementById('vK').textContent,h:document.getElementById('vH').textContent,ring:document.getElementById('vK').classList.contains('cd'),msg:document.getElementById('msg').textContent}));
 const hb=await m.locator('#vH').boundingBox();
 await m.screenshot({path:path.join(captures,'phone-heli-buttons.jpg'),quality:85});
 const alt0=await m.evaluate(()=>__heli.alt);
 const cdp=await m.context().newCDPSession(m);const tp=[{x:hb.x+hb.width/2,y:hb.y+hb.height/2}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:tp});await m.waitForTimeout(400);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await m.waitForTimeout(50);
 const alt1=await m.evaluate(()=>__heli.alt);
 check('phone helicopter: 冲→升, 医疗→降, holding 降 lowers it',lab1.k==='升'&&lab1.h==='降'&&!lab1.ring&&alt1<alt0-1.5&&lab1.msg.includes('升 / 降'),{lab1,alt0,alt1});
 check('no page errors (phone)',m.errors.length===0,m.errors);
 await b.close();
 const summary={version:process.env.RELEASE||'web-dash-v0.9.7',checked_at:new Date().toISOString(),url,passed:Object.values(results).filter(v=>v.ok).length,failed:fail,results};
 fs.writeFileSync(path.join(release,'dash.json'),JSON.stringify(summary,null,1));console.log(JSON.stringify({passed:summary.passed,failed:fail},null,1));if(fail.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});

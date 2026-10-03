// v0.9.1: trimmed arsenal (6 guns, each with its own mechanic), legacy-save migration, and
// ghost-preview building placement. Real keyboard / mouse / touch input wherever practical.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases',process.env.RELEASE||'web-arsenal-build-v0.9.1'),captures=path.join(release,'captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const results={},fail=[];
const check=(name,ok,detail)=>{results[name]={ok:!!ok,...(detail!==undefined?{detail}:{})};if(!ok)fail.push(name);};
const edge={executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']};
async function open(b,opts={}){const c=await b.newContext({viewport:{width:1280,height:720},...opts});const p=await c.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
  await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(500);return p;}
// 提示层都是 pointer-events:none，elementFromPoint 看不到它们；按显示状态与层级判断是否压在面板之上
const msgOnTop=p=>p.evaluate(()=>{const panelUp=[...document.querySelectorAll('.panel')].some(e=>!e.classList.contains('hidden'));
  const t=document.getElementById('toast');if(t&&t.style.display!=='none'&&+getComputedStyle(t).zIndex>40)return t.textContent;
  const m=document.getElementById('msg');if(!m.classList.contains('hidden')&&!panelUp)return m.textContent;return null;});
(async()=>{
 fs.mkdirSync(captures,{recursive:true});
 const b=await chromium.launch(edge);const p=await open(b);
 await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(400);

 // 1. roster
 const roster=await p.evaluate(()=>{const q=__gameQA;return{ids:Object.keys(q.WEAPONS),mech:Object.fromEntries(Object.entries(q.WEAPONS).map(([k,w])=>[k,[w.pellets&&'pellets',w.knock&&'knock',w.arc&&'arc',w.explode&&'explode',w.flame&&'flame',w.burn&&'burn',w.beam&&'beam',w.pierce&&'pierce'].filter(Boolean)])),dps:Object.fromEntries(Object.keys(q.WEAPONS).map(k=>[k,q.weaponDps(k)])),classes:Object.fromEntries(Object.entries(q.CLASSES).map(([k,c])=>[k,c.weapons]))};});
 check('six weapons, removed guns gone',JSON.stringify(roster.ids)===JSON.stringify(['lmg','shotgun','launcher','flamer','laser','plasma']),roster.ids);
 check('every shop weapon out-damages the machine gun',['shotgun','launcher','flamer','laser','plasma'].every(k=>roster.dps[k]>roster.dps.lmg),roster.dps);
 check('classes start with existing guns (rifleman gets shotgun)',roster.classes.rifle.join()==='lmg,shotgun'&&roster.classes.gunner.join()==='lmg'&&roster.classes.medic.join()==='lmg',roster.classes);

 // 2. each weapon hits; flame keeps burning; shotgun knocks back
 const mech=await p.evaluate(()=>{const q=__gameQA,out={};q.newGame(false);q.Game.state='paused';
  for(const w of Object.keys(q.WEAPONS)){q.clearEntities(false);q.player.pos.set(0,0,20);q.player.mesh.position.copy(q.player.pos);q.player.yaw=0;q.setCamYaw(0);q.player.fireCd=0;
    const m=q.spawnMonster('mob',0,32);m.hp=m.maxHp=1e6;m.emerge=0;q.Game.curWeapon=w;q.Input.keys.J=true;for(let i=0;i<40;i++){q.updPlayer(.05);q.updBullets(.05);}q.Input.reset();for(let i=0;i<40;i++)q.updBullets(.05);out[w]=Math.round(1e6-m.hp);}
  q.clearEntities(false);const f=q.spawnMonster('mob',0,30);f.hp=f.maxHp=1e6;f.emerge=0;q.player.fireCd=0;q.Game.curWeapon='flamer';q.Input.keys.J=true;for(let i=0;i<10;i++){q.updPlayer(.05);q.updBullets(.05);}q.Input.reset();for(let i=0;i<20;i++)q.updBullets(.05);
  const hpStop=f.hp;f.atkCd=99;for(let i=0;i<30;i++)q.updMonsters(.05);out.burnAfterStop=Math.round(hpStop-f.hp);
  q.clearEntities(false);const k=q.spawnMonster('mob',0,28);k.hp=k.maxHp=1e6;k.emerge=0;k.speed=0;const z0=k.mesh.position.z;q.player.fireCd=0;q.Game.curWeapon='shotgun';q.Input.keys.J=true;q.updPlayer(.05);q.Input.reset();for(let i=0;i<20;i++)q.updBullets(.05);
  out.knockback=+(k.mesh.position.z-z0).toFixed(2);return out;});
 check('all six weapons deal damage at 12 m',['lmg','shotgun','launcher','flamer','laser','plasma'].every(w=>mech[w]>0),mech);
 check('flamethrower keeps burning after you stop',mech.burnAfterStop>0,mech);
 check('shotgun knocks bugs back',mech.knockback>.8,mech);

 // 3. legacy save migration + cloud validation
 const mig=await p.evaluate(()=>{const q=__gameQA;
  const old={testMode:false,loop:1,chapter:5,level:2,gold:1000,score:900,cls:'rifle',weapons:['rifle','smg','minigun','sniper','railgun','laser'],curWeapon:'railgun',weaponLv:{minigun:5,smg:2,sniper:3,laser:2},items:{medkit:2,grenade:3},hpBonus:0,vehiclesOwned:[],squadCount:0,perks:{magnet:false,regen:false},baseHp:2000,pendingDrops:[],buildings:[],time:Date.now()};
  const m=q.migrateWeapons(old);q.loadGame(old);
  return{migrated:m,loaded:{weapons:q.Game.weapons,cur:q.Game.curWeapon,lv:q.Game.weaponLv,gold:q.Game.gold},saved:JSON.parse(localStorage.getItem('sst_save_auto')).weapons};});
 const expectedRefund=650+(230+460+680)+3200+(1900+ (670+1330+2000+2660+3330))-(110+210+320+420+530);
 check('legacy guns merged/refunded on load',JSON.stringify(mig.loaded.weapons)==='["lmg","shotgun","laser"]'&&mig.loaded.cur==='shotgun'&&mig.loaded.lv.lmg===5&&mig.loaded.lv.laser===2&&mig.migrated.refund>3800&&mig.loaded.gold===1000+mig.migrated.refund&&mig.saved.every(w=>['lmg','shotgun','laser'].includes(w)),{...mig,note:mig.migrated.note,expectedRefundApprox:expectedRefund});
 await p.waitForTimeout(3600);check('migration notice shown to the player',(await p.evaluate(()=>document.getElementById('msg').textContent)).includes('武器调整'),await p.evaluate(()=>document.getElementById('msg').textContent));

 // 4. ghost placement via real keys
 await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.Game.gold=5000;q.clearEntities(false);q.player.pos.set(0,0,20);q.player.mesh.position.copy(q.player.pos);q.player.yaw=0;q.setCamYaw(0);q.setCamMode('third',false);});
 await p.waitForTimeout(300);const n0=await p.evaluate(()=>__gameQA.buildings.length);
 await p.keyboard.press('KeyL');await p.locator('#buildGrid .shopItem').filter({hasText:'自动机枪塔'}).click();await p.waitForTimeout(250);
 const g1=await p.evaluate(()=>({kind:__gameQA.place.kind,ghost:!!__gameQA.place.ghost?.parent,panelOpen:__gameQA.panelOpen,gold:__gameQA.Game.gold,bar:!document.getElementById('placeBar').classList.contains('hidden'),state:document.getElementById('placeState').textContent}));
 await p.screenshot({path:path.join(captures,'ghost-valid.jpg'),quality:84});
 check('choosing a building shows a ghost, no charge yet',g1.kind==='mgTurret'&&g1.ghost&&!g1.panelOpen&&g1.gold===5000&&g1.bar&&g1.state.includes('可以'),g1);
 await p.keyboard.press('KeyJ');await p.waitForTimeout(200);
 const g2=await p.evaluate(()=>({n:__gameQA.buildings.length,gold:__gameQA.Game.gold,kind:__gameQA.place.kind}));
 check('J places it and charges then',g2.n===n0+1&&g2.gold===4700&&!g2.kind,g2);
 await p.keyboard.press('KeyL');await p.locator('#buildGrid .shopItem').filter({hasText:'自动机枪塔'}).click();await p.waitForTimeout(250);
 const g3=await p.evaluate(()=>({valid:__gameQA.place.valid,reason:__gameQA.place.reason,state:document.getElementById('placeState').textContent}));
 await p.screenshot({path:path.join(captures,'ghost-blocked.jpg'),quality:84});
 await p.keyboard.press('KeyJ');await p.waitForTimeout(150);const blockedMsg=await msgOnTop(p);const g4=await p.evaluate(()=>({n:__gameQA.buildings.length,gold:__gameQA.Game.gold}));
 check('same spot again: red ghost with reason, J refused with a visible message, no charge',!g3.valid&&g3.reason.includes('重叠')&&g4.n===n0+1&&g4.gold===4700&&blockedMsg&&blockedMsg.includes('不能建'),{g3,blockedMsg,g4});
 await p.keyboard.down('KeyD');await p.waitForTimeout(700);await p.keyboard.up('KeyD');await p.waitForTimeout(100);
 const g5=await p.evaluate(()=>({valid:__gameQA.place.valid,reason:__gameQA.place.reason}));
 await p.keyboard.press('KeyJ');await p.waitForTimeout(150);const g6=await p.evaluate(()=>({n:__gameQA.buildings.length,gold:__gameQA.Game.gold}));
 check('walk aside: ghost turns valid and places',g5.valid&&g6.n===n0+2&&g6.gold===4400,{g5,g6});
 await p.keyboard.press('KeyL');await p.locator('#buildGrid .shopItem').filter({hasText:'合金围墙'}).click();await p.waitForTimeout(150);
 const r0=await p.evaluate(()=>__gameQA.place.yaw);await p.keyboard.down('KeyE');await p.waitForTimeout(400);await p.keyboard.up('KeyE');const r1=await p.evaluate(()=>__gameQA.place.yaw);
 const st=await p.evaluate(()=>__gameQA.Game.state);
 await p.keyboard.press('Escape');await p.waitForTimeout(150);const g7=await p.evaluate(()=>({kind:__gameQA.place.kind,gold:__gameQA.Game.gold,state:__gameQA.Game.state}));
 check('Q/E turn the ghost with the camera; Esc cancels free of charge',Math.abs(r1-r0)>.4&&st==='prep'&&!g7.kind&&g7.gold===4400&&g7.state==='prep',{r0,r1,st,g7});
 const rules=await p.evaluate(()=>{const q=__gameQA,s=q.MOUTHS.find(m=>m.main);return{gate:q.placementCheck('mgTurret',0,-16,0),tunnel:q.placementCheck('mgTurret',s.x-s.dx*10,s.z-s.dz*10,0),steep:q.placementCheck('mgTurret',-31,-14,0)};});
 check('blocked spots explain why (gate / tunnel / cliff)',rules.gate.includes('城门')&&rules.tunnel.includes('隧道')&&rules.steep!=='',rules);
 await p.evaluate(()=>{__gameQA.Game.gold=0;});await p.keyboard.press('KeyL');await p.locator('#buildGrid .shopItem').filter({hasText:'重型堡垒'}).click();await p.waitForTimeout(100);
 const poor=await msgOnTop(p);check('not enough gold message is visible above the build panel',poor&&poor.includes('金币不足'),poor);
 await p.keyboard.press('Escape');
 check('no page errors (desktop)',p.errors.length===0,p.errors);

 // 5. phone: L button -> pick -> place button
 const m=await open(b,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 12; Phone) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'});
 await m.evaluate(()=>{const q=__gameQA;q.newGame(false);q.Game.gold=2000;q.clearEntities(false);q.player.pos.set(0,0,20);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);});await m.waitForTimeout(400);
 const tap=async sel=>{const bx=await m.locator(sel).first().boundingBox();await m.touchscreen.tap(bx.x+bx.width/2,bx.y+bx.height/2);await m.waitForTimeout(250);};
 const n1=await m.evaluate(()=>__gameQA.buildings.length);
 const g0=await m.evaluate(()=>__gameQA.Game.gold);await tap('#vO');const afterShop=await m.evaluate(()=>({gold:__gameQA.Game.gold,weapons:__gameQA.Game.weapons.length,open:__gameQA.panelOpen}));
 check('phone: tapping 商店 opens it without buying what is under the finger',afterShop.open&&afterShop.gold===g0&&afterShop.weapons===1,afterShop);
 await m.evaluate(()=>document.getElementById('shopClose').click());await m.waitForTimeout(200);
 await tap('#vL');const afterBuild=await m.evaluate(()=>({open:__gameQA.panelOpen,kind:__gameQA.place.kind}));
 check('phone: tapping 建造 opens the panel without picking a building',afterBuild.open&&!afterBuild.kind,afterBuild);await tap('#buildGrid .shopItem:has-text("自动炮台")');await m.screenshot({path:path.join(captures,'phone-ghost.jpg'),quality:82});
 await tap('#placeOk');const ph=await m.evaluate(()=>({n:__gameQA.buildings.length,gold:__gameQA.Game.gold,kind:__gameQA.place.kind}));
 check('phone: build button, pick, place button',ph.n===n1+1&&ph.gold===1300&&!ph.kind,ph);
 check('no page errors (phone)',m.errors.length===0,m.errors);
 await b.close();
 const summary={version:process.env.RELEASE||'web-arsenal-build-v0.9.1',checked_at:new Date().toISOString(),passed:Object.values(results).filter(v=>v.ok).length,failed:fail,results};
 fs.writeFileSync(path.join(release,'arsenal-build.json'),JSON.stringify(summary,null,1));
 console.log(JSON.stringify({passed:summary.passed,failed:fail},null,1));if(fail.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});

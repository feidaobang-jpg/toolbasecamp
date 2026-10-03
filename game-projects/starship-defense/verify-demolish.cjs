// v0.9.5 viewer reports (2026-10-03 comments): demolish mode, turret placed on a squad mate,
// first-person laser glare. Keyboard input for the demolish/placement flows.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases/web-demolish-v0.9.5'),captures=path.join(release,'captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const results={},fail=[];const check=(n,ok,d)=>{results[n]={ok:!!ok,...(d!==undefined?{detail:d}:{})};if(!ok)fail.push(n);};
(async()=>{
 fs.mkdirSync(captures,{recursive:true});
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
 const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(500);
 const key=async(k,n=1)=>{for(let i=0;i<n;i++){await p.keyboard.press(k);await p.waitForTimeout(90);}};
 await key('Enter');await p.waitForTimeout(400);
 // 1. turret cannot be placed on a squad mate; a mate already inside a building escapes
 const sq=await p.evaluate(()=>{const q=__gameQA;q.Game.gold=5000;q.clearEntities(false);q.player.pos.set(0,0,20);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;
  q.Game.squadCount=1;q.spawnSquad();const s=q.squad[0];s.mesh.position.set(0,0,25.5);s.patrol={x:0,z:25.5};s.patrolTimer=99;
  q.startPlacement('mgTurret');const c={valid:q.place.valid,reason:q.place.reason};q.confirmPlacement();const n=q.buildings.length;q.cancelPlacement(true);
  const bd=q.placeBuilding('mgTurret',0,25.5,0);for(let i=0;i<20;i++)q.updSquad(.05);
  return{check:c,placedOnMate:q.buildings.length>n,mateStillInside:q.collideWalls(s.mesh.position.x,s.mesh.position.z,.65),mateAt:[+s.mesh.position.x.toFixed(1),+s.mesh.position.z.toFixed(1)]};});
 check('turret placement refused on top of a squad mate',!sq.check.valid&&sq.check.reason.includes('队友'),sq);
 check('a squad mate already inside a building walks free',!sq.mateStillInside,sq);
 // 2. demolish via keyboard: L -> last card (拆除) -> target in front -> J -> refund, stays in mode, Esc exits
 await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.Game.state='prep';q.clearEntities(false);q.player.pos.set(0,0,20);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;q.squad.forEach(s=>s.mesh.position.set(-20,0,20));
   q.placeBuilding('cannonTurret',0,26,0);q.placeBuilding('mgTurret',6,26,0);q.Game.gold=1000;});
 await key('KeyL');await p.waitForTimeout(150);
 for(let i=0;i<10;i++){const t=await p.evaluate(()=>document.activeElement?.textContent||'');if(t.includes('拆除设施'))break;const before=t;await key('ArrowDown');if((await p.evaluate(()=>document.activeElement?.textContent||''))===before)await key('ArrowRight');}
 const onCard=await p.evaluate(()=>document.activeElement?.textContent||'');await key('Enter');await p.waitForTimeout(150);
 const d0=await p.evaluate(()=>({mode:__gameQA.place.mode,target:__gameQA.place.target?.kind,state:document.getElementById('placeState').textContent,btn:document.getElementById('placeOk').textContent}));
 await p.screenshot({path:path.join(captures,'demolish-target.jpg'),quality:84});
 const n0=await p.evaluate(()=>__gameQA.buildings.length);await key('KeyJ');await p.waitForTimeout(150);
 const d1=await p.evaluate(n=>({removed:__gameQA.buildings.length===n-1,gold:__gameQA.Game.gold,mode:__gameQA.place.mode,cannonGone:!__gameQA.buildings.some(b=>b.kind==='cannonTurret')}),n0);
 check('keyboard: build panel → 拆除 card → red ring on the turret in front',onCard.includes('拆除设施')&&d0.mode==='demolish'&&d0.target==='cannonTurret'&&d0.btn.includes('拆除'),{onCard,d0});
 check('J demolishes it, refunds half (700→350), stays in demolish mode',d1.removed&&d1.cannonGone&&d1.gold===1350&&d1.mode==='demolish',d1);
 await p.keyboard.down('KeyQ');await p.waitForTimeout(450);await p.keyboard.up('KeyQ');const d2=await p.evaluate(()=>__gameQA.place.target?.kind);
 await key('Escape');const d3=await p.evaluate(()=>({mode:__gameQA.place.mode,state:__gameQA.Game.state}));
 check('turning targets the next building; Esc exits without pausing',d2==='mgTurret'&&!d3.mode&&d3.state==='prep',{d2,d3});
 const def=await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.Game.state='prep';q.player.pos.set(0,5,-20);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(Math.PI/2);q.startDemolish();q.updPlacement?.();const t=q.place.target?.kind;q.cancelPlacement(true);return t;});
 check('initial base walls/turrets can be demolished too',!!def,def);
 // 3. first-person laser no longer starts at the eye
 const fp=await p.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.player.pos.set(0,0,40);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;q.Game.weapons.push('laser');q.selectWeapon('laser',true);q.setCamMode('first',false);
   const m=q.spawnMonster('mob',0,52,{quiet:true});m.hp=m.maxHp=1e6;m.emerge=0;m.speed=0;q.player.fireCd=0;q.Input.keys.J=true;q.updPlayer(.05);q.Input.reset();q.updCamera(.016);
   const beam=q.scene.children.find(o=>o.isMesh&&o.geometry?.type==='CylinderGeometry'&&o.geometry.parameters.radiusTop===.06&&o.visible);
   const glow=beam?.children[0];const eye=q.camera.position;const start=beam?beam.position.clone().addScaledVector(new beam.position.constructor(0,1,0).applyQuaternion(beam.quaternion),-beam.scale.y/2):null;
   return{startFromEye:start?+start.distanceTo(eye).toFixed(2):null,core:beam?.material.opacity,glow:glow?.material.opacity,glowScale:glow?.scale.x,hit:1e6-m.hp};});
 check('first-person laser starts ≥1 m from the eye with a dimmer glow and still hits',fp.startFromEye>=1&&fp.glow<.2&&fp.core<=.7&&fp.hit>0,fp);
 check('no page errors',errors.length===0,errors);
 await b.close();
 const summary={version:'web-demolish-v0.9.5',checked_at:new Date().toISOString(),passed:Object.values(results).filter(v=>v.ok).length,failed:fail,results};
 fs.writeFileSync(path.join(release,'demolish.json'),JSON.stringify(summary,null,1));console.log(JSON.stringify({passed:summary.passed,failed:fail},null,1));if(fail.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});

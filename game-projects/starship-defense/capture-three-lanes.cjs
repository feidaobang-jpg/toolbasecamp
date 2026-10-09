// Actual browser RAF footage, with declared QA clock/position and inspection cameras.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PW||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.join(__dirname,'media-kit/releases/web-three-lanes-v0.31.0/captures');fs.mkdirSync(out,{recursive:true});
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}}),p=await ctx.newPage(),errors=[],shots=[];
 p.on('pageerror',e=>errors.push(e.message));const snap=async(name,note)=>{await p.screenshot({path:path.join(out,name+'.png')});shots.push({file:name+'.png',note});};
 try{
 await p.goto((process.env.GAME_URL||'http://127.0.0.1:8809/html/game/starship-defense/index.html')+'?qa=1');await p.waitForFunction(()=>__gameQA&&window.__ccReady);
 await p.click('#btnVersus');await snap('rules','Actual current rules');await p.click('[data-vs-ai="normal"]');
 await p.evaluate(()=>{const q=__gameQA;q.AudioSys.master.gain.value=0;q.versus.state.time=19.9;q.setCameraView(2,false);q.setCamYaw(0);});await p.waitForTimeout(1100);
 await p.keyboard.down('KeyW');await p.waitForTimeout(2500);await p.keyboard.up('KeyW');await snap('lane-follow','Real W input following the first wave');
 // Advance existing live combat to the wave that contains all four free minion roles.
 await p.evaluate(()=>{const q=__gameQA,v=q.versus;v.state.time=319.99;v.update(.02);q.player.pos.set(0,0,838);q.player.mesh.position.copy(q.player.pos);q.setCameraView(1,false);q.setCamYaw(0);});
 await p.waitForTimeout(4000);await snap('minion-wave','QA clock to 5:20; normal wave contains guard, spitter, siege and healer');
 await p.keyboard.down('KeyJ');await p.keyboard.down('KeyW');await p.waitForTimeout(3200);await p.keyboard.up('KeyJ');await p.keyboard.up('KeyW');await snap('lane-fight','Real shooting and movement');
 await p.evaluate(()=>{const q=__gameQA,c=q.versus.state.camps.find(x=>x.id==='blue-energy');q.player.pos.set(c.x,0,c.z-7);q.player.mesh.position.copy(q.player.pos);q.player.hp=q.player.maxHp;q.player.invulnerable=4;q.setCamYaw(0);});
 await p.keyboard.down('KeyJ');await p.waitForTimeout(5000);await p.keyboard.up('KeyJ');await snap('jungle-fight','QA approach energy camp; real attacks and jungle pursuit');
 await p.waitForTimeout(3500);await p.evaluate(()=>{const q=__gameQA;q.Game.state='pause';q.camera.position.set(0,205,873);q.camera.lookAt(0,0,900);q.renderer.render(q.scene,q.camera);});await p.waitForTimeout(200);await snap('arena-overview','Paused live scene, inspection camera only: actual three paths, six towers and eight camps');
 // Close inspection of actual units from a live wave, without replacing meshes.
 await p.evaluate(()=>{const q=__gameQA,v=q.versus;const units=v.state.units.filter(u=>u.team==='blue'&&u.laneMinion);const u=units.find(u=>u.prof==='siege')||units[0];q.camera.position.set(u.mesh.position.x+7,10,u.mesh.position.z+9);q.camera.lookAt(u.mesh.position.x,1,u.mesh.position.z);q.renderer.render(q.scene,q.camera);});await p.waitForTimeout(200);await snap('creature-closeup','Paused inspection camera on actual insect minion, not hero mesh');
 if(errors.length)throw Error(errors.join('\n'));
 }finally{await ctx.close();await b.close();}
 const source=await p.video().path(),target=path.join(out,'three-lanes-realtime.webm');fs.renameSync(source,target);
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({capture_mode:'realtime-automation',audio:'none',viewport:[1280,720],method:'Real WebGL RAF and keyboard. QA advances match clock to 0:20 and 5:20, positions hero at lane/camp, then pauses for overhead/close inspection camera. Not a complete human playthrough.',video:path.basename(target),screenshots:shots,errors,hashes:Object.fromEntries([target,...shots.map(s=>path.join(out,s.file))].map(f=>[path.basename(f),crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]))},null,2));
 console.log('Captured',shots.length,'screenshots and',target);
})().catch(e=>{console.error(e);process.exitCode=1;});

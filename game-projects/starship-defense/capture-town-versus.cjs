// Real RAF footage; QA repositioning/time advances are explicitly in the manifest.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PW||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.join(__dirname,'media-kit/releases/web-town-versus-v0.30.0'),out=path.join(root,'captures');fs.mkdirSync(out,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8809/html/game/starship-defense/index.html';
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}}),p=await ctx.newPage();
 const errors=[],shots=[];p.on('pageerror',e=>errors.push(e.message));
 const snap=async(name,note)=>{await p.screenshot({path:path.join(out,name+'.png')});shots.push({file:name+'.png',note});};
 try{
  await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  await p.click('#btnRV');await snap('town-menu','当前规则菜单');await p.click('#rvStart');
  await p.evaluate(()=>{__gameQA.AudioSys.master.gain.value=0;});await p.waitForTimeout(5300);
  await p.keyboard.down('KeyW');await p.waitForTimeout(2500);await p.keyboard.up('KeyW');await snap('town-street','真实键盘驾驶，起点街道');
  // Visit all presets in real time and turn continuously; terrain never rotates.
  for(let i=0;i<6;i++){await p.keyboard.press('KeyC');await p.keyboard.down('KeyE');await p.waitForTimeout(1100);await p.keyboard.up('KeyE');await snap('town-camera-'+i,'实际C切换预设并E转向');}
  await p.evaluate(()=>{const q=__gameQA,r=q.rvBreakout;q.setCameraView(1,false);q.setCamYaw(0);r.state.rv.mesh.position.set(-55,0,1568);q.player.pos.copy(r.state.rv.mesh.position);r.state.lastPos={x:-55,z:1568};});
  await p.waitForTimeout(2200);await snap('town-zombies','QA移到住宅感染区，随后实时僵尸追击');
  await p.keyboard.down('KeyJ');await p.waitForTimeout(3000);await p.keyboard.up('KeyJ');await snap('town-combat','实际J射击与敌人受伤');
  await p.evaluate(()=>{const q=__gameQA,r=q.rvBreakout;r.state.rv.mesh.position.set(112,0,1545);q.player.pos.copy(r.state.rv.mesh.position);r.state.lastPos={x:112,z:1545};r.state.rv.hp=800;q.setCamYaw(0);r.panel();});await snap('town-garage','QA停车在修理厂，真实服务界面');await p.click('#rvRepair');await p.waitForTimeout(6400);await snap('town-repaired','真实6秒维修结束');
  await p.evaluate(()=>{const q=__gameQA,r=q.rvBreakout;r.state.rv.mesh.position.set(-112,0,1700);q.player.pos.copy(r.state.rv.mesh.position);r.state.lastPos={x:-112,z:1700};r.panel();});await snap('town-market','QA停车到超市，实际售货机购买界面');await p.click('#rvFood');await p.click('#rvClose');
  await p.keyboard.press('Escape');await p.click('#btnQuit');await p.click('#btnVersus');await snap('versus-menu','当前对战规则');await p.click('[data-vs-ai="normal"]');
  await p.evaluate(()=>{const q=__gameQA;q.versus.state.time=19.9;q.setCameraView(2,false);});await p.waitForTimeout(1800);await snap('versus-waves','QA推进到开战前，实时自动出双路兵线');
  await p.keyboard.down('KeyW');await p.waitForTimeout(3500);await p.keyboard.up('KeyW');await p.keyboard.down('KeyE');await p.waitForTimeout(2000);await p.keyboard.up('KeyE');await snap('versus-follow','真实移动/转向，护送基础兵');
  await p.keyboard.press('Escape');await p.waitForTimeout(300);
  if(errors.length)throw new Error(errors.join('\n'));
 }finally{await ctx.close();await b.close();}
 const video=await p.video().path();const target=path.join(out,'town-versus-realtime.webm');fs.renameSync(video,target);
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({capture_mode:'realtime-automation',audio:'none',viewport:[1280,720],method:'Real browser RAF, keyboard/click input; QA repositioning at residential zone, garage, market and versus clock advance only; no offline frames',video:path.basename(target),screenshots:shots,hashes:Object.fromEntries([target,...shots.map(s=>path.join(out,s.file))].map(f=>[path.basename(f),crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),errors},null,2));
 console.log('Captured',shots.length,'screenshots and',target);
})().catch(e=>{console.error(e);process.exitCode=1;});

// Browser regression for the isolated RV route. Teleports/timer advances below
// test rule boundaries; screenshots and driving samples use the real RAF loop.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url=process.env.GAME_URL||'http://127.0.0.1:8798/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-rv-v0.28.0/qa');fs.mkdirSync(out,{recursive:true});
const results=[],pass=(name,data)=>{results.push({name,pass:true,data});console.log('PASS',name,JSON.stringify(data??''));};
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 try{
  const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
  await p.evaluate(()=>localStorage.setItem('sst_save_auto','{"untouched":"campaign"}'));
  await p.click('#btnRV');await p.waitForSelector('#rvMenu:not(.hidden)');await p.screenshot({path:path.join(out,'desktop-menu.png')});
  await p.keyboard.press('Enter');await p.waitForFunction(()=>__gameQA.rvBreakout.state.active);
  const start=await p.evaluate(()=>({vehicle:__gameQA.player.inVehicle.kind,hp:__gameQA.rvBreakout.state.rv.hp,ground:__gameQA.groundMesh.visible,base:__gameQA.base.mesh.visible,save:localStorage.getItem('sst_save_auto')}));
  assert.equal(start.vehicle,'rv');assert.equal(start.hp,1400);assert.equal(start.ground,false);assert.equal(start.base,false);assert.equal(start.save,'{"untouched":"campaign"}');pass('独立入口、房车上车、隐藏基地、战役存档保留',start);
  const z=await p.evaluate(()=>__gameQA.player.pos.z);await p.keyboard.down('KeyW');await p.waitForTimeout(5000);await p.keyboard.up('KeyW');
  const drive=await p.evaluate(()=>({z:__gameQA.player.pos.z,fuel:__gameQA.rvBreakout.state.fuel,enemies:__gameQA.monsters.length}));assert.ok(drive.z>z+45);assert.ok(drive.fuel<100);assert.ok(drive.enemies>0);pass('实际按W驾驶、燃料消耗、虫群追逐',drive);
  await p.screenshot({path:path.join(out,'desktop-drive.png')});
  await p.keyboard.press('KeyI');await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>__gameQA.player.inVehicle),null);
  const hurt=await p.evaluate(()=>{const q=__gameQA,v=q.rvBreakout.state.rv,old=v.hp;q.damageVehicle(v,100);return {old,hp:v.hp,target:q.monsterTargets(q.monsters[0]).kind};});assert.equal(hurt.old-hurt.hp,100);assert.ok(['player','vehicle'].includes(hurt.target));pass('空车可受伤并成为虫群目标',hurt);
  // Isolate the repair boundary from other damage while preserving real 8s work.
  await p.evaluate(()=>{__gameQA.clearEntities(false);__gameQA.rvBreakout.state.spawn=999;});
  await p.keyboard.press('KeyO');await p.waitForSelector('#rvPanel:not(.hidden)');await p.click('#rvRepair');
  assert.ok(await p.evaluate(()=>__gameQA.rvBreakout.state.job));
  await p.waitForTimeout(8500);const repair=await p.evaluate(()=>({hp:__gameQA.rvBreakout.state.rv.hp,scrap:__gameQA.rvBreakout.state.scrap,job:__gameQA.rvBreakout.state.job}));assert.equal(repair.hp,1400);assert.equal(repair.scrap,20);assert.equal(repair.job,null);pass('下车维修真实计时8秒并扣40零件',repair);
  await p.evaluate(()=>{const q=__gameQA,s=q.rvBreakout.state;s.rv.mesh.position.set(0,0,2100);q.player.pos.set(18,0,2100);q.player.mesh.position.copy(q.player.pos);s.spawn=999;});
  await p.keyboard.press('KeyI');await p.waitForTimeout(200);assert.ok(await p.evaluate(()=>__gameQA.rvBreakout.state.search>0));
  await p.evaluate(()=>{const r=__gameQA.rvBreakout;r.state.search=17.9;r.update(.2);});
  const loot=await p.evaluate(()=>({scrap:__gameQA.rvBreakout.state.scrap,looted:__gameQA.rvBreakout.state.looted}));assert.equal(loot.scrap,130);assert.equal(loot.looted[0],true);pass('搜索补给、一次性奖励',loot);
  await p.evaluate(()=>{const q=__gameQA;q.player.pos.set(4,0,2100);q.player.mesh.position.copy(q.player.pos);});
  await p.keyboard.press('KeyO');await p.click('#rvGun');await p.waitForTimeout(6300);
  assert.equal(await p.evaluate(()=>__gameQA.rvBreakout.state.gun),1);pass('机枪升级真实计时完成');
  const gate=await p.evaluate(()=>{const r=__gameQA.rvBreakout;r.state.hold=34.9;r.update(.2);return {stage:r.state.stage,blocked:r.blocked(0,2800),oldGate:r.state.nodes[0].gate.visible};});assert.equal(gate.stage,1);assert.equal(gate.oldGate,false);assert.equal(gate.blocked,true);pass('补给站通行计时、下一站边界',gate);
  await p.keyboard.press('Escape');await p.waitForSelector('#menuPause:not(.hidden)');const time=await p.evaluate(()=>__gameQA.rvBreakout.state.elapsed);await p.waitForTimeout(500);assert.equal(await p.evaluate(()=>__gameQA.rvBreakout.state.elapsed),time);pass('暂停冻结路线时钟');
  await p.click('#btnQuit');await p.waitForSelector('#menuMain:not(.hidden)');
  const back=await p.evaluate(()=>({active:__gameQA.rvBreakout.state.active,base:__gameQA.base.mesh.visible,ground:__gameQA.groundMesh.visible,save:localStorage.getItem('sst_save_auto')}));assert.equal(back.active,false);assert.equal(back.base,true);assert.equal(back.ground,true);assert.equal(back.save,'{"untouched":"campaign"}');pass('退出恢复战场、战役存档未改',back);
  await p.reload();await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);await p.click('#btnRV');await p.click('#rvContinue');
  const loaded=await p.evaluate(()=>({stage:__gameQA.rvBreakout.state.stage,gun:__gameQA.rvBreakout.state.gun,hp:__gameQA.rvBreakout.state.rv.hp,gate:__gameQA.rvBreakout.state.nodes[0].gate.visible}));assert.equal(loaded.stage,1);assert.equal(loaded.gun,1);assert.equal(loaded.gate,false);pass('刷新后房车独立进度恢复',loaded);
  await p.evaluate(()=>{const r=__gameQA.rvBreakout;r.state.spawn=999;r.state.stage=3;r.state.rv.mesh.position.z=3980;r.update(.05);});await p.waitForSelector('#rvResult:not(.hidden)');assert.ok((await p.textContent('#rvResultTitle')).includes('成功'));pass('完整目标终点胜利与结果');await p.screenshot({path:path.join(out,'desktop-win.png')});
  await p.keyboard.press('Enter');await p.waitForFunction(()=>__gameQA.rvBreakout.state.active&&!__gameQA.rvBreakout.state.over);await p.evaluate(()=>__gameQA.damageVehicle(__gameQA.rvBreakout.state.rv,99999));await p.waitForSelector('#rvResult:not(.hidden)');assert.ok((await p.textContent('#rvResultTitle')).includes('吞没'));pass('房车毁坏失败、Enter重玩');
  await p.click('#rvRetry');await p.keyboard.press('Escape');await p.click('#btnRestartLv');assert.equal(await p.evaluate(()=>__gameQA.Game.state),'battle');await p.waitForFunction(()=>__gameQA.AudioSys.ctx.state==='running');pass('暂停重开恢复玩法与声音');
  const modes=await p.evaluate(()=>{const q=__gameQA,z=q.rvBreakout.state.rv.mesh.position.z;q.setDeviceMode('touch');const touch=q.isTouch;q.setDeviceMode('desktop');return {touch,desktop:!q.isTouch,same:z===q.rvBreakout.state.rv.mesh.position.z};});assert.ok(modes.touch&&modes.desktop&&modes.same);pass('电脑/手机操作切换保留房车进度',modes);
  // Sustained 36-insect load, real movement + Q/E. No capture during FPS sampling.
  await p.evaluate(()=>{const r=__gameQA.rvBreakout;r.state.spawn=999;r.spawnSwarm(36);__gameQA.startMeasure();});await p.keyboard.down('KeyW');await p.keyboard.down('KeyE');await p.waitForTimeout(7000);await p.keyboard.up('KeyW');await p.keyboard.up('KeyE');
  const perf=await p.evaluate(()=>__gameQA.endMeasure());delete perf.raw;pass('36虫移动转视角性能测量',perf);await p.screenshot({path:path.join(out,'desktop-swarm.png')});
  assert.deepEqual(errors,[]);pass('桌面无脚本异常');
  const m=await b.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'});const merr=[];m.on('pageerror',e=>merr.push(e.message));await m.goto(url+'?qa=1');await m.waitForFunction(()=>window.__gameQA&&window.__ccReady);await m.click('#btnRV');await m.click('#rvStart');
  const mobile=await m.evaluate(()=>({touch:__gameQA.isTouch,rotate:document.getElementById('stage').style.transform,hud:document.getElementById('rvHUD').getBoundingClientRect().toJSON(),ready:__gameQA.rvBreakout.state.active}));assert.equal(mobile.touch,true);assert.ok(mobile.rotate.includes('rotate(90deg)'));pass('手机竖屏模拟自动横屏并可进入',mobile);
  const ib=await m.locator('#vI').boundingBox();await m.touchscreen.tap(ib.x+ib.width/2,ib.y+ib.height/2);await m.waitForTimeout(250);assert.equal(await m.evaluate(()=>!!__gameQA.player.inVehicle),false);pass('触屏互动按钮下车');
  await m.setViewportSize({width:844,height:390});await m.waitForTimeout(250);await m.screenshot({path:path.join(out,'mobile-landscape.png')});await m.setViewportSize({width:390,height:844});await m.screenshot({path:path.join(out,'mobile-portrait.png')});assert.deepEqual(merr,[]);pass('横竖切换及手机模拟无脚本异常');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,limitations:['手机为视口和触控模拟，未做真机验收','规则边界部分用QA传送和计时推进；驾驶、整备、性能为实际RAF']},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(out,'failure.txt'),String(e.stack));process.exitCode=1;});

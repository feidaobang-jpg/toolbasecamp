// 独立浏览器会话通过真实本地WebSocket中继验收2/3/4人第三关。
const fs=require('fs');
const {launch,BASE,out,sleep}=require('./lib');
let browser;
(async()=>{
 browser=await launch();const results=[],errors=[];
 const check=(name,ok,data)=>{results.push({name,pass:!!ok,data});console.log(ok?'PASS':'FAIL',name,JSON.stringify(data??''));};
 for(const count of [2,3,4]){
  const contexts=[],pages=[];
  for(let i=0;i<count;i++){
   const context=await browser.newContext({viewport:i===1?{width:844,height:390}:{width:960,height:540},hasTouch:i===1,isMobile:i===1});contexts.push(context);
   await context.addInitScript(()=>{localStorage.setItem('cd3d-stage1:stage','2');localStorage.setItem('cd3d-stage1:quality','"low"');});
   const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));
   await p.goto(BASE+'?test=1&seed=55');await p.waitForFunction(()=>!!window.__COOP_QA__);
   await p.locator('[data-act=coop]').first().click();await p.locator('[data-field=hero]').selectOption(String(i));
  }
  const host=pages[0],guest=pages[1];
  await host.locator('[data-field=capacity]').selectOption(String(count));await host.locator('[data-do=create]').click();
  await host.waitForFunction(()=>__COOP_QA__.connection.room);
  const code=await host.evaluate(()=>__COOP_QA__.connection.room.code);
  for(const p of pages.slice(1)){await p.locator('[data-field=code]').fill(code);await p.locator('[data-do=join]').click();await p.waitForFunction(()=>__COOP_QA__.connection.room);await p.locator('[data-do=ready]').click();}
  await host.waitForFunction(()=>__COOP_QA__.connection.room.players.every(p=>p.ready));await host.locator('[data-do=start]').click();
  await guest.waitForFunction(()=>__COOP_QA__.connection.stateCount>4);
  check(count+'人第三关开局',await guest.evaluate(()=>__CD_TEST__.snapshot().stage===3));
  await host.evaluate(()=>{const C=__CD_TEST__.cheat,G=C.G;G.pending=[];C.killAll();G.waveOn=false;G.wave=1;G.road.called=true;});
  await host.waitForFunction(()=>__CD_TEST__.snapshot().road.mounted);
  await guest.waitForFunction(()=>__CD_TEST__.snapshot().road?.mounted);
  const snap=()=>guest.evaluate(()=>__COOP_QA__.snapshot());
  let state=await snap(),team=state.actors.filter(a=>a.s.side==='player');
  check(count+'人共乘保留独立角色与座位',team.length===count&&team.every(p=>p.s.driving)&&new Set(team.map(p=>p.s.type)).size===count,team.map(p=>({slot:p.s.slot,type:p.s.type,x:p.s.x,z:p.s.z})));
  const before=state.g.road.z;
  const joy=await guest.locator('#joy-base').boundingBox();
  await guest.mouse.move(joy.x+joy.width/2,joy.y+joy.height/2);await guest.mouse.down();await guest.mouse.move(joy.x+joy.width/2,joy.y+joy.height*.08,{steps:5});await guest.waitForTimeout(350);await guest.mouse.up();
  state=await snap();check(count+'人手机摇杆转向经房主同步',Math.abs(state.g.road.z-before)>.3,[before,state.g.road.z]);
  await guest.locator('#btn-atk').click();await sleep(100);check(count+'人手机动作键触发加速',await host.evaluate(()=>__CD_TEST__.snapshot().road.cooldown>0));
  await host.evaluate(()=>{__CD_TEST__.cheat.G.road.cooldown=0;});
  await guest.locator('#btn-run').click();await sleep(100);check(count+'人手机I单点加速无需摇杆',await host.evaluate(()=>__CD_TEST__.snapshot().road.cooldown>0));
  await host.evaluate(()=>{const G=__CD_TEST__.cheat.G;G.road.x=286;G.road.baseX=286;G.road.z=0;});
  await guest.waitForFunction(()=>__CD_TEST__.snapshot().boss?.type==='hogg');await sleep(2000);
  state=await snap();
  check(count+'人Boss与投雷同步',state.bossId&&state.actors.some(a=>a.s.type==='hogg'),state.projs.length);
  check(count+'人快照低于中继上限',JSON.stringify(state).length<125000,JSON.stringify(state).length);
  if(count===4){
   await guest.setViewportSize({width:390,height:844});await sleep(300);
   check('联机竖屏旋转后按钮可达',await guest.locator('#btn-atk').isVisible());
   await guest.screenshot({path:out('stage3-coop-portrait.png')});await guest.setViewportSize({width:844,height:390});
   await host.screenshot({path:out('stage3-coop-four.png')});
   // 主动下车后全队必须继续存在，独立输入回到步行规则。
   await host.keyboard.press('KeyU');await guest.waitForFunction(()=>!__CD_TEST__.snapshot().road.mounted);
   state=await snap();check('四人下车保留全队与进度',state.actors.filter(a=>a.s.side==='player').length===4&&state.g.road.phase==='foot');
   await pages[3].evaluate(()=>__COOP_QA__.connection.disconnect());await host.waitForFunction(()=>__COOP_QA__.connection.room.players.length===3);
   check('一位队友离开其余三人继续',await guest.evaluate(()=>__COOP_QA__.connection.active));
  }
  await host.evaluate(()=>__COOP_QA__.connection.disconnect());await guest.waitForFunction(()=>!__COOP_QA__.connection.room);
  check(count+'人房主退出结束房间',true);
  for(const c of contexts)await c.close();
 }
 check('联机无浏览器异常',errors.length===0,errors);
 fs.writeFileSync(out('stage3-coop.json'),JSON.stringify({method:'Real local WebSocket relay, 2/3/4 independent contexts; phone viewport and mouse on virtual controls, not a real phone',results,errors},null,2));
 await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});

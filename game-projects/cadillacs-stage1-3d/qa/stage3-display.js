// 真实浏览器：触屏模拟、模式切换、音频、4人状态同步夹具、动态采集与帧时间。
const {launch,BASE}=require('./lib'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const dir=path.resolve(__dirname,'../media-kit/releases/v0.11.0-preview.1'),cap=path.join(dir,'captures');fs.mkdirSync(cap,{recursive:true});
(async()=>{const browser=await launch(),rows=[],errors=[];const ok=(name,value,detail)=>{rows.push({name,pass:!!value,detail});console.log(value?'PASS':'FAIL',name,detail||'');assert.ok(value,name);};
try{
 for(const [w,h]of [[844,390],[390,844],[800,346]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:true,deviceScaleFactor:1}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'?test=1&stage=3');await page.waitForFunction(()=>window.__CD_TEST__);await page.evaluate(()=>__CD_TEST__.manual(true));
  const step=n=>page.evaluate(n=>__CD_TEST__.step(n,true),n),state=()=>page.evaluate(()=>__CD_TEST__.snapshot());
  ok(w+'x'+h+'预览选中第三关',(await state()).ui.settings.stage===2);
  await page.screenshot({path:path.join(cap,'menu-'+w+'x'+h+'.png')});
  await page.locator('#menu [data-act="select"]').tap();await page.locator('#sel-go').tap();await step(30);
  await page.evaluate(()=>__CD_TEST__.cheat.area(7));await step(10);
  ok(w+'x'+h+'旋转布局正确',(await state()).ui.display.rotated===(w<h),(await state()).ui.display);
  await page.locator('#btn-atk').tap();await step(3);ok(w+'x'+h+'触屏加速有效',(await state()).road.ram>0);
  const cdp=await ctx.newCDPSession(page),joy=await page.locator('#joy-zone').boundingBox(),j={x:joy.x+joy.width*.45,y:joy.y+joy.height*.5};
  const x0=(await state()).road.x;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...j,id:1}]});
  const target=w<h?{x:j.x,y:j.y+45}:{x:j.x+45,y:j.y};await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...target,id:1}]});await step(20);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  ok(w+'x'+h+'摇杆逆变换和驾驶有效',(await state()).road.x>x0+.4);
  await page.screenshot({path:path.join(cap,'drive-'+w+'x'+h+'.png')});
  await page.locator('#btn-pause').tap();await page.locator('#pause [data-control-mode="hide"]').click();let s=await state();ok('触屏切电脑保留第三关',s.stage===3&&s.road.phase==='drive');
  await page.locator('#pause [data-control-mode="show"]').click();await page.locator('#pause [data-act="resume"]').tap();await step(3);s=await state();ok('切回触屏清空移动输入',s.input.stick.x===0&&s.input.stick.y===0);
  await ctx.close();
 }
 const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>errors.push(e.message));await page.goto(BASE+'?test=1&stage=3&clean=1');await page.waitForFunction(()=>window.__CD_TEST__);
 await page.locator('#menu [data-act="select"]').click();await page.locator('#sel-go').click();await page.evaluate(()=>{__CD_TEST__.manual(true);__CD_TEST__.cheat.area(7);});
 const step=n=>page.evaluate(n=>__CD_TEST__.step(n,true),n);
 // 自动化夹具验证2/3/4人的车辆/步战/重开和快照重建，不访问线上大厅。
 for(const count of [2,3,4]){
  await page.evaluate(n=>{__CD_TEST__.cheat.newGame({area:7,coop:true,localSlot:0,playerSlots:Array.from({length:n},(_,i)=>i),playerChoices:[0,1,2,3]});},count);await step(120);
  let snap=await page.evaluate(()=>__CD_TEST__.cheat.coopSnapshot());ok(count+'人同车且座位独立',snap.actors.filter(a=>a.s.side==='player'&&a.s.state==='incar').length===count);
  const guest=await browser.newPage({viewport:{width:844,height:390}});guest.on('pageerror',e=>errors.push(e.message));await guest.goto(BASE+'?test=1');await guest.waitForFunction(()=>window.__CD_TEST__);await guest.evaluate(({n,s})=>{__CD_TEST__.manual(true);__CD_TEST__.cheat.newGame({area:7,coop:true,localSlot:n-1,playerSlots:Array.from({length:n},(_,i)=>i),playerChoices:[0,1,2,3]});__CD_TEST__.cheat.coopApply(s);},{n:count,s:snap});
  ok(count+'人客机重建车辆和路障',await guest.evaluate(()=>__CD_TEST__.snapshot().road.phase==='drive'));
  await page.evaluate(()=>__CD_TEST__.cheat.wreck());await step(100);snap=await page.evaluate(()=>__CD_TEST__.cheat.coopSnapshot());await guest.evaluate(s=>__CD_TEST__.cheat.coopApply(s),snap);
  ok(count+'人毁车全队恢复且客机同步',snap.actors.filter(a=>a.s.side==='player'&&a.s.state!=='incar').length===count&&await guest.evaluate(()=>__CD_TEST__.snapshot().road.phase==='foot'));
  await guest.close();
 }
 await page.evaluate(()=>{__CD_TEST__.cheat.newGame({area:7});__CD_TEST__.manual(false);});
 await page.waitForTimeout(1200);await page.keyboard.press('Escape');await page.waitForTimeout(200);let audio=await page.evaluate(()=>__CD_TEST__.snapshot().ui.audio);ok('暂停冻结音频',audio.ctx==='suspended',audio);
 await page.locator('#pause [data-act="restart"]').click();await page.waitForTimeout(500);audio=await page.evaluate(()=>__CD_TEST__.snapshot().ui.audio);ok('暂停重开恢复音频',audio.ctx==='running',audio);
 await page.evaluate(()=>{__CD_TEST__.cheat.area(7);__CD_TEST__.cheat.G.settings.demo=true;});await page.waitForTimeout(2000);
 // 性能与录像分开；真实rAF采样，RTX4060Ti/Edge无头，不能外推为手机实测。
 const stats=a=>{a=a.slice().sort((x,y)=>x-y);return {n:a.length,fps:1000/(a.reduce((s,x)=>s+x,0)/a.length),median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],over50:a.filter(v=>v>50).length};};
 for(const camera of [0,1,2,3]){
  await page.evaluate(c=>__CD_TEST__.setCamera(c),camera);await page.waitForTimeout(500);await page.evaluate(()=>__CD_TEST__.perfStart());await page.keyboard.down('w');await page.waitForTimeout(900);await page.keyboard.up('w');await page.keyboard.down('s');await page.waitForTimeout(900);await page.keyboard.up('s');await page.keyboard.down('e');await page.waitForTimeout(5000);await page.keyboard.up('e');const perf=await page.evaluate(()=>__CD_TEST__.perfStop());
  const detail={camera,...stats(perf.frames),renderer:await page.evaluate(()=>__CD_TEST__.renderInfo())};rows.push({name:'realtime-perf',pass:detail.fps>50,detail});console.log('PERF',JSON.stringify(detail));
 }
 await page.evaluate(()=>{__CD_TEST__.setCamera(0);__CD_TEST__.startCapture(30);});
 await page.keyboard.down('d');await page.waitForTimeout(700);await page.keyboard.up('d');await page.keyboard.down('w');await page.waitForTimeout(700);await page.keyboard.up('w');await page.keyboard.press('j');await page.waitForTimeout(4000);
 await page.evaluate(()=>__CD_TEST__.setCamera(2));await page.waitForTimeout(3000);await page.evaluate(()=>__CD_TEST__.setCamera(3));await page.waitForTimeout(3000);
 const video=await page.evaluate(()=>__CD_TEST__.stopCapture());fs.writeFileSync(path.join(cap,'road-gameplay.webm'),Buffer.from(video,'base64'));await page.keyboard.press('Escape');
 ok('无运行时异常',errors.length===0,errors);await page.close();
}catch(e){console.error(e);process.exitCode=1;}finally{fs.writeFileSync(path.join(dir,'qa-display.json'),JSON.stringify({rows,errors},null,2));await browser.close();}
})();

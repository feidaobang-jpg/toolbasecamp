// Independent sessions: capacity, roles, phone viewport controls, transitions and command authority.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base=process.env.GAMES_BASE||'http://127.0.0.1:8923/',out=process.env.GAMES_OUT||path.resolve('game-projects/site-games/media-kit/releases/coop-hub1/qa');fs.mkdirSync(out,{recursive:true});
const paths={tank:'tank-3d',jackal:'jackal-stage1-3d',cadillacs:'cadillacs-stage1-3d',starship:'starship-defense'},results=[];
const check=(g,n,ok,data)=>{results.push({game:g,name:n,ok,detail:data});console.log(ok?'PASS':'FAIL',g,n,JSON.stringify(data||{}));assert.ok(ok,n);};
async function snap(p,g){return p.evaluate(g=>g==='tank'?__TANK_TEST__.state():__COOP_QA__.snapshot(),g);}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11']});
for(const g of (process.env.GAMES_ONLY||'tank,jackal,cadillacs,starship').split(',')){const cs=[],ps=[],errors=[];try{
 const count=Number(process.env.GAMES_CAPACITY||4);
 for(let i=0;i<count;i++){
  const c=await browser.newContext({viewport:i===1?{width:844,height:390}:{width:960,height:540},hasTouch:i===1,isMobile:i===1});cs.push(c);const p=await c.newPage();ps.push(p);p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'html/game/'+paths[g]+'/index.html?test=1&qa=1&q=low');await p.waitForFunction(g=>g==='tank'?window.__TANK_TEST__:window.__COOP_QA__,g,{timeout:120000});
  await p.locator('[data-act=coop]').click();console.log('STEP',g,i,'lobby opened');
  if(g==='tank')await p.evaluate(()=>__TANK_TEST__.manual(true));
  if(g==='cadillacs'||g==='starship')await p.locator('[data-field=hero]').selectOption(String(g==='starship'?i%3:i));
 }
 const [host,phone]=ps;
 if(g==='tank')for(const p of ps)await p.evaluate(()=>__TANK_TEST__.manual(false));
 const native=g==='tank',button=k=>native?'#coop-'+k:'[data-do='+k+']';
 await host.locator(native?'#coop-capacity':'[data-field=capacity]').selectOption(String(count));
 await host.locator(button('create')).click();await host.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room,g);
 const code=await host.evaluate(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room.code,g);console.log('STEP',g,'room created');
 // The site directory exposes the same room and a usable invitation URL.
 const hub=await cs[0].newPage();await hub.goto(base+'game-online.html');await hub.waitForFunction(code=>document.getElementById('online-rooms')?.textContent.includes(code),code);check(g,'unified directory lists live room',await hub.locator('#online-rooms a[href*="coop='+code+'"]').count()===1);await hub.close();
 for(const p of ps.slice(1)){await p.locator(native?'#coop-code':'[data-field=code]').fill(code);await p.locator(button('join')).click();await p.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room,g);await p.locator(button('ready')).click();}
 await host.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room.players.every(p=>p.ready),g);await host.locator(button('start')).click();await phone.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).stateCount>10,g);
 if(g==='tank')await host.waitForFunction(()=>__TANK_TEST__.state().phase==='play');
 if(g==='jackal')await host.waitForFunction(()=>__JK_TEST__.snapshot().mode==='play');
 if(g==='cadillacs')await host.waitForFunction(()=>__CD_TEST__.snapshot().mode==='play');
 const initial=await snap(host,g),rows=s=>g==='tank'?s.players:g==='starship'?s.humans.map(h=>h.s):g==='jackal'?s.players:s.actors.filter(a=>a.s.side==='player').map(a=>a.s);
 check(g,'maximum seats spawn',rows(initial).length===count,{count});
 if(g==='cadillacs'||g==='starship')check(g,'per-player role selection',new Set(rows(initial).map(p=>p.cls||p.type)).size===(g==='starship'?3:count),rows(initial).map(p=>p.cls||p.type));
 const fire=g==='tank'?'[data-hold=fire]':g==='jackal'?'#btn-fire':g==='cadillacs'?'#btn-atk':'#vJ',joy=g==='starship'?'#joyBase':'#joy-base';
 await phone.locator(fire).waitFor({state:'visible'});const box=await phone.locator(joy).boundingBox();assert.ok(box);await phone.mouse.move(box.x+box.width/2,box.y+box.height/2);await phone.mouse.down();await phone.mouse.move(box.x+box.width*.85,box.y+box.height/2,{steps:5});await phone.waitForTimeout(700);await phone.mouse.up();await phone.locator(fire).click();
 await phone.screenshot({path:path.join(out,g+'-phone-landscape.png')});await phone.setViewportSize({width:390,height:844});await phone.waitForTimeout(300);check(g,'portrait touch button remains reachable',await phone.locator(fire).isVisible());await phone.screenshot({path:path.join(out,g+'-phone-portrait.png')});
 await phone.setViewportSize({width:844,height:390});
 if(g==='jackal'){
  await host.evaluate(()=>__JK_TEST__.cheat.nextStage());await phone.waitForFunction(()=>__COOP_QA__.snapshot().g.stage===2);check(g,'second stage retains whole team',rows(await snap(phone,g)).length===count);
 }else if(g==='cadillacs'){
  await host.evaluate(()=>{__CD_TEST__.cheat.stage(2);__CD_TEST__.cheat.skipScript();});await phone.waitForFunction(()=>__COOP_QA__.snapshot().g.area>=3);check(g,'second-stage transition retains team',rows(await snap(phone,g)).length===count);
 }else if(g==='starship'){
  await phone.evaluate(()=>__COOP_QA__.connection.send({type:'command',command:{kind:'buy',type:'weapon',id:'launcher',price:0}}));await host.waitForTimeout(400);check(g,'insufficient shared funds reject guest purchase',!(await snap(host,g)).g.weapons.includes('launcher'));
  await host.evaluate(()=>__gameQA.Game.gold=1300);await phone.evaluate(()=>__COOP_QA__.connection.send({type:'command',command:{kind:'buy',type:'weapon',id:'launcher',price:0}}));await host.waitForTimeout(500);const bought=await snap(host,g);check(g,'host charges actual price once',bought.g.gold===400&&bought.g.weapons.includes('launcher'),{gold:bought.g.gold});
  await phone.evaluate(()=>__COOP_QA__.connection.send({type:'command',command:{kind:'autoDefense',enabled:false}}));await host.waitForTimeout(300);check(g,'guest team order is authoritative',(await snap(host,g)).g.squadAutoDefense===false);
  await phone.evaluate(()=>__COOP_QA__.connection.send({type:'command',command:{kind:'battle'}}));await host.waitForFunction(()=>__gameQA.Game.state==='battle');await host.waitForTimeout(700);check(g,'shared battle starts from guest ready', (await snap(phone,g)).g.state==='battle');
 }
 const packet=await host.evaluate(g=>JSON.stringify(g==='tank'?__TANK_TEST__.world:__COOP_QA__.snapshot()).length,g).catch(()=>0);if(g!=='tank')check(g,'snapshot fits relay limit',packet>0&&packet<125000,{bytes:packet});
 if(count===4){await ps[3].evaluate(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).disconnect(),g);await host.waitForTimeout(500);check(g,'one guest leaves others connected',await phone.evaluate(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).active,g));}
 await host.evaluate(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).disconnect(),g);await phone.waitForFunction(g=>!(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room,g);check(g,'host departure ends room',true);check(g,'no browser exceptions',errors.length===0,errors);
}catch(e){console.log('FAIL',g,e.stack);const states=await Promise.all(ps.map(async(p,i)=>{const s=await snap(p,g).catch(()=>null);await p.screenshot({path:path.join(out,g+'-error-'+i+'.png')}).catch(()=>{});return {url:p.url(),state:s};}));results.push({game:g,name:'flow',ok:false,error:e.message,states,errors});}finally{for(const c of cs)await c.close();}}
await browser.close();fs.writeFileSync(path.join(out,'capacity.json'),JSON.stringify({method:'headless Edge independent contexts; mobile viewport simulation, mouse drag on virtual joystick; stage/resource fixtures explicitly injected on host; no real phone or multi-touch claim',results},null,2));if(results.some(r=>!r.ok))process.exitCode=1;})();

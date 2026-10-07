// Real independent clients: late join, NPC idle takeover, return, leave/rejoin and host moderation.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base=process.env.GAMES_BASE||'http://127.0.0.1:8923/',urls=JSON.parse(process.env.GAMES_URLS||'{}');
const out=process.env.GAMES_OUT||path.resolve('game-projects/site-games/media-kit/releases/coop-live2/qa');fs.mkdirSync(out,{recursive:true});
const dirs={tank:'tank-3d',jackal:'jackal-stage1-3d',cadillacs:'cadillacs-stage1-3d',starship:'starship-defense'},results=[];
function check(g,name,ok,data){results.push({game:g,name,ok,data});console.log(ok?'PASS':'FAIL',g,name,JSON.stringify(data||{}));assert.ok(ok,name);}
async function open(root,url){
 await root.goto(url);
 if(url.includes('bilibili.com/toy/')){
  await root.waitForFunction(()=>!!document.querySelector('iframe'),null,{timeout:120000});
  let frame;for(let i=0;i<120;i++){frame=root.frames().find(f=>f.url().includes('bilibilitoy.com'));if(frame)break;await root.waitForTimeout(500);}
  assert.ok(frame,'Toy runtime frame');const u=new URL(frame.url());u.searchParams.set('test','1');u.searchParams.set('qa','1');u.searchParams.set('q','low');await frame.goto(u.href);
  return new Proxy(frame,{get:(t,k)=>['keyboard','mouse','screenshot','setViewportSize','video'].includes(k)?typeof root[k]==='function'?root[k].bind(root):root[k]:typeof t[k]==='function'?t[k].bind(t):t[k]});
 }return root;
}
const conn=(p,g,fn,arg)=>p.evaluate(({g,fn,arg})=>{const c=g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection;return Function('c','arg','return ('+fn+')(c,arg)')(c,arg);},{g,fn:fn.toString(),arg});
async function snapshot(p,g){return p.evaluate(g=>g==='tank'?__TANK_TEST__.state():__COOP_QA__.snapshot(),g);}
function positions(s,g){return g==='tank'?s.players.filter(p=>p.tank).map(p=>({slot:p.slot,x:p.tank.x,y:p.tank.y})):g==='jackal'?s.players.filter(p=>!p.disconnected).map(p=>({slot:p.slot,x:p.x,y:p.y})):g==='cadillacs'?s.actors.filter(a=>a.s.side==='player').map(a=>({slot:a.s.slot,x:a.s.x,y:a.s.z})):s.humans.filter(h=>!h.s.disconnected).map(h=>({slot:h.s.slot,x:h.p[0],y:h.p[2]}));}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle='+(process.env.GAMES_GL||'d3d11')]});
 for(const g of (process.env.GAMES_ONLY||'tank,jackal,cadillacs,starship').split(',')){const contexts=[],ps=[],errors=[];try{
  const native=g==='tank',button=k=>native?'#coop-'+k:'[data-do='+k+']',codeField=native?'#coop-code':'[data-field=code]';
  async function add(i){console.log('STEP',g,'opening',i);if(native)for(const old of ps)await old.evaluate(()=>__TANK_TEST__.manual(true));
   const c=await browser.newContext({viewport:i===1?{width:844,height:390}:{width:960,height:540},hasTouch:i===1,isMobile:i===1,...(process.env.GAMES_VIDEO==='1'&&i===0?{recordVideo:{dir:path.join(out,'videos',g),size:{width:960,height:540}}}:{})});contexts.push(c);const root=await c.newPage();root.on('pageerror',e=>errors.push(e.message));
   const p=await open(root,urls[g]||base+'html/game/'+dirs[g]+'/index.html?test=1&qa=1&q=low');ps.push(p);
   await p.waitForFunction(g=>g==='tank'?window.__TANK_TEST__:window.__COOP_QA__,g,{timeout:120000});await p.locator('[data-act=coop]').first().click();
   if(g==='cadillacs'||g==='starship')await p.locator('[data-field=hero]').selectOption(String(i% (g==='starship'?3:4)));
   if(native){for(const old of ps)await old.evaluate(()=>__TANK_TEST__.manual(false));if(i>1){await ps[0].waitForTimeout(200);await conn(ps[0],g,c=>{if(c.active)c.send({type:'action',action:'resume'});});}}console.log('STEP',g,'opened',i);return p;
  }
  const host=await add(0),guest=await add(1);
  await host.locator(button('create')).click();await host.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room,g);
  const code=await conn(host,g,c=>c.room.code);
  async function join(p,ready=false){await p.locator(codeField).fill(code);await p.locator(button('join')).click();await p.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room,g);if(ready)await p.locator(button('ready')).click();}
  await join(guest,true);await host.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room.players.every(p=>p.ready),g);
  await host.locator(button('start')).click();await guest.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).stateCount>3,g);
  const before=await snapshot(host,g);
  const third=await add(2);await join(third);await third.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).stateCount>3,g);
  const fourth=await add(3);await join(fourth);await fourth.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).stateCount>3,g);
  if(native)await host.waitForFunction(()=>__TANK_TEST__.state().phase==='play'&&__TANK_TEST__.state().players.filter(p=>p.tank).length===4,null,{timeout:30000});
  else await host.waitForTimeout(1200);const full=await snapshot(host,g);
  check(g,'late join creates four independent players',positions(full,g).length===4,positions(full,g));
  check(g,'late join preserves running clock',native?full.coop.room.started:g==='starship'?full.epoch===before.epoch&&full.g.gold===before.g.gold:full.g.t>=before.g.t);
  await fourth.keyboard.press('KeyD');await fourth.keyboard.down('KeyJ');await fourth.waitForTimeout(350);await fourth.keyboard.up('KeyJ');
  // Age only the host's inactivity clocks; gameplay is still driven by real NPC logic and network frames.
  const preAI=await snapshot(host,g);await conn(host,g,c=>{c.held.clear();c.contacts.clear();c.localAt=0;for(const p of c.room.players)c.activity.set(p.slot,performance.now()-31000);});
  await host.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).bots.has(0),g,{timeout:15000});
  await guest.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room.players.find(p=>p.slot===0)?.ai,g);
  check(g,'idle host is taken over by ordinary computer player',await conn(host,g,c=>c.bots.has(0)));
  await host.waitForTimeout(1200);const ai=await snapshot(host,g);await host.screenshot({path:path.join(out,g+'-computer-takeover.png')});
  check(g,'computer takeover does not restart match',native?ai.coop.room.started:g==='starship'?ai.epoch===preAI.epoch:ai.g.t>=preAI.g.t);
  const p0=positions(preAI,g).find(p=>p.slot===0),p1=positions(ai,g).find(p=>p.slot===0);
  if(g!=='starship')check(g,'computer player operates movement or weapons',p0&&p1&&(Math.hypot(p1.x-p0.x,p1.y-p0.y)>.01||g==='jackal'&&((ai.g.mgShots||0)>(preAI.g.mgShots||0)||ai.bombs.some(b=>b.slot===0))||g==='cadillacs'&&ai.actors.some(a=>a.s.side==='player'&&a.s.slot===0&&['attack','grab','jump'].includes(a.s.state))),{before:p0,after:p1});
  await host.keyboard.press('KeyD');await host.waitForFunction(g=>!(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).bots.has(0),g);
  check(g,'real input immediately restores human control',true);
  await conn(fourth,g,c=>c.disconnect());await host.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room.players.length===3,g);
  const replacement=fourth;console.log('STEP',g,'rejoining released slot');await conn(replacement,g,(c,arg)=>c.connect('join','回归队友',arg,{config:{hero:3}}),code);await replacement.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).stateCount>3,g);
  check(g,'vacant slot can be rejoined during match',await conn(replacement,g,c=>c.slot)===3);
  await conn(guest,g,c=>c.send({type:'kick',slot:3}));await host.waitForTimeout(250);check(g,'guest cannot kick a teammate',await conn(host,g,c=>c.room.players.length)===4);
  await conn(host,g,c=>c.send({type:'kick',slot:3}));await replacement.waitForFunction(g=>!(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room,g);
  await host.waitForFunction(g=>(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room?.players.length===3,g);check(g,'host kick removes target and others continue',await conn(host,g,c=>c.active));
  await host.screenshot({path:path.join(out,g+'-team-playing.png')});
  await conn(host,g,c=>c.disconnect());await guest.waitForFunction(g=>!(g==='tank'?__TANK_TEST__.coop:__COOP_QA__.connection).room,g);
  check(g,'no browser exceptions',errors.length===0,errors);
 }catch(e){console.log('FAIL',g,e.stack);results.push({game:g,name:'flow',ok:false,error:e.message,errors});for(let i=0;i<ps.length;i++)await ps[i].screenshot({path:path.join(out,g+'-failure-'+i+'.png')}).catch(()=>{});}finally{for(const c of contexts)await c.close();}}
 await browser.close();fs.writeFileSync(path.join(out,'live.json'),JSON.stringify({method:'Independent Edge sessions; real network join/start/leave/kick and keyboard return. Idle clocks aged to 31s on host to test threshold without slowing every game; NPC gameplay runs normally. Mobile viewport simulation, not real phone.',results},null,2));if(results.some(r=>!r.ok))process.exitCode=1;
})();

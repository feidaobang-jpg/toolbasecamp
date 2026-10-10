// 第四关全程通关：标准设置（无限命、标准 3 格护心、演示模式关、小玛丽起步），只用键盘 D/J/K/A。
// 1) 在页面里克隆当前世界，用游戏同一份 world.js 逐 0.25 秒做深度优先搜索，找一串零受伤、零失误到斧头的按键；
// 2) 用 Playwright 真实键盘按同样的节奏重放到真实游戏里（手动时钟），逐段核对落点与搜索一致；
// 3) 斧头之后让演出自己放完到结算。搜索读取火棒角度和库巴位置来挑时机，这一点与人玩不同，结果里写明。
// 用法：node game-projects/mario-3d/qa/serve.mjs 8798 & node game-projects/mario-3d/qa/stage4-run.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.QA_BASE||'http://127.0.0.1:8798/html/game/mario-3d/index.html';
const out=process.env.QA_OUT||path.resolve(__dirname,'../media-kit/releases/v2.6.0-preview1/qa');
const CHUNK=30;   // 每个决策 0.25 秒（30 个 1/120 秒逻辑步）
const KEYS={mx:{'1':'KeyD','-1':'KeyA'},run:'KeyJ',jump:'KeyK'};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11']});
 const errors=[];
 try{
  const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'?level=1-4&test=1&q=high',{waitUntil:'networkidle'});
  await p.waitForFunction(()=>window.__marioReady&&window.__MARIO_TEST__);
  await p.locator('#menu [data-act=start]').click();
  await p.evaluate(()=>{__MARIO_TEST__.manual(true);__MARIO_TEST__.skipCard();});
  const setup=await p.evaluate(()=>{const s=__MARIO_TEST__.session.settings;return{lives:s.lives,armor:s.armor,demo:s.demo,camera:__MARIO_TEST__.state().camera,power:__MARIO_TEST__.world.player.power};});
  assert(setup.lives==='inf'&&setup.armor==='std'&&!setup.demo&&setup.camera==='side'&&setup.power==='small',JSON.stringify(setup));
  // ---------- 1) 搜索 ----------
  const t0=Date.now();
  const plan=await p.evaluate(async([CHUNK,MAX])=>{
   const W=await import('./world.js?v=2.6.0');
   const ACTS={RR:{mx:1,run:1},RRJ:{mx:1,run:1,jump:1},R:{mx:1},RJ:{mx:1,jump:1},I:{},J:{jump:1},L:{mx:-1},LJ:{mx:-1,jump:1}};
   const ORDER=['RR','RRJ','R','RJ','I','J','L','LJ'];
   const run=(w,a,prev)=>{const A=ACTS[a],P=prev?ACTS[prev]:{};const hits=w.session.stats.hits,deaths=w.session.stats.deaths;
    for(let i=0;i<CHUNK;i++){W.step(w,{mx:A.mx||0,mz:0,run:!!A.run,jump:!!A.jump,down:false,jumpPressed:i===0&&!!A.jump&&!P.jump,firePressed:i===0&&!!A.run&&!P.run},W.STEP);w.events.length=0;if(w.mode!=='play')break;}
    return w.mode==='axe'?'goal':(w.mode!=='play'||w.session.stats.hits>hits||w.session.stats.deaths>deaths||w.time<20)?'fail':'ok';};
   const key=(w,prev)=>[Math.round(w.player.x*3),Math.round(w.player.y*3),Math.round(w.player.vx),Math.round(w.player.vy/3),Math.round((w.clock%3.33)*4),prev&&ACTS[prev].jump?1:0,w.rt.bowser&&w.rt.bowser.state==='active'?Math.round(w.rt.bowser.x*2)+','+Math.round(w.rt.bowser.y*2)+','+w.rt.flames.length:''].join('|');
   const seen=new Set();
   const stack=[{w:structuredClone(__MARIO_TEST__.world),acts:[],i:0,prev:null}];
   let nodes=0,best=0,bestActs=[];
   while(stack.length&&nodes<MAX){
    const top=stack[stack.length-1];
    if(top.i>=ORDER.length){stack.pop();continue;}
    const a=ORDER[top.i++];const w=structuredClone(top.w);nodes++;
    const r=run(w,a,top.prev);
    if(r==='goal'){const acts=stack.slice(1).map(s=>s.a).concat(a);return{acts,nodes,best:w.player.x};}
    if(r==='fail')continue;
    const k=key(w,a);if(seen.has(k))continue;seen.add(k);   // 同一状态（含火棒相位）只展开一次，免得原地等一整圈以上
    if(w.player.x>best){best=w.player.x;bestActs=stack.slice(1).map(s=>s.a).concat(a);}
    stack.push({w,a,i:0,prev:a,k});
    if(nodes%2000===0)await new Promise(r=>setTimeout(r,0));
   }
   // 失败时把走得最远的那条路线往后各试一步，报告死因
   const w=structuredClone(__MARIO_TEST__.world);let prev=null;for(const a of bestActs){run(w,a,prev);prev=a;}
   const probe=ORDER.map(a=>{const c=structuredClone(w);const hits=c.session.stats.hits;const r=run(c,a,prev);return[a,r,+c.player.x.toFixed(2),+c.player.y.toFixed(2),c.mode,c.session.stats.hits-hits,c.time];});
   return{acts:null,nodes,best,at:{x:w.player.x,y:w.player.y,vx:w.player.vx,time:w.time,bars:w.rt.firebars.map(b=>+(b.angle%(2*Math.PI)).toFixed(2))},probe,tail:bestActs.slice(-12)};
  },[CHUNK,+process.env.MAX_NODES||60000]);
  console.log('plan',JSON.stringify({chunks:plan.acts&&plan.acts.length,nodes:plan.nodes,best:plan.best,ms:Date.now()-t0,at:plan.at,probe:plan.probe,tail:plan.tail}));
  assert(plan.acts,'search failed, furthest x='+plan.best);
  // ---------- 2) 真实键盘重放 ----------
  const ACT={RR:{mx:1,run:1},RRJ:{mx:1,run:1,jump:1},R:{mx:1},RJ:{mx:1,jump:1},I:{},J:{jump:1},L:{mx:-1},LJ:{mx:-1,jump:1}};
  const held=new Set(),trace=[];
  for(const a of plan.acts){
   const A=ACT[a],want=new Set();if(A.mx)want.add(KEYS.mx[String(A.mx)]);if(A.run)want.add(KEYS.run);if(A.jump)want.add(KEYS.jump);
   for(const k of [...held])if(!want.has(k)){await p.keyboard.up(k);held.delete(k);}
   for(const k of want)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}
   const s=await p.evaluate(n=>{const q=__MARIO_TEST__;q.step(n,false);const w=q.world;return{x:+w.player.x.toFixed(3),y:+w.player.y.toFixed(3),mode:w.mode,hits:q.session.stats.hits,deaths:q.session.stats.deaths,time:w.time};},CHUNK);
   trace.push([a,s.x,s.y,s.mode]);
   if(s.mode!=='play')break;
  }
  for(const k of held)await p.keyboard.up(k);
  let s=await p.evaluate(()=>{const q=__MARIO_TEST__;return{mode:q.world.mode,x:q.world.player.x,hits:q.session.stats.hits,deaths:q.session.stats.deaths,time:q.world.time,coins:q.session.coins,score:q.session.score};});
  console.log('replay',JSON.stringify(s));
  const checks=[];
  const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});assert(ok,name+': '+JSON.stringify(data));};
  check('真实键盘重放与搜索一致，零受伤零失误碰到斧头',s.mode==='axe'&&s.hits===0&&s.deaths===0,s);
  const used=s.time;
  for(let i=0;i<40&&(await p.evaluate(()=>__MARIO_TEST__.state().overlay))!=='result';i++)await p.evaluate(()=>__MARIO_TEST__.step(120,false));
  const end=await p.evaluate(()=>({overlay:__MARIO_TEST__.state().overlay,title:document.querySelector('#res-title').textContent,extra:document.querySelector('#res-extra').textContent}));
  check('斧头之后演出放完进入通关结算',end.overlay==='result'&&end.title==='通关！',end);
  check('页面无脚本错误',errors.length===0,errors);
  fs.writeFileSync(path.join(out,'stage4-run.json'),JSON.stringify({url:base,browser:b.version(),settings:setup,method:'DFS over 0.25 s keyboard chunks in a cloned world (same world.js); replayed with Playwright keyboard on the real page, manual clock. The planner reads firebar angles / Bowser state, unlike a human.',plan:plan.acts.join(' '),nodes:plan.nodes,remainingTime:used,trace,checks,errors},null,1));
  console.log(JSON.stringify({passed:checks.length,chunks:plan.acts.length,seconds:plan.acts.length*0.25,remainingTime:used}));
 }finally{await b.close();}
})().catch(e=>{console.error(e.message||e);process.exit(1);});

// 第四关（1-4 库巴城堡）机制与流程验收：真实页面 + ?test=1 钩子，手动时钟逐步推进。
// 机制项会把玛丽直接放到被测位置（不是普通全程通关），全程输入通关另见 stage4-run.cjs。
// 用法：node game-projects/mario-3d/qa/serve.mjs 8798 & node game-projects/mario-3d/qa/stage4.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.QA_BASE||'http://127.0.0.1:8798/html/game/mario-3d/index.html';
const out=process.env.QA_OUT||path.resolve(__dirname,'../media-kit/releases/v2.6.0-preview1/qa');
const checks=[];
const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});if(!ok)console.error('FAIL',name,JSON.stringify(data));assert(ok,name+': '+JSON.stringify(data));};
const T=p=>({
  eval:(fn,arg)=>p.evaluate(fn,arg),
  step:n=>p.evaluate(n=>{__MARIO_TEST__.step(n);},n),
  // 把玛丽放到指定位置（站稳），可指定形态
  put:(x,y,o={})=>p.evaluate(([x,y,o])=>{const q=__MARIO_TEST__,pl=q.world.player;Object.assign(pl,{x,y,z:o.z||0,vx:0,vy:0,vz:0,grounded:true,inv:o.inv??0,star:0,onLift:null});if(o.power){pl.power=o.power;q.session.power=o.power;}q.view.snap=true;q.step(1);},[x,y,o]),
  st:()=>p.evaluate(()=>{const q=__MARIO_TEST__,w=q.world,b=w.rt.bowser;return{...q.state(),bowser:b&&{x:b.x,y:b.y,z:b.z,state:b.state,hp:b.hp,face:b.face,grounded:b.grounded},flames:w.rt.flames.map(f=>({x:f.x,y:f.y,ty:f.ty})),axe:w.axeSeq||null,bars:w.rt.firebars.map(b=>b.angle)};}),
  events:()=>p.evaluate(()=>__MARIO_TEST__.state().events)
});
async function fresh(p,level='1-4',settings={}){
  await p.goto(base+'?level='+level+'&test=1&q=high',{waitUntil:'networkidle'});
  await p.waitForFunction(()=>window.__marioReady&&window.__MARIO_TEST__);
  await p.locator('#menu [data-act=start]').click();
  await p.evaluate(s=>{const q=__MARIO_TEST__;q.manual(true);q.skipCard();Object.assign(q.session.settings,s);},settings);
}
const near=(a,b,e)=>Math.abs(a-b)<=e;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11']});
 const errors=[];
 try{
  const c=await b.newContext({viewport:{width:1280,height:720}});const p=await c.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/favicon/.test(m.text()))errors.push(m.text());});
  const t=T(p);
  // ---------- 选关与开局 ----------
  await p.goto(base+'?level=1-4&test=1&q=high',{waitUntil:'networkidle'});await p.waitForFunction(()=>window.__marioReady&&window.__MARIO_TEST__);
  const sel=p.locator('#menu [data-opt=level]');
  for(const label of ['1-4 城堡','1-1 地面','1-2 地下','1-3 树冠'])
   {check('起始关卡可直接选到 '+label,(await sel.innerText()).includes(label));await sel.click();}
  check('起始关卡循环回到 1-4',(await sel.innerText()).includes('1-4 城堡'));
  await p.locator('#menu [data-act=start]').click();await p.evaluate(()=>{__MARIO_TEST__.manual(true);});
  check('开局 WORLD 卡片是 1-4',(await p.locator('#card-world').innerText())==='WORLD 1-4');
  await p.evaluate(()=>__MARIO_TEST__.skipCard());
  let s=await t.st();
  check('直接从第四关开始、时间 300、左上台阶起步',s.level==='1-4'&&s.time===300&&near(s.player.x,1.4,.01)&&s.player.y===6,s.player);
  const music=await p.evaluate(async()=>{const a=__MARIO_TEST__.audio;await a.samples.ready;return{has:a.samples.has('castle'),track:a.samples.track?.name,sfx:['smb_bowserfire','smb_bowserfalls','smb_world_clear'].every(n=>a.samples.has(n)),failed:a.samples.failed};});
  check('城堡关播放原版城堡曲，库巴喷火 / 落下 / 城堡通关原版音效已加载',music.has&&music.track==='castle'&&music.sfx&&music.failed.length===0,music);
  // ---------- 地形与原作对照 ----------
  const layout=await p.evaluate(()=>{const w=__MARIO_TEST__.world,tiles=w.tiles,K=(c,h)=>c*512+h+64,top=c=>{for(let h=10;h>=-2;h--){const t=tiles.get(K(c,h));if(t&&(h<=6)&&['G','R','U','Q','S'].includes(t.t)&&!t.hidden){let k=h;while(tiles.get(K(c,k-1)))k--;if(k<=-2||t.t==='R')return h+1;}}return null;};
   const tops={};for(const c of [1,3,4,8,20,30,40,60,80,100,110,117,121,125,135,142,150])tops[c]=top(c);
   const lava=w.area.lava.map(l=>[l.x0,l.x1,l.top]);
   const hidden=[...tiles.values()].filter(t=>t.hidden).map(t=>[t.c,t.h,t.content]);
   const q=tiles.get(K(30,6));
   return{tops,lava,hidden,q:q&&[q.t,q.content],bars:w.area.firebars.map(b=>[b.x-.5,b.y-.5,b.dir,b.len]),bridge:w.area.bridge,axe:w.area.axe,toad:w.area.toad};});
  check('台阶/地面高度按原作地图（1-4 共 160 列）',JSON.stringify(layout.tops)===JSON.stringify({1:6,3:5,4:4,8:3,20:3,30:3,40:4,60:4,80:3,100:3,110:0,117:3,121:0,125:3,135:3,142:4,150:0}),layout.tops);
  check('四处岩浆：13-14、26-28、32-34 与桥下',JSON.stringify(layout.lava)===JSON.stringify([[13,15,.95],[26,29,-.05],[32,35,-.05],[128,141,-.05]]),layout.lava);
  check('6 块隐藏金币砖（上下两排各 3）',layout.hidden.length===6&&layout.hidden.every(h=>h[2]==='coin'),layout.hidden);
  check('岩浆小平台上方问号砖出道具',layout.q&&layout.q[0]==='Q'&&layout.q[1]==='power',layout.q);
  check('7 根火棒，每根 6 颗，第 88 列那根反转',layout.bars.length===7&&layout.bars.every(b=>b[3]===6)&&layout.bars.filter(b=>b[2]<0).length===1&&layout.bars.find(b=>b[2]<0)[0]===88,layout.bars);
  check('13 格库巴桥、桥头斧头、蘑菇人',layout.bridge.c1-layout.bridge.c0+1===13&&layout.axe.x===141.5&&layout.toad.x===153.5,layout);
  // ---------- 火棒 ----------
  const a0=(await t.st()).bars;await t.step(120);const a1=(await t.st()).bars;
  check('火棒转速约 3.3 秒一圈',near((a1[0]-a0[0])/(2*Math.PI),1/3.33,.01),{d:a1[0]-a0[0]});
  check('第一根逆时针（角度增加），第 88 列顺时针',a1[0]>a0[0]&&a1[6]<a0[6]);
  // 小玛丽站进火球所在位置：标准耐久扣一格护心
  await p.evaluate(()=>{const q=__MARIO_TEST__,w=q.world,b=w.rt.firebars[1];b.angle=-Math.PI/2;Object.assign(w.player,{x:b.x,y:4,z:2,vx:0,vy:0,grounded:true,inv:0,power:'small'});q.session.hearts=3;q.step(1);});
  s=await t.st();check('火棒碰到小玛丽扣一格护心（任意纵深都算）',s.session.hearts===2&&s.player.inv>0,s.session);
  await p.evaluate(()=>{const q=__MARIO_TEST__,w=q.world,b=w.rt.firebars[2];b.angle=-Math.PI/2;Object.assign(w.player,{x:b.x+.3,y:4,z:-2.4,vx:0,vy:0,grounded:true,inv:0,power:'big'});q.session.power='big';q.step(1);});
  s=await t.st();check('火棒碰到大玛丽变小',s.player.power==='small',s.player);
  // 第 88 列天花板火棒：小玛丽在下面走不会碰到（转满一圈）
  await t.put(88.5,3,{power:'small'});await p.evaluate(()=>{__MARIO_TEST__.session.hearts=3;});await t.step(420);
  s=await t.st();check('天花板火棒下面小玛丽正常走过的高度是安全的',s.session.hearts===3&&s.mode==='play',s.session);
  // ---------- 岩浆与复活 ----------
  await t.put(14,3.2,{power:'small'});await p.evaluate(()=>{__MARIO_TEST__.world.player.grounded=false;});await t.step(120);
  s=await t.st();check('掉进第一个岩浆坑就输',s.mode==='dying'&&s.events.includes('die'),{mode:s.mode});
  await t.step(400);await p.evaluate(()=>__MARIO_TEST__.skipCard());s=await t.st();
  check('没过中途点时回到关卡开头',s.level==='1-4'&&near(s.player.x,1.4,.01)&&s.player.y===6&&s.player.inv>0,s.player);
  // ---------- 隐藏金币砖与问号砖 ----------
  await t.put(106.5,0,{power:'small'});const coins0=(await t.st()).session.coins;
  await p.keyboard.down('KeyK');await t.step(50);await p.keyboard.up('KeyK');await t.step(80);
  s=await t.st();const hb=await p.evaluate(()=>{const t=__MARIO_TEST__.world.tiles.get(106*512+3+64);return t&&{t:t.t,hidden:!!t.hidden};});
  check('从下面顶出隐藏金币砖，变成已用砖',s.session.coins===coins0+1&&hb.t==='U'&&!hb.hidden&&s.session.stats.secrets>=1,{coins:s.session.coins,hb});
  await t.put(30.5,3,{power:'small',inv:99});await p.evaluate(()=>{__MARIO_TEST__.session.settings.demo=true;});
  await p.keyboard.down('KeyK');await t.step(60);await p.keyboard.up('KeyK');await t.step(60);
  const items=await p.evaluate(()=>__MARIO_TEST__.world.rt.items.map(i=>i.type));
  check('小玛丽顶岩浆平台上方的问号砖出蘑菇',items.includes('mushroom'),items);
  await p.evaluate(()=>{__MARIO_TEST__.session.settings.demo=false;});
  // ---------- 中途点（3D 版新增） ----------
  await t.put(105,0,{power:'small'});s=await t.st();
  check('火棒段之后的下沉大房间记为中途点',s.session.checkpoint==='1-4',s.session);
  // ---------- 库巴 ----------
  await t.put(100,3,{power:'small',inv:999});await t.step(30);s=await t.st();
  check('离得远时库巴不动',s.bowser.state==='idle',s.bowser);
  await t.put(118,3,{power:'small',inv:999});
  let fires=0,maxY=3,minX=1e9,maxX=-1e9,flameY=[];
  for(let i=0;i<100;i++){await t.step(12);const k=await t.st();fires=k.events.filter(e=>e==='bowserfire').length;maxY=Math.max(maxY,k.bowser.y);minX=Math.min(minX,k.bowser.x);maxX=Math.max(maxX,k.bowser.x);for(const f of k.flames)flameY.push([+f.x.toFixed(1),+f.y.toFixed(2),f.ty]);}
  check('靠近后库巴开始喷火（10 秒内至少 3 口）',fires>=3,{fires});
  check('库巴会跳起来（约 1.6 格）',maxY>4.2&&maxY<5.0,{maxY});
  check('库巴只在桥上来回挪',minX>=135.1&&maxX<=140.1,{minX,maxX});
  check('火焰往玛丽脚下那一格的高度飞',flameY.some(f=>f[2]===3&&near(f[1],3,.05)),flameY.slice(-6));
  // 火焰打中玛丽
  await p.evaluate(()=>{const q=__MARIO_TEST__,w=q.world;w.rt.flames.length=0;w.rt.bowser.fireT=[99,99,99];w.rt.bowser.windup=0;q.session.hearts=3;Object.assign(w.player,{x:128.5,y:3,z:0,vx:0,vy:0,vz:0,grounded:true,inv:0,power:'small'});w.rt.flames.push({x:131,y:3,ty:3,vx:-4.4,life:9,t:0});});await t.step(90);
  s=await t.st();check('库巴的火焰打中玛丽扣护心',s.session.hearts===2,s.session);
  // 碰到库巴
  await p.evaluate(()=>{const q=__MARIO_TEST__,w=q.world,b=w.rt.bowser;w.rt.flames.length=0;q.session.hearts=3;Object.assign(w.player,{x:b.x-1.1,y:3,z:b.z,vx:0,vy:0,inv:0,power:'small',grounded:true});q.step(2);});
  s=await t.st();check('碰到库巴会受伤（不能踩）',s.session.hearts===2,s.session);
  // 火焰花打 5 下
  await p.evaluate(()=>{const q=__MARIO_TEST__,w=q.world,b=w.rt.bowser;Object.assign(w.player,{x:131,y:3,z:b.z,vx:0,vy:0,inv:999,power:'fire',facing:Math.PI/2,grounded:true});q.session.power='fire';q.session.settings.demo=true;b.x=137.6;b.fireT=[99,99,99];w.rt.flames.length=0;q.step(1);});
  const score0=(await t.st()).session.score;let hits=0;
  for(let i=0;i<12&&hits<5;i++){await p.keyboard.press('KeyJ');await t.step(70);hits=(await t.events()).filter(e=>e==='bowserHit').length;}
  await t.step(30);s=await t.st();
  check('火球打 5 下库巴翻身（原来是栗宝宝），加 5000 分',s.bowser.state==='dead'&&s.events.includes('bowserDefeated')&&s.session.score-score0>=5000,{b:s.bowser,d:s.session.score-score0});
  check('假库巴翻身后掉进岩浆消失',await (async()=>{await t.step(240);return (await t.st()).bowser.state==='gone';})());
  // ---------- 斧头 → 塌桥 → 库巴落下 → 走到蘑菇人 → 两行字 → 结算 ----------
  await fresh(p,'1-4');
  await t.put(118,3,{power:'small',inv:999});await t.step(240);
  await p.evaluate(()=>{const q=__MARIO_TEST__,w=q.world;w.rt.flames.length=0;w.rt.bowser.fireT=[99,99,99];Object.assign(w.player,{x:140.9,y:4.4,z:1,vx:3,vy:2,grounded:false,inv:0});q.step(1);});
  s=await t.st();const time0=s.time,score1=s.session.score;
  check('碰到斧头进入塌桥演出、火焰清掉',s.mode==='axe'&&s.flames.length===0&&s.events.includes('axe'),{mode:s.mode});
  await t.step(130);s=await t.st();
  const bridgeLeft=await p.evaluate(()=>{const w=__MARIO_TEST__.world;let n=0;for(let c=128;c<=140;c++)if(w.tiles.get(c*512+2+64))n++;return n;});
  check('桥 13 格从斧头那头一格格塌完',bridgeLeft===0&&s.events.filter(e=>e==='bridgeTile').length===13,{bridgeLeft});
  check('桥塌完库巴掉下去（库巴落下音效）',s.events.includes('bowserFall')&&['fall','gone'].includes(s.bowser.state),s.bowser);
  await t.step(120);s=await t.st();
  check('城堡通关曲响起、玛丽自己往右走',s.events.includes('worldClear')&&s.player.x>141.5,s.player);
  for(let i=0;i<20&&!(await t.st()).axe?.line2;i++)await t.step(60);
  s=await t.st();
  check('走到蘑菇人跟前停下',near(s.player.x,152.3,.01)&&s.player.y===0,s.player);
  check('两行字都出现',await p.locator('#castle-msg').isVisible()&&await p.locator('#castle-msg').evaluate(e=>e.classList.contains('two')));
  check('库巴已掉进岩浆',s.bowser.state==='gone',s.bowser);
  check('原作城堡关：计时停住，剩余时间不换分数',s.time===time0&&s.session.score===score1,{time0,time:s.time,score1,score:s.session.score});
  await p.screenshot({path:path.join(out,'toad-message.png')});
  await t.step(500);s=await t.st();
  check('演出结束进结算：从 1-4 开始打到最后一关',s.overlay==='result'&&(await p.locator('#res-title').innerText())==='通关！'&&(await p.locator('#res-extra').innerText()).length>0,{overlay:s.overlay});
  check('结算三连文案换成城堡版',(await p.locator('#result .sanlian').innerText()).includes('另一座城堡'));
  // ---------- 1-3 拔旗后接 1-4 ----------
  await fresh(p,'1-3');
  await p.evaluate(()=>{const q=__MARIO_TEST__,w=q.world;Object.assign(w.player,{x:151.7,y:0,vx:0,vy:0,grounded:true,inv:999});q.step(1);});
  for(let i=0;i<30&&(await p.evaluate(()=>__MARIO_TEST__.state().level))!=='1-4';i++)await t.step(120);
  check('1-3 拔旗进城堡后接 WORLD 1-4',(await p.evaluate(()=>__MARIO_TEST__.state().level))==='1-4'&&(await p.locator('#card-world').innerText())==='WORLD 1-4');
  // ---------- 暂停重开后声音仍在 ----------
  await p.evaluate(()=>__MARIO_TEST__.skipCard());await t.step(10);
  await p.locator('#btn-pause').click();await p.locator('#pause [data-act=restart]').click();await p.evaluate(()=>__MARIO_TEST__.skipCard());await t.step(10);
  const audio=await p.evaluate(async()=>{const q=__MARIO_TEST__,a=q.audio;await new Promise(r=>setTimeout(r,500));const t0=a.ctx.currentTime;await new Promise(r=>setTimeout(r,300));return{level:q.world.levelId,x:q.world.player.x,ctx:a.ctx.state,clock:a.ctx.currentTime-t0,track:a.samples.track?.name,playing:!!a.samples.source};});
  check('暂停里「从本关开头重来」回到 1-4 开头且城堡曲继续播',audio.level==='1-4'&&near(audio.x,1.4,.01)&&audio.ctx==='running'&&audio.clock>0.1&&audio.track==='castle'&&audio.playing,audio);
  check('页面没有脚本错误',errors.length===0,errors);
  fs.writeFileSync(path.join(out,'stage4-results.json'),JSON.stringify({url:base,browser:b.version(),method:'Edge GPU headless; manual clock; mechanic checks relocate the player and are not a normal playthrough',checks,errors},null,2));
  console.log(JSON.stringify({passed:checks.filter(c=>c.ok).length,total:checks.length,out}));
 }finally{await b.close();}
})().catch(e=>{console.error(e.message||e);process.exit(1);});

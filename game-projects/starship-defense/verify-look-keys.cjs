// v0.38.1：Y 抬头 / H 低头；医疗 / 兵种支援 / 直升机降低的默认键从 H 改到 N，直升机升高只留 K。
// 真实按键；游戏状态通过 ?qa=1 的钩子摆好。键位表与《枪火集结》共用同一份实现，GAME_URL 指向枪火集结也能跑前两组。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases',process.env.RELEASE||'web-look-keys-v0.38.1');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const results={},fail=[];const check=(n,ok,d)=>{results[n]={ok:!!ok,...(d!==undefined?{detail:d}:{})};if(!ok)fail.push(n);console.log((ok?'PASS ':'FAIL ')+n+(ok?'':'  '+JSON.stringify(d)));};
const SETUP=`(()=>{const q=__gameQA;q.Game.state='prep';q.clearEntities(false);q.squad.forEach(s=>s.mesh.position.set(-30,0,-30));
  q.setCamMode('third',false);q.setCameraView(0,false);q.setCamYaw(0);q.player.yaw=0;q.player.dead=false;q.player.inVehicle=null;q.player.mesh.visible=true;
  q.player.hp=q.player.maxHp;q.player.invulnerable=0;q.player.pos.set(0,q.groundY(0,20),20);q.player.vy=0;q.player.mesh.position.copy(q.player.pos);q.Input.reset();})()`;
(async()=>{
 fs.mkdirSync(release,{recursive:true});
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(500);

 // 1. 默认键位
 const keys=await p.evaluate(async()=>{const m=await import('./key-bindings.js');const k=m.createKeyBindings();return{H:k.code('H'),up:k.code('LOOKUP'),down:k.code('LOOKDOWN'),K:k.code('K'),hasY:!!m.KEY_ACTIONS.Y,n:Object.keys(m.KEY_ACTIONS).length,uniq:new Set(Object.keys(m.KEY_ACTIONS).map(a=>k.code(a))).size};});
 check('默认键位：医疗 / 直升机降低是 N，抬头 Y、低头 H，不再有单独的“直升机升高”动作，各动作的键互不重复',keys.H==='KeyN'&&keys.up==='KeyY'&&keys.down==='KeyH'&&!keys.hasY&&keys.uniq===keys.n,keys);
 const hint=await p.evaluate(()=>document.getElementById('keysHint').textContent);
 check('操作提示（按当前键位生成）写的是新键位',hint.includes('N 医疗')&&hint.includes('Q/E 转视角')&&hint.includes('Y/H 抬头低头')&&!hint.includes('H 医疗'),hint);

 // 2. 玩家自定义键与新默认键冲突时：保留玩家的设置，只挪新默认键
 const custom=await p.evaluate(async()=>{const m=await import('./key-bindings.js'),S='chongchao-keybindings-v1',out={};
   const run=(saved)=>{localStorage.setItem(S,JSON.stringify(saved));const k=m.createKeyBindings();const codes=Object.keys(m.KEY_ACTIONS).map(a=>k.code(a));return{O:k.code('O'),H:k.code('H'),up:k.code('LOOKUP'),down:k.code('LOOKDOWN'),X:k.code('X'),uniq:new Set(codes).size===codes.length};};
   out.oOnN=run({O:'KeyN'});out.xOnY=run({X:'KeyY'});out.hCustom=run({H:'KeyG'});out.oldY=run({Y:'KeyB',O:'KeyV'});localStorage.removeItem(S);return out;});
 check('玩家把别的动作绑到 N：玩家的键保留，医疗另找空键',custom.oOnN.O==='KeyN'&&custom.oOnN.H!=='KeyN'&&custom.oOnN.uniq,custom.oOnN);
 check('玩家把别的动作绑到 Y：玩家的键保留，抬头另找空键',custom.xOnY.X==='KeyY'&&custom.xOnY.up!=='KeyY'&&custom.xOnY.uniq,custom.xOnY);
 check('玩家自己改过医疗键：保持不变',custom.hCustom.H==='KeyG'&&custom.hCustom.uniq,custom.hCustom);
 check('旧存档里对“直升机升高”的自定义被忽略，其余自定义保留',custom.oldY.O==='KeyV'&&custom.oldY.uniq,custom.oldY);

 // 3. 进游戏：Y 抬头、H 低头、同按抵消、有上限
 await p.reload();await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(400);
 await p.keyboard.press('Enter');await p.waitForTimeout(600);await p.evaluate(SETUP);await p.waitForTimeout(200);
 await p.evaluate(()=>{__gameQA.Game.items.medkit=2;});await p.waitForTimeout(400);
 const hud=await p.evaluate(()=>{const e=document.getElementById('keysHint'),k=e.getBoundingClientRect(),s=document.getElementById('stage').getBoundingClientRect();return{left:Math.round(k.left-s.left),right:Math.round(s.right-k.right),width:Math.round(k.width),item:document.getElementById('itemTxt').textContent};});
 check('操作提示没有超出画面两侧；道具栏写的是当前医疗键',hud.width>200&&hud.left>=0&&hud.right>=0&&/医疗包×[^()]*\(N\)/.test(hud.item),hud);
 const pitch=()=>p.evaluate(()=>__gameQA.getCamPitch());
 const p0=await pitch();
 await p.keyboard.down('KeyY');await p.waitForTimeout(400);await p.keyboard.up('KeyY');await p.waitForTimeout(120);const p1=await pitch();
 await p.waitForTimeout(300);const p1b=await pitch();
 await p.keyboard.down('KeyH');await p.waitForTimeout(700);await p.keyboard.up('KeyH');await p.waitForTimeout(120);const p2=await pitch();
 await p.keyboard.down('KeyY');await p.keyboard.down('KeyH');await p.waitForTimeout(400);await p.keyboard.up('KeyY');await p.keyboard.up('KeyH');await p.waitForTimeout(120);const p3=await pitch();
 await p.keyboard.down('KeyY');await p.waitForTimeout(2600);await p.keyboard.up('KeyY');await p.waitForTimeout(120);const p4=await pitch();
 check('按住 Y 抬头、松开即停',p1>p0+.25&&Math.abs(p1b-p1)<.02,{p0,p1,p1b});
 check('按住 H 低头',p2<p1-.45,{p1,p2});
 check('Y / H 同按抵消',Math.abs(p3-p2)<.03,{p2,p3});
 check('抬头有上限（与拖动同一限位 1 弧度）',p4<=1.0001&&p4>.95,{p4});

 // 4. 医疗包改到 N；H 不再吃药
 await p.evaluate(SETUP);
 await p.evaluate(()=>{const q=__gameQA;q.Game.items.medkit=2;q.player.hp=40;});
 await p.keyboard.press('KeyH');await p.waitForTimeout(120);
 const afterH=await p.evaluate(()=>({medkit:__gameQA.Game.items.medkit,hp:__gameQA.player.hp}));
 await p.keyboard.press('KeyN');await p.waitForTimeout(120);
 const afterN=await p.evaluate(()=>({medkit:__gameQA.Game.items.medkit,hp:__gameQA.player.hp}));
 check('H 不再使用医疗包',afterH.medkit===2&&afterH.hp===40,afterH);
 check('N 使用医疗包',afterN.medkit===1&&afterN.hp>40,afterN);

 // 5. 直升机：K 升高、N 降低，Y 不再升高（只抬头），提示写新键位
 await p.evaluate(SETUP);
 const heli0=await p.evaluate(()=>{const q=__gameQA;q.Game.vehiclesOwned.push('heli');const v=q.spawnVehicle('heli');v.mesh.position.set(0,0,30);v.alt=6;q.enterVehicle(v);window.__heli=v;return{alt:v.alt,msg:document.getElementById('msg').textContent};});
 await p.keyboard.down('KeyY');await p.waitForTimeout(500);await p.keyboard.up('KeyY');const altY=await p.evaluate(()=>__heli.alt);
 await p.keyboard.down('KeyK');await p.waitForTimeout(500);await p.keyboard.up('KeyK');const altK=await p.evaluate(()=>__heli.alt);
 await p.keyboard.down('KeyN');await p.waitForTimeout(500);await p.keyboard.up('KeyN');const altN=await p.evaluate(()=>__heli.alt);
 check('上直升机的提示写 K 升高 / N 降低',heli0.msg.includes('K 升高')&&heli0.msg.includes('N 降低')&&!heli0.msg.includes('Y 升高'),heli0);
 check('Y 不再让直升机升高',Math.abs(altY-heli0.alt)<.5,{start:heli0.alt,altY});
 check('K 升高、N 降低',altK>altY+2.5&&altN<altK-2.5,{altY,altK,altN});
 check('没有脚本报错',errors.length===0,errors);
 fs.writeFileSync(path.join(release,'qa-look-keys.json'),JSON.stringify({at:new Date().toISOString(),url,results},null,1));
 console.log(`\n${Object.keys(results).length-fail.length}/${Object.keys(results).length}`);
 await b.close();process.exit(fail.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});

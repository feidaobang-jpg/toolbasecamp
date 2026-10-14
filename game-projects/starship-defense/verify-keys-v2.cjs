// 键位 v2（2026-10）：电脑端默认鼠标接管 + 左手键位（参考 CS / 电脑版吃鸡）。替代 verify-look-keys.cjs（Y/H 抬头低头那一版）。
// 真实按键 / 真实点击；游戏状态通过 ?qa=1 的钩子摆好。键位表与《枪火集结》共用同一份实现，GAME_URL 指向枪火集结时跑共用部分加战地模式。
// 用法：GAME_URL=http://127.0.0.1:8796/html/game/starship-defense/index.html node verify-keys-v2.cjs
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const url=process.env.GAME_URL||'http://127.0.0.1:8796/html/game/starship-defense/index.html';
const gunfire=/gunfire-assembly/.test(url);
const out=process.env.KEYS_OUT||path.join(__dirname,'media-kit/releases/web-keys-v2/qa-keys-'+(gunfire?'gunfire':'starship')+'.json');
const results={},fail=[];const check=(n,ok,d)=>{results[n]={ok:!!ok,...(d!==undefined?{detail:d}:{})};if(!ok)fail.push(n);console.log((ok?'PASS ':'FAIL ')+n+(ok?'':'  '+JSON.stringify(d)));};
const SETUP=`(()=>{const q=__gameQA;q.Game.state='prep';q.clearEntities(false);q.squad.forEach(s=>s.mesh.position.set(-30,0,-30));
  q.setCamMode('third',false);q.setCameraView(0,false);q.setCamYaw(0);q.player.yaw=0;q.player.dead=false;q.player.inVehicle=null;q.player.mesh.visible=true;
  q.player.hp=q.player.maxHp;q.player.invulnerable=0;q.player.pos.set(0,q.groundY(0,20),20);q.player.vy=0;q.player.mesh.position.copy(q.player.pos);q.Input.reset();})()`;
const msg=p=>p.evaluate(()=>document.getElementById('msg').textContent);
(async()=>{
 fs.mkdirSync(path.dirname(out),{recursive:true});
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForFunction(()=>window.__gameQA&&window.__ccReady!==false);await p.waitForTimeout(500);

 // 1. 默认键位与旧自定义
 const keys=await p.evaluate(async()=>{const m=await import('./key-bindings.js');const k=m.createKeyBindings();const all=Object.keys(m.KEY_ACTIONS),bound=all.map(a=>k.code(a)).filter(Boolean);
   return {map:Object.fromEntries(['J','K','SPRINT','CROUCH','I','U','H','X','O','L','WAVE','R','T','C','Z','Q','E','LOOKUP','LOOKDOWN','F','P'].map(a=>[a,k.code(a)])),J:k.label('J'),uniq:new Set(bound).size===bound.length};});
 const want={J:'',K:'Space',SPRINT:'ShiftLeft',CROUCH:'KeyC',I:'KeyF',U:'KeyG',H:'KeyE',X:'KeyQ',O:'KeyB',L:'KeyT',WAVE:'KeyX',R:'KeyR',T:'Tab',C:'KeyV',Z:'KeyZ',Q:'',E:'',LOOKUP:'',LOOKDOWN:'',F:'',P:'KeyP'};
 check('默认键位：左键射击、空格跳、Shift 跑、C 蹲、F 互动、G 手雷、E 医疗、Q 换枪、B 商店、T 建造、X 开战、R 换弹、Tab 战况、V 视角；键盘转视角与全屏不占键；绑定的键互不重复',
   Object.keys(want).every(a=>keys.map[a]===want[a])&&keys.J==='左键'&&keys.uniq,keys);
 const custom=await p.evaluate(async()=>{const m=await import('./key-bindings.js');
   localStorage.setItem('chongchao-keybindings-v1',JSON.stringify({O:'KeyN',H:'KeyG'}));const k1=m.createKeyBindings();const old={O:k1.code('O'),H:k1.code('H')};
   const k2=m.createKeyBindings();const err=k2.bind('O','KeyN');const k3=m.createKeyBindings();const kept=k3.code('O');
   const clash=k3.bind('U','KeyN');k3.reset();const reset=m.createKeyBindings().code('O');localStorage.removeItem('chongchao-keybindings-v1');localStorage.removeItem('chongchao-keybindings-v2');
   const tab=k3.bind('Q','Tab');const k4=m.createKeyBindings();const legacy=['KeyJ','KeyK','KeyU','KeyI','KeyN','KeyO','KeyL'].map(c=>k4.action(c)).join(',');k4.bind('H','KeyN');const taken=k4.action('KeyN');k4.reset();return{old,err,kept,clash,reset,tab,legacy,taken};});
 check('旧版（v1）的自定义键不沿用；新版里改键会保存、冲突会拒绝、可恢复默认',custom.old.O==='KeyB'&&custom.old.H==='KeyE'&&custom.err===''&&custom.kept==='KeyN'&&/已用于/.test(custom.clash)&&custom.reset==='KeyB',custom);
 check('旧键 J/K/U/I/N/O/L 不显示但仍可用（射击、跳、手雷、互动、医疗、商店、建造）',custom.legacy==='J,K,U,I,H,O,L'&&custom.taken==='H',custom);

 if(!gunfire){
 // 2. 进游戏：第三人称也能鼠标接管；第一次接管提示新键位，之后不再提示
 await p.evaluate(()=>{window.__msgs=[];const el=document.getElementById('msg');new MutationObserver(()=>__msgs.push(el.textContent)).observe(el,{childList:true,characterData:true,subtree:true});});
 await p.keyboard.press('Enter');await p.waitForTimeout(800);await p.evaluate(SETUP);await p.waitForTimeout(200);
 const st0=await p.evaluate(()=>({mode:__gameQA.getCamView?__gameQA.getCamView():null,third:document.pointerLockElement}));
 await p.mouse.click(640,360);await p.waitForTimeout(500);
 const lock1=await p.evaluate(()=>({lock:document.pointerLockElement&&document.pointerLockElement.id,state:__gameQA.Game.state}));
 const msgs=await p.evaluate(()=>__msgs),m1=msgs.find(t=>/电脑键位已改/.test(t))||'',second=msgs[msgs.length-1]||'';
 check('第三人称点一下画面就接管鼠标（以前只有第一人称能接管）',lock1.lock==='c3d',{st0,lock1});
 check('第一次接管（开局自动接管）时提示新键位（F 互动、G 手雷、E 医疗、Q 换枪、B 商店、T 建造、X 开战），再次接管只提示“鼠标已接管”',/F 互动/.test(m1)&&/G 投掷手雷/.test(m1)&&/E 医疗/.test(m1)&&/Q 切换武器/.test(m1)&&/B 商店/.test(m1)&&/T 建造/.test(m1)&&/X 开始虫潮/.test(m1)&&/鼠标已接管/.test(second),{m1,second});
 const hint=await p.evaluate(()=>document.getElementById('keysHint').textContent);
 check('底部操作提示按新键位写，没有 Q/E 转视角、Y/H 抬头低头',/鼠标转视角/.test(hint)&&/F 互动/.test(hint)&&/G 投掷手雷/.test(hint)&&/E 医疗/.test(hint)&&/B 商店/.test(hint)&&/T 建造/.test(hint)&&/X 开始虫潮/.test(hint)&&/V 切换视角/.test(hint)&&!/Q\/E/.test(hint)&&!/抬头低头/.test(hint),hint);
 const ready=await p.evaluate(()=>document.getElementById('readyBtn').textContent);
 check('“准备完毕，开战”按钮写 X',/（X）/.test(ready),ready);
 // 鼠标移动转视角
 const yaw0=await p.evaluate(()=>__gameQA.getCamYaw?__gameQA.getCamYaw():__gameQA.camYaw);
 for(let i=0;i<8;i++){await p.mouse.move(640+i*20,360);await p.waitForTimeout(16);}
 await p.waitForTimeout(300);const yaw1=await p.evaluate(()=>__gameQA.getCamYaw?__gameQA.getCamYaw():__gameQA.camYaw);
 check('接管后移动鼠标转视角',yaw0!==undefined&&Math.abs(yaw1-yaw0)>0.01,{yaw0,yaw1});

 // 3. 左手键位逐个按
 await p.evaluate(SETUP);await p.evaluate(()=>{const q=__gameQA;q.Game.items.medkit=2;q.player.hp=40;});
 await p.keyboard.press('KeyE');await p.waitForTimeout(150);
 const med=await p.evaluate(()=>({medkit:__gameQA.Game.items.medkit,hp:__gameQA.player.hp}));
 check('E 使用医疗包',med.medkit===1&&med.hp>40,med);
 await p.evaluate(SETUP);const g0=await p.evaluate(()=>__gameQA.player.grenadeCd||0);
 await p.keyboard.press('KeyG');await p.waitForTimeout(150);const g1=await p.evaluate(()=>({cd:__gameQA.player.grenadeCd||0,msg:document.getElementById('msg').textContent}));
 check('G 扔手雷',g1.cd>g0||/手雷/.test(g1.msg),{g0,g1});
 await p.evaluate(SETUP);await p.keyboard.press('KeyQ');await p.waitForTimeout(150);const mq=await msg(p);
 check('Q 换枪（只有一把枪时提示去 B 商店买）',/B 商店/.test(mq),mq);
 await p.evaluate(SETUP);await p.keyboard.press('KeyF');await p.waitForTimeout(150);const mf=await msg(p);
 check('F 互动（附近没有东西时提示，并写 E 是医疗包）',/附近没有可互动/.test(mf)&&/E 是医疗包/.test(mf),mf);
 await p.evaluate(SETUP);const v0=await p.evaluate(()=>__gameQA.getCamView());await p.keyboard.press('KeyV');await p.waitForTimeout(150);const v1=await p.evaluate(()=>({view:__gameQA.getCamView(),msg:document.getElementById('msg').textContent}));
 check('V 切换视角（提示写 V）',v1.view!==v0&&/V /.test(v1.msg),{v0,v1});
 await p.evaluate(SETUP);await p.keyboard.press('KeyB');await p.waitForTimeout(250);
 const shop=await p.evaluate(()=>({shop:!document.getElementById('shopPanel').classList.contains('hidden'),panel:__gameQA.panelOpen}));
 await p.keyboard.press('Escape');await p.waitForTimeout(250);
 const shopClosed=await p.evaluate(()=>document.getElementById('shopPanel').classList.contains('hidden'));
 check('B 打开商店，Esc 关上',shop.shop&&shop.panel&&shopClosed,{shop,shopClosed});
 await p.evaluate(SETUP);await p.keyboard.press('KeyT');await p.waitForTimeout(250);
 const build=await p.evaluate(()=>!document.getElementById('buildPanel').classList.contains('hidden'));
 await p.keyboard.press('Escape');await p.waitForTimeout(250);
 check('T 打开建造菜单',build,build);
 await p.evaluate(SETUP);await p.evaluate(()=>{if(__gameQA.panelOpen)document.getElementById('buildClose')?.click();});await p.waitForTimeout(100);
 await p.keyboard.press('KeyR');await p.waitForTimeout(200);const r=await p.evaluate(()=>__gameQA.Game.state);
 await p.keyboard.press('KeyX');await p.waitForTimeout(300);const x=await p.evaluate(()=>__gameQA.Game.state);
 check('R 不再开战，X 开战',r==='prep'&&x==='battle',{r,x});
 // 直升机：空格升高、C 降低
 await p.evaluate(SETUP);
 const heli0=await p.evaluate(()=>{const q=__gameQA;q.Game.vehiclesOwned.push('heli');const v=q.spawnVehicle('heli');v.mesh.position.set(0,0,30);v.alt=6;q.enterVehicle(v);window.__heli=v;return{alt:v.alt,msg:document.getElementById('msg').textContent};});
 await p.keyboard.down('Space');await p.waitForTimeout(500);await p.keyboard.up('Space');const altUp=await p.evaluate(()=>__heli.alt);
 await p.keyboard.down('KeyC');await p.waitForTimeout(500);await p.keyboard.up('KeyC');const altDown=await p.evaluate(()=>__heli.alt);
 check('上直升机提示写“空格 升高 / C 降低，再按 F 下车”',/空格 升高/.test(heli0.msg)&&/C 降低/.test(heli0.msg)&&/F 下车/.test(heli0.msg),heli0);
 check('空格升高、C 降低',altUp>heli0.alt+2.5&&altDown<altUp-2.5,{start:heli0.alt,altUp,altDown});
 await p.evaluate(()=>{const q=__gameQA;q.exitVehicle?q.exitVehicle():null;});

 // 4. 菜单里 Tab 只切焦点，不会开自由测试
 await p.keyboard.press('Escape');await p.waitForTimeout(300);
 await p.evaluate(()=>document.getElementById('btnQuit').click());await p.waitForTimeout(500);
 const before=await p.evaluate(()=>({state:__gameQA.Game.state,test:__gameQA.Game.testMode}));
 await p.keyboard.press('Tab');await p.waitForTimeout(150);await p.keyboard.press('Tab');await p.waitForTimeout(300);
 const after=await p.evaluate(()=>({state:__gameQA.Game.state,test:__gameQA.Game.testMode,focus:document.activeElement&&(document.activeElement.id||document.activeElement.tagName)}));
 check('回到大厅后按 Tab 只移动焦点，不会开局',before.state==='menu'&&after.state==='menu'&&!after.test&&after.focus&&after.focus!=='BODY',{before,after});

 // 5. “按住画面拖动”选项：点画面不接管
 await p.evaluate(()=>{localStorage.setItem('chongchao-combat-controls-v1',JSON.stringify({input:'drag',aim:'auto',fire:'auto'}));});await p.reload();await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(400);
 const opt=await p.evaluate(()=>[...document.querySelectorAll('#combat-input option')].map(o=>o.value+':'+o.textContent));
 await p.keyboard.press('Enter');await p.waitForTimeout(800);await p.evaluate(SETUP);await p.mouse.click(640,360);await p.waitForTimeout(400);
 const lock2=await p.evaluate(()=>document.pointerLockElement&&document.pointerLockElement.id);
 check('操作设置里“电脑鼠标”两项：鼠标接管（推荐）/ 按住画面拖动；选拖动后点画面不接管',opt.join('|')==='mouse:鼠标接管（推荐）|drag:按住画面拖动转视角'&&!lock2,{opt,lock2});
 } else {
 // 枪火集结：战地模式（步行第一人称）
 const startBf=async()=>{for(const sel of ['#earlyGunfire summary','#btnVersus','[data-vs-ai="normal"]']){await p.click(sel);await p.waitForTimeout(400);}await p.waitForTimeout(1800);};
 await startBf();
 await p.mouse.click(640,360);await p.waitForTimeout(500);
 const bf=await p.evaluate(()=>({lock:document.pointerLockElement&&document.pointerLockElement.id,battle:__gameQA.battleOn(),hint:document.getElementById('keysHint').textContent}));
 check('战地模式点画面接管鼠标',bf.battle&&bf.lock==='c3d',bf);
 check('战地操作提示：鼠标转视角、按住左键射击、右键或 Z 举枪、左Shift 跑步、R 换弹、B 装备、T 部署、Tab 战况、E 兵种支援、F 上下载具、G 手雷、空格跳跃、V 载具视角',
   ['鼠标转视角','按住左键射击','右键或Z举枪','左Shift跑步','R换弹','B装备','T部署','Tab战况','E兵种支援','F上/下载具','G手雷','空格跳跃','V载具视角'].every(t=>bf.hint.includes(t))&&!/Q\/E/.test(bf.hint),bf.hint);
 await p.keyboard.press('Tab');await p.waitForTimeout(300);
 const team=await p.evaluate(()=>!document.getElementById('vsPanel').classList.contains('hidden'));
 await p.keyboard.press('Tab');await p.waitForTimeout(300);
 const team2=await p.evaluate(()=>document.getElementById('vsPanel').classList.contains('hidden'));
 check('Tab 打开战况，再按 Tab 关上',team&&team2,{team,team2});
 await p.mouse.click(640,360);await p.waitForTimeout(400);
 await p.keyboard.press('KeyZ');await p.waitForTimeout(150);const aim=await p.evaluate(()=>document.getElementById('vZ').classList.contains('aiming'));
 await p.keyboard.press('KeyZ');await p.waitForTimeout(150);
 check('Z 举枪（和右键一样）',aim,aim);
 await p.keyboard.press('KeyB');await p.waitForTimeout(300);const kit=await p.evaluate(()=>!document.getElementById('vsPanel').classList.contains('hidden'));await p.keyboard.press('KeyB');await p.waitForTimeout(200);
 check('B 打开装备面板',kit,kit);
 await p.evaluate(()=>{localStorage.setItem('chongchao-combat-controls-v1',JSON.stringify({input:'drag',aim:'auto',fire:'auto'}));});await p.reload();await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(400);
 await startBf();await p.mouse.click(640,360);await p.waitForTimeout(400);
 const lock2=await p.evaluate(()=>document.pointerLockElement&&document.pointerLockElement.id);
 check('选“按住画面拖动”后战地里点画面不接管',!lock2,lock2);
 }
 check('没有脚本报错',errors.length===0,errors);
 fs.writeFileSync(out,JSON.stringify({at:new Date().toISOString(),url,results},null,1));
 console.log(`\n${Object.keys(results).length-fail.length}/${Object.keys(results).length}`);
 await b.close();process.exit(fail.length?1:0);
})().catch(e=>{console.error(e);process.exit(2);});

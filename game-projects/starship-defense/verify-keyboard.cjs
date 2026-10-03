// v0.9.2: keyboard-only menus/panels (default selection with visible frame, arrows/Tab/Enter/Esc)
// and placement without R-rotate (ghost follows Q/E camera). Real key presses only after load.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases',process.env.RELEASE||'web-keyboard-v0.9.2'),captures=path.join(release,'captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const results={},fail=[];
const check=(name,ok,detail)=>{results[name]={ok:!!ok,...(detail!==undefined?{detail}:{})};if(!ok)fail.push(name);};
(async()=>{
 fs.mkdirSync(captures,{recursive:true});
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(700);
 const focus=()=>p.evaluate(()=>{const a=document.activeElement;const cs=a?getComputedStyle(a):null;return{id:a?.id||'',cls:a?.className||'',text:(a?.textContent||'').trim().slice(0,14),outline:cs?cs.outlineStyle+' '+cs.outlineWidth:''};});
 const key=async(k,n=1)=>{for(let i=0;i<n;i++){await p.keyboard.press(k);await p.waitForTimeout(90);}};
 // main menu
 const f0=await focus();check('main menu preselects 开始新游戏 with a visible frame',f0.id==='btnStart'&&f0.outline.startsWith('solid'),f0);
 await p.screenshot({path:path.join(captures,'menu-keyboard-focus.jpg'),quality:84});
 await key('ArrowUp');const f1=await focus();await key('ArrowRight');const f2=await focus();await key('ArrowLeft');const f2b=await focus();await key('Enter');
 const cls=await p.evaluate(()=>__gameQA.Game.cls);
 check('arrows move across class cards, Enter picks 火枪兵',f1.text.includes('火枪兵')&&f2.text.includes('医疗兵')&&f2b.text.includes('火枪兵')&&cls==='rifle',{f1,f2,f2b,cls});
 await key('ArrowDown');for(let i=0;i<4&&(await focus()).id!=='btnStart';i++)await key('ArrowLeft');const f3=await focus();await key('Enter');await p.waitForTimeout(500);
 const started=await p.evaluate(()=>({state:__gameQA.Game.state,weapons:__gameQA.Game.weapons}));
 check('down to a start button and Enter starts the game',['prep','battle'].includes(started.state)&&started.weapons.join()==='lmg,shotgun',{f3,started});
 // shop
 await p.evaluate(()=>{__gameQA.Game.gold=5000;});await key('KeyO');await p.waitForTimeout(250);
 const s0=await focus();await p.screenshot({path:path.join(captures,'shop-keyboard-focus.jpg'),quality:84});
 check('shop preselects first weapon card',s0.cls.includes('shopItem')&&s0.text.includes('机枪'),s0);
 await key('ArrowRight');await key('ArrowRight');const s1=await focus();await key('Enter');await p.waitForTimeout(200);
 const bought=await p.evaluate(()=>({weapons:__gameQA.Game.weapons,gold:__gameQA.Game.gold}));const s2=await focus();
 check('arrows + Enter buy 榴弹炮; selection stays in place after the shop redraws',s1.text.includes('榴弹炮')&&bought.weapons.includes('launcher')&&bought.gold===4100&&s2.text.includes('榴弹炮'),{s1,bought,s2});
 await key('ArrowUp');const t0=await focus();for(let i=0;i<4&&!(await focus()).text.startsWith('道具');i++)await key('ArrowLeft');await key('Enter');await p.waitForTimeout(150);
 const tab=await p.evaluate(()=>document.querySelector('#shopTabs .tab.on').textContent);
 check('arrow up reaches the tab row, left + Enter switches to 道具',t0.cls.includes('tab')&&tab==='道具',{t0,tab});
 const tabs=[];for(let i=0;i<14;i++){await key('Tab');tabs.push(await p.evaluate(()=>document.getElementById('shopPanel').contains(document.activeElement)));}
 check('Tab cycles inside the shop only',tabs.every(Boolean),tabs);
 await key('Escape');check('Esc closes the shop',await p.evaluate(()=>!__gameQA.panelOpen));
 if(await p.evaluate(()=>__gameQA.Game.state==='paused'))await key('KeyP');
 // build: panel selection, Enter -> ghost, Q turns it, R no longer rotates, Enter/J places
 await p.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.player.pos.set(0,0,20);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;});
 await key('KeyL');await p.waitForTimeout(200);const b0=await focus();await key('ArrowRight');const b1=await focus();await key('Enter');await p.waitForTimeout(200);
 const g=await p.evaluate(()=>({kind:__gameQA.place.kind,yaw:__gameQA.place.yaw}));
 check('build panel preselects first card; arrows + Enter start the ghost',b0.cls.includes('shopItem')&&b1.text.includes('合金围墙')&&g.kind==='wall',{b0,b1,g});
 await p.keyboard.down('KeyQ');await p.waitForTimeout(500);await p.keyboard.up('KeyQ');const gq=await p.evaluate(()=>__gameQA.place.yaw);
 check('Q/E turn the ghost with the camera',Math.abs(gq-g.yaw)>.5,{before:g.yaw,after:gq});
 const hasRot=await p.evaluate(()=>!!document.getElementById('placeRot')||'rotatePlacement' in __gameQA);
 check('no separate R-rotate any more',!hasRot);
 const n0=await p.evaluate(()=>__gameQA.buildings.length);await key('Enter');await p.waitForTimeout(150);
 check('Enter places the ghost',await p.evaluate(n=>__gameQA.buildings.length===n+1&&!__gameQA.place.kind,n0));
 // pause menu -> save panel -> Esc back
 await key('KeyP');await p.waitForTimeout(150);const p0=await focus();
 check('pause menu preselects 继续游戏',p0.id==='btnResume',p0);
 await key('ArrowRight');const p1=await focus();await key('Enter');await p.waitForTimeout(150);const sv=await focus();
 await key('Enter');await p.waitForTimeout(150);const saved=await p.evaluate(()=>!!localStorage.getItem('sst_save_1'));
 check('pause → 存档 → first slot preselected → Enter saves',p1.id==='btnSaveMenu'&&sv.text.includes('保存')&&saved,{p1,sv,saved});
 await key('Escape');await p.waitForTimeout(150);const p2=await focus();
 await p.screenshot({path:path.join(captures,'pause-keyboard-focus.jpg'),quality:84});
 const opts=[];for(let i=0;i<6;i++){await key('ArrowDown');opts.push((await focus()).id);if(opts.at(-1)==='themeBtnMenu'||opts.at(-1)==='personBtnMenu')break;}
 check('Esc returns to the pause menu; option row reachable by arrows',p2.id==='btnResume'&&opts.some(id=>/BtnMenu$/.test(id)),{p2,opts});
 await key('Escape');await p.waitForTimeout(150);check('Esc resumes the game',await p.evaluate(()=>['prep','battle'].includes(__gameQA.Game.state)));
 // confirm dialog via keyboard (new game with progress)
 await p.evaluate(()=>{const q=__gameQA;q.Game.chapter=3;q.autoSave();document.getElementById('btnQuit').click();});await p.waitForTimeout(250);
 const m0=await focus();await key('ArrowDown');const m1=await focus();
 check('with progress the menu preselects 继续上次',m0.id==='btnContinue',{m0,m1});
 await p.evaluate(()=>document.getElementById('btnStart').focus());await key('Enter');await p.waitForTimeout(200);
 const c0=await focus();await key('ArrowRight');const c1=await focus();await key('Enter');await p.waitForTimeout(300);
 const ng=await p.evaluate(()=>({state:__gameQA.Game.state,chapter:__gameQA.Game.chapter,backup:!!localStorage.getItem('sst_save_auto-backup')}));
 check('confirm dialog: 取消 preselected, arrow to 确认, Enter starts new game',c0.id==='confirmCancel'&&c1.id==='confirmOk'&&ng.chapter===1&&ng.backup,{c0,c1,ng});
 check('no page errors',errors.length===0,errors);
 await b.close();
 const summary={version:process.env.RELEASE||'web-keyboard-v0.9.2',checked_at:new Date().toISOString(),passed:Object.values(results).filter(v=>v.ok).length,failed:fail,results};
 fs.writeFileSync(path.join(release,'keyboard.json'),JSON.stringify(summary,null,1));
 console.log(JSON.stringify({passed:summary.passed,failed:fail},null,1));if(fail.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});

// v0.9 media capture for game-video: real browser, real-time gameplay; QA hooks only position the
// player/camera and give mid-game gear where noted in the description.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const captures=path.join(__dirname,'media-kit/releases/web-feedback-v0.9.0/captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const edge={executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']};
async function session(b,name,opts,fn){
  const dir=path.join(captures,'_tmp_'+name);fs.mkdirSync(dir,{recursive:true});
  const c=await b.newContext({...opts,recordVideo:{dir,size:opts.viewport}});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+'?qa=1'+(opts.query||''));await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(600);
  await fn(p);const v=p.video();await c.close();
  const src=await v.path();fs.renameSync(src,path.join(captures,name+'.webm'));fs.rmSync(dir,{recursive:true,force:true});
  if(errors.length)console.log(name,'errors',errors);
}
const shot=(p,name)=>p.screenshot({path:path.join(captures,name+'.jpg'),quality:86});
(async()=>{
 const b=await chromium.launch(edge);
 // 1. Desktop: menu -> base -> smart gate -> mouse look -> wave from a tunnel mouth -> laser + damage numbers -> first person
 await session(b,'desktop-realtime',{viewport:{width:1440,height:810}},async p=>{
  await p.waitForTimeout(1500);await shot(p,'menu-dark');
  await p.keyboard.press('Enter');await p.waitForTimeout(1500);await shot(p,'prep-base');
  await p.evaluate(()=>{const q=__gameQA;q.Game.gold=6000;});
  await p.keyboard.press('KeyO');await p.waitForTimeout(600);
  for(const n of ['霰弹枪','脉冲激光炮'])await p.locator('#shopGrid .shopItem').filter({hasText:n}).first().click();
  await p.evaluate(()=>document.querySelector('#shopGrid [data-up="laser"]').click());await p.waitForTimeout(500);await shot(p,'shop-upgrade');
  await p.keyboard.press('Escape');await p.waitForTimeout(200);if(await p.evaluate(()=>__gameQA.Game.state==='paused'))await p.keyboard.press('KeyP');
  await p.keyboard.press('KeyR');await p.waitForTimeout(800);
  await p.evaluate(()=>{const q=__gameQA;q.player.pos.set(0,5,-22);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;});
  await p.keyboard.down('KeyW');await p.waitForTimeout(3200);await p.keyboard.up('KeyW');
  await p.mouse.move(720,405);await p.mouse.down({button:'right'});await p.mouse.move(520,420,{steps:30});await p.mouse.move(900,400,{steps:40});await p.mouse.up({button:'right'});
  await p.evaluate(()=>{const q=__gameQA;q.player.pos.set(4,0,150);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;q.setCameraView(1,false);q.Game.wave.timer=0;});
  await p.waitForTimeout(4000);await shot(p,'wave-from-mouth');
  await p.evaluate(()=>{const q=__gameQA;q.setCameraView(0,false);q.Game.curWeapon='laser';});
  await p.keyboard.down('KeyJ');for(let i=0;i<4;i++){await p.keyboard.down(i%2?'KeyQ':'KeyE');await p.waitForTimeout(900);await p.keyboard.up(i%2?'KeyQ':'KeyE');}
  await shot(p,'laser-damage-numbers');await p.keyboard.up('KeyJ');
  await p.keyboard.press('KeyV');await p.keyboard.down('KeyJ');await p.waitForTimeout(2500);await shot(p,'first-person-fight');await p.keyboard.up('KeyJ');await p.keyboard.press('KeyV');await p.waitForTimeout(800);
 });
 // 2. Tunnel walk into the hive and a queen fight (mid-game gear given via QA)
 await session(b,'tunnel-hive-realtime',{viewport:{width:1440,height:810}},async p=>{
  await p.keyboard.press('Enter');await p.waitForTimeout(800);
  await p.evaluate(()=>{const q=__gameQA,g=q.Game;g.weapons=['lmg','laser','launcher'];g.curWeapon='laser';g.weaponLv={laser:5,launcher:3};g.hpBonus=200;q.player.reset(g.cls);
    const s=q.MOUTHS.find(m=>m.main);q.player.pos.set(s.x+s.dx*2,0,s.z+s.dz*2);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(Math.atan2(-s.dx,-s.dz));q.player.yaw=q.getCamYaw();});
  await p.waitForTimeout(900);await shot(p,'tunnel-mouth');
  await p.keyboard.down('KeyW');await p.waitForTimeout(3500);await shot(p,'tunnel-inside');await p.waitForTimeout(4500);await p.keyboard.up('KeyW');
  await p.evaluate(()=>{const q=__gameQA;q.player.pos.set(0,0,284);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;q.setCameraView(1,false);});
  await p.waitForTimeout(1500);await shot(p,'hive-queen');
  await p.keyboard.down('KeyJ');for(let i=0;i<5;i++){await p.keyboard.down(i%2?'KeyA':'KeyD');await p.waitForTimeout(1300);await p.keyboard.up(i%2?'KeyA':'KeyD');}
  await p.keyboard.press('KeyU');await p.waitForTimeout(1500);await shot(p,'hive-fight');await p.keyboard.up('KeyJ');
 });
 // 3. Phone portrait (auto-rotated landscape layout) with real touch input
 await session(b,'phone-realtime',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 12; Phone) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'},async p=>{
  await p.evaluate(()=>__gameQA.newGame(false));await p.waitForTimeout(1000);
  const cdp=await p.context().newCDPSession(p);
  const tap=async id=>{const bx=await p.locator('#'+id).boundingBox();await p.touchscreen.tap(bx.x+bx.width/2,bx.y+bx.height/2);};
  const drag=async(x0,y0,x1,y1,steps=12)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y:y0,id:1}]});for(let i=1;i<=steps;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/steps,y:y0+(y1-y0)*i/steps,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  const jb=await p.locator('#joyBase').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:jb.x+jb.width/2,y:jb.y+jb.height/2,id:2}]});
  for(let i=0;i<20;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:jb.x+jb.width/2+Math.min(40,i*4),y:jb.y+jb.height/2,id:2}]});await p.waitForTimeout(80);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await drag(200,300,200,520);await p.waitForTimeout(500);
  await tap('vO');await p.waitForTimeout(900);await shot(p,'phone-shop-open');await p.evaluate(()=>document.getElementById('shopClose').click());
  await tap('vV');await p.waitForTimeout(900);await shot(p,'phone-first-person');await tap('vV');
  await tap('vP');await p.waitForTimeout(900);await shot(p,'phone-pause-options');
 });
 // 4. Bright theme still available
 const t=await (await b.newContext({viewport:{width:1440,height:810}})).newPage();await t.goto(url+'?qa=1&theme=toy');await t.waitForFunction(()=>window.__gameQA);
 await t.evaluate(()=>{const q=__gameQA;q.newGame(false);q.player.pos.set(0,0,40);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);});await t.waitForTimeout(1500);await shot(t,'theme-toy-field');
 await b.close();console.log('done');
})().catch(e=>{console.error(e);process.exit(1);});

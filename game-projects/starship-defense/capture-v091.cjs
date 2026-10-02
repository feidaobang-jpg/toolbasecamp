// v0.9.1 media: trimmed arsenal shop, flame burn / shotgun knockback, ghost building placement.
// Real browser, real-time input; QA hooks only set gold/position where noted.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const captures=path.join(__dirname,'media-kit/releases/web-arsenal-build-v0.9.1/captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const shot=(p,n)=>p.screenshot({path:path.join(captures,n+'.jpg'),quality:86});
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const dir=path.join(captures,'_rec');fs.mkdirSync(dir,{recursive:true});
 const c=await b.newContext({viewport:{width:1440,height:810},recordVideo:{dir,size:{width:1440,height:810}}});const p=await c.newPage();
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(800);
 await p.keyboard.press('Enter');await p.waitForTimeout(900);
 await p.evaluate(()=>{const q=__gameQA;q.Game.gold=8000;q.player.pos.set(0,0,18);q.player.mesh.position.copy(q.player.pos);q.player.yaw=0;q.setCamYaw(0);});
 await p.keyboard.press('KeyO');await p.waitForTimeout(700);await shot(p,'shop-six-weapons');
 for(const n of ['霰弹枪','火焰喷射器'])await p.locator('#shopGrid .shopItem').filter({hasText:n}).first().click();
 await p.keyboard.press('KeyO');await p.waitForTimeout(400);
 // Ghost placement: wall, rotate, blocked spot, move, place; then a turret.
 await p.keyboard.press('KeyL');await p.waitForTimeout(600);await shot(p,'build-panel');
 await p.locator('#buildGrid .shopItem').filter({hasText:'合金围墙'}).click();await p.waitForTimeout(900);
 await p.keyboard.press('KeyR');await p.waitForTimeout(700);await p.keyboard.press('KeyR');await p.waitForTimeout(500);
 await p.keyboard.press('KeyJ');await p.waitForTimeout(700);
 await p.keyboard.press('KeyL');await p.waitForTimeout(400);await p.locator('#buildGrid .shopItem').filter({hasText:'自动炮台'}).click();await p.waitForTimeout(900);
 await shot(p,'ghost-blocked-on-wall');await p.keyboard.press('KeyJ');await p.waitForTimeout(700);
 await p.keyboard.down('KeyA');await p.waitForTimeout(900);await p.keyboard.up('KeyA');await p.waitForTimeout(400);await shot(p,'ghost-valid-turret');
 await p.keyboard.press('KeyJ');await p.waitForTimeout(1200);
 // Weapons: shotgun knockback and flame burn on a small group.
 await p.evaluate(()=>{const q=__gameQA;q.player.pos.set(0,0,40);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;for(let i=0;i<6;i++){const m=q.spawnMonster('mob',-4+i*1.6,52+(i%2)*2,{quiet:true});m.hp=m.maxHp=600;m.emerge=0;}});
 await p.keyboard.press('Digit2');await p.waitForTimeout(500);await p.keyboard.down('KeyJ');await p.waitForTimeout(1600);await p.keyboard.up('KeyJ');
 await p.keyboard.press('Digit3');await p.waitForTimeout(300);await p.keyboard.down('KeyJ');await p.waitForTimeout(1300);await shot(p,'flame-burn');await p.keyboard.up('KeyJ');await p.waitForTimeout(1500);
 const v=p.video();await c.close();fs.renameSync(await v.path(),path.join(captures,'arsenal-build-realtime.webm'));fs.rmSync(dir,{recursive:true,force:true});
 await b.close();console.log('done');
})().catch(e=>{console.error(e);process.exit(1);});

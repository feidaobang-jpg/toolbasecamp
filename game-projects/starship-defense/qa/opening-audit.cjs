// Real-time opening audit with actual input. QA snapshots are read-only.
// Reaching a state is recorded as observation, not a judgment of gameplay quality.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.env.OPENING_URL||'http://127.0.0.1:8784/html/game/starship-defense/index.html?qa=1';
const out=process.env.OPENING_OUT||path.join(require('node:os').tmpdir(),'starship-opening-audit');
const duration=Number(process.env.OPENING_MS||600000);
const report={url,started:new Date().toISOString(),method:'Real menu clicks and keyboard; no state mutation or time acceleration',events:[],samples:[],errors:[],physicalPhoneTested:false};
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:path.join(out,'video'),size:{width:1280,height:720}}}),p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));
 const snap=()=>p.evaluate(()=>{const q=window.__gameQA;return {state:q.Game.state,chapter:q.Game.chapter,level:q.Game.level,gold:q.Game.gold,hp:q.player.hp,baseHp:q.base.hp,gateHp:q.gate.hp,buildings:q.buildings.length,squadCount:q.Game.squadCount,activeSquad:q.squad.filter(s=>!s.dead).length,position:{x:q.player.pos.x,z:q.player.pos.z},enemies:q.monsters.filter(m=>!m.dead).length,placement:q.place.kind?{valid:q.place.valid,reason:q.place.reason}:null};});
 const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
 const event=async name=>{const value=await snap();report.events.push({name,at:new Date().toISOString(),...value});console.log(name,JSON.stringify(value));save();};
 async function build(name){await p.keyboard.press('KeyL');await p.locator('#buildGrid .shopItem').filter({hasText:name}).first().click();
  for(let i=0;i<6;i++){await p.waitForTimeout(200);if((await snap()).placement?.valid)break;const key=i%2?'KeyA':'KeyW';await p.keyboard.down(key);await p.waitForTimeout(900);await p.keyboard.up(key);}
  const before=await snap();if(before.placement?.valid){await p.click('#placeOk');await p.waitForTimeout(150);const after=await snap();assert.equal(after.buildings,before.buildings+1,'Actual place control must add a building');assert(after.gold<before.gold,'Construction must spend gold');await event('Built '+name);}else await event('Placement blocked: '+name);
  await p.click('#placeCancel');}
 try{await p.goto(url);await p.waitForFunction(()=>window.__ccReady&&window.__gameQA);await p.click('#btnStart');await p.waitForFunction(()=>window.__gameQA.Game.state==='prep');await event('New normal game');await p.screenshot({path:path.join(out,'new-game.png')});
  await build('围墙');await p.click('#readyBtn');await event('Wave 1 started');const started=Date.now();let lastLevel=1,purchases=false;
  while(Date.now()-started<duration){await p.waitForTimeout(10000);const s=await snap();report.samples.push({elapsedMs:Date.now()-started,...s});save();
   if(s.state==='over'){await event('Game over');await p.screenshot({path:path.join(out,'game-over.png')});break;}
   if(s.state==='prep'&&s.level!==lastLevel){lastLevel=s.level;await event('Next wave preparation');await p.screenshot({path:path.join(out,'wave-'+lastLevel+'-prep.png')});
    if(!purchases&&s.gold>=700){await p.keyboard.press('KeyO');await p.click('#shopTabs [data-t="squad"]');const before=await snap();await p.locator('#shopGrid .shopItem').filter({hasText:'机枪兵'}).first().click();await p.click('#shopClose');await p.waitForTimeout(4500);const after=await snap();assert.equal(after.squadCount,before.squadCount+1,'Actual hire control must reserve a squad member');assert(after.gold<before.gold,'Hiring must spend gold');await event('Hired first squad member');await build('自动机枪塔');purchases=true;}
    await p.click('#readyBtn');await event('Wave '+lastLevel+' started');}
  }
  await event('Opening observation ended');if(['battle','prep'].includes((await snap()).state)){await p.keyboard.press('Escape');await p.click('#btnQuit');await p.click('#btnContinue');await p.waitForTimeout(500);await event('Continued after returning to title');assert.notEqual((await snap()).state,'menu');}
  assert.deepEqual(report.errors,[]);report.finished=new Date().toISOString();report.status='observed';await p.screenshot({path:path.join(out,'final.png')});
 }finally{save();await ctx.close();await b.close();}
})().catch(e=>{report.status='failed';report.failure=e.message;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.error(e);process.exitCode=1;});

// Real menu/navigation/input smoke tests. Read-only QA snapshots do not drive game state.
// This is an entry and interaction audit, not proof of full completion or human enjoyment.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.FOCUS_BASE||'http://127.0.0.1:8784/html/game/';
const out=process.env.FOCUS_OUT||path.join(require('node:os').tmpdir(),'game-mode-focus');
const results=[];
async function snapshot(p){return p.evaluate(()=>{const q=window.__gameQA;return {state:q?.Game.state,chapter:q?.Game.chapter,level:q?.Game.level,gold:q?.Game.gold,player:q?{x:q.player.pos.x,z:q.player.pos.z,hp:q.player.hp}:null,war:q?.resistanceCampaign?.state.active?{chapter:q.resistanceCampaign.state.chapter,phase:q.resistanceCampaign.state.phase,ammo:q.resistanceCampaign.state.ammo,position:q.resistanceCampaign.state.player.root.position}:null,visibleText:document.body.innerText.slice(-7000)};});}
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});try{
 for(const [width,height] of [[1280,580],[844,346],[390,844]]){
  const c=await b.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'gunfire-assembly/index.html?qa=1');await p.waitForFunction(()=>window.__ccReady);
  assert(!/大灾变|大逃杀|躲猫猫|即将开放/.test(await p.locator('#menuMain').innerText()));
  assert.equal(await p.locator('#btnVersus').isVisible(),false);
  await p.screenshot({path:path.join(out,`gunfire-${width}x${height}.png`)});
  await p.locator('#btnPingan').focus();await p.keyboard.press('Enter');await p.waitForURL('**/pingan/index.html');
  await p.waitForFunction(()=>!!document.querySelector('#menu'));assert(await p.locator('#menu').isVisible());
  // Follow the actual return-to-lobby control of the packaged chapter.
  const back=p.getByRole('button',{name:/返回.*大厅/});
  if(await back.count())await back.click();else await p.getByRole('link',{name:/返回.*大厅/}).click();
  await p.waitForURL('**/gunfire-assembly/index.html');await p.waitForFunction(()=>window.__ccReady);
  await p.locator('#earlyGunfire summary').focus();await p.keyboard.press('Enter');assert(await p.locator('#btnVersus').isVisible());assert(await p.locator('#menuMain').isVisible());
  await p.click('#btnVersus');assert(await p.locator('#vsMenu').isVisible());await p.click('#vsMenuBack');
  await p.click('#btnResistance');assert.match(await p.locator('[data-chapter="0"]').innerText(),/早期体验/);assert.match(await p.locator('[data-chapter="1"]').innerText(),/早期体验/);assert.match(await p.locator('[data-chapter="2"]').innerText(),/推荐.*重做版/);
  await p.click('#warBack');assert.deepEqual(errors,[]);results.push({game:'gunfire',viewport:[width,height],status:'passed',checks:['hidden future modes','direct Pingan menu and actual return','keyboard fold without accidental start','battlefield menu','chapter maturity labels'],limitations:['browser simulation; physical phone not tested']});await c.close();
 }
 const modes=[
  ['starship-defense','bank',['#earlyModes summary','#btnBankVersus','#btnModeStart','[data-vs-ai="normal"]']],
  ['starship-defense','rv',['#earlyModes summary','#btnRV','#btnModeStart','#rvStart']],
  ['starship-defense','zerg',['#earlyModes summary','#btnZerg','#btnModeStart','#zergStart']],
  ['starship-defense','acid',['#earlyModes summary','#btnAcid','#btnModeStart','#acidStart']],
  ['gunfire-assembly','war1',['#btnResistance','[data-chapter="0"]']],
  ['gunfire-assembly','war2',['#btnResistance','[data-chapter="1"]']],
  ['gunfire-assembly','battlefield',['#earlyGunfire summary','#btnVersus','[data-vs-ai="normal"]']]
 ];
 for(const [slug,mode,steps] of modes){
  const c=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:path.join(out,'video'),size:{width:1280,height:720}}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  try{await p.goto(base+slug+'/index.html?qa=1');await p.waitForFunction(()=>window.__ccReady);for(const selector of steps)await p.click(selector);await p.waitForTimeout(700);
   const before=await snapshot(p);await p.keyboard.down('KeyW');await p.waitForTimeout(1100);await p.keyboard.up('KeyW');await p.keyboard.down('KeyJ');await p.waitForTimeout(1300);await p.keyboard.up('KeyJ');await p.keyboard.press('KeyI');await p.keyboard.press('KeyK');await p.waitForTimeout(500);const after=await snapshot(p);
   await p.screenshot({path:path.join(out,mode+'-play.png')});assert.notEqual(after.state,'menu');assert.deepEqual(errors,[]);
   await p.keyboard.press('Escape');assert(await p.locator('#menuPause').isVisible());await p.click('#btnResume');assert.equal(await p.locator('#menuPause').isVisible(),false);await p.keyboard.press('Escape');await p.click('#btnQuit');assert(await p.locator('#menuMain').isVisible());
   results.push({game:slug,mode,status:'entry_actions_return_passed',method:'real menu clicks, W/J/I/K, pause/resume/quit; QA state read only',before,after,fullCompletion:'not_established',errors});console.log(mode+' entry/actions/return passed');
  }catch(e){await p.screenshot({path:path.join(out,mode+'-failure.png')});results.push({game:slug,mode,status:'failed',error:e.message,errors});throw e;}finally{await c.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base,results},null,2));}
 }
}finally{await b.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({base,results},null,2));}})().catch(e=>{console.error(e);process.exitCode=1;});

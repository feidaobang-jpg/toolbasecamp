// Exercise the real Toy host and its game iframe without changing the preview package.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const url=process.env.TOY_PREVIEW;
if(!url)throw Error('Set TOY_PREVIEW to the CLI preview URL');
const output=path.join(__dirname,'media-kit/releases/web-operations-v0.13.0/toy');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});const results=[];fs.mkdirSync(output,{recursive:true});
 try{for(const mobile of [false,true]){
  const p=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.goto(url);
  await p.waitForFunction(()=>document.querySelector('iframe'));
  const frame=await p.locator('iframe').first().contentFrame();await frame.locator('#btnStart').waitFor({state:'visible'});
  await frame.locator('#btnStart').click();await frame.locator('#hud').waitFor({state:'visible'});
  if(mobile){await frame.locator('#vP').click();await frame.locator('#opsPause').click();}else await frame.locator('#opsButton').click();
  const names=[];for(let i=0;i<3;i++){names.push(...await frame.locator('[data-operation]').evaluateAll(a=>a.map(x=>x.dataset.operation)));if(i<2)await frame.getByRole('button',{name:'下一页',exact:true}).click();}
  assert.equal(new Set(names).size,9);assert.equal(await frame.locator('[data-operation="mother"]').isDisabled(),true);
  await p.screenshot({path:path.join(output,mobile?'mobile-list.png':'desktop-list.png')});
  for(let i=0;i<2;i++)await frame.getByRole('button',{name:'上一页',exact:true}).click();
  await frame.locator('[data-operation="signal"]').click();await frame.locator('#waveTxt').filter({hasText:'信标守夜'}).waitFor();
  await p.screenshot({path:path.join(output,mobile?'mobile-mission.png':'desktop-mission.png')});
  await frame.locator(mobile?'#vP':'#menuButton').click();await frame.locator('#menuPause').waitFor({state:'visible'});await frame.locator('#opsPause').click();
  await frame.getByRole('button',{name:'撤离副本，返回基地（无通关奖励）',exact:true}).click();await frame.locator('#readyBtn').waitFor({state:'visible'});
  assert.equal(errors.length,0);results.push({mobile,names,started:'signal',withdrawn:true,menu:true,errors});console.log('PASS Toy '+(mobile?'mobile':'desktop')+' nine missions, chapter locks, start, pause and withdrawal');await p.close();
 }
 fs.writeFileSync(path.join(output,'preview-verification.json'),JSON.stringify({url,results},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

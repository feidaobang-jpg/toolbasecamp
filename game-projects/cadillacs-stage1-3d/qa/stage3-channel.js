// 同一渠道包QA：Toy预览壳或已解压TapTap ZIP；第三关驾驶及横竖控件。
const fs=require('fs');const {launch,out,sleep}=require('./lib');let b;
(async()=>{const url=process.argv[2],channel=process.argv[3]||'toy',results=[],errors=[],failed=[];
b=await launch();const check=(name,pass,data)=>{results.push({name,pass:!!pass,data});console.log(pass?'PASS':'FAIL',name,JSON.stringify(data??''));};
for(const size of [[1280,720],[844,390],[390,844]]){
 const p=await b.newPage({viewport:{width:size[0],height:size[1]},hasTouch:size[0]<1000,isMobile:size[0]<1000});p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&/sounds|game.min/.test(r.url()))failed.push(r.url());});
 if(channel==='taptap')await p.route('**/*.js*',r=>r.abort());
 await p.goto(url);await sleep(channel==='toy'?4000:1500);let f=p;
 if(channel==='toy'){f=p.frames().find(f=>/bilibilitoy\.com/.test(f.url()));check(size+'预览游戏载入',!!f);if(!f)continue;let u=new URL(f.url());u.searchParams.set('test','1');await f.goto(u.href);await sleep(2200);f=p.frames().find(f=>/bilibilitoy\.com/.test(f.url()));}
 await f.waitForFunction(()=>!!window.__CD_TEST__);
 check(size+'版本v0.10.0',await f.evaluate(()=>__CD_TEST__.version==='v0.10.0'));
 await f.locator('[data-opt=stage]').click();await f.locator('[data-opt=stage]').click();
 await f.locator('[data-act=select]').first().click();await f.locator('#sel-go').click();await f.waitForFunction(()=>__CD_TEST__.snapshot().stage===3&&__CD_TEST__.snapshot().mode==='play');
 check(size+'菜单实际进入第三关',await f.evaluate(()=>__CD_TEST__.snapshot().areaId==='hellroad'));
 await f.evaluate(()=>{const C=__CD_TEST__.cheat,G=C.G;G.pending=[];C.killAll();G.waveOn=false;G.wave=1;G.road.called=true;});await f.waitForFunction(()=>__CD_TEST__.snapshot().road.mounted);
 const snap=()=>f.evaluate(()=>__CD_TEST__.snapshot());let s=await snap();check(size+'叫车后真实驾驶',s.road.mounted&&s.player.state==='incar');
 if(size[0]<1000){await f.locator('#btn-run').click();await sleep(100);s=await snap();check(size+'手机I加速',s.road.boost>0);await f.locator('#btn-pause').click();}else{await f.locator('#app').click({position:{x:450,y:90}});await p.keyboard.press('KeyI');await sleep(100);s=await snap();check(size+'键盘I加速',s.road.boost>0);await p.keyboard.press('Escape');}
 s=await snap();const x=s.road.x;await sleep(300);check(size+'暂停保留车辆进度',(await snap()).road.x===x);await f.locator('#pause [data-control-mode=show]').click();await f.locator('[data-act=resume]').click();
 check(size+'切手机模式保留车辆',await f.locator('#btn-atk').isVisible()&&(await snap()).road.mounted);
 await f.locator('#btn-mega').click();await f.waitForFunction(()=>!__CD_TEST__.snapshot().road.mounted);check(size+'U下车恢复步行',await f.locator('#btn-atk span').innerText()==='攻击');
 check(size+'三首新音乐完整可取',await f.evaluate(async()=>{const r=await Promise.all(['road-walk','road-drive','boss3'].map(async n=>{const x=await fetch('sounds/'+n+'.mp3');return x.ok&&(await x.arrayBuffer()).byteLength>1000000;}));return r.every(Boolean);}));
 await p.screenshot({path:out('stage3-'+channel+'-'+size.join('x')+'.png')});await p.close();
}
check('渠道游戏无异常或声音404',!errors.length&&!failed.length,{errors,failed});fs.writeFileSync(out('stage3-'+channel+'-qa.json'),JSON.stringify({url,channel,method:'Actual channel package in Edge. TapTap tested after extraction, all independent JS requests blocked. Phone is viewport simulation. Opening kills and radio request use fixture.',results},null,2));await b.close();if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(async e=>{console.error(e);if(b)await b.close();process.exitCode=1;});

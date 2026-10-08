// 两关回退的实际渠道验收；TapTap 使用将上传的 ZIP 解压包，屏蔽独立 JS。
const fs=require('fs');const {launch,out,sleep}=require('./lib');let b;
(async()=>{const url=process.argv[2],channel=process.argv[3]||'toy',results=[],errors=[];
b=await launch();const check=(name,pass,data)=>{results.push({name,pass:!!pass,data});console.log(pass?'PASS':'FAIL',name,JSON.stringify(data??''));};
for(const size of [[1280,720],[844,390],[390,844]]){
 const p=await b.newPage({viewport:{width:size[0],height:size[1]},hasTouch:size[0]<1000,isMobile:size[0]<1000});p.on('pageerror',e=>errors.push(e.message));
 if(channel==='taptap')await p.route('**/*.js*',r=>r.abort());
 await p.goto(url);await sleep(channel==='toy'?4000:1500);let f=p;
 if(channel==='toy'){f=p.frames().find(f=>/bilibilitoy\.com/.test(f.url()));check(size+'游戏载入',!!f);if(!f)continue;let u=new URL(f.url());u.searchParams.set('test','1');await f.goto(u.href);await sleep(2200);}
 await f.waitForFunction(()=>!!window.__CD_TEST__);
 check(size+'回退版本',await f.evaluate(()=>__CD_TEST__.version==='v0.10.1'));
 await f.locator('[data-opt=stage]').click();check(size+'菜单可选第二关',/第二关/.test(await f.locator('[data-opt=stage]').textContent()));
 await f.locator('[data-opt=stage]').click();check(size+'下一项回第一关',/第一关/.test(await f.locator('[data-opt=stage]').textContent()));
 await f.locator('[data-opt=stage]').click();await f.locator('[data-act=select]').first().click();await f.locator('#sel-go').click();await f.waitForFunction(()=>__CD_TEST__.snapshot().stage===2&&__CD_TEST__.snapshot().mode==='play',{timeout:20000});
 check(size+'第二关实际开局',await f.evaluate(()=>__CD_TEST__.snapshot().areaId==='forest'));
 await f.locator('#btn-pause').click();await f.locator('#pause [data-control-mode=show]').click();await f.locator('[data-act=resume]').click();
 check(size+'切触屏并继续保留第二关',await f.locator('#btn-atk').isVisible()&&await f.evaluate(()=>__CD_TEST__.snapshot().stage===2));
 await f.locator('#btn-jump').click();await sleep(100);check(size+'实际跳跃',await f.evaluate(()=>__CD_TEST__.snapshot().player.y>0));
 await f.locator('#btn-pause').click();await f.locator('#pause [data-act=restart]').click();await f.waitForFunction(()=>__CD_TEST__.snapshot().stage===2);
 check(size+'重玩仍是第二关',await f.evaluate(()=>__CD_TEST__.snapshot().areaId==='forest'));
 await p.screenshot({path:out('rollback-'+channel+'-'+size.join('x')+'.png')});await p.close();
}
check('无脚本异常',!errors.length,errors);fs.writeFileSync(out('rollback-'+channel+'-qa.json'),JSON.stringify({url,channel,method:'Edge 实际包三视口模拟；非手机真机。TapTap 屏蔽独立 JS 请求。',results},null,2));await b.close();if(results.some(x=>!x.pass))process.exitCode=1;
})().catch(async e=>{console.error(e);if(b)await b.close();process.exitCode=1;});

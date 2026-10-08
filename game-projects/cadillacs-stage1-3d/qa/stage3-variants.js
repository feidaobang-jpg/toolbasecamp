// 第三关边界：不叫车、车毁、限时死亡、跨关与驾驶时切操作模式。
const fs=require('fs');const {launch,BASE,out,sleep}=require('./lib');let b;
(async()=>{
 b=await launch();const p=await b.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true}),results=[],errors=[];
 p.on('pageerror',e=>errors.push(e.message));const T=(fn,a)=>p.evaluate(fn,a),S=()=>T(()=>__CD_TEST__.snapshot()),step=n=>T(n=>__CD_TEST__.step(n,true),n);
 const check=(name,ok,detail)=>{results.push({name,pass:!!ok,detail});console.log(ok?'PASS':'FAIL',name,JSON.stringify(detail??''));};
 await p.goto(BASE+'?test=1&area=6&seed=84&q=low');await sleep(1200);await p.locator('[data-act=select]').first().click();await p.keyboard.press('Enter');await sleep(200);await T(()=>__CD_TEST__.manual(true));
 const clear=()=>T(()=>{const C=__CD_TEST__.cheat,G=C.G;G.pending=[];C.killAll();G.wave=1;G.waveOn=false;G.lockX=null;});
 await clear();await T(()=>{const G=__CD_TEST__.cheat.G;G.player.x=25;G.player.z=0;G.focusX=25;});await step(1);
 let s=await S();check('不捡无线电可走步行路线',s.road.phase==='foot'&&!s.road.mounted);
 await p.keyboard.down('KeyD');await step(20);await p.keyboard.up('KeyD');check('步行路线可正常移动',(await S()).player.x>s.player.x);
 await T(()=>__CD_TEST__.cheat.area(6));await clear();await T(()=>__CD_TEST__.cheat.G.road.called=true);await step(150);s=await S();
 check('手机叫车与驾驶能运行',s.road.mounted,s.road);
 const clock=s.t;
 await T(()=>document.querySelector('#pause [data-control-mode=hide]').click());await step(1);check('切电脑模式保持驾驶进度',(await S()).road.mounted&&(await S()).t>=clock&&(await S()).ui.touchHidden);
 await T(()=>document.querySelector('#pause [data-control-mode=show]').click());await step(1);check('切回触屏保留车辆',!(await S()).ui.touchHidden&&(await S()).road.mounted);
 // 夹具：只降低车耐久并安排真实碰撞，核验爆炸、全队下车与后续正常攻击。
 await T(()=>{const G=__CD_TEST__.cheat.G;G.road.hp=1;G.road.x=100;G.road.baseX=100;G.road.spawnAt=99;G.road.spawnN=2;});await step(1);
 await T(()=>{const G=__CD_TEST__.cheat.G,barrel=G.props.find(p=>p.roadObstacle);G.road.x=barrel.x;G.road.baseX=barrel.x;G.road.z=barrel.z;G.road.invul=0;});await step(1);s=await S();
 check('车毁后下车继续，无软锁',s.road.hp===0&&!s.road.mounted&&s.road.phase==='foot'&&s.player.hp>0);
 await p.keyboard.down('KeyJ');await step(3);await p.keyboard.up('KeyJ');s=await S();check('车毁后恢复拳脚输入',['attack','grab'].includes(s.player.state),s.player.state);
 await T(()=>__CD_TEST__.cheat.area(6));await clear();await T(()=>__CD_TEST__.cheat.G.road.called=true);await step(150);
 await T(()=>__CD_TEST__.cheat.G.timer=.001);await step(2);s=await S();check('驾驶超时先下车再死亡',!s.road.mounted&&s.player.hp===0,s.player.state);
 await step(250);s=await S();check('无限命超时后可复活继续',s.player.hp===100&&s.player.state!=='incar');
 // 夹具：第二关Boss残血，仍由真实J拳脚触发第三关衔接。
 await T(()=>{const C=__CD_TEST__.cheat,G=C.G;C.area(5);G.mode='play';G.pending=[];C.killAll();G.waveOn=false;G.wave=99;G.focusX=42;G.player.x=43;G.player.z=0;G.lockX=null;});await step(5);
 await T(()=>__CD_TEST__.cheat.skipScript());await step(5);
 await T(()=>{const G=__CD_TEST__.cheat.G,b=G.boss,p=G.player;b.hp=1;b.invul=0;b.state='idle';b.cd=99;p.x=b.x-.9;p.z=b.z;p.face=Math.PI/2;p.state='idle';});
 for(let i=0;i<10;i++){await p.keyboard.down('KeyJ');await step(10);await p.keyboard.up('KeyJ');await step(10);if((await S()).mode==='clear')break;}
 for(let i=0;i<100;i++){await step(15);if((await S()).areaId==='hellroad')break;}
 s=await S();check('第二关胜利自动接第三关',s.areaId==='hellroad'&&s.cleared.includes(2)&&s.ui.overlay===null,[s.areaId,s.cleared]);
 await p.setViewportSize({width:390,height:844});await step(2);
 check('第三关竖屏旋转后触屏按钮可达',await p.locator('#btn-atk').isVisible()&&(await S()).ui.display.rotated);await p.screenshot({path:out('stage3-mobile-portrait.png')});
 check('变体无浏览器异常',errors.length===0,errors);
 fs.writeFileSync(out('stage3-variants.json'),JSON.stringify({method:'Edge phone viewport simulation, real input with explicitly documented boundary fixtures; not a real phone',results,errors},null,2));await b.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(async e=>{console.error(e);if(b)await b.close();process.exitCode=1;});

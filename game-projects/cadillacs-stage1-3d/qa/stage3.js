// 第三关功能回归。真实键盘/按钮输入；跳过旧战斗与定点碰撞的夹具明确标记。
const fs=require('fs');
const {launch,BASE,out,sleep}=require('./lib');
let browser;
(async()=>{
 browser=await launch();const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],results=[];
 page.on('pageerror',e=>errors.push(e.message));
 const T=(fn,arg)=>page.evaluate(fn,arg),S=()=>T(()=>__CD_TEST__.snapshot()),step=n=>T(n=>__CD_TEST__.step(n,true),n);
 const check=(name,ok,detail)=>{results.push({name,pass:!!ok,detail});console.log(ok?'PASS':'FAIL',name,JSON.stringify(detail??''));};
 const key=async(code,n=2)=>{await page.keyboard.down(code);await step(n);await page.keyboard.up(code);await step(2);};
 const until=async(pred,frames=600)=>{for(let n=0;n<frames;n+=10){const s=await S();if(pred(s))return s;await step(10);}return S();};
 await page.goto(BASE+'?test=1&seed=37&q=high');await sleep(1500);
 await page.locator('[data-opt=stage]').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
 check('键盘直接选第三关',/第三关.*地狱公路/.test(await page.locator('[data-opt=stage]').textContent()));
 check('保存第三关选择',await T(()=>localStorage.getItem('cd3d-stage1:stage'))==='2');
 await page.reload();await sleep(1100);check('刷新保留选关',/第三关/.test(await page.locator('[data-opt=stage]').textContent()));
 await page.locator('[data-act=select]').first().click();await page.keyboard.press('Enter');await sleep(300);await T(()=>__CD_TEST__.manual(true));
 let s=await S();check('第三关实际开局',s.stage===3&&s.areaId==='hellroad',s.road);
 await step(160);
 // 夹具：清掉开场敌人，保留真实掉落与拾取行为。
 await T(()=>__CD_TEST__.cheat.killAll());s=await until(s=>s.road.phase==='radio');
 check('开场清敌后无线电掉落',await T(()=>__CD_TEST__.cheat.G.items.some(i=>i.kind==='radio')));
 await T(()=>{const G=__CD_TEST__.cheat.G,i=G.items.find(i=>i.kind==='radio');G.player.x=i.x;G.player.z=i.z;G.player.state='idle';});await step(20);await key('KeyJ',5);
 s=await until(s=>s.road.mounted,300);check('J拾无线电并坐上凯迪拉克',s.road.mounted,s.road);
 check('驾驶动作标签',await page.locator('#btn-jump span').textContent()==='刹车');
 const z0=s.road.z;await key('KeyW',25);s=await S();check('方向键实际转向',s.road.z<z0-.4,[z0,s.road.z]);
 await key('KeyI',2);s=await S();check('I加速',s.road.speed>10,s.road.speed);
 await page.keyboard.down('KeyK');await step(12);s=await S();check('K刹车降低速度',s.road.speed<4,s.road.speed);await page.keyboard.up('KeyK');
 await page.screenshot({path:out('stage3-driving.png')});
 await page.keyboard.press('Escape');const time=(await S()).t;await step(120);check('暂停冻结公路与音频',(await S()).t===time&&(await S()).ui.paused);
 await page.keyboard.press('Escape');await step(2);
 const before=s.road.hp;
 // 夹具：沿现有公路油桶的碰撞路线撞上，不直接改血量。
 await T(()=>{const G=__CD_TEST__.cheat.G;G.road.baseX=100;G.road.x=100;G.road.z=0;G.road.spawnAt=99;G.road.spawnN=2;});await step(1);
 await T(()=>{const G=__CD_TEST__.cheat.G,p=G.props.find(p=>p.roadObstacle);G.road.baseX=p.x;G.road.x=p.x;G.road.z=p.z;G.road.invul=0;});await step(1);s=await S();
 check('油桶碰撞扣车辆耐久',s.road.hp<before,s.road.hp);
 // 夹具：进入Boss路程。投雷、预警、碰撞与结算仍走真实逻辑。
 await T(()=>{const G=__CD_TEST__.cheat.G;G.road.x=286;G.road.baseX=286;G.road.z=0;});await step(2);s=await S();
 check('霍格摩托Boss登场',s.boss?.type==='hogg',s.boss);
 await step(180);check('投雷有实际落点与爆炸',await T(()=>__CD_TEST__.events().some(e=>e.type==='hoggGrenadeExplosion')));
 await page.screenshot({path:out('stage3-hogg.png')});
 const bhp=(await S()).boss.hp;
 await T(()=>{const G=__CD_TEST__.cheat.G;G.road.x=G.road.baseX+3;G.road.z=G.boss.z;G.boss.roadClock=1;G.boss.ramCd=0;});await key('KeyJ',2);
 s=await S();check('驾驶撞击真实扣Boss血量',s.boss.hp<bhp,[bhp,s.boss.hp]);
 await key('KeyU',2);s=await S();check('U下车后仍可战斗',!s.road.mounted&&s.player.state!=='incar',s.player.state);
 check('下车恢复动作标签',await page.locator('#btn-jump span').textContent()==='跳跃');
 await step(190);check('步行Boss战有持枪援兵',await T(()=>__CD_TEST__.cheat.G.actors.some(a=>a.type==='poacher'&&a.weapon?.kind==='rifle')));
 // 夹具：降低Boss血量，使用真实拳脚完成收尾。
 await T(()=>{const G=__CD_TEST__.cheat.G,h=G.boss,p=G.player;h.hp=1;h.grenadeCd=99;h.roadClock=1;h.invul=0;p.x=G.focusX+3.4;p.z=h.z;p.face=Math.PI/2;p.state='idle';p.invul=5;});
 for(let i=0;i<15;i++){await key('KeyJ',8);s=await S();if(s.mode==='clear')break;await T(()=>{const G=__CD_TEST__.cheat.G,p=G.player,h=G.boss;p.x=h.x-.9;p.z=h.z;p.face=Math.PI/2;h.invul=0;});}
 s=await until(s=>s.mode==='clear');check('击败霍格计入第三关通关',s.cleared.includes(3),s.cleared);
 s=await until(s=>s.ui.overlay==='result',1400);check('第三关结算完整显示',s.ui.overlay==='result'&&/第三关完成/.test(await page.locator('#res-title').textContent()));
 check('结算包含霍格',/霍格/.test(await page.locator('#tally').textContent()));await page.screenshot({path:out('stage3-result.png')});
 await page.keyboard.press('Enter');await step(2);s=await S();check('再玩一次仍从第三关开始',s.stage===3&&s.road.phase==='opening');
 check('没有浏览器异常',errors.length===0,errors);
 fs.writeFileSync(out('stage3.json'),JSON.stringify({method:'Edge real keyboard and DOM actions with explicit combat/distance fixtures; desktop simulation',results,errors},null,2));
 await browser.close();if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1;});

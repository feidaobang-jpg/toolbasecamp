// v0.17.14 队友跟随 AI 与载具枪口回归。
// 玩家反馈：①「明明点了跟随，还要我一步一步带他们走」「突击兵总是先掉血、先卡住」②「驾驶载具有 bug，射击不是从贴图上面射」。
// 运行：GAME_URL=http://127.0.0.1:8878/html/game/starship-defense/index.html node verify-squad-follow.cjs
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const outDir=path.join(__dirname,process.env.OUT_DIR||'media-kit/releases/web-squad-follow-v0.17.14/evidence');
const url=process.env.GAME_URL||'http://127.0.0.1:8878/html/game/starship-defense/index.html';
const checks=[];const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log((ok?'PASS ':'FAIL ')+name+' :: '+JSON.stringify(detail));};

(async()=>{
fs.mkdirSync(outDir,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const ctx=await b.newContext({viewport:{width:1280,height:720}}),p=await ctx.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));
await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
await p.keyboard.press('Enter');await p.waitForTimeout(500);

// 通用：把炮管尖端算出来（沿枪管最长轴伸出半支枪管）
await p.evaluate(()=>{
  window.__tipOf=(gun)=>{
    if(!gun)return null;
    gun.updateWorldMatrix(true,false);
    const bb=gun.geometry.boundingBox||(gun.geometry.computeBoundingBox(),gun.geometry.boundingBox);
    const size=bb.max.clone().sub(bb.min),c=bb.max.clone().add(bb.min).multiplyScalar(.5);
    const VC=size.constructor;let ax;
    if(size.z>=size.x&&size.z>=size.y)ax=new VC(c.x,c.y,c.z+size.z/2);
    else if(size.y>=size.x)ax=new VC(c.x,c.y+size.y/2,c.z);
    else ax=new VC(c.x+size.x/2,c.y,c.z);
    ax.applyQuaternion(gun.getWorldQuaternion(gun.quaternion.clone()));
    return gun.getWorldPosition(gun.position.clone()).add(ax);
  };
});

// ---------- 1) 玩家跑开后停下，队友自己追上来 ----------
const ROLE_CN={gunner:'机枪兵',assault:'突击兵',medic:'医疗兵',engineer:'工程兵'};
let data=await p.evaluate(()=>{
  const q=window.__gameQA,step=.05/3;
  q.newGame(false);q.clearEntities(false);q.Game.state='battle';q.squad.length=0;
  ['gunner','assault','medic','engineer'].forEach((r,i)=>{q.squadGear(i).role=r;q.spawnSquad(i);});
  const gy=(x,z)=>q.groundY(x,z);
  q.player.pos.set(0,gy(0,10),10);q.player.mesh.position.copy(q.player.pos);
  q.squad.forEach((s,i)=>{s.mesh.position.set(-9+i*6,gy(-9+i*6,12),12);});
  // 玩家以 11 m/s（跑步）沿 +z 持续前进 8 秒：这段是玩家真实体验里"要回头带路"的时刻
  for(let i=0;i<8/.05;i++){const z=10+11*i*.05;q.player.pos.set(0,gy(0,z),z);q.player.mesh.position.copy(q.player.pos);for(let k=0;k<3;k++)q.updSquad(step);}
  const roleOf=s=>q.squadGear(s.slot).role;
  const gapAtStop=q.squad.map(s=>({slot:s.slot,role:roleOf(s),d:+Math.hypot(s.mesh.position.x-q.player.pos.x,s.mesh.position.z-q.player.pos.z).toFixed(1)}));
  // 玩家停下后 6 秒（不回头带路）
  for(let i=0;i<6/.05;i++)for(let k=0;k<3;k++)q.updSquad(step);
  const gapAfter=q.squad.map(s=>({slot:s.slot,role:roleOf(s),d:+Math.hypot(s.mesh.position.x-q.player.pos.x,s.mesh.position.z-q.player.pos.z).toFixed(1)}));
  return{gapAtStop,gapAfter,playerZ:+q.player.pos.z.toFixed(1)};
});
{
  const worstMoving=Math.max(...data.gapAtStop.map(g=>g.d));
  const worst=Math.max(...data.gapAfter.map(g=>g.d));
  check('玩家持续奔跑时队友紧跟不掉队（移动中最大间距≤20m）',worstMoving<=20,{worstMoving,gapAtStop:data.gapAtStop});
  check('队友自行追上跑开的玩家（停步6秒后全部≤10m）',worst<=10,{worst,gapAfter:data.gapAfter});
}
await p.screenshot({path:path.join(outDir,'formation-follow.png')});

// ---------- 2) 被墙挡住时绕行，不原地顶墙 ----------
data=await p.evaluate(()=>{
  const q=window.__gameQA,step=.05/3;
  q.newGame(false);q.clearEntities(false);q.Game.state='battle';q.squad.length=0;q.spawnSquad();
  const s=q.squad[0],gy=(x,z)=>q.groundY(x,z);
  q.player.pos.set(0,gy(0,40),40);q.player.mesh.position.copy(q.player.pos);
  for(const x of[-8,-4,0,4,8])q.placeBuilding('wall',x,20,0);
  s.mesh.position.set(0,gy(0,10),10);s.stuck=0;
  const before={x:s.mesh.position.x,z:s.mesh.position.z};
  for(let i=0;i<9/.05;i++)for(let k=0;k<3;k++)q.updSquad(step);
  return{before:{x:+before.x.toFixed(1),z:+before.z.toFixed(1)},after:{x:+s.mesh.position.x.toFixed(1),z:+s.mesh.position.z.toFixed(1)},
    crossed:s.mesh.position.z>24,d:+Math.hypot(s.mesh.position.x-q.player.pos.x,s.mesh.position.z-q.player.pos.z).toFixed(1)};
});
check('墙挡住去路时绕行到玩家一侧（9秒内越过防线并贴近）',data.crossed&&data.d<=13,data);

// ---------- 3) 连续近战有受击恢复窗口 ----------
data=await p.evaluate(()=>{
  const q=window.__gameQA;
  q.newGame(false);q.clearEntities(false);q.Game.state='battle';q.squad.length=0;
  ['gunner','assault','medic','engineer'].forEach((r,i)=>{q.squadGear(i).role=r;q.spawnSquad(i);});
  const s=q.squad.find(o=>q.squadGear(o.slot).role==='assault')||q.squad[1];
  s.hp=s.maxHp;const hp=s.hp;
  q.damageSquad(s,10);q.damageSquad(s,10);q.damageSquad(s,10);
  const later=s.hp;
  // 恢复窗口过后仍能正常受伤（不是永久无敌）
  s.hitInvuln=0;q.damageSquad(s,10);
  return{maxHp:s.maxHp,lost:+(hp-later).toFixed(2),after:+(later-s.hp).toFixed(2)};
});
check('同一瞬间的三发近战只结算约一发（受伤短无敌）',data.lost<=12.5&&data.lost>=9,data);
check('恢复窗口结束后仍能继续受伤',data.after>=9&&data.after<=12.5,data);

// ---------- 4) 混战伤害分摊，突击兵不再单人先倒下 ----------
data=await p.evaluate(()=>{
  const q=window.__gameQA;
  q.newGame(false);q.clearEntities(false);q.Game.state='battle';q.squad.length=0;
  ['gunner','assault','medic','engineer'].forEach((r,i)=>{q.squadGear(i).role=r;q.spawnSquad(i);});
  const gy=(x,z)=>q.groundY(x,z);
  q.player.pos.set(0,gy(0,10),10);q.player.mesh.position.copy(q.player.pos);
  q.squad.forEach((s,i)=>{s.mesh.position.set([-4,3,-1,6][i],gy([-4,3,-1,6][i],13),13);s.startHp=s.hp;s.role=q.squadGear(s.slot).role;});
  for(let i=0;i<7;i++)q.spawnMonster('mob',-12+i*4,24);
  for(let i=0;i<10/.05;i++){for(let k=0;k<3;k++)q.updSquad(.05/3);q.updMonsters(.05);}
  const rows=q.squad.map(s=>({role:s.role,name:{gunner:'机枪兵',assault:'突击兵',medic:'医疗兵',engineer:'工程兵'}[s.role],lost:+((s.startHp||0)-s.hp).toFixed(1),hpPct:+(s.hp/s.maxHp*100).toFixed(0)}));
  const total=rows.reduce((a,r)=>a+Math.max(0,r.lost),0);
  return{total,rows:rows.map(r=>({...r,pct:total?+(r.lost/total*100).toFixed(1):0})),alive:q.squad.length,monstersLeft:q.monsters.filter(m=>!m.dead).length};
});
{
  const assault=data.rows.find(r=>r.role==='assault');
  const worst=Math.max(...data.rows.map(r=>r.pct),0);
  const hurt=data.rows.filter(r=>r.lost>0).length;
  check('10秒混战伤害分摊（至少两名队友承伤，突击兵占比≤55%）',assault&&assault.pct<=55&&worst<=55&&hurt>=2,data);
  check('突击兵没有先阵亡',assault&&assault.hpPct>0,data);
}

// ---------- 5) 驾驶载具：子弹从炮管口射出（真实按键 + 游戏主循环） ----------
// 记录器挂在 bullets.push 上：开火瞬间就比对"弹丸起点 vs 当时炮口位置"，车在跑也不会误判。
await p.evaluate(()=>{
  const q=window.__gameQA,push=Array.prototype.push;
  const V=(x,y,z)=>({x,y,z,normalize(){const d=Math.hypot(this.x,this.y,this.z)||1;return{x:this.x/d,y:this.y/d,z:this.z/d,dot(o){return this.x*o.x+this.y*o.y+this.z*o.z;}};}});
  window.__shots=[];window.__recOn=false;
  q.bullets.push=function(b){
    if(window.__recOn){
      try{
        const o=b.origin;
        for(const v of q.vehicles){
          const tip=window.__tipOf(v.mesh.userData.gun);if(!tip)continue;
          const d=tip.distanceTo(o);if(d>8)continue;
          const seat=v.mesh.position.clone();seat.y+=v.cfg.seatH+.6;
          const gp=v.mesh.userData.gun.getWorldPosition(v.mesh.userData.gun.position.clone());
          const face=V(tip.x-gp.x,tip.y-gp.y,tip.z-gp.z).normalize();
          const flight=V(b.vel.x,0,b.vel.z).normalize();
          window.__shots.push({kind:v.kind,dTip:+d.toFixed(2),dSeat:+seat.distanceTo(o).toFixed(2),aimDot:+face.dot(flight).toFixed(2)});
          break;
        }
      }catch(e){window.__recErr=String(e);}
    }
    return push.call(this,b);
  };
});
const vehicleRows=[];
for(const kind of['jeep','tank','mech','heli']){
  await p.evaluate(k=>{
    const q=window.__gameQA;
    q.newGame(false);q.clearEntities(false);q.Game.state='battle';q.squad.length=0;
    q.bullets.length=0;window.__shots=[];window.__recErr=null;
    const v=q.spawnVehicle(k);
    v.mesh.position.set(0,q.groundY(0,10),10);v.mesh.updateMatrixWorld(true);
    q.enterVehicle(v);q.player.hp=q.player.maxHp;
    q.spawnMonster('mob',0,10+16);q.spawnMonster('mob',6,10+22);
    window.__v=v;window.__recOn=true;return v.kind;
  },kind);
  await p.keyboard.down('KeyJ');
  await p.waitForTimeout(1400);
  await p.screenshot({path:path.join(outDir,'muzzle-'+kind+'.png')});
  await p.waitForTimeout(800);
  await p.keyboard.up('KeyJ');
  const row=await p.evaluate(()=>{
    window.__recOn=false;
    const s=window.__shots;
    return{kind:window.__v.kind,shots:s.length,
      worstDTip:s.length?+Math.max(...s.map(r=>r.dTip)).toFixed(2):null,
      dSeat:s.length?+s[0].dSeat.toFixed(2):null,
      minAimDot:s.length?+Math.min(...s.map(r=>r.aimDot)).toFixed(2):null,
      err:window.__recErr||null};
  });
  vehicleRows.push(row);
}
{
  const fired=vehicleRows.filter(r=>r.shots>0);
  const misaligned=fired.filter(r=>r.worstDTip>0.35);
  check('四类载具都从炮管口开火（有弹且起点=枪口，误差≤0.35m）',fired.length===4&&misaligned.length===0,{vehicleRows,misaligned});
  check('炮塔/枪架转向射击方向（枪口朝向与弹道一致，dot≥0.8）',vehicleRows.every(r=>r.shots===0||r.minAimDot>=.8),vehicleRows);
}

// ---------- 6) 队友驾驶载具同样按枪口开火、且会自己跟上 ----------
data=await p.evaluate(()=>{
  const q=window.__gameQA;
  q.newGame(false);q.clearEntities(false);q.Game.state='battle';q.squad.length=0;q.spawnSquad();
  const v=q.spawnVehicle('tank');v.mesh.position.set(0,q.groundY(0,10),10);
  const s=q.squad[0];q.boardSquadVehicle(s,v);
  q.player.pos.set(0,q.groundY(0,60),60);q.player.mesh.position.copy(q.player.pos);
  q.spawnMonster('mob',0,60+18);q.spawnMonster('mob',5,60+24);
  q.bullets.length=0;window.__shots=[];window.__recOn=true;
  for(let i=0;i<8/.05;i++){for(let k=0;k<3;k++)q.updSquad(.05/3);q.updMonsters(.05);}
  window.__recOn=false;
  const s2=window.__shots;
  return{shots:s2.length,dTip:s2.length?+Math.max(...s2.map(r=>r.dTip)).toFixed(2):null,
    dSeat:s2.length?+s2[0].dSeat.toFixed(2):null,
    gap:+Math.hypot(v.mesh.position.x-q.player.pos.x,v.mesh.position.z-q.player.pos.z).toFixed(1)};
});
check('队友驾驶坦克会跟上并射击（跟上玩家≤22m）',data.shots>0&&data.gap<=22,data);
check('队友驾驶时弹丸同样出自炮管口（误差≤0.35m）',data.shots>0&&data.dTip<=.35,data);

await p.screenshot({path:path.join(outDir,'squad-follow.png')});
check('页面无脚本错误',errors.length===0,errors);
fs.writeFileSync(path.join(outDir,'squad-follow-qa.json'),JSON.stringify({at:new Date().toISOString(),url,vehicleRows,checks},null,2));
console.log('\n=== 汇总 '+checks.filter(c=>c.ok).length+'/'+checks.length+' 通过');
await ctx.close();await b.close();
process.exit(checks.every(c=>c.ok)?0:1);
})().catch(e=>{console.error('SCRIPT ERROR',e);process.exit(2);});

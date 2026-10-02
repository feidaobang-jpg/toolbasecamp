// Collision regressions: node game-projects/tank-3d/qa/collision-sim.mjs
import assert from 'node:assert/strict';
import * as W from '../../../public/html/game/tank-3d/world.js';
const idle = {dir:-1,fire:false}, results=[];
function test(name, fn) { fn(); results.push(name); console.log('ok -',name); }
function fresh() {
  const w=W.createWorld(77);w.grid.fill(W.EMPTY);W.startWorld(w);W.stepWorld(w,idle,.81);
  w.enemies=[];w.spawning=[];w.rosterIndex=w.roster.length;w.bullets=[];
  Object.assign(w.player,{x:13,z:13,dir:0,shield:99});return w;
}
function clearTank(w,t) {
  assert.ok(t.x>=W.HALF-1e-8&&t.x<=W.N-W.HALF+1e-8&&t.z>=W.HALF-1e-8&&t.z<=W.N-W.HALF+1e-8);
  for(let z=Math.floor(t.z-W.HALF);z<=Math.floor(t.z+W.HALF-1e-9);z++)
    for(let x=Math.floor(t.x-W.HALF);x<=Math.floor(t.x+W.HALF-1e-9);x++)assert.equal(W.cellAt(w,x,z),W.EMPTY,`wall overlap ${x},${z}`);
}
function enemy(w,x,z) {const e={...w.player,id:999,team:'enemy',type:'basic',x,z,speed:0,fireTimer:99,aiTimer:99};w.enemies.push(e);return e;}
test('tank movement stops at brick, steel and base in all four directions even with a 100-cell step',()=>{
  for(const type of [W.BRICK,W.STEEL,W.BASE])for(let dir=0;dir<4;dir++){
    const w=fresh(),p=w.player,[dx,dz]=W.DIRS[dir];p.dir=dir;
    const line=13+(dx||dz)*3;for(let i=0;i<W.N;i++)w.grid[(dx?i:line)*W.N+(dx?line:i)]=type;
    W.moveTank(w,p,100);clearTank(w,p);assert.ok(Math.abs(p.x-13)+Math.abs(p.z-13)<3);
  }
});
test('tank movement cannot pass field borders or another tank',()=>{
  for(let dir=0;dir<4;dir++){
    const w=fresh(),p=w.player,[dx,dz]=W.DIRS[dir];p.dir=dir;const e=enemy(w,13+dx*4,13+dz*4);
    W.moveTank(w,p,100);assert.ok(Math.abs(p.x-e.x)>=2*W.HALF-1e-8||Math.abs(p.z-e.z)>=2*W.HALF-1e-8);
    w.enemies=[];W.moveTank(w,p,100);clearTank(w,p);
  }
});
test('turning near another tank never snaps into it (all four directions)',()=>{
  for(let dir=0;dir<4;dir++){
    const w=fresh(),p=w.player,[dx,dz]=W.DIRS[dir];p.dir=dir;
    p.x=13+dx*.51;p.z=13+dz*.51;const e=enemy(w,p.x+dx*1.99,p.z+dz*1.99);
    W.turnTank(w,p,(dir+1)%4);
    assert.ok(Math.abs(p.x-e.x)>=2*W.HALF||Math.abs(p.z-e.z)>=2*W.HALF);
  }
});
test('fort rebuild waits for either team to leave; the completed wall blocks re-entry',()=>{
  for(const team of ['player','enemy']){
    const w=fresh(),p=w.player;p.x=5;p.z=25;
    const t=team==='player'?p:enemy(w,12,23.3);Object.assign(t,{x:12,z:23.3,dir:0});
    W.setBaseWall(w,W.STEEL);assert.ok(w.pendingBaseWall.length);clearTank(w,t);
    W.moveTank(w,t,3);W.stepWorld(w,idle,1/60);assert.equal(w.pendingBaseWall.length,0);
    for(const [x,z]of W.BASE_WALL)assert.equal(W.cellAt(w,x,z),W.STEEL);
    t.dir=2;W.moveTank(w,t,10);clearTank(w,t);assert.ok(t.z<23);
  }
});
test('fort expiry updates deferred cells to brick; base destruction cancels rebuilding',()=>{
  const w=fresh();Object.assign(w.player,{x:12,z:23.3});W.qa.applyPowerup(w,{type:'shovel',x:12,z:23.3});
  w.shovel=.01;W.stepWorld(w,idle,.02);assert.ok(w.pendingBaseWall.every(c=>c.type===W.BRICK));clearTank(w,w.player);
  W.qa.destroyBase(w);assert.equal(w.pendingBaseWall.length,0);
});
test('respawn waits when a solid cell occupies the spawn',()=>{
  const w=fresh();W.qa.killPlayer(w);w.grid[24*W.N+8]=W.STEEL;
  for(let i=0;i<180;i++)W.stepWorld(w,idle,1/60);assert.equal(w.player,null);
  w.grid[24*W.N+8]=W.EMPTY;W.stepWorld(w,idle,1/60);assert.ok(w.player);clearTank(w,w.player);
});
test('fast shots stop on a single-cell steel wall without hitting a tank behind it',()=>{
  for(let dir=0;dir<4;dir++){
    const w=fresh(),p=w.player,[dx,dz]=W.DIRS[dir];p.dir=dir;
    const x=13+dx*2,z=13+dz*2;w.grid[z*W.N+x]=W.STEEL;
    const e=enemy(w,13+dx*5,13+dz*5);w.freeze=99;W.fire(w,p);w.bullets[0].speed=1000;
    W.stepWorld(w,idle,.05);assert.ok(e.alive);assert.equal(w.bullets.length,0);assert.equal(W.cellAt(w,x,z),W.STEEL);
  }
});
test('barrel sweep checks an obstruction before the nominal muzzle',()=>{
  const w=fresh(),p=w.player;p.x=10.4;p.z=13;p.dir=1;
  // Explicit injected overlap reproduces the old fort-rebuild state; the shot still must hit the wall.
  w.grid[13*W.N+10]=W.STEEL;const e=enemy(w,15,13);w.freeze=99;
  W.fire(w,p);W.stepWorld(w,idle,.3);assert.equal(w.bullets.length,0);assert.ok(e.alive);
});
test('normal shots remove one brick layer; upgraded shots remove two layers and can break steel',()=>{
  for(const type of [W.BRICK,W.STEEL])for(const level of [0,3]){
    const w=fresh(),p=w.player;p.dir=0;w.level=level;
    for(let z=9;z<=11;z++)for(let x=12;x<=13;x++)w.grid[z*W.N+x]=type;
    W.fire(w,p);W.stepWorld(w,idle,.3);
    assert.equal(W.cellAt(w,12,11),type===W.STEEL&&level===0?W.STEEL:W.EMPTY);
    assert.equal(W.cellAt(w,12,10),level===3?W.EMPTY:type);assert.equal(W.cellAt(w,12,9),type);
  }
});
test('random movement, rapid turns and repeated fort rebuilds keep every tank out of solids',()=>{
  let frames=0;
  for(const stage of [1,2,5,10,25,50])for(const loop of [1,5]){
    const w=W.createWorld(stage*100+loop,stage,loop);W.startWorld(w);const rng=W.rngFrom(42+stage);
    for(let i=0;i<7200&&w.status==='playing';i++){
      if(i%400===300)W.qa.applyPowerup(w,{type:'shovel',x:13,z:23});
      W.stepWorld(w,{dir:Math.floor(rng()*4),fire:true},i%5===0?.05:1/60);w.events=[];
      const tanks=[w.player,...w.enemies].filter(t=>t?.alive);
      for(let j=0;j<tanks.length;j++){
        clearTank(w,tanks[j]);for(let k=j+1;k<tanks.length;k++)assert.ok(Math.abs(tanks[j].x-tanks[k].x)>=2*W.HALF-1e-8||Math.abs(tanks[j].z-tanks[k].z)>=2*W.HALF-1e-8,'tank overlap');
      }frames++;
    }
  }console.log('   checked frames',frames);
});
test('all 50 layouts survive 1000 random turns and long moves without solid overlap',()=>{
  for(let stage=1;stage<=50;stage++){
    const w=W.createWorld(stage,stage,4);W.startWorld(w);W.stepWorld(w,idle,.81);
    w.enemies=[];w.spawning=[];w.rosterIndex=w.roster.length;const rng=W.rngFrom(stage);
    for(let i=0;i<1000;i++){W.turnTank(w,w.player,Math.floor(rng()*4));W.moveTank(w,w.player,rng()*3);clearTank(w,w.player);}
  }
});
console.log(JSON.stringify({passed:results.length,tests:results}));

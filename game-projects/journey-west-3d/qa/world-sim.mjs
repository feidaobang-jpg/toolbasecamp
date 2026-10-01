import assert from 'node:assert/strict';
import {createWorld,start,step,action,revive,spawnEnemy,WEAPONS} from '../../../public/html/game/journey-west-3d/world.js';
const dt=1/60;
const w=createWorld();start(w);
const seen=new Set();for(let frame=0;frame<60*350&&w.status!=='won';frame++){
 seen.add(w.wave);if(w.status==='dead')revive(w);
 if(w.player.hp<60)action(w,'heal');if(w.energy>=40&&w.enemies.some(e=>Math.hypot(e.x-w.player.x,e.z-w.player.z)<8))action(w,'burst');if(w.enemies.some(e=>Math.hypot(e.x-w.player.x,e.z-w.player.z)<2.5))action(w,'ward');
 let x,z;if(w.cleared){x=-w.player.x;z=-11-w.player.z;}else {const a=frame/60*.46;x=Math.sin(a)*6-w.player.x;z=Math.cos(a)*6-w.player.z;}
 const n=Math.hypot(x,z);step(w,{x:x/Math.max(1,n),z:z/Math.max(1,n)},dt);w.events.length=0;
}
assert.equal(w.status,'won','A normal, non-invincible run must finish');assert.deepEqual([...seen],[0,1,2,3]);assert(w.kills>=27);assert.equal(w.enemies.length,0,'Defeated enemies must leave the world and scene');console.log('full-run',JSON.stringify({status:w.status,kills:w.kills,deaths:w.deaths,seconds:w.time,score:w.score}));
for(let i=0;i<4;i++){const a=createWorld();start(a);a.weapon=i;a.spawnTimer=1e6;const e=spawnEnemy(a,'grunt',0,8+Math.min(WEAPONS[i].range-1,2));for(let j=0;j<180;j++)step(a,{x:0,z:0},dt);assert(e.hp<30,`weapon ${i} deals damage`);}
const a=createWorld();start(a);a.player.hp=20;action(a,'heal');assert.equal(a.player.hp,65);assert.equal(a.potions,1);a.energy=40;const e=spawnEnemy(a,'elite',0,8);action(a,'burst');assert.equal(a.energy,0);assert.equal(e.hp,50);action(a,'ward');assert.equal(a.player.ward,2);action(a,'dash');assert(a.player.dash>0);a.checkpoint=2;a.status='dead';for(let k=0;k<4;k++){revive(a);assert.equal(a.wave,2);assert.equal(a.player.hp,100);assert.equal(a.player.invulnerable,2);a.status='dead';}
const b=createWorld();start(b);b.spawnTimer=1e6;spawnEnemy(b,'grunt',0,8);for(let k=0;k<2000&&b.status==='playing';k++)step(b,{x:0,z:0},dt); // combat can kill the grunt first; direct boss contact guarantees a meaningful loss case
const c=createWorld();start(c);c.spawnTimer=1e6;c.player.hp=1;c.player.attack=1e6;const boss=spawnEnemy(c,'boss',0,8);boss.attack=.01;for(let k=0;k<120;k++)step(c,{x:0,z:0},dt);assert.equal(c.status,'dead');revive(c);assert.equal(c.status,'playing');console.log('weapons, items, death, repeated checkpoint revival: pass');

import assert from 'node:assert/strict';
import {createSession,createWorld,step,STEP,nextLevelId,tileAt} from '../../../public/html/game/mario-3d/world.js';
import {buildLevel,LEVEL_ORDER} from '../../../public/html/game/mario-3d/levels.js';

const checks=[];
const input={mx:0,mz:0,jump:false,jumpPressed:false,run:false,down:false,firePressed:false};
const fresh=(level='1-3')=>createWorld(createSession({startLevel:level,lives:'inf',armor:'std'}));
const advance=(w,n,keys={})=>{for(let i=0;i<n;i++)step(w,{...input,...keys,jumpPressed:!!keys.jumpPressed&&i===0},STEP);};
const check=(name,fn)=>{fn();checks.push({name,pass:true});};

check('three selectable levels; 300 timer; 17 canopies, four lifts, 23 coins, two winged enemies',()=>{
 const l=buildLevel('1-3'),a=l.areas.main;
 assert.deepEqual(LEVEL_ORDER,['1-1','1-2','1-3']);assert.equal(nextLevelId('1-2'),'1-3');assert.equal(nextLevelId('1-3'),null);
 assert.equal(l.time,300);assert.equal(a.trees.length,17);assert.equal(a.lifts.length,4);assert.equal(a.coins.length,23);assert.equal(a.enemies.filter(e=>e.flight).length,2);
});
check('tree canopy catches a fall, but lets a jump through its underside',()=>{
 const w=fresh();w.rt.enemies=[];Object.assign(w.player,{x:27,y:6,vy:15,jumping:true,gHold:28});
 let peak=6;for(let i=0;i<220;i++){advance(w,1,{jump:true});peak=Math.max(peak,w.player.y);}
 assert(peak>8.1);assert.equal(w.player.y,8);assert(w.player.grounded);
});
check('horizontal lift carries idle rider without sliding off',()=>{
 const w=fresh(),l=w.rt.lifts.find(l=>l.axis==='x');w.rt.enemies=[];
 Object.assign(w.player,{x:l.x+1.5,y:l.y,grounded:true,onLift:l});const before=w.player.x;
 advance(w,240);assert(Math.abs(w.player.x-before)>1);assert(Math.abs(w.player.x-l.x-1.5)<.001);assert.equal(w.player.onLift,l);assert.equal(w.player.y,l.y);
});
check('vertical lift carries rider and reverses without wrapping or dropping them',()=>{
 const w=fresh(),l=w.rt.lifts.find(l=>l.axis==='y');w.rt.enemies=[];
 Object.assign(w.player,{x:l.x+1.5,y:l.y,grounded:true,onLift:l});
 for(let i=0;i<1200;i++){advance(w,1);assert(l.y>=l.min-1e-6&&l.y<=l.max+1e-6);assert(!l.wrapped);assert.equal(w.player.onLift,l);assert(Math.abs(w.player.y-l.y)<.001);}
});
check('jump releases moving lift; walking past its edge falls normally',()=>{
 const w=fresh(),l=w.rt.lifts.find(l=>l.axis==='x');w.rt.enemies=[];
 Object.assign(w.player,{x:l.x+1.5,y:l.y,grounded:true,onLift:l});advance(w,1,{jump:true,jumpPressed:true});assert.equal(w.player.onLift,null);assert(w.player.vy>0);
 Object.assign(w.player,{x:l.x+l.w+.5,y:l.y,vy:0,grounded:true,onLift:l});advance(w,2);assert.equal(w.player.onLift,null);assert(w.player.y<l.y);
});
check('red Koopa patrols treetop instead of walking off',()=>{
 const w=fresh(),e=w.rt.enemies.find(e=>e.red&&e.x<40);w.rt.enemies=[e];e.active=true;
 Object.assign(w.player,{x:28,y:8,inv:100});advance(w,1200);assert(!e.gone);assert.equal(e.y,8);assert(e.x>=26&&e.x<=31.7);
});
check('flying Koopa oscillates, first stomp removes wings, next stomp produces shell',()=>{
 const w=fresh(),e=w.rt.enemies.find(e=>e.winged);w.rt.enemies=[e];e.active=true;w.player.inv=100;
 const y=e.y;advance(w,120);assert(Math.abs(y-e.y)>.2);assert(e.y>=e.flight.min&&e.y<=e.flight.max);
 Object.assign(w.player,{x:e.x,y:e.y+.85,z:e.z,vy:-4,onLift:null,grounded:false});advance(w,1);assert(!e.winged);assert.equal(e.state,'walk');
 Object.assign(w.player,{x:e.x,y:e.y+.85,z:e.z,vy:-4,onLift:null,grounded:false});advance(w,1);assert.equal(e.state,'shell');
});
check('checkpoint respawn is on safe high canopy and restores protection',()=>{
 const s=createSession({startLevel:'1-3',lives:'inf',armor:'std'});s.checkpoint='1-3';
 const w=createWorld(s,{fromCheckpoint:true,respawn:true});w.rt.enemies=[];advance(w,2);assert.equal(w.player.y,7);assert.equal(w.player.x,77.5);assert(w.player.grounded&&w.player.inv>2);
});
check('single question block yields real power-up and can be hit from beneath',()=>{
 const w=fresh();w.rt.enemies=[];Object.assign(w.player,{x:59.5,y:1.5,vy:15,jumping:true,gHold:28});advance(w,25,{jump:true});assert.equal(tileAt(w,59,3).t,'U');assert(w.rt.items.some(i=>i.type==='mushroom'));
});
check('old underground looping lifts retain their original axes and wrap',()=>{
 const w=fresh('1-2');w.rt.enemies=[];const x=w.rt.lifts.map(l=>l.x);let wrapped=false;
 for(let i=0;i<960;i++){advance(w,1);wrapped ||= w.rt.lifts.some(l=>l.wrapped);}
 assert.deepEqual(w.rt.lifts.map(l=>l.x),x);assert(wrapped);
});
console.log(JSON.stringify({method:'deterministic physics tests; positions set deliberately to isolate contacts',checks},null,2));

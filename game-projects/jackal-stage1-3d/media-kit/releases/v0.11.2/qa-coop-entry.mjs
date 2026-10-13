import assert from 'node:assert/strict';
import * as GM from '../../../src/game.js';
import * as THREE from '../../../vendor/three.module.js';
const scene=new THREE.Scene();GM.init(scene,{resetAll(){},rebuild(){}},{clear(){}},{snap(){}});
const rows=[];let bodyIds,wheelId;
for(const stage of [1,2,3]){
 GM.newGame({stage,coop:true,playerSlots:[0,1,2,3],localSlot:0,lives:'inf',armor:'std'});
 const ps=GM.players();assert.equal(ps.length,4);
 const bodies=ps.map(p=>p.obj.body.children[0]);const wheels=ps.flatMap(p=>p.obj.wheels);
 assert.ok(bodies.every(b=>b.name==='jeep-detail'));assert.equal(new Set(bodies.map(b=>b.geometry)).size,4);
 assert.equal(new Set(wheels.map(w=>w.geometry)).size,1);
 if(stage===1){bodyIds=bodies.map(b=>b.geometry.uuid);wheelId=wheels[0].geometry.uuid;}
 assert.deepEqual(bodies.map(b=>b.geometry.uuid),bodyIds);assert.equal(wheels[0].geometry.uuid,wheelId);
 GM.leaveCoopSlot(3);GM.joinCoopSlot(3);assert.equal(GM.players().length,4);assert.equal(GM.players().find(p=>p.slot===3).obj.body.children[0].geometry.uuid,bodyIds[3]);
 rows.push({stage,players:4,distinctTeamBodies:4,sharedWheelGeometry:true,stageCacheReuse:true,leaveRejoinDetailPreserved:true});
}
console.log(JSON.stringify({scope:'actual gameplay player factory; renderer/audio/world presentation stubbed; not network transport test',rows},null,2));

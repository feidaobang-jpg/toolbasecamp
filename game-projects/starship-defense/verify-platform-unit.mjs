import assert from 'node:assert/strict';
import {ToyBridge} from '../../public/html/game/starship-defense/toy-platform.js';
import {hillHeight,HILL_FORTS,slopeSpeed} from '../../public/html/game/starship-defense/terrain-controls.js';
import {validateNormalSave} from '../../public/html/game/starship-defense/save-validation.js';
const schema={weapons:{lmg:{}},buildings:{wall:{}},vehicles:{jeep:{}}};
const valid={testMode:false,cls:'gunner',loop:1,chapter:1,level:2,gold:100,score:200,weapons:['lmg'],curWeapon:'lmg',items:{medkit:2,grenade:3},time:Date.now(),buildings:[{k:'wall',x:1,z:2,r:0,hp:400}],vehiclesOwned:['jeep'],squadCount:4};
assert(validateNormalSave(valid,schema));
for(const patch of [{testMode:true},{loop:Infinity},{hpBonus:NaN},{buildings:[{k:'wall',x:1e9,z:2,r:0,hp:400}]},{weapons:['toString']},{squadCount:100},{items:{medkit:'2',grenade:3}}])assert(!validateNormalSave({...valid,...patch},schema));
let calls=0,now=100000;
const mock={isSupport:async()=>true,getCloudStorage:async()=>{calls++;return {save:'{}'};}};
const bridge=new ToyBridge(mock,()=>now);
await Promise.all([bridge.call('getCloudStorage',['save'],{cacheKey:'save'}),bridge.call('getCloudStorage',['save'],{cacheKey:'save'})]);
assert.equal(calls,1,'coalesces concurrent reads');await bridge.call('getCloudStorage',['save'],{cacheKey:'save'});assert.equal(calls,1);
mock.setCloudStorage=async()=>{calls++;throw {code:307044};};
await assert.rejects(bridge.call('setCloudStorage',{save:'{}'}),/平台繁忙/);
const before=calls;await assert.rejects(bridge.call('setCloudStorage',{save:'{}'}),/请求暂缓/);assert.equal(calls,before);
now+=6000;mock.setCloudStorage=async()=>{calls++;};await bridge.call('setCloudStorage',{save:'{}'});assert.equal(calls,before+1);
await assert.rejects(new ToyBridge(null).call('getRankList',{}),/当前环境不支持/);
for(const f of HILL_FORTS){
 assert.equal(hillHeight(f.x,f.z),f.h);assert.equal(hillHeight(f.x+5,f.z+5),f.h);
 for(let z=f.z-f.r;z<=f.z;z+=.2){const gradient=Math.abs(hillHeight(f.x,z+.1)-hillHeight(f.x,z-.1))/.2;assert(gradient<.75);}
 assert(slopeSpeed(hillHeight,f.x,f.z-20,0,1)<1);assert(slopeSpeed(hillHeight,f.x,f.z-20,0,-1)>1);
 assert.equal(slopeSpeed(hillHeight,f.x,f.z-20,1,0),1);
}
console.log('PASS: cloud dedup/cache/limit backoff/fallback; two walkable plateaus; slope direction and bounds');

// Archive UI, imports and conflict approvals are exercised in verify-save-browser.cjs.

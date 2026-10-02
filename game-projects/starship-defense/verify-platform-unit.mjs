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

// Verify the platform UI contract against a fake SDK. No real cloud/account writes.
const elements=new Map();globalThis.document={getElementById:id=>{
  if(!elements.has(id)){const classes=new Set();elements.set(id,{textContent:'',disabled:false,children:[],classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,v)=>v?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},replaceChildren(){this.children=[];},appendChild(v){this.children.push(v);}});}return elements.get(id);
},createElement:()=>({textContent:''})};
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
let gameSave={level:1,score:100,loop:1,chapter:1,time:Date.now()},loaded=null,test=false,writes=0,submits=0;
const cloudSave={...gameSave,level:3,score:300};let cloudRaw={chongchao_normal_v1:JSON.stringify({schema:1,save:cloudSave})};
const sdk={isSupport:async()=>true,getAuthorProfile:async()=>({status:'denied'}),getCloudStorage:async()=>cloudRaw,setCloudStorage:async d=>{writes++;cloudRaw=d;},getRankList:async()=>[{rank:1,nickname:'<img onerror=bad>',score:300}],submitScore:async()=>{submits++;}};
const {setupToyPlatform}=await import('../../public/html/game/starship-defense/toy-platform.js');
setupToyPlatform({prefix:'test-',open(){},close(){},getSave:()=>gameSave,load:d=>{loaded=d;},isTest:()=>test,validate:d=>d&&!d.testMode&&d.level>=1&&Number.isFinite(d.score)},{sdkPromise:Promise.resolve(sdk)});
await new Promise(r=>setTimeout(r,0));
const click=id=>elements.get(id).onclick();
await click('cloudRead');assert.equal(loaded,null,'reading never overwrites');await click('cloudLoad');assert.equal(loaded.level,3);assert.equal(JSON.parse(storage.get('test-cloud-backup')).level,1);
await click('cloudBackup');assert.equal(loaded.level,1,'backup has working restore path');
await click('cloudWrite');assert.equal(writes,0,'upload requires preview/confirmation');await click('cloudConfirm');assert.equal(writes,1);
test=true;await click('cloudWrite');await click('rankSubmit');assert.equal(writes,1);assert.equal(submits,0);
test=false;storage.set('test-rank-best','100');await click('rankSubmit');await click('rankSubmit');assert.equal(submits,1,'score deduplicated');
await click('rankRead');assert.equal(elements.get('rankList').children[0].textContent,'第1名 <img onerror=bad> · 300分');
console.log('PASS: mock SDK read/preview/confirm/upload/backup/restore, sandbox guards, score dedup, text-only nickname');

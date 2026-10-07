// 找到并重放一条从正常起点到旗杆的输入路线。敌人关闭以单独验收跳跃距离与浮台时序；没有传送或改位置。
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createSession,createWorld,step,STEP} from '../../../public/html/game/mario-3d/world.js';
const still={mx:0,mz:0,run:false,jump:false,jumpPressed:false,down:false,firePressed:false};
const initial=()=>{const w=createWorld(createSession({startLevel:'1-3',lives:'inf',armor:'std'}));w.rt.enemies=[];return w;};
const get=(w,s)=>s.tree!==undefined?w.area.trees[s.tree]:s.lift!==undefined?w.rt.lifts[s.lift]:s;
const source=(name,fields)=>({name,...fields});
const path=[source('起点',{x:0,y:0,w:16}),...[0,1,2,4,5,6].map(tree=>source('树冠 '+tree,{tree})),
 source('升降浮台',{lift:0}),source('高树冠',{tree:8}),source('低树冠',{tree:9}),source('树冠',{tree:10}),source('检查点树冠',{tree:11}),
 source('横移浮台一',{lift:1}),source('横移浮台二',{lift:2}),...[12,13,14,15,16].map(tree=>source('树冠 '+tree,{tree})),
 source('终点地面',{x:129,y:0,w:9}),source('台阶四格',{x:138,y:4,w:2}),source('台阶六格',{x:140,y:6,w:2}),source('台阶八格',{x:142,y:8,w:2}),source('旗杆前',{x:144,y:0,w:8})];
const take=(w,tape,keys)=>{const input={...still,...keys};tape.push(input);step(w,input,STEP);};
const supported=(w,s)=>{const t=get(w,s),p=w.player;return p.grounded&&p.x+.36>t.x&&p.x-.36<t.x+t.w&&Math.abs(p.y-t.y)<.04&&(s.lift===undefined||p.onLift===t);};
function settle(w,tape,s,offset){
 for(let i=0;i<480;i++){
  const p=w.player,t=get(w,s),dx=t.x+t.w-offset-p.x;
  if(w.mode!=='play'||(!p.grounded&&i>3))return false;
  if(Math.abs(dx)<.12&&Math.abs(p.vx)<.65){take(w,tape,{});return supported(w,s);}
  const brake=p.vx*p.vx/60+.08;
  const mx=Math.abs(dx)<brake&&p.vx*dx>0?-Math.sign(p.vx):Math.sign(dx);
  take(w,tape,{mx});
 }
 return false;
}
function attempt(original,from,to,offset,wait,run){
 const w=structuredClone(original),tape=[];
 if(!settle(w,tape,from,offset))return null;
 for(let i=0;i<wait;i++){take(w,tape,{});if(!supported(w,from))return null;}
 let airborne=false;
 for(let i=0;i<420;i++){
  const p=w.player,t=get(w,to),dx=t.x+t.w/2-p.x;
  const coast=p.vx*p.vx/22+.1;
  let mx=Math.abs(dx)<coast&&p.vx*dx>0?-Math.sign(p.vx):Math.sign(dx);
  if(Math.abs(dx)<.1&&Math.abs(p.vx)<.5)mx=0;
  take(w,tape,{mx,run,jump:true,jumpPressed:i===0});
  if(w.mode!=='play')return null;
  if(!p.grounded)airborne=true;
  if(airborne&&p.grounded){if(supported(w,to))return{w,tape};return null;}
 }
 return null;
}
let w=initial(),tape=[],legs=[];
for(let i=0;i<30;i++)take(w,tape,{});
for(let i=1;i<path.length;i++){
 let result=null;
 const dynamic=path[i].lift!==undefined||path[i-1].lift!==undefined;
 for(const wait of dynamic?[0,60,120,180,240,300,360,420,480,540,600,720]:[0]){
  for(const offset of [1.4,2.2,.75,.35]){
   for(const run of [false,true]){result=attempt(w,path[i-1],path[i],offset,wait,run);if(result)break;}
   if(result)break;
  }
  if(result)break;
 }
 assert(result,`No input route: ${path[i-1].name} -> ${path[i].name} at ${w.player.x.toFixed(2)},${w.player.y.toFixed(2)}`);
 w=result.w;tape.push(...result.tape);legs.push({target:path[i].name,x:+w.player.x.toFixed(2),y:+w.player.y.toFixed(2),clock:+w.clock.toFixed(2)});
}
for(let i=0;i<2400&&w.mode!=='clear';i++)take(w,tape,{mx:w.mode==='play'?1:0});
assert.equal(w.mode,'clear');assert.equal(w.session.stats.deaths,0);
const replay=initial();for(const keys of tape)step(replay,keys,STEP);assert.equal(replay.mode,'clear');assert.equal(replay.session.stats.deaths,0);
if(process.env.QA_TAPE)writeFileSync(process.env.QA_TAPE,JSON.stringify(tape));
console.log(JSON.stringify({pass:true,method:'all steps replay actual inputs from x=3,y=0; enemies disabled solely for route geometry; no teleports',seconds:+w.clock.toFixed(2),steps:tape.length,deaths:0,legs},null,2));

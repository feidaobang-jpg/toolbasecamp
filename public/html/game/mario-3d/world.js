// Deterministic gameplay, independent of rendering. Distances are world units.
export const LEVEL_END = 202;
export const GROUND = [[-5,69],[71.5,86],[89,153],[156,215]];
export const PIPES = [[28,2],[38,2.8],[46,3.5],[57,3.5],[163,2],[179,2]];
export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export function createWorld() {
  const w={time:300,score:0,coins:0,status:'ready',reason:'',events:[],blocks:[],enemies:[],items:[],particles:[],checkpoint:3,elapsed:0};
  const block=(x,y,type='brick',z=0)=>w.blocks.push({x,y,z,type,used:false,alive:true,bump:0});
  block(16,3.4,'coin');[20,21,22,23,24].forEach((x,i)=>block(x,3.4,i===1?'mushroom':i===3?'coin':'brick'));block(22,7.1,'coin');
  [77,78,79].forEach(x=>block(x,3.4,x===78?'mushroom':'brick'));for(let x=80;x<88;x++)block(x,7.1);
  [91,92,93].forEach(x=>block(x,7.1));block(94,7.1,'coin');block(94,3.4,'coin');
  [100,106,109,112].forEach(x=>block(x,3.4,'coin'));block(109,7.1,'mushroom');
  [118,121,122,123,128,129].forEach(x=>block(x,3.4));[121,122].forEach(x=>block(x,7.1,'coin'));
  for(let n=0;n<4;n++){for(let k=0;k<=n;k++)block(134+n,k+.5,'step');for(let k=0;k<4-n;k++)block(140+n,k+.5,'step');}
  for(let n=0;n<4;n++){for(let k=0;k<=n;k++)block(148+n,k+.5,'step');for(let k=0;k<4-n;k++)block(156+n,k+.5,'step');}
  [169,170,171,172].forEach(x=>block(x,3.4,x===170?'coin':'brick'));
  for(let n=0;n<8;n++)for(let k=0;k<=n;k++)block(182+n,k*.8+.4,'stair');
  for(const [x,z] of [[23,0],[41,0],[52,-.7],[54,.8],[80,1.6],[97,0],[99,0],[114,0],[116,0],[125,0],[127,0],[174,0],[176,0]])w.enemies.push({x,z,y:0,dir:-1,alive:true,squash:0});
  for(const x of [10,11.5,13,32,33.5,34.8,62,64,66,74,75.5,103,104.5,130,131.5,166,167.5,191,193,195])w.items.push({type:'coin',x,y:1.1,z:x%2?1.5:-1.5,alive:true});
  w.player={x:3,y:0,z:0,vx:0,vy:0,vz:0,grounded:true,big:false,invincible:0,facing:Math.PI/2,coyote:0,jumpBuffer:0};
  return w;
}
export function emit(w,type,data={}){w.events.push({type,...data});}
export function solids(w){return [
  ...GROUND.map(([a,b])=>({x:(a+b)/2,y:-1,z:0,h:2,sx:b-a,sz:6,type:'ground'})),
  ...PIPES.map(([x,h])=>({x,y:h/2,z:0,h,sx:1.9,sz:2,type:'pipe'})),
  ...w.blocks.filter(b=>b.alive).map(b=>({x:b.x,y:b.y,z:b.z,h:b.type==='stair'?.8:1,sx:1,sz:b.type==='step'||b.type==='stair'?3:1,block:b,type:b.type}))
];}
function height(p){return p.big?1.95:1.3;}
function hitBlock(w,b){
  if(b.used||!b.alive||b.type==='step'||b.type==='stair')return;
  b.bump=.22;emit(w,'bump',{x:b.x,y:b.y,z:b.z});
  if(b.type==='brick'){
    if(w.player.big){b.alive=false;w.score+=50;emit(w,'break',{x:b.x,y:b.y,z:b.z});}
  }else{
    b.used=true;w.score+=100;
    if(b.type==='mushroom'){w.items.push({type:'mushroom',x:b.x,y:b.y+1,z:b.z,vy:0,dir:1,alive:true});emit(w,'spawn');}
    else{w.coins++;w.score+=100;emit(w,'coin',{x:b.x,y:b.y+1,z:b.z});}
  }
}
export function die(w,reason){if(w.status!=='playing')return;w.status='dead';w.reason=reason;emit(w,'die');}
export function respawn(w){const p=w.player;Object.assign(p,{x:w.checkpoint,y:0,z:0,vx:0,vy:0,vz:0,big:false,invincible:2,grounded:true,coyote:0,jumpBuffer:0});w.time=Math.max(120,w.time);w.status='playing';}
export function stepWorld(w,input,dt){
  if(w.status!=='playing')return;
  const p=w.player;w.time-=dt;w.elapsed+=dt;p.invincible=Math.max(0,p.invincible-dt);
  if(w.time<=0){die(w,'timeout');return;}
  const terrain=solids(w);const r=.29;
  p.coyote=p.grounded?.11:Math.max(0,p.coyote-dt);
  p.jumpBuffer=input.jumpPressed?.13:Math.max(0,p.jumpBuffer-dt);
  const speed=input.run?8.1:5.1;
  const blend=1-Math.exp(-16*dt);
  p.vx+=(input.x*speed-p.vx)*blend;p.vz+=(input.z*speed-p.vz)*blend;
  if(Math.hypot(input.x,input.z)>.15)p.facing=Math.atan2(input.x,input.z);
  if(p.jumpBuffer>0&&p.coyote>0){p.vy=12.1;p.grounded=false;p.coyote=0;p.jumpBuffer=0;emit(w,'jump');}
  if(!input.jump&&p.vy>4)p.vy-=27*dt;
  for(const axis of ['x','z']){
    const before=p[axis];p[axis]+=p[axis==='x'?'vx':'vz']*dt;
    for(const s of terrain){
      if(p.y+height(p)<=s.y-s.h/2+.035||p.y>=s.y+s.h/2-.035)continue;
      if(Math.abs(p.x-s.x)<s.sx/2+r&&Math.abs(p.z-s.z)<s.sz/2+r){
        const half=axis==='x'?s.sx/2:s.sz/2;
        p[axis]=s[axis]+(before<s[axis]?-1:1)*(half+r);p[axis==='x'?'vx':'vz']=0;
      }
    }
  }
  p.x=Math.max(-2,p.x);p.z=clamp(p.z,-2.64,2.64);
  const oldY=p.y,oldTop=p.y+height(p);p.vy-=25*dt;p.y+=p.vy*dt;p.grounded=false;
  for(const s of terrain){
    if(Math.abs(p.x-s.x)>=s.sx/2+r-.015||Math.abs(p.z-s.z)>=s.sz/2+r-.015)continue;
    const top=s.y+s.h/2,bottom=s.y-s.h/2;
    if(p.vy<=0&&oldY>=top-.06&&p.y<=top){p.y=top;p.vy=0;p.grounded=true;}
    else if(p.vy>0&&oldTop<=bottom+.02&&p.y+height(p)>=bottom){p.y=bottom-height(p);p.vy=0;if(s.block)hitBlock(w,s.block);}
  }
  if(p.y< -7){die(w,'pit');return;}
  if(p.x>95&&w.checkpoint<95){w.checkpoint=96;emit(w,'checkpoint');}
  for(const b of w.blocks)b.bump=Math.max(0,b.bump-dt);
  for(const e of w.enemies){
    if(!e.alive){e.squash=Math.max(0,e.squash-dt);continue;}
    const next=e.x+e.dir*1.15*dt;
    const supported=GROUND.some(([a,b])=>next>a+.35&&next<b-.35);
    const blocked=terrain.some(s=>s.type!=='ground'&&s.y-s.h/2<.8&&Math.abs(next-s.x)<s.sx/2+.38&&Math.abs(e.z-s.z)<s.sz/2+.35);
    if(!supported||blocked)e.dir*=-1;else e.x=next;
    if(Math.abs(p.x-e.x)<.65&&Math.abs(p.z-e.z)<.62&&p.y<.9&&p.y+height(p)>e.y){
      if(p.vy<0&&oldY>=.66){e.alive=false;e.squash=.35;p.vy=input.jump?9:6.8;w.score+=100;emit(w,'stomp',{x:e.x,y:.4,z:e.z});}
      else if(p.invincible<=0){if(p.big){p.big=false;p.invincible=2;emit(w,'hurt');}else die(w,'enemy');}
    }
  }
  for(const item of w.items){
    if(!item.alive)continue;
    if(item.type==='mushroom'){
      const nx=item.x+item.dir*2*dt;
      if(terrain.some(s=>s.type!=='ground'&&item.y+.5>s.y-s.h/2+.05&&item.y<s.y+s.h/2-.05&&Math.abs(nx-s.x)<s.sx/2+.3&&Math.abs(item.z-s.z)<s.sz/2+.3))item.dir*=-1;else item.x=nx;
      const prev=item.y;item.vy-=25*dt;item.y+=item.vy*dt;
      for(const s of terrain){const top=s.y+s.h/2;if(Math.abs(item.x-s.x)<s.sx/2+.25&&Math.abs(item.z-s.z)<s.sz/2+.25&&prev>=top-.05&&item.y<=top){item.y=top;item.vy=0;}}
      if(item.y< -5)item.alive=false;
    }
    if(Math.abs(p.x-item.x)<.65&&Math.abs(p.z-item.z)<.65&&p.y+height(p)>item.y&&p.y<item.y+.65){
      // Do not grow inside a low ceiling; keep the pickup available until clear.
      const growBlocked=item.type==='mushroom'&&terrain.some(s=>Math.abs(p.x-s.x)<s.sx/2+r&&Math.abs(p.z-s.z)<s.sz/2+r&&s.y-s.h/2>=p.y+1.25&&s.y-s.h/2<p.y+1.95);
      if(!growBlocked){item.alive=false;if(item.type==='coin'){w.coins++;w.score+=200;emit(w,'coin',{x:item.x,y:item.y,z:item.z});}else{p.big=true;w.score+=1000;emit(w,'grow');}}
    }
  }
  if(p.x>=LEVEL_END-1){w.status='won';w.score+=Math.ceil(w.time)*10+1000;emit(w,'win');}
}

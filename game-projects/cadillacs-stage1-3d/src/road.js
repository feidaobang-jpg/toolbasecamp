// 第三关车辆玩法：可躲避的路障 / 手雷、碰撞冷却、毁车步战和霍格摩托 AI。
// 所有计时使用游戏 dt，暂停不推进；状态由房主推进并随合作快照同步。
import * as THREE from 'three';
import { clamp, FACE_RIGHT, FACE_LEFT } from './core.js';
import { ROAD } from './level.js';
import { buildCar, itemMesh } from './models.js';
import { buildBike, buildRadio } from './road-world.js';
import A from './audio.js';
import IN from './input.js';

export function createRoad(api) {
  const {G,scene,world,fx}=api;
  let root=null,bike=null,radio=null,markers=new Map(),serial=0;
  const visualPool=new Map();
  function recycle(id,obj){root?.remove(obj);const kind=obj.userData.roadKind;if(kind){if(!visualPool.has(kind))visualPool.set(kind,[]);visualPool.get(kind).push(obj);}else if(id==='charge'){obj.geometry.dispose();obj.material.dispose();}markers.delete(id);}
  const team=()=>G.actors.filter(a=>a.side==='player'&&!a.removed);
  const get=()=>G.road;
  function clear(){ for(const [id,obj]of markers)recycle(id,obj);if(root)scene.remove(root);root=null;bike=radio=null;G.road=null; }
  function init(id){
    clear();if(id!=='desert'&&id!=='hellroad')return;
    root=new THREE.Group();scene.add(root);
    G.road={phase:id==='desert'?'radio':'drive',distance:0,carHp:100,x:11,z:.5,speed:0,invul:0,ram:0,cool:0,spawn:1.5,seq:0,bossClock:0,summon:4,hazards:[],crashed:false};
    if(id==='desert'){radio=buildRadio();radio.position.set(29,.1,.5);root.add(radio);return;}
    G.focusX=16;G.lockX=16;G.car=buildCar();G.car.rotation.y=FACE_RIGHT;scene.add(G.car);
    for(const p of team()){p.weapon=null;api.attachWeapon(p);p.state='incar';p.vx=p.vy=p.vz=0;}
    IN.clear();api.banner('地狱公路', '自动行驶 · 撞开匪徒，避开油桶',3.2);api.ev('roadStart');
  }
  function startBoss(){if(G.boss)return;
    const b=api.spawn('hogg',21,.6,{hp:460,maxHp:460});b.state='ride';b.cd=2.2;b.ridePhase='aim';b.rideT=0;b.radius=.65;b.height=2.5;G.boss=b;
    api.banner('霍格 · HOGG','盯住手雷落点，撞击摩托侧后方',2.6);A.music('boss3');api.ev('hoggStart');
  }
  function carHit(amount,reason){const r=get();if(r.phase!=='drive'||r.invul>0||G.settings.demo)return;
    r.carHp=Math.max(0,r.carHp-amount);r.invul=1.05;G.hurtFx=.8;fx.shake=.26;A.play('boom',.5);api.ev('carHit',{hp:r.carHp,reason});
    if(!r.carHp)wreck();
  }
  function wreck(){const r=get();if(r.phase!=='drive')return;
    r.phase='foot';r.crashed=true;r.speed=0;r.hazards=[];IN.clear();
    fx.boom(r.x,0,r.z,1);A.play('boom');G.timer=150;
    // 所有乘员安全弹出，随后恢复标准耐久、死亡与续关规则。
    team().forEach((p,i)=>{p.x=clamp(r.x-1+i*.7,11,17);p.z=clamp(r.z+(i%2?1:-1),world.area().def.z0,world.area().def.z1);p.y=.8;p.vy=4;p.vx=p.vz=0;p.invul=3;p.alive=true;api.state(p,'jump',{noAtk:true});});
    G.car.position.set(9,0,-3.1);G.car.rotation.z=.14;startBoss();G.boss.rideT=0;G.boss.ridePhase='aim';
    api.banner('弃车迎战！','躲开冲撞；摩托减速时反击，击倒枪手可捡枪',3.5);api.ev('carWreck');
  }
  function hazard(kind,x,z,extra={}){const h={id:++serial,kind,x,z,t:0,...extra};get().hazards.push(h);return h;}
  function grenade(b){const r=get(),p=G.player;hazard('grenade',b.x,b.z,{tx:r.phase==='drive'?r.x:p.x,tz:r.phase==='drive'?r.z:p.z,sx:b.x,sz:b.z,ttl:1.65});A.play('throw');api.ev('hoggGrenade');}
  function bossStep(b,dt){const r=get();if(!r||!b.alive)return;
    b.rideT+=dt;b.vx=b.vz=0;b.y=0;
    if(r.phase==='drive'){
      b.face=FACE_RIGHT;b.state='ride';b.x=21+Math.sin(r.bossClock*.9)*1.2;b.z=clamp(b.z+(Math.sin(r.bossClock*.63)*2.5-b.z)*dt*1.2,-2.6,3.6);
      b.cd-=dt;if(b.cd<=0){grenade(b);b.cd=b.hp<230?1.85:2.7;}
      if(r.invul<=0&&Math.abs(r.x+2.35-b.x)<1.6&&Math.abs(r.z-b.z)<1.05){
        const dmg=r.ram>0?52:30;api.damage(G.player,b,dmg,'hit',FACE_RIGHT,0,true);r.invul=.8;r.x=Math.max(11,r.x-1.4);fx.hit(b.x,1,b.z,2);A.play('hit');api.ev('carRam',{hp:b.hp,damage:dmg});
      }
      return;
    }
    // 步战：锁定纵深 → 0.9秒红色预警 → 横向冲撞 → 2.4秒停顿，明确的反击窗口。
    const p=G.player;
    if(b.ridePhase==='aim'){
      if(b.rideT<.1){b.x=p.x<16?22:10;b.chargeDir=b.x>16?-1:1;b.z=clamp(p.z,world.area().def.z0,world.area().def.z1);b.hitSlots=[];}
      b.face=b.chargeDir>0?FACE_RIGHT:FACE_LEFT;
      if(b.rideT>.9){b.ridePhase='charge';b.rideT=0;A.play('dash');api.ev('hoggCharge');}
    }else if(b.ridePhase==='charge'){
      b.face=b.chargeDir>0?FACE_RIGHT:FACE_LEFT;b.x+=b.chargeDir*12*dt;
      for(const q of team())if(q.alive&&!b.hitSlots.includes(q.slot)&&Math.abs(q.x-b.x)<1.25&&Math.abs(q.z-b.z)<.85&&q.y<.85){api.hitPlayer(b,q,17);b.hitSlots.push(q.slot);}
      if(b.x<10||b.x>22){b.x=clamp(b.x,10,22);b.ridePhase='recover';b.rideT=0;grenade(b);}
    }else if(b.rideT>2.4){b.ridePhase='aim';b.rideT=0;}
    b.state='ride';
  }
  function step(dt){const r=get();if(!r||G.mode!=='play')return false;
    if(r.phase==='radio'){
      if(G.wave>=world.area().def.waves.length&&!G.waveOn&&!r.prompted){r.prompted=true;api.toast('前方电台：靠近后按攻击键呼叫凯迪拉克');}
      return false;
    }
    r.invul=Math.max(0,r.invul-dt);r.ram=Math.max(0,r.ram-dt);r.cool=Math.max(0,r.cool-dt);r.bossClock+=dt;
    if(r.phase==='drive'){
      // 房主驾驶；乘客共享车体，毁车后恢复各自的独立角色。
      const driver=team().find(p=>p.slot===0)||G.player,net=G.coop?api.coopInput(driver.slot):null;
      const mv=net?{x:net.x||0,z:net.z||0}:api.move();
      const atk=net?net.edges?.includes('atk'):!!IN.take('atk'),brake=net?net.jump:IN.down('jump');
      if(atk&&r.cool<=0){r.ram=.7;r.cool=1.6;A.play('dash');}
      if(!G.settings.demo){G.timer-=dt;if(G.timer<=0){wreck();return false;}}
      r.speed=brake?8:r.ram>0?27:18;
      r.engineT=(r.engineT||0)-dt;if(r.engineT<=0){A.play('engine',.22);r.engineT=1.9;}r.distance+=r.speed*dt;
      r.x=clamp(r.x+(mv.x*5.5+(r.ram>0?3.2:0))*dt,10,19);r.z=clamp(r.z+mv.z*4.4*dt,ROAD.z0+ROAD.carMargin,ROAD.z1-ROAD.carMargin);
      for(const [i,p] of team().entries()){p.state='incar';p.x=r.x-(i>1?1.2:0);p.z=r.z+(i%2?.45:-.45);p.y=.55;p.face=FACE_RIGHT;}
      G.focusX=16;G.lockX=16;r.spawn-=dt;
      if(r.distance<640&&r.spawn<=0){
        const lanes=[-2,.5,3, .5,-2,3],n=r.seq++,kind=n%4===3?'barrel':'raider';
        hazard(kind,30,lanes[n%lanes.length]);r.spawn=1.7;
        if(n%5===4)hazard('barrel',34,lanes[(n+2)%lanes.length]);
      }
      if(r.distance>=640)startBoss();
      if(G.boss?.alive){G.boss.invul=Math.max(0,G.boss.invul-dt);G.boss.flash=Math.max(0,G.boss.flash-dt);bossStep(G.boss,dt);}
      IN.take('jump');IN.take('mega');IN.take('dash');
    } else {
      r.summon-=dt;
      if(r.summon<=0&&G.boss?.alive){
        const enemies=G.actors.filter(e=>e.side==='enemy'&&e.alive&&e!==G.boss);
        if(enemies.length<3){const n=r.seq++;api.spawn(n%2?'punk':'poacher',n%2?10:22,n%2?-1.5:2,{drop:n%2?'hamburger':'rifle'});api.ev('hoggReinforcement');}
        r.summon=8;
      }
    }
    for(const h of r.hazards){
      h.t+=dt;
      if(h.kind==='grenade'){
        const k=Math.min(1,h.t/1.1);h.x=h.sx+(h.tx-h.sx)*k;h.z=h.sz+(h.tz-h.sz)*k;
        if(h.t>=h.ttl){fx.boom(h.tx,0,h.tz,.65);A.play('boom');
          if(r.phase==='drive'){if(Math.hypot((r.x-h.tx)*.65,r.z-h.tz)<1.8)carHit(20,'grenade');}
          else for(const p of team())if(p.alive&&Math.hypot(p.x-h.tx,p.z-h.tz)<1.6&&p.y<1)api.hitPlayer(G.boss,p,20);
          h.dead=true;
        }
      }else{
        h.x-=r.speed*dt;
        if(r.phase==='drive'&&Math.abs(h.x-r.x)<2.7&&Math.abs(h.z-r.z)<1.1){
          h.dead=true;fx.hit(h.x,.8,h.z,1);A.play('hit');
          if(h.kind==='barrel'){fx.boom(h.x,0,h.z,.6);carHit(12,'barrel');}
          else {api.score(1000,h.x,1.8,h.z);api.ev('roadRaiderHit');}
        }
        if(h.x<3)h.dead=true;
      }
    }
    r.hazards=r.hazards.filter(h=>!h.dead);
    G.hurtFx=Math.max(0,G.hurtFx-dt*2);G.flash=Math.max(0,G.flash-dt*3);
    return r.phase==='drive';
  }
  function render(){const r=get();if(!r||!root)return;
    if(radio){radio.rotation.y=Math.sin(G.t)*.2;radio.position.y=.12+Math.sin(G.t*3)*.06;return;}
    world.area().roadScroll?.(r.distance);
    if(G.car&&r.phase==='drive'){G.car.position.set(r.x,Math.sin(G.t*31)*.013,r.z);G.car.rotation.y=FACE_RIGHT;G.car.rotation.z=r.ram>0?-.025:0;for(const w of G.car.userData.wheels||[])w.rotation.x=r.distance*2.6;}
    const b=G.boss;
    if(b){if(!bike){bike=buildBike();root.add(bike);}bike.visible=b.alive;bike.position.set(b.x,0,b.z);bike.rotation.y=b.face;bike.rotation.z=r.phase==='drive'?Math.cos(r.bossClock*.63)*.055:0;}
    const alive=new Set();
    for(const h of r.hazards){alive.add(h.id);let obj=markers.get(h.id);
      if(!obj&&visualPool.get(h.kind)?.length){obj=visualPool.get(h.kind).pop();root.add(obj);markers.set(h.id,obj);}
      if(!obj){obj=new THREE.Group();obj.userData.roadKind=h.kind;
        if(h.kind==='grenade'){
          obj.add(itemMesh('grenade'));
          const ring=new THREE.Mesh(new THREE.RingGeometry(1.35,1.53,32),new THREE.MeshBasicMaterial({color:'#ff7a31',side:THREE.DoubleSide,transparent:true,opacity:.85,depthWrite:false}));ring.rotation.x=-Math.PI/2;obj.add(ring);
        }else if(h.kind==='barrel')obj.add(api.prop());
        else {const m=api.raider();m.root.rotation.y=FACE_LEFT;obj.add(m.root);}
        root.add(obj);markers.set(h.id,obj);
      }
      obj.position.set(h.x,0,h.z);
      if(h.kind==='grenade'){obj.children[0].position.y=h.t<1.1?.3+Math.sin(h.t/1.1*Math.PI)*2.6:.12;const ring=obj.children[1];ring.position.set(h.tx-h.x,.025,h.tz-h.z);ring.material.opacity=.5+.4*Math.sin(h.t*22);}
    }
    // 摩托冲锋纵深在发招之前就画出；清晰但不挡住角色。
    if(b?.alive&&r.phase==='foot'&&b.ridePhase==='aim'){
      let line=markers.get('charge');if(!line){line=new THREE.Mesh(new THREE.PlaneGeometry(13,1.1),new THREE.MeshBasicMaterial({color:'#db593a',transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false}));line.rotation.x=-Math.PI/2;root.add(line);markers.set('charge',line);}line.position.set(16,.018,b.z);alive.add('charge');
    }
    for(const [id,obj]of markers)if(!alive.has(id)){if(id==='charge'){root.remove(obj);obj.geometry.dispose();obj.material.dispose();markers.delete(id);}else recycle(id,obj);}
  }
  function snapshot(){const r=get();return r?JSON.parse(JSON.stringify(r)):null;}
  function apply(r){if(!r){clear();return;}if(!root)init(r.phase==='radio'?'desert':'hellroad');G.road=r;serial=Math.max(serial,...r.hazards.map(h=>h.id));render();}
  return {init,clear,step,render,bossStep,wreck,snapshot,apply,carHit};
}

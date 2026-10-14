import * as T from './vendor/three.module.js';
import {PERIOD_GUNS,periodGun,periodSoldier,buildResistanceMap,disposeTree,build,compact} from './resistance-assets.js';
import {WAR_CHAPTERS,mountResistanceUI} from './resistance-ui.js';

const STORE='chongchao-resistance-checkpoint-v1',clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// 章节：0 苍云岭（重做版）、1 李家坡（本文件里的旧版）、2 平安县城（重做版）。重做版在 liangjian/ 里，有自己的菜单和进度
const LIJIAPO=1;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
// A finite segment/AABB test is shared by walking sight lines and fast projectiles.
function boxHit(from,to,c,margin=0){
 let lo=0,hi=1;const min=[c.x-c.w/2-margin,-.1,c.z-c.d/2-margin],max=[c.x+c.w/2+margin,c.h+margin,c.z+c.d/2+margin];
 for(let i=0;i<3;i++){const key=['x','y','z'][i],d=to[key]-from[key];if(Math.abs(d)<1e-8){if(from[key]<min[i]||from[key]>max[i])return null;}else{let a=(min[i]-from[key])/d,b=(max[i]-from[key])/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;}}
 return lo;
}
function capsuleHit(from,to,p,r=.65,height=1.7){const d=to.clone().sub(from),center=p.clone().add(vec(0,height*.55,0)),t=clamp(center.clone().sub(from).dot(d)/Math.max(.0001,d.lengthSq()),0,1),near=from.clone().addScaledVector(d,t);return Math.hypot(near.x-p.x,near.z-p.z)<r&&near.y>p.y-.1&&near.y<p.y+height?t:null;}

export function createResistanceCampaign(a){
 const s={active:false,scene:null,map:null,chapter:0,phase:0,units:[],shots:[],effects:[],player:null,elapsed:0,kills:0,hold:0,dialogueT:0,invulnerable:0,deadT:0,failedT:0,order:'follow',checkpoint:0,grenades:4,medkits:3,grenadeCd:0,reload:0,fireCd:0,damageFlash:0,over:false,backup:null};
 let uid=0,ui,sceneGun,gunKind,gunKick=0,marker,markerRing,hudT=0,viewBackup=null;
 const tracerGeo=new T.CylinderGeometry(1,1,1,6).rotateX(Math.PI/2);
 const GRAVITY=9.8;
 const projectileGeo=new T.SphereGeometry(.055,6,4),sparkGeo=new T.BoxGeometry(.12,.12,.12),shotMats=new Map();
 const shotMat=color=>{if(!shotMats.has(color))shotMats.set(color,new T.MeshBasicMaterial({color}));return shotMats.get(color);};
 function read(){try{let d=JSON.parse(localStorage.getItem(STORE)||'null');if(d&&d.schema===1&&Number.isInteger(d.chapter))d={...d,schema:2,chapter:[1,0,2][d.chapter]??0,phase:d.chapter===0?d.phase:0};return d&&d.schema===2&&Number.isInteger(d.chapter)&&d.chapter>=0&&d.chapter<3&&Number.isInteger(d.phase)&&d.phase>=0&&(WAR_CHAPTERS[d.chapter].remake||d.phase<WAR_CHAPTERS[d.chapter].stages.length)?d:null;}catch{return null;}}
 function save(){if(!s.active)return;try{localStorage.setItem(STORE,JSON.stringify({schema:2,chapter:s.chapter,phase:s.checkpoint,elapsed:s.elapsed,kills:s.kills,finished:!!s.finished,updated:new Date().toISOString()}));}catch{}}
 function say(who,text,time=5){ui.dialogue(who+'：'+text);s.dialogueT=time;}
 function setupScene(){
  const scene=new T.Scene();scene.background=new T.Color(0xc1bca8);scene.fog=new T.Fog(0xb7b6a0,90,300);scene.add(new T.HemisphereLight(0xc8d5da,0x5c4d35,1.1));
  const light=new T.DirectionalLight(0xffdfac,1.6);light.position.set(-45,65,-25);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:180});light.shadow.bias=-.00025;light.shadow.normalBias=.06;scene.add(light,light.target);s.sun=light;
  s.map=buildResistanceMap();scene.add(s.map.root);s.scene=scene;
  marker=new T.Group();const b=build(marker);b.cyl(0xd8bc70,0,2.7,0,.065,5.4,6);b.box(0xbc6953,.55,4.45,0,1.2,.75,.035);compact(marker);scene.add(marker);
  markerRing=new T.Mesh(new T.RingGeometry(2.9,3.08,32),new T.MeshBasicMaterial({color:0xffdb84,side:T.DoubleSide,transparent:true,opacity:.65,depthWrite:false}));markerRing.rotation.x=-Math.PI/2;scene.add(markerRing);
  sceneGun=new T.Group();scene.add(sceneGun);gunKind=null;updateViewGun();
 }
 function spawnPosition(x,z,r=.75){
  if(!collision(x,z,r))return vec(x,0,z);
  for(let distance=1;distance<=18;distance++)for(let i=0;i<16;i++){const angle=i*Math.PI/8,px=x+Math.sin(angle)*distance,pz=z+Math.cos(angle)*distance;if(!collision(px,pz,r))return vec(px,0,pz);}
  return vec(0,0,-20);
 }
 function unit(name,team,x,z,weapon='rifle',officer=false){
  const root=new T.Group(),body=periodSoldier(team,weapon,officer);root.position.copy(spawnPosition(x,z,.75));root.add(body);
  const u={id:++uid,name,team,root,body,hp:team==='enemy'?85:130,maxHp:team==='enemy'?85:130,weapon,cd:Math.random(),brain:Math.random()*.2,dead:false,moving:0,phase:s.phase,home:vec(x,0,z),target:null,revive:0,age:0};
  root.rotation.y=team==='enemy'?Math.PI:0;s.scene.add(root);s.units.push(u);return u;
 }
 function dead(u){if(u.dead)return;u.hp=0;u.dead=true;u.revive=8;u.root.rotation.z=Math.PI*.43;if(u.team==='enemy'){s.kills++;a.AudioSys.sfx('hit');}else if(u===s.player){s.deadT=3;s.aiming=false;s.damageFlash=.9;say('战地救护','正在返回最近检查点……',3);}else say(u.name,'我暂时跟不上，先守住阵地！',2);}
 function hurt(u,amount){if(u.dead||u===s.player&&s.invulnerable>0)return;u.hp-=amount;if(u===s.player){s.damageFlash=.65;a.AudioSys.sfx('hurt');}if(u.hp<=0)dead(u);}
 function spawnPhase(){
  const p=s.phase,spots=p===0?[[-5,28],[8,32],[-16,49],[10,54],[-6,61],[15,65]]:p===1?[[-17,86],[18,88],[-9,103],[10,107]]:[[-11,126],[11,128],[-5,139],[6,142],[21,133],[0,149]];
  spots.forEach(([x,z],i)=>unit('日军步兵','enemy',x,z,i%4===0?'type96':'arisaka',i%5===0));
  s.phaseKills=s.kills;s.hold=0;
 }
 function start(chapter=0,phase=0,progress=null){
  chapter=clamp(Math.floor(chapter)||0,0,2);
  // 第一章「苍云岭」、第三章「平安县城」是重做版（同包内的亮剑战役页面，自带菜单与进度），这里只负责跳过去；旧存档里这两章的进度同样转到那里。
  const remake=WAR_CHAPTERS[chapter].remake;if(remake){location.href='./liangjian/index.html?ch='+remake;return;}
  phase=clamp(Math.floor(phase)||0,0,WAR_CHAPTERS[chapter].stages.length-1);
  const backup=s.backup||JSON.parse(JSON.stringify(a.Game));if(!s.active)viewBackup=a.viewState();if(s.active)stop(false);a.prepare();s.backup=backup;
  Object.assign(s,{active:true,chapter,phase,checkpoint:phase,units:[],shots:[],effects:[],elapsed:progress?.elapsed||0,kills:progress?.kills||0,hold:0,invulnerable:4,deadT:0,failedT:0,order:'follow',grenades:4,medkits:3,grenadeCd:0,reload:0,fireCd:0,damageFlash:0,over:false,weapon:'rifle',ammo:{rifle:5,mauser:10,zb26:20,arisaka:5},supplyCooldown:0,finished:false,aiming:false,hitT:0});
  Object.assign(a.Game,{state:'battle',testMode:false,pausedFrom:'battle',msgTimer:0});ui.$('msg').classList.add('hidden');a.AudioSys.init();a.AudioSys.pause(false);a.Input.reset();setupScene();
  const z=[-18,57,109][phase];
  s.player=unit('李云龙','ally',0,z,'rifle',true);s.player.hp=s.player.maxHp=140;
  for(let i=0;i<3;i++)unit(i===0?'张大彪':'独立团战士','ally',(i-1)*3.4,z-3-i,'rifle',i===0);
  if(phase>=2)for(const d of s.map.destructibles)destroy(d,false);
  spawnPhase();a.faceForward();syncView();ui.show();a.showHUD();a.player.inVehicle=null;a.player.dead=false;a.player.pos.copy(s.player.root.position);a.player.yaw=0;a.player.mesh.visible=false;
  ui.$('btnRestartLv').textContent='重开本章';refreshWeapons();hudT=0;save();
  say('李云龙',phase?'从检查点重新组织，继续完成任务。':'沿交通壕接近，手榴弹留给火力点！',6);
  camera(1);hud();return s;
 }
 function stop(restore=true){
  if(!s.active){ui?.stop();return;}save();s.active=false;s.aiming=false;a.Input.reset();ui.$('vC').classList.remove('hidden');
  // Effect/projectile geometry is shared and kept outside per-scene disposal.
  for(const x of [...s.shots,...s.effects]){x.mesh.removeFromParent();if(x.smoke)x.mesh.material.dispose();}
  disposeTree(s.scene);s.scene=null;s.map=null;s.units=[];s.shots=[];s.effects=[];ui.stop();a.camera.fov=62;a.camera.updateProjectionMatrix();
  if(restore&&s.backup){Object.assign(a.Game,s.backup);s.backup=null;a.restoreView(viewBackup);viewBackup=null;}ui.$('btnRestartLv').textContent='🔄 重开本关';a.syncLabels();
 }
 function advance(){
  s.phase++;if(s.phase>=WAR_CHAPTERS[s.chapter].stages.length){s.phase=WAR_CHAPTERS[s.chapter].stages.length-1;finish();return;}
  s.checkpoint=s.phase;s.grenades=Math.max(3,s.grenades);s.medkits=Math.max(2,s.medkits);s.player.hp=Math.min(s.player.maxHp,s.player.hp+55);spawnPhase();save();
  say('李云龙',s.phase===1?'贴近掩体，用手榴弹端掉两座机枪堡垒！':'火力点已拔掉，向坡顶总攻！',5);
 }
 function finish(){s.over=true;s.finished=true;s.aiming=false;a.Game.state='over';a.Input.reset();a.AudioSys.sfx('win');save();const mins=Math.floor(s.elapsed/60),sec=Math.floor(s.elapsed%60);ui.result(true,WAR_CHAPTERS[s.chapter].name+' · 用时 '+mins+'分'+sec+'秒 · 击败 '+s.kills+' 名敌军。本章检查点与其他模式存档独立。',false);}
 function collision(x,z,r=.42){if(x<s.map.bounds.minX+2||x>s.map.bounds.maxX-2||z<s.map.bounds.minZ+2||z>s.map.bounds.maxZ-2)return true;return s.map.colliders.some(c=>!c.disabled&&Math.abs(x-c.x)<c.w/2+r&&Math.abs(z-c.z)<c.d/2+r);}
 function move(u,dx,dz,dt){const p=u.root.position,r=.42;if(!collision(p.x+dx,p.z,r))p.x+=dx;if(!collision(p.x,p.z+dz,r))p.z+=dz;u.moving=Math.hypot(dx,dz)/Math.max(dt,.001);}
 function visible(from,to){return !s.map.colliders.some(c=>!c.disabled&&boxHit(from,to,c)!==null);}
 function muzzle(u){u.root.updateMatrixWorld(true);return u.body.userData.muzzle.getWorldPosition(vec());}
 function effect(pos,color,count=12,power=4){
  for(let i=0;i<count;i++){const m=new T.Mesh(sparkGeo,shotMat(color));m.position.copy(pos);const scale=.6+Math.random()*2;m.scale.setScalar(scale);s.scene.add(m);s.effects.push({mesh:m,vel:vec((Math.random()-.5)*power,Math.random()*power,(Math.random()-.5)*power),life:.25+Math.random()*.5});}
 }
 function smoke(pos,count=3){
  for(let i=0;i<count;i++){const mat=new T.MeshBasicMaterial({color:0x625c51,transparent:true,opacity:.42,depthWrite:false}),mesh=new T.Mesh(projectileGeo,mat);mesh.position.copy(pos).add(vec((Math.random()-.5)*.3,0,(Math.random()-.5)*.3));mesh.scale.setScalar(2+i);s.scene.add(mesh);s.effects.push({mesh,smoke:true,vel:vec((Math.random()-.5)*.45,.7+Math.random()*.4,0),life:.7,maxLife:.7});}
 }
 function muzzleFlash(pos){effect(pos,0xff962b,3,1.5);for(const e of s.effects.slice(-3))e.life=.045;smoke(pos,2);}
 function projectile(from,dir,options={}){
  const o={team:'ally',damage:35,speed:240,life:.5,...options},mesh=new T.Group();
  const tip=new T.Mesh(projectileGeo,shotMat(o.grenade?0x3f4929:0x754b25));tip.scale.setScalar(o.grenade?3.5:1);if(!o.grenade)tip.scale.z*=2.5;mesh.add(tip);
  if(!o.grenade){const length=o.team==='enemy'?2.5:3.6;const edge=new T.Mesh(tracerGeo,shotMat(0x582907)),core=new T.Mesh(tracerGeo,shotMat(0xf78d20));edge.scale.set(.055,.055,length);core.scale.set(.029,.029,length*.94);edge.position.z=core.position.z=-length/2;mesh.add(edge,core);}
  mesh.position.copy(from);mesh.quaternion.setFromUnitVectors(vec(0,0,1),dir.clone().normalize());s.scene.add(mesh);s.shots.push({...o,mesh,velocity:dir.clone().normalize().multiplyScalar(o.speed)});
 }
 function blast(pos,radius,damage,team){a.AudioSys.sfx('boom');effect(pos,0xf5b35f,24,9);effect(pos,0x776d58,14,6);smoke(pos,7);for(const u of s.units)if(!u.dead&&u.team!==team&&distance(u.root.position,pos)<radius)hurt(u,damage*(1-distance(u.root.position,pos)/(radius*1.6)));
  if(team==='ally')for(const d of s.map.destructibles)if(!d.dead&&distance(d,pos)<radius+2){d.hp-=damage;if(d.hp<=0)destroy(d);}
 }
 function destroy(d,fx=true){if(!d||d.dead)return;d.dead=true;d.hp=0;d.mesh.visible=false;d.collider.disabled=true;if(fx){effect(vec(d.x,2,d.z),0xa69673,35,10);a.AudioSys.sfx('boom');}const g=new T.Group(),b=build(g);for(let i=0;i<9;i++){const rock=b.box(0x857e68,d.x+(Math.random()-.5)*5,.1+Math.random()*.15,d.z+(Math.random()-.5)*3,.4+Math.random()*.7,.3,.45);rock.rotation.y=Math.random()*3;}compact(g);s.scene.add(g);}
 function sightHit(range){
  const from=a.camera.position.clone(),dir=a.camera.getWorldDirection(vec()),to=from.clone().addScaledVector(dir,range);let nearest=1,unit=null;
  for(const c of s.map.colliders)if(!c.disabled){const t=boxHit(from,to,c);if(t!==null&&t<nearest){nearest=t;unit=null;}}
  for(const u of s.units)if(!u.dead&&u.team==='enemy'){const t=capsuleHit(from,to,u.root.position,.63,2.05);if(t!==null&&t<nearest){nearest=t;unit=u;}}
  return {point:from.addScaledVector(dir,range*nearest),unit};
 }
 const sightPoint=range=>sightHit(range).point;
 // 枪战规则：键鼠完全手动，准星压到敌人身上才算对准；触屏和纯键盘在准星约 7° 内轻度吸附。
 const aimed=()=>a.aimAssist()?aimTarget():sightHit(PERIOD_GUNS[s.weapon].range).unit;
 // 步行固定第一人称。
 function syncView(){a.firstPerson();}
 function aimTarget(u=s.player){const view=a.view(),forward=vec(Math.sin(view.yaw)*Math.cos(view.pitch),Math.sin(view.pitch),Math.cos(view.yaw)*Math.cos(view.pitch)),from=view.first?a.camera.position.clone():u.root.position.clone().add(vec(0,1.3,0));let best=null,score=-Infinity;
  for(const enemy of s.units){if(enemy.dead||enemy.team===u.team)continue;const to=enemy.root.position.clone().add(vec(0,1.2,0)),dir=to.clone().sub(from),d=dir.length();if(d>PERIOD_GUNS[s.weapon].range||d<.1)continue;const dot=dir.normalize().dot(forward);if(dot<(view.first?(s.aiming?.997:.9925):.75)||!visible(from,to))continue;const n=dot*40-d*.3;if(n>score){score=n;best=enemy;}}
  return best;
 }
 function toggleAim(){if(!s.active||s.player.dead||a.Game.state!=='battle')return;s.aiming=!s.aiming;if(s.aiming)a.firstPerson();hudT=0;}
 function reload(){if(s.reload>0||s.ammo[s.weapon]>=PERIOD_GUNS[s.weapon].mag)return;s.reload=PERIOD_GUNS[s.weapon].reload;a.AudioSys.sfx('reload');document.getElementById('vR')?.classList.remove('need-reload');document.getElementById('vL')?.classList.remove('need-reload');}
 function selectWeapon(id){if(!PERIOD_GUNS[id]||!s.active)return;s.weapon=id;s.reload=0;s.fireCd=.2;const data=s.player.body.userData,old=data.gun;old.removeFromParent();disposeTree(old);const gun=periodGun(id);gun.position.set(.17,1.23,.23);s.player.body.add(gun);data.gun=gun;data.muzzle=gun.userData.muzzle;updateViewGun();refreshWeapons();}
 function updateViewGun(){if(!sceneGun||gunKind===s.weapon)return;disposeTree(sceneGun);const g=periodGun(s.weapon);g.rotation.y=Math.PI;g.position.set(.25,-.24,-.56);sceneGun.add(g);gunKind=s.weapon;}
 function refreshWeapons(){const host=ui.$('warLoadout');host.innerHTML='';for(const [id,cfg] of Object.entries(PERIOD_GUNS)){const b=document.createElement('button');b.textContent=cfg.name;b.dataset.weapon=id;b.classList.toggle('on',id===s.weapon);b.onclick=()=>selectWeapon(id);host.append(b);}}
 function fire(){
  if(s.fireCd>0||s.reload>0||s.player.dead)return;
  const cfg=PERIOD_GUNS[s.weapon];if(!s.ammo[s.weapon]){if(s.reload<=0&&(s.emptyTipT||0)<=0){say('换弹','弹匣空了，按 R 或换弹键装填',1.6);s.emptyTipT=1.8;document.getElementById('vR')?.classList.add('need-reload');document.getElementById('vL')?.classList.add('need-reload');}return;}s.ammo[s.weapon]--;s.fireCd=cfg.rate;gunKick=1;
  camera(0);const target=a.aimAssist()?aimTarget():null,view=a.view();s.player.root.rotation.y=view.yaw;
  let from=muzzle(s.player);if(view.first&&sceneGun.children[0]){sceneGun.updateMatrixWorld(true);from=sceneGun.children[0].userData.muzzle.getWorldPosition(vec());}
  const dir=target?target.root.position.clone().add(vec(0,1.2,0)).sub(from).normalize():sightPoint(cfg.range).sub(from).normalize();const spread=cfg.spread*(s.aiming?.32:1);dir.x+=(Math.random()-.5)*spread;dir.y+=(Math.random()-.5)*spread;dir.normalize();projectile(from,dir,{damage:cfg.damage,life:cfg.range/240,speed:240,gravity:GRAVITY,player:true});muzzleFlash(from);a.AudioSys.sfx(cfg.sound);
 }
 function grenade(){if(!s.grenades||s.grenadeCd>0||s.player.dead)return;s.grenades--;s.grenadeCd=.8;const view=a.view(),from=s.player.root.position.clone().add(vec(0,1.5,0)),dir=vec(Math.sin(view.yaw),.48+view.pitch*.3,Math.cos(view.yaw)).normalize();projectile(from,dir,{damage:185,speed:20,life:2.2,radius:7,grenade:true,gravity:15});a.AudioSys.sfx('shoot');}
 function interaction(){const p=s.player?.root.position;if(!p)return {text:'',kind:'none'};
  const supply=s.map.stations.find(st=>distance(st,p)<3.5);if(supply)return {kind:'supply',text:s.supplyCooldown>0?'补给整备中 '+Math.ceil(s.supplyCooldown)+'秒':'I 补充手雷、弹匣和医疗包'};
  return {kind:'none',text:'沿掩体推进，靠近军需箱按 I 补给'};
 }
 function interact(){const action=interaction();if(action.kind==='supply'&&s.supplyCooldown<=0){s.grenades=4;s.medkits=3;for(const [id,cfg]of Object.entries(PERIOD_GUNS))s.ammo[id]=cfg.mag;s.player.hp=s.player.maxHp;s.supplyCooldown=15;a.AudioSys.sfx('buy');say('军需员','弹药和医疗补给已补充。',2);}}
 function order(){s.order=s.order==='follow'?'attack':'follow';say('李云龙',s.order==='attack'?'突击班，向目标推进！':'各班跟紧我，保持队形！',2);}
 function updatePlayer(dt){
  const input=a.Input,view=a.view(),p=s.player;
  s.fireCd=Math.max(0,s.fireCd-dt);s.grenadeCd=Math.max(0,s.grenadeCd-dt);s.invulnerable=Math.max(0,s.invulnerable-dt);s.supplyCooldown=Math.max(0,s.supplyCooldown-dt);
  if(!view.first)s.aiming=false;
  if(s.emptyTipT>0)s.emptyTipT-=dt;
  if(s.reload>0){s.reload-=dt;if(s.reload<=0){s.ammo[s.weapon]=PERIOD_GUNS[s.weapon].mag;document.getElementById('vR')?.classList.remove('need-reload');document.getElementById('vL')?.classList.remove('need-reload');}}
  if(p.dead)return;
  if(input.pop('C'))say('视角','本章步行固定第一人称',2.2);if(input.pop('Z'))toggleAim();if(input.pop('R')||input.pop('L'))reload();if(input.pop('U'))grenade();if(input.pop('I'))interact();if(input.pop('T'))order();if(input.pop('O')||input.pop('X')){const ids=Object.keys(PERIOD_GUNS);selectWeapon(ids[(ids.indexOf(s.weapon)+1)%ids.length]);}
  for(let i=1;i<=4;i++)if(input.pop('N'+i))selectWeapon(Object.keys(PERIOD_GUNS)[i-1]);
  if(input.pop('H')&&s.medkits&&p.hp<p.maxHp){s.medkits--;p.hp=Math.min(p.maxHp,p.hp+70);a.AudioSys.sfx('buy');}
  if(input.pop('K')&&p.root.position.y<=.01)p.vy=6.5;
  const axis=input.axis(),forward=vec(Math.sin(view.yaw),0,Math.cos(view.yaw)),right=vec(-Math.cos(view.yaw),0,Math.sin(view.yaw)),motion=forward.multiplyScalar(-axis.y).addScaledVector(right,axis.x);
  const speed=s.aiming?3.2:(input.keys.SPRINT?8.2:5.7);
  move(p,motion.x*speed*dt,motion.z*speed*dt,dt);if(motion.lengthSq()>.03&&!view.first)p.root.rotation.y=Math.atan2(motion.x,motion.z);else if(view.first||input.keys.Q||input.keys.E)p.root.rotation.y=view.yaw;
  p.vy=(p.vy||0)-18*dt;p.root.position.y=Math.max(0,p.root.position.y+p.vy*dt);if(p.root.position.y===0)p.vy=0;
  s.hitT=Math.max(0,s.hitT-dt);camera(0);if(input.firing())fire();
  a.player.pos.copy(p.root.position);a.player.yaw=p.root.rotation.y;a.player.hp=p.hp;
 }
 function ai(dt){
  for(const u of s.units){if(u===s.player)continue;u.age+=dt;u.cd-=dt;if(u.dead){if(u.team==='ally'&&(u.revive-=dt)<=0){u.dead=false;u.hp=u.maxHp;u.root.rotation.z=0;u.root.position.copy(spawnPosition(s.player.root.position.x+3,s.player.root.position.z-6,.75));}continue;}
   u.brain-=dt;if(u.brain<=0){u.brain=.18+Math.random()*.08;let target=null,nearest=Infinity;for(const foe of s.units){if(foe.dead||foe.team===u.team)continue;const d=distance(u.root.position,foe.root.position);if(d<nearest&&d<80&&visible(u.root.position.clone().add(vec(0,1.4,0)),foe.root.position.clone().add(vec(0,1.2,0)))){nearest=d;target=foe;}}u.target=target;}
   const target=u.target&&!u.target.dead?u.target:null,pos=u.root.position;u.moving=0;
   let dest=null;if(target){const dist=distance(pos,target.root.position);if(dist>38)dest=target.root.position;const dir=target.root.position.clone().sub(pos);u.root.rotation.y=Math.atan2(dir.x,dir.z);
    if(dist<72&&u.cd<=0){const from=muzzle(u),to=target.root.position.clone().add(vec(0,1.2,0));if(visible(from,to)){u.cd=u.team==='enemy'?1.35+Math.random()*.9:1.0;const dir=to.sub(from).normalize(),spread=u.team==='enemy'?.075:.03;dir.x+=(Math.random()-.5)*spread;dir.y+=(Math.random()-.5)*spread;projectile(from,dir,{team:u.team,damage:u.team==='enemy'?7:25,speed:88,life:.95});effect(from,0xffca73,2,2);if(distance(pos,s.player.root.position)<38)a.AudioSys.sfx('shoot');}}
   }
   if(u.team==='ally'&&(!target||distance(pos,s.player.root.position)>19)){const goal=s.order==='attack'?objective():s.player.root.position,offset=(u.id%3-1)*3;dest=vec(goal.x+offset,0,goal.z-4-u.id%3*2);if(distance(pos,dest)<3)dest=null;}
   if(u.team==='enemy'&&!target&&distance(pos,s.player.root.position)<68)dest=s.player.root.position;
   if(dest){const d=dest.clone().sub(pos);d.y=0;const len=d.length();if(len>1.6){d.divideScalar(len);const speed=u.team==='enemy'?2.0:4.9;const ox=pos.x,oz=pos.z;move(u,d.x*speed*dt,d.z*speed*dt,dt);if(Math.hypot(pos.x-ox,pos.z-oz)<.01){const side=u.id%2?1:-1;move(u,-d.z*side*speed*dt,d.x*side*speed*dt,dt);}if(!target)u.root.rotation.y=Math.atan2(d.x,d.z);}}
  }
 }
 function updateShots(dt){
  for(let i=s.shots.length-1;i>=0;i--){const b=s.shots[i],from=b.mesh.position.clone();if(b.gravity)b.velocity.y-=b.gravity*dt;const to=from.clone().addScaledVector(b.velocity,dt);b.life-=dt;let hit=null,tmin=2;
   for(const c of s.map.colliders)if(!c.disabled){const t=boxHit(from,to,c);if(t!==null&&t<tmin){tmin=t;hit={collider:c};}}
   if(!b.grenade)for(const u of s.units)if(!u.dead&&u.team!==b.team){const t=capsuleHit(from,to,u.root.position,.63,2.05);if(t!==null&&t<tmin){tmin=t;hit={unit:u};}}
   if(to.y<.1&&b.velocity.y<0){const t=clamp((from.y-.1)/(from.y-to.y),0,1);if(t<tmin){tmin=t;hit={ground:true};}}
   if(hit)b.mesh.position.copy(from.lerp(to,clamp(tmin,0,1)));else b.mesh.position.copy(to);
   if(hit||b.life<=0){if(b.radius)blast(b.mesh.position,b.radius,b.damage,b.team);else if(hit?.unit){hurt(hit.unit,b.damage);if(b.player&&hit.unit.team==='enemy')s.hitT=.18;effect(b.mesh.position,0xc6ae7c,4,2);}else if(hit?.collider){const target=s.map.destructibles.find(d=>d.collider===hit.collider);if(target){target.hp-=b.damage*.3;if(target.hp<=0)destroy(target);}effect(b.mesh.position,0xb6aa86,3,2);}s.scene.remove(b.mesh);s.shots.splice(i,1);}
  }
 }
 function objective(){const o=s.map.objectives;return s.phase===0?o.trench:s.phase===1?o.assault:o.final;}
 function nearEnemies(pos,r=17){return s.units.filter(u=>u.team==='enemy'&&!u.dead&&distance(u.root.position,pos)<r).length;}
 function mission(dt){
  const pos=s.player.root.position,o=objective();if(s.player.dead)return;
  {if(s.phase===0&&distance(pos,o)<7&&!nearEnemies(o,18)){s.hold+=dt;if(s.hold>=3)advance();}else if(s.phase===1&&s.map.destructibles.every(d=>d.dead))advance();else if(s.phase===2&&distance(pos,o)<8&&!nearEnemies(o,20)){s.hold+=dt;if(s.hold>=5)advance();}else s.hold=0;}
  // Active pillboxes are real threats with visible firing ports and blocked lines of sight.
  for(const d of s.map.destructibles){if(d.dead)continue;d.cd=(d.cd||0)-dt;const from=vec(d.x,1.9,d.z-2.25),to=pos.clone().add(vec(0,1.2,0));if(d.cd<=0&&distance(d,pos)<62&&visible(from,to)){d.cd=.45+Math.random()*.3;const dir=to.sub(from).normalize();dir.x+=(Math.random()-.5)*.09;dir.y+=(Math.random()-.5)*.06;projectile(from,dir,{team:'enemy',damage:5,speed:80,life:1});effect(from,0xffb962,3,2);}}
 }
 function camera(dt){
  if(!s.player)return;const v=a.view(),pos=s.player.root.position,head=pos.clone().add(vec(0,1.68,0)),f=vec(Math.sin(v.yaw)*Math.cos(v.pitch),Math.sin(v.pitch),Math.cos(v.yaw)*Math.cos(v.pitch));
  s.player.body.visible=!v.first;sceneGun.visible=v.first&&!s.player.dead;
  if(v.first){a.camera.position.copy(head);a.camera.lookAt(head.clone().add(f));}
  else {const cfg=v.preset,el=clamp(Math.atan2(cfg.h,cfg.d)-v.pitch,.08,1.4),radius=Math.hypot(cfg.h,cfg.d),dir=vec(-Math.sin(v.yaw)*Math.cos(el),Math.sin(el),-Math.cos(v.yaw)*Math.cos(el)),dest=head.clone().addScaledVector(dir,radius);let t=1;for(const c of s.map.colliders)if(!c.disabled){const k=boxHit(head,dest,c,.15);if(k!==null)t=Math.min(t,Math.max(.08,k-.03));}a.camera.position.copy(head).addScaledVector(dir,radius*t);a.camera.position.y=Math.max(.4,a.camera.position.y);a.camera.lookAt(head.clone().add(vec(0,.22,0)));}
  a.camera.fov=s.aiming?44:62;a.camera.updateProjectionMatrix();sceneGun.position.copy(a.camera.position);sceneGun.quaternion.copy(a.camera.quaternion);if(sceneGun.children[0]){sceneGun.children[0].position.set(s.aiming?(s.weapon==='zb26'?.10:0):.25,s.aiming?-.112:-.24,(s.aiming?-.86:-.75)+gunKick*.06);sceneGun.children[0].rotation.x=gunKick*.055;}gunKick=Math.max(0,gunKick-dt*7);
  const x=Math.round(pos.x/.082)*.082,z=Math.round(pos.z/.082)*.082;s.sun.position.set(x-45,65,z-25);s.sun.target.position.set(x,0,z);
 }
 function animate(u,dt){if(u.dead)return;const phase=u.age*10+(u.id%4);u.body.userData.legs.forEach((leg,i)=>{leg.rotation.x=Math.sin(phase+i*Math.PI)*Math.min(.52,u.moving*.10);});}
 function hud(){if(!s.active)return;const $=ui.$,p=s.player,c=WAR_CHAPTERS[s.chapter],o=objective(),alive=s.units.filter(u=>u.team==='enemy'&&!u.dead).length;
  $('warTitle').textContent=c.name;$('warMission').textContent=(s.phase+1)+' / '+c.stages.length+' · '+c.stages[s.phase];
  const bunk=s.map.destructibles;
  let progress='目标 '+Math.round(distance(p.root.position,o))+'米 · 敌军 '+alive+' · 队友 '+s.units.filter(u=>u.team==='ally'&&!u.dead&&u!==p).length;
  if(s.phase===1)progress='堡垒 '+bunk.filter(d=>d.dead).length+' / 2 · U 手雷可造成大范围伤害';if(s.hold>0)progress+=' · 占领 '+Math.ceil(s.hold)+'秒';$('warProgress').textContent=progress;$('warHint').textContent=interaction().text;
  const weapon=PERIOD_GUNS[s.weapon].name+' · '+(s.reload>0?'换弹 '+s.reload.toFixed(1)+'秒':s.ammo[s.weapon]+' / '+PERIOD_GUNS[s.weapon].mag);
  $('warStatus').textContent='生命 '+Math.ceil(p.hp)+' / '+p.maxHp+'　手雷 '+s.grenades+'　医疗 '+s.medkits+'\n'+weapon;$('warStatus').style.whiteSpace='pre-line';$('warOrder').textContent='小队：'+(s.order==='follow'?'跟随':'进攻')+(a.isTouch()?'':' T');
  $('warLoadout').classList.toggle('hidden',s.aiming);
  $('warAim').classList.toggle('hidden',false);$('warAim').textContent=(s.aiming?'放下枪':'举枪瞄准')+(a.isTouch()?'':' Z');$('warAim').setAttribute('aria-pressed',String(s.aiming));
  $('warReticle').classList.toggle('sighted',s.aiming);$('warReticle').classList.toggle('hit',s.hitT>0);$('warReticle').classList.toggle('target',!!aimed());$('vC').classList.add('hidden');
  if(a.isTouch()){for(const id of ['warHint','warStatus'])$(id).textContent=$(id).textContent.replace(/\b[IJKU] /g,'');}
  for(const [id,label] of Object.entries({vJ:'射击',vK:'跳跃',vU:'手雷',vI:'互动',vO:'切枪',vL:'换弹',vR:'换弹',vZ:'举枪',vH:'医疗'})){if($(id)&&$(id).textContent!==label)$(id).textContent=label;}
  $('keysHint').textContent='WASD 移动 · 按住 J/左键 射击 · 右键拖动或 Q/E 转视角 · Z/右键点按 举枪 · U 手雷 · I 互动 · K 跳跃 · O 切枪 · R/L 手动换弹 · N 医疗 · Y/H 抬头低头 · T 队友';
  const ctx=$('warMap').getContext('2d'),map=(x,z)=>({x:90+x*1.15,y:194-(z+35)*.84});ctx.clearRect(0,0,180,204);ctx.fillStyle='#8c886b';ctx.fillRect(84,0,12,204);for(const c of s.map.colliders)if(!c.disabled){const q=map(c.x,c.z);ctx.fillStyle='#637463';ctx.fillRect(q.x-c.w*.575,q.y-c.d*.42,Math.max(1,c.w*1.15),Math.max(1,c.d*.84));}for(const u of s.units)if(!u.dead){const q=map(u.root.position.x,u.root.position.z);ctx.fillStyle=u===p?'#fff4ba':u.team==='ally'?'#90c9e6':'#d68165';ctx.beginPath();ctx.arc(q.x,q.y,u===p?3.5:2.2,0,6.3);ctx.fill();}const goal=map(o.x,o.z);ctx.strokeStyle='#ffd577';ctx.lineWidth=2;ctx.strokeRect(goal.x-5,goal.y-5,10,10);
 }
 function update(dt,playing){
  if(!s.active)return;if(!playing||s.over){camera(0);return;}s.elapsed+=dt;
  if(s.deadT>0){s.deadT-=dt;if(s.deadT<=0){start(s.chapter,s.checkpoint,{elapsed:s.elapsed,kills:s.kills});return;}}
  if(s.failedT>0){s.failedT-=dt;if(s.failedT<=0){start(s.chapter,s.checkpoint,{elapsed:s.elapsed,kills:s.kills});return;}}
  updatePlayer(dt);s.player.age+=dt;ai(dt);updateShots(dt);mission(dt);for(const u of s.units)animate(u,dt);
  for(let i=s.effects.length-1;i>=0;i--){const e=s.effects[i];e.life-=dt;if(!e.smoke)e.vel.y-=13*dt;e.mesh.position.addScaledVector(e.vel,dt);e.mesh.scale.multiplyScalar(e.smoke?1+dt*1.4:1-dt);if(e.smoke)e.mesh.material.opacity=.42*Math.max(0,e.life/e.maxLife);if(e.life<=0){s.scene.remove(e.mesh);if(e.smoke)e.mesh.material.dispose();s.effects.splice(i,1);}}
  if(s.dialogueT>0){s.dialogueT-=dt;if(s.dialogueT<=0)ui.dialogue('');}s.damageFlash=Math.max(0,s.damageFlash-dt*1.7);ui.$('warDamage').style.opacity=String(s.damageFlash);
  const o=objective();marker.position.set(o.x,0,o.z);markerRing.position.set(o.x,.045,o.z);markerRing.material.opacity=.45+Math.sin(s.elapsed*2)*.15;camera(dt);if((hudT-=dt)<=0){hudT=.12;hud();}a.AudioSys.bgm(dt,true);
 }
 ui=mountResistanceUI({start,retry:()=>start(s.chapter),next:()=>start(Math.min(2,s.chapter+1)),continue:()=>{const d=read();if(d)start(d.chapter,d.finished?0:d.phase,d.finished?null:d);},stop,read,quit:a.quit,order,toggleAim,audio:()=>a.AudioSys.init()});
 return {state:s,start,stop,update,save,read,menuOpen:ui.menuOpen,open:ui.open,retry:()=>start(s.chapter),toggleAim,sightPoint,selectWeapon,grenade,fire,interact,interaction,order,collision,visible,objective,advance,damage:hurt,PERIOD_GUNS,WAR_CHAPTERS};
}

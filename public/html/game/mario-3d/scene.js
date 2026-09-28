import * as THREE from '../../../vendor/three/0.170.0/build/three.module.js';
import {GROUND,PIPES} from './world.js';

const materials=new Map();
function mat(color,roughness=.7){const k=color+':'+roughness;if(!materials.has(k))materials.set(k,new THREE.MeshStandardMaterial({color,roughness}));return materials.get(k);}
const boxGeo=new THREE.BoxGeometry(1,1,1), ballGeo=new THREE.SphereGeometry(1,16,10);
function box(parent,x,y,z,sx,sy,sz,color){const m=new THREE.Mesh(boxGeo,mat(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function ball(parent,x,y,z,sx,sy,sz,color){const m=new THREE.Mesh(ballGeo,mat(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;}
function cylinder(parent,x,y,z,r,h,color){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),mat(color,.35));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function questionTexture(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle='#fbc448';g.fillRect(0,0,128,128);g.fillStyle='#e8a222';g.fillRect(7,7,114,114);g.fillStyle='#ffd661';g.fillRect(10,10,108,108);g.fillStyle='#965620';g.font='bold 88px monospace';g.textAlign='center';g.fillText('?',66,98);g.fillStyle='#fff4ba';g.fillText('?',62,94);for(const x of [16,112])for(const y of [16,112]){g.fillStyle='#ba791f';g.beginPath();g.arc(x,y,4,0,Math.PI*2);g.fill();}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function brickTexture(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle='#a35435';g.fillRect(0,0,128,128);for(let row=0;row<4;row++)for(let col=-1;col<3;col++){const x=col*64+(row%2)*32;g.fillStyle=row%2?'#d88b58':'#cb7848';g.fillRect(x+3,row*32+3,59,27);g.fillStyle='#e6a571';g.fillRect(x+4,row*32+4,57,3);}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}

export function mario(){
  const g=new THREE.Group();const body=new THREE.Group();g.add(body);
  ball(body,0,.63,0,.25,.31,.19,'#e84632');box(body,0,.47,.06,.4,.28,.3,'#2879b6');
  for(const x of [-.12,.12]){box(body,x,.68,.17,.075,.24,.05,'#2879b6');ball(body,x,.68,.21,.032,.032,.025,'#ffdc61');}
  const legs=[],arms=[];
  for(const sign of [-1,1]){
    const l=new THREE.Group();l.position.set(sign*.14,.37,0);body.add(l);box(l,0,-.08,0,.18,.27,.2,'#2879b6');ball(l,0,-.25,.055,.15,.11,.22,'#583d31');legs.push(l);
    const a=new THREE.Group();a.position.set(sign*.27,.78,0);body.add(a);ball(a,sign*.035,-.11,0,.095,.2,.11,'#e84632');ball(a,sign*.06,-.26,.025,.12,.12,.12,'#fff5df');arms.push(a);
  }
  ball(body,0,1.02,0,.25,.26,.23,'#f2bf8b');ball(body,0,1,.24,.12,.1,.13,'#efb17e');
  for(const sign of [-1,1]){ball(body,sign*.105,1.08,.207,.035,.057,.018,'#1c303c');ball(body,sign*.1,.93,.219,.105,.043,.043,'#50362b');ball(body,sign*.25,1,0,.06,.085,.055,'#f2bf8b');}
  ball(body,0,1.22,-.012,.28,.15,.26,'#df3d30');box(body,0,1.18,.21,.42,.055,.22,'#e84632');ball(body,0,1.28,.218,.085,.08,.018,'#fff3d6');
  return {group:g,body,legs,arms};
}
function goomba(){const g=new THREE.Group();ball(g,0,.44,0,.43,.39,.35,'#995532');ball(g,0,.2,.04,.27,.23,.25,'#e5bf88');for(const s of [-1,1]){ball(g,s*.21,.09,.08,.21,.1,.24,'#503c30');ball(g,s*.14,.52,.29,.11,.15,.055,'#fff5df');ball(g,s*.12,.49,.337,.038,.077,.02,'#25333b');const brow=box(g,s*.14,.64,.33,.24,.06,.04,'#503c30');brow.rotation.z=s*.3;}return g;}
function mushroom(){const g=new THREE.Group();cylinder(g,0,.2,0,.2,.4,'#fff2d4');ball(g,0,.46,0,.42,.28,.42,'#e84432');for(const [x,z] of [[0,.29],[-.27,-.1],[.27,-.1]])ball(g,x,.59,z,.11,.07,.1,'#fff3df');return g;}
function coin(){const m=new THREE.Mesh(new THREE.CylinderGeometry(.27,.27,.09,16),mat('#ffcb36',.25));m.rotation.x=Math.PI/2;m.castShadow=true;return m;}

export function createScene(canvas,world){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#a2deed');scene.fog=new THREE.Fog('#a2deed',38,110);
  const camera=new THREE.PerspectiveCamera(43,1,.1,170);
  scene.add(new THREE.HemisphereLight('#eafaff','#81904f',2.6));
  const sun=new THREE.DirectionalLight('#fff1d3',3.3);sun.position.set(-12,25,12);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-23,right:23,top:17,bottom:-17,near:.1,far:80});sun.shadow.bias=-.001;scene.add(sun);scene.add(sun.target);
  const level=new THREE.Group();scene.add(level);
  for(const [a,b] of GROUND){box(level,(a+b)/2,-1.05,0,b-a,2.1,6,'#c58b55');box(level,(a+b)/2,-.07,0,b-a,.14,6.08,'#78b756');
    for(let x=Math.ceil(a);x<b;x+=2){box(level,x,-.44,3.02,1.82,.43,.06,'#b67a4d');box(level,x,-1.25,3.025,1.85,.8,.07,'#bc8250');}
  }
  // Decorative landscape is entirely procedural, with no extracted game artwork.
  for(let x=-12;x<235;x+=15){
    const hill=ball(level,x,-.4,-13,6+(x%3),5+(Math.abs(x)%4),4,'#77ba79');hill.castShadow=false;
    ball(level,x+7,-.8,-19,9,7,5,'#99cc92');
    const cloud=new THREE.Group();cloud.position.set(x+3,9+(Math.abs(x)%3),-15);level.add(cloud);for(let i=0;i<3;i++){const m=ball(cloud,(i-1)*1.2,i===1?.4:0,0,1.3,1,1,'#fffdf1');m.castShadow=false;}
  }
  for(let x=5;x<210;x+=9){if(!GROUND.some(([a,b])=>x>a&&x<b))continue;for(let i=0;i<3;i++)ball(level,x+i*.3,.2,-2.4,.4,.45,.35,'#489d5d');}
  for(const [x,h] of PIPES){cylinder(level,x,h/2,0,.91,h,'#29965a');cylinder(level,x,h-.12,0,1.06,.3,'#42ba70');cylinder(level,x,h+.036,0,.81,.035,'#174938');}
  const qm=new THREE.MeshStandardMaterial({map:questionTexture(),roughness:.55}),bm=new THREE.MeshStandardMaterial({map:brickTexture(),roughness:.85});
  const blockMeshes=new Map();for(const b of world.blocks){const m=new THREE.Mesh(boxGeo,b.type==='coin'||b.type==='mushroom'?qm:b.type==='brick'?bm:mat('#d4ae7a'));m.position.set(b.x,b.y,b.z);m.scale.set(.96,b.type==='stair'?.8:.96,b.type==='step'||b.type==='stair'?3:.96);m.castShadow=true;m.receiveShadow=true;level.add(m);blockMeshes.set(b,m);}
  // The flag and little castle remain visible as a tangible destination.
  cylinder(level,202,4.4,0,.055,8.8,'#e8e3cb');ball(level,202,8.85,0,.14,.14,.14,'#f5c249');
  const flagGeo=new THREE.BufferGeometry();flagGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-1.4,-.42,0,0,-.86,0],3));flagGeo.computeVertexNormals();const flag=new THREE.Mesh(flagGeo,new THREE.MeshStandardMaterial({color:'#f4f6df',side:THREE.DoubleSide}));flag.position.set(202,8.3,.1);level.add(flag);
  box(level,209,1.5,-.5,4,3,3,'#c8885d');box(level,209,2.9,-.5,4.3,.3,3.3,'#d9a279');for(const x of [207.5,208.5,209.5,210.5])box(level,x,3.35,-.5,.7,.7,3.1,'#c8885d');box(level,209,.8,1.02,.9,1.6,.06,'#554435');for(const x of [207.7,210.3])box(level,x,2,1.03,.4,.7,.06,'#674e38');
  const player=mario();scene.add(player.group);
  const enemies=new Map();for(const e of world.enemies){const g=goomba();scene.add(g);enemies.set(e,g);}
  const items=new Map(),sparks=[];
  let elapsed=0,yaw=0,pitch=.45,followX=3,camY=1.2;
  function burst(x,y,z,color,count=9){for(let i=0;i<count;i++){const m=box(scene,x,y,z,.1,.1,.1,color);sparks.push({mesh:m,v:new THREE.Vector3((Math.random()-.5)*3,2+Math.random()*3,(Math.random()-.5)*3),life:.7});}}
  function update(dt,camInput={},snap=false){
    elapsed+=dt;const p=world.player;
    yaw+=(camInput.yaw||0)*dt*1.8;pitch=THREE.MathUtils.clamp(pitch+(camInput.pitch||0)*dt*.8,.15,.95);if(camInput.reset){yaw=0;pitch=.45;}
    followX=snap?p.x:THREE.MathUtils.lerp(followX,p.x,1-Math.exp(-5*dt));camY=THREE.MathUtils.lerp(camY,1.2+Math.max(0,p.y-1.5)*.4,1-Math.exp(-3*dt));
    const distance=canvas.clientWidth/canvas.clientHeight<1.6?19:17;
    const target=new THREE.Vector3(followX+3,camY,0);camera.position.set(target.x+Math.sin(yaw)*distance,camY+Math.sin(pitch)*distance,Math.cos(yaw)*distance*Math.cos(pitch));camera.lookAt(target);
    sun.position.set(followX-12,25,12);sun.target.position.set(followX,0,0);
    player.group.position.set(p.x,p.y,p.z);player.group.rotation.y=p.facing;player.group.scale.setScalar(p.big?1.48:1);player.group.visible=p.invincible<=0||Math.floor(elapsed*14)%2===0;
    const moving=Math.hypot(p.vx,p.vz)>.2;const swing=moving?Math.sin(elapsed*(Math.hypot(p.vx,p.vz)*2.3))*.65:0;player.legs.forEach((l,i)=>l.rotation.x=p.grounded?swing*(i?1:-1):-.4);player.arms.forEach((a,i)=>a.rotation.x=p.grounded?-swing*(i?1:-1):-1.6);
    for(const [b,m] of blockMeshes){m.visible=b.alive;m.position.y=b.y+Math.sin(b.bump/.22*Math.PI)*.18;if(b.used)m.material=mat('#a8844c');}
    for(const [e,g] of enemies){g.visible=e.alive||e.squash>0;g.position.set(e.x,e.y,e.z);g.rotation.y=e.dir>0?Math.PI/2:-Math.PI/2;g.scale.y=e.alive?1+Math.sin(elapsed*9+e.x)*.04:.15;}
    for(const item of world.items){if(!items.has(item)){const m=item.type==='coin'?coin():mushroom();scene.add(m);items.set(item,m);}const m=items.get(item);m.visible=item.alive;m.position.set(item.x,item.y+(item.type==='coin'?Math.sin(elapsed*3+item.x)*.1:0),item.z);if(item.type==='coin')m.rotation.z=elapsed*1.8;}
    for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.life-=dt;s.v.y-=10*dt;s.mesh.position.addScaledVector(s.v,dt);s.mesh.rotation.x+=dt*4;if(s.life<=0){scene.remove(s.mesh);sparks.splice(i,1);}}
    if(world.status==='won')flag.position.y=Math.max(1.4,flag.position.y-dt*2);
    renderer.render(scene,camera);
  }
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  resize();
  return {renderer,scene,camera,update,resize,burst,get yaw(){return yaw;},dispose(){scene.traverse(o=>{if(o.isMesh&&o.geometry!==boxGeo&&o.geometry!==ballGeo)o.geometry.dispose();});qm.map.dispose();qm.dispose();bm.map.dispose();bm.dispose();renderer.dispose();}};
}

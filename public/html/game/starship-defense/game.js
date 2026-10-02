import * as THREE from './vendor/three.module.js';
import {ToyVisuals} from './toy-visuals.js?v=squad1';
import {FortressWorld} from './fortress-world.js?v=squad1';
import {HILL_FORTS,hillHeight,slopeSpeed} from './terrain-controls.js';
import {setupToyPlatform} from './toy-platform.js?v=squad1';
import {validateNormalSave} from './save-validation.js';
let visualAssets=false;
const frameTimes=[];let previousFrame=0,measuring=false;

"use strict";
/* ================= 全局工具 ================= */
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const rand=(a,b)=>a+Math.random()*(b-a);
const TAU=Math.PI*2;
const BASE_W=960;let BASE_H=540;
let isTouch=matchMedia('(pointer:coarse)').matches&&!matchMedia('(hover:hover)').matches;

/* ---------- 画布缩放 + 手机自动横屏 ---------- */
const stage=$('stage');
stage.classList.toggle('touch-mode',isTouch);
let rotated=false;
function fitStage(){
  let w=window.innerWidth,h=window.innerHeight;
  rotated=(h>w)&&isTouch; // 竖屏手机 → 旋转
  let vw=rotated?h:w, vh=rotated?w:h;
  BASE_H=BASE_W*vh/vw;stage.style.height=BASE_H+'px';
  const s=Math.min(vw/BASE_W,vh/BASE_H);
  stage.style.transform='translate(-50%,-50%) '+(rotated?'rotate(90deg) ':'')+'scale('+s+')';
}
window.addEventListener('resize',fitStage);window.addEventListener('orientationchange',()=>setTimeout(fitStage,120));
fitStage();
/* 把屏幕坐标转到舞台坐标（考虑旋转与缩放） */
function toStage(cx,cy){
  const r=stage.getBoundingClientRect();
  // rect 是旋转+缩放后的包围盒；用中心逆变换
  const mx=r.left+r.width/2, my=r.top+r.height/2;
  let dx=cx-mx, dy=cy-my;
  const s=Math.min((rotated?window.innerHeight:window.innerWidth)/BASE_W,(rotated?window.innerWidth:window.innerHeight)/BASE_H);
  dx/=s;dy/=s;
  if(rotated){const t=dx;dx=dy;dy=-t;}
  return {x:dx+BASE_W/2,y:dy+BASE_H/2};
}

/* ================= 音频系统 ================= */
const AudioSys={
  ctx:null,master:null,musicGain:null,started:false,bgmTimer:0,bgmStep:0,bgmMode:'calm',
  init(){
    if(this.ctx)return;
    try{
      this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      this.master=this.ctx.createGain();this.master.gain.value=.5;this.master.connect(this.ctx.destination);
      this.musicGain=this.ctx.createGain();this.musicGain.gain.value=.16;this.musicGain.connect(this.master);
    }catch(e){}
  },
  resume(){if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume();},
  tone(f,dur,type='square',vol=.2,slide=0,delay=0){
    if(!this.ctx)return;const t=this.ctx.currentTime+delay;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,f+slide),t+dur);
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.02);
  },
  noise(dur,vol=.2,fc=1200,delay=0){
    if(!this.ctx)return;const t=this.ctx.currentTime+delay;
    const n=Math.floor(this.ctx.sampleRate*dur),buf=this.ctx.createBuffer(1,n,this.ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
    const src=this.ctx.createBufferSource();src.buffer=buf;
    const f=this.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=fc;
    const g=this.ctx.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    src.connect(f);f.connect(g);g.connect(this.master);src.start(t);
  },
  sfx(name){
    if(!this.ctx)return;
    switch(name){
      case 'shoot':this.noise(.07,.12,3000);this.tone(880,.05,'square',.06,-500);break;
      case 'mg':this.noise(.05,.10,2600);break;
      case 'sniper':this.noise(.18,.22,1800);this.tone(220,.15,'sawtooth',.12,-160);break;
      case 'cannon':this.noise(.3,.3,900);this.tone(90,.3,'sine',.3,-40);break;
      case 'jump':this.tone(300,.15,'sine',.15,260);break;
      case 'hit':this.tone(160,.08,'square',.14,-60);break;
      case 'hurt':this.tone(200,.2,'sawtooth',.2,-140);break;
      case 'boom':this.noise(.45,.35,700);this.tone(70,.4,'sine',.3,-30);break;
      case 'coin':this.tone(988,.07,'square',.12);this.tone(1319,.12,'square',.12,0,.07);break;
      case 'heal':this.tone(523,.1,'sine',.14);this.tone(784,.15,'sine',.14,0,.1);break;
      case 'buy':this.tone(660,.08,'triangle',.16);this.tone(880,.1,'triangle',.16,0,.08);break;
      case 'build':this.noise(.12,.16,600);this.tone(330,.1,'square',.1,0,.1);break;
      case 'win':[523,659,784,1047].forEach((f,i)=>this.tone(f,.22,'triangle',.2,0,i*.13));break;
      case 'lose':[440,370,311,262].forEach((f,i)=>this.tone(f,.3,'sawtooth',.16,0,i*.18));break;
      case 'wave':this.tone(140,.5,'sawtooth',.22,60);this.tone(200,.5,'sawtooth',.18,80,.3);break;
      case 'click':this.tone(700,.05,'square',.1);break;
      case 'reload':this.tone(400,.06,'square',.1);this.tone(560,.06,'square',.1,0,.09);break;
      case 'airdrop':this.tone(500,.3,'sine',.14,-200);this.noise(.25,.12,800,.3);break;
      case 'vehicle':this.tone(120,.4,'sawtooth',.18,60);break;
    }
  },
  /* 简易BGM：小调分解和弦循环 */
  bgm(dt,inBattle){
    if(!this.ctx)return;
    this.bgmMode=inBattle?'battle':'calm';
    this.bgmTimer-=dt;
    if(this.bgmTimer<=0){
      const bpm=inBattle?150:92;this.bgmTimer=60/bpm/2;
      const calm=[[110,220,330],[98,196,294],[87,175,262],[98,196,294]];
      const battle=[[110,220,440],[110,220,415],[87,175,349],[131,262,392]];
      const prog=inBattle?battle:calm;
      const bar=Math.floor(this.bgmStep/8)%4,step=this.bgmStep%8;
      const ch=prog[bar];
      const f=ch[step%3]*(step===4?2:1);
      const o=this.ctx.createOscillator(),g=this.ctx.createGain();const t=this.ctx.currentTime;
      o.type=inBattle?'sawtooth':'triangle';o.frequency.value=f;
      g.gain.setValueAtTime(inBattle?.5:.4,t);g.gain.exponentialRampToValueAtTime(.001,t+(inBattle?.16:.3));
      o.connect(g);g.connect(this.musicGain);o.start(t);o.stop(t+.35);
      if(step===0){ // 底鼓
        const o2=this.ctx.createOscillator(),g2=this.ctx.createGain();
        o2.type='sine';o2.frequency.setValueAtTime(inBattle?100:80,t);o2.frequency.exponentialRampToValueAtTime(35,t+.12);
        g2.gain.setValueAtTime(.55,t);g2.gain.exponentialRampToValueAtTime(.001,t+.15);
        o2.connect(g2);g2.connect(this.musicGain);o2.start(t);o2.stop(t+.2);
      }
      this.bgmStep++;
    }
  }
};

/* ================= 输入系统 ================= */
const Input={
  keys:{},pressed:{},
  joy:{active:false,id:-1,x:0,y:0},
  camDrag:{id:-1,x:0},
  init(){
    window.addEventListener('keydown',e=>{
      if(e.target.closest?.('select,input')||(['Enter','Space'].includes(e.code)&&e.target.closest?.('button,[tabindex="0"]')))return;
      const k=this.mapKey(e.code);
      if(k){if(!this.keys[k])this.pressed[k]=true;this.keys[k]=true;e.preventDefault();}
      AudioSys.init();AudioSys.resume();
    });
    window.addEventListener('keyup',e=>{const k=this.mapKey(e.code);if(k)this.keys[k]=false;});
    // 每个控件独立捕获指针；菜单滚动不会占用摇杆。
    const jb=$('joyBase'),jk=$('joyKnob');
    jb.addEventListener('pointerdown',e=>{
      if(this.joy.id!==-1)return;
      e.preventDefault();jb.setPointerCapture(e.pointerId);
      const p=toStage(e.clientX,e.clientY);
      this.joy={id:e.pointerId,active:true,cx:p.x,cy:p.y,x:0,y:0};
      AudioSys.init();AudioSys.resume();
    });
    jb.addEventListener('pointermove',e=>{
      if(e.pointerId!==this.joy.id)return;
      const p=toStage(e.clientX,e.clientY);
      let x=(p.x-this.joy.cx)/45,y=(p.y-this.joy.cy)/45;
      const m=Math.hypot(x,y);if(m>1){x/=m;y/=m;}
      this.joy.x=x;this.joy.y=y;
      jk.style.left=(35+x*35)+'px';jk.style.top=(35+y*35)+'px';
    });
    const end=e=>{if(e.pointerId===this.joy.id){this.joy={active:false,id:-1,x:0,y:0};jk.style.left=jk.style.top='35px';}};
    ['pointerup','pointercancel','lostpointercapture'].forEach(t=>jb.addEventListener(t,end));
    const bind=(id,key)=>{
      const el=$(id);let pointer=null;
      el.setAttribute('role','button');el.setAttribute('tabindex','0');
      el.addEventListener('pointerdown',e=>{
        if(pointer!==null)return;
        e.preventDefault();pointer=e.pointerId;el._pointer=pointer;el.setPointerCapture(pointer);
        if(!this.keys[key])this.pressed[key]=true;
        this.keys[key]=true;el.classList.add('on');AudioSys.init();AudioSys.resume();
      });
      const up=e=>{if(e.pointerId!==pointer)return;pointer=null;el._pointer=null;this.keys[key]=false;el.classList.remove('on');};
      ['pointerup','pointercancel','lostpointercapture'].forEach(t=>el.addEventListener(t,up));
    };
    ['J','K','U','I','O','L','V','P','C','Q','E'].forEach(k=>bind('v'+k,k));
    window.addEventListener('blur',()=>this.reset());
    window.addEventListener('resize',()=>this.reset());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();});
  },
  reset(){
    this.keys={};this.pressed={};this.joy={active:false,id:-1,x:0,y:0};
    $('joyKnob').style.left=$('joyKnob').style.top='35px';
    document.querySelectorAll('.vbtn.on').forEach(el=>{if(el._pointer!=null&&el.hasPointerCapture(el._pointer))el.releasePointerCapture(el._pointer);el.classList.remove('on');});
  },
  mapKey(c){
    const m={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',
      KeyJ:'J',Enter:'J',KeyK:'K',Space:'K',KeyU:'U',KeyI:'I',KeyL:'L',KeyO:'O',KeyP:'P',KeyB:'P',KeyV:'V',KeyC:'C',KeyQ:'Q',KeyE:'E'};
    return m[c];
  },
  axis(){
    let x=0,y=0;
    if(this.keys.left)x-=1;if(this.keys.right)x+=1;
    if(this.keys.up)y-=1;if(this.keys.down)y+=1;
    if(this.joy.active){x=this.joy.x;y=this.joy.y;}
    const m=Math.hypot(x,y);if(m>1){x/=m;y/=m;}
    return{x,y};
  },
  pop(k){const v=this.pressed[k];this.pressed[k]=false;return v;},
  clearFrame(){this.pressed={};}
};
Input.init();
/* ================= Three.js 场景 ================= */
const renderer=new THREE.WebGLRenderer({canvas:$('c3d'),antialias:true});
renderer.setSize(BASE_W,BASE_H,false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x0a1830);
scene.fog=new THREE.Fog(0x0a1830,90,260);
const camera=new THREE.PerspectiveCamera(60,BASE_W/BASE_H,.1,600);
window.addEventListener('resize',()=>{renderer.setSize(BASE_W,BASE_H,false);camera.aspect=BASE_W/BASE_H;camera.updateProjectionMatrix();});
let camYaw=0,camDist=16,camH=9,camView=0;
const CAMERA_VIEWS=[{yaw:0,d:10,h:6.2,name:'玩具跟随'},{yaw:Math.PI/2,d:16,h:11,name:'侧面斜视'},{yaw:Math.PI,d:10,h:5.7,name:'正面近景'},{yaw:0,d:7,h:24,name:'俯视'}];
function setCameraView(index,notify=true){
  camView=index%CAMERA_VIEWS.length;
  const v=CAMERA_VIEWS[camView];camYaw=v.yaw;camDist=v.d;camH=v.h;
  if(notify)showMsg('视角：'+v.name,1.2);
  updCamera(1);
}

/* 灯光 */
const hemi=new THREE.HemisphereLight(0x88aaff,0x37342d,.75);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffeecc,1.1);
sun.position.set(40,70,-30);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-48;sun.shadow.camera.right=48;sun.shadow.camera.top=48;sun.shadow.camera.bottom=-48;sun.shadow.bias=-.0004;sun.shadow.normalBias=.08;sun.shadow.camera.far=250;
scene.add(sun);

/* ---------- 地形：基地高台在 z<0 侧，野地朝 +z 延伸 ---------- */
const WORLD={minX:-80,maxX:80,minZ:-60,maxZ:200,baseZ:-30};
/* 基地高台：整个基地地基高于平地，正面一条斜坡通向城门 */
const PLAT={H:5,x0:-38,x1:38,zFront:-10,rampW:7,rampTop:-14,rampBot:8,edge:5};
const GATE_TOP=PLAT.H+4.6; // 城门塔楼平台高度（绝对Y）
function smooth01(t){t=clamp(t,0,1);return t*t*(3-2*t);}
function plateauH(x,z){
  const e=PLAT.edge;
  const sx=smooth01(Math.min(x-PLAT.x0,PLAT.x1-x)/e);
  const sz=smooth01((PLAT.zFront-z)/e);
  let h=PLAT.H*Math.min(sx,sz);
  if(Math.abs(x)<PLAT.rampW+e&&z>PLAT.rampTop-2&&z<PLAT.rampBot){
    const t=clamp((PLAT.rampBot-z)/(PLAT.rampBot-PLAT.rampTop),0,1);
    const sxr=smooth01((PLAT.rampW+e-Math.abs(x))/e);
    h=Math.max(h,PLAT.H*t*sxr);
  }
  // 城门塔楼平台（与城墙同高的瞭望台）+ 基地内侧斜梯：关门后可登塔越墙瞭望
  if(Math.abs(x)>6.8&&Math.abs(x)<10.7){
    if(z>=-19.6&&z<=-12.4)h=Math.max(h,GATE_TOP); // 塔楼平台
    else if(z<-19.6&&z>=-26.6){ // 内侧斜梯（坡度0.66，可步行）
      const t=clamp((z+26.6)/7,0,1);
      h=Math.max(h,PLAT.H+(GATE_TOP-PLAT.H)*t);
    }
  }
  return h;
}
function terrainH(x,z){
  let h=Math.max(plateauH(x,z),hillHeight(x,z));
  const hills=[[0,150,22,8],[-40,160,14,5],[50,55,12,4]];
  for(const [hx,hz,r,hh] of hills){
    const d=Math.hypot(x-hx,z-hz);
    if(d<r)h=Math.max(h,hh*Math.cos(d/r*Math.PI/2)**2);
  }
  return h;
}
/* 坡度过陡（悬崖）则地面单位不可通行，只能走斜坡 */
function tooSteep(x,z){
  const d=.6;
  const sx=Math.abs(terrainH(x+d,z)-terrainH(x-d,z));
  const sz=Math.abs(terrainH(x,z+d)-terrainH(x,z-d));
  return Math.max(sx,sz)/(2*d)>.75;
}
(function buildGround(){
  const g=new THREE.PlaneGeometry(WORLD.maxX-WORLD.minX,WORLD.maxZ-WORLD.minZ,130,170);
  g.rotateX(-Math.PI/2);
  const pos=g.attributes.position;
  const colors=[];
  const c1=new THREE.Color(0x4c9a70),c2=new THREE.Color(0x6caf77),c3=new THREE.Color(0x87ac62);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i)+ (WORLD.maxZ+WORLD.minZ)/2;
    const h=terrainH(x,z);
    pos.setY(i,h);
    const t=clamp(h/8,0,1);
    const c=c1.clone().lerp(c2,Math.abs(Math.sin(x*.045)*Math.cos(z*.05))*.7).lerp(c3,t*.5);
    const lane=1-smooth01((Math.abs(x-Math.sin(z*.022)*3)-6)/5);
    if(z>-18)c.lerp(new THREE.Color(0xd4bd88),lane*.85);
    if(z<-13&&Math.abs(x)<35)c.lerp(new THREE.Color(0xb4c8af),.85);
    if(h>1&&h<4.8&&z<2&&Math.abs(x)>12)c.lerp(new THREE.Color(0xc1a779),.7);
    colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true}));
  m.position.z=(WORLD.maxZ+WORLD.minZ)/2;
  m.receiveShadow=true;scene.add(m);
})();
/* 装饰：岩石与荧光植物 */
const rockColliders=[];
(function deco(){
  const rockG=new THREE.DodecahedronGeometry(1,0);
  const rockM=new THREE.MeshLambertMaterial({color:0xc8b996});
  const scatter=(geometry,material,count,plant=false)=>{
    const batch=new THREE.InstancedMesh(geometry,material,count),dummy=new THREE.Object3D();
    for(let i=0;i<count;i++){
      let x,z;
      do{x=rand(WORLD.minX,WORLD.maxX);z=rand(12,WORLD.maxZ-10);}while(Math.abs(x)<8||Math.abs(x+42)<10&&Math.abs(z-49)<16||Math.abs(x-30)<10&&Math.abs(z-34)<12||HILL_FORTS.some(f=>Math.abs(x-f.x)<10&&Math.abs(z-f.z)<f.r));
      const s=plant?rand(.7,1.3):rand(.7,3.2);
      if(!plant)rockColliders.push({x,z,r:s*.82,bottom:terrainH(x,z)-s*.5,top:terrainH(x,z)+s*1.15});
      dummy.position.set(x,terrainH(x,z)+s*.35,z);dummy.rotation.set(0,rand(0,TAU),plant?rand(-.3,.3):0);dummy.scale.set(s,s*(plant?1:rand(.5,.85)),s);dummy.updateMatrix();batch.setMatrixAt(i,dummy.matrix);
    }
    batch.castShadow=!plant;batch.receiveShadow=true;scene.add(batch);
  };
  scatter(rockG,rockM,65);
  scatter(new THREE.ConeGeometry(.2,.8,5),new THREE.MeshLambertMaterial({color:0x5eaa84}),80,true);
  // 星空
  const starG=new THREE.BufferGeometry();
  const sp=[];for(let i=0;i<400;i++){const a=rand(0,TAU),r2=rand(150,400);sp.push(Math.cos(a)*r2,rand(40,240),Math.sin(a)*r2);}
  starG.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));
  scene.add(new THREE.Points(starG,new THREE.PointsMaterial({color:0xaaccff,size:1.6,sizeAttenuation:false})));
  // 远处星球
  const planet=new THREE.Mesh(new THREE.SphereGeometry(30,24,24),new THREE.MeshBasicMaterial({color:0xe5d7ad}));
  planet.position.set(-120,90,320);scene.add(planet);
})();

const fortress=new FortressWorld(scene,terrainH);
fortress.solids.push(...rockColliders);

/* ---------- 血条精灵 ---------- */
function makeHPBar(w=1.6,color='#3f6'){
  const cv=document.createElement('canvas');cv.width=64;cv.height=10;
  const tex=new THREE.CanvasTexture(cv);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true,depthWrite:false}));
  sp.scale.set(w,w*10/64,1);
  sp.userData={cv,tex,color,last:-1};
  return sp;
}
function updHPBar(sp,ratio){
  ratio=clamp(ratio,0,1);
  if(Math.abs(ratio-sp.userData.last)<.01)return;
  sp.userData.last=ratio;
  sp.visible=ratio<.995;
  const ctx=sp.userData.cv.getContext('2d');
  ctx.clearRect(0,0,64,10);
  ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(0,0,64,10);
  ctx.fillStyle=ratio>.5?sp.userData.color:(ratio>.25?'#fa0':'#f33');
  ctx.fillRect(1,1,62*ratio,8);
  sp.userData.tex.needsUpdate=true;
}

/* ---------- 粒子系统 ---------- */
const particles=[];
const partGeo=new THREE.SphereGeometry(.14,5,4);
function spawnParticles(pos,color,n=8,speed=6,life=.5,size=1,gravity=9){
  n=Math.min(n,Math.max(0,160-particles.length));
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(partGeo,new THREE.MeshBasicMaterial({color,transparent:true}));
    m.position.copy(pos);
    const a=rand(0,TAU),b=rand(-1,1);
    m.userData={vx:Math.cos(a)*speed*rand(.3,1),vy:rand(.5,1)*speed*.8*b+3,vz:Math.sin(a)*speed*rand(.3,1),life,t:0,g:gravity};
    m.scale.setScalar(size*rand(.6,1.4));
    scene.add(m);particles.push(m);
  }
}
function updParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i],u=p.userData;u.t+=dt;
    if(u.t>=u.life){scene.remove(p);p.material.dispose();particles.splice(i,1);continue;}
    p.position.x+=u.vx*dt;p.position.y+=u.vy*dt;p.position.z+=u.vz*dt;
    u.vy-=u.g*dt;
    p.material.opacity=1-u.t/u.life;
  }
}

/* ================= 数据定义 ================= */
const WEAPONS={
  smg:{name:'冲锋枪',dmg:6,rate:.11,range:26,speed:55,spread:.06,price:0,color:0xffee88,sfx:'mg',auto:true},
  lmg:{name:'轻机枪',dmg:8,rate:.08,range:30,speed:60,spread:.07,price:0,color:0xffcc44,sfx:'mg',auto:true},
  rifle:{name:'战斗步枪',dmg:26,rate:.38,range:42,speed:80,spread:.015,price:0,color:0x88ffee,sfx:'shoot',auto:true},
  shotgun:{name:'霰弹枪',dmg:10,rate:.85,range:17,speed:45,spread:.22,pellets:5,price:450,color:0xffaa66,sfx:'shoot',auto:true,desc:'一次5发弹丸，近距离毁灭'},
  sniper:{name:'狙击枪',dmg:110,rate:1.1,range:70,speed:140,spread:.002,price:600,color:0x66aaff,sfx:'sniper',auto:true},
  launcher:{name:'榴弹炮',dmg:70,rate:1.3,range:38,speed:34,spread:.02,price:900,color:0xff8844,sfx:'cannon',auto:true,explode:4,arc:true},
  flamer:{name:'火焰喷射器',dmg:5,rate:.05,range:13,speed:26,spread:.14,price:1100,color:0xff6622,sfx:'mg',auto:true,flame:true,desc:'持续灼烧，近战群伤'},
  laser:{beam:true,desc:'按住射击：持续脉冲光束，命中即时生效',name:'脉冲激光炮',dmg:13,rate:.1,range:40,speed:170,spread:.01,price:1500,color:0x44ffff,sfx:'shoot',auto:true},
  minigun:{name:'加特林',dmg:7,rate:.045,range:28,speed:65,spread:.09,price:1900,color:0xffee88,sfx:'mg',auto:true,desc:'极致射速弹幕压制'},
  plasma:{name:'等离子炮',dmg:45,rate:.22,range:36,speed:50,spread:.03,price:1600,color:0xcc66ff,sfx:'shoot',auto:true,explode:2},
  missile:{name:'追踪导弹',dmg:55,rate:.55,range:48,speed:30,spread:0,price:2200,color:0x88ff88,sfx:'cannon',auto:true,explode:3.5,homing:true,desc:'自动追踪敌人'},
  railgun:{name:'电磁轨道炮',dmg:300,rate:2.0,range:95,speed:240,spread:0,price:2800,color:0x88ccff,sfx:'sniper',auto:true,pierce:2,desc:'贯穿最多3个敌人'},
};
const CLASSES={
  gunner:{name:'机枪兵',hp:120,speed:9.5,weapon:'lmg',color:0x3a7bd5},
  rifle:{name:'火枪兵',hp:100,speed:10.5,weapon:'rifle',color:0xd58a3a},
  medic:{name:'医疗兵',hp:90,speed:10.5,weapon:'smg',color:0x3ad57b,heal:3},
};
const VEHICLES={
  jeep:{name:'突击战车',hp:300,speed:17,dmg:10,rate:.09,range:30,price:800,seatH:1.2,scale:1,sfx:'mg',color:0x557a3a},
  tank:{name:'重型坦克',hp:900,speed:8,dmg:90,rate:1.4,range:42,price:2200,seatH:1.6,scale:1,sfx:'cannon',explode:4,color:0x4a5d23},
  mech:{name:'雷神机甲',hp:600,speed:11,dmg:22,rate:.14,range:34,price:1800,seatH:2.6,scale:1,sfx:'mg',color:0x7a8899},
  heli:{name:'武装直升机',hp:400,speed:19,dmg:14,rate:.1,range:36,price:2600,seatH:6,fly:true,sfx:'mg',color:0x3a5a7a},
};
const BUILDINGS={
  antiAir:{name:'防空激光塔',hp:400,price:650,dmg:34,rate:.35,range:52,desc:'专门锁定飞虫，光束即时命中'},
  wall:{name:'合金围墙',hp:500,price:100,desc:'阻挡虫群前进'},
  mgTurret:{name:'自动机枪塔',hp:250,price:300,dmg:7,rate:.14,range:26,desc:'自动扫射敌人'},
  cannonTurret:{name:'自动炮台',hp:350,price:700,dmg:60,rate:1.6,range:36,explode:3.5,desc:'范围爆炸伤害'},
  teslaTurret:{name:'特斯拉塔',hp:300,price:1100,dmg:30,rate:.7,range:20,desc:'电弧连锁，最多跳3个目标'},
  sniperTurret:{name:'狙击炮台',hp:280,price:1000,dmg:160,rate:1.9,range:55,desc:'超远程精确狙杀'},
  bunker:{name:'重型堡垒',hp:1200,price:1200,dmg:12,rate:.12,range:30,desc:'超高血量+双联机枪'},
};
const ITEMS={
  medkit:{name:'医疗包',price:120,desc:'按I回复60生命',heal:60},
  grenade:{name:'手雷×3',price:100,desc:'按U投掷,范围伤害',count:3},
  shield:{name:'护盾电池',price:300,desc:'获得60点能量护盾(上限150)',shield:60},
  adren:{name:'肾上腺素',price:250,desc:'20秒内移速+40%、射速+40%',buff:20},
  hpUp:{name:'强化装甲',price:500,desc:'最大生命+30',permanent:true},
  magnet:{name:'磁力收集器',price:800,desc:'永久：拾取物自动吸附范围大增',permanent:true},
  regen:{name:'再生背心',price:1000,desc:'永久：每秒回复2生命',permanent:true},
  repair:{name:'基地维修包',price:400,desc:'基地回复500耐久'},
};
/* 精英词缀：战中出现，属性强化+特效 */
const ELITES={
  swift:{name:'迅捷',color:0x66ff66,speedMul:1.5,hpMul:1.6},
  armored:{name:'坚甲',color:0x88aaff,hpMul:3,dmgMul:1.2},
  savage:{name:'狂暴',color:0xff4488,dmgMul:2.2,speedMul:1.2},
  venom:{name:'剧毒',color:0xaaff44,ranged:true,dmgMul:1.3},
  bomber:{name:'爆死',color:0xff8822,explodeOnDie:true,hpMul:1.5},
  giant:{name:'巨型',color:0xffcc00,scaleMul:1.55,hpMul:2.4,dmgMul:1.5},
};
/* 10章怪物图鉴：颜色/体型/能力递增；bs=BOSS技能池（冲锋/弹幕/召唤） */
const CHAPTERS=[
  {name:'虫族小兵',color:0xcc6633,boss:'巨颚虫王',bossColor:0xff5522,mob:{hp:30,dmg:8,speed:5,gold:12},legs:4,bs:['charge']},
  {name:'酸液虫',color:0x88cc22,boss:'毒雾之母',bossColor:0xaaff22,mob:{hp:55,dmg:12,speed:5.5,gold:16},legs:4,ranged:true,bs:['barrage']},
  {name:'甲壳战虫',color:0x8866aa,boss:'装甲暴君',bossColor:0xbb66ff,mob:{hp:110,dmg:16,speed:4.5,gold:22},legs:6,bs:['charge']},
  {name:'迅猛飞虫',color:0x44bbcc,boss:'风暴翼后',bossColor:0x33eeff,mob:{hp:80,dmg:14,speed:8,gold:26},legs:2,fly:true,bs:['barrage']},
  {name:'炎爆虫',color:0xdd4422,boss:'熔岩巨兽',bossColor:0xff3300,mob:{hp:150,dmg:22,speed:5,gold:32},legs:4,explodeOnDie:true,bs:['charge','barrage']},
  {name:'寄生蛛虫',color:0x99aa33,boss:'万蛛之巢',bossColor:0xccdd11,mob:{hp:130,dmg:18,speed:6.5,gold:36},legs:8,split:true,bs:['summon','charge']},
  {name:'雷鞭虫',color:0x3366ee,boss:'雷暴主宰',bossColor:0x5588ff,mob:{hp:200,dmg:26,speed:6,gold:42},legs:6,ranged:true,bs:['barrage','summon']},
  {name:'幽影刺虫',color:0x555577,boss:'虚空猎手',bossColor:0x8888cc,mob:{hp:180,dmg:32,speed:8.5,gold:48},legs:4,stealth:true,bs:['charge']},
  {name:'钢铁巨虫',color:0x777777,boss:'泰坦碾压者',bossColor:0xaaaaaa,mob:{hp:400,dmg:36,speed:4,gold:56},legs:6,bs:['charge','summon']},
  {name:'虫族亲卫',color:0xaa2255,boss:'虫巢意志',bossColor:0xff0066,mob:{hp:350,dmg:42,speed:7,gold:66},legs:8,ranged:true,bs:['barrage','summon','charge']},
];

/* ================= 模型构建（纯代码几何体） ================= */
/**
 * img2threejs-style factory — Mobile Infantry trooper (星河战队步兵).
 * Procedural power-armor with named nodes, gun socket, leg pivots, sculptRuntime.
 */
function createMobileInfantryModel(spec){
  spec=spec||{};
  const color=spec.color!=null?spec.color:0xd5d53a;
  const root=new THREE.Group();
  root.name='MobileInfantryRoot';
  const armor=new THREE.MeshLambertMaterial({color});
  const dark=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(.42)});
  const trim=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(.78)});
  const visorM=new THREE.MeshBasicMaterial({color:0x66eeff,transparent:true,opacity:.92});
  const nodes={};

  const pack=new THREE.Mesh(new THREE.BoxGeometry(.58,.78,.38),dark);
  pack.position.set(0,1.34,-.3);pack.castShadow=true;root.add(pack);nodes.backpack=pack;

  const torso=new THREE.Mesh(new THREE.BoxGeometry(.74,1.08,.44),armor);
  torso.position.set(0,1.14,0);torso.castShadow=true;root.add(torso);nodes.torso=torso;

  const chest=new THREE.Mesh(new THREE.BoxGeometry(.52,.36,.1),trim);
  chest.position.set(0,1.36,.24);root.add(chest);

  const belt=new THREE.Mesh(new THREE.BoxGeometry(.68,.14,.46),dark);
  belt.position.set(0,.72,.02);root.add(belt);

  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.34,12,10),armor);
  helmet.scale.set(1,.9,1.06);helmet.position.set(0,1.92,0);helmet.castShadow=true;
  root.add(helmet);nodes.helmet=helmet;

  const crest=new THREE.Mesh(new THREE.BoxGeometry(.12,.22,.28),trim);
  crest.position.set(0,2.18,.02);root.add(crest);

  const visor=new THREE.Mesh(new THREE.BoxGeometry(.44,.15,.2),visorM);
  visor.position.set(0,1.94,.3);root.add(visor);nodes.visor=visor;

  for(const s of[-1,1]){
    const pad=new THREE.Mesh(new THREE.BoxGeometry(.3,.2,.34),trim);
    pad.position.set(.48*s,1.56,.04);pad.castShadow=true;root.add(pad);
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(.11,.1,.52,6),armor);
    arm.rotation.z=Math.PI/2;arm.position.set(.58*s,1.26,.12);arm.castShadow=true;root.add(arm);
  }

  const gun=new THREE.Mesh(new THREE.BoxGeometry(.14,.14,1.05),dark);
  gun.position.set(.34,1.16,.72);gun.castShadow=true;root.add(gun);nodes.gun=gun;

  const legL=new THREE.Mesh(new THREE.BoxGeometry(.22,.62,.24),dark);
  legL.position.set(-.22,.31,0);legL.castShadow=true;root.add(legL);
  const legR=legL.clone();legR.position.x=.22;root.add(legR);
  const bootL=new THREE.Mesh(new THREE.BoxGeometry(.24,.18,.34),armor);
  bootL.position.set(-.22,.08,.06);bootL.castShadow=true;root.add(bootL);
  const bootR=bootL.clone();bootR.position.x=.22;root.add(bootR);

  root.userData.legs=[legL,legR];
  root.userData.gun=gun;
  root.userData.sculptRuntime={
    nodes,legs:[legL,legR],gun,
    spec:{color},factory:'createMobileInfantryModel'
  };
  root.userData.tick=function(dt,t){
    if(nodes.visor)nodes.visor.material.opacity=.78+Math.sin(t*6)*.18;
    if(nodes.helmet)nodes.helmet.position.y=1.92+Math.sin(t*3.2)*.012;
    if(nodes.torso)nodes.torso.rotation.x=Math.sin(t*2)*.01;
  };
  return root;
}
function makeSoldier(color){
  return visualAssets ? visuals.soldier(color) : createMobileInfantryModel({color});
}
function makeBug(color,legs=4,scale=1,fly=false){
  if(visualAssets)return visuals.bug(scale,'mob',fly);
  const grp=new THREE.Group();
  const mat=new THREE.MeshLambertMaterial({color});
  const dark=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(.5)});
  const body=new THREE.Mesh(new THREE.SphereGeometry(.7,10,8),mat);
  body.scale.set(1,.7,1.4);body.position.y=.7;body.castShadow=true;grp.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.4,8,6),mat);head.position.set(0,.75,.95);grp.add(head);
  const eyeM=new THREE.MeshBasicMaterial({color:0xff2200});
  for(const s of[-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(.1,6,4),eyeM);e.position.set(.18*s,.9,1.25);grp.add(e);}
  for(const s of[-1,1]){ // 大颚
    const jaw=new THREE.Mesh(new THREE.ConeGeometry(.09,.5,4),dark);
    jaw.position.set(.25*s,.6,1.25);jaw.rotation.x=Math.PI/2.4;jaw.rotation.z=-.4*s;grp.add(jaw);
  }
  const legGroup=[];
  const nSide=Math.max(1,Math.floor(legs/2));
  for(let i=0;i<nSide;i++)for(const s of[-1,1]){
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.05,.03,1.1,4),dark);
    leg.position.set(.62*s,.45,-.5+i*(1.4/nSide));
    leg.rotation.z=s*.9;grp.add(leg);legGroup.push(leg);
  }
  if(fly){
    const wingM=new THREE.MeshBasicMaterial({color:0xccffee,transparent:true,opacity:.4,side:THREE.DoubleSide});
    for(const s of[-1,1]){
      const w=new THREE.Mesh(new THREE.PlaneGeometry(1.4,.5),wingM);
      w.position.set(.8*s,1.1,0);w.rotation.z=s*.3;grp.add(w);grp.userData['wing'+(s>0?'R':'L')]=w;
    }
  }
  grp.userData.legGroup=legGroup;
  grp.scale.setScalar(scale);
  return grp;
}

/**
 * img2threejs-style factory — Klendathu arachnid (BOSS / mini-BOSS).
 * Procedural rebuild with named nodes, leg pivots, mandible sockets, sculptRuntime.
 */
function createArachnidBugModel(spec){
  spec=spec||{};
  const color=spec.color!=null?spec.color:0xff5522;
  const legs=spec.legs!=null?spec.legs:4;
  const fly=!!spec.fly;
  const scale=spec.scale!=null?spec.scale:1;
  const isBoss=!!spec.boss;
  const root=new THREE.Group();
  root.name='ArachnidBugRoot';
  const carapace=new THREE.MeshLambertMaterial({color});
  const chitin=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(.72)});
  const dark=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(.42)});
  const eyeM=new THREE.MeshBasicMaterial({color:0xff1100});
  const nodes={};

  const abdomen=new THREE.Mesh(new THREE.SphereGeometry(.85,12,10),carapace);
  abdomen.scale.set(1.05,.75,1.55);abdomen.position.set(0,.85,-.35);abdomen.castShadow=true;
  root.add(abdomen);nodes.abdomen=abdomen;
  for(let i=0;i<5;i++){
    const seg=new THREE.Mesh(new THREE.TorusGeometry(.62-i*.09,.07,5,10),chitin);
    seg.rotation.x=Math.PI/2;seg.position.set(0,.78,-.15-i*.28);root.add(seg);
  }
  const thorax=new THREE.Mesh(new THREE.SphereGeometry(.62,12,10),carapace);
  thorax.scale.set(1.1,.82,1.15);thorax.position.set(0,.95,.55);thorax.castShadow=true;
  root.add(thorax);nodes.thorax=thorax;
  const head=new THREE.Mesh(new THREE.SphereGeometry(.46,12,10),carapace);
  head.scale.set(1.15,.95,1.05);head.position.set(0,1.02,1.05);head.castShadow=true;
  root.add(head);nodes.head=head;
  for(const s of[-1,1]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(isBoss?.13:.1,8,6),eyeM);
    eye.position.set(.22*s,1.12,1.38);root.add(eye);
    const brow=new THREE.Mesh(new THREE.BoxGeometry(.18,.06,.12),dark);
    brow.position.set(.24*s,1.2,1.28);brow.rotation.z=.25*s;root.add(brow);
  }
  const mandibles=[];
  for(const s of[-1,1]){
    const pivot=new THREE.Group();pivot.position.set(.32*s,.82,1.18);
    const jaw=new THREE.Mesh(new THREE.ConeGeometry(.11,.72,5),dark);
    jaw.rotation.x=Math.PI/2.1;jaw.rotation.z=-.35*s;jaw.position.set(0,0,.36);
    pivot.add(jaw);
    const fang=new THREE.Mesh(new THREE.ConeGeometry(.04,.22,4),new THREE.MeshBasicMaterial({color:0xffffaa}));
    fang.rotation.x=Math.PI/2;fang.position.set(0,-.04,.62);pivot.add(fang);
    root.add(pivot);mandibles.push(pivot);
  }
  nodes.mandibles=mandibles;
  for(let i=0;i<(isBoss?5:3);i++){
    const spine=new THREE.Mesh(new THREE.ConeGeometry(.06,.45,4),chitin);
    spine.position.set(0,1.05+.08*i,.15-i*.18);spine.rotation.x=-.35;root.add(spine);
  }
  if(fly){
    const wingM=new THREE.MeshBasicMaterial({color:0xccffee,transparent:true,opacity:.38,side:THREE.DoubleSide});
    for(const s of[-1,1]){
      const w=new THREE.Mesh(new THREE.PlaneGeometry(isBoss?2.1:1.6,isBoss?.72:.55),wingM);
      w.position.set(1.05*s,1.35,.05);w.rotation.z=s*.32;root.add(w);
      root.userData[s>0?'wingR':'wingL']=w;
    }
  }
  const legGroup=[];
  const legPivots=[];
  const nSide=Math.max(1,Math.floor(legs/2));
  for(let i=0;i<nSide;i++)for(const s of[-1,1]){
    const hip=new THREE.Group();
    hip.position.set(.78*s,.62,-.55+i*(1.35/nSide));
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(.07,.05,.75,5),dark);
    upper.rotation.z=s*.95;upper.position.set(0,-.35,0);upper.castShadow=true;
    const knee=new THREE.Group();knee.position.set(0,-.7,0);
    const lower=new THREE.Mesh(new THREE.CylinderGeometry(.05,.025,.85,4),dark);
    lower.rotation.z=s*.25;lower.position.set(0,-.42,0);
    const claw=new THREE.Mesh(new THREE.ConeGeometry(.05,.18,4),chitin);
    claw.rotation.x=Math.PI;claw.position.set(0,-.88,0);
    knee.add(lower);knee.add(claw);hip.add(upper);hip.add(knee);
    root.add(hip);legGroup.push(knee);legPivots.push(hip);
  }
  root.userData.legGroup=legGroup;
  root.userData.sculptRuntime={nodes,legGroup,legPivots,mandibles,spec:{color,legs,fly,scale,boss:isBoss},factory:'createArachnidBugModel'};
  root.userData.tick=function(dt,t){
    mandibles.forEach(function(m,i){m.rotation.x=Math.sin(t*6+i)*.18;});
    if(nodes.head)nodes.head.position.y=1.02+Math.sin(t*4)*.015;
  };
  root.scale.setScalar(scale);
  return root;
}

function makeVehicleMesh(kind){
  if(visualAssets&&kind==='mech')return visuals.mech();
  const cfg=VEHICLES[kind];
  const grp=new THREE.Group();
  const mat=new THREE.MeshLambertMaterial({color:cfg.color});
  const dark=new THREE.MeshLambertMaterial({color:0x222222});
  if(kind==='jeep'){
    const b=new THREE.Mesh(new THREE.BoxGeometry(2,.8,3.4),mat);b.position.y=.9;b.castShadow=true;grp.add(b);
    const top=new THREE.Mesh(new THREE.BoxGeometry(1.6,.5,1.4),mat);top.position.set(0,1.5,-.4);grp.add(top);
    const gun=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,1.6),dark);gun.position.set(0,1.9,.6);grp.add(gun);grp.userData.gun=gun;
    for(const [x,z] of [[-1,1.1],[1,1.1],[-1,-1.1],[1,-1.1]]){
      const w=new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,.3,10),dark);
      w.rotation.z=Math.PI/2;w.position.set(x,.45,z);grp.add(w);
    }
  }else if(kind==='tank'){
    const b=new THREE.Mesh(new THREE.BoxGeometry(2.6,1,4.2),mat);b.position.y=1;b.castShadow=true;grp.add(b);
    const tr=new THREE.Mesh(new THREE.BoxGeometry(.7,.9,4.4),dark);tr.position.set(-1.4,.6,0);grp.add(tr);
    const tr2=tr.clone();tr2.position.x=1.4;grp.add(tr2);
    const tur=new THREE.Mesh(new THREE.CylinderGeometry(1,1.2,.7,10),mat);tur.position.y=1.9;grp.add(tur);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.14,.17,3.4,8),dark);
    barrel.rotation.x=Math.PI/2;barrel.position.set(0,2,1.8);grp.add(barrel);grp.userData.gun=barrel;
  }else if(kind==='mech'){
    const b=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.6,1.1),mat);b.position.y=2.6;b.castShadow=true;grp.add(b);
    const head=new THREE.Mesh(new THREE.BoxGeometry(.8,.6,.8),mat);head.position.y=3.7;grp.add(head);
    const visor=new THREE.Mesh(new THREE.BoxGeometry(.6,.15,.1),new THREE.MeshBasicMaterial({color:0xff4444}));visor.position.set(0,3.75,.45);grp.add(visor);
    for(const s of[-1,1]){
      const leg=new THREE.Mesh(new THREE.BoxGeometry(.5,1.8,.7),dark);leg.position.set(.55*s,.9,0);leg.castShadow=true;grp.add(leg);
      const arm=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,1.8),dark);arm.position.set(1.1*s,2.6,.5);grp.add(arm);
      if(s>0)grp.userData.gun=arm;
    }
  }else if(kind==='heli'){
    const b=new THREE.Mesh(new THREE.SphereGeometry(1.1,10,8),mat);b.scale.set(.9,.8,1.8);b.position.y=1.2;b.castShadow=true;grp.add(b);
    const tail=new THREE.Mesh(new THREE.CylinderGeometry(.15,.3,3,6),mat);tail.rotation.x=Math.PI/2;tail.position.set(0,1.4,-2.6);grp.add(tail);
    const rotor=new THREE.Mesh(new THREE.BoxGeometry(6,.06,.3),dark);rotor.position.y=2.3;grp.add(rotor);grp.userData.rotor=rotor;
    const gun=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,1.6),dark);gun.position.set(0,.6,1.2);grp.add(gun);grp.userData.gun=gun;
  }
  return visualAssets?visuals.restyle(grp):grp;
}
function makeBuildingMesh(kind){
  const grp=new THREE.Group();
  if(kind==='wall'){
    const m=new THREE.Mesh(new THREE.BoxGeometry(6,3,1),new THREE.MeshLambertMaterial({color:0x8899aa}));
    m.position.y=1.5;m.castShadow=true;m.receiveShadow=true;grp.add(m);
    const top=new THREE.Mesh(new THREE.BoxGeometry(6.4,.4,1.3),new THREE.MeshLambertMaterial({color:0x667788}));top.position.y=3.1;grp.add(top);
  }else if(kind==='antiAir'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.5,1.2,10),new THREE.MeshLambertMaterial({color:0xf6dfae}));base.position.y=.6;grp.add(base);
    const head=new THREE.Group();head.position.y=1.8;grp.add(head);
    for(const side of [-1,1]){const gun=new THREE.Mesh(new THREE.CylinderGeometry(.14,.22,2,8),new THREE.MeshLambertMaterial({color:0x53b4ae}));gun.position.set(side*.55,.4,.5);gun.rotation.x=Math.PI/3;head.add(gun);}
    const dish=new THREE.Mesh(new THREE.TorusGeometry(.5,.1,6,12),new THREE.MeshLambertMaterial({color:0xf5b957}));dish.position.y=.7;head.add(dish);grp.userData.head=head;
  }else if(kind==='mgTurret'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1,1.3,1,8),new THREE.MeshLambertMaterial({color:0x556677}));base.position.y=.5;base.castShadow=true;grp.add(base);
    const head=new THREE.Mesh(new THREE.BoxGeometry(1,.7,1),new THREE.MeshLambertMaterial({color:0x7788aa}));head.position.y=1.4;grp.add(head);
    const gun=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,1.5),new THREE.MeshLambertMaterial({color:0x222222}));gun.position.set(0,1.45,.8);grp.add(gun);
    grp.userData.head=head;grp.userData.gun=gun;
  }else if(kind==='cannonTurret'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.6,1.2,8),new THREE.MeshLambertMaterial({color:0x664433}));base.position.y=.6;base.castShadow=true;grp.add(base);
    const head=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshLambertMaterial({color:0x996644}));head.position.y=1.8;grp.add(head);
    const gun=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,2.4,8),new THREE.MeshLambertMaterial({color:0x332211}));
    gun.rotation.x=Math.PI/2.6;gun.position.set(0,2.4,1);grp.add(gun);
    grp.userData.head=head;grp.userData.gun=gun;
  }else if(kind==='teslaTurret'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.2,1,8),new THREE.MeshLambertMaterial({color:0x445566}));base.position.y=.5;base.castShadow=true;grp.add(base);
    const coil=new THREE.Mesh(new THREE.TorusGeometry(.5,.12,6,12),new THREE.MeshLambertMaterial({color:0x8866cc}));coil.rotation.x=Math.PI/2;coil.position.y=1.5;grp.add(coil);
    const orb=new THREE.Mesh(new THREE.SphereGeometry(.38,10,8),new THREE.MeshBasicMaterial({color:0xcc88ff}));orb.position.y=2.1;grp.add(orb);grp.userData.head=orb;
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.15,.5,6),new THREE.MeshLambertMaterial({color:0x8866cc}));tip.position.y=2.6;grp.add(tip);
  }else if(kind==='sniperTurret'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1,1.3,1,8),new THREE.MeshLambertMaterial({color:0x3d4a5c}));base.position.y=.5;base.castShadow=true;grp.add(base);
    const head=new THREE.Mesh(new THREE.BoxGeometry(.9,.6,1.4),new THREE.MeshLambertMaterial({color:0x6688aa}));head.position.y=1.5;grp.add(head);
    const gun=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,2.8,8),new THREE.MeshLambertMaterial({color:0x223344}));
    gun.rotation.x=Math.PI/2;gun.position.set(0,1.6,.9);grp.add(gun);
    const scope=new THREE.Mesh(new THREE.BoxGeometry(.16,.16,.5),new THREE.MeshBasicMaterial({color:0x66ffff}));scope.position.set(0,1.85,.6);grp.add(scope);
    grp.userData.head=head;grp.userData.gun=gun;
  }else if(kind==='bunker'){
    const m=new THREE.Mesh(new THREE.BoxGeometry(4,2.6,4),new THREE.MeshLambertMaterial({color:0x777f66}));m.position.y=1.3;m.castShadow=true;grp.add(m);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.6,1,8),new THREE.MeshLambertMaterial({color:0x99a077}));top.position.y=3.1;grp.add(top);
    const g1=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,1.6),new THREE.MeshLambertMaterial({color:0x111111}));g1.position.set(-.3,3.2,.9);grp.add(g1);
    const g2=g1.clone();g2.position.x=.3;grp.add(g2);
    grp.userData.head=top;
  }
  return visualAssets?visuals.restyle(grp):grp;
}
/* ================= 游戏状态 ================= */
const Game={
  state:'menu', // menu / prep / battle / paused / over / win
  loop:1,chapter:1,level:1,
  gold:0,score:0,cls:'gunner',testMode:false,
  weapons:['lmg'],curWeapon:'lmg',
  items:{medkit:2,grenade:3},
  hpBonus:0,
  vehiclesOwned:[],squadCount:0,
  magnet:false,regen:false,
  wave:{total:0,spawned:0,killed:0,timer:0,bossSpawned:false},
  pausedFrom:'prep',
  msgTimer:0,shake:0,
};
const monsters=[],bullets=[],buildings=[],vehicles=[],squad=[],pickups=[],airdrops=[];

/* ---------- 基地 ---------- */
const base={hp:2000,maxHp:2000,mesh:null,pos:new THREE.Vector3(-12,0,-42),bar:null};
(function buildBase(){
  const grp=new THREE.Group();
  const m1=new THREE.MeshLambertMaterial({color:0x88aacc});
  const core=new THREE.Mesh(new THREE.CylinderGeometry(3,4,6,8),m1);core.position.y=3;core.castShadow=true;grp.add(core);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(3,10,8,0,TAU,0,Math.PI/2),new THREE.MeshLambertMaterial({color:0x66ddff,transparent:true,opacity:.8}));
  dome.position.y=6;grp.add(dome);
  const beacon=new THREE.PointLight(0x66ccff,1.4,30);beacon.position.y=8;grp.add(beacon);
  const ant=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,4,4),m1);ant.position.y=9;grp.add(ant);
  // 停机坪
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(6,6,.3,16),new THREE.MeshLambertMaterial({color:0x445566}));
  pad.position.set(24,.15,4);pad.receiveShadow=true;grp.add(pad);
  const padRing=new THREE.Mesh(new THREE.TorusGeometry(5,.15,6,24),new THREE.MeshBasicMaterial({color:0xffcc44}));
  padRing.rotation.x=Math.PI/2;padRing.position.set(24,.35,4);grp.add(padRing);
  grp.position.copy(base.pos);
  grp.position.y=terrainH(base.pos.x,base.pos.z);
  scene.add(grp);base.mesh=grp;
  base.bar=makeHPBar(6,'#fc0');base.bar.position.set(0,10.5,0);grp.add(base.bar);updHPBar(base.bar,1);
})();

/* ---------- 基地内部设施：医疗平台 + 装饰 ---------- */
const healPad={pos:new THREE.Vector3(-2,0,-32),r:3};
(function buildBaseProps(){
  const py=PLAT.H;
  // 医疗平台（站上去持续回血）
  const padG=new THREE.Group();
  const slab=new THREE.Mesh(new THREE.CylinderGeometry(3,3.3,.3,20),new THREE.MeshLambertMaterial({color:0x2a5d3a}));
  slab.position.y=.15;slab.receiveShadow=true;padG.add(slab);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.6,.14,6,24),new THREE.MeshBasicMaterial({color:0x44ff88}));
  ring.rotation.x=Math.PI/2;ring.position.y=.32;padG.add(ring);
  const cr1=new THREE.Mesh(new THREE.BoxGeometry(1.1,.34,.34),new THREE.MeshBasicMaterial({color:0x66ff99}));
  const cr2=new THREE.Mesh(new THREE.BoxGeometry(.34,.34,1.1),new THREE.MeshBasicMaterial({color:0x66ff99}));
  cr1.position.y=cr2.position.y=.6;padG.add(cr1);padG.add(cr2);
  const padLight=new THREE.PointLight(0x44ff88,.8,10);padLight.position.y=2;padG.add(padLight);
  padG.position.set(healPad.pos.x,py,healPad.pos.z);
  scene.add(padG);
  // 探照灯×2
  for(const [lx,lz] of [[-24,-26],[16,-30]]){
    const g=new THREE.Group();
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,5,6),new THREE.MeshLambertMaterial({color:0x556677}));
    pole.position.y=2.5;pole.castShadow=true;g.add(pole);
    const head=new THREE.Mesh(new THREE.BoxGeometry(.9,.5,.6),new THREE.MeshLambertMaterial({color:0x778899}));
    head.position.y=5.1;head.rotation.y=rand(0,TAU);g.add(head);
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.22,6,5),new THREE.MeshBasicMaterial({color:0xfff2cc}));
    bulb.position.y=5.1;g.add(bulb);
    const pl=new THREE.PointLight(0xfff2cc,.9,26);pl.position.y=5;g.add(pl);
    g.position.set(lx,py,lz);scene.add(g);
  }
  // 补给箱堆×2
  for(const [cx,cz,n] of [[6,-28,4],[-18,-22,3]]){
    for(let i=0;i<n;i++){
      const s=rand(.8,1.3);
      const box=new THREE.Mesh(new THREE.BoxGeometry(s,s,s),new THREE.MeshLambertMaterial({color:i%2?0x8a6d3b:0x6d5a35}));
      box.position.set(cx+rand(-1.6,1.6),py+s/2,cz+rand(-1.6,1.6));
      box.rotation.y=rand(0,TAU);box.castShadow=true;scene.add(box);
    }
  }
  // 雷达站
  const radar=new THREE.Group();
  const rp=new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,4.4,6),new THREE.MeshLambertMaterial({color:0x667788}));
  rp.position.y=2.2;radar.add(rp);
  const dish=new THREE.Mesh(new THREE.SphereGeometry(1.5,12,8,0,TAU,0,Math.PI/2.6),new THREE.MeshLambertMaterial({color:0x99aabb,side:THREE.DoubleSide}));
  dish.position.y=4.6;dish.rotation.x=-Math.PI/3;radar.add(dish);
  radar.position.set(-22,py,-33);radar.rotation.y=.7;scene.add(radar);
  // 旗杆
  const fp=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,6,5),new THREE.MeshLambertMaterial({color:0x8899aa}));
  fp.position.set(4,py+3,-26);scene.add(fp);
  const flag=new THREE.Mesh(new THREE.PlaneGeometry(2,1.1),new THREE.MeshBasicMaterial({color:0x33bb66,side:THREE.DoubleSide}));
  flag.position.set(5,py+5.4,-26);scene.add(flag);
})();

/* ---------- 城门（唯一正门，可开关）与四周城墙 ---------- */
const gate={open:true,hp:2500,maxHp:2500,mesh:null,door:null,bar:null,pos:new THREE.Vector3(0,0,-16),dead:false};
(function buildGate(){
  const grp=new THREE.Group();
  const postM=new THREE.MeshLambertMaterial({color:0x667788});
  for(const s of[-1,1]){
    const post=new THREE.Mesh(new THREE.BoxGeometry(2,5.6,2),postM);
    post.position.set(7*s,2.8,0);post.castShadow=true;grp.add(post);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.28,6,5),new THREE.MeshBasicMaterial({color:0x66ffcc}));
    lamp.position.set(7*s,5.9,0);grp.add(lamp);
  }
  const door=new THREE.Mesh(new THREE.BoxGeometry(12,4.6,.9),new THREE.MeshLambertMaterial({color:0x9aa8ba}));
  door.position.y=2.3;door.castShadow=true;grp.add(door);gate.door=door;
  // 塔楼护栏 + 旗杆 + 警示灯（平台地形由 plateauH 抬升，可从内侧斜梯走上来）
  for(const s of[-1,1]){
    const cX=8.75*s;
    const par=(w,d,x,z)=>{
      const p=new THREE.Mesh(new THREE.BoxGeometry(w,.9,d),new THREE.MeshLambertMaterial({color:0x7c8aa0}));
      p.position.set(cX+x,GATE_TOP+.45-PLAT.H,z+16);p.castShadow=true;grp.add(p);
    };
    par(3.9,.35,0,-12.6);par(3.9,.35,0,-19.4);par(.35,7.4,1.78*s,-16);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,3,5),postM);
    pole.position.set(cX-1.4*s,GATE_TOP+1.5-PLAT.H,-2.6);grp.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.4,.8),new THREE.MeshBasicMaterial({color:s>0?0xdd3344:0x3366dd,side:THREE.DoubleSide}));
    flag.position.set(cX-.7*s,GATE_TOP+2.6-PLAT.H,-2.6);grp.add(flag);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.2,6,5),new THREE.MeshBasicMaterial({color:0xffcc44}));
    lamp.position.set(cX+1.5*s,GATE_TOP+.95-PLAT.H,3);grp.add(lamp);
  }
  grp.position.set(gate.pos.x,terrainH(gate.pos.x,gate.pos.z),gate.pos.z);
  scene.add(grp);gate.mesh=grp;
  gate.bar=makeHPBar(5,'#6cf');gate.bar.position.y=6.6;grp.add(gate.bar);updHPBar(gate.bar,1);
})();
function setGate(open){
  if(gate.dead){showMsg('城门已损毁，下关修复',1.4);return;}
  gate.open=open;AudioSys.sfx('vehicle');
  showMsg(open?'🔓 城门已开启':'🔒 城门已关闭',1.2);
}
function damageGate(d){
  if(Game.testMode)return;
  if(gate.open||gate.dead)return;
  gate.hp-=d;updHPBar(gate.bar,gate.hp/gate.maxHp);
  if(gate.hp<=0){
    gate.hp=0;gate.dead=true;AudioSys.sfx('boom');Game.shake=Math.min(.7,Game.shake+.4);
    spawnParticles(gate.mesh.position.clone().add(new THREE.Vector3(0,2,0)),0x99aabb,22,9,.8,1.6);
    showMsg('💥 城门被摧毁！虫群涌入！',2.5);
  }
}
function updGate(dt){
  const tY=(gate.open||gate.dead)?-2.6:2.3;
  gate.door.position.y+=(tY-gate.door.position.y)*Math.min(1,dt*4);
  gate.door.visible=!gate.dead;
  gate.bar.visible=!gate.open&&!gate.dead;
}
function gateBlocked(){return !gate.open&&!gate.dead;}
/* 两侧与后方城墙（静态，不可摧毁）：[x,z,半宽,半深] */
const RAMPARTS=[[-31,-36,1,20],[31,-36,1,20],[0,-55,32,1]];
(function buildRamparts(){
  const m=new THREE.MeshLambertMaterial({color:0x77879a});
  const top=new THREE.MeshLambertMaterial({color:0x5c6b7d});
  const grp=new THREE.Group();
  for(const[rx,rz,hw,hd] of RAMPARTS){
    const b=new THREE.Mesh(new THREE.BoxGeometry(hw*2,3.2,hd*2),m);
    b.position.set(rx,1.6,rz);b.castShadow=b.receiveShadow=true;grp.add(b);
    const t=new THREE.Mesh(new THREE.BoxGeometry(hw*2+.5,.4,hd*2+.5),top);
    t.position.set(rx,3.4,rz);grp.add(t);
  }
  grp.position.y=PLAT.H;
  scene.add(grp);
})();

/* ---------- 通用工具 ---------- */
function groundY(x,z){return terrainH(x,z);}
function dist2(a,b){const dx=a.x-b.x,dz=a.z-b.z;return dx*dx+dz*dz;}
function showMsg(t,dur=2.2){$('msg').textContent=t;$('msg').classList.remove('hidden');Game.msgTimer=dur;}
function showHint(t){if(t){$('hint').textContent=t;$('hint').classList.remove('hidden');}else $('hint').classList.add('hidden');}
function updHUDItem(){
  $('itemTxt').textContent=`🧰 医疗包×${Game.testMode?'∞':Game.items.medkit} 💣 手雷∞`
    +(player.shield>0?` 🛡${Math.ceil(player.shield)}`:'')
    +(player.buffT>0?` ⚡${Math.ceil(player.buffT)}s`:'');
}

/* ---------- 玩家 ---------- */
const player={
  mesh:null,bar:null,hp:120,maxHp:120,speed:9.5,
  pos:new THREE.Vector3(0,0,-24),vy:0,onGround:true,yaw:0,
  fireCd:0,healTick:0,inVehicle:null,dead:false,anim:0,respawnT:0,invulnerable:0,
  muzzle:null,shield:0,buffT:0,
  reset(cls){
    const c=CLASSES[cls];
    this.maxHp=c.hp+Game.hpBonus;this.hp=this.maxHp;this.speed=c.speed;
    this.pos.set(0,0,-20);this.vy=0;this.dead=false;this.inVehicle=null;this.yaw=0;
    this.shield=0;this.buffT=0;this.respawnT=0;this.invulnerable=0;
    if(this.mesh){visuals.release(this.mesh);scene.remove(this.mesh);}
    this.mesh=makeSoldier(c.color);
    this.bar=makeHPBar(1.8,'#3f6');this.bar.position.y=3;this.mesh.add(this.bar);updHPBar(this.bar,1);
    const ml=new THREE.PointLight(0xffaa44,0,6);ml.position.set(.32,1.15,1);this.mesh.add(ml);this.muzzle=ml;
    scene.add(this.mesh);
  }
};
function playerDamage(d){
  if(Game.testMode)return;
  if(player.dead||player.invulnerable>0)return;

  if(player.shield>0){ // 护盾优先吸收
    const ab=Math.min(player.shield,d);
    player.shield-=ab;d-=ab;
    spawnParticles(player.mesh.position.clone().add(new THREE.Vector3(0,1.4,0)),0x66ccff,4,4,.35);
    if(d<=0){updHUDItem();return;}
  }
  player.hp-=d;AudioSys.sfx('hurt');Game.shake=Math.min(.5,Game.shake+.15);
  spawnParticles(player.mesh.position.clone().add(new THREE.Vector3(0,1.3,0)),0xff4444,5,4,.4);
  updHPBar(player.bar,player.hp/player.maxHp);
  if(player.hp<=0){
    player.hp=0;player.dead=true;player.respawnT=2.2;showMsg('阵亡，正在返回基地检查点…',2.2);
  }
}

/* ---------- 子弹 ---------- */
const bulletGeo=new THREE.SphereGeometry(.12,6,5);
function fireBullet(from,dir,cfg,friendly,srcVehicle){
  if(cfg.beam&&friendly){fireBeam(from,dir,cfg);return;}
  if(cfg.pellets>1){ // 霰弹：一次多颗弹丸
    for(let i=0;i<cfg.pellets;i++)fireBullet(from,dir,Object.assign({},cfg,{pellets:0}),friendly);
    return;
  }
  const color=cfg.color||0xffee88;
  const m=new THREE.Mesh(bulletGeo,new THREE.MeshBasicMaterial({color}));
  m.position.copy(from);
  const spread=cfg.spread||0;
  const d=dir.clone().normalize();
  d.x+=rand(-spread,spread);d.z+=rand(-spread,spread);d.normalize();
  const b={mesh:m,vel:d.multiplyScalar(cfg.speed),dmg:cfg.dmg,life:cfg.range/cfg.speed,friendly,explode:cfg.explode||0,arc:cfg.arc,
    homing:cfg.homing,pierce:cfg.pierce||0,hitSet:cfg.pierce?new Set():null};
  if(cfg.arc){b.vel.y=8;b.gravity=16;m.scale.setScalar(2);}
  if(cfg.flame){m.scale.setScalar(1.9);b.vel.y=1.2;}
  scene.add(m);bullets.push(b);
  // 曳光
  if(!cfg.arc&&!cfg.flame){const trail=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.9,4),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.6}));
    trail.rotation.x=Math.PI/2;m.add(trail);}
}
function explode(pos,radius,dmg,friendly){
  AudioSys.sfx('boom');Game.shake=Math.min(.7,Game.shake+.3);
  spawnParticles(pos,0xffaa33,16,9,.6,1.6,6);
  spawnParticles(pos,0xff5511,10,6,.8,2,4);
  if(friendly){
    for(const mo of monsters){if(!mo.dead&&mo.mesh.position.distanceTo(pos)<radius+mo.radius)damageMonster(mo,dmg);}
  }else{
    if(player.mesh.position.distanceTo(pos)<radius+1)playerDamage(dmg);
    for(const bd of buildings){if(!bd.dead&&bd.mesh.position.distanceTo(pos)<radius+2)damageBuilding(bd,dmg);}
  }
}
// Continuous segment/sphere intersection prevents fast shots tunnelling at 20 FPS.
function segmentHit(a,b,center,r){
  const d=b.clone().sub(a),v=a.clone().sub(center),length=d.lengthSq();
  if(v.lengthSq()<=r*r)return 0;
  if(length<1e-9)return null;
  const q=v.dot(d),disc=q*q-length*(v.lengthSq()-r*r);
  if(disc<0)return null;
  const t=(-q-Math.sqrt(disc))/length;
  return t>=0&&t<=1?t:null;
}
function shotCover(a,b){
  const n=Math.max(1,Math.ceil(a.distanceTo(b)/.4));
  for(let i=1;i<=n;i++){
    const p=a.clone().lerp(b,i/n);
    if(p.y<=groundY(p.x,p.z)+.05||fortress.shotBlocked(p))return i/n;
  }
  return 1;
}
function targetHits(a,b,hitSet){
  return monsters.filter(m=>!m.dead&&!hitSet?.has(m)).map(m=>({m,t:segmentHit(a,b,m.mesh.position.clone().add(new THREE.Vector3(0,m.hitH,0)),m.radius+.4)})).filter(h=>h.t!==null).sort((a,b)=>a.t-b.t);
}
const beamPool=[];
function fireBeam(from,dir,cfg){
  const end=from.clone().addScaledVector(dir.clone().normalize(),cfg.range);
  let t=shotCover(from,end),hit=targetHits(from,end).find(h=>h.t<t);
  if(hit){t=hit.t;damageMonster(hit.m,cfg.dmg);AudioSys.sfx('hit');}
  end.lerpVectors(from,end,t);
  let beam=beamPool.find(b=>b.life<=0);
  if(!beam&&beamPool.length<24){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,1,6),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false}));
    scene.add(mesh);beam={mesh,life:0};beamPool.push(beam);
  }
  if(beam){const delta=end.clone().sub(from);beam.life=.12;beam.mesh.visible=true;beam.mesh.material.color.setHex(cfg.color||0x44ffff);beam.mesh.material.opacity=.95;beam.mesh.position.copy(from).add(end).multiplyScalar(.5);beam.mesh.scale.y=delta.length();beam.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}
  if(hit)spawnParticles(end,0x8ffff1,3,3,.22);
}
function disposeBullet(mesh){
  mesh.traverse(o=>{if(o.geometry&&o.geometry!==bulletGeo)o.geometry.dispose();if(o.material)o.material.dispose();});scene.remove(mesh);
}
function updBullets(dt){
  for(const beam of beamPool){beam.life-=dt;beam.mesh.visible=beam.life>0;beam.mesh.material.opacity=Math.max(0,beam.life/.12)*.95;}
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];b.life-=dt;
    // 追踪导弹：向最近敌人转向
    if(b.homing&&b.friendly){
      let best=null,bd2=30*30;
      const p0=b.mesh.position;
      for(const mo of monsters){if(mo.dead||b.hitSet&&b.hitSet.has(mo))continue;const d2=dist2(p0,mo.mesh.position);if(d2<bd2){bd2=d2;best=mo;}}
      if(best){
        const want=new THREE.Vector3(best.mesh.position.x-p0.x,best.mesh.position.y+best.hitH-p0.y,best.mesh.position.z-p0.z).normalize().multiplyScalar(b.vel.length());
        b.vel.lerp(want,Math.min(1,dt*3.2));
      }
    }
    const previous=b.mesh.position.clone();
    b.mesh.position.addScaledVector(b.vel,dt);
    if(b.gravity)b.vel.y-=b.gravity*dt;
    const p=b.mesh.position;
    let hit=false;
    const cover=shotCover(previous,p);
    if(b.friendly){
      for(const {m:mo,t} of targetHits(previous,p,b.hitSet)){
        if(t<cover){
          if(!b.explode){
            damageMonster(mo,b.dmg);AudioSys.sfx('hit');spawnParticles(p,0x99ff55,4,3,.3);
            if(b.pierce>0){b.pierce--;b.hitSet.add(mo);continue;} // 穿透继续飞
          }
          p.lerpVectors(previous,p,t);hit=true;break;
        }
      }
    }else{
      // 敌方子弹
      if(!player.dead&&!player.inVehicle&&dist2(p,player.mesh.position)<2.2&&Math.abs(p.y-player.mesh.position.y-1.2)<1.6){playerDamage(b.dmg);hit=true;}
      if(!hit)for(const bd of buildings){if(!bd.dead&&dist2(p,bd.mesh.position)<bd.radius*bd.radius){damageBuilding(bd,b.dmg);hit=true;break;}}
      if(!hit&&gateBlocked()&&Math.abs(p.x-gate.pos.x)<6.5&&Math.abs(p.z-gate.pos.z)<1.6&&p.y<terrainH(gate.pos.x,gate.pos.z)+5){damageGate(b.dmg);hit=true;}
      if(!hit&&dist2(p,base.pos)<16){damageBase(b.dmg);hit=true;}
      if(!hit)for(const v of vehicles){if(!v.dead&&dist2(p,v.mesh.position)<4){damageVehicle(v,b.dmg);hit=true;break;}}
    }
    if(!hit&&cover<1){p.lerpVectors(previous,p,cover);hit=true;}
    if(hit||b.life<=0){
      if(b.explode&&hit)explode(p.clone(),b.explode,b.dmg,b.friendly);
      disposeBullet(b.mesh);bullets.splice(i,1);
    }
  }
}

/* ---------- 怪物 ---------- */
function chapterCfg(){return CHAPTERS[(Game.chapter-1)%10];}
function diffMul(){ // 周目与章节难度倍率
  return (1+(Game.chapter-1)*.12)*(1+(Game.loop-1)*.6);
}
function spawnMonster(kind,x,z,opts={}){
  const ch=opts.ch||chapterCfg();
  const mul=diffMul()*(1+(Game.level-1)*.04); // 同章内关卡递增
  let hp,dmg,speed,scale,gold,ranged=ch.ranged,fly=ch.fly;
  if(kind==='mob'){
    hp=ch.mob.hp*mul;dmg=ch.mob.dmg*mul;speed=ch.mob.speed*(1+(Game.loop-1)*.08);scale=rand(.85,1.15);gold=Math.round(ch.mob.gold*(1+(Game.loop-1)*.3));
  }else if(kind==='miniboss'){
    hp=ch.mob.hp*mul*10;dmg=ch.mob.dmg*mul*1.8;speed=ch.mob.speed*.85;scale=2.2;gold=Math.round(ch.mob.gold*mul*8);ranged=true;
  }else{ // boss
    hp=ch.mob.hp*mul*28;dmg=ch.mob.dmg*mul*2.6;speed=ch.mob.speed*.7;scale=3.6;gold=Math.round(ch.mob.gold*mul*25);ranged=true;
  }
  const color=kind==='mob'?ch.color:ch.bossColor;
  const spawnClear=(px,pz)=>!collideWalls(px,pz,.9*scale,groundY(px,pz)+(fly?4:0))&&(fly||!tooSteep(px,pz));
  if(!spawnClear(x,z)){
    const ox=x,oz=z;let found=false;
    for(const r of [3,6,10]){for(let i=0;i<8;i++){
      const px=clamp(ox+Math.cos(i*TAU/8)*r,WORLD.minX+5,WORLD.maxX-5),pz=clamp(oz+Math.sin(i*TAU/8)*r,12,WORLD.maxZ-5);
      if(spawnClear(px,pz)){x=px;z=pz;found=true;break;}
    }if(found)break;}
    if(!found){x=0;z=clamp(z,15,130);}
  }
  const mesh=kind==='mob'
    ? (visualAssets?visuals.bug(scale,opts.elite?'elite':'mob',fly,CHAPTERS.indexOf(ch)):makeBug(color,ch.legs,scale,fly))
    : (visualAssets?visuals.bug(scale,kind,fly,CHAPTERS.indexOf(ch)):createArachnidBugModel({color,legs:ch.legs,fly,scale,boss:kind==='boss'}));
  const y=fly?groundY(x,z)+4:groundY(x,z);
  mesh.position.set(x,y,z);
  scene.add(mesh);
  const mo={ch,mesh,kind,hp,maxHp:hp,dmg,speed,radius:.9*scale,hitH:.7*scale,gold,dead:false,
    atkCd:0,ranged,fly,anim:rand(0,10),wild:opts.wild||false,
    explodeOnDie:ch.explodeOnDie,split:ch.split&&kind==='mob'&&!opts.isSplit,stealth:ch.stealth,
    target:null,spitCd:rand(1,3),chargeCd:5,
    bs:kind==='boss'?(ch.bs||['summon']):(kind==='miniboss'?(ch.bs||[]).slice(0,1):null),
    chargeT:0,elite:null,
  };
  // 精英词缀
  if(opts.elite&&kind==='mob'){
    const keys=Object.keys(ELITES);
    const picks=opts.affix&&ELITES[opts.affix]?[opts.affix]:[keys[Math.floor(rand(0,keys.length))]];
    if(!opts.affix&&Math.random()<.35)picks.push(keys[Math.floor(rand(0,keys.length))]);
    const affixes=[...new Set(picks)];
    let hpM=1,dmgM=1,spM=1,scM=1;
    for(const k of affixes){
      const a=ELITES[k];
      hpM*=a.hpMul||1;dmgM*=a.dmgMul||1;spM*=a.speedMul||1;scM*=a.scaleMul||1;
      if(a.ranged)mo.ranged=true;
      if(a.explodeOnDie)mo.explodeOnDie=true;
    }
    mo.hp=mo.maxHp=hp*hpM;mo.dmg=dmg*dmgM;mo.speed=speed*spM;
    mo.scaleMul=scM;mesh.scale.multiplyScalar(scM);mo.radius*=scM;mo.hitH*=scM;
    mo.gold=Math.round(gold*4*affixes.length);mo.elite=affixes;
    // 头顶词缀水晶标记
    const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.34,0),new THREE.MeshBasicMaterial({color:0xffdd00}));
    gem.position.y=(fly?2.2:1.6)*scale*scM+1;mesh.add(gem);mo.gem=gem;
  }
  mo.bar=makeHPBar(kind==='mob'?(mo.elite?2.4:1.8):(kind==='boss'?5:4.5),mo.elite?'#ff0':(kind==='mob'?'#f66':'#f0f'));
  mo.bar.position.y=(fly?2.2:1.6)*scale*(mo.scaleMul||1)+.6;mesh.add(mo.bar);updHPBar(mo.bar,1);
  if(mesh.userData.worlds){mo.bar.scale.divideScalar(mesh.scale.x);mo.bar.position.y=mesh.userData.visualHeight+.5/mesh.scale.y;}
  if(mo.stealth)mesh.traverse(o=>{if(o.material&&!o.material.transparent){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.45;}});
  monsters.push(mo);
  if(mo.elite)showMsg('⚠ 精英虫「'+affixNames(mo.elite)+'」出现！',1.6);
  return mo;
}
function affixNames(list){return list.map(k=>ELITES[k].name).join('·');}
function damageMonster(mo,d){
  if(mo.dead)return;
  mo.hp-=d;updHPBar(mo.bar,mo.hp/mo.maxHp);
  if(mo.hp<=0)killMonster(mo);
}
function killMonster(mo){
  mo.dead=true;
  const p=mo.mesh.position.clone();p.y+=1;
  spawnParticles(p,0x88ff44,12,7,.6,1.2);
  spawnParticles(p,0x336611,8,5,.5,1.5);
  AudioSys.sfx('boom');
  if(mo.explodeOnDie)explode(p,3,mo.dmg,false);
  if(mo.split&&monsters.length<46){ // 分裂小虫
    for(let i=0;i<2&&monsters.filter(m=>!m.dead).length<48;i++){
      const s=spawnMonster('mob',p.x+rand(-1,1),p.z+rand(-1,1),{isSplit:true,wild:mo.wild,ch:mo.ch});
      s.hp=s.maxHp=s.maxHp*.3;s.gold=Math.round(s.gold*.3);s.mesh.scale.multiplyScalar(.55);s.radius*=.55;updHPBar(s.bar,1);
      if(!mo.wild){Game.wave.total++;Game.wave.spawned++;}
    }
  }
  // 掉落
  dropPickup(p,'gold',mo.gold);
  if(mo.elite){ // 精英：额外金币+必掉回复
    Game.score+=50*mo.elite.length;
    dropPickup(p.clone().add(new THREE.Vector3(rand(-1.5,1.5),0,rand(-1.5,1.5))),'gold',Math.round(mo.gold*.6));
    dropPickup(p.clone().add(new THREE.Vector3(rand(-1.5,1.5),0,rand(-1.5,1.5))),'hp',40);
  }
  if(Math.random()<(mo.kind==='mob'?(mo.elite?1:.12):.9))dropPickup(p.clone().add(new THREE.Vector3(rand(-1,1),0,rand(-1,1))),'hp',25);
  if(mo.kind!=='mob')dropPickup(p.clone().add(new THREE.Vector3(rand(-2,2),0,rand(-2,2))),'gold',mo.gold);
  Game.score+=mo.kind==='mob'?10:(mo.kind==='miniboss'?150:500);
  if(!visuals.death(mo.mesh))scene.remove(mo.mesh);
  if(!mo.wild)Game.wave.killed++;
}
function dropPickup(pos,type,val){
  let mesh;
  if(type==='gold'){
    mesh=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.1,10),new THREE.MeshBasicMaterial({color:0xffdd33}));
  }else{
    mesh=new THREE.Group();
    const box=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),new THREE.MeshBasicMaterial({color:0xffffff}));mesh.add(box);
    const cr1=new THREE.Mesh(new THREE.BoxGeometry(.55,.16,.16),new THREE.MeshBasicMaterial({color:0xff3344}));cr1.position.z=.2;mesh.add(cr1);
    const cr2=new THREE.Mesh(new THREE.BoxGeometry(.16,.55,.16),new THREE.MeshBasicMaterial({color:0xff3344}));cr2.position.z=.2;mesh.add(cr2);
  }
  mesh.position.set(pos.x,groundY(pos.x,pos.z)+.5,pos.z);
  scene.add(mesh);
  pickups.push({mesh,type,val,t:0});
}
function updPickups(dt){
  for(let i=pickups.length-1;i>=0;i--){
    const pk=pickups[i];pk.t+=dt;
    pk.mesh.rotation.y+=dt*3;
    pk.mesh.position.y=groundY(pk.mesh.position.x,pk.mesh.position.z)+.5+Math.sin(pk.t*4)*.15;
    const pp=player.inVehicle?player.inVehicle.mesh.position:player.mesh.position;
    const d2=dist2(pk.mesh.position,pp);
    if(d2<(Game.magnet?70:25)){ // 磁力收集器：吸附范围大增
      const dir=new THREE.Vector3().subVectors(pp,pk.mesh.position);dir.y=0;dir.normalize();
      pk.mesh.position.addScaledVector(dir,dt*(Game.magnet?22:14));
    }
    if(d2<2.2){
      if(pk.type==='gold'){Game.gold+=pk.val;AudioSys.sfx('coin');}
      else{
        if(player.inVehicle){const v=player.inVehicle;v.hp=Math.min(v.maxHp,v.hp+pk.val*2);updHPBar(v.bar,v.hp/v.maxHp);}
        else{player.hp=Math.min(player.maxHp,player.hp+pk.val);updHPBar(player.bar,player.hp/player.maxHp);}
        AudioSys.sfx('heal');
        spawnParticles(pp.clone().add(new THREE.Vector3(0,1.5,0)),0x66ff99,8,3,.6);
      }
      scene.remove(pk.mesh);pickups.splice(i,1);continue;
    }
    if(pk.t>45){scene.remove(pk.mesh);pickups.splice(i,1);}
  }
}
/* 怪物AI */
function monsterTargets(mo){
  // 选择最近的攻击目标：玩家/载具/小队/建筑/基地
  let best=null,bd2=1e9;
  const consider=(pos,obj,kind,r)=>{
    const d2=dist2(mo.mesh.position,pos);
    if(d2<bd2){bd2=d2;best={pos,obj,kind,r,d2};}
  };
  if(!player.dead&&!player.inVehicle)consider(player.mesh.position,player,'player',1);
  if(player.inVehicle&&!player.inVehicle.dead)consider(player.inVehicle.mesh.position,player.inVehicle,'vehicle',2);
  for(const s of squad)if(!s.dead)consider(s.mesh.position,s,'squad',1);
  if(!mo.wild){
    for(const bd of buildings)if(!bd.dead)consider(bd.mesh.position,bd,'building',bd.radius);
    consider(base.pos,base,'base',4);
    if(!mo.fly&&gateBlocked())consider(gate.mesh.position,gate,'gate',6);
  }
  return best;
}
function updMonsters(dt){
  const t=performance.now()/1000;
  for(let i=monsters.length-1;i>=0;i--){
    const mo=monsters[i];
    if(mo.dead){if(!mo.mesh.userData.corpse)visuals.release(mo.mesh);monsters.splice(i,1);continue;}
    mo.anim+=dt*8;
    visuals.animate(mo.mesh,dt,mo.atkCd>.75?'Attack':'Walk',camera);
    if(typeof mo.mesh.userData.tick==='function')mo.mesh.userData.tick(dt,t);
    // 腿部动画
    if(mo.mesh.userData.legGroup)mo.mesh.userData.legGroup.forEach((l,li)=>{l.rotation.x=Math.sin(mo.anim+li)*0.5;});
    if(mo.mesh.userData.wingL){mo.mesh.userData.wingL.rotation.z=.3+Math.sin(t*30)*.5;mo.mesh.userData.wingR.rotation.z=-.3-Math.sin(t*30)*.5;}
    const tgt=mo.wild?(dist2(mo.mesh.position,player.inVehicle?player.inVehicle.mesh.position:player.mesh.position)<900?monsterTargets(mo):null):monsterTargets(mo);
    mo.atkCd-=dt;mo.spitCd-=dt;
    if(mo.gem){mo.gem.rotation.y+=dt*2.5;mo.gem.position.y+=Math.sin(t*3+mo.anim)*.004;}
    if(!tgt){ // 野怪巡逻
      if(!mo.wander||Math.random()<.005){mo.wander=new THREE.Vector3(rand(-1,1),0,rand(-1,1)).normalize();}
      moveMonster(mo,mo.wander,dt,.3);
      continue;
    }
    const dir=new THREE.Vector3().subVectors(tgt.pos,mo.mesh.position);dir.y=0;
    const dist=Math.sqrt(tgt.d2);
    dir.normalize();
    mo.mesh.rotation.y=Math.atan2(dir.x,dir.z);
    // BOSS/精英技能：冲锋/弹幕/召唤
    if(mo.bs&&mo.bs.length&&mo.spitCd<=0&&mo.chargeT<=0){
      const skill=mo.bs[Math.floor(rand(0,mo.bs.length))];
      if(skill==='summon'&&monsters.length<44){
        mo.spitCd=7;
        const n=2+(Game.loop>2?1:0);
        for(let k=0;k<n&&monsters.filter(m=>!m.dead).length<48;k++){
          const s=spawnMonster('mob',mo.mesh.position.x+rand(-3,3),mo.mesh.position.z+rand(-3,3),{wild:mo.wild,ch:mo.ch});
          if(!mo.wild){Game.wave.total++;Game.wave.spawned++;}
        }
        showMsg('⚠ BOSS召唤了虫群！',1.2);
      }else if(skill==='barrage'&&dist<34){
        mo.spitCd=5;
        const from=mo.mesh.position.clone();from.y+=mo.hitH+.6;
        for(let k=0;k<10;k++){
          const a=k/10*TAU;
          fireBullet(from,new THREE.Vector3(Math.sin(a),0,Math.cos(a)),{dmg:mo.dmg*.45,speed:18,range:30,spread:0,color:0xaaff44},false);
        }
        AudioSys.sfx('shoot');
      }else if(skill==='charge'&&dist>8&&dist<28&&!mo.fly){
        mo.spitCd=6;mo.chargeT=.75;mo.chargeDir=dir.clone();
        showMsg('⚠ '+(mo.kind==='boss'?chapterCfg().boss:'精英先锋')+' 发起冲锋！',1.2);
        AudioSys.sfx('wave');
      }else mo.spitCd=1.5;
    }
    const atkRange=mo.radius+tgt.r+(mo.ranged?14:1.2);
    if(mo.chargeT>0){ // 冲锋中：直线突进
      mo.chargeT-=dt;
      moveMonster(mo,mo.chargeDir,dt,3.4);
    }else if(dist>atkRange){
      let mdir=dir;
      if(!mo.fly){const nd=navDir(mo,tgt.pos);if(nd){mdir=nd;mo.mesh.rotation.y=Math.atan2(nd.x,nd.z);}}
      moveMonster(mo,mdir,dt,(!mo.wild&&mo.mesh.position.z>70)?2.2:1);
    }else if(mo.atkCd<=0){
      mo.atkCd=mo.ranged?1.6:1.0;
      if(mo.ranged&&dist>mo.radius+tgt.r+2){
        // 吐酸液
        const from=mo.mesh.position.clone();from.y+=mo.hitH+.5;
        const d3=new THREE.Vector3().subVectors(tgt.pos.clone().setY(tgt.pos.y+1),from).normalize();
        fireBullet(from,d3,{dmg:mo.dmg*.8,speed:22,range:40,spread:.03,color:0x99ff33},false);
        AudioSys.sfx('shoot');
      }else{
        // 近战
        AudioSys.sfx('hit');
        spawnParticles(tgt.pos.clone().setY(tgt.pos.y+1),0xffee66,4,3,.3);
        if(tgt.kind==='player')playerDamage(mo.dmg);
        else if(tgt.kind==='vehicle')damageVehicle(tgt.obj,mo.dmg);
        else if(tgt.kind==='squad')damageSquad(tgt.obj,mo.dmg);
        else if(tgt.kind==='building')damageBuilding(tgt.obj,mo.dmg);
        else if(tgt.kind==='gate')damageGate(mo.dmg);
        else if(tgt.kind==='base')damageBase(mo.dmg);
      }
    }
  }
}
function moveMonster(mo,dir,dt,mul){
  const sp=mo.speed*mul;
  let nx=mo.mesh.position.x+dir.x*sp*dt,nz=mo.mesh.position.z+dir.z*sp*dt;
  // Local separation spreads the front while retaining pursuit and attack range.
  if(!mo.fly){for(const other of monsters){if(other===mo||other.dead||other.fly)continue;
    const dx=nx-other.mesh.position.x,dz=nz-other.mesh.position.z,d2=dx*dx+dz*dz,space=(mo.radius+other.radius)*.85;
    if(d2<space*space&&d2>.0001){const d=Math.sqrt(d2),push=Math.min(.08,(space-d)*dt*3);nx+=dx/d*push;nz+=dz/d*push;}
  }}
  // 墙体阻挡 + 悬崖不可攀爬
  const canMove=(x,z)=>!collideWalls(x,z,mo.radius,mo.fly?groundY(x,z)+4:groundY(x,z))&&(mo.fly||!tooSteep(x,z));
  if(!canMove(nx,nz)){
    // Try tangents around rocks instead of stopping forever against scenery.
    if(!mo.avoidSide)mo.avoidSide=mo.mesh.position.x<0?1:-1;
    for(const angle of [.7,1.25,1.7,-.7,-1.25]){
      const a=angle*mo.avoidSide,c=Math.cos(a),s=Math.sin(a);
      const x=mo.mesh.position.x+(dir.x*c-dir.z*s)*sp*dt,z=mo.mesh.position.z+(dir.x*s+dir.z*c)*sp*dt;
      if(canMove(x,z)){nx=x;nz=z;break;}
    }
  }
  if(canMove(nx,nz)){
    mo.mesh.position.x=clamp(nx,WORLD.minX+2,WORLD.maxX-2);
    mo.mesh.position.z=clamp(nz,WORLD.minZ+2,WORLD.maxZ-2);
  }
  const gy=groundY(mo.mesh.position.x,mo.mesh.position.z);
  mo.mesh.position.y=mo.fly?gy+4+Math.sin(mo.anim*.5)*.5:gy;
}
/* 寻路：高台内外互通只能走正门斜坡 */
function navDir(mo,tgtPos){
  const p=mo.mesh.position;
  const onPlat=plateauH(p.x,p.z)>PLAT.H*.6;
  const tgtPlat=plateauH(tgtPos.x,tgtPos.z)>PLAT.H*.6;
  if(onPlat===tgtPlat)return null;
  // 已在坡道走廊内：沿坡直行
  if(Math.abs(p.x)<PLAT.rampW-1&&p.z>PLAT.rampTop-2&&p.z<PLAT.rampBot+4){
    return new THREE.Vector3(0,0,tgtPlat?-1:1);
  }
  const wp=onPlat?new THREE.Vector3(0,0,PLAT.rampTop-2):new THREE.Vector3(0,0,PLAT.rampBot+3);
  return wp.sub(p).setY(0).normalize();
}
/* ---------- 建筑 ---------- */
function placeBuilding(kind,x,z,rotY,hp){
  const cfg=BUILDINGS[kind];
  const mesh=makeBuildingMesh(kind);
  mesh.position.set(x,groundY(x,z),z);mesh.rotation.y=rotY||0;
  scene.add(mesh);
  const maxHp=Math.round(cfg.hp*(1+(Game.loop-1)*.4));
  const bd={mesh,kind,hp:hp!=null?hp:maxHp,maxHp,radius:kind==='wall'?3:(kind==='bunker'?2.6:1.4),
    dmg:cfg.dmg,rate:cfg.rate,range:cfg.range,explode:cfg.explode,fireCd:0,dead:false,
    isWall:kind==='wall',rotY:rotY||0};
  bd.bar=makeHPBar(kind==='wall'?4:2.6,'#6cf');bd.bar.position.y=kind==='wall'?4:3.6;mesh.add(bd.bar);updHPBar(bd.bar,bd.hp/maxHp);
  buildings.push(bd);
  return bd;
}
function damageBuilding(bd,d){
  if(Game.testMode)return;
  if(bd.dead)return;
  bd.hp-=d;updHPBar(bd.bar,bd.hp/bd.maxHp);
  if(bd.hp<=0){
    bd.dead=true;
    spawnParticles(bd.mesh.position.clone().add(new THREE.Vector3(0,1.5,0)),0x999999,14,7,.7,1.5);
    AudioSys.sfx('boom');
    scene.remove(bd.mesh);
    buildings.splice(buildings.indexOf(bd),1);
  }
}
function damageBase(d){
  if(Game.testMode)return;
  base.hp-=d;updHPBar(base.bar,base.hp/base.maxHp);
  Game.shake=Math.min(.6,Game.shake+.1);
  if(base.hp<=0){base.hp=0;gameOver('基地被摧毁！防线失守…');}
}
/* 墙体碰撞（旋转矩形近似） */
function collideWalls(x,z,r,y=groundY(x,z)){
  if(fortress.blocked(x,z,r,y))return true;
  if(y>groundY(x,z)+5)return false;
  for(const bd of buildings){
    if(bd.dead)continue;
    if(y>bd.mesh.position.y+(bd.kind==='bunker'?4:3.5))continue;
    const dx=x-bd.mesh.position.x,dz=z-bd.mesh.position.z;
    if(bd.isWall){
      const c=Math.cos(-bd.rotY),s=Math.sin(-bd.rotY);
      const lx=dx*c-dz*s,lz=dx*s+dz*c;
      if(Math.abs(lx)<3+r&&Math.abs(lz)<.6+r)return true;
    }else{
      if(dx*dx+dz*dz<(bd.radius+r)**2)return true;
    }
  }
  // 基地核心
  const dxb=x-base.pos.x,dzb=z-base.pos.z;
  if(y<base.pos.y+6&&dxb*dxb+dzb*dzb<(4+r)**2)return true;
  // 周边静态城墙
  for(const[rx,rz,hw,hd] of RAMPARTS){
    if(y<PLAT.H+3.7&&Math.abs(x-rx)<hw+r&&Math.abs(z-rz)<hd+r)return true;
  }
  // 城门（关闭时阻挡）
  if(y<PLAT.H+4.8&&gateBlocked()&&Math.abs(x-gate.pos.x)<6+r&&Math.abs(z-gate.pos.z)<.9+r)return true;
  return false;
}
/* 电弧特效：两点之间画一段发光线束，短暂显示 */
function zapLine(a,b,color){
  const dir=new THREE.Vector3().subVectors(b,a);
  const len=dir.length();
  const m=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,len,4),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));
  m.position.copy(a).addScaledVector(dir,.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
  scene.add(m);
  setTimeout(()=>{scene.remove(m);m.geometry.dispose();m.material.dispose();},90);
}
/* 炮塔自动索敌 */
function updBuildings(dt){
  for(const bd of buildings){
    if(bd.dead||!bd.dmg)continue;
    bd.fireCd-=dt;
    if(bd.fireCd>0)continue;
    let best=null,bd2=bd.range*bd.range;
    for(const mo of monsters){
      if(mo.dead||mo.wild||(bd.kind==='antiAir'&&!mo.fly))continue;
      const d2=dist2(bd.mesh.position,mo.mesh.position);
      if(d2<bd2){bd2=d2;best=mo;}
    }
    if(!best)continue;
    const mul=1;
    if(bd.kind==='teslaTurret'){
      // 电弧连锁：主目标+附近最多2只，伤害递减
      bd.fireCd=bd.rate;
      const from=bd.mesh.position.clone();from.y+=2.1;
      let prev=from,cur=best;
      const hitList=[cur];
      for(let k=0;k<2;k++){
        let nxt=null,nd2=8*8;
        for(const mo of monsters){
          if(mo.dead||hitList.includes(mo))continue;
          const d2=dist2(cur.mesh.position,mo.mesh.position);
          if(d2<nd2){nd2=d2;nxt=mo;}
        }
        if(!nxt)break;
        hitList.push(nxt);cur=nxt;
      }
      hitList.forEach((mo,idx)=>{
        const to=mo.mesh.position.clone();to.y+=mo.hitH;
        zapLine(prev,to,0xcc88ff);
        damageMonster(mo,bd.dmg*mul*Math.pow(.6,idx));
        prev=to;
      });
      AudioSys.sfx('shoot');
      continue;
    }
    bd.fireCd=bd.rate;
    const from=bd.mesh.position.clone();from.y+=bd.kind==='bunker'?3.2:(bd.kind==='cannonTurret'?2:1.5);
    const to=best.mesh.position.clone();to.y+=best.hitH;
    const dir=new THREE.Vector3().subVectors(to,from);
    if(bd.mesh.userData.head)bd.mesh.userData.head.rotation.y=Math.atan2(dir.x,dir.z);
    if(bd.mesh.userData.gun)bd.mesh.userData.gun.rotation.y=Math.atan2(dir.x,dir.z);
    if(bd.kind==='antiAir'){
      fireBullet(from,dir,{beam:true,dmg:bd.dmg,range:bd.range,color:0x8bffda},true);AudioSys.sfx('shoot');
    }else if(bd.kind==='sniperTurret'){
      fireBullet(from,dir,{dmg:bd.dmg*mul,speed:140,range:bd.range+8,spread:0,color:0xaaffff},true);
      AudioSys.sfx('sniper');
    }else{
      fireBullet(from,dir,{dmg:bd.dmg*mul,speed:55,range:bd.range+6,spread:.04,explode:bd.explode,color:bd.kind==='cannonTurret'?0xff8844:0xffee88},true);
      AudioSys.sfx(bd.kind==='cannonTurret'?'cannon':'mg');
    }
  }
}

/* ---------- 载具 ---------- */
function spawnVehicle(kind){
  const cfg=VEHICLES[kind];
  const mesh=makeVehicleMesh(kind);
  // 停机坪附近排列
  const idx=vehicles.length;
  const x=base.pos.x+24+(idx%2)*6-3,z=base.pos.z+4+Math.floor(idx/2)*7;
  mesh.position.set(x,groundY(x,z)+(cfg.fly?0:0),z);
  scene.add(mesh);
  const v={mesh,kind,cfg,hp:cfg.hp,maxHp:cfg.hp,dead:false,fireCd:0,yaw:0,alt:0,homeX:x,homeZ:z};
  v.bar=makeHPBar(3.5,'#4af');v.bar.position.y=cfg.fly?3.2:3.4;mesh.add(v.bar);updHPBar(v.bar,1);
  vehicles.push(v);
  return v;
}
function damageVehicle(v,d){
  if(Game.testMode)return;
  if(v.dead)return;
  v.hp-=d;updHPBar(v.bar,v.hp/v.maxHp);
  spawnParticles(v.mesh.position.clone().add(new THREE.Vector3(0,1.5,0)),0xffaa44,4,4,.4);
  if(v.hp<=0){
    v.dead=true;
    explode(v.mesh.position.clone(),3,30,true);
    if(player.inVehicle===v){exitVehicle();playerDamage(20);}
    scene.remove(v.mesh);vehicles.splice(vehicles.indexOf(v),1);
    Game.vehiclesOwned.splice(Game.vehiclesOwned.indexOf(v.kind),1);
  }
}
function enterVehicle(v){
  player.inVehicle=v;player.mesh.visible=false;
  AudioSys.sfx('vehicle');
  showMsg('🚗 驾驶 '+v.cfg.name+'（再按I下车）',1.6);
}
function exitVehicle(){
  const v=player.inVehicle;if(!v)return;
  player.inVehicle=null;player.mesh.visible=true;
  const off=new THREE.Vector3(3.5,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),v.yaw);
  player.pos.set(v.mesh.position.x+off.x,0,v.mesh.position.z+off.z);
  if(v.cfg.fly)v.landing=true;
  v.noEnter=1.2; // 下车冷却：防止立刻又上车，也把I键让给城门/医疗包
}
function updVehicles(dt){
  for(const v of vehicles){
    if(v.dead)continue;
    visuals.animate(v.mesh,dt,player.inVehicle===v&&Math.hypot(Input.axis().x,Input.axis().y)>.1?'Walk':'Idle',camera);
    if(v.noEnter>0)v.noEnter-=dt;
    if(v.mesh.userData.rotor)v.mesh.userData.rotor.rotation.y+=dt*(player.inVehicle===v?25:2);
    if(player.inVehicle===v)continue; // 驾驶时在 updPlayer 处理
    if(v.cfg.fly){
      if(v.landing||v.alt>0){v.alt=Math.max(0,v.alt-dt*6);if(v.alt===0)v.landing=false;}
      v.mesh.position.y=groundY(v.mesh.position.x,v.mesh.position.z)+v.alt;
    }
  }
}

/* ---------- AI队友 ---------- */
function spawnSquad(){
  if(squad.length>=4)return;
  const colors=[0xd5d53a,0xd53a8a,0x3ad5d5,0xff8833];
  const slot=[0,1,2,3].find(i=>!squad.some(s=>s.slot===i));
  const mesh=makeSoldier(colors[slot]);
  const pp=player.inVehicle?player.inVehicle.mesh.position:player.pos;
  const point=squadPatrolPoint(pp,slot,0);
  mesh.position.set(point.x,groundY(point.x,point.z),point.z);
  scene.add(mesh);
  const hp=100*(1+(Game.loop-1)*.5);
  const s={mesh,slot,hp,maxHp:hp,dead:false,fireCd:slot*.07,anim:0,patrol:point,patrolStep:0,patrolTimer:2+slot*.7,stuck:0};
  s.bar=makeHPBar(1.8,'#ff6');s.bar.position.y=2.6;mesh.add(s.bar);updHPBar(s.bar,1);
  squad.push(s);
}
function damageSquad(s,d){
  if(Game.testMode)return;
  if(s.dead)return;
  s.hp-=d;updHPBar(s.bar,s.hp/s.maxHp);
  if(s.hp<=0){
    s.dead=true;spawnParticles(s.mesh.position.clone().add(new THREE.Vector3(0,1,0)),0xff6666,8,5,.5);
    visuals.release(s.mesh);scene.remove(s.mesh);squad.splice(squad.indexOf(s),1);Game.squadCount--;
    showMsg('💀 一名队友阵亡',1.4);
  }
}
function squadCanWalk(x,z){
  return x>WORLD.minX+1&&x<WORLD.maxX-1&&z>WORLD.minZ+1&&z<WORLD.maxZ-1&&!collideWalls(x,z,.65)&&!tooSteep(x,z);
}
function squadPatrolPoint(center,slot,step){
  for(let i=0;i<24;i++){
    const angle=slot*TAU/4+step*.65+i*.38,r=6+(i%3)*2;
    const x=center.x+Math.cos(angle)*r,z=center.z+Math.sin(angle)*r;
    if(squadCanWalk(x,z)&&squad.every(s=>Math.hypot(s.mesh.position.x-x,s.mesh.position.z-z)>2.5))return{x,z};
  }
  return{x:center.x,z:center.z};
}
function updSquad(dt){
  const t=performance.now()/1000;
  for(const s of squad){
    if(s.dead)continue;
    s.anim+=dt;s.fireCd-=dt;
    if(typeof s.mesh.userData.tick==='function')s.mesh.userData.tick(dt,t);
    const pp=player.inVehicle?player.inVehicle.mesh.position:player.mesh.position;
    const d2p=dist2(s.mesh.position,pp);
    // 各自索敌；已有队友照顾的敌人降低优先级，但单一首领允许集火。
    let best=null,bd2=0,score=Infinity;
    for(const mo of monsters){
      if(mo.dead)continue;const d2=dist2(s.mesh.position,mo.mesh.position);if(d2>28*28)continue;
      const value=d2+squad.filter(other=>other!==s&&other.target===mo).length*180;
      if(value<score){score=value;bd2=d2;best=mo;}
    }
    s.target=best;s.patrolTimer-=dt;
    if(s.patrolTimer<=0||Math.hypot(s.patrol.x-pp.x,s.patrol.z-pp.z)>19||s.stuck>.8){
      s.patrol=squadPatrolPoint(pp,s.slot,++s.patrolStep);s.patrolTimer=3+s.slot*.6;s.stuck=0;
    }
    const p=s.mesh.position;let dx=s.patrol.x-p.x,dz=s.patrol.z-p.z;
    if(best&&d2p<24*24){
      const distance=Math.sqrt(bd2),range=11+s.slot*1.5;
      // 射程内保持各自位置，近身后退，避免所有队友贴在敌人身上。
      const advance=distance>range?1:distance<7?-1:0;
      dx=(best.mesh.position.x-p.x)*advance;dz=(best.mesh.position.z-p.z)*advance;
    }
    let length=Math.hypot(dx,dz);if(length>.3){dx/=length;dz/=length;}else{dx=0;dz=0;}
    // 包含玩家的软避让；完全重合时也有稳定且不同的分离方向。
    for(const other of [...squad.filter(o=>o!==s).map(o=>o.mesh.position),pp]){
      let sx=p.x-other.x,sz=p.z-other.z,d=Math.hypot(sx,sz);
      if(d>=2.6)continue;
      if(d<.01){sx=Math.cos(s.slot*TAU/4);sz=Math.sin(s.slot*TAU/4);d=1;}
      const force=(2.6-d)*2;dx+=sx/d*force;dz+=sz/d*force;
    }
    length=Math.hypot(dx,dz);if(length>1){dx/=length;dz/=length;}
    const speed=7*slopeSpeed(groundY,p.x,p.z,dx,dz),ox=p.x,oz=p.z;
    const nx=p.x+dx*speed*dt,nz=p.z+dz*speed*dt;
    if(squadCanWalk(nx,nz)){p.x=nx;p.z=nz;}
    else if(squadCanWalk(nx,p.z))p.x=nx;
    else if(squadCanWalk(p.x,nz))p.z=nz;
    const moved=Math.hypot(p.x-ox,p.z-oz);
    s.stuck=moved<.005&&length>.3?s.stuck+dt:0;
    visuals.animate(s.mesh,dt,moved>.001?'Walk':'Idle',camera);
    if(moved>.001)s.mesh.rotation.y=Math.atan2(p.x-ox,p.z-oz);
    s.mesh.position.y=groundY(s.mesh.position.x,s.mesh.position.z);
    if(best&&s.fireCd<=0){
      s.fireCd=.25;
      const from=s.mesh.position.clone();from.y+=1.2;
      const to=best.mesh.position.clone();to.y+=best.hitH;
      s.mesh.rotation.y=Math.atan2(to.x-from.x,to.z-from.z);
      fireBullet(from,new THREE.Vector3().subVectors(to,from),{dmg:8*(1+(Game.loop-1)*.4),speed:55,range:30,spread:.06,color:0xffff99},true);
      if(Math.random()<.3)AudioSys.sfx('mg');
    }
    // 医疗兵光环治疗队友
    if(Game.cls==='medic'&&d2p<80)s.hp=Math.min(s.maxHp,s.hp+2*dt),updHPBar(s.bar,s.hp/s.maxHp);
  }
}

/* ---------- 玩家控制 ---------- */
function autoAimDir(from,facing,range){
  // 自动瞄准：优先取面向方向附近最近的敌人
  let best=null,bestScore=-1;
  for(const mo of monsters){
    if(mo.dead)continue;
    const d2=dist2(from,mo.mesh.position);
    if(d2>range*range)continue;
    const dir=new THREE.Vector3().subVectors(mo.mesh.position,from);dir.y=0;dir.normalize();
    const dot=dir.dot(facing);
    if(dot<.2)continue;
    let score=dot*2-Math.sqrt(d2)/range;
    if(mo.kind==='boss')score+=1.2;else if(mo.kind==='miniboss')score+=.8;else if(mo.elite)score+=.5;
    if(score>bestScore){bestScore=score;best=mo;}
  }
  if(best){
    const to=best.mesh.position.clone();to.y+=best.hitH;
    return new THREE.Vector3().subVectors(to,from).normalize();
  }
  return facing.clone();
}
function interactionTarget(){
  if(player.inVehicle)return {kind:'exit',label:'下车',tip:'I 下车；驾驶时不能使用医疗包'};
  let vehicle=null,best=20;
  for(const v of vehicles){const d=dist2(player.pos,v.mesh.position);if(!v.dead&&!(v.noEnter>0)&&d<best&&Math.abs(player.pos.y-v.mesh.position.y)<3){vehicle=v;best=d;}}
  if(vehicle)return {kind:'vehicle',vehicle,label:'驾驶',tip:'I 驾驶 '+vehicle.cfg.name};
  if(dist2(player.pos,gate.mesh.position)<170&&Math.abs(player.pos.y-PLAT.H)<2)return {kind:'gate',label:gate.dead?'城门损毁':gate.open?'关门':'开门',tip:gate.dead?'城门损毁，下关自动修复':'I '+(gate.open?'关闭':'开启')+'城门'};
  if(player.hp>=player.maxHp)return {kind:'full',label:'医疗',tip:'I 医疗包：回复60生命；当前满血，不消耗。靠近载具或城门可互动'};
  return {kind:'heal',label:'医疗',tip:Game.testMode||Game.items.medkit>0?'I 使用医疗包，回复60生命':'医疗包已用完，O 打开商店购买'};
}
function updInteraction(){const a=interactionTarget();if($('vI').textContent!==a.label)$('vI').textContent=a.label;if($('interactHint').textContent!==a.tip){$('vI').setAttribute('aria-label',a.tip);$('interactHint').textContent=a.tip;}$('interactHint').classList.remove('hidden');}
function updPlayer(dt){
  if(player.dead)return;
  const t=performance.now()/1000;
  if(player.mesh&&typeof player.mesh.userData.tick==='function')player.mesh.userData.tick(dt,t);
  const ax=Input.axis();
  // 视角旋转
  if(Input.pop('C'))setCameraView(camView+1);
  camYaw=(camYaw+((Input.keys.Q?1:0)-(Input.keys.E?1:0))*dt*1.65+TAU)%TAU;
  updInteraction();
  // 移动方向以摄像机为准
  const cs=Math.cos(camYaw),sn=Math.sin(camYaw);
  const f=-ax.y,r=ax.x;
  let mvx=f*sn-r*cs, mvz=f*cs+r*sn;
  const moving=Math.hypot(mvx,mvz)>.01;
  visuals.animate(player.mesh,dt,moving?'Run':'Idle',camera);
  const v=player.inVehicle;
  if(v){
    // 驾驶载具
    const sp=v.cfg.speed*(v.cfg.fly?1:slopeSpeed(groundY,v.mesh.position.x,v.mesh.position.z,mvx,mvz));
    if(moving){
      v.yaw=Math.atan2(mvx,mvz);
      v.mesh.rotation.y=v.yaw;
      const nx=v.mesh.position.x+mvx*sp*dt,nz=v.mesh.position.z+mvz*sp*dt;
      if(!collideWalls(nx,nz,2,v.mesh.position.y)&&(v.cfg.fly||!tooSteep(nx,nz))){
        v.mesh.position.x=clamp(nx,WORLD.minX+3,WORLD.maxX-3);
        v.mesh.position.z=clamp(nz,WORLD.minZ+3,WORLD.maxZ-3);
      }
    }
    if(v.cfg.fly){
      if(Input.keys.K)v.alt=Math.min(14,v.alt+dt*8);
      if(Input.keys.U)v.alt=Math.max(0,v.alt-dt*8);
      v.mesh.position.y=groundY(v.mesh.position.x,v.mesh.position.z)+2+v.alt;
    }else{
      v.mesh.position.y=groundY(v.mesh.position.x,v.mesh.position.z);
    }
    player.pos.set(v.mesh.position.x,v.mesh.position.y,v.mesh.position.z);
    // 载具开火
    player.fireCd-=dt;
    if(Input.keys.J&&player.fireCd<=0){
      player.fireCd=v.cfg.rate;
      const facing=new THREE.Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw));
      const from=v.mesh.position.clone();from.y+=v.cfg.seatH+.6;
      const dir=autoAimDir(from,facing,v.cfg.range);
      fireBullet(from,dir,{dmg:v.cfg.dmg,speed:70,range:v.cfg.range,spread:.03,explode:v.cfg.explode,color:0xffcc66},true);
      AudioSys.sfx(v.cfg.sfx);
      Game.shake=Math.min(.4,Game.shake+(v.cfg.explode?.15:.02));
    }
    if(Input.pop('I')){exitVehicle();}
    return;
  }
  // 步行
  if(player.buffT>0)player.buffT-=dt;
  if(Game.regen&&player.hp<player.maxHp){ // 再生背心
    player.hp=Math.min(player.maxHp,player.hp+2*dt);
    updHPBar(player.bar,player.hp/player.maxHp);
  }
  // 基地医疗平台：站上去持续回血
  if(player.hp<player.maxHp&&(dist2(player.pos,healPad.pos)<healPad.r*healPad.r||dist2(player.pos,fortress.shelter)<fortress.shelter.r**2)){
    player.hp=Math.min(player.maxHp,player.hp+6*dt);
    updHPBar(player.bar,player.hp/player.maxHp);
    if(Math.random()<.08)spawnParticles(player.pos.clone().add(new THREE.Vector3(0,1,0)),0x66ff99,2,2,.5);
  }
  if(moving){
    player.yaw=Math.atan2(mvx,mvz);
    const sp=player.speed*(player.buffT>0?1.4:1)*(player.onGround?slopeSpeed(groundY,player.pos.x,player.pos.z,mvx,mvz):1);
    const nx=player.pos.x+mvx*sp*dt,nz=player.pos.z+mvz*sp*dt;
    if(!collideWalls(nx,player.pos.z,.5)&&!tooSteep(nx,player.pos.z))player.pos.x=clamp(nx,WORLD.minX+1,WORLD.maxX-1);
    if(!collideWalls(player.pos.x,nz,.5)&&!tooSteep(player.pos.x,nz))player.pos.z=clamp(nz,WORLD.minZ+1,WORLD.maxZ-1);
    player.anim+=dt*10;
    player.mesh.userData.legs.forEach((l,i)=>l.rotation.x=Math.sin(player.anim+i*Math.PI)*.7);
  }else{
    player.mesh.userData.legs.forEach(l=>l.rotation.x*=.8);
  }
  // 跳跃与重力
  const gy=groundY(player.pos.x,player.pos.z);
  if(Input.pop('K')&&player.onGround){player.vy=9;player.onGround=false;AudioSys.sfx('jump');}
  player.vy-=24*dt;
  player.pos.y+=player.vy*dt;
  if(player.pos.y<=gy){player.pos.y=gy;player.vy=0;player.onGround=true;}
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y=player.yaw;
  // 医疗兵自愈
  if(CLASSES[Game.cls].heal){
    player.hp=Math.min(player.maxHp,player.hp+CLASSES[Game.cls].heal*dt);
    updHPBar(player.bar,player.hp/player.maxHp);
  }
  // 开火
  player.fireCd-=dt;
  const wp=WEAPONS[Game.curWeapon];
  if(Input.keys.J&&player.fireCd<=0){
    player.fireCd=wp.rate*(player.buffT>0?1/1.4:1);
    const facing=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));
    const from=player.pos.clone();from.y+=1.35;
    const dir=autoAimDir(from,facing,wp.range);
    player.yaw=Math.atan2(dir.x,dir.z);
    fireBullet(from,dir,{...wp,dmg:wp.dmg},true);
    AudioSys.sfx(wp.sfx);
    player.muzzle.intensity=2;setTimeout(()=>{if(player.muzzle)player.muzzle.intensity=0;},50);
  }
  // 手雷（无限）
  if(Input.pop('U')){
    const facing=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw));
    const from=player.pos.clone();from.y+=1.5;
    fireBullet(from,facing,{dmg:80,speed:16,range:60,spread:0,explode:4.5,arc:true,color:0x88ff44},true);
    AudioSys.sfx('shoot');
  }
  // 医疗包 / 上载具 / 城门开关
  if(Input.pop('I')){
    const action=interactionTarget();
    if(action.kind==='vehicle')enterVehicle(action.vehicle);
    else if(action.kind==='gate'){if(!gate.dead)setGate(!gate.open);else showMsg(action.tip,2);}
    else if(action.kind==='full')showMsg('I 是医疗包：受伤后回复60生命；满血不会消耗',2.5);
    else if(Game.testMode||Game.items.medkit>0){
      if(!Game.testMode)Game.items.medkit--;
      const healed=Math.min(ITEMS.medkit.heal,player.maxHp-player.hp);
      player.hp+=healed;updHPBar(player.bar,player.hp/player.maxHp);
      AudioSys.sfx('heal');showMsg('医疗包 +'+Math.ceil(healed)+'生命',1.5);
      spawnParticles(player.pos.clone().add(new THREE.Vector3(0,1.5,0)),0x66ff99,10,3,.7);
    }else showMsg('没有医疗包！O 打开商店购买',2);
    updInteraction();
  }
  // 切换武器
  if(Input.pop('V')){
    const idx=Game.weapons.indexOf(Game.curWeapon);
    Game.curWeapon=Game.weapons[(idx+1)%Game.weapons.length];
    AudioSys.sfx('reload');
    showMsg('🔫 '+WEAPONS[Game.curWeapon].name,1);
  }
}
/* ================= 关卡流程 ================= */
const sandboxWave={enabled:true,timer:3,spawned:0};
function resetSandboxWave(){sandboxWave.enabled=true;sandboxWave.timer=3;sandboxWave.spawned=0;}
function updSandboxWave(dt){
  if(!sandboxWave.enabled)return;
  sandboxWave.timer-=dt;
  if(sandboxWave.timer>0)return;
  sandboxWave.timer=3;
  const pp=player.inVehicle?player.inVehicle.mesh.position:player.pos;
  for(let i=0;i<4&&monsters.length<48;i++){
    const n=sandboxWave.spawned++,ch=CHAPTERS[n%CHAPTERS.length];
    const kind=n%32===31?'boss':n%16===15?'miniboss':'mob';
    const angle=(n%9-4)*.24,r=28+(n%3)*4;
    spawnMonster(kind,clamp(pp.x+Math.sin(angle)*r,-65,65),clamp(pp.z+Math.cos(angle)*r,18,180),
      {ch,elite:kind==='mob'&&n%4===3,affix:Object.keys(ELITES)[Math.floor(n/4)%Object.keys(ELITES).length]});
  }
}
function sandboxSpawn(action='selected'){
  if(!Game.testMode)return;
  if(action==='clear'||action==='showcase'){
    for(const m of monsters){visuals.release(m.mesh);scene.remove(m.mesh);}monsters.length=0;
    for(const b of bullets)disposeBullet(b.mesh);bullets.length=0;
    if(action==='clear'){sandboxWave.enabled=false;showMsg('已清场并暂停自动虫潮；在测试台点「继续自动虫潮」可恢复',3);return;}
    resetSandboxWave();
  }
  const add=(ch,kind='mob',affix=null,index=0)=>{
    if(monsters.length>=48)return;
    const centerZ=clamp(player.pos.z+30,30,160),x=(index%5-2)*9,z=centerZ+Math.floor(index/5)*10;
    spawnMonster(kind,x,z,{ch:CHAPTERS[ch],elite:!!affix,affix});
  };
  if(action==='showcase'){
    CHAPTERS.forEach((_,i)=>add(i,'mob',null,i));
    Object.keys(ELITES).forEach((a,i)=>add(i,'mob',a,i+10));
    add(0,'miniboss',null,16);add(3,'boss',null,18);
  }else{
    const ch=Number($('testSpecies').value),kind=$('testRank').value;
    const count=Number($('testCount').value);
    for(let i=0;i<count;i++)add(ch,kind==='elite'?'mob':kind,kind==='elite'?$('testAffix').value:null,monsters.length);
  }
  Game.state='battle';$('readyBtn').classList.add('hidden');
  showMsg(`已召唤 · 场上 ${monsters.length}/48 只；可清场后更换组合`,2);
}
function claimSandbox(type,id){
  if(!Game.testMode)return;
  if(type==='weapon'){Game.curWeapon=id;showMsg('已装备 '+WEAPONS[id].name);}
  else if(type==='vehicle'){
    let v=vehicles.find(v=>v.kind===id&&!v.dead);
    if(!v){Game.vehiclesOwned.push(id);v=spawnVehicle(id);}
    enterVehicle(v);showMsg('已登上 '+VEHICLES[id].name+' · I 下车；直升机 K 升高 / U 降低',3);
  }else if(type==='squad'){
    while(squad.length<4)spawnSquad();Game.squadCount=squad.length;showMsg('四人小队已就位');
  }else if(type==='item')grantSupply({type,id});
  else if(type==='building'){
    if(buildings.length>=32){showMsg('防御设施已达 32 座，重置场景可重新布置');return;}
    const x=player.pos.x+Math.sin(player.yaw)*6,z=player.pos.z+Math.cos(player.yaw)*6;
    if(collideWalls(x,z,2)){showMsg('前方空间不足，换个位置再建造');return;}
    placeBuilding(id,x,z,0);showMsg('已建造 '+BUILDINGS[id].name);
  }
  closePanels();
}
function openSandbox(){
  if(!Game.testMode||!['prep','battle'].includes(Game.state))return;
  closePanels();Input.reset();panelOpen=true;$('sandboxPanel').classList.remove('hidden');
  $('testStatus').textContent=`玩家 / 小队 / 基地 / 载具无敌 · 金币、弹药和道具无限 · 虫群 ${monsters.length}/48`;
  $('test-auto').textContent=sandboxWave.enabled?'暂停自动虫潮':'继续自动虫潮';
}
function setupSandbox(){
  const fill=(id,entries)=>{$(id).replaceChildren(...entries.map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;}));};
  fill('testSpecies',CHAPTERS.map((c,i)=>[i,`${c.name} / ${c.boss}`]));
  fill('testAffix',Object.entries(ELITES).map(([k,c])=>[k,c.name]));
  for(const [id,data] of [['testWeapon',WEAPONS],['testItem',ITEMS],['testVehicle',VEHICLES],['testBuilding',BUILDINGS]])fill(id,Object.entries(data).map(([k,c])=>[k,c.name]));
  $('sandboxBtn').onclick=openSandbox;$('sandboxClose').onclick=closePanels;
  $('test-auto').onclick=()=>{sandboxWave.enabled=!sandboxWave.enabled;sandboxWave.timer=.1;showMsg(sandboxWave.enabled?'自动虫潮已恢复，精英与首领轮番加入':'自动虫潮已暂停，可手动召唤');closePanels();};
  document.querySelectorAll('[data-test-claim]').forEach(b=>b.onclick=()=>claimSandbox(b.dataset.testClaim,$(b.dataset.select)?.value));
  for(const action of ['selected','showcase','clear'])$('test-'+action).onclick=()=>{sandboxSpawn(action);closePanels();};
  $('test-reset').onclick=()=>{closePanels();newGame(true);};
  $('test-normal').onclick=()=>{closePanels();const saved=slotInfo(SAVE_PREFIX+'auto');if(saved)loadGame(saved);else newGame(false);};
}
function clearEntities(all){
  visuals.clearCorpses();
  for(const mo of monsters){visuals.release(mo.mesh);scene.remove(mo.mesh);}monsters.length=0;
  for(const b of bullets)disposeBullet(b.mesh);bullets.length=0;
  for(const b of beamPool){b.life=0;b.mesh.visible=false;}
  for(const p of pickups)scene.remove(p.mesh);pickups.length=0;
  if(all){
    for(const a of airdrops)scene.remove(a.mesh);airdrops.length=0;
    for(const bd of buildings)scene.remove(bd.mesh);buildings.length=0;
    for(const v of vehicles){visuals.release(v.mesh);scene.remove(v.mesh);}vehicles.length=0;
    for(const s of squad){visuals.release(s.mesh);scene.remove(s.mesh);}squad.length=0;
  }
}
function isBossLevel(){return Game.level===10;}
function isMiniBossLevel(){return Game.level===3||Game.level===6||Game.level===9;}
function levelName(){
  const ch=chapterCfg();
  let t=`周目${Game.loop} 第${Game.chapter}章「${ch.name}」 第${Game.level}关`;
  if(isBossLevel())t+=' 💀BOSS';else if(isMiniBossLevel())t+=' ⚔小BOSS';
  return t;
}
function startPrep(){
  Game.state='prep';
  clearEntities(false);
  // 修复并开启城门
  if(gate.dead)showMsg('🔧 城门已修复',1.5);
  gate.dead=false;gate.maxHp=Math.round(2500*(1+(Game.loop-1)*.4));gate.hp=gate.maxHp;
  updHPBar(gate.bar,1);gate.open=true;
  // 野怪
  const n=6+Math.min(10,Game.chapter+Game.loop);
  for(let i=0;i<n;i++){
    const x=rand(WORLD.minX+10,WORLD.maxX-10),z=rand(50,WORLD.maxZ-20);
    const ec=Game.loop>1||Game.chapter>3?.12:.05;
    spawnMonster('mob',x,z,{wild:true,elite:Math.random()<ec?true:undefined});
  }
  if(Math.random()<.5)spawnMonster('miniboss',rand(-30,30),rand(120,170),{wild:true});
  $('readyBtn').classList.remove('hidden');
  showMsg(levelName(),3);
  showHint(isTouch?'出城打虫赚金币 → 商店升级 / 建造防线 → 准备完毕，开战！':'出城打虫赚金币 → O 商店升级 / L 建造防线 → R 开战；医疗平台可回血');
  autoSave();
}
function startBattle(){
  if(Game.testMode){openSandbox();return;}
  Game.state='battle';
  $('readyBtn').classList.add('hidden');
  showHint('');
  // 清除剩余野怪标记（它们加入进攻）
  for(const mo of monsters){mo.wild=false;}
  const w=Game.wave;
  w.killed=0;w.spawned=monsters.length;w.timer=1.5;w.bossSpawned=false;w.done=false;
  if(isBossLevel()){
    w.total=monsters.length+1;
  }else{
    const n=Math.round((8+Game.level*2+Game.chapter*2)*(1+(Game.loop-1)*.35));
    w.total=monsters.length+n+(isMiniBossLevel()?1:0);
  }
  if(!gate.dead){gate.open=false;}
  AudioSys.sfx('wave');
  showMsg('⚔ 虫潮来袭！城门已关闭（靠近按I可开关）！',2.5);
}
function updWave(dt){
  if(Game.testMode){updSandboxWave(dt);$('waveTxt').textContent=`🧪 ${sandboxWave.enabled?'持续虫潮':'刷怪暂停'} · ${monsters.length}/48`;return;}
  const w=Game.wave;
  // 出怪
  if(w.spawned<w.total && monsters.length<48){
    w.timer-=dt;
    if(w.timer<=0){
      const remaining=w.total-w.spawned;
      if(isBossLevel()&&!w.bossSpawned&&remaining===1){
        w.bossSpawned=true;w.spawned++;
        const b=spawnMonster('boss',rand(-20,20),WORLD.maxZ-25);
        showMsg('💀 '+chapterCfg().boss+' 出现了！',3);
        AudioSys.sfx('wave');
      }else if(isMiniBossLevel()&&!w.bossSpawned&&remaining<=Math.ceil(w.total*.4)){
        w.bossSpawned=true;w.spawned++;
        spawnMonster('miniboss',rand(-30,30),WORLD.maxZ-30);
        showMsg('⚔ 小BOSS '+chapterCfg().boss+'的先锋 杀到！',2.5);
      }else if(!(isBossLevel()&&remaining<=1)){
        w.spawned++;
        // 从远处边缘出现；随进度提升精英概率
        const x=rand(WORLD.minX+8,WORLD.maxX-8);
        const ec=Math.min(.28,.04+(Game.loop-1)*.05+(Game.chapter-1)*.012);
        spawnMonster('mob',x,WORLD.maxZ-rand(10,30),Math.random()<ec?{elite:true}:{});
      }
      w.timer=Math.max(.4,2.2-Game.level*.12-Game.chapter*.06-(Game.loop-1)*.3);
    }
  }
  $('waveTxt').textContent=`🐛 击杀 ${w.killed}/${w.total}`;
  if(!w.done&&w.spawned>=w.total&&monsters.length===0){
    w.done=true;levelWin();
  }
}
let runGeneration=0;
function levelWin(){
  if(Game.testMode)return;
  const generation=runGeneration;
  AudioSys.sfx('win');
  const bonus=Math.round((80+Game.level*30+Game.chapter*50)*(1+(Game.loop-1)*.3));
  Game.gold+=bonus;Game.score+=100*Game.level;
  if(!new URLSearchParams(location.search).has('qa'))try{const key=SAVE_PREFIX+'rank-best';localStorage.setItem(key,String(Math.max(Number(localStorage.getItem(key))||0,Math.min(16777215,Math.floor(Game.score)))));}catch{}
  showMsg(`🎉 关卡胜利！奖励 ${bonus} 金币`,3);
  Game.level++;
  if(Game.level>10){
    Game.level=1;Game.chapter++;
    if(Game.chapter>10){
      Game.chapter=1;Game.loop++;
      showMsg(`🌟 全章通关！进入周目${Game.loop}，敌人更强了！`,4);
    }else{
      showMsg(`📖 进入第${Game.chapter}章「${chapterCfg().name}」`,3.5);
    }
  }
  base.hp=Math.min(base.maxHp,base.hp+300); // 关间维修
  updHPBar(base.bar,base.hp/base.maxHp);
  setTimeout(()=>{if(!Game.testMode&&generation===runGeneration&&Game.state==='battle')startPrep();},1500);
}
function gameOver(reason){
  if(Game.state==='over')return;
  Game.state='over';
  AudioSys.sfx('lose');
  $('overTitle').textContent='💀 游戏结束';
  $('overInfo').innerHTML=`${reason}<br><br>${levelName()}<br>⭐ 最终分数：${Game.score}　💰 金币：${Game.gold}`;
  $('menuOver').classList.remove('hidden');
  $('hud').classList.add('hidden');$('touchUI').classList.add('hidden');
}
function restartLevel(){
  runGeneration++;
  if(Game.testMode){newGame(true);return;}
  $('menuOver').classList.add('hidden');$('menuPause').classList.add('hidden');
  Game.state='prep';
  player.reset(Game.cls);
  base.hp=base.maxHp;updHPBar(base.bar,base.hp/base.maxHp);
  showHUD();
  startPrep();
}

/* ================= 商店 & 空投 ================= */
const SHOP={
  weapon:Object.keys(WEAPONS).filter(k=>WEAPONS[k].price>0).map(k=>({id:k,type:'weapon'})),
  item:Object.keys(ITEMS).filter(k=>k!=='grenade').map(k=>({id:k,type:'item'})),
  vehicle:Object.keys(VEHICLES).map(k=>({id:k,type:'vehicle'})),
  squad:[{id:'soldier',type:'squad'}],
};
let shopTab='weapon';
function renderShop(){
  $('shopGold').textContent=Game.gold;
  const grid=$('shopGrid');grid.innerHTML='';
  for(const it of SHOP[shopTab]){
    const div=document.createElement('div');div.className='shopItem';
    let nm,pr,desc,owned=false;
    if(it.type==='weapon'){
      const w=WEAPONS[it.id];nm=w.name;pr=w.price;
      const tags=[w.pellets?'×'+w.pellets+'弹丸':'',w.explode?'范围爆炸':'',w.homing?'追踪':'',w.pierce?'穿透':''].filter(Boolean).join(' ');
      desc=`伤害${w.dmg} 射速${(1/w.rate).toFixed(1)}/s 射程${w.range}${tags?'<br>'+tags:''}`;
      owned=Game.weapons.includes(it.id);
    }
    else if(it.type==='item'){const c=ITEMS[it.id];nm=c.name;pr=c.price;desc=c.desc;owned=(it.id==='magnet'&&Game.magnet)||(it.id==='regen'&&Game.regen);}
    else if(it.type==='vehicle'){const c=VEHICLES[it.id];nm=c.name;pr=c.price;desc=`血量${c.hp} 伤害${c.dmg}${c.fly?' 可飞行(K升U降)':''}`;owned=Game.vehiclesOwned.includes(it.id);}
    else{nm='雇佣兵队友';pr=500+squad.length*300;desc='AI队友,跟随作战(最多4名)';}
    div.innerHTML=`<div class="nm">${nm}</div><div>${desc}</div><div class="pr">${owned?(it.type==='weapon'?(Game.curWeapon===it.id?'✅使用中':'点击装备'):'✅已拥有'):(airdrops.some(a=>a.it.id===it.id&&a.it.type===it.type)?'📦送达中（关闭商店继续）':'💰'+pr)}</div>`;
    if(owned)div.classList.add('own');
    div.tabIndex=0;div.setAttribute('role','button');
    div.onclick=()=>buyItem(it,pr,owned);
    div.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();div.click();}};
    grid.appendChild(div);
  }
}
function buyItem(it,pr,owned){
  if(owned){if(it.type==='weapon'){Game.curWeapon=it.id;player.fireCd=0;renderShop();updHUD();showMsg('已装备 '+WEAPONS[it.id].name,1.5);}else showMsg('已拥有',1);return;}
  if(airdrops.some(a=>a.it.id===it.id&&a.it.type===it.type)){showMsg('物资正在空投，请关闭商店等待送达',2);return;}
  if(!Game.testMode&&Game.gold<pr){showMsg('金币不足！去野外刷怪吧',1.4);AudioSys.sfx('click');return;}
  if(it.type==='squad'&&squad.length>=4){showMsg('队友已满(4名)',1.2);return;}
  if(!Game.testMode)Game.gold-=pr;
  AudioSys.sfx('buy');
  if(it.type==='weapon'){
    Game.weapons.push(it.id);Game.curWeapon=it.id;player.fireCd=0;
    showMsg('已购买并装备 '+WEAPONS[it.id].name+'；点换枪或按V切换',2.5);
    updHUD();autoSave();
  }else airdropDeliver(it);
  renderShop();
}
function airdropDeliver(it){
  if(Game.testMode){grantSupply(it);return;}
  // 空投动画：箱子从天而降到基地旁
  AudioSys.sfx('airdrop');
  const crate=new THREE.Group();
  const box=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2),new THREE.MeshLambertMaterial({color:0xcc8833}));crate.add(box);
  const chute=new THREE.Mesh(new THREE.SphereGeometry(1.6,8,6,0,TAU,0,Math.PI/2),new THREE.MeshLambertMaterial({color:0xff5544,side:THREE.DoubleSide}));
  chute.position.y=2.4;crate.add(chute);
  const x=base.pos.x+rand(-4,4),z=base.pos.z+8+rand(-2,2);
  crate.position.set(x,40,z);
  scene.add(crate);
  airdrops.push({mesh:crate,x,z,it,chute});
  showMsg('📦 物资空投中…',1.5);
}
function grantSupply(it){
if(it.type==='weapon'){Game.weapons.push(it.id);Game.curWeapon=it.id;showMsg('🔫 获得 '+WEAPONS[it.id].name+'！(V键切换武器)',2);}
      else if(it.type==='item'){
        const c=ITEMS[it.id];
        if(it.id==='medkit')Game.items.medkit++;
        else if(it.id==='grenade')Game.items.grenade+=c.count;
        else if(it.id==='shield'){player.shield=Math.min(150,player.shield+c.shield);updHUDItem();}
        else if(it.id==='adren'){player.buffT=Math.max(player.buffT,c.buff);}
        else if(it.id==='hpUp'){if(player.maxHp<10000){Game.hpBonus+=30;player.maxHp+=30;player.hp+=30;}updHPBar(player.bar,player.hp/player.maxHp);}
        else if(it.id==='magnet'){Game.magnet=true;}
        else if(it.id==='regen'){Game.regen=true;}
        else if(it.id==='repair'){base.hp=Math.min(base.maxHp,base.hp+500);updHPBar(base.bar,base.hp/base.maxHp);}
        showMsg('📦 获得 '+c.name,1.6);
      }
      else if(it.type==='vehicle'){if(!Game.testMode||!vehicles.some(v=>v.kind===it.id)){Game.vehiclesOwned.push(it.id);spawnVehicle(it.id);}showMsg('🚗 '+VEHICLES[it.id].name+' 已送达停机坪！靠近按I驾驶',2.2);}
      else if(it.type==='squad'){spawnSquad();Game.squadCount=squad.length;showMsg('🪖 雇佣兵队友加入战斗！',1.8);}
}
function updAirdrops(dt){
  for(let i=airdrops.length-1;i>=0;i--){
    const a=airdrops[i];
    a.mesh.position.y-=dt*12;
    a.mesh.rotation.y+=dt;
    const gy=groundY(a.x,a.z)+.6;
    if(a.mesh.position.y<=gy){
      scene.remove(a.mesh);airdrops.splice(i,1);
      spawnParticles(new THREE.Vector3(a.x,gy,a.z),0xffcc66,10,5,.5);
      AudioSys.sfx('build');
      grantSupply(a.it);
    }
  }
}

/* ================= 建造 ================= */
function renderBuild(){
  $('buildGold').textContent=Game.gold;
  const grid=$('buildGrid');grid.innerHTML='';
  for(const k of Object.keys(BUILDINGS)){
    const c=BUILDINGS[k];
    const div=document.createElement('div');div.className='shopItem';
    div.innerHTML=`<div class="nm">${c.name}</div><div>${c.desc}<br>耐久${c.hp}${c.dmg?' 伤害'+c.dmg:''}</div><div class="pr">💰${c.price}</div>`;
    div.onclick=()=>{
      if(buildings.length>=32){showMsg('设施已达 32 座，请保留通路');return;}
      if(!Game.testMode&&Game.gold<c.price){showMsg('金币不足！',1.2);return;}
      if(!Game.testMode)Game.gold-=c.price;
      // 放在角色面前
      const fx=player.pos.x+Math.sin(player.yaw)*5,fz=player.pos.z+Math.cos(player.yaw)*5;
      placeBuilding(k,fx,fz,player.yaw+(k==='wall'?Math.PI/2:0));
      AudioSys.sfx('build');
      showMsg('🏗 '+c.name+' 建造完成！',1.4);
      closePanels();
    };
    grid.appendChild(div);
  }
}
function closePanels(){
  $('shopPanel').classList.add('hidden');$('buildPanel').classList.add('hidden');$('savePanel').classList.add('hidden');$('sandboxPanel').classList.add('hidden');$('platformPanel').classList.add('hidden');
  panelOpen=false;Input.reset();
}
let panelOpen=false;

/* ================= 存档系统 ================= */
const SAVE_PREFIX='sst_save_';
function saveData(){
  return{
    testMode:Game.testMode,loop:Game.loop,chapter:Game.chapter,level:Game.level,
    gold:Game.gold,score:Game.score,cls:Game.cls,
    weapons:Game.weapons,curWeapon:Game.curWeapon,items:Game.items,hpBonus:Game.hpBonus,
    vehiclesOwned:Game.vehiclesOwned,squadCount:squad.length,
    perks:{magnet:Game.magnet,regen:Game.regen},
    baseHp:base.hp,pendingDrops:airdrops.map(a=>a.it),
    buildings:buildings.map(b=>({k:b.kind,x:b.mesh.position.x,z:b.mesh.position.z,r:b.rotY,hp:b.hp})),
    time:Date.now(),
  };
}
function applySave(d){
  runGeneration++;
  Game.testMode=d.testMode===true;
  Game.loop=d.loop;Game.chapter=d.chapter;Game.level=d.level;
  Game.gold=d.gold;Game.score=d.score;Game.cls=d.cls;
  Game.weapons=d.weapons&&d.weapons.length?d.weapons:[CLASSES[d.cls].weapon];
  Game.curWeapon=d.curWeapon||Game.weapons[0];
  Game.items=d.items||{medkit:2,grenade:3};
  Game.hpBonus=d.hpBonus||0;
  Game.magnet=!!(d.perks&&d.perks.magnet);Game.regen=!!(d.perks&&d.perks.regen);
  Game.vehiclesOwned=[];
  clearEntities(true);
  player.reset(Game.cls);
  base.hp=d.baseHp||base.maxHp;updHPBar(base.bar,base.hp/base.maxHp);
  for(const b of (d.buildings||[]))placeBuilding(b.k,b.x,b.z,b.r,b.hp);
  for(const vk of (d.vehiclesOwned||[])){Game.vehiclesOwned.push(vk);spawnVehicle(vk);}
  for(let i=0;i<(d.squadCount||0);i++)spawnSquad();
  Game.squadCount=squad.length;
  for(const it of (d.pendingDrops||[])){
    if((it.type==='item'&&ITEMS[it.id])||(it.type==='vehicle'&&VEHICLES[it.id])||it.type==='squad')airdropDeliver(it);
  }
}
function savePrefix(){return SAVE_PREFIX+(Game.testMode?'sandbox_':'');}
function autoSave(){try{localStorage.setItem(savePrefix()+'auto',JSON.stringify(saveData()));}catch(e){}}
function slotInfo(key){
  try{
    const d=JSON.parse(localStorage.getItem(key));
    if(!d)return null;
    return d;
  }catch(e){return null;}
}
let saveMode='save'; // save / load
function renderSlots(){
  const list=$('slotList');list.innerHTML='';
  $('saveTitle').textContent=saveMode==='save'?'💾 选择存档位':'📂 选择要读取的存档';
  for(let i=1;i<=5;i++){
    const key=savePrefix()+i;
    const d=slotInfo(key);
    const div=document.createElement('div');div.className='saveSlot';
    const info=d?`周目${d.loop} 第${d.chapter}章 第${d.level}关 · ${CLASSES[d.cls].name} · 💰${d.gold} · ${new Date(d.time).toLocaleString()}`:'— 空存档位 —';
    div.innerHTML=`<span>存档${i}：${info}</span>`;
    const btns=document.createElement('span');
    if(saveMode==='save'){
      const b=document.createElement('button');b.className='mbtn';b.textContent='保存';
      b.onclick=()=>{localStorage.setItem(key,JSON.stringify(saveData()));AudioSys.sfx('buy');showMsg('💾 已保存到存档'+i,1.5);renderSlots();};
      btns.appendChild(b);
    }else if(d){
      const b=document.createElement('button');b.className='mbtn green';b.textContent='读取';
      b.onclick=()=>{loadGame(d);};
      btns.appendChild(b);
    }
    if(d){
      const del=document.createElement('button');del.className='mbtn red';del.textContent='删除';del.style.marginLeft='6px';
      del.onclick=()=>{localStorage.removeItem(key);renderSlots();};
      btns.appendChild(del);
    }
    div.appendChild(btns);
    list.appendChild(div);
  }
}
function loadGame(d){
  closePanels();
  $('menuMain').classList.add('hidden');$('menuPause').classList.add('hidden');$('menuOver').classList.add('hidden');
  setCameraView(0,false);
  applySave(d);
  showHUD();
  startPrep();
  if(Game.testMode){Game.state='battle';$('readyBtn').classList.add('hidden');sandboxSpawn('showcase');}
  AudioSys.sfx('win');
}

/* ================= 新游戏 / 界面切换 ================= */
function showHUD(){
  $('sandboxBtn').classList.toggle('hidden',!Game.testMode);
  $('hud').classList.remove('hidden');
  $('touchUI').classList.toggle('hidden',!isTouch);
}
function newGame(test){
  runGeneration++;
  resetSandboxWave();
  Game.testMode=!!test;
  Game.loop=1;Game.chapter=1;Game.level=1;
  Game.gold=test?99999:150;Game.score=0;
  Game.hpBonus=0;
  Game.weapons=test?Object.keys(WEAPONS):[CLASSES[Game.cls].weapon];
  Game.curWeapon=CLASSES[Game.cls].weapon;
  Game.items={medkit:test?99:2,grenade:test?99:3};
  Game.vehiclesOwned=[];
  Game.magnet=false;Game.regen=false;
  clearEntities(true);
  setCameraView(0,false);
  player.reset(Game.cls);
  base.hp=base.maxHp;updHPBar(base.bar,base.hp/base.maxHp);
  // 高台正面围墙（城门两侧；±9 空出给城门塔楼）
  for(const x of[-31,-25,-19,-13,13,19,25,31])placeBuilding('wall',x,-16,0);
  placeBuilding('mgTurret',-13.5,-21,0);placeBuilding('mgTurret',13.5,-21,0);
  placeBuilding('antiAir',22,-23,0);
  gate.dead=false;gate.hp=gate.maxHp=2500;updHPBar(gate.bar,1);gate.open=true;
  if(test){
    for(const vk of Object.keys(VEHICLES)){Game.vehiclesOwned.push(vk);spawnVehicle(vk);}
    placeBuilding('cannonTurret',16,-22,0);placeBuilding('bunker',-20,-24,0);
  }
  $('menuMain').classList.add('hidden');
  showHUD();
  startPrep();
  if(test){
    for(let i=0;i<4;i++)spawnSquad();Game.squadCount=squad.length;
    Game.state='battle';$('readyBtn').classList.add('hidden');
    sandboxSpawn('showcase');showHint('自由测试：持续虫潮 / 无敌 / 无限弹药 · H 测试台：暂停刷怪、召唤首领、领取装备');
    showMsg('🧪 自由测试 · 玩家、小队、载具与基地无敌',3);
  }
}
function togglePause(){
  Input.reset();
  if(Game.state==='prep'||Game.state==='battle'){
    Game.pausedFrom=Game.state;Game.state='paused';
    $('menuPause').classList.remove('hidden');
    AudioSys.sfx('click');
  }else if(Game.state==='paused'){
    Game.state=Game.pausedFrom;
    $('menuPause').classList.add('hidden');
    closePanels();
    AudioSys.sfx('click');
  }
}

/* ================= HUD 更新 ================= */
function updHUD(){
  $('statLine').textContent=Game.testMode?'🧪 自由测试 · 无限资源':levelName();
  $('hpTxt').textContent=Game.testMode?'∞ 无敌':Math.ceil(player.hp)+'/'+player.maxHp;
  $('hpBar').style.width=clamp(player.hp/player.maxHp*100,0,100)+'%';
  $('baseTxt').textContent=Game.testMode?'∞ 无敌':Math.ceil(base.hp)+'/'+base.maxHp;
  $('baseBar').style.width=clamp(base.hp/base.maxHp*100,0,100)+'%';
  const dx=base.pos.x-player.pos.x,dz=base.pos.z-player.pos.z;
  const sx=-Math.cos(camYaw)*dx+Math.sin(camYaw)*dz,sy=-Math.sin(camYaw)*dx-Math.cos(camYaw)*dz;
  const arrows=['→','↘','↓','↙','←','↖','↑','↗'];
  const distance=Math.hypot(dx,dz);
  $('baseGuide').textContent=distance<10?'🏰 基地附近':arrows[(Math.round(Math.atan2(sy,sx)/(Math.PI/4))+8)%8]+' 基地 '+Math.round(distance)+'米';
  $('goldTxt').textContent=Game.testMode?'∞':Game.gold;
  $('scoreTxt').textContent=Game.score;
  if(player.inVehicle)$('weapTxt').textContent='🚗 '+player.inVehicle.cfg.name;
  else $('weapTxt').textContent='🔫 '+WEAPONS[Game.curWeapon].name;
  updHUDItem();
  if(Game.state==='prep'){
    const wilds=monsters.filter(m=>!m.dead).length;
    $('waveTxt').textContent=`🌿 野怪剩余 ${wilds}`;
  }
  if(Game.msgTimer>0){Game.msgTimer-=1/60;if(Game.msgTimer<=0)$('msg').classList.add('hidden');}
}

/* ================= 摄像机 ================= */
function updCamera(dt){
  const tp=player.inVehicle?player.inVehicle.mesh.position:player.mesh.position;
  // 相机避崖：若身后地形明显高于角色（嵌入高台崖壁），逐步拉近相机
  let d=camDist;
  let cx=tp.x-Math.sin(camYaw)*d, cz=tp.z-Math.cos(camYaw)*d;
  while(d>5&&groundY(cx,cz)>tp.y+3.5){
    d-=1.5;
    cx=tp.x-Math.sin(camYaw)*d;
    cz=tp.z-Math.cos(camYaw)*d;
  }
  const cy=Math.max(tp.y+camH,groundY(cx,cz)+3);
  const look=tp.clone().add(new THREE.Vector3(0,2,0)),desired=new THREE.Vector3(cx,cy,cz);
  const ray=desired.clone().sub(look),length=ray.length();let obstructed=false;
  for(let step=.5;step<length;step+=.5){
    const point=look.clone().addScaledVector(ray,step/length);
    const gatePost=Math.abs(Math.abs(point.x)-7)<1.15&&Math.abs(point.z+16)<1.15&&point.y>PLAT.H&&point.y<PLAT.H+5.8;
    if(gatePost||point.y<groundY(point.x,point.z)+.25||fortress.shotBlocked(point)){desired.copy(look).addScaledVector(ray,Math.max(.35,step-.8)/length);obstructed=true;break;}
  }
  camera.position.lerp(desired,obstructed?1:Math.min(1,dt*6));
  if(Game.shake>0){
    Game.shake=Math.max(0,Game.shake-dt*1.5);
    camera.position.x+=rand(-1,1)*Game.shake;
    camera.position.y+=rand(-1,1)*Game.shake;
  }
  camera.lookAt(tp.x,tp.y+2,tp.z);
  if(!player.dead&&!player.inVehicle)player.mesh.visible=camera.position.distanceTo(look)>1.1;
}

/* ================= UI事件绑定 ================= */
document.querySelectorAll('#classRow .classCard').forEach(el=>{
  el.onclick=()=>{
    document.querySelectorAll('#classRow .classCard').forEach(e=>e.classList.remove('sel'));
    el.classList.add('sel');Game.cls=el.dataset.c;AudioSys.init();AudioSys.sfx('click');
  };
});
$('btnStart').onclick=()=>{AudioSys.init();AudioSys.resume();newGame(false);};
$('btnTest').onclick=()=>{AudioSys.init();AudioSys.resume();newGame(true);};
$('btnContinue').onclick=()=>{
  AudioSys.init();AudioSys.resume();
  const d=slotInfo(SAVE_PREFIX+'auto');
  if(d)loadGame(d);else showAlert('没有自动存档，请开始新游戏');
};
function showAlert(t){
  let el=$('toast');
  if(!el){el=document.createElement('div');el.id='toast';el.style.cssText='position:absolute;left:50%;top:16%;transform:translateX(-50%);font-size:20px;color:#ffe066;text-shadow:0 0 8px #f80;z-index:60;pointer-events:none;';stage.appendChild(el);}
  el.textContent=t;el.style.display='block';
  clearTimeout(el._t);el._t=setTimeout(()=>el.style.display='none',1800);
}
$('btnLoadMenu').onclick=()=>{AudioSys.init();saveMode='load';renderSlots();$('savePanel').classList.remove('hidden');panelOpen=true;};
$('btnLoadMenu2').onclick=()=>{saveMode='load';renderSlots();$('savePanel').classList.remove('hidden');panelOpen=true;};
$('btnSaveMenu').onclick=()=>{saveMode='save';renderSlots();$('savePanel').classList.remove('hidden');panelOpen=true;};
$('btnOverLoad').onclick=()=>{saveMode='load';renderSlots();$('savePanel').classList.remove('hidden');panelOpen=true;};
$('saveClose').onclick=closePanels;
$('btnResume').onclick=togglePause;
$('btnRestartLv').onclick=restartLevel;
$('btnRetry').onclick=restartLevel;
$('btnQuit').onclick=$('btnOverQuit').onclick=()=>{
  Game.state='menu';Game.testMode=false;$('sandboxBtn').classList.add('hidden');
  $('menuPause').classList.add('hidden');$('menuOver').classList.add('hidden');
  $('hud').classList.add('hidden');$('touchUI').classList.add('hidden');
  $('menuMain').classList.remove('hidden');
  closePanels();
};
$('readyBtn').onclick=()=>{if(Game.state==='prep')startBattle();};
$('shopClose').onclick=closePanels;
$('buildClose').onclick=closePanels;
document.querySelectorAll('#shopTabs .tab').forEach(el=>{
  el.onclick=()=>{
    document.querySelectorAll('#shopTabs .tab').forEach(e=>e.classList.remove('on'));
    el.classList.add('on');shopTab=el.dataset.t;renderShop();AudioSys.sfx('click');
  };
});

/* ================= 主循环 ================= */
let lastT=performance.now();
function loop(){
  requestAnimationFrame(loop);
  const now=performance.now();
  let dt=Math.min(.05,(now-lastT)/1000);lastT=now;
  // 全局按键
  if(Input.pop('P')){
    if(panelOpen)closePanels();
    else if(Game.state==='prep'||Game.state==='battle'||Game.state==='paused')togglePause();
  }
  if((Game.state==='prep'||Game.state==='battle')&&!panelOpen){
    if(Input.pop('O')){shopTab='weapon';document.querySelectorAll('#shopTabs .tab').forEach(e=>e.classList.toggle('on',e.dataset.t==='weapon'));renderShop();$('shopPanel').classList.remove('hidden');panelOpen=true;AudioSys.sfx('click');}
    else if(Input.pop('L')){renderBuild();$('buildPanel').classList.remove('hidden');panelOpen=true;AudioSys.sfx('click');}
  }else if(panelOpen&&(Input.pop('O')||Input.pop('L'))){closePanels();}
  const playing=(Game.state==='prep'||Game.state==='battle')&&!panelOpen;
  if(playing){
    if(player.dead){player.respawnT-=dt;if(player.respawnT<=0){player.reset(Game.cls);player.invulnerable=3;showMsg('已复活 · 3秒保护',2);}}
    player.invulnerable=Math.max(0,player.invulnerable-dt);
    updPlayer(dt);
    visuals.update(dt);
    updMonsters(dt);
    updBullets(dt);
    updBuildings(dt);
    updGate(dt);
    updVehicles(dt);
    updSquad(dt);
    updPickups(dt);
    updAirdrops(dt);
    if(Game.state==='battle')updWave(dt);
    AudioSys.bgm(dt,Game.state==='battle');
    updHUD();
  }else if(Game.state==='menu'){
    // 主菜单背景旋转镜头
    camYaw+=dt*.1;
    const cx=Math.sin(camYaw)*40,cz=-32+Math.cos(camYaw)*40;
    camera.position.set(cx,18,cz);
    camera.lookAt(0,2,-10);
    AudioSys.bgm(dt,false);
    updParticles(dt);
    $('interactHint').classList.add('hidden');
    frameStats(now);renderer.render(scene,camera);
    Input.clearFrame();
    return;
  }
  if(!playing)$('interactHint').classList.add('hidden'); // 暂停/面板/结算时隐藏交互提示
  updParticles(dt);
  if(playing)updCamera(dt);
  frameStats(now);renderer.render(scene,camera);
  Input.clearFrame();
}
const visuals=new ToyVisuals(THREE,scene);
await visuals.load().then(()=>{visualAssets=true;}).catch(error=>{
  console.error('Toy visuals:',error);$('assetLoad').textContent='场景准备失败；可重试或使用基础模型。';
  const retry=document.createElement('button');retry.textContent='重试';retry.onclick=()=>location.reload();$('assetLoad').appendChild(retry);
  const basic=document.createElement('button');basic.textContent='使用基础模型继续';basic.onclick=()=>$('assetLoad').remove();$('assetLoad').appendChild(basic);
});
if(visualAssets)$('assetLoad').remove();
visuals.environment(terrainH);
player.reset('gunner');
player.mesh.visible=false; // 菜单时隐藏
const _origNewGame=newGame;
newGame=function(t){player.mesh.visible=true;_origNewGame(t);};
const _origLoadGame=loadGame;
loadGame=function(d){player.mesh.visible=true;_origLoadGame(d);};
setupWebControls();
loop();
/* 页面隐藏时自动暂停 */
document.addEventListener('visibilitychange',()=>{
  if(/[?&]thumb=1(?:&|$)/.test(location.search))return;
  if(document.hidden&&(Game.state==='prep'||Game.state==='battle'))togglePause();
});
window.addEventListener('beforeunload',()=>{if(Game.state!=='menu')autoSave();});

// Shared website/Toy controls, QA-only entrypoint and performance sampling.

function frameStats(now){if(measuring&&previousFrame)frameTimes.push(now-previousFrame);previousFrame=now;}
function setupWebControls(){
  setupSandbox();
  setupToyPlatform({
    prefix:SAVE_PREFIX,
    getSave:()=>Game.state==='menu'?slotInfo(SAVE_PREFIX+'auto'):Game.testMode?null:saveData(),
    load:d=>loadGame(d),isTest:()=>Game.testMode||new URLSearchParams(location.search).has('qa'),
    open:()=>{closePanels();Input.reset();panelOpen=true;$('platformPanel').classList.remove('hidden');},close:closePanels,
    validate:d=>validateNormalSave(d,{weapons:WEAPONS,buildings:BUILDINGS,vehicles:VEHICLES})
  });
  document.querySelectorAll('.vbtn').forEach(el=>{el.dataset.key=el.id.slice(1);});
  let muted=false;
  $('touchBtn').onclick=()=>{isTouch=!isTouch;Input.reset();stage.classList.toggle('touch-mode',isTouch);fitStage();renderer.setSize(BASE_W,BASE_H,false);camera.aspect=BASE_W/BASE_H;camera.updateProjectionMatrix();$('touchUI').classList.toggle('hidden',!isTouch||Game.state==='menu');$('touchBtn').textContent=isTouch?'隐藏按键':'虚拟按键';};
  const quality=localStorage.getItem('chongchao-quality')||((isTouch)?'smooth':'high');
  function applyQuality(value){
    const displayScale=Math.max(innerWidth,rotated?innerHeight:0)/BASE_W;
    renderer.setPixelRatio(value==='high'?Math.min(displayScale*(devicePixelRatio||1),2):Math.min(displayScale,1.2));
    renderer.shadowMap.enabled=value==='high';visuals.quality=value;
    $('qualityBtn').textContent=value==='high'?'画质：精致':'画质：流畅';$('qualityBtn').dataset.quality=value;
    localStorage.setItem('chongchao-quality',value);
  }
  applyQuality(quality);$('qualityBtn').onclick=()=>applyQuality($('qualityBtn').dataset.quality==='high'?'smooth':'high');
  $('muteBtn').onclick=()=>{muted=!muted;AudioSys.init();AudioSys.master.gain.value=muted?0:.5;$('muteBtn').textContent=muted?'静音 M':'声音 M';};
  $('fullBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){showMsg('全屏不可用，可继续窗口游玩',2);}};
  window.addEventListener('keydown',e=>{
    if(e.repeat)return;
    if(!['Escape','KeyH'].includes(e.code)&&(e.target.closest?.('select,input')||(['Enter','Space'].includes(e.code)&&e.target.closest?.('button,[tabindex="0"]'))))return;
    if(e.code==='Enter'&&Game.state==='menu')$('btnStart').click();
    else if(e.code==='Enter'&&Game.state==='over')restartLevel();
    else if(e.code==='KeyR'&&Game.state==='prep'&&!panelOpen)startBattle();
    else if(e.code==='Escape'){if(panelOpen)closePanels();else if(['battle','prep','paused'].includes(Game.state))togglePause();}
    else if(e.code==='KeyH'&&Game.testMode){e.preventDefault();if(panelOpen)closePanels();else openSandbox();}
    else if(e.code==='KeyT'&&Game.state==='menu'){newGame(true);}
    else if(e.code==='KeyM')$('muteBtn').click();else if(e.code==='KeyF')$('fullBtn').click();
  });
  window.addEventListener('blur',()=>{Input.reset();if(['prep','battle'].includes(Game.state))togglePause();});
  $('keysHint').textContent+=' · R开战 · M声音 · F全屏';
  if(new URLSearchParams(location.search).get('qa')==='1'){
    window.__gameQA={WEAPONS,CHAPTERS,ELITES,BUILDINGS,ITEMS,bullets,buildings,rockColliders,fortress,groundY,tooSteep,slopeSpeed,interactionTarget,getCamYaw:()=>camYaw,collideWalls,fireBullet,updBullets,updBuildings,updPlayer,updSquad,updWave,sandboxWave,loadGame,autoSave,saveData,applySave,damageGate,damageBuilding,damageSquad,damageVehicle,placeBuilding,sandboxSpawn,claimSandbox,openSandbox,Game,player,base,gate,monsters,squad,vehicles,renderer,scene,camera,Input,newGame,startBattle,spawnMonster,spawnSquad,spawnVehicle,enterVehicle,exitVehicle,damageMonster,playerDamage,damageBase,restartLevel,clearEntities,setCameraView,visuals,
      startMeasure(){frameTimes.length=0;previousFrame=0;measuring=true;},
      endMeasure(){measuring=false;const s=[...frameTimes].sort((a,b)=>a-b),sum=s.reduce((a,b)=>a+b,0);return{samples:s.length,averageFPS:1000/(sum/s.length),medianMs:s[Math.floor(s.length*.5)],p95Ms:s[Math.floor(s.length*.95)],over50ms:s.filter(v=>v>50).length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:renderer.info.memory,viewport:[innerWidth,innerHeight],dpr:renderer.getPixelRatio(),drawingBuffer:[renderer.domElement.width,renderer.domElement.height],renderer:renderer.getContext().getParameter(renderer.getContext().getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL||renderer.getContext().RENDERER),quality:$('qualityBtn').dataset.quality,raw:frameTimes.slice()};}
    };
  }
  window.__tbThumbAutoStart=()=>{if(Game.state==='menu')newGame(true);window.__tbThumbStateName='playing';};
}

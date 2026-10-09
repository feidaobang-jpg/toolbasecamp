// 地狱公路：双侧完整荒漠、有限段循环卷轴；纹理和几何一次创建。
import * as THREE from 'three';
import { fixedRng } from './core.js';
import { ROAD } from './level.js';
import { Parts, GEO, mtx, meshFrom, toonMat } from './models.js';

export function roadWorld(A) {
  const g = A.group, r = fixedRng(3109), moving = A.def.id === 'hellroad';
  A.light = { sky: '#c0b5a8', ground: '#493429', hemi: 1.25, sun: '#ffe0ad', sunI: 1.55, dir: [-.5, 1, .7], fog: '#9c7866', fogNear: 50, fogFar: 210, bg: '#9c7866' };
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const c = canvas.getContext('2d'); c.fillStyle = '#4a4540'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) { c.fillStyle = i % 2 ? '#605850' : '#383633'; c.fillRect(r()*256, r()*256, 1+r()*2, 1); }
  c.strokeStyle = '#292927'; c.lineWidth = 2;
  for (let i=0;i<12;i++) { c.beginPath(); let x=r()*256,y=r()*256;c.moveTo(x,y);for(let j=0;j<6;j++){x+=r()*18-9;y+=r()*24;c.lineTo(x,y);}c.stroke(); }
  const tex = new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(50,3);tex.anisotropy=4;
  const grainCanvas=document.createElement('canvas');grainCanvas.width=grainCanvas.height=256;
  const gr=grainCanvas.getContext('2d');gr.fillStyle='#c0b5a2';gr.fillRect(0,0,256,256);
  for(let i=0;i<9500;i++){const v=110+Math.floor(r()*110);gr.fillStyle='rgb('+v+','+v+','+v+')';gr.fillRect(r()*256,r()*256,1+r()*2,1+r()*2);}
  for(let y=0;y<256;y+=17){gr.fillStyle='rgba(50,35,25,.13)';gr.fillRect(0,y,256,2+r()*4);}
  const grain=new THREE.CanvasTexture(grainCanvas);grain.colorSpace=THREE.SRGBColorSpace;grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.anisotropy=4;
  const sandMap=grain.clone();sandMap.repeat.set(180,180);sandMap.needsUpdate=true;
  const skyCanvas=document.createElement('canvas');skyCanvas.width=4;skyCanvas.height=128;const sc=skyCanvas.getContext('2d'),gradient=sc.createLinearGradient(0,0,0,128);gradient.addColorStop(0,'#373b48');gradient.addColorStop(.5,'#947361');gradient.addColorStop(1,'#c5a17a');sc.fillStyle=gradient;sc.fillRect(0,0,4,128);
  const skyTex=new THREE.CanvasTexture(skyCanvas);skyTex.colorSpace=THREE.SRGBColorSpace;
  const sky=new THREE.Mesh(new THREE.SphereGeometry(430,24,12),new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide,fog:false,depthWrite:false}));g.add(sky);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1000,1000), new THREE.MeshLambertMaterial({color:'#9b8060',map:sandMap}));sand.rotation.x=-Math.PI/2;sand.position.y=-.06;g.add(sand);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(500,ROAD.z1-ROAD.z0), new THREE.MeshLambertMaterial({map:tex}));road.name='hellroad-asphalt';road.rotation.x=-Math.PI/2;road.position.set(70,0,(ROAD.z0+ROAD.z1)/2);road.receiveShadow=true;g.add(road);
  const chunks=[];
  for(let k=0;k<14;k++) {
    const root=new THREE.Group(),p=new Parts();root.position.x=k*32-192;
    for(let x=0;x<32;x+=6) {
      p.add(GEO.box,'#c0a475',mtx(x,.012,.7,0,0,0,2.5,.016,.11));
      for(const z of [ROAD.z0,ROAD.z1]) p.add(GEO.box,'#aca295',mtx(x,.008,z,0,0,0,6,.01,.12));
    }
    for(const side of [-1,1]) {
      for(let j=0;j<8;j++) {
        const x=r()*32,z=.7+side*(5.8+r()*10),s=.3+r()*.8;
        p.add(GEO.oct,j%2?'#79604b':'#9b7c5b',mtx(x,s*.3,z,r(),r()*3,r()*.4,s*1.8,s*.8,s));
        if(j%3===0){const h=1.5+r()*2;p.add(GEO.cyl,'#494f37',mtx(x,h/2,z,0,0,0,.16,h,.16));p.add(GEO.cyl,'#555d3a',mtx(x+.32,h*.6,z,0,0,Math.PI/2,.12,.8,.12));p.add(GEO.cyl,'#555d3a',mtx(x+.65,h*.73,z,0,0,0,.12,h*.32,.12));}
      }
      // 岩壁在道路两侧远处，转镜头仍有完整三维轮廓。
      for(let j=0;j<3;j++){const h=7+r()*9,z=.7+side*(25+r()*15);p.add(GEO.oct,'#795343',mtx(j*12,h*.4,z,0,.15,0,10,h,8));p.add(GEO.box,'#8f654d',mtx(j*12,h*.75,z,0,.15,0,7,h*.22,6));}
      for(let x=0;x<32;x+=8){p.add(GEO.box,'#514b42',mtx(x,.45,.7+side*5.2,0,0,0,.14,.9,.14));p.add(GEO.box,'#c8b59a',mtx(x,.77,.7+side*5.2,0,0,0,.17,.14,.17));}
    }
    root.add(meshFrom(p.build(),{mat:toonMat({map:grain})}));g.add(root);chunks.push(root);
  }
  const sign=new THREE.Group(),p=new Parts();
  p.add(GEO.box,'#38342f',mtx(0,1.4,0,0,0,0,.12,2.8,.12));p.add(GEO.box,'#303c39',mtx(0,2.5,0,0,0,0,3,.95,.18));sign.add(meshFrom(p.build(),{}));
  const cv=document.createElement('canvas');cv.width=512;cv.height=160;const ct=cv.getContext('2d');ct.fillStyle='#273c35';ct.fillRect(0,0,512,160);ct.strokeStyle='#b6b294';ct.lineWidth=9;ct.strokeRect(8,8,496,144);ct.fillStyle='#eee0bb';ct.font='bold 48px sans-serif';ct.textAlign='center';ct.fillText('地 狱 公 路  →',256,70);ct.font='26px sans-serif';ct.fillText('HELL ROAD · 03',256,119);
  const signTex=new THREE.CanvasTexture(cv);signTex.colorSpace=THREE.SRGBColorSpace;
  const label=new THREE.Mesh(new THREE.PlaneGeometry(2.9,.9),new THREE.MeshBasicMaterial({map:signTex,side:THREE.DoubleSide}));label.position.set(0,2.5,.101);sign.add(label);sign.position.set(moving?30:9,0,-4.9);g.add(sign);
  A.roadScroll = distance => { if(!moving)return; chunks.forEach((ch,k)=>ch.position.x=((k*32-distance%448+448)%448)-192);tex.offset.x=distance/10;sign.position.x=160-(distance+130)%320; };
}

let bikeGeo;
export function buildBike() {
  if(!bikeGeo){const p=new Parts();
    for(const z of [-1.05,1.15]){p.add(GEO.cyl,'#201e1f',mtx(0,.48,z,0,0,Math.PI/2,.47,.26,.47));p.add(GEO.cyl,'#b6b3ae',mtx(0,.48,z,0,0,Math.PI/2,.3,.28,.3));}
    p.add(GEO.box,'#652b42',mtx(0,.8,0,0,0,0,.55,.5,1.7));p.add(GEO.sph,'#aa405b',mtx(0,1.05,.3,0,0,0,.4,.25,.55));
    p.add(GEO.box,'#262324',mtx(0,1.07,-.45,0,0,0,.6,.15,.65));
    for(const x of [-.22,.22]){p.add(GEO.cyl,'#ccc3ae',mtx(x,.98,.99,.4,0,0,.065,1.5,.065));p.add(GEO.cyl,'#a8a6a2',mtx(x,.54,-.05,Math.PI/2,0,0,.075,1.6,.075));}
    p.add(GEO.cyl,'#bebdb6',mtx(0,1.64,.67,0,0,Math.PI/2,.05,.9,.05));p.add(GEO.sph,'#ffefb1',mtx(0,1.45,1,0,0,0,.24,.23,.12));bikeGeo=p.build();
  }
  return meshFrom(bikeGeo,{});
}

export function buildRadio() {
  const p=new Parts();p.add(GEO.box,'#384b3a',mtx(0,.24,0,0,0,0,.5,.45,.3));p.add(GEO.box,'#242c24',mtx(.1,.26,.16,0,0,0,.2,.27,.015));p.add(GEO.box,'#9bcd7b',mtx(-.12,.31,.16,0,0,0,.1,.1,.02));p.add(GEO.cyl,'#c4baa0',mtx(-.17,.68,0,0,0,.1,.015,.7,.015));return meshFrom(p.build(),{});
}

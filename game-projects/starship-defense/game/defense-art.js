import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {WALL_TOP} from './fortress-layout.js';

// Thin armour follows the existing steep, non-walkable front face. No new collision.
export function createDefenseArt(scene,height,ground,gateDoor){
 const root=new T.Group();root.name='defense-armour';scene.add(root);
 const parts=[],lamps=[],unit=new T.BoxGeometry(1,1,1),dummy=new T.Object3D();
 function box(list,color,x,y,z,w,h,d,angle=0,az=0){
  const geo=unit.clone();dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.rotation.set(angle,0,az);dummy.updateMatrix();geo.applyMatrix4(dummy.matrix);
  const c=new T.Color(color),colors=new Float32Array(geo.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}geo.setAttribute('color',new T.BufferAttribute(colors,3));list.push(geo);
 }
 for(const side of [-1,1])for(let i=0;i<6;i++){
  const x=side*(10.45+i*4.95),w=4.72,bottom=Math.max(height(x-w/2,-9),height(x+w/2,-9))+.09,h=WALL_TOP-bottom,angle=-Math.atan2(1,h),cy=(WALL_TOP+bottom)/2;
  box(parts,0x2d424f,x,cy,-9.45,w,Math.hypot(h,1),.10,angle);
  // Riveted panel ribs are attached to that same slope, with a narrow clear gate approach.
  for(const xx of [-w/2+.08,w/2-.08])box(parts,0x536570,x+xx,cy,-9.34,.13,Math.hypot(h,1),.12,angle);
  box(parts,0x657c86,x,cy,-9.28,.15,Math.hypot(h*.66,w*.75),.12,angle,-Math.atan2(w*.75,h*.66));
  for(const t of [.24,.70]){const y=bottom+h*t,z=-8.91-t;box(parts,0x1f303b,x,y,z,w-.20,.09,.10,angle);}
  for(const xx of [-w/2+.16,w/2-.16])for(const t of [.12,.5,.88])box(parts,0x82939a,x+xx,bottom+h*t,-8.78-t,.075,.075,.07);
  box(parts,0x61747b,x,WALL_TOP-.06,-9.9,w,.14,.28);
  box(lamps,0x91c9cf,x,WALL_TOP-.76,-9.69,2.6,.065,.025);
 }
 // Surface paint stays on the centre ramp and never adds an invisible obstacle.
 for(let i=0;i<12;i++)for(const side of [-1,1]){
  const x=side*5.65,z=-7+i*1.15,y=height(x,z)+.048;
  const slope=(height(x,z+.2)-height(x,z-.2))/.4;
  box(parts,i%2?0xb6974b:0x2b373e,x,y,z,.30,.022,.62,-Math.atan(slope));
 }
 for(const x of [-8.12,8.12]){
  box(parts,0x253d4b,x,WALL_TOP+.18,-10.05,.44,.38,.36);
  box(lamps,0x81d3df,x,WALL_TOP+.2,-9.84,.30,.12,.035);
 }
 function finish(list,lit,parent=root){const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());const material=lit?new T.MeshBasicMaterial({vertexColors:true}):new T.MeshPhongMaterial({vertexColors:true,shininess:28,specular:0x4d6069});const mesh=new T.Mesh(geometry,material);mesh.name=lit?'defense-guide-lights':'defense-panel-batch';mesh.receiveShadow=!lit;mesh.castShadow=false;parent.add(mesh);return mesh;}
 finish(parts,false);finish(lamps,true);
 const doorParts=[];for(const side of [-1,1]){
  for(const y of [-1.7,1.7])box(doorParts,0x536674,0,y,side*.49,11.75,.18,.08);
  for(const x of [-4,-2,0,2,4])box(doorParts,0x62798a,x,0,side*.495,.07,4.2,.07);
  for(const x of [-5.7,5.7])for(const y of [-1.75,0,1.75])box(doorParts,0xb4bca7,x,y,side*.54,.12,.12,.08);
 }
 const doorDetails=finish(doorParts,false,gateDoor);doorDetails.name='defense-gate-fittings';unit.dispose();
 const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#f6f6f6';c.fillRect(0,0,128,128);
 let seed=711;for(let i=0;i<1400;i++){seed=(seed*1664525+1013904223)>>>0;const v=225+(seed%24);c.fillStyle=`rgb(${v},${v},${v})`;c.fillRect(seed%128,(seed>>>8)%128,1,1);}
 const grain=new T.CanvasTexture(canvas);grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(55,101.25);grain.colorSpace=T.SRGBColorSpace;
 const originalMap=ground.material.map;let enabled=null;
 return {root,setEnabled(value){root.visible=value;doorDetails.visible=value;if(value===enabled)return;enabled=value;ground.material.map=value?grain:originalMap;ground.material.needsUpdate=true;}};
}

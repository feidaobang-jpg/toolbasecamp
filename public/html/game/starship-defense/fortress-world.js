import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Static scenery is merged by colour. Collision is independent of render detail.
export class FortressWorld {
  constructor(scene, height) {
    this.solids=[];this.height=height;this.groups=new Map();
    this.shelter={x:30,z:34,r:3.5};this.cave={x:-42,z:49};
    const cream=0xf6dfae,teal=0x53b4ae,navy=0x365b6b,stone=0x809c91;
    const add=(shape,color,x,y,z,sx,sy,sz)=>{
      const source=shape==='rock'?new THREE.DodecahedronGeometry(1,0):new THREE.BoxGeometry(1,1,1);
      const g=source.index?source.toNonIndexed():source;if(g!==source)source.dispose();
      g.scale(sx,sy,sz);g.translate(x,y,z);
      if(!this.groups.has(color))this.groups.set(color,[]);this.groups.get(color).push(g);
    };
    const wall=(x,z,w,d,h,color=stone,base=height(x,z))=>{
      add('box',color,x,base+h/2,z,w,h,d);
      this.solids.push({x,z,hw:w/2,hd:d/2,bottom:base,top:base+h});
    };
    // Mountain horseshoe leaves the frontal approach open.
    for(const side of [-1,1])for(let i=0;i<6;i++){
      const x=side*(51+(i%2)*3),z=-58+i*13,h=16+(i%3)*5;
      add('rock',i%2?0x92b4a0:0x739f94,x,h*.48,z,14,h,15);
      this.solids.push({x,z,r:10,bottom:0,top:h});
    }
    for(let i=-2;i<=2;i++){
      const x=i*20,z=-70,h=24-Math.abs(i)*3;
      add('rock',0x789f99,x,h*.5,z,17,h,16);
      this.solids.push({x,z,r:13,bottom:0,top:h});
    }
    // Bright stair treads make the existing continuous walkable ramps readable.
    for(const side of [-1,1]){
      const x=side*8.75;
      for(let i=0;i<14;i++){
        const z=-26.35+i*.49,y=height(x,z)+.04;
        add('box',i%2?cream:0xe9c98e,x,y,z,3.15,.07,.35);
      }
      add('box',teal,x,9.65,-16,3.1,.1,6.7);
      // Raised side kerbs stop accidental lateral slipping off the stairs.
      for(const offset of [-1.72,1.72])for(let i=0;i<7;i++){
        const z=-25.9+i*.95;
        wall(x+offset,z,.15,.82,.5,teal,height(x,z));
      }
    }
    // A short, genuinely traversable cave with both ends open, not a sealed prop.
    for(const side of [-1,1])this.solids.push({x:-42+side*6,z:49,hw:2,hd:11,bottom:0,top:8});
    for(const [i,z] of [40,44.5,49,53.5,58].entries()){
      for(const side of [-1,1])add('rock',i%2?stone:0x93b09c,-42+side*6.2,4.5,z,2.8,5.6,3.6);
      add('rock',stone,-42,9.7+(i%2)*.35,z,6.8,4,3.6);
    }
    this.solids.push({x:-42,z:49,hw:6,hd:11,bottom:6,top:12.5});
    for(const z of [38,60]){
      add('box',teal,-42,5.8,z,8,.3,.35);
      for(const side of [-1,1])add('box',cream,-42+side*3.8,2.9,z,.3,5.8,.35);
    }
    for(const z of [42,49,56])add('box',0xa4e4cf,-42,5.4,z,2,.12,.6);
    // Rear-entry field shelter: walls provide cover and the interior heals.
    wall(25,34,1,12,4.4,cream,0);wall(35,34,1,12,4.4,cream,0);
    wall(30,39.5,11,1,4.4,cream,0);
    add('box',teal,30,4.5,34,12,.5,13);
    for(const x of [25,35])for(const z of [29,34,39])add('box',cream,x,5.1,z,1.6,.8,1.4);
    add('box',0xf5bf63,30,4.9,28,5,.25,.5);
    this.solids.push({x:30,z:34,hw:6,hd:6.5,bottom:4.25,top:4.75});
    add('box',navy,30,.04,34,9,.08,10);
    add('box',0x9de3bd,30,.1,34,3,.1,.7);add('box',0x9de3bd,30,.11,34,.7,.1,3);
    for(const [color,gs] of this.groups){
      const mesh=new THREE.Mesh(mergeGeometries(gs,false),new THREE.MeshLambertMaterial({color}));
      mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);gs.forEach(g=>g.dispose());
    }
    this.groups.clear();
  }
  blocked(x,z,r,y=this.height(x,z)) {
    return this.solids.some(s=>y+.3<s.top&&y+2>s.bottom&&(s.r?
      (x-s.x)**2+(z-s.z)**2<(r+s.r)**2:
      Math.abs(x-s.x)<s.hw+r&&Math.abs(z-s.z)<s.hd+r));
  }
  shotBlocked(p) {
    return this.solids.some(s=>p.y>s.bottom&&p.y<s.top&&(s.r?
      (p.x-s.x)**2+(p.z-s.z)**2<s.r*s.r:
      Math.abs(p.x-s.x)<s.hw&&Math.abs(p.z-s.z)<s.hd));
  }
}

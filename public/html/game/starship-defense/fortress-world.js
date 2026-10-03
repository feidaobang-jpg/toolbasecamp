import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {HILL_FORTS} from './terrain-controls.js';

// Static scenery is merged by colour. Collision is independent of render detail.
export class FortressWorld {
  constructor(scene, height, palette) {
    this.solids=[];this.height=height;this.groups=new Map();this.grid=new Map();this.indexed=-1;
    this.shelter={x:30,z:34,r:3.5};
    const P=palette.fort,cream=P.cream,teal=P.teal,navy=P.navy,stone=P.stone;
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
      add('rock',i%2?P.mountainA:P.mountainB,x,h*.48,z,14,h,15);
      this.solids.push({x,z,r:10,bottom:0,top:h});
    }
    for(let i=-2;i<=2;i++){
      const x=i*20,z=-82,h=24-Math.abs(i)*3;
      add('rock',P.mountainB,x,h*.5,z,17,h,16);
      this.solids.push({x,z,r:13,bottom:0,top:h});
    }
    // Two broad, continuous rear ramps lead onto the front firing platforms.
    for(const side of [-1,1]){
      for(let i=0;i<24;i++){const z=-45.5+i,y=height(side*24,z);add('box',i%3?teal:P.amber,side*24,y+.035,z,7.7,.07,.16);}
      // Low outer parapets provide a readable edge without blocking outward fire.
      for(let x=10;x<38;x+=4)add('box',stone,side*x,10.1,-10.3,2,.95,.65);
      for(let z=-55;z<-12;z+=4)add('box',stone,side*37.6,10.1,z,.65,.95,2);
    }
    // Rear-entry field shelter: walls provide cover and the interior heals.
    wall(25,34,1,12,4.4,cream,0);wall(35,34,1,12,4.4,cream,0);
    wall(30,39.5,11,1,4.4,cream,0);
    add('box',teal,30,4.5,34,12,.5,13);
    for(const x of [27,33]){add('box',cream,x,.65,35,1.4,.3,3);add('box',P.mint,x,.84,35,1.25,.12,2.6);}
    const floorRing=new THREE.Mesh(new THREE.RingGeometry(3.35,3.5,48),new THREE.MeshBasicMaterial({color:P.mint,side:THREE.DoubleSide}));floorRing.rotation.x=-Math.PI/2;floorRing.position.set(30,.14,34);scene.add(floorRing);
    const sign=document.createElement('canvas');sign.width=512;sign.height=128;const ctx=sign.getContext('2d');ctx.fillStyle='#102b32';ctx.fillRect(0,0,512,128);ctx.fillStyle='#9dffe0';ctx.textAlign='center';ctx.font='bold 44px Microsoft YaHei, sans-serif';ctx.fillText('＋ 野战医疗站',256,53);ctx.font='28px Microsoft YaHei, sans-serif';ctx.fillText('进入绿圈 · 自动回血',256,99);
    const board=new THREE.Mesh(new THREE.PlaneGeometry(8,2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sign),side:THREE.DoubleSide}));board.position.set(30,5.55,27.35);board.rotation.y=Math.PI;scene.add(board);
    add('box',P.amber,30,4.9,28,5,.25,.5);
    this.solids.push({x:30,z:34,hw:6,hd:6.5,bottom:4.25,top:4.75});
    add('box',navy,30,.04,34,9,.08,10);
    add('box',P.mint,30,.1,34,3,.1,.7);add('box',P.mint,30,.11,34,.7,.1,3);
    this.hillForts=HILL_FORTS;
    for(const f of HILL_FORTS){
      const y=height(f.x,f.z);
      // Rear doorway, low firing parapets and a roof: bullets really pass through the windows.
      wall(f.x-5,f.z,1,11,.85,cream,y);wall(f.x+5,f.z,1,11,.85,cream,y);
      wall(f.x,f.z+5,11,1,.85,cream,y);
      for(const side of [-1,1])wall(f.x+side*3.4,f.z-5,3.2,1,.85,cream,y);
      for(const side of [-1,1])for(const end of [-1,1]){
        wall(f.x+side*5,f.z+end*5,1.35,1.35,4,cream,y);
        add('box',P.amber,f.x+side*5,y+4.2,f.z+end*5,1.7,.5,1.7);
      }
      wall(f.x,f.z,12,12,.45,teal,y+3.4);
      add('box',navy,f.x,y+.03,f.z,9,.06,9);
      for(let i=0;i<6;i++){
        const z=f.z-6-i*2.6;
        add('box',P.amber,f.x,height(f.x,z)+.05,z,2,.07,.6);
      }
    }
    for(const [color,gs] of this.groups){
      const mesh=new THREE.Mesh(mergeGeometries(gs,false),new THREE.MeshLambertMaterial({color}));
      mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);gs.forEach(g=>g.dispose());
    }
    this.groups.clear();
  }
  // Uniform grid over solid footprints; rebuilt lazily when callers push new solids.
  index(){
    if(this.indexed===this.solids.length)return;
    this.grid.clear();
    for(const s of this.solids){
      const ex=s.r||s.hw,ez=s.r||s.hd;
      for(let cx=Math.floor((s.x-ex)/8);cx<=Math.floor((s.x+ex)/8);cx++)for(let cz=Math.floor((s.z-ez)/8);cz<=Math.floor((s.z+ez)/8);cz++){
        const k=cx*4096+cz;let cell=this.grid.get(k);if(!cell)this.grid.set(k,cell=[]);cell.push(s);
      }
    }
    this.indexed=this.solids.length;
  }
  near(x,z,r){
    this.index();const out=new Set();
    for(let cx=Math.floor((x-r)/8);cx<=Math.floor((x+r)/8);cx++)for(let cz=Math.floor((z-r)/8);cz<=Math.floor((z+r)/8);cz++){const cell=this.grid.get(cx*4096+cz);if(cell)for(const s of cell)out.add(s);}
    return out;
  }
  blocked(x,z,r,y=this.height(x,z)) {
    for(const s of this.near(x,z,r))if(y+.3<s.top&&y+2>s.bottom&&(s.r?
      (x-s.x)**2+(z-s.z)**2<(r+s.r)**2:
      Math.abs(x-s.x)<s.hw+r&&Math.abs(z-s.z)<s.hd+r))return true;
    return false;
  }
  // Cover rocks stop enemy acid and movement, never the player's own shots.
  shotBlocked(p,friendly=false) {
    for(const s of this.near(p.x,p.z,0))if(!(friendly&&s.cover)&&p.y>s.bottom&&p.y<s.top&&(s.r?
      (p.x-s.x)**2+(p.z-s.z)**2<s.r*s.r:
      Math.abs(p.x-s.x)<s.hw&&Math.abs(p.z-s.z)<s.hd))return true;
    return false;
  }
  inside(s,x,z){return s.r?(x-s.x)**2+(z-s.z)**2<s.r*s.r:Math.abs(x-s.x)<s.hw&&Math.abs(z-s.z)<s.hd;}
  // Highest solid top over a point: flyers and the camera stay above tunnel roofs.
  topAt(x,z){let top=-Infinity;for(const s of this.near(x,z,0))if(this.inside(s,x,z))top=Math.max(top,s.top);return top;}
  // Lowest solid bottom above y at a point; finite only under roofs (tunnels, caves).
  ceilingAt(x,z,y){let c=Infinity;for(const s of this.near(x,z,0))if(s.bottom>y+.5&&this.inside(s,x,z))c=Math.min(c,s.bottom);return c;}
}

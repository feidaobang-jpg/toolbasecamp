import * as THREE from './vendor/three.module.js';
// Restored from the pre-fauna battlefield insects (af5668d6): six jointed legs,
// segmented armour, mandibles and small eyes. Shared geometry stays three draws.
const BUG_COLORS=[0x785036,0x566337,0x554862,0x395d63,0x853f2d,0x696331,0x394e71,0x484953,0x626465,0x653346];
export const ENEMY_FORMS=['warrior','acid-spitter','armoured-beetle','winged-hunter','fire-beetle','broodling','storm-beetle','shadow-hunter','siege-beetle','royal-warrior'];
const shade=(c,k)=>new THREE.Color(c).multiplyScalar(k).getHex();
const mix=(a,b,t)=>new THREE.Color(a).lerp(new THREE.Color(b),t).getHex();
export function createEnemy(v,scale=1,kind='mob',fly=false,species=0){
    const key='chitin'+kind+(fly?'fly':'')+species;
    if(!v.cache.has(key)){
      const C=BUG_COLORS[species]||BUG_COLORS[0],CD=shade(C,.55),CL=mix(C,0xffe6c0,.25),U=0x2a2026,bone=0xe6d6ae,eye=0xff2a14,gold=0xb9a381;
      const big=kind==='boss'||kind==='queen',b=[],legs=[],wings=[],pivot=.9;
      v.part(b,'sphere',C,[0,.98,-.6],[.7,.56,.82]);
      for(let i=0;i<4;i++)v.part(b,'sphere',CD,[0,1.25+(i===0?.04:0)-i*.03,-.18-i*.28],[.6-i*.06,.17,.15]);
      v.part(b,'sphere',U,[0,.78,-.55],[.6,.38,.72]);
      v.part(b,'sphere',C,[0,.98,.22],[.46,.4,.46]);v.part(b,'sphere',CL,[0,1.18,.22],[.36,.18,.36]);
      v.part(b,'sphere',C,[0,.94,.78],[.36,.31,.36]);v.part(b,'sphere',CD,[0,1.12,.72],[.26,.12,.26]);
      for(const s of [-1,1]){
        v.part(b,'sphere',eye,[s*.15,1.02,1.08],[.075,.075,.05],[0,0,0],1);
        v.part(b,'sphere',eye,[s*.27,.97,1.0],[.045,.045,.035],[0,0,0],1);
        v.part(b,'cone',bone,[s*.16,.78,1.17],[.07*(big?1.4:1),.42*(big?1.3:1),.07*(big?1.4:1)],[Math.PI/2.1,0,-s*.45]);
      }
      [[0,1.48,-.3],[0,1.4,-.75],[0,1.26,-1.1]].forEach(p=>v.part(b,'cone',bone,p,[.08,.3,.08],[-.5,0,0]));
      v.part(b,'cone',CD,[0,.9,-1.42],[.12,.4,.12],[-Math.PI/2,0,0]);
      if(kind==='elite'||kind==='miniboss')for(let i=-1;i<=1;i++)v.part(b,'cone',gold,[i*.2,1.36-Math.abs(i)*.06,.6],[.07,.32,.07],[-.3,0,-i*.4],.25);
      if(kind==='miniboss')for(const s of [-1,1])v.part(b,'sphere',CD,[s*.42,1.12,.2],[.22,.16,.3]);
      if(big){
        for(let i=-2;i<=2;i++)v.part(b,'cone',gold,[i*.13,1.28-Math.abs(i)*.05,.86],[.06,.42-Math.abs(i)*.08,.06],[-.25,0,-i*.3],.35);
        for(const s of [-1,1])v.part(b,'cylinder',0xff7a2a,[s*.3,1.33,-.5],[.07,.08,.07],[0,0,0],1);
      }
      if(kind==='queen'){
        v.part(b,'sphere',mix(C,0x76434a,.35),[0,1.15,-1.75],[1.0,.82,1.25],[0,0,0],.08);
        for(let i=0;i<5;i++)v.part(b,'sphere',0xff9a5a,[Math.sin(i*1.3)*.5,1.5+Math.cos(i*2.1)*.2,-1.4-i*.22],[.12,.12,.12],[0,0,0],1);
      }
      for(const s of [-1,1]){
        const l=[];
        for(const [z,splay] of [[.5,.5],[.1,.05],[-.3,-.45]]){
          const hipP=[s*.42,.95-pivot,z],knee=[s*1.0,1.28-pivot,z+splay*.5],foot=[s*1.32,.03-pivot,z+splay];
          v.segment(l,CD,hipP,knee,.075);v.segment(l,CD,knee,foot,.055);v.part(l,'cone',bone,[foot[0],foot[1]+.05,foot[2]],[.05,.14,.05],[Math.PI,0,0]);
        }
        legs.push(v.merged(l));
        if(fly){const w=[];v.part(w,'sphere',0x779c9f,[s*.95,0,-.1],[.95,.05,.42],[0,s*.3,0],.08);wings.push(v.merged(w));}
      }
      v.cache.set(key,{body:v.merged(b),legs,wings});
    }
    const data=v.cache.get(key),root=v.root('bug',data.body,data.legs,1.75);
    root.userData.toy.feet.forEach(m=>m.position.y=.9);
    if(data.wings.length){root.userData.toy.wings=data.wings.map(g=>{const m=v.mesh(g);m.position.set(0,1.35,.05);root.add(m);return m;});}
    root.scale.setScalar(scale);root.userData.toy.fly=fly;root.userData.enemy={species,rank:kind,form:kind==='queen'?'brood-queen':ENEMY_FORMS[species]||ENEMY_FORMS[0],motion:'skitter'};return root;
  }

// Original enamel-armoured space fauna. Silhouette communicates both species and
// rank; no realistic spider limbs, teeth or clustered red eyes. All parts are
// baked into shared vertex-colour geometry (three draws, five for winged units).
const COLORS=[0xefaa59,0x8acba1,0xa696cf,0x75cfe0,0xf78c61,0xbacf78,0x779fe5,0xaaa9dc,0x99b6c7,0xd990b2];
export const ENEMY_FORMS=['round-shell','sprout-pod','armour-pill','moon-moth','ember-orb','seed-cluster','antenna-ray','comet-glider','heavy-tortoise','royal-guard'];

export function createEnemy(v,scale=1,kind='mob',fly=false,species=0){
  species=Number.isInteger(species)&&species>=0&&species<10?species:0;
  const key=`fauna-${species}-${kind}-${!!fly}`;
  if(!v.cache.has(key)){
    const c=COLORS[species],navy=0x354759,ivory=0xf4e8c9,gold=0xf4c66b,cyan=0xa2eced;
    const b=[],feet=[[],[]],wings=[];
    let height=1.85,motion='waddle',form=ENEMY_FORMS[species];
    const part=(shape,color,p,s,r=[0,0,0],glow=0,list=b)=>v.part(list,shape,color,p,s,r,glow);
    const orb=(color,p,s,glow=0,list=b)=>part('sphere',color,p,s,[0,0,0],glow,list);
    const plate=(color,p,s,r=[0,0,0])=>part('box',color,p,s,r);
    const face=(y,z,size=1)=>{
      // Two large, calm eyes: ivory rims, dark pupils and small white highlights.
      orb(navy,[0,y,z-.055],[.43*size,.22*size,.12*size]);
      for(const side of [-1,1]){
        orb(ivory,[side*.2*size,y,z],[.145*size,.17*size,.10*size],.08);
        orb(navy,[side*.2*size,y+.015*size,z+.088*size],[.064*size,.10*size,.04*size]);
        orb(0xffffff,[side*.2*size-.016*size,y+.063*size,z+.122*size],[.025*size,.031*size,.015*size],.25);
      }
    };
    const boots=(wide=.46,depth=.36,pairs=1)=>{
      for(let i=0;i<2;i++)for(let j=0;j<pairs;j++){
        const x=(i?1:-1)*wide,z=pairs===1?.13:(j?-.48:.47);
        orb(navy,[x,.32-.4,z],[.19,.29,.20],0,feet[i]);
        orb(c,[x,.15-.4,z+.05],[.25,.16,depth],0,feet[i]);
        orb(ivory,[x,.18-.4,z+depth*.8],[.18,.065,.055],0,feet[i]);
      }
    };
    const feelers=(y,z,spread=.28)=>{
      for(const side of [-1,1]){
        v.segment(b,navy,[side*spread,y,z],[side*(spread+.10),y+.28,z-.05],.035);
        orb(gold,[side*(spread+.10),y+.30,z-.05],[.09,.09,.09],.2);
      }
    };
    const fins=(wide=1.1,y=1.12)=>{
      for(const side of [-1,1]){
        const list=[];
        orb(c,[side*wide*.68,0,-.14],[wide*.78,.10,.62],0,list);
        orb(ivory,[side*wide*.84,.06,-.20],[wide*.42,.045,.38],.12,list);
        orb(cyan,[side*wide*1.13,.075,-.20],[.14,.055,.20],.3,list);
        wings.push({geometry:v.merged(list),y});
      }
    };
    const crown=(y,z=0)=>{
      part('cylinder',gold,[0,y,z],[.40,.10,.40]);
      for(let i=-1;i<=1;i++)orb(gold,[i*.23,y+.15-Math.abs(i)*.035,z],[.10,.16,.10],.1);
      orb(cyan,[0,y+.20,z+.095],[.08,.09,.05],.4);
    };

    if(kind==='queen'){
      form='petal-mothership';motion='hover';height=2.3;
      orb(navy,[0,.45,0],[.79,.21,.76]);
      orb(c,[0,1,0],[.80,.72,.78]);orb(ivory,[0,1.36,.06],[.61,.34,.60]);
      for(let i=0;i<6;i++){
        const a=i*Math.PI/3,x=Math.cos(a),z=Math.sin(a);
        part('sphere',i%2?c:ivory,[x*.92,.79,z*.92],[.40,.17,.68],[0,Math.PI/2-a,0]);
        orb(gold,[x*1.12,.88,z*1.12],[.12,.07,.12],.25);
      }
      face(1.04,.75,1.12);crown(1.87);boots(.43,.32);
      // Small underside pods pulse gently, rather than writhing limbs.
      for(const side of [-1,1])orb(cyan,[side*.48,.33,0],[.14,.12,.27],.3);
    }else if(kind==='boss'){
      const type=fly?1:species%3;form=['citadel-tortoise','sky-manta','fortress-walker'][type];
      height=type===1?2.3:2.5;
      if(type===0){
        orb(navy,[0,.62,0],[.94,.35,.95]);orb(c,[0,1.10,-.18],[1.02,.73,1.0]);
        for(const side of [-1,1]){
          orb(ivory,[side*.53,1.46,-.22],[.38,.26,.63]);
          part('cylinder',navy,[side*.70,1.34,.54],[.18,.63,.18],[Math.PI/2,0,0]);
          orb(cyan,[side*.70,1.34,.87],[.12,.12,.025],.4);
        }
        orb(c,[0,.94,.83],[.58,.47,.44]);face(1.03,1.19,1.12);boots(.76,.34,2);crown(2.02,-.20);
      }else if(type===1){
        motion='hover';orb(c,[0,1.01,-.1],[.67,.58,1.07]);orb(ivory,[0,1.30,.06],[.52,.28,.72]);
        fins(1.45,1.03);orb(c,[0,.94,.87],[.53,.36,.40]);face(1.04,1.21,1.08);
        for(const side of [-1,1])orb(gold,[side*.4,1.05,-1.0],[.22,.12,.55]);
        boots(.38,.26);crown(1.91,-.1);
      }else{
        orb(c,[0,1.1,0],[.78,.84,.67]);orb(ivory,[0,1.38,.55],[.59,.44,.17]);
        for(const side of [-1,1]){
          orb(navy,[side*.94,.91,0],[.33,.59,.44]);orb(c,[side*.95,1.16,.15],[.43,.52,.48]);
          orb(gold,[side*.95,1.52,.2],[.29,.14,.28]);orb(cyan,[side*.96,1.20,.59],[.17,.20,.07],.3);
        }
        face(1.55,.72,1.14);boots(.51,.38);crown(2.15);
      }
    }else if(kind==='miniboss'){
      form='gauntlet-captain';height=2.12;motion='march';
      orb(c,[0,1.02,0],[.58,.68,.50]);orb(ivory,[0,1.10,.4],[.39,.40,.18]);
      orb(c,[0,1.50,.13],[.52,.43,.43]);face(1.53,.54);
      for(const side of [-1,1]){
        orb(navy,[side*.60,.97,.12],[.20,.34,.25]);
        orb(c,[side*.78,.77,.25],[.37,.38,.36]);
        orb(ivory,[side*.81,.77,.55],[.24,.24,.075]);
        orb(gold,[side*.58,1.38,0],[.29,.16,.28]);
      }
      plate(gold,[0,1.96,-.02],[.56,.10,.16]);feelers(1.90,-.08,.19);height=2.35;boots(.34,.30);
    }else{
      switch(species){
        case 0: // Ladybird-like round shell with small boots.
          orb(navy,[0,.68,-.08],[.65,.35,.68]);
          for(const side of [-1,1]){
            orb(c,[side*.28,1,-.13],[.38,.54,.69]);
            orb(ivory,[side*.35,1.40,-.16],[.13,.055,.20]);
          }
          orb(c,[0,.83,.48],[.49,.36,.38]);face(.97,.80);feelers(1.32,.3);boots();break;
        case 1: // Pear-shaped sprayer with a leaf backpack and round nozzle.
          orb(c,[0,.84,-.08],[.69,.68,.61]);orb(ivory,[0,.88,.37],[.50,.47,.22]);
          orb(c,[0,1.42,-.19],[.31,.36,.34]);
          part('sphere',0x64aa88,[.22,1.71,-.22],[.34,.07,.17],[0,0,.35]);
          face(1.14,.56);part('cylinder',navy,[0,.78,.70],[.13,.28,.13],[Math.PI/2,0,0]);
          orb(cyan,[0,.78,.85],[.08,.08,.03],.3);boots(.4,.26);height=1.95;break;
        case 2: // Wide segmented pill armour, no exposed limbs.
          orb(navy,[0,.65,-.1],[.74,.39,.77]);
          for(let j=0;j<3;j++)orb(j===1?ivory:c,[0,.92,-.58+j*.44],[.74,.58,.31]);
          orb(c,[0,.76,.64],[.46,.31,.24]);face(.90,.84,.9);boots(.56,.29,2);height=1.60;break;
        case 3: // Four-lobed moth wings create a broad airborne silhouette.
          orb(c,[0,.86,0],[.38,.55,.65]);orb(ivory,[0,1.02,.41],[.35,.32,.21]);
          fins(.97,1.0);face(1.13,.59,.82);feelers(1.43,.18,.17);boots(.22,.22);motion='hover';break;
        case 4: // Smooth glowing furnace orb and three blunt heat fins.
          orb(c,[0,.92,0],[.70,.71,.66]);orb(ivory,[0,.89,.54],[.49,.37,.14]);
          for(let j=-1;j<=1;j++)orb(j?gold:ivory,[j*.28,1.53-Math.abs(j)*.1,-.05],[.14,.27,.16],.18);
          face(1.02,.69);orb(gold,[0,.64,.65],[.11,.07,.055],.35);boots(.43,.29);height=1.86;break;
        case 5: // A clover seed pod communicates the split ability.
          orb(c,[0,.83,.1],[.53,.57,.55]);
          for(const side of [-1,1]){orb(c,[side*.52,.83,-.26],[.35,.43,.40]);orb(ivory,[side*.54,1.06,-.02],[.16,.12,.11]);}
          orb(ivory,[0,1.32,0],[.20,.19,.26]);face(.98,.62,.88);boots(.40,.28);height=1.65;break;
        case 6: // Ray-like side fins and a ball-tipped antenna.
          orb(c,[0,.87,0],[.50,.56,.66]);orb(ivory,[0,1.02,.41],[.39,.30,.23]);
          for(const side of [-1,1])part('sphere',c,[side*.68,.97,-.16],[.55,.13,.40],[0,side*.25,side*.18]);
          v.segment(b,gold,[0,1.34,-.15],[0,1.75,-.25],.045);orb(cyan,[0,1.81,-.25],[.16,.16,.16],.35);
          face(1.10,.64,.9);boots(.33,.27);height=2.0;break;
        case 7: // Sleek comet mantle; two rounded ear fins instead of spikes.
          orb(c,[0,.91,-.2],[.53,.47,.88]);orb(ivory,[0,1,.43],[.43,.31,.24]);
          for(const side of [-1,1])part('sphere',c,[side*.34,1.43,.1],[.15,.40,.19],[0,0,-side*.28]);
          orb(cyan,[0,1.1,-.94],[.17,.13,.31],.18);face(1.10,.66,.90);boots(.36,.30);height=1.88;motion='glide';break;
        case 8: // Heavy tortoise: broad ivory rim, dome and four squat feet.
          orb(ivory,[0,.69,-.12],[.86,.22,.91]);orb(c,[0,.98,-.19],[.77,.58,.79]);
          for(const side of [-1,1])orb(navy,[side*.43,1.29,-.28],[.13,.055,.32]);
          orb(c,[0,.69,.72],[.41,.29,.32]);face(.80,.98,.85);boots(.64,.30,2);height=1.68;motion='march';break;
        default: // Upright royal guard with shield-like arms and a helmet crest.
          orb(c,[0,.94,0],[.46,.62,.43]);orb(ivory,[0,1,.34],[.31,.36,.18]);
          orb(c,[0,1.47,.04],[.44,.36,.40]);face(1.51,.42,.88);
          for(const side of [-1,1])orb(c,[side*.53,.94,.05],[.22,.38,.29]);
          orb(gold,[0,1.82,-.01],[.1,.24,.25]);boots(.30,.27);height=2.12;motion='march';break;
      }
      if(kind==='elite'){
        // Wider shoulder shields + a dorsal pennant remain readable from above.
        for(const side of [-1,1]){
          orb(gold,[side*.64,1.17,.0],[.22,.30,.28]);
          orb(ivory,[side*.67,1.22,.20],[.12,.14,.08]);
        }
        v.segment(b,navy,[0,1.2,-.35],[0,1.91,-.35],.04);
        plate(gold,[.16,1.80,-.35],[.35,.25,.09]);height=Math.max(height,2.07);
      }
      if(fly&&!wings.length)fins(.98,1.16);
    }
    if(fly&&!wings.length)fins(1.02,1.19);
    v.cache.set(key,{body:v.merged(b),legs:feet.map(f=>v.merged(f)),wings,height,motion,form});
  }
  const data=v.cache.get(key),root=v.root('bug',data.body,data.legs,data.height);
  root.userData.toy.feet.forEach(m=>m.position.y=.4);
  if(data.wings.length)root.userData.toy.wings=data.wings.map(w=>{const m=v.mesh(w.geometry);m.position.y=w.y;root.add(m);return m;});
  root.scale.setScalar(scale);root.userData.toy.fly=fly;
  root.userData.enemy={species,rank:kind,form:data.form,motion:data.motion};
  return root;
}

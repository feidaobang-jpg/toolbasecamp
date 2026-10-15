// 虫潮对战（1 对 1 到 4 对 4）：三路野区、每人独立的金币与银行、派兵放虫、建造防守、电脑对手与联机同步。
// 设计见 game-projects/starship-defense/design/versus-mode.md；数值为初始值，靠电脑对打模拟调平衡。
// 只在对战模式启用：单机战役、合作联机、副本和自由测试不经过这里。
// 每队 1–4 个「座位」（blue0…blue3、red0…red3），每个座位一份经济（金币、银行、出兵冷却、路线）和一名英雄，
// 由真人或电脑控制；全队共用一个基地核心。
import {wallTouches} from './wall-geometry.js';
import {monsterStep} from './monster-navigation.js';
import {createVersusCreatures,JUNGLE_CAMPS} from './versus-creatures.js';

// 场地放在主战场北边很远处（雾外），原地图的地形、城墙、虫洞碰撞都不会影响这里。
export const ARENA={z:900,halfX:88,halfZ:104,mid:25};
export const TEAMS=['blue','red'];
export const TEAM_COLOR={blue:0x3fa9ff,red:0xff5a4d,neutral:0xd9b15e};
export const TEAM_CSS={blue:'#3fa9ff',red:'#ff5a4d',neutral:'#d9b15e'};
export const TEAM_NAME={blue:'蓝方',red:'红方'};
export const VS_RULES={
  startGold:600,incomeEvery:10,income:[60,85,115,150,190],bankCost:[0,500,900,1400,2000],
  bankHp:800,bankHpStep:200,bankDown:30,bankTrickle:30,
  prep:20,tier2:180,tier3:360,lateBoost:360,lateMul:1.5,surgeEvery:30,corrode:[[360,1.5],[540,2]],frenzy:[[360,1.25],[540,1.5]],limit:900,overtime:120,overtimeWave:20,
  hqHp:6000,hqGun:{dmg:12,rate:.18,range:32},popCap:24,buildLimit:16,bounty:.25,heroBounty:150,
  heroDmgMul:.8,heroVsBuilding:.6,respawnBase:8,respawnStep:2,respawnMax:20,surrenderAfter:300,
  baseHealRange:12,baseHeal:8,grenadeCd:6,bldHp:1.6,bldDmg:1.3, // 对战里设施更耐打、火力更强：守方靠炮塔，派兵靠数量
  giveStep:200,
  laneEvery:25,laneBounty:18,xpRadius:36,heroMaxLevel:15,heroHpPerLevel:14,heroDamagePerLevel:.04,
};
// 每队人数：1 对 1 到 4 对 4。多人时场地只拉宽东西向（行军距离基本不变），核心按人数加厚；
// 兵力和设施上限按人头给，但每人略少；后期免费虫群按 surge 放大，并在 freeCap（每队在场单位）封顶，控制同屏单位数量（性能、联机流量）。
export const VS_SIZES=[1,2,3,4];
export const VS_SCALE={
  1:{sx:1,hq:1,pop:24,build:16,surge:1,freeCap:54},
  2:{sx:1.12,hq:1.7,pop:16,build:12,surge:1.2,freeCap:58},
  3:{sx:1.24,hq:2.4,pop:12,build:10,surge:1.4,freeCap:66},
  4:{sx:1.36,hq:2.8,pop:10,build:9,surge:1.6,freeCap:74}, // 4 对 4 核心 3.1 倍时一半对局打满 15 分钟，降到 2.8 倍
};
export const VS_BUILD_KINDS=['wall','mgTurret','antiAir','cannonTurret','teslaTurret'];
const TIER_TIME={t1:VS_RULES.prep,t2:VS_RULES.tier2,t3:VS_RULES.tier3};
export const VS_UNITS=[
  {id:'swarm',name:'小虫群',price:150,cd:6,tier:'t1',desc:'6 只小虫：便宜的肉盾，吸引炮塔火力',group:[['bug0',6]]},
  {id:'gunners',name:'针刺猎虫',price:300,cd:6,tier:'t1',desc:'猎虫 ×2：远程连射，射程27，脆弱但擅长压制',group:[['gunner',2]]},
  {id:'assault',name:'散刺战虫',price:300,cd:6,tier:'t1',desc:'战虫 ×2：近距离扇形散射，擅长清理密集小兵',group:[['assault',2]]},
  {id:'carapace',name:'甲壳战虫',price:400,cd:10,tier:'t2',desc:'4 只厚皮慢虫：顶在最前面扛伤害',group:[['bug2',4]]},
  {id:'flyers',name:'迅猛飞虫',price:450,cd:10,tier:'t2',desc:'4 只飞虫：飞越城墙，怕防空塔',group:[['bug3',4]]},
  {id:'bombers',name:'炎爆虫',price:450,cd:10,tier:'t2',desc:'3 只：死亡爆炸 90，对建筑双倍伤害',group:[['bug4',3]]},
  {id:'medics',name:'疗愈虫群',price:450,cd:10,tier:'t2',desc:'疗愈孢子虫 + 针刺猎虫：为附近伤兵和英雄恢复生命',group:[['medic',1],['gunner',1]]},
  {id:'jeep',name:'突击战车',price:900,cd:25,tier:'t2',desc:'电脑驾驶，速度快，优先突袭银行',group:[['jeep',1]]},
  {id:'king',name:'虫王',price:3000,cd:120,tier:'t3',desc:'6000 血带甲，拆建筑 ×3，冲锋撞飞、召唤小虫；每队场上最多 1 只',group:[['king',1]]},
];
const UNIT_BY_ID=Object.fromEntries(VS_UNITS.map(u=>[u.id,u]));
// 单个单位的属性。虫子取自现有章节虫种（小虫=第1章、甲壳=第3章、飞虫=第4章、炎爆=第5章，二级虫种按模拟加强），
// 远程/治疗单位使用对战专属非人形模型；战车取自突击战车（火力×0.5），虫王用第1章首领「巨颚虫王」的模型。
export const VS_PROFILES={
  guard:{kind:'soldier',style:'guard',hp:90,dmg:8,rate:1.1,speed:4.5,pop:0,armor:.8},
  recruit:{kind:'soldier',style:'spitter',role:'gunner',hp:60,dmg:7,rate:1.1,range:16,speed:4.5,pop:0,bld:.65},
  siege:{kind:'soldier',style:'siege',hp:220,dmg:20,rate:1.8,range:21,speed:4,pop:0,bld:2.5,scale:1.2},
  healer:{kind:'soldier',style:'medic',hp:85,dmg:4,rate:1.2,range:12,speed:4.5,pop:0,heal:6,healR:10,bld:.5},
  scavenger:{kind:'soldier',style:'assault',hp:240,dmg:10,rate:1.1,speed:5,pop:0,scale:1.25},
  energy:{kind:'soldier',style:'energy',hp:480,dmg:15,rate:1.2,speed:4,pop:0,scale:1.65},
  rage:{kind:'soldier',style:'rage',hp:480,dmg:17,rate:1.25,speed:4.5,pop:0,scale:1.65},
  brood:{kind:'soldier',style:'brood',hp:2200,dmg:25,rate:1.5,speed:3.6,pop:0,scale:2.6},
  titan:{kind:'soldier',style:'titan',hp:2600,dmg:22,rate:1.7,speed:3.1,pop:0,armor:.85,scale:2.8},
  bug0:{kind:'bug',species:0,hp:30,dmg:8,rate:1,speed:5,scale:1,pop:1},
  bug2:{kind:'bug',species:2,hp:240,dmg:16,rate:1,speed:4.6,scale:1.15,pop:1},
  bug3:{kind:'bug',species:3,hp:90,dmg:14,rate:1,speed:7.5,scale:.95,pop:1,fly:true},
  bug4:{kind:'bug',species:4,hp:120,dmg:14,rate:1,speed:5,scale:1.05,pop:1,blast:{r:4,dmg:90,bld:2}},
  // 枪弹打装甲建筑效率低：士兵对建筑、银行、核心 ×0.7，战车 ×0.6；虫子啃咬照常，炎爆虫爆炸 ×2。
  gunner:{kind:'soldier',role:'gunner',hp:120,dmg:7,rate:.2,range:27,speed:7,pop:1,bld:.7},
  assault:{kind:'soldier',role:'assault',hp:110,dmg:7,pellets:5,rate:.7,range:18,speed:8.5,pop:1,bld:.7},
  medic:{kind:'soldier',role:'medic',hp:90,dmg:6,rate:.45,range:24,speed:7.5,pop:1,heal:6,healR:10,bld:.7},
  jeep:{kind:'jeep',hp:300,dmg:5,rate:.09,range:30,speed:13,pop:4,bld:.6},
  king:{kind:'boss',species:0,hp:6000,dmg:50,rate:1.2,speed:4,scale:3.4,pop:6,bld:3,armor:.7},
};
const PROFILE_KEYS=Object.keys(VS_PROFILES);
// 电脑对手：和玩家同一套规则与收入，不作弊。多人对战时每个电脑座位各管自己的钱，防守按全队算。
export const VS_AI={
  // 模拟结论：攒成大波一起压上远强于零散出兵。难度主要按出兵节奏区分，简单再额外让子。
  // 简单：小波零散出兵、二级兵种晚 2 分钟、一波最多 2 组、波次间隔至少 35 秒、几乎不造塔、英雄开火间歇，
  // 并且每次出兵都要多攒 400 金、派完手里留着（让子：电脑对打时零散出兵本身并不弱，靠压钱拉开差距）
  easy:{name:'简单',think:10,bankMax:2,bankAt:[0,90,9999,9999,9999],wave:t=>Math.min(1000,450+t*.6),lane:'random',counter:false,king:false,reserve:400,heroPush:false,baseDef:300,defPerSec:.4,weapons:[],prepTurret:false,turrets:[1,300],heroFire:.5,retreat:.5,tierDelay:120,maxGroups:2,firstWave:90,waveGap:35},
  // 普通：中等成波、针对配兵、打防守弱的一路（试过出兵后留 100 金来和困难拉开，但对局明显变长，没有采用）
  normal:{name:'普通',think:4,bankMax:3,bankAt:[0,45,240,9999,9999],wave:t=>Math.min(1800,800+t),maxGroups:3,lane:'weak',counter:true,king:true,reserve:0,heroPush:true,baseDef:300,defPerSec:.7,weapons:[[300,'launcher']],prepTurret:true,turrets:[2,200],heroFire:.85,retreat:.35},
  // 困难：大波压上、反应最快、银行升到 Lv4
  hard:{name:'困难',think:2,bankMax:4,bankAt:[0,30,180,330,9999],wave:t=>Math.min(2200,1000+t*1.2),maxGroups:4,lane:'weak',counter:true,king:true,reserve:0,heroPush:true,baseDef:400,defPerSec:.8,weapons:[[240,'launcher']],walls:0,prepTurret:true,turrets:[2,170],heroFire:1,retreat:.35},
};
// 以下坐标都是攻方本地坐标（蓝方视角，x 取正 = 东路；z 从本方基地前沿到对方基地），红方按点对称换算。
// 多人对战时 x 按 VS_SCALE.sx 拉宽。
const PATH=[[0,-74],[30,-72],[59,-57],[68,-33],[68,0],[68,33],[59,57],[30,72],[0,76]];
const MID_PATH=[[0,-74],[0,-52],[0,-30],[0,0],[0,30],[0,52],[0,76]];
const LANES=['left','mid','right'],LANE_NAME={left:'上路',mid:'中路',right:'下路',alt:'三路轮换'};
// 中央岩丘与侧翼掩体（点对称：每个 [x,z,r] 都有 [-x,-z,r]）。
const MASSIF=[]; // 中路畅通，野区分隔靠营地和低矮植被，不堆中央岩山。
const FLANK=[[82,-48,2.6],[82,48,2.4]];
// 电脑布防点。lane: 1=东路口，-1=西路口，0=基地内。多人对战再加一圈。
const AI_SLOTS=[[0,-61,0],[44,-46,1],[57,-47,1],[49,-58,1],[-44,-46,-1],[-57,-47,-1],[-49,-58,-1],[14,-64,0],[-14,-64,0],[28,-74,0],[-28,-72,0],[34,-58,1],[-34,-58,-1]];
const AI_SLOTS_TEAM=[[0,-50,0],[22,-52,1],[-22,-52,-1],[66,-36,1],[-66,-36,-1],[38,-68,1],[-38,-68,-1],[64,-62,1],[-64,-62,-1],[8,-54,0],[-8,-54,0]];
const AI_WALLS=[[49,-38,1],[-49,-38,-1]];
// 每个座位的英雄出生点、银行位置和电脑开局机枪塔位置（按座位序号 0–3）。0 号与 1 对 1 时完全相同。
const HERO_SPOTS=[[8,-79],[-8,-79],[4,-82],[-4,-82]];
const BANK_SPOTS=[[-15,-84],[15,-84],[-27,-89],[27,-89]];
const PREP_SPOTS=[[0,-61],[34,-58],[-34,-58],[0,-50]];

export function createVersus(api){
  const {THREE,scene}=api;
  const R=VS_RULES,AZ=ARENA.z;
  const clamp=(v,a,b)=>v<a?a:(v>b?b:v),rand=(a,b)=>a+Math.random()*(b-a),TAU=Math.PI*2;
  const dirOf=team=>team==='blue'?1:-1,other=team=>team==='blue'?'red':'blue';
  const world=(team,x,z)=>({x:dirOf(team)*x,z:AZ+dirOf(team)*z});
  const rel=(team,z)=>(z-AZ)*dirOf(team); // 负数=本方半场
  const VS={active:false,role:'local',mode:'ai',time:0,over:false,result:null,teams:null,seats:[],seatById:{},size:1,units:[],matchId:0,localTeam:'blue',localPid:'blue0',
    difficulty:'normal',objects:[],solids:[],nextId:1,flags:{},overtime:null,hidden:[],savedWorld:null,sky:[],panel:{open:false,tab:'units'},
    lastHit:null,guestUnits:new Map(),sim:false,events:[],eventId:0,seenEvent:0};
  let G=geometry(1),creatures=null;
  function geometry(n){
    const S=VS_SCALE[n]||VS_SCALE[1],sx=S.sx,X=([x,z,k])=>[x*sx,z,k];
    return {n,S,halfX:Math.round(ARENA.halfX*sx),halfZ:ARENA.halfZ,mid:ARENA.mid,
      path:PATH.map(X),midPath:MID_PATH.map(X),massif:MASSIF.map(X),flank:FLANK.map(X),slots:(n>1?[...AI_SLOTS,...AI_SLOTS_TEAM]:AI_SLOTS).map(X),walls:AI_WALLS.map(X),
      prep:PREP_SPOTS.map(X)};
  }
  const ringGeo=new THREE.RingGeometry(.62,.86,28);ringGeo.rotateX(-Math.PI/2);
  const ringMat={neutral:new THREE.MeshBasicMaterial({color:TEAM_COLOR.neutral,transparent:true,opacity:.6,depthWrite:false}),blue:new THREE.MeshBasicMaterial({color:TEAM_COLOR.blue,transparent:true,opacity:.85,depthWrite:false}),red:new THREE.MeshBasicMaterial({color:TEAM_COLOR.red,transparent:true,opacity:.85,depthWrite:false})};
  const teamRing=(team,size)=>{const r=new THREE.Mesh(ringGeo,ringMat[team]);r.scale.setScalar(size);r.position.y=.06;r.renderOrder=3;r.userData.vsRing=true;return r;};
  function addRing(obj,team,size){
    const old=obj.children.find(c=>c.userData.vsRing);if(old){if(old.material===ringMat[team])return;obj.remove(old);}
    obj.add(teamRing(team,size));
  }
  const humans=()=>api.getHumans();
  const seatOf=h=>h&&VS.seatById[h.vsPid]||null;
  const heroOfSeat=pid=>humans().find(h=>h.vsPid===pid);
  const heroOf=team=>humans().find(h=>h.team===team);
  const members=team=>VS.teams[team].members.map(pid=>VS.seatById[pid]);
  const seatName=s=>s.pid===VS.localPid?'你':(s.name||(s.ai?'电脑':TEAM_NAME[s.team]+(s.idx+1)+'号'));

  /* ================= 场地 ================= */
  function buildArena(){
    const group=new THREE.Group();group.name='versus-arena';
    // 地面：沿用战场配色，再画出行军路线、基地广场与建造线。
    const W=G.halfX*2+24,D=G.halfZ*2+28;
    const g=new THREE.PlaneGeometry(W,D,Math.round(98*G.S.sx),118);g.rotateX(-Math.PI/2);
    const ground=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true}));ground.position.z=AZ;ground.receiveShadow=true;
    api.paintGround(ground);
    const col=g.attributes.color,pos=g.attributes.position,c=new THREE.Color(),lane=new THREE.Color(0x4f3e2c),plaza=new THREE.Color(0x5b6470),blue=new THREE.Color(TEAM_COLOR.blue),red=new THREE.Color(TEAM_COLOR.red);
    const lanePts=[];for(const s of [1,0,-1])for(const team of TEAMS)lanePts.push((s?G.path:G.midPath).map(([x,z])=>world(team,s*x,z)));
    const segDist=(px,pz,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz||1,t=clamp(((px-a.x)*dx+(pz-a.z)*dz)/l,0,1);return Math.hypot(px-a.x-dx*t,pz-a.z-dz*t);};
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),z=pos.getZ(i)+AZ;c.setRGB(col.getX(i),col.getY(i),col.getZ(i));
      let d=Infinity;for(const pts of lanePts)for(let k=1;k<pts.length;k++)d=Math.min(d,segDist(x,z,pts[k-1],pts[k]));
      if(Math.abs(z-AZ)<6)c.lerp(new THREE.Color(0x355562),.78);
      if(d<9)c.lerp(lane,Math.min(1,(1-d/9)*1.4)*.85);
      for(const team of TEAMS){const h=world(team,0,-88),pd=Math.hypot(x-h.x,(z-h.z)*.8);if(pd<26+(G.n>2?6:0))c.lerp(plaza,(1-pd/(26+(G.n>2?6:0)))*.75);if(pd<34)c.lerp(team==='blue'?blue:red,(1-pd/34)*.12);}
      col.setXYZ(i,c.r,c.g,c.b);
    }
    col.needsUpdate=true;group.add(ground);
    // 建造线：各自半场离中线 25 米以外才能建造。
    for(const team of TEAMS){
      const line=new THREE.Mesh(new THREE.PlaneGeometry(G.halfX*2,.5),new THREE.MeshBasicMaterial({color:TEAM_COLOR[team],transparent:true,opacity:.45,depthWrite:false}));
      line.rotation.x=-Math.PI/2;line.position.set(0,.05,AZ-dirOf(team)*G.mid);group.add(line);
    }
    const midLine=new THREE.Mesh(new THREE.PlaneGeometry(G.halfX*2,.25),new THREE.MeshBasicMaterial({color:0xfff0c0,transparent:true,opacity:.25,depthWrite:false}));
    midLine.rotation.x=-Math.PI/2;midLine.position.set(0,.05,AZ);group.add(midLine);
    // 外圈石壁标出边界，侧翼少量掩体可绕行；中央三路保持畅通。
    const rocks=[];
    for(const [x,z,r] of G.massif){rocks.push([x,z,r,true]);if(x||z)rocks.push([-x,-z,r,true]);}
    for(const [x,z,r] of G.flank){rocks.push([x,z,r,true]);rocks.push([-x,-z,r,true]);}
    for(let i=0;i<=22;i++){const z=-G.halfZ-4+i*((G.halfZ*2+8)/22);rocks.push([G.halfX+6+Math.sin(i*2.1)*2,z,4.5+Math.sin(i*1.3)*1.2,false],[-(G.halfX+6+Math.cos(i*1.7)*2),z,4.5+Math.cos(i*1.9)*1.2,false]);}
    const nx=Math.round(18*G.S.sx);
    for(let i=0;i<=nx;i++){const x=-G.halfX-4+i*((G.halfX*2+8)/nx);for(const s of [1,-1])rocks.push([x,s*(G.halfZ+6+Math.sin(i*1.8)*2),4.5+Math.sin(i*2.3)*1.2,false]);}
    const rockMesh=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshLambertMaterial({color:0x7c6650,flatShading:true}),rocks.length),dummy=new THREE.Object3D();
    rocks.forEach(([x,z,r,solid],i)=>{
      dummy.position.set(x,r*.25,AZ+z);dummy.rotation.set(0,i*1.73,0);dummy.scale.set(r,r*.85,r);dummy.updateMatrix();rockMesh.setMatrixAt(i,dummy.matrix);
      if(solid)VS.solids.push({x,z:AZ+z,r:r*.86,bottom:-2,top:r*1.05});
    });
    rockMesh.castShadow=rockMesh.receiveShadow=true;group.add(rockMesh);
    // 行军路线两侧的标桩和小灯，远处也看得清两条路
    const posts=[];
    for(const side of [1,0,-1]){const pts=(side?G.path:G.midPath).map(([x,z])=>({x:side*x,z:AZ+z}));
      for(let k=1;k<pts.length;k++){const a=pts[k-1],b=pts[k],len=Math.hypot(b.x-a.x,b.z-a.z),nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
        for(let t=0;t<len;t+=13){const x=a.x+(b.x-a.x)*t/len,z=a.z+(b.z-a.z)*t/len;if(Math.abs(z-AZ)>66)continue;for(const o of [-10.5,10.5])posts.push([x+nx*o,z+nz*o]);}}}
    const postMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.14,.18,1.5,6),new THREE.MeshLambertMaterial({color:0x3d434c}),posts.length);
    const lampMesh=new THREE.InstancedMesh(new THREE.SphereGeometry(.2,8,6),new THREE.MeshBasicMaterial({color:0xffc35a}),posts.length);
    posts.forEach(([x,z],i)=>{dummy.position.set(x,.75,z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();postMesh.setMatrixAt(i,dummy.matrix);dummy.position.y=1.6;dummy.updateMatrix();lampMesh.setMatrixAt(i,dummy.matrix);});
    group.add(postMesh,lampMesh);
    // 基地后方的补给箱、沙袋和天线（只是布景，不挡路）
    const crates=[],bags=[];
    for(const team of TEAMS){for(const [x,z] of [[18,-97],[21,-95],[19.5,-99],[-24,-97],[-27,-99]]){const q=world(team,x,z);crates.push([q.x,q.z]);}
      for(let i=0;i<9;i++){const q=world(team,-16+i*4,-102);bags.push([q.x,q.z]);}}
    const crateMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1.6,1.2,1.6),new THREE.MeshLambertMaterial({color:0x8a6a3c}),crates.length);
    crates.forEach(([x,z],i)=>{dummy.position.set(x,.6,z);dummy.rotation.set(0,i*.7,0);dummy.updateMatrix();crateMesh.setMatrixAt(i,dummy.matrix);});
    const bagMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(3.6,.8,1.1),new THREE.MeshLambertMaterial({color:0x7d7458}),bags.length);
    bags.forEach(([x,z],i)=>{dummy.position.set(x,.4,z);dummy.rotation.set(0,0,0);dummy.updateMatrix();bagMesh.setMatrixAt(i,dummy.matrix);});
    crateMesh.castShadow=bagMesh.castShadow=true;group.add(crateMesh,bagMesh);
    for(const team of TEAMS){const q=world(team,-36,-95),mast=new THREE.Mesh(new THREE.CylinderGeometry(.18,.3,9,6),new THREE.MeshLambertMaterial({color:0x5a6573}));mast.position.set(q.x,4.5,q.z);group.add(mast);
      const tip=new THREE.Mesh(new THREE.SphereGeometry(.35,8,6),new THREE.MeshBasicMaterial({color:TEAM_COLOR[team]}));tip.position.set(q.x,9.2,q.z);group.add(tip);}
    scene.add(group);VS.objects.push(group);
    // 基地：核心（全队共用）、每个座位一座银行、出兵口。
    VS.hq={};VS.banks={};
    const hqHp=Math.round(R.hqHp*G.S.hq);
    for(const team of TEAMS){
      const hp=world(team,0,-90);
      const hq={vsType:'hq',team,pos:new THREE.Vector3(hp.x,0,hp.z),radius:5,hitH:3,hp:hqHp,maxHp:hqHp,dead:false,fireCd:0,aimBias:-.4,kind:'hq'};
      hq.mesh=makeHQMesh(team);hq.mesh.position.copy(hq.pos);scene.add(hq.mesh);VS.objects.push(hq.mesh);
      hq.bar=api.makeHPBar(7,TEAM_CSS[team]);hq.bar.position.y=10.8;hq.mesh.add(hq.bar);api.updHPBar(hq.bar,1);
      VS.hq[team]=hq;VS.solids.push({x:hq.pos.x,z:hq.pos.z,r:4.6,bottom:-1,top:8,cover:true});
      const sp=world(team,0,-74),pad=new THREE.Mesh(new THREE.CylinderGeometry(4,4,.2,24),new THREE.MeshLambertMaterial({color:0x3b4552}));
      pad.position.set(sp.x,.1,sp.z);pad.receiveShadow=true;scene.add(pad);VS.objects.push(pad);
      const padRing=new THREE.Mesh(new THREE.TorusGeometry(3.4,.14,6,32),new THREE.MeshBasicMaterial({color:TEAM_COLOR[team]}));padRing.rotation.x=Math.PI/2;padRing.position.set(sp.x,.3,sp.z);scene.add(padRing);VS.objects.push(padRing);
    }
    for(const seat of VS.seats){
      const [bx,bz]=BANK_SPOTS[seat.idx],bp=world(seat.team,bx,bz);
      const bank={vsType:'bank',team:seat.team,pid:seat.pid,pos:new THREE.Vector3(bp.x,0,bp.z),radius:3,hitH:1.8,hp:R.bankHp,maxHp:R.bankHp,dead:false,aimBias:-.5,kind:'bank'};
      bank.mesh=makeBankMesh(seat.team);bank.mesh.position.copy(bank.pos);bank.mesh.rotation.y=seat.team==='blue'?0:Math.PI;scene.add(bank.mesh);VS.objects.push(bank.mesh);
      bank.bar=api.makeHPBar(4,'#ffd34d');bank.bar.position.y=5.4;bank.mesh.add(bank.bar);api.updHPBar(bank.bar,1);
      VS.banks[seat.pid]=bank;VS.solids.push({x:bank.pos.x,z:bank.pos.z,r:3,bottom:-1,top:5,cover:true});
    }
    api.fortress.solids.push(...VS.solids);api.fortress.indexed=-1; // 拆旧场地、建新场地后 solids 数量可能不变，强制重建碰撞网格
  }
  function makeHQMesh(team){
    const grp=new THREE.Group(),metal=new THREE.MeshLambertMaterial({color:0x7c8ea3}),dark=new THREE.MeshLambertMaterial({color:0x3a4350});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(6.2,6.8,.8,16),dark);base.position.y=.4;base.receiveShadow=true;grp.add(base);
    const core=new THREE.Mesh(new THREE.CylinderGeometry(3.1,4.2,6,10),metal);core.position.y=3.8;core.castShadow=true;grp.add(core);
    const band=new THREE.Mesh(new THREE.CylinderGeometry(4.25,4.25,.7,10),new THREE.MeshBasicMaterial({color:TEAM_COLOR[team]}));band.position.y=2.2;grp.add(band);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(3.1,14,10,0,TAU,0,Math.PI/2),new THREE.MeshLambertMaterial({color:TEAM_COLOR[team],emissive:TEAM_COLOR[team],emissiveIntensity:.35,transparent:true,opacity:.85}));dome.position.y=6.8;grp.add(dome);
    const gun=new THREE.Group(),barrel=new THREE.Mesh(new THREE.BoxGeometry(.32,.32,2.4),dark);barrel.position.z=1.2;gun.add(barrel);gun.position.y=8.6;grp.add(gun);grp.userData.gun=gun;
    const beacon=new THREE.PointLight(TEAM_COLOR[team],1.3,34);beacon.position.y=10;grp.add(beacon);
    const flagPole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,5,5),metal);flagPole.position.set(4.6,3.3,0);grp.add(flagPole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.3),new THREE.MeshBasicMaterial({color:TEAM_COLOR[team],side:THREE.DoubleSide}));flag.position.set(5.75,5.1,0);grp.add(flag);
    return grp;
  }
  function makeBankMesh(team){
    const grp=new THREE.Group();
    const body=new THREE.Mesh(new THREE.BoxGeometry(5,3,4.2),new THREE.MeshLambertMaterial({color:0x8d8a7a}));body.position.y=1.5;body.castShadow=true;grp.add(body);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(5.6,.4,4.8),new THREE.MeshLambertMaterial({color:0x5b4c34}));roof.position.y=3.2;grp.add(roof);
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(5.05,.36,4.25),new THREE.MeshBasicMaterial({color:TEAM_COLOR[team]}));stripe.position.y=2.6;grp.add(stripe);
    const coin=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,.2,20),new THREE.MeshLambertMaterial({color:0xffc83a,emissive:0x664400}));coin.rotation.x=Math.PI/2;coin.position.set(0,1.7,2.15);grp.add(coin);
    const bars=new THREE.Group();grp.add(bars);grp.userData.bars=bars;
    for(let i=0;i<5;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(.9,.32,.45),new THREE.MeshLambertMaterial({color:0xffd34d,emissive:0x553300}));b.position.set(-1.8+i*.9,3.6,0);bars.add(b);}
    return grp;
  }
  function syncBankMesh(pid){
    const s=VS.seatById[pid],bank=VS.banks?.[pid];if(!s||!bank)return;
    bank.mesh.userData.bars.children.forEach((b,i)=>{b.visible=i<s.bank;});
    bank.mesh.visible=!(s.bankDown>0);bank.bar.visible=bank.mesh.visible;
  }
  function removeArena(){
    for(const o of VS.objects){scene.remove(o);o.traverse?.(n=>{if(n.isMesh&&n.geometry&&n.geometry!==ringGeo)n.geometry.dispose?.();});}
    VS.objects=[];
    const set=new Set(VS.solids);for(let i=api.fortress.solids.length-1;i>=0;i--)if(set.has(api.fortress.solids[i]))api.fortress.solids.splice(i,1);
    VS.solids=[];api.fortress.indexed=-1;
  }
  // 隐藏原战场（地形、城墙、虫巢都在 900 米外的雾里，隐藏后省下绘制）；天空跟到场地中心。
  function hideMainWorld(){
    const keep=new Set(api.keepObjects());
    VS.hidden=scene.children.filter(o=>o.visible&&!o.isLight&&!keep.has(o)&&o.name!=='versus-arena');
    for(const o of VS.hidden)o.visible=false;
    VS.sky=api.skyObjects();for(const o of VS.sky)o.position.z+=AZ;
    VS.savedWorld={...api.WORLD};Object.assign(api.WORLD,{minX:-G.halfX-2,maxX:G.halfX+2,minZ:AZ-G.halfZ-2,maxZ:AZ+G.halfZ+2});
  }
  function restoreMainWorld(){
    for(const o of VS.hidden)o.visible=true;VS.hidden=[];
    for(const o of VS.sky)o.position.z-=AZ;VS.sky=[];
    if(VS.savedWorld)Object.assign(api.WORLD,VS.savedWorld);VS.savedWorld=null;
  }

  /* ================= 对局 ================= */
  const freshStats=()=>({sent:0,spent:0,earned:0,kills:0,heroKills:0,built:0,lostBuildings:0,heroDeaths:0,units:0,given:0});
  function freshTeam(team){return {team,buffs:{},members:[],surrendered:false,kingSaver:null,lastBuild:-99,stats:freshStats()};}
  function freshSeat(pid,team,idx,name){
    return {pid,team,idx,name:name||'',gold:R.startGold,bank:1,bankDown:0,incomeT:0,lane:'left',altNext:'left',cd:{},ai:null,aiState:null,surrender:false,level:1,xp:0,buffs:{},stats:freshStats()};
  }
  // opts.size：每队人数；opts.seats：[{pid,ai,name}]（ai 为电脑难度，真人座位不填）。
  function start(opts){
    if(VS.active)stop(true);
    const n=VS_SIZES.includes(opts.size)?opts.size:1;G=geometry(n);VS.size=n;
    VS.active=true;VS.role=opts.role||'local';VS.mode=opts.mode||'ai';VS.sim=!!opts.sim;VS.difficulty=opts.difficulty||'normal';
    VS.time=0;VS.over=false;VS.result=null;VS.overtime=null;VS.flags={};VS.units=[];VS.nextId=1;VS.matchId=opts.matchId||((VS.matchId||0)+1);
    VS.events=[];VS.eventId=0;VS.seenEvent=0;
    VS.teams={blue:freshTeam('blue'),red:freshTeam('red')};VS.seats=[];VS.seatById={};
    for(const team of TEAMS)for(let i=0;i<n;i++){
      const pid=team+i,info=(opts.seats||[]).find(s=>s.pid===pid)||{},seat=freshSeat(pid,team,i,info.name);
      VS.seats.push(seat);VS.seatById[pid]=seat;VS.teams[team].members.push(pid);
      const ai=info.ai||opts.ai?.[team];if(ai)setAI(pid,ai);
    }
    VS.local=api.getPlayer();setLocal(VS.local,opts.localTeam);
    creatures=createVersusCreatures(THREE);hideMainWorld();buildArena();initJungle();buildLaneTowers();
    for(const s of VS.seats)syncBankMesh(s.pid);
    for(const h of humans()){
      if(!VS.seatById[h.vsPid])h.vsPid=(h.team||'blue')+'0';
      setupHero(h,VS.seatById[h.vsPid].team);placeHero(h,true);
    }
    VS.panel.open=false;VS.panel.tab='units';
    api.onStart?.(VS);
    if(!VS.sim)api.showMsg('⚔ 虫潮对战'+(n>1?' '+n+' 对 '+n:'')+'开始！准备20秒后三路出兵；清野可获得金币、经验与增益',4);
    return VS;
  }
  function setLocal(h,fallbackTeam){
    VS.local=h;const seat=seatOf(h);
    VS.localPid=seat?seat.pid:(fallbackTeam||'blue')+'0';VS.localTeam=VS.seatById[VS.localPid]?.team||fallbackTeam||'blue';
  }
  function setAI(pid,difficulty){
    const s=VS.seatById[pid];if(!s)return;s.ai=VS_AI[difficulty]?difficulty:'normal';
    s.aiState={next:1+Math.random(),queue:[],sendT:0,lastLane:Math.random()<.5?'left':'right',bought:new Set(),built:0,feint:0};
  }
  function clearAI(pid){const s=VS.seatById[pid];if(s){s.ai=null;s.aiState=null;}}
  function setupHero(h,team){
    h.team=team;h.vsType='hero';h.hitH=1.1;h.aimBias=.6;h.kind='hero';h.vsDeaths=h.vsDeaths||0;h.grenadeCd=0;
    if(!Array.isArray(h.vsWeapons))h.vsWeapons=[...api.CLASSES[h.cls||'gunner'].weapons];
    if(h.bar)api.recolorBar?.(h,team);
  }
  function placeHero(h,initial=false){
    syncHeroStats(h,true);
    const seat=seatOf(h),[x,z]=HERO_SPOTS[seat?seat.idx:0],p=world(h.team,x,z); // 点对称：0 号英雄在各自核心右前方
    h.pos.set(p.x,api.groundY(p.x,p.z),p.z);h.vy=0;h.onGround=true;
    if(h.mesh){h.mesh.position.copy(h.pos);h.mesh.visible=true;addRing(h.mesh,h.team,1.25);}
    h.yaw=h.team==='blue'?0:Math.PI;
    if(api.recolorBar)api.recolorBar(h,h.team);
    if(initial)h.vsDeaths=0;
    if(h===VS.local)api.faceTeam(h.team);
  }
  function stop(quiet=false){
    if(!VS.active)return;
    for(const u of VS.units)disposeUnit(u);VS.units=[];
    for(const [,g] of VS.guestUnits)disposeUnit(g);VS.guestUnits.clear();
    creatures?.dispose();creatures=null;VS.camps=[];removeArena();restoreMainWorld();
    for(const h of humans()){if(h.mesh){const ring=h.mesh.children.find(c=>c.userData.vsRing);if(ring)h.mesh.remove(ring);}delete h.team;delete h.vsType;}
    VS.active=false;VS.over=false;VS.panel.open=false;
    api.onStop?.(quiet);
  }
  function disposeUnit(u){if(u.mesh){api.visuals.release?.(u.mesh.userData.vsCreature?u.bar:u.mesh);scene.remove(u.mesh);}}
  const tier=id=>TIER_TIME[UNIT_BY_ID[id].tier];
  function incomeOf(pid){
    const s=VS.seatById[pid];if(!s)return 0;
    const base=s.bankDown>0?R.bankTrickle:R.income[s.bank-1];
    return Math.round(base*(VS.time>=R.lateBoost?R.lateMul:1));
  }
  function popOf(pid){if(VS.role==='guest')return VS.seatById[pid]?.pop||0;let n=0;for(const u of VS.units)if(!u.dead&&u.owner===pid)n+=u.pop;return n;}
  const popCap=()=>G.S.pop,buildCap=()=>G.S.build;
  function teamKing(team){return VS.units.some(u=>!u.dead&&u.team===team&&u.prof==='king');}
  function sendReason(pid,id){
    const s=VS.seatById[pid],def=UNIT_BY_ID[id];
    if(!s)return '没有这个座位';
    if(!def)return '没有这个兵种';
    if(VS.over)return '对局已结束';
    if(VS.time<R.prep)return '准备阶段结束后才能出兵（'+Math.ceil(R.prep-VS.time)+' 秒）';
    if(VS.time<tier(id))return def.name+' '+fmtTime(tier(id))+' 解锁';
    if((s.cd[id]||0)>0)return def.name+' 冷却中（'+Math.ceil(s.cd[id])+' 秒）';
    if(s.gold<def.price)return '金币不足（还差 '+Math.ceil(def.price-s.gold)+'）';
    const need=def.group.reduce((sum,[k,n])=>sum+VS_PROFILES[k].pop*n,0);
    if(popOf(pid)+need>popCap())return '在场兵力已满（'+popOf(pid)+'/'+popCap()+'）';
    if(id==='king'&&teamKing(s.team))return G.n>1?'本队虫王已经在场':'虫王已经在场';
    return '';
  }
  function sideFor(team,lane){return lane==='mid'?0:(lane==='left'?1:-1)*dirOf(team);} // 左/右按各自面朝对方的视角
  function send(pid,id,lane){
    const reason=sendReason(pid,id);if(reason)return reason;
    const s=VS.seatById[pid],team=s.team,def=UNIT_BY_ID[id];
    let choice=lane||s.lane;if(choice==='alt'){choice=s.altNext;s.altNext=LANES[(LANES.indexOf(choice)+1)%LANES.length];}
    s.gold-=def.price;s.stats.spent+=def.price;s.cd[id]=def.cd;
    const side=sideFor(team,choice),count=def.group.reduce((sum,[,n])=>sum+n,0),value=def.price/count;
    let i=0;
    for(const [key,n] of def.group)for(let k=0;k<n;k++){spawnUnit(team,key,side,value,i++,null,pid);}
    s.stats.sent+=count;if(s.stats.firstSend==null)s.stats.firstSend=Math.round(VS.time);s.stats.byUnit=s.stats.byUnit||{};s.stats.byUnit[id]=(s.stats.byUnit[id]||0)+1;
    if(pid===VS.localPid&&!VS.sim){api.AudioSys.sfx('build');api.showMsg('已派出 '+def.name+' → '+LANE_NAME[choice],1.4);}
    if(id==='king'&&!VS.sim){api.AudioSys.sfx('wave');api.showMsg(pid===VS.localPid?'👑 虫王出动！':team===VS.localTeam?'👑 队友'+seatName(s)+'放出了虫王！':'⚠ 敌方放出了虫王！',2.6);}
    return '';
  }
  function lanePath(team,side){return (side?G.path:G.midPath).map(([x,z])=>world(team,side*x*dirOf(team),z));}
  function makeUnitMesh(prof,team){
    const p=VS_PROFILES[prof];let mesh,ring=1;
    if(p.kind==='bug'){mesh=api.visuals.bug(p.scale,'mob',!!p.fly,p.species);ring=1.1*p.scale;}
    else if(p.kind==='boss'){mesh=api.visuals.bug(p.scale,'boss',false,p.species);ring=3.2;}
    else if(p.kind==='soldier'){mesh=creatures.make(p.style||p.role,team,p.scale||.9);ring=1.05*(p.scale||1);}
    else {mesh=api.makeVehicleMesh('jeep');ring=2.6;}
    addRing(mesh,team,ring);
    return mesh;
  }
  function spawnUnit(team,prof,side,value,index=0,at=null,owner=null){
    const p=VS_PROFILES[prof],mesh=makeUnitMesh(prof,team),fz=team==='neutral'?1:frenzy(); // 6:00 起虫潮狂暴：新派出的单位血量、伤害提高
    const path=lanePath(team,side),start=at||world(team,(index%3-1)*2.2,-74+Math.floor(index/3)*1.8);
    const radius=p.kind==='jeep'?2:p.kind==='soldier'?.85*(p.scale||1):.9*(p.scale||1);
    const u={id:VS.nextId++,vsType:'unit',team,owner,prof,kind:p.kind==='boss'?'boss':p.kind,mesh,hp:p.hp*fz,maxHp:p.hp*fz,dmg:p.dmg*fz,rate:p.rate,range:p.range||0,speed:p.speed,
      radius,hitH:p.kind==='jeep'?1.2:p.kind==='soldier'?1.2*(p.scale||1):p.kind==='boss'?2.4:.7*(p.scale||1),fly:!!p.fly,pop:p.pop,value,pellets:p.pellets||0,heal:p.heal||0,healR:p.healR||0,
      blast:p.blast||null,bldMul:p.bld||1,armor:p.armor||1,cd:rand(0,.4),retarget:0,target:null,side,path,pathIdx:1,dead:false,anim:rand(0,10),stuckT:0,yaw:team==='blue'?0:Math.PI,
      chargeCd:6,summonCd:10,charge:0,aimBias:0,healT:0,atkAnim:0};
    const y=u.fly?flyY(start.x,start.z):api.groundY(start.x,start.z);
    mesh.position.set(start.x,y,start.z);mesh.rotation.y=u.yaw;
    u.bar=api.makeHPBar(p.kind==='boss'?5:p.kind==='jeep'?3.4:1.6,TEAM_CSS[team]);
    u.bar.position.y=p.kind==='boss'?7.5:p.kind==='jeep'?3.4:p.kind==='soldier'?2.7*(p.scale||1):(u.fly?2.2:1.6)*(p.scale||1)+.4;
    if(mesh.userData.worlds){u.bar.scale.divideScalar(mesh.scale.x);u.bar.position.y=mesh.userData.visualHeight+.5/mesh.scale.y;}
    mesh.add(u.bar);api.updHPBar(u.bar,1);
    scene.add(mesh);VS.units.push(u);if(VS.teams[team])(VS.seatById[owner]||VS.teams[team]).stats.units++;
    return u;
  }
  function flyY(x,z){return Math.max(api.groundY(x,z),api.fortress.topAt(x,z))+4.5;}
  function upgradeBank(pid){
    const s=VS.seatById[pid];if(!s)return '没有这个座位';
    if(VS.over)return '对局已结束';
    if(s.bankDown>0)return '银行正在重建（'+Math.ceil(s.bankDown)+' 秒）';
    if(s.bank>=5)return '银行已满级';
    const cost=R.bankCost[s.bank];if(s.gold<cost)return '金币不足（还差 '+Math.ceil(cost-s.gold)+'）';
    s.gold-=cost;s.stats.spent+=cost;s.bank++;
    const bank=VS.banks[pid];bank.maxHp=R.bankHp+R.bankHpStep*(s.bank-1);bank.hp=Math.min(bank.maxHp,bank.hp+R.bankHpStep);api.updHPBar(bank.bar,bank.hp/bank.maxHp);
    syncBankMesh(pid);
    if(pid===VS.localPid&&!VS.sim){api.AudioSys.sfx('build');api.showMsg('🏦 银行升到 Lv'+s.bank+'：每 10 秒 +'+incomeOf(pid),1.8);}
    return '';
  }
  function setLane(pid,lane){const s=VS.seatById[pid];if(s&&['left','mid','right','alt'].includes(lane))s.lane=lane;}
  function cycleLane(pid){const order=['left','mid','right','alt'],s=VS.seatById[pid];if(!s)return null;setLane(pid,order[(order.indexOf(s.lane)+1)%order.length]);return s.lane;}
  function buyWeapon(h,id){
    const w=api.WEAPONS[id];if(!w)return '没有这把武器';
    if(h.vsWeapons.includes(id))return 'owned';
    const s=seatOf(h);if(!s)return '没有这个座位';if(s.gold<w.price)return '金币不足（还差 '+Math.ceil(w.price-s.gold)+'）';
    s.gold-=w.price;s.stats.spent+=w.price;h.vsWeapons.push(id);
    return '';
  }
  // 给队友转账：只能转给同队，每次固定额度（面板里连点可以多转）。
  function give(from,to,amount=R.giveStep){
    const a=VS.seatById[from],b=VS.seatById[to];amount=Math.floor(amount);
    if(!a||!b||a===b||a.team!==b.team)return '只能转给队友';
    if(VS.over)return '对局已结束';
    if(!(amount>0))return '转账金额不对';
    if(a.gold<amount)return '金币不足（还差 '+Math.ceil(amount-a.gold)+'）';
    a.gold-=amount;b.gold+=amount;a.stats.given+=amount;
    note([to],'💸 '+seatName(a)+'给你转了 '+amount+' 金',1.8);
    if(from===VS.localPid&&!VS.sim)api.showMsg('💸 已转给'+seatName(b)+' '+amount+' 金',1.4);
    return '';
  }
  // 投降：本队所有真人座位都点了投降才算（电脑座位视为同意）；1 对 1 点一下即投降。
  function surrender(pid){
    const s=VS.seatById[pid];if(!s||VS.over)return '';
    if(VS.time<R.surrenderAfter)return fmtTime(R.surrenderAfter)+' 后才能投降';
    s.surrender=true;const team=s.team,people=members(team).filter(m=>!m.ai),agreed=people.filter(m=>m.surrender).length;
    if(agreed>=people.length){VS.teams[team].surrendered=true;endMatch(other(team),TEAM_NAME[team]+'投降');return '';}
    note(people.filter(m=>!m.surrender).map(m=>m.pid),'🏳 队友发起投降（'+agreed+'/'+people.length+'）：暂停菜单里点「投降」表示同意',3);
    return '已发起投降：等队友同意（'+agreed+'/'+people.length+'）';
  }
  // 给指定座位的提示：本机直接显示，联机客人通过快照里的事件看到。
  function note(pids,text,sec=2){
    if(VS.sim)return;
    if(pids.includes(VS.localPid))api.showMsg(text,sec);
    VS.events.push({id:++VS.eventId,p:pids,t:text,s:sec});if(VS.events.length>12)VS.events.shift();
  }
  /* ---------- 建造 ---------- */
  function buildingCount(pid){return api.buildings.filter(b=>!b.dead&&b.owner===pid).length;}
  function zoneReason(pid,kind,x,z){
    const s=VS.seatById[pid];if(!s)return '没有这个座位';const team=s.team;
    if(VS.camps?.some(c=>Math.hypot(x-c.x,z-c.z)<8))return '野怪营地不能建造';
    if(!VS_BUILD_KINDS.includes(kind))return '对战模式不能建这个设施';
    if(buildingCount(pid)>=buildCap())return (G.n>1?'你的':'本方')+'设施已达 '+buildCap()+' 座';
    const r=rel(team,z);
    if(r>-G.mid)return '只能建在本方半场、离中线 '+G.mid+' 米以外';
    if(Math.abs(x)>G.halfX-3||r<-G.halfZ+3)return '超出场地边界';
    const hq=VS.hq[team].pos,pad=world(team,0,-74);
    if(Math.hypot(x-hq.x,z-hq.z)<8.5)return '离基地核心太近';
    for(const m of members(team)){const bank=VS.banks[m.pid].pos;if(Math.hypot(x-bank.x,z-bank.z)<5.5)return '离银行太近';}
    if(Math.hypot(x-pad.x,z-pad.z)<6)return '不能堵住出兵口';
    for(const u of VS.units)if(!u.dead&&!u.fly&&Math.hypot(x-u.mesh.position.x,z-u.mesh.position.z)<u.radius+2)return '有单位挡着';
    return '';
  }
  function canPlace(pid,kind,x,z,yaw){
    const reason=zoneReason(pid,kind,x,z);if(reason)return reason;
    const pts=kind==='wall'?[-2.4,0,2.4].map(o=>[x+Math.cos(yaw)*o,z-Math.sin(yaw)*o]):[[x,z]];
    const r=kind==='wall'?.75:1.3;
    for(const [px,pz] of pts){if(api.collideWalls(px,pz,r))return '和墙体、岩石或其他设施重叠';for(const h of humans())if(!h.dead&&Math.hypot(px-h.pos.x,pz-h.pos.z)<r+.9)return '会压到英雄';}
    return '';
  }
  function build(pid,kind,x,z,yaw){
    if(VS.over)return '对局已结束';
    const reason=canPlace(pid,kind,x,z,yaw);if(reason)return reason;
    const cfg=api.BUILDINGS[kind],s=VS.seatById[pid];if(s.gold<cfg.price)return '金币不足（需要 '+cfg.price+'）';
    s.gold-=cfg.price;s.stats.spent+=cfg.price;s.stats.built++;
    const bd=api.placeBuilding(kind,x,z,yaw);markBuilding(bd,s.team,true,pid);VS.bver=(VS.bver||0)+1;
    return '';
  }
  function markBuilding(bd,team,fresh=false,owner){
    if(fresh){bd.maxHp=Math.round(bd.maxHp*R.bldHp);bd.hp=bd.maxHp;if(bd.dmg)bd.dmg*=R.bldDmg;}
    bd.team=team;bd.vsType='building';bd.hitH=bd.isWall?.9:1.4;bd.aimBias=-.6;if(owner!==undefined)bd.owner=owner;
    addRing(bd.mesh,team,bd.isWall?3.2:bd.radius+.6);
    if(bd.bar)api.recolorBuildingBar?.(bd,TEAM_CSS[team]);
  }
  function demolish(pid,bd){
    if(bd.vsLaneTower)return '兵线外塔不可拆除';
    const s=VS.seatById[pid];
    if(!s||!bd||bd.dead||bd.team!==s.team)return '只能拆除本方设施';
    if(G.n>1&&bd.owner&&bd.owner!==pid)return '只能拆除自己建的设施';
    const refund=Math.round(api.BUILDINGS[bd.kind].price*.5);s.gold+=refund;
    removeBuilding(bd,false);return '';
  }
  function removeBuilding(bd,destroyed){
    bd.dead=true;api.scene.remove(bd.mesh);const i=api.buildings.indexOf(bd);if(i>=0)api.buildings.splice(i,1);VS.bver=(VS.bver||0)+1;
    api.spawnParticles(bd.mesh.position.clone().add(new THREE.Vector3(0,1.4,0)),destroyed?0x999999:0xbfc6cc,destroyed?14:10,destroyed?7:5,.7,1.4);
    if(destroyed){api.AudioSys.sfx('boom');(VS.seatById[bd.owner]||VS.teams[bd.team]).stats.lostBuildings++;}
  }

  /* ================= 目标、伤害 ================= */
  const posOf=t=>t.vsType==='hero'?t.pos:t.vsType==='unit'||t.vsType==='building'?t.mesh.position:t.pos;
  function alive(t){
    if(!t||t.dead)return false;
    if(t.vsType==='hero')return !t.disconnected&&!!t.mesh;
    if(t.vsType==='bank')return !(VS.seatById[t.pid]?.bankDown>0);
    if(t.vsType==='building')return api.buildings.includes(t);
    return true;
  }
  const banksOf=team=>VS.teams[team].members.map(pid=>VS.banks[pid]);
  function hostiles(team,{units=true,heroes=true,structures=true,neutral=false}={}){
    const out=[];
    if(units)for(const u of VS.units)if(!u.dead&&u.team!==team&&(u.team!=='neutral'||neutral&&u.jungleMode!=='return'))out.push(u);
    if(heroes)for(const h of humans())if(h.team&&h.team!==team&&alive(h))out.push(h);
    if(structures&&TEAMS.includes(team)){for(const b of api.buildings)if(!b.dead&&b.team&&b.team!==team)out.push(b);const o=other(team);out.push(VS.hq[o]);for(const bank of banksOf(o))if(alive(bank))out.push(bank);}
    return out;
  }
  function aimTargets(team){return hostiles(team,{neutral:true});}
  function centerOf(t,out){const p=posOf(t);return out.set(p.x,(t.vsType==='unit'&&t.fly?t.mesh.position.y:p.y)+(t.hitH||1),p.z);}
  function hitRadius(t){return t.vsType==='hero'?.65:t.vsType==='building'?(t.isWall?1.1:t.radius):t.radius+.3;}
  const _c=new THREE.Vector3();
  function segmentTargets(a,b,team,hitSet){
    const out=[];
    for(const t of hostiles(team,{neutral:true})){
      if(hitSet&&hitSet.has(t))continue;
      if(t.vsType==='building'&&t.isWall)continue; // 墙由 firstWallHit 结算
      const tt=api.segmentHit(a,b,centerOf(t,_c),hitRadius(t)+.25);
      if(tt!==null)out.push({m:t,t:tt});
    }
    return out.sort((x,y)=>x.t-y.t);
  }
  function beamHits(a,b,team){return segmentTargets(a,b,team,null);}
  const isStructure=t=>t.vsType==='building'||t.vsType==='hq'||t.vsType==='bank';
  // 子弹逐帧扫掠：命中最近的敌方目标；掩体/墙先挡住的不算。b.pid=开枪/建塔/派兵的座位（结算赏金用）。
  function bulletStep(b,previous,p,cover,wallHit,sceneryCover){
    for(const {m,t} of segmentTargets(previous,p,b.team,b.hitSet)){
      if(t>=cover)break;
      if(!b.explode){
        damage(m,b.dmg*(isStructure(m)?b.bld||1:1),b.team,b.src||'unit',b.pid);
        if(b.burn&&m.vsType==='unit'&&!m.dead){m.burnT=2.5;m.burnDps=Math.max(m.burnDps||0,b.burn);m.burnBy=b.pid;}
        if(!b.flame)api.spawnParticles(p,0xffe28a,3,3,.25);
        if(b.pierce>0){b.pierce--;(b.hitSet||(b.hitSet=new Set())).add(m);continue;}
      }
      p.lerpVectors(previous,p,t);return true;
    }
    if(cover<1){
      if(wallHit&&wallHit.t<=sceneryCover&&wallHit.wall.team&&wallHit.wall.team!==b.team&&!b.explode)damage(wallHit.wall,b.dmg*(b.bld||1),b.team,b.src||'unit',b.pid);
      p.lerpVectors(previous,p,cover);return true;
    }
    return false;
  }
  function explodeAt(pos,radius,dmg,team,opts={}){
    for(const t of hostiles(team,{neutral:true})){
      if(t.vsType==='unit'&&t.fly&&!opts.air)continue;
      const p=posOf(t),r=t.vsType==='hero'?1:t.vsType==='building'?2:t.radius;
      if(Math.hypot(p.x-pos.x,p.z-pos.z)<radius+r&&Math.abs((t.vsType==='unit'?t.mesh.position.y:p.y)-pos.y)<radius+3)
        damage(t,dmg*((t.vsType==='building'||t.vsType==='hq'||t.vsType==='bank')?(opts.bld||1):1),team,opts.src||'unit',opts.by);
    }
  }
  function damage(t,d,team,src='unit',by=null){
    if(!alive(t)||t.team===team||VS.over||!(d>0))return;
    if(src==='hero'){const s=VS.seatById[by];if(s&&s.team===team)d*=(1+(s.level-1)*R.heroDamagePerLevel)*(s.buffs.rage>VS.time?1.15:1);}
    if(src==='unit'&&VS.teams[team]?.buffs.siege>VS.time)d*=1.25;
    if(VS.teams[t.team]?.buffs.ward>VS.time)d*=.85;
    if(t.team==='neutral'){if(t.jungleMode==='return')return;t.angeredBy=by;t.lastThreat=VS.time;}
    if(t.vsType==='unit'){
      t.hp-=d*(t.armor||1);api.updHPBar(t.bar,t.hp/t.maxHp);if(t.hp<=0)killUnit(t,team,src,by);
    }else if(t.vsType==='hero'){
      heroHit(t,d*R.heroDmgMul,team,by);
    }else{
      if(src==='hero'&&!(t.vsType==='building'&&t.isWall))d*=R.heroVsBuilding;
      d*=corrosion();
      t.hp-=d;api.updHPBar(t.bar,Math.max(0,t.hp/t.maxHp));
      if(t.vsType==='building'){if(t.hp<=0)removeBuilding(t,true);}
      else if(t.vsType==='bank'){if(t.hp<=0)bankDestroyed(t.pid);}
      else if(t.vsType==='hq'){
        if(VS.overtime&&!VS.overtime.loser){VS.overtime.loser=t.team;endMatch(other(t.team),'加时赛：'+TEAM_NAME[t.team]+'核心先掉血');return;}
        if(t.team===VS.localTeam&&!VS.sim&&!(VS.flags.hqAlarm>0)){api.showMsg('⚠ 我方基地核心正在受袭！',2);VS.flags.hqAlarm=6;}
        if(t.hp<=0){t.hp=0;t.dead=true;endMatch(other(t.team),TEAM_NAME[t.team]+'基地核心被摧毁');}
      }
    }
  }
  // 赏金记给出手的座位；炮塔/核心机枪/免费虫群这类找不到出手者的，全队平分。
  function credit(team,by,amount,stat){
    const s=by&&VS.seatById[by];
    if(s&&s.team===team){s.gold+=amount;s.stats.earned+=amount;if(stat)s.stats[stat]++;return s;}
    const ms=members(team),share=amount/ms.length;for(const m of ms){m.gold+=share;m.stats.earned+=share;}
    if(stat)VS.teams[team].stats[stat]++;
    return null;
  }
  // Experience is local to this match and shared by living heroes near a kill.
  // A last-hitting hero still receives a share when using a long-range weapon.
  function xpNeeded(level){return level>=R.heroMaxLevel?0:80+level*30;}
  function syncHeroStats(h,full=false){
    const seat=seatOf(h);if(!seat)return;const max=api.CLASSES[h.cls||'gunner'].hp+(seat.level-1)*R.heroHpPerLevel;
    const old=h.maxHp;h.maxHp=max;if(full)h.hp=max;else if(VS.role!=='guest'&&!h.dead)h.hp=Math.min(max,h.hp+Math.max(0,max-old));
    h.vsLevel=seat.level;if(h.bar)api.updHPBar(h.bar,h.hp/max);
  }
  function addXP(seat,amount){
    if(!seat||seat.level>=R.heroMaxLevel||!(amount>0))return;seat.xp+=amount;const before=seat.level;
    while(seat.level<R.heroMaxLevel&&seat.xp>=xpNeeded(seat.level)){seat.xp-=xpNeeded(seat.level);seat.level++;}
    if(seat.level>=R.heroMaxLevel)seat.xp=0;
    if(seat.level!==before){const h=heroOfSeat(seat.pid);if(h)syncHeroStats(h);note([seat.pid],'英雄升至 Lv'+seat.level+'：生命 +'+R.heroHpPerLevel+'、伤害 +4%',2);}
  }
  function battleReward(team,by,pos,gold,xp,src){
    const nearby=humans().filter(h=>h.team===team&&!h.dead&&!h.disconnected&&(Math.hypot(h.pos.x-pos.x,h.pos.z-pos.z)<=R.xpRadius||src==='hero'&&h.vsPid===by));
    const pids=[...new Set(nearby.map(h=>h.vsPid))].filter(pid=>VS.seatById[pid]);
    if(!pids.length){credit(team,by,gold,'kills');return;}
    // Half the gold follows the finisher/owner; the other half rewards nearby presence.
    credit(team,by,gold*.5,'kills');for(const pid of pids){credit(team,pid,gold*.5/pids.length);addXP(VS.seatById[pid],xp/pids.length);}
  }
  // 6:00 起虫潮腐蚀装甲：建筑、银行、核心受到的伤害 ×1.5，9:00 起 ×2。
  function corrosion(){let m=1;for(const [at,k] of R.corrode)if(VS.time>=at)m=k;return m;}
  function frenzy(){let m=1;for(const [at,k] of R.frenzy)if(VS.time>=at)m=k;return m;}
  function heroHit(h,d,team,by){
    if(h.dead||h.invulnerable>0)return;
    VS.lastHit={team,at:VS.time};
    if(h===VS.local&&!VS.sim)api.withHuman(h,()=>api.playerDamage(d)); // 本机玩家走原受伤流程（红屏、震屏）
    else{
      d*=api.CLASSES[h.cls||'gunner'].armor||1;
      if(h.shield>0){const ab=Math.min(h.shield,d);h.shield-=ab;d-=ab;}
      h.hp-=d;if(h.bar)api.updHPBar(h.bar,Math.max(0,h.hp/h.maxHp));
      if(h.hp<=0){h.hp=0;h.dead=true;}
    }
    if(h.dead&&!h.vsDown)heroDown(h,team,by);
  }
  function heroDown(h,killer,by){
    const seat=seatOf(h);if(seat)seat.buffs={};
    h.vsDown=true;h.vsDeaths=(h.vsDeaths||0)+1;
    h.respawnT=Math.min(R.respawnMax,R.respawnBase+R.respawnStep*(h.vsDeaths-1));
    if(h.mesh)h.mesh.visible=false;if(h.inVehicle)h.inVehicle=null;
    (seatOf(h)||VS.teams[h.team]).stats.heroDeaths++;
    let s=null;if(TEAMS.includes(killer)&&killer!==h.team)s=credit(killer,by,R.heroBounty,'heroKills');
    if(TEAMS.includes(killer)&&killer!==h.team){const eligible=humans().filter(x=>x.team===killer&&!x.dead&&(x.vsPid===by||Math.hypot(x.pos.x-h.pos.x,x.pos.z-h.pos.z)<=R.xpRadius));for(const x of eligible)addXP(seatOf(x),100/eligible.length);}
    if(!VS.sim){
      if(h===VS.local)api.showMsg('阵亡！'+Math.ceil(h.respawnT)+' 秒后在基地复活',2.4);
      else if(s&&s.pid===VS.localPid)api.showMsg('击倒敌方英雄 +'+R.heroBounty,1.6);
      else if(killer===VS.localTeam&&!s)api.showMsg('击倒敌方英雄 +'+Math.round(R.heroBounty/G.n),1.6);
    }
  }
  function respawned(h){h.vsDown=false;placeHero(h);}
  function killUnit(u,killer,src='unit',by=null){
    if(u.dead)return;u.dead=true;
    if(u.campId){jungleKilled(u,killer,by,src);disposeUnit(u);return;}
    { // 平衡统计：被谁打死、走到了哪（rel>0=进入对方半场）
      const st=(VS.seatById[u.owner]||VS.teams[u.team]).stats,bys=st.deathsBy||(st.deathsBy={}),r=rel(u.team,u.mesh.position.z);bys[src]=(bys[src]||0)+1;
      const zone=r<-25?'home':r<25?'mid':r<70?'enemy':'base';const zs=st.deathZone||(st.deathZone={});zs[zone]=(zs[zone]||0)+1;
      if(src==='hero'&&killer){const ks=(VS.seatById[by]||VS.teams[killer]).stats;ks.heroUnitKills=(ks.heroUnitKills||0)+1;}
    }
    if(killer&&killer!==u.team)battleReward(killer,by,u.mesh.position,u.laneMinion?R.laneBounty:Math.round(u.value*R.bounty),u.laneMinion?32:u.kind==='boss'?180:45,src);
    const p=u.mesh.position.clone();p.y+=u.hitH;
    api.spawnParticles(p,u.kind==='soldier'||u.kind==='jeep'?0xff8866:0x88ff44,u.kind==='boss'?26:8,6,.5,u.kind==='boss'?2:1.1);
    if(u.blast){api.spawnParticles(p,0xff7722,14,8,.6,1.6);api.AudioSys.sfx('boom');explodeAt(u.mesh.position,u.blast.r,u.blast.dmg,u.team,{bld:u.blast.bld,by:u.owner});}
    if(u.kind==='boss'||u.kind==='jeep')api.AudioSys.sfx('boom');
    if(u.kind==='boss'&&!VS.sim)api.showMsg(u.team===VS.localTeam?'我方虫王被击倒':'👑 敌方虫王被击倒！',2);
    if(!(u.kind==='bug'||u.kind==='boss')||!api.visuals.death(u.mesh))disposeUnit(u); // 保留 mesh 引用：同一帧里其他单位可能还在读它的位置
  }
  function bankDestroyed(pid){
    const s=VS.seatById[pid],bank=VS.banks[pid];
    s.bankDown=R.bankDown;bank.hp=0; // 只停产，不掉级
    api.spawnParticles(bank.pos.clone().add(new THREE.Vector3(0,2,0)),0xffd34d,20,8,.8,1.5);api.AudioSys.sfx('boom');
    syncBankMesh(pid);
    if(!VS.sim)api.showMsg(pid===VS.localPid?'💥 我的银行被摧毁！停产 '+R.bankDown+' 秒后自动重建':s.team===VS.localTeam?'💥 队友'+seatName(s)+'的银行被摧毁':'💰 打掉了敌方银行：'+(G.n>1?'那名对手':'对方')+'停产 '+R.bankDown+' 秒',2.6);
  }

  /* ---------- 三路外塔与野区 ---------- */
  function buildLaneTowers(){
    for(const team of TEAMS)for(const side of [-1,0,1]){
      const p=world(team,side*68*G.S.sx,-36),bd=api.placeBuilding('mgTurret',p.x,p.z,0);
      markBuilding(bd,team,true,null);Object.assign(bd,{hp:1500,maxHp:1500,dmg:10,rate:.6,range:19,vsLaneTower:true});api.updHPBar(bd.bar,1);
    }
  }
  function initJungle(){
    VS.camps=JUNGLE_CAMPS.map(c=>({...c,x:c.x*G.S.sx,z:AZ+c.z,next:c.first,unit:null}));
    const group=new THREE.Group();group.name='versus-jungle';
    for(const camp of VS.camps){
      const disc=new THREE.Mesh(new THREE.CircleGeometry(camp.teamBuff?7:5.5,20),new THREE.MeshLambertMaterial({color:camp.teamBuff?0x5c536a:0x455643}));disc.rotation.x=-Math.PI/2;disc.position.set(camp.x,.09,camp.z);group.add(disc);
      const ring=new THREE.Mesh(new THREE.RingGeometry(camp.teamBuff?6.7:5.2,camp.teamBuff?7:5.5,24),new THREE.MeshBasicMaterial({color:camp.teamBuff?0xb4a06b:0x80967c,transparent:true,opacity:.6}));ring.rotation.x=-Math.PI/2;ring.position.set(camp.x,.11,camp.z);group.add(ring);
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(10,24,26,.8)';ctx.fillRect(0,0,256,64);ctx.fillStyle='#e8d9a9';ctx.font='bold 30px Microsoft YaHei';ctx.textAlign='center';ctx.fillText(camp.name,128,43);
      const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthWrite:false}));tag.position.set(camp.x,4.8,camp.z-5);tag.scale.set(7,1.75,1);group.add(tag);
    }
    scene.add(group);VS.objects.push(group);
  }
  function updJungle(){
    for(const c of VS.camps){if(c.unit&&!c.unit.dead||VS.time<c.next)continue;
      const u=spawnUnit('neutral',c.prof,0,0,0,c);Object.assign(u,{campId:c.id,home:{x:c.x,z:c.z},jungleMode:'idle',angeredBy:null,lastThreat:-999,lost:0});c.unit=u;
    }
  }
  function updateJungleUnit(u,dt){
    const me=u.mesh.position,camp=VS.camps.find(c=>c.id===u.campId);u.atkAnim=Math.max(0,u.atkAnim-dt);let moving=false;
    if(u.jungleMode==='return'){
      moving=moveToward(u,u.home,dt,1.5)>0;u.hp=Math.min(u.maxHp,u.hp+u.maxHp*dt);api.updHPBar(u.bar,u.hp/u.maxHp);
      if(Math.hypot(me.x-u.home.x,me.z-u.home.z)<1){me.set(u.home.x,0,u.home.z);u.jungleMode='idle';u.hp=u.maxHp;u.angeredBy=null;u.lastThreat=-999;u.lost=0;}
    }else{
      const limit=camp.teamBuff?23:17,eligible=humans().filter(h=>!h.dead&&!h.disconnected&&Math.hypot(h.pos.x-u.home.x,h.pos.z-u.home.z)<limit);
      let target=eligible.find(h=>h.vsPid===u.angeredBy);
      if(!target)target=eligible.filter(h=>Math.hypot(h.pos.x-me.x,h.pos.z-me.z)<(u.jungleMode==='chase'?20:8)).sort((a,b)=>Math.hypot(a.pos.x-me.x,a.pos.z-me.z)-Math.hypot(b.pos.x-me.x,b.pos.z-me.z))[0];
      if(target){u.jungleMode='chase';u.lost=0;u.cd-=dt;const d=Math.hypot(target.pos.x-me.x,target.pos.z-me.z);if(d>u.radius+1.5)moving=moveToward(u,target.pos,dt)>0;else{face(u,target);if(u.cd<=0){u.cd=u.rate;u.atkAnim=.35;damage(target,u.dmg,'neutral','jungle');}}}
      else if(u.jungleMode==='chase'&&(u.lost+=dt)>1.4){u.jungleMode='return';u.angeredBy=null;}
    }
    me.y=api.groundY(me.x,me.z);u.mesh.rotation.y+=Math.atan2(Math.sin(u.yaw-u.mesh.rotation.y),Math.cos(u.yaw-u.mesh.rotation.y))*Math.min(1,dt*10);u.moving=moving;u.anim+=dt*8;animateUnit(u,dt,moving);
  }
  function jungleKilled(u,killer,by,src){
    const c=VS.camps.find(c=>c.id===u.campId);c.next=VS.time+c.respawn;
    if(TEAMS.includes(killer)){
      if(c.teamBuff){for(const s of members(killer)){credit(killer,s.pid,c.gold);addXP(s,c.xp);}VS.teams[killer].buffs[c.teamBuff]=VS.time+90;note(members(killer).map(s=>s.pid),'击倒'+c.name+'：全队金币经验，'+(c.teamBuff==='siege'?'部队伤害+25%':'受到伤害-15%')+'持续90秒',3);}
      else{battleReward(killer,by,u.mesh.position,c.gold,c.xp,src);const seat=VS.seatById[by];if(c.buff&&seat?.team===killer){seat.buffs[c.buff]=VS.time+90;note([seat.pid],c.name+'增益90秒：'+(c.buff==='energy'?'每秒回血2、手雷冷却-35%':'英雄伤害+15%'),3);}}
    }
    api.spawnParticles(u.mesh.position.clone().add(new THREE.Vector3(0,1,0)),0xe6c47e,15,5,.7,1.2);api.AudioSys.sfx(c.teamBuff?'win':'buy');
  }
  function grenadeCooldown(h){return R.grenadeCd*(seatOf(h)?.buffs.energy>VS.time?.65:1);}
  function buffText(pid){const s=VS.seatById[pid];if(!s)return '';const b={...s.buffs,...VS.teams[s.team].buffs},names={energy:'回能',rage:'狂怒',siege:'推进',ward:'守护'},active=Object.keys(names).filter(k=>b[k]>VS.time);return active.length?'\n'+active.map(k=>names[k]+' '+Math.ceil(b[k]-VS.time)+'秒').join(' · '):'';}

  /* ================= 主循环（房主/单机） ================= */
  function update(dt){
    if(!VS.active||VS.over)return;
    VS.time+=dt;VS.frame=(VS.frame||0)+1;const flip=VS.frame%2===1,order=flip?['red','blue']:TEAMS; // 每帧交替先后，避免固定一方先结算
    VS.flags.hqAlarm=Math.max(0,(VS.flags.hqAlarm||0)-dt);
    announceTiers();
    for(const team of order)for(const pid of VS.teams[team].members){
      const s=VS.seatById[pid];
      for(const k in s.cd)s.cd[k]=Math.max(0,s.cd[k]-dt);
      s.incomeT+=dt;
      if(s.incomeT>=R.incomeEvery){s.incomeT-=R.incomeEvery;const inc=incomeOf(pid);s.gold+=inc;s.stats.earned+=inc;if(pid===VS.localPid)VS.flags.incomePop=1;}
      if(s.bankDown>0){s.bankDown-=dt;if(s.bankDown<=0){s.bankDown=0;const bank=VS.banks[pid];bank.maxHp=R.bankHp+R.bankHpStep*(s.bank-1);bank.hp=bank.maxHp*.3;api.updHPBar(bank.bar,.3);syncBankMesh(pid);
        if(!VS.sim&&pid===VS.localPid)api.showMsg('🏦 银行重建完成，恢复生产',1.6);}}
      if(s.ai)aiThink(s,dt);
    }
    for(const h of humans()){
      if(!h.team)continue;
      h.grenadeCd=Math.max(0,(h.grenadeCd||0)-dt);
      if(!h.dead&&seatOf(h)?.buffs.energy>VS.time){h.hp=Math.min(h.maxHp,h.hp+2*dt);if(h.bar)api.updHPBar(h.bar,h.hp/h.maxHp);}
      if(!h.dead&&h.hp<h.maxHp){const hq=VS.hq[h.team].pos;if(Math.hypot(h.pos.x-hq.x,h.pos.z-hq.z)<R.baseHealRange){h.hp=Math.min(h.maxHp,h.hp+R.baseHeal*dt);if(h.bar)api.updHPBar(h.bar,h.hp/h.maxHp);}}
    }
    updLaneWaves();updJungle();buildUnitGrid();
    if(flip){for(let i=VS.units.length-1;i>=0;i--){const u=VS.units[i];if(!u.dead)updUnit(u,dt);}}else for(const u of VS.units)if(!u.dead)updUnit(u,dt);
    for(let i=VS.units.length-1;i>=0;i--)if(VS.units[i].dead)VS.units.splice(i,1);
    updTurrets(dt);
    updSurge();
    updOvertime(dt);
    if(!VS.over&&VS.time>=R.limit&&!VS.overtime)timeUp();
  }
  function announceTiers(){
    if(VS.sim)return;
    for(const [key,at,text] of [['prep',R.prep,'⚔ 三路基础兵出发！推线、打野赚金币经验'],['t2',R.tier2,'⬆ 二级兵种解锁：甲壳虫、飞虫、炎爆虫、疗愈虫群、突击战车'],['t3',R.tier3,'👑 虫王解锁（3000 金）'],['corrode1',R.corrode[0][0],'☣ 虫潮狂暴：新派出的单位血量、伤害 +25%，建筑受到伤害 +50%'],['late',R.lateBoost,'💰 进入后期：收入 +50%，虫潮来袭'],['corrode2',R.corrode[1][0],'☣ 虫潮狂暴加剧：新单位 +50%，建筑受到伤害翻倍']])
      if(!VS.flags[key]&&VS.time>=at){VS.flags[key]=true;api.AudioSys.sfx('wave');api.showMsg(text,3);}
  }
  function timeUp(){
    const a=VS.hq.blue.hp/VS.hq.blue.maxHp,b=VS.hq.red.hp/VS.hq.red.maxHp;
    if(Math.abs(a-b)>=.05){endMatch(a>b?'blue':'red','时间到：核心剩余血量 '+Math.round(a*100)+'% 对 '+Math.round(b*100)+'%');return;}
    VS.overtime={start:VS.time,waveT:0,loser:null};
    if(!VS.sim){api.AudioSys.sfx('wave');api.showMsg('⏱ 时间到、核心血量接近：进入 2 分钟「虫潮爆发」加时，先掉核心血者输',4);}
  }
  // 6:00 起「虫潮来袭」：双方出兵口每 30 秒刷出一波免费虫群，一波比一波大，逼出胜负。人多时按 VS_SCALE.surge 放大。
  function spawnFree(team,side,prof,n,start=0){
    let room=G.S.freeCap;if(room<Infinity){for(const u of VS.units)if(!u.dead&&u.team===team)room--;n=Math.max(0,Math.min(n,room));}
    const ms=VS.teams[team].members;for(let i=0;i<n;i++){const u=spawnUnit(team,prof,side,25,start+i,null,ms[(start+i)%ms.length]);u.pop=0;}return start+n;
  }
  function updLaneWaves(){
    if(VS.time<R.prep)return;const wave=Math.floor((VS.time-R.prep)/R.laneEvery);if((VS.flags.laneWave??-1)>=wave)return;VS.flags.laneWave=wave;
    for(const team of TEAMS)for(const lane of LANES){
      const side=sideFor(team,lane),live=VS.units.filter(u=>!u.dead&&u.team===team),profiles=['guard','guard','recruit'];
      if(G.n>=3)profiles.unshift('guard');if(VS.time>=180&&wave%3===0)profiles.push('siege');if(VS.time>=180&&wave%4===0)profiles.push('healer');
      const count=profiles.length;
      const room=Math.min(16+G.n*2-live.filter(u=>u.laneMinion&&u.side===side).length,G.S.freeCap-live.length);
      for(let i=0;i<Math.min(count,room);i++){
        const u=spawnUnit(team,profiles[i],side,72,i,null,null);u.pop=0;u.laneMinion=true;
        const growth=1+Math.min(1,Math.floor(wave/4)*.12);u.hp*=growth;u.maxHp=u.hp;u.dmg*=growth;
      }
    }
  }
  function updSurge(){
    if(VS.overtime||VS.time<R.lateBoost)return;
    const k=Math.floor((VS.time-R.lateBoost)/R.surgeEvery);if((VS.flags.surge??-1)>=k)return;VS.flags.surge=k;
    const lane=LANES[k%3],m=G.S.surge,small=Math.round(Math.min(20,8+2*k)*m),heavy=k>=2?Math.round(Math.min(6,1+Math.floor(k/2))*m):0;
    for(const team of TEAMS){const side=sideFor(team,lane);let i=spawnFree(team,side,'bug0',small);spawnFree(team,side,'bug2',heavy,i);}
    if(!VS.sim&&k===0){api.AudioSys.sfx('wave');api.showMsg('🐛 虫潮来袭！双方出兵口每 30 秒自动涌出一波免费虫群',3.2);}
  }
  function updOvertime(dt){
    const ot=VS.overtime;if(!ot||VS.over)return;
    ot.waveT-=dt;
    if(ot.waveT<=0){ot.waveT=R.overtimeWave;const lane=LANES[Math.floor((VS.time-ot.start)/R.overtimeWave)%3];
      for(const team of TEAMS)spawnFree(team,sideFor(team,lane),'bug0',Math.round(6*G.S.surge));}
    if(VS.time>=ot.start+R.overtime)endMatch(null,'加时赛结束，双方核心都没有掉血');
  }
  // 全队汇总：各座位相加，再加上记在队伍名下的（核心机枪、免费虫群等）。
  function teamSummary(team){
    const out=freshStats(),add=(dst,src)=>{for(const [k,v] of Object.entries(src||{}))dst[k]=(dst[k]||0)+v;};
    let first=null;out.byUnit={};out.deathsBy={};out.deathZone={};out.heroUnitKills=0;
    for(const st of [...members(team).map(m=>m.stats),VS.teams[team].stats]){
      for(const k of Object.keys(freshStats()))out[k]+=st[k]||0;
      add(out.byUnit,st.byUnit);add(out.deathsBy,st.deathsBy);add(out.deathZone,st.deathZone);out.heroUnitKills+=st.heroUnitKills||0;
      if(st.firstSend!=null)first=first==null?st.firstSend:Math.min(first,st.firstSend);
    }
    out.firstSend=first;return out;
  }
  const bankLevels=team=>members(team).map(m=>m.bank).join('/');
  function endMatch(winner,reason){
    if(VS.over)return;
    VS.over=true;VS.result={winner,reason,time:VS.time,size:G.n,stats:{blue:teamSummary('blue'),red:teamSummary('red')},bank:{blue:bankLevels('blue'),red:bankLevels('red')},
      hq:{blue:Math.max(0,VS.hq.blue.hp/VS.hq.blue.maxHp),red:Math.max(0,VS.hq.red.hp/VS.hq.red.maxHp)},mode:VS.mode,difficulty:VS.difficulty,
      seats:VS.seats.map(s=>({pid:s.pid,team:s.team,idx:s.idx,name:s.name,ai:s.ai,bank:s.bank,sent:s.stats.sent,kills:s.stats.kills,heroKills:s.stats.heroKills,built:s.stats.built,heroDeaths:s.stats.heroDeaths,earned:Math.round(s.stats.earned),given:s.stats.given}))};
    if(winner){const hq=VS.hq[other(winner)];api.spawnParticles(hq.pos.clone().add(new THREE.Vector3(0,4,0)),0xffaa33,40,12,1.2,2.4);api.AudioSys.sfx('boom');}
    api.onEnd?.(VS.result);
  }

  /* ---------- 单位 AI ---------- */
  function canHit(u,t){
    if(t.vsType==='unit'&&t.fly&&!u.range&&!u.fly)return false; // 地面近战咬不到飞虫
    return true;
  }
  // 行军中遇到敌方单位边走边打（不停下、不追），英雄和建筑才停下来打；虫王见什么都停下撕。
  function pickTarget(u){
    const me=u.mesh.position,aggro=u.range?Math.max(15,u.range*.95):(u.kind==='boss'?18:13);
    let best=null,bd=Infinity;
    for(const t of hostiles(u.team,{structures:false})){
      if(!canHit(u,t))continue;const p=posOf(t),d=Math.hypot(p.x-me.x,p.z-me.z);
      const limit=t.vsType==='hero'||u.kind==='boss'||u.laneMinion?aggro:reachOf(u,t);
      if(d<limit&&d<bd){bd=d;best=t;}
    }
    if(best)return best;
    const reach=u.range?Math.max(12,u.range*.9):11;
    for(const b of api.buildings){
      if(b.dead||!b.team||b.team===u.team)continue;if(b.isWall&&u.fly)continue;
      const d=Math.hypot(b.mesh.position.x-me.x,b.mesh.position.z-me.z)-(b.isWall?2:b.radius);
      const score=d+(b.isWall?6:0);if(d<reach&&score<bd){bd=score;best=b;}
    }
    if(best)return best;
    if(u.pathIdx>=u.path.length-2||rel(u.team,me.z)>45){
      const o=other(u.team),hq=VS.hq[o],dh=Math.hypot(hq.pos.x-me.x,hq.pos.z-me.z);
      let bank=null,db=Infinity;for(const b of banksOf(o))if(alive(b)){const d=Math.hypot(b.pos.x-me.x,b.pos.z-me.z);if(d<db){db=d;bank=b;}}
      if(bank&&(u.kind==='jeep'||db<dh-4))return bank;
      return hq;
    }
    return null;
  }
  function reachOf(u,t){
    const r=t.vsType==='hero'?.6:t.vsType==='building'?(t.isWall?1.2:t.radius):t.radius;
    if(u.range)return u.range+r*.5;
    return u.radius+r+.9;
  }
  function distTo(u,t){
    const p=posOf(t),me=u.mesh.position;
    if(t.vsType==='building'&&t.isWall){
      // 墙按线段距离算，近战贴着墙面就能咬到
      const yaw=t.rotY||0,ax=Math.cos(yaw),az=-Math.sin(yaw),dx=me.x-p.x,dz=me.z-p.z,along=clamp(dx*ax+dz*az,-2.6,2.6);
      return Math.hypot(dx-ax*along,dz-az*along);
    }
    return Math.hypot(p.x-me.x,p.z-me.z);
  }
  // 空间网格：4 对 4 时单位上百，避让和碰撞改成只看附近格子（全量两两比较的耗时随单位数平方增长）。
  const UCELL=4,BCELL=8,ugrid=new Map(),bgrid=new Map();let bgridKey='';
  const cellKey=(cx,cz)=>cx*4096+cz;
  function buildUnitGrid(){
    ugrid.clear();
    for(const u of VS.units){if(u.dead||u.fly)continue;const p=u.mesh.position,k=cellKey(Math.floor(p.x/UCELL),Math.floor((p.z-AZ)/UCELL));let c=ugrid.get(k);if(!c)ugrid.set(k,c=[]);c.push(u);}
  }
  function nearBuildings(x,z){
    const key=api.buildings.length+':'+(VS.bver||0);
    if(key!==bgridKey){bgridKey=key;bgrid.clear();for(const b of api.buildings){if(b.dead)continue;const p=b.mesh.position,k=cellKey(Math.floor(p.x/BCELL),Math.floor((p.z-AZ)/BCELL));let c=bgrid.get(k);if(!c)bgrid.set(k,c=[]);c.push(b);}}
    const cx=Math.floor(x/BCELL),cz=Math.floor((z-AZ)/BCELL),out=[];
    for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const c=bgrid.get(cellKey(cx+i,cz+j));if(c)for(const b of c)out.push(b);}
    return out;
  }
  function canMove(u,x,z){
    const m=u.radius+.2;
    if(x<-G.halfX+m||x>G.halfX-m||z<AZ-G.halfZ+m||z>AZ+G.halfZ-m)return false;
    if(u.fly)return true;
    if(api.fortress.blocked(x,z,u.radius,0))return false;
    for(const b of nearBuildings(x,z)){
      if(b.dead)continue;
      if(b.isWall){if(b.team!==u.team&&wallTouches(b,x,z,u.radius))return false;}
      else if((x-b.mesh.position.x)**2+(z-b.mesh.position.z)**2<(b.radius+u.radius)**2)return false;
    }
    return true;
  }
  function moveToward(u,goal,dt,mul=1){
    const p=u.mesh.position,dx=goal.x-p.x,dz=goal.z-p.z,d=Math.hypot(dx,dz);if(d<.05)return 0;
    const sp=u.speed*mul*(u.slowT>0?.55:1),bx=p.x,bz=p.z;
    if(u.fly){const k=Math.min(1,sp*dt/d);p.x+=dx*k;p.z+=dz*k;p.x=clamp(p.x,-G.halfX+1,G.halfX-1);p.z=clamp(p.z,AZ-G.halfZ+1,AZ+G.halfZ-1);}
    else{
      const step=navStep(u,{x:dx/d,z:dz/d},dt,sp,goal);
      let nx=step.x,nz=step.z,px=0,pz=0;
      const cx=Math.floor(nx/UCELL),cz=Math.floor((nz-AZ)/UCELL),rr=u.radius>1.5?2:1;
      for(let i=-rr;i<=rr;i++)for(let j=-rr;j<=rr;j++){const cell=ugrid.get(cellKey(cx+i,cz+j));if(!cell)continue;
        for(const o of cell){if(o===u||o.dead)continue;const ox=nx-o.mesh.position.x,oz=nz-o.mesh.position.z,d2=ox*ox+oz*oz,s=(u.radius+o.radius)*.85;
          if(d2<s*s&&d2>1e-4){const dd=Math.sqrt(d2),push=Math.min(.08,(s-dd)*dt*3);px+=ox/dd*push;pz+=oz/dd*push;}}}
      const pr=Math.hypot(px,pz),cap=sp*dt*.45;if(pr>cap){px*=cap/pr;pz*=cap/pr;}
      if(canMove(u,nx+px,nz+pz)){nx+=px;nz+=pz;}
      if(canMove(u,nx,nz)){p.x=nx;p.z=nz;}
    }
    const moved=Math.hypot(p.x-bx,p.z-bz);
    if(moved>.001)u.yaw=Math.atan2(p.x-bx,p.z-bz);
    return moved;
  }
  // 寻路在各自视角里算：红方把坐标绕场地中心转 180° 后调用同一套寻路，再转回来。
  // 共用寻路的邻格顺序和绕障方向都按世界坐标取，直接用会让两边绕路不对称。
  function navStep(u,dir,dt,sp,goal){
    if(u.team==='blue')return monsterStep(u,dir,dt,sp,goal,(x,z)=>canMove(u,x,z));
    const p=u.mesh.position,proxy=u.navProxy||(u.navProxy={mesh:{position:new THREE.Vector3()}});
    proxy.mesh.position.set(-p.x,p.y,2*AZ-p.z);
    const r=monsterStep(proxy,{x:-dir.x,z:-dir.z},dt,sp,goal?{x:-goal.x,z:2*AZ-goal.z}:null,(x,z)=>canMove(u,-x,2*AZ-z));
    return {x:-r.x,z:2*AZ-r.z};
  }
  function face(u,t){const p=posOf(t),me=u.mesh.position;u.yaw=Math.atan2(p.x-me.x,p.z-me.z);}
  function updUnit(u,dt){
    const me=u.mesh.position;
    u.cd-=dt;u.retarget-=dt;u.slowT=Math.max(0,(u.slowT||0)-dt);u.atkAnim=Math.max(0,u.atkAnim-dt);
    if(u.burnT>0){u.burnT-=dt;u.burnTick=(u.burnTick||0)-dt;if(u.burnTick<=0){u.burnTick=.25;const team=VS.seatById[u.burnBy]?.team||(u.team==='neutral'?null:other(u.team));if(team)damage(u,(u.burnDps||0)*.25,team,'hero',u.burnBy);if(u.dead)return;}}
    if(u.campId){updateJungleUnit(u,dt);return;}
    if(u.target&&!alive(u.target)){u.target=null;u.retarget=0;} // 目标没了当帧重选（晚一帧会让单位往前多走一步，模拟里僵局明显变多）
    // 有目标每 0.35–0.6 秒重选；没目标的行军单位每 0.15–0.25 秒扫一次（原来每帧都扫，单位多时耗时随数量平方增长）
    if(u.retarget<=0){u.target=pickTarget(u)||null;u.retarget=u.target?.35+Math.random()*.25:VS.idleScan??.15+Math.random()*.1;} // idleScan：仅供平衡模拟对照
    if(u.heal){u.healT-=dt;if(u.healT<=0){u.healT=.5;healAround(u);}}
    if(u.kind==='boss')bossSkills(u,dt);
    let moving=false;
    const t=u.target;
    const stops=t&&(t.vsType!=='unit'||u.kind==='boss'||u.laneMinion);
    if(t&&canHit(u,t)&&distTo(u,t)<=reachOf(u,t)){
      if(stops)face(u,t);else moving=followPath(u,dt)>0;
      if(u.cd<=0){u.cd=u.rate;attack(u,t);}
    }else if(t&&stops){
      const p=posOf(t);moving=moveToward(u,p,dt)>0;
    }else moving=followPath(u,dt)>0;
    // 卡住：被敌方墙挡住就改咬墙
    if(!moving&&!(t&&alive(t)&&distTo(u,t)<=reachOf(u,t))){u.stuckT+=dt;if(u.stuckT>.8){u.stuckT=0;const wall=nearestEnemyWall(u,6);if(wall)u.target=wall;}}else u.stuckT=0;
    me.y=u.fly?me.y+(flyY(me.x,me.z)+Math.sin(u.anim*.5)*.4-me.y)*Math.min(1,dt*4):api.groundY(me.x,me.z);
    u.mesh.rotation.y+=Math.atan2(Math.sin(u.yaw-u.mesh.rotation.y),Math.cos(u.yaw-u.mesh.rotation.y))*Math.min(1,dt*10);
    u.anim+=dt*8;u.moving=moving;
    animateUnit(u,dt,moving);
  }
  function animateUnit(u,dt,moving){
    if(!u.mesh)return;
    if(u.mesh.userData.vsCreature){creatures.animate(u.mesh,dt,moving,u.atkAnim>0);return;}
    if(u.kind==='bug'||u.kind==='boss'){api.visuals.animate(u.mesh,dt,u.atkAnim>0?'Attack':'Walk',api.camera);if(u.mesh.userData.legGroup)u.mesh.userData.legGroup.forEach((l,i)=>{l.rotation.x=Math.sin(u.anim+i)*.5;});}
    else if(u.kind==='soldier'){api.visuals.animate(u.mesh,dt,moving?'Run':'Idle',api.camera);const legs=u.mesh.userData.legs;if(legs)legs.forEach((l,i)=>{l.rotation.x=moving?Math.sin(u.anim*1.25+i*Math.PI)*.7:l.rotation.x*.8;});}
  }
  function followPath(u,dt){
    while(u.pathIdx<u.path.length){const wp=u.path[u.pathIdx],me=u.mesh.position;if(Math.hypot(wp.x-me.x,wp.z-me.z)<4)u.pathIdx++;else break;}
    if(u.pathIdx>=u.path.length){const hq=VS.hq[other(u.team)];return moveToward(u,hq.pos,dt);}
    return moveToward(u,u.path[u.pathIdx],dt);
  }
  function nearestEnemyWall(u,max){
    let best=null,bd=max;for(const b of api.buildings){if(b.dead||!b.isWall||!b.team||b.team===u.team)continue;const d=distTo(u,b);if(d<bd){bd=d;best=b;}}return best;
  }
  const _from=new THREE.Vector3(),_to=new THREE.Vector3();
  function attack(u,t){
    u.atkAnim=.35;
    const bld=t.vsType==='building'||t.vsType==='hq'||t.vsType==='bank';
    if(!u.range){ // 近战咬
      damage(t,u.dmg*(bld?u.bldMul:1),u.team,'unit',u.owner);
      if(u.kind==='boss'){api.AudioSys.sfx('cannon');api.spawnParticles(posOf(t).clone().add(new THREE.Vector3(0,1,0)),0xff9a4a,6,5,.4,1.3);}
      return;
    }
    const me=u.mesh.position;
    _from.set(me.x,me.y+(u.kind==='jeep'?1.9:1.35),me.z);centerOf(t,_to);
    const dir=_to.clone().sub(_from).normalize();_from.addScaledVector(dir,u.kind==='jeep'?1.6:.55);
    const color=u.team==='blue'?0x8fd4ff:0xffa08a;
    api.fireBullet(_from,dir,{dmg:u.dmg,speed:62,range:u.range+6,spread:u.pellets?.11:.035,pellets:u.pellets||0,color,team:u.team,src:'unit',bld:u.bldMul,pid:u.owner},true,_to.clone());
    if(Math.random()<.5)api.AudioSys.sfx(u.pellets?'shoot':'mg');
  }
  function healAround(u){
    let best=null,ratio=.999;
    for(const o of VS.units)if(!o.dead&&o.team===u.team&&o!==u&&o.kind!=='jeep'&&Math.hypot(o.mesh.position.x-u.mesh.position.x,o.mesh.position.z-u.mesh.position.z)<u.healR){const r=o.hp/o.maxHp;if(r<ratio){ratio=r;best=o;}}
    for(const h of humans())if(h.team===u.team&&!h.dead&&Math.hypot(h.pos.x-u.mesh.position.x,h.pos.z-u.mesh.position.z)<u.healR){const r=h.hp/h.maxHp;if(r<ratio){ratio=r;best=h;}}
    if(!best)return;
    const amount=u.heal*.5;
    if(best.vsType==='hero'){best.hp=Math.min(best.maxHp,best.hp+amount);if(best.bar)api.updHPBar(best.bar,best.hp/best.maxHp);}
    else{best.hp=Math.min(best.maxHp,best.hp+amount);api.updHPBar(best.bar,best.hp/best.maxHp);}
  }
  function bossSkills(u,dt){
    u.chargeCd-=dt;u.summonCd-=dt;
    if(u.charge>0){
      u.charge-=dt;const me=u.mesh.position,nx=me.x+Math.sin(u.yaw)*14*dt,nz=me.z+Math.cos(u.yaw)*14*dt;
      if(canMove(u,nx,nz)){me.x=nx;me.z=nz;}else u.charge=0;
      for(const t of hostiles(u.team,{structures:false})){if(t.vsType==='unit'&&t.fly)continue;const p=posOf(t);if(Math.hypot(p.x-me.x,p.z-me.z)<u.radius+1.4&&!(u.chargeHit?.has(t))){(u.chargeHit||(u.chargeHit=new Set())).add(t);damage(t,60,u.team,'unit',u.owner);}}
      return;
    }
    const t=u.target;
    if(u.chargeCd<=0&&t&&t.vsType!=='hq'&&t.vsType!=='bank'){const d=distTo(u,t);if(d>5&&d<18){face(u,t);u.mesh.rotation.y=u.yaw;u.charge=.8;u.chargeCd=7;u.chargeHit=new Set();api.AudioSys.sfx('wave');}}
    if(u.summonCd<=0){u.summonCd=10;let n=0;for(const o of VS.units)if(!o.dead&&o.team===u.team)n++;
      if(n<30*G.n)for(let i=0;i<4;i++){const a=i*TAU/4+rand(0,1),s={x:u.mesh.position.x+Math.cos(a)*3.5,z:u.mesh.position.z+Math.sin(a)*3.5};const m=spawnUnit(u.team,'bug0',u.side,0,i,s,u.owner);m.pathIdx=u.pathIdx;}}
  }
  /* ---------- 炮塔与核心机枪 ---------- */
  function updTurrets(dt){
    const list=VS.frame%2?[...api.buildings].reverse():api.buildings;
    for(const bd of list){
      if(bd.dead||!bd.team||!bd.dmg)continue;
      bd.fireCd-=dt;if(bd.fireCd>0)continue;
      const from=bd.mesh.position.clone();from.y+=bd.kind==='cannonTurret'?2:bd.kind==='teslaTurret'?2.1:1.5;
      let best=null,bd2=bd.range*bd.range;
      for(const t of hostiles(bd.team,{structures:false})){
        const fly=t.vsType==='unit'&&t.fly;if(bd.kind==='antiAir'&&!fly)continue;if(bd.kind==='cannonTurret'&&fly)continue;
        const p=posOf(t),d2=(p.x-from.x)**2+(p.z-from.z)**2;if(d2<bd2){bd2=d2;best=t;}
      }
      if(!best)continue;
      bd.fireCd=bd.rate;
      const to=centerOf(best,new THREE.Vector3()),dir=to.clone().sub(from);
      if(bd.mesh.userData.head)bd.mesh.userData.head.rotation.y=Math.atan2(dir.x,dir.z);
      if(bd.mesh.userData.gun)bd.mesh.userData.gun.rotation.y=Math.atan2(dir.x,dir.z);
      if(bd.kind==='teslaTurret'){
        let prev=from,cur=best;const hit=[cur];
        for(let k=0;k<2;k++){let nxt=null,nd=64;for(const o of hostiles(bd.team,{structures:false})){if(hit.includes(o))continue;const a=posOf(o),b=posOf(cur),d2=(a.x-b.x)**2+(a.z-b.z)**2;if(d2<nd){nd=d2;nxt=o;}}if(!nxt)break;hit.push(nxt);cur=nxt;}
        hit.forEach((o,i)=>{const p=centerOf(o,new THREE.Vector3());api.zapLine(prev,p,0xcc88ff);damage(o,bd.dmg*Math.pow(.6,i),bd.team,'turret',bd.owner);prev=p;});
        api.AudioSys.sfx('shoot');continue;
      }
      if(bd.kind==='antiAir'){api.fireBullet(from,dir,{beam:true,dmg:bd.dmg,range:bd.range,color:0x8bffda,team:bd.team,src:'turret',pid:bd.owner},true);api.AudioSys.sfx('shoot');continue;}
      api.fireBullet(from,dir,{dmg:bd.dmg,speed:55,range:bd.range+6,spread:.04,explode:bd.explode,color:bd.kind==='cannonTurret'?0xff8844:(bd.team==='blue'?0x9fdcff:0xffb09f),team:bd.team,src:'turret',pid:bd.owner},true,to);
      api.AudioSys.sfx(bd.kind==='cannonTurret'?'cannon':'mg');
    }
    for(const team of VS.frame%2?['red','blue']:TEAMS){
      const hq=VS.hq[team],g=R.hqGun;hq.fireCd-=dt;if(hq.fireCd>0)continue;
      const from=hq.pos.clone();from.y+=8.6;let best=null,bd2=g.range*g.range;
      for(const t of hostiles(team,{structures:false})){const p=posOf(t),d2=(p.x-hq.pos.x)**2+(p.z-hq.pos.z)**2;if(d2<bd2){bd2=d2;best=t;}}
      if(!best)continue;hq.fireCd=g.rate;
      const to=centerOf(best,new THREE.Vector3()),dir=to.clone().sub(from);hq.mesh.userData.gun.rotation.y=Math.atan2(dir.x,dir.z);
      api.fireBullet(from,dir,{dmg:g.dmg,speed:60,range:g.range+10,spread:.03,color:TEAM_COLOR[team],team,src:'hq'},true,to);
      if(Math.random()<.4)api.AudioSys.sfx('mg');
    }
  }

  /* ================= 电脑对手 ================= */
  // 每个电脑座位各算各的钱；防守按全队的威胁和防御算，多人时目标防御按人数放大，并错开建塔时间。
  function aiThink(s,dt){
    const team=s.team,cfg=VS_AI[s.ai],st=s.aiState,T=VS.teams[team],n=G.n,pid=s.pid;
    // 排队的出兵按冷却逐个发出
    st.sendT-=dt;
    if(st.sendT<=0&&st.queue.length&&VS.time>=R.prep){
      st.sendT=.5;const next=st.queue[0];
      const why=sendReason(pid,next.id);
      if(!why){send(pid,next.id,next.lane);st.queue.shift();}
      else if(/金币不足|兵力已满|虫王已经在场|解锁/.test(why))st.queue.shift();
    }
    st.next-=dt;if(st.next>0)return;
    st.next=cfg.think*(.85+Math.random()*.3);
    const threat=threatOn(team),defense=defenseOf(team),desired=(cfg.baseDef+VS.time*cfg.defPerSec)*n,turretCap=Math.min(buildCap(),cfg.turrets[0]+Math.floor(VS.time/cfg.turrets[1]));
    const underAttack=threat.value>0;
    // 0. 准备阶段先在基地正前方放一座机枪塔，两条路过来都打得到（多人时各自错开位置）
    if(cfg.prepTurret&&VS.time<R.prep+10&&!st.prepDone){st.prepDone=true;const [x,z]=G.prep[s.idx]||G.prep[0],p=world(team,x,z);if(!build(pid,'mgTurret',p.x,p.z,0))return;}
    // 1. 银行
    if(s.bank<cfg.bankMax&&!underAttack&&VS.time>=cfg.bankAt[s.bank]&&!(s.bankDown>0)){
      if(!(s.ai==='hard'&&s.bank>=4&&VS.hq[team].hp/VS.hq[team].maxHp<.7)){const cost=R.bankCost[s.bank];if(s.gold>=cost+(underAttack?300:0)){upgradeBank(pid);return;}}
    }
    // 2. 防守：威胁超过防守八成，或防守低于随时间增长的底线
    const turrets=api.buildings.filter(b=>!b.dead&&b.owner===pid&&b.dmg).length;
    if((threat.value>defense*.8||defense<desired)&&turrets<turretCap&&VS.time-(st.lastBuild||-99)>15&&VS.time-T.lastBuild>15/n){
      const kind=aiTurretKind(s,threat);
      if(kind&&s.gold>=api.BUILDINGS[kind].price){if(aiPlace(s,kind,threat.side)){st.lastBuild=T.lastBuild=VS.time;return;}}
    }
    if(cfg.walls&&VS.time>cfg.walls&&!st.walls&&s.gold>800){st.walls=true;for(const [x,z] of G.walls){const p=world(team,x,z);build(pid,'wall',p.x,p.z,0);}}
    // 3. 英雄武器
    const hero=heroOfSeat(pid);
    if(hero&&hero.vsAI)for(const [at,id] of cfg.weapons)if(VS.time>=at&&!hero.vsWeapons.includes(id)&&s.gold>=api.WEAPONS[id].price+1500){if(!buyWeapon(hero,id))api.equipHero(hero,id);break;}
    // 4. 虫王：6:00 后攒钱放虫王（本队场上没有、冷却好了才攒），攒的时候只派小股兵。每队只有一个电脑座位负责攒。
    const kingAlive=teamKing(team);
    if(T.kingSaver){const ks=VS.seatById[T.kingSaver];if(kingAlive||!ks||!ks.ai||ks.cd.king>0)T.kingSaver=null;}
    const kingReady=cfg.king&&VS.time>=R.tier3&&!(s.cd.king>0)&&!kingAlive&&(!T.kingSaver||T.kingSaver===pid);
    if(kingReady)T.kingSaver=pid;
    if(kingReady&&s.gold>=3000+cfg.reserve&&!(underAttack&&threat.value>defense)&&!st.queue.some(q=>q.id==='king')){st.queue.unshift({id:'king',lane:aiLane(s)});return;}
    // 5. 进攻：攒够一波再一起派
    const budget=kingReady?Math.min(cfg.wave(VS.time),600):cfg.wave(VS.time),hold=kingReady&&s.gold<3000&&s.gold+incomeOf(pid)*18>=3000;
    const paced=VS.time>=(cfg.firstWave||0)&&VS.time-(st.lastWave??-999)>=(cfg.waveGap||0);
    if(paced&&!hold&&!st.queue.length&&s.gold>=budget+cfg.reserve&&!(underAttack&&threat.value>defense)){
      // 多人对战：普通/困难电脑和同队电脑约好一起出（最多等 25 秒），同一路压上；
      // 一个人一波只有 1 对 1 的规模，单独冲上去打全队的防守会白送。简单难度各打各的。
      if(n>1&&cfg.counter){
        st.readyAt=st.readyAt??VS.time;
        const mates=members(team).filter(m=>m!==s&&m.ai&&VS_AI[m.ai].counter&&m.pid!==T.kingSaver);
        if(mates.some(m=>m.aiState.readyAt==null&&!m.aiState.queue.length)&&VS.time-st.readyAt<25)return;
        const lane=aiLane(s);
        for(const m of [s,...mates.filter(m=>m.aiState.readyAt!=null)]){
          const ms=m.aiState,bud=Math.min(VS_AI[m.ai].wave(VS.time),m.gold-VS_AI[m.ai].reserve);ms.readyAt=null;ms.lastWave=VS.time;
          if(bud>=150)for(const id of aiCompose(m,bud))ms.queue.push({id,lane});
        }
        return;
      }
      st.lastWave=VS.time;
      const lane=aiLane(s);const picks=aiCompose(s,budget);
      for(const id of picks)st.queue.push({id,lane});
    }
  }
  function threatOn(team){
    const hq=VS.hq[team].pos;let value=0,fly=0,swarm=0,heavy=0,soldier=0,east=0,west=0;
    for(const u of VS.units){if(u.dead||u.team===team)continue;const p=u.mesh.position;if(rel(team,p.z)<-5||Math.hypot(p.x-hq.x,p.z-hq.z)<75){
      const v=u.value||25;value+=v;if(u.fly)fly+=v;else if(u.kind==='soldier')soldier+=v;else if(u.prof==='bug0')swarm+=v;else heavy+=v;if(p.x>0)east+=v;else west+=v;}}
    for(const h of humans())if(h.team&&h.team!==team&&!h.dead&&rel(team,h.pos.z)<-20){value+=200;soldier+=200;if(h.pos.x>0)east+=200;else west+=200;}
    return {value,fly,swarm,heavy,soldier,side:east>west?1:west>east?-1:dirOf(team)}; // 平局按各自左手边，两边一致
  }
  function defenseOf(team){
    let v=300;for(const b of api.buildings)if(!b.dead&&b.team===team&&b.dmg)v+=api.BUILDINGS[b.kind].price;
    for(const u of VS.units)if(!u.dead&&u.team===team&&rel(team,u.mesh.position.z)<0)v+=(u.value||25)*.8;
    for(const h of humans())if(h.team===team&&!h.dead)v+=300;return v;
  }
  function aiTurretKind(s,threat){
    const team=s.team,cfg=VS_AI[s.ai],own={},n=G.n;for(const b of api.buildings)if(!b.dead&&b.team===team)own[b.kind]=(own[b.kind]||0)+1;
    const enemyFlyers=VS.units.some(u=>!u.dead&&u.team!==team&&u.fly);
    if(threat.fly>0||(enemyFlyers&&!(own.antiAir>0))||(VS.time>R.tier2&&cfg.counter&&(own.antiAir||0)<n))return 'antiAir';
    if(!cfg.counter)return Math.random()<.6?'mgTurret':'cannonTurret';
    if(threat.soldier+threat.heavy>threat.swarm*1.2&&(own.cannonTurret||0)<4*n)return 'cannonTurret';
    if(threat.swarm>0&&(own.mgTurret||0)>=2&&s.gold>=1100&&(own.teslaTurret||0)<2*n)return 'teslaTurret';
    if((own.mgTurret||0)<=(own.cannonTurret||0))return 'mgTurret';
    return 'cannonTurret';
  }
  function aiPlace(s,kind,side){
    const d=dirOf(s.team),rank=k=>k.lane*d===side?0:k.lane===0?1:2;
    const slots=G.slots.map(([x,z,lane],i)=>({x,z,lane,i})).sort((a,b)=>rank(a)-rank(b)||a.i-b.i);
    for(const k of slots){const p=world(s.team,k.x,k.z);for(const [ox,oz] of [[0,0],[3,0],[-3,0],[0,3],[0,-3]]){if(!build(s.pid,kind,p.x+ox,p.z+oz,0))return true;}}
    return false;
  }
  function laneDefense(enemy,side){
    // 统计对方在该路口附近（其本方半场、同侧）的炮塔火力
    let v=0;const mid=20*G.S.sx;for(const b of api.buildings){if(b.dead||b.team!==enemy||!b.dmg)continue;const p=b.mesh.position;if(side===0?Math.abs(p.x)<mid:Math.sign(p.x)===side||Math.abs(p.x)<mid)v+=api.BUILDINGS[b.kind].price*(Math.sign(p.x)===side?1:.5);}return v;
  }
  function aiLane(s){
    const cfg=VS_AI[s.ai],team=s.team;
    if(cfg.lane==='random')return LANES[Math.floor(Math.random()*3)];
    const ranked=LANES.map(lane=>({lane,def:laneDefense(other(team),sideFor(team,lane))})).sort((a,b)=>a.def-b.def);
    const choices=ranked.filter(x=>x.def<ranked[0].def+150).map(x=>x.lane);
    return s.aiState.lastLane=choices[(choices.indexOf(s.aiState.lastLane)+1)%choices.length];
  }
  function aiCompose(s,money){
    const cfg=VS_AI[s.ai],enemy=other(s.team),own={};
    for(const b of api.buildings)if(!b.dead&&b.team===enemy)own[b.kind]=(own[b.kind]||0)+1;
    const n=G.n,w={swarm:2.5,gunners:2.5,assault:2.5,carapace:1.2,flyers:1,bombers:.8,medics:1,jeep:1.2};
    if(cfg.counter){
      if((own.antiAir||0)>=n)w.flyers*=.35*n/(own.antiAir);else w.flyers*=2;
      if((own.wall||0)>=2*n)w.bombers*=2.2;
      if((own.mgTurret||0)>=2*n){w.gunners*=1.7;w.swarm*=.6;}
      if((own.cannonTurret||0)>=n){w.swarm*=1.3;w.gunners*=.8;w.assault*=.8;}
      if((own.teslaTurret||0)>=n)w.assault*=.7;
      if(!banksOf(enemy).some(alive))w.jeep*=.5;else if(VS.time>240)w.jeep*=1.4;
    }
    const picks=[];let guard=0;
    while(money>=150&&guard++<20){
      if(cfg.maxGroups&&picks.length>=cfg.maxGroups)break;
      const pool=VS_UNITS.filter(d=>d.id!=='king'&&VS.time>=tier(d.id)+(d.tier==='t1'?0:cfg.tierDelay||0)&&d.price<=money&&w[d.id]>0&&(!cfg.only||cfg.only.includes(d.id)));
      if(!pool.length)break;
      let sum=pool.reduce((a,d)=>a+w[d.id],0),r=Math.random()*sum,pick=pool[0];
      for(const d of pool){r-=w[d.id];if(r<=0){pick=d;break;}}
      picks.push(pick.id);money-=pick.price;w[pick.id]*=.7;
    }
    if(!cfg.only&&picks.length&&picks.every(id=>id!=='swarm')&&money>=150)picks.unshift('swarm');
    return picks;
  }
  // 电脑英雄：残血回家，平时守本方半场炮塔附近；普通/困难跟着本队大波压上。多名电脑英雄按座位错开巡逻点。
  function aiHeroInput(h){
    if(!VS.active||h.dead)return {x:0,z:0,yaw:h.yaw||0,edges:[],fire:false,autoFire:true,autoAim:true,run:false};
    const team=h.team,seat=seatOf(h),cfg=seat?.ai?VS_AI[seat.ai]:VS_AI.normal,me=h.pos,hq=VS.hq[team].pos,idx=seat?seat.idx:0,sx=G.S.sx;
    const wp=api.WEAPONS[h.curWeapon]||api.WEAPONS.lmg,range=wp.range;
    let goal=null,target=null,bd=Infinity;
    // 残血回家，回满七成再出门
    if(h.hp<h.maxHp*(cfg.retreat||.35))h.vsRetreat=true;else if(h.hp>h.maxHp*.7)h.vsRetreat=false;
    if(h.vsRetreat)goal={x:hq.x+(idx%2?-3:3)*Math.ceil(idx/2),z:hq.z+dirOf(team)*8};
    else{
      for(const t of hostiles(team,{structures:false})){const p=posOf(t),d=Math.hypot(p.x-me.x,p.z-me.z);
        const inHome=rel(team,p.z)<-10;if((inHome||d<range+6)&&d<bd&&d<55){bd=d;target=t;}}
      if(target){const p=posOf(target);if(bd>range*.7)goal=p;}
      else{
        let push=null;
        const camp=VS.camps?.filter(c=>!c.teamBuff&&c.unit&&!c.unit.dead&&rel(team,c.z)<0).sort((a,b)=>Math.hypot(a.x-me.x,a.z-me.z)-Math.hypot(b.x-me.x,b.z-me.z))[0];
        if(camp&&cfg.heroPush&&h.hp>h.maxHp*.65&&threatOn(team).value===0){target=camp.unit;bd=Math.hypot(camp.x-me.x,camp.z-me.z);if(bd>range*.65)goal=camp.unit.mesh.position;}
        if(cfg.heroPush&&h.hp>h.maxHp*.6){let n=0,cx=0,cz=0;for(const u of VS.units)if(!u.dead&&u.team===team&&rel(team,u.mesh.position.z)>-30){n++;cx+=u.mesh.position.x;cz+=u.mesh.position.z;}if(n>=8)push={x:cx/n+(idx%2?-3:3)*Math.ceil(idx/2),z:cz/n-dirOf(team)*8};}
        const th=threatOn(team);
        if(!target)goal=push||world(team,th.value>0?dirOf(team)*th.side*44*sx:((VS.matchId+Math.floor(VS.time/40)+idx)%2?40:-40)*sx,-44+(idx>>1)*-6);
      }
    }
    let x=0,z=0;
    if(goal){const dx=goal.x-me.x,dz=goal.z-me.z,d=Math.hypot(dx,dz);if(d>2.5){x=dx/d;z=dz/d;}}
    let yaw=h.yaw||0;
    if(target){const p=posOf(target);yaw=Math.atan2(p.x-me.x,p.z-me.z);}else if(x||z)yaw=Math.atan2(x,z);
    const duty=cfg.heroFire??1,shoot=!!target&&bd<range&&(duty>=1||((VS.time*1.3+idx*.37)%1)<duty); // 简单难度英雄开火有间歇
    return {x,z,yaw,fp:false,run:!target&&(Math.abs(x)+Math.abs(z)>0),fire:shoot,autoFire:duty>=1,autoAim:true,edges:[]};
  }

  /* ================= 联机同步 ================= */
  function snapshot(){
    if(!VS.active)return null;
    const T=team=>({h:Math.round(VS.hq[team].hp),hm:VS.hq[team].maxHp,v:members(team).filter(m=>m.surrender).length});
    const P=s=>({id:s.pid,g:Math.floor(s.gold),b:s.bank,bd:+s.bankDown.toFixed(1),bh:Math.round(VS.banks[s.pid].hp),bm:VS.banks[s.pid].maxHp,l:s.lane,
      cd:Object.fromEntries(Object.entries(s.cd).filter(([,v])=>v>0).map(([k,v])=>[k,+v.toFixed(1)])),ai:s.ai||null,it:+s.incomeT.toFixed(1),p:popOf(s.pid),k:s.stats.kills,n:s.name,sv:s.surrender?1:0,lv:s.level,xp:+s.xp.toFixed(2),bf:s.buffs});
    return {m:VS.matchId,t:+VS.time.toFixed(2),over:VS.over,res:VS.over?VS.result:null,ot:VS.overtime?{start:VS.overtime.start}:null,mode:VS.mode,diff:VS.difficulty,size:G.n,
      teams:{blue:T('blue'),red:T('red')},buffs:{blue:VS.teams.blue.buffs,red:VS.teams.red.buffs},camps:(VS.camps||[]).map(c=>({id:c.id,next:c.next,alive:!!c.unit&&!c.unit.dead})),seats:VS.seats.map(P),ev:VS.events,
      roster:humans().filter(h=>h.vsPid).map(h=>[h.slot,h.vsPid,h.cls||'gunner',h.vsAI?1:0,h.vsName||'']),
      u:VS.units.filter(u=>!u.dead).map(u=>[u.id,PROFILE_KEYS.indexOf(u.prof),u.team==='blue'?0:u.team==='red'?1:2,+u.mesh.position.x.toFixed(1),+u.mesh.position.y.toFixed(1),+u.mesh.position.z.toFixed(1),+u.mesh.rotation.y.toFixed(2),+(u.hp/u.maxHp).toFixed(2),u.atkAnim>0?1:u.moving?2:0]),
      w:Object.fromEntries(humans().map(h=>[h.slot,h.vsWeapons||[]])),d:Object.fromEntries(humans().map(h=>[h.slot,[h.vsDeaths||0,+(h.respawnT||0).toFixed(1),h.team,h.vsPid]]))};
  }
  function apply(data,dt=.016){
    if(!data)return;
    if(!VS.active||data.m!==VS.matchId){api.onGuestMatch?.(data);if(!VS.active)return;}
    VS.time=data.t;VS.mode=data.mode;VS.difficulty=data.diff;VS.overtime=data.ot?{start:data.ot.start}:null;
    for(const team of TEAMS){
      const s=data.teams[team],hq=VS.hq[team];if(!s)continue;
      hq.hp=s.h;if(s.hm)hq.maxHp=s.hm;api.updHPBar(hq.bar,s.h/hq.maxHp);
    }
    for(const row of data.seats||[]){
      const s=VS.seatById[row.id];if(!s)continue;
      s.gold=row.g;s.bank=row.b;s.bankDown=row.bd;s.lane=row.l;s.cd=row.cd||{};s.incomeT=row.it;s.ai=row.ai;s.pop=row.p;s.stats.kills=row.k||0;s.name=row.n||s.name;s.surrender=!!row.sv;
      s.level=clamp(row.lv||1,1,R.heroMaxLevel);s.xp=row.xp||0;s.buffs=row.bf||{};const hero=heroOfSeat(s.pid);if(hero)syncHeroStats(hero);
      const bank=VS.banks[row.id];bank.hp=row.bh;bank.maxHp=row.bm;api.updHPBar(bank.bar,row.bh/row.bm);syncBankMesh(row.id);
    }
    for(const e of data.ev||[])if(e.id>VS.seenEvent){VS.seenEvent=e.id;if(e.p.includes(VS.localPid))api.showMsg(e.t,e.s||2);}
    for(const team of TEAMS)VS.teams[team].buffs=data.buffs?.[team]||{};
    for(const c of VS.camps||[]){const row=data.camps?.find(x=>x.id===c.id);if(row){c.next=row.next;c.syncedAlive=row.alive;}}
    const seen=new Set();
    for(const row of data.u){
      const [id,pk,ti,x,y,z,ry,hp,anim]=row;seen.add(id);let g=VS.guestUnits.get(id);
      if(!g){const prof=PROFILE_KEYS[pk],team=ti===2?'neutral':ti?'red':'blue';g={id,prof,team,kind:VS_PROFILES[prof].kind==='boss'?'boss':VS_PROFILES[prof].kind,mesh:makeUnitMesh(prof,team),anim:0,atkAnim:0};
        const p=VS_PROFILES[prof];g.bar=api.makeHPBar(p.kind==='boss'?5:p.kind==='jeep'?3.4:1.6,TEAM_CSS[team]);g.bar.position.y=p.kind==='boss'?7.5:p.kind==='jeep'?3.4:p.kind==='soldier'?2.7*(p.scale||1):(p.fly?2.2:1.6)*(p.scale||1)+.4;
        if(g.mesh.userData.worlds){g.bar.scale.divideScalar(g.mesh.scale.x);g.bar.position.y=g.mesh.userData.visualHeight+.5/g.mesh.scale.y;}
        g.mesh.add(g.bar);g.mesh.position.set(x,y,z);scene.add(g.mesh);VS.guestUnits.set(id,g);}
      g.target={x,y,z,ry};g.atkAnim=anim===1?.35:0;g.moving=anim===2;api.updHPBar(g.bar,hp);
    }
    for(const [id,g] of VS.guestUnits)if(!seen.has(id)){if(!(g.kind==='bug'||g.kind==='boss')||!api.visuals.death(g.mesh))disposeUnit(g);VS.guestUnits.delete(id);}
    const local=VS.local;
    if(data.w&&local&&data.w[local.slot]){local.vsWeapons=data.w[local.slot];api.setLocalWeapons(local.vsWeapons);}
    if(data.d)for(const h of humans()){const d=data.d[h.slot];if(d){h.vsDeaths=d[0];h.respawnT=d[1];if(d[3])h.vsPid=d[3];if(d[2]&&h.team!==d[2]){setupHero(h,d[2]);}if(h.mesh&&!h.mesh.children.some(c=>c.userData.vsRing))addRing(h.mesh,h.team,1.25);}}
    for(const b of api.buildings)if(b.team&&!b.vsType)markBuilding(b,b.team);
    if(data.over&&!VS.over){VS.over=true;VS.result=data.res;api.onEnd?.(data.res);}
    else if(!data.over&&VS.over){VS.over=false;VS.result=null;}
  }
  // 客人画面：位置插值、动画
  function guestFrame(dt){
    for(const [,g] of VS.guestUnits){
      if(!g.target||!g.mesh)continue;const p=g.mesh.position,k=Math.min(1,dt*12);
      p.x+=(g.target.x-p.x)*k;p.y+=(g.target.y-p.y)*k;p.z+=(g.target.z-p.z)*k;
      g.mesh.rotation.y+=Math.atan2(Math.sin(g.target.ry-g.mesh.rotation.y),Math.cos(g.target.ry-g.mesh.rotation.y))*k;
      g.anim+=dt*8;g.atkAnim=Math.max(0,g.atkAnim-dt);animateUnit(g,dt,g.moving);
    }
  }
  function handleCommand(h,c){
    if(!VS.active||!h||!h.team)return false;
    const s=seatOf(h);if(!s)return false;const pid=s.pid;
    if(c.kind==='vsSend'){send(pid,c.id,null);return true;}
    if(c.kind==='vsBank'){upgradeBank(pid);return true;}
    if(c.kind==='vsLane'){setLane(pid,c.lane);return true;}
    if(c.kind==='vsWeapon'){const r=buyWeapon(h,c.id);if(r===''||r==='owned')api.equipHero(h,c.id);return true;}
    if(c.kind==='vsSurrender'){surrender(pid);return true;}
    if(c.kind==='vsGive'){if(typeof c.to==='string')give(pid,c.to,R.giveStep);return true;}
    if(c.kind==='build'){if([c.x,c.z,c.yaw].every(Number.isFinite)&&Math.hypot(c.x-h.pos.x,c.z-h.pos.z)<7)build(pid,c.id,c.x,c.z,c.yaw);return true;}
    if(c.kind==='demolish'){const bd=api.buildings.find(b=>b.coopId===c.id);if(bd&&Math.hypot(bd.mesh.position.x-h.pos.x,bd.mesh.position.z-h.pos.z)<16)demolish(pid,bd);return true;}
    return false;
  }

  /* ================= 小地图 ================= */
  function drawRadar(ctx,W,H,center,camYaw,heading){
    const cx=W/2,cy=H/2,Rr=W/2-4,range=120*Math.max(1,G.S.sx*.92),sc=Rr/range,c=Math.cos(camYaw),s=Math.sin(camYaw);
    const toS=(x,z)=>{const dx=x-center.x,dz=z-center.z;return [cx+(-dx*c+dz*s)*sc,cy-(dx*s+dz*c)*sc];};
    ctx.clearRect(0,0,W,H);ctx.save();ctx.beginPath();ctx.arc(cx,cy,Rr,0,TAU);ctx.fillStyle='rgba(6,14,24,.8)';ctx.fill();ctx.clip();
    ctx.lineCap='round';ctx.lineWidth=9;ctx.strokeStyle='rgba(150,120,80,.35)';
    for(const side of [1,0,-1]){ctx.beginPath();(side?G.path:G.midPath).forEach(([x,z],i)=>{const [X,Y]=toS(side*x,AZ+z);i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});ctx.stroke();}
    ctx.fillStyle='rgba(120,100,80,.6)';for(const [x,z,r] of G.massif){for(const k of [1,-1]){const [X,Y]=toS(k*x,AZ+k*z);ctx.beginPath();ctx.arc(X,Y,r*sc,0,TAU);ctx.fill();}}
    const dot=(x,z,r,col,shape)=>{const [X,Y]=toS(x,z);ctx.fillStyle=col;ctx.beginPath();if(shape==='sq')ctx.rect(X-r,Y-r,r*2,r*2);else ctx.arc(X,Y,r,0,TAU);ctx.fill();};
    for(const c of VS.camps||[])dot(c.x,c.z,c.teamBuff?4:3,(VS.role==='guest'?c.syncedAlive:c.unit&&!c.unit.dead)?'#e4bd66':'#687079','sq');
    for(const team of TEAMS){dot(VS.hq[team].pos.x,VS.hq[team].pos.z,8,TEAM_CSS[team],'sq');for(const bank of banksOf(team))if(alive(bank))dot(bank.pos.x,bank.pos.z,bank.pid===VS.localPid?4.5:3.5,'#ffd34d','sq');}
    for(const b of api.buildings)if(!b.dead&&b.team)dot(b.mesh.position.x,b.mesh.position.z,b.isWall?2.2:3,b.team==='blue'?'rgba(130,190,255,.95)':'rgba(255,150,140,.95)','sq');
    const units=VS.role==='guest'?[...VS.guestUnits.values()]:VS.units;
    for(const u of units)if(!u.dead&&u.mesh)dot(u.mesh.position.x,u.mesh.position.z,u.kind==='boss'?7:u.kind==='jeep'?4.5:2.8,TEAM_CSS[u.team]);
    for(const h of humans())if(h.team&&!h.dead&&h!==VS.local)dot(h.pos.x,h.pos.z,4.5,h.team==='blue'?'#bfe4ff':'#ffd0c8');
    ctx.restore();
    ctx.save();ctx.translate(cx,cy);ctx.rotate(-(heading-camYaw));ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(6,6);ctx.lineTo(-6,6);ctx.closePath();ctx.fill();ctx.restore();
    ctx.strokeStyle='rgba(120,170,200,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,Rr,0,TAU);ctx.stroke();
  }

  return {
    state:VS,get active(){return VS.active;},get over(){return VS.over;},get size(){return G.n;},
    start,stop,update,setAI,clearAI,setLocal,send,sendReason,upgradeBank,setLane,cycleLane,buyWeapon,give,surrender,build,canPlace,zoneReason,demolish,
    aimTargets,beamHits,bulletStep,explodeAt,damage,heroDown,respawned,placeHero,setupHero,markBuilding,aiHeroInput,
    snapshot,apply,guestFrame,handleCommand,drawRadar,incomeOf,popOf,popCap,buildCap,tier,fmtTime,heroOf,heroOfSeat,seatName,teamSummary,xpNeeded,buffText,grenadeCooldown,paths:()=>[1,0,-1].map(side=>lanePath('blue',side)),
    team:t=>VS.teams?.[t],seat:pid=>VS.seatById?.[pid],seatOf,members:t=>VS.teams?members(t):[],hq:t=>VS.hq?.[t],bank:pid=>VS.banks?.[pid],rel,world,
  };
}
export function fmtTime(s){s=Math.max(0,Math.floor(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}

// Conquest replaces the previous lane/economy rules. The host owns all combat,
// capture, equipment, respawn and vehicle decisions; guests render snapshots.
import {BF_MAP,BF_KITS,BF_WEAPONS,BF_VEHICLES,buildMilitaryMap,militarySoldier} from './battlefield-assets.js';
export const TEAM_CSS={blue:'#72b8ed',red:'#ef8c76',neutral:'#d6cfb5'};
export const TEAM_NAME={blue:'蓝方',red:'红方'};
export const VS_SIZES=[1,2,3,4];
export const VS_RULES={tickets:240,limit:900,surrenderAfter:60,respawnBase:8,captureSeconds:10,captureRadius:12,vehicleRespawn:35,grenadeCd:12};
export const VS_AI={easy:{name:'简单',accuracy:.14,reaction:1.2},normal:{name:'普通',accuracy:.075,reaction:.7},hard:{name:'困难',accuracy:.045,reaction:.4}};
export const VS_UNITS=[];export const VS_BUILD_KINDS=[];
const TEAMS=['blue','red'],KINDS=['jeep','tank','mech','heli'],KITS=Object.keys(BF_KITS),opp=t=>t==='blue'?'red':'blue',sign=t=>t==='blue'?1:-1,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function fmtTime(s){s=Math.max(0,Math.floor(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
export function createVersus(api){
  const {THREE:T,scene}=api,R=VS_RULES;
  const VS={active:false,over:false,role:'local',mode:'ai',size:1,time:0,frame:0,matchId:0,seats:[],seatById:{},teams:{},units:[],points:[],objects:[],solids:[],guestUnits:new Map(),flags:{},local:null,localPid:'blue0',localTeam:'blue',events:[],eventId:0,seenEvent:0};
  let map=null,savedWorld=null,hidden=[],sky=[],skyVisible=[],savedLight=[],savedFog=null,nextId=1,respawns=[],flows=new Map();
  const humans=()=>api.getHumans(),seatOf=h=>VS.seatById[h?.vsPid],heroOfSeat=pid=>humans().find(h=>h.vsPid===pid),members=t=>VS.seats.filter(s=>s.team===t);
  const posOf=o=>o.pos||o.mesh.position,alive=o=>o&&!o.dead&&!o.disconnected&&o.hp>0;
  const stats=()=>({kills:0,deaths:0,captures:0,vehicles:0,healing:0,repairs:0});
  const hqPos=team=>new T.Vector3(0,0,BF_MAP.z-sign(team)*137);
  const seatName=s=>s.pid===VS.localPid?'你':s.name||(s.ai?'电脑':TEAM_NAME[s.team]+(s.idx+1)+'号');
  function disposeMesh(mesh){if(!mesh)return;scene.remove(mesh);const gs=new Set(),ms=new Set();mesh.traverse(n=>{if(n.geometry)gs.add(n.geometry);if(n.material)ms.add(n.material);});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
  function prepare(){api.setBattlefieldAssets(true);}
  function start(opts){
    if(VS.active)stop();prepare();Object.assign(VS,{active:true,over:false,result:null,time:0,bleed:0,frame:0,size:VS_SIZES.includes(opts.size)?opts.size:1,role:opts.role||'local',mode:opts.mode||'ai',sim:!!opts.sim,difficulty:opts.difficulty||'normal',matchId:opts.matchId||VS.matchId+1,seats:[],seatById:{},units:[],teams:{},events:[],eventId:0,seenEvent:0,flags:{}});
    nextId=1;respawns=[];flows.clear();
    for(const team of TEAMS){VS.teams[team]={team,tickets:R.tickets,stats:stats()};for(let i=0;i<VS.size;i++){const pid=team+i,info=opts.seats?.find(s=>s.pid===pid)||{};const s={pid,team,idx:i,name:info.name||'',ai:info.ai||null,kit:KITS[i%KITS.length],pendingKit:null,spawn:'HQ',order:'auto',stats:stats(),surrender:false};VS.seats.push(s);VS.seatById[pid]=s;}}
    setLocal(api.getPlayer(),opts.localTeam);const keep=new Set(api.keepObjects());hidden=scene.children.filter(o=>o.visible&&!o.isLight&&!keep.has(o));hidden.forEach(o=>o.visible=false);
    sky=api.skyObjects();skyVisible=sky.map(o=>o.visible);sky.forEach(o=>{o.position.z+=BF_MAP.z;});
    savedLight=[];scene.children.filter(o=>o.isLight).forEach(o=>{savedLight.push([o,o.color.clone(),o.intensity,o.groundColor?.clone()]);if(o.isHemisphereLight){o.color.set(0xd2e1df);o.groundColor.set(0x8e785b);o.intensity=.85;}if(o.isDirectionalLight){o.color.set(0xffecc7);o.intensity=1.25;}});
    savedFog={background:scene.background?.clone(),fog:scene.fog?.clone()};scene.background=new T.Color(0xadb9b2);scene.fog=new T.Fog(0xadb9b2,145,390);sky.forEach(o=>o.visible=false);
    savedWorld={...api.WORLD};Object.assign(api.WORLD,{minX:-BF_MAP.halfX,maxX:BF_MAP.halfX,minZ:BF_MAP.z-BF_MAP.halfZ,maxZ:BF_MAP.z+BF_MAP.halfZ});
    map=buildMilitaryMap(T);scene.add(map.root);VS.solids=map.solids;api.fortress.solids.push(...VS.solids);api.fortress.indexed=-1;
    VS.points=BF_MAP.points.map(p=>({...p,owner:null,progress:0,contested:false,count:{blue:0,red:0}}));
    VS.hq=Object.fromEntries(TEAMS.map(t=>[t,{pos:hqPos(t),hp:R.tickets,maxHp:R.tickets}]));
    for(const h of humans()){if(!VS.seatById[h.vsPid])h.vsPid=(h.team||'blue')+'0';setupHero(h,seatOf(h).team);placeHero(h,true);}
    if(VS.role!=='guest')for(const team of TEAMS){for(let i=0;i<8;i++)spawnInfantry(team,i);for(let i=0;i<KINDS.length;i++)spawnVehicle(team,KINDS[i],i);}
    updateFlags();api.showMsg('沙漠据点战：占领 A / B / C，消耗敌方兵力票。第一人称手动瞄准，按住射击；部署面板可换兵种与复活点',5);return VS;
  }
  function stop(){
    if(!VS.active)return;
    VS.units.forEach(u=>disposeMesh(u.mesh));VS.units=[];for(const g of VS.guestUnits.values())disposeMesh(g.mesh);VS.guestUnits.clear();
    if(map){scene.remove(map.root);map.dispose();map=null;}const own=new Set(VS.solids);for(let i=api.fortress.solids.length-1;i>=0;i--)if(own.has(api.fortress.solids[i]))api.fortress.solids.splice(i,1);api.fortress.indexed=-1;VS.solids=[];
    hidden.forEach(o=>o.visible=true);hidden=[];sky.forEach((o,i)=>{o.position.z-=BF_MAP.z;o.visible=skyVisible[i];});sky=[];skyVisible=[];
    savedLight.forEach(([o,c,i,g])=>{o.color.copy(c);o.intensity=i;if(g)o.groundColor.copy(g);});savedLight=[];
    if(savedFog){scene.background=savedFog.background;scene.fog=savedFog.fog;}if(savedWorld)Object.assign(api.WORLD,savedWorld);savedWorld=null;
    api.setBattlefieldAssets(false);VS.active=false;VS.over=false;
    for(const h of humans()){delete h.bfAmmo;delete h.bfKit;delete h.bfReload;delete h.bfSupportCd;delete h.bfNav;delete h.vsDown;}
  }
  function setLocal(h,fallback){VS.local=h;VS.localPid=h.vsPid||(fallback||'blue')+'0';VS.localTeam=seatOf(h)?.team||fallback||'blue';}
  function setAI(pid,difficulty){const s=VS.seatById[pid];if(s)s.ai=VS_AI[difficulty]?difficulty:'normal';}
  function clearAI(pid){const s=VS.seatById[pid];if(s)s.ai=null;}
  function loadout(h){const s=seatOf(h);if(!s)return;if(s.pendingKit){s.kit=s.pendingKit;s.pendingKit=null;}h.bfKit=s.kit;h.maxHp=100;h.hp=100;h.speed=9;h.shield=0;h.buffT=0;h.bfSupportCd=0;h.bfReload=null;h.bfAmmo={};h.vsWeapons=[...BF_KITS[s.kit].weapons];for(const id of h.vsWeapons)h.bfAmmo[id]=BF_WEAPONS[id].mag;api.equipHero(h,h.vsWeapons[0]);if(h===VS.local)api.setLocalWeapons(h.vsWeapons);}
  function setupHero(h,team){h.team=team;h.vsType='hero';h.hitH=1.15;h.radius=.65;h.kind='hero';h.grenadeCd=0;h.vsDeaths=h.vsDeaths||0;loadout(h);api.setMilitaryHero(h,team,h.curWeapon);api.recolorBar(h,team);}
  function spawnAnchor(s){const p=VS.points.find(p=>p.id===s?.spawn);return p&&p.owner===s.team&&!p.contested?p:hqPos(s?.team||'blue');}
  function freeNear(p,r=4){for(let i=0;i<24;i++){const a=i*2.399,rr=r+Math.floor(i/8)*2,x=p.x+Math.sin(a)*rr,z=p.z+Math.cos(a)*rr;if(!api.collideWalls(x,z,.75,0))return {x,z};}return {x:p.x,z:p.z};}
  function placeHero(h,initial=false){
    const s=seatOf(h);loadout(h);const p=freeNear(initial?hqPos(h.team):spawnAnchor(s),4+(s?.idx||0)*2);h.pos.set(p.x,0,p.z);h.vy=0;h.onGround=true;h.dead=false;h.vsDown=false;h.invulnerable=3;h.inVehicle=null;h.yaw=h.team==='blue'?0:Math.PI;h.lookHeading=h.yaw;h.bfNav=null;
    if(initial)h.vsDeaths=0;api.setMilitaryHero(h,h.team,h.curWeapon);h.mesh.position.copy(h.pos);h.mesh.visible=true;if(h===VS.local)api.faceTeam(h.team);
  }
  function respawned(h){placeHero(h);}
  function chooseKit(h,id){const s=seatOf(h);if(!s||!BF_KITS[id]||VS.over)return false;s.pendingKit=id;if(!h.dead&&h.pos.distanceTo(hqPos(h.team))<24&&!h.inVehicle){loadout(h);api.setMilitaryHero(h,h.team,h.curWeapon);}return true;}
  function chooseSpawn(h,id){const s=seatOf(h),p=VS.points.find(p=>p.id===id);if(!s||id!=='HQ'&&(!p||p.owner!==h.team||p.contested))return false;s.spawn=id;return true;}
  function chooseWeapon(h,id){if(!h.vsWeapons?.includes(id)||h.dead)return false;h.bfReload=null;api.equipHero(h,id);api.setMilitaryHero(h,h.team,id);return true;}
  function reload(h){if(h.dead||h.inVehicle||h.bfReload)return false;const id=h.curWeapon,w=BF_WEAPONS[id];if(!w||(h.bfAmmo?.[id]??w.mag)>=w.mag)return false;h.bfReload={id,left:w.reload,total:w.reload};api.AudioSys.sfx('reload');return true;}
  function canShoot(h,id){if(h.bfReload)return false;const w=BF_WEAPONS[id];if(!w)return false;h.bfAmmo=h.bfAmmo||{};if(h.bfAmmo[id]==null)h.bfAmmo[id]=w.mag;if(h.bfAmmo[id]<=0){reload(h);return false;}h.bfAmmo[id]--;return true;}
  function support(h){
    if(h.dead||h.inVehicle||h.bfSupportCd>0)return false;const s=seatOf(h);if(!s)return false;
    if(s.kit==='engineer'){let total=0;for(const v of api.vehicles)if(!v.dead&&v.team===h.team&&posOf(v).distanceTo(h.pos)<9){const n=Math.min(220,v.maxHp-v.hp);v.hp+=n;total+=n;api.updHPBar(v.bar,v.hp/v.maxHp);}if(!total)return false;s.stats.repairs+=total;}
    else if(s.kit==='medic'){let total=0;for(const p of [...humans(),...VS.units])if(alive(p)&&p.team===h.team&&!p.inVehicle&&posOf(p).distanceTo(h.pos)<10){const n=Math.min(45,p.maxHp-p.hp);p.hp+=n;total+=n;api.updHPBar(p.bar,p.hp/p.maxHp);}if(!total)return false;s.stats.healing+=total;}
    else if(s.kit==='support'){for(const p of humans())if(!p.dead&&p.team===h.team&&p.pos.distanceTo(h.pos)<10){for(const id of p.vsWeapons)p.bfAmmo[id]=BF_WEAPONS[id].mag;p.bfReload=null;}}
    else return false;
    h.bfSupportCd=12;api.spawnParticles(h.pos.clone().add(new T.Vector3(0,1,0)),0x95c3a0,8,3,.7);api.AudioSys.sfx('heal');return true;
  }
  function spawnVehicle(team,kind,index){const v=api.spawnVehicle(kind);v.team=team;v.vsType='vehicle';v.radius=kind==='tank'?2.9:2.4;v.hitH=kind==='heli'?1.6:1.5;v.homeIndex=index;v.mesh.position.set(kind==='heli'?56:index===0?-10:index===1?12:45,0,BF_MAP.z-sign(team)*(kind==='heli'?137:120));if(team==='red')v.mesh.position.x*=-1;v.yaw=team==='blue'?0:Math.PI;v.mesh.rotation.y=v.yaw;v.bfDriver=null;v.bfAIStart=VS.time+8+index*7;v.dead=false;return v;}
  function spawnInfantry(team,index,at){
    const kit=index%5,weapon=['plasma','lmg','rpg','laser','flamer'][kit],mesh=militarySoldier(T,team,weapon),p=at||freeNear(hqPos(team),7+index),u={id:nextId++,vsType:'unit',kind:'soldier',team,index,weapon,mesh,pos:mesh.position,hp:100,maxHp:100,radius:.65,hitH:1.15,dead:false,cd:index*.1,retarget:0,ammo:BF_WEAPONS[weapon].mag,reloading:0,anim:0};
    mesh.position.set(p.x,0,p.z);u.bar=api.makeHPBar(1.5,TEAM_CSS[team]);u.bar.position.y=2.4;mesh.add(u.bar);api.updHPBar(u.bar,1);scene.add(mesh);VS.units.push(u);return u;
  }
  const driverOf=v=>humans().find(h=>!h.dead&&h.inVehicle===v)||v.bfDriver;
  function enterReason(h,v){if(!v||v.dead)return '载具已损毁';if(v.team&&v.team!==h.team)return '这是敌方载具';if(humans().some(p=>p!==h&&p.inVehicle===v))return '已有队友驾驶';return '';}
  function takeVehicle(h,v){if(enterReason(h,v))return false;v.bfDriver=null;v.bfAIStart=Infinity;return true;}
  function hostiles(team){const out=[];for(const h of humans())if(alive(h)&&h.team!==team&&!h.inVehicle)out.push(h);for(const u of VS.units)if(alive(u)&&u.team!==team)out.push(u);for(const v of api.vehicles)if(alive(v)&&v.team&&v.team!==team)out.push(v);return out;}
  const aimTargets=hostiles;
  function center(t){const p=posOf(t);return new T.Vector3(p.x,p.y+(t.hitH||1),p.z);}
  function visible(a,b){return api.shotCover(a,b,false)>=.995;}
  function beamHits(a,b,team,hitSet){const out=[];for(const t of hostiles(team)){if(hitSet?.has(t))continue;const hit=api.segmentHit(a,b,center(t),(t.radius||.65)+.15);if(hit!==null)out.push({m:t,t:hit});}return out.sort((a,b)=>a.t-b.t);}
  function bulletStep(b,a,p,cover){for(const hit of beamHits(a,p,b.team,b.hitSet)){if(hit.t>=cover)break;if(!b.explode)damage(hit.m,b.dmg,b.team,b.src||'unit',b.pid,false);p.lerpVectors(a,p,hit.t);return true;}if(cover<1){p.lerpVectors(a,p,cover);return true;}return false;}
  // 手动瞄准常把炮弹打在目标脚边，我方炮弹会陷进地面约 0.3 米才爆：从地面以上判断遮挡，否则整发没有溅射伤害。
  function explodeAt(p,r,d,team,opts={}){for(const t of hostiles(team)){const c=center(t),dist=c.distanceTo(p);if(dist>r+(t.radius||.65))continue;const from=p.clone();from.y=Math.max(p.y,api.groundY(p.x,p.z))+.25;if(!visible(from,c))continue;damage(t,d*Math.max(.25,1-dist/(r+(t.radius||1))),team,opts.src||'unit',opts.by,true);}}
  function credit(team,by,field,n=1){const s=VS.seatById[by];if(s&&s.team===team)s.stats[field]=(s.stats[field]||0)+n;VS.teams[team].stats[field]=(VS.teams[team].stats[field]||0)+n;}
  function loseTickets(team,n){VS.teams[team].tickets=Math.max(0,VS.teams[team].tickets-n);VS.hq[team].hp=VS.teams[team].tickets;}
  function damage(t,d,team,src='unit',by=null,explosive=false){
    if(!alive(t)||t.team===team||VS.over||!Number.isFinite(d)||d<=0)return;
    if(t.vsType==='vehicle'){
      // Rifles scratch armor; rockets, grenades and cannon rounds do full damage.
      d*=explosive?1:t.kind==='tank'?.025:t.kind==='mech'?.09:t.kind==='heli'?.55:.4;t.hp=Math.max(0,t.hp-d);api.updHPBar(t.bar,t.hp/t.maxHp);
      if(t.hp===0){t.dead=true;loseTickets(t.team,3);credit(team,by,'vehicles');api.spawnParticles(center(t),0xffaa55,22,10,1.1);api.AudioSys.sfx('boom');for(const h of humans())if(h.inVehicle===t){h.inVehicle=null;h.hp=0;h.dead=true;heroDown(h,team,by);}respawns.push({kind:'vehicle',team:t.team,type:t.kind,index:t.homeIndex,at:VS.time+R.vehicleRespawn});scene.remove(t.mesh);const i=api.vehicles.indexOf(t);if(i>=0)api.vehicles.splice(i,1);api.visuals.release(t.mesh);}
      return;
    }
    if(t.vsType==='hero'){if(t.invulnerable>0)return;if(t===VS.local&&!VS.sim)api.withHuman(t,()=>api.playerDamage(d));else {t.hp=Math.max(0,t.hp-d);t.dead=t.hp===0;api.updHPBar(t.bar,t.hp/t.maxHp);}if(t.dead&&!t.vsDown)heroDown(t,team,by);}
    else{t.hp=Math.max(0,t.hp-d);api.updHPBar(t.bar,t.hp/t.maxHp);if(t.hp===0){t.dead=true;loseTickets(t.team,1);credit(team,by,'kills');VS.teams[t.team].stats.deaths++;respawns.push({kind:'infantry',team:t.team,index:t.index,at:VS.time+10});api.spawnParticles(center(t),0xb5ad8c,5,3,.4);disposeMesh(t.mesh);}}
  }
  function heroDown(h,killer,by){if(h.vsDown)return;h.vsDown=true;h.dead=true;h.hp=0;h.vsDeaths=(h.vsDeaths||0)+1;h.respawnT=R.respawnBase;h.inVehicle=null;h.mesh.visible=false;h.bfReload=null;loseTickets(h.team,2);seatOf(h).stats.deaths++;VS.teams[h.team].stats.deaths++;if(killer&&killer!==h.team)credit(killer,by,'kills');if(h===VS.local)api.showMsg('阵亡：8秒后部署。可在部署面板改兵种或选择已占领据点',3);}
  // Flow fields on one static 6m grid avoid per-soldier A* spikes. Collision is
  // still checked at movement time; diagonal edges cannot cut building corners.
  const STEP=6,NX=49,NZ=54,X0=-144,Z0=741;
  const gridPos=i=>({x:X0+(i%NX)*STEP,z:Z0+Math.floor(i/NX)*STEP});
  const cell=p=>clamp(Math.round((p.z-Z0)/STEP),0,NZ-1)*NX+clamp(Math.round((p.x-X0)/STEP),0,NX-1);
  let walk=null;
  function field(goal){
    if(!walk){walk=new Uint8Array(NX*NZ);for(let i=0;i<walk.length;i++){const p=gridPos(i);walk[i]=api.collideWalls(p.x,p.z,2.4,0)?0:1;}}
    let target=cell(goal);if(!walk[target]){let best=Infinity;for(let i=0;i<walk.length;i++)if(walk[i]){const p=gridPos(i),d=Math.hypot(p.x-goal.x,p.z-goal.z);if(d<best){best=d;target=i;}}}
    if(flows.has(target))return flows.get(target);const dist=new Int16Array(NX*NZ);dist.fill(32767);const queue=[target];dist[target]=0;
    for(let q=0;q<queue.length;q++){const i=queue[q],x=i%NX,z=Math.floor(i/NX);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const xx=x+dx,zz=z+dz,j=zz*NX+xx;if(xx<0||xx>=NX||zz<0||zz>=NZ||!walk[j]||dist[j]!==32767)continue;if(dx&&dz&&(!walk[z*NX+xx]||!walk[zz*NX+x]))continue;dist[j]=dist[i]+1;queue.push(j);}}
    flows.set(target,dist);return dist;
  }
  function steering(p,goal,r=.65,fly=false){
    let dx=goal.x-p.x,dz=goal.z-p.z,d=Math.hypot(dx,dz);if(d<3)return {x:0,z:0};
    const direct=!api.collideWalls(p.x+dx/d*3,p.z+dz/d*3,r,p.y||0);
    if(!fly&&(!direct||d>12)){const dist=field(goal),at=cell(p),x=at%NX,z=Math.floor(at/NX);let best=null,score=Infinity;for(let zz=Math.max(0,z-1);zz<=Math.min(NZ-1,z+1);zz++)for(let xx=Math.max(0,x-1);xx<=Math.min(NX-1,x+1);xx++){const i=zz*NX+xx;if(i===at||!walk[i])continue;const q=gridPos(i);if(api.collideWalls((p.x+q.x)/2,(p.z+q.z)/2,r,0))continue;const cost=dist[i]*STEP+Math.hypot(q.x-p.x,q.z-p.z)*.2;if(cost<score){best=q;score=cost;}}if(best&&score<190000){dx=best.x-p.x;dz=best.z-p.z;d=Math.hypot(dx,dz);}}
    if(d<.1)return {x:0,z:0};const x=dx/d,z=dz/d;if(fly||!api.collideWalls(p.x+x*1.5,p.z+z*1.5,r,0))return {x,z};for(const a of [.8,-.8,1.6,-1.6,2.4,-2.4]){const xx=x*Math.cos(a)-z*Math.sin(a),zz=x*Math.sin(a)+z*Math.cos(a);if(!api.collideWalls(p.x+xx*2,p.z+zz*2,r,0))return {x:xx,z:zz};}return {x:0,z:0};
  }
  function objective(team,index,p,order='auto'){
    const explicit=VS.points.find(q=>q.id===order);if(explicit)return explicit;
    const candidates=VS.points.filter(q=>q.owner!==team||q.contested);if(!candidates.length)return VS.points[index%3];
    return candidates.map(q=>({q,s:Math.hypot(q.x-p.x,q.z-p.z)+(q.id===VS.points[index%3].id?-45:0)})).sort((a,b)=>a.s-b.s)[0].q;
  }
  function targetFor(o,range){const from=center(o);let best=null,bd=range;for(const t of hostiles(o.team)){const d=from.distanceTo(center(t));if(d<bd&&visible(from,center(t))){best=t;bd=d;}}return best;}
  function aiHeroInput(h){
    const empty={x:0,z:0,yaw:h.yaw||0,edges:[],autoFire:false,autoAim:true,fire:false,run:false};if(!VS.active||h.dead)return empty;
    const s=seatOf(h),v=h.inVehicle,range=v?v.cfg.range:BF_WEAPONS[h.curWeapon]?.range||55,goal=objective(h.team,s.idx,h.pos,s.order);
    h.bfThink=(h.bfThink||0)-.025;if(h.bfThink<=0||!alive(h.bfTarget)){h.bfTarget=targetFor(v||h,range);h.bfThink=VS_AI[s.ai||'normal'].reaction;}const target=h.bfTarget,dist=target?h.pos.distanceTo(posOf(target)):Infinity;
    let dest=goal;if(h.hp<30&&!v)dest=hqPos(h.team);let move=steering(h.pos,dest,v?2.4:.65,!!v?.cfg.fly);
    if(target&&dist<range*.65&&Math.hypot(goal.x-h.pos.x,goal.z-h.pos.z)<16)move={x:0,z:0};
    const edges=[];if(!v&&s.idx%2===0){const car=api.vehicles.find(v=>v.team===h.team&&!v.dead&&!driverOf(v)&&v.kind!=='heli'&&posOf(v).distanceTo(h.pos)<5);if(car)edges.push('interact');}
    if(h.bfAmmo?.[h.curWeapon]===0)reload(h);if(h.hp<70||s.kit==='engineer')support(h);
    const to=target?posOf(target):{x:h.pos.x+move.x,z:h.pos.z+move.z};return {...empty,...move,yaw:Math.atan2(to.x-h.pos.x,to.z-h.pos.z),fire:!!target&&dist<range,run:!target,edges,rise:!!v?.cfg.fly&&v.alt<9};
  }
  function updateUnit(u,dt){
    u.cd-=dt;u.retarget-=dt;const w=BF_WEAPONS[u.weapon];if(u.retarget<=0||!alive(u.target)){u.target=targetFor(u,w.range);u.retarget=VS_AI[VS.difficulty].reaction;}
    const goal=objective(u.team,u.index,u.pos),target=u.target,dist=target?u.pos.distanceTo(posOf(target)):Infinity;
    const move=target&&dist<w.range*.65&&Math.hypot(goal.x-u.pos.x,goal.z-u.pos.z)<18?{x:0,z:0}:steering(u.pos,goal);
    u.moving=!!(move.x||move.z);if(u.moving){const speed=7;const nx=u.pos.x+move.x*speed*dt,nz=u.pos.z+move.z*speed*dt;if(!api.collideWalls(nx,nz,.65,0))u.pos.set(nx,0,nz);u.anim+=dt*10;}
    const to=target?posOf(target):{x:u.pos.x+move.x,z:u.pos.z+move.z};u.mesh.rotation.y=Math.atan2(to.x-u.pos.x,to.z-u.pos.z);u.mesh.userData.legs.forEach((l,i)=>l.rotation.x=u.moving?Math.sin(u.anim+i*Math.PI)*.65:0);
    if(u.reloading>0){u.reloading-=dt;if(u.reloading<=0)u.ammo=w.mag;return;}
    if(!target||u.cd>0||dist>w.range)return;if(!u.ammo){u.reloading=w.reload;return;}u.ammo--;u.cd=w.rate;const from=center(u).add(new T.Vector3(Math.sin(u.mesh.rotation.y)*.7,.1,Math.cos(u.mesh.rotation.y)*.7)),toPoint=center(target);
    api.fireBullet(from,toPoint.clone().sub(from),{...w,spread:Math.max(w.spread,VS_AI[VS.difficulty].accuracy),team:u.team,src:'unit',dmg:w.dmg*.75},true,w.arc?toPoint:null);
  }
  function updateVehicle(v,dt){
    if(v.noEnter>0)v.noEnter-=dt;if(v.mesh.userData.rotor)v.mesh.userData.rotor.rotation.y+=dt*(driverOf(v)?28:3);if(v.mesh.userData.tailRotor)v.mesh.userData.tailRotor.rotation.x+=dt*35;
    const human=humans().some(h=>h.inVehicle===v&&!h.dead);if(human)return;
    if(!v.bfDriver&&VS.time>=v.bfAIStart){v.bfDriver={team:v.team};v.bfAIStart=Infinity;}
    if(!v.bfDriver){if(v.cfg.fly){v.alt=Math.max(0,v.alt-dt*5);v.mesh.position.y=v.alt;}return;}
    const goal=objective(v.team,v.homeIndex,v.mesh.position),move=steering(v.mesh.position,goal,2.4,!!v.cfg.fly);v.moving=!!(move.x||move.z);
    if(v.moving){const speed=v.cfg.speed*.7,nx=v.mesh.position.x+move.x*speed*dt,nz=v.mesh.position.z+move.z*speed*dt;if(v.cfg.fly||!api.collideWalls(nx,nz,2.4,0)){v.mesh.position.x=nx;v.mesh.position.z=nz;}const yaw=Math.atan2(move.x,move.z);v.yaw+=clamp(Math.atan2(Math.sin(yaw-v.yaw),Math.cos(yaw-v.yaw)),-dt*1.6,dt*1.6);v.mesh.rotation.y=v.yaw;}
    if(v.cfg.fly){v.alt=Math.min(10,v.alt+dt*3);v.mesh.position.y=Math.max(0,api.fortress.topAt(v.mesh.position.x,v.mesh.position.z))+v.alt;}
    v.bfThink=(v.bfThink||0)-dt;if(v.bfThink<=0||!alive(v.bfTarget)){v.bfTarget=targetFor(v,v.cfg.range);v.bfThink=.6;}v.fireCd-=dt;
    const target=v.bfTarget;if(target&&v.fireCd<=0){v.fireCd=v.cfg.rate;const dir=center(target).sub(center(v)).normalize();api.vehicleAim(v,dir);const from=api.vehicleMuzzle(v);api.fireBullet(from,center(target).sub(from),{dmg:v.cfg.dmg*.7,range:v.cfg.range,speed:90,spread:.06,explode:v.cfg.explode,color:0xffcb82,team:v.team,src:'vehicle'},true);}
  }
  function updateFlags(){for(const p of VS.points){const f=map?.flags.find(f=>f.id===p.id);if(f){f.cloth.material.color.set(TEAM_CSS[p.owner||'neutral']);f.ring.material.color.set(TEAM_CSS[p.owner||'neutral']);}}}
  function capture(dt){
    const units=[...humans().filter(h=>!h.inVehicle),...VS.units,...api.vehicles.filter(v=>driverOf(v)&&!v.cfg.fly)];
    for(const p of VS.points){const count={blue:0,red:0},inside=[];for(const u of units)if(alive(u)&&u.team&&posOf(u).y<4&&Math.hypot(posOf(u).x-p.x,posOf(u).z-p.z)<R.captureRadius){count[u.team]++;if(u.vsType==='hero')inside.push(u);}p.count=count;p.contested=count.blue>0&&count.red>0;
      if(p.contested||!count.blue&&!count.red)continue;const team=count.blue?'blue':'red',sgn=sign(team),old=p.owner;p.progress=clamp(p.progress+sgn*dt/R.captureSeconds*Math.min(2,count[team]),-1,1);
      if(old&&Math.sign(p.progress)!==sign(old))p.owner=null;if(p.progress>=1)p.owner='blue';if(p.progress<=-1)p.owner='red';
      if(p.owner&&p.owner!==old){VS.teams[p.owner].stats.captures++;for(const h of inside)if(h.team===p.owner)seatOf(h).stats.captures++;api.showMsg(TEAM_NAME[p.owner]+'占领 '+p.id+' · '+p.name,2);}
    }updateFlags();
  }
  function teamSummary(team){return {...VS.teams[team].stats,tickets:Math.ceil(VS.teams[team].tickets)};}
  function endMatch(winner,reason){if(VS.over)return;VS.over=true;VS.result={winner,reason,time:VS.time,size:VS.size,mode:VS.mode,difficulty:VS.difficulty,tickets:Object.fromEntries(TEAMS.map(t=>[t,Math.ceil(VS.teams[t].tickets)])),stats:Object.fromEntries(TEAMS.map(t=>[t,teamSummary(t)])),seats:VS.seats.map(s=>({pid:s.pid,team:s.team,name:s.name,ai:s.ai,kit:s.kit,...s.stats}))};api.onEnd(VS.result);}
  function surrender(pid){const s=VS.seatById[pid];if(!s||VS.time<R.surrenderAfter)return '开局一分钟后可投降';s.surrender=true;const real=members(s.team).filter(s=>!s.ai);if(real.every(s=>s.surrender))endMatch(opp(s.team),TEAM_NAME[s.team]+'投降');return '';}
  function update(dt){
    if(!VS.active||VS.over||VS.role==='guest')return;VS.time+=dt;VS.frame++;
    for(const h of humans()){h.grenadeCd=Math.max(0,(h.grenadeCd||0)-dt);h.bfSupportCd=Math.max(0,(h.bfSupportCd||0)-dt);if(h.bfReload){h.bfReload.left-=dt;if(h.bfReload.left<=0){h.bfAmmo[h.bfReload.id]=BF_WEAPONS[h.bfReload.id].mag;h.bfReload=null;}}if(h.dead&&!h.vsDown)heroDown(h);if(!h.dead&&h.pos.distanceTo(hqPos(h.team))<20){h.hp=Math.min(h.maxHp,h.hp+12*dt);api.updHPBar(h.bar,h.hp/h.maxHp);}}
    for(const u of VS.units)if(!u.dead)updateUnit(u,dt);VS.units=VS.units.filter(u=>!u.dead);for(const v of [...api.vehicles])if(!v.dead)updateVehicle(v,dt);
    capture(dt);VS.bleed=(VS.bleed||0)+dt;if(VS.bleed>=3){VS.bleed-=3;for(const team of TEAMS){const n=VS.points.filter(p=>p.owner===team).length;if(n>=2)loseTickets(opp(team),n===3?4:2);}}
    for(let i=respawns.length-1;i>=0;i--){const r=respawns[i];if(VS.time<r.at)continue;respawns.splice(i,1);if(r.kind==='infantry'){const p=VS.points.find(p=>p.owner===r.team&&!p.contested);spawnInfantry(r.team,r.index,p?freeNear(p,6):null);}else spawnVehicle(r.team,r.type,r.index);}
    const b=VS.teams.blue.tickets,r=VS.teams.red.tickets;if(b<=0||r<=0)endMatch(b===r?null:b>r?'blue':'red','敌方兵力耗尽');else if(VS.time>=R.limit)endMatch(b===r?null:b>r?'blue':'red','时间到，比较剩余兵力票');
  }
  function snapshot(){return {protocol:'conquest-1',m:VS.matchId,t:+VS.time.toFixed(2),over:VS.over,res:VS.result,mode:VS.mode,diff:VS.difficulty,size:VS.size,teams:VS.teams,
    points:VS.points.map(p=>({id:p.id,owner:p.owner,progress:+p.progress.toFixed(3),contested:p.contested,count:p.count})),seats:VS.seats,
    roster:humans().map(h=>[h.slot,h.vsPid,h.cls||'gunner',h.vsAI?1:0,h.vsName||'']),
    u:VS.units.filter(alive).map(u=>[u.id,u.team,u.index,u.weapon,+u.pos.x.toFixed(2),+u.pos.z.toFixed(2),+u.mesh.rotation.y.toFixed(2),Math.ceil(u.hp),u.moving?1:0]),
    w:Object.fromEntries(humans().map(h=>[h.slot,{weapons:h.vsWeapons,kit:h.bfKit,ammo:h.bfAmmo,reload:h.bfReload,cd:h.bfSupportCd}]))};}
  function apply(data){
    if(!data||data.protocol!=='conquest-1')return;if(!VS.active||data.m!==VS.matchId){api.onGuestMatch(data);if(!VS.active)return;}
    VS.time=data.t;VS.mode=data.mode;VS.difficulty=data.diff;VS.teams=data.teams;for(const s of data.seats){const seat=VS.seatById[s.pid];if(seat)Object.assign(seat,s);}for(const p of data.points)Object.assign(VS.points.find(x=>x.id===p.id),p);updateFlags();
    for(const h of humans()){const row=data.w[h.slot];if(!row)continue;h.vsWeapons=row.weapons;h.bfKit=row.kit;h.bfAmmo=row.ammo;h.bfReload=row.reload;h.bfSupportCd=row.cd;if(h.mesh?.userData.bfWeapon!==h.curWeapon)api.setMilitaryHero(h,h.team,h.curWeapon);if(h===VS.local)api.setLocalWeapons(h.vsWeapons);}
    for(const team of TEAMS)VS.hq[team].hp=VS.teams[team].tickets;
    const seen=new Set();for(const [id,team,index,weapon,x,z,yaw,hp,moving] of data.u){seen.add(id);let u=VS.guestUnits.get(id);if(!u){const mesh=militarySoldier(T,team,weapon);scene.add(mesh);u={id,team,index,weapon,mesh,pos:mesh.position,anim:0};u.bar=api.makeHPBar(1.5,TEAM_CSS[team]);u.bar.position.y=2.4;mesh.add(u.bar);VS.guestUnits.set(id,u);mesh.position.set(x,0,z);}u.target={x,z,yaw};u.hp=hp;u.moving=!!moving;api.updHPBar(u.bar,hp/100);}
    for(const [id,u] of VS.guestUnits)if(!seen.has(id)){disposeMesh(u.mesh);VS.guestUnits.delete(id);}
    if(data.over&&!VS.over){VS.over=true;VS.result=data.res;api.onEnd(data.res);}else if(!data.over)VS.over=false;
  }
  function guestFrame(dt){for(const u of VS.guestUnits.values()){const k=Math.min(1,dt*14);u.pos.x+=(u.target.x-u.pos.x)*k;u.pos.z+=(u.target.z-u.pos.z)*k;u.mesh.rotation.y=u.target.yaw;u.anim+=dt*10;u.mesh.userData.legs.forEach((l,i)=>l.rotation.x=u.moving?Math.sin(u.anim+i*Math.PI)*.65:0);}for(const v of api.vehicles){if(v.mesh.userData.rotor)v.mesh.userData.rotor.rotation.y+=dt*25;}}
  function handleCommand(h,c){if(!VS.active||!h?.team)return false;switch(c.kind){case 'bfKit':chooseKit(h,c.id);break;case 'bfSpawn':chooseSpawn(h,c.id);break;case 'bfReload':reload(h);break;case 'bfSupport':support(h);break;case 'bfOrder':if(['auto','A','B','C'].includes(c.id))seatOf(h).order=c.id;break;case 'weapon':case 'vsWeapon':chooseWeapon(h,c.id);break;case 'vsSurrender':surrender(h.vsPid);break;case 'vsSend':case 'vsBank':case 'vsGive':case 'build':case 'demolish':case 'buy':case 'upgrade':return true;default:return false;}return true;}
  function drawRadar(ctx,W,H,centerPos,camYaw,heading){
    const sc=W/340,c=W/2;const to=(x,z)=>[c+x*sc,c+(z-900)*sc];ctx.clearRect(0,0,W,H);ctx.fillStyle='rgba(24,33,32,.87)';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#777867';ctx.lineWidth=5;
    for(const x of [-72,0,72]){const a=to(x,745),b=to(x,1055);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}for(const z of [818,900,982]){ctx.beginPath();ctx.moveTo(...to(-120,z));ctx.lineTo(...to(120,z));ctx.stroke();}
    for(const s of VS.solids){const p=to(s.x,s.z);ctx.fillStyle='#a1977c';ctx.fillRect(p[0]-(s.hw||s.r)*sc,p[1]-(s.hd||s.r)*sc,(s.hw||s.r)*2*sc,(s.hd||s.r)*2*sc);}
    const dot=(p,r,color)=>{const q=to(p.x,p.z);ctx.fillStyle=color;ctx.beginPath();ctx.arc(q[0],q[1],r,0,Math.PI*2);ctx.fill();};
    for(const p of VS.points){dot(p,9,TEAM_CSS[p.owner||'neutral']);const q=to(p.x,p.z);ctx.fillStyle='#172020';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(p.id,q[0],q[1]+4);}
    for(const t of TEAMS)dot(hqPos(t),6,TEAM_CSS[t]);for(const u of VS.role==='guest'?VS.guestUnits.values():VS.units)if(!u.dead)dot(posOf(u),1.8,TEAM_CSS[u.team]);for(const v of api.vehicles)if(!v.dead)dot(v.mesh.position,3.5,TEAM_CSS[v.team]);for(const h of humans())if(!h.dead)dot(h.pos,3,TEAM_CSS[h.team]);dot(centerPos,4,'#fff');
  }
  const unavailable=()=> '据点战使用固定装备与地图设施';
  return {state:VS,get active(){return VS.active;},get size(){return VS.size;},get over(){return VS.over;},prepare,start,stop,update,setAI,clearAI,setLocal,setupHero,placeHero,respawned,heroDown,damage,aimTargets,beamHits,bulletStep,explodeAt,aiHeroInput,snapshot,apply,guestFrame,handleCommand,drawRadar,
    seat:pid=>VS.seatById[pid],seatOf,members,seatName,heroOfSeat,heroOf:t=>humans().find(h=>h.team===t),hq:t=>VS.hq[t],team:t=>VS.teams[t],teamSummary,fmtTime,surrender,chooseKit,chooseSpawn,chooseWeapon,reload,canShoot,support,enterReason,takeVehicle,visible,steering,
    kits:BF_KITS,weapons:BF_WEAPONS,vehicleTypes:BF_VEHICLES,grenadeCooldown:()=>R.grenadeCd,zoneReason:unavailable,build:unavailable,demolish:unavailable,
    paths:()=>VS.points.map(p=>[hqPos('blue'),p,hqPos('red')])};
}

// Side missions preserve campaign progress and clean up their temporary geometry.
export const OPERATIONS=[
  {id:'depot',name:'失落补给站',type:'clear',chapter:1,brief:'清除 18 只守军，夺回补给。',x:-48,z:105,total:18,reward:450},
  {id:'signal',name:'信标守夜',type:'hold',chapter:1,brief:'在蓝圈内累计坚守 60 秒，离开暂停计时。',x:48,z:175,total:36,duration:60,reward:650},
  {id:'hunter',name:'精英巢穴',type:'clear',chapter:1,brief:'消灭护卫与两只小首领，清空巢穴。',x:0,z:225,total:14,reward:850},
  {id:'rescue',name:'难民撤离',type:'rescue',chapter:2,brief:'靠近三名幸存者，带他们回蓝色撤离圈；远离会停步。',x:0,z:42,total:24,reward:750,medkits:2},
  {id:'eggs',name:'虫卵清剿',type:'eggs',chapter:2,brief:'射击摧毁六枚虫卵；90 秒后残存虫卵孵化，必须清除幼虫。',x:28,z:156,total:20,reward:900},
  {id:'convoy',name:'运输线保卫',type:'convoy',chapter:3,brief:'护送运输车抵达前方蓝圈；靠近才行驶，清除贴近车身的虫群。',x:0,z:65,total:32,reward:1100,medkits:1},
  {id:'toxic',name:'毒雾采集',type:'toxic',chapter:3,brief:'在三个紫色样本旁停留 3 秒采集，再回蓝圈撤离；毒区持续掉血。',x:-25,z:195,total:26,reward:1050,medkits:3},
  {id:'outposts',name:'前哨争夺',type:'capture',chapter:4,brief:'依次占领三个信标，每处坚守 15 秒；近处有敌人时占领暂停。',x:0,z:100,total:36,reward:1300},
  {id:'mother',name:'母巢突袭',type:'assault',chapter:5,brief:'先射击摧毁三个护盾节点，再击败母巢首领。',x:0,z:254,total:28,reward:1800}
];
export const OP_DIFFICULTIES=[
  {id:'normal',name:'普通',chapter:1,hp:1,dmg:1,reward:1},
  {id:'hard',name:'困难',chapter:3,hp:1.5,dmg:1.3,reward:1.5},
  {id:'nightmare',name:'噩梦',chapter:6,hp:2.1,dmg:1.65,reward:2.2}
];
export const OP_COMPLETION_KEYS=OPERATIONS.reduce((keys,o)=>keys.concat(OP_DIFFICULTIES.map(d=>d.id==='normal'?o.id:o.id+'_'+d.id)),[]);
export function createOperations(c){
  const {Game,player,monsters,squad,THREE,scene}=c;
  let active=null,selectedDifficulty='normal',page=0;
  const owned=new Set(),resources=new Set();
  const stamp=()=>Game.loop+':'+Game.chapter;
  const unlocked=n=>Game.loop>1||Game.chapter>=n;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
  const clear=()=>{active=null;for(const o of owned)o.removeFromParent();owned.clear();for(const r of resources)r.dispose();resources.clear();};
  const own=r=>(resources.add(r),r);
  function mesh(geometry,color){return new THREE.Mesh(own(geometry),own(new THREE.MeshLambertMaterial({color})));}
  function locate(x,z){return c.findFreeSpot(x,z)||{x,z};}
  function put(o,p){o.position.set(p.x,c.groundY(p.x,p.z),p.z);return o;}
  function prop(kind,p,color){
    const root=new THREE.Group();
    if(kind==='person'){
      const body=mesh(new THREE.CylinderGeometry(.3,.38,1,7),color);body.position.y=.85;root.add(body);
      const head=mesh(new THREE.SphereGeometry(.27,8,6),0xe1c7a4);head.position.y=1.62;root.add(head);
    }else if(kind==='truck'){
      const body=mesh(new THREE.BoxGeometry(2.3,1.4,4.2),color);body.position.y=1.35;root.add(body);
      const cab=mesh(new THREE.BoxGeometry(2,1.1,1.2),0xc5e9ed);cab.position.set(0,2.1,1.4);root.add(cab);
      for(const x of [-1.2,1.2])for(const z of [-1.3,1.3]){const wheel=mesh(new THREE.CylinderGeometry(.55,.55,.35,8),0x17202b);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.55,z);root.add(wheel);}
    }else{
      const body=mesh(kind==='egg'?new THREE.SphereGeometry(1,12,8):new THREE.OctahedronGeometry(1,0),color);body.position.y=1.3;body.scale.set(1,kind==='egg'?1.5:2,1);root.add(body);
    }
    put(root,p);scene.add(root);owned.add(root);return root;
  }
  function ring(p,r,color){
    const g=own(new THREE.RingGeometry(r-.16,r,48));g.rotateX(-Math.PI/2);
    const a=g.attributes.position;for(let i=0;i<a.count;i++)a.setY(i,c.groundY(p.x+a.getX(i),p.z+a.getZ(i))+.12);g.computeBoundingSphere();
    const m=new THREE.Mesh(g,own(new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false})));
    m.position.set(p.x,0,p.z);scene.add(m);owned.add(m);return m;
  }
  function spawn(kind,p,opts={}){
    const m=c.spawnMonster(kind,p.x,p.z,{wild:true,quiet:true,...opts});
    m.hp=m.maxHp=m.maxHp*active.difficulty.hp;m.dmg*=active.difficulty.dmg;return m;
  }
  function target(p,kind){
    const m=spawn('mob',p,{elite:false});
    // Reuse combat hit testing and automatic aim; stationary objectives skip monster AI.
    m.operationStatic=true;m.fly=false;m.split=false;m.explodeOnDie=false;m.stealth=false;m.elite=null;m.bs=null;m.gold=0;m.speed=0;
    m.hp=m.maxHp=(kind==='egg'?100:240)*active.difficulty.hp*(1+(Game.chapter-1)*.12);m.radius=1.3;m.hitH=1.3;
    for(const child of m.mesh.children)child.visible=child===m.bar;
    put(m.mesh,m.mesh.position);m.bar.position.y=3.5;
    const visual=prop(kind,m.mesh.position,kind==='egg'?0x9db94b:0xd469dd);visual.removeFromParent();m.mesh.add(visual);visual.position.set(0,0,0);
    m.mesh.scale.setScalar(1);return m;
  }
  const button=(text,fn,disabled=false)=>{const b=document.createElement('button');b.className='mbtn';b.textContent=text;b.disabled=disabled;b.onclick=fn;return b;};
  function open(){
    if(Game.testMode||!['prep','paused','battle'].includes(Game.state)){c.showMsg('请在普通游戏的准备阶段选择副本');return;}
    c.openPanel();const list=document.getElementById('operationsList');list.replaceChildren();
    const info=document.getElementById('operationsInfo');
    if(active){info.textContent=active.cfg.name+' · '+active.difficulty.name+'：'+active.cfg.brief;list.appendChild(button('撤离副本，返回基地（无通关奖励）',()=>finish(false)));return;}
    if(!unlocked(OP_DIFFICULTIES.find(d=>d.id===selectedDifficulty).chapter))selectedDifficulty='normal';
    info.textContent='9 个副本随章节解锁；每章每种难度首次完成领奖。可带小队，载具留在基地，主线进度保留。';
    const levels=document.createElement('div');levels.className='btnRow';
    for(const d of OP_DIFFICULTIES){const b=button(d.name+(unlocked(d.chapter)?' · 奖励×'+d.reward:' · 第'+d.chapter+'章解锁'),()=>{selectedDifficulty=d.id;open();},!unlocked(d.chapter));b.setAttribute('aria-pressed',String(d.id===selectedDifficulty));levels.appendChild(b);}list.appendChild(levels);
    const d=OP_DIFFICULTIES.find(d=>d.id===selectedDifficulty);
    for(const cfg of OPERATIONS.slice(page*3,page*3+3)){
      const key=d.id==='normal'?cfg.id:cfg.id+'_'+d.id,done=(Game.opsCompleted||{})[key]===stamp();
      const reward=Math.round(cfg.reward*d.reward)+' 金币'+(cfg.medkits?' + 医疗包×'+cfg.medkits:'');
      const b=button(cfg.name+' · '+(unlocked(cfg.chapter)?cfg.brief:'第 '+cfg.chapter+' 章解锁。')+' '+(done?'本章已领奖，可重玩':'首通 '+reward),()=>start(cfg.id,d.id),!unlocked(cfg.chapter)||(Game.state==='paused'?Game.pausedFrom:Game.state)!=='prep');
      b.classList.add('operation-card');b.dataset.operation=cfg.id;list.appendChild(b);
    }
    const pager=document.createElement('div');pager.className='btnRow';pager.append(button('上一页',()=>{page--;open();},page===0));
    const label=document.createElement('span');label.textContent=(page+1)+' / 3';label.className='small';pager.append(label,button('下一页',()=>{page++;open();},page===2));list.appendChild(pager);
  }
  function start(id,difficultyId='normal'){
    const cfg=OPERATIONS.find(o=>o.id===id),difficulty=OP_DIFFICULTIES.find(d=>d.id===difficultyId),state=Game.state==='paused'?Game.pausedFrom:Game.state;
    if(!cfg||!difficulty||active||Game.testMode||state!=='prep'||!unlocked(cfg.chapter)||!unlocked(difficulty.chapter))return false;
    c.closePanels();document.getElementById('menuPause').classList.add('hidden');c.autoSave();
    if(player.inVehicle)c.exitVehicle();c.clearEntities(false);
    const p=locate(cfg.x,cfg.z);player.pos.set(p.x,c.groundY(p.x,p.z),p.z);player.mesh.position.copy(player.pos);player.invulnerable=3;player.dashT=0;
    squad.forEach((s,i)=>{const q=locate(p.x+(i-1.5)*3,p.z-5);put(s.mesh,q);s.patrol={...q};s.patrolTimer=0;});
    active={cfg,difficulty,center:p,timer:.5,spawned:0,held:0,elapsed:0,stage:0,objects:[],previousOrder:Game.squadOrder};Game.state='battle';
    const a=active;a.marker=ring(p,cfg.type==='hold'?24:6,0x65d7ff);
    if(cfg.type==='rescue')for(const [x,z] of [[-18,16],[0,24],[18,16]]){const q=locate(p.x+x,p.z+z);a.objects.push({mesh:prop('person',q,0xefc65c),hp:100,joined:false,safe:false,ring:ring(q,3,0xefc65c)});}
    if(cfg.type==='convoy'){a.end={x:p.x,z:p.z+50};a.objects.push({mesh:prop('truck',p,0x538b9c),hp:300});ring(a.end,6,0x65d7ff);}
    if(['eggs','assault','toxic','capture'].includes(cfg.type)){
      const n=cfg.type==='eggs'?6:3;
      for(let i=0;i<n;i++){
        const q=locate(p.x+Math.sin(i*2*Math.PI/n+Math.PI/3)*16,p.z+18+Math.cos(i*2*Math.PI/n+Math.PI/3)*13);
        if(cfg.type==='eggs'||cfg.type==='assault')a.objects.push({enemy:target(q,cfg.type==='eggs'?'egg':'node'),hatched:false});
        else a.objects.push({mesh:prop('node',q,cfg.type==='toxic'?0xb677db:0x66cbd8),ring:ring(q,cfg.type==='toxic'?7:6,cfg.type==='toxic'?0xad58d6:0x65d7ff),held:0,done:false});
      }
    }
    document.getElementById('readyBtn').classList.add('hidden');c.showHUD();c.resetCamera();
    c.showHint(cfg.name+'：'+cfg.brief+' · 菜单 /「副本」可撤离');c.showMsg('出发：'+cfg.name+' · '+difficulty.name,3);return true;
  }
  function finish(won,reason=''){
    if(!active)return;
    const a=active,cfg=a.cfg,key=a.difficulty.id==='normal'?cfg.id:cfg.id+'_'+a.difficulty.id,first=(Game.opsCompleted||{})[key]!==stamp();
    c.collectAllGold();c.clearEntities(false);clear();c.closePanels();document.getElementById('menuPause').classList.add('hidden');
    const reward=Math.round(cfg.reward*a.difficulty.reward);
    if(won&&first){Game.opsCompleted[key]=stamp();Game.gold+=reward;Game.score+=reward;Game.items.medkit+=cfg.medkits||0;}
    player.reset(Game.cls);player.invulnerable=3;
    squad.forEach((s,i)=>{const p=locate(player.pos.x+(i-1.5)*3,player.pos.z+5);put(s.mesh,p);s.patrol={...p};s.patrolTimer=0;});
    c.startPrep();c.resetCamera();c.showMsg(won?cfg.name+' 完成！'+(first?'奖励 '+reward+' 金币'+(cfg.medkits?'、医疗包×'+cfg.medkits:''):'本章该难度奖励已领取'):(reason||'已撤离')+'，返回基地，主线进度保留',4);c.autoSave();
  }
  function travel(o,to,speed,dt){
    const p=o.mesh.position,d=distance(p,to);if(d<.2)return;
    const step=Math.min(d,speed*dt),dx=(to.x-p.x)/d,dz=(to.z-p.z)/d;
    for(const angle of [0,.7,-.7,1.3,-1.3]){
      const vx=dx*Math.cos(angle)-dz*Math.sin(angle),vz=dz*Math.cos(angle)+dx*Math.sin(angle),x=p.x+vx*step,z=p.z+vz*step;
      if(c.canWalk(x,z,.6)){put(o.mesh,{x,z});o.mesh.rotation.y=Math.atan2(vx,vz);return;}
    }
  }
  function update(dt){
    if(!active)return false;
    if(player.dead){finish(false,'行动失败');return true;}
    const a=active,cfg=a.cfg;a.elapsed+=dt;a.timer-=dt;
    const live=()=>monsters.filter(m=>!m.dead),combat=()=>live().filter(m=>!m.operationStatic);
    if(a.spawned<cfg.total&&a.timer<=0&&live().length<20){
      const i=a.spawned++,angle=i*2.39996,focus=cfg.type==='convoy'?a.objects[0].mesh.position:a.center;
      spawn(cfg.id==='hunter'&&i>=cfg.total-2?'miniboss':'mob',locate(focus.x+Math.sin(angle)*22,focus.z+Math.cos(angle)*22),{elite:cfg.id==='hunter'&&i%4===0});a.timer=cfg.duration?2.2:2;
    }
    let status='',won=false,goal=a.center;
    if(cfg.type==='clear'){status='剩余 '+(cfg.total-a.spawned+live().length)+' / '+cfg.total;won=a.spawned>=cfg.total&&live().length===0;}
    if(cfg.type==='hold'){const inside=distance(player.pos,a.center)<=24;if(inside)a.held+=dt;status=Math.floor(a.held)+' / 60 秒'+(inside?'':' · 回到蓝圈');won=a.held>=60;}
    if(cfg.type==='rescue'||cfg.type==='convoy'){
      for(const o of a.objects){
        if(o.safe)continue;
        const nearby=combat().filter(m=>distance(m.mesh.position,o.mesh.position)<3+m.radius).length;
        o.hp=Math.max(0,o.hp-nearby*5*a.difficulty.dmg*dt);if(o.hp<=0){finish(false,cfg.type==='rescue'?'幸存者遇难':'运输车被摧毁');return true;}
        const close=distance(player.pos,o.mesh.position);
        if(cfg.type==='rescue'){
          if(close<5){o.joined=true;o.ring.visible=false;}
          if(o.joined&&close<13&&close>2.5)travel(o,player.pos,5,dt);
          if(o.joined&&distance(o.mesh.position,a.center)<6){o.safe=true;o.mesh.visible=false;}
        }else if(close<12&&nearby===0)travel(o,a.end,2.5,dt);
      }
      if(cfg.type==='rescue'){const safe=a.objects.filter(o=>o.safe).length,waiting=a.objects.find(o=>!o.joined);status='已撤离 '+safe+'/3 · 最低生命 '+Math.ceil(Math.min(...a.objects.map(o=>o.hp)))+'%';const lagging=a.objects.find(o=>!o.safe&&distance(o.mesh.position,player.pos)>=12);goal=waiting?waiting.mesh.position:lagging?lagging.mesh.position:a.center;won=safe===3;}
      else{const o=a.objects[0];status='运输车生命 '+Math.ceil(o.hp)+'/300 · 距终点 '+Math.ceil(distance(o.mesh.position,a.end))+'米'+(distance(player.pos,o.mesh.position)>=12?' · 靠近护送':' · 清除车旁虫群');goal=o.mesh.position;won=distance(o.mesh.position,a.end)<4;}
    }
    if(cfg.type==='eggs'){
      for(const o of a.objects)if(!o.enemy.dead&&!o.hatched&&a.elapsed>=90){const p=o.enemy.mesh.position.clone();o.enemy.dead=true;o.enemy.mesh.visible=false;o.hatched=true;o.enemy=spawn('mob',p,{elite:true});c.showMsg('虫卵孵化！清除幼虫才能完成',2);}
      const left=a.objects.filter(o=>!o.enemy.dead);goal=left.length?left[0].enemy.mesh.position:a.center;
      status='剩余目标 '+left.length+'/6 · '+(a.elapsed<90?'孵化倒计时 '+Math.ceil(90-a.elapsed)+'秒':'清除孵化幼虫');won=left.length===0;
    }
    if(cfg.type==='toxic'||cfg.type==='capture'){
      for(let i=0;i<a.objects.length;i++){
        const o=a.objects[i];if(o.done)continue;
        const d=distance(player.pos,o.mesh.position);
        if(cfg.type==='toxic'&&d<7){a.poison=(a.poison||0)+dt;if(a.poison>=1){c.playerDamage(3*a.difficulty.dmg);a.poison-=1;}}
        const contested=combat().some(m=>distance(m.mesh.position,o.mesh.position)<7);
        if(cfg.type==='toxic'?d<3:i===a.stage&&d<6&&!contested)o.held+=dt;
        if(o.held>=(cfg.type==='toxic'?3:15)){o.done=true;o.ring.material.color.setHex(0x5beba1);o.mesh.visible=false;if(cfg.type==='capture')a.stage++;}
      }
      if(player.dead){finish(false,'行动失败');return true;}
      const left=a.objects.filter(o=>!o.done);goal=left.length?left[0].mesh.position:a.center;
      status=cfg.type==='toxic'?'样本 '+(3-left.length)+'/3'+(left.length?' · 紫圈有毒，靠近样本采集':' · 回蓝圈撤离'):'已占领 '+a.stage+'/3'+(left.length?' · 当前 '+Math.floor(left[0].held)+'/15 秒，清敌后占领':'');
      won=left.length===0&&(cfg.type==='capture'||distance(player.pos,a.center)<6);
    }
    if(cfg.type==='assault'){
      const nodes=a.objects.filter(o=>!o.enemy.dead);
      if(!nodes.length&&!a.boss){a.boss=spawn('boss',locate(a.center.x,a.center.z+24));a.boss.operationBoss=true;c.showMsg('护盾解除，母巢首领出现！',3);}
      goal=nodes.length?nodes[0].enemy.mesh.position:a.boss.mesh.position;
      status=nodes.length?'护盾节点 '+nodes.length+'/3':'母巢首领 '+Math.max(0,Math.ceil(a.boss.hp))+'/'+Math.ceil(a.boss.maxHp);won=!!a.boss&&a.boss.dead;
    }
    if(won){finish(true);return true;}
    if(!['clear','hold'].includes(cfg.type)){
      const dx=goal.x-player.pos.x,dz=goal.z-player.pos.z,yaw=c.getYaw(),ahead=dx*Math.sin(yaw)+dz*Math.cos(yaw),right=dx*Math.cos(yaw)-dz*Math.sin(yaw);
      status+=' · 目标 '+Math.ceil(distance(player.pos,goal))+'米 '+(Math.abs(right)>Math.abs(ahead)?right>0?'→':'←':ahead>0?'↑':'↓');
    }
    document.getElementById('waveTxt').textContent=cfg.name+' · '+status;return true;
  }
  return {open,start,finish,update,clear,get active(){return active;}};
}

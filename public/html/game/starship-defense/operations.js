// Optional field instances use the existing terrain, with separate objectives and no campaign advancement.
export const OPERATIONS=[
  {id:'depot',name:'失落补给站',brief:'清除 18 只守军，夺回补给。',x:-48,z:105,total:18,reward:450},
  {id:'signal',name:'信标守夜',brief:'在信标 24 米内坚持 60 秒；离开范围停止计时。',x:48,z:175,total:36,duration:60,reward:650},
  {id:'hunter',name:'精英巢穴',brief:'消灭护卫与两只小首领，清空巢穴。',x:0,z:225,total:14,reward:850}
];
export function createOperations(c){
  const {Game,player,monsters,squad,THREE,scene}=c;let active=null,marker=null;
  const stamp=()=>Game.loop+':'+Game.chapter;
  const clear=()=>{active=null;if(marker){scene.remove(marker);marker.geometry.dispose();marker.material.dispose();marker=null;}};
  function open(){
    if(Game.testMode||!['prep','paused','battle'].includes(Game.state)){c.showMsg('请在普通游戏的准备阶段选择副本');return;}
    c.openPanel();const list=document.getElementById('operationsList');list.replaceChildren();
    document.getElementById('operationsInfo').textContent=active?'当前副本：'+active.cfg.name+'。可以退出返回基地，不发放通关奖励。':'准备阶段可带小队出发；载具停在基地。副本不推进主线，本章每个副本首次完成发放奖励。';
    if(active){const b=document.createElement('button');b.className='mbtn';b.textContent='撤离副本，返回基地';b.onclick=()=>finish(false);list.appendChild(b);return;}
    for(const cfg of OPERATIONS){const b=document.createElement('button');b.className='mbtn operation-card';b.textContent=cfg.name+' · '+cfg.brief+' '+((Game.opsCompleted||{})[cfg.id]===stamp()?'本章已完成（可重玩）':'首次奖励 '+cfg.reward+' 金币');b.disabled=(Game.state==='paused'?Game.pausedFrom:Game.state)!=='prep';b.onclick=()=>start(cfg.id);list.appendChild(b);}
  }
  function start(id){
    const cfg=OPERATIONS.find(x=>x.id===id),state=Game.state==='paused'?Game.pausedFrom:Game.state;
    if(!cfg||active||Game.testMode||state!=='prep')return false;
    c.closePanels();document.getElementById('menuPause').classList.add('hidden');c.autoSave();
    if(player.inVehicle)c.exitVehicle();c.clearEntities(false);
    const p=c.findFreeSpot(cfg.x,cfg.z)||{x:cfg.x,z:cfg.z};
    player.pos.set(p.x,c.groundY(p.x,p.z),p.z);player.mesh.position.copy(player.pos);player.invulnerable=3;player.dashT=0;
    squad.forEach((s,i)=>{const q=c.findFreeSpot(p.x+(i-1.5)*3,p.z-5)||p;s.mesh.position.set(q.x,c.groundY(q.x,q.z),q.z);s.patrol={x:q.x,z:q.z};s.patrolTimer=0;});
    active={cfg,center:p,timer:.5,spawned:0,held:0,previousOrder:Game.squadOrder};Game.squadOrder='follow';Game.state='battle';
    const ring=new THREE.RingGeometry(23.7,24,64);ring.rotateX(-Math.PI/2);
    const points=ring.attributes.position;
    for(let i=0;i<points.count;i++)points.setY(i,c.groundY(p.x+points.getX(i),p.z+points.getZ(i))+.08);
    points.needsUpdate=true;ring.computeBoundingSphere();
    marker=new THREE.Mesh(ring,new THREE.MeshBasicMaterial({color:0x65d7ff,transparent:true,opacity:.65,side:THREE.DoubleSide}));
    marker.position.set(p.x,0,p.z);scene.add(marker);
    document.getElementById('readyBtn').classList.add('hidden');c.showHUD();c.resetCamera();
    c.showHint(cfg.name+'：'+cfg.brief+' · 暂停菜单 / 右侧「副本」可撤离');c.showMsg('出发：'+cfg.name,3);return true;
  }
  function finish(won){
    if(!active)return;
    const cfg=active.cfg,order=active.previousOrder,first=(Game.opsCompleted||{})[cfg.id]!==stamp();
    c.collectAllGold();clear();Game.squadOrder=order;c.closePanels();document.getElementById('menuPause').classList.add('hidden');
    if(won&&first){Game.opsCompleted[cfg.id]=stamp();Game.gold+=cfg.reward;Game.score+=cfg.reward;}
    c.clearEntities(false);player.reset(Game.cls);player.invulnerable=3;
    squad.forEach((s,i)=>{const p=c.findFreeSpot(player.pos.x+(i-1.5)*3,player.pos.z+5)||player.pos;s.mesh.position.set(p.x,c.groundY(p.x,p.z),p.z);s.patrol={x:p.x,z:p.z};s.patrolTimer=0;});
    c.startPrep();c.resetCamera();c.showMsg(won?cfg.name+' 完成！'+(first?'奖励 '+cfg.reward+' 金币':'本章奖励已领取'):cfg.name+' 已撤离，主线进度保留',4);c.autoSave();
  }
  function update(dt){
    if(!active)return false;
    if(player.dead){finish(false);return true;}
    const a=active,cfg=a.cfg;const inside=Math.hypot(player.pos.x-a.center.x,player.pos.z-a.center.z)<=24;
    if(cfg.duration&&inside)a.held+=dt;
    a.timer-=dt;
    if(a.spawned<cfg.total&&a.timer<=0&&monsters.filter(m=>!m.dead).length<20){
      const i=a.spawned++,angle=i*2.39996,r=19+(i%3)*2;
      const p=c.findFreeSpot(a.center.x+Math.sin(angle)*r,a.center.z+Math.cos(angle)*r)||a.center;
      c.spawnMonster(cfg.id==='hunter'&&i>=cfg.total-2?'miniboss':'mob',p.x,p.z,{wild:true,elite:cfg.id==='hunter'&&i%4===0,quiet:true});
      a.timer=cfg.duration?2.2:1;
    }
    const live=monsters.filter(m=>!m.dead).length;
    document.getElementById('waveTxt').textContent=cfg.duration?cfg.name+' '+Math.floor(a.held)+' / '+cfg.duration+' 秒'+(inside?'':' · 请回到蓝圈内'):cfg.name+' · 剩余 '+(cfg.total-a.spawned+live)+' / '+cfg.total;
    if(cfg.duration?a.held>=cfg.duration:a.spawned>=cfg.total&&live===0)finish(true);
    return true;
  }
  return {open,start,finish,update,clear,get active(){return active;}};
}

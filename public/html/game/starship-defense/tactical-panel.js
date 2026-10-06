// A compact, keyboard/touch accessible command panel. Simulation is frozen while
// the player makes assignments; DOM is updated only when its contents change.
export function mountTacticalPanel(api){
  const {Game,squad,squadGear,squadRole,squadBehavior,setSquadTask,setSquadMemberTask,setSquadAutoDefense,preview,closePanels,resetInput}=api;
  const $=id=>document.getElementById(id),panel=$('tacticsPanel');
  const setText=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  function render(){
    const wave=preview();
    setText('tacticsWaveTitle',wave.title);
    setText('tacticsWaveInfo',wave.info);
    setText('tacticsWaveHint',wave.hint);
    setText('tacticsSupply',wave.supply?`本关通关新兵补给 +${wave.supply} 金币（另有正常奖励与掉落）`:'通关可获得正常奖励与虫群掉落。');
    setText('tacticsOrderHint',api.operationActive()?'副本内全员暂时跟随；返回战役后恢复分工。':'逐人选择跟随或留守，手动任务优先。重伤队友下一关归队；集合会将全队改为跟随。');
    const auto=$('squadAutoDefense');auto.setAttribute('aria-pressed',String(Game.squadAutoDefense!==false));
    auto.textContent='自动回防：'+(Game.squadAutoDefense!==false?'开启（未单独下令的队友）':'关闭');
    const list=$('tacticalSquad');list.replaceChildren();
    for(let slot=0;slot<Game.squadCount;slot++){
      const gear=squadGear(slot),mate=squad.find(s=>s.slot===slot&&!s.dead),role=squadRole(slot);
      const card=document.createElement('div');card.className='tactical-mate';card.dataset.slot=slot;
      const title=document.createElement('strong');title.textContent=`${slot+1}号 ${role.name}`;card.appendChild(title);
      const status=document.createElement('p');status.className='small';
      status.textContent=mate?`${Math.ceil(mate.hp)}/${mate.maxHp}生命 · ${mate.vehicle?mate.vehicle.cfg.name:mate.hp<mate.maxHp*.35?'负伤':'步行'} · ${squadBehavior(mate)==='defend'?'留守基地':'跟随出击'}`:'重伤撤离或空投途中 · 分工仍会保留';card.appendChild(status);
      const row=document.createElement('div');row.className='btnRow';
      for(const [order,label] of [['follow','跟随出击'],['defend','留守基地']]){
        const button=document.createElement('button');button.type='button';button.className='mbtn';button.dataset.squadSlot=slot;button.dataset.squadOrder=order;
        button.textContent=label;button.setAttribute('aria-label',`${slot+1}号${role.name}：${label}`);
        button.setAttribute('aria-pressed',String((gear.order||Game.squadOrder)===order));
        button.onclick=()=>{setSquadMemberTask(slot,order);render();list.querySelector(`[data-squad-slot="${slot}"][data-squad-order="${order}"]`).focus();};row.appendChild(button);
      }
      card.appendChild(row);list.appendChild(card);
    }
    if(!Game.squadCount){const empty=document.createElement('p');empty.className='small';empty.textContent='在军需商店雇佣队友后，就能分别安排留守与出击。';list.appendChild(empty);}
    const result=Game.lastBattle;
    setText('lastBattleReport',result?`${result.label} · ${result.won?'守住了':'防线失守'}\n基地 ${result.baseHp}/${result.baseMaxHp} · 城门 ${result.gateHp}/${result.gateMaxHp}\n设施损毁 ${result.buildingLosses} · 队友重伤 ${result.squadLosses} · 载具损毁 ${result.vehicleLosses}\n本关收入 ${result.income} · 支出 ${result.spent} 金币 · ${result.seconds}秒`:'本关结束后，可在这里查看防线损失、队友负伤与收支。');
  }
  function open(){
    if(!['prep','battle','paused'].includes(Game.state))return;
    api.cancelPlacement();closePanels();resetInput();api.releasePointer();render();panel.classList.remove('hidden');api.setPanelOpen(true);
  }
  $('tacticsButton').onclick=$('tacticsPause').onclick=open;
  $('tacticsClose').onclick=closePanels;
  $('allSquadFollow').onclick=()=>{setSquadTask('follow');render();};
  $('allSquadDefend').onclick=()=>{setSquadTask('defend');render();};
  $('squadAutoDefense').onclick=()=>{setSquadAutoDefense(Game.squadAutoDefense===false);render();};
  return {open,render,visible:()=>!panel.classList.contains('hidden')};
}

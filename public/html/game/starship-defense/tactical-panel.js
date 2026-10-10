// A compact, keyboard/touch accessible briefing panel. Simulation is frozen while
// it is open; DOM is updated only when its contents change. Squad orders are set
// from the in-game one-key toggle, so this panel only previews waves and reports.
export function mountTacticalPanel(api){
  const {Game,preview,closePanels,resetInput}=api;
  const $=id=>document.getElementById(id),panel=$('tacticsPanel');
  const setText=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  function render(){
    const wave=preview();
    setText('tacticsWaveTitle',wave.title);
    setText('tacticsWaveInfo',wave.info);
    setText('tacticsWaveHint',wave.hint);
    setText('tacticsSupply',wave.supply?`本关通关新兵补给 +${wave.supply} 金币（另有正常奖励与掉落）`:'通关可获得正常奖励与虫群掉落。');
    setText('tacticsOrderHint',api.operationActive()?'副本内全员暂时跟随；返回战役后恢复分工。':`当前全队分工：${Game.squadOrder==='defend'?'守基地':'跟随出击'}（基地受威胁时自动回防）。用「队友」按钮可一键切换。`);
    const result=Game.lastBattle;
    setText('lastBattleReport',result?`${result.label} · ${result.won?'守住了':'防线失守'}\n基地 ${result.baseHp}/${result.baseMaxHp} · 城门 ${result.gateHp}/${result.gateMaxHp}\n设施损毁 ${result.buildingLosses} · 队友重伤 ${result.squadLosses} · 载具损毁 ${result.vehicleLosses}\n本关收入 ${result.income} · 支出 ${result.spent} 金币 · ${result.seconds}秒`:'本关结束后，可在这里查看防线损失、队友负伤与收支。');
  }
  function open(){
    if(!['prep','battle','paused'].includes(Game.state))return;
    api.cancelPlacement();closePanels();resetInput();api.releasePointer();render();panel.classList.remove('hidden');api.setPanelOpen(true);
  }
  $('tacticsButton').onclick=$('tacticsPause').onclick=open;
  $('tacticsClose').onclick=closePanels;
  return {open,render,visible:()=>!panel.classList.contains('hidden')};
}

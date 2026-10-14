const MODES={
  campaign:{button:'btnCampaign',title:'基地防守',tag:'主模式 · 建造防线 · 小队协作',description:'守住前哨基地，抵御虫潮。先整备武器、建造防线，再开始迎敌；攒钱强化并雇佣队友。选择守卫与难度后出发。'},
  bank:{button:'btnBankVersus',title:'银行塔防对战',tag:'经营银行 · 派兵推线',description:'升级银行积累资金，派出士兵、布置防御塔，攻破对方基地。可挑战电脑，也可与好友对战。',action:'选择对战配置'},
  rv:{button:'btnRV',title:'房车生存',tag:'废弃城镇 · 搜刮与撤离',description:'驾驶房车探索城镇，搜集燃料、食物与零件。整备载具、搜索感染区，再前往营地撤离。',action:'进入城镇整备'},
  zerg:{button:'btnZerg',title:'虫族模式',tag:'孵化虫群 · 攻陷要塞',description:'化身母虫，孵化并指挥虫群，摧毁人类防线。通过进化增强虫群，完成三段攻城。',action:'选择虫族出征'},
  acid:{button:'btnAcid',title:'酸液围场',tag:'三轮弹幕 · 躲避与弱点反击',description:'进入封闭围场，躲过固定朝向的交叉酸液。趁虫腹发光时集中反击，轮间选择武器或护盾升级。三次命中容错，单局约三分钟。',action:'查看挑战规则'},
  test:{button:'btnTest',title:'自由测试',tag:'无限资源 · 自由实验',description:'自由试用武器、载具与建造，召唤不同虫群，试验你的防线。测试不会覆盖普通战役进度。',action:'开始自由测试'}
};

// Existing mode entry handlers retain their save/restore and setup behavior.
export function mountMenuShell(stage){
  const $=id=>document.getElementById(id),launch={};let selected='campaign';
  function select(mode){
    if(!MODES[mode])mode='campaign';selected=mode;
    const data=MODES[mode],campaign=mode==='campaign';
    for(const [key,item] of Object.entries(MODES)){
      const b=$(item.button);b.classList.toggle('mode-sel',key===mode);b.setAttribute('aria-pressed',String(key===mode));
    }
    const early=!['campaign','test'].includes(mode);
    $('modeTitle').textContent=data.title;$('modeTag').textContent=data.tag;$('modeDescription').textContent=data.description;
    $('modeStatus').hidden=!early;
    if(early)$('earlyModes').open=true;
    $('campaignConfig').classList.toggle('hidden',!campaign);
    $('startRow').classList.toggle('hidden',!campaign);
    $('modeActionRow').classList.toggle('hidden',campaign);
    $('btnModeStart').textContent=data.action||'开始';
  }
  for(const [mode,data] of Object.entries(MODES)){
    const button=$(data.button);launch[mode]=button.onclick;
    button.onclick=()=>{if(mode==='test')button.closest('.menuDialog')?.querySelector('[data-menu-close]')?.click();select(mode);};
    button.querySelector('strong').textContent=data.title;
    button.querySelector('span').textContent=data.tag;
    if(!['campaign','test'].includes(mode))$('earlyModeList').append(button);
  }
  $('btnModeStart').onclick=e=>{if(launch[selected])launch[selected](e);};
  for(const id of ['rvBack','zergBack','acidBack'])$(id).addEventListener('click',()=>select('campaign'));
  const main=$('menuMain');
  const sync=()=>stage.classList.toggle('title-menu',!main.classList.contains('hidden'));
  new MutationObserver(sync).observe(main,{attributes:true,attributeFilter:['class']});
  sync();select('campaign');
  return {select,get selected(){return selected;}};
}

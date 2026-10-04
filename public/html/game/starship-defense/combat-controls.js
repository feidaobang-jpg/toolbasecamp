// PC preferences are separate from game saves and key bindings. Touch keeps its buttons.
const STORE='chongchao-combat-controls-v1';
const DEFAULTS={input:'mouse',aim:'auto',fire:'auto'};
const CHOICES={input:['mouse','keyboard'],aim:['auto','manual'],fire:['auto','hold','toggle']};
export function createCombatControls(storage){
  let settings={...DEFAULTS},latched=false;
  const held=new Set();
  try{
    const saved=JSON.parse(storage.getItem(STORE)||'{}');
    for(const key of Object.keys(DEFAULTS))if(saved&&CHOICES[key].includes(saved[key]))settings[key]=saved[key];
  }catch(_e){}
  return {
    get settings(){return {...settings};},
    set(key,value){
      if(!Object.prototype.hasOwnProperty.call(CHOICES,key)||!CHOICES[key].includes(value))return false;
      settings[key]=value;this.reset();
      try{storage.setItem(STORE,JSON.stringify(settings));}catch(_e){}
      return true;
    },
    reset(){held.clear();latched=false;},
    press(source){
      if(held.has(source))return;
      held.add(source);
      if(settings.fire==='toggle')latched=!latched;
    },
    release(source){held.delete(source);},
    firing(hasTarget=false){
      if(settings.fire==='auto')return hasTarget||held.size>0;
      return settings.fire==='toggle'?latched:held.size>0;
    },
    get mouseEnabled(){return settings.input==='mouse';},
    get autoAim(){return settings.aim==='auto';}
  };
}

export function mountCombatSettings(container,controls,onChange){
  const section=document.createElement('section');section.className='combatSettings';
  const title=document.createElement('h4');title.textContent='电脑操作';section.appendChild(title);
  const fields=[
    ['input','操作方式',[['mouse','键盘 + 鼠标（推荐）'],['keyboard','纯键盘']]],
    ['aim','瞄准方式',[['auto','自动锁定敌人'],['manual','手动沿镜头瞄准']]],
    ['fire','射击方式',[['auto','自动攻击（有目标时）'],['hold','按住射击'],['toggle','按一下持续射击，再按停止']]]
  ];
  for(const [key,label,options] of fields){
    const row=document.createElement('label');row.className='combatSettingRow';row.textContent=label;
    const select=document.createElement('select');select.id='combat-'+key;
    for(const [value,text] of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.appendChild(option);}
    select.value=controls.settings[key];select.onchange=()=>{controls.set(key,select.value);onChange();};
    row.appendChild(select);section.appendChild(row);
  }
  const help=document.createElement('p');help.className='small';help.textContent='默认自动寻敌并开火，可边撤退边攻击。键鼠模式：点击画面转视角；纯键盘模式：左转视角 / 右转视角键调整方向。手动瞄准配合第一人称更准确。菜单用方向键 / WASD / Tab 选择、J / 回车确认、K / Esc 返回。触屏仍使用原有按钮。设置自动保存。';section.appendChild(help);
  container.appendChild(section);return section;
}

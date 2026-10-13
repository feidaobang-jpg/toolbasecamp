// Shared desktop/touch preferences, separate from game saves and key bindings.
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
      return this.fireIntent||(settings.fire==='auto'&&hasTarget);
    },
    // Send intent separately: only the host can decide whether a remote player has a target.
    get fireIntent(){return settings.fire==='toggle'?latched:held.size>0;},
    get toggled(){return settings.fire==='toggle'&&latched;},
    // 战地、抗战固定按住射击：不看「射击方式」设置，只认当前是否按着开火键。
    get held(){return held.size>0;},
    get mouseEnabled(){return settings.input==='mouse';},
    get autoAim(){return settings.aim==='auto';}
  };
}

export function mountCombatSettings(container,controls,onChange){
  const section=document.createElement('section');section.className='combatSettings';
  const title=document.createElement('h4');title.textContent='射击与瞄准';section.appendChild(title);
  const fields=[
    ['input','电脑操作',[['mouse','键盘 + 鼠标（推荐）'],['keyboard','纯键盘']]],
    ['aim','瞄准方式',[['auto','自动锁定敌人'],['manual','手动沿镜头瞄准']]],
    ['fire','射击方式',[['auto','自动射击（有目标时）'],['hold','按住射击'],['toggle','点击开关连射']]]
  ];
  for(const [key,label,options] of fields){
    const row=document.createElement('label');row.className='combatSettingRow';row.dataset.field=key;row.textContent=label;
    const select=document.createElement('select');select.id='combat-'+key;
    for(const [value,text] of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.appendChild(option);}
    select.value=controls.settings[key];select.onchange=()=>{controls.set(key,select.value);onChange();};
    row.appendChild(select);section.appendChild(row);
  }
  const help=document.createElement('p');help.className='small';help.textContent='电脑和手机共用选择，默认自动寻敌并开火；手雷、医疗和技能仍需主动使用。按住射击：松开即停；点击开关连射：点一下开启，再点停止。暂停、失焦或切换操作模式会关闭已开启的连射。设置自动保存，不影响本局进度。';section.appendChild(help);
  const mouse=document.createElement('p');mouse.className='small desktop-help';mouse.textContent='键鼠第一人称可接管鼠标，移动转向，左键射击，Esc 释放并暂停；未接管时点击画面。第三人称或浏览器拒绝接管时按住画面拖动。纯键盘用 Q/E 转视角；手动瞄准配合第一人称更准确。';section.appendChild(mouse);
  const touch=document.createElement('p');touch.className='small touch-help';touch.textContent='手机射击键遵循上面的选择。手动瞄准时可拖动空白处转向，也可按着射击键拖动瞄准；默认自动瞄准会寻找最近的有效目标。';section.appendChild(touch);
  const fixed=document.createElement('p');fixed.className='small';fixed.id='combat-fixed';fixed.textContent='战地模式和抗战战役固定为步行第一人称、手动瞄准、按住射击，不使用上面的瞄准和射击设置；鼠标接管后直接移动瞄准，按住左键射击、右键举枪。未接管时右键拖动只转视角，右键点击举枪。';section.appendChild(fixed);
  // 枪战规则生效时锁住瞄准、射击两项，避免玩家以为改了设置却没变化；保存的设置本身不动。
  section.lockAim=locked=>{for(const key of ['aim','fire'])section.querySelector('#combat-'+key).disabled=!!locked;fixed.hidden=!locked;};
  container.appendChild(section);return section;
}

// Device-local layout preferences stay separate from campaign and keyboard saves.
const STORE='chongchao-touch-layout-v1';
const IDS=['joyBase','vJ','vK','vU','vI','vH','vO','vL','vX','vC','vP','vSPRINT'];
const clamp=v=>Math.max(0,Math.min(1,v));
export function mountTouchLayout({stage,storage,toStage,resetInput,onOpen,onClose}){
  const controls=IDS.map(id=>document.getElementById(id));
  let saved={},draft={},active=false,drag=null,selected=null;
  try{const data=JSON.parse(storage.getItem(STORE)||'{}');
    for(const id of IDS){const p=data&&data[id];if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y))saved[id]={x:clamp(p.x),y:clamp(p.y)};}
  }catch(_e){}
  const toolbar=document.createElement('section');toolbar.id='touchLayoutEditor';toolbar.className='hidden';toolbar.setAttribute('aria-label','自定义按键位置');
  toolbar.innerHTML='<strong>拖动摇杆或按键，摆到顺手的位置</strong><span id="touchLayoutStatus" role="status">保存后在这台设备记住布局</span><div class="btnRow"><button class="mbtn" id="touchLayoutSave">保存布局</button><button class="mbtn" id="touchLayoutReset">恢复默认布局</button><button class="mbtn" id="touchLayoutCancel">取消</button></div>';
  stage.appendChild(toolbar);
  const status=toolbar.querySelector('[role="status"]');
  function apply(layout){
    for(const el of controls){const p=layout[el.id];
      if(p){const css=getComputedStyle(el),w=el.offsetWidth||parseFloat(css.width),h=el.offsetHeight||parseFloat(css.height);el.style.left=p.x*Math.max(0,stage.clientWidth-w)+'px';el.style.top=p.y*Math.max(0,stage.clientHeight-h)+'px';el.style.right=el.style.bottom='auto';}
      else for(const key of ['left','top','right','bottom'])el.style[key]='';
    }
  }
  function release(){const d=drag;drag=null;if(d&&d.el.hasPointerCapture(d.id))d.el.releasePointerCapture(d.id);resetInput();}
  function finish(commit){
    if(!active)return false;
    release();
    if(commit){try{storage.setItem(STORE,JSON.stringify(draft));}catch(_e){status.textContent='当前浏览器无法保存设置，请允许本地存储后重试；也可取消';return false;}saved=JSON.parse(JSON.stringify(draft));}
    active=false;selected=null;controls.forEach(el=>el.classList.remove('layout-selected'));stage.classList.remove('editing-touch-layout');toolbar.classList.add('hidden');apply(saved);onClose(commit);return true;
  }
  function open(){
    if(active)return;resetInput();onOpen();active=true;draft=JSON.parse(JSON.stringify(saved));
    stage.classList.add('editing-touch-layout');toolbar.classList.remove('hidden');apply(draft);status.textContent='保存后在这台设备记住布局';toolbar.querySelector('button').focus();
  }
  const place=(el,p)=>{draft[el.id]={x:clamp(p.x/Math.max(1,stage.clientWidth-el.offsetWidth)),y:clamp(p.y/Math.max(1,stage.clientHeight-el.offsetHeight))};apply(draft);};
  stage.addEventListener('pointerdown',e=>{
    if(!active||toolbar.contains(e.target))return;
    e.preventDefault();e.stopImmediatePropagation();
    const el=e.target.closest('#joyBase,.vbtn');if(!el||drag||e.button!==0)return;
    selected=el;controls.forEach(item=>item.classList.toggle('layout-selected',item===el));status.textContent='正在调整：'+(el.id==='joyBase'?'摇杆':el.textContent||el.getAttribute('aria-label'));
    const p=toStage(e.clientX,e.clientY);drag={el,id:e.pointerId,dx:p.x-el.offsetLeft,dy:p.y-el.offsetTop};el.setPointerCapture(e.pointerId);
  },true);
  stage.addEventListener('pointermove',e=>{
    if(!active||!drag||drag.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();
    const p=toStage(e.clientX,e.clientY);place(drag.el,{x:p.x-drag.dx,y:p.y-drag.dy});
  },true);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(type,e=>{
    if(!active||toolbar.contains(e.target))return;e.stopImmediatePropagation();if(drag&&drag.id===e.pointerId)release();
  },true);
  stage.addEventListener('click',e=>{if(active&&!toolbar.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
  // Own keyboard input before gameplay/menu navigation while the editor is open.
  window.addEventListener('keydown',e=>{
    if(!active)return;e.stopImmediatePropagation();
    if(e.code==='Escape'){e.preventDefault();finish(false);}
    else if(selected&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)){
      e.preventDefault();const step=e.shiftKey?1:8;place(selected,{x:selected.offsetLeft+(e.code==='ArrowRight'?step:e.code==='ArrowLeft'?-step:0),y:selected.offsetTop+(e.code==='ArrowDown'?step:e.code==='ArrowUp'?-step:0)});
    }
    else if(e.code==='Tab'){
      e.preventDefault();const buttons=[...toolbar.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
    }else if(!toolbar.contains(e.target)||!['Enter','Space'].includes(e.code))e.preventDefault();
  },true);
  window.addEventListener('keyup',e=>{if(active)e.stopImmediatePropagation();},true);
  window.addEventListener('resize',()=>{release();apply(active?draft:saved);});
  window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  toolbar.querySelector('#touchLayoutSave').onclick=()=>finish(true);
  toolbar.querySelector('#touchLayoutCancel').onclick=()=>finish(false);
  toolbar.querySelector('#touchLayoutReset').onclick=()=>{release();draft={};apply(draft);status.textContent='已还原预设位置，点保存生效；取消则保留原布局';};
  const section=document.createElement('section');section.className='combatSettings';
  section.innerHTML='<h4>手机按键位置</h4><p class="small">拖动摇杆和各功能键，自由摆放。默认布局保留，调整不影响本局进度和电脑键位。</p><button class="mbtn" id="touchLayoutOpen">自定义按键位置</button>';
  document.getElementById('keyPanel').insertBefore(section,document.getElementById('keyStatus'));
  section.querySelector('button').onclick=open;
  apply(saved);
  return {get active(){return active;},open,cancel:()=>finish(false),refresh:()=>apply(active?draft:saved)};
}

// Menu gestures use the same inverse transform as gameplay. Native scrolling in
// a scaled/rotated Toy frame is not reliable; mouse wheels still scroll natively.
export function installMenuScroll(stage,toStage){
  let drag=null,ignoreClickUntil=0;
  const scrollable=target=>{
    for(let el=target;el&&el!==stage;el=el.parentElement){
      if(el.matches('.menu,.panel,[data-menu-scroll]')&&el.scrollHeight>el.clientHeight+1&&/auto|scroll/.test(getComputedStyle(el).overflowY))return el;
    }
    return null;
  };
  const clear=()=>{drag=null;};
  stage.addEventListener('pointerdown',e=>{
    ignoreClickUntil=0;
    if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
    if(drag||!e.isPrimary){clear();return;}
    if(e.target.closest('input,select,textarea,[contenteditable="true"]'))return;
    const el=scrollable(e.target);if(!el)return;
    const p=toStage(e.clientX,e.clientY);
    drag={id:e.pointerId,el,x:e.clientX,y:e.clientY,startY:p.y,top:el.scrollTop,moved:false};
  },true);
  stage.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;
    if(!drag.el.getClientRects().length){clear();return;}
    if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<7)return;
    if(!drag.moved){drag.moved=true;try{drag.el.setPointerCapture(e.pointerId);}catch(_e){}}
    e.preventDefault();e.stopPropagation();
    drag.el.scrollTop=drag.top+drag.startY-toStage(e.clientX,e.clientY).y;
  },{capture:true,passive:false});
  const end=e=>{
    if(!drag||e.pointerId!==drag.id)return;
    if(drag.moved){ignoreClickUntil=performance.now()+500;e.preventDefault();}
    clear();
  };
  stage.addEventListener('pointerup',end,true);
  stage.addEventListener('pointercancel',end,true);
  // Touch starts with implicit capture on the child. Transferring it to the
  // scroll panel emits lostpointercapture on that child; it is not cancellation.
  stage.addEventListener('lostpointercapture',e=>{if(drag&&e.target===drag.el)clear();},true);
  stage.addEventListener('click',e=>{
    if(e.detail!==0&&performance.now()<ignoreClickUntil){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  window.addEventListener('blur',clear);
  window.addEventListener('resize',clear);
  document.addEventListener('visibilitychange',clear);
}

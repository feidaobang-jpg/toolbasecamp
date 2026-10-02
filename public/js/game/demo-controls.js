import zh from '../locales/game-demo-zh-CN.js?v=single-view1';
export function installDemoControls(getWorld, view, tank=false){
  const presets=tank?[[0,.98,'overview'],[0,1.48,'top']]:[[0,.45,'side'],[-Math.PI/4,.5,'oblique'],[-Math.PI/2,.38,'depth']];
  let index=0,demo=false;
  const toolbar=document.querySelector('.toolbar');
  const camera=document.createElement('button'),mode=document.createElement('button');
  camera.className=mode.className='tb-btn';camera.id='camera-mode';mode.id='demo-mode';
  toolbar.append(camera,mode);mode.setAttribute('aria-pressed','false');
  const note=document.createElement('small');note.className='footnote';document.querySelector('#panel').append(note);
  function labels(){const t=zh;camera.textContent=t[presets[index][2]];mode.textContent=demo?t.demo:t.normal;note.textContent=t.modeHint;
    document.querySelectorAll('[data-i18n$=".camera"], [data-camera-help]').forEach(e=>{e.removeAttribute('data-i18n');e.dataset.cameraHelp='';e.textContent=t.camera;const k=e.parentElement.querySelector('kbd');if(k)k.textContent='C';});
    const help=document.querySelector('#keyboard-help');if(help){help.removeAttribute('data-i18n');help.textContent=tank?t.tankHelp:t.marioHelp;}
    const touchCamera=document.querySelector('#recenter');if(touchCamera)touchCamera.textContent='C · '+t[presets[index][2]];
    camera.title=t.camera;
  }
  function select(n){index=(n+presets.length)%presets.length;view.setCamera(presets[index][0],presets[index][1]);labels();}
  camera.onclick=()=>select(index+1);mode.onclick=()=>{demo=!demo;getWorld().demoMode=demo;mode.setAttribute('aria-pressed',String(demo));labels();};
  addEventListener('keydown',e=>{if(e.code==='KeyC'&&!e.repeat){if(e.target.matches('input,select,textarea'))return;e.preventDefault();select(index+1);}});
  document.querySelector('#recenter')?.addEventListener('click',()=>select(index+1));
  document.querySelectorAll('[data-hold="KeyQ"],[data-hold="KeyE"],[data-hold="KeyR"],[data-hold="KeyF"]').forEach(b=>b.remove());
  addEventListener('tb:locale',labels);new MutationObserver(labels).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  select(0);
  return {get retry(){return zh.retry;},sync(){getWorld().demoMode=demo;},map(x,z){const y=presets[index][0];return {x:Math.cos(y)*x+Math.sin(y)*z,z:-Math.sin(y)*x+Math.cos(y)*z};}};
}

import {createWorld,stepWorld,respawn,LEVEL_END} from './world.js';
import {createScene} from './scene.js';
import {GameAudio} from './audio.js';

const $=id=>document.getElementById(id);
const world=createWorld();
const audio=new GameAudio();
const view=createScene($('world'),world);
const held=new Set(), pointerKeys=new Set();
let running=false, paused=false, last=performance.now();
const input={x:0,z:0,run:false,jump:false,jumpPressed:false,yaw:0,pitch:0,reset:false};

function setText(id,value){$(id).textContent=value;}
function toast(text){const e=$('toast');e.textContent=text;e.classList.add('visible');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('visible'),1700);}
function pressed(key){return held.has(key)||pointerKeys.has(key);}
function syncInput(){
  let x=(pressed('KeyD')?1:0)-(pressed('KeyA')?1:0), z=(pressed('KeyS')?1:0)-(pressed('KeyW')?1:0);
  if(Math.hypot(x,z)>1){x/=Math.SQRT2;z/=Math.SQRT2;}
  input.x=x;input.z=z;input.run=pressed('KeyJ');input.jump=pressed('KeyK');
  input.yaw=(pressed('KeyE')?1:0)-(pressed('KeyQ')?1:0);input.pitch=(pressed('KeyF')?1:0)-(pressed('KeyR')?1:0);input.reset=pressed('KeyC');
}
function startFullscreen(){const el=$('game');try{if(document.fullscreenElement!==el&&el.requestFullscreen)el.requestFullscreen({navigationUI:'hide'}).catch(()=>{});}catch(e){}try{if(screen.orientation?.lock)screen.orientation.lock('landscape').catch(()=>{});}catch(e){}}
function startGame(){if(world.status==='dead')respawn(world);else if(world.status==='won'){location.reload();return;}world.status='playing';running=true;paused=false;$('panel').hidden=true;document.body.classList.add('playing');setText('pause',t('mario3d.pause'));audio.unlock();startFullscreen();$('game').focus();}
function togglePause(){if(!running)return;if(world.status==='dead'){respawn(world);return;}if(world.status==='won')return;paused=!paused;setText('pause',paused?t('mario3d.resume'):t('mario3d.pause'));toast(paused?t('mario3d.paused'):t('mario3d.continued'));}
function updateHud(){setText('coins',String(world.coins).padStart(2,'0'));setText('score',String(world.score).padStart(6,'0'));setText('time',String(Math.max(0,Math.ceil(world.time))).padStart(3,'0'));$('progress').style.width=Math.min(100,Math.max(0,(world.player.x/LEVEL_END)*100))+'%';}
function eventEffects(){
  while(world.events.length){const e=world.events.shift();audio.effect(e.type);
    if(e.type==='coin')view.burst(e.x,e.y,e.z,'#ffd147',7);if(e.type==='bump')view.burst(e.x,e.y+.4,e.z,'#fff0a6',4);if(e.type==='break')view.burst(e.x,e.y,e.z,'#b26a46',11);if(e.type==='stomp')view.burst(e.x,.3,e.z,'#f5dfae',5);
    if(e.type==='grow')toast(t('mario3d.grow'));if(e.type==='checkpoint')toast(t('mario3d.checkpoint'));if(e.type==='hurt')toast(t('mario3d.hurt'));if(e.type==='spawn')toast(t('mario3d.mushroom'));
    if(e.type==='die'){running=false;$('panel').hidden=false;document.body.classList.remove('playing');$('panel-title').textContent=t('mario3d.deadTitle');$('panel-copy').textContent=t('mario3d.deadCopy');$('start').hidden=true;$('restart').hidden=false;}
    if(e.type==='win'){running=false;$('panel').hidden=false;document.body.classList.remove('playing');$('panel-title').textContent=t('mario3d.winTitle');$('panel-copy').textContent=t('mario3d.winCopy');$('start').hidden=true;$('restart').hidden=false;}
  }
}
function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;syncInput();if(running&&!paused){input.jumpPressed=input.jump&&!frame.wasJump;stepWorld(world,input,dt);frame.wasJump=input.jump;audio.tick(true);eventEffects();}else{input.jumpPressed=false;audio.tick(false);}view.update(dt,{yaw:input.yaw,pitch:input.pitch,reset:input.reset});updateHud();requestAnimationFrame(frame);}
frame.wasJump=false;
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Enter'&&!running){startGame();return;}if(e.code==='Escape'){togglePause();return;}held.add(e.code);});
window.addEventListener('keyup',e=>held.delete(e.code));window.addEventListener('blur',()=>{held.clear();pointerKeys.clear();});
$('start').onclick=startGame;$('restart').onclick=()=>location.reload();$('pause').onclick=togglePause;$('full').onclick=startFullscreen;
$('sound').onclick=async()=>{await audio.unlock();const on=audio.mute();$('sound').textContent=on?t('mario3d.soundOff'):t('mario3d.soundOn');};
$('touch-toggle').onclick=()=>{$('touch').hidden=!$('touch').hidden;document.body.classList.toggle('touch-mode',!$('touch').hidden);};
$('lang').onclick=()=>tbSetLocale(tbGetLocale()==='zh-CN'?'en':'zh-CN');$('recenter').onclick=()=>{pointerKeys.add('KeyC');setTimeout(()=>pointerKeys.delete('KeyC'),80);};
document.querySelectorAll('[data-hold]').forEach(btn=>{const code=btn.dataset.hold;const down=e=>{e.preventDefault();pointerKeys.add(code);btn.classList.add('held');};const up=e=>{e.preventDefault();pointerKeys.delete(code);btn.classList.remove('held');};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('pointerleave',up);});
const stick=$('stick'),knob=$('knob');let stickId=null;
function moveStick(e){const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,d=Math.min(r.width*.38,Math.hypot(dx,dy)),a=Math.atan2(dy,dx);knob.style.transform=`translate(${Math.cos(a)*d}px,${Math.sin(a)*d}px)`;const nx=Math.cos(a)*d/(r.width*.38),ny=Math.sin(a)*d/(r.height*.38);['KeyA','KeyD','KeyW','KeyS'].forEach(k=>pointerKeys.delete(k));if(nx<-.2)pointerKeys.add('KeyA');if(nx>.2)pointerKeys.add('KeyD');if(ny<-.2)pointerKeys.add('KeyW');if(ny>.2)pointerKeys.add('KeyS');}
stick.addEventListener('pointerdown',e=>{stickId=e.pointerId;stick.setPointerCapture(stickId);moveStick(e);});stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);});
function releaseStick(e){if(e.pointerId!==stickId)return;stickId=null;['KeyA','KeyD','KeyW','KeyS'].forEach(k=>pointerKeys.delete(k));knob.style.transform='translate(0,0)';}
stick.addEventListener('pointerup',releaseStick);stick.addEventListener('pointercancel',releaseStick);
function orientation(){const vertical=innerHeight>innerWidth;$('rotate').hidden=vertical||!running;if(vertical&&running){running=false;held.clear();pointerKeys.clear();}}
addEventListener('resize',()=>{view.resize();orientation();});orientation();view.update(0,{reset:true});updateHud();requestAnimationFrame(frame);

import {installRemakeCoop} from '../../../js/game/remake-coop.js';
import {markTree,treeState,applyTree,scalarState,createSoundRelay} from '../../../js/game/coop.js?v=lobby-hint1';
let coopDriver=null,coopHumans=[],coopNextId=1,coopEpoch=0,coopPendingEdges=[];
import {createVersus,VS_UNITS,VS_RULES,VS_BUILD_KINDS,VS_SIZES,TEAM_CSS,TEAM_NAME,VS_AI,fmtTime} from './versus.js?v=vs2';
import {BF_WEAPONS,BF_VEHICLES,militaryGun,militarySoldier,militaryVehicle} from './battlefield-assets.js';
import {createRVBreakout,makeRVMesh,RV_CFG} from './rv-breakout.js';
import {createResistanceCampaign} from './resistance-campaign.js';
import {createZergMode} from './zerg-mode.js';
let resistanceCampaign=null;
const warOn=()=>!!resistanceCampaign?.state.active;
let rvBreakout=null,rvFrameDt=0;
const rvOn=()=>!!rvBreakout?.state.active;
let versus=null,lobbyMode='coop',versusBackup=null;
function vsOn(){return !!(versus&&versus.state.active);}
let zergMode=null;
function zergOn(){return !!(zergMode&&zergMode.active);}
import {createPitchController,createLookController} from '../../../js/game/drag-look.js?v=camera-response0312';
import * as THREE from './vendor/three.module.js';
import {DarkVisuals} from './dark-visuals.js?v=fb97';
import {FortressWorld} from './fortress-world.js?v=toy3dui2';
import {HILL_FORTS,hillHeight,slopeSpeed} from './terrain-controls.js';
import {setupToyPlatform} from './toy-platform.js?v=cloud240';
import {LocalSaveStore,newSaveId} from './save-store.js';
import {validateNormalSave} from './save-validation.js?v=fb9';
import {BATTLEFIELD_PALETTE} from './battlefield-palette.js';
import {BattlefieldEnvironment,ENVIRONMENTS,environmentForChapter,paintBattlefieldGround} from './battlefield-environments.js';
import {ExplorationLight} from './exploration-light.js';
import {monsterStep,clearMonsterSegment} from './monster-navigation.js';
import {WALL_TOP,RAMPARTS,rampartHeight,rampartNavigation,legacyRampartWall} from './fortress-layout.js';
import {COVER_HEIGHT,WALL_WIDTH,WALL_DEPTH,wallTouches,wallSegment} from './wall-geometry.js';
import {HiveWorld,HIVE,MOUTHS,tunnelDistance,hiveFloor,hiveCeiling,hiveRoute,hiveNavigation} from './hive-world.js?v=toy3dui2';
import {SQUAD_ROLES,squadRoleId,MAX_SQUAD} from './squad-roles.js';
import {KEY_ACTIONS,createKeyBindings} from './key-bindings.js';
import {createOperations,OP_COMPLETION_KEYS} from './operations.js';
import {tacticalWavePlan,openingSupply} from './tactical-waves.js';
import {mountTacticalPanel} from './tactical-panel.js';
import {createCombatControls,mountCombatSettings} from './combat-controls.js';
import {mountTouchLayout} from './touch-layout.js';
import {MAX_BUILDINGS,buildingLimit,turretDamageMul} from './defense-progression.js';
import {CAMPAIGN_DIFFICULTIES,campaignDifficultyId,campaignDifficulty,campaignEliteChance,campaignWaveCount,campaignSpawnInterval} from './campaign-difficulty.js';
let selectedDifficulty='normal';
try{selectedDifficulty=campaignDifficultyId(localStorage.getItem('chongchao-campaign-difficulty'));}catch(_e){}
let combatStorage;try{combatStorage=localStorage;}catch(_e){}
const CombatControls=createCombatControls(combatStorage);
const keyBindings=createKeyBindings();
let bindingAction=null;
const currentBuildingLimit=()=>buildingLimit(Game,operations.active);
const THEME='dark',PAL=BATTLEFIELD_PALETTE;
let visualAssets=false;
const frameTimes=[];let previousFrame=0,measuring=false;

"use strict";
/* ================= 全局工具 ================= */
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const rand=(a,b)=>a+Math.random()*(b-a);
const TAU=Math.PI*2;
const BASE_W=960;let BASE_H=540;
// Some phone browsers/webviews (e.g. in-app browsers) report hover:hover, which used to hide
// every touch control and the landscape rotation. Detect the device before rendering
// the main menu and switch automatically on the first real touch (see Input.init).
const MOBILE_UA=/Android|iPhone|iPad|iPod|Mobile|HarmonyOS|OpenHarmony/i.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const autoTouch=()=>MOBILE_UA||(matchMedia('(pointer:coarse)').matches&&!matchMedia('(hover:hover)').matches);
let deviceMode='auto';try{const saved=localStorage.getItem('chongchao-device-mode');if(['auto','desktop','touch'].includes(saved))deviceMode=saved;}catch(_e){}
let isTouch=deviceMode==='touch'||deviceMode==='auto'&&autoTouch();

/* ---------- 画布缩放 + 手机自动横屏 ---------- */
const stage=$('stage');
const cornerSafeProbe=document.createElement('div');
cornerSafeProbe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(cornerSafeProbe);
stage.classList.toggle('touch-mode',isTouch);
let rotated=false,stageScale=1,fitW=0,fitH=0;
// App 内嵌页（如 B 站 App 的 Toy 容器）启动时可能报 0×0 的窗口尺寸，之后拿到真实尺寸却不发 resize：
// 读不到就先按屏幕尺寸排版，并持续检查尺寸变化，自己补发 resize。
function viewSize(){
  const vv=window.visualViewport,de=document.documentElement;
  let w=window.innerWidth||de.clientWidth||0,h=window.innerHeight||de.clientHeight||0;
  if(w<80||h<80){w=Math.round(vv&&vv.width||0)||screen.width||960;h=Math.round(vv&&vv.height||0)||screen.height||540;}
  if(w<80||h<80){w=screen.width||960;h=screen.height||540;}
  return{w,h};
}
function fitStage(){
  const v=viewSize(),w=v.w,h=v.h;fitW=window.innerWidth;fitH=window.innerHeight;
  rotated=(h>w)&&isTouch; // 竖屏手机 → 旋转
  let vw=rotated?h:w, vh=rotated?w:h;
  BASE_H=BASE_W*vh/vw;stage.style.height=BASE_H+'px';
  stage.classList.toggle('vs-compact',BASE_H<400);
  stageScale=Math.min(vw/BASE_W,vh/BASE_H);
  // Keep utility targets and edge spacing in CSS pixels even when the stage scales.
  const safe=getComputedStyle(cornerSafeProbe);
  stage.style.setProperty('--corner-top',(10+(parseFloat(rotated?safe.paddingRight:safe.paddingTop)||0))/stageScale+'px');
  stage.style.setProperty('--corner-right',(10+(parseFloat(rotated?safe.paddingBottom:safe.paddingRight)||0))/stageScale+'px');
  stage.style.setProperty('--corner-height',Math.max(44,44/stageScale)+'px');
  stage.style.setProperty('--corner-gap',8/stageScale+'px');
  stage.style.setProperty('--touch-left',(40+(parseFloat(rotated?safe.paddingTop:safe.paddingLeft)||0))/stageScale+'px');
  stage.style.setProperty('--touch-right',(40+(parseFloat(rotated?safe.paddingBottom:safe.paddingRight)||0))/stageScale+'px');
  stage.style.setProperty('--touch-bottom',(36+(parseFloat(rotated?safe.paddingLeft:safe.paddingBottom)||0))/stageScale+'px');
  stage.style.transform='translate(-50%,-50%) '+(rotated?'rotate(90deg) ':'')+'scale('+stageScale+')';
}
window.addEventListener('resize',fitStage);window.addEventListener('orientationchange',()=>setTimeout(()=>window.dispatchEvent(new Event('resize')),120));
fitStage();
function checkViewport(){if(window.innerWidth!==fitW||window.innerHeight!==fitH)window.dispatchEvent(new Event('resize'));}
setInterval(checkViewport,500);if(window.visualViewport)window.visualViewport.addEventListener('resize',checkViewport);
try{new ResizeObserver(checkViewport).observe(document.documentElement);}catch(_e){}
/* 把屏幕坐标转到舞台坐标（考虑旋转与缩放） */
function toStage(cx,cy){
  const r=stage.getBoundingClientRect();
  // rect 是旋转+缩放后的包围盒；用中心逆变换
  const mx=r.left+r.width/2, my=r.top+r.height/2;
  let dx=cx-mx, dy=cy-my;
  const s=stageScale;
  dx/=s;dy/=s;
  if(rotated){const t=dx;dx=dy;dy=-t;}
  return {x:dx+BASE_W/2,y:dy+BASE_H/2};
}
function toStageScale(){return stageScale;}

/* ================= 音频系统 ================= */
const AudioSys={
  ctx:null,master:null,musicGain:null,started:false,bgmTimer:0,bgmStep:0,bgmMode:'calm',
  init(){
    if(this.ctx)return;
    try{
      this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      this.master=this.ctx.createGain();this.master.gain.value=.5;this.master.connect(this.ctx.destination);
      this.musicGain=this.ctx.createGain();this.musicGain.gain.value=.16;this.musicGain.connect(this.master);
    }catch(e){}
  },
  paused:false,
  syncPause(){if(!this.ctx)return;const op=this.paused||document.hidden?this.ctx.suspend():this.ctx.resume();op?.catch?.(()=>{});},
  pause(on){this.paused=!!on;this.syncPause();},
  resume(){this.syncPause();},
  tone(f,dur,type='square',vol=.2,slide=0,delay=0){
    if(!this.ctx)return;const t=this.ctx.currentTime+delay;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,f+slide),t+dur);
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+.02);
  },
  noise(dur,vol=.2,fc=1200,delay=0){
    if(!this.ctx)return;const t=this.ctx.currentTime+delay;
    const n=Math.floor(this.ctx.sampleRate*dur),buf=this.ctx.createBuffer(1,n,this.ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;
    const src=this.ctx.createBufferSource();src.buffer=buf;
    const f=this.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=fc;
    const g=this.ctx.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    src.connect(f);f.connect(g);g.connect(this.master);src.start(t);
  },
  sfx(name){
    if(!this.ctx)return;
    switch(name){
      case 'shoot':this.noise(.07,.12,3000);this.tone(880,.05,'square',.06,-500);break;
      case 'mg':this.noise(.05,.10,2600);break;
      case 'sniper':this.noise(.18,.22,1800);this.tone(220,.15,'sawtooth',.12,-160);break;
      case 'cannon':this.noise(.3,.3,900);this.tone(90,.3,'sine',.3,-40);break;
      case 'jump':this.tone(300,.15,'sine',.15,260);break;
      case 'hit':this.tone(160,.08,'square',.14,-60);break;
      case 'hurt':this.tone(200,.2,'sawtooth',.2,-140);break;
      case 'boom':this.noise(.45,.35,700);this.tone(70,.4,'sine',.3,-30);break;
      case 'coin':this.tone(988,.07,'square',.12);this.tone(1319,.12,'square',.12,0,.07);break;
      case 'heal':this.tone(523,.1,'sine',.14);this.tone(784,.15,'sine',.14,0,.1);break;
      case 'buy':this.tone(660,.08,'triangle',.16);this.tone(880,.1,'triangle',.16,0,.08);break;
      case 'build':this.noise(.12,.16,600);this.tone(330,.1,'square',.1,0,.1);break;
      case 'win':[523,659,784,1047].forEach((f,i)=>this.tone(f,.22,'triangle',.2,0,i*.13));break;
      case 'lose':[440,370,311,262].forEach((f,i)=>this.tone(f,.3,'sawtooth',.16,0,i*.18));break;
      case 'wave':this.tone(140,.5,'sawtooth',.22,60);this.tone(200,.5,'sawtooth',.18,80,.3);break;
      case 'click':this.tone(700,.05,'square',.1);break;
      case 'reload':this.tone(400,.06,'square',.1);this.tone(560,.06,'square',.1,0,.09);break;
      case 'airdrop':this.tone(500,.3,'sine',.14,-200);this.noise(.25,.12,800,.3);break;
      case 'vehicle':this.tone(120,.4,'sawtooth',.18,60);break;
      case 'laser':this.tone(1400,.07,'sawtooth',.05,-700);this.noise(.05,.04,5000);break;
    }
  },
  /* 简易BGM：小调分解和弦循环 */
  bgm(dt,inBattle){
    if(!this.ctx)return;
    this.bgmMode=inBattle?'battle':'calm';
    this.bgmTimer-=dt;
    if(this.bgmTimer<=0){
      const bpm=inBattle?150:92;this.bgmTimer=60/bpm/2;
      const calm=[[110,220,330],[98,196,294],[87,175,262],[98,196,294]];
      const battle=[[110,220,440],[110,220,415],[87,175,349],[131,262,392]];
      const prog=inBattle?battle:calm;
      const bar=Math.floor(this.bgmStep/8)%4,step=this.bgmStep%8;
      const ch=prog[bar];
      const f=ch[step%3]*(step===4?2:1);
      const o=this.ctx.createOscillator(),g=this.ctx.createGain();const t=this.ctx.currentTime;
      o.type=inBattle?'sawtooth':'triangle';o.frequency.value=f;
      g.gain.setValueAtTime(inBattle?.5:.4,t);g.gain.exponentialRampToValueAtTime(.001,t+(inBattle?.16:.3));
      o.connect(g);g.connect(this.musicGain);o.start(t);o.stop(t+.35);
      if(step===0){ // 底鼓
        const o2=this.ctx.createOscillator(),g2=this.ctx.createGain();
        o2.type='sine';o2.frequency.setValueAtTime(inBattle?100:80,t);o2.frequency.exponentialRampToValueAtTime(35,t+.12);
        g2.gain.setValueAtTime(.55,t);g2.gain.exponentialRampToValueAtTime(.001,t+.15);
        o2.connect(g2);g2.connect(this.musicGain);o2.start(t);o2.stop(t+.2);
      }
      this.bgmStep++;
    }
  }
};

/* ================= 输入系统 ================= */
const Input={
  keys:{},pressed:{},
  joy:{active:false,id:-1,x:0,y:0},
  look:{yaw:0,pitch:0},wheel:0,mouseFire:false,drag:null,touchLook:null,
  isPlaying:()=>false,onPause:null,onTouchDetected:null,
  init(){
    window.addEventListener('keydown',e=>{
      if(e.target.closest&&e.target.closest('select,input,textarea'))return;
      // During play a mouse-focused button must not swallow Space/Enter (jump/fire).
      const onButton=e.target.closest&&e.target.closest('button,[tabindex="0"]');
      if(onButton&&this.isPlaying()&&e.target!==document.body)e.target.blur();
      else if(onButton&&['Enter','Space'].includes(e.code))return;
      const k=this.mapKey(e.code);
      if(k==='J'&&this.isPlaying()&&!place.kind&&!e.repeat)CombatControls.press(e.code);
      if(k==='P'){e.preventDefault();if(!e.repeat&&this.onPause)this.onPause();return;}
      if(k){if(!this.keys[k]&&!e.repeat)this.pressed[k]=true;this.keys[k]=true;e.preventDefault();}
      AudioSys.init();AudioSys.resume();
    });
    window.addEventListener('keyup',e=>{CombatControls.release(e.code);const k=this.mapKey(e.code);if(k)this.keys[k]=false;});
    // Optional mouse look: click the view to capture the mouse (falls back to dragging when
    // pointer lock is not allowed, e.g. in some iframes). Keyboard-only play still works.
    const cv=$('c3d');
    cv.addEventListener('pointerdown',e=>{
      if(e.pointerType==='touch'){if(!isTouch&&this.onTouchDetected)this.onTouchDetected();return;}
      if(!this.isPlaying()||!CombatControls.mouseEnabled)return;
      AudioSys.init();AudioSys.resume();
      if(e.button===2){e.preventDefault();if(warOn())resistanceCampaign.toggleAim();else if(vsOn())toggleBattlefieldAim();return;}
      if(e.button!==0)return;
      this.mouseFire=true;if(!place.kind)CombatControls.press('mouse');
      if(document.pointerLockElement===cv)return;
      this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:0};cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove',e=>{
      if(!this.isPlaying()||!CombatControls.mouseEnabled)return;
      if(document.pointerLockElement===cv){this.look.yaw-=e.movementX*.0032;this.look.pitch-=e.movementY*.0032;return;}
      const d=this.drag;if(!d||d.id!==e.pointerId)return;
      const s=toStageScale();this.look.yaw-=(e.clientX-d.x)/s*.0075;this.look.pitch-=(e.clientY-d.y)/s*.0075;d.moved+=Math.abs(e.clientX-d.x)+Math.abs(e.clientY-d.y);d.x=e.clientX;d.y=e.clientY;
    });
    const endDrag=e=>{if(this.drag&&this.drag.id===e.pointerId)this.drag=null;if(e.type==='lostpointercapture'&&document.pointerLockElement===cv)return;if(e.button===0||e.type!=='pointerup'){this.mouseFire=false;CombatControls.release('mouse');}if(e.type==='pointercancel')CombatControls.reset();};
    ['pointerup','pointercancel','lostpointercapture'].forEach(t=>cv.addEventListener(t,endDrag));
    document.addEventListener('pointerup',e=>{if(e.pointerType!=='touch'&&e.button===0){this.mouseFire=false;CombatControls.release('mouse');}});
    document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==cv){this.mouseFire=false;CombatControls.reset();}else if(!this.lockHinted){this.lockHinted=true;showMsg('🖱 鼠标已接管视角：移动转向，左键射击，Esc 暂停',2.6);}});
    cv.addEventListener('contextmenu',e=>e.preventDefault());
    cv.addEventListener('wheel',e=>{if(!this.isPlaying()||!CombatControls.mouseEnabled)return;e.preventDefault();this.wheel+=Math.sign(e.deltaY);},{passive:false});
    window.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!isTouch&&this.onTouchDetected)this.onTouchDetected();},true);
    // Blank-area look sits below the joystick, action buttons and HUD.
    const lz=$('lookZone');
    lz.addEventListener('pointerdown',e=>{if(!this.isPlaying()||this.touchLook||(e.pointerType==='mouse'&&e.button!==0))return;e.preventDefault();lz.setPointerCapture(e.pointerId);const p=toStage(e.clientX,e.clientY);this.touchLook={id:e.pointerId,x:p.x,y:p.y};});
    lz.addEventListener('pointermove',e=>{const t=this.touchLook;if(!t||t.id!==e.pointerId)return;const p=toStage(e.clientX,e.clientY);this.look.yaw-=(p.x-t.x)*.0105;this.look.pitch-=(p.y-t.y)*.0085;t.x=p.x;t.y=p.y;});
    ['pointerup','pointercancel','lostpointercapture'].forEach(t=>lz.addEventListener(t,e=>{if(this.touchLook&&this.touchLook.id===e.pointerId)this.touchLook=null;}));
    // 每个控件独立捕获指针；菜单滚动不会占用摇杆。
    const jb=$('joyBase'),jk=$('joyKnob');
    jb.addEventListener('pointerdown',e=>{
      if(this.joy.id!==-1)return;
      e.preventDefault();jb.setPointerCapture(e.pointerId);
      const p=toStage(e.clientX,e.clientY);
      this.joy={id:e.pointerId,active:true,cx:p.x,cy:p.y,x:0,y:0};
      AudioSys.init();AudioSys.resume();
    });
    jb.addEventListener('pointermove',e=>{
      if(e.pointerId!==this.joy.id)return;
      const p=toStage(e.clientX,e.clientY);
      let x=(p.x-this.joy.cx)/45,y=(p.y-this.joy.cy)/45;
      const m=Math.hypot(x,y);if(m>1){x/=m;y/=m;}
      this.joy.x=x;this.joy.y=y;
      jk.style.left=(35+x*35)+'px';jk.style.top=(35+y*35)+'px';
    });
    const end=e=>{if(e.pointerId===this.joy.id){this.joy={active:false,id:-1,x:0,y:0};jk.style.left=jk.style.top='35px';}};
    ['pointerup','pointercancel','lostpointercapture'].forEach(t=>jb.addEventListener(t,end));
    const bind=(id,key)=>{
      const el=$(id);el._pointer=null;
      el.setAttribute('role','button');el.setAttribute('tabindex','0');
      el.addEventListener('pointerdown',e=>{
        if(el._pointer!==null)return;
        e.preventDefault();el._pointer=e.pointerId;el.setPointerCapture(e.pointerId);if(e.pointerType==='touch')this.lastTouchT=performance.now();
        if(!this.keys[key])this.pressed[key]=true;
        this.keys[key]=true;el.classList.add('on');AudioSys.init();AudioSys.resume();
      });
      const up=e=>{if(e.pointerId!==el._pointer)return;el._pointer=null;this.keys[key]=false;el.classList.remove('on');};
      ['pointerup','pointercancel','lostpointercapture'].forEach(t=>el.addEventListener(t,up));
    };
    ['J','K','U','I','H','O','L','X','SPRINT','R','Z'].forEach(k=>bind('v'+k,k));
    /* 暂停/切换视角是开关键：拖视角起手落在键上或滑过键面都会误触，改为只响应位移≤14px 的干净 tap；
       按住类按键（射击/跳跃等）保持 pointerdown 即时响应不影响手感。 */
    const tapToggle=(id,key)=>{const el=$(id);let d=null;
      el.setAttribute('role','button');el.setAttribute('tabindex','0');
      const release=()=>{if(this.keys[key]){this.keys[key]=false;el.classList.remove('on');}};
      el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);AudioSys.init();AudioSys.resume();
        if(e.pointerType==='touch'){d={x:e.clientX,y:e.clientY,id:e.pointerId};return;}
        this.pressed[key]=true;this.keys[key]=true;el.classList.add('on');});
      el.addEventListener('pointerup',e=>{if(e.pointerType!=='touch'){release();return;}
        if(!d||d.id!==e.pointerId)return;const moved=Math.hypot(e.clientX-d.x,e.clientY-d.y);d=null;if(moved>14)return;
        this.pressed[key]=true;this.keys[key]=true;el.classList.add('on');setTimeout(release,120);});
      ['pointercancel','lostpointercapture'].forEach(t=>el.addEventListener(t,()=>{d=null;release();}));
      el.addEventListener('click',e=>{if(e.detail===0){this.pressed[key]=true;this.keys[key]=true;setTimeout(release,120);}});
    };
    tapToggle('vC','C');
    {const el=$('vP');let d=null;
      el.addEventListener('pointerdown',e=>{e.preventDefault();if(e.pointerType==='touch'){d={x:e.clientX,y:e.clientY,id:e.pointerId};return;}if(this.onPause)this.onPause();});
      el.addEventListener('pointerup',e=>{if(e.pointerType!=='touch')return;if(!d||d.id!==e.pointerId)return;const moved=Math.hypot(e.clientX-d.x,e.clientY-d.y);d=null;if(moved<=14&&this.onPause)this.onPause();});
      ['pointercancel','lostpointercapture'].forEach(t=>el.addEventListener(t,()=>{d=null;}));
      el.addEventListener('click',e=>{if(e.detail===0&&this.onPause)this.onPause();});}
    // 触屏按钮按下会打开商店/建造面板，同一次点击随后合成的 click 会落到面板里手指下的卡片上
    // （曾误买物品/误选建筑）。取消触摸的默认点击合成。
    document.querySelectorAll('.vbtn,#joyBase,#lookZone').forEach(el=>{for(const t of ['touchstart','touchend'])el.addEventListener(t,e=>{if(e.cancelable)e.preventDefault();},{passive:false});});
    window.addEventListener('blur',()=>this.reset());
    window.addEventListener('resize',()=>this.reset());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();});
  },
  reset(){
    CombatControls.reset();
    this.resetLook();this.keys={};this.pressed={};this.joy={active:false,id:-1,x:0,y:0};this.mouseFire=false;this.wheel=0;
    $('joyKnob').style.left=$('joyKnob').style.top='35px';
    // Clear ownership immediately: some webviews defer lostpointercapture until
    // after a panel closes. A stale release must not cancel the next finger.
    document.querySelectorAll('.vbtn').forEach(el=>{const id=el._pointer;el._pointer=null;if(id!=null&&el.hasPointerCapture(id))el.releasePointerCapture(id);el.classList.remove('on');});
  },
  resetLook(){
    lookControl.clear();pitchControl.clear();this.look.yaw=this.look.pitch=0;
    const mouse=this.drag,touch=this.touchLook;this.drag=null;this.touchLook=null;
    for(const [el,p] of [[$('c3d'),mouse],[$('lookZone'),touch]])if(p&&el.hasPointerCapture(p.id))el.releasePointerCapture(p.id);
  },
  mapKey(c){
    return keyBindings.action(c);
  },
  network:null,
  firing(hasTarget=false){if(this.network)return !!(this.network.fire||(this.network.autoFire&&hasTarget));return this.isPlaying()&&!place.kind&&(isTouch?!!this.keys.J:CombatControls.firing(hasTarget));},
  axis(){
    let x=0,y=0;
    if(this.keys.left)x-=1;if(this.keys.right)x+=1;
    if(this.keys.up)y-=1;if(this.keys.down)y+=1;
    if(this.joy.active){x=this.joy.x;y=this.joy.y;}
    const m=Math.hypot(x,y);if(m>1){x/=m;y/=m;}
    return{x,y};
  },
  pop(k){if(this.network){const map={K:'jump',U:'grenade',I:'interact',H:'heal'},name=map[k]||k,i=(this.network.edges||[]).indexOf(name);if(i<0)return false;this.network.edges.splice(i,1);return true;}const v=this.pressed[k];this.pressed[k]=false;return v;},
  clearFrame(){this.pressed={};}
};
const coopSounds=createSoundRelay(AudioSys,['sfx'],()=>coopDriver?.config&&coopDriver.connection.host);
Input.init();
/* ================= Three.js 场景 ================= */
const renderer=new THREE.WebGLRenderer({canvas:$('c3d'),antialias:true});
renderer.setSize(BASE_W,BASE_H,false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.background=new THREE.Color(PAL.sky);
scene.fog=new THREE.Fog(PAL.fog,PAL.fogNear,PAL.fogFar);
const camera=new THREE.PerspectiveCamera(62,BASE_W/BASE_H,.1,950);
scene.add(camera); // first-person weapon model is parented to the camera
window.addEventListener('resize',()=>{renderer.setSize(BASE_W,BASE_H,false);camera.aspect=BASE_W/BASE_H;camera.updateProjectionMatrix();});
/* 镜头：第三人称（默认，五档预设）与第一人称；C 循环全部视角；鼠标/触屏拖动或 Q/E 自由转向 */
let camYaw=0,camPitch=0,camView=0,camMode='third',camYawVel=0;
const CAMERA_VIEWS=[{d:8.6,h:3.9,name:'近身跟随'},{d:13.5,h:8.2,name:'高位跟随'},{d:9,h:24,name:'战术俯视'},{d:5.5,h:1.8,name:'低位跟随'},{d:20,h:15,name:'战术远景'}];
const camState={target:new THREE.Vector3(),dist:8.6,init:false,inTunnel:0};
function behindYaw(){return player.inVehicle?player.inVehicle.yaw:player.yaw;}
function setCameraView(index,notify=true){
  camView=((index%CAMERA_VIEWS.length)+CAMERA_VIEWS.length)%CAMERA_VIEWS.length;
  if(camMode==='first')setCamMode('third',false);
  camYaw=behindYaw();camPitch=0;camState.init=false;delete player.lookHeading;Input.resetLook();
  if(notify)showMsg('视角：'+CAMERA_VIEWS[camView].name+'（C 切换视角）',1.4);
  syncViewLabels();
}
function setCamMode(mode,notify=true){
  camMode=mode==='first'?'first':'third';camPitch=0;camYaw=behindYaw();camState.init=false;delete player.lookHeading;Input.resetLook();
  try{localStorage.setItem('chongchao-person',camMode);}catch(_e){}
  if(camMode==='third'&&document.pointerLockElement)document.exitPointerLock&&document.exitPointerLock();
  if(notify)showMsg(camMode==='first'?'第一人称（C 切回第三人称）':'第三人称 · '+CAMERA_VIEWS[camView].name,1.4);
  syncViewLabels();
}
/* C 循环：各第三人称预设 → 第一人称 → 回到第一个预设 */
function cycleCamView(){
  if(camMode==='first')setCameraView(0);
  else if(camView+1>=CAMERA_VIEWS.length)setCamMode('first');
  else setCameraView(camView+1);
}
function syncViewLabels(){
  const label=camMode==='first'?'第一人称':'第三人称';
  if($('personBtn'))$('personBtn').textContent=label;
  if($('crosshair'))$('crosshair').classList.toggle('hidden',camMode!=='first');
}

/* 灯光：阳光阴影跟随玩家，远离基地也有清楚的投影 */
const hemi=new THREE.HemisphereLight(0x88aaff,0x37342d,.75);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffeecc,1.1);
const SUN_OFFSET=new THREE.Vector3(45,80,-35);
sun.position.copy(SUN_OFFSET);sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-48;sun.shadow.camera.right=48;sun.shadow.camera.top=48;sun.shadow.camera.bottom=-48;sun.shadow.bias=-.0004;sun.shadow.normalBias=.08;sun.shadow.camera.far=260;
scene.add(sun);scene.add(sun.target);
function updSun(p){
  // Snap to shadow texels so the moving shadow camera does not shimmer.
  const step=96/1024,x=Math.round(p.x/step)*step,z=Math.round(p.z/step)*step;
  sun.target.position.set(x,0,z);sun.position.set(x+SUN_OFFSET.x,SUN_OFFSET.y,z+SUN_OFFSET.z);
}

/* ---------- 地形：基地高台在 z<0 侧，野地朝 +z 延伸，最远处是虫巢 ---------- */
const WORLD={minX:-110,maxX:110,minZ:-70,maxZ:335,baseZ:-30};
/* 基地高台：整个基地地基高于平地，正面一条斜坡通向城门 */
const PLAT={H:5,x0:-38,x1:38,zFront:-10,rampW:7,rampTop:-14,rampBot:8,edge:5};
const GATE_TOP=PLAT.H+4.6; // 城门塔楼平台高度（绝对Y）
function smooth01(t){t=clamp(t,0,1);return t*t*(3-2*t);}
function plateauH(x,z){
  const e=PLAT.edge;
  const sx=smooth01(Math.min(x-PLAT.x0,PLAT.x1-x)/e);
  const sz=smooth01((PLAT.zFront-z)/e);
  let h=PLAT.H*Math.min(sx,sz);
  if(Math.abs(x)<PLAT.rampW+e&&z>PLAT.rampTop-2&&z<PLAT.rampBot){
    const t=clamp((PLAT.rampBot-z)/(PLAT.rampBot-PLAT.rampTop),0,1);
    const sxr=smooth01((PLAT.rampW+e-Math.abs(x))/e);
    h=Math.max(h,PLAT.H*t*sxr);
  }
  h=Math.max(h,rampartHeight(x,z));
  return h;
}
function terrainH(x,z){
  let h=Math.max(plateauH(x,z),hillHeight(x,z));
  const hills=[[0,150,22,8],[-40,160,14,5],[50,55,12,4]];
  for(const [hx,hz,r,hh] of hills){
    const d=Math.hypot(x-hx,z-hz);
    if(d<r)h=Math.max(h,hh*Math.cos(d/r*Math.PI/2)**2);
  }
  return hiveFloor(x,z,h);
}
/* 坡度过陡（悬崖）则地面单位不可通行，只能走斜坡 */
function tooSteep(x,z){
  if(rvOn())return false; // 房车公路是独立平地，不沿用基地地形坡度。
  const d=.6;
  const sx=Math.abs(terrainH(x+d,z)-terrainH(x-d,z));
  const sz=Math.abs(terrainH(x,z+d)-terrainH(x,z-d));
  return Math.max(sx,sz)/(2*d)>.75;
}
const groundMesh=(()=>{
  const g=new THREE.PlaneGeometry(WORLD.maxX-WORLD.minX,WORLD.maxZ-WORLD.minZ,220,405);
  g.rotateX(-Math.PI/2);
  const pos=g.attributes.position;
  for(let i=0;i<pos.count;i++)pos.setY(i,terrainH(pos.getX(i),pos.getZ(i)+(WORLD.maxZ+WORLD.minZ)/2));
  g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true}));
  m.position.z=(WORLD.maxZ+WORLD.minZ)/2;
  paintBattlefieldGround(m,environmentForChapter(1));
  m.receiveShadow=true;scene.add(m);return m;
})();
/* 装饰：侧翼掩体巨石（挡敌方酸液与走位，不挡我方子弹），移除无玩法作用的零散碎石。
   （原来地上的 260 个发光小锥体纯装饰、无玩法作用，v0.9.3 按用户要求去掉）
   网友反馈满地石头挡住怪物，中路与常用射界不再放置任何有碰撞的石头。 */
const rockColliders=[];
const COVER_ROCKS=[[-62,40,2.6],[-58,46,1.8],[66,70,2.8],[71,64,1.9],[-78,112,3],[-84,118,2],[82,140,2.8],[76,146,2],[-66,170,2.4],[64,166,2.6],[-96,70,3.2],[98,96,3]];
function clearOfFeatures(x,z,pad=0){
  return Math.abs(x)>=10+pad&&!(Math.abs(x+42)<10+pad&&Math.abs(z-49)<16+pad)&&!(Math.abs(x-30)<10+pad&&Math.abs(z-34)<12+pad)&&!HILL_FORTS.some(f=>Math.hypot(x-f.x,z-f.z)<f.r*.7+pad)&&tunnelDistance(x,z)>7+pad&&Math.hypot(x-HIVE.x,z-HIVE.z)>HIVE.r+10+pad;
}
(function deco(){
  const dummy=new THREE.Object3D();
  const rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),new THREE.MeshLambertMaterial({color:PAL.rock,flatShading:true}),COVER_ROCKS.length);
  COVER_ROCKS.forEach(([x,z,s],i)=>{
    const y=terrainH(x,z);rockColliders.push({x,z,r:s*.85,bottom:y-s*.5,top:y+s*1.1,cover:true});
    dummy.position.set(x,y+s*.35,z);dummy.rotation.set(0,i*1.9,0);dummy.scale.set(s,s*.8,s);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
  });
  rocks.name='battlefield-cover';rocks.castShadow=rocks.receiveShadow=true;scene.add(rocks);

})();

const fortress=new FortressWorld(scene,terrainH,PAL);
fortress.solids.push(...rockColliders);
const hive=new HiveWorld(scene,terrainH,PAL,fortress.solids);

/* ---------- 血条精灵 ---------- */
function makeHPBar(w=1.6,color='#3f6'){
  const cv=document.createElement('canvas');cv.width=64;cv.height=10;
  const tex=new THREE.CanvasTexture(cv);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true,depthWrite:false}));
  sp.scale.set(w,w*10/64,1);
  sp.userData={cv,tex,color,last:-1};
  return sp;
}
function updHPBar(sp,ratio){
  ratio=clamp(ratio,0,1);
  if(Math.abs(ratio-sp.userData.last)<.01)return;
  sp.userData.last=ratio;
  sp.visible=ratio<.995;
  const ctx=sp.userData.cv.getContext('2d');
  ctx.clearRect(0,0,64,10);
  ctx.fillStyle='rgba(0,0,0,.65)';ctx.fillRect(0,0,64,10);
  ctx.fillStyle=ratio>.5?sp.userData.color:(ratio>.25?'#fa0':'#f33');
  ctx.fillRect(1,1,62*ratio,8);
  sp.userData.tex.needsUpdate=true;
}

/* ---------- 粒子系统 ---------- */
const particles=[];
const partGeo=new THREE.SphereGeometry(.14,5,4);
function spawnParticles(pos,color,n=8,speed=6,life=.5,size=1,gravity=9){
  n=Math.min(n,Math.max(0,160-particles.length));
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(partGeo,new THREE.MeshBasicMaterial({color,transparent:true}));
    m.position.copy(pos);
    const a=rand(0,TAU),b=rand(-1,1);
    m.userData={vx:Math.cos(a)*speed*rand(.3,1),vy:rand(.5,1)*speed*.8*b+3,vz:Math.sin(a)*speed*rand(.3,1),life,t:0,g:gravity};
    m.scale.setScalar(size*rand(.6,1.4));
    scene.add(m);particles.push(m);
  }
}
function updParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i],u=p.userData;u.t+=dt;
    if(u.t>=u.life){scene.remove(p);p.material.dispose();particles.splice(i,1);continue;}
    p.position.x+=u.vx*dt;p.position.y+=u.vy*dt;p.position.z+=u.vz*dt;
    u.vy-=u.g*dt;
    p.material.opacity=1-u.t/u.life;
  }
}

/* ================= 数据定义 ================= */
// 武器精简为 6 把，每把一种独特机制（v0.9.1 按反馈删去战斗步枪/狙击/追踪导弹/轨道炮，
// 冲锋枪/轻机枪/加特林手感雷同，合并为「机枪」）。dps=dmg×弹丸/rate，可强化 Lv1-10（每级 +20% 伤害）。
const WEAPONS={
  lmg:{name:'机枪',dmg:8,rate:.08,range:32,speed:62,spread:.06,price:0,color:0xffcc44,sfx:'mg',auto:true,desc:'初始武器：中距离持续扫射，什么虫都能打'},
  shotgun:{name:'霰弹枪',dmg:11,rate:.62,range:19,speed:52,spread:.13,pellets:7,knock:.35,price:450,color:0xffaa66,sfx:'shoot',auto:true,desc:'一次7发弹丸，贴脸爆发并把虫击退'},
  launcher:{name:'榴弹炮',dmg:100,rate:.95,range:42,speed:30,spread:.02,price:900,color:0xff8844,sfx:'cannon',auto:true,explode:4.5,arc:true,desc:'自动抛射落到目标，大范围爆炸清虫群'},
  flamer:{name:'火焰喷射器',dmg:7,rate:.05,range:15,speed:28,spread:.12,price:1100,color:0xff6622,sfx:'mg',auto:true,flame:true,pierce:2,burn:35,desc:'火焰穿透3个敌人并点燃，持续灼烧'},
  laser:{beam:true,name:'脉冲激光炮',dmg:13,rate:.08,range:48,speed:170,spread:.006,price:1500,color:0x44ffff,sfx:'laser',auto:true,pierce:1,desc:'按住持续光束，越烧越烫(+30%)，贯穿2个敌人，远程打飞虫'},
  plasma:{name:'等离子炮',dmg:60,rate:.24,range:40,speed:52,spread:.025,price:2300,color:0xcc66ff,sfx:'shoot',auto:true,explode:2.8,desc:'最高秒伤的重型弹，小范围爆炸，打首领和厚甲'},
  rpg:{name:'RPG火箭筒',dmg:135,rate:1.25,range:46,speed:38,spread:.02,price:1300,color:0xff7733,sfx:'cannon',auto:true,explode:5,desc:'重型火箭弹：直飞命中后5米大范围爆炸，一发拆一片虫群和巢穴墙'},
  missilePod:{name:'四连导弹架',dmg:42,rate:1.15,range:44,speed:44,spread:.05,price:2100,color:0x77ffaa,sfx:'shoot',auto:true,explode:2.4,homing:.6,burst:4,desc:'扣一次扳机错开半拍连发4枚小型导弹，自动追目标，边跑边轰'},
};
// 旧存档里的已下架武器：并入机枪或按买价+强化花费退款
const LEGACY_WEAPONS={smg:{name:'冲锋枪',price:0,merge:'lmg'},rifle:{name:'战斗步枪',price:0,merge:'lmg'},minigun:{name:'加特林',price:1900,merge:'lmg'},sniper:{name:'狙击枪',price:650},missile:{name:'追踪导弹',price:2600},railgun:{name:'电磁轨道炮',price:3200}};
const WEAPON_MAX_LV=10;
function weaponLv(id){return Game.weaponLv[id]||0;}
function weaponMul(id){return 1+.2*weaponLv(id);}
function upgradeCost(price,lv){return Math.round(Math.max(300,price)*.35*(lv+1)/10)*10;}
function upgradePrice(id){return upgradeCost(WEAPONS[id].price,weaponLv(id));}
function classDamage(id){if(vsOn())return 1;const c=CLASSES[Game.cls];return c.specialty===id?c.damage:1;}
function weaponDps(id){const w=WEAPONS[id];return Math.round(w.dmg*(w.pellets||1)*(w.burst||1)/w.rate*weaponMul(id)*classDamage(id));}
const CLASSES={
  gunner:{specialty:'lmg',damage:1.25,armor:.85,name:'机枪兵',hp:120,speed:9.5,weapon:'lmg',weapons:['lmg'],color:0x3a7bd5},
  rifle:{specialty:'shotgun',damage:1.3,name:'火枪兵',hp:100,speed:10.5,weapon:'shotgun',weapons:['lmg','shotgun'],color:0xd58a3a},
  medic:{name:'医疗兵',hp:90,speed:10.5,weapon:'lmg',weapons:['lmg'],color:0x3ad57b,heal:4,aura:4,auraRange:12},
};
const VEHICLES={
  jeep:{name:'突击战车',hp:300,speed:17,dmg:10,rate:.09,range:30,price:800,seatH:1.2,scale:1,sfx:'mg',color:0x557a3a},
  tank:{name:'重型坦克',hp:900,speed:8,dmg:90,rate:1.4,range:42,price:2200,seatH:1.6,scale:1,sfx:'cannon',explode:4,color:0x4a5d23},
  mech:{name:'雷神机甲',hp:600,speed:11,dmg:22,rate:.14,range:34,price:1800,seatH:2.6,scale:1,sfx:'mg',color:0x7a8899},
  heli:{name:'武装直升机',hp:400,speed:19,dmg:14,rate:.1,range:36,price:2600,seatH:6,fly:true,sfx:'mg',color:0x3a5a7a},
};
const BUILDINGS={
  antiAir:{name:'防空激光塔',hp:400,price:650,dmg:34,rate:.35,range:52,desc:'专门锁定飞虫，光束即时命中'},
  wall:{name:'合金围墙',hp:500,price:100,desc:'阻挡虫群前进'},
  mgTurret:{name:'自动机枪塔',hp:250,price:300,dmg:7,rate:.14,range:26,desc:'自动扫射敌人'},
  cannonTurret:{name:'自动炮台',hp:350,price:700,dmg:60,rate:1.6,range:36,explode:3.5,desc:'范围爆炸伤害'},
  teslaTurret:{name:'特斯拉塔',hp:300,price:1100,dmg:30,rate:.7,range:20,desc:'电弧连锁，最多跳3个目标'},
  sniperTurret:{name:'狙击炮台',hp:280,price:1000,dmg:160,rate:1.9,range:55,desc:'超远程精确狙杀'},
  bunker:{name:'重型堡垒',hp:1200,price:1200,dmg:12,rate:.12,range:30,desc:'超高血量+双联机枪'},
  cryoTurret:{name:'寒霜脉冲塔',hp:380,price:900,dmg:18,rate:.8,range:30,desc:'冰霜脉冲波及5米内最多6只虫，减速2秒；首领减速较弱'},
  mortarTurret:{name:'重型迫击炮',hp:450,price:1400,dmg:180,rate:2.4,range:64,explode:7,desc:'64米预判抛射，爆炸覆盖7米，专打地面虫群'},
};
const ITEMS={
  medkit:{name:'医疗包',price:120,desc:'按H回复60生命(按最大生命比例增强)',heal:60},
  shield:{name:'护盾电池',price:300,desc:'获得60点能量护盾(上限150)',shield:60},
  adren:{name:'肾上腺素',price:250,desc:'20秒内移速+40%、射速+40%',buff:20},
  hpUp:{name:'强化装甲',price:500,desc:'最大生命+40',permanent:true},
  magnet:{name:'磁力收集器',price:800,desc:'永久：拾取物自动吸附范围大增',permanent:true},
  regen:{name:'再生背心',price:1000,desc:'永久：每秒回复2生命',permanent:true},
  repair:{name:'基地维修包',price:400,desc:'基地回复25%耐久(至少500)'},
};
/* 精英词缀：战中出现，属性强化+特效 */
const ELITES={
  swift:{name:'迅捷',color:0x66ff66,speedMul:1.5,hpMul:1.6},
  armored:{name:'坚甲',color:0x88aaff,hpMul:3,dmgMul:1.2},
  savage:{name:'狂暴',color:0xff4488,dmgMul:2.2,speedMul:1.2},
  venom:{name:'剧毒',color:0xaaff44,ranged:true,dmgMul:1.3},
  bomber:{name:'爆死',color:0xff8822,explodeOnDie:true,hpMul:1.5},
  giant:{name:'巨型',color:0xffcc00,scaleMul:1.55,hpMul:2.4,dmgMul:1.5},
};
/* 10章怪物图鉴：颜色/体型/能力递增；bs=BOSS技能池（冲锋/弹幕/召唤） */
/* 敌人曲线整体放缓：原第6章分裂虫子代满伤害、血量曲线远超武器成长，导致“根本过不了”。
   tip 为推荐打法，显示在章节开场。 */
const CHAPTERS=[
  {name:'虫族小兵',color:0xcc6633,boss:'巨颚虫王',bossColor:0xff5522,mob:{hp:30,dmg:8,speed:5,gold:12},legs:4,bs:['charge'],tip:'任何武器都好用，先攒钱买枪'},
  {name:'酸液虫',color:0x88cc22,boss:'毒雾之母',bossColor:0xaaff22,mob:{hp:45,dmg:9,speed:5.4,gold:15},legs:4,ranged:true,bs:['barrage'],tip:'会远程吐酸：躲到侧翼巨石后，或用激光远程先手'},
  {name:'甲壳战虫',color:0x8866aa,boss:'装甲暴君',bossColor:0xbb66ff,mob:{hp:75,dmg:11,speed:4.6,gold:19},legs:6,bs:['charge'],tip:'皮厚但慢：霰弹枪和榴弹炮效率高'},
  {name:'迅猛飞虫',color:0x44bbcc,boss:'风暴翼后',bossColor:0x33eeff,mob:{hp:60,dmg:11,speed:7.5,gold:22},legs:2,fly:true,bs:['barrage'],tip:'会飞越城墙：造防空塔，激光远程打飞虫'},
  {name:'炎爆虫',color:0xdd4422,boss:'熔岩巨兽',bossColor:0xff3300,mob:{hp:95,dmg:13,speed:5,gold:26},legs:4,explodeOnDie:true,bs:['charge','barrage'],tip:'死亡会爆炸：保持距离，别贴脸'},
  {name:'寄生蛛虫',color:0x99aa33,boss:'万蛛之巢',bossColor:0xccdd11,mob:{hp:85,dmg:12,speed:6,gold:29},legs:8,split:true,bs:['summon','charge'],tip:'死亡后分裂成小虫：火焰/榴弹范围伤害一起清'},
  {name:'雷鞭虫',color:0x3366ee,boss:'雷暴主宰',bossColor:0x5588ff,mob:{hp:115,dmg:14,speed:5.8,gold:33},legs:6,ranged:true,bs:['barrage','summon'],tip:'远程电鞭：利用城墙与掩体，炮台帮忙'},
  {name:'幽影刺虫',color:0x555577,boss:'虚空猎手',bossColor:0x8888cc,mob:{hp:110,dmg:16,speed:7.6,gold:37},legs:4,stealth:true,bs:['charge'],tip:'半透明高速：看小地图红点，激光自动锁定'},
  {name:'钢铁巨虫',color:0x777777,boss:'泰坦碾压者',bossColor:0xaaaaaa,mob:{hp:190,dmg:18,speed:4.2,gold:42},legs:6,bs:['charge','summon'],tip:'超厚装甲：强化后的等离子炮、榴弹炮'},
  {name:'虫族亲卫',color:0xaa2255,boss:'虫巢意志',bossColor:0xff0066,mob:{hp:175,dmg:20,speed:6.6,gold:48},legs:8,ranged:true,bs:['barrage','summon','charge'],tip:'最终章：小队+炮台+载具一起守，也可突袭虫巢削弱虫潮'},
];

/* ================= 模型构建（纯代码几何体） ================= */
/**
 * img2threejs-style factory — Mobile Infantry trooper (星河战队步兵).
 * Procedural power-armor with named nodes, gun socket, leg pivots, sculptRuntime.
 */
function createMobileInfantryModel(spec){
  spec=spec||{};
  const color=spec.color!=null?spec.color:0xd5d53a;
  const root=new THREE.Group();
  root.name='MobileInfantryRoot';
  const armor=new THREE.MeshLambertMaterial({color});
  const dark=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(.42)});
  const trim=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(.78)});
  const visorM=new THREE.MeshBasicMaterial({color:0x66eeff,transparent:true,opacity:.92});
  const nodes={};

  const pack=new THREE.Mesh(new THREE.BoxGeometry(.58,.78,.38),dark);
  pack.position.set(0,1.34,-.3);pack.castShadow=true;root.add(pack);nodes.backpack=pack;

  const torso=new THREE.Mesh(new THREE.BoxGeometry(.74,1.08,.44),armor);
  torso.position.set(0,1.14,0);torso.castShadow=true;root.add(torso);nodes.torso=torso;

  const chest=new THREE.Mesh(new THREE.BoxGeometry(.52,.36,.1),trim);
  chest.position.set(0,1.36,.24);root.add(chest);

  const belt=new THREE.Mesh(new THREE.BoxGeometry(.68,.14,.46),dark);
  belt.position.set(0,.72,.02);root.add(belt);

  const helmet=new THREE.Mesh(new THREE.SphereGeometry(.34,12,10),armor);
  helmet.scale.set(1,.9,1.06);helmet.position.set(0,1.92,0);helmet.castShadow=true;
  root.add(helmet);nodes.helmet=helmet;

  const crest=new THREE.Mesh(new THREE.BoxGeometry(.12,.22,.28),trim);
  crest.position.set(0,2.18,.02);root.add(crest);

  const visor=new THREE.Mesh(new THREE.BoxGeometry(.44,.15,.2),visorM);
  visor.position.set(0,1.94,.3);root.add(visor);nodes.visor=visor;

  for(const s of[-1,1]){
    const pad=new THREE.Mesh(new THREE.BoxGeometry(.3,.2,.34),trim);
    pad.position.set(.48*s,1.56,.04);pad.castShadow=true;root.add(pad);
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(.11,.1,.52,6),armor);
    arm.rotation.z=Math.PI/2;arm.position.set(.58*s,1.26,.12);arm.castShadow=true;root.add(arm);
  }

  const gun=new THREE.Mesh(new THREE.BoxGeometry(.14,.14,1.05),dark);
  gun.position.set(.34,1.16,.72);gun.castShadow=true;root.add(gun);nodes.gun=gun;

  const legL=new THREE.Mesh(new THREE.BoxGeometry(.22,.62,.24),dark);
  legL.position.set(-.22,.31,0);legL.castShadow=true;root.add(legL);
  const legR=legL.clone();legR.position.x=.22;root.add(legR);
  const bootL=new THREE.Mesh(new THREE.BoxGeometry(.24,.18,.34),armor);
  bootL.position.set(-.22,.08,.06);bootL.castShadow=true;root.add(bootL);
  const bootR=bootL.clone();bootR.position.x=.22;root.add(bootR);

  root.userData.legs=[legL,legR];
  root.userData.gun=gun;
  root.userData.sculptRuntime={
    nodes,legs:[legL,legR],gun,
    spec:{color},factory:'createMobileInfantryModel'
  };
  root.userData.tick=function(dt,t){
    if(nodes.visor)nodes.visor.material.opacity=.78+Math.sin(t*6)*.18;
    if(nodes.helmet)nodes.helmet.position.y=1.92+Math.sin(t*3.2)*.012;
    if(nodes.torso)nodes.torso.rotation.x=Math.sin(t*2)*.01;
  };
  return root;
}
function makeSoldier(color){
  if(versusBackup)return militarySoldier(THREE,player?.team||'blue',Game.curWeapon);
  return visualAssets ? visuals.soldier(color) : createMobileInfantryModel({color});
}
function makeBug(color,legs=4,scale=1,fly=false){
  if(visualAssets)return visuals.bug(scale,'mob',fly);
  const grp=new THREE.Group();
  const mat=new THREE.MeshLambertMaterial({color});
  const dark=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(.5)});
  const body=new THREE.Mesh(new THREE.SphereGeometry(.7,10,8),mat);
  body.scale.set(1,.7,1.4);body.position.y=.7;body.castShadow=true;grp.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.4,8,6),mat);head.position.set(0,.75,.95);grp.add(head);
  const eyeM=new THREE.MeshBasicMaterial({color:0xff2200});
  for(const s of[-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(.1,6,4),eyeM);e.position.set(.18*s,.9,1.25);grp.add(e);}
  for(const s of[-1,1]){ // 大颚
    const jaw=new THREE.Mesh(new THREE.ConeGeometry(.09,.5,4),dark);
    jaw.position.set(.25*s,.6,1.25);jaw.rotation.x=Math.PI/2.4;jaw.rotation.z=-.4*s;grp.add(jaw);
  }
  const legGroup=[];
  const nSide=Math.max(1,Math.floor(legs/2));
  for(let i=0;i<nSide;i++)for(const s of[-1,1]){
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.05,.03,1.1,4),dark);
    leg.position.set(.62*s,.45,-.5+i*(1.4/nSide));
    leg.rotation.z=s*.9;grp.add(leg);legGroup.push(leg);
  }
  if(fly){
    const wingM=new THREE.MeshBasicMaterial({color:0xccffee,transparent:true,opacity:.4,side:THREE.DoubleSide});
    for(const s of[-1,1]){
      const w=new THREE.Mesh(new THREE.PlaneGeometry(1.4,.5),wingM);
      w.position.set(.8*s,1.1,0);w.rotation.z=s*.3;grp.add(w);grp.userData['wing'+(s>0?'R':'L')]=w;
    }
  }
  grp.userData.legGroup=legGroup;
  grp.scale.setScalar(scale);
  return grp;
}

/**
 * img2threejs-style factory — Klendathu arachnid (BOSS / mini-BOSS).
 * Procedural rebuild with named nodes, leg pivots, mandible sockets, sculptRuntime.
 */
function createArachnidBugModel(spec){
  spec=spec||{};
  const color=spec.color!=null?spec.color:0xff5522;
  const legs=spec.legs!=null?spec.legs:4;
  const fly=!!spec.fly;
  const scale=spec.scale!=null?spec.scale:1;
  const isBoss=!!spec.boss;
  const root=new THREE.Group();
  root.name='ArachnidBugRoot';
  const carapace=new THREE.MeshLambertMaterial({color});
  const chitin=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(.72)});
  const dark=new THREE.MeshLambertMaterial({color:new THREE.Color(color).multiplyScalar(.42)});
  const eyeM=new THREE.MeshBasicMaterial({color:0xff1100});
  const nodes={};

  const abdomen=new THREE.Mesh(new THREE.SphereGeometry(.85,12,10),carapace);
  abdomen.scale.set(1.05,.75,1.55);abdomen.position.set(0,.85,-.35);abdomen.castShadow=true;
  root.add(abdomen);nodes.abdomen=abdomen;
  for(let i=0;i<5;i++){
    const seg=new THREE.Mesh(new THREE.TorusGeometry(.62-i*.09,.07,5,10),chitin);
    seg.rotation.x=Math.PI/2;seg.position.set(0,.78,-.15-i*.28);root.add(seg);
  }
  const thorax=new THREE.Mesh(new THREE.SphereGeometry(.62,12,10),carapace);
  thorax.scale.set(1.1,.82,1.15);thorax.position.set(0,.95,.55);thorax.castShadow=true;
  root.add(thorax);nodes.thorax=thorax;
  const head=new THREE.Mesh(new THREE.SphereGeometry(.46,12,10),carapace);
  head.scale.set(1.15,.95,1.05);head.position.set(0,1.02,1.05);head.castShadow=true;
  root.add(head);nodes.head=head;
  for(const s of[-1,1]){
    const eye=new THREE.Mesh(new THREE.SphereGeometry(isBoss?.13:.1,8,6),eyeM);
    eye.position.set(.22*s,1.12,1.38);root.add(eye);
    const brow=new THREE.Mesh(new THREE.BoxGeometry(.18,.06,.12),dark);
    brow.position.set(.24*s,1.2,1.28);brow.rotation.z=.25*s;root.add(brow);
  }
  const mandibles=[];
  for(const s of[-1,1]){
    const pivot=new THREE.Group();pivot.position.set(.32*s,.82,1.18);
    const jaw=new THREE.Mesh(new THREE.ConeGeometry(.11,.72,5),dark);
    jaw.rotation.x=Math.PI/2.1;jaw.rotation.z=-.35*s;jaw.position.set(0,0,.36);
    pivot.add(jaw);
    const fang=new THREE.Mesh(new THREE.ConeGeometry(.04,.22,4),new THREE.MeshBasicMaterial({color:0xffffaa}));
    fang.rotation.x=Math.PI/2;fang.position.set(0,-.04,.62);pivot.add(fang);
    root.add(pivot);mandibles.push(pivot);
  }
  nodes.mandibles=mandibles;
  for(let i=0;i<(isBoss?5:3);i++){
    const spine=new THREE.Mesh(new THREE.ConeGeometry(.06,.45,4),chitin);
    spine.position.set(0,1.05+.08*i,.15-i*.18);spine.rotation.x=-.35;root.add(spine);
  }
  if(fly){
    const wingM=new THREE.MeshBasicMaterial({color:0xccffee,transparent:true,opacity:.38,side:THREE.DoubleSide});
    for(const s of[-1,1]){
      const w=new THREE.Mesh(new THREE.PlaneGeometry(isBoss?2.1:1.6,isBoss?.72:.55),wingM);
      w.position.set(1.05*s,1.35,.05);w.rotation.z=s*.32;root.add(w);
      root.userData[s>0?'wingR':'wingL']=w;
    }
  }
  const legGroup=[];
  const legPivots=[];
  const nSide=Math.max(1,Math.floor(legs/2));
  for(let i=0;i<nSide;i++)for(const s of[-1,1]){
    const hip=new THREE.Group();
    hip.position.set(.78*s,.62,-.55+i*(1.35/nSide));
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(.07,.05,.75,5),dark);
    upper.rotation.z=s*.95;upper.position.set(0,-.35,0);upper.castShadow=true;
    const knee=new THREE.Group();knee.position.set(0,-.7,0);
    const lower=new THREE.Mesh(new THREE.CylinderGeometry(.05,.025,.85,4),dark);
    lower.rotation.z=s*.25;lower.position.set(0,-.42,0);
    const claw=new THREE.Mesh(new THREE.ConeGeometry(.05,.18,4),chitin);
    claw.rotation.x=Math.PI;claw.position.set(0,-.88,0);
    knee.add(lower);knee.add(claw);hip.add(upper);hip.add(knee);
    root.add(hip);legGroup.push(knee);legPivots.push(hip);
  }
  root.userData.legGroup=legGroup;
  root.userData.sculptRuntime={nodes,legGroup,legPivots,mandibles,spec:{color,legs,fly,scale,boss:isBoss},factory:'createArachnidBugModel'};
  root.userData.tick=function(dt,t){
    mandibles.forEach(function(m,i){m.rotation.x=Math.sin(t*6+i)*.18;});
    if(nodes.head)nodes.head.position.y=1.02+Math.sin(t*4)*.015;
  };
  root.scale.setScalar(scale);
  return root;
}

function makeVehicleMesh(kind){
  if(vsOn()&&BF_VEHICLES[kind])return militaryVehicle(THREE,kind);
  if(kind==='rv')return makeRVMesh(THREE);
  if(visualAssets&&kind==='mech')return visuals.mech();
  const cfg=VEHICLES[kind];
  const grp=new THREE.Group();
  const mat=new THREE.MeshLambertMaterial({color:cfg.color});
  const dark=new THREE.MeshLambertMaterial({color:0x222222});
  if(kind==='jeep'){
    const b=new THREE.Mesh(new THREE.BoxGeometry(2,.8,3.4),mat);b.position.y=.9;b.castShadow=true;grp.add(b);
    const top=new THREE.Mesh(new THREE.BoxGeometry(1.6,.5,1.4),mat);top.position.set(0,1.5,-.4);grp.add(top);
    // 枪架放在座舱后方的转轴上，转视角/瞄准时整支架跟着转，枪口就在管子前端
    const mount=new THREE.Group();mount.position.set(0,1.75,-.35);grp.add(mount);grp.userData.turret=mount;
    const gun=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,1.6),dark);gun.position.set(0,.15,.9);mount.add(gun);grp.userData.gun=gun;
    for(const [x,z] of [[-1,1.1],[1,1.1],[-1,-1.1],[1,-1.1]]){
      const w=new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,.3,10),dark);
      w.rotation.z=Math.PI/2;w.position.set(x,.45,z);grp.add(w);
    }
  }else if(kind==='tank'){
    const b=new THREE.Mesh(new THREE.BoxGeometry(2.6,1,4.2),mat);b.position.y=1;b.castShadow=true;grp.add(b);
    const tr=new THREE.Mesh(new THREE.BoxGeometry(.7,.9,4.4),dark);tr.position.set(-1.4,.6,0);grp.add(tr);
    const tr2=tr.clone();tr2.position.x=1.4;grp.add(tr2);
    // 炮塔单独成组：炮管是塔上的子件，转向时炮塔一起转，炮口=炮管前端
    const tur=new THREE.Group();tur.position.set(0,1.9,0);grp.add(tur);grp.userData.turret=tur;
    const dome=new THREE.Mesh(new THREE.CylinderGeometry(1,1.2,.7,10),mat);tur.add(dome);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.14,.17,3.4,8),dark);
    barrel.rotation.x=Math.PI/2;barrel.position.set(0,.1,1.8);tur.add(barrel);grp.userData.gun=barrel;
  }else if(kind==='mech'){
    const b=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.6,1.1),mat);b.position.y=2.6;b.castShadow=true;grp.add(b);
    const head=new THREE.Mesh(new THREE.BoxGeometry(.8,.6,.8),mat);head.position.y=3.7;grp.add(head);
    const visor=new THREE.Mesh(new THREE.BoxGeometry(.6,.15,.1),new THREE.MeshBasicMaterial({color:0xff4444}));visor.position.set(0,3.75,.45);grp.add(visor);
    for(const s of[-1,1]){
      const leg=new THREE.Mesh(new THREE.BoxGeometry(.5,1.8,.7),dark);leg.position.set(.55*s,.9,0);leg.castShadow=true;grp.add(leg);
      const shoulder=new THREE.Group();shoulder.position.set(1.1*s,2.6,-.3);grp.add(shoulder);
      const arm=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,1.8),dark);arm.position.set(0,0,.9);shoulder.add(arm);
      if(s>0){grp.userData.turret=shoulder;grp.userData.gun=arm;}
    }
  }else if(kind==='heli'){
    const b=new THREE.Mesh(new THREE.SphereGeometry(1.1,10,8),mat);b.scale.set(.9,.8,1.8);b.position.y=1.2;b.castShadow=true;grp.add(b);
    const tail=new THREE.Mesh(new THREE.CylinderGeometry(.15,.3,3,6),mat);tail.rotation.x=Math.PI/2;tail.position.set(0,1.4,-2.6);grp.add(tail);
    const rotor=new THREE.Mesh(new THREE.BoxGeometry(6,.06,.3),dark);rotor.position.y=2.3;grp.add(rotor);grp.userData.rotor=rotor;
    const mount=new THREE.Group();mount.position.set(0,.6,.2);grp.add(mount);grp.userData.turret=mount;
    const gun=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,1.6),dark);gun.position.set(0,0,.9);mount.add(gun);grp.userData.gun=gun;
  }
  return visualAssets?visuals.restyle(grp):grp;
}
function makeBuildingMesh(kind){
  const grp=new THREE.Group();
  if(kind==='wall'){
    const m=new THREE.Mesh(new THREE.BoxGeometry(WALL_WIDTH,COVER_HEIGHT-.16,WALL_DEPTH),new THREE.MeshLambertMaterial({color:0x8899aa}));
    m.position.y=(COVER_HEIGHT-.16)/2;m.castShadow=true;m.receiveShadow=true;grp.add(m);
    const top=new THREE.Mesh(new THREE.BoxGeometry(WALL_WIDTH,.16,WALL_DEPTH),new THREE.MeshLambertMaterial({color:0x667788}));top.position.y=COVER_HEIGHT-.08;grp.add(top);
  }else if(kind==='antiAir'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.5,1.2,10),new THREE.MeshLambertMaterial({color:0xf6dfae}));base.position.y=.6;grp.add(base);
    const head=new THREE.Group();head.position.y=1.8;grp.add(head);
    for(const side of [-1,1]){const gun=new THREE.Mesh(new THREE.CylinderGeometry(.14,.22,2,8),new THREE.MeshLambertMaterial({color:0x53b4ae}));gun.position.set(side*.55,.4,.5);gun.rotation.x=Math.PI/3;head.add(gun);}
    const dish=new THREE.Mesh(new THREE.TorusGeometry(.5,.1,6,12),new THREE.MeshLambertMaterial({color:0xf5b957}));dish.position.y=.7;head.add(dish);grp.userData.head=head;
  }else if(kind==='mgTurret'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1,1.3,1,8),new THREE.MeshLambertMaterial({color:0x556677}));base.position.y=.5;base.castShadow=true;grp.add(base);
    const head=new THREE.Mesh(new THREE.BoxGeometry(1,.7,1),new THREE.MeshLambertMaterial({color:0x7788aa}));head.position.y=1.4;grp.add(head);
    const gun=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,1.5),new THREE.MeshLambertMaterial({color:0x222222}));gun.position.set(0,1.45,.8);grp.add(gun);
    grp.userData.head=head;grp.userData.gun=gun;
  }else if(kind==='cannonTurret'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.3,1.6,1.2,8),new THREE.MeshLambertMaterial({color:0x664433}));base.position.y=.6;base.castShadow=true;grp.add(base);
    const head=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshLambertMaterial({color:0x996644}));head.position.y=1.8;grp.add(head);
    const gun=new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,2.4,8),new THREE.MeshLambertMaterial({color:0x332211}));
    gun.rotation.x=Math.PI/2.6;gun.position.set(0,2.4,1);grp.add(gun);
    grp.userData.head=head;grp.userData.gun=gun;
  }else if(kind==='teslaTurret'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.2,1,8),new THREE.MeshLambertMaterial({color:0x445566}));base.position.y=.5;base.castShadow=true;grp.add(base);
    const coil=new THREE.Mesh(new THREE.TorusGeometry(.5,.12,6,12),new THREE.MeshLambertMaterial({color:0x8866cc}));coil.rotation.x=Math.PI/2;coil.position.y=1.5;grp.add(coil);
    const orb=new THREE.Mesh(new THREE.SphereGeometry(.38,10,8),new THREE.MeshBasicMaterial({color:0xcc88ff}));orb.position.y=2.1;grp.add(orb);grp.userData.head=orb;
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.15,.5,6),new THREE.MeshLambertMaterial({color:0x8866cc}));tip.position.y=2.6;grp.add(tip);
  }else if(kind==='sniperTurret'){
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1,1.3,1,8),new THREE.MeshLambertMaterial({color:0x3d4a5c}));base.position.y=.5;base.castShadow=true;grp.add(base);
    const head=new THREE.Mesh(new THREE.BoxGeometry(.9,.6,1.4),new THREE.MeshLambertMaterial({color:0x6688aa}));head.position.y=1.5;grp.add(head);
    const gun=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,2.8,8),new THREE.MeshLambertMaterial({color:0x223344}));
    gun.rotation.x=Math.PI/2;gun.position.set(0,1.6,.9);grp.add(gun);
    const scope=new THREE.Mesh(new THREE.BoxGeometry(.16,.16,.5),new THREE.MeshBasicMaterial({color:0x66ffff}));scope.position.set(0,1.85,.6);grp.add(scope);
    grp.userData.head=head;grp.userData.gun=gun;
  }else if(kind==='cryoTurret'||kind==='mortarTurret'){
    const frost=kind==='cryoTurret';
    const steel=new THREE.MeshLambertMaterial({color:0x465568});
    const dark=new THREE.MeshLambertMaterial({color:0x222b36});
    const light=new THREE.MeshBasicMaterial({color:frost?0x72dfff:0xffb85a});
    const base=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.45,.85,8),steel);
    base.position.y=.43;base.castShadow=true;grp.add(base);
    const head=new THREE.Group();head.position.y=1.55;grp.add(head);grp.userData.head=head;
    const housing=new THREE.Mesh(new THREE.BoxGeometry(1.45,.75,1.2),steel);
    housing.castShadow=true;head.add(housing);
    if(frost){
      for(const x of[-.42,.42]){
        const coil=new THREE.Mesh(new THREE.CylinderGeometry(.2,.25,1.5,8),dark);
        coil.rotation.x=Math.PI/2;coil.position.set(x,.1,.75);head.add(coil);
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.25,.06,5,10),light);
        ring.position.set(x,.1,1.45);head.add(ring);
      }
      const tank=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,1.2,8),steel);
      tank.position.set(0,.1,-.7);head.add(tank);
    }else{
      const tube=new THREE.Mesh(new THREE.CylinderGeometry(.3,.4,2.5,8),dark);
      tube.rotation.x=Math.PI/3;tube.position.set(0,.65,.65);tube.castShadow=true;head.add(tube);
      const band=new THREE.Mesh(new THREE.TorusGeometry(.34,.07,5,10),light);
      band.rotation.x=-Math.PI/6;band.position.set(0,1.28,1.72);head.add(band);
    }
  }else if(kind==='bunker'){
    const m=new THREE.Mesh(new THREE.BoxGeometry(4,2.6,4),new THREE.MeshLambertMaterial({color:0x777f66}));m.position.y=1.3;m.castShadow=true;grp.add(m);
    const top=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.6,1,8),new THREE.MeshLambertMaterial({color:0x99a077}));top.position.y=3.1;grp.add(top);
    const g1=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,1.6),new THREE.MeshLambertMaterial({color:0x111111}));g1.position.set(-.3,3.2,.9);grp.add(g1);
    const g2=g1.clone();g2.position.x=.3;grp.add(g2);
    grp.userData.head=top;
  }
  return visualAssets?visuals.restyle(grp):grp;
}
/* ================= 游戏状态 ================= */
const Game={
  state:'menu', // menu / prep / battle / paused / over / win
  loop:1,chapter:1,level:1,
  gold:0,score:0,cls:'gunner',testMode:false,difficulty:'normal',
  weapons:['lmg'],curWeapon:'lmg',weaponLv:{},
  items:{medkit:2},
  hpBonus:0,
  vehiclesOwned:[],squadCount:0,squadGear:[],opsCompleted:{},squadOrder:'follow',squadAutoDefense:true,lastBattle:null,battleLedger:null,
  hive:{loop:1,chapter:1,queen:1,killed:false},
  magnet:false,regen:false,
  wave:{total:0,spawned:0,killed:0,timer:0,bossSpawned:false},
  pausedFrom:'prep',
  msgTimer:0,
};
const monsters=[],bullets=[],buildings=[],vehicles=[],squad=[],pickups=[],airdrops=[];

/* ---------- 基地 ---------- */
const base={hp:2000,maxHp:2000,mesh:null,pos:new THREE.Vector3(-12,0,-42),bar:null};
(function buildBase(){
  const grp=new THREE.Group();
  const m1=new THREE.MeshLambertMaterial({color:0x88aacc});
  const core=new THREE.Mesh(new THREE.CylinderGeometry(3,4,6,8),m1);core.position.y=3;core.castShadow=true;grp.add(core);
  const dome=new THREE.Mesh(new THREE.SphereGeometry(3,10,8,0,TAU,0,Math.PI/2),new THREE.MeshLambertMaterial({color:0x66ddff,transparent:true,opacity:.8}));
  dome.position.y=6;grp.add(dome);
  const beacon=new THREE.PointLight(0x66ccff,1.4,30);beacon.position.y=8;grp.add(beacon);
  const ant=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,4,4),m1);ant.position.y=9;grp.add(ant);
  // 停机坪
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(6,6,.3,16),new THREE.MeshLambertMaterial({color:0x445566}));
  pad.position.set(24,.15,4);pad.receiveShadow=true;grp.add(pad);
  const padRing=new THREE.Mesh(new THREE.TorusGeometry(5,.15,6,24),new THREE.MeshBasicMaterial({color:0xffcc44}));
  padRing.rotation.x=Math.PI/2;padRing.position.set(24,.35,4);grp.add(padRing);
  grp.position.copy(base.pos);
  grp.position.y=terrainH(base.pos.x,base.pos.z);
  base.pos.copy(grp.position); // Combat targets must share the rendered core's height.
  scene.add(grp);base.mesh=grp;
  base.bar=makeHPBar(6,'#fc0');base.bar.position.set(0,10.5,0);grp.add(base.bar);updHPBar(base.bar,1);
})();

/* ---------- 基地内部设施：医疗平台 ---------- */
const healPad={pos:new THREE.Vector3(-2,0,-32),r:3};
(function buildBaseProps(){
  const py=PLAT.H;
  // 医疗平台（站上去持续回血）
  const padG=new THREE.Group();
  const slab=new THREE.Mesh(new THREE.CylinderGeometry(3,3.3,.3,20),new THREE.MeshLambertMaterial({color:0x2a5d3a}));
  slab.position.y=.15;slab.receiveShadow=true;padG.add(slab);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.6,.14,6,24),new THREE.MeshBasicMaterial({color:0x44ff88}));
  ring.rotation.x=Math.PI/2;ring.position.y=.32;padG.add(ring);
  const cr1=new THREE.Mesh(new THREE.BoxGeometry(1.1,.34,.34),new THREE.MeshBasicMaterial({color:0x66ff99}));
  const cr2=new THREE.Mesh(new THREE.BoxGeometry(.34,.34,1.1),new THREE.MeshBasicMaterial({color:0x66ff99}));
  cr1.position.y=cr2.position.y=.6;padG.add(cr1);padG.add(cr2);
  const padLight=new THREE.PointLight(0x44ff88,.8,10);padLight.position.y=2;padG.add(padLight);
  padG.position.set(healPad.pos.x,py,healPad.pos.z);
  scene.add(padG);
  // Keep functional healing only; the old radar, lamps, crates and flag cluttered the ramps.

})();

/* ---------- 城门（唯一正门，可开关）与四周城墙 ---------- */
const gate={open:true,hp:2500,maxHp:2500,mesh:null,door:null,bar:null,pos:new THREE.Vector3(0,0,-16),dead:false,auto:false,autoT:0,hold:0};
(function buildGate(){
  const grp=new THREE.Group();
  const postM=new THREE.MeshLambertMaterial({color:0x667788});
  for(const s of[-1,1]){
    const post=new THREE.Mesh(new THREE.BoxGeometry(2,5.6,2),postM);
    post.position.set(7*s,2.8,0);post.castShadow=true;grp.add(post);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.28,6,5),new THREE.MeshBasicMaterial({color:0x66ffcc}));
    lamp.position.set(7*s,5.9,0);grp.add(lamp);
  }
  const door=new THREE.Mesh(new THREE.BoxGeometry(12,4.6,.9),new THREE.MeshLambertMaterial({color:0x9aa8ba}));
  door.position.y=2.3;door.castShadow=true;grp.add(door);gate.door=door;
  grp.position.set(gate.pos.x,terrainH(gate.pos.x,gate.pos.z),gate.pos.z);
  scene.add(grp);gate.mesh=grp;
  gate.bar=makeHPBar(5,'#6cf');gate.bar.position.y=6.6;grp.add(gate.bar);updHPBar(gate.bar,1);
})();
function setGate(open,manual=true){
  if(gate.dead){showMsg('城门已损毁，下关修复',1.4);return;}
  gate.open=open;AudioSys.sfx('vehicle');
  if(manual){gate.auto=false;gate.hold=open?0:2.5;}
  showMsg(open?(manual?'🔓 城门已开启（队友通过后自动关门）':'🔓 城门自动开启'):'🔒 城门已关闭',1.2);
}
/* 智能城门：玩家/载具/要出城的队友走向关着的城门时自动打开，离开后（虫潮中）自动关闭。
   网友反馈“从基地里走不出来”，I 仍可手动开关并保持。 */
function gateWanted(){
  const near=(p,dir)=>p&&Math.abs(p.x-gate.pos.x)<6.5&&Math.abs(p.z-gate.pos.z)<4.6&&Math.abs(p.y-PLAT.H)<2.6&&(dir===undefined||Math.sign(gate.pos.z-p.z)*dir>.25);
  if(player.inVehicle){if(near(player.inVehicle.mesh.position,player.moveZ))return true;}
  else if(!player.dead&&!zergOn()&&near(player.pos,player.moveZ))return true;
  return squad.some(s=>!s.dead&&s.wantsGate&&near(s.mesh.position));
}
function gateOccupied(){
  const close=p=>p&&Math.abs(p.x-gate.pos.x)<7&&Math.abs(p.z-gate.pos.z)<7.5;
  if(!zergOn()&&close(player.inVehicle?player.inVehicle.mesh.position:player.pos))return true;
  for(const s of squad){
    if(s.dead||!close(s.mesh.position))continue;
    const v=s.vehicle;
    if(v?.cfg.fly)continue;                  // 飞机在门洞上空不算占门（与原逻辑一致）
    if(v&&!v.moving&&!s.wantsGate)continue;  // 队友把载具停在门洞里的岗位（守基地岗位就在城门内侧）不顶门，否则城门常开放虫进来
    return true;
  }
  return false;
}
function updSmartGate(dt){
  if(gate.dead)return;
  if(zergOn()){gate.open=false;gate.auto=false;return;} // 虫族模式：城门常闭，守军不会为虫群开门，只能被母虫攻破
  gate.hold=Math.max(0,gate.hold-dt);
  if(gate.open&&squad.some(s=>!s.dead&&s.wantsGate)){gate.auto=true;gate.autoT=2.2;}
  if(!gate.open&&gate.hold<=0&&gateWanted()){setGate(true,false);gate.auto=true;gate.autoT=2.2;}
  else if(gate.open&&gate.auto){
    if(gateOccupied()||gateWanted())gate.autoT=2.2;
    else if((gate.autoT-=dt)<=0){gate.open=false;gate.auto=false;AudioSys.sfx('vehicle');}
  }
}
function damageGate(d){
  if(Game.testMode)return;
  if(gate.open||gate.dead)return;
  gate.hp-=d;updHPBar(gate.bar,gate.hp/gate.maxHp);
  if(gate.hp<=0){
    gate.hp=0;gate.dead=true;AudioSys.sfx('boom');
    spawnParticles(gate.mesh.position.clone().add(new THREE.Vector3(0,2,0)),0x99aabb,22,9,.8,1.6);
    showMsg('💥 城门被摧毁！虫群涌入！',2.5);
  }
}
function updGate(dt){
  updSmartGate(dt);
  const tY=(gate.open||gate.dead)?-2.6:2.3;
  gate.door.position.y+=(tY-gate.door.position.y)*Math.min(1,dt*4);
  gate.door.visible=!gate.dead;
  gate.bar.visible=!gate.open&&!gate.dead;
}
function gateBlocked(){return !gate.open&&!gate.dead;}
/* 两侧与后方城墙（静态，不可摧毁）：[x,z,半宽,半深] */
// RAMPARTS is shared with terrain, collision and the two ascent ramps.
(function buildRamparts(){
  const m=new THREE.MeshLambertMaterial({color:0x77879a});
  const top=new THREE.MeshLambertMaterial({color:0x5c6b7d});
  const grp=new THREE.Group();
  for(const[rx,rz,hw,hd] of RAMPARTS){
    const b=new THREE.Mesh(new THREE.BoxGeometry(hw*2,WALL_TOP-PLAT.H-.1,hd*2),m);
    b.position.set(rx,(WALL_TOP-PLAT.H-.1)/2,rz);b.castShadow=b.receiveShadow=true;grp.add(b);
    const t=new THREE.Mesh(new THREE.BoxGeometry(hw*2,.08,hd*2),top);
    t.position.set(rx,WALL_TOP-PLAT.H,rz);grp.add(t);
  }
  grp.position.y=PLAT.H;
  scene.add(grp);
})();

/* ---------- 通用工具 ---------- */
function groundY(x,z){return rvOn()?0:terrainH(x,z);}
function dist2(a,b){const dx=a.x-b.x,dz=a.z-b.z;return dx*dx+dz*dz;}
// 面板（商店/建造）打开时，HUD 消息会被面板盖住，改用面板之上的提示条
function showMsg(t,dur=2.2){if(panelOpen){showAlert(t);return;}$('msg').textContent=t;$('msg').classList.remove('hidden');Game.msgTimer=dur;}
function showHint(t){if(t){$('hint').textContent=t;$('hint').classList.remove('hidden');}else $('hint').classList.add('hidden');}
function updHUDItem(){
  $('itemTxt').textContent=`🧰 医疗包×${Game.testMode?'∞':Game.items.medkit}(H)`
    +` · 手雷(${keyBindings.label('U')})`
    +(player.shield>0?` 🛡${Math.ceil(player.shield)}`:'')
    +(player.buffT>0?` ⚡${Math.ceil(player.buffT)}s`:'');
}

/* ---------- 玩家 ---------- */
let player={
  mesh:null,bar:null,hp:120,maxHp:120,speed:9.5,
  pos:new THREE.Vector3(0,0,-24),vy:0,onGround:true,yaw:0,
  fireCd:0,healTick:0,inVehicle:null,dead:false,anim:0,respawnT:0,invulnerable:0,
  muzzle:null,shield:0,buffT:0,heat:0,moveZ:0,
  reset(cls){
    const c=CLASSES[cls];
    this.maxHp=c.hp+Game.hpBonus;this.hp=this.maxHp;this.speed=c.speed;
    this.pos.set(0,0,-20);this.vy=0;this.dead=false;this.inVehicle=null;this.yaw=0;
    this.shield=0;this.buffT=0;this.respawnT=0;this.invulnerable=0;this.heat=0;this.moveZ=0;
    this.onGround=true;
    if(this.mesh){visuals.release(this.mesh);scene.remove(this.mesh);}
    this.mesh=makeSoldier(c.color);this.mesh.rotation.order='YXZ';
    this.bar=makeHPBar(1.8,'#3f6');this.bar.position.y=3;this.mesh.add(this.bar);updHPBar(this.bar,1);
    const ml=new THREE.PointLight(0xffaa44,0,6);ml.position.set(.32,1.15,1);this.mesh.add(ml);this.muzzle=ml;
    markTree(this.mesh);scene.add(this.mesh);
  }
};
// 自身特效：第一人称时粒子会贴在镜头上挡住视线，改用屏幕边缘闪光（按游戏时间衰减）。
let hurtFlash=0,healFlash=0;
function selfFx(color,n,speed,life,h,at=null){
  if(camMode==='first'&&!player.inVehicle)return;
  spawnParticles((at||player.pos).clone().add(new THREE.Vector3(0,h,0)),color,n,speed,life);
}
function updScreenFx(dt){
  hurtFlash=Math.max(0,hurtFlash-dt*2.2);healFlash=Math.max(0,healFlash-dt*2.5);
  const low=!Game.testMode&&!player.dead&&player.hp<player.maxHp*.3?.25+.15*Math.sin(performance.now()/180):0;
  const el=$('screenFx');el.style.opacity=String(Math.max(hurtFlash,low,healFlash*.6));el.classList.toggle('heal',healFlash>hurtFlash&&low===0);
}
function playerDamage(d){
  if(Game.testMode)return;
  if(player.dead||player.invulnerable>0)return;

  d*=vsOn()?1:CLASSES[Game.cls].armor||1;
  if(player.shield>0){ // 护盾优先吸收
    const ab=Math.min(player.shield,d);
    player.shield-=ab;d-=ab;
    selfFx(0x66ccff,4,4,.35,1.4);
    if(d<=0){updHUDItem();return;}
  }
  player.hp-=d;AudioSys.sfx('hurt');
  selfFx(0xff4444,5,4,.4,1.3);hurtFlash=Math.min(1,hurtFlash+.55);
  updHPBar(player.bar,player.hp/player.maxHp);
  if(player.hp<=0){
    player.hp=0;player.dead=true;player.respawnT=2.2;showMsg('阵亡，正在返回基地检查点…',2.2);
  }
}

/* ---------- 子弹 ---------- */
const bulletGeo=new THREE.SphereGeometry(.12,6,5);
function fireBullet(from,dir,cfg,friendly,target){
  if(cfg.beam&&friendly){fireBeam(from,dir,cfg);return;}
  if(cfg.pellets>1){ // 霰弹：一次多颗弹丸
    for(let i=0;i<cfg.pellets;i++)fireBullet(from,dir,Object.assign({},cfg,{pellets:0}),friendly,target);
    return;
  }
  const color=cfg.color||0xffee88;
  const m=new THREE.Mesh(bulletGeo,new THREE.MeshBasicMaterial({color}));
  m.position.copy(from);
  const spread=cfg.spread||0;
  const d=dir.clone().normalize();
  d.x+=rand(-spread,spread);d.z+=rand(-spread,spread);if(cfg.flame)d.y+=rand(-spread,spread)*.5;d.normalize();
  const b={mesh:m,vel:d.multiplyScalar(cfg.speed),dmg:cfg.dmg,life:cfg.range/cfg.speed,friendly,explode:cfg.explode||0,arc:cfg.arc,
    homing:cfg.homing,pierce:cfg.pierce||0,hitSet:cfg.pierce?new Set():null,origin:from.clone(),knock:cfg.knock||0,burn:cfg.burn||0,grenade:!!cfg.grenade};
  // 虫潮对战：子弹带阵营，英雄子弹打建筑按规则打折
  if(cfg.team||vsOn()){b.team=cfg.team||player.team;b.src=cfg.team?(cfg.src||'unit'):'hero';b.bld=cfg.bld||1;b.pid=cfg.team?cfg.pid:player.vsPid;}
  if(cfg.arc){
    // 抛物线落点对准目标（原来固定落在约34米外，近处虫子根本打不到）。
    const g=16,aim=target?target.clone():from.clone().addScaledVector(new THREE.Vector3(dir.x,0,dir.z).normalize(),Math.min(cfg.range,cfg.throw||22));
    const dx=aim.x-from.x,dz=aim.z-from.z,dist=Math.max(1,Math.hypot(dx,dz)),T=cfg.flightTime||clamp(dist/cfg.speed*1.15,.45,1.5);
    b.vel.set(dx/T+rand(-spread,spread)*dist,(aim.y-from.y+.5*g*T*T)/T,dz/T+rand(-spread,spread)*dist);
    b.gravity=g;b.life=T+.8;m.scale.setScalar(2);
  }
  if(cfg.flame){m.scale.setScalar(1.9);b.vel.y+=1.2;b.flame=true;}
  scene.add(m);bullets.push(b);
  // 曳光
  if(!cfg.arc&&!cfg.flame){const trail=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.9,4),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.6}));
    trail.rotation.x=Math.PI/2;m.add(trail);}
}
function explode(pos,radius,dmg,friendly,team=null,src=null,pid=null){
  AudioSys.sfx('boom');
  spawnParticles(pos,0xffaa33,16,9,.6,1.6,6);
  spawnParticles(pos,0xff5511,10,6,.8,2,4);
  if(team&&vsOn()){versus.explodeAt(pos,radius,dmg,team,{src:src||'unit',by:pid});return;}
  if(friendly){
    for(const mo of monsters){if(!mo.dead&&mo.mesh.position.distanceTo(pos)<radius+mo.radius)damageMonster(mo,dmg);}
  }else{
    // 驾驶时玩家模型停留在上车点；按实际载具位置结算，避免远处爆炸误伤。
    if(player.inVehicle){if(player.inVehicle.mesh.position.distanceTo(pos)<radius+2)damageVehicle(player.inVehicle,dmg);}
    else if(!player.dead&&player.pos.distanceTo(pos)<radius+1)playerDamage(dmg);
    for(const bd of buildings){if(!bd.dead&&bd.mesh.position.distanceTo(pos)<radius+2)damageBuilding(bd,dmg);}
    for(const s of [...squad]){if(s.dead)continue;const v=s.vehicle,p=v?v.mesh.position:s.mesh.position;if(p.distanceTo(pos)<radius+(v?2:1)){if(v)damageVehicle(v,dmg);else damageSquad(s,dmg*.6);}}
  }
}
// Continuous segment/sphere intersection prevents fast shots tunnelling at 20 FPS.
function segmentHit(a,b,center,r){
  const d=b.clone().sub(a),v=a.clone().sub(center),length=d.lengthSq();
  if(v.lengthSq()<=r*r)return 0;
  if(length<1e-9)return null;
  const q=v.dot(d),disc=q*q-length*(v.lengthSq()-r*r);
  if(disc<0)return null;
  const t=(-q-Math.sqrt(disc))/length;
  return t>=0&&t<=1?t:null;
}
// friendly: 我方子弹可越过掩护巨石，枪口附近 1.6 米内不判地面（城楼/高台边缘向下射击）。
function shotCover(a,b,friendly=false,origin=null){
  if(rvOn())return rvBreakout.visible(a,b)?1:0;
  const n=Math.max(1,Math.ceil(a.distanceTo(b)/.4));
  for(let i=1;i<=n;i++){
    const p=a.clone().lerp(b,i/n);
    // Lean over nearby rampart edges when firing down at enemies at the wall foot.
    const nearMuzzle=friendly&&origin&&(p.distanceToSquared(origin)<2.6||
      origin.y>=WALL_TOP+1&&rampartHeight(origin.x,origin.z)>=WALL_TOP-.01&&Math.hypot(p.x-origin.x,p.z-origin.z)<1.6);
    if(!nearMuzzle&&p.y<=groundY(p.x,p.z)+(friendly?-.3:.05))return i/n;
    if(fortress.shotBlocked(p,friendly))return i/n;
  }
  return 1;
}
function firstWallHit(a,b,friendly=false,origin=null){
  let hit=null;
  for(const wall of buildings)if(wall.isWall&&!wall.dead){
    // Like rampart firing, lean over adjacent cover to aim down at its foot.
    if(friendly&&origin&&origin.y>wall.mesh.position.y+COVER_HEIGHT&&wallTouches(wall,origin.x,origin.z,1.1))continue;
    const t=wallSegment(wall,a,b);if(t!==null&&(!hit||t<hit.t))hit={wall,t};
  }
  return hit;
}
function targetHits(a,b,hitSet){
  return monsters.filter(m=>!m.dead&&!(hitSet&&hitSet.has(m))).map(m=>({m,t:segmentHit(a,b,m.mesh.position.clone().add(new THREE.Vector3(0,m.hitH,0)),m.radius+.4)})).filter(h=>h.t!==null).sort((a,b)=>a.t-b.t);
}
const beamPool=[];
function fireBeam(from,dir,cfg){
  const end=from.clone().addScaledVector(dir.clone().normalize(),cfg.range);
  const wallHit=firstWallHit(from,end,true,from);
  let t=Math.min(shotCover(from,end,true,from),wallHit?.t??1);
  const team=cfg.team||(vsOn()?player.team:null),src=cfg.team?(cfg.src||'unit'):'hero',pid=cfg.team?cfg.pid:player.vsPid;
  const hits=(team?versus.beamHits(from,end,team):targetHits(from,end)).filter(h=>h.t<t).slice(0,(cfg.pierce||0)+1);
  for(const h of hits)if(team)versus.damage(h.m,cfg.dmg,team,src,pid);else damageMonster(h.m,cfg.dmg);
  if(team&&hits.length<=(cfg.pierce||0)&&wallHit&&wallHit.t<=t+1e-6&&wallHit.wall.team&&wallHit.wall.team!==team)versus.damage(wallHit.wall,cfg.dmg,team,src,pid);
  if(hits.length){AudioSys.sfx('hit');if(hits.length>(cfg.pierce||0))t=hits[hits.length-1].t;}
  end.lerpVectors(from,end,t);
  let beam=beamPool.find(b=>b.life<=0);
  if(!beam&&beamPool.length<24){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,1,6),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));
    const glow=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,1,8),new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));mesh.add(glow);
    scene.add(mesh);beam={mesh,glow,life:0};beamPool.push(beam);
  }
  if(beam){const delta=end.clone().sub(from),heat=cfg.heat||0;beam.life=.12;beam.mesh.visible=true;beam.mesh.material.color.setHex(cfg.color||0x44ffff);beam.glow.material.color.setHex(cfg.color||0x44ffff);const soft=cfg.fp?.35:1;beam.coreOp=cfg.fp?.7:.95;beam.mesh.material.opacity=beam.coreOp;beam.glow.material.opacity=(.25+heat*.25)*soft;beam.glow.scale.x=beam.glow.scale.z=(1+heat*.8)*(cfg.fp?.55:1);beam.mesh.position.copy(from).add(end).multiplyScalar(.5);beam.mesh.scale.y=delta.length();beam.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}
  if(hits.length)spawnParticles(end,0x8ffff1,3,3,.22);
}
function disposeBullet(mesh){
  mesh.traverse(o=>{if(o.geometry&&o.geometry!==bulletGeo)o.geometry.dispose();if(o.material)o.material.dispose();});scene.remove(mesh);
}
function updBullets(dt){
  for(const beam of beamPool){beam.life-=dt;beam.mesh.visible=beam.life>0;const k=Math.max(0,beam.life/.12);beam.mesh.material.opacity=k*(beam.coreOp||.95);beam.glow.material.opacity=Math.min(beam.glow.material.opacity,k*.5);}
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];b.life-=dt;
    // 追踪导弹：向最近敌人转向
    if(b.homing&&b.friendly){
      let best=null,bd2=30*30;
      const p0=b.mesh.position;
      for(const mo of (b.team?versus.aimTargets(b.team):monsters)){if(mo.dead||b.hitSet&&b.hitSet.has(mo))continue;const d2=dist2(p0,mo.mesh.position);if(d2<bd2){bd2=d2;best=mo;}}
      if(best){
        const want=new THREE.Vector3(best.mesh.position.x-p0.x,best.mesh.position.y+(best.hitH||1)-p0.y,best.mesh.position.z-p0.z).normalize().multiplyScalar(b.vel.length());
        b.vel.lerp(want,Math.min(1,dt*3.2));
      }
    }
    const previous=b.mesh.position.clone();
    b.mesh.position.addScaledVector(b.vel,dt);
    if(b.gravity)b.vel.y-=b.gravity*dt;
    const p=b.mesh.position;
    let hit=false;
    const wallHit=firstWallHit(previous,p,b.friendly,b.origin);
    const sceneryCover=shotCover(previous,p,b.friendly,b.origin);
    const cover=Math.min(sceneryCover,wallHit?.t??1);
    if(b.team&&vsOn()){hit=versus.bulletStep(b,previous,p,cover,wallHit,sceneryCover);}
    else if(b.friendly){
      for(const {m:mo,t} of targetHits(previous,p,b.hitSet)){
        if(t<cover){
          if(!b.explode){
            damageMonster(mo,b.dmg);if(!b.flame||Math.random()<.25)AudioSys.sfx('hit');if(!b.flame)spawnParticles(p,0x99ff55,4,3,.3);
            if(b.burn&&!mo.dead){mo.burnT=2.5;mo.burnDps=Math.max(mo.burnDps||0,b.burn);} // 点燃：持续灼烧
            if(b.knock&&!mo.dead&&mo.kind==='mob'&&!mo.fly){ // 霰弹击退（首领不受影响）
              const kx=b.vel.x,kz=b.vel.z,kl=Math.hypot(kx,kz)||1,margin=mo.radius+.2,nx=clamp(mo.mesh.position.x+kx/kl*b.knock,WORLD.minX+margin,WORLD.maxX-margin),nz=clamp(mo.mesh.position.z+kz/kl*b.knock,WORLD.minZ+margin,WORLD.maxZ-margin);
              if(!collideWalls(nx,nz,mo.radius)&&!tooSteep(nx,nz)){mo.mesh.position.x=nx;mo.mesh.position.z=nz;}
            }
            if(b.pierce>0){b.pierce--;b.hitSet.add(mo);continue;} // 穿透继续飞
          }
          p.lerpVectors(previous,p,t);hit=true;break;
        }
      }
    }else{
      // Resolve swept body hits before cover; a fast shot must not damage through a parapet.
      const bodyHit=(pos,h,r)=>{const t=segmentHit(previous,p,pos.clone().add(new THREE.Vector3(0,h,0)),r);return t!==null&&t<cover;};
      for(const human of coopHumans.length?coopHumans:[player])if(!human.dead&&!human.inVehicle&&bodyHit(human.pos,1.2,.65)){withHuman(human,()=>playerDamage(b.dmg));hit=true;break;}
      if(!hit)for(const s of squad){if(!s.dead&&!s.vehicle&&bodyHit(s.mesh.position,1.1,.65)){damageSquad(s,b.dmg);hit=true;break;}}
      // Clip the remaining structure tests to the first obstacle, too.
      if(!hit&&cover<1){if(wallHit&&wallHit.t<=sceneryCover)damageBuilding(wallHit.wall,b.dmg);p.lerpVectors(previous,p,cover);hit=true;}
      if(!hit)for(const bd of buildings){if(!bd.dead&&!bd.isWall&&dist2(p,bd.mesh.position)<bd.radius*bd.radius){damageBuilding(bd,b.dmg);hit=true;break;}}
      if(!hit&&gateBlocked()&&Math.abs(p.x-gate.pos.x)<6.5&&Math.abs(p.z-gate.pos.z)<1.6&&p.y<terrainH(gate.pos.x,gate.pos.z)+5){damageGate(b.dmg);hit=true;}
      if(!hit&&dist2(p,base.pos)<16){damageBase(b.dmg);hit=true;}
      if(!hit)for(const v of vehicles){if(!v.dead&&(rvOn()&&v===rvBreakout.state.rv||v.driver||(coopHumans.length?coopHumans:[player]).some(p=>p.inVehicle===v))&&dist2(p,v.mesh.position)<(v.kind==='rv'?9:4)&&Math.abs(p.y-v.mesh.position.y-1.5)<3){damageVehicle(v,b.dmg);hit=true;break;}}
    }
    if(!hit&&cover<1){p.lerpVectors(previous,p,cover);hit=true;}
    if(hit||b.life<=0){
      if(b.explode&&(hit||b.grenade))explode(p.clone(),b.explode,b.dmg,b.friendly,b.team&&vsOn()?b.team:null,b.src,b.pid);
      disposeBullet(b.mesh);bullets.splice(i,1);
    }
  }
}

/* ---------- 怪物 ---------- */
function chapterCfg(){return CHAPTERS[(Game.chapter-1)%10];}
function diffMul(){ // 周目与章节难度倍率（放缓后的曲线）
  return (1+(Game.chapter-1)*.09)*(1+(Game.loop-1)*.55);
}
function flyHeight(x,z){const g=groundY(x,z),top=fortress.topAt(x,z);return Math.max(g+4,top+1.6);}
function spawnMonster(kind,x,z,opts={}){
  const ch=opts.ch||chapterCfg();
  const rules=campaignDifficulty(Game.testMode||operations.active?'normal':Game.difficulty);
  const mul=diffMul()*(1+(Game.level-1)*.04); // 同章内关卡递增
  const winged=!!ch.fly&&kind!=='queen';
  let hp,dmg,speed,scale,gold,ranged=ch.ranged,fly=winged&&!opts.route&&!isFinite(fortress.ceilingAt(x,z,groundY(x,z)+.5));
  if(kind==='mob'){
    hp=ch.mob.hp*mul;dmg=ch.mob.dmg*mul;speed=ch.mob.speed*(1+(Game.loop-1)*.08);scale=rand(.85,1.15);gold=Math.round(ch.mob.gold*(1+(Game.loop-1)*.3));
  }else if(kind==='miniboss'){
    hp=ch.mob.hp*mul*9;dmg=ch.mob.dmg*mul*1.8;speed=ch.mob.speed*.85;scale=2.2;gold=Math.round(ch.mob.gold*mul*8);ranged=true;
  }else if(kind==='queen'){ // 虫巢母皇：只守老巢
    hp=ch.mob.hp*mul*36;dmg=ch.mob.dmg*mul*2.2;speed=ch.mob.speed*.6;scale=4.4;gold=Math.round((400+200*Game.chapter)*(1+(Game.loop-1)*.3));ranged=true;fly=false;
  }else{ // boss
    hp=ch.mob.hp*mul*24;dmg=ch.mob.dmg*mul*2.4;speed=ch.mob.speed*.7;scale=3.6;gold=Math.round(ch.mob.gold*mul*25);ranged=true;
  }
  hp*=rules.hp;dmg*=rules.damage;
  if(kind==='mob')gold=Math.max(1,Math.round(gold*rules.mobGold));
  const color=kind==='mob'?ch.color:ch.bossColor;
  const spawnClear=(px,pz)=>!collideWalls(px,pz,.9*scale,fly?flyHeight(px,pz):groundY(px,pz))&&(fly||!tooSteep(px,pz));
  if(!spawnClear(x,z)){
    const ox=x,oz=z;let found=false;
    for(const r of [3,6,10,15]){for(let i=0;i<8;i++){
      const px=clamp(ox+Math.cos(i*TAU/8)*r,WORLD.minX+5,WORLD.maxX-5),pz=clamp(oz+Math.sin(i*TAU/8)*r,12,WORLD.maxZ-5);
      if(spawnClear(px,pz)){x=px;z=pz;found=true;break;}
    }if(found)break;}
    if(!found){x=0;z=clamp(z,15,130);}
  }
  const species=CHAPTERS.indexOf(ch);
  // Wings describe the species, even while it walks through a low tunnel.
  const mesh=visuals.bug(scale,kind==='mob'&&opts.elite?'elite':kind,winged,species);
  const y=fly?flyHeight(x,z):groundY(x,z);
  mesh.position.set(x,y,z);
  scene.add(mesh);
  const mo={ch,mesh,kind,hp,maxHp:hp,dmg,speed,radius:.9*scale,hitH:.7*scale,gold,dead:false,
    atkCd:0,ranged,fly,route:opts.route||null,routeIndex:0,flightAfterExit:winged,anim:rand(0,10),wild:opts.wild||false,guard:!!opts.home,home:opts.home||null,
    explodeOnDie:ch.explodeOnDie,split:ch.split&&kind==='mob'&&!opts.isSplit,stealth:ch.stealth,
    target:null,spitCd:rand(1,3),chargeCd:5,emerge:opts.emerge?.9:0,
    bs:kind==='boss'?(ch.bs||['summon']):kind==='queen'?['barrage','summon']:(kind==='miniboss'?(ch.bs||[]).slice(0,1):null),
    chargeT:0,elite:null,
  };
  if(mo.emerge){mesh.position.y-=2.6*scale;spawnParticles(new THREE.Vector3(x,groundY(x,z)+.5,z),0x6b5236,8,5,.6,1.3);}
  // 精英词缀
  if(opts.elite&&kind==='mob'){
    const keys=Object.keys(ELITES);
    const picks=opts.affix&&ELITES[opts.affix]?[opts.affix]:[keys[Math.floor(rand(0,keys.length))]];
    if(!opts.affix&&Math.random()<rules.doubleAffix)picks.push(keys[Math.floor(rand(0,keys.length))]);
    const affixes=[...new Set(picks)];
    let hpM=1,dmgM=1,spM=1,scM=1;
    for(const k of affixes){
      const a=ELITES[k];
      hpM*=a.hpMul||1;dmgM*=a.dmgMul||1;spM*=a.speedMul||1;scM*=a.scaleMul||1;
      if(a.ranged)mo.ranged=true;
      if(a.explodeOnDie)mo.explodeOnDie=true;
    }
    mo.hp=mo.maxHp=hp*hpM;mo.dmg=dmg*dmgM;mo.speed=speed*spM;
    mo.scaleMul=scM;mesh.scale.multiplyScalar(scM);mo.radius*=scM;mo.hitH*=scM;
    mo.gold=Math.round(gold*4*affixes.length);mo.elite=affixes;
    // 头顶词缀水晶标记
    const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.22,0),new THREE.MeshBasicMaterial({color:0xffdd00}));
    gem.position.y=(fly?2.2:1.6)*scale*scM+1;mesh.add(gem);mo.gem=gem;
  }
  mo.bar=makeHPBar(kind==='mob'?(mo.elite?2.4:1.8):(kind==='boss'||kind==='queen'?5:4.5),mo.elite?'#ff0':(kind==='mob'?'#f66':'#f0f'));
  mo.bar.position.y=(fly?2.2:1.6)*scale*(mo.scaleMul||1)+.6;mesh.add(mo.bar);updHPBar(mo.bar,1);
  if(mesh.userData.worlds){mo.bar.scale.divideScalar(mesh.scale.x);mo.bar.position.y=mesh.userData.visualHeight+.5/mesh.scale.y;if(mo.gem)mo.gem.position.y=mesh.userData.visualHeight+.9/mesh.scale.y;}
  if(mo.stealth)mesh.traverse(o=>{if(o.material&&!o.material.transparent){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.45;}});
  // Elite affixes change collision size after the first spawn check.
  const safe=(px,pz)=>!collideWalls(px,pz,mo.radius,fly?flyHeight(px,pz):groundY(px,pz))&&(fly||!tooSteep(px,pz));
  if(!safe(x,z)){
    let found=false;
    for(const r of [2,4,8,12,20,32]){for(let i=0;i<24;i++){
      const px=clamp(x+Math.cos(i*TAU/24)*r,WORLD.minX+mo.radius+1,WORLD.maxX-mo.radius-1),pz=clamp(z+Math.sin(i*TAU/24)*r,12,WORLD.maxZ-mo.radius-1);
      if(safe(px,pz)){mesh.position.set(px,fly?flyHeight(px,pz):groundY(px,pz),pz);found=true;break;}
    }if(found)break;}
    if(!found)for(let pz=40;pz<180&&!found;pz+=10)for(let px=-90;px<=90;px+=10)if(safe(px,pz)){mesh.position.set(px,groundY(px,pz),pz);found=true;break;}
  }
  markTree(mesh);monsters.push(mo);
  if(mo.elite&&!opts.quiet)showMsg('⚠ 精英虫「'+affixNames(mo.elite)+'」出现！',1.6);
  return mo;
}
function affixNames(list){return list.map(k=>ELITES[k].name).join('·');}
function damageMonster(mo,d){
  if(mo.dead)return;
  if(mo.zergPlayer){if(zergMode)zergMode.hurt(d);return;}
  mo.hp-=d;updHPBar(mo.bar,mo.hp/mo.maxHp);
  mo.dmgAcc=(mo.dmgAcc||0)+d;if(!(mo.dmgT>0))mo.dmgT=.14;
  if(mo.kind==='queen')Game.hive.queen=clamp(mo.hp/mo.maxHp,0,1);
  if(mo.hp<=0)killMonster(mo);
}
function killMonster(mo){
  mo.dead=true;
  if(rvOn()&&mo.rvZombie)rvBreakout.killed(mo);
  if(mo.dmgAcc>0){popDamage(mo);}
  const p=mo.mesh.position.clone();p.y+=1;
  spawnParticles(p,0x88ff44,12,7,.6,1.2);
  spawnParticles(p,0x336611,8,5,.5,1.5);
  AudioSys.sfx('boom');
  if(mo.explodeOnDie)explode(p,3,mo.dmg*.8,false);
  if(mo.split&&monsters.length<46){ // 分裂小蛛：普通1只、精英2只，子代伤害和血量都大幅降低
    for(let i=0;i<(mo.elite?2:1)&&monsters.filter(m=>!m.dead).length<48;i++){
      const s=spawnMonster('mob',p.x+rand(-1,1),p.z+rand(-1,1),{isSplit:true,wild:mo.wild,ch:mo.ch,home:mo.home});
      s.hp=s.maxHp=s.maxHp*.3;s.dmg*=.45;s.speed*=1.1;s.gold=Math.round(s.gold*.3);s.mesh.scale.multiplyScalar(.6);s.radius*=.6;s.hitH*=.6;updHPBar(s.bar,1);
      if(!mo.wild){Game.wave.total++;Game.wave.spawned++;}
    }
  }
  if(mo.kind==='queen')queenKilled(mo);
  // 掉落
  if(mo.gold>0)dropPickup(p,'gold',mo.gold);
  if(mo.elite){ // 精英：额外金币+必掉回复
    Game.score+=50*mo.elite.length;
    dropPickup(p.clone().add(new THREE.Vector3(rand(-1.5,1.5),0,rand(-1.5,1.5))),'gold',Math.round(mo.gold*.6));
    dropPickup(p.clone().add(new THREE.Vector3(rand(-1.5,1.5),0,rand(-1.5,1.5))),'hp',40);
  }
  if(!mo.rvZombie&&Math.random()<(mo.kind==='mob'?(mo.elite?1:.12):.9))dropPickup(p.clone().add(new THREE.Vector3(rand(-1,1),0,rand(-1,1))),'hp',25);
  if(mo.kind!=='mob'&&mo.kind!=='queen')dropPickup(p.clone().add(new THREE.Vector3(rand(-2,2),0,rand(-2,2))),'gold',mo.gold);
  Game.score+=mo.kind==='mob'?10:(mo.kind==='miniboss'?150:mo.kind==='queen'?2000:500);
  if(!visuals.death(mo.mesh))scene.remove(mo.mesh);
  if(!mo.wild)Game.wave.killed++;
}
/* 伤害数字：同一只虫 0.14 秒内的伤害合并显示，让“有没有打中、打了多少”一目了然 */
const dmgLayer=$('dmgLayer'),dmgPool=[],dmgActive=[];
function popDamage(mo){
  const v=Math.round(mo.dmgAcc);mo.dmgAcc=0;mo.dmgT=0;if(v<=0||dmgActive.length>=26)return;
  const el=dmgPool.pop()||Object.assign(document.createElement('div'),{className:'dmgNum'});
  el.textContent=v;el.classList.toggle('big',v>=120);if(!el.parentNode)dmgLayer.appendChild(el);el.style.display='block';
  dmgActive.push({el,pos:mo.mesh.position.clone().add(new THREE.Vector3(rand(-.4,.4),mo.hitH*2+.8,rand(-.4,.4))),t:0});
}
const _proj=new THREE.Vector3();
function updDamageNumbers(dt){
  for(let i=dmgActive.length-1;i>=0;i--){
    const d=dmgActive[i];d.t+=dt;d.pos.y+=dt*1.6;
    _proj.copy(d.pos).project(camera);
    if(d.t>.75||_proj.z>1){d.el.style.display='none';dmgPool.push(d.el);dmgActive.splice(i,1);continue;}
    d.el.style.transform=`translate(${(_proj.x*.5+.5)*BASE_W}px,${(-_proj.y*.5+.5)*BASE_H}px) translate(-50%,-50%)`;
    d.el.style.opacity=String(Math.min(1,(.75-d.t)*4));
  }
}
function dropPickup(pos,type,val){
  let mesh;
  if(type==='gold'){
    mesh=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.1,10),new THREE.MeshBasicMaterial({color:0xffdd33}));
  }else{
    mesh=new THREE.Group();
    const box=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),new THREE.MeshBasicMaterial({color:0xffffff}));mesh.add(box);
    const cr1=new THREE.Mesh(new THREE.BoxGeometry(.55,.16,.16),new THREE.MeshBasicMaterial({color:0xff3344}));cr1.position.z=.2;mesh.add(cr1);
    const cr2=new THREE.Mesh(new THREE.BoxGeometry(.16,.55,.16),new THREE.MeshBasicMaterial({color:0xff3344}));cr2.position.z=.2;mesh.add(cr2);
  }
  mesh.position.set(pos.x,groundY(pos.x,pos.z)+.5,pos.z);
  scene.add(mesh);
  pickups.push({mesh,type,val,t:0});
}
function releasePickup(mesh){
  scene.remove(mesh);
  // Pickup geometry/materials are created per drop and are never shared with units.
  mesh.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
}
function updPickups(dt){
  for(let i=pickups.length-1;i>=0;i--){
    const pk=pickups[i];pk.t+=dt;
    pk.mesh.rotation.y+=dt*3;
    pk.mesh.position.y=groundY(pk.mesh.position.x,pk.mesh.position.z)+.5+Math.sin(pk.t*4)*.15;
    const vehicle=player.inVehicle;
    let receiver=null,pp=vehicle?vehicle.mesh.position:player.mesh.position;
    const playerCan=!player.dead&&(pk.type==='gold'||(vehicle?vehicle.hp<vehicle.maxHp:player.hp<player.maxHp));
    let d2=playerCan?dist2(pk.mesh.position,pp):Infinity;
    for(const h of coopHumans){if(h===player||h.dead||h.disconnected)continue;const v=h.inVehicle,pos=v?v.mesh.position:h.pos,can=pk.type==='gold'||(v?v.hp<v.maxHp:h.hp<h.maxHp);const d=can?dist2(pk.mesh.position,pos):Infinity;if(d<d2){receiver=v||h;d2=d;pp=pos;}}

    for(const mate of squad){
      if(mate.dead||mate.vehicle||(pk.type!=='gold'&&mate.hp>=mate.maxHp))continue;
      const md=dist2(pk.mesh.position,mate.mesh.position);
      if(md<d2&&md<64){receiver=mate;d2=md;pp=mate.mesh.position;}
    }
    if(d2<(receiver?36:Game.magnet?90:36)){
      const dir=new THREE.Vector3().subVectors(pp,pk.mesh.position);dir.y=0;dir.normalize();
      pk.mesh.position.addScaledVector(dir,dt*(Game.magnet?22:14));
    }
    if(d2<2.2){
      if(pk.type==='gold'){Game.gold+=pk.val;AudioSys.sfx('coin');}
      else{
        if(receiver){receiver.hp=Math.min(receiver.maxHp,receiver.hp+pk.val);updHPBar(receiver.bar,receiver.hp/receiver.maxHp);}
        else if(player.inVehicle){const v=player.inVehicle;v.hp=Math.min(v.maxHp,v.hp+pk.val*2);updHPBar(v.bar,v.hp/v.maxHp);}
        else{player.hp=Math.min(player.maxHp,player.hp+pk.val);updHPBar(player.bar,player.hp/player.maxHp);}
        AudioSys.sfx('heal');
        selfFx(0x66ff99,8,3,.6,1.5,pp);healFlash=1;
      }
      releasePickup(pk.mesh);pickups.splice(i,1);continue;
    }
    if(pk.t>45){releasePickup(pk.mesh);pickups.splice(i,1);}
  }
}
/* 怪物AI */
function monsterTargets(mo){
  if(rvOn())return rvBreakout.target(mo);
  // 选择最近的攻击目标：玩家/载具/小队/建筑/基地
  let best=null,bd2=1e9;
  const consider=(pos,obj,kind,r)=>{
    const d2=dist2(mo.mesh.position,pos);
    if(d2<bd2){bd2=d2;best={pos,obj,kind,r,d2};}
  };
  for(const human of coopHumans.length?coopHumans:[player]){
    if(!human.dead&&!human.inVehicle)consider(human.mesh.position,human,'player',1);
    if(human.inVehicle&&!human.inVehicle.dead)consider(human.inVehicle.mesh.position,human.inVehicle,'vehicle',2);
  }
  for(const s of squad)if(!s.dead){if(s.vehicle)consider(s.vehicle.mesh.position,s.vehicle,'vehicle',2);else consider(s.mesh.position,s,'squad',1);}
  if(!mo.wild){
    for(const bd of buildings)if(!bd.dead)consider(bd.mesh.position,bd,'building',bd.radius);
    consider(base.pos,base,'base',4);
    if(!mo.fly&&gateBlocked())consider(gate.mesh.position,gate,'gate',6);
  }
  // Ground attackers must break the gate before reaching a courtyard/wall-top
  // target. Otherwise a closer turret traps them shooting into the ramp forever.
  if(best&&!mo.wild&&!mo.fly&&gateBlocked()&&mo.mesh.position.z>gate.pos.z+1&&
    (best.pos.z<gate.pos.z||rampartHeight(best.pos.x,best.pos.z)>=WALL_TOP-.01)){
    best={pos:gate.mesh.position,obj:gate,kind:'gate',r:6,d2:dist2(mo.mesh.position,gate.mesh.position)};
  }
  return best;
}
function updMonsters(dt){
  const t=performance.now()/1000;
  for(let i=monsters.length-1;i>=0;i--){
    const mo=monsters[i];
    // 无尸体标记的死亡（不走 killMonster 的路径）只释放材质会把网格留在场景里
    // 成为孤立模型，且已出列后 clearEntities 也扫不到；这里兜底从场景移除。
    if(mo.dead){if(!mo.mesh.userData.corpse){visuals.release(mo.mesh);scene.remove(mo.mesh);}monsters.splice(i,1);continue;}
    if(mo.zergPlayer)continue; // 母虫由虫族模块驱动
    mo.vx=mo.vz=0;
    mo.slowT=Math.max(0,(mo.slowT||0)-dt);
    if(mo.burnT>0){ // 火焰灼烧：每 0.25 秒结算一次
      mo.burnT-=dt;mo.burnTick=(mo.burnTick||0)-dt;
      if(mo.burnTick<=0){mo.burnTick=.25;if(Math.random()<.5)spawnParticles(mo.mesh.position.clone().add(new THREE.Vector3(0,mo.hitH*1.4,0)),0xff7a2a,1,2,.35);damageMonster(mo,mo.burnDps*.25*weaponMul('flamer'));}
      if(mo.burnT<=0)mo.burnDps=0;
      if(mo.dead)continue;
    }
    if(mo.dmgT>0&&(mo.dmgT-=dt)<=0)popDamage(mo);
    if(rvOn()&&rvBreakout.updateMonster(mo,dt))continue;
    if(mo.operationStatic)continue;
    mo.anim+=dt*8;
    visuals.animate(mo.mesh,dt,mo.emerge>0?'Walk':mo.atkCd>.75?'Attack':'Walk',camera);
    if(mo.emerge>0){ // 从虫洞口钻出：先升出地面再行动
      mo.emerge=Math.max(0,mo.emerge-dt);
      const base=mo.fly?flyHeight(mo.mesh.position.x,mo.mesh.position.z):groundY(mo.mesh.position.x,mo.mesh.position.z);
      mo.mesh.position.y=base-2.6*mo.mesh.scale.y*(mo.emerge/.9);
      continue;
    }
    if(typeof mo.mesh.userData.tick==='function')mo.mesh.userData.tick(dt,t);
    // 腿部动画
    if(mo.mesh.userData.legGroup)mo.mesh.userData.legGroup.forEach((l,li)=>{l.rotation.x=Math.sin(mo.anim+li)*0.5;});
    if(mo.mesh.userData.wingL){mo.mesh.userData.wingL.rotation.z=.3+Math.sin(t*30)*.5;mo.mesh.userData.wingR.rotation.z=-.3-Math.sin(t*30)*.5;}
    mo.atkCd-=dt;mo.spitCd-=dt;
    if(mo.gem){mo.gem.rotation.y+=dt*2.5;mo.gem.position.y+=Math.sin(t*3+mo.anim)*.004;}
    if(mo.route){
      let wp=mo.route[mo.routeIndex];
      while(wp&&Math.hypot(wp.x-mo.mesh.position.x,wp.z-mo.mesh.position.z)<2){mo.routeIndex++;wp=mo.route[mo.routeIndex];}
      if(!wp){mo.route=null;}
      else {
        const close=monsterTargets(mo),engaged=close&&close.d2<18*18&&Math.abs(close.pos.y-mo.mesh.position.y)<6;
        if(!engaged){if(recoverStuckMonster(mo,wp,dt,true))continue;const d=new THREE.Vector3(wp.x-mo.mesh.position.x,0,wp.z-mo.mesh.position.z).normalize();mo.mesh.rotation.y=Math.atan2(d.x,d.z);moveMonster(mo,d,dt,2.2,wp);continue;}
      }
    }
    mo.fly=mo.flightAfterExit&&!mo.route&&!isFinite(fortress.ceilingAt(mo.mesh.position.x,mo.mesh.position.z,groundY(mo.mesh.position.x,mo.mesh.position.z)+.5));
    // Take off even when a nearby target makes the insect attack in place.
    if(mo.fly)mo.mesh.position.y+=(flyHeight(mo.mesh.position.x,mo.mesh.position.z)+Math.sin(mo.anim*.5)*.5-mo.mesh.position.y)*Math.min(1,dt*5);
    let tgt;
    if(mo.home){ // 老巢护卫/母皇：只在巢穴范围内迎战，玩家离开就回家并回血
      const h=mo.home,p=mo.mesh.position,dh=Math.hypot(p.x-h.x,p.z-h.z);
      tgt=monsterTargets(mo);
      if(tgt&&(Math.hypot(tgt.pos.x-h.x,tgt.pos.z-h.z)>h.leash+10||tgt.d2>h.aggro*h.aggro))tgt=null;
      if(!tgt||dh>h.leash+4){
        if(!tgt&&mo.hp<mo.maxHp){mo.hp=Math.min(mo.maxHp,mo.hp+mo.maxHp*(mo.kind==='queen'?.025:.06)*dt);updHPBar(mo.bar,mo.hp/mo.maxHp);if(mo.kind==='queen')Game.hive.queen=mo.hp/mo.maxHp;}
        if(dh>2.5){const back=new THREE.Vector3(h.x-p.x,0,h.z-p.z).normalize();mo.mesh.rotation.y=Math.atan2(back.x,back.z);moveMonster(mo,back,dt,dh>h.leash?1:.35,h);}
        else if(mo.kind!=='queen'){if(!mo.wander||Math.random()<.01)mo.wander=new THREE.Vector3(rand(-1,1),0,rand(-1,1)).normalize();moveMonster(mo,mo.wander,dt,.25);}
        continue;
      }
    }else if(mo.wild){
      tgt=dist2(mo.mesh.position,player.inVehicle?player.inVehicle.mesh.position:player.pos)<900?monsterTargets(mo):null;
    }else tgt=monsterTargets(mo);
    if(!tgt){ // 野怪巡逻
      if(!mo.wander||Math.random()<.005){mo.wander=new THREE.Vector3(rand(-1,1),0,rand(-1,1)).normalize();}
      moveMonster(mo,mo.wander,dt,.3);
      continue;
    }
    const dir=new THREE.Vector3().subVectors(tgt.pos,mo.mesh.position);dir.y=0;
    const dist=Math.sqrt(tgt.d2);
    // 目标在正上/正下（如直升机悬停在虫头顶）时水平向量趋近 0，
    // 取角度会把噪声放大成原地打转；此时保留上一帧朝向、不用零向量移动。
    const hlen=dir.length();
    if(hlen>1){dir.normalize();mo.mesh.rotation.y=Math.atan2(dir.x,dir.z);}else dir.set(0,0,0);
    // BOSS/精英技能：冲锋/弹幕/召唤
    if(mo.bs&&mo.bs.length&&mo.spitCd<=0&&mo.chargeT<=0){
      const skill=mo.bs[Math.floor(rand(0,mo.bs.length))];
      if(skill==='summon'&&monsters.length<44){
        mo.spitCd=7;
        const n=2+(Game.loop>2?1:0);
        for(let k=0;k<n&&monsters.filter(m=>!m.dead).length<48;k++){
          const s=spawnMonster('mob',mo.mesh.position.x+rand(-4,4),mo.mesh.position.z+rand(-4,4),{wild:mo.wild,ch:mo.ch,home:mo.home,quiet:true,emerge:true});
          if(!mo.wild){Game.wave.total++;Game.wave.spawned++;}
        }
        showMsg(mo.kind==='queen'?'⚠ 虫巢母皇召唤护卫！':'⚠ BOSS召唤了虫群！',1.2);
      }else if(skill==='barrage'&&dist<34){
        mo.spitCd=5;
        const from=mo.mesh.position.clone();from.y+=mo.hitH+.6;
        for(let k=0;k<10;k++){
          const a=k/10*TAU;
          fireBullet(from,new THREE.Vector3(Math.sin(a),0,Math.cos(a)),{dmg:mo.dmg*.45,speed:18,range:30,spread:0,color:0xaaff44},false);
        }
        AudioSys.sfx('shoot');
      }else if(skill==='charge'&&dist>8&&dist<28&&!mo.fly&&hlen>1){
        mo.spitCd=6;mo.chargeT=.75;mo.chargeDir=dir.clone();
        showMsg('⚠ '+(mo.kind==='boss'?chapterCfg().boss:'精英先锋')+' 发起冲锋！',1.2);
        AudioSys.sfx('wave');
      }else mo.spitCd=1.5;
    }
    const atkRange=mo.radius+tgt.r+(mo.ranged?14:1.2);
    const blockedShot=mo.ranged&&dist<=atkRange&&tgt.kind!=='gate'&&mo.atkCd<=0&&
      shotCover(mo.mesh.position.clone().add(new THREE.Vector3(0,mo.hitH+.5,0)),tgt.pos.clone().add(new THREE.Vector3(0,1,0)))<1;
    // Detours may temporarily move away from a target. Only actual immobility
    // counts as stuck; never interrupt a valid path around a wall.
    if(recoverStuckMonster(mo,tgt.pos,dt,dist>atkRange+1||blockedShot))continue;
    if(mo.chargeT>0){ // 冲锋中：直线突进
      mo.chargeT-=dt;
      moveMonster(mo,mo.chargeDir,dt,3.4);
    }else if(dist>atkRange||Math.abs(tgt.pos.y-mo.mesh.position.y)>6||blockedShot){
      let mdir=dir;mo.navWaypoint=tgt.pos;
      if(!mo.fly&&hlen>1){const nd=navDir(mo,tgt.pos);if(nd){mdir=nd;mo.mesh.rotation.y=Math.atan2(nd.x,nd.z);}}
      // 远处行军加速，缩短从虫洞到基地的空档；近基地恢复原速。
      const far=!rvOn()&&!mo.wild&&!mo.home&&mo.kind!=='boss'&&Math.hypot(mo.mesh.position.x-base.pos.x,mo.mesh.position.z-base.pos.z)>120;
      moveMonster(mo,mdir,dt,far?2.2:1,mo.navWaypoint||tgt.pos);
    }else if(mo.atkCd<=0){
      mo.atkCd=mo.ranged?1.6:1.0;
      if(mo.ranged&&dist>mo.radius+tgt.r+2){
        // 吐酸液
        const from=mo.mesh.position.clone();from.y+=mo.hitH+.5;
        const d3=new THREE.Vector3().subVectors(tgt.pos.clone().setY(tgt.pos.y+1),from).normalize();
        fireBullet(from,d3,{dmg:mo.dmg*.8,speed:22,range:40,spread:.03,color:0x99ff33},false);
        AudioSys.sfx('shoot');
      }else{
        // 近战
        const from=mo.mesh.position.clone().add(new THREE.Vector3(0,.55,0)),to=tgt.pos.clone().add(new THREE.Vector3(0,.55,0));
        const cover=firstWallHit(from,to);
        if(cover){damageBuilding(cover.wall,mo.dmg);continue;}
        if(['player','squad','vehicle'].includes(tgt.kind)&&shotCover(from,to,false)<1)continue;
        AudioSys.sfx('hit');
        spawnParticles(tgt.pos.clone().setY(tgt.pos.y+1),0xffee66,4,3,.3);
        if(tgt.kind==='player')withHuman(tgt.obj,()=>playerDamage(mo.dmg));
        else if(tgt.kind==='vehicle')damageVehicle(tgt.obj,mo.dmg);
        else if(tgt.kind==='squad')damageSquad(tgt.obj,mo.dmg);
        else if(tgt.kind==='building')damageBuilding(tgt.obj,mo.dmg);
        else if(tgt.kind==='gate')damageGate(mo.dmg);
        else if(tgt.kind==='base')damageBase(mo.dmg);
      }
    }
  }
}
function recoverStuckMonster(mo,to,dt,needsMove){
  if(mo.home||mo.fly||mo.chargeT>0||!needsMove){mo.stuckT=0;return false;}
  mo.trackT=(mo.trackT||0)+dt;
  if(mo.trackT>=1){mo.trackT=0;const p=mo.mesh.position,moved=mo.lastPX===undefined?1:Math.hypot(p.x-mo.lastPX,p.z-mo.lastPZ);mo.stuckT=moved<.15?(mo.stuckT||0)+1:0;mo.lastPX=p.x;mo.lastPZ=p.z;}
  if(mo.stuckT<5)return false;
  // Discard a cached route that makes no actual movement, including underground.
  mo.navPath=null;mo.navCooldown=0;return burrowToward(mo,to);
}
function burrowToward(mo,to){
  const p=mo.mesh.position,dx=to.x-p.x,dz=to.z-p.z,d=Math.hypot(dx,dz)||1,step=Math.min(16,Math.max(6,d-6));
  spawnParticles(new THREE.Vector3(p.x,groundY(p.x,p.z)+.4,p.z),0x6b5236,8,5,.6,1.3);
  for(const off of [0,.5,-.5,1,-1,1.5,-1.5]){
    const c=Math.cos(off),s=Math.sin(off),ux=(dx*c-dz*s)/d,uz=(dx*s+dz*c)/d;
    for(const k of [1,.7,.45]){const x=clamp(p.x+ux*step*k,WORLD.minX+3,WORLD.maxX-3),z=clamp(p.z+uz*step*k,WORLD.minZ+3,WORLD.maxZ-3);
      const y=groundY(x,z),ceiling=fortress.ceilingAt(x,z,y+.5);
      if(!collideWalls(x,z,mo.radius,y)&&!tooSteep(x,z)&&(!isFinite(ceiling)||ceiling-y>mo.hitH*2+.5)){p.set(x,y-2.6*mo.mesh.scale.y,z);mo.emerge=.9;mo.stuckT=0;mo.lastPX=x;mo.lastPZ=z;return true;}}
  }
  mo.stuckT=0;return false;
}
function moveMonster(mo,dir,dt,mul,goal=null){
  const beforeX=mo.mesh.position.x,beforeZ=mo.mesh.position.z;
  const sp=mo.speed*mul*(mo.slowT>0?mo.slowFactor:1);
  const margin=mo.radius+.2;
  const canMove=(x,z)=>x>WORLD.minX+margin&&x<WORLD.maxX-margin&&z>WORLD.minZ+margin&&z<WORLD.maxZ-margin&&!collideWalls(x,z,mo.radius,mo.fly?flyHeight(x,z):groundY(x,z))&&(mo.fly||!tooSteep(x,z));
  const step=monsterStep(mo,dir,dt,sp,goal,canMove);
  let nx=step.x,nz=step.z,px=0,pz=0;
  // Local separation spreads the front while retaining pursuit and attack range.
  if(!mo.fly){for(const other of monsters){if(other===mo||other.dead||other.fly)continue;
    const dx=nx-other.mesh.position.x,dz=nz-other.mesh.position.z,d2=dx*dx+dz*dz,space=(mo.radius+other.radius)*.85;
    if(d2<space*space&&d2>.0001){const d=Math.sqrt(d2),push=Math.min(.08,(space-d)*dt*3);px+=dx/d*push;pz+=dz/d*push;}
  }}
  // Crowd pressure cannot overwhelm forward motion or push a neighbour through
  // a narrow cave wall. If separation is blocked, retain the valid path step.
  const pressure=Math.hypot(px,pz),cap=sp*dt*.45;if(pressure>cap){px*=cap/pressure;pz*=cap/pressure;}
  if(clearMonsterSegment(mo.mesh.position,{x:nx+px,z:nz+pz},canMove)){nx+=px;nz+=pz;}
  if(clearMonsterSegment(mo.mesh.position,{x:nx,z:nz},canMove)){mo.mesh.position.x=nx;mo.mesh.position.z=nz;}
  mo.vx=(mo.mesh.position.x-beforeX)/dt;mo.vz=(mo.mesh.position.z-beforeZ)/dt;
  const gy=groundY(mo.mesh.position.x,mo.mesh.position.z);
  if(mo.fly){const want=flyHeight(mo.mesh.position.x,mo.mesh.position.z)+Math.sin(mo.anim*.5)*.5;mo.mesh.position.y+=(want-mo.mesh.position.y)*Math.min(1,dt*5);}
  else mo.mesh.position.y=gy;
}
/* 寻路：高台内外互通只能走正门斜坡 */
function navDir(mo,tgtPos){
  const p=mo.mesh.position;
  mo.navWaypoint=tgtPos;
  if(rvOn())return null; // 公路直接追击房车/人员，不走基地虫洞入口。
  const route=hiveNavigation(p,tgtPos);
  if(route){mo.navWaypoint=route;return new THREE.Vector3(route.x-p.x,0,route.z-p.z).normalize();}
  const onPlat=plateauH(p.x,p.z)>PLAT.H*.6;
  const tgtPlat=plateauH(tgtPos.x,tgtPos.z)>PLAT.H*.6;
  if(onPlat===tgtPlat){const wp=rampartNavigation(p,tgtPos);if(wp)mo.navWaypoint=wp;return wp?new THREE.Vector3(wp.x-p.x,0,wp.z-p.z).normalize():null;}
  // 已在坡道走廊内：沿坡直行
  if(Math.abs(p.x)<PLAT.rampW-1&&p.z>PLAT.rampTop-2&&p.z<PLAT.rampBot+4){
    mo.navWaypoint={x:p.x,z:tgtPlat?PLAT.rampTop-3:PLAT.rampBot+5};
    return new THREE.Vector3(0,0,tgtPlat?-1:1);
  }
  const wp=onPlat?new THREE.Vector3(0,0,PLAT.rampTop-2):new THREE.Vector3(0,0,PLAT.rampBot+3);
  mo.navWaypoint={x:wp.x,z:wp.z};
  return wp.sub(p).setY(0).normalize();
}
/* ---------- 建筑 ---------- */
function placeBuilding(kind,x,z,rotY,hp,savedMaxHp){
  const cfg=BUILDINGS[kind];
  const mesh=makeBuildingMesh(kind);
  mesh.position.set(x,groundY(x,z),z);mesh.rotation.y=rotY||0;
  scene.add(mesh);
  const maxHp=Math.round(cfg.hp*(1+(Game.loop-1)*.4));
  const restored=hp!=null&&savedMaxHp>0?maxHp*clamp(hp/savedMaxHp,0,1):hp;
  const bd={mesh,kind,hp:restored!=null?clamp(restored,0,maxHp):maxHp,maxHp,radius:kind==='wall'?3:(kind==='bunker'?2.6:1.4),
    dmg:cfg.dmg,rate:cfg.rate,range:cfg.range,explode:cfg.explode,fireCd:0,dead:false,
    isWall:kind==='wall',rotY:rotY||0};
  bd.bar=makeHPBar(kind==='wall'?4:2.6,'#6cf');bd.bar.position.y=kind==='wall'?COVER_HEIGHT+.35:3.6;mesh.add(bd.bar);updHPBar(bd.bar,bd.hp/maxHp);
  markTree(mesh);buildings.push(bd);
  return bd;
}
function syncBuildingDurability(){
  for(const bd of buildings){
    const maxHp=Math.round(BUILDINGS[bd.kind].hp*(1+(Game.loop-1)*.4));
    if(maxHp===bd.maxHp)continue;
    bd.hp=maxHp*clamp(bd.hp/bd.maxHp,0,1);bd.maxHp=maxHp;
    updHPBar(bd.bar,bd.hp/maxHp);
  }
}
function damageBuilding(bd,d){
  if(Game.testMode)return;
  if(bd.dead)return;
  bd.hp-=d;updHPBar(bd.bar,bd.hp/bd.maxHp);
  if(bd.hp<=0){
    recordBattleLoss('buildingLosses');
    bd.dead=true;
    spawnParticles(bd.mesh.position.clone().add(new THREE.Vector3(0,1.5,0)),0x999999,14,7,.7,1.5);
    AudioSys.sfx('boom');
    scene.remove(bd.mesh);
    buildings.splice(buildings.indexOf(bd),1);
  }
}
function damageBase(d){
  if(Game.testMode)return;
  if(Game.state==='over')return;
  base.hp-=d;updHPBar(base.bar,base.hp/base.maxHp);
  if(zergOn()){if(base.hp<=0){base.hp=0;zergMode.victory();}return;}
  if(!(Game.baseAlarm>0)){showMsg('⚠ 基地正在受袭！耐久归零即失败，立即回防',3);AudioSys.sfx('wave');}
  Game.baseAlarm=6;
  if(base.hp<=0){base.hp=0;gameOver('基地被摧毁！防线失守…');}
}
/* 墙体碰撞（旋转矩形近似） */
function collideWalls(x,z,r,y=groundY(x,z)){
  if(rvOn())return rvBreakout.blocked(x,z,r);
  if(fortress.blocked(x,z,r,y))return true;
  for(const bd of buildings){
    if(bd.dead)continue;
    if(y>=bd.mesh.position.y+(bd.isWall?COVER_HEIGHT:bd.kind==='bunker'?4:3.5)||y+2<=bd.mesh.position.y)continue;
    const dx=x-bd.mesh.position.x,dz=z-bd.mesh.position.z;
    if(bd.isWall){
      if(wallTouches(bd,x,z,r))return true;
    }else{
      if(dx*dx+dz*dz<(bd.radius+r)**2)return true;
    }
  }
  // 基地核心
  const dxb=x-base.pos.x,dzb=z-base.pos.z;
  if(y<base.pos.y+6&&dxb*dxb+dzb*dzb<(4+r)**2)return true;
  // 周边静态城墙
  for(const[rx,rz,hw,hd] of RAMPARTS){
    if(y<WALL_TOP-.8&&Math.abs(x-rx)<hw+r&&Math.abs(z-rz)<hd+r)return true;
  }
  // 城门（关闭时阻挡）
  if(y<PLAT.H+4.8&&gateBlocked()&&Math.abs(x-gate.pos.x)<6+r&&Math.abs(z-gate.pos.z)<.9+r)return true;
  return false;
}
/* 电弧特效：两点之间画一段发光线束，短暂显示 */
function zapLine(a,b,color){
  const dir=new THREE.Vector3().subVectors(b,a);
  const len=dir.length();
  const m=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,len,4),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));
  m.position.copy(a).addScaledVector(dir,.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
  scene.add(m);
  setTimeout(()=>{scene.remove(m);m.geometry.dispose();m.material.dispose();},90);
}
/* 炮塔自动索敌 */
function updBuildings(dt){
  const mul=turretDamageMul(Game,operations.active);
  for(const bd of buildings){
    if(bd.dead||!bd.dmg)continue;
    bd.fireCd-=dt;
    if(bd.fireCd>0)continue;
    let best=null,bd2=bd.range*bd.range;
    for(const mo of monsters){
      if(mo.dead||mo.home||mo.emerge>0||(bd.kind==='antiAir'&&!mo.fly)||(bd.kind==='mortarTurret'&&mo.fly))continue;
      const d2=dist2(bd.mesh.position,mo.mesh.position);
      if(d2<bd2){bd2=d2;best=mo;}
    }
    if(!best)continue;
    if(bd.kind==='cryoTurret'){
      bd.fireCd=bd.rate;
      const from=bd.mesh.position.clone().add(new THREE.Vector3(0,1.65,0));
      bd.mesh.userData.head.rotation.y=Math.atan2(best.mesh.position.x-from.x,best.mesh.position.z-from.z);
      const targets=monsters.filter(m=>!m.dead&&!m.home&&!(m.emerge>0)&&m.mesh.position.distanceToSquared(best.mesh.position)<=25)
        .sort((a,b)=>a.mesh.position.distanceToSquared(best.mesh.position)-b.mesh.position.distanceToSquared(best.mesh.position)).slice(0,6);
      for(const mo of targets){
        const to=mo.mesh.position.clone().add(new THREE.Vector3(0,mo.hitH,0));
        if(shotCover(from,to,true,from)<1||firstWallHit(from,to,true,from))continue;
        zapLine(from,to,0x72dfff);damageMonster(mo,bd.dmg*mul);
        mo.slowT=2;mo.slowFactor=mo.kind==='mob'?.45:.7;
      }
      AudioSys.sfx('laser');continue;
    }
    if(bd.kind==='teslaTurret'){
      // 电弧连锁：主目标+附近最多2只，伤害递减
      bd.fireCd=bd.rate;
      const from=bd.mesh.position.clone();from.y+=2.1;
      let prev=from,cur=best;
      const hitList=[cur];
      for(let k=0;k<2;k++){
        let nxt=null,nd2=8*8;
        for(const mo of monsters){
          if(mo.dead||hitList.includes(mo))continue;
          const d2=dist2(cur.mesh.position,mo.mesh.position);
          if(d2<nd2){nd2=d2;nxt=mo;}
        }
        if(!nxt)break;
        hitList.push(nxt);cur=nxt;
      }
      hitList.forEach((mo,idx)=>{
        const to=mo.mesh.position.clone();to.y+=mo.hitH;
        zapLine(prev,to,0xcc88ff);
        damageMonster(mo,bd.dmg*mul*Math.pow(.6,idx));
        prev=to;
      });
      AudioSys.sfx('shoot');
      continue;
    }
    bd.fireCd=bd.rate;
    const from=bd.mesh.position.clone();from.y+=bd.kind==='bunker'?3.2:bd.kind==='mortarTurret'?2.8:(bd.kind==='cannonTurret'?2:1.5);
    const to=best.mesh.position.clone();to.y+=best.hitH;
    const dir=new THREE.Vector3().subVectors(to,from);
    if(bd.mesh.userData.head)bd.mesh.userData.head.rotation.y=Math.atan2(dir.x,dir.z);
    if(bd.mesh.userData.gun)bd.mesh.userData.gun.rotation.y=Math.atan2(dir.x,dir.z);
    if(bd.kind==='antiAir'){
      fireBullet(from,dir,{beam:true,dmg:bd.dmg*mul,range:bd.range,color:0x8bffda},true);AudioSys.sfx('shoot');
    }else if(bd.kind==='mortarTurret'){
      const flightTime=clamp(Math.sqrt(bd2)/85,.3,.8),impact=best.mesh.position.clone();
      impact.x=clamp(impact.x+(best.vx||0)*flightTime,WORLD.minX+1,WORLD.maxX-1);
      impact.z=clamp(impact.z+(best.vz||0)*flightTime,WORLD.minZ+1,WORLD.maxZ-1);
      impact.y=groundY(impact.x,impact.z)+.2;
      fireBullet(from,dir,{dmg:bd.dmg*mul,speed:85,range:bd.range,spread:0,arc:true,flightTime,explode:bd.explode,color:0xffb85a},true,impact);
      AudioSys.sfx('cannon');
    }else if(bd.kind==='sniperTurret'){
      fireBullet(from,dir,{dmg:bd.dmg*mul,speed:140,range:bd.range+8,spread:0,color:0xaaffff},true);
      AudioSys.sfx('sniper');
    }else{
      fireBullet(from,dir,{dmg:bd.dmg*mul,speed:55,range:bd.range+6,spread:.04,explode:bd.explode,color:bd.kind==='cannonTurret'?0xff8844:0xffee88},true);
      AudioSys.sfx(bd.kind==='cannonTurret'?'cannon':'mg');
    }
  }
}

/* ---------- 载具 ---------- */
/* 枪口与炮塔（v0.17.14）：弹丸必须从模型上的枪管/炮管口射出，炮塔跟着目标转。
   玩家反馈「驾驶载具有 bug，射击不是从贴图上面射」——原来子弹固定在座位中心生成，
   和车模的炮管差 1.4~6 米，看起来像从车顶凭空开火。 */
function muzzleTip(node,fallback){
  if(!node||!node.geometry||!node.parent)return fallback;
  if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
  const bb=node.geometry.boundingBox,size=new THREE.Vector3(),c=new THREE.Vector3();
  bb.getSize(size);bb.getCenter(c);
  const ax=new THREE.Vector3();
  if(size.z>=size.x&&size.z>=size.y)ax.set(c.x,c.y,c.z+size.z/2);
  else if(size.y>=size.x)ax.set(c.x,c.y+size.y/2,c.z);
  else ax.set(c.x+size.x/2,c.y,c.z);
  node.updateWorldMatrix(true,false);
  ax.applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()));
  const tip=node.getWorldPosition(new THREE.Vector3()).add(ax);
  return Number.isFinite(tip.x)&&Number.isFinite(tip.y)&&Number.isFinite(tip.z)?tip:fallback;
}
function vehicleMuzzle(v){
  const fallback=v.mesh.position.clone();fallback.y+=v.cfg.fly?1.5:v.cfg.seatH+.6;
  const tip=muzzleTip(v.mesh.userData.gun,fallback);
  return tip.distanceTo(v.mesh.position)<8?tip:fallback; // 模型异常时退回座位高度，保证仍能开火
}
function vehicleAim(v,dir){
  const node=(v.mesh.userData.turret||v.mesh.userData.gun)||null;
  if(!node||!dir||!dir.lengthSq())return;
  node.rotation.y=Math.atan2(dir.x,dir.z)-v.yaw;
}
function squadMuzzle(s){
  const fallback=s.mesh.position.clone();fallback.y+=1.2;
  const tip=muzzleTip(s.mesh.userData.gun,fallback);
  return tip.distanceTo(s.mesh.position)<4?tip:fallback;
}
function spawnVehicle(kind){
  const cfg=kind==='rv'?RV_CFG:VEHICLES[kind];
  const mesh=makeVehicleMesh(kind);
  // 停机坪附近排列
  const idx=['jeep','tank','mech','heli'].indexOf(kind);
  const x=base.pos.x+24+(idx%2)*6-3,z=base.pos.z+4+Math.floor(idx/2)*7;
  mesh.position.set(x,groundY(x,z)+(cfg.fly?0:0),z);
  scene.add(mesh);
  const hp=Math.round(cfg.hp*(1+(Game.chapter-1)*.12)*(1+(Game.loop-1)*.4));
  const v={mesh,kind,cfg,hp,maxHp:hp,dead:false,fireCd:0,yaw:0,alt:0,homeX:x,homeZ:z};
  v.bar=makeHPBar(3.5,'#4af');v.bar.position.y=cfg.fly?3.2:3.4;mesh.add(v.bar);updHPBar(v.bar,1);
  markTree(mesh);vehicles.push(v);
  return v;
}
/* 载具：停放时不会被打坏；驾驶中被击毁只是“损毁”，仍归玩家所有，下一关准备阶段在停机坪修好。
   （原来击毁后直接从拥有列表删除，网友反馈“攒钱买的载具全没了”） */
function damageVehicle(v,d){
  if(vsOn()){versus.damage(v,d,v.team==='blue'?'red':'blue','vehicle',null,true);return;}
  if(Game.testMode)return;
  if(rvOn()&&v===rvBreakout.state.rv){
    if(v.dead||rvBreakout.state.over)return;
    v.hp=Math.max(0,v.hp-d);updHPBar(v.bar,v.hp/v.maxHp);
    spawnParticles(v.mesh.position.clone().add(new THREE.Vector3(0,1.5,0)),0xffaa44,4,4,.4);
    if(v.hp<=0){v.dead=true;rvBreakout.finish(false);}return;
  }
  if(v.dead||(!(coopHumans.length?coopHumans:[player]).some(p=>p.inVehicle===v)&&!v.driver))return;
  v.hp-=d;updHPBar(v.bar,v.hp/v.maxHp);
  spawnParticles(v.mesh.position.clone().add(new THREE.Vector3(0,1.5,0)),0xffaa44,4,4,.4);
  if(v.hp<=0){
    recordBattleLoss('vehicleLosses');
    v.dead=true;
    explode(v.mesh.position.clone(),3,30,true);
    if(v.driver){const driver=v.driver;leaveSquadVehicle(driver);damageSquad(driver,20);}
    else for(const human of coopHumans.length?coopHumans:[player])if(human.inVehicle===v)withHuman(human,()=>{exitVehicle();playerDamage(20);});
    visuals.release(v.mesh);scene.remove(v.mesh);vehicles.splice(vehicles.indexOf(v),1);
    showMsg('💥 '+v.cfg.name+' 损毁！下一关准备阶段自动在停机坪修复',2.6);
  }
}
function repairVehicles(){
  let n=0;
  for(const kind of [...new Set(Game.vehiclesOwned)]){
    const v=vehicles.find(v=>v.kind===kind);
    if(!v){spawnVehicle(kind);n++;}
    else if(player.inVehicle!==v){v.hp=v.maxHp;updHPBar(v.bar,1);}
  }
  if(n)showMsg('🔧 损毁载具已在停机坪修复',2);
}
function enterVehicle(v){
  if(!v||v.dead)return;
  if(vsOn()){const why=versus.enterReason(player,v);if(why){showMsg(why,1.5);return;}versus.takeVehicle(player,v);}
  if(coopHumans.some(p=>p!==player&&p.inVehicle===v)){showMsg('已有队友驾驶这辆载具',1.5);return;}
  let reassigned=false;
  for(let slot=0;slot<Game.squadCount;slot++)if(squadGear(slot).vehicle===v.kind){squadGear(slot).vehicle=null;reassigned=true;}
  if(v.driver)leaveSquadVehicle(v.driver);
  player.inVehicle=v;player.mesh.visible=false;player.vy=0;player.onGround=false;
  if(reassigned)autoSave();
  AudioSys.sfx('vehicle');
  showMsg(v.cfg.fly?'🚁 驾驶 '+v.cfg.name+(isTouch?'（升 / 降 按钮调高度，互动下车）':'（Y 升高 / H 降低，再按I下车）'):'🚗 驾驶 '+v.cfg.name+'（再按I下车）',v.cfg.fly?2.4:1.6);
}
function exitVehicle(){
  const v=player.inVehicle;if(!v)return;
  player.inVehicle=null;player.mesh.visible=true;
  // 下车点：优先车身右侧；直升机在大山/岩石上空被打爆时附近可能全是实体，
  // 就向外一圈圈找最近的空地，实在没有回基地检查点（原来会直接落进山体里出不来）。
  const vp=v.mesh.position;let spot=null;
  for(const a of [0,Math.PI,Math.PI/2,-Math.PI/2,Math.PI/4,-Math.PI/4,3*Math.PI/4,-3*Math.PI/4]){
    for(const r of [3.5,5,2.5]){const off=new THREE.Vector3(r,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),v.yaw+a);if(spotFree(vp.x+off.x,vp.z+off.z)){spot={x:vp.x+off.x,z:vp.z+off.z};break;}}
    if(spot)break;
  }
  spot=spot||findFreeSpot(vp.x,vp.z)||{x:0,z:-20};
  player.pos.set(spot.x,0,spot.z);
  player.vy=0;player.mesh.position.copy(player.pos);
  if(v.cfg.fly)v.landing=true;
  v.noEnter=1.2; // 下车冷却：防止立刻又上车
}
function spotFree(x,z){return x>WORLD.minX+1&&x<WORLD.maxX-1&&z>WORLD.minZ+1&&z<WORLD.maxZ-1&&!collideWalls(x,z,.65)&&!tooSteep(x,z);}
// 从 (x0,z0) 向外一圈圈找最近的可站立空地
function findFreeSpot(x0,z0,maxR=60){
  if(spotFree(x0,z0))return {x:x0,z:z0};
  for(let r=2;r<=maxR;r+=2){const n=Math.max(8,Math.round(r*2.4));for(let i=0;i<n;i++){const a=i/n*TAU,x=x0+Math.cos(a)*r,z=z0+Math.sin(a)*r;if(spotFree(x,z))return {x,z};}}
  return null;
}
function updVehicles(dt){
  for(const v of vehicles){
    if(v.dead)continue;
    visuals.animate(v.mesh,dt,(v.driver?v.moving:player.inVehicle===v&&Math.hypot(Input.axis().x,Input.axis().y)>.1)?'Walk':'Idle',camera);
    if(v.noEnter>0)v.noEnter-=dt;
    if(v.mesh.userData.rotor)v.mesh.userData.rotor.rotation.y+=dt*(player.inVehicle===v||v.driver?25:2);
    if((coopHumans.length?coopHumans:[player]).some(p=>p.inVehicle===v)||v.driver)continue; // 驾驶由玩家或队友逻辑更新
    if(v.cfg.fly){
      if(v.landing||v.alt>0){v.alt=Math.max(0,v.alt-dt*6);if(v.alt===0)v.landing=false;}
      v.mesh.position.y=Math.max(groundY(v.mesh.position.x,v.mesh.position.z),fortress.topAt(v.mesh.position.x,v.mesh.position.z))+v.alt;
    }
  }
}

function changeSquadRole(slot,role){
  if(coopCommand({kind:'squadRole',slot,role}))return;
  if(!Number.isInteger(slot)||slot<0||slot>=Game.squadCount||!Object.hasOwn(SQUAD_ROLES,role))return false;
  if(!Game.testMode&&((Game.state==='paused'?Game.pausedFrom:Game.state)!=='prep'||operations.active)){showMsg('准备阶段可免费转职，强化保留');return false;}
  const g=squadGear(slot),s=squad.find(s=>s.slot===slot);g.role=role;
  if(s){
    if(s.vehicle)leaveSquadVehicle(s);
    const ratio=s.hp/s.maxHp,old=s.mesh,mesh=makeSoldier(squadRole(slot).color);
    mesh.position.copy(old.position);mesh.rotation.copy(old.rotation);mesh.visible=!s.vehicle;
    mesh.add(s.bar);visuals.release(old);scene.remove(old);scene.add(mesh);s.mesh=mesh;s.tag=makeSquadTag(slot);mesh.add(s.tag);
    s.maxHp=squadMaxHp(slot);s.hp=Math.max(1,s.maxHp*ratio);updHPBar(s.bar,s.hp/s.maxHp);s.fireCd=0;
  }
  renderShop();autoSave();return true;
}
function assignSquadVehicle(slot,kind){
  if(coopCommand({kind:'squadVehicle',slot,id:kind}))return;
  if(!Number.isInteger(slot)||slot<0||slot>=Game.squadCount)return false;
  if(kind&&(!Object.hasOwn(VEHICLES,kind)||!Game.vehiclesOwned.includes(kind)))return false;
  if(kind&&(player.inVehicle?.kind===kind||Game.squadGear.some((g,i)=>i!==slot&&i<Game.squadCount&&g.vehicle===kind))){showMsg('该载具已有人驾驶或已分配');return false;}
  const s=squad.find(s=>s.slot===slot);
  if(s?.vehicle)leaveSquadVehicle(s);
  squadGear(slot).vehicle=kind||null;if(s){s.patrolTimer=0;s.boardDelay=0;}
  renderShop();autoSave();return true;
}
function mountSquadChoices(card,slot){
  const g=squadGear(slot),select=(title,key,options,value,disabled=false)=>{
    const label=document.createElement('label');label.className='crewChoice';label.textContent=title;
    const el=document.createElement('select');el.dataset[key]=slot;el.setAttribute('aria-label','队友'+(slot+1)+title);el.disabled=disabled;
    for(const [id,name,off] of options){const o=document.createElement('option');o.value=id;o.textContent=name;o.disabled=!!off;el.appendChild(o);}
    el.value=value;label.appendChild(el);card.appendChild(label);return el;
  };
  const canChange=Game.testMode||(!operations.active&&(Game.state==='paused'?Game.pausedFrom:Game.state)==='prep');
  select(canChange?'兵种（免费转职）':'兵种（准备阶段转职）','crewRole',Object.entries(SQUAD_ROLES).map(([id,r])=>[id,r.name]),squadRoleId(g.role),!canChange).onchange=e=>changeSquadRole(slot,e.target.value);
  const options=[['','步行（治疗 / 维修生效）']];
  for(const kind of Game.vehiclesOwned){
    const taken=Game.squadGear.some((other,i)=>i!==slot&&i<Game.squadCount&&other.vehicle===kind)||player.inVehicle?.kind===kind;
    options.push([kind,VEHICLES[kind].name+(taken?' · 已占用':vehicles.some(v=>v.kind===kind)?'':' · 修好后驾驶'),taken]);
  }
  select('驾驶分配','crewVehicle',options,g.vehicle||'').onchange=e=>assignSquadVehicle(slot,e.target.value);
  const note=document.createElement('p');note.className='desc';note.textContent=operations.active?'副本内步行跟随，返回后恢复驾驶分配。':'分配后自动上车、跟随/守基地并开火；玩家靠近按 I 可接管，队友转为步行。';card.appendChild(note);
}
function boardSquadVehicle(s,v){
  if(!s||s.dead||s.vehicle||!v||v.dead||v.driver||player.inVehicle===v||operations.active)return false;
  s.vehicle=v;v.driver=s;v.landing=false;s.mesh.visible=false;s.mesh.position.copy(v.mesh.position);s.wantsGate=false;s.stuck=0;v.fireCd=0;
  if(s.tag){v.mesh.add(s.tag);s.tag.position.y=4.1;}return true;
}
function leaveSquadVehicle(s){
  const v=s.vehicle;if(!v)return;
  s.vehicle=null;v.driver=null;v.moving=false;s.mesh.visible=true;s.wantsGate=false;s.boardDelay=2;
  if(s.tag){s.mesh.add(s.tag);s.tag.position.y=3.1;}
  const spot=findFreeSpot(v.mesh.position.x+3.5,v.mesh.position.z)||{x:0,z:-25};
  s.mesh.position.set(spot.x,groundY(spot.x,spot.z),spot.z);s.patrolTimer=0;
  if(v.cfg.fly)v.landing=true;
}
function updSquadDriver(s,dt,behavior){
  const v=s.vehicle;if(!v||v.dead||operations.active){leaveSquadVehicle(s);return;}
  const p=v.mesh.position,pp=player.inVehicle?player.inVehicle.mesh.position:player.pos;
  const cave=Number.isFinite(hiveCeiling(pp.x,pp.z))&&pp.y<hiveCeiling(pp.x,pp.z);
  const anchor=behavior==='defend'?squadAnchor(s):v.cfg.fly&&cave?nearestHiveMouth(pp).out:squadFollowPoint(s,pp);
  let dx=anchor.x-p.x,dz=anchor.z-p.z,best=null,bd=Infinity;
  const far=Math.hypot(dx,dz);
  for(const m of monsters){
    if(m.dead||m.emerge>0||(behavior==='defend'?!squadBaseThreat(m):dist2(m.mesh.position,pp)>32*32))continue;
    const d=dist2(m.mesh.position,p);if(d<v.cfg.range*v.cfg.range&&d<bd){bd=d;best=m;}
  }
  s.target=best;s.wantsGate=false;
  // Ground drivers use the entrance; aircraft fly above it without opening the gate.
  if(!v.cfg.fly&&(p.z<gate.pos.z)!==(anchor.z<gate.pos.z)){
    const inside=p.z<gate.pos.z,aligned=Math.abs(p.x)<PLAT.rampW-2;
    const wp=aligned?{x:0,z:inside?PLAT.rampBot+5:PLAT.rampTop-6}:{x:0,z:inside?PLAT.rampTop-8:PLAT.rampBot+5};
    dx=wp.x-p.x;dz=wp.z-p.z;s.wantsGate=Math.abs(p.x)<6.5&&Math.abs(p.z-gate.pos.z)<5;
  }
  const route=!v.cfg.fly&&hiveNavigation(p,anchor);
  if(route){dx=route.x-p.x;dz=route.z-p.z;}
  let length=Math.hypot(dx,dz);
  const stop=route?1:behavior==='defend'?2:5;
  if(length>stop){dx/=length;dz/=length;}else{dx=0;dz=0;}
  // Keep a vehicle-sized gap from the player and the other vehicles.
  for(const other of [pp,...vehicles.filter(o=>o!==v&&!o.dead).map(o=>o.mesh.position)]){
    const sx=p.x-other.x,sz=p.z-other.z,d=Math.hypot(sx,sz);if(d>.05&&d<4.5){dx+=sx/d*(4.5-d)*.7;dz+=sz/d*(4.5-d)*.7;}
  }
  length=Math.hypot(dx,dz);if(length>1){dx/=length;dz/=length;}
  const ox=p.x,oz=p.z;
  const chase=far>30?1.6:far>16?1.3:1; // 掉队时加速归队，玩家开车带队也不会把队友甩在身后
  if(v.cfg.fly){
    v.alt=Math.min(10,v.alt+dt*6);p.x=clamp(p.x+dx*v.cfg.speed*chase*dt,WORLD.minX+3,WORLD.maxX-3);p.z=clamp(p.z+dz*v.cfg.speed*chase*dt,WORLD.minZ+3,WORLD.maxZ-3);
    p.y=Math.max(groundY(p.x,p.z),fortress.topAt(p.x,p.z))+2+v.alt;
  }else if(length>.05){
    const yaw=Math.atan2(dx,dz),step=v.cfg.speed*chase*dt*slopeSpeed(groundY,p.x,p.z,dx,dz);
    // Steer around nearby structures instead of repeatedly pushing into their wall.
    let choice=null,score=Infinity;
    for(const turn of [0,.5,-.5,1,-1,1.5,-1.5]){
      const a=yaw+turn,nx=p.x+Math.sin(a)*step,nz=p.z+Math.cos(a)*step;
      if(!vehicleCanMove(v,nx,nz)||!clearMonsterSegment(p,{x:nx,z:nz},(x,z)=>vehicleCanMove(v,x,z)))continue;
      const value=Math.hypot(p.x+dx*12-nx,p.z+dz*12-nz)+Math.abs(turn)*.05;
      if(value<score){choice={x:nx,z:nz};score=value;}
    }
    if(choice){p.x=choice.x;p.z=choice.z;}
    else if(route){const next=monsterStep(v,{x:dx,z:dz},dt,v.cfg.speed*chase,route,(x,z)=>vehicleCanMove(v,x,z));p.x=next.x;p.z=next.z;}
    p.y=groundY(p.x,p.z);
  }
  v.moving=Math.hypot(p.x-ox,p.z-oz)>.001;
  if(v.moving){v.yaw=Math.atan2(p.x-ox,p.z-oz);v.mesh.rotation.y=v.yaw;}
  s.mesh.position.copy(p);v.fireCd-=dt;
  if(best&&v.fireCd<=0){
    v.fireCd=v.cfg.rate;
    const to=best.mesh.position.clone();to.y+=best.hitH;
    const aimDir=new THREE.Vector3().subVectors(to,p);
    vehicleAim(v,aimDir);
    const from=vehicleMuzzle(v);
    fireBullet(from,new THREE.Vector3().subVectors(to,from),{dmg:v.cfg.dmg*(1+(Game.chapter-1)*.1)*(1+(Game.loop-1)*.4),speed:70,range:v.cfg.range,spread:.03,explode:v.cfg.explode,color:0xffcc66},true,to);
    if(v.cfg.explode||Math.random()<.2)AudioSys.sfx(v.cfg.sfx);
  }
}
function updSquadSupport(dt){
  for(const s of squad){
    s.supportTarget=null;if(s.dead||s.vehicle)continue;
    const role=squadRoleId(squadGear(s.slot).role);if(role!=='medic'&&role!=='engineer')continue;
    const candidates=role==='medic'?[...squad.filter(o=>!o.dead&&!o.vehicle),...(!player.dead&&!player.inVehicle?[player]:[])]:[...vehicles.filter(v=>!v.dead),...buildings.filter(b=>!b.dead),...(!gate.dead?[gate]:[]),base];
    let target=null,ratio=1;
    for(const o of candidates){const pos=o.pos||o.mesh.position;if(o.hp<o.maxHp&&dist2(s.mesh.position,pos)<100&&o.hp/o.maxHp<ratio){target=o;ratio=o.hp/o.maxHp;}}
    if(target){
      s.supportTarget=target;target.hp=Math.min(target.maxHp,target.hp+(role==='medic'?6:14)*dt);updHPBar(target.bar,target.hp/target.maxHp);
      s.supportFx=(s.supportFx||0)-dt;if(s.supportFx<=0){s.supportFx=.7;const pos=(target.pos||target.mesh.position).clone();pos.y+=1.3;spawnParticles(pos,role==='medic'?0x55ffaa:0xffd56b,2,1,.5);}
    }
  }
}

/* ---------- AI队友 ---------- */
function makeSquadTag(slot){
  const c=document.createElement('canvas');c.width=192;c.height=48;const x=c.getContext('2d'),r=squadRole(slot);
  x.fillStyle='rgba(8,20,30,.85)';x.fillRect(0,0,192,48);x.font='bold 28px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillStyle='#'+r.color.toString(16).padStart(6,'0');x.fillText((slot+1)+' '+r.name,96,24);
  const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:true,depthWrite:false}));tag.scale.set(3.5,.88,1);tag.position.y=3.1;tag.userData.canvas=c;return tag;
}
function updateSquadTag(s,behavior){
  const tag=s.tag;if(!tag||!tag.userData.canvas)return;
  const role=squadRole(s.slot),label=(s.slot+1)+' '+role.name+' · '+(behavior==='defend'?'守家':'跟随');
  if(tag.userData.label===label)return;
  tag.userData.label=label;const x=tag.userData.canvas.getContext('2d');x.clearRect(0,0,192,48);x.fillStyle='rgba(8,20,30,.9)';x.fillRect(0,0,192,48);
  x.font='bold 22px sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillStyle='#'+role.color.toString(16).padStart(6,'0');x.fillText(label,96,24);tag.material.map.needsUpdate=true;
}
function squadGear(slot){return Game.squadGear[slot]||(Game.squadGear[slot]={weapon:0,armor:0,role:'gunner',vehicle:null,order:null});}
function squadLimit(){return Game.coop?4:MAX_SQUAD;}
function squadRole(slot){return SQUAD_ROLES[squadRoleId(squadGear(slot).role)];}
function squadMaxHp(slot){return Math.round(squadRole(slot).hp*(1+(Game.chapter-1)*.15)*(1+(Game.loop-1)*.5)*(1+squadGear(slot).armor*.25));}
function upgradeSquad(slot,kind){
  if(coopCommand({kind:'squadUpgrade',slot,gear:kind}))return;
  if(!Number.isInteger(slot)||slot<0||slot>=Game.squadCount||!['weapon','armor'].includes(kind))return false;
  const gear=squadGear(slot),lv=gear[kind],price=(kind==='weapon'?180:140)*(lv+1);
  if(lv>=5){showMsg('该装备已满级 Lv5');return false;}
  if(!Game.testMode&&Game.gold<price){showMsg('金币不足，升级需要 '+price);return false;}
  if(!Game.testMode)spendGold(price);gear[kind]++;
  const mate=squad.find(s=>s.slot===slot);
  if(mate&&kind==='armor'){const hp=squadMaxHp(slot);mate.hp=Math.min(hp,mate.hp+hp-mate.maxHp);mate.maxHp=hp;updHPBar(mate.bar,mate.hp/hp);}
  AudioSys.sfx('buy');showMsg('队友 '+(slot+1)+' '+(kind==='weapon'?'武器':'护甲')+' 升至 Lv'+gear[kind],2);renderShop();autoSave();return true;
}
function spawnSquad(requestedSlot){
  if(squad.length>=squadLimit())return;
  const slot=Number.isInteger(requestedSlot)?requestedSlot:Array.from({length:squadLimit()},(_,i)=>i).find(i=>!squad.some(s=>s.slot===i));
  if(!Number.isInteger(slot)||slot<0||slot>=squadLimit()||squad.some(s=>s.slot===slot))return;
  const mesh=makeSoldier(squadRole(slot).color);
  const pp=player.inVehicle?player.inVehicle.mesh.position:player.pos;
  const point=squadPatrolPoint(pp,slot,0);
  mesh.position.set(point.x,groundY(point.x,point.z),point.z);
  scene.add(mesh);
  const hp=squadMaxHp(slot);
  const s={mesh,slot,hp,maxHp:hp,dead:false,fireCd:slot*.07,anim:0,patrol:point,patrolStep:0,patrolTimer:2+slot*.7,stuck:0,wantsGate:false};
  s.bar=makeHPBar(1.8,'#ff6');s.bar.position.y=2.6;mesh.add(s.bar);updHPBar(s.bar,1);
  s.tag=makeSquadTag(slot);mesh.add(s.tag);squad.push(s);return s;
}
/* 队友重伤后撤离，下一关准备阶段归队（不再永久损失雇佣费）。 */
function damageSquad(s,d){
  if(Game.testMode)return;
  if(s.dead)return;
  if(s.vehicle){damageVehicle(s.vehicle,d);return;}
  // 受击后 0.5 秒恢复窗口：同一时间被多只虫扑到只结算一次，避免顶在前面的队友（尤其突击兵）被瞬间集火秒掉
  if(s.hitInvuln>0)return;
  s.hitInvuln=.5;
  s.hp-=d;updHPBar(s.bar,s.hp/s.maxHp);
  spawnParticles(s.mesh.position.clone().add(new THREE.Vector3(0,1.1,0)),0xff8866,3,3,.25);
  if(s.hp<=0){
    recordBattleLoss('squadLosses');
    s.dead=true;spawnParticles(s.mesh.position.clone().add(new THREE.Vector3(0,1,0)),0xff6666,8,5,.5);
    visuals.release(s.mesh);scene.remove(s.mesh);squad.splice(squad.indexOf(s),1);
    showMsg('🚑 一名队友重伤撤离，下一关归队',1.6);
  }
}
const SQUAD_ORDERS={follow:'跟随我',defend:'守基地'};
function nearestHiveMouth(p){return MOUTHS.reduce((best,m)=>dist2(m.out,p)<dist2(best.out,p)?m:best);}
function vehicleCanStand(v,x,z){
  if(x<WORLD.minX+4||x>WORLD.maxX-4||z<WORLD.minZ+4||z>WORLD.maxZ-4||tooSteep(x,z)||collideWalls(x,z,2.5))return false;
  const y=groundY(x,z),height=v.cfg.fly?9:v.kind==='mech'?5:3.5;
  return [[0,0],[2.5,0],[-2.5,0],[0,3],[0,-3]].every(([dx,dz])=>Math.abs(groundY(x+dx,z+dz)-y)<2.5&&hiveCeiling(x+dx,z+dz)>y+height);
}
function vehicleCanMove(v,x,z){
  if(x<WORLD.minX+3||x>WORLD.maxX-3||z<WORLD.minZ+3||z>WORLD.maxZ-3||collideWalls(x,z,2)||tooSteep(x,z))return false;
  return !Number.isFinite(hiveCeiling(x,z))||vehicleCanStand(v,x,z);
}
function rescueSpot(center,radius,canStand,occupied){
  const y=groundY(center.x,center.z),underground=Number.isFinite(hiveCeiling(center.x,center.z));
  for(let r=radius+2;r<=18;r+=2)for(let i=0;i<24;i++){
    const a=i*TAU/24,x=center.x+Math.sin(a)*r,z=center.z+Math.cos(a)*r;
    if(!canStand(x,z)||Math.abs(groundY(x,z)-y)>4||Number.isFinite(hiveCeiling(x,z))!==underground)continue;
    if(occupied.some(o=>Math.hypot(o.x-x,o.z-z)<radius+o.r+1))continue;
    return{x,z};
  }
  return null;
}
function setSquadTask(task){
  if(coopCommand({kind:'order',task}))return;
  if(!Object.hasOwn(SQUAD_ORDERS,task))return false;
  Game.squadOrder=task;
  for(const gear of Game.squadGear)if(gear)gear.order=null;
  for(const s of squad){s.patrolTimer=0;s.navPath=null;}
  syncPauseOptions();autoSave();AudioSys.sfx('click');return true;
}
function setSquadMemberTask(slot,task){
  if(coopCommand({kind:'memberOrder',slot,task}))return true;
  if(!Number.isInteger(slot)||slot<0||slot>=Game.squadCount||!Object.hasOwn(SQUAD_ORDERS,task))return false;
  squadGear(slot).order=task;
  const mate=squad.find(s=>s.slot===slot);if(mate){mate.patrolTimer=0;mate.navPath=null;mate.target=null;}
  autoSave();AudioSys.sfx('click');return true;
}
function setSquadAutoDefense(enabled){if(coopCommand({kind:'autoDefense',enabled:!!enabled}))return;Game.squadAutoDefense=!!enabled;Game.squadAlert=0;autoSave();syncPauseOptions();}
function squadBaseThreat(mo){
  return !mo.dead&&!mo.home&&(dist2(mo.mesh.position,base.pos)<30*30||dist2(mo.mesh.position,gate.pos)<24*24);
}
function squadBehavior(s){
  if(operations.active)return 'follow';
  const order=s&&squadGear(s.slot).order;
  if(order==='follow'||order==='defend')return order;
  return Game.squadOrder==='defend'||Game.squadAutoDefense!==false&&Game.squadAlert>0?'defend':'follow';
}
function squadTaskLabel(){
  if(operations.active)return '副本跟随';
  const defend=squad.filter(s=>!s.dead&&squadBehavior(s)==='defend').length,follow=squad.length-defend;
  if(defend&&follow)return '留守'+defend+' / 跟随'+follow;
  return defend?'留守基地':Game.squadAutoDefense!==false&&Game.squadAlert>0?'自动回防':'跟随我';
}
function updSquadOrderBtn(){
  const defend=Game.squadOrder==='defend';
  const label='队友：'+(defend?'守基地':'跟随我');
  const tip=defend?'当前守基地，点击改为跟随出击（基地受威胁时仍会自动回防）':'当前跟随出击，点击改为守基地（基地受威胁时会自动回防）';
  const hud=$('squadOrderBtn');
  if(hud){
    const usable=!!(Game.squadCount||squad.length)&&!operations.active;
    hud.classList.toggle('hidden',!usable);
    if(usable){
      if(hud.textContent!==label)hud.textContent=label;
      hud.setAttribute('aria-pressed',String(defend));hud.title=tip;
    }
  }
  const pause=$('squadOrderPause');
  if(pause){
    if(pause.textContent!==label)pause.textContent=label;
    pause.setAttribute('aria-pressed',String(defend));pause.title=tip;
    pause.disabled=!(Game.squadCount||squad.length)||operations.active;
  }
}
function squadAnchor(s){
  if(!s.vehicle&&squadRoleId(squadGear(s.slot).role)==='engineer'){
    const targets=[...buildings.filter(b=>!b.dead),...vehicles.filter(v=>!v.dead),...(!gate.dead?[gate]:[]),base];
    let target=null,ratio=.999;
    for(const object of targets){const position=object.pos||object.mesh.position;if(dist2(position,base.pos)>55*55||object.hp/object.maxHp>=ratio)continue;target=object;ratio=object.hp/object.maxHp;}
    if(target){const position=target.pos||target.mesh.position;
      // Wall-top turrets sit beyond the gate's z coordinate. Approach from the
      // inner wall walk so entrance routing doesn't repeatedly pull the repairer back.
      const center={x:position.x,z:Math.min(position.z,gate.pos.z-4)},spot=rescueSpot(center,.65,squadCanWalk,[]);if(spot)return spot;
    }
    // Stay within repair range of the gate when every structure is healthy.
    return {x:-4+(s.slot%2)*8,z:-18-Math.floor(s.slot/4)*3.5};
  }
  // 虫群突破到基地后收缩防线；门外的敌人只在城门防线内应战。
  const breached=monsters.some(mo=>squadBaseThreat(mo)&&mo.mesh.position.z<-30);
  const column=s.slot%4,row=Math.floor(s.slot/4);
  return breached?{x:base.pos.x+[-7,-2,3,8][column],z:base.pos.z+7+(column%2)*3+row*4}
    :{x:[-12,-21,12,21][column],z:-18-row*3.5};
}
function squadCanWalk(x,z){
  return x>WORLD.minX+1&&x<WORLD.maxX-1&&z>WORLD.minZ+1&&z<WORLD.maxZ-1&&!collideWalls(x,z,.65)&&!tooSteep(x,z);
}
function squadPatrolPoint(center,slot,step){
  for(let i=0;i<24;i++){
    const angle=(slot%4)*TAU/4+step*.65+i*.38,r=6+Math.floor(slot/4)*3+(i%3)*2;
    const x=center.x+Math.cos(angle)*r,z=center.z+Math.sin(angle)*r;
    if(squadCanWalk(x,z)&&squad.every(s=>Math.hypot(s.mesh.position.x-x,s.mesh.position.z-z)>2.5))return{x,z};
  }
  return{x:center.x,z:center.z};
}
/* 编队（v0.17.14，按玩家反馈「点了跟随还要我一步一步带他们走」重做）：
   跟随点贴在玩家前进方向的后方与两翼，按兵种分前后层次；玩家移动/奔跑/开车时队伍整体跟上，
   掉队的队友用比平时更快的速度归队，而不是停在原地等玩家回来领。 */
const SQUAD_FORM={
  gunner:{fwd:4,tag:'前排压制'},
  assault:{fwd:1,tag:'中线接敌'},
  medic:{fwd:-6,tag:'殿后治疗'},
  engineer:{fwd:-6,tag:'殿后维修'},
};
const SQUAD_LATERAL=[-4.6,4.6,-1.8,1.8];
let squadPrevPP=null,squadHeading={x:0,z:1};
function updateSquadHeading(pp){
  if(squadPrevPP){
    const dx=pp.x-squadPrevPP.x,dz=pp.z-squadPrevPP.z,d=Math.hypot(dx,dz);
    if(d>.08)squadHeading={x:dx/d,z:dz/d};
  }
  squadPrevPP={x:pp.x,z:pp.z};
}
function squadFollowPoint(s,pp){
  const base=SQUAD_FORM[squadRoleId(squadGear(s.slot).role)]||SQUAD_FORM.gunner;
  const inTunnel=Number.isFinite(hiveCeiling(pp.x,pp.z))&&Math.hypot(pp.x-HIVE.x,pp.z-HIVE.z)>24;
  const lateral=SQUAD_LATERAL[s.slot%4]*(inTunnel?.45:1),fwd=base.fwd+(s.slot%2?1.2:0)-Math.floor(s.slot/4)*3.5;
  // 前进方向 * 前后距离 + 右方向 * 左右偏移（右方向 = 前进方向逆时针 90°）
  for(const k of[1,.8,.6,.4,0]){
    const x=pp.x+squadHeading.x*fwd*k-squadHeading.z*lateral*k;
    const z=pp.z+squadHeading.z*fwd*k+squadHeading.x*lateral*k;
    if(squadCanWalk(x,z)&&(!inTunnel||Math.abs(groundY(x,z)-pp.y)<3&&hiveCeiling(x,z)>groundY(x,z)+2.4))return{x,z};
  }
  return{x:pp.x,z:pp.z};
}
function updSquad(dt){
  const t=performance.now()/1000;
  const battle=(Game.state==='paused'?Game.pausedFrom:Game.state)==='battle';
  if(!battle||operations.active)Game.squadAlert=0;
  else Game.squadAlert=monsters.some(squadBaseThreat)?3:Math.max(0,(Game.squadAlert||0)-dt);
  const pp=player.inVehicle?player.inVehicle.mesh.position:player.mesh.position;
  updateSquadHeading(pp);
  const targeting=new Map();
  for(const mate of squad)if(!mate.dead&&mate.target)targeting.set(mate.target,(targeting.get(mate.target)||0)+1);
  for(const s of squad){
    if(s.dead)continue;
    const behavior=squadBehavior(s);
    updateSquadTag(s,behavior);
    s.boardDelay=Math.max(0,(s.boardDelay||0)-dt);
    s.hitInvuln=Math.max(0,(s.hitInvuln||0)-dt);
    if(s.vehicle){updSquadDriver(s,dt,behavior);continue;}
    const role=squadRole(s.slot),assigned=!operations.active&&s.boardDelay<=0?vehicles.find(v=>v.kind===squadGear(s.slot).vehicle&&!v.dead&&!v.driver&&player.inVehicle!==v&&!(v.noEnter>0)&&!(behavior==='follow'&&Number.isFinite(hiveCeiling(pp.x,pp.z))&&!Number.isFinite(hiveCeiling(v.mesh.position.x,v.mesh.position.z)))):null;
    if(assigned&&dist2(s.mesh.position,assigned.mesh.position)<25&&Math.abs(s.mesh.position.y-assigned.mesh.position.y)<3){boardSquadVehicle(s,assigned);continue;}
    s.anim+=dt;s.fireCd-=dt;
    if(typeof s.mesh.userData.tick==='function')s.mesh.userData.tick(dt,t);
    const p=s.mesh.position;
    const d2p=dist2(p,pp);
    // 各自索敌；已有队友照顾的敌人降低优先级，但单一首领允许集火。
    let best=null,bd2=0,score=Infinity;
    for(const mo of monsters){
      if(mo.dead)continue;
      // 只照顾队形附近的敌人，不因追击残血虫远离玩家或基地。
      if(behavior==='defend'?!squadBaseThreat(mo):dist2(mo.mesh.position,pp)>24*24)continue;
      const d2=dist2(s.mesh.position,mo.mesh.position);if(d2>role.range*role.range)continue;
      const value=d2+Math.max(0,(targeting.get(mo)||0)-(s.target===mo?1:0))*180;
      if(value<score){score=value;bd2=d2;best=mo;}
    }
    if(s.target)targeting.set(s.target,Math.max(0,(targeting.get(s.target)||0)-1));
    if(best)targeting.set(best,(targeting.get(best)||0)+1);
    s.target=best;s.patrolTimer-=dt;
    if(s.behavior!==behavior){s.behavior=behavior;s.patrolTimer=0;}
    // 位置目标：守基地用固定岗位；跟随用编队点（按兵种层次贴在玩家前进方向的后方与两翼）。
    const anchor=behavior==='defend'?squadAnchor(s):null;
    const post=anchor||squadFollowPoint(s,pp);
    s.patrol=post;
    const far=Math.hypot(p.x-post.x,p.z-post.z);
    const outOfPosition=far>(anchor?8:7),hurt=s.hp<s.maxHp*.35;
    // 队友被设施或残骸压住时（旧存档或其他原因），0.4 秒后挪到最近空地
    if(collideWalls(p.x,p.z,.65)){s.insideT=(s.insideT||0)+dt;if(s.insideT>.4){const f=findFreeSpot(p.x,p.z);if(f){p.x=f.x;p.z=f.z;}s.insideT=0;}}else s.insideT=0;
    let dx=post.x-p.x,dz=post.z-p.z,goal=post;
    // Nearby supplies only: don't abandon a defence post or cross the map for loot.
    let loot=null,lootScore=Infinity;
    if(!outOfPosition&&(!best||hurt||s.hp<s.maxHp*.5))for(const pk of pickups){
      if(pk.type!=='gold'&&s.hp>=s.maxHp)continue;
      const d=dist2(pk.mesh.position,p);
      if(d>64||Math.abs(groundY(pk.mesh.position.x,pk.mesh.position.z)-p.y)>2)continue;
      if(dist2(pk.mesh.position,post)>(anchor?8*8:12*12))continue;
      const priority=d+(pk.type==='gold'?64:0);
      if(priority<lootScore){loot=pk;lootScore=priority;}
    }
    if(best&&!outOfPosition&&!hurt){
      const distance=Math.sqrt(bd2),range=role.hold+(s.slot%4)*.5;
      const advance=distance<7?-1:!anchor&&distance>range?1:0;
      const mx=(best.mesh.position.x-p.x)*advance,mz=(best.mesh.position.z-p.z)*advance;
      // 保持射程；只有下一步仍在编队内才追击或后撤。守基地时先走到岗位。
      const len=Math.hypot(mx,mz)||1,next={x:p.x+mx/len*2,z:p.z+mz/len*2};
      if((!anchor||dist2(p,anchor)<3*3)&&dist2(next,post)<12*12){dx=mx;dz=mz;goal={x:p.x+mx*6,z:p.z+mz*6};}
    }
    if(loot){dx=loot.mesh.position.x-p.x;dz=loot.mesh.position.z-p.z;goal={x:loot.mesh.position.x,z:loot.mesh.position.z};}
    if(assigned){dx=assigned.mesh.position.x-p.x;dz=assigned.mesh.position.z-p.z;goal={x:assigned.mesh.position.x,z:assigned.mesh.position.z};}
    // Route the final movement target through the entrance before avoidance.
    s.wantsGate=false;
    const dest={x:p.x+dx,z:p.z+dz};
    if((p.z<gate.pos.z)!==(dest.z<gate.pos.z)){
      const inside=p.z<gate.pos.z;
      const aligned=Math.abs(p.x)<PLAT.rampW-1;
      const wp=aligned?{x:0,z:inside?PLAT.rampBot+4:PLAT.rampTop-4}:{x:0,z:inside?PLAT.rampTop-6:PLAT.rampBot+3};
      dx=wp.x-p.x;dz=wp.z-p.z;
      s.wantsGate=Math.abs(p.x)<6.5&&Math.abs(p.z-gate.pos.z)<5;
    }
    const route=hiveNavigation(p,dest)||((p.z<gate.pos.z)===(dest.z<gate.pos.z)?rampartNavigation(p,dest):null);
    if(route){dx=route.x-p.x;dz=route.z-p.z;}
    let length=Math.hypot(dx,dz);if(length>.3){dx/=length;dz/=length;}else{dx=0;dz=0;}
    // 包含玩家的软避让；完全重合时也有稳定且不同的分离方向。
    for(const other of [...squad.filter(o=>o!==s).map(o=>o.mesh.position),pp]){
      let sx=p.x-other.x,sz=p.z-other.z,d=Math.hypot(sx,sz);
      if(d>=2.6)continue;
      if(d<.01){sx=Math.cos(s.slot*TAU/4);sz=Math.sin(s.slot*TAU/4);d=1;}
      const force=(2.6-d)*2;dx+=sx/d*force;dz+=sz/d*force;
    }
    length=Math.hypot(dx,dz);if(length>1){dx/=length;dz/=length;}
    // 追赶：脱队越远跑得越快，玩家跑步/开车时队伍不会再用被甩在几十米外等玩家回来领
    const chase=far>22?2.6:far>12?1.9:far>7?1.35:1;
    const speed=role.speed*chase*slopeSpeed(groundY,p.x,p.z,dx,dz),ox=p.x,oz=p.z;
    const stepLen=speed*dt,nx=p.x+dx*stepLen,nz=p.z+dz*stepLen;
    let stepped=false;
    if(squadCanWalk(nx,nz)){p.x=nx;p.z=nz;stepped=true;}
    else{
      // 只在"贴着墙还能继续朝目标走"时才侧滑；斜滑方向偏离目标太大说明是在墙根来回蹭，
      // 这时改用绕行路径，否则队友会沿着自己修的围墙滑半天也过不去（网友说的"卡住"）。
      let bestDot=.57,bx=0,bz=0;
      for(const[cx,cz]of[[nx,p.z],[p.x,nz]]){
        const vx=cx-p.x,vz=cz-p.z,d=Math.hypot(vx,vz);if(d<1e-4)continue;
        const dot=(vx*dx+vz*dz)/d;if(dot>bestDot){bestDot=dot;bx=vx;bz=vz;}
      }
      if(bx||bz){p.x+=bx;p.z+=bz;stepped=true;}
    }
    // 三个方向都被挡或已经顶住障碍：走虫群同款的局部绕行路径，不再原地撞墙
    if(!stepped||s.stuck>.25){
      const detour=monsterStep(s,{x:dx,y:0,z:dz},dt,speed,route||{x:goal.x,z:goal.z},squadCanWalk);
      if(detour&&(detour.x!==p.x||detour.z!==p.z)){p.x=detour.x;p.z=detour.z;}
    }
    const moved=Math.hypot(p.x-ox,p.z-oz);
    s.stuck=moved<.005&&length>.3?s.stuck+dt:0;
    visuals.animate(s.mesh,dt,moved>.001?'Walk':'Idle',camera);
    if(moved>.001)s.mesh.rotation.y=Math.atan2(p.x-ox,p.z-oz);
    s.mesh.position.y=groundY(s.mesh.position.x,s.mesh.position.z);
    if(best&&s.fireCd<=0&&bd2<role.range*role.range&&best.emerge<=0){
      s.fireCd=role.rate/(1+squadGear(s.slot).weapon*.08);
      const to=best.mesh.position.clone();to.y+=best.hitH;
      s.mesh.rotation.y=Math.atan2(to.x-p.x,to.z-p.z);
      const from=squadMuzzle(s,to);
      fireBullet(from,new THREE.Vector3().subVectors(to,from),{dmg:role.damage*(1+(Game.chapter-1)*.12)*(1+(Game.loop-1)*.4)*(1+squadGear(s.slot).weapon*.25),pellets:role.pellets,speed:58,range:role.range,spread:role.pellets?.18:.05,color:role.color},true);
      if(Math.random()<.3)AudioSys.sfx(role.pellets?'shotgun':'mg');
    }
    // 医疗兵光环治疗队友
    const cls=CLASSES[Game.cls];
    if(!player.dead&&!player.inVehicle&&cls.aura&&d2p<cls.auraRange*cls.auraRange){s.hp=Math.min(s.maxHp,s.hp+cls.aura*dt);updHPBar(s.bar,s.hp/s.maxHp);}
  }
  updSquadSupport(dt);
}

/* ---------- 玩家控制 ---------- */
// 自动瞄准：在 facing 周围 minDot 锥形内挑目标（首领/精英优先），返回 {dir,target,mo}
function autoAim(from,facing,range,minDot=.2){
  let best=null,bestScore=minDot<0?-Infinity:-1;
  const flat=new THREE.Vector3(facing.x,0,facing.z).normalize();
  for(const mo of (vsOn()?versus.aimTargets(player.team):monsters)){
    if(mo.dead||mo.emerge>0)continue;
    const d2=dist2(from,mo.mesh.position);
    if(d2>range*range)continue;
    if(vsOn()&&!versus.visible(from,mo.mesh.position.clone().add(new THREE.Vector3(0,mo.hitH||1,0))))continue;
    const dir=new THREE.Vector3().subVectors(mo.mesh.position,from);dir.y=0;dir.normalize();
    const dot=dir.dot(flat);
    if(dot<minDot)continue;
    let score=dot*2-Math.sqrt(d2)/range;
    if(mo.kind==='boss'||mo.kind==='queen')score+=1.2;else if(mo.kind==='miniboss')score+=.8;else if(mo.elite)score+=.5;
    score+=mo.aimBias||0;
    if(score>bestScore){bestScore=score;best=mo;}
  }
  if(best){
    const to=best.mesh.position.clone();to.y+=(best.hitH||1)*1.1;
    return {dir:new THREE.Vector3().subVectors(to,from).normalize(),target:to,mo:best};
  }
  return {dir:facing.clone().normalize(),target:null,mo:null};
}
function autoAimDir(from,facing,range){return autoAim(from,facing,range).dir;}
function camForward(withPitch){const cp=withPitch?Math.cos(camPitch):1;return new THREE.Vector3(Math.sin(camYaw)*cp,withPitch?Math.sin(camPitch):0,Math.cos(camYaw)*cp).normalize();}
function lookUser(){return !!document.pointerLockElement||performance.now()-(Input.lastLook||-1e9)<5000;}
// PC 第三人称自动瞄准覆盖四周；手动瞄准沿镜头，第一人称保留准星附近辅助。
// 触屏沿用镜头前方寻敌和移动方向兜底。
function playerAim(from,range,moveDir){
  if(Input.network){if(Input.network.autoAim)return autoAim(from,camForward(false),range,.3);return {dir:camForward(false),target:null,mo:null};}
  if(!isTouch){
    const f=camForward(camMode==='first');
    if(!CombatControls.autoAim)return {dir:f,target:from.clone().addScaledVector(f,Math.min(range,26)),mo:null};
    // Full-circle targeting keeps keyboard retreat independent of aim. First person retains crosshair control.
    if(camMode==='third')return autoAim(from,f,range,-1);
  }
  if(camMode==='first'){
    const f=camForward(true),a=autoAim(from,f,range,isTouch?.94:.975);
    if(a.mo&&Math.abs(a.dir.y-f.y)<(isTouch?.2:.12))return a;
    return {dir:f,target:from.clone().addScaledVector(f,Math.min(range,26)),mo:null};
  }
  const f=camForward(false);let a=autoAim(from,f,range,.5);
  if(!a.mo&&moveDir&&!lookUser()){a=autoAim(from,moveDir,range,.3);if(!a.mo)return {dir:moveDir.clone(),target:null,mo:null};}
  return a.mo?a:{dir:f,target:null,mo:null};
}
function automaticFireTarget(from,range,aim){
  if(rvOn())return !!aim.mo&&aim.mo.mode==='chase';
  if(aim.mo)return true;
  if(isTouch||CombatControls.autoAim)return false;
  const target=autoAim(from,aim.dir,range,.995);
  return !!target.mo&&target.dir.dot(aim.dir)>.995;
}
function interactionTarget(){
  if(rvOn()){const action=rvBreakout.interaction();if(action)return action;}
  if(player.inVehicle)return {kind:'exit',label:'下车',tip:'I 下车'+(player.inVehicle.cfg.fly?(isTouch?' · 升 / 降 按钮调高度':' · Y 升高 / H 降低'):'')};
  let vehicle=null,best=20;
  for(const v of vehicles){const d=dist2(player.pos,v.mesh.position);if(!v.dead&&(!vsOn()||v.team===player.team)&&!coopHumans.some(p=>p!==player&&p.inVehicle===v)&&!(v.noEnter>0)&&d<best&&Math.abs(player.pos.y-v.mesh.position.y)<3){vehicle=v;best=d;}}
  if(vehicle)return {kind:'vehicle',vehicle,label:vehicle.driver?'接管':'驾驶',tip:'I '+(vehicle.driver?'接管（队友下车） ':'驾驶 ')+vehicle.cfg.name};
  if(dist2(player.pos,gate.mesh.position)<170&&Math.abs(player.pos.y-PLAT.H)<2)return {kind:'gate',label:gate.dead?'城门损毁':gate.open?'关门':'开门',tip:gate.dead?'城门损毁，下关自动修复':'I '+(gate.open?'关闭':'开启')+'城门 · 走向城门会自动开门'};
  return {kind:'none',label:'互动',tip:''};
}
function updInteraction(){
  const a=interactionTarget();if($('vI').textContent!==a.label)$('vI').textContent=a.label;
  let tip=a.tip;
  const medicalDistance=Math.hypot(player.pos.x-fortress.shelter.x,player.pos.z-fortress.shelter.z);
  if(!tip&&!player.inVehicle&&medicalDistance<10)tip=medicalDistance<fortress.shelter.r?(player.hp<player.maxHp?'＋ 野战医疗站 · 正在自动回血':'＋ 野战医疗站 · 生命已恢复'):'＋ 野战医疗站 · 走进绿色圆圈自动回血';
  if(player.dead)tip='';
  else if(!tip&&!player.inVehicle&&player.hp<player.maxHp*.5&&vsOn())tip='生命偏低：回营地治疗，或向医疗兵靠拢';
  else if(!tip&&!player.inVehicle&&player.hp<player.maxHp*.5)tip=Game.testMode||Game.items.medkit>0?'生命偏低：H 使用医疗包（剩'+(Game.testMode?'∞':Game.items.medkit)+'）':'医疗包用完：O 商店购买，或回基地医疗平台回血';
  if($('interactHint').textContent!==tip){$('vI').setAttribute('aria-label',a.tip||'互动');$('interactHint').textContent=tip;}
  $('interactHint').classList.toggle('hidden',!tip);
  const mk=vsOn()?(player.inVehicle?.cfg.fly?'降低':player.bfKit==='engineer'?'维修':player.bfKit==='support'?'补弹':'医疗'):'医疗'+(Game.testMode?'∞':Game.items.medkit);if($('vH').textContent!==mk)$('vH').textContent=mk;
}
function useMedkit(){
  if(vsOn()){if(!versus.support(player)&&player===versus.state.local)showMsg('兵种支援：医疗兵治疗、工程兵维修、支援兵补弹；靠近友军使用',2);return;}
  if(player.inVehicle&&!rvOn()){showMsg('驾驶中不能用医疗包，先按 I 下车',1.6);return;}
  if(player.hp>=player.maxHp){showMsg('生命已满，医疗包留到关键时刻',1.4);return;}
  if(!Game.testMode&&Game.items.medkit<=0){showMsg('没有医疗包！O 打开商店购买',2);return;}
  if(!Game.testMode)Game.items.medkit--;
  const healed=Math.min(Math.round(ITEMS.medkit.heal*Math.max(1,player.maxHp/120)),player.maxHp-player.hp);
  player.hp+=healed;updHPBar(player.bar,player.hp/player.maxHp);
  AudioSys.sfx('heal');showMsg('医疗包 +'+Math.ceil(healed)+'生命',1.5);
  selfFx(0x66ff99,10,3,.7,1.5);healFlash=1;
}
function throwGrenade(){
  if(player.dead||place.kind)return false;
  if(player.inVehicle){showMsg('下车后可投掷手雷',1.2);return false;}
  if(vsOn()){if(player.grenadeCd>0){if(player===versus.state.local)showMsg('手雷冷却中 '+Math.ceil(player.grenadeCd)+' 秒',.9);return false;}player.grenadeCd=versus.grenadeCooldown(player);}
  const from=player.pos.clone();from.y+=1.45;
  const facing=camForward(false),aim=CombatControls.autoAim?autoAim(from,facing,26,.65):{mo:null};
  const target=aim.mo?aim.mo.mesh.position.clone():from.clone().addScaledVector(facing,22);
  target.y=groundY(target.x,target.z)+.2;
  fireBullet(from,facing,{arc:true,grenade:true,dmg:160,explode:6,speed:20,range:26,spread:0,color:0x96a85a},true,target);
  updHUDItem();AudioSys.sfx('shoot');return true;
}
function selectWeapon(id,quiet=false){
  if(vsOn()){battlefieldCommand({kind:'weapon',id});renderWeaponBar();updViewModel();return;}
  if(coopCommand({kind:'weapon',id}))return;
  if(!Game.weapons.includes(id))return;
  if(Game.curWeapon!==id){Game.curWeapon=id;player.fireCd=Math.min(player.fireCd,.15);player.heat=0;player.burstLeft=0;AudioSys.sfx('reload');}
  if(!quiet)showMsg('🔫 '+WEAPONS[id].name+(weaponLv(id)?' Lv'+weaponLv(id):''),1);
  renderWeaponBar();updViewModel();
}
function cycleWeapon(step){if(Game.weapons.length<2){showMsg('只有一把枪：O 商店购买更多武器',1.6);return;}const i=Game.weapons.indexOf(Game.curWeapon);selectWeapon(Game.weapons[(i+step+Game.weapons.length)%Game.weapons.length]);}
// 虫潮需要快速扫视战场；保留按时钟平滑消费及第一人称的较低转速。
const pitchControl=createPitchController({sensitivity:1,response:30,speed:Math.PI,maxPending:.65,turn:d=>{camPitch=clamp(camPitch+d,-1,1);}});
const lookControl=createLookController({firstPerson:()=>camMode==='first',sensitivity:1,response:30,
  firstPersonSpeed:Math.PI,thirdPersonSpeed:TAU,maxPending:()=>camMode==='first'?Math.PI/3:Math.PI/2,turn:delta=>{
  camYaw-=delta;player.lookHeading=camYaw;
  if(player.inVehicle){const v=player.inVehicle;if(v.mesh.userData.turret)v.mesh.userData.turret.rotation.y=camYaw-v.yaw;}
}});
function updLook(dt){
  if(Input.look.yaw||Input.look.pitch){lookControl.queue(-Input.look.yaw);pitchControl.queue(Input.look.pitch);Input.look.yaw=Input.look.pitch=0;Input.lastLook=performance.now();}
  lookControl.step(dt,(Input.keys.E?1:0)-(Input.keys.Q?1:0));pitchControl.step(dt);
  camYaw=(camYaw%TAU+TAU)%TAU;
}

function playerMuzzle(dir){
  if(camMode==='first'){
    const f=camForward(true),right=new THREE.Vector3(-Math.cos(camYaw),0,Math.sin(camYaw));
    // 第一人称枪口放在右下方武器模型前端，离眼睛 1 米以上，光束不再从眼前穿过
    return player.pos.clone().add(new THREE.Vector3(0,1.42,0)).addScaledVector(f,1.1).addScaledVector(right,.24);
  }
  return player.pos.clone().add(new THREE.Vector3(dir.x*.55,1.35,dir.z*.55));
}
// A ledge is not a wall: test solids at the actual feet height, and only
// limit upward terrain steps. Downward movement stays airborne until landing.
function playerCanMove(x,z){
  if(x<WORLD.minX||x>WORLD.maxX||z<WORLD.minZ||z>WORLD.maxZ)return !collideWalls(x,z,.5,player.pos.y);
  const p=player.pos,next=groundY(x,z),current=groundY(p.x,p.z);
  const distance=Math.hypot(x-p.x,z-p.z);
  if(next>p.y+.5)return false;
  if(player.onGround&&next>current+.001&&(next-current)/Math.max(distance,.001)>.75)return false;
  return !collideWalls(x,z,.5,Math.max(p.y,next));
}
function updPlayer(dt){
  if(player.dead)return;
  if(Input.pop('U'))throwGrenade();
  const t=performance.now()/1000;
  if(player.mesh&&typeof player.mesh.userData.tick==='function')player.mesh.userData.tick(dt,t);
  if(Input.pop('C'))cycleCamView();
  for(let n=1;n<=9;n++)if(Input.pop('N'+n)){if(Game.weapons[n-1])selectWeapon(Game.weapons[n-1]);else showMsg('第'+n+'格还没有武器',1);}
  if(Input.pop('X'))cycleWeapon(1);
  if(Input.wheel&&!Input.network){cycleWeapon(Input.wheel>0?1:-1);Input.wheel=0;}
  if(!vsOn()||player===versus.state.local)updInteraction();
  const ax=Input.axis();
  // 移动方向以摄像机为准
  const cs=Math.cos(camYaw),sn=Math.sin(camYaw);
  const f=-ax.y,r=ax.x;
  let mvx=Input.network?Input.network.x||0:f*sn-r*cs, mvz=Input.network?Input.network.z||0:f*cs+r*sn;
  const moving=Math.hypot(mvx,mvz)>.01;
  player.sprinting=!!(moving&&(Input.network?Input.network.run:Input.keys.SPRINT)&&!player.inVehicle);
  player.moveZ=moving?mvz/Math.hypot(mvx,mvz):0;
  const moveDir=moving?new THREE.Vector3(mvx,0,mvz).normalize():null;
  visuals.animate(player.mesh,dt,moving?'Run':'Idle',camera);
  const v=player.inVehicle;
  if(v){
    // 驾驶载具
    const sp=v.cfg.speed*(v.cfg.fly?1:slopeSpeed(groundY,v.mesh.position.x,v.mesh.position.z,mvx,mvz));
    if(moving){
      const targetYaw=Math.atan2(mvx,mvz), turn=Math.atan2(Math.sin(targetYaw-v.yaw),Math.cos(targetYaw-v.yaw));
      v.yaw+=clamp(turn,-dt*2.1,dt*2.1);
      v.mesh.rotation.y=v.yaw;
      const nx=v.mesh.position.x+mvx*sp*dt,nz=v.mesh.position.z+mvz*sp*dt;
      const canGo=(x,z)=>!collideWalls(x,z,2,v.mesh.position.y)&&(v.cfg.fly||!tooSteep(x,z));
      let moved=false;
      if(canGo(nx,nz)){v.mesh.position.x=clamp(nx,WORLD.minX+3,WORLD.maxX-3);v.mesh.position.z=clamp(nz,WORLD.minZ+3,WORLD.maxZ-3);moved=true;}
      // 整体被挡时按单轴滑动贴墙走，不再整帧卡死
      else if(canGo(nx,v.mesh.position.z)){v.mesh.position.x=clamp(nx,WORLD.minX+3,WORLD.maxX-3);moved=true;}
      else if(canGo(v.mesh.position.x,nz)){v.mesh.position.z=clamp(nz,WORLD.minZ+3,WORLD.maxZ-3);moved=true;}
      // 兜底脱困：有输入却持续走不动约 1.5 秒（嵌进坡体/墙角/联机卡位），挪到最近安全空地
      if(moving&&!moved&&v.kind!=='rv'){v.stuckT=(v.stuckT||0)+dt;
        if(v.stuckT>1.5){
          const spot=rescueSpot(v.mesh.position,3,(x,z)=>vehicleCanStand(v,x,z),[{x:v.mesh.position.x,z:v.mesh.position.z,r:0}]);
          if(spot){v.mesh.position.set(spot.x,groundY(spot.x,spot.z),spot.z);v.alt=Math.max(0,v.alt);v.navPath=null;showMsg('载具已从卡住的位置脱困',1.6);}
          v.stuckT=0;
        }
      }else v.stuckT=0;
    }
    if(v.cfg.fly){
      // 升降：Y 升 / H 降（键盘上下相邻）；驾驶中本来就不能用医疗包，H 不冲突。
      // K/空格 也算升高（手机“升”就是 K 键位）。
      const up=Input.network?Input.network.rise:Input.keys.Y||Input.keys.K,down=Input.network?Input.network.lower:Input.keys.H;
      if(up&&!down)v.alt=Math.min(18,v.alt+dt*8);
      if(down&&!up)v.alt=Math.max(0,v.alt-dt*8);
      v.mesh.position.y=Math.max(groundY(v.mesh.position.x,v.mesh.position.z),fortress.topAt(v.mesh.position.x,v.mesh.position.z))+2+v.alt;
    }else{
      v.mesh.position.y=groundY(v.mesh.position.x,v.mesh.position.z);
    }
    if(player.lookHeading!==undefined)vehicleAim(v,camForward(false));
    player.pos.set(v.mesh.position.x,v.mesh.position.y,v.mesh.position.z);
    player.mesh.position.copy(player.pos);
    // 载具开火：优先镜头前方目标，其次车头方向；弹从炮管口出，炮塔转向目标
    player.fireCd-=dt;
    const facing=new THREE.Vector3(Math.sin(v.yaw),0,Math.cos(v.yaw));
    const probe=v.mesh.position.clone();probe.y+=v.cfg.seatH+.6;
    let aim;
    if(isTouch){aim=autoAim(probe,camForward(false),v.cfg.range,.5);if(!aim.mo)aim=autoAim(probe,facing,v.cfg.range,.2);}
    else aim=playerAim(probe,v.cfg.range,facing);
    if(Input.firing(automaticFireTarget(probe,v.cfg.range,aim))&&player.fireCd<=0){
      player.fireCd=v.cfg.rate;
      const dmg=v.cfg.dmg*(1+(Game.chapter-1)*.1)*(1+(Game.loop-1)*.4);
      vehicleAim(v,aim.dir);
      const from=vehicleMuzzle(v);
      const dir=aim.target?new THREE.Vector3().subVectors(aim.target,from).normalize():aim.dir.clone().normalize();
      fireBullet(from,dir,{dmg,speed:70,range:v.cfg.range,spread:.03,explode:v.cfg.explode,color:0xffcc66},true,aim.target);
      AudioSys.sfx(v.cfg.sfx);
    }
    if(Input.pop('I')){exitVehicle();}
    if(Input.pop('H')&&!v.cfg.fly)useMedkit();
    return;
  }
  // 步行
  if(player.buffT>0)player.buffT-=dt;
  if(Game.regen&&player.hp<player.maxHp){ // 再生背心
    player.hp=Math.min(player.maxHp,player.hp+2*dt);
    updHPBar(player.bar,player.hp/player.maxHp);
  }
  // 基地医疗平台 / 野外地堡：站上去持续回血
  if(player.hp<player.maxHp&&(dist2(player.pos,healPad.pos)<healPad.r*healPad.r||dist2(player.pos,fortress.shelter)<fortress.shelter.r**2)){
    player.hp=Math.min(player.maxHp,player.hp+Math.max(6,player.maxHp*.05)*dt);
    updHPBar(player.bar,player.hp/player.maxHp);
    if(Math.random()<.08)selfFx(0x66ff99,2,2,.5,1);
  }
  if(Input.pop('K')&&player.onGround){player.vy=9;player.onGround=false;AudioSys.sfx('jump');}
  if(moving){
    if(camMode==='third'){
      const probe=player.pos.clone();probe.y+=1.35;
      const range=WEAPONS[Game.curWeapon].range,aim=playerAim(probe,range,moveDir);
      if(!Input.firing(automaticFireTarget(probe,range,aim)))player.yaw=Math.atan2(mvx,mvz);
    }
    const sp=player.speed*(player.sprinting?1.65:1)*(player.buffT>0?1.4:1)*(player.onGround?slopeSpeed(groundY,player.pos.x,player.pos.z,mvx,mvz):1);
    const nx=player.pos.x+mvx*sp*dt,nz=player.pos.z+mvz*sp*dt;
    if(playerCanMove(nx,player.pos.z))player.pos.x=nx;
    if(playerCanMove(player.pos.x,nz))player.pos.z=nz;
    player.anim+=dt*(player.sprinting?15:10);
    player.mesh.userData.legs.forEach((l,i)=>l.rotation.x=Math.sin(player.anim+i*Math.PI)*.7);
  }else{
    player.mesh.userData.legs.forEach(l=>l.rotation.x*=.8);
  }
  if(camMode==='third'&&moving)delete player.lookHeading;
  if(camMode==='first'||player.lookHeading!==undefined)player.yaw=camYaw;
  // 兜底脱困：任何原因卡在实体里（载具残骸、城门关在身上等）超过 0.5 秒，移到最近的空地
  if(player.onGround&&collideWalls(player.pos.x,player.pos.z,.5,player.pos.y)){
    player.stuckT=(player.stuckT||0)+dt;
    if(player.stuckT>.5){const f=findFreeSpot(player.pos.x,player.pos.z)||{x:0,z:-20};player.pos.set(f.x,groundY(f.x,f.z),f.z);player.stuckT=0;showMsg('已从卡住的位置脱困',1.4);}
  }else player.stuckT=0;
  // 跳跃、下坡与下车共用重力；落地才允许下一次起跳。
  const insideMap=player.pos.x>=WORLD.minX&&player.pos.x<=WORLD.maxX&&player.pos.z>=WORLD.minZ&&player.pos.z<=WORLD.maxZ;
  let gy=insideMap?groundY(player.pos.x,player.pos.z):-Infinity;
  // A jump may clear a low wall; land on its cap instead of sinking through it.
  for(const bd of buildings)if(bd.isWall&&!bd.dead&&wallTouches(bd,player.pos.x,player.pos.z)&&player.pos.y>=bd.mesh.position.y+COVER_HEIGHT-.05)gy=Math.max(gy,bd.mesh.position.y+COVER_HEIGHT);
  player.vy-=24*dt;
  player.pos.y+=player.vy*dt;
  const headLimit=insideMap?fortress.ceilingAt(player.pos.x,player.pos.z,Math.max(gy,player.pos.y)+.1)-2.6:Infinity;
  if(player.vy>0&&headLimit>=gy&&player.pos.y>headLimit){player.pos.y=headLimit;player.vy=0;}
  if(player.pos.y<=gy){player.pos.y=gy;player.vy=0;player.onGround=true;}else player.onGround=false;
  if(player.pos.y<-35){
    const safe=findFreeSpot(0,-24)||{x:0,z:-20};
    player.pos.set(safe.x,groundY(safe.x,safe.z),safe.z);player.vy=0;player.onGround=true;player.stuckT=0;camState.init=false;
    showMsg('已从地图边缘返回基地',2);
  }
  player.mesh.position.copy(player.pos);
  player.mesh.rotation.y=player.yaw;
  player.mesh.rotation.x=0;
  // 医疗兵自愈
  if(!vsOn()&&CLASSES[Game.cls].heal){
    player.hp=Math.min(player.maxHp,player.hp+CLASSES[Game.cls].heal*dt);
    updHPBar(player.bar,player.hp/player.maxHp);
  }
  // PC defaults to target-aware automatic fire; touch remains hold-to-fire.
  player.fireCd-=dt;
  const wp=WEAPONS[Game.curWeapon];
  const probe=player.pos.clone();probe.y+=1.35;
  const aim=playerAim(probe,wp.range,moveDir);
  const firing=Input.firing(automaticFireTarget(probe,wp.range,aim));
  player.heat=firing&&wp.beam?Math.min(1,(player.heat||0)+dt/1.5):Math.max(0,(player.heat||0)-dt*2);
  if(firing&&player.fireCd<=0&&!place.kind&&(!vsOn()||versus.canShoot(player,Game.curWeapon))){
    player.fireCd=wp.rate*(player.buffT>0?1/1.4:1);
    // Reuse the target sampled for this frame.
    if(camMode==='third'&&player.lookHeading===undefined)player.yaw=Math.atan2(aim.dir.x,aim.dir.z);
    const from=playerMuzzle(aim.dir);
    if(aim.target)aim.dir.subVectors(aim.target,from).normalize();
    fireBullet(from,aim.dir,{...wp,dmg:wp.dmg*weaponMul(Game.curWeapon)*classDamage(Game.curWeapon)*(wp.beam?1+.3*player.heat:1),heat:player.heat,fp:camMode==='first'},true,aim.target);
    AudioSys.sfx(wp.sfx);
    player.muzzle.intensity=2;setTimeout(()=>{if(player.muzzle)player.muzzle.intensity=0;},50);
    viewKick=Math.min(1,viewKick+(wp.rate>.3?1:.35));
    if(wp.burst){player.burstLeft=wp.burst-1;player.burstT=0;}   // 四连导弹：首发已出，余下在后续帧错开续发
  }
  // 四连发导弹续发：每 90ms 一枚，微散布并追踪当帧目标
  if(player.burstLeft>0){
    player.burstT-=dt;
    if(player.burstT<=0){
      player.burstLeft--;player.burstT=.09;
      const from=playerMuzzle(aim.dir);
      const bcfg={...wp,dmg:wp.dmg*weaponMul(Game.curWeapon)*classDamage(Game.curWeapon),burst:0,fp:camMode==='first'};
      fireBullet(from,aim.dir,bcfg,true,aim.target);
      AudioSys.sfx(wp.sfx);
    }
  }

  // I 只负责互动（载具 / 城门）；H 才是医疗包，避免开门时误吃药或想回血却关了门
  if(Input.pop('I')){
    const action=interactionTarget();
    if(action.kind==='rv-search')rvBreakout.interact();
    else if(action.kind==='vehicle')enterVehicle(action.vehicle);
    else if(action.kind==='gate'){if(!gate.dead)setGate(!gate.open);else showMsg(action.tip,2);}
    else showMsg(vsOn()?'靠近本方载具按 I 驾驶；H 使用当前兵种支援能力':'附近没有可互动的东西：靠近载具驾驶，靠近城门开关门；H 是医疗包',2.4);
    updInteraction();
  }
  if(Input.pop('H'))useMedkit();
}
/* ================= 关卡流程 ================= */
const sandboxWave={enabled:true,timer:3,spawned:0};
function resetSandboxWave(){sandboxWave.enabled=true;sandboxWave.timer=3;sandboxWave.spawned=0;}
function updSandboxWave(dt){
  if(!sandboxWave.enabled)return;
  sandboxWave.timer-=dt;
  if(sandboxWave.timer>0)return;
  sandboxWave.timer=3;
  const pp=player.inVehicle?player.inVehicle.mesh.position:player.pos;
  for(let i=0;i<4&&monsters.length<48;i++){
    const n=sandboxWave.spawned++,ch=CHAPTERS[n%CHAPTERS.length];
    const kind=n%32===31?'boss':n%16===15?'miniboss':'mob';
    const angle=(n%9-4)*.24,r=28+(n%3)*4;
    spawnMonster(kind,clamp(pp.x+Math.sin(angle)*r,-65,65),clamp(pp.z+Math.cos(angle)*r,18,180),
      {ch,elite:kind==='mob'&&n%4===3,affix:Object.keys(ELITES)[Math.floor(n/4)%Object.keys(ELITES).length]});
  }
}
function sandboxSpawn(action='selected'){
  if(!Game.testMode)return;
  if(action==='clear'||action==='showcase'){
    for(const m of monsters){visuals.release(m.mesh);scene.remove(m.mesh);}monsters.length=0;
    for(const b of bullets)disposeBullet(b.mesh);bullets.length=0;
    if(action==='clear'){sandboxWave.enabled=false;showMsg('已清场并暂停自动虫潮；在测试台点「继续自动虫潮」可恢复',3);return;}
    resetSandboxWave();
  }
  const add=(ch,kind='mob',affix=null,index=0)=>{
    if(monsters.length>=48)return;
    const centerZ=clamp(player.pos.z+30,30,160),x=(index%5-2)*9,z=centerZ+Math.floor(index/5)*10;
    spawnMonster(kind,x,z,{ch:CHAPTERS[ch],elite:!!affix,affix});
  };
  if(action==='showcase'){
    CHAPTERS.forEach((_,i)=>add(i,'mob',null,i));
    Object.keys(ELITES).forEach((a,i)=>add(i,'mob',a,i+10));
    add(0,'miniboss',null,16);add(3,'boss',null,18);
  }else{
    const ch=Number($('testSpecies').value),kind=$('testRank').value;
    const count=Number($('testCount').value);
    for(let i=0;i<count;i++)add(ch,kind==='elite'?'mob':kind,kind==='elite'?$('testAffix').value:null,monsters.length);
  }
  Game.state='battle';$('readyBtn').classList.add('hidden');
  showMsg(`已召唤 · 场上 ${monsters.length}/48 只；可清场后更换组合`,2);
}
function claimSandbox(type,id){
  if(!Game.testMode)return;
  if(type==='weapon'){selectWeapon(id,true);showMsg('已装备 '+WEAPONS[id].name);}
  else if(type==='vehicle'){
    let v=vehicles.find(v=>v.kind===id&&!v.dead);
    if(!v){Game.vehiclesOwned.push(id);v=spawnVehicle(id);}
    enterVehicle(v);showMsg('已登上 '+VEHICLES[id].name+' · I 下车'+(v.cfg.fly?(isTouch?'；升 / 降 按钮调高度':'；Y 升高 / H 降低'):''),3);
  }else if(type==='squad'){
    while(squad.length<squadLimit())spawnSquad();Game.squadCount=squad.length;showMsg(squad.length+'名队友已就位');
  }else if(type==='item')grantSupply({type,id});
  else if(type==='building'){
    if(buildings.length>=currentBuildingLimit()){showMsg('防御设施已达 '+currentBuildingLimit()+' 座，重置场景可重新布置');return;}
    startPlacement(id,true);return;
  }
  closePanels();
}
function openSandbox(){
  if(!Game.testMode||!['prep','battle'].includes(Game.state))return;
  closePanels();Input.reset();panelOpen=true;$('sandboxPanel').classList.remove('hidden');
  $('testStatus').textContent=`玩家 / 小队 / 基地 / 载具无敌 · 金币、弹药和道具无限 · 虫群 ${monsters.length}/48`;
  $('test-auto').textContent=sandboxWave.enabled?'暂停自动虫潮':'继续自动虫潮';
}
function setupSandbox(){
  const fill=(id,entries)=>{$(id).replaceChildren(...entries.map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;}));};
  fill('testEnvironment',Object.values(ENVIRONMENTS).map(p=>[p.id,p.name+' · '+p.chapters]));
  $('testEnvironment').value=battlefield.current.id;
  $('test-environment').onclick=()=>{if(!Game.testMode)return;setBattlefieldEnvironment(ENVIRONMENTS[$('testEnvironment').value]);closePanels();showMsg('进入 '+battlefield.current.name,2);};
  fill('testSpecies',CHAPTERS.map((c,i)=>[i,`${c.name} / ${c.boss}`]));
  fill('testAffix',Object.entries(ELITES).map(([k,c])=>[k,c.name]));
  for(const [id,data] of [['testWeapon',WEAPONS],['testItem',ITEMS],['testVehicle',VEHICLES],['testBuilding',BUILDINGS]])fill(id,Object.entries(data).map(([k,c])=>[k,c.name]));
  $('sandboxBtn').onclick=openSandbox;$('sandboxClose').onclick=closePanels;
  $('test-auto').onclick=()=>{sandboxWave.enabled=!sandboxWave.enabled;sandboxWave.timer=.1;showMsg(sandboxWave.enabled?'自动虫潮已恢复，精英与首领轮番加入':'自动虫潮已暂停，可手动召唤');closePanels();};
  document.querySelectorAll('[data-test-claim]').forEach(b=>b.onclick=()=>claimSandbox(b.dataset.testClaim,($(b.dataset.select)||{}).value));
  for(const action of ['selected','showcase','clear'])$('test-'+action).onclick=()=>{sandboxSpawn(action);closePanels();};
  $('test-reset').onclick=()=>{closePanels();newGame(true);};
  $('test-normal').onclick=()=>{closePanels();const saved=slotInfo(SAVE_PREFIX+'auto');if(saved)loadGame(saved);else newGame(false);};
}
function clearEntities(all){
  for(const s of squad)if(s.vehicle)leaveSquadVehicle(s);
  cancelPlacement(true);
  visuals.clearCorpses();
  for(const mo of monsters){visuals.release(mo.mesh);scene.remove(mo.mesh);}monsters.length=0;
  for(const b of bullets)disposeBullet(b.mesh);bullets.length=0;
  for(const b of beamPool){b.life=0;b.mesh.visible=false;}
  for(const p of pickups)releasePickup(p.mesh);pickups.length=0;
  if(all){
    for(const a of airdrops)scene.remove(a.mesh);airdrops.length=0;
    for(const bd of buildings)scene.remove(bd.mesh);buildings.length=0;
    for(const v of vehicles){visuals.release(v.mesh);scene.remove(v.mesh);}vehicles.length=0;
    for(const s of squad){visuals.release(s.mesh);scene.remove(s.mesh);}squad.length=0;
  }
}
function isBossLevel(){return Game.level===10;}
function isMiniBossLevel(){return Game.level===3||Game.level===6||Game.level===9;}
function levelName(){
  const ch=chapterCfg();
  let t=`${campaignDifficulty(Game.difficulty).name} · 周目${Game.loop} 第${Game.chapter}章「${ch.name}」 第${Game.level}关`;
  if(isBossLevel())t+=' 💀BOSS';else if(isMiniBossLevel())t+=' ⚔小BOSS';
  return t;
}
function baseMaxHp(){return Math.round(2000*(1+(Game.chapter-1)*.1)*(1+(Game.loop-1)*.3)*campaignDifficulty(Game.testMode?'normal':Game.difficulty).baseHp);}
function waveMonsters(){return monsters.filter(m=>!m.dead&&!m.home);}
/* 虫巢：母皇与护卫只守老巢。母皇血量在同一章内保留，击杀后本章剩余关卡虫潮规模 -35%。 */
function syncHive(){
  const h=Game.hive;
  if(h.loop!==Game.loop||h.chapter!==Game.chapter)Object.assign(h,{loop:Game.loop,chapter:Game.chapter,queen:1,killed:false});
}
function spawnHive(){
  syncHive();if(Game.hive.killed)return;
  const home={x:HIVE.x,z:HIVE.z+3,leash:14,aggro:42};
  const q=spawnMonster('queen',home.x,home.z,{wild:true,home,quiet:true});
  q.hp=q.maxHp*clamp(Game.hive.queen,.05,1);updHPBar(q.bar,q.hp/q.maxHp);q.mesh.rotation.y=Math.PI;
  const affixes=['armored','giant','savage','armored','giant'];
  for(let i=0;i<5;i++){
    const a=Math.PI+(i-2)*.5,g={x:HIVE.x+Math.sin(a)*16,z:HIVE.z+Math.cos(a)*16,leash:24,aggro:34};
    spawnMonster('mob',g.x,g.z,{wild:true,home:g,elite:true,affix:affixes[i],quiet:true});
  }
}
function queenKilled(mo){
  Game.hive.killed=true;Game.hive.queen=0;
  showMsg('👑 母皇已击杀！后续虫潮 -35%，本章每次通关额外领取 '+queenSupply()+' 金币补给',5);AudioSys.sfx('win');
  for(let i=0;i<6;i++)dropPickup(mo.mesh.position.clone().add(new THREE.Vector3(rand(-4,4),0,rand(-4,4))),'gold',Math.round(mo.gold/6));
}
// A fixed chapter stipend rewards an early assault while full swarms retain
// their extra drops (including elites) for players who choose to defend them.
function queenSupply(){return Math.round((100+Game.chapter*40)*(1+(Game.loop-1)*.3));}
function collectAllGold(){
  let sum=0;for(let i=pickups.length-1;i>=0;i--){const pk=pickups[i];if(pk.type!=='gold')continue;sum+=pk.val;releasePickup(pk.mesh);pickups.splice(i,1);}
  if(sum>0){Game.gold+=sum;AudioSys.sfx('coin');}
  return sum;
}
function spendGold(amount){Game.gold-=amount;if(Game.battleLedger&&Game.battleLedger.active)Game.battleLedger.spent+=amount;}
function recordBattleLoss(kind){if(Game.battleLedger&&Game.battleLedger.active)Game.battleLedger[kind]++;}
function finishBattleReport(won){
  const ledger=Game.battleLedger;if(!ledger||!ledger.active)return;
  ledger.active=false;
  Game.lastBattle={label:ledger.label,won,baseHp:Math.max(0,Math.ceil(base.hp)),baseMaxHp:base.maxHp,gateHp:Math.max(0,Math.ceil(gate.hp)),gateMaxHp:gate.maxHp,
    buildingLosses:ledger.buildingLosses,squadLosses:ledger.squadLosses,vehicleLosses:ledger.vehicleLosses,
    income:Math.round(Game.gold-ledger.startGold+ledger.spent),spent:ledger.spent,seconds:Math.round(ledger.elapsed)};
}
function currentWavePlan(){return tacticalWavePlan({difficulty:Game.difficulty,chapter:Game.chapter,level:Game.level,loop:Game.loop,queenKilled:Game.hive.killed});}
function tacticalPreview(){
  if(Game.testMode)return {title:'自由测试 · 小队部署',info:'测试台按所选虫种刷怪，战役虫潮预告不用于自由测试。',hint:'自由测试无敌、无限资源；可在这里检查小队分工。',supply:0};
  if(operations.active)return {title:'副本 · 小队部署',info:'副本使用独立目标与敌人配置；战役虫潮在返回基地后继续。',hint:'副本内全员暂时跟随，返回后恢复各人的留守与出击任务。',supply:0};
  const battle=(Game.state==='paused'?Game.pausedFrom:Game.state)==='battle'&&!Game.wave.done;
  const plan=battle&&Game.wave.plan?Game.wave.plan:currentWavePlan();
  const groups=new Map();
  for(const entry of plan.schedule){const name=entry.kind==='mob'?CHAPTERS[entry.species].name:entry.kind==='miniboss'?'小首领':CHAPTERS[entry.species].boss;groups.set(name,(groups.get(name)||0)+1);}
  const mouths=[...new Set(plan.schedule.map(e=>e.mouth))].map(id=>MOUTHS.find(m=>m.id===id).name).join('、');
  const extra=battle?Game.wave.initialWilds:waveMonsters().length;
  return {title:(battle?'本关虫潮 · ':'下一波 · ')+plan.title,
    info:[...groups].map(([name,count])=>name+' '+count+'只').join(' · ')+'\n入口：'+mouths+(extra?'\n另有 '+extra+' 只场上野怪加入进攻':''),
    hint:plan.hint,supply:openingSupply(Game.chapter,Game.level,Game.loop)};
}
function startPrep(){
  setBattlefieldEnvironment(environmentForChapter(Game.chapter));
  Game.state='prep';
  Object.assign(Game.wave,{total:0,spawned:0,killed:0,done:false,rewarded:false,transition:0});
  const collected=collectAllGold();
  clearEntities(false);
  Game.battleLedger=Game.testMode?null:{active:true,label:levelName(),startGold:Game.gold,spent:0,elapsed:0,buildingLosses:0,squadLosses:0,vehicleLosses:0};
  // 修复并开启城门；损毁载具修复；撤离队友归队
  if(gate.dead)showMsg('🔧 城门已修复',1.5);
  gate.dead=false;gate.maxHp=Math.round(2500*(1+(Game.chapter-1)*.08)*(1+(Game.loop-1)*.4));gate.hp=gate.maxHp;gate.auto=false;
  updHPBar(gate.bar,1);gate.open=true;
  if(!Game.testMode){repairVehicles();while(squad.length<Math.min(squadLimit(),Game.squadCount))spawnSquad();}
  // 野怪：散布在前中场，避开隧道与老巢
  const n=6+Math.min(10,Game.chapter+Game.loop);
  for(let i=0;i<n;i++){
    let x,z,k=0;do{x=rand(WORLD.minX+12,WORLD.maxX-12);z=rand(50,240);}while((tunnelDistance(x,z)<9||Math.hypot(x-HIVE.x,z-HIVE.z)<HIVE.r+12||HILL_FORTS.some(f=>Math.hypot(x-f.x,z-f.z)<f.top+5))&&++k<30);
    const ec=campaignEliteChance(Game.testMode?'normal':Game.difficulty,Game.chapter,Game.loop,true);
    spawnMonster('mob',x,z,{wild:true,elite:Math.random()<ec?true:undefined,quiet:true});
  }
  if(Math.random()<.5)spawnMonster('miniboss',rand(-40,40),rand(130,170),{wild:true});
  if(!Game.testMode)spawnHive();
  $('readyBtn').classList.remove('hidden');
  showMsg(levelName(),3);
  const tip=Game.level===1?'本章提示：'+chapterCfg().tip+' · ':'';
  showHint(tip+'守住基地，耐久归零即失败；玩家阵亡会复活。O 商店，L 建造，整备后点「准备完毕」或 R 开战。'+(Game.hive.killed?' 本章每次通关补给 +'+queenSupply()+' 金币。':' 早杀母皇：本章通关领补给；晚杀：多打虫赚掉落。'));
  if(collected)setTimeout(()=>showMsg('💰 战场金币已自动回收 +'+collected,2),900);
  autoSave();
}
function startBattle(){
  if(coopCommand({kind:'battle'}))return;
  if(operations.active)return;
  if(Game.testMode){openSandbox();return;}
  Game.state='battle';
  $('readyBtn').classList.add('hidden');
  showHint('守住基地！耐久归零即失败；清完本关进入下一关准备。'+(Game.hive.killed?' 母皇已死，后续虫潮减弱；本关通关补给 +'+queenSupply()+' 金币。':' 母皇存活，完整虫潮掉落更多，也更难防守。'));
  // 剩余野怪加入进攻；老巢护卫与母皇留守
  for(const mo of monsters){if(!mo.home)mo.wild=false;}
  const w=Game.wave,current=waveMonsters().length;
  w.killed=0;w.spawned=current;w.timer=1.5;w.bossSpawned=false;w.done=false;w.mouth=Math.floor(rand(0,MOUTHS.length));
  w.plan=currentWavePlan();w.planIndex=0;w.initialWilds=current;
  w.total=current+w.plan.schedule.length;
  if(!Game.battleLedger||!Game.battleLedger.active)Game.battleLedger={active:true,label:levelName(),startGold:Game.gold,spent:0,elapsed:0,buildingLosses:0,squadLosses:0,vehicleLosses:0};
  if(!gate.dead){gate.open=false;gate.auto=false;}
  AudioSys.sfx('wave');
  showMsg('⚔ 虫潮来袭！城门已关闭（走向城门会自动开门）',2.5);
}
// 虫洞口出生点：轮流使用各洞口，首领从中央主洞出来
function mouthSpawn(main=false){
  const w=Game.wave,m=main?MOUTHS.find(m=>m.main):MOUTHS[(w.mouth=(w.mouth+1)%MOUTHS.length)];
  return {x:0,z:HIVE.z-3,mouth:m,route:hiveRoute(m.id)};
}
function updWave(dt){
  if(zergOn())return; // 虫族模式的增援由虫族模块自己导演
  if(operations.update(dt))return;
  if(Game.testMode){updSandboxWave(dt);$('waveTxt').textContent=`🧪 ${sandboxWave.enabled?'持续虫潮':'刷怪暂停'} · ${monsters.length}/48`;return;}
  const w=Game.wave;
  if(Game.battleLedger&&Game.battleLedger.active)Game.battleLedger.elapsed+=dt;
  // 过关等待随游戏时钟推进；暂停、失焦或打开菜单时保留，不丢失一次性回调。
  if(w.done){
    w.transition=Math.max(0,(w.transition||0)-dt);
    $('waveTxt').textContent='✅ 已通关 · 即将进入下一关准备';
    if(w.transition===0)startPrep();
    return;
  }
  // 出怪
  if(w.spawned<w.total && monsters.length<48){
    w.timer-=dt;
    if(w.timer<=0){
      const entry=w.plan&&w.plan.schedule[w.planIndex++];
      if(entry){
        w.spawned++;
        const mouth=MOUTHS.find(m=>m.id===entry.mouth),ch=CHAPTERS[entry.species];
        const ec=campaignEliteChance(Game.difficulty,Game.chapter,Game.loop);
        const monster=spawnMonster(entry.kind,0,HIVE.z-3,{ch,elite:entry.kind==='mob'&&Math.random()<ec,route:hiveRoute(mouth.id)});
        monster.waveEntry={...entry};
        if(entry.kind!=='mob'){
          w.bossSpawned=true;showMsg((entry.kind==='boss'?'💀 ':'⚔ 小首领 ')+ch.boss+' 正沿'+mouth.name+'进军！',3);AudioSys.sfx('wave');
        }
      }
      w.timer=campaignSpawnInterval(Game.difficulty,Game.chapter,Game.level,Game.loop);
    }
  }
  const live=waveMonsters();
  const nearest=live.length?Math.round(Math.sqrt(Math.min(...live.map(m=>dist2(m.mesh.position,player.pos))))):null;
  $('waveTxt').textContent=`🐛 场上 ${live.length} · 待增援 ${Math.max(0,w.total-w.spawned)} · 击杀 ${w.killed}/${w.total}`+(nearest===null?'':`\n最近敌人 ${nearest}米`);
  if(!w.done&&w.spawned>=w.total&&live.length===0&&!monsters.some(m=>!m.dead&&!m.home)){
    w.done=true;levelWin();
  }
}
let runGeneration=0;
function levelWin(){
  if(Game.testMode)return;
  if(Game.wave.rewarded)return;
  Game.wave.rewarded=true;
  AudioSys.sfx('win');
  collectAllGold();
  const bonus=Math.round((80+Game.level*30+Game.chapter*50)*(1+(Game.loop-1)*.3));
  const supply=Game.hive.killed&&Game.hive.chapter===Game.chapter&&Game.hive.loop===Game.loop?queenSupply():0;
  const training=openingSupply(Game.chapter,Game.level,Game.loop);
  Game.gold+=bonus+supply+training;Game.score+=100*Game.level;
  finishBattleReport(true);
  if(!coopDriver?.config&&!new URLSearchParams(location.search).has('qa'))try{const key=SAVE_PREFIX+'rank-best';localStorage.setItem(key,String(Math.max(Number(localStorage.getItem(key))||0,Math.min(16777215,Math.floor(Game.score)))));}catch(_e){}
  showMsg(`🎉 胜利！奖励 ${bonus}`+(training?` · 新兵补给 +${training}`:'')+(supply?` · 母巢补给 +${supply}`:''),3);
  Game.level++;
  if(Game.level>10){
    Game.level=1;Game.chapter++;
    if(Game.chapter>10){
      Game.chapter=1;Game.loop++;
      showMsg(`🌟 进入周目${Game.loop}！设施上限 ${currentBuildingLimit()} 座，炮塔火力 ×${turretDamageMul(Game).toFixed(1)}`,4);
    }else{
      showMsg(`📖 进入第${Game.chapter}章「${chapterCfg().name}」`,3.5);
    }
  }
  syncBuildingDurability();
  base.maxHp=baseMaxHp();
  base.hp=Math.min(base.maxHp,base.hp+base.maxHp*.15); // 关间维修
  updHPBar(base.bar,base.hp/base.maxHp);
  Game.wave.transition=1.5;
  autoSave();
}
function gameOver(reason){
  if(Game.state==='over')return;
  finishBattleReport(false);
  Game.state='over';
  AudioSys.sfx('lose');
  $('overTitle').textContent='💀 游戏结束';
  $('overInfo').innerHTML=`${reason}<br><br>${levelName()}<br>⭐ 最终分数：${Game.score}　💰 金币：${Game.gold}`;
  if(Game.lastBattle){const r=Game.lastBattle;$('overInfo').innerHTML+=`<br>设施损毁 ${r.buildingLosses} · 队友重伤 ${r.squadLosses} · 载具损毁 ${r.vehicleLosses}<br>本关收入 ${r.income} · 支出 ${r.spent} 金币`;}
  $('menuOver').classList.remove('hidden');
  $('hud').classList.add('hidden');$('touchUI').classList.add('hidden');
}
function restartLevel(){
  if(coopDriver?.action('restart'))return;
  if(zergOn()){zergMode.restart();return;}
  AudioSys.pause(false);// 从暂停菜单「重开本关」：先解除暂停时挂起的音频，否则重开后没有背景音乐和音效
  if(operations.active){operations.finish(false);return;}
  runGeneration++;
  if(Game.testMode){newGame(true);return;}
  $('menuOver').classList.add('hidden');$('menuPause').classList.add('hidden');
  Game.state='prep';
  player.reset(Game.cls);
  base.maxHp=baseMaxHp();base.hp=base.maxHp;updHPBar(base.bar,base.hp/base.maxHp);
  showHUD();
  startPrep();
}

/* ================= 商店 & 空投 ================= */
const SHOP={
  weapon:Object.keys(WEAPONS).map(k=>({id:k,type:'weapon'})),
  item:Object.keys(ITEMS).map(k=>({id:k,type:'item'})),
  vehicle:Object.keys(VEHICLES).map(k=>({id:k,type:'vehicle'})),
  squad:Object.keys(SQUAD_ROLES).map(id=>({id,type:'squad'})),
};
let shopTab='weapon';
function squadPrice(role='gunner'){return SQUAD_ROLES[squadRoleId(role)].price+Game.squadCount*250;}
function renderShop(){
  $('shopGold').textContent=$('goldTxt').textContent=Game.testMode?'∞':Math.floor(Game.gold);
  const grid=$('shopGrid'),cards=[];
  for(const it of SHOP[shopTab]){
    if(it.type==='weapon'&&WEAPONS[it.id].price===0&&!Game.weapons.includes(it.id))continue; // 其他兵种的初始枪不卖
    const div=document.createElement('div');div.className='shopItem';
    let nm,pr,desc,owned=false,extra='';
    if(it.type==='weapon'){
      const w=WEAPONS[it.id],lv=weaponLv(it.id);nm=w.name+(lv?` <b class="lv">Lv${lv}</b>`:'');pr=w.price;
      const tags=[w.pellets?'×'+w.pellets+'弹丸':'',w.knock?'击退':'',w.burn?'点燃':'',w.explode?'范围爆炸':'',w.pierce?'穿透'+(w.pierce+1):'',w.beam?'持续光束':''].filter(Boolean).join(' ');
      desc=`秒伤${weaponDps(it.id)} 射程${w.range}${tags?' · '+tags:''}<br><span class="desc">${w.desc||''}</span>`;
      owned=Game.weapons.includes(it.id);
      if(owned)extra=lv>=WEAPON_MAX_LV?'<div class="upg max">已满级</div>':`<button class="upg" data-up="${it.id}">强化 Lv${lv+1} · 💰${upgradePrice(it.id)}</button>`;
    }
    else if(it.type==='item'){const c=ITEMS[it.id];nm=c.name;pr=c.price;desc=c.desc;owned=(it.id==='magnet'&&Game.magnet)||(it.id==='regen'&&Game.regen);}
    else if(it.type==='vehicle'){const c=VEHICLES[it.id];nm=c.name;pr=c.price;desc=`血量${c.hp} 伤害${c.dmg}${c.fly?' 可飞行(Y/升高，H/降低)':''}<br><span class="desc">可在「队友」分配驾驶；停放时无敌，损毁下关修好</span>`;owned=Game.vehiclesOwned.includes(it.id);
      if(owned&&!vehicles.some(v=>v.kind===it.id))extra=`<button class="upg" data-fix="${it.id}">立即修复 · 💰${Math.round(c.price*.25)}</button>`;}
    else{const role=SQUAD_ROLES[it.id];nm=role.name;pr=squadPrice(it.id);desc=`${role.brief} · 生命${role.hp}<br><span class="desc">最多${squadLimit()}名（现有${Game.squadCount}）；暂停选择任务，商店分配载具</span>`;owned=Game.squadCount>=squadLimit();}
    const pending=airdrops.some(a=>a.it.id===it.id&&a.it.type===it.type);
    div.innerHTML=`<div class="nm">${nm}</div><div>${desc}</div><div class="pr">${owned?(it.type==='weapon'?(Game.curWeapon===it.id?'✅使用中':'点击装备 ('+(Game.weapons.indexOf(it.id)+1)+')'):it.type==='squad'?'✅已满编':'✅已拥有'):(pending?'📦送达中（关闭商店继续）':'💰'+pr)}</div>${extra}`;
    if(owned)div.classList.add('own');
    div.tabIndex=0;div.setAttribute('role','button');
    div.onclick=e=>{const up=e.target.closest('[data-up]'),fix=e.target.closest('[data-fix]');if(up){upgradeWeapon(up.dataset.up);return;}if(fix){repairNow(fix.dataset.fix);return;}buyItem(it,pr,owned);};
    div.onkeydown=e=>{if(e.target!==div)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();div.click();}};
    cards.push(div);
  }
  if(shopTab==='squad')for(let slot=0;slot<Game.squadCount;slot++){
    const gear=squadGear(slot),mate=squad.find(s=>s.slot===slot),card=document.createElement('div');card.className='shopItem';
    const title=document.createElement('div');title.className='nm';title.textContent='队友 '+(slot+1)+' · '+squadRole(slot).name+(mate?mate.vehicle?' · 驾驶'+mate.vehicle.cfg.name:' · 生命 '+Math.ceil(mate.hp)+'/'+mate.maxHp:' · 待归队');card.appendChild(title);
    const desc=document.createElement('p');desc.className='desc';desc.textContent=squadRole(slot).brief+'。每级武器 +25% 步兵伤害 / +8% 射速，护甲 +25% 生命；驾驶时使用载具武器，治疗/维修暂停。';card.appendChild(desc);
    for(const kind of ['weapon','armor']){const lv=gear[kind],b=document.createElement('button');b.className='upg';b.dataset.squadSlot=slot;b.dataset.gear=kind;b.disabled=lv>=5;
      b.textContent=(kind==='weapon'?'武器':'护甲')+' Lv'+lv+(lv>=5?' · 已满级':' → Lv'+(lv+1)+' · 💰'+(kind==='weapon'?180:140)*(lv+1));b.onclick=()=>upgradeSquad(slot,kind);card.appendChild(b);}
    mountSquadChoices(card,slot);
    cards.push(card);
  }
  // Network snapshots also update the shop. Keep live touch targets and focus
  // while only gold/world state changes, so a tap can span several snapshots.
  const markup=cards.map(card=>card.outerHTML+'|'+[...card.querySelectorAll('select')].map(el=>el.value).join('|')).join('||');
  if(grid._shopMarkup!==markup){grid.replaceChildren(...cards);grid._shopMarkup=markup;}
}
function upgradeWeapon(id){
  if(coopCommand({kind:'upgrade',id}))return;
  if(weaponLv(id)>=WEAPON_MAX_LV){showMsg('已满级',1);return;}
  const pr=upgradePrice(id);
  if(!Game.testMode&&Game.gold<pr){showMsg('金币不足！强化需要 '+pr,1.4);AudioSys.sfx('click');return;}
  if(!Game.testMode)spendGold(pr);
  Game.weaponLv[id]=weaponLv(id)+1;AudioSys.sfx('buy');
  showMsg(`⬆ ${WEAPONS[id].name} 强化到 Lv${weaponLv(id)}（伤害 ×${weaponMul(id).toFixed(1)}）`,2);
  renderShop();renderWeaponBar();autoSave();
}
function repairNow(kind){
  if(coopCommand({kind:'repair',id:kind}))return;
  const pr=Math.round(VEHICLES[kind].price*.25);
  if(!Game.testMode&&Game.gold<pr){showMsg('金币不足',1.2);return;}
  if(!Game.testMode)spendGold(pr);
  spawnVehicle(kind);AudioSys.sfx('build');showMsg('🔧 '+VEHICLES[kind].name+' 已在停机坪修好',1.8);renderShop();autoSave();
}
function buyItem(it,pr,owned){
  if(coopCommand({kind:'buy',id:it.id,type:it.type}))return;
  if(owned){if(it.type==='weapon'){selectWeapon(it.id,true);player.fireCd=0;renderShop();updHUD(0);showMsg('已装备 '+WEAPONS[it.id].name,1.5);}else showMsg('已拥有',1);return;}
  if(airdrops.some(a=>a.it.id===it.id&&a.it.type===it.type)){showMsg('物资正在空投，请关闭商店等待送达',2);return;}
  if(!Game.testMode&&Game.gold<pr){showMsg('金币不足！去野外刷怪吧',1.4);AudioSys.sfx('click');return;}
  if(it.type==='squad'&&Game.squadCount>=squadLimit()){showMsg('队友已满('+squadLimit()+'名)',1.2);return;}
  if(!Game.testMode)spendGold(pr);
  AudioSys.sfx('buy');
  if(it.type==='weapon'){
    Game.weapons.push(it.id);selectWeapon(it.id,true);player.fireCd=0;
    showMsg('已购买并装备 '+WEAPONS[it.id].name+'；数字键 1-'+Math.min(9,Game.weapons.length)+' / X / 滚轮 / 底部武器栏切换',3);
    updHUD(0);autoSave();
  }else{if(it.type==='squad'){const slot=Game.squadCount++;Game.squadGear[slot]={weapon:0,armor:0,role:squadRoleId(it.id),vehicle:null};it={...it,slot};}airdropDeliver(it);autoSave();}
  renderShop();
}
/* 底部武器栏：显示全部已购武器与数字键，点一下即可切换（手机同样可点） */
function renderWeaponBar(){
  const bar=$('weaponBar');if(!bar)return;
  const key=Game.weapons.join(',')+'|'+Game.curWeapon+'|'+Game.weapons.map(weaponLv).join(',')+'|'+(player.inVehicle?1:0);
  if(bar.dataset.key===key)return;bar.dataset.key=key;bar.replaceChildren();
  Game.weapons.forEach((id,i)=>{
    const b=document.createElement('button');b.className='wslot'+(id===Game.curWeapon?' on':'');b.type='button';
    b.innerHTML=`<i>${i<9?keyBindings.label('N'+(i+1)):''}</i>${WEAPONS[id].name}${weaponLv(id)?`<sup>${weaponLv(id)}</sup>`:''}`;
    b.onpointerdown=e=>{e.preventDefault();e.stopPropagation();selectWeapon(id);};
    bar.appendChild(b);
  });
  bar.classList.toggle('dim',!!player.inVehicle);
}
function airdropDeliver(it){
  if(Game.testMode){grantSupply(it);return;}
  // 空投动画：箱子从天而降到基地旁
  AudioSys.sfx('airdrop');
  const crate=new THREE.Group();
  const box=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2),new THREE.MeshLambertMaterial({color:0xcc8833}));crate.add(box);
  const chute=new THREE.Mesh(new THREE.SphereGeometry(1.6,8,6,0,TAU,0,Math.PI/2),new THREE.MeshLambertMaterial({color:0xff5544,side:THREE.DoubleSide}));
  chute.position.y=2.4;crate.add(chute);
  const x=base.pos.x+rand(-4,4),z=base.pos.z+8+rand(-2,2);
  crate.position.set(x,40,z);
  scene.add(crate);
  airdrops.push({mesh:crate,x,z,it,chute});
  showMsg('📦 物资空投中…',1.5);
}
function grantSupply(it){
 if(it.coopSlot!==undefined){const h=coopHumans.find(h=>h.slot===it.coopSlot);const item={...it};delete item.coopSlot;if(h)return withHuman(h,()=>grantSupply(item));}
if(it.type==='weapon'){if(!Game.weapons.includes(it.id))Game.weapons.push(it.id);selectWeapon(it.id,true);showMsg('🔫 获得 '+WEAPONS[it.id].name+'！(数字键/X 切换武器)',2);}
      else if(it.type==='item'){
        const c=ITEMS[it.id];
        if(it.id==='medkit')Game.items.medkit++;
        else if(it.id==='shield'){player.shield=Math.min(150,player.shield+c.shield);updHUDItem();}
        else if(it.id==='adren'){player.buffT=Math.max(player.buffT,c.buff);}
        else if(it.id==='hpUp'){if(player.maxHp<10000){Game.hpBonus+=40;player.maxHp+=40;player.hp+=40;}updHPBar(player.bar,player.hp/player.maxHp);}
        else if(it.id==='magnet'){Game.magnet=true;}
        else if(it.id==='regen'){Game.regen=true;}
        else if(it.id==='repair'){base.hp=Math.min(base.maxHp,base.hp+Math.max(500,base.maxHp*.25));updHPBar(base.bar,base.hp/base.maxHp);}
        showMsg('📦 获得 '+c.name,1.6);
      }
      else if(it.type==='vehicle'){if(!Game.testMode||!vehicles.some(v=>v.kind===it.id)){Game.vehiclesOwned.push(it.id);spawnVehicle(it.id);}showMsg('🚗 '+VEHICLES[it.id].name+' 已送达停机坪！靠近按I驾驶',2.2);}
      else if(it.type==='squad'){if(Game.testMode||squad.length<Game.squadCount)spawnSquad(it.slot);if(Game.testMode)Game.squadCount=squad.length;showMsg('🪖 队友已加入！用右上角「队友」按钮切换跟随/守家，基地告急时自动回防。',2.6);}
}
function updAirdrops(dt){
  for(let i=airdrops.length-1;i>=0;i--){
    const a=airdrops[i];
    a.mesh.position.y-=dt*12;
    a.mesh.rotation.y+=dt;
    const gy=groundY(a.x,a.z)+.6;
    if(a.mesh.position.y<=gy){
      scene.remove(a.mesh);airdrops.splice(i,1);
      spawnParticles(new THREE.Vector3(a.x,gy,a.z),0xffcc66,10,5,.5);
      AudioSys.sfx('build');
      grantSupply(a.it);
    }
  }
}

/* ================= 建造 ================= */
function renderBuild(){
  const mul=turretDamageMul(Game,operations.active),hpMul=1+(Game.loop-1)*.4;
  const budgetHint=Game.testMode?'自由测试':operations.active?'副本布防':'二周目80座，三周目起96座';
  $('buildGold').textContent=(Game.testMode?'∞':Math.floor(Game.gold))+' · 设施 '+buildings.length+'/'+currentBuildingLimit()+' · 炮塔火力 ×'+mul.toFixed(1)+'（'+budgetHint+'）';
  const grid=$('buildGrid');grid.innerHTML='';
  for(const k of Object.keys(BUILDINGS).sort((a,b)=>BUILDINGS[a].price-BUILDINGS[b].price)){
    const c=BUILDINGS[k];
    const div=document.createElement('div');div.className='shopItem';div.tabIndex=0;div.setAttribute('role','button');
    div.innerHTML=`<div class="nm">${c.name}</div><div>${c.desc}<br>耐久${Math.round(c.hp*hpMul)}${c.dmg?' 伤害'+Math.round(c.dmg*mul):''}${c.range?' 射程'+c.range:''}</div><div class="pr">💰${c.price}</div>`;
    div.onclick=()=>{
      if(buildings.length>=currentBuildingLimit()){showMsg('设施已达 '+currentBuildingLimit()+' 座，请先保留通路',1.8);return;}
      if(!Game.testMode&&Game.gold<c.price){showMsg('金币不足！还差 '+Math.ceil(c.price-Game.gold),1.6);AudioSys.sfx('click');return;}
      startPlacement(k);
    };
    div.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();div.click();}};
    grid.appendChild(div);
  }
  const dm=document.createElement('div');dm.className='shopItem demolish';dm.tabIndex=0;dm.setAttribute('role','button');
  dm.innerHTML=`<div class="nm">🔨 拆除设施</div><div>拆掉放错或挡路的设施（初始城墙、炮塔也能拆）<br>返还一半造价</div><div class="pr">进入拆除模式</div>`;
  dm.onclick=()=>startDemolish();
  dm.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();dm.click();}};
  grid.appendChild(dm);
}
/* ================= 建造虚影：先看位置再放 =================
   选中设施后关闭面板，角色面前出现半透明 3D 虚影（绿=可放，红=不行并写明原因）；
   走动或 Q/E/鼠标转视角调整位置和朝向（虚影跟着视角转），J/回车/左键/「放置」确认（此时才扣钱），Esc/「取消」退出，L 返回建造菜单。 */
const place={mode:null,target:null,kind:null,ghost:null,ring:null,mat:null,x:0,z:0,yaw:0,valid:false,reason:'',free:false,lastMouse:false};
function startPlacement(kind,free=false){
  cancelPlacement(true);
  closePanels();
  const ghost=makeBuildingMesh(kind),mat=new THREE.MeshBasicMaterial({color:0x4dff9a,transparent:true,opacity:.45,depthWrite:false});
  ghost.traverse(o=>{if(o.isMesh){if(o.material!==mat&&o.material.dispose)o.material.dispose();o.material=mat;o.castShadow=o.receiveShadow=false;o.renderOrder=5;}});
  scene.add(ghost);
  const cfg=BUILDINGS[kind];let ring=null;
  if(cfg.range){ring=new THREE.Mesh(new THREE.RingGeometry(cfg.range-.25,cfg.range,72),new THREE.MeshBasicMaterial({color:0x7fd7ff,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;scene.add(ring);}
  Object.assign(place,{mode:'build',target:null,kind,ghost,ring,mat,valid:false,reason:'',free,lastMouse:Input.mouseFire});
  $('placeTip').textContent='可连续摆放 · 走动移动虚影 · Q/E 或鼠标转视角调整朝向 · J/回车/左键/射击键 放置一座 · L 换建筑 · Esc/取消 结束（每座放下才扣钱）';
  stage.classList.add('placing');$('placeBar').classList.remove('hidden');$('placeName').textContent=cfg.name+' · 连续建造'+(free||Game.testMode?'':' · 💰'+cfg.price);
  AudioSys.sfx('click');updPlacement();
}
function cancelPlacement(quiet=false){
  if(!place.kind)return;
  const wasDemolish=place.mode==='demolish';
  // 共享/缓存的几何体（倒角盒等）不能释放，只释放虚影自己新建的
  const cached=new Set([...visuals.cache.values()].filter(v=>v&&v.isBufferGeometry));
  scene.remove(place.ghost);place.ghost.traverse(o=>{if(o.isMesh&&o.geometry&&!cached.has(o.geometry))o.geometry.dispose();});place.mat.dispose();
  if(place.ring){scene.remove(place.ring);place.ring.geometry.dispose();place.ring.material.dispose();}
  place.kind=place.ghost=place.ring=place.mode=place.target=null;$('placeBar').classList.add('hidden');stage.classList.remove('placing');$('placeOk').textContent='✔ 放置 J';
  if(!quiet)showMsg(wasDemolish?'已退出拆除模式':'已结束建造（未放置的虚影不扣钱）',1.2);
}
function placementCheck(kind,x,z,yaw){
  const cfg=BUILDINGS[kind];
  if(vsOn()){const why=versus.zoneReason(player.vsPid,kind,x,z);if(why)return why;}
  else if(buildings.length>=currentBuildingLimit())return '设施已达 '+currentBuildingLimit()+' 座';
  const gold=vsOn()?(versus.seatOf(player)?.gold||0):Game.gold;
  if(!place.free&&!Game.testMode&&gold<cfg.price)return '金币不足（需要 '+cfg.price+'）';
  if(x<WORLD.minX+3||x>WORLD.maxX-3||z<WORLD.minZ+3||z>WORLD.maxZ-3)return '超出地图边界';
  if(Math.abs(x-gate.pos.x)<7.5&&Math.abs(z-gate.pos.z)<2.4)return '不能堵住城门';
  const pts=kind==='wall'?[-2.4,0,2.4].map(o=>[x+Math.cos(yaw)*o,z-Math.sin(yaw)*o]):[[x,z]];
  const r=kind==='wall'?.75:kind==='bunker'?2.4:1.3;
  for(const [px,pz] of pts){
    if(isFinite(fortress.ceilingAt(px,pz,groundY(px,pz)+.5)))return '隧道或洞穴里不能建';
    if(tooSteep(px,pz))return '地面太陡';
    if(collideWalls(px,pz,r))return '和墙体、岩石或其他设施重叠';
    if(Math.hypot(px-player.pos.x,pz-player.pos.z)<r+.9)return '离自己太近，会把自己卡住';
    if(squad.some(q=>!q.dead&&Math.hypot(px-q.mesh.position.x,pz-q.mesh.position.z)<r+1))return '会压到队友，换个位置';
    if(vehicles.some(v=>!v.dead&&Math.hypot(px-v.mesh.position.x,pz-v.mesh.position.z)<r+2.2))return '会压到载具';
    if(monsters.some(m=>!m.dead&&!m.fly&&Math.hypot(px-m.mesh.position.x,pz-m.mesh.position.z)<r+m.radius))return '前方有虫子';
  }
  return '';
}
/* 拆除模式：面朝的最近设施显示红圈，J/回车/左键/「拆除」拆掉并返还一半造价；可连续拆，L 返回建造菜单 · Esc 退出 */
function startDemolish(){
  cancelPlacement(true);closePanels();
  const ring=new THREE.Mesh(new THREE.RingGeometry(1,1.3,48),new THREE.MeshBasicMaterial({color:0xff4d4d,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.visible=false;scene.add(ring);
  const ghost=new THREE.Group();scene.add(ghost);
  Object.assign(place,{mode:'demolish',kind:'demolish',ghost,ring,mat:new THREE.MeshBasicMaterial(),target:null,valid:false,reason:'',free:false,lastMouse:Input.mouseFire});
  stage.classList.add('placing');$('placeBar').classList.remove('hidden');$('placeName').textContent='🔨 拆除模式';$('placeOk').textContent='🔨 拆除 J';
  $('placeTip').textContent='走动或 Q/E 转向要拆的设施（红圈）· J/回车/左键 拆除并返还一半造价 · 可连续拆 · L 返回建造菜单 · Esc 退出';
  AudioSys.sfx('click');updPlacement();
}
function demolishTarget(){
  const f=camForward(false);let best=null,score=Infinity;
  for(const bd of buildings){
    if(bd.dead||vsOn()&&(bd.team!==player.team||versus.size>1&&bd.owner&&bd.owner!==player.vsPid))continue;
    const dx=bd.mesh.position.x-player.pos.x,dz=bd.mesh.position.z-player.pos.z,d=Math.hypot(dx,dz);if(d>16)continue;
    const dot=(dx*f.x+dz*f.z)/(d||1);if(dot<.55&&d>bd.radius+1.5)continue;
    const sc=d*(1.6-dot);if(sc<score){score=sc;best=bd;}
  }
  return best;
}
const demolishRefund=bd=>Game.testMode?0:Math.round(BUILDINGS[bd.kind].price*.5);
function confirmDemolish(){
  const bd=place.target;
  if(!bd||bd.dead||!buildings.includes(bd)){showMsg('前方 16 米内没有自己的设施：转向要拆的设施',1.6);AudioSys.sfx('click');return;}
  const refund=demolishRefund(bd),name=BUILDINGS[bd.kind].name;
  if(vsOn()){const why=versus.demolish(player.vsPid,bd);if(why){showMsg(why,1.4);return;}AudioSys.sfx('build');showMsg('🔨 已拆除 '+name+'，返还 💰'+refund+'；Esc 退出',1.6);place.target=null;updPlacement();return;}
  Game.gold+=refund;bd.dead=true;scene.remove(bd.mesh);buildings.splice(buildings.indexOf(bd),1);
  spawnParticles(bd.mesh.position.clone().add(new THREE.Vector3(0,1.2,0)),0xbfc6cc,12,6,.6,1.3);AudioSys.sfx('build');
  showMsg(`🔨 已拆除 ${name}${refund?'，返还 💰'+refund:''}；可继续拆，Esc 退出`,1.8);place.target=null;updPlacement();autoSave();
}
function updPlacement(){
  if(!place.kind)return;
  if(place.mode==='demolish'){
    const t=demolishTarget();place.target=t;place.valid=!!t;place.ring.visible=!!t;
    if(t){const r=t.isWall?3.4:t.radius+.6;place.ring.position.set(t.mesh.position.x,groundY(t.mesh.position.x,t.mesh.position.z)+.12,t.mesh.position.z);place.ring.scale.setScalar(r);place.ring.material.opacity=.65+Math.sin(performance.now()/140)*.2;}
    const s=t?`✔ ${BUILDINGS[t.kind].name}${demolishRefund(t)?' · 返还 💰'+demolishRefund(t):''}`:'✖ 前方没有设施：转向要拆的设施';
    if($('placeState').textContent!==s){$('placeState').textContent=s;$('placeState').classList.toggle('bad',!t);}
    return;
  }
  const kind=place.kind,f=camForward(false),dist=kind==='wall'?3:kind==='bunker'?4:3;
  const x=player.pos.x+f.x*dist,z=player.pos.z+f.z*dist,yaw=camYaw;
  const reason=placementCheck(kind,x,z,yaw);
  Object.assign(place,{x,z,yaw,valid:!reason,reason});
  place.ghost.position.set(x,groundY(x,z)+.02,z);place.ghost.rotation.y=yaw;
  place.mat.color.setHex(reason?0xff5050:0x4dff9a);place.mat.opacity=.38+Math.sin(performance.now()/160)*.08;
  if(place.ring){place.ring.position.set(x,groundY(x,z)+.15,z);place.ring.material.color.setHex(reason?0xff7070:0x7fd7ff);}
  const s=reason?'✖ '+reason:'✔ 可以放置';
  if($('placeState').textContent!==s){$('placeState').textContent=s;$('placeState').classList.toggle('bad',!!reason);}
}
function confirmPlacement(){
  if(coopDriver?.config&&!coopDriver.connection.host){updPlacement();if(place.mode==='demolish')coopCommand({kind:'demolish',id:place.target?.coopId});else if(place.valid)coopCommand({kind:'build',id:place.kind,x:place.x,z:place.z,yaw:place.yaw});return;}
  if(!place.kind)return;
  if(place.mode==='demolish'){confirmDemolish();return;}
  updPlacement();
  if(!place.valid){showMsg('这里不能建：'+place.reason,1.6);AudioSys.sfx('click');return;}
  const kind=place.kind,cfg=BUILDINGS[kind];
  if(vsOn()){
    const why=versus.build(player.vsPid,kind,place.x,place.z,place.yaw);
    if(why){showMsg('这里不能建：'+why,1.6);AudioSys.sfx('click');return;}
    AudioSys.sfx('build');spawnParticles(new THREE.Vector3(place.x,groundY(place.x,place.z)+.5,place.z),0xffcc66,10,5,.5);updPlacement();
    showMsg('🏗 '+cfg.name+' 已建好 · 移到空位可继续放 · Esc 结束',1.6);return;
  }
  if(!place.free&&!Game.testMode)spendGold(cfg.price);
  placeBuilding(kind,place.x,place.z,place.yaw);
  AudioSys.sfx('build');spawnParticles(new THREE.Vector3(place.x,groundY(place.x,place.z)+.5,place.z),0xffcc66,10,5,.5);
  // Keep the selected building and preview for the next position. Recheck the
  // budget, facility cap and collisions before every placement, including here.
  updPlacement();
  showMsg('🏗 '+cfg.name+' 已建好！移到空位可继续放置 · L 换建筑 · Esc/取消 结束',1.8);autoSave();
}
// 放置模式下 J/左键/射击键确认，不再开火
function placementInput(){
  if(!place.kind)return;
  const mouseEdge=Input.mouseFire&&!place.lastMouse;place.lastMouse=Input.mouseFire;
  if(Input.pop('J')||mouseEdge)confirmPlacement();
}
function closePanels(){
  $('rvPanel')?.classList.add('hidden');
  if(!$('tacticsPanel').classList.contains('hidden'))AudioSys.pause(Game.state==='paused');
  bindingAction=null;['keyPanel','operationsPanel','tacticsPanel'].forEach(id=>$(id).classList.add('hidden'));
  $('shopPanel').classList.add('hidden');$('buildPanel').classList.add('hidden');$('savePanel').classList.add('hidden');$('sandboxPanel').classList.add('hidden');$('platformPanel').classList.add('hidden');
  panelOpen=false;Input.reset();
}
let panelOpen=false;

/* ================= 存档系统 ================= */
const SAVE_PREFIX='sst_save_';
let platformSave=null;
const validateStoredSave=d=>validateNormalSave(d,{weapons:{...WEAPONS,...LEGACY_WEAPONS},buildings:BUILDINGS,vehicles:VEHICLES});
const saveStore=new LocalSaveStore({storage:combatStorage,prefix:SAVE_PREFIX,validate:validateStoredSave,onStatus:()=>platformSave?.localStatus()});

function saveData(){
  return{
    campaignId:Game.campaignId,testMode:Game.testMode,difficulty:Game.difficulty,loop:Game.loop,chapter:Game.chapter,level:Game.level,
    gold:Math.floor(Game.gold),score:Game.score,cls:Game.cls,
    weapons:Game.weapons,curWeapon:Game.curWeapon,weaponLv:Game.weaponLv,items:Game.items,hpBonus:Game.hpBonus,
    vehiclesOwned:[...new Set(Game.vehiclesOwned)],squadCount:Game.squadCount,squadOrder:Game.squadOrder,squadAutoDefense:Game.squadAutoDefense,lastBattle:Game.lastBattle,squadGear:Game.squadGear.map(g=>({...g})),opsCompleted:{...Game.opsCompleted},
    perks:{magnet:Game.magnet,regen:Game.regen},hive:{...Game.hive},
    baseHp:base.hp,pendingDrops:airdrops.map(a=>a.it),
    buildings:buildings.map(b=>({k:b.kind,x:b.mesh.position.x,z:b.mesh.position.z,r:b.rotY,hp:b.hp,maxHp:b.maxHp})),
    time:Date.now(),version:'0.9',rampartRevision:1,
  };
}
function applySave(d){
  runGeneration++;
  Game.campaignId=d.campaignId||newSaveId();
  Game.testMode=d.testMode===true;
  Game.difficulty=Game.testMode?'normal':campaignDifficultyId(d.difficulty);
  Game.loop=d.loop;Game.chapter=d.chapter;Game.level=d.level;
  Game.gold=d.gold;Game.score=d.score;Game.cls=d.cls;
  const mig=migrateWeapons(d);
  Game.weapons=mig.weapons;Game.curWeapon=mig.cur;Game.weaponLv=mig.lv;Game.gold+=mig.refund;
  Game.migrationNote=mig.note;
  Game.items={medkit:d.items&&Number.isFinite(d.items.medkit)?d.items.medkit:2};
  Game.hpBonus=d.hpBonus||0;
  Game.magnet=!!(d.perks&&d.perks.magnet);Game.regen=!!(d.perks&&d.perks.regen);
  Game.squadOrder=d.squadOrder==='defend'?'defend':'follow';Game.squadAlert=0;
  Game.squadAutoDefense=true;Game.lastBattle=d.lastBattle||null;Game.battleLedger=null;
  Game.rescueCooldown={squad:0,vehicles:0};Game.baseAlarm=0;
  Game.squadGear=Array.from({length:MAX_SQUAD},(_,i)=>{const g=(d.squadGear||[])[i]||{};return{weapon:clamp(Math.floor(g.weapon)||0,0,5),armor:clamp(Math.floor(g.armor)||0,0,5),role:squadRoleId(g.role),vehicle:Object.hasOwn(VEHICLES,g.vehicle)?g.vehicle:null,order:g.order==='follow'||g.order==='defend'?g.order:null};});
  const crewKinds=new Set();for(const g of Game.squadGear){if(!(d.vehiclesOwned||[]).includes(g.vehicle)||crewKinds.has(g.vehicle))g.vehicle=null;if(g.vehicle)crewKinds.add(g.vehicle);}
  Game.opsCompleted={};for(const k of OP_COMPLETION_KEYS)if(d.opsCompleted&&typeof d.opsCompleted[k]==='string')Game.opsCompleted[k]=d.opsCompleted[k];
  operations.clear();
  Game.hive=Object.assign({loop:Game.loop,chapter:Game.chapter,queen:1,killed:false},d.hive||{});
  Game.vehiclesOwned=[];
  clearEntities(true);
  player.reset(Game.cls);
  base.maxHp=baseMaxHp();base.hp=Math.min(base.maxHp,d.baseHp||base.maxHp);updHPBar(base.bar,base.hp/base.maxHp);
  // Old default high walls survived the broad-rampart upgrade in saved games.
  // Remove only the exact legacy positions once; retain player-built walls elsewhere.
  for(const b of (d.buildings||[]))if(d.rampartRevision>=1||!legacyRampartWall(b))placeBuilding(b.k,b.x,b.z,b.r,b.hp,b.maxHp);
  for(const vk of new Set(d.vehiclesOwned||[])){if(!VEHICLES[vk])continue;Game.vehiclesOwned.push(vk);spawnVehicle(vk);}
  Game.squadCount=clamp(Math.floor(d.squadCount)||0,0,MAX_SQUAD);
  for(let i=0;i<Game.squadCount;i++)spawnSquad();
  for(const it of (d.pendingDrops||[])){
    if((it.type==='item'&&ITEMS[it.id])||(it.type==='vehicle'&&VEHICLES[it.id])||it.type==='squad'){
      if(it.type==='squad'&&squad.length>=Game.squadCount)continue;
      if(it.type==='vehicle'&&Game.vehiclesOwned.includes(it.id))continue;
      airdropDeliver(it);
    }
  }
  renderWeaponBar();
}
/* 旧存档武器迁移：下架武器按买价+强化花费退款；冲锋枪/战斗步枪/加特林并入机枪，
   机枪取这组里最高的强化等级，多花的钱退回。 */
function migrateWeapons(d){
  const lvOf=k=>clamp(Math.floor((d.weaponLv||{})[k])||0,0,WEAPON_MAX_LV);
  const spent=(price,n)=>{let t=0;for(let i=0;i<n;i++)t+=upgradeCost(price,i);return t;};
  const owned=new Set((CLASSES[d.cls]||{}).weapons||['lmg']),lv={},group=[],removed=[],merged=[];let refund=0;
  for(const k of new Set(d.weapons||[])){
    const L=LEGACY_WEAPONS[k];
    if(k==='lmg')group.push({price:0,lvl:lvOf(k)});
    else if(WEAPONS[k]){owned.add(k);if(lvOf(k))lv[k]=lvOf(k);}
    else if(L&&L.merge){group.push({price:L.price,lvl:lvOf(k)});merged.push(L.name);}
    else if(L){refund+=L.price+spent(L.price,lvOf(k));removed.push(L.name);}
  }
  if(group.length){
    const fin=Math.max(...group.map(g=>g.lvl));owned.add('lmg');if(fin)lv.lmg=fin;
    refund+=Math.max(0,group.reduce((t,g)=>t+g.price+spent(g.price,g.lvl),0)-spent(0,fin));
  }
  const weapons=Object.keys(WEAPONS).filter(k=>owned.has(k));
  const cur=weapons.includes(d.curWeapon)?d.curWeapon:(LEGACY_WEAPONS[d.curWeapon]||{}).merge&&weapons.includes('lmg')?'lmg':(weapons.includes((CLASSES[d.cls]||{}).weapon)?CLASSES[d.cls].weapon:weapons[0]);
  const parts=[];if(removed.length)parts.push(removed.join('、')+'已下架');if(merged.length)parts.push(merged.join('、')+'并入机枪（保留最高强化等级）');
  const note=parts.length?'🔧 武器调整：'+parts.join('；')+(refund?'，退还 '+refund+' 金币':''):'';
  return {weapons,cur,lv,refund,note};
}
function savePrefix(){return SAVE_PREFIX+(Game.testMode?'sandbox_':'');}
function autoSave(){
  if(zergOn())return; // 虫族模式是独立玩法，不覆盖战役自动档
  if(warOn()){resistanceCampaign.save();return;}
  if(rvOn()){rvBreakout.save();return;}
  if(coopDriver?.config||vsOn()||versusBackup||Game.state==='menu'||Game.state==='over')return;
  const d=saveData();
  if(Game.testMode){try{localStorage.setItem(savePrefix()+'auto',JSON.stringify(d));}catch{showMsg('本地保存失败，请导出普通进度备份',3);}return;}
  saveStore.write(SAVE_PREFIX+'auto',d);platformSave?.checkpoint(d);
}
// 新局保留前一局，不让初始进度覆盖已有战役。
function hasProgress(d){return !!(d&&!d.testMode&&(d.loop>1||d.chapter>1||d.level>1||d.gold>400||(d.weapons||[]).length>1||(d.vehiclesOwned||[]).length||d.squadCount));}
function backupAuto(){const d=saveStore.read(SAVE_PREFIX+'auto');return !d||saveStore.write(SAVE_PREFIX+'auto-backup',d,{rotate:false});}
function slotInfo(key){
  if(key.startsWith(SAVE_PREFIX+'sandbox_')){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
  return saveStore.read(key);
}
let saveMode='save'; // save / load
function renderSlots(){if(coopDriver?.config){showMsg('联机进度独立于单机存档，本局不读写单机档',2);return;}
  const list=$('slotList');list.innerHTML='';
  $('saveTitle').textContent=saveMode==='save'?'💾 选择存档位':'📂 选择要读取的存档';
  const describe=d=>`${d.testMode?'自由测试':campaignDifficulty(d.difficulty).name} · 周目${d.loop} 第${d.chapter}章 第${d.level}关 · ${(CLASSES[d.cls]||{}).name||''} · 💰${Math.floor(d.gold)} · ${new Date(d.time).toLocaleString()}`;
  if(saveMode==='load')for(const [key,label] of [[savePrefix()+'auto','自动存档'],[SAVE_PREFIX+'auto-backup','开新局前的备份']]){
    const d=slotInfo(key);if(!d)continue;
    const div=document.createElement('div');div.className='saveSlot auto';div.innerHTML=`<span>${label}：${describe(d)}</span>`;
    const b=document.createElement('button');b.className='mbtn green';b.textContent='读取';b.onclick=()=>loadGame(d);div.appendChild(b);list.appendChild(div);
  }
  for(let i=1;i<=5;i++){
    const key=savePrefix()+i;
    const d=slotInfo(key);
    const div=document.createElement('div');div.className='saveSlot';
    const info=d?describe(d):'— 空存档位 —';
    div.innerHTML=`<span>存档${i}：${info}</span>`;
    const btns=document.createElement('span');
    if(saveMode==='save'){
      const b=document.createElement('button');b.className='mbtn';b.textContent='保存';
      b.onclick=()=>{const d=saveData();if(Game.testMode){try{localStorage.setItem(key,JSON.stringify(d));}catch{showMsg('本地保存失败',3);return;}}else if(!saveStore.write(key,d)){showMsg(saveStore.status,4);return;}platformSave?.checkpoint(d);AudioSys.sfx('buy');showMsg('💾 已保存到存档'+i,1.5);renderSlots();};
      btns.appendChild(b);
    }else if(d){
      const b=document.createElement('button');b.className='mbtn green';b.textContent='读取';
      b.onclick=()=>{loadGame(d);};
      btns.appendChild(b);
    }
    if(d){
      const del=document.createElement('button');del.className='mbtn red';del.textContent='删除';del.style.marginLeft='6px';
      del.onclick=()=>{saveStore.remove(key);renderSlots();};
      btns.appendChild(del);
    }
    div.appendChild(btns);
    list.appendChild(div);
  }
}
function restoreView(){
  setCameraView(0,false);
  let pref='third';try{pref=localStorage.getItem('chongchao-person')||'third';}catch(_e){}
  if(pref==='first')setCamMode('first',false);
}
function loadGame(d){if(!d||(!d.testMode&&!validateStoredSave(d))){showAlert('存档内容异常，未读取或覆盖原档');return;}if(coopDriver?.config){showMsg('联机中不能读入单机存档',2);return;}
  closePanels();hideConfirm();
  $('menuMain').classList.add('hidden');$('menuPause').classList.add('hidden');$('menuOver').classList.add('hidden');
  applySave(d);
  restoreView();
  showHUD();
  startPrep();
  if(Game.testMode){Game.state='battle';$('readyBtn').classList.add('hidden');sandboxSpawn('showcase');}
  if(Game.migrationNote){const note=Game.migrationNote;Game.migrationNote='';setTimeout(()=>showMsg(note,4.5),3200);autoSave();}
  AudioSys.sfx('win');
}

/* ================= 新游戏 / 界面切换 ================= */
function showHUD(){
  $('sandboxBtn').classList.toggle('hidden',!Game.testMode);
  $('hud').classList.remove('hidden');
  $('touchUI').classList.toggle('hidden',!isTouch);
  renderWeaponBar();syncViewLabels();
}
/* 游戏内确认框（iframe 中 window.confirm 可能被拦截） */
function askConfirm(text,okText,onOk,cancelText='取消',onCancel=null){
  $('confirmText').textContent=text;$('confirmOk').textContent=okText;$('confirmCancel').textContent=cancelText;
  $('confirmOk').onclick=()=>{hideConfirm();onOk();};$('confirmCancel').onclick=()=>{hideConfirm();if(onCancel)onCancel();};
  $('confirmPanel').classList.remove('hidden');setTimeout(()=>$('confirmCancel').focus(),0);
}
function hideConfirm(){$('confirmPanel').classList.add('hidden');}
function requestNewGame(){
  AudioSys.init();AudioSys.resume();
  const d=slotInfo(SAVE_PREFIX+'auto');
  if(hasProgress(d)){
    askConfirm(`检测到上次进度（周目${d.loop} 第${d.chapter}章 第${d.level}关 · 💰${Math.floor(d.gold)}）。开始新游戏会把它移到「开新局前的备份」，之后可在“读取存档”里恢复。`,'仍然开始新游戏',()=>{if(backupAuto())newGame(false);else showAlert(saveStore.status);},'继续上次进度',()=>loadGame(d));
    return;
  }
  newGame(false);
}
function newGame(test){
  if(coopDriver?.action('restart'))return;
  AudioSys.pause(false);lookControl.clear();pitchControl.clear();delete player.lookHeading;
  runGeneration++;
  resetSandboxWave();
  hideConfirm();
  Game.campaignId=newSaveId();
  Game.testMode=!!test;
  Game.difficulty=test?'normal':selectedDifficulty;
  Game.loop=1;Game.chapter=1;Game.level=1;
  Game.gold=test?99999:150;Game.score=0;
  Game.hpBonus=0;
  Game.weapons=test?Object.keys(WEAPONS):[...CLASSES[Game.cls].weapons];
  Game.curWeapon=CLASSES[Game.cls].weapon;Game.weaponLv={};
  Game.items={medkit:test?99:2};
  Game.vehiclesOwned=[];Game.squadCount=0;Game.squadOrder='follow';Game.squadAlert=0;Game.squadGear=[];Game.opsCompleted={};operations.clear();
  Game.squadAutoDefense=true;Game.lastBattle=null;Game.battleLedger=null;
  Game.rescueCooldown={squad:0,vehicles:0};Game.baseAlarm=0;
  Game.hive={loop:1,chapter:1,queen:1,killed:false};
  Game.magnet=false;Game.regen=false;
  clearEntities(true);
  player.reset(Game.cls);
  restoreView();
  base.maxHp=baseMaxHp();base.hp=base.maxHp;updHPBar(base.bar,base.hp/base.maxHp);
  // 高台正面围墙（城门两侧；±9 空出给城门塔楼）
  // Permanent broad ramparts leave the wall walk free for soldiers and turrets.
  placeBuilding('mgTurret',-15,-13,0);placeBuilding('mgTurret',15,-13,0);
  placeBuilding('antiAir',27,-13,0);
  gate.dead=false;gate.hp=gate.maxHp=2500;updHPBar(gate.bar,1);gate.open=true;gate.auto=false;
  if(test){
    for(const vk of Object.keys(VEHICLES)){Game.vehiclesOwned.push(vk);spawnVehicle(vk);}
    placeBuilding('cannonTurret',16,-22,0);placeBuilding('bunker',-20,-24,0);
  }
  $('menuMain').classList.add('hidden');
  showHUD();
  startPrep();
  if(test){
    Object.keys(SQUAD_ROLES).forEach((role,i)=>squadGear(i).role=role);
    for(let i=0;i<4;i++)spawnSquad();Game.squadCount=squad.length;
    Game.state='battle';$('readyBtn').classList.add('hidden');
    sandboxSpawn('showcase');showHint('自由测试：持续虫潮 / 无敌 / 无限弹药 · T 测试台：暂停刷怪、召唤首领、领取装备');
    showMsg('🧪 自由测试 · 玩家、小队、载具与基地无敌',3);
  }
}
function togglePause(){
  if(coopDriver?.action(Game.state==='paused'?'resume':'pause')){Input.reset();return;}
  Input.reset();
  if(Game.state==='prep'||Game.state==='battle'){
    Game.pausedFrom=Game.state;Game.state='paused';AudioSys.pause(true);lookControl.clear();pitchControl.clear();
    if(document.pointerLockElement)document.exitPointerLock&&document.exitPointerLock();
    syncPauseOptions();
    $('menuPause').classList.remove('hidden');
    AudioSys.sfx('click');autoSave();
  }else if(Game.state==='paused'){
    Game.state=Game.pausedFrom;AudioSys.pause(false);
    $('menuPause').classList.add('hidden');
    closePanels();
    AudioSys.sfx('click');
  }
}
// P / Esc / 手机暂停键：任何游玩状态都立即响应；面板打开时先关面板再暂停
function pauseKey(fromEsc=false){
  if(!$('confirmPanel').classList.contains('hidden'))return;
  if(vsOn()&&Game.state==='over')return;
  if(vsOn()&&vsUI.open&&!panelOpen&&!(fromEsc&&place.kind)){versusClosePanel();return;}
  if(fromEsc&&place.kind&&!panelOpen){cancelPlacement();return;}
  if(panelOpen&&Game.state!=='paused'){closePanels();togglePause();return;}
  if(panelOpen){closePanels();return;}
  if(['prep','battle','paused'].includes(Game.state))togglePause();
}

/* ================= HUD 更新 ================= */
// 跳跃状态；坐直升机时手机 跳跃→升、医疗→降
function updJumpUI(){
  if(zergOn())return; // 虫族模式自管触屏动作键标签（撕咬/酸液/召战士…），不被战役 HUD 覆盖
  const v=player.inVehicle,fly=!!(v&&v.cfg.fly);
  const txt=v?'':player.onGround?'跳跃 就绪（'+(isTouch?'跳跃':keyBindings.label('K'))+'）':'跳跃 腾空中';
  $('vSPRINT').classList.toggle('hidden',!!v);
  $('vU').classList.toggle('hidden',!!v);$('vU').textContent='手雷';
  const el=$('jumpTxt');if(el.textContent!==txt)el.textContent=txt;
  const k=$('vK'),h=$('vH'),kl=fly?'升':'跳跃',hl=fly?'降':vsOn()?(player.bfKit==='engineer'?'维修':player.bfKit==='support'?'补弹':player.bfKit==='medic'?'医疗':'支援'):'医疗';
  if(k.textContent!==kl)k.textContent=kl;if(h.textContent!==hl)h.textContent=hl;

}
function updHUD(dt){
  if(rvOn()){rvBreakout.hud();return;}
  if(vsOn()){updVersusHUD(dt);return;}
  $('statLine').textContent=Game.testMode?'🧪 自由测试 · 无限资源':levelName();
  $('hpTxt').textContent=Game.testMode?'∞ 无敌':Math.ceil(player.hp)+'/'+player.maxHp;
  $('hpBar').style.width=clamp(player.hp/player.maxHp*100,0,100)+'%';
  $('hpBarWrap').classList.toggle('low',!Game.testMode&&player.hp<player.maxHp*.3);
  $('baseTxt').textContent=Game.testMode?'∞ 无敌':Math.ceil(base.hp)+'/'+base.maxHp;
  $('baseBar').style.width=clamp(base.hp/base.maxHp*100,0,100)+'%';
  $('baseBarWrap').classList.toggle('low',!Game.testMode&&(base.hp<base.maxHp*.3||Game.baseAlarm>0));
  $('baseAlert').textContent=Game.testMode?'自由测试：基地无敌':Game.baseAlarm>0?'⚠ 基地受袭，立即回防！':base.hp<base.maxHp*.3?'⚠ 基地危急，耐久归零即失败':'基地耐久归零即失败';
  const dx=base.pos.x-player.pos.x,dz=base.pos.z-player.pos.z;
  const sx=-Math.cos(camYaw)*dx+Math.sin(camYaw)*dz,sy=-Math.sin(camYaw)*dx-Math.cos(camYaw)*dz;
  const arrows=['→','↘','↓','↙','←','↖','↑','↗'];
  const distance=Math.hypot(dx,dz);
  $('baseGuide').textContent=distance<10?'🏰 基地附近':arrows[(Math.round(Math.atan2(sy,sx)/(Math.PI/4))+8)%8]+' 基地 '+Math.round(distance)+'米';
  $('goldTxt').textContent=Game.testMode?'∞':Math.floor(Game.gold);
  $('scoreTxt').textContent=Game.score;
  if(player.inVehicle)$('weapTxt').textContent='🚗 '+player.inVehicle.cfg.name+' · I 下车';
  else $('weapTxt').textContent='🔫 '+WEAPONS[Game.curWeapon].name+(weaponLv(Game.curWeapon)?' Lv'+weaponLv(Game.curWeapon):'')+(WEAPONS[Game.curWeapon].beam&&player.heat>.05?' 🔥'+Math.round(player.heat*30)+'%':'');
  updHUDItem();updJumpUI();
  $('squadTxt').textContent=Game.squadCount||squad.length?`🪖 小队 ${squad.length}/${Math.max(Game.squadCount,squad.length)} · ${squadTaskLabel()} · 驾驶${squad.filter(s=>s.vehicle).length}`:'';
  updSquadOrderBtn();
  if((tacticalHUDTimer-=dt)<=0){
    tacticalHUDTimer=.3;
    const plan=Game.state==='battle'&&Game.wave.plan?Game.wave.plan:currentWavePlan();
    const text=Game.testMode?'战术部署：自由测试':operations.active?'副本任务进行中':(Game.state==='prep'?'下一波：':'本关：')+plan.title+' · 战术部署';
    if($('tacticsButton').textContent!==text)$('tacticsButton').textContent=text;
  }
  $('hiveTxt').textContent=Game.testMode?'':Game.hive.killed?'👑 母皇已击杀 · 虫潮 -35% · 每关补给 +'+queenSupply():`👑 虫巢母皇 ${Math.round(Game.hive.queen*100)}% · 击杀后每关 +${queenSupply()}`;
  if(Game.state==='prep'){
    const wilds=waveMonsters().length;
    $('waveTxt').textContent=`🛠 准备中 · 野怪 ${wilds}（可选打）`;
  }
  renderWeaponBar();
  if(Game.msgTimer>0){Game.msgTimer-=dt;if(Game.msgTimer<=0)$('msg').classList.add('hidden');}
  if((radarT-=dt)<=0){radarT=.1;drawRadar();}
}
/* 小地图：以镜头朝向为上，显示基地、虫洞、虫巢、敌人与队友；基地在范围外时边缘箭头指路 */
const radar=$('radar'),rctx=radar.getContext('2d');let radarT=0,tacticalHUDTimer=0;
const radarTunnels=hive.tunnels.map(t=>t.samples.filter((_,i)=>i%3===0||i===t.samples.length-1));
function drawRadar(){
  const W=radar.width,H=radar.height,cx=W/2,cy=H/2,R=W/2-4,range=95,sc=R/range;
  const p=player.inVehicle?player.inVehicle.mesh.position:player.pos,c=Math.cos(camYaw),s=Math.sin(camYaw);
  const toS=(x,z)=>{const dx=x-p.x,dz=z-p.z;return [cx+(-dx*c+dz*s)*sc,cy-(dx*s+dz*c)*sc];};
  rctx.clearRect(0,0,W,H);rctx.save();
  rctx.beginPath();rctx.arc(cx,cy,R,0,TAU);rctx.fillStyle='rgba(6,14,24,.78)';rctx.fill();rctx.clip();
  rctx.lineCap='round';rctx.lineWidth=7;rctx.strokeStyle='rgba(150,60,90,.55)';
  for(const pts of radarTunnels){rctx.beginPath();pts.forEach((q,i)=>{const [x,y]=toS(q.x,q.z);i?rctx.lineTo(x,y):rctx.moveTo(x,y);});rctx.stroke();}
  const dot=(x,z,r,col,shape)=>{const [X,Y]=toS(x,z);if(Math.hypot(X-cx,Y-cy)>R+r)return;rctx.fillStyle=col;rctx.beginPath();if(shape==='sq')rctx.rect(X-r,Y-r,r*2,r*2);else rctx.arc(X,Y,r,0,TAU);rctx.fill();};
  for(const f of HILL_FORTS)dot(f.x,f.z,6,'rgba(150,165,180,.6)','sq');
  for(const m of MOUTHS){const [X,Y]=toS(m.x,m.z);rctx.strokeStyle='#ff5a3a';rctx.lineWidth=3;rctx.beginPath();rctx.arc(X,Y,7,0,TAU);rctx.stroke();}
  {const [X,Y]=toS(HIVE.x,HIVE.z+8);rctx.fillStyle=Game.hive.killed?'rgba(120,80,90,.6)':'rgba(255,60,90,.75)';rctx.beginPath();rctx.arc(X,Y,13,0,TAU);rctx.fill();}
  for(const bd of buildings)dot(bd.mesh.position.x,bd.mesh.position.z,2.5,'rgba(160,190,210,.85)','sq');
  dot(base.pos.x,base.pos.z,9,'#3fa9ff','sq');
  for(const v of vehicles)if(v!==player.inVehicle)dot(v.mesh.position.x,v.mesh.position.z,4,'#ffd34d','sq');
  for(const mo of monsters){if(mo.dead)continue;const big=mo.kind!=='mob';dot(mo.mesh.position.x,mo.mesh.position.z,big?7:3.4,mo.home?'#c46bff':mo.elite?'#ffe14a':big?'#ff2d55':'#ff5a4a');}
  for(const q of squad)dot(q.mesh.position.x,q.mesh.position.z,3.6,'#5ff0e0');
  rctx.restore();
  // 基地方向（超出范围时贴边箭头）
  const [bx,by]=toS(base.pos.x,base.pos.z),bd=Math.hypot(bx-cx,by-cy);
  if(bd>R-6){const a=Math.atan2(by-cy,bx-cx),ex=cx+Math.cos(a)*(R-8),ey=cy+Math.sin(a)*(R-8);rctx.save();rctx.translate(ex,ey);rctx.rotate(a);rctx.fillStyle='#3fa9ff';rctx.beginPath();rctx.moveTo(8,0);rctx.lineTo(-6,-6);rctx.lineTo(-6,6);rctx.fill();rctx.restore();}
  rctx.save();rctx.translate(cx,cy);rctx.rotate(-((player.inVehicle?player.inVehicle.yaw:player.yaw)-camYaw));rctx.fillStyle='#fff';rctx.beginPath();rctx.moveTo(0,-8);rctx.lineTo(6,6);rctx.lineTo(-6,6);rctx.closePath();rctx.fill();rctx.restore();
  rctx.strokeStyle='rgba(120,170,200,.55)';rctx.lineWidth=2;rctx.beginPath();rctx.arc(cx,cy,R,0,TAU);rctx.stroke();
}

/* ================= 第一人称武器模型 ================= */
const viewModel=new THREE.Group();viewModel.visible=false;camera.add(viewModel);
let viewKick=0,viewBob=0,viewModelKey='',bfAiming=false;
function updViewModel(){
  const id=Game.curWeapon,key=(vsOn()?'battlefield:':'campaign:')+id;if(viewModelKey===key)return;viewModelKey=key;
  viewModel.children.slice().forEach(c=>{viewModel.remove(c);c.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});});
  if(vsOn()){const gun=militaryGun(THREE,id);gun.rotation.y=Math.PI;viewModel.add(gun);viewModel.position.set(.21,-.21,-.62);return;}
  const w=WEAPONS[id],len=w.pierce>2?.62:w.pellets?.42:.5,fat=w.explode||w.flame?.075:.055;
  const add=(geo,color,x,y,z,basic)=>{const m=new THREE.Mesh(geo,basic?new THREE.MeshBasicMaterial({color}):new THREE.MeshPhongMaterial({color,shininess:50,specular:0x445566}));m.position.set(x,y,z);viewModel.add(m);return m;};
  add(new THREE.BoxGeometry(fat*1.2,fat*1.4,len),0x2a323b,0,0,0);
  const barrel=add(new THREE.CylinderGeometry(fat*.28,fat*.32,len*.6,10),0x8f9cab,0,fat*.2,-len*.72);barrel.rotation.x=Math.PI/2;
  add(new THREE.BoxGeometry(fat*.22,fat*.25,len*.55),w.color,fat*.62,fat*.1,-len*.05,true);
  add(new THREE.BoxGeometry(fat*.8,fat*1.5,fat*.9),0x1c2228,0,-fat*1.3,len*.12);
  add(new THREE.BoxGeometry(fat*1.6,fat*1.2,fat*1.6),0x3f74c4,fat*.2,-fat*1.1,len*.36);
  viewModel.position.set(.21,-.21,-.62);
}
function updFirstPersonModel(dt,show){
  viewModel.visible=show;if(!show)return;updViewModel();
  viewKick=Math.max(0,viewKick-dt*7);
  const moving=Math.hypot(Input.axis().x,Input.axis().y)>.1;viewBob+=dt*(moving?9:2);
  viewModel.position.set(.21+Math.sin(viewBob)*(moving?.008:.002),-.21+Math.abs(Math.cos(viewBob))*(moving?.008:.003)-viewKick*.012,-.62+viewKick*.045);
  viewModel.rotation.x=viewKick*.12;
  if(vsOn()&&bfAiming){viewModel.position.x=0;viewModel.position.y=Game.curWeapon==='laser'?-.14:-.125;}
  if(vsOn()&&player.bfReload){viewModel.rotation.x=-.55;viewModel.rotation.z=-.28;viewModel.position.y-=.12;}else viewModel.rotation.z=0;
}

/* ================= 摄像机 ================= */
const _look=new THREE.Vector3(),_dir=new THREE.Vector3(),_probe=new THREE.Vector3();
function camBlocked(p){
  const gatePost=Math.abs(Math.abs(p.x)-7)<1.15&&Math.abs(p.z+16)<1.15&&p.y>PLAT.H&&p.y<PLAT.H+5.8;
  return gatePost||p.y<groundY(p.x,p.z)+.35||fortress.shotBlocked(p);
}
// 旋转即时生效，只平滑跟随点与避障距离：不再“拖着走”，也不会在地形起伏时一顿一顿。
function updCamera(dt){
  // 用户偏好：爆炸、炮击、受伤等不移动镜头；打击反馈保留在粒子、音效与武器模型上。
  const v=player.inVehicle,tp=v?v.mesh.position:player.pos;
  // 跑步时视野略微拉宽
  const fovT=62+(player.sprinting&&!v?4:0);
  if(camera.fov!==fovT){camera.fov=Math.abs(fovT-camera.fov)<.05?fovT:camera.fov+(fovT-camera.fov)*Math.min(1,dt*(fovT>camera.fov?20:8));camera.updateProjectionMatrix();}
  if(!camState.init){camState.target.copy(tp);camState.init=true;camState.dist=99;}
  camState.target.lerp(tp,1-Math.exp(-dt*(v?11:18)));
  if(camMode==='first'){
    const eye=_look.copy(tp);eye.y+=v?v.cfg.seatH+1.3:1.72;
    if(v)eye.addScaledVector(_dir.set(Math.sin(v.yaw),0,Math.cos(v.yaw)),v.cfg.fly?1.2:1.6);
    camera.position.copy(eye);
    camera.lookAt(_probe.copy(eye).add(camForward(true)));
    if(!v)player.mesh.visible=false;
    updFirstPersonModel(dt,!v&&!player.dead);
    return;
  }
  updFirstPersonModel(dt,false);
  const view=CAMERA_VIEWS[camView];
  const look=_look.copy(camState.target);look.y+=v?2.6:1.9;
  let R=Math.hypot(view.d,view.h),el=clamp(Math.atan2(view.h,view.d)-camPitch,.06,1.45);
  const inside=isFinite(fortress.ceilingAt(tp.x,tp.z,tp.y+.5))?1:0;
  camState.inTunnel+=(inside-camState.inTunnel)*Math.min(1,dt*4);
  if(camState.inTunnel>.01){const t=camState.inTunnel;R=R*(1-t)+5.4*t;el=el*(1-t)+.2*t;}
  _dir.set(-Math.sin(camYaw)*Math.cos(el),Math.sin(el),-Math.cos(camYaw)*Math.cos(el));
  let free=R;
  for(let st=.4;st<=R;st+=.4){_probe.copy(look).addScaledVector(_dir,st);if(camBlocked(_probe)){free=Math.max(.7,st-.5);break;}}
  if(camState.dist>R+1)camState.dist=free;
  camState.dist+=(free-camState.dist)*(free<camState.dist?1-Math.exp(-dt*24):1-Math.exp(-dt*3.5));
  camera.position.copy(look).addScaledVector(_dir,camState.dist);
  camera.lookAt(look.x,look.y+.5,look.z);
  if(!player.dead&&!v)player.mesh.visible=camState.dist>1.2;
}

/* ================= UI事件绑定 ================= */
document.querySelectorAll('#classRow .classCard').forEach(el=>{
  el.onclick=()=>{
    document.querySelectorAll('#classRow .classCard').forEach(e=>e.classList.remove('sel'));
    el.classList.add('sel');Game.cls=el.dataset.c;AudioSys.init();AudioSys.sfx('click');
  };
});
function syncDifficultySelection(){
  for(const el of document.querySelectorAll('[data-campaign-difficulty]'))el.setAttribute('aria-pressed',String(el.dataset.campaignDifficulty===selectedDifficulty));
  $('difficultyHint').textContent=campaignDifficulty(selectedDifficulty).hint+' 仅用于新游戏；继续和读档沿用存档难度。';
}
for(const el of document.querySelectorAll('[data-campaign-difficulty]'))el.onclick=()=>{
  selectedDifficulty=campaignDifficultyId(el.dataset.campaignDifficulty);
  try{localStorage.setItem('chongchao-campaign-difficulty',selectedDifficulty);}catch(_e){}
  syncDifficultySelection();
};
syncDifficultySelection();
$('btnStart').onclick=requestNewGame;
$('btnTest').onclick=()=>{AudioSys.init();AudioSys.resume();newGame(true);};
$('btnContinue').onclick=()=>{
  AudioSys.init();AudioSys.resume();
  const d=slotInfo(SAVE_PREFIX+'auto');
  if(d)loadGame(d);else showAlert('未找到自动存档，请先到「存档/排行」查看云端和本地备份，或导入存档文件');
};
function refreshContinue(){
  const d=slotInfo(SAVE_PREFIX+'auto'),btn=$('btnContinue');
  btn.textContent=d?`▶ 继续上次（${campaignDifficulty(d.difficulty).name} · 第${d.chapter}章第${d.level}关）`:'▶ 继续上次';
  btn.classList.toggle('green',hasProgress(d));$('btnStart').classList.toggle('green',!hasProgress(d));
}
refreshContinue();
function showAlert(t){
  let el=$('toast');
  if(!el){el=document.createElement('div');el.id='toast';el.style.cssText='position:absolute;left:50%;bottom:10px;transform:translateX(-50%);font-size:15px;color:#ffe27a;background:rgba(6,14,26,.92);border:1px solid #c9a24a;border-radius:10px;padding:6px 16px;white-space:nowrap;text-shadow:0 1px 2px #000;z-index:60;pointer-events:none;';stage.appendChild(el);}
  el.textContent=t;el.style.display='block';
  clearTimeout(el._t);el._t=setTimeout(()=>el.style.display='none',1800);
}
$('btnLoadMenu').onclick=()=>{AudioSys.init();saveMode='load';renderSlots();$('savePanel').classList.remove('hidden');panelOpen=true;};
$('btnLoadMenu2').onclick=()=>{saveMode='load';renderSlots();$('savePanel').classList.remove('hidden');panelOpen=true;};
$('btnSaveMenu').onclick=()=>{saveMode='save';renderSlots();$('savePanel').classList.remove('hidden');panelOpen=true;};
$('btnOverLoad').onclick=()=>{saveMode='load';renderSlots();$('savePanel').classList.remove('hidden');panelOpen=true;};
$('saveClose').onclick=closePanels;
$('btnResume').onclick=togglePause;
$('btnRestartLv').onclick=()=>{if(warOn())resistanceCampaign.retry();else if(rvOn())rvBreakout.start();else if(vsOn())versusRematch();else restartLevel();};
$('btnRetry').onclick=restartLevel;
$('btnQuit').onclick=$('btnOverQuit').onclick=()=>{
  const leavingWar=warOn();if(leavingWar)resistanceCampaign.stop();
  if(rvOn())rvBreakout.stop();
  if(zergOn())zergMode.stop();
  if(vsOn()||versusBackup)exitVersus();
  if(!leavingWar&&Game.state!=='over')autoSave();
  coopDriver?.leave();clearCoopHumans();Game.coop=false;
  operations.clear();Game.state='menu';Game.testMode=false;$('sandboxBtn').classList.add('hidden');
  if(document.pointerLockElement)document.exitPointerLock&&document.exitPointerLock();
  $('menuPause').classList.add('hidden');$('menuOver').classList.add('hidden');
  $('hud').classList.add('hidden');$('touchUI').classList.add('hidden');
  $('menuMain').classList.remove('hidden');viewModel.visible=false;
  closePanels();refreshContinue();
};
$('readyBtn').onclick=()=>{if(Game.state==='prep')startBattle();};
$('shopClose').onclick=closePanels;
$('buildClose').onclick=closePanels;
document.querySelectorAll('#shopTabs .tab').forEach(el=>{
  el.onclick=()=>{
    document.querySelectorAll('#shopTabs .tab').forEach(e=>e.classList.remove('on'));
    el.classList.add('on');shopTab=el.dataset.t;renderShop();AudioSys.sfx('click');
  };
});
function syncPauseOptions(){
  syncViewLabels();
  $('squadTaskHint').textContent=operations.active?'副本中自动跟随，返回后恢复分工。':'队友默认跟随出击，基地告急时自动回防；可随时一键切换全队「跟随/守家」。';
  updSquadOrderBtn();
  $('muteBtnMenu').textContent=$('muteBtn').textContent;
}
$('placeOk').onclick=confirmPlacement;$('placeCancel').onclick=()=>cancelPlacement();
$('personBtn').onclick=()=>{setCamMode(camMode==='first'?'third':'first');syncPauseOptions();};
function toggleSquadOrder(){setSquadTask(Game.squadOrder==='defend'?'follow':'defend');updSquadOrderBtn();}
$('squadOrderBtn').onclick=toggleSquadOrder;$('squadOrderPause').onclick=toggleSquadOrder;
// 游玩中用鼠标点过的按钮不保留焦点，避免空格/回车再次触发它
stage.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&Input.isPlaying())setTimeout(()=>b.blur(),0);});
Input.isPlaying=()=>(Game.state==='prep'||Game.state==='battle')&&!panelOpen&&$('confirmPanel').classList.contains('hidden');
Input.onPause=pauseKey;
Input.onTouchDetected=()=>{if(deviceMode==='auto')setTouchMode(true);};
let layoutPreviousTouch=isTouch;
const touchLayout=mountTouchLayout({stage,storage:combatStorage,toStage,resetInput:()=>Input.reset(),
  onOpen(){layoutPreviousTouch=isTouch;bindingAction=null;closePanels();if(['prep','battle'].includes(Game.state))togglePause();setTouchMode(true);panelOpen=true;AudioSys.pause(true);},
  onClose(saved){setTouchMode(layoutPreviousTouch);panelOpen=true;$('keyPanel').classList.remove('hidden');$('keyStatus').textContent=saved?'手机按键布局已保存':'已取消布局调整';renderKeys();}
});
function setDeviceMode(mode){
  if(!['auto','desktop','touch'].includes(mode))return;
  deviceMode=mode;try{localStorage.setItem('chongchao-device-mode',mode);}catch(_e){}
  if(document.pointerLockElement)document.exitPointerLock();
  setTouchMode(mode==='touch'||mode==='auto'&&autoTouch());
  for(const el of document.querySelectorAll('[data-device-mode]'))el.setAttribute('aria-pressed',String(el.dataset.deviceMode===mode));
  syncKeyLabels();
}
function setTouchMode(on){
  isTouch=on;Input.reset();stage.classList.toggle('touch-mode',isTouch);window.dispatchEvent(new Event('resize'));
  $('touchUI').classList.toggle('hidden',!isTouch||!['prep','battle','paused'].includes(Game.state));
  touchLayout.refresh();
}
for(const el of document.querySelectorAll('[data-device-mode]'))el.onclick=()=>setDeviceMode(el.dataset.deviceMode);

/* ================= 纯键盘界面导航 =================
   最上层可见的面板/菜单自动选中第一项（带黄色选中框）；方向键按屏幕位置移动，
   Tab/Shift+Tab 在面板内循环，回车/空格确认，Esc 关闭或返回。重新渲染后回到原位置。 */
const NAV_ROOTS=['vsPanel','touchLayoutEditor','confirmPanel','keyPanel','tacticsPanel','operationsPanel','sandboxPanel','platformPanel','savePanel','shopPanel','buildPanel','warResult','warMenu','rvResult','rvPanel','rvMenu','vsResult','menuOver','menuPause','vsMenu','menuMain'];
const nav={root:null,index:0};
function navRoot(){
  // The modal owns its native text fields and Tab/Escape handling.
  if(stage.querySelector('.coop-panel:not([hidden])'))return null;
  for(const id of NAV_ROOTS){const el=$(id);if(el&&!el.classList.contains('hidden'))return el;}return null;
}
function navItems(root){
  return [...root.querySelectorAll('button,a[href],select,input:not([type="hidden"]),[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length&&!el.closest('.hidden'));
}
function navDefault(root){
  const items=navItems(root);
  const pick=root.id==='menuMain'?(hasProgress(slotInfo(SAVE_PREFIX+'auto'))?$('btnContinue'):$('btnStart'))
    :root.id==='menuPause'?$('btnResume'):root.id==='menuOver'?$('btnRetry'):root.id==='confirmPanel'?$('confirmCancel')
    :root.id==='vsResult'?$('vsRematch'):root.id==='vsMenu'?root.querySelector('[data-vs-ai="normal"]')
    :root.querySelector('.shopItem,.saveSlot button,select')||items.find(el=>!el.classList.contains('closeX'));
  return pick&&items.includes(pick)?pick:items[0];
}
function navFocus(el,scroll=true){if(!el)return;el.focus({preventScroll:!scroll});if(scroll&&el.scrollIntoView)el.scrollIntoView({block:'nearest'});nav.index=Math.max(0,navItems(nav.root).indexOf(el));}
function navTick(){
  const root=navRoot();
  if(root!==nav.root){nav.root=root;nav.index=0;if(root){if(navItems(root).includes(document.activeElement))nav.index=navItems(root).indexOf(document.activeElement);else navFocus(navDefault(root));}return;}
  // 内容重新渲染（例如商店购买后）焦点丢失时，回到原来的位置
  if(root&&!root.contains(document.activeElement)){const items=navItems(root);if(items.length)navFocus(items[Math.min(nav.index,items.length-1)],false);}
}
function navMove(dir){
  const items=navItems(nav.root),cur=document.activeElement;if(!items.length)return;
  if(!items.includes(cur)){navFocus(items[0]);return;}
  // 先在同一行/同一列（垂直方向有重叠）里找最近的；没有再按距离+偏移加权找
  const a=cur.getBoundingClientRect(),ax=a.left+a.width/2,ay=a.top+a.height/2,horiz=dir==='left'||dir==='right';
  let bestIn=null,inScore=Infinity,bestAny=null,anyScore=Infinity;
  for(const el of items){
    if(el===cur||(el.contains(cur)&&dir!=='up')||(cur.contains(el)&&dir!=='down'))continue;
    const b=el.getBoundingClientRect(),bx=b.left+b.width/2,by=b.top+b.height/2,dx=bx-ax,dy=by-ay;
    const main=dir==='left'?-dx:dir==='right'?dx:dir==='up'?-dy:dy,side=horiz?Math.abs(dy):Math.abs(dx);
    if(main<=4)continue;
    const overlap=horiz?b.top<a.bottom-2&&b.bottom>a.top+2:b.left<a.right-2&&b.right>a.left+2;
    if(overlap&&main+side*.05<inScore){inScore=main+side*.05;bestIn=el;}
    if(main+side*2.2<anyScore){anyScore=main+side*2.2;bestAny=el;}
  }
  const best=bestIn||bestAny;
  if(best){navFocus(best);AudioSys.sfx('click');}
}
document.addEventListener('focusin',e=>{if(nav.root&&nav.root.contains(e.target)){const i=navItems(nav.root).indexOf(e.target);if(i>=0)nav.index=i;}});
window.addEventListener('keydown',e=>{
  if(bindingAction)return;
  const root=navRoot();
  if(!root&&place.kind&&e.code==='KeyK'){e.preventDefault();e.stopImmediatePropagation();cancelPlacement();Input.reset();return;}
  if(!root||(Input.isPlaying()&&root.id!=='vsPanel'))return;
  if(nav.root!==root){nav.root=root;if(navItems(root).includes(document.activeElement))nav.index=navItems(root).indexOf(document.activeElement);else navFocus(navDefault(root));}
  const t=document.activeElement,inSelect=t&&t.tagName==='SELECT';
  if(t&&t.matches('input,textarea'))return;
  const dirs={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right'};
  if(dirs[e.code]){
    if(inSelect&&['ArrowUp','ArrowDown'].includes(e.code))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(inSelect&&['KeyW','KeyS'].includes(e.code)){t.selectedIndex=clamp(t.selectedIndex+(e.code==='KeyW'?-1:1),0,t.options.length-1);t.dispatchEvent(new Event('change',{bubbles:true}));}
    else navMove(dirs[e.code]);return;
  }
  if(e.code==='KeyK'||e.code==='Escape'){
    e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;Input.reset();
    if(root.id==='confirmPanel')$('confirmCancel').click();
    else if(root.id==='warMenu')$('warBack').click();
    else if(root.id==='warResult')$('warResultBack').click();
    else if(root.id==='rvMenu')$('rvBack').click();
    else if(root.id==='rvResult')$('rvResultBack').click();
    else if(root.id==='vsPanel')versusClosePanel();
    else if(root.id==='menuPause')togglePause();
    else if(!['menuMain','menuOver'].includes(root.id))closePanels();
    return;
  }
  if(e.code==='Tab'){
    e.preventDefault();e.stopImmediatePropagation();const items=navItems(root);if(!items.length)return;
    const i=items.indexOf(t);navFocus(items[(i<0?0:i+(e.shiftKey?-1:1)+items.length)%items.length]);return;
  }
  if(['KeyJ','Enter','Space','NumpadEnter'].includes(e.code)&&t&&root.contains(t)&&!inSelect){
    e.preventDefault();e.stopImmediatePropagation();if(!e.repeat){Input.reset();t.click();}
  }
},true);

/* ================= 主循环 ================= */
let lastT=performance.now(),saveTimer=30;
// 兜底：触摸打开面板后的 0.25 秒内忽略卡片点击（关闭按钮除外），防止打开它的那次触摸“穿透”到面板里
let panelOpenedAt=-1e9;
const markPanelOpen=()=>{panelOpenedAt=performance.now()-(Input.lastTouchT||-1e9)<500?performance.now():-1e9;};
for(const id of ['shopPanel','buildPanel','tacticsPanel'])$(id).addEventListener('click',e=>{if(performance.now()-panelOpenedAt<250&&!e.target.closest('.closeX')){e.stopPropagation();e.preventDefault();}},true);
for(const button of document.querySelectorAll('[data-panel-page]'))button.onclick=()=>{
  const panel=button.closest('.panel'),header=panel.querySelector('.panelHeader,.buildHeader');
  panel.scrollTop+=Number(button.dataset.panelPage)*Math.max(80,(panel.clientHeight-(header?.offsetHeight||0))*.85);
};
for(const id of ['shopPanel','buildPanel']){
  const panel=$(id),header=panel.querySelector('.panelHeader,.buildHeader');
  const resize=()=>panel.style.setProperty('--panel-header-height',(header.offsetHeight+8)+'px');
  resize();if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe(header);
}
function openShop(){if(rvOn()){rvBreakout.panel();return;}Input.reset();markPanelOpen();shopTab='weapon';document.querySelectorAll('#shopTabs .tab').forEach(e=>e.classList.toggle('on',e.dataset.t==='weapon'));renderShop();$('shopPanel').classList.remove('hidden');panelOpen=true;AudioSys.sfx('click');if(document.pointerLockElement)document.exitPointerLock&&document.exitPointerLock();}
function openBuild(){if(rvOn()){showMsg('房车模式使用整备，沿途无固定建造');return;}cancelPlacement(true);Input.reset();markPanelOpen();renderBuild();$('buildPanel').classList.remove('hidden');panelOpen=true;AudioSys.sfx('click');if(document.pointerLockElement)document.exitPointerLock&&document.exitPointerLock();}
function loop(){
  requestAnimationFrame(loop);
  navTick();
  const now=performance.now();
  let dt=Math.min(.05,(now-lastT)/1000);lastT=now;
  rvFrameDt=dt;
  if(warOn()){
    const playing=Game.state==='battle'&&!panelOpen;
    if(Game.msgTimer>0){Game.msgTimer-=dt;if(Game.msgTimer<=0)$('msg').classList.add('hidden');}
    if(playing)updLook(dt);
    resistanceCampaign.update(dt,playing);
    frameStats(now);renderer.render(resistanceCampaign.state.scene,camera);Input.clearFrame();return;
  }
  if(vsOn()&&Game.state==='battle'&&!panelOpen){
    if(Input.pop('O'))versusTogglePanel('weapons');else if(Input.pop('L'))versusTogglePanel('build');else if(Input.pop('R'))battlefieldCommand({kind:'bfReload'});else if(Input.pop('T'))versusTogglePanel('team');
  }else if((Game.state==='prep'||Game.state==='battle')&&!panelOpen&&!zergOn()){
    if(Input.pop('O')){cancelPlacement(true);openShop();}
    else if(Input.pop('L'))openBuild();
  }else if(panelOpen&&(Input.pop('O')||Input.pop('L'))){closePanels();}
  const playing=(Game.state==='prep'||Game.state==='battle')&&!panelOpen;
  if(coopDriver?.config&&!coopDriver.connection.host){
    for(const [key,name] of [['K','jump'],['U','grenade'],['I','interact'],['H','heal']])if(Input.pop(key))coopPendingEdges.push(name);
    if(playing){updLook(dt);if(Input.pop('C'))cycleCamView();if(vsOn())versusPanelInput();for(let n=1;n<=9;n++)if(Input.pop('N'+n)&&Game.weapons[n-1])selectWeapon(Game.weapons[n-1]);if(Input.pop('X'))cycleWeapon(1);placementInput();updPlacement();updCamera(dt);updSun(camState.target);updHUD(dt);AudioSys.bgm(dt,Game.state==='battle');}
    for(const mo of monsters)visuals.animate(mo.mesh,dt,'Walk',camera);
    if(vsOn())versus.guestFrame(dt);
    for(const human of coopHumans){if(human.mesh){visuals.animate(human.mesh,dt,human.moving?'Run':'Idle',camera);human.mesh.visible=!human.dead&&!human.inVehicle&&!(human===player&&camMode==='first');}}
    updParticles(dt);updScreenFx(dt);explorationLight.update(dt,player.pos,camera,camForward(true),camMode==='first',battlefield,!player.dead);
    coopDriver.tick(now);frameStats(now);if(vsOn()&&bfAiming&&camMode==='first'){camera.fov=Game.curWeapon==='laser'?32:52;camera.updateProjectionMatrix();}renderer.render(scene,camera);Input.clearFrame();return;
  }
  if(playing&&rvOn()){
    updLook(dt);player.invulnerable=Math.max(0,player.invulnerable-dt);updPlayer(dt);
    visuals.update(dt);battlefield.update(dt,player.pos,visuals.quality);
    rvBreakout.update(dt);if(!rvBreakout.state.over){updMonsters(dt);updBullets(dt);updVehicles(dt);updPickups(dt);}
    AudioSys.bgm(dt,true);updHUD(dt);
  }
  else if(playing&&vsOn()){versusFrame(dt);}
  else if(playing){
    Game.baseAlarm=Math.max(0,(Game.baseAlarm||0)-dt);
    if(Game.rescueCooldown)for(const kind of ['squad','vehicles'])Game.rescueCooldown[kind]=Math.max(0,Game.rescueCooldown[kind]-dt);
    updLook(dt);
    placementInput();
    for(const human of coopHumans.length?coopHumans:[player])withHuman(human,()=>{
      if(human.disconnected)return;
      if(zergOn())return; // 母虫由虫族模块驱动，人类躯体本局休眠
      if(human.dead){human.respawnT-=dt;if(human.respawnT<=0){human.reset(Game.cls);human.invulnerable=3;}}
      human.invulnerable=Math.max(0,human.invulnerable-dt);
      updPlayer(dt);
    });if(player.dead)$('interactHint').classList.add('hidden');
    visuals.update(dt);
    battlefield.update(dt,player.pos,visuals.quality);
    updMonsters(dt);
    if(zergOn())zergMode.update(dt);
    updBullets(dt);
    updBuildings(dt);
    updGate(dt);
    updVehicles(dt);
    updSquad(dt);
    updPickups(dt);
    updAirdrops(dt);
    if(Game.state==='battle')updWave(dt);
    AudioSys.bgm(dt,Game.state==='battle');
    updHUD(dt);
    if(!Game.testMode&&(saveTimer-=dt)<=0){saveTimer=30;autoSave();}
  }else if(Game.state==='menu'){
    // 主菜单背景旋转镜头
    camYaw+=dt*.1;
    const cx=Math.sin(camYaw)*40,cz=-32+Math.cos(camYaw)*40;
    camera.position.set(cx,18,cz);
    camera.lookAt(0,2,-10);
    explorationLight.update(dt,player.pos,camera,camForward(true),false,battlefield,false);
    AudioSys.bgm(dt,false);
    updParticles(dt);
    $('interactHint').classList.add('hidden');
    frameStats(now);if(vsOn()&&bfAiming&&camMode==='first'){camera.fov=Game.curWeapon==='laser'?32:52;camera.updateProjectionMatrix();}renderer.render(scene,camera);
    Input.clearFrame();
    return;
  }
  if(!playing)$('interactHint').classList.add('hidden'); // 暂停/面板/结算时隐藏交互提示
  updParticles(dt);
  updDamageNumbers(playing?dt:0);updScreenFx(playing?dt:0);
  if(playing){updCamera(dt);updSun(camState.target);updPlacement();}
  explorationLight.update(dt,player.inVehicle?player.inVehicle.mesh.position:player.pos,camera,camForward(true),camMode==='first',battlefield,!player.dead);
  coopDriver?.tick(now);
  frameStats(now);if(vsOn()&&bfAiming&&camMode==='first'){camera.fov=Game.curWeapon==='laser'?32:52;camera.updateProjectionMatrix();}renderer.render(scene,camera);
  Input.clearFrame();
}
const operations=createOperations({Game,player,monsters,squad,THREE,scene,showMsg,showHint,findFreeSpot,groundY,exitVehicle,clearEntities,autoSave,closePanels,collectAllGold,startPrep,showHUD,spawnMonster,playerDamage,getYaw:()=>camYaw,canWalk:(x,z,r)=>!collideWalls(x,z,r)&&!tooSteep(x,z),
  resetCamera(){camState.init=false;},openPanel(){closePanels();Input.reset();panelOpen=true;$('operationsPanel').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock();}});
const tacticalPanel=mountTacticalPanel({Game,squad,vehicles,squadGear,squadRole,squadBehavior,setSquadTask,setSquadMemberTask,setSquadAutoDefense,openingSupply,preview:tacticalPreview,closePanels,resetInput:()=>Input.reset(),autoSave,
  operationActive:()=>operations.active,cancelPlacement:()=>cancelPlacement(true),setPanelOpen:v=>{markPanelOpen();panelOpen=v;AudioSys.pause(v||Game.state==='paused');},releasePointer:()=>{if(document.pointerLockElement)document.exitPointerLock();}});
function actionLabel(a){return (vsOn()?{R:'换弹',O:'装备',L:'部署',Z:'瞄准',H:'兵种支援',T:'战况'}[a]:null)||KEY_ACTIONS[a][0];}
function syncKeyLabels(){
  $('fullBtn').textContent=isTouch?'全屏':'全屏 F';
  $('readyBtn').textContent='✅ 准备完毕，开战！（'+keyBindings.label('R')+'）';
  $('menuButton').textContent=isTouch?'暂停':'暂停 '+keyBindings.label('P');
  $('menuButton').setAttribute('aria-label','打开游戏菜单，'+keyBindings.label('P')+' 或 Esc');
  $('weaponBar').dataset.key='';renderWeaponBar();
  const combat=CombatControls.settings;
  const combatLabel=(combat.input==='keyboard'?'纯键盘':'键鼠')+' · '+(combat.aim==='auto'?'自动瞄准':'手动瞄准')+' · '+({auto:'自动攻击',hold:'按住射击',toggle:'切换射击'})[combat.fire];
  $('keysHint').textContent=combatLabel+' · 移动 '+['up','left','down','right'].map(a=>keyBindings.label(a)).join('/')+' · '+(vsOn()?['J','R','Z','K','U','I','H','O','L','T','C','P']:['SPRINT','J','K','U','I','H','O','L','C','Q','E','P']).map(a=>keyBindings.label(a)+' '+actionLabel(a)).join(' · ');
}
function renderKeys(){
  const grid=$('keyGrid');grid.replaceChildren();
  for(const a of Object.keys(KEY_ACTIONS)){if(a==='F'&&$('fullBtn').hidden)continue;const b=document.createElement('button');b.className='mbtn';b.dataset.action=a;b.textContent=actionLabel(a)+'：'+keyBindings.label(a);
    b.onclick=()=>{Input.reset();bindingAction=a;$('keyStatus').textContent='正在修改「'+actionLabel(a)+'」：请按新键，Esc 取消';};grid.appendChild(b);}
}
function setupFeaturePanels(){
  const open=()=>{closePanels();Input.reset();panelOpen=true;$('keyPanel').classList.remove('hidden');$('keyStatus').textContent='选择要修改的动作';renderKeys();if(document.pointerLockElement)document.exitPointerLock();};
  $('keysMenu').onclick=$('keysPause').onclick=open;$('keysClose').onclick=closePanels;
  $('keysReset').onclick=()=>{bindingAction=null;keyBindings.reset();Input.reset();renderKeys();syncKeyLabels();$('keyStatus').textContent='已恢复默认键位';};
  $('menuButton').onclick=()=>pauseKey();
  $('opsButton').onclick=$('opsPause').onclick=operations.open;$('opsClose').onclick=closePanels;
  window.addEventListener('keydown',e=>{
    if(!bindingAction)return;e.preventDefault();e.stopImmediatePropagation();
    if(e.repeat)return;
    if(e.code==='Escape'){bindingAction=null;$('keyStatus').textContent='已取消改绑';return;}
    const error=keyBindings.bind(bindingAction,e.code);
    if(error){$('keyStatus').textContent=error;return;}
    bindingAction=null;Input.reset();renderKeys();syncKeyLabels();$('keyStatus').textContent='已保存，新键位立即生效';
  },true);
}
const visuals=new DarkVisuals(THREE,scene,PAL);
const explorationLight=new ExplorationLight(scene);
let battlefield;
function syncLightingLabels(){
  const label='地表：'+(battlefield.timeOfDay==='day'?'白天':'夜晚');
  $('daylightMain').textContent=$('daylightPause').textContent=label;
  const p=battlefield.current;$('environmentName').textContent=(p.id==='desert'?'荒漠':p.name)+' · '+(battlefield.timeOfDay==='day'?'白天':'夜晚')+' · '+p.chapters;
}
function setBattlefieldEnvironment(profile){
  if(!battlefield)return;
  battlefield.apply(profile);
  syncLightingLabels();
  $('testEnvironment').value=profile.id;
}
// 不用顶层 await：步步高学习平板等老内核（Chrome<89）遇到它会整份脚本解析失败，画面卡在“正在部署”。
window.__ccBooted=true; // 同步初始化已跑完：index.html 的启动看门狗据此不再提示
visuals.load().then(()=>{visualAssets=true;}).catch(error=>{
  console.error('Toy visuals:',error);$('assetLoad').textContent='场景准备失败；可重试或使用基础模型。';
  const retry=document.createElement('button');retry.textContent='重试';retry.onclick=()=>location.reload();$('assetLoad').appendChild(retry);
  const basic=document.createElement('button');basic.textContent='使用基础模型继续';basic.onclick=()=>$('assetLoad').remove();$('assetLoad').appendChild(basic);
}).then(bootGame).catch(error=>{console.error(error);if(window.__ccBootError)window.__ccBootError(error.message||'初始化失败');});
function bootGame(){
if(visualAssets)$('assetLoad').remove();
visuals.environment(terrainH);
battlefield=new BattlefieldEnvironment(scene,groundMesh,visuals.environmentObjects);
try{battlefield.setTimeOfDay(localStorage.getItem('chongchao-daylight'));}catch(_e){}
setBattlefieldEnvironment(environmentForChapter(Game.chapter));
setupVersus();
rvBreakout=createRVBreakout({THREE,scene,Game,player,WORLD,AudioSys,stage,camera,Input,visuals,monsters,CHAPTERS,spawnMonster,spawnVehicle,enterVehicle,clearEntities,closePanels,hideConfirm,askConfirm,showMsg,showHint,showHUD,updHPBar,vehicleAim,vehicleMuzzle,fireBullet,damageVehicle,playerDamage,
  isTouch:()=>isTouch,lastDt:()=>rvFrameDt,setPanel:v=>panelOpen=v,vsOn,exitVersus,clearCoop:()=>{coopDriver?.leave();clearCoopHumans();Game.coop=false;},quit:()=>$('btnQuit').click(),
  skyObjects:()=>[visuals.environmentObjects.sky,visuals.environmentObjects.stars,visuals.environmentObjects.moon].filter(Boolean),
  faceForward:()=>{setCameraView(0,false);camYaw=0;camPitch=0;camState.init=false;lookControl.clear();pitchControl.clear();}
});
player.reset('gunner');
player.mesh.visible=false; // 菜单时隐藏
resistanceCampaign=createResistanceCampaign({Game,Input,AudioSys,camera,get player(){return player;},showHUD,
  isTouch:()=>isTouch,view:()=>({yaw:camYaw,pitch:camPitch,first:camMode==='first',preset:CAMERA_VIEWS[camView]}),
  autoAim:()=>isTouch||CombatControls.autoAim,cycleView:cycleCamView,
  viewState:()=>({mode:camMode,index:camView,yaw:camYaw,pitch:camPitch}),
  firstPerson(){camMode='first';camState.init=false;Input.resetLook();syncViewLabels();},
  restoreView(v){if(!v)return;camMode=v.mode;camView=v.index;camYaw=v.yaw;camPitch=v.pitch;camState.init=false;Input.resetLook();syncViewLabels();},
  setLook(yaw,pitch){camYaw=yaw;camPitch=pitch;Input.resetLook();},
  cannonLook(){camPitch=clamp(camPitch,-.10,.50);},syncLabels:syncKeyLabels,quit:()=>$('btnQuit').click(),
  faceForward:()=>{camYaw=0;camPitch=0;camState.init=false;lookControl.clear();pitchControl.clear();Input.resetLook();},
  prepare(){if(rvOn())rvBreakout.stop();if(vsOn()||versusBackup)exitVersus();coopDriver?.leave();clearCoopHumans();Game.coop=false;closePanels();hideConfirm();cancelPlacement(true);viewModel.visible=false;}
});
zergMode=createZergMode({THREE,Game,Input,AudioSys,stage,camera,player,base,gate,buildings,squad,vehicles,
  monsters:()=>monsters,MOUTHS,CHAPTERS,spawnMonster,moveMonster,damageSquad,damageVehicle,damageBuilding,damageGate,damageBase,
  fireBullet,groundY,flyHeight,visuals,showMsg,showHint,spawnParticles,placeBuilding,spawnSquad,squadGear,clearEntities,updHPBar,baseMaxHp,
  isTouch:()=>isTouch,getCamYaw:()=>camYaw,camForward:v=>camForward(v),bumpRun:()=>{runGeneration++;}});
const _origNewGame=newGame;
newGame=function(t){if(zergOn())zergMode.stop();player.mesh.visible=true;_origNewGame(t);};
const _origLoadGame=loadGame;
loadGame=function(d){if(zergOn())zergMode.stop();player.mesh.visible=true;_origLoadGame(d);};
setupWebControls();
loop();window.__ccReady=true;
/* 页面隐藏时自动暂停并保存（手机切后台可能直接被系统关闭） */
document.addEventListener('visibilitychange',()=>{
  AudioSys.syncPause();
  if(/[?&]thumb=1(?:&|$)/.test(location.search))return;
  if(document.hidden){if(Game.state==='prep'||Game.state==='battle')togglePause();else autoSave();}
});
window.addEventListener('pagehide',()=>autoSave());
window.addEventListener('beforeunload',()=>autoSave());
}

// Shared website/Toy controls, QA-only entrypoint and performance sampling.

function frameStats(now){if(measuring&&previousFrame)frameTimes.push(now-previousFrame);previousFrame=now;}
function setupWebControls(){
  setupSandbox();setupFeaturePanels();
  $('daylightMain').onclick=$('daylightPause').onclick=()=>{
    battlefield.setTimeOfDay(battlefield.timeOfDay==='day'?'night':'day');
    try{localStorage.setItem('chongchao-daylight',battlefield.timeOfDay);}catch(_e){}
    syncLightingLabels();
  };
  const combatSection=mountCombatSettings($('keyPanel'),CombatControls,()=>{Input.reset();if(!CombatControls.mouseEnabled&&document.pointerLockElement)document.exitPointerLock();syncKeyLabels();});
  $('keyPanel').insertBefore(combatSection,$('keyStatus'));
  platformSave=setupToyPlatform({
    store:saveStore,confirm:askConfirm,updateContinue:refreshContinue,
    prefix:SAVE_PREFIX,
    getSave:()=>warOn()||rvOn()||coopDriver?.config||vsOn()||versusBackup?null:Game.state==='menu'?slotInfo(SAVE_PREFIX+'auto'):Game.testMode?null:saveData(),
    load:d=>loadGame(d),isTest:()=>warOn()||rvOn()||!!coopDriver?.config||vsOn()||Game.testMode||new URLSearchParams(location.search).has('qa'),
    open:()=>{closePanels();Input.reset();panelOpen=true;$('platformPanel').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock&&document.exitPointerLock();},close:closePanels,
    validate:d=>validateNormalSave(d,{weapons:{...WEAPONS,...LEGACY_WEAPONS},buildings:BUILDINGS,vehicles:VEHICLES})
  });
  let muted=false;
  // 画质按设备自动选择，不再提供手动切换：电脑用精致（实时阴影+天气+高分辨率），
  // 手机用流畅（关阴影、限制渲染分辨率）以避免卡顿。
  const quality=isTouch?'smooth':'high';
  const applyPixelRatio=value=>renderer.setPixelRatio(value==='high'?Math.min(stageScale*(devicePixelRatio||1),2):Math.min(stageScale,1.2));
  window.addEventListener('resize',()=>applyPixelRatio(quality));
  applyPixelRatio(quality);renderer.shadowMap.enabled=quality==='high';visuals.quality=quality;
  $('muteBtn').onclick=$('muteBtnMenu').onclick=()=>{muted=!muted;AudioSys.init();AudioSys.master.gain.value=muted?0:.5;$('muteBtn').textContent=muted?'静音 M':'声音 M';syncPauseOptions();};
  const full=$('fullBtn');
  const fullscreenAllowed=()=>!!document.documentElement.requestFullscreen&&(typeof document.fullscreenEnabled==='boolean'?document.fullscreenEnabled:document.webkitFullscreenEnabled===true);
  full.hidden=!fullscreenAllowed();
  full.onclick=async()=>{if(full.hidden)return;try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){showMsg('当前浏览器未允许全屏，可继续横屏游玩');}};
  window.addEventListener('keydown',e=>{
    if(e.repeat)return;
    if(e.code!=='Escape'&&(e.target.closest&&e.target.closest('select,input')||(!Input.isPlaying()&&['Enter','Space'].includes(e.code)&&e.target.closest&&e.target.closest('button,[tabindex="0"]'))))return;
    if(!$('confirmPanel').classList.contains('hidden')){if(e.code==='Escape')$('confirmCancel').click();return;}
    if(e.code==='Enter'&&Game.state==='menu'&&$('vsMenu').classList.contains('hidden')&&!resistanceCampaign?.menuOpen())requestNewGame();
    else if(e.code==='Enter'&&Game.state==='over'){if(warOn())resistanceCampaign.retry();else if(rvOn())rvBreakout.start();else if(vsOn())versusRematch();else restartLevel();}
    else if(keyBindings.action(e.code)==='R'&&Game.state==='prep'&&!panelOpen)startBattle();
    else if(e.code==='Escape'){e.preventDefault();pauseKey(true);}
    else if(keyBindings.action(e.code)==='T'&&Game.testMode&&Game.state!=='menu'){e.preventDefault();if(panelOpen)closePanels();else openSandbox();}
    else if(keyBindings.action(e.code)==='T'&&Game.state==='menu'){newGame(true);}
    else if(keyBindings.action(e.code)==='M')$('muteBtn').click();else if(keyBindings.action(e.code)==='F')$('fullBtn').click();
  });
  window.addEventListener('blur',()=>{Input.reset();if(['prep','battle'].includes(Game.state))togglePause();});
  syncPauseOptions();syncKeyLabels();
  setDeviceMode(deviceMode);
  if(new URLSearchParams(location.search).get('qa')==='1'){
    window.__gameQA={CAMPAIGN_DIFFICULTIES,campaignDifficulty,campaignEliteChance,campaignWaveCount,campaignSpawnInterval,baseMaxHp,AudioSys,lookControl,hiveFloor,hiveCeiling,hiveNavigation,hiveRoute,rampartHeight,rampartNavigation,RAMPARTS,mouthSpawn,navDir,moveMonster,SQUAD_ROLES,squadRole,changeSquadRole,assignSquadVehicle,boardSquadVehicle,leaveSquadVehicle,updSquadSupport,updSquadDriver,monsterTargets,buyItem,battlefield,groundMesh,environmentForChapter,classDamage,updSmartGate,setGate,CombatControls,playerAim,automaticFireTarget,operations,keyBindings,squadGear,upgradeSquad,squadMaxHp,MAX_BUILDINGS,updPickups,openShop,closePanels,WEAPONS,CHAPTERS,ELITES,BUILDINGS,ITEMS,VEHICLES,MOUTHS,HIVE,THEME,bullets,buildings,rockColliders,fortress,hive,groundY,tooSteep,slopeSpeed,interactionTarget,getCamYaw:()=>camYaw,setCamYaw:v=>{camYaw=v;},getCamMode:()=>camMode,setCamMode,collideWalls,fireBullet,updBullets,updBuildings,updPlayer,updSquad,updWave,updMonsters,updGate,updCamera,sandboxWave,loadGame,autoSave,saveData,applySave,damageGate,damageBuilding,damageSquad,damageVehicle,placeBuilding,sandboxSpawn,claimSandbox,openSandbox,saveStore,getPlatformSave:()=>platformSave,Game,player,base,gate,monsters,squad,vehicles,pickups,renderer,scene,camera,Input,newGame,requestNewGame,startBattle,startPrep,spawnMonster,spawnSquad,spawnVehicle,enterVehicle,exitVehicle,damageMonster,playerDamage,damageBase,restartLevel,clearEntities,setCameraView,visuals,weaponDps,weaponMul,upgradeWeapon,startPlacement,confirmPlacement,cancelPlacement,startDemolish,demolishTarget,findFreeSpot,spotFree,placementCheck,place,migrateWeapons,LEGACY_WEAPONS,CLASSES,renderBuild,selectWeapon,cycleWeapon,useMedkit,setSquadTask,squadBehavior,squadTaskLabel,validateNormalSave,vehicleMuzzle,vehicleAim,squadMuzzle,squadFollowPoint,squadPatrolPoint,squadAnchor,muzzleTip,updateSquadHeading,levelWin,togglePause,pauseKey,hasProgress,slotInfo,camState,dropPickup,explode,
      get resistanceCampaign(){return resistanceCampaign;},get rvBreakout(){return rvBreakout;},get versus(){return versus;},get zerg(){return zergMode;},zergOn,startVersusAI,startVersusSim,versusSimStep,exitVersus,versusTogglePanel,versusPick,versusSeatPlan,versusGive,VS_UNITS,VS_AI,VS_RULES,VS_SIZES,get coopHumans(){return coopHumans;},
      touchLayout,setDeviceMode,vehicleCanStand,queenSupply,updHUD,throwGrenade,explorationLight,tacticalWavePlan,openingSupply,tacticalPreview,tacticalPanel,setSquadMemberTask,setSquadAutoDefense,finishBattleReport,updAirdrops,updParticles,get panelOpen(){return panelOpen;},get isTouch(){return isTouch;},
      startMeasure(){frameTimes.length=0;previousFrame=0;measuring=true;},
      endMeasure(){measuring=false;const s=[...frameTimes].sort((a,b)=>a-b),sum=s.reduce((a,b)=>a+b,0);return{samples:s.length,averageFPS:1000/(sum/s.length),medianMs:s[Math.floor(s.length*.5)],p95Ms:s[Math.floor(s.length*.95)],over50ms:s.filter(v=>v>50).length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:renderer.info.memory,viewport:[innerWidth,innerHeight],dpr:renderer.getPixelRatio(),drawingBuffer:[renderer.domElement.width,renderer.domElement.height],renderer:renderer.getContext().getParameter((renderer.getContext().getExtension('WEBGL_debug_renderer_info')||{}).UNMASKED_RENDERER_WEBGL||renderer.getContext().RENDERER),quality,theme:THEME,raw:frameTimes.slice()};}
    };
  }
  window.__tbThumbAutoStart=()=>{if(Game.state==='menu')newGame(true);window.__tbThumbStateName='playing';};
}

function withHuman(human,fn){
  if(!human||human===player&&!coopDriver?.config&&!human.vsAI)return fn();
  const old=player,cls=Game.cls,weapon=Game.curWeapon,yaw=camYaw,mode=camMode,network=Input.network,weapons=Game.weapons,vs=vsOn();
  old.curWeapon=Game.curWeapon;player=human;Game.cls=human.cls||cls;Game.curWeapon=human.curWeapon||weapon;
  if(vs&&Array.isArray(human.vsWeapons))Game.weapons=human.vsWeapons; // 对战：每个英雄各买各的枪
  Input.network=human.vsAI&&vs?versus.aiHeroInput(human):coopDriver?.connection.host?coopDriver.connection.control(human.slot,human.slot===0?null:coopDriver.connection.input(human.slot),()=>computerHumanInput(human)):null;
  if(Input.network){camYaw=Input.network.yaw??human.yaw;camMode=Input.network.fp?'first':'third';}
  try{return fn();}finally{human.curWeapon=Game.curWeapon;human.moving=!!human.moveZ;if(vs){human.vsWeapons=Game.weapons;Game.weapons=weapons;}player=old;Game.cls=cls;Game.curWeapon=weapon;camYaw=yaw;camMode=mode;Input.network=network;}
}
function clearCoopHumans(){
  for(const h of coopHumans)if(h!==player&&h.mesh){visuals.release(h.mesh);scene.remove(h.mesh);}
  coopHumans=[];coopNextId=1;
}
function setupCoopHumans(config){
  clearCoopHumans();const original=player;original.slot=0;original.cls=Game.cls;original.curWeapon=Game.curWeapon;coopHumans=[original];
  const classes=['gunner','rifle','medic'];
  for(const slot of config.playerSlots.filter(n=>n!==0)){
    const cls=classes[config.playerChoices?.[slot]??slot%3]||'gunner',human={...original,slot,cls,mesh:null,bar:null,inVehicle:null,pos:new THREE.Vector3(),curWeapon:CLASSES[cls].weapon};
    withHuman(human,()=>human.reset(cls));human.pos.x+=slot*2.5;human.mesh.position.copy(human.pos);human.invulnerable=3;coopHumans.push(human);
    for(const weapon of CLASSES[cls].weapons)if(!Game.weapons.includes(weapon))Game.weapons.push(weapon);
  }
  player=coopHumans.find(h=>h.slot===config.localSlot)||original;Game.cls=player.cls;Game.curWeapon=player.curWeapon;Game.coop=true;coopEpoch++;
  if(window.__gameQA)window.__gameQA.player=player;
}
function coopId(obj){if(!obj.coopId)obj.coopId=coopNextId++;return obj.coopId;}
function joinCoopHuman(slot,choice=0){
 const existing=coopHumans.find(h=>h.slot===slot);if(existing&&!existing.disconnected)return;
 if(existing){scene.remove(existing.mesh);visuals.release(existing.mesh);coopHumans=coopHumans.filter(h=>h!==existing);}
 const anchor=coopHumans.find(h=>!h.dead&&!h.disconnected)||player,cls=['gunner','rifle','medic'][choice]||'gunner';
 const human={...anchor,slot,cls,mesh:null,bar:null,inVehicle:null,pos:new THREE.Vector3(),curWeapon:CLASSES[cls].weapon,disconnected:false};
 withHuman(human,()=>human.reset(cls));human.pos.copy(anchor.pos);human.pos.x+=slot*2.5;human.mesh.position.copy(human.pos);human.invulnerable=3;coopHumans.push(human);
 for(const weapon of CLASSES[cls].weapons)if(!Game.weapons.includes(weapon))Game.weapons.push(weapon);
}
function computerHumanInput(h){
 if(vsOn())return versus.aiHeroInput(h);
 const enemy=monsters.filter(m=>!m.dead&&m.hp>0).sort((a,b)=>a.mesh.position.distanceToSquared(h.pos)-b.mesh.position.distanceToSquared(h.pos))[0];
 const friend=coopHumans.find(p=>p!==h&&!p.dead&&!p.disconnected);
 const target=enemy?.mesh.position||friend?.pos||base.mesh?.position||h.pos,dx=target.x-h.pos.x,dz=target.z-h.pos.z,d=Math.hypot(dx,dz);
 const move=d>(enemy?14:6);
 return {x:move?dx/Math.max(1,d):0,z:move?dz/Math.max(1,d):0,yaw:Math.atan2(dx,dz),autoAim:true,autoFire:true,fire:!!enemy,edges:[],run:false};
}
function rootData(obj){
  const mesh=obj.mesh,aim={};for(const k of ['turret','gun','head','barrel']){const part=mesh.userData[k];if(part?.isObject3D)aim[k]=part.quaternion.toArray();}
  return {id:coopId(obj),s:Object.fromEntries(['kind','slot','type','hp','maxHp','dead','yaw','rotY','isWall','alt','radius','hitH','wild','fly','anim','scale','dmg','val','life','friendly','heat','moving','team','owner','vsLaneTower'].filter(k=>obj[k]!==undefined).map(k=>[k,obj[k]])),pos:mesh.position.toArray(),q:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),visible:mesh.visible,aim};
}
function applyRoot(obj,row){
  Object.assign(obj,row.s);obj.coopId=row.id;obj.mesh.position.fromArray(row.pos);obj.mesh.quaternion.fromArray(row.q);obj.mesh.scale.fromArray(row.scale);obj.mesh.visible=row.visible;
  for(const [k,q] of Object.entries(row.aim||{}))if(obj.mesh.userData[k]?.isObject3D)obj.mesh.userData[k].quaternion.fromArray(q);
  if(obj.bar&&Number.isFinite(obj.hp))updHPBar(obj.bar,obj.hp/obj.maxHp);
}
function starshipInput(){
  const axis=Input.axis(),cs=Math.cos(camYaw),sn=Math.sin(camYaw),f=-axis.y,r=axis.x,edges=[];
  edges.push(...coopPendingEdges.splice(0));
  return {x:f*sn-r*cs,z:f*cs+r*sn,edges,yaw:camYaw,fp:camMode==='first',run:!!Input.keys.SPRINT,rise:!!(Input.keys.K||Input.keys.Y),lower:!!Input.keys.H,
    fire:isTouch?!!Input.keys.J:CombatControls.firing(true),autoFire:!isTouch&&CombatControls.settings.fire==='auto',autoAim:isTouch||CombatControls.settings.aim==='auto'};
}
function starshipSnapshot(){
  player.curWeapon=Game.curWeapon;
  return {epoch:coopEpoch,g:{...scalarState(Game,['cls','curWeapon']),wave:Game.wave,weapons:Game.weapons,weaponLv:Game.weaponLv,items:Game.items,vehiclesOwned:Game.vehiclesOwned,squadGear:Game.squadGear,hive:Game.hive,opsCompleted:Game.opsCompleted,lastBattle:Game.lastBattle,squadCount:Game.squadCount},
    humans:coopHumans.map(h=>({...rootData(h),s:{...scalarState(h),cls:h.cls,curWeapon:h.curWeapon},p:h.pos.toArray(),vehicle:h.inVehicle?coopId(h.inVehicle):null})),
    monsters:monsters.map(m=>({...rootData(m),chapter:CHAPTERS.indexOf(m.ch),elite:!!m.elite})),buildings:buildings.map(rootData),vehicles:vehicles.map(rootData),squad:squad.map(s=>({...rootData(s),vehicle:s.vehicle?coopId(s.vehicle):null})),airdrops:airdrops.map(a=>({...rootData(a),it:a.it})),
    bullets:bullets.map(rootData),pickups:pickups.map(rootData),base:{hp:base.hp,maxHp:base.maxHp},gate:{hp:gate.hp,maxHp:gate.maxHp,open:gate.open,dead:gate.dead},
    panel:panelOpen,over:!$('menuOver').classList.contains('hidden'),vs:vsOn()?versus.snapshot():null};
}
// 对战人多时压缩快照：英雄、设施、子弹的数字保留 3 位小数（原来是完整浮点），房主上传和服务器转发都省流量。
function trimNumbers(v){if(typeof v==='number')return Number.isInteger(v)?v:Math.round(v*1000)/1000;if(Array.isArray(v))return v.map(trimNumbers);if(v&&typeof v==='object'){const o={};for(const k in v)o[k]=trimNumbers(v[k]);return o;}return v;}
// 对战里客人只需要画英雄：字段按白名单留（单机/合作的完整字段不变）。
const VS_HERO_FIELDS=['hp','maxHp','dead','yaw','inVehicle','respawnT','invulnerable','shield','heat','moving','sprinting','slot','cls','curWeapon','team','vsPid','vsName','vsAI','vsDeaths','grenadeCd','disconnected','onGround'];
function starshipState(){
  const s=starshipSnapshot();if(!vsOn())return s;
  for(const k of ['humans','buildings','bullets'])s[k]=trimNumbers(s[k]);
  s.humans=s.humans.map(h=>({...h,s:Object.fromEntries(VS_HERO_FIELDS.filter(k=>k in h.s).map(k=>[k,h.s[k]]))}));
  return s;
}
function syncRows(list,rows,factory){
  const wanted=new Set(rows.map(r=>r.id));
  for(const obj of list.slice())if(!wanted.has(obj.coopId)){scene.remove(obj.mesh);visuals.release(obj.mesh);list.splice(list.indexOf(obj),1);}
  for(const row of rows){let obj=list.find(o=>o.coopId===row.id);if(!obj){obj=factory(row);if(!obj)continue;if(!list.includes(obj))list.push(obj);}applyRoot(obj,row);}
}
function starshipApply(data){
  if(!data?.g)return;
  if(data.epoch!==coopEpoch){coopEpoch=data.epoch;clearEntities(true);}
  const previous=Game.state;Object.assign(Game,data.g);
  syncRows(buildings,data.buildings,r=>placeBuilding(r.s.kind,r.pos[0],r.pos[2],r.s.yaw,r.s.hp));
  syncRows(vehicles,data.vehicles,r=>spawnVehicle(r.s.kind));
  syncRows(monsters,data.monsters,r=>spawnMonster(r.s.kind,r.pos[0],r.pos[2],{ch:CHAPTERS[r.chapter],elite:r.elite,quiet:true}));
  syncRows(squad,data.squad,r=>spawnSquad(r.s.slot));
  syncRows(bullets,data.bullets,r=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(.12,6,4),new THREE.MeshBasicMaterial({color:r.s.friendly?0xffd066:0xff8844}));scene.add(mesh);return {mesh};});
  syncRows(pickups,data.pickups,r=>{dropPickup(new THREE.Vector3().fromArray(r.pos),r.s.type,r.s.val);return pickups.at(-1);});
  syncRows(airdrops,data.airdrops||[],r=>{const mesh=new THREE.Group();mesh.add(new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2),new THREE.MeshLambertMaterial({color:0xcc8833})));const chute=new THREE.Mesh(new THREE.SphereGeometry(1.6,8,6,0,TAU,0,Math.PI/2),new THREE.MeshLambertMaterial({color:0xff5544,side:THREE.DoubleSide}));chute.position.y=2.4;mesh.add(chute);scene.add(mesh);return {mesh,chute,it:r.it};});
  if(data.vs?.roster)versusSyncRoster(data.vs);
  for(const row of data.humans){const h=coopHumans.find(h=>h.slot===row.s.slot);if(!h)continue;applyRoot(h,row);Object.assign(h,row.s);h.pos.fromArray(row.p);h.inVehicle=vehicles.find(v=>v.coopId===row.vehicle)||null;}
  if(data.vs)versus.apply(data.vs);
  Game.cls=player.cls;Game.curWeapon=player.curWeapon;Object.assign(base,data.base);Object.assign(gate,data.gate);updHPBar(base.bar,base.hp/base.maxHp);updHPBar(gate.bar,gate.hp/gate.maxHp);updGate(0);
  $('menuPause').classList.toggle('hidden',Game.state!=='paused');$('menuOver').classList.toggle('hidden',!data.over);$('readyBtn').classList.toggle('hidden',Game.state!=='prep');
  if(previous!==Game.state){Input.reset();AudioSys.pause(Game.state==='paused');}
  if(panelOpen&&!$('shopPanel').classList.contains('hidden'))renderShop();
}
function coopCommand(command){
 if(!coopDriver?.config||coopDriver.connection.host||coopDriver.applying)return false;
 coopDriver.connection.send({type:'command',command});showMsg('请求已发送，按共享资源核验后执行',1.2);return true;
}
function handleCoopCommand(slot,c){
 if(!c||!['prep','battle'].includes(Game.state))return;
 const human=coopHumans.find(h=>h.slot===slot&&!h.disconnected);if(!human)return;
 if(vsOn()){withHuman(human,()=>versus.handleCommand(human,c));return;}
 withHuman(human,()=>{
  if(c.kind==='weapon'&&Game.weapons.includes(c.id))selectWeapon(c.id,true);
  else if(c.kind==='battle'&&Game.state==='prep')startBattle();
  else if(c.kind==='order')setSquadTask(c.task);
  else if(c.kind==='memberOrder')setSquadMemberTask(c.slot,c.task);
  else if(c.kind==='autoDefense')setSquadAutoDefense(c.enabled===true);
  else if(c.kind==='squadRole'&&Number.isInteger(c.slot))changeSquadRole(c.slot,c.role);
  else if(c.kind==='squadVehicle'&&Number.isInteger(c.slot))assignSquadVehicle(c.slot,c.id);
  else if(c.kind==='squadUpgrade'&&Number.isInteger(c.slot))upgradeSquad(c.slot,c.gear);
  else if(c.kind==='buy'&&Object.hasOwn(SHOP,c.type)){
   const item=SHOP[c.type].find(it=>it.id===c.id);if(!item)return;
   const cfg=c.type==='weapon'?WEAPONS[c.id]:c.type==='item'?ITEMS[c.id]:c.type==='vehicle'?VEHICLES[c.id]:null;
   const price=c.type==='squad'?squadPrice(c.id):cfg.price;
   const owned=c.type==='weapon'?Game.weapons.includes(c.id):c.type==='vehicle'?Game.vehiclesOwned.includes(c.id):c.type==='squad'?Game.squadCount>=squadLimit():(c.id==='magnet'&&Game.magnet)||(c.id==='regen'&&Game.regen);
   buyItem({...item,coopSlot:slot},price,owned);
  }else if(c.kind==='upgrade'&&Game.weapons.includes(c.id))upgradeWeapon(c.id);
  else if(c.kind==='repair'&&Game.vehiclesOwned.includes(c.id)&&!vehicles.some(v=>v.kind===c.id))repairNow(c.id);
  else if(c.kind==='build'&&Object.hasOwn(BUILDINGS,c.id)&&[c.x,c.z,c.yaw].every(Number.isFinite)&&Math.hypot(c.x-human.pos.x,c.z-human.pos.z)<7&&!placementCheck(c.id,c.x,c.z,c.yaw)){
   if(Game.gold<BUILDINGS[c.id].price)return;spendGold(BUILDINGS[c.id].price);placeBuilding(c.id,c.x,c.z,c.yaw);
  }else if(c.kind==='demolish'){
   const bd=buildings.find(b=>b.coopId===c.id);if(bd&&Math.hypot(bd.mesh.position.x-human.pos.x,bd.mesh.position.z-human.pos.z)<16){Game.gold+=demolishRefund(bd);scene.remove(bd.mesh);buildings.splice(buildings.indexOf(bd),1);}
  }
 });
}
/* ================= 虫潮对战（1 对 1 到 4 对 4）：开局、座位、面板、HUD、结算、联机房间 =================
   玩法规则在 versus.js；这里只负责把对战接到现有英雄操作、建造、联机和界面上。
   每队 size 个座位、每个座位一名英雄：本机玩家、联机真人（slot=房间槽位）或电脑（slot=100+座位序号）。
   对战期间不读写单机存档，退出时把战役状态原样恢复。 */
const vsUI={open:false,tab:'units',t:0,built:'',size:1,rosterSig:''};
const VS_RECORD='chongchao-conquest-record-v1';
const VS_CLASSES=['gunner','rifle','medic'];
function versusRecord(){try{return JSON.parse(localStorage.getItem(VS_RECORD)||'{}')||{};}catch(_e){return {};}}
const versusRecordKey=(k,n)=>n>1?k+'-'+n:k; // 1 对 1 沿用原来的键，多人对战按规模分开记
function setupVersus(){
  const campaignWeapons={...WEAPONS},campaignVehicles={...VEHICLES};
  versus=createVersus({THREE,scene,camera,visuals,fortress,buildings,bullets,vehicles,WEAPONS,BUILDINGS,CLASSES,WORLD,AudioSys,spawnVehicle,vehicleAim,vehicleMuzzle,shotCover,
    setBattlefieldAssets:active=>{for(const k of Object.keys(WEAPONS))delete WEAPONS[k];Object.assign(WEAPONS,active?BF_WEAPONS:campaignWeapons);for(const k of Object.keys(VEHICLES))delete VEHICLES[k];Object.assign(VEHICLES,active?BF_VEHICLES:campaignVehicles);viewModelKey='';},
    setMilitaryHero:(h,team,id)=>{if(h.mesh?.userData.bfWeapon===id&&h.mesh?.userData.bfTeam===team)return;const old=h.mesh,mesh=militarySoldier(THREE,team,id);mesh.userData.bfWeapon=id;mesh.userData.bfTeam=team;mesh.rotation.order='YXZ';if(old){mesh.position.copy(old.position);mesh.quaternion.copy(old.quaternion);mesh.visible=old.visible;if(h.bar)old.remove(h.bar);if(h.muzzle)old.remove(h.muzzle);scene.remove(old);visuals.release(old);}if(h.bar)mesh.add(h.bar);if(h.muzzle)mesh.add(h.muzzle);h.mesh=mesh;markTree(mesh);scene.add(mesh);},
    makeVehicleMesh,makeSoldier,placeBuilding,makeHPBar,updHPBar,spawnParticles,fireBullet,zapLine,segmentHit,collideWalls,showMsg,playerDamage,withHuman,
    groundY:(x,z)=>z>760?0:groundY(x,z), // 对战场地在 z≈900 一带，地形高度全为 0（已逐点采样核对）；省掉每个单位每帧算一次虫巢地形
    getPlayer:()=>player,getHumans:()=>coopHumans.length?coopHumans:[player],
    paintGround:m=>paintBattlefieldGround(m,environmentForChapter(1)),
    keepObjects:()=>[camera,visuals.environmentObjects.sky,visuals.environmentObjects.stars,visuals.environmentObjects.moon,...(coopHumans.length?coopHumans:[player]).map(h=>h.mesh)].filter(Boolean),
    skyObjects:()=>[visuals.environmentObjects.sky,visuals.environmentObjects.stars,visuals.environmentObjects.moon].filter(Boolean),
    faceTeam:team=>{camYaw=team==='blue'?0:Math.PI;camPitch=0;camState.init=false;},
    recolorBar:(h,team)=>{if(!h.mesh)return;if(h.bar)h.mesh.remove(h.bar);h.bar=makeHPBar(1.8,team===versus.state.localTeam?'#3f6':TEAM_CSS[team]);h.bar.position.y=3;h.mesh.add(h.bar);updHPBar(h.bar,h.hp/h.maxHp);},
    recolorBuildingBar:(bd,color)=>{if(bd.bar)bd.mesh.remove(bd.bar);bd.bar=makeHPBar(bd.isWall?4:2.6,color);bd.bar.position.y=bd.isWall?COVER_HEIGHT+.35:3.6;bd.mesh.add(bd.bar);updHPBar(bd.bar,bd.hp/bd.maxHp);},
    setLocalWeapons:list=>{Game.weapons=list;if(!list.includes(Game.curWeapon))Game.curWeapon=list[0]||'lmg';},
    // 换枪要写到当前生效的位置：该英雄正在 withHuman 里（或就是本机玩家）时 Game.curWeapon 才是它的枪，
    // 只改 h.curWeapon 会在 withHuman 收尾时被旧值覆盖。
    equipHero:(h,id)=>{h.curWeapon=id;if(h===player){Game.curWeapon=id;if(h.vsWeapons)Game.weapons=h.vsWeapons;}},
    onEnd:res=>versusEnded(res),
    onGuestMatch:data=>{if(coopDriver?.config?.mode==='versus')startVersusOnline(coopDriver.config,data.m);},
  });
  $('btnVersus').onclick=()=>{AudioSys.init();renderVersusSize();$('menuMain').classList.add('hidden');$('vsMenu').classList.remove('hidden');};
  $('vsMenuBack').onclick=()=>{$('vsMenu').classList.add('hidden');$('menuMain').classList.remove('hidden');};
  document.querySelectorAll('[data-vs-ai]').forEach(b=>b.onclick=()=>startVersusAI(b.dataset.vsAi,vsUI.size));
  document.querySelectorAll('[data-vs-size]').forEach(b=>b.onclick=()=>{vsUI.size=+b.dataset.vsSize;renderVersusSize();AudioSys.sfx('click');});
  $('vsOnline').onclick=()=>{
    if(!coopDriver){showMsg('联机服务还在连接，请稍后再试',1.6);return;}
    lobbyMode='versus';syncLobbyMode();$('vsMenu').classList.add('hidden');$('menuMain').classList.remove('hidden');coopDriver.lobby.open();
    coopDriver.lobby.status('对战房间：选好对战规模和队伍，填好昵称后点「创建房间」，再「复制邀请链接」发给朋友；空位由电脑补上');
  };
  $('vsRematch').onclick=()=>versusRematch();
  $('vsToMenu').onclick=()=>$('btnQuit').click();
  $('vsClose').onclick=()=>versusClosePanel();
  document.querySelectorAll('[data-vspage]').forEach(b=>b.onclick=()=>{
    const grid=$('vsGrid');grid.scrollTop+=Number(b.dataset.vspage)*Math.max(60,grid.clientHeight*.85);
  });
  $('vsSurrender').onclick=()=>{
    if(versus.state.time<VS_RULES.surrenderAfter){showMsg(fmtTime(VS_RULES.surrenderAfter)+' 后才能投降',1.6);return;}
    askConfirm(versus.size>1?'发起投降？本队真人都点了投降才会判负。':'确定投降？本局直接判负。','投降',()=>{
      if(versusGuest()){versusSendCommand({kind:'vsSurrender'});if(versus.size>1)showMsg('已发起投降，等队友同意',2);}
      else{const r=versus.surrender(player.vsPid);if(r)showMsg(r,2.2);}
      if(Game.state==='paused')togglePause();});
  };
  document.querySelectorAll('[data-vstab]').forEach(b=>b.onclick=()=>{vsUI.tab=b.dataset.vstab;renderVersusPanel(true);});
  document.querySelectorAll('[data-vslane]').forEach(b=>b.onclick=()=>versusSetLane(b.dataset.vslane));
}
function renderVersusSize(){
  const n=vsUI.size;
  document.querySelectorAll('[data-vs-size]').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.vsSize===n?'true':'false'));
  $('vsMenuTitle').textContent='⚑ 战地模式 · 沙漠据点战';
  $('vsSizeNote').textContent='每队 '+n+' 个玩家/电脑座位，另有 8 名步兵增援与 4 类载具。空位由电脑补充，双方固定装备与生命。';
  renderVersusRecord();
}
function versusGuest(){return !!(coopDriver?.config&&!coopDriver.connection.host);}
function versusSendCommand(command){if(coopDriver?.config)coopDriver.connection.send({type:'command',command});}
// 联机大厅：对战房间把「人数」换成「对战规模」，并加「队伍」「电脑补位难度」；合作房间恢复原样。
function syncLobbyMode(){
  const lobby=coopDriver?.lobby;if(!lobby)return;const cap=lobby.field('capacity');if(!cap)return;
  if(!lobby.vsFields){
    const grid=lobby.panel.querySelector('.coop-grid'),make=(label,field,options,value)=>{
      const l=document.createElement('label');l.textContent=label;const s=document.createElement('select');s.dataset.field=field;
      for(const [v,t] of options){const o=document.createElement('option');o.value=v;o.textContent=t;s.append(o);}s.value=value;l.append(s);grid.append(l);return {label:l,select:s};};
    const team=make('队伍','vsTeam',[['auto','自动分队'],['blue','蓝方'],['red','红方']],'auto');
    const diff=make('电脑补位难度','vsDiff',[['easy','简单'],['normal','普通'],['hard','困难']],'normal');
    // 开局前改队伍：房主随时可改，客人在准备前可改（准备时也会带上）
    const pick=()=>{const c=lobby.connection,me=c.room?.players.find(p=>p.slot===c.slot);if(c.room&&!c.room.started&&(c.host||!me?.ready))c.send({type:'pick',team:team.select.value,hero:lobby.getConfig().hero||0});};
    team.select.addEventListener('change',pick);lobby.field('hero')?.addEventListener('change',()=>{if(lobbyMode==='versus')pick();});
    lobby.vsFields={team,diff,coopCap:[...cap.options].map(o=>[o.value,o.textContent]),capText:cap.parentElement.firstChild,mode:'coop',last:{}};
  }
  const f=lobby.vsFields,vs=lobbyMode==='versus',want=vs?[['2','1 对 1'],['4','2 对 2（最多 4 人）'],['6','3 对 3（最多 6 人）'],['8','4 对 4（最多 8 人）']]:f.coopCap;
  // 两种模式各记各的选择：第一次进对战默认 1 对 1，合作默认最大人数
  if(f.mode!==lobbyMode){if(f.mode)f.last[f.mode]=cap.value;f.mode=lobbyMode;
    cap.replaceChildren(...want.map(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;return o;}));
    const keep=f.last[lobbyMode];cap.value=want.some(o=>o[0]===keep)?keep:want[vs?0:want.length-1][0];}
  cap.disabled=false;f.capText.nodeValue=vs?'对战规模':'人数';
  f.team.label.hidden=!vs;f.diff.label.hidden=!vs;
  const startBtn=lobby.panel.querySelector('[data-do="start"]');if(startBtn)startBtn.textContent=vs?'开始对战':'开始合作';
}
function versusLobbyConfig(){
  const lobby=coopDriver?.lobby,cap=lobby?.field('capacity'),f=lobby?.vsFields;
  return {size:Math.max(1,Math.min(4,Math.round((+cap?.value||2)/2))),team:f?.team.select.value||'auto',diff:f?.diff.select.value||'normal'};
}
function renderVersusRecord(){
  const r=versusRecord(),n=vsUI.size,t=['easy','normal','hard'].map(k=>{const x=r[versusRecordKey(k,n)];return VS_AI[k].name+' '+(x?.w||0)+' 胜 '+(x?.l||0)+' 负';}).join(' · ');
  $('vsRecordTxt').textContent='本机对战电脑战绩（'+n+' 对 '+n+'）：'+t;
}
function versusPrepare(){
  if(!versusBackup)versusBackup=JSON.parse(JSON.stringify(Game));
  closePanels();hideConfirm();cancelPlacement(true);versusClosePanel();
  AudioSys.pause(false);lookControl.clear();pitchControl.clear();delete player.lookHeading;
  runGeneration++;
  if(vsOn())versus.stop(true);
  Object.assign(Game,{testMode:false,state:'battle',loop:1,chapter:1,level:1,items:{medkit:0},hpBonus:0,weaponLv:{},vehiclesOwned:[],squadCount:0,squadGear:[],magnet:false,regen:false,score:0,gold:0});
  clearEntities(true);vsUI.rosterSig='';
  for(const id of ['menuMain','menuPause','menuOver','vsMenu','vsResult'])$(id).classList.add('hidden');
}
function makeVersusHero(slot,cls){
  const human={...player,slot,cls,mesh:null,bar:null,inVehicle:null,pos:new THREE.Vector3(),curWeapon:CLASSES[cls].weapon,vsWeapons:[...CLASSES[cls].weapons],disconnected:false,dead:false,vsAI:false,team:null};
  withHuman(human,()=>human.reset(cls));human.invulnerable=0;return human;
}
function versusLocalSetup(){
  clearCoopHumans();
  player.reset(Game.cls);player.mesh.visible=true;restoreView();
  Object.assign(player,{slot:0,cls:Game.cls,vsAI:false,disconnected:false,team:'blue',vsPid:'blue0',vsName:'',vsWeapons:[...CLASSES[Game.cls].weapons]});
  Game.weapons=player.vsWeapons;Game.curWeapon=CLASSES[Game.cls].weapon;Game.coop=false;
}
// 分座位：先按各自选的队伍（满了就去另一队），「自动分队」补人少的一队；每队按加入顺序坐 0 号、1 号……空座位给电脑。
// 房主和客人用同一份开局配置算出同样的结果；之后以房主快照里的名单为准。
function versusSeatPlan(config){
  const n=VS_SIZES.includes(config.size)?config.size:1,slots=[...(config.playerSlots||[0])].sort((a,b)=>a-b).slice(0,2*n),pref=config.playerTeams||{},teamOf={},cnt={blue:0,red:0};
  for(const s of slots){const p=pref[s];if((p==='blue'||p==='red')&&cnt[p]<n){teamOf[s]=p;cnt[p]++;}}
  for(const s of slots)if(!teamOf[s]){let t=cnt.blue<=cnt.red?'blue':'red';if(cnt[t]>=n)t=t==='blue'?'red':'blue';teamOf[s]=t;cnt[t]++;}
  const plan=[];
  for(const team of ['blue','red']){const mine=slots.filter(s=>teamOf[s]===team);
    for(let i=0;i<n;i++){const slot=mine[i],order=(team==='blue'?0:n)+i,bot=slot==null;
      plan.push({pid:team+i,team,idx:i,slot:bot?100+order:slot,bot,cls:bot?VS_CLASSES[order%3]:VS_CLASSES[config.playerChoices?.[slot]??0]||'gunner'});}}
  return plan;
}
// 按座位建英雄：本机座位用原来的玩家对象，其余新建。
function versusBuildHeroes(plan,localSlot,names={}){
  clearCoopHumans();const list=[];
  for(const seat of plan){
    const h=seat.slot===localSlot?player:makeVersusHero(seat.slot,seat.cls);
    Object.assign(h,{slot:seat.slot,vsPid:seat.pid,team:seat.team,vsAI:seat.bot,vsName:seat.bot?'电脑':(names[seat.slot]||''),disconnected:false});
    h.vsWeapons=[...CLASSES[h.cls||'gunner'].weapons];list.push(h);
  }
  coopHumans=list;
}
function startVersusAI(difficulty='normal',size=vsUI.size){
  versusPrepare();versusLocalSetup();
  const n=VS_SIZES.includes(size)?size:1,plan=versusSeatPlan({size:n,playerSlots:[0],playerTeams:{0:'blue'},playerChoices:{0:VS_CLASSES.indexOf(Game.cls)}});
  for(const s of plan)if(s.bot)s.cls=VS_CLASSES[Math.floor(Math.random()*3)];
  versusBuildHeroes(plan,0);
  versus.start({mode:'ai',role:'local',difficulty,size:n,seats:plan.map(s=>({pid:s.pid,ai:s.bot?difficulty:null,name:s.bot?'电脑':''})),localTeam:'blue'});
  versusEnterUI();
}
// QA：双方都由电脑指挥和操作英雄，配合 versusSimStep 加速跑完整局，用来调平衡。
function startVersusSim(blue='normal',red='normal',size=1){
  versusPrepare();versusLocalSetup();
  const n=VS_SIZES.includes(size)?size:1,plan=versusSeatPlan({size:n,playerSlots:[0],playerTeams:{0:'blue'}});
  for(const s of plan)if(s.bot)s.cls='gunner';
  versusBuildHeroes(plan,0);player.vsAI=true;
  versus.start({mode:'sim',role:'local',sim:true,difficulty:red,size:n,seats:plan.map(s=>({pid:s.pid,ai:s.team==='blue'?blue:red,name:'电脑'})),localTeam:'blue'});
  versusEnterUI();
}
function startVersusOnline(config,matchId){
  versusPrepare();
  const local=config.localSlot??coopDriver?.connection.slot??0,plan=versusSeatPlan(config),mine=plan.find(s=>s.slot===local)||plan[0],diff=config.diff||'normal';
  Game.cls=mine.cls;player.reset(Game.cls);player.mesh.visible=true;restoreView();player.cls=Game.cls;
  const names={};for(const p of coopDriver?.connection.room?.players||[])names[p.slot]=p.name;
  versusBuildHeroes(plan,local,names);
  Game.weapons=player.vsWeapons;Game.curWeapon=CLASSES[player.cls].weapon;Game.cls=player.cls;Game.coop=true;
  const host=coopDriver?.connection.host;
  versus.start({mode:'online',role:host?'host':'guest',difficulty:diff,size:plan.length/2,seats:plan.map(s=>({pid:s.pid,ai:s.bot?diff:null,name:s.bot?'电脑':names[s.slot]||''})),localTeam:player.team,matchId:host?undefined:(matchId??null)});
  versusEnterUI();
}
// 客人：按房主快照里的名单对齐英雄（中途加入、电脑座位换成真人时名单会变）。
function versusSyncRoster(vs){
  const rows=vs.roster;if(!vsOn()||!Array.isArray(rows))return;
  const sig=rows.map(r=>r.join(':')).join('|');if(sig===vsUI.rosterSig)return;vsUI.rosterSig=sig;
  const localSlot=coopDriver?.connection.slot,keep=[];
  for(const [slot,pid,cls,bot,name] of rows){
    let h=coopHumans.find(x=>x.vsPid===pid);
    if(!h||(h.cls!==cls&&h!==player&&slot!==localSlot)){if(h){scene.remove(h.mesh);visuals.release(h.mesh);}h=slot===localSlot?player:makeVersusHero(slot,cls);}
    Object.assign(h,{slot,vsPid:pid,vsAI:!!bot,vsName:name,disconnected:false});keep.push(h);
  }
  for(const h of coopHumans)if(!keep.includes(h)&&h!==player&&h.mesh){scene.remove(h.mesh);visuals.release(h.mesh);}
  coopHumans=keep;
  const me=coopHumans.find(h=>h.slot===localSlot);
  if(me&&me!==player){player=me;Game.cls=me.cls;Game.curWeapon=me.curWeapon||CLASSES[me.cls].weapon;Game.weapons=me.vsWeapons||[...CLASSES[me.cls].weapons];if(window.__gameQA)window.__gameQA.player=player;}
  versus.setLocal(player);
  for(const h of coopHumans){const seat=versus.seat(h.vsPid);if(seat&&h.team!==seat.team)versus.setupHero(h,seat.team);}
  $('vsTeamTab').classList.remove('hidden');
}
function versusPlayerLeft(slot){
  const h=coopHumans.find(x=>x.slot===slot);if(!h||!h.team)return;
  h.vsAI=true;h.disconnected=false;versus.setAI(h.vsPid,'normal');
  const who=(h.vsName||'玩家')+'已离线：电脑接管'+(h.team===player.team?(versus.size>1?'这名队友':'己方'):(versus.size>1?'这名对手':'对手'));
  setTimeout(()=>showMsg(who+'（指挥与英雄），本局继续',3.2),80); // 排在大厅的通用离线提示之后
}
// 房主：有人回来就交还原座位；新玩家接手一个电脑座位（优先他选的队伍，其次真人少的一队），兵种、部署点与战绩保留。
function versusPlayerJoined(m){
  const h=coopHumans.find(x=>x.slot===m.slot);
  if(h){h.vsAI=false;h.disconnected=false;if(m.name)h.vsName=m.name;versus.clearAI(h.vsPid);showMsg((h.vsName||'玩家')+'回来了，恢复真人操作',2);return;}
  const bots=coopHumans.filter(x=>x.slot>=100),people=t=>coopHumans.filter(x=>x.team===t&&x.slot<100).length;
  const pick=bots.find(x=>x.team===m.team)||bots.sort((a,b)=>people(a.team)-people(b.team))[0];
  if(!pick)return;
  pick.slot=m.slot;pick.vsAI=false;pick.vsName=m.name||'';versus.clearAI(pick.vsPid);
  showMsg((m.name||'新玩家')+'加入'+TEAM_NAME[pick.team]+'，接手了电脑的座位',2.6);
}
function exitVersus(){
  if(vsOn())versus.stop(true);
  clearEntities(true);versusLeaveUI();
  for(const h of coopHumans.length?coopHumans:[player]){delete h.vsAI;delete h.vsWeapons;delete h.team;delete h.vsPid;delete h.vsName;}
  delete player.vsAI;delete player.team;delete player.vsPid;delete player.vsName;
  if(versusBackup){const b=versusBackup;versusBackup=null;for(const k of Object.keys(Game))if(!(k in b))delete Game[k];Object.assign(Game,b);}
  Game.state='menu';
}
function versusEnterUI(){
  bfAiming=false;$('vZ').classList.remove('aiming');$('vZ').setAttribute('aria-pressed','false');
  stage.classList.add('versus-mode');$('hud').classList.add('versus');
  showHUD();$('readyBtn').classList.add('hidden');$('sandboxBtn').classList.add('hidden');showHint(null);
  vsUI.open=false;vsUI.tab='units';$('vsPanel').classList.add('hidden');$('vsTeamTab').classList.remove('hidden');
  const hint=$('keysHint');if(!hint.dataset.campaign)hint.dataset.campaign=hint.textContent;
  hint.textContent='WASD移动 · J/左键射击 · R换弹 · O装备 · L部署 · T战况 · Z瞄准 · H兵种支援 · I上/下载具 · U手雷 · K跳跃 · C切换视角 · Q/E转视角 · Esc暂停';
  const rl=$('btnRestartLv');if(!rl.dataset.campaign)rl.dataset.campaign=rl.textContent;rl.textContent='🔄 重开对战';
  $('vH').classList.remove('hidden');$('vO').textContent='装备';$('vL').textContent='部署';$('vR').textContent='换弹';
}
function versusLeaveUI(){
  bfAiming=false;stage.classList.remove('versus-mode');$('hud').classList.remove('versus');$('vsPanel').classList.add('hidden');$('vsResult').classList.add('hidden');vsUI.open=false;
  const hint=$('keysHint');if(hint.dataset.campaign)hint.textContent=hint.dataset.campaign;
  const rl=$('btnRestartLv');if(rl.dataset.campaign)rl.textContent=rl.dataset.campaign;
  $('vH').classList.remove('hidden');$('vO').textContent='商店';$('vL').textContent='建造';$('vR').textContent='开战';
}
// 房主/单机每帧：玩家 → 步兵、载具、据点 → 子弹。本机玩家最后更新，界面提示不被其他英雄覆盖。
function versusHeroes(dt){
  const list=coopHumans.length?coopHumans:[player],order=versus.state.frame%2?[...list].reverse():list;
  for(const human of order)withHuman(human,()=>{
    if(human.disconnected)return;
    if(human.dead){human.respawnT-=dt;if(human.respawnT<=0){human.reset(Game.cls);human.invulnerable=3;versus.respawned(human);}return;}
    human.invulnerable=Math.max(0,human.invulnerable-dt);
    updPlayer(dt);
  });
}
function versusFrame(dt){
  updLook(dt);placementInput();versusPanelInput();
  versusHeroes(dt);if(player.dead)$('interactHint').classList.add('hidden');
  visuals.update(dt);
  versus.update(dt);updBullets(dt);
  AudioSys.bgm(dt,true);updHUD(dt);
}
function versusSimStep(dt=.05){versusHeroes(dt);versus.update(dt);updBullets(dt);updParticles(dt);return versus.state.over;}
/* ---------- 战地部署、兵种和装备 ---------- */
function battlefieldCommand(command){
  if(!vsOn())return;
  if(versusGuest())versusSendCommand(command);else versus.handleCommand(player,command);
}
function versusTogglePanel(tab){
  if(vsUI.open&&vsUI.tab===tab){versusClosePanel();return;}
  Input.reset();vsUI.open=true;vsUI.tab=tab;$('vsPanel').classList.remove('hidden');
  if(document.pointerLockElement)document.exitPointerLock();
  renderVersusPanel(true);AudioSys.sfx('click');
}
function versusClosePanel(){vsUI.open=false;$('vsPanel').classList.add('hidden');Input.reset();}
const mySeat=()=>versus.seatOf(player)||versus.seat(versus.state.localPid);
function versusCards(){
  const s=mySeat();if(!s)return [];
  if(vsUI.tab==='units')return Object.entries(versus.kits).map(([id,k],i)=>({key:String(i+1),name:k.name,desc:k.desc,state:s.kit===id?'当前兵种':s.pendingKit===id?'下次部署使用':'营地立即换装 · 战场下次复活生效',owned:s.kit===id,ok:true,act:()=>battlefieldCommand({kind:'bfKit',id})}));
  if(vsUI.tab==='build')return [{id:'HQ',name:'本方营地',owner:s.team,contested:false},...versus.state.points].map((p,i)=>({key:String(i+1),name:p.id+' · '+p.name,desc:p.id==='HQ'?'安全部署、医疗与载具补充':'占领后可作为复活点；争夺中暂不可部署',state:s.spawn===p.id?'已选择':p.owner===s.team&&!p.contested?'可以部署':p.contested?'争夺中':'尚未占领',owned:s.spawn===p.id,ok:p.owner===s.team&&!p.contested,act:()=>battlefieldCommand({kind:'bfSpawn',id:p.id})}));
  if(vsUI.tab==='team')return versus.state.seats.map((p,i)=>({key:String(i+1),name:TEAM_NAME[p.team]+' · '+versus.seatName(p),desc:versus.kits[p.kit].name+' · '+(p.ai?'电脑':'玩家'),state:'击杀 '+p.stats.kills+' / 阵亡 '+p.stats.deaths+' / 夺点 '+p.stats.captures,ok:true,act:()=>{}}));
  return (player.vsWeapons||[]).map((id,i)=>({key:String(i+1),name:WEAPONS[id].name,desc:WEAPONS[id].desc,state:Game.curWeapon===id?'已装备':'切换武器',owned:Game.curWeapon===id,ok:true,act:()=>selectWeapon(id)}));
}
function renderVersusPanel(rebuild=false){
  if(!vsOn())return;const s=mySeat(),cards=versusCards();if(!s)return;
  document.querySelectorAll('[data-vstab]').forEach(b=>{const id=b.dataset.vstab;b.setAttribute('aria-selected',id===vsUI.tab?'true':'false');b.textContent=({units:'兵种',build:'部署',weapons:'装备',team:'战况'})[id]+(isTouch?'':({units:'',build:' L',weapons:' O',team:' T'})[id]);});
  document.querySelectorAll('[data-vslane]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.vslane===s.order?'true':'false'));
  $('vsPanelEco').textContent=versus.kits[s.kit].name+' · 100生命 · 弹匣打空自动换弹，备用弹药无限 · '+(isTouch?'点卡片选择':'数字键选择 / Tab切换 / Enter确认');
  const grid=$('vsGrid'),sig=vsUI.tab+':'+cards.map(c=>c.name).join('|');
  if(rebuild||grid.dataset.sig!==sig){grid.dataset.sig=sig;grid.replaceChildren();grid.scrollTop=0;cards.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.className='vs-card';b.innerHTML='<b></b><span class="k"></span><small></small><span class="st"></span>';b.onclick=()=>{const now=versusCards()[i];if(now?.ok)now.act();renderVersusPanel();};grid.appendChild(b);});}
  cards.forEach((c,i)=>{const b=grid.children[i];b.querySelector('b').textContent=c.name;b.querySelector('.k').textContent=isTouch?'':c.key;b.querySelector('small').textContent=c.desc;b.querySelector('.st').textContent=c.state;b.classList.toggle('owned',!!c.owned);b.classList.toggle('ready',!!c.ok);b.setAttribute('aria-disabled',c.ok?'false':'true');});
}
function versusPick(i){const c=versusCards()[i];if(c?.ok)c.act();renderVersusPanel();}
function toggleBattlefieldAim(){bfAiming=!bfAiming;if(bfAiming&&camMode!=='first')setCamMode('first');$('vZ').classList.toggle('aiming',bfAiming);$('vZ').setAttribute('aria-pressed',String(bfAiming));}
function versusPanelInput(){
  if(Input.pop('Z'))toggleBattlefieldAim();
  if(!vsUI.open)return;
  for(let n=1;n<=9;n++)if(Input.pop('N'+n))versusPick(n-1);
}
function versusSetLane(order){const s=mySeat(),ids=['auto','A','B','C'];const id=order||ids[(ids.indexOf(s.order)+1)%ids.length];battlefieldCommand({kind:'bfOrder',id});renderVersusPanel();}
function versusGive(){return false;}
function updVersusHUD(dt){
  const vs=versus.state,s=mySeat();if(!s)return;const me=s.team,foe=me==='blue'?'red':'blue',v=player.inVehicle;
  $('hpTxt').textContent=player.dead?'阵亡 · '+Math.ceil(player.respawnT||0)+'秒后部署':Math.ceil(player.hp)+'/100'+(v?' · 装甲 '+Math.ceil(v.hp)+'/'+v.maxHp:'');
  $('hpBar').style.width=clamp(player.hp/player.maxHp*100,0,100)+'%';$('hpBarWrap').classList.toggle('low',player.hp<30);
  const point=vs.points.reduce((a,b)=>Math.hypot(a.x-player.pos.x,a.z-player.pos.z)<Math.hypot(b.x-player.pos.x,b.z-player.pos.z)?a:b);
  $('baseGuide').textContent=point.id+' '+point.name+' · '+Math.round(Math.hypot(point.x-player.pos.x,point.z-player.pos.z))+'米 · '+(point.contested?'争夺中':point.owner===me?'我方控制':point.owner?'敌方控制':'未占领');
  const reload=player.bfReload;
  $('weapTxt').textContent=v?v.cfg.name:WEAPONS[Game.curWeapon].name+' · '+(reload?'换弹 '+reload.left.toFixed(1)+'s':(player.bfAmmo?.[Game.curWeapon]??WEAPONS[Game.curWeapon].mag)+' / '+WEAPONS[Game.curWeapon].mag);
  updJumpUI();
  for(const [team,prefix] of [[me,'vsMe'],[foe,'vsFoe']]){$(prefix+'Name').textContent=(team===me?'我方':'敌方')+'兵力';$(prefix+'Hp').textContent=Math.ceil(vs.teams[team].tickets);$(prefix+'Bar').style.width=vs.teams[team].tickets/VS_RULES.tickets*100+'%';$(prefix+'Bar').style.background=TEAM_CSS[team];}
  $('vsClock').textContent=fmtTime(VS_RULES.limit-vs.time);$('vsPhase').textContent='控制多数据点，消耗敌方兵力';
  const flags=$('bfFlags');flags.replaceChildren(...vs.points.map(p=>{const e=document.createElement('span');e.textContent=p.id+' '+p.name+' '+(p.contested?'争夺':p.owner?TEAM_NAME[p.owner]:Math.abs(p.progress)<.01?'未占领':(p.progress>0?'蓝':'红')+' '+Math.round(Math.abs(p.progress)*100)+'%');e.style.borderColor=TEAM_CSS[p.owner||'neutral'];e.style.color=TEAM_CSS[p.owner||'neutral'];return e;}));
  $('vsEco').textContent=versus.kits[s.kit].name+' · 击杀 '+s.stats.kills+' / 阵亡 '+s.stats.deaths+'\n'+(s.pendingKit?'下次部署：'+versus.kits[s.pendingKit].name:'部署点：'+s.spawn)+(player.bfSupportCd>0?' · 支援 '+Math.ceil(player.bfSupportCd)+'s':'');
  renderWeaponBar();if(vsUI.open&&(vsUI.t-=dt)<=0){vsUI.t=.2;renderVersusPanel();}
  if(Game.msgTimer>0){Game.msgTimer-=dt;if(Game.msgTimer<=0)$('msg').classList.add('hidden');}
  if((radarT-=dt)<=0){radarT=.15;versus.drawRadar(rctx,radar.width,radar.height,player.inVehicle?player.inVehicle.mesh.position:player.pos,camYaw,player.yaw);}
}
function versusEnded(res){
  if(versus.state.sim)return;Game.state='over';cancelPlacement(true);versusClosePanel();if(document.pointerLockElement)document.exitPointerLock();
  const me=player.team||versus.state.localTeam,foe=me==='blue'?'red':'blue',won=res.winner===me,draw=!res.winner,n=res.size||1;
  AudioSys.sfx(won?'win':draw?'click':'lose');$('vsResultTitle').textContent=draw?'战局平局':won?'任务完成 · 胜利':'任务失败';
  $('vsResultReason').textContent=res.reason+' · 用时 '+fmtTime(res.time);
  const table=$('vsStats');table.replaceChildren();
  const row=(values,header=false)=>{const tr=document.createElement('tr');values.forEach(value=>{const td=document.createElement(header?'th':'td');td.textContent=value;tr.append(td);});table.append(tr);};
  row(['战地统计','我方','敌方'],true);row(['剩余兵力',res.tickets[me],res.tickets[foe]]);
  for(const [key,label] of [['kills','击杀'],['deaths','阵亡'],['captures','占领据点'],['vehicles','摧毁载具']])row([label,res.stats[me][key],res.stats[foe][key]]);
  row(['参战人员','击杀 / 阵亡','夺点'],true);for(const p of res.seats)row([TEAM_NAME[p.team]+' '+(p.pid===player.vsPid?'你':p.name||'电脑'),p.kills+' / '+p.deaths,p.captures]);
  let note='好友战地对抗 · 娱乐对战，不计排位';if(res.mode==='ai'){const r=versusRecord(),key=versusRecordKey(res.difficulty,n);r[key]=r[key]||{w:0,l:0};if(won)r[key].w++;else if(!draw)r[key].l++;try{localStorage.setItem(VS_RECORD,JSON.stringify(r));}catch(_e){}note='本机据点战：'+r[key].w+'胜 '+r[key].l+'负';}
  $('vsResultNote').textContent=note;$('vsRematch').textContent=versusGuest()?'等待房主再来一局':'再来一局';$('vsResult').classList.remove('hidden');$('touchUI').classList.add('hidden');$('menuPause').classList.add('hidden');
}

function versusRematch(){
  const vs=versus.state;
  if(vs.mode==='online'){if(versusGuest()){showMsg('由房主开始下一局',1.6);return;}coopDriver?.action('restart');return;}
  startVersusAI(vs.difficulty||'normal',versus.size);
}

function installStarshipCoop(){
 if(coopDriver||!battlefield)return;
 coopDriver=installRemakeCoop({
  game:'starship',container:$('stage'),menu:$('btnStart').parentElement,getConfig:()=>({hero:['gunner','rifle','medic'].indexOf(Game.cls),mode:lobbyMode,...(lobbyMode==='versus'?versusLobbyConfig():{})}),notify:showMsg,
  onStart:config=>{closePanels();if(config.mode==='versus'){startVersusOnline(config);return;}if(vsOn()||versusBackup)exitVersus();Game.cls=['gunner','rifle','medic'][config.playerChoices?.[0]??config.hero??0]||'gunner';newGame(false);setupCoopHumans(config);},
  getState:()=>({...starshipState(),sounds:coopSounds.snapshot()}),stateEvery:()=>vsOn()&&(coopDriver?.connection.room?.players.length||0)>3?100:65,getInput:starshipInput,getUI:()=>({paused:Game.state==='paused'}),
  onJoin:m=>{if(coopDriver.config?.mode==='versus'){coopDriver.config.playerTeams={...coopDriver.config.playerTeams,[m.slot]:m.team||'auto'};if(vsOn()&&coopDriver.connection.host)versusPlayerJoined(m);return;}joinCoopHuman(m.slot,m.hero);},
  onState:state=>{starshipApply(state.game);coopSounds.apply(state.game.sounds);},
  onAction:kind=>{if(kind==='pause'&&Game.state!=='paused')togglePause();else if(kind==='resume'&&Game.state==='paused')togglePause();else if(kind==='restart'||kind==='retry'){if(coopDriver.config?.mode==='versus'){startVersusOnline(coopDriver.config);return;}newGame(false);setupCoopHumans(coopDriver.config);}},
  onEnd:m=>{if(m.type==='player_left'&&vsOn()){versusPlayerLeft(m.slot);return;}
    if(m.type==='ended'&&(vsOn()||versusBackup))exitVersus();
    if(m.type==='player_left'){const h=coopHumans.find(h=>h.slot===m.slot);if(h){if(h.inVehicle)withHuman(h,exitVehicle);h.disconnected=true;h.dead=true;h.mesh.visible=false;}}
    else if(m.type==='ended'){closePanels();clearCoopHumans();Game.coop=false;Game.state='menu';$('menuMain').classList.remove('hidden');$('menuPause').classList.add('hidden');$('hud').classList.add('hidden');$('touchUI').classList.add('hidden');}},
 });
 // 虫潮：联机大厅入口只放在主菜单（#startRow），不重复出现在暂停菜单里；移除共享 coop 注入的「房间与队友」副本。
 $('menuPause').querySelector('[data-act="team"]')?.remove();
 coopDriver.lobby.entry.addEventListener('click',()=>{lobbyMode='coop';syncLobbyMode();},true);
 const original=coopDriver.lobby.onMessage;
 coopDriver.lobby.onMessage=m=>{original(m);
  // 点邀请链接或房间号进了对战房间：大厅切到对战选项（队伍、电脑补位难度），准备时带上所选队伍
  if((m.type==='joined'||m.type==='roster')&&m.room?.settings?.mode==='versus'&&lobbyMode!=='versus'){lobbyMode='versus';syncLobbyMode();}
  if(m.type==='command'&&coopDriver.connection.host)handleCoopCommand(m.slot,m.command);};
 const saveBlock=e=>{if(coopDriver.config){e.preventDefault();e.stopImmediatePropagation();showMsg('联机不读写单机存档',1.5);}};
 for(const id of ['btnSaveMenu','btnLoadMenu','btnLoadMenu2'])$(id).addEventListener('click',saveBlock,true);
 const openOps=operations.open;operations.open=()=>{if(coopDriver.config){showMsg('本版联机合作守城，副本使用单机入口',2);return;}openOps();};
 if(new URLSearchParams(location.search).get('test')==='1'){coopDriver.snapshot=starshipSnapshot;window.__COOP_QA__=coopDriver;}
}
const coopBootTimer=setInterval(()=>{if(battlefield&&player.mesh){clearInterval(coopBootTimer);installStarshipCoop();}},200);

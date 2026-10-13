// 虫族模式 v2（实验玩法）：扮演母虫率领虫群，分三段攻下人类要塞。
// 流程：拔除三处护盾中继哨站 → 城门护盾消失后破门 → 冲进内院摧毁基地核心。
// 复用主世界的炮塔 / 守军 / 城门 / 核心与虫群 AI；本模块负责母虫操控、阶段目标、
// 进化、炮击预警、战况界面与结算。
import * as T from './vendor/three.module.js';

const STORE_BEST='chongchao-zerg-best-v2',STORE_OLD='chongchao-zerg-best-v1',STORE_DIFF='chongchao-zerg-difficulty-v1';
const SWARM_CAP=28,ENGAGE=34,QUEEN_HP=1000,QUEEN_SCALE=1.55,CLAW_DMG=60,ACID_DMG=80,SHELL_R=6.5;
const COST={brood:60,flyer:90,molt:40};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a),TAU=Math.PI*2;
const v3=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),flat=(p,q)=>Math.hypot(p.x-q.x,p.z-q.z);
const fmt=t=>{t=Math.max(0,Math.ceil(t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');};

// armor：母虫实际承受的伤害比例；hp / fire：守军设施耐久与火力倍率；shell：迫击炮两次炮击的平均间隔（秒）。
export const ZERG_DIFFS={
  easy:{name:'简单',hint:'守军少、炮击慢，母虫更耐打，适合先熟悉三段攻城。',time:360,lives:5,armor:.3,mg:2,soldiers:3,sniper:0,aa:1,shell:15,coreHp:5000,gateHp:5000,hp:.75,fire:1.2,passive:2,wave:4},
  normal:{name:'普通',hint:'标准守备：城头机枪、狙击炮台和内院迫击炮齐全。',time:300,lives:4,armor:.38,mg:3,soldiers:5,sniper:1,aa:2,shell:11,coreHp:6500,gateHp:6500,hp:1,fire:1.5,passive:1.5,wave:3},
  hard:{name:'困难',hint:'守军满编、炮击密集、时间更紧，要靠标记集火和号令推进。',time:270,lives:3,armor:.55,mg:4,soldiers:6,sniper:1,aa:2,shell:8,coreHp:9000,gateHp:9000,hp:1.25,fire:1.8,passive:1,wave:3},
};
// 主战役的炮塔按“被几十只小虫围攻”定的耐久，放到母虫带队强攻里几秒就没；这里单独给一套。
const FORT_HP={mgTurret:1300,sniperTurret:1500,cannonTurret:1700,bunker:3600,antiAir:900,mortarTurret:1800};
const BONUS={outpost:15,phase:30};
// 哨站坐落在两座平顶山丘和中路，离虫洞由远到近；kit 为相对哨站中心的炮塔位置。
// 山丘顶上原有一座带屋顶的碉堡（fort）：炮塔摆在碉堡两侧，地穴长在朝要塞一侧的门外（den）。
const OUTPOSTS=[
  {id:'east',name:'东丘哨站',x:43,z:114,fort:true,den:[0,-11],kit:[['mgTurret',-8.2,1],['sniperTurret',8.2,1]]},
  {id:'west',name:'西丘哨站',x:-43,z:84,fort:true,den:[0,-10.5],kit:[['mgTurret',7.8,1],['cannonTurret',-7.8,1]]},
  {id:'road',name:'中路关卡',x:0,z:46,den:[0,0],kit:[['bunker',0,0],['mgTurret',-7,-2],['mgTurret',7,-2]]},
];
const FORT_HALF=6.3;
const EVOLUTIONS=[
  {id:'carapace',name:'甲壳硬化',desc:'母虫最大生命 +40%，并立即回满',apply:e=>{e.hp*=1.4;}},
  {id:'claws',name:'镰爪增生',desc:'撕咬伤害 +45%，攻击范围 +20%',apply:e=>{e.claw*=1.45;e.clawR*=1.2;}},
  {id:'acid',name:'腐蚀酸囊',desc:'酸液伤害 +70%，冷却缩短 30%',apply:e=>{e.acid*=1.7;e.acidCd*=.7;}},
  {id:'brood',name:'巢群孵化',desc:'每次孵化多 1 只，生物量消耗 −25%',apply:e=>{e.brood+=1;e.cost*=.75;}},
  {id:'pheromone',name:'狂热信息素',desc:'虫群伤害 +35%，移动速度 +20%',apply:e=>{e.swarmDmg*=1.35;e.swarmSpd*=1.2;}},
  {id:'regen',name:'再生组织',desc:'母虫每秒回复 1.5% 生命，蜕皮冷却减半',apply:e=>{e.regen+=.015;e.moltCd*=.5;}},
];
const ABILITIES=[
  {id:'claw',key:'J',name:'撕咬',touch:'vJ',tip:'靠近自动撕咬，第三下重击'},
  {id:'acid',key:'K',name:'酸液',touch:'vK',tip:'抛射酸液并标记目标，虫群集火'},
  {id:'brood',key:'U',name:'战士虫',short:'战士',touch:'vU',cost:'brood',tip:'孵化地面战士'},
  {id:'flyer',key:'I',name:'飞虫',touch:'vI',cost:'flyer',tip:'孵化飞虫，越墙攻击城头'},
  {id:'molt',key:'O',name:'蜕皮',touch:'vO',cost:'molt',tip:'回复生命并短暂减伤'},
  {id:'dash',key:'L',name:'冲刺',touch:'vL',tip:'突进并短暂无敌，躲炮击'},
  {id:'rally',key:'H',name:'号令',touch:'vH',tip:'虫群狂热并呼叫一波增援'},
];
const GRADES=['','B','A','S'];

export function createZergMode(a){
  const $=id=>document.getElementById(id),stage=a.stage,G=a.Game;
  const s={active:false,over:false,frozen:false,diff:'normal',D:ZERG_DIFFS.normal,phase:1,timeLeft:0,elapsed:0,biomass:0,lives:0,deaths:0,
    bug:null,respawnT:0,cd:{},dashT:0,moltT:0,frenzyT:0,calmT:0,combo:0,comboT:0,mark:null,outposts:[],dens:[],shells:[],shellCd:0,waveT:0,
    mortar:null,shield:null,shieldT:0,evo:null,evoTaken:[],stats:null,best:null,hudT:0,gear:[],floats:[],bioGainT:0};
  let labels=null,world=null;
  try{const d=localStorage.getItem(STORE_DIFF);if(ZERG_DIFFS[d])s.diff=d;}catch{}

  /* ---------- 战绩 ---------- */
  function readBest(){
    try{const d=JSON.parse(localStorage.getItem(STORE_BEST)||'null');if(d&&d.schema===2&&d.by)return d;}catch{}
    const fresh={schema:2,by:{}};
    // 旧版只有一档难度的胜场与局数，并入「普通」。
    try{const o=JSON.parse(localStorage.getItem(STORE_OLD)||'null');if(o&&o.schema===1)fresh.by.normal={wins:o.wins||0,runs:o.runs||0,bestTime:0,grade:''};}catch{}
    return fresh;
  }
  function saveBest(win,grade){
    const all=readBest(),old=all.by[s.diff]||{wins:0,runs:0,bestTime:0,grade:''};
    const rec={wins:old.wins+(win?1:0),runs:old.runs+1,bestTime:win&&(!old.bestTime||s.elapsed<old.bestTime)?Math.round(s.elapsed):old.bestTime,
      grade:win&&GRADES.indexOf(grade)>GRADES.indexOf(old.grade)?grade:old.grade};
    all.by[s.diff]=rec;all.updated=new Date().toISOString();
    try{localStorage.setItem(STORE_BEST,JSON.stringify(all));}catch{}
    s.best=all;return rec;
  }
  s.best=readBest();

  /* ---------- 界面 ---------- */
  const style=document.createElement('style');style.textContent=`
    .zerg-mode #hudTop,.zerg-mode #hudRight,.zerg-mode #radar,.zerg-mode #weaponBar,.zerg-mode #hint,.zerg-mode #interactHint,.zerg-mode #crosshair,.zerg-mode #keysHint,.zerg-mode #dmgLayer,.zerg-mode #saveHealth,.zerg-mode #readyBtn,.zerg-mode #vSPRINT,.zerg-mode #vX{display:none!important}
    #zergHud{position:absolute;left:0;top:0;width:100%;height:100%;z-index:12;pointer-events:none;color:#efe9f6;font-size:12px;text-shadow:0 1px 2px #000}
    #zergHud .zg-card{background:rgba(16,10,22,.84);border:1px solid rgba(170,120,220,.5);border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.4)}
    #zgQueen{position:absolute;left:10px;top:10px;width:206px;padding:8px 11px;line-height:1.5}
    #zgQueen .zg-row{display:flex;justify-content:space-between;align-items:center;gap:8px}
    #zgLives{letter-spacing:2px;color:#ff8f7a}#zgLives i{font-style:normal;opacity:.28}
    .zg-meter{height:9px;border-radius:5px;background:#2a1d33;overflow:hidden;margin:3px 0 4px}
    .zg-meter i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#8adf55,#c9f07a);transition:width .12s}
    #zgHp.low{background:linear-gradient(90deg,#ff5a4a,#ff9a6a)}
    #zgBio{color:#b9f56a;font-size:14px}#zgBioGain{color:#eaff9a;font-style:normal;margin-left:4px;opacity:0;transition:opacity .3s}#zgBioGain.on{opacity:1}
    #zgEvo{color:#d7b6ff;font-size:11px;min-height:0}#zgMark{color:#ffd36a;font-size:11px}
    #zgTop{position:absolute;left:226px;right:270px;top:10px;display:flex;flex-direction:column;align-items:center;gap:4px}
    #zgPhases{display:flex;gap:6px;align-items:center}
    #zgPhases span{padding:3px 9px;border-radius:12px;background:rgba(16,10,22,.8);border:1px solid rgba(150,130,170,.4);color:#a79db3;white-space:nowrap}
    #zgPhases span.now{color:#1b1206;background:#ffd36a;border-color:#fff0b8;font-weight:800;text-shadow:none}
    #zgPhases span.done{color:#b9f56a;border-color:rgba(160,230,110,.6)}
    #zgClock{font:800 22px/1 "Microsoft YaHei",sans-serif;color:#fff;padding:3px 12px;border-radius:9px;background:rgba(16,10,22,.84);border:1px solid rgba(170,120,220,.5)}
    #zgClock.low{color:#ff6a5a;border-color:#ff6a5a}
    #zgGoal{width:min(360px,100%);padding:5px 10px;text-align:center}#zgGoal .zg-meter{margin:4px 0 1px}#zgGoal .zg-meter i{background:linear-gradient(90deg,#5fc8ff,#a8e6ff)}
    #zgRadar{position:absolute;right:var(--corner-right,10px);top:calc(var(--corner-top,10px) + var(--corner-height,44px) + 10px);width:124px;height:124px}
    #zgMarker{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-999px,-999px);will-change:transform;font-weight:800;color:#ffd36a}
    #zgMarker i{width:16px;height:16px;border:3px solid #ffd36a;border-radius:3px;transform:rotate(45deg);background:rgba(255,211,106,.22);box-shadow:0 0 10px rgba(255,200,80,.7)}
    #zgMarker.edge i{border-radius:0;border-width:0 0 3px 3px;background:none;box-shadow:none;width:14px;height:14px}
    #zgMarker span{white-space:nowrap;background:rgba(16,10,22,.72);padding:1px 6px;border-radius:8px;font-size:11px}
    #zgWarn{position:absolute;left:50%;top:36%;transform:translateX(-50%);padding:6px 16px;border-radius:9px;font-size:16px;font-weight:800;color:#fff;background:rgba(170,30,20,.86);border:1px solid #ffb0a0;white-space:nowrap}
    #zgBar{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:6px;pointer-events:auto}
    .zg-ab{position:relative;width:74px;height:58px;padding:3px 2px;border-radius:9px;cursor:pointer;overflow:hidden;font-family:inherit;color:#efe9f6;background:rgba(22,14,30,.9);border:1px solid rgba(170,120,220,.6);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}
    .zg-ab kbd{font:800 11px/1 inherit;padding:2px 5px;border-radius:4px;background:#efe9f6;color:#1a1024}
    .zg-ab b{font-size:13px}.zg-ab small{font-size:10px;color:#b9f56a;min-height:12px}
    .zg-ab .zg-cd{position:absolute;left:0;bottom:0;width:100%;height:0;background:rgba(0,0,0,.62);pointer-events:none}
    .zg-ab.wait b,.zg-ab.short b{opacity:.5}.zg-ab.short small{color:#ff8f7a}.zg-ab:focus-visible{outline:3px solid #ffe066}
    #zgFloat{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}
    .zg-pop{position:absolute;left:0;top:0;font-weight:900;font-size:15px;color:#ffe9a8;text-shadow:0 1px 0 #000,1px 0 0 #000,-1px 0 0 #000,0 -1px 0 #000;will-change:transform}
    .zg-pop.bio{color:#b9f56a}.zg-pop.big{font-size:20px;color:#ffd84d}
    .zerg-mode #touchUI .vbtn:not(#vC):not(#vP){border-radius:50%;white-space:pre-line}
    .zerg-mode .vbtn.zg-wait{filter:grayscale(.7) brightness(.6)}
    .zerg-mode #touchUI .vbtn.zg-cooling:not(#vC):not(#vP){line-height:1.2;display:flex;align-items:center;justify-content:center}
    #zergMenu h1,#zergResult h1{letter-spacing:3px}#zergMenu .small,#zergResult .small{max-width:780px;line-height:1.7}
    #zgSteps{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}#zgSteps div{padding:8px 12px;border-radius:9px;background:rgba(30,20,40,.82);border:1px solid rgba(170,120,220,.45);max-width:236px;font-size:12px;line-height:1.55}
    #zgSteps b{color:#ffd36a;display:block;margin-bottom:2px;font-size:13px}
    #zgDiffRow .mbtn[aria-pressed="true"]{background:#ffd36a;color:#1b1206;border-color:#fff0b8;text-shadow:none}
    #zergEvolve{align-items:center;justify-content:center;background:rgba(8,5,12,.82)}
    #zergEvolve h2{font-size:24px;margin:0 0 4px}#zgEvoRow{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:10px}
    #zgEvoRow .mbtn{width:210px;min-height:110px;padding:12px;display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;white-space:normal;line-height:1.5}
    #zgEvoRow .mbtn b{font-size:17px;color:#ffd36a}#zgEvoRow .mbtn span{font-size:12px;font-weight:normal}
    #zgGrade{font:900 54px/1 "Microsoft YaHei",sans-serif;color:#ffd36a;margin:2px 0 6px}
    #zgStats{display:grid;grid-template-columns:repeat(3,minmax(120px,170px));gap:6px 10px;margin:6px 0 10px}#zgStats div{padding:6px 10px;border-radius:8px;background:rgba(30,20,40,.82);border:1px solid rgba(170,120,220,.4);font-size:12px}#zgStats b{display:block;font-size:17px;color:#fff}
    .touch-mode #zgBar{display:none}
    .touch-mode #zgQueen{width:168px;padding:5px 8px;font-size:10px;line-height:1.4}.touch-mode #zgTop{left:184px;right:262px;gap:3px}
    .touch-mode #zgPhases{gap:3px}.touch-mode #zgPhases span{padding:2px 5px;font-size:10px}.touch-mode #zgClock{font-size:17px;padding:2px 9px}.touch-mode #zgGoal{padding:3px 8px;font-size:10px}
    .touch-mode #zgRadar{width:88px;height:88px}.touch-mode #zgWarn{font-size:14px;top:30%}
    .touch-mode #zgEvoRow .mbtn{width:190px;min-height:96px}.touch-mode #zgStats{grid-template-columns:repeat(3,minmax(100px,150px))}
    @media(max-height:420px){#zergMenu,#zergResult{padding:10px 24px}#zergMenu h1,#zergResult h1{font-size:24px;margin:0}#zgSteps div{padding:5px 9px;font-size:11px}#zgGrade{font-size:38px}#zergEvolve h2{font-size:19px}}
  `;document.head.append(style);
  const hud=$('zergHud');
  hud.innerHTML=`
    <div id="zgQueen" class="zg-card"><div class="zg-row"><b>母虫</b><span id="zgLives" aria-label="剩余重生次数"></span></div>
      <div class="zg-meter"><i id="zgHp"></i></div>
      <div class="zg-row"><span>生物量 <b id="zgBio">0</b><em id="zgBioGain"></em></span><span>虫群 <b id="zgSwarm">0</b></span></div>
      <div id="zgMark"></div><div id="zgEvo"></div></div>
    <div id="zgTop"><div id="zgPhases"><span data-p="1">① 拔除哨站</span><span data-p="2">② 攻破城门</span><span data-p="3">③ 摧毁核心</span><b id="zgClock">0:00</b></div>
      <div id="zgGoal" class="zg-card"><span id="zgGoalTxt"></span><div class="zg-meter"><i id="zgGoalBar"></i></div></div></div>
    <canvas id="zgRadar" width="186" height="186" aria-label="虫族战场雷达"></canvas>
    <div id="zgFloat"></div>
    <div id="zgMarker"><i></i><span></span></div>
    <div id="zgWarn" class="hidden" role="status"></div>
    <div id="zgBar" role="group" aria-label="母虫技能"></div>`;
  for(const ab of ABILITIES){
    const b=document.createElement('button');b.type='button';b.className='zg-ab';b.dataset.ab=ab.id;b.title=ab.tip;b.tabIndex=-1;
    b.innerHTML=`<kbd></kbd><b>${ab.name}</b><small></small><i class="zg-cd"></i>`;
    // 鼠标点技能栏等同按键；按住撕咬键可连续攻击。
    b.addEventListener('pointerdown',e=>{e.preventDefault();if(!a.Input.keys[ab.key])a.Input.pressed[ab.key]=true;a.Input.keys[ab.key]=true;b.setPointerCapture(e.pointerId);});
    for(const t of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(t,()=>{a.Input.keys[ab.key]=false;});
    $('zgBar').append(b);ab.el=b;
  }
  const host=document.createElement('div');host.innerHTML=`
    <div id="zergMenu" class="overlay menu hidden" aria-label="虫族模式简报"><h1>虫族模式 · 攻陷人类要塞</h1>
      <p class="small">你是母虫。带着虫群从虫洞出发，在援军抵达前分三步拿下要塞；母虫每次阵亡会在最近的地穴重生，次数用完或时间耗尽即失败。</p>
      <div id="zgSteps"><div><b>① 拔除三处哨站</b>东丘、西丘、中路各有一组炮塔，是城门护盾的中继。清空后原地长出地穴，增援从这里钻出。</div>
        <div><b>② 攻破城门</b>护盾消失后咬开城门。城头炮塔够不着：用酸液或飞虫处理，留意迫击炮的红圈。</div>
        <div><b>③ 摧毁基地核心</b>冲进内院咬碎核心即获胜。每完成一步可三选一进化。</div></div>
      <h2>难度</h2><div class="btnRow" id="zgDiffRow" role="group" aria-label="虫族模式难度"></div>
      <p class="small" id="zgDiffHint" role="status"></p><p class="small" id="zgKeys"></p>
      <div class="btnRow"><button id="zergStart" class="mbtn green">开始进攻</button><button id="zergBack" class="mbtn">返回主菜单</button></div></div>
    <div id="zergEvolve" class="overlay menu hidden" aria-label="选择进化"><h2>母虫进化</h2><p class="small" id="zgEvoInfo"></p><div id="zgEvoRow"></div></div>
    <div id="zergResult" class="overlay menu hidden" aria-label="虫族模式结算"><h1 id="zgResultTitle"></h1><div id="zgGrade"></div><p class="small" id="zgResultInfo"></p>
      <div id="zgStats"></div><p class="small" id="zgResultBest"></p>
      <div class="btnRow"><button id="zergAgain" class="mbtn green">再攻一次</button><button id="zergResultMenu" class="mbtn">更换难度</button><button id="zergResultBack" class="mbtn">返回主菜单</button></div></div>`;
  for(const child of [...host.children])stage.append(child);
  for(const [id,d] of Object.entries(ZERG_DIFFS)){
    const b=document.createElement('button');b.type='button';b.className='mbtn';b.dataset.zergDiff=id;b.textContent=d.name;
    b.onclick=()=>{s.diff=id;try{localStorage.setItem(STORE_DIFF,id);}catch{}refreshMenu();a.AudioSys.sfx('click');};
    $('zgDiffRow').append(b);
  }
  function refreshMenu(){
    const d=ZERG_DIFFS[s.diff],rec=readBest().by[s.diff];
    for(const b of $('zgDiffRow').children)b.setAttribute('aria-pressed',String(b.dataset.zergDiff===s.diff));
    $('zgDiffHint').textContent=`${d.name}：${d.hint} 限时 ${fmt(d.time)}（每完成一步追加时间），母虫可重生 ${d.lives} 次。`+
      (rec&&rec.runs?` 战绩 ${rec.wins} 胜 / ${rec.runs} 局`+(rec.bestTime?`，最快 ${fmt(rec.bestTime)}，最高评级 ${rec.grade||'B'}`:''):' 这个难度还没有战绩。');
    const k=x=>a.keyLabel(x);
    $('zgKeys').textContent=a.isTouch()
      ?'操作：左摇杆移动，拖动画面转视角；靠近目标自动撕咬。右侧按键：撕咬、酸液、冲刺、战士、飞虫、蜕皮、号令。'
      :`操作：WASD 移动，按住画面拖动或 ${k('Q')} / ${k('E')} 转视角，${k('C')} 切换视角；靠近目标自动撕咬。${k('J')} 撕咬 · ${k('K')} 酸液（标记集火）· ${k('U')} 战士虫 · ${k('I')} 飞虫 · ${k('O')} 蜕皮 · ${k('L')} 冲刺 · ${k('H')} 号令；也可以用鼠标点下方技能栏。`;
  }
  const markMode=id=>document.querySelectorAll('#modeRow .lobbyCard').forEach(el=>{
    const on=el.id===id;el.classList.toggle('mode-sel',on);
    if(el.hasAttribute('aria-pressed'))el.setAttribute('aria-pressed',on?'true':'false');
  });
  function openMenu(){markMode('btnZerg');a.AudioSys.init();refreshMenu();$('menuMain').classList.add('hidden');$('zergResult').classList.add('hidden');$('zergMenu').classList.remove('hidden');}
  $('zergBack').onclick=()=>{markMode('btnCampaign');$('zergMenu').classList.add('hidden');$('menuMain').classList.remove('hidden');};
  $('zergStart').onclick=()=>start();
  $('zergAgain').onclick=()=>{stop(true);start();};
  $('zergResultMenu').onclick=()=>{stop(true);openMenu();};
  $('zergResultBack').onclick=()=>stop();

  /* ---------- 场景物件 ---------- */
  function addGear(mesh){a.scene.add(mesh);s.gear.push(mesh);return mesh;}
  function dropGear(mesh){
    const i=s.gear.indexOf(mesh);if(i>=0)s.gear.splice(i,1);
    a.scene.remove(mesh);mesh.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
  }
  const glow=(color,opacity)=>new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending});
  function turret(kind,x,z){
    const bd=a.placeBuilding(kind,x,z,0);
    bd.maxHp=Math.round((FORT_HP[kind]||bd.maxHp)*s.D.hp);bd.hp=bd.maxHp;bd.dmg*=s.D.fire;a.updHPBar(bd.bar,1);
    return bd;
  }
  function buildFortress(){
    const D=s.D;
    for(const [x,z] of [[-15,-13],[15,-13],[-27,-13],[27,-13]].slice(0,D.mg))turret('mgTurret',x,z);
    if(D.sniper)turret('sniperTurret',22,-18);
    turret('antiAir',-22,-18);if(D.aa>1)turret('antiAir',18,-30);
    turret('cannonTurret',0,-27);turret('bunker',-3,-36);
    // 迫击炮只作炮击来源和可摧毁目标：炮击由本模块先画预警圈再结算，不走炮塔的即时开火。
    s.mortar=turret('mortarTurret',16,-48);s.mortar.dmg=0;
  }
  function buildOutposts(){
    s.outposts=OUTPOSTS.map(o=>{
      const op={...o,turrets:[],cleared:false,pillar:null};
      for(const [kind,dx,dz] of o.kit){const bd=turret(kind,o.x+dx,o.z+dz);bd.zergOutpost=op;op.turrets.push(bd);}
      // 中继光柱：隔着山丘也能看到哨站在哪。
      const pillar=new T.Mesh(new T.CylinderGeometry(.4,.4,46,10,1,true),glow(0x5fd0ff,.22));
      pillar.position.set(o.x,a.groundY(o.x,o.z)+23,o.z);op.pillar=addGear(pillar);
      return op;
    });
  }
  function buildShield(){
    const g=a.gate.pos,m=new T.Mesh(new T.PlaneGeometry(13.6,7.4),glow(0x58c8ff,.3));
    m.position.set(g.x,a.groundY(g.x,g.z)+3.5,g.z+1.5);s.shield=addGear(m);
  }
  function makeBurrow(x,z,name){
    const g=new T.Group();
    const mound=new T.Mesh(new T.ConeGeometry(3.4,1.5,9),new T.MeshLambertMaterial({color:0x3a2233}));mound.position.y=.75;g.add(mound);
    const maw=new T.Mesh(new T.CylinderGeometry(1.5,1.9,.5,9),new T.MeshBasicMaterial({color:0x120810}));maw.position.y=1.42;g.add(maw);
    const rim=new T.Mesh(new T.TorusGeometry(1.75,.17,6,14),new T.MeshBasicMaterial({color:0xc46bff}));rim.rotation.x=Math.PI/2;rim.position.y=1.62;g.add(rim);
    g.position.set(x,a.groundY(x,z),z);addGear(g);
    s.dens.push({x,z,name});
  }
  // 前线出兵点：最靠近要塞的地穴；一处都没有时是中央主洞口。
  function forward(){
    const den=[...s.dens].sort((p,q)=>p.z-q.z)[0];
    if(den)return den;
    const m=a.MOUTHS.find(m=>m.main)||a.MOUTHS[0];
    return {x:m.out.x,z:m.out.z-6,name:m.name};
  }

  /* ---------- 母虫与虫群 ---------- */
  function spawnQueen(){
    const p=forward();
    const mo=a.spawnMonster('queen',p.x+rand(-2,2),p.z-5,{quiet:true,ch:a.CHAPTERS[9]});
    Object.assign(mo,{zergPlayer:true,home:null,guard:false,bs:null,ranged:false,fly:false,gold:0,wild:false,elite:null,speed:10,dmg:CLAW_DMG,invuln:3});
    mo.mesh.scale.setScalar(QUEEN_SCALE);mo.radius=1.25;mo.hitH=.7*QUEEN_SCALE;
    mo.maxHp=Math.round(QUEEN_HP*s.evo.hp);mo.hp=mo.maxHp;mo.bar.visible=false;
    mo.mesh.rotation.y=Math.PI; // 面朝要塞（-Z）
    s.bug=mo;s.calmT=0;
    a.player.yaw=Math.PI;a.setLook(Math.PI,.2); // 略微抬头，开局就能看到远处的哨站和要塞
    return mo;
  }
  const BROOD={drone:{ch:0,hp:70,dmg:8,speed:6},warrior:{ch:2,hp:170,dmg:14,speed:6.4},flyer:{ch:3,hp:95,dmg:12,speed:8.6}};
  function spawnBrood(type,x,z,emerge){
    const st=BROOD[type],mo=a.spawnMonster('mob',x,z,{quiet:true,ch:a.CHAPTERS[st.ch],emerge:!!emerge});
    mo.hp=mo.maxHp=st.hp;mo.gold=0;mo.elite=null;mo.zBase={dmg:st.dmg,speed:st.speed};mo.dmg=st.dmg;mo.speed=st.speed;
    a.updHPBar(mo.bar,1);s.stats.hatched++;
    return mo;
  }
  const swarm=()=>a.monsters().filter(m=>!m.dead&&!m.zergPlayer);
  function wave(n){
    const p=forward(),room=SWARM_CAP-swarm().length;
    for(let i=0;i<Math.min(n,room);i++)spawnBrood('drone',p.x+rand(-5,5),p.z+rand(-5,5),true);
  }
  function garrison(){
    const roles=['gunner','gunner','medic','gunner','engineer','gunner'].slice(0,s.D.soldiers);
    roles.forEach((role,i)=>{a.squadGear(i).role=role;a.squadGear(i).order='defend';});
    G.squadCount=roles.length;G.squadOrder='defend';G.squadAutoDefense=true;G.squadAlert=3;
    spawnDefenders(roles.length);
  }
  // 守军按人类玩家位置落点：先把锚点放回内院，免得刷在母虫脚边。
  function spawnDefenders(n){
    const keep=a.player.pos.clone();a.player.pos.set(0,a.groundY(0,-32),-32);
    let made=0;for(let i=0;i<n;i++){const q=a.spawnSquad();if(!q)continue;made++;q.tag.visible=false;} // “守家 / 跟随”是给人类玩家看的队友标签
    a.player.pos.copy(keep);return made;
  }

  /* ---------- 目标 ---------- */
  function humans(){
    const list=[];
    for(const q of a.squad)if(!q.dead&&!q.vehicle)list.push({pos:q.mesh.position,obj:q,kind:'squad',r:1});
    for(const bd of a.buildings)if(!bd.dead)list.push({pos:bd.mesh.position,obj:bd,kind:'building',r:bd.radius});
    if(s.phase>=2&&!a.gate.dead)list.push({pos:a.gate.mesh.position,obj:a.gate,kind:'gate',r:3.5});
    if(s.phase>=3)list.push({pos:a.base.pos,obj:a.base,kind:'base',r:4});
    return list;
  }
  // 城头的炮塔和守军离地近 5 米，爪子够不着，只能交给酸液和飞虫。
  const reachable=(t,pos)=>t.kind==='gate'||t.kind==='base'||Math.abs(t.pos.y-pos.y)<3.4;
  function humansNear(pos,r){return humans().filter(t=>reachable(t,pos)&&flat(t.pos,pos)<=r+t.r);}
  const alive=t=>t&&(t.kind==='base'?a.base.hp>0:!t.obj.dead);
  const nameOf=t=>t.kind==='squad'?'守军':t.kind==='gate'?'城门':t.kind==='base'?'基地核心':(a.BUILDINGS[t.obj.kind]||{}).name||'设施';
  function strike(t,dmg){
    if(t.kind==='squad')a.damageSquad(t.obj,dmg);
    else if(t.kind==='building')a.damageBuilding(t.obj,dmg);
    else if(t.kind==='gate')a.damageGate(dmg);
    else a.damageBase(dmg);
    s.stats.dealt+=dmg;
  }
  // 虫群选目标：信息素标记优先；母虫附近有敌人就交战，否则跟着母虫走，不各自冲去送死。
  // 号令（狂热）期间不再等母虫，全体直接压上。返回 null 时沿用主世界的就近攻击与破门规则。
  s.focus=mo=>{
    if(!s.active||s.over)return null;
    const p=mo.mesh.position,m=s.mark,q=s.bug;
    if(m&&alive(m.t)&&(s.frenzyT>0||flat(p,m.t.pos)<80))return {pos:m.t.pos,obj:m.t.obj,kind:m.t.kind,r:m.t.r};
    // 第一步只认哨站炮塔：城门有护盾、城头够不着，母虫路过要塞时虫群也不去墙根送死。
    const list=s.phase===1?humans().filter(t=>t.kind==='building'&&t.obj.zergOutpost):humans();
    if(q&&!q.dead&&s.frenzyT<=0&&!list.some(t=>flat(t.pos,q.mesh.position)<ENGAGE||flat(t.pos,p)<ENGAGE-6))
      return {pos:q.mesh.position,obj:null,kind:'escort',r:4.5};
    // 飞虫越墙清城头和内院；城门留给地面虫群按破门规则处理。
    if(mo.fly||s.phase===1){
      let best=null,bd=1e9;
      for(const t of list){if(t.kind==='gate'||t.kind==='base'&&s.phase<3)continue;const d=flat(p,t.pos);if(d<bd){bd=d;best=t;}}
      return best;
    }
    return null;
  };
  s.shielded=()=>s.active&&s.phase===1;
  s.coreOpen=()=>s.active&&s.phase>=3;
  s.shieldHit=()=>{
    if(s.shield)s.shield.material.opacity=.75;
    if(s.shieldT<=0){s.shieldT=2.5;a.showMsg('城门有护盾：先拔除三处哨站',1.8);a.AudioSys.sfx('click');}
  };

  /* ---------- 技能 ---------- */
  function pop(pos,text,cls=''){
    if(s.floats.length>=18)return;
    const el=document.createElement('div');el.className='zg-pop '+cls;el.textContent=text;el.style.transform='translate(-999px,-999px)';$('zgFloat').append(el);
    s.floats.push({el,pos:pos.clone().add(v3(rand(-.5,.5),2.4,rand(-.5,.5))),t:0});
  }
  function gain(n,pos){
    s.biomass+=n;s.stats.biomass+=n;
    if(pos)pop(pos,'+'+n,'bio');
    const el=$('zgBioGain');el.textContent='+'+n;el.classList.add('on');s.bioGainT=1.2;
  }
  function claw(prey){
    const mo=s.bug,E=s.evo;
    s.combo=(s.comboT>0?s.combo:0)+1;s.comboT=1.2;
    const heavy=s.combo%3===0,reach=(heavy?4.5:3.5)*E.clawR,dmg=Math.round(CLAW_DMG*E.claw*(heavy?1.8:1));
    s.cd.claw=heavy?.6:.42;mo.atkCd=1;
    // 小幅前扑：差一点够不着时自动补上。
    if(prey){
      const d=v3(prey.pos.x-mo.mesh.position.x,0,prey.pos.z-mo.mesh.position.z),gap=d.length()-prey.r;
      if(gap>reach*.6&&gap<reach+3)a.moveMonster(mo,d.normalize(),.1,1.5);
    }
    const hits=humansNear(mo.mesh.position,reach);
    for(const t of hits){strike(t,dmg);pop(t.pos,String(dmg),heavy?'big':'');}
    if(!hits.length&&s.shielded()&&flat(mo.mesh.position,a.gate.pos)<9)s.shieldHit();
    const at=mo.mesh.position.clone().add(v3(Math.sin(mo.mesh.rotation.y)*2,1.2,Math.cos(mo.mesh.rotation.y)*2));
    a.spawnParticles(at,hits.length?(heavy?0xffb347:0xffd27a):0x9adf7a,hits.length?(heavy?16:9):3,heavy?6:4,.35,heavy?1.2:.8);
    a.AudioSys.sfx(hits.length?(heavy?'boom':'hit'):'shoot');
  }
  function acid(){
    const mo=s.bug,E=s.evo,fwd=a.camForward(),origin=mo.mesh.position;
    s.cd.acid=1.5*E.acidCd;mo.atkCd=1;
    // 自动瞄准镜头正前方最合适的目标（越正、越近越优先），没有目标就朝前抛。
    let best=null,score=1e9;
    for(const t of humans()){
      const d=v3(t.pos.x-origin.x,0,t.pos.z-origin.z),L=d.length();if(L>36||L<1)continue;
      const dot=d.normalize().dot(fwd);if(dot<.45)continue;
      const sc=L*(1.7-dot);if(sc<score){score=sc;best=t;}
    }
    const from=origin.clone().add(v3(0,2.2,0)).addScaledVector(fwd,1.5);
    const aim=best?best.pos.clone().add(v3(0,best.kind==='gate'?2.5:1,0)):null;
    const dir=aim?aim.clone().sub(from).normalize():fwd.clone();
    a.fireBullet(from,dir,{dmg:Math.round(ACID_DMG*E.acid),speed:34,range:38,spread:.01,explode:2.8,arc:true,color:0x9dff5a},false,aim);
    if(best){s.mark={t:best,time:8};a.spawnParticles(best.pos.clone().add(v3(0,2.5,0)),0xffd36a,6,2,.5,1);}
    a.AudioSys.sfx('grenade');
  }
  function hatch(fly){
    const mo=s.bug,key=fly?'flyer':'brood',cost=Math.round(COST[key]*s.evo.cost);
    if(s.biomass<cost){a.showMsg(`生物量不足（需要 ${cost}）`,1.2);return;}
    if(swarm().length>=SWARM_CAP){a.showMsg('虫群已满，先让它们冲一波',1.2);return;}
    s.biomass-=cost;s.cd[key]=fly?7:5;
    const n=(fly?2:3)+s.evo.brood,p=mo.mesh.position,start=Math.random()*TAU;
    for(let i=0;i<n;i++)spawnBrood(fly?'flyer':'warrior',p.x+Math.sin(start+i*TAU/n)*3.6,p.z+Math.cos(start+i*TAU/n)*3.6,false);
    a.spawnParticles(p.clone().add(v3(0,1,0)),fly?0x7fe0e8:0xb48cff,12,5,.5,1.1);a.AudioSys.sfx('buy');
  }
  function molt(){
    const mo=s.bug,cost=Math.round(COST.molt*s.evo.cost);
    if(mo.hp>=mo.maxHp){a.showMsg('母虫满血，不用蜕皮',1.2);return;}
    if(s.biomass<cost){a.showMsg(`生物量不足（需要 ${cost}）`,1.2);return;}
    s.biomass-=cost;s.cd.molt=8*s.evo.moltCd;s.moltT=3;
    mo.hp=Math.min(mo.maxHp,mo.hp+mo.maxHp*.35);
    a.spawnParticles(mo.mesh.position.clone().add(v3(0,1.4,0)),0x7dffa8,14,3,.7,1);a.AudioSys.sfx('heal');
  }
  function dash(){
    const mo=s.bug;s.cd.dash=5;s.dashT=.9;mo.invuln=Math.max(mo.invuln,.5);
    a.AudioSys.sfx('jump');a.spawnParticles(mo.mesh.position.clone().add(v3(0,.5,0)),0x6b5236,10,5,.4,1);
  }
  function rally(){
    const mo=s.bug;s.cd.rally=22;s.frenzyT=7;wave(s.D.wave+1);
    for(let i=0;i<14;i++){const g=i/14*TAU;a.spawnParticles(mo.mesh.position.clone().add(v3(Math.sin(g)*4,1,Math.cos(g)*4)),0xff7ad1,2,3,.6,1);}
    a.AudioSys.sfx('wave');a.showMsg('号令：虫群狂热 7 秒，增援出巢',1.6);
  }
  const USE={claw:()=>claw(null),acid,brood:()=>hatch(false),flyer:()=>hatch(true),molt,dash,rally};

  /* ---------- 受伤与阵亡 ---------- */
  s.hurt=d=>{
    const mo=s.bug;if(!mo||mo.dead||!s.active||s.over||mo.invuln>0)return;
    d*=s.D.armor*(s.moltT>0?.5:1);
    mo.hp-=d;s.calmT=3.5;s.stats.taken+=d;
    if(mo.hp>0)return;
    mo.dead=true;
    // 母虫死亡不走 killMonster，但要进同一套尸体生命周期，否则网格会留在场景里。
    a.visuals.death(mo.mesh);
    a.spawnParticles(mo.mesh.position.clone().add(v3(0,1.2,0)),0x8bf06a,18,7,.7,1.3);a.AudioSys.sfx('hurt');
    s.deaths++;s.lives--;s.bug=null;s.dashT=0;
    if(s.lives<0){finish(false,'母虫的重生次数用完了，虫群失去指挥后溃散。');return;}
    s.respawnT=3;a.showMsg(`母虫阵亡，3 秒后在${forward().name}重生（还能重生 ${s.lives} 次）`,3);
  };
  s.onKill=(kind,obj)=>{
    if(!s.active||s.over)return;
    if(kind==='squad'){gain(35,obj.mesh.position);s.stats.soldiers++;return;}
    if(kind!=='building'||obj.isWall)return;
    gain(obj.kind==='bunker'?90:45,obj.mesh.position);s.stats.turrets++;
    if(obj===s.mortar){clearShells();a.showMsg('迫击炮阵地被摧毁，炮击停止',2.2);}
    const op=obj.zergOutpost;
    if(op&&!op.cleared&&op.turrets.every(t=>t.dead))clearOutpost(op);
  };
  function clearOutpost(op){
    op.cleared=true;makeBurrow(op.x+op.den[0],op.z+op.den[1],op.name+'地穴');op.pillar.material.color.setHex(0xc46bff);op.pillar.material.opacity=.16;
    gain(100,v3(op.x,a.groundY(op.x,op.z),op.z));s.timeLeft+=BONUS.outpost;
    const left=s.outposts.filter(o=>!o.cleared).length;
    a.AudioSys.sfx('win');wave(s.D.wave+1);
    if(left){a.showMsg(`${op.name}已拔除，地穴成形（+${BONUS.outpost} 秒）· 还剩 ${left} 处`,2.6);return;}
    advance(2);
  }
  function advance(phase){
    s.phase=phase;s.timeLeft+=BONUS.phase;s.mark=null;
    if(phase===2){
      if(s.shield){dropGear(s.shield);s.shield=null;}
      s.shellCd=7;a.showMsg(`三处哨站全部拔除，城门护盾消失（+${BONUS.phase} 秒）`,3);
    }else{
      gain(150,a.gate.mesh.position);
      // 城门一破，坡道下长出新地穴：增援和重生都近了，最后一段不用再从中路跑过来。
      makeBurrow(0,20,'城下地穴');wave(6);
      const made=spawnDefenders(2);G.squadCount=a.squad.length;
      a.showMsg((made?'城门已破！核心守备队出动，冲进内院':'城门已破！冲进内院摧毁核心')+`（+${BONUS.phase} 秒）`,3);
    }
    a.AudioSys.sfx('wave');offerEvolution();
  }

  /* ---------- 进化 ---------- */
  function offerEvolution(){
    const pool=EVOLUTIONS.filter(e=>!s.evoTaken.includes(e.id)),picks=[];
    while(picks.length<3&&pool.length)picks.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
    if(!picks.length)return;
    const row=$('zgEvoRow');row.textContent='';
    for(const e of picks){
      const b=document.createElement('button');b.type='button';b.className='mbtn';b.dataset.evo=e.id;
      b.innerHTML=`<b>${e.name}</b><span>${e.desc}</span>`;b.onclick=()=>evolve(e);row.append(b);
    }
    $('zgEvoInfo').textContent=(s.phase===2?'哨站已清，':'城门已破，')+'母虫吸收生物质完成一次进化。三选一，战斗已暂停。';
    s.frozen=true;a.Input.reset();$('zergEvolve').classList.remove('hidden');
  }
  function evolve(e){
    if(!s.frozen)return;
    e.apply(s.evo);s.evoTaken.push(e.id);
    const mo=s.bug;
    if(mo&&!mo.dead&&e.id==='carapace'){mo.maxHp=Math.round(QUEEN_HP*s.evo.hp);mo.hp=mo.maxHp;}
    s.frozen=false;a.Input.reset();$('zergEvolve').classList.add('hidden');
    a.AudioSys.sfx('buy');a.showMsg('进化完成：'+e.name,2);
  }
  s.evolve=id=>{const e=EVOLUTIONS.find(e=>e.id===id);if(e)evolve(e);};

  /* ---------- 迫击炮炮击 ---------- */
  function launchShell(x,z){
    const g=new T.Group(),y=a.groundY(x,z)+.25;
    const mat=()=>new T.MeshBasicMaterial({color:0xff3a2a,transparent:true,opacity:.85,depthTest:false,depthWrite:false,side:T.DoubleSide});
    const ring=new T.Mesh(new T.RingGeometry(SHELL_R-.4,SHELL_R,40),mat());
    const fill=new T.Mesh(new T.CircleGeometry(SHELL_R,32),mat());fill.material.opacity=.24;fill.scale.setScalar(.05);
    ring.rotation.x=fill.rotation.x=-Math.PI/2;ring.renderOrder=fill.renderOrder=5;g.add(ring,fill);g.position.set(x,y,z);
    s.shells.push({group:addGear(g),ring,fill,x,z,y,t:1.9,total:1.9});
    a.AudioSys.sfx('wave');
  }
  function clearShells(){for(const sh of s.shells)dropGear(sh.group);s.shells.length=0;$('zgWarn').classList.add('hidden');}
  function updShells(dt){
    const mo=s.bug,live=s.phase>=2&&s.mortar&&!s.mortar.dead;
    if(live&&mo&&!mo.dead){
      s.shellCd-=dt;
      if(s.shellCd<=0){s.shellCd=s.D.shell*rand(.8,1.2);launchShell(mo.mesh.position.x+(mo.vx||0)*.8,mo.mesh.position.z+(mo.vz||0)*.8);}
    }
    let danger=false;
    for(let i=s.shells.length-1;i>=0;i--){
      const sh=s.shells[i];sh.t-=dt;
      const k=1-sh.t/sh.total;sh.fill.scale.setScalar(.05+k*.95);sh.ring.material.opacity=.55+.4*Math.sin(k*38);
      if(mo&&!mo.dead&&flat(mo.mesh.position,sh)<SHELL_R+1)danger=true;
      if(sh.t>0)continue;
      const at=v3(sh.x,sh.y+.6,sh.z);
      a.spawnParticles(at,0xffaa33,22,10,.7,1.8,6);a.spawnParticles(at,0xff5511,14,7,.9,2.2,4);a.AudioSys.sfx('boom');
      for(const m of a.monsters()){
        if(m.dead||flat(m.mesh.position,sh)>SHELL_R+m.radius*.5)continue;
        if(m.zergPlayer)s.hurt(460);else a.damageMonster(m,220);
      }
      dropGear(sh.group);s.shells.splice(i,1);
    }
    const warn=$('zgWarn');warn.classList.toggle('hidden',!danger);
    if(danger)warn.textContent='迫击炮来袭：离开红圈'+(s.cd.dash<=0?'，冲刺可脱离':'');
  }

  /* ---------- 开局 / 结束 ---------- */
  function start(){
    if(s.active)return;
    a.AudioSys.init();a.AudioSys.resume();a.AudioSys.pause(false);
    a.bumpRun();a.clearEntities(true);
    s.D=ZERG_DIFFS[s.diff];
    world={gateMax:a.gate.maxHp};
    G.testMode=false;G.difficulty='normal';G.state='battle';G.gold=0;G.score=0;G.loop=1;G.chapter=1;G.level=1;
    G.squadGear=[];G.vehiclesOwned=[];G.opsCompleted={};G.hive={loop:1,chapter:1,queen:1,killed:false};
    a.base.maxHp=s.D.coreHp;a.base.hp=a.base.maxHp;a.updHPBar(a.base.bar,1);
    a.gate.dead=false;a.gate.hp=a.gate.maxHp=s.D.gateHp;a.updHPBar(a.gate.bar,1);a.gate.open=false;a.gate.auto=false;
    Object.assign(s,{active:true,over:false,frozen:false,phase:1,timeLeft:s.D.time,elapsed:0,biomass:100,lives:s.D.lives,deaths:0,bug:null,respawnT:0,
      cd:{claw:0,acid:0,brood:0,flyer:0,molt:0,dash:0,rally:8},dashT:0,moltT:0,frenzyT:0,calmT:0,combo:0,comboT:0,mark:null,shellCd:0,waveT:10,
      shieldT:0,evoTaken:[],hudT:0,bioGainT:0,dens:[],
      evo:{hp:1,claw:1,clawR:1,acid:1,acidCd:1,brood:0,cost:1,swarmDmg:1,swarmSpd:1,regen:0,moltCd:1},
      stats:{soldiers:0,turrets:0,hatched:0,dealt:0,taken:0,biomass:0}});
    buildFortress();buildOutposts();buildShield();garrison();
    a.player.dead=true;a.player.mesh.visible=false;a.player.inVehicle=null;
    a.enterView();spawnQueen();
    const q=s.bug.mesh.position;
    for(let i=0;i<8;i++)spawnBrood(i<2?'warrior':'drone',q.x+Math.sin(i/8*TAU)*5,q.z+3+Math.cos(i/8*TAU)*5,false);
    stage.classList.add('zerg-mode');
    $('hud').classList.remove('hidden');hud.classList.remove('hidden');
    $('touchUI').classList.toggle('hidden',!a.isTouch());
    for(const id of ['menuMain','menuPause','menuOver','zergMenu','zergResult','zergEvolve'])$(id).classList.add('hidden');
    $('zgWarn').classList.add('hidden');
    relabel();updHud();
    a.showMsg('第一步：拔除三处哨站，跟着金色标记走',4);a.AudioSys.sfx('wave');
  }
  function grade(){
    const left=s.timeLeft/s.D.time;
    return s.deaths===0&&left>=.3?'S':s.deaths<=1||left>=.25?'A':'B';
  }
  function finish(win,reason){
    if(s.over)return;
    s.over=true;s.frozen=false;G.state='over';
    const g=win?grade():'',rec=saveBest(win,g),st=s.stats,d=s.D;
    $('zergEvolve').classList.add('hidden');
    $('zgResultTitle').textContent=win?'要塞陷落 · 虫族胜利':'进攻失败 · 虫群溃散';
    $('zgGrade').textContent=win?'评级 '+g:'';
    $('zgResultInfo').textContent=reason+(win?'':` 本次推进到第 ${s.phase} 步「${['','拔除哨站','攻破城门','摧毁核心'][s.phase]}」。`);
    $('zgStats').innerHTML=[['用时',fmt(s.elapsed)],win?['剩余时间',fmt(s.timeLeft)]:['推进到','第 '+s.phase+' 步'],['母虫阵亡',s.deaths+' 次'],['击杀守军',st.soldiers],['摧毁设施',st.turrets],['孵化虫群',st.hatched]]
      .map(([k,v])=>`<div>${k}<b>${v}</b></div>`).join('');
    $('zgResultBest').textContent=`${d.name}难度战绩：${rec.wins} 胜 / ${rec.runs} 局`+(rec.bestTime?` · 最快 ${fmt(rec.bestTime)} · 最高评级 ${rec.grade}`:'')+
      (s.evoTaken.length?' · 本局进化：'+s.evoTaken.map(id=>EVOLUTIONS.find(e=>e.id===id).name).join('、'):'');
    clearShells();relabel(false);
    $('hud').classList.add('hidden');hud.classList.add('hidden');$('touchUI').classList.add('hidden');$('menuPause').classList.add('hidden');
    $('zergResult').classList.remove('hidden');
    a.AudioSys.sfx(win?'win':'lose');
  }
  s.victory=()=>{if(s.active)finish(true,'基地核心被咬碎，人类要塞陷落。');};
  s.defeat=reason=>{if(s.active)finish(false,reason);};
  // quiet：紧接着重开或回到简报，不显示主菜单。
  function stop(quiet){
    if(!s.active)return;
    s.active=false;s.over=false;s.frozen=false;s.bug=null;s.mark=null;s.mortar=null;s.shield=null;
    for(const f of s.floats)f.el.remove();s.floats.length=0;
    s.shells.length=0;for(const m of [...s.gear])dropGear(m);s.outposts=[];s.dens=[];
    stage.classList.remove('zerg-mode');relabel(false);
    hud.classList.add('hidden');$('hud').classList.add('hidden');$('touchUI').classList.add('hidden');
    a.clearEntities(true);
    a.gate.maxHp=world.gateMax;a.gate.hp=a.gate.maxHp;a.gate.dead=false;a.updHPBar(a.gate.bar,1);
    a.base.maxHp=a.baseMaxHp();a.base.hp=a.base.maxHp;a.updHPBar(a.base.bar,1);
    a.player.dead=false;a.player.mesh.visible=true;a.leaveView();
    G.state='menu';
    for(const id of ['menuOver','menuPause','zergResult','zergEvolve','zergMenu'])$(id).classList.add('hidden');
    if(!quiet)$('menuMain').classList.remove('hidden');
  }
  s.stop=()=>stop();
  s.restart=()=>{stop(true);start();};
  s.start=id=>{if(ZERG_DIFFS[id])s.diff=id;start();};

  /* ---------- 每帧 ---------- */
  function control(dt){
    const mo=s.bug,I=a.Input,E=s.evo;
    mo.invuln=Math.max(0,mo.invuln-dt);
    s.dashT=Math.max(0,s.dashT-dt);s.moltT=Math.max(0,s.moltT-dt);s.calmT=Math.max(0,s.calmT-dt);s.comboT-=dt;
    const ax=I.axis(),yaw=a.getCamYaw(),cs=Math.cos(yaw),sn=Math.sin(yaw),f=-ax.y,r=ax.x;
    const mvx=f*sn-r*cs,mvz=f*cs+r*sn,moving=Math.hypot(mvx,mvz)>.08;
    const body=mo.mesh.rotation.y;
    let face=null;
    if(moving){const dir=v3(mvx,0,mvz).normalize();a.moveMonster(mo,dir,dt,s.dashT>0?2.3:1);face=Math.atan2(dir.x,dir.z);}
    else if(s.dashT>0)a.moveMonster(mo,v3(Math.sin(body),0,Math.cos(body)),dt,2.3); // 站着按冲刺：朝身体前方突进
    else{mo.vx=mo.vz=0;face=yaw;} // 站定时身体跟随视角
    // 山丘碉堡的门只有三米多宽：母虫进得去出不来，当成实心挡在外面。
    for(const o of OUTPOSTS){
      if(!o.fort)continue;
      const q=mo.mesh.position,dx=q.x-o.x,dz=q.z-o.z,lim=FORT_HALF+mo.radius;
      if(Math.abs(dx)>=lim||Math.abs(dz)>=lim)continue;
      if(Math.abs(dx)>Math.abs(dz))q.x=o.x+(dx<0?-lim:lim);else q.z=o.z+(dz<0?-lim:lim);
      q.y=a.groundY(q.x,q.z);
    }
    // 自动撕咬：够得着的目标优先；按住撕咬键可以空挥。
    const reach=3.5*E.clawR,prey=humansNear(mo.mesh.position,reach+3.5).sort((p,q)=>flat(p.pos,mo.mesh.position)-p.r-flat(q.pos,mo.mesh.position)+q.r)[0];
    const inReach=prey&&flat(prey.pos,mo.mesh.position)<=reach+prey.r;
    if(prey&&(inReach||!moving))face=Math.atan2(prey.pos.x-mo.mesh.position.x,prey.pos.z-mo.mesh.position.z);
    if(face!==null){const turn=Math.atan2(Math.sin(face-body),Math.cos(face-body));mo.mesh.rotation.y=body+clamp(turn,-dt*11,dt*11);}
    if(I.pop('C'))a.cycleView();
    const biteKey=I.pop('J')||I.keys.J||I.mouseFire;
    if(s.cd.claw<=0&&(inReach||biteKey))claw(prey);
    for(const ab of ABILITIES){
      if(ab.id==='claw'||!I.pop(ab.key))continue;
      if(s.cd[ab.id]>0){a.showMsg(`${ab.name}冷却中（${Math.ceil(s.cd[ab.id])} 秒）`,.9);continue;}
      USE[ab.id]();
    }
    // 回复：再生进化常驻；脱战后站在地穴旁快速恢复。
    let heal=E.regen;
    if(s.calmT<=0&&s.dens.some(d=>flat(d,mo.mesh.position)<12))heal+=.05;
    if(heal>0&&mo.hp<mo.maxHp)mo.hp=Math.min(mo.maxHp,mo.hp+mo.maxHp*heal*dt);
    a.visuals.animate(mo.mesh,dt,mo.atkCd>.75?'Attack':moving||s.dashT>0?'Run':'Idle',a.camera);
    if(typeof mo.mesh.userData.tick==='function')mo.mesh.userData.tick(dt,performance.now()/1000);
    mo.atkCd=Math.max(0,(mo.atkCd||0)-dt);
    // 镜头锚点借用休眠的人类玩家对象：第三人称抬到背甲之上，第一人称放到头部前方。
    const p=mo.mesh.position,first=a.getCamMode()==='first',h=mo.mesh.rotation.y;
    if(first)a.player.pos.set(p.x+Math.sin(h)*2.4,p.y+.35,p.z+Math.cos(h)*2.4);
    else a.player.pos.set(p.x,p.y+1.9,p.z);
    a.player.yaw=h;a.player.sprinting=s.dashT>0;
  }
  function update(dt){
    if(!s.active||s.over||s.frozen)return;
    s.timeLeft-=dt;s.elapsed+=dt;
    if(s.timeLeft<=0){finish(false,'时间到：人类援军抵达，虫群被反推。');return;}
    for(const k in s.cd)s.cd[k]=Math.max(0,s.cd[k]-dt);
    s.biomass+=s.D.passive*dt;
    s.frenzyT=Math.max(0,s.frenzyT-dt);s.shieldT=Math.max(0,s.shieldT-dt);
    if(s.mark&&((s.mark.time-=dt)<=0||!alive(s.mark.t)))s.mark=null;
    if(s.shield){const m=s.shield.material;m.opacity+=(.26+.08*Math.sin(s.elapsed*3)-m.opacity)*Math.min(1,dt*5);}
    if(s.bioGainT>0&&(s.bioGainT-=dt)<=0)$('zgBioGain').classList.remove('on');
    // 城门由技能之外的途径被攻破（虫群咬开）时同样进入第三步。
    if(s.phase===2&&a.gate.dead)advance(3);
    if(s.frozen)return;
    const mo=s.bug;
    if(mo&&!mo.dead)control(dt);
    else if(!mo&&(s.respawnT-=dt)<=0){spawnQueen();a.showMsg('母虫重生，继续进攻',1.8);}
    // 虫群增益与定时增援
    const E=s.evo,fr=s.frenzyT>0;
    for(const m of a.monsters()){if(m.dead||!m.zBase)continue;m.dmg=m.zBase.dmg*E.swarmDmg*(fr?1.5:1);m.speed=m.zBase.speed*E.swarmSpd*(fr?1.35:1);}
    if((s.waveT-=dt)<=0){s.waveT=14;if(swarm().length<SWARM_CAP-4)wave(s.D.wave);}
    updShells(dt);
    updFloats(dt);updMarker();
    if((s.hudT-=dt)<=0){s.hudT=.1;updHud();}
  }
  s.update=update;

  /* ---------- 战况界面 ---------- */
  function objective(){
    if(s.phase===1){
      const from=s.bug?s.bug.mesh.position:a.player.pos;
      const op=s.outposts.filter(o=>!o.cleared).sort((p,q)=>flat(p,from)-flat(q,from))[0];
      return op?{x:op.x,z:op.z,y:a.groundY(op.x,op.z)+4,name:op.name}:null;
    }
    if(s.phase===2)return {x:a.gate.pos.x,z:a.gate.pos.z,y:a.groundY(a.gate.pos.x,a.gate.pos.z)+5,name:'城门'};
    return {x:a.base.pos.x,z:a.base.pos.z,y:a.groundY(a.base.pos.x,a.base.pos.z)+6,name:'基地核心'};
  }
  const _p=v3();
  function updMarker(){
    const el=$('zgMarker'),o=objective(),from=s.bug?s.bug.mesh.position:a.player.pos;
    if(!o){el.style.transform='translate(-999px,-999px)';return;}
    const W=stage.clientWidth,H=stage.clientHeight,dist=Math.round(Math.hypot(o.x-from.x,o.z-from.z));
    _p.set(o.x,o.y,o.z).project(a.camera);
    let x=_p.x,y=_p.y;const behind=_p.z>1;
    if(behind){x=-x;y=-y;}
    const off=behind||Math.abs(x)>.86||Math.abs(y)>.8;
    if(off){const k=Math.max(Math.abs(x)/.86,Math.abs(y)/.8,1e-3);x/=k;y/=k;if(behind&&Math.abs(y)<.8&&Math.abs(x)<.86)y=-.8;}
    // 让开顶部战况条、右上角按钮与雷达、底部技能栏
    let sx=clamp((x*.5+.5)*W,70,W-70),sy=clamp((-y*.5+.5)*H,128,H-104);
    if(sx>W-300&&sy<290)sx=W-300;
    el.classList.toggle('edge',off);
    el.style.transform=`translate(${sx}px,${sy}px) translate(-50%,-50%)`;
    el.firstElementChild.style.transform=off?`rotate(${Math.atan2(-y,x)-Math.PI*.75}rad)`:'rotate(45deg)';
    el.lastElementChild.textContent=`${o.name} ${dist}米`;
  }
  function updFloats(dt){
    const W=stage.clientWidth,H=stage.clientHeight;
    for(let i=s.floats.length-1;i>=0;i--){
      const f=s.floats[i];f.t+=dt;f.pos.y+=dt*1.8;_p.copy(f.pos).project(a.camera);
      if(f.t>.8||_p.z>1){f.el.remove();s.floats.splice(i,1);continue;}
      f.el.style.transform=`translate(${(_p.x*.5+.5)*W}px,${(-_p.y*.5+.5)*H}px) translate(-50%,-50%)`;
      f.el.style.opacity=String(Math.min(1,(.8-f.t)*4));
    }
  }
  function relabel(on=true){
    const touch=on&&a.isTouch();
    if(touch&&!labels){labels={};for(const ab of ABILITIES){const el=$(ab.touch);if(el)labels[ab.touch]={text:el.textContent,aria:el.getAttribute('aria-label')};}}
    if(!on&&labels){
      for(const [id,old] of Object.entries(labels)){const el=$(id);if(!el)continue;el.textContent=old.text;el.classList.remove('zg-wait','zg-cooling');if(old.aria===null)el.removeAttribute('aria-label');else el.setAttribute('aria-label',old.aria);}
      labels=null;
    }
  }
  function updHud(){
    const mo=s.bug,E=s.evo,D=s.D,touch=a.isTouch();
    const ratio=mo&&!mo.dead?clamp(mo.hp/mo.maxHp,0,1):0;
    $('zgHp').style.width=(ratio*100).toFixed(1)+'%';$('zgHp').classList.toggle('low',ratio<.35);
    $('zgLives').innerHTML=mo?'◆'.repeat(Math.max(0,s.lives))+'<i>'+'◆'.repeat(Math.max(0,D.lives-s.lives))+'</i>':`重生 ${Math.max(0,Math.ceil(s.respawnT))}s`;
    $('zgBio').textContent=Math.floor(s.biomass);$('zgSwarm').textContent=swarm().length;
    $('zgMark').textContent=s.frenzyT>0?`狂热 ${Math.ceil(s.frenzyT)}s`+(s.mark?' · 集火 '+nameOf(s.mark.t):''):s.mark?`集火 ${nameOf(s.mark.t)} ${Math.ceil(s.mark.time)}s`:'';
    $('zgEvo').textContent=s.evoTaken.map(id=>EVOLUTIONS.find(e=>e.id===id).name).join(' · ');
    for(const el of $('zgPhases').querySelectorAll('span')){const p=+el.dataset.p;el.className=p<s.phase?'done':p===s.phase?'now':'';}
    const clock=$('zgClock');clock.textContent=fmt(s.timeLeft);clock.classList.toggle('low',s.timeLeft<60);
    let text,bar;
    if(s.phase===1){
      const all=s.outposts.flatMap(o=>o.turrets),dead=all.filter(t=>t.dead).length,done=s.outposts.filter(o=>o.cleared).length;
      text=`哨站 ${done} / ${s.outposts.length} · 炮塔还剩 ${all.length-dead} 座`;bar=dead/Math.max(1,all.length);
    }else if(s.phase===2){bar=a.gate.hp/a.gate.maxHp;text=`城门耐久 ${Math.max(0,Math.round(bar*100))}%`+(s.mortar&&!s.mortar.dead?' · 迫击炮在内院东侧':'');}
    else{bar=a.base.hp/a.base.maxHp;text=`基地核心 ${Math.max(0,Math.round(bar*100))}%`;}
    $('zgGoalTxt').textContent=text;$('zgGoalBar').style.width=(clamp(bar,0,1)*100).toFixed(1)+'%';
    relabel();
    for(const ab of ABILITIES){
      const cd=s.cd[ab.id]||0,cost=ab.cost?Math.round(COST[ab.cost]*E.cost):0,short=cost>s.biomass,wait=cd>.05;
      if(touch){
        const el=$(ab.touch);if(!el)continue;
        const cooling=wait&&ab.id!=='claw',t=(ab.short||ab.name)+(cooling?String.fromCharCode(10)+Math.ceil(cd)+'s':'');
        if(el.textContent!==t)el.textContent=t;
        el.classList.toggle('zg-cooling',cooling);el.classList.toggle('zg-wait',cooling||short);el.setAttribute('aria-label',ab.name+(cost?`，消耗 ${cost} 生物量`:''));
        continue;
      }
      const el=ab.el,k=a.keyLabel(ab.key);
      if(el.firstElementChild.textContent!==k)el.firstElementChild.textContent=k;
      el.children[2].textContent=wait&&ab.id!=='claw'?Math.ceil(cd)+'s':cost?String(cost):'';
      el.classList.toggle('wait',wait&&ab.id!=='claw');el.classList.toggle('short',short);
      el.lastElementChild.style.height=ab.id==='claw'?'0':clamp(cd/({acid:1.5,brood:5,flyer:7,molt:8,dash:5,rally:22}[ab.id]||1),0,1)*100+'%';
    }
    drawRadar();
  }
  const radar=$('zgRadar'),rc=radar.getContext('2d');
  function drawRadar(){
    const W=radar.width,cx=W/2,R=W/2-4,range=120,sc=R/range,yaw=a.getCamYaw(),c=Math.cos(yaw),sn=Math.sin(yaw);
    const p=s.bug?s.bug.mesh.position:a.player.pos;
    const to=(x,z)=>{const dx=x-p.x,dz=z-p.z;return [cx+(-dx*c+dz*sn)*sc,cx-(dx*sn+dz*c)*sc];};
    rc.clearRect(0,0,W,W);rc.save();
    rc.beginPath();rc.arc(cx,cx,R,0,TAU);rc.fillStyle='rgba(14,8,20,.8)';rc.fill();rc.clip();
    const dot=(x,z,r,col,sq)=>{const [X,Y]=to(x,z);rc.fillStyle=col;rc.beginPath();if(sq)rc.rect(X-r,Y-r,r*2,r*2);else rc.arc(X,Y,r,0,TAU);rc.fill();};
    rc.lineWidth=3;
    for(const o of s.outposts)if(!o.cleared){const [X,Y]=to(o.x,o.z);rc.strokeStyle='#5fd0ff';rc.beginPath();rc.arc(X,Y,9,0,TAU);rc.stroke();}
    for(const d of s.dens){const [X,Y]=to(d.x,d.z);rc.strokeStyle='#c46bff';rc.beginPath();rc.arc(X,Y,7,0,TAU);rc.stroke();}
    for(const bd of a.buildings)if(!bd.dead)dot(bd.mesh.position.x,bd.mesh.position.z,3,'#8fd6ff',true);
    if(!a.gate.dead)dot(a.gate.pos.x,a.gate.pos.z,5,s.phase===1?'#58c8ff':'#ffd36a',true);
    dot(a.base.pos.x,a.base.pos.z,7,s.phase>=3?'#ffd36a':'#3fa9ff',true);
    for(const q of a.squad)if(!q.dead)dot(q.mesh.position.x,q.mesh.position.z,3,'#5ff0e0');
    for(const m of a.monsters())if(!m.dead&&!m.zergPlayer)dot(m.mesh.position.x,m.mesh.position.z,2.6,m.fly?'#7fe0e8':'#ff8a5a');
    for(const sh of s.shells){const [X,Y]=to(sh.x,sh.z);rc.strokeStyle='#ff3a2a';rc.lineWidth=2;rc.beginPath();rc.arc(X,Y,SHELL_R*sc+2,0,TAU);rc.stroke();}
    rc.restore();
    // 当前目标超出雷达范围时贴边显示方向
    const o=objective();
    if(o){const [X,Y]=to(o.x,o.z),d=Math.hypot(X-cx,Y-cx);
      if(d>R-6){const g=Math.atan2(Y-cx,X-cx);rc.save();rc.translate(cx+Math.cos(g)*(R-8),cx+Math.sin(g)*(R-8));rc.rotate(g);rc.fillStyle='#ffd36a';rc.beginPath();rc.moveTo(9,0);rc.lineTo(-6,-7);rc.lineTo(-6,7);rc.fill();rc.restore();}
      else{rc.strokeStyle='#ffd36a';rc.lineWidth=2;rc.beginPath();rc.arc(X,Y,12,0,TAU);rc.stroke();}}
    if(s.bug){rc.save();rc.translate(cx,cx);rc.rotate(-(s.bug.mesh.rotation.y-yaw));rc.fillStyle='#fff';rc.beginPath();rc.moveTo(0,-9);rc.lineTo(7,7);rc.lineTo(-7,7);rc.closePath();rc.fill();rc.restore();}
    rc.strokeStyle='rgba(190,150,230,.6)';rc.lineWidth=2;rc.beginPath();rc.arc(cx,cx,R,0,TAU);rc.stroke();
  }

  // 主菜单入口：排在自由测试之前，与其他独立玩法并列。
  const anchor=$('btnTest'),row=anchor?anchor.parentNode:$('modeRow')||document.querySelector('#menuMain .btnRow');
  if(row&&!$('btnZerg')){
    const b=document.createElement('button');
    b.type='button';b.className='lobbyCard';b.id='btnZerg';b.dataset.mode='zerg';
    b.innerHTML='<strong>虫族模式 · 攻陷人类要塞</strong><span>扮演母虫 · 三段攻城 · 进化增援</span>';
    b.onclick=openMenu;
    if(anchor)row.insertBefore(b,anchor);else row.appendChild(b);
  }
  return s;
}

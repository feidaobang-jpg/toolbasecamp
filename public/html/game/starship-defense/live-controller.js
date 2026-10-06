import {LiveSession,MODES,SUPPORTS} from './live-rules.js';

// This adapter is instantiated only by the live entry. Ordinary game input and
// the campaign wave clock remain untouched when no controller is installed.
export function createLiveController(api){
  const session=new LiveSession();let spawnClock=0,snapshotClock=0,voteClock=0,directorClock=0,axis={x:0,y:0},active=false,boss=false;
  const tell=(type,data)=>{if(window.parent!==window)window.parent.postMessage({channel:'chongchao-live',type,...data},location.origin);};
  const say=(text,kind='game')=>{session.record('战地副官',text);tell('story',{text,kind});};
  const reset=()=>{api.reset();session.next();spawnClock=2;voteClock=0;boss=false;active=false;say('第'+session.round+'场守城开始整备。弹幕加入、选兵种，守城或跟随可投票。');};
  const ai=()=>session.running&&session.phase!=='result'&&session.mode!=='assist'&&!api.blocked();
  const changeMode=mode=>{if(!session.setMode(mode))return false;api.clearInput();axis={x:0,y:0};say('切换为'+MODES[mode]+'，本局继续。');return true;};
  const support=action=>{
    if(!session.running||session.phase==='result')return {ok:false,reason:'当前未在整备或战斗中'};
    const result=api.support(action);if(result.ok)say(SUPPORTS[action]+'已执行：'+result.detail,'support');return result;
  };
  const event=e=>{
    const result=session.receive(e);if(!result.ok)return result;
    if(result.action in SUPPORTS){const r=support(result.action);if(r.ok)session.record(result.name,SUPPORTS[result.action]);return r;}
    if(result.action==='join'){session.record(result.name,'加入'+({medic:'医疗',engineer:'工程',assault:'突击',gunner:'机枪'}[result.role])+'组');api.role(result.role);}
    if(result.action==='vote')session.record(result.name,'策略投票已更新');
    if(result.action==='rules')say('守住基地五分钟获胜。弹幕免费加入、选兵种、投票；支援效果见规则面板。');
    if(result.action==='chat')tell('chat',{name:result.name,text:result.text});
    return result;
  };
  window.addEventListener('message',e=>{
    if(e.origin!==location.origin||e.source!==window.parent||e.data?.channel!=='chongchao-live')return;
    const {type,data}=e.data;let result;
    if(type==='start'){if(!session.running)reset();}
    else if(type==='mode')changeMode(data);
    else if(type==='pause'){session.running=false;api.pause(true);api.clearInput();say('直播玩法已暂停，互动效果暂停执行。');}
    else if(type==='resume'){if(session.phase==='idle')reset();else{session.running=true;api.pause(false);}}
    else if(type==='restart')reset();
    else if(type==='event'){result=event(data);tell('receipt',{id:data?.id,...result});}
    else if(type==='camera')api.camera(data);
  });
  const originalAxis=api.input.axis.bind(api.input),originalFire=api.input.firing.bind(api.input);
  api.input.axis=()=>ai()?axis:originalAxis();
  api.input.firing=hasTarget=>ai()?hasTarget:originalFire(hasTarget);
  tell('ready',{});
  return {
    session,event,changeMode,support,
    tick(dt){
      const wallNow=performance.now();if(wallNow-snapshotClock>500){snapshotClock=wallNow;tell('state',{data:{...session.snapshot(),...api.snapshot()}});}
      if(!session.running)return;
      if(session.phase!=='result'&&api.blocked())return;
      session.tick(dt);active=ai();
      if(session.phase==='result'){if(session.remaining===0)reset();return;}
      if(api.failed()){session.finish(false);axis={x:0,y:0};say('基地失守，本场结束。稍后重新整备。','result');return;}
      if(session.phase==='prep'&&session.remaining===0){api.begin();session.phase='battle';session.elapsed=0;session.remaining=session.roundSeconds;spawnClock=.1;say('虫潮来袭！守住基地五分钟，免费弹幕也能参与。');}
      if(session.phase==='battle'){
        if(session.remaining===0){session.finish(true);api.pause(true);axis={x:0,y:0};say('守城成功！本场'+session.viewers.size+'位观众参加，下一场即将开始。','result');return;}
        spawnClock-=dt;
        if(spawnClock<=0){for(let n=0;n<1+Math.floor(session.elapsed/90);n++)api.spawn('mob',session.round);spawnClock=Math.max(1.3,3.8-session.elapsed/150);}
        if(!boss&&session.remaining<=60){boss=true;api.spawn('miniboss',session.round);say('先锋首领登场，最后一分钟！');}
      }
      voteClock+=dt;if(voteClock>=20){voteClock=0;const order=session.winner();api.order(order);if(session.votes.size)say('本轮投票结果：'+(order==='defend'?'小队守城':'小队跟随总指挥')+'。');session.votes.clear();}
      if(active){axis=api.drive();api.heal();directorClock+=dt;if(directorClock>=15){directorClock=0;api.director?.();}}else axis={x:0,y:0};
    }
  };
}

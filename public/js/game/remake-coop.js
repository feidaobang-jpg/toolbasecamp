import {CooperativeLobby} from './coop.js?v=lobby-hint1';
export function installRemakeCoop({game,container,menu,getConfig,onStart,onState,onEnd,onAction,getState,getInput,getUI,onGuestFrame=()=>{},notify=()=>{}}){
 const driver={snapshot:getState,config:null,applying:false,lastSend:0,lastInput:0,result:null,lobby:null};
 driver.lobby=new CooperativeLobby({
  game,container,menu,getConfig,
  onOpen:()=>{},
  onStart:config=>{driver.config={...config,localSlot:driver.connection.slot};driver.result=null;driver.applying=true;try{onStart(driver.config);}finally{driver.applying=false;}},
  onMessage:m=>{
   if(m.type==='state'&&!driver.connection.host&&driver.config){driver.applying=true;try{onState(m.state);}finally{driver.applying=false;}}
   else if(m.type==='action'&&driver.connection.host){driver.applying=true;try{onAction(m.action);}finally{driver.applying=false;}driver.lastSend=0;}
   else if(m.type==='player_joined'&&driver.config){
    driver.config.playerSlots=driver.connection.room.players.map(p=>p.slot);
    driver.config.playerChoices=Object.fromEntries(driver.connection.room.players.map(p=>[p.slot,p.hero]));
    onJoin(m);driver.lastSend=0;notify(m.message);
   }
   else if(m.type==='control'){notify(m.message);driver.lobby.roster();}
   else if(m.type==='player_left'){
    if(driver.connection.room)driver.connection.room.players=driver.connection.room.players.filter(p=>p.slot!==m.slot);
    if(driver.config)driver.config.playerSlots=driver.config.playerSlots.filter(s=>s!==m.slot);
    onEnd(m);notify(m.message);
   }
   else if(m.type==='ended'){driver.config=null;driver.applying=true;try{onEnd(m);}finally{driver.applying=false;}}
  }
 });
 driver.connection=driver.lobby.connection;
 const pauseMenu=(container.querySelector('[data-act="resume"]')||container.querySelector('#btnResume'))?.parentElement;
 if(pauseMenu&&pauseMenu!==menu){const b=driver.lobby.entry.cloneNode(true);b.dataset.act='team';b.textContent='房间与队友';b.onclick=()=>driver.lobby.open();pauseMenu.append(b);}
 const status=document.createElement('div');status.className='coop-control-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='position:absolute;bottom:100px;left:25%;width:50%;text-align:center;pointer-events:none;font:12px system-ui;color:#fff;background:#142018bb;border-radius:6px;z-index:90';status.hidden=true;container.append(status);
 driver.action=kind=>{
  if(!driver.config||!driver.connection.active||driver.applying)return false;
  if(!driver.connection.host&&['restart','retry','next'].includes(kind)){notify('由房主重开或进入下一关');return true;}
  driver.connection.send({type:'action',action:kind});return true;
 };
 driver.leave=()=>{driver.connection.disconnect();driver.config=null;driver.result=null;};
 driver.tick=now=>{
  status.hidden=!driver.config||!driver.connection.active;
  if(status.hidden)return;
  const ui=getUI();driver.connection.controlTick(!!ui.paused);
  status.textContent=driver.connection.room.players.map(p=>(p.slot+1)+'P '+(p.ai?'电脑':'真人')).join(' · ')+(driver.connection.bots.has(driver.connection.slot)?' · 操作即可接回':' · 闲置30秒电脑接管');
  if(!driver.connection.host){onGuestFrame();if(now-driver.lastInput>=30){driver.connection.send({type:'input',input:getInput()});driver.lastInput=now;}}
  else if(now-driver.lastSend>=65){const state={game:getState(),ui:{...getUI(),result:driver.result}};if(driver.connection.send({type:'state',state}))driver.lastSend=now;}
 };
 window.addEventListener('pagehide',()=>driver.leave());
 if(new URLSearchParams(location.search).get('test')==='1')window.__COOP_QA__=driver;
 return driver;
}

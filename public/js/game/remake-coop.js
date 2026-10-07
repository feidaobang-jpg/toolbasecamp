import {CooperativeLobby} from './coop.js';
export function installRemakeCoop({game,container,menu,getConfig,onStart,onState,onEnd,onAction,getState,getInput,getUI,onGuestFrame=()=>{},notify=()=>{}}){
 const driver={snapshot:getState,config:null,applying:false,lastSend:0,lastInput:0,result:null,lobby:null};
 driver.lobby=new CooperativeLobby({
  game,container,menu,getConfig,
  onOpen:()=>{},
  onStart:config=>{driver.config={...config,localSlot:driver.connection.slot};driver.result=null;driver.applying=true;try{onStart(driver.config);}finally{driver.applying=false;}},
  onMessage:m=>{
   if(m.type==='state'&&!driver.connection.host&&driver.config){driver.applying=true;try{onState(m.state);}finally{driver.applying=false;}}
   else if(m.type==='action'&&driver.connection.host){driver.applying=true;try{onAction(m.action);}finally{driver.applying=false;}driver.lastSend=0;}
   else if(m.type==='player_left'){
    if(driver.connection.room)driver.connection.room.players=driver.connection.room.players.filter(p=>p.slot!==m.slot);
    if(driver.config)driver.config.playerSlots=driver.config.playerSlots.filter(s=>s!==m.slot);
    onEnd(m);
   }
   else if(m.type==='ended'){driver.config=null;driver.applying=true;try{onEnd(m);}finally{driver.applying=false;}}
  }
 });
 driver.connection=driver.lobby.connection;
 driver.action=kind=>{
  if(!driver.config||!driver.connection.active||driver.applying)return false;
  if(!driver.connection.host&&['restart','retry','next'].includes(kind)){notify('由房主重开或进入下一关');return true;}
  driver.connection.send({type:'action',action:kind});return true;
 };
 driver.leave=()=>{driver.connection.disconnect();driver.config=null;driver.result=null;};
 driver.tick=now=>{
  if(!driver.config||!driver.connection.active)return;
  if(!driver.connection.host){onGuestFrame();if(now-driver.lastInput>=30){driver.connection.send({type:'input',input:getInput()});driver.lastInput=now;}}
  else if(now-driver.lastSend>=65){const state={game:getState(),ui:{...getUI(),result:driver.result}};if(driver.connection.send({type:'state',state}))driver.lastSend=now;}
 };
 window.addEventListener('pagehide',()=>driver.leave());
 if(new URLSearchParams(location.search).get('test')==='1')window.__COOP_QA__=driver;
 return driver;
}


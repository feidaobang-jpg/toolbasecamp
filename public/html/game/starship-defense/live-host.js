import {MODES} from './live-rules.js';
const $=id=>document.getElementById(id),frame=$('game'),local=['127.0.0.1','localhost'].includes(location.hostname);
const bus=new BroadcastChannel('chongchao-live');let ready=false,started=false,ws=null,owner=!local,voice=true,holdUntil=0,snapshot=null,gameReady=false,lastCaption=0;
let pending=[];const audio=new Audio();audio.preload='auto';
const sendGame=(type,data)=>{if(!gameReady){pending.push({type,data});return;}frame.contentWindow.postMessage({channel:'chongchao-live',type,data},location.origin);};
const speak=text=>{if(!voice||Date.now()<holdUntil)return;if(!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='zh-CN';u.rate=1.05;const v=speechSynthesis.getVoices().find(v=>v.lang==='zh-CN');if(v)u.voice=v;speechSynthesis.speak(u);};
function caption(text,source='固定战况播报',wav){$('caption').textContent=String(text).slice(0,180);lastCaption=Date.now();if(voice&&Date.now()>=holdUntil){if(wav){audio.src=wav;audio.play().catch(()=>speak(text));}else speak(text);}bus.postMessage({type:'caption',text,source});}
function control(m){
  if(!owner)return;
  if(m.type==='voice'){voice=!!m.data;if(!voice){audio.pause();speechSynthesis?.cancel();}return;}
  if(m.type==='hold'){holdUntil=Date.now()+10000;audio.pause();if('speechSynthesis'in window)speechSynthesis.cancel();return;}
  if(m.type==='start'){started=true;$('startPanel').hidden=true;frame.contentWindow.focus();}
  sendGame(m.type,m.data);
}
function status(data){$('source').textContent=data.bili==='connected'?'B站真实互动已连接':'本地演示 · 未连接B站';$('status').textContent=data.warning||'';}
function connect(){
  ws=new WebSocket(location.origin.replace(/^http/,'ws')+'/live-ws');
  ws.onopen=()=>ws.send(JSON.stringify({type:'hello',role:'game'}));
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='lease'){owner=m.owner;if(!owner){$('status').textContent='已有另一个直播画面运行；本窗口不执行互动';return;}if(m.autostart)control({type:'start'});}
    if(m.type==='control')control({type:m.command,data:m.data});if(m.type==='event')control({type:'event',data:m.data});if(m.type==='status')status(m.data);if(m.type==='speech')caption(m.text,m.source,m.audio);};
  ws.onclose=()=>{$('source').textContent='本机连接断开 · 互动暂停';if(owner&&started)sendGame('pause');setTimeout(connect,3000);};
  ws.onerror=()=>{};
}
window.addEventListener('message',e=>{
  if(e.source!==frame.contentWindow||e.origin!==location.origin||e.data?.channel!=='chongchao-live')return;
  const m=e.data;
  if(m.type==='ready'){gameReady=true;for(const p of pending)sendGame(p.type,p.data);pending=[];if(started)sendGame('start');}
  if(!owner)return;
  if(m.type==='state'){snapshot=m.data;const s=m.data;$('mode').textContent=MODES[s.mode];$('round').textContent='第'+s.round+'场 · '+({prep:'整备',battle:'守城',result:s.won?'胜利':'失守',idle:'待机'}[s.phase]||'');$('clock').textContent=String(Math.floor(s.remaining/60)).padStart(2,'0')+':'+String(s.remaining%60).padStart(2,'0');$('base').textContent='基地 '+s.baseHP+'/'+s.baseMaxHP;$('player').textContent='主角 '+s.playerHP+'/'+s.playerMaxHP;$('viewers').textContent='参与 '+s.viewers+' 人';
    $('roster').replaceChildren(...s.roster.map(v=>{const p=document.createElement('p');p.textContent=v.name+' · '+({medic:'医疗组',engineer:'工程组',gunner:'机枪组',assault:'突击组'}[v.role]);return p;}));bus.postMessage({type:'state',data:s});}
  if(local&&ws?.readyState===1)ws.send(JSON.stringify(m));
  else if(m.type==='story')caption(m.text);
  else if(m.type==='receipt')bus.postMessage(m);
  else if(m.type==='chat')caption('弹幕加入，选择兵种并投票守城或跟随，就能免费参与。');
});
bus.onmessage=e=>{if(!local)control(e.data);};
$('start').onclick=()=>control({type:'start'});
$('controls').onclick=()=>window.open('./live-console.html','chongchao-control');
if(local)connect();
if(new URLSearchParams(location.search).get('capture')==='1')document.body.classList.add('capturing');
setInterval(()=>{if(!local&&snapshot?.running&&Date.now()-lastCaption>25000)caption('当前基地耐久'+snapshot.baseHP+'，场上'+snapshot.enemies+'只虫。弹幕加入，参与这场守城。');},5000);

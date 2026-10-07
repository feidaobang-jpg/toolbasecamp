import {GAMES} from './coop.js?v=coop-live3';
const $=id=>document.getElementById(id),filter=$('online-filter'),password=$('online-password');
let page=1,inflight=false;
for(const [id,g] of Object.entries(GAMES)){
 const card=document.createElement('section');card.className='online-game';
 const h=document.createElement('h3');h.textContent=g.title;
 const info=document.createElement('p');info.id='online-count-'+id;info.textContent='2–'+g.max+'人合作';
 const a=document.createElement('a');a.className='tb-btn';a.href='html/game/'+g.path+'/index.html?coop=create';a.textContent='创建房间';
 card.append(h,info,a);$('online-games').append(card);
 const o=document.createElement('option');o.value=id;o.textContent=g.title;filter.append(o);
}
async function refresh(){
 if(inflight)return;inflight=true;
 try{
  const local=/^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  const u=(local?'http://127.0.0.1:8792':'/api')+'/game/coop/rooms?page='+page+'&game='+filter.value+'&password='+password.value;
  const r=await fetch(u,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(r.status);const data=await r.json();page=data.page;
  $('online-status').textContent=data.total?'共 '+data.total+' 个房间，选择空位加入':'暂无房间，可以先创建一个邀请朋友';
  const list=$('online-rooms');list.replaceChildren();
  for(const room of data.rooms){
   const g=GAMES[room.game];if(!g)continue;
   const li=document.createElement('li'),text=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('span'),a=document.createElement('a');
   title.textContent=g.title+' · '+room.name;detail.textContent=room.players.length+'/'+room.maxPlayers+'人 · 房间 '+room.code+(room.hasPassword?' · 需要密码':'')+(room.started?' · 游戏中':' · 等待开始');
   a.className='tb-btn';a.textContent=room.players.length>=room.maxPlayers?'已满':room.started?'中途加入':'加入';
   if((!room.started||room.canJoin)&&room.players.length<room.maxPlayers)a.href='html/game/'+g.path+'/index.html?coop='+room.code;else{a.setAttribute('aria-disabled','true');a.tabIndex=-1;}
   text.append(title,detail);li.append(text,a);list.append(li);
  }
  for(const [id,g] of Object.entries(GAMES))$('online-count-'+id).textContent='2–'+g.max+'人合作 · '+(data.counts[id]||0)+' 个房间';
  window.tbRenderPager($('online-pager'),{page,total:data.total,pageSize:20,onChange:p=>{page=p;refresh();}});
 }catch{$('online-status').textContent='暂时连接不到联机服务，请稍后刷新；仍可进入游戏玩单机。';}finally{inflight=false;}
}
for(const el of [filter,password])el.addEventListener('change',()=>{page=1;refresh();});
$('online-refresh').addEventListener('click',refresh);refresh();
setInterval(()=>{if(!document.hidden)refresh();},5000);

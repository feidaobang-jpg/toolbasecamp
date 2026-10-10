// Shared rooms transport and portable lobby UI. Gameplay stays in each game's adapter.
import {installLandscapeTyping} from './landscape-typing.js?v=lt1';
export const GAMES = {
  tank: {title:'坦克大战', protocol:'tank3d-v2', max:4, path:'tank-3d'},
  jackal: {title:'赤色要塞', protocol:'jackal3d-v1', max:4, path:'jackal-stage1-3d'},
  cadillacs: {title:'恐龙快打', protocol:'cadillacs3d-v1', max:4, path:'cadillacs-stage1-3d'},
  starship: {title:'虫潮围城', protocol:'starship-v1', max:4, path:'starship-defense'}
};
export function endpoint(game='tank') {
  const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  return (local ? 'ws://127.0.0.1:8792' : 'wss://www.zhengxiaohui.cn/api') + '/game/coop/ws?game=' + game;
}
// Player IDs identify a lobby participant; they are not authentication tokens.
// Older Android WebViews (and non-secure contexts) may lack randomUUID.
function createPlayerIdentity() {
  const api = typeof crypto === 'undefined' ? null : crypto;
  if (typeof api?.randomUUID === 'function') {
    try { return api.randomUUID(); } catch {}
  }
  const bytes = new Uint8Array(16);
  let secure = false;
  if (typeof api?.getRandomValues === 'function') {
    try { api.getRandomValues(bytes); secure = true; } catch {}
  }
  if (!secure) for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}
export class CoopConnection {
  constructor(onMessage=()=>{}, onStatus=()=>{}, game='tank') {
    this.game=game; this.onMessage=onMessage; this.onStatus=onStatus;
    this.socket=null; this.room=null; this.slot=-1; this.intentional=false; this.rtt=0; this.lastReceive=0; this.stateCount=0;
    this.inputs=new Map();
    this.activity=new Map();this.bots=new Set();this.held=new Set();this.contacts=new Set();this.localAt=performance.now();this.controlAt=this.localAt;
    try { this.identity = localStorage.getItem('gamehub-player-id'); } catch {}
    if (!this.identity) this.identity = createPlayerIdentity();
    try { localStorage.setItem('gamehub-player-id', this.identity); } catch {}
    document.addEventListener('keydown',e=>{this.held.add(e.code);this.localAt=performance.now();});
    document.addEventListener('keyup',e=>{this.held.delete(e.code);this.localAt=performance.now();});
    document.addEventListener('pointerdown',e=>{this.contacts.add(e.pointerId);this.localAt=performance.now();});
    document.addEventListener('pointermove',e=>{if(e.buttons||this.contacts.has(e.pointerId))this.localAt=performance.now();});
    for(const name of ['pointerup','pointercancel'])document.addEventListener(name,e=>{this.contacts.delete(e.pointerId);this.localAt=performance.now();});
    window.addEventListener('blur',()=>{this.held.clear();this.contacts.clear();});
  }
  get host(){return this.slot===0;}
  get active(){return !!this.room?.started;}
  send(data){if(this.socket?.readyState!==1||this.socket.bufferedAmount>200000)return false;if(data.type==='input')data={...data,input:{...data.input,activity:this.localActive()}};this.socket.send(JSON.stringify(data));return true;}
  localActive(){return this.held.size>0||this.contacts.size>0||performance.now()-this.localAt<250;}
  controlTick(paused=false){
    const now=performance.now(),dt=now-this.controlAt;this.controlAt=now;
    if(paused)for(const [slot,at] of this.activity)this.activity.set(slot,at+dt);
  }
  observe(slot,input){
    const moving=(input?.dir??-1)>=0||Math.hypot(input?.x||0,input?.z||0)>.08;
    const active=input?.activity||moving||input?.bomb||input?.atk||input?.jump||input?.firePressed||(input?.fire&&!input?.autoFire)||input?.edges?.length;
    if(active)this.activity.set(slot,performance.now());
  }
  control(slot,human,computer){
    if(!this.host||!this.active)return human;
    if(slot===0&&this.localActive())this.activity.set(0,performance.now());
    if(!this.activity.has(slot))this.activity.set(slot,performance.now());
    const ai=performance.now()-this.activity.get(slot)>=30000;
    if(ai!==this.bots.has(slot)){if(ai)this.bots.add(slot);else this.bots.delete(slot);this.send({type:'control',slot,ai});}
    return ai?computer():human;
  }
  connect(type, name, code, options={}) {
    this.disconnect();this.intentional=false;
    const socket=this.socket=new WebSocket(endpoint(this.game));
    this.onStatus('正在连接联机服务…');
    const timeout=setTimeout(()=>{if(socket===this.socket){socket.close();this.onStatus('连接超时，请重试；单机仍可玩');}},12000);
    socket.onmessage=event=>{
      if(socket!==this.socket)return;
      let msg;try{msg=JSON.parse(event.data);}catch{return;}
      this.lastReceive=performance.now();
      if(msg.type==='hello'){
        clearTimeout(timeout);
        if(msg.protocol!==GAMES[this.game].protocol){this.disconnect();this.onStatus('联机版本不一致，请刷新后重试');return;}
        this.send({type,name,code,identity:this.identity,liveJoin:true,...options});
      }
      if(msg.type==='joined'){this.slot=msg.slot;this.room=msg.room;}
      if(msg.type==='roster')this.room=msg.room;
      if(msg.type==='start'&&this.room)this.room.started=true;
      if(msg.type==='start'){this.controlAt=performance.now();this.activity.clear();this.bots.clear();for(const slot of msg.config.playerSlots)this.activity.set(slot,performance.now());}
      if(msg.type==='player_joined'){this.activity.set(msg.slot,performance.now());this.bots.delete(msg.slot);}
      if(msg.type==='control'){if(msg.ai)this.bots.add(msg.slot);else this.bots.delete(msg.slot);const p=this.room?.players.find(p=>p.slot===msg.slot);if(p)p.ai=msg.ai;}
      if(msg.type==='pong')this.rtt=Math.round(performance.now()-msg.at);
      if(msg.type==='state')this.stateCount++;
      if(msg.type==='input'){
        this.observe(msg.slot,msg.input);
        const old=this.inputs.get(msg.slot);
        msg.input.edges=[...new Set([...(old?.edges||[]),...(msg.input.edges||[])])];
        this.inputs.set(msg.slot,{...msg.input,at:performance.now()});
      }
      if(msg.type==='player_left'){this.inputs.delete(msg.slot);this.activity.delete(msg.slot);this.bots.delete(msg.slot);}
      if(msg.type==='error')this.onStatus(msg.message);
      this.onMessage(msg);
    };
    socket.onerror=()=>{if(socket===this.socket)this.onStatus('联机连接失败，请重试；单机仍可玩');};
    socket.onclose=()=>{
      clearTimeout(timeout);if(socket!==this.socket)return;
      clearInterval(this.heartbeat);this.room=null;this.slot=-1;this.inputs.clear();
      if(!this.intentional)this.onMessage({type:'ended',message:'连接已断开，房间结束；请重新邀请'});
    };
    this.heartbeat=setInterval(()=>this.send({type:'ping',at:performance.now()}),10000);
  }
  input(slot) {
    const data=this.inputs.get(slot);if(!data||performance.now()-data.at>350)return {edges:[]};
    const value={...data,edges:data.edges||[]};data.edges=[];return value;
  }
  clearInputs(){this.inputs.clear();}
  disconnect(){
    this.intentional=true;clearInterval(this.heartbeat);const socket=this.socket;this.socket=null;
    if(socket?.readyState===1)socket.send(JSON.stringify({type:'leave'}));
    socket?.close();this.room=null;this.slot=-1;this.stateCount=0;this.inputs.clear();this.activity.clear();this.bots.clear();
  }
}
const css = `
.coop-panel{position:absolute;inset:0;z-index:1000;background:#142018d9;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;touch-action:auto}
.coop-panel[hidden],.coop-card [hidden]{display:none!important}.coop-card,.coop-card *{touch-action:auto}.coop-card{width:min(800px,100%);max-height:100%;overflow:auto;background:#fff8e9;color:#244833;border:3px solid #5c7853;border-radius:18px;padding:16px;box-sizing:border-box;font:15px/1.4 system-ui}
.coop-card h2{margin:0 0 8px}.coop-card p{margin:6px 0}.coop-card button,.coop-card a{font:inherit}.coop-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.coop-card label{display:flex;flex-direction:column;gap:4px}.coop-card input,.coop-card select{font:inherit;box-sizing:border-box;width:100%;min-height:44px;border:1px solid #7e927a;border-radius:8px;background:white;color:#244833;padding:8px}
.coop-actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.coop-card button,.coop-entry{background:#3b7049;color:#fff8e9;border:2px solid #294b32;border-radius:10px;padding:9px 12px;min-height:44px;cursor:pointer}
.coop-card button:focus-visible,.coop-entry:focus-visible{outline:3px solid #e5ae34;outline-offset:2px}.coop-card button:disabled{opacity:.55;cursor:default}
.coop-card button.coop-btn-locked{opacity:.6;background:#6f8270;border-color:#52624f}
.coop-card a{color:#27563c}.coop-rooms{list-style:none;padding:0;margin:8px 0}.coop-rooms li{display:flex;gap:8px;align-items:center;justify-content:space-between;border-top:1px solid #c9d2ba;padding:6px 0}.coop-rooms button{flex-shrink:0}
.coop-status{min-height:1.4em;color:#884123}.coop-roster{padding:8px;background:#e8eedb;border-radius:8px}.coop-footer{font-size:12px}
@media(max-height:430px){.coop-card{padding:10px}.coop-card h2{font-size:18px}.coop-card p{margin:3px 0}.coop-footer{display:none}.coop-actions{margin:5px 0}}
@media(max-width:560px){.coop-grid{grid-template-columns:1fr 1fr}}
`;
export class CooperativeLobby {
  constructor({game,container,menu,getConfig,onStart,onMessage=()=>{},onClose=()=>{},onOpen=()=>{}}) {
    this.game=game;this.getConfig=getConfig;this.onStart=onStart;this.onMessage=onMessage;this.onClose=onClose;this.onOpen=onOpen;
    this.connection=new CoopConnection(m=>this.message(m),s=>this.status(s),game);
    installLandscapeTyping();
    this.page=1;this.total=0;this.opened=false;this.pendingInvite=null;this.roomsByCode=null;
    if(!document.getElementById('coop-shared-style')){const s=document.createElement('style');s.id='coop-shared-style';s.textContent=css;document.head.append(s);}
    const entry=document.createElement('button');entry.className='coop-entry';entry.type='button';entry.dataset.act='coop';entry.textContent='联机大厅 · 2–'+GAMES[game].max+'人合作';menu.append(entry);entry.addEventListener('click',()=>this.open());
    this.entry=entry;
    const panel=document.createElement('div');panel.className='coop-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',GAMES[game].title+'联机大厅');
    panel.innerHTML='<section class="coop-card"><h2>'+GAMES[game].title+' · 联机大厅</h2><p>填昵称即可联机，单机存档独立保留。</p><div class="coop-grid"><label>昵称<input data-field="name" maxlength="12" autocomplete="nickname" value="玩家"></label><label>房间名称<input data-field="roomName" maxlength="32" placeholder="我的合作房间"></label><label>人数<select data-field="capacity"></select></label><label>房间号<input data-field="code" inputmode="numeric" maxlength="6" placeholder="六位房间号"></label><label>密码（选填）<input data-field="password" maxlength="32" type="password" autocomplete="off"></label><label>房间筛选<select data-field="filter"><option value="all">全部房间</option><option value="open">无需密码</option><option value="locked">密码房</option></select></label></div><div class="coop-actions"><button data-do="create">创建房间</button><button data-do="join">加入房间</button><button data-do="refresh">刷新列表</button><button data-do="close">返回游戏</button></div><p class="coop-status" role="status" aria-live="polite"></p><div class="coop-roster" hidden></div><div class="coop-actions coop-room-actions" hidden><button data-do="ready">准备</button><button data-do="start">开始合作</button><button data-do="invite">复制邀请链接</button><button data-do="leave">退出房间</button></div><ul class="coop-rooms"></ul><div class="coop-actions coop-pager"><button data-do="prev">上一页</button><span></span><button data-do="next">下一页</button></div><p class="coop-footer">合作同步暂停；房主退出则结束房间，支持中途加入；闲置30秒电脑接管，操作后交还真人。<a href="https://www.zhengxiaohui.cn/game-online.html" target="_blank" rel="noopener">全部游戏联机大厅</a></p></section>';
    container.append(panel);this.panel=panel;
    for(let n=2;n<=GAMES[game].max;n++){const o=document.createElement('option');o.value=n;o.textContent=n+'人';this.field('capacity').append(o);}this.field('capacity').value=GAMES[game].max;
    if(game==='cadillacs'||game==='starship'){
      const label=document.createElement('label');label.textContent=game==='cadillacs'?'角色':'兵种';
      const select=document.createElement('select');select.dataset.field='hero';
      (game==='cadillacs'?['杰克','汉娜','穆斯塔法','梅斯']:['机枪兵','火枪兵','医疗兵']).forEach((name,i)=>{const o=document.createElement('option');o.value=i;o.textContent=name;select.append(o);});
      select.value=this.getConfig().hero||0;label.append(select);this.panel.querySelector('.coop-grid').append(label);
      const originalConfig=this.getConfig;this.getConfig=()=>({...originalConfig(),hero:+select.value});
    }
    try{this.field('name').value=localStorage.getItem('gamehub-nickname')||'玩家';}catch{}
    panel.addEventListener('keydown',e=>{
      e.stopPropagation();if(e.key==='Escape'){e.preventDefault();this.close();}
      if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('input,select,button,a')].filter(x=>!x.disabled&&x.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    });
    panel.addEventListener('click',e=>{const b=e.target.closest('[data-do]');if(b)this.action(b.dataset.do);e.stopPropagation();});
    this.field('filter').addEventListener('change',()=>{this.page=1;this.list();});
    const intent=new URLSearchParams(location.search).get('coop');
    if(intent){setTimeout(()=>{this.open();
      // 联机大厅的「创建房间」链接只把玩家带到大厅，建房由玩家自己点，避免昵称/房间名/密码还没填就静默建房。
      if(intent==='create'){const b=this.panel.querySelector('[data-do="create"]');b.focus();this.status('填好昵称、房间名称、人数和密码后点「创建房间」');}
      else if(/^\d{6}$/.test(intent)){this.pendingInvite=intent;this.field('code').value=intent;this.status('邀请房间 '+intent+' 已填入，正在确认房间状态…');}
    },300);}
  }
  field(k){return this.panel.querySelector('[data-field="'+k+'"]');}
  status(s){this.panel.querySelector('.coop-status').textContent=s;}
  setPanelVisible(v){
    this.panel.hidden=!v;
    this._pannedAncestors=this._pannedAncestors||[];
    if(v&&!this._panningEnabled){this._panningEnabled=true;
      for(let el=this.panel.parentElement;el&&el!==document.documentElement;el=el.parentElement)
        if(getComputedStyle(el).touchAction==='none'){this._pannedAncestors.push([el,el.style.touchAction]);el.style.touchAction='auto';}
    } else if(!v&&this._panningEnabled){this._panningEnabled=false;
      for(const[el,prev]of this._pannedAncestors)el.style.touchAction=prev;this._pannedAncestors=[];
    }
  }
  open(){this.opened=true;this.onOpen();this.setPanelVisible(true);this.field('name').focus();const r=this.connection.room;if(!r)this.connection.connect('list');else{this.roster();this.status('你已在房间 '+r.code+'，可用下方「准备 / 开始合作 / 复制邀请链接 / 退出房间」；想新建或加入别的房间请先点「退出房间」');}}
  close(){if(this.connection.room&&!this.connection.active){this.status('请开始合作或退出房间后返回游戏');return;}this.opened=false;this.setPanelVisible(false);this.onClose();this.entry.focus();}
  list(){if(this.connection.socket?.readyState===1)this.connection.send({type:'list',page:this.page,passwordFilter:this.field('filter').value});else this.connection.connect('list',null,null,{page:this.page,passwordFilter:this.field('filter').value});}
  action(kind){
    const c=this.connection,name=this.field('name').value.trim()||'玩家',code=this.field('code').value.trim(),password=this.field('password').value;
    try{localStorage.setItem('gamehub-nickname',name);}catch{}
    if(kind==='create'||kind==='join'){
      if(c.room){this.status('你已在房间 '+c.room.code+'，请先点「退出房间」再'+(kind==='create'?'创建新房间':'加入其他房间'));return;}
      if(kind==='join'&&!/^\d{6}$/.test(code)){this.status('请输入六位房间号');return;}
      c.connect(kind,name,code,{password,roomName:this.field('roomName').value.trim(),maxPlayers:+this.field('capacity').value,config:this.getConfig()});
    } else if(kind==='refresh')this.list();
    else if(kind==='close')this.close();
    else if(kind==='ready'){const ready=!c.room?.players.find(p=>p.slot===c.slot)?.ready,cfg=this.getConfig();c.send({type:'ready',ready,hero:cfg.hero||0,...(cfg.team?{team:cfg.team}:{})});}
    else if(kind==='start')c.send({type:'start'});
    else if(kind==='invite')this.invite();
    else if(kind==='leave'){const active=c.active;c.disconnect();if(active)this.message({type:'ended',message:'你已退出房间，其他队友继续'});else{this.roster();this.list();}}
    else if(kind==='prev'||kind==='next'){this.page+=kind==='prev'?-1:1;this.list();}
  }
  async invite(){
    const u=new URL(/^(localhost|127\.0\.0\.1)$/.test(location.hostname)?location.href:'https://www.zhengxiaohui.cn/html/game/'+GAMES[this.game].path+'/index.html');u.search='';u.hash='';u.searchParams.set('coop',this.connection.room.code);
    try{await navigator.clipboard.writeText(u.href);this.status('邀请链接已复制，发给朋友后即可加入');}catch{this.status(u.href);}
  }
  autoJoin(){
    const code=this.pendingInvite;
    if(this.connection.room){this.pendingInvite=null;return;}
    this.pendingInvite=null;
    const room=this.roomsByCode?.get(code);
    if(!room){this.status('邀请房间 '+code+' 不在线或已结束；房主重新建房后再点「加入房间」');return;}
    if(room.players.length>=room.maxPlayers){this.status('邀请房间 '+code+' 已满员；可以让房主开一个新房间');return;}
    if(room.started&&!room.canJoin){this.status('邀请房间 '+code+' 已在游戏中且不支持中途加入；房主重开后点「加入房间」');return;}
    if(room.hasPassword){this.field('password').focus();this.status('邀请房间 '+code+' 需要密码，请填写密码后点「加入房间」');return;}
    this.field('code').value=code;this.status('正在加入邀请房间 '+code+'…');this.action('join');
  }
  roster(){
    const c=this.connection,r=c.room,roster=this.panel.querySelector('.coop-roster');
    roster.hidden=!r;this.panel.querySelector('.coop-room-actions').hidden=!r;if(this.field('hero'))this.field('hero').disabled=!!r?.players.find(p=>p.slot===c.slot)?.ready;
    if(r){const vs=r.settings?.mode==='versus',teamTag=t=>vs?({blue:'（蓝方）',red:'（红方）'}[t]||'（自动分队）'):'';
    roster.textContent='房间 '+r.code+' · '+r.name+(vs?' · 对战 '+(r.settings.size||1)+' 对 '+(r.settings.size||1):'')+' · '+r.players.map(p=>(p.slot===0?'房主 ':'')+p.name+teamTag(p.team)+(p.ready?' ✓':' 等待准备')).join(' / ');this.panel.querySelector('[data-do="ready"]').hidden=c.host||r.started;this.panel.querySelector('[data-do="start"]').hidden=!c.host||r.started;if(this.field('hero'))this.field('hero').disabled=!!r.players.find(p=>p.slot===c.slot)?.ready;this.panel.querySelector('[data-do="ready"]').textContent=r.players.find(p=>p.slot===c.slot)?.ready?'取消准备':'准备';}
    if(r&&c.host)for(const p of r.players.filter(p=>p.slot!==0)){const b=document.createElement('button');b.type='button';b.dataset.kick=p.slot;b.textContent='踢出 '+(p.slot+1)+'P '+p.name;b.onclick=e=>{e.stopPropagation();c.send({type:'kick',slot:p.slot});};roster.append(b);}
    // 已在房间时不再用 disabled 吞掉点击：按钮显示为锁定态但仍可点，点了才会说明原因和下一步。
    for(const k of ['create','join']){const b=this.panel.querySelector('[data-do="'+k+'"]');b.classList.toggle('coop-btn-locked',!!r);b.setAttribute('aria-disabled',r?'true':'false');b.title=r?'已在房间 '+r.code+'，点「退出房间」后才能'+(k==='create'?'新建':'加入'):'';}
  }
  message(m){
    if(m.type==='rooms'){
      const ul=this.panel.querySelector('.coop-rooms');ul.replaceChildren();this.page=m.page;this.total=m.total;
      this.roomsByCode=new Map(m.rooms.map(r=>[r.code,r]));
      if(!m.rooms.length){const li=document.createElement('li');li.textContent='暂无房间，可以创建一个邀请朋友';ul.append(li);}
      for(const r of m.rooms){const li=document.createElement('li'),label=document.createElement('span'),btn=document.createElement('button');li.dataset.code=r.code;label.textContent=r.name+' · '+r.players.length+'/'+r.maxPlayers+'人'+(r.settings?.mode==='versus'?' · 对战 '+(r.settings.size||1)+' 对 '+(r.settings.size||1):'')+(r.hasPassword?' · 密码房':'')+(r.started?' · 游戏中':'');btn.textContent='加入';btn.disabled=(r.started&&!r.canJoin)||r.players.length>=r.maxPlayers;btn.onclick=()=>{this.field('code').value=r.code;if(r.hasPassword&&!this.field('password').value){this.field('password').focus();this.status('请填写该房间密码后加入');}else this.action('join');};li.append(label,btn);ul.append(li);}
      const pager=this.panel.querySelector('.coop-pager');pager.hidden=m.total<=20;pager.querySelector('span').textContent=this.page+' / '+Math.max(1,Math.ceil(m.total/20));pager.querySelector('[data-do="prev"]').disabled=this.page<=1;pager.querySelector('[data-do="next"]').disabled=this.page>=Math.ceil(m.total/20);
      if(this.pendingInvite)this.autoJoin();
    } else if(m.type==='joined'||m.type==='roster'){this.roster();if(m.type==='joined')this.status('已加入房间，队友准备后由房主开始');}
    else if(m.type==='start'){this.opened=false;this.setPanelVisible(false);this.onStart(m.config);}
    else if(m.type==='ended'){this.connection.disconnect();this.opened=true;this.setPanelVisible(true);this.status(m.message);this.roster();}
    this.onMessage(m);
  }
}
// Compact visual transforms. Keys are stable child indices in the same model factory.
const defaults=new WeakMap(),lastApplied=new WeakMap();
function transform(o){return [...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),o.visible?1:0].map(v=>Math.round(v*10000)/10000);}
export function markTree(root){root.traverse(o=>defaults.set(o,transform(o)));}
export function treeState(root){
  const out=[];let i=0;root.traverse(o=>{const t=transform(o),d=defaults.get(o);if(!d||t.some((v,k)=>v!==d[k]))out.push([i,...t]);i++;});return out;
}
export function applyTree(root,rows){
  const nodes=[];root.traverse(o=>nodes.push(o));const changed=new Set(rows.map(r=>r[0]));
  const set=(o,t)=>{o.position.fromArray(t);o.quaternion.fromArray(t,3);o.scale.fromArray(t,7);o.visible=!!t[10];};
  for(const i of lastApplied.get(root)||[]){if(!changed.has(i)&&defaults.has(nodes[i]))set(nodes[i],defaults.get(nodes[i]));}
  for(const [i,...t] of rows)if(nodes[i])set(nodes[i],t);lastApplied.set(root,changed);
}
export function scalarState(o,omit=[]){
  const out={};for(const [k,v] of Object.entries(o))if(!omit.includes(k)&&(v===null||['string','boolean','number'].includes(typeof v)))out[k]=Number.isFinite(v)||typeof v!=='number'?v:null;return out;
}

// Relay bounded sound events with monotonic IDs; receiving the same snapshot never replays audio.
export function createSoundRelay(audio,names,enabled){
 const events=[];let serial=0,received=0,depth=0;
 for(const name of names){if(typeof audio[name]!=='function')continue;const original=audio[name].bind(audio);
  audio[name]=(...args)=>{if(enabled()&&!depth){events.push({id:++serial,name,args});if(events.length>60)events.shift();}depth++;try{return original(...args);}finally{depth--;}};}
 return {snapshot:()=>events.slice(),apply:rows=>{for(const e of rows||[]){if(e.id<=received)continue;received=e.id;if(names.includes(e.name))audio[e.name](...e.args);}}};
}

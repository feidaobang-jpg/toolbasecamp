import http from 'node:http';
import {readFile,writeFile,mkdir,appendFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';
import OBSWebSocket from 'obs-websocket-js';
import {BilibiliClient} from './bilibili.mjs';
import {HostAI} from './host-ai.mjs';
import {classifyComment,SUPPORTS,cleanName} from '../../../public/html/game/starship-defense/live-rules.js';

const project=path.resolve(import.meta.dirname,'../../..'),publicDir=path.join(project,'public');
const stateDir=process.env.CHONGCHAO_LIVE_HOME||path.join(process.env.LOCALAPPDATA||import.meta.dirname,'ChongchaoLive');
await mkdir(stateDir,{recursive:true});
const configPath=path.join(stateDir,'config.json');
let config;try{config=JSON.parse(await readFile(configPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('本机配置JSON无效');config=JSON.parse(await readFile(path.join(import.meta.dirname,'config.example.json'),'utf8'));await writeFile(configPath,JSON.stringify(config,null,2),'utf8');}
const port=Number(process.env.CHONGCHAO_LIVE_PORT||config.port||18765),origin='http://127.0.0.1:'+port;
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('端口无效');
const cookie=randomBytes(32).toString('hex'),clients=new Set(),audioDir=path.join(stateDir,'audio'),seenPath=path.join(stateDir,'gift-receipts.json');
let game=null,lastState=null,lastFrame=0,warning='',chatAt=0,commentaryAt=0,guardBusy=false;
const pending=new Map(),seen=new Map(),waitingGifts=[];try{for(const [id,value] of JSON.parse(await readFile(seenPath,'utf8')))seen.set(id,value);}catch{}
const send=(socket,m)=>{if(socket?.readyState===1)socket.send(JSON.stringify(m));};
const broadcast=m=>{for(const c of clients)send(c,m);};
const journal=async data=>{const f=path.join(stateDir,'events.jsonl');try{if((await stat(f)).size>5*1024*1024)await writeFile(f,'','utf8');}catch{}await appendFile(f,JSON.stringify({at:new Date().toISOString(),...data})+'\n','utf8');};
let receiptSave=Promise.resolve();
const saveSeen=()=>{receiptSave=receiptSave.catch(()=>{}).then(async()=>{while(seen.size>20000)seen.delete(seen.keys().next().value);const tmp=seenPath+'.new';await writeFile(tmp,JSON.stringify([...seen]),'utf8');const {rename}=await import('node:fs/promises');await rename(tmp,seenPath);});return receiptSave;};
const host=new HostAI(config,audioDir,broadcast),obs=new OBSWebSocket();let obsConnected=false;
const status=()=>({bili:bili.state,gameConnected:!!game,ai:host.source,warning,unattendedConfirmed:config.bilibili.approvedForUnattended,unresolved:pending.size});
const publishStatus=()=>broadcast({type:'status',data:status()});
const bili=new BilibiliClient(config.bilibili,{event:handleOfficial,status(state,reason){if(reason)warning=reason;publishStatus();if(state==='error'||state==='end_failed')void failSafe(reason||'B站连接中断');}});
async function obsConnect(){if(!obsConnected){await obs.connect(config.obs.url,config.obs.password,{rpcVersion:1});obsConnected=true;obs.once('ConnectionClosed',()=>{obsConnected=false;});}return obs;}
async function stopOwnStream(){if(!config.obs.stopOnFailure)return {stopped:false,reason:'未启用OBS故障停止'};try{await obsConnect();const scene=await obs.call('GetCurrentProgramScene');if(scene.currentProgramSceneName!=='虫潮AI直播')return{stopped:false,reason:'当前OBS为其他场景，未修改'};const state=await obs.call('GetStreamStatus');if(state.outputActive)await obs.call('StopStream');return{stopped:state.outputActive};}catch{return{stopped:false,reason:'OBS未连接；需要在OBS确认状态'};}}
async function failSafe(reason){if(guardBusy)return;guardBusy=true;warning=reason;
  // Wire protocol uses type=control plus an explicit command to avoid overwriting
  // the envelope type with a gameplay command.
  try{send(game,{type:'control',command:'pause'});await bili.disconnect().catch(()=>{});await stopOwnStream();for(const [id,e] of pending){await journal({id,kind:'unresolved',reason});}for(const e of waitingGifts)await journal({id:e.id,kind:'unresolved',reason});waitingGifts.length=0;pending.clear();}finally{publishStatus();guardBusy=false;}}
function forwardEvent(e){if(!game||!lastState?.running||Date.now()-lastFrame>5000){void journal({id:e.id,kind:'rejected',reason:'游戏未运行'});return false;}pending.set(e.id,{at:Date.now(),demo:e.demo,parentId:e.parentId});send(game,{type:'event',data:e});return true;}
async function handleOfficial(message){
  const d=message.data||{},cmd=message.cmd||'';
  if(String(d.room_id||'')!==String(bili.roomId||d.room_id||''))return;
  if(cmd.endsWith('LIVE_END')){void failSafe('B站已结束直播');return;}
  if(cmd.endsWith('_DM')){const uid=String(d.open_id||d.uid||'');if(!uid)return;forwardEvent({id:d.msg_id||randomUUID(),type:'comment',uid,name:cleanName(d.uname),text:String(d.msg||'').slice(0,120),demo:false});return;}
  if(!cmd.endsWith('SEND_GIFT'))return;
  const id=String(d.msg_id||d.order_id||'');if(!id){warning='礼物事件缺少唯一编号，未执行，请检查官方事件字段';publishStatus();return;}if(seen.has(id))return;
  const map=config.bilibili.giftMappings.find(g=>String(g.id)===String(d.gift_id));if(!map)return;
  const count=Number(d.gift_num);if(!Number.isInteger(count)||count<1||count>1000){void failSafe('礼物数量异常，停止互动核验');return;}
  seen.set(id,{at:Date.now(),count,action:map.action,status:'received',receipts:0,failed:0});try{await saveSeen();}catch{await failSafe('无法保存礼物去重记录');return;}
  if(waitingGifts.length+count>2000){await failSafe('支援队列达到保护上限，请核对礼物回执');return;}
  for(let i=0;i<count;i++){const eventId=id+'#'+i;waitingGifts.push({id:eventId,parentId:id,type:'support',uid:String(d.open_id||d.uid),name:cleanName(d.uname),action:map.action,demo:false,queuedAt:Date.now()});}
}
const allowedControls=new Set(['start','mode','pause','resume','restart','camera','hold','voice']);
function validControl(m){return allowedControls.has(m.type)&&(!(m.type==='mode')||['auto','assist','host'].includes(m.data))&&(!(m.type==='camera')||['third','first'].includes(m.data));}
function safeRequest(req){const hosts=new Set(['127.0.0.1:'+port,'localhost:'+port]);if(!hosts.has(req.headers.host))return false;if(req.headers.origin&&!new Set([origin,'http://localhost:'+port]).has(req.headers.origin))return false;return req.headers['sec-fetch-site']!=='cross-site';}
const server=http.createServer(async(req,res)=>{
  const json=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
  if(!safeRequest(req)){json(403,{error:'仅允许本机同源访问'});return;}
  const url=new URL(req.url,origin);
  if(url.pathname.startsWith('/api/')){
    if(!req.headers.cookie?.includes('live_session='+cookie)){json(403,{error:'请先打开本机控制台'});return;}
    try{let data={};if(req.method==='POST'){if(!req.headers.origin||!String(req.headers['content-type']).startsWith('application/json'))throw Error('需要同源JSON请求');let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)throw Error('请求过大');chunks.push(chunk);}data=JSON.parse(Buffer.concat(chunks).toString()||'{}');}
      else if(req.method!=='GET'){json(405,{error:'不支持的方法'});return;}
      const p=url.pathname;
      if(req.method==='GET'&&p==='/api/health'){json(200,{...status(),model:await host.health(),obs:obsConnected,port,version:'live-v0.1.0'});return;}
      if(req.method==='GET'&&p==='/api/rules'){json(200,{gifts:config.bilibili.giftMappings.map(g=>({id:g.id,name:g.name,action:g.action}))});return;}
      if(req.method!=='POST'){json(405,{error:'请使用POST'});return;}
      if(p==='/api/control'){if(!validControl(data))throw Error('控制指令无效');
        if(data.type==='mode'&&data.data==='auto'&&bili.state==='connected'&&!config.bilibili.approvedForUnattended)throw Error('先核实B站对本项目AI独播的许可，再启用正式独播');
        if(data.type==='hold')host.holdUntil=Date.now()+10000;if(data.type==='voice')host.enabled=!!data.data;
        if(data.type==='pause')await bili.disconnect();if(!game)throw Error('请先打开直播画面');send(game,{type:'control',command:data.type,data:data.data});json(200,{ok:true});return;}
      if(p==='/api/demo'){if(bili.state!=='disconnected')throw Error('已连接或正在关闭正式互动，禁止模拟事件');if(!['comment','support'].includes(data.type))throw Error('事件无效');if(data.type==='support'&&!(data.action in SUPPORTS))throw Error('支援无效');const e={id:randomUUID(),type:data.type,action:data.action,text:String(data.text||'').slice(0,120),uid:'demo-'+cleanName(data.name),name:cleanName(data.name),demo:true};json(200,{ok:forwardEvent(e)});return;}
      if(p==='/api/bili/connect'){if(!game||!lastState?.running||Date.now()-lastFrame>5000)throw Error('先启动直播玩法');if(lastState.mode==='auto'&&!config.bilibili.approvedForUnattended)throw Error('正式独播许可未确认；可先使用我操作或我主持模式');if(!config.bilibili.giftMappings.every(g=>/^\d+$/.test(String(g.id))&&g.action in SUPPORTS))throw Error('礼物映射无效');warning='';await bili.connect(data.code);json(200,{ok:true,state:bili.state});return;}
      if(p==='/api/bili/disconnect'){await bili.disconnect();json(200,{ok:true});return;}
      if(p==='/api/emergency'){await failSafe('主持人紧急停止');json(200,{ok:true,...status()});return;}
      if(p.startsWith('/api/obs/')){await obsConnect();if(p==='/api/obs/status'){json(200,{stream:await obs.call('GetStreamStatus'),record:await obs.call('GetRecordStatus')});return;}
        if(p==='/api/obs/scene'){const name='虫潮AI直播',scenes=await obs.call('GetSceneList');if(!scenes.scenes.some(s=>s.sceneName===name))await obs.call('CreateScene',{sceneName:name});const inputs=await obs.call('GetInputList');if(!inputs.inputs.some(s=>s.inputName==='虫潮战场'))await obs.call('CreateInput',{sceneName:name,inputName:'虫潮战场',inputKind:'browser_source',inputSettings:{url:origin+'/html/game/starship-defense/live.html?capture=1',width:1920,height:1080,reroute_audio:true,shutdown:false,restart_when_active:false},sceneItemEnabled:true});json(200,{ok:true,scene:name,note:'已建立场景；未切换当前场景，未开播'});return;}
        if(p==='/api/obs/record'){const s=await obs.call('GetCurrentProgramScene');if(s.currentProgramSceneName!=='虫潮AI直播')throw Error('请在OBS选择虫潮AI直播场景');await obs.call(data.start?'StartRecord':'StopRecord');json(200,{ok:true});return;}}
      json(404,{error:'接口不存在'});
    }catch(e){json(400,{error:String(e.message).slice(0,180)});}return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  try{let f,mime;const pathname=decodeURIComponent(url.pathname);if(pathname.startsWith('/audio/')){if(!/^\/audio\/[a-f0-9-]+\.wav$/.test(pathname))throw Error('path');f=path.join(audioDir,path.basename(pathname));mime='audio/wav';}
    else{const relative=pathname==='/'?'/html/game/starship-defense/live-console.html':pathname;f=path.resolve(publicDir,'.'+relative);if(!f.startsWith(publicDir+path.sep))throw Error('path');mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.mp3':'audio/mpeg','.webp':'image/webp'}[path.extname(f)]||'application/octet-stream';}
    const bytes=await readFile(f);res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','Set-Cookie':'live_session='+cookie+'; HttpOnly; SameSite=Strict; Path=/','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
const sockets=new WebSocketServer({noServer:true,maxPayload:16384});
server.on('upgrade',(req,socket,head)=>{if(req.url!=='/live-ws'||!safeRequest(req)||!req.headers.cookie?.includes('live_session='+cookie)){socket.destroy();return;}sockets.handleUpgrade(req,socket,head,s=>sockets.emit('connection',s,req));});
sockets.on('connection',socket=>{clients.add(socket);send(socket,{type:'status',data:status()});
  socket.on('message',raw=>{try{const m=JSON.parse(raw.toString());if(m.type==='hello'){if(socket.role)return;socket.role=m.role;if(m.role==='game'){if(!game){game=socket;lastFrame=Date.now();if(bili.state==='disconnected'&&warning==='直播画面已关闭，互动停止'){warning='';publishStatus();}send(socket,{type:'lease',owner:true,autostart:config.autostart});}else send(socket,{type:'lease',owner:false});}else if(lastState)send(socket,{type:'state',data:lastState});return;}if(socket!==game)return;
    if(m.type==='state'){const s=m.data;if(!s||!['auto','assist','host'].includes(s.mode)||!Number.isFinite(s.baseHP)||!Number.isFinite(s.remaining))return;lastState=s;lastFrame=Date.now();broadcast({type:'state',data:s});
      if(s.running&&s.phase==='battle'&&Date.now()-commentaryAt>25000){commentaryAt=Date.now();void host.speak({battle:{baseHP:s.baseHP,enemies:s.enemies,remaining:s.remaining}},'基地耐久'+s.baseHP+'，场上'+s.enemies+'只虫。弹幕加入，一起守城。',{generate:true});}return;}
    if(m.type==='story'){void host.speak({battle:lastState,event:m.text},String(m.text).slice(0,160),{force:m.kind==='result'});return;}
    if(m.type==='chat'&&Date.now()-chatAt>10000){chatAt=Date.now();void host.speak({battle:lastState,viewerComment:String(m.text).slice(0,120)},'弹幕加入，再选择医疗、工程、突击或机枪组，就能免费参与守城。',{generate:true});return;}
    if(m.type==='receipt'){const e=pending.get(m.id);if(!e)return;pending.delete(m.id);if(e.parentId){const record=seen.get(e.parentId);if(record){record.receipts++;if(!m.ok)record.failed++;record.status=record.receipts===record.count?(record.failed?'partial_or_failed':'applied'):'received';void saveSeen().catch(()=>{void failSafe('无法保存效果回执');});}}broadcast({type:'receipt',id:m.id,ok:!!m.ok,detail:String(m.detail||m.action||''),reason:String(m.reason||'')});void journal({id:m.id,demo:e.demo,kind:'receipt',ok:!!m.ok,detail:m.detail||m.reason||m.action});return;}
  }catch{socket.close(1003,'Invalid message');}});
  socket.on('close',()=>{clients.delete(socket);if(socket===game){game=null;lastState=null;void failSafe('直播画面已关闭，互动停止');}});
});
setInterval(()=>{if(game&&lastState?.running&&Date.now()-lastFrame>8000)void failSafe('游戏帧心跳超过8秒，互动暂停');for(const [id,e] of pending)if(Date.now()-e.at>8000){pending.delete(id);void journal({id,kind:'unresolved',reason:'效果回执超时'});if(!e.demo)void failSafe('真实支援效果回执超时');}if(lastState?.running&&['prep','battle'].includes(lastState.phase)&&['prep','battle'].includes(lastState.gameState)&&Date.now()-lastFrame<5000){for(let i=0;i<10&&waitingGifts.length;i++)forwardEvent(waitingGifts.shift());}if(waitingGifts.some(e=>Date.now()-e.queuedAt>30000))void failSafe('支援等待超过30秒，请核验未执行记录');},500).unref();
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));console.log('虫潮直播服务：'+origin+'（仅本机，未公开开播）');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await failSafe('本机服务结束');server.close();process.exit(0);});

import assert from 'node:assert/strict';
globalThis.document={addEventListener(){}};
globalThis.window={addEventListener(){}};
globalThis.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
globalThis.location={hostname:'localhost',pathname:'/game/'};
class Socket {
  static all=[];
  constructor(){this.readyState=1;this.bufferedAmount=0;this.sent=[];Socket.all.push(this);}
  send(value){this.sent.push(JSON.parse(value));}
  close(){this.readyState=3;this.onclose?.();}
  message(value){this.onmessage({data:JSON.stringify(value)});}
}
globalThis.WebSocket=Socket;
const safety=await import('../../../public/js/game/input-safety.js?v=safety1');
const {CoopConnection}=await import('../../../public/js/game/coop.js');
let calls=[],checks=0;
function sdk(handler){window.toy={isSupport:async()=>true,checkInputSafety:async req=>{calls.push(req);return handler(req);}};}
const approved=()=>({status:'ok',passed:true});
const flush=()=>new Promise(resolve=>setTimeout(resolve,5));
for(const [status,response] of [['rejected',{status:'rejected',passed:false}],['unavailable',{status:'unavailable',passed:false}],['invalid-success',{status:'unavailable',passed:true}],['missing-status',{passed:true}],['contradiction',{status:'ok',passed:false}]]){
  sdk(()=>response);
  const connection=new CoopConnection();
  const before=Socket.all.length;
  assert.equal(await connection.connect('create','case-'+status,'',{roomName:'房间'}),false);
  assert.equal(Socket.all.length,before,'rejected/unavailable input reached transport');
  connection.disconnect();checks++;
}
sdk(()=>{throw Error('network');});
assert.equal((await safety.checkPublicText('throws','nickname')).passed,false);checks++;
sdk(approved);
const connection=new CoopConnection();
// Caller options cannot replace the approved identity.
assert.equal(await connection.connect('create','合法昵称','',{name:'未审覆盖',roomName:'合法房间'}),true);
const socket=connection.socket;
socket.message({type:'hello',protocol:'tank3d-v2'});
assert.equal(socket.sent[0].name,'合法昵称');
assert.equal(socket.sent[0].roomName,'合法房间');
assert(calls.some(c=>c.text==='合法昵称'&&c.scene==='nickname'));
assert(calls.some(c=>c.text==='合法房间'&&c.scene==='room_name'));
assert.equal(connection.send({type:'create',name:'未经审核',roomName:'未经审核'}),false);checks++;
connection.disconnect();
assert.equal(await connection.connect('create','派生昵称','',{}),true);
connection.socket.message({type:'hello',protocol:'tank3d-v2'});
assert(calls.some(c=>c.text==='派生昵称的房间'&&c.scene==='room_name'));checks++;
connection.disconnect();
let settle;
sdk(()=>new Promise(resolve=>{settle=resolve;}));
const pending=connection.connect('join','取消中的昵称','123456');
await flush();connection.disconnect();settle(approved());
assert.equal(await pending,false);assert.equal(connection.socket,null);checks++;
const events=[];
const receiver=new CoopConnection(m=>events.push(m));
sdk(({text})=>text.includes('blocked')?{status:'rejected',passed:false}:approved());
await receiver.connect('list');
receiver.socket.message({type:'rooms',rooms:[{name:'blocked-room',code:'123456',players:[{slot:0,name:'blocked-player'}]}],page:1,total:1});
assert(!JSON.stringify(events).includes('blocked'),'unreviewed directory text escaped');
await flush();assert(!JSON.stringify(events).includes('blocked'));checks++;
receiver.socket.message({type:'joined',slot:1,room:{name:'新房间',code:'123456',players:[{slot:0,name:'新玩家'}]}});
assert.equal(receiver.room.name,'合作房间');
await flush();assert.equal(receiver.room.name,'新房间');assert.equal(receiver.room.players[0].name,'新玩家');checks++;
receiver.socket.message({type:'player_joined',slot:2,name:'blocked-notice',message:'blocked-notice中途加入'});
receiver.socket.message({type:'state',state:{game:{seats:[{name:'blocked-result',gold:100}]},ui:{msg:'blocked-toast'}}});
assert(!JSON.stringify(events).includes('blocked'),'snapshot or status text escaped');
assert.equal(events.at(-1).state.game.seats[0].gold,100);checks++;
sdk(()=>new Promise(resolve=>{settle=resolve;}));
receiver.socket.message({type:'joined',slot:0,room:{name:'离线中的房间',players:[]}});
await flush();receiver.socket.close();settle(approved());await flush();
assert.equal(receiver.room,null,'late approval resurrected a closed room');receiver.disconnect();checks++;
delete window.toy;
assert.equal((await safety.preparePublicIdentity('网站自定义','',false)).passed,false);
assert.equal((await safety.preparePublicIdentity('玩家','',true)).passed,true);
assert.equal(safety.publicText('历史未审名称','合作房间'),'合作房间');checks++;
sdk(approved);calls=[];
await Promise.all([safety.checkPublicText('同文去重','nickname'),safety.checkPublicText('同文去重','display_text')]);
assert.equal(calls.length,1);checks++;
console.log(JSON.stringify({passed:true,cases:checks,method:'transport, strict SDK result, received text, cancellation and offline fallback'}));

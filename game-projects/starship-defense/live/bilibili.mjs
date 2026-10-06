import {createHash,createHmac,randomUUID} from 'node:crypto';
import {inflateSync,brotliDecompressSync} from 'node:zlib';
import WebSocket from 'ws';
export function signedHeaders(body,c,now=Math.floor(Date.now()/1000),nonce=randomUUID()){
  const h={'x-bili-accesskeyid':c.accessKeyId,'x-bili-content-md5':createHash('md5').update(body).digest('hex'),'x-bili-signature-method':'HMAC-SHA256','x-bili-signature-nonce':nonce,'x-bili-signature-version':'1.0','x-bili-timestamp':String(now)};
  const text=Object.keys(h).sort().map(k=>k+':'+h[k]).join('\n');return {...h,Authorization:createHmac('sha256',c.accessKeySecret).update(text).digest('hex'),'Content-Type':'application/json','Accept':'application/json'};
}
export function packet(op,body=''){const data=Buffer.from(body),h=Buffer.alloc(16);h.writeUInt32BE(16+data.length,0);h.writeUInt16BE(16,4);h.writeUInt16BE(1,6);h.writeUInt32BE(op,8);h.writeUInt32BE(1,12);return Buffer.concat([h,data]);}
export function parsePackets(bytes,depth=0){
  if(depth>4)throw Error('长连压缩嵌套异常');const events=[];let offset=0;
  while(offset<bytes.length){if(bytes.length-offset<16)throw Error('长连包头不完整');const n=bytes.readUInt32BE(offset),h=bytes.readUInt16BE(offset+4),v=bytes.readUInt16BE(offset+6),op=bytes.readUInt32BE(offset+8);
    if(n<h||h<16||n>4*1024*1024||offset+n>bytes.length)throw Error('长连包长度异常');const b=bytes.subarray(offset+h,offset+n);
    if(v===2||v===3)events.push(...parsePackets(v===2?inflateSync(b,{maxOutputLength:4*1024*1024}):brotliDecompressSync(b,{maxOutputLength:4*1024*1024}),depth+1));
    else if(op===5||op===8)events.push({op,data:JSON.parse(b.toString('utf8'))});offset+=n;
  }return events;
}
export class BilibiliClient{
  constructor(config,{event,status}={}){this.config=config;this.onEvent=event;this.onStatus=status;this.state='disconnected';this.gameId=null;this.socket=null;this.heartbeat=null;this.closing=false;this.busy=false;}
  async request(path,values){
    const c=this.config;if(!/^\d+$/.test(c.appId||''))throw Error('请在本机配置填写正确的项目AppID');
    let body=JSON.stringify(values);if(Object.hasOwn(values,'app_id'))body=body.replace('"app_id":"'+c.appId+'"','"app_id":'+c.appId);
    const r=await fetch('https://live-open.biliapi.com'+path,{method:'POST',headers:signedHeaders(body,c),body,signal:AbortSignal.timeout(12000)});const j=await r.json();if(j.code!==0)throw Error('B站接口返回错误码 '+j.code);return j.data;
  }
  async connect(code){
    if(this.busy||this.gameId)throw Error('已有互动场次或连接正在进行，请先断开');const c=this.config;
    if(!c.accessKeyId||!c.accessKeySecret)throw Error('缺少B站官方开发者密钥，请按使用说明申请');if(!code||typeof code!=='string'||code.length>128)throw Error('请填写主播身份码');
    this.busy=true;this.closing=false;
    try{const d=await this.request('/v2/app/start',{app_id:c.appId,code});this.gameId=d.game_info.game_id;
      if(String(d.anchor_info.uid)!==String(c.ownerUid)){await this.disconnect();throw Error('主播UID不匹配，已关闭互动场次');}
      this.roomId=d.anchor_info.room_id;
      this.state='connecting';this.onStatus?.(this.state);
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('B站长连鉴权超时')),15000);
        this.socket=new WebSocket(d.websocket_info.wss_link[0],{maxPayload:4*1024*1024});
        this.socket.on('open',()=>this.socket.send(packet(7,d.websocket_info.auth_body)));
        this.socket.on('message',bytes=>{try{for(const p of parsePackets(Buffer.from(bytes))){if(p.op===8){if(p.data.code!==0){clearTimeout(timer);reject(Error('B站长连鉴权失败'));return;}clearTimeout(timer);this.state='connected';this.onStatus?.(this.state);resolve();}else this.onEvent?.(p.data);}}catch{this.fail('长连数据异常');}});
        this.socket.on('error',()=>{clearTimeout(timer);reject(Error('B站长连连接失败'));if(this.state==='connected')this.fail('B站长连异常');});
        this.socket.on('close',()=>{clearTimeout(timer);if(!this.closing){reject(Error('B站长连关闭'));this.fail('B站长连断开');}});
      });
      this.heartbeat=setInterval(async()=>{try{if(this.socket?.readyState!==WebSocket.OPEN)throw Error('socket');this.socket.send(packet(2));await this.request('/v2/app/heartbeat',{game_id:this.gameId});}catch{this.fail('官方玩法心跳失败');}},20000);
    }catch(e){await this.disconnect().catch(()=>{});throw e;}finally{this.busy=false;}
  }
  async fail(reason){if(this.closing)return;this.onStatus?.('error',reason);await this.disconnect().catch(()=>{});}
  async disconnect(){this.closing=true;clearInterval(this.heartbeat);this.heartbeat=null;this.socket?.close();this.socket=null;
    const id=this.gameId;let endError;
    if(id)try{await this.request('/v2/app/end',{app_id:this.config.appId,game_id:id});this.gameId=null;}catch(e){endError=e;}
    this.state=endError?'end_failed':'disconnected';this.onStatus?.(this.state,endError?'关闭官方场次失败；已停止心跳，需在B站确认互动礼物下线':'');if(endError)throw endError;
  }
}

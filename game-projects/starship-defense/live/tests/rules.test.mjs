import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveSession} from '../../../../public/html/game/starship-defense/live-rules.js';
import {packet,parsePackets,signedHeaders} from '../bilibili.mjs';
import {deflateSync,brotliCompressSync} from 'node:zlib';
import {allowedSpeech} from '../host-ai.mjs';
test('三种主持模式切换保持本局进度',()=>{const s=new LiveSession();s.next();s.phase='battle';s.tick(20);for(const m of ['assist','host','auto']){assert(s.setMode(m));assert.equal(s.round,1);assert.equal(s.elapsed,20);}assert(!s.setMode('other'));s.running=false;s.tick(9);assert.equal(s.elapsed,20);});
test('同一事件不会重复执行，未知支援拒绝',()=>{const s=new LiveSession();const e={id:'gift-1',type:'support',action:'tank'};assert(s.receive(e).ok);assert(!s.receive(e).ok);assert(!s.receive({id:'g2',type:'support',action:'invalid'}).ok);});
test('投票每人一票可改票，选组有冷却，名单上限',()=>{const s=new LiveSession();s.receive({id:'1',type:'comment',uid:'a',text:'跟随'});s.receive({id:'2',type:'comment',uid:'a',text:'守城'});assert.equal(s.votes.size,1);assert.equal(s.winner(),'defend');assert(s.receive({id:'3',type:'comment',uid:'a',text:'医疗'}).ok);assert(!s.receive({id:'4',type:'comment',uid:'a',text:'工程'}).ok);for(let i=0;i<199;i++)s.receive({id:'u'+i,type:'comment',uid:'u'+i,text:'加入'});assert.equal(s.viewers.size,200);assert(!s.receive({id:'overflow',type:'comment',uid:'overflow',text:'加入'}).ok);});
test('普通消息与两种压缩长连均可解析，坏包拒绝',()=>{const original=packet(5,JSON.stringify({cmd:'LIVE_OPEN_PLATFORM_SEND_GIFT',data:{gift_num:1}}));assert.equal(parsePackets(original)[0].data.data.gift_num,1);for(const [v,compress]of [[2,deflateSync],[3,brotliCompressSync]]){const p=packet(5);p.writeUInt16BE(v,6);const body=compress(original),b=Buffer.concat([p,body]);b.writeUInt32BE(b.length);assert.equal(parsePackets(b)[0].data.cmd,'LIVE_OPEN_PLATFORM_SEND_GIFT');}assert.throws(()=>parsePackets(Buffer.alloc(3)));const bad=packet(5,'{}');bad.writeUInt32BE(9999);assert.throws(()=>parsePackets(bad));});
test('官方签名稳定，不损坏UTF8内容',()=>{const h=signedHeaders('{"msg":"虫潮"}',{accessKeyId:'test',accessKeySecret:'test-secret'},100,'nonce');assert.equal(h.Authorization.length,64);assert.equal(h['x-bili-content-md5'].length,32);assert.equal(h.Authorization,signedHeaders('{"msg":"虫潮"}',{accessKeyId:'test',accessKeySecret:'test-secret'},100,'nonce').Authorization);});
test('AI语音拒绝链接、不合适内容与错误投票规则，保留短战况',()=>{assert.equal(allowedSpeech('基地耐久1200，请守住东门。'),'基地耐久1200，请守住东门。');assert.equal(allowedSpeech('请访问https://test.invalid'),null);assert.equal(allowedSpeech('请刷礼物中奖提现'),null);assert.equal(allowedSpeech('弹幕投票决定兵种，守城或跟随。'),null);assert.equal(allowedSpeech('兵种由投票选出。'),null);assert.equal(allowedSpeech('自己选择兵种，投票决定守城或跟随。'),'自己选择兵种，投票决定守城或跟随。');});
test('整备进入战斗不会立即判胜，暂停结算后仍能自动下一场',async()=>{
  let listener,resets=0,paused=false;const parent={postMessage(){}};globalThis.window={parent,addEventListener(type,fn){listener=fn;}};globalThis.location={origin:'http://test.local'};
  const {createLiveController}=await import('../../../../public/html/game/starship-defense/live-controller.js');const input={axis:()=>({x:0,y:0}),firing:()=>false};
  const c=createLiveController({input,snapshot:()=>({}),reset(){resets++;paused=false;},blocked:()=>paused,failed:()=>false,begin(){},pause(v){paused=v;},drive:()=>({x:0,y:0}),heal(){},order(){},clearInput(){},spawn(){}});
  c.session.prepSeconds=1;listener({origin:location.origin,source:parent,data:{channel:'chongchao-live',type:'start'}});c.tick(1.1);assert.equal(c.session.phase,'battle');assert.equal(c.session.remaining,300);assert.equal(c.session.won,undefined);
  c.tick(301);assert.equal(c.session.phase,'result');assert.equal(paused,true);c.tick(13);assert.equal(c.session.round,2);assert.equal(resets,2);delete globalThis.window;delete globalThis.location;
});

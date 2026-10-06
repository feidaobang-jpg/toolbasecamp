// Shared browser and local-runtime rules. Use .js for the production Nginx MIME map.
export const LIVE_VERSION='live-v0.1.0';
export const MODES={auto:'AI 独播',assist:'我操作 · AI辅助',host:'我主持 · AI操作'};
export const SUPPORTS={repair:'基地维修',shield:'主角护盾',tank:'坦克支援',strike:'定点轰炸'};
export const COMMANDS={'加入':'join','医疗':'medic','工程':'engineer','突击':'assault','机枪':'gunner','守城':'defend','跟随':'follow','规则':'rules'};
export function cleanName(value){return String(value||'观众').replace(/[\x00-\x1f<>]/g,'').slice(0,20);}
export function classifyComment(text){return COMMANDS[String(text).trim()]||'chat';}
export class LiveSession{
  constructor({roundSeconds=300,prepSeconds=15,resultSeconds=12}={}){
    this.roundSeconds=roundSeconds;this.prepSeconds=prepSeconds;this.resultSeconds=resultSeconds;
    this.mode='auto';this.round=0;this.phase='idle';this.elapsed=0;this.remaining=0;
    this.viewers=new Map();this.votes=new Map();this.seen=new Set();this.log=[];this.running=false;this.lastJoin=new Map();
  }
  setMode(mode){if(!(mode in MODES))return false;this.mode=mode;return true;}
  next(){this.round++;this.phase='prep';this.elapsed=0;this.remaining=this.prepSeconds;this.votes.clear();this.viewers.clear();this.running=true;this.log=[];}
  finish(won){this.phase='result';this.won=won;this.elapsed=0;this.remaining=this.resultSeconds;}
  tick(dt){if(!this.running)return;this.elapsed+=dt;const duration=this.phase==='prep'?this.prepSeconds:this.phase==='battle'?this.roundSeconds:this.resultSeconds;this.remaining=Math.max(0,duration-this.elapsed);}
  receive(e){
    if(!e||!e.id||typeof e.id!=='string'||e.id.length>160)return {ok:false,reason:'事件缺少唯一编号'};
    if(this.seen.has(e.id))return {ok:false,reason:'重复事件'};
    this.seen.add(e.id);if(this.seen.size>10000)this.seen.delete(this.seen.values().next().value);
    const name=cleanName(e.name),uid=String(e.uid||e.id).slice(0,100);
    if(e.type==='support')return e.action in SUPPORTS?{ok:true,action:e.action,name}:{ok:false,reason:'未配置的支援'};
    if(e.type!=='comment')return {ok:false,reason:'未知事件'};
    const action=classifyComment(e.text);
    if(action==='join'||['medic','engineer','assault','gunner'].includes(action)){
      const now=Date.now();if(now-(this.lastJoin.get(uid)||0)<5000)return{ok:false,reason:'每人5秒内只执行一次选组，请稍后再试'};
      if(!this.viewers.has(uid)&&this.viewers.size>=200)return {ok:false,reason:'本场小队名单已满（200人）'};
      this.lastJoin.set(uid,now);
      const prev=this.viewers.get(uid)||{contribution:0};this.viewers.set(uid,{...prev,name,role:action==='join'?(prev.role||'gunner'):action});
      return {ok:true,action:'join',role:this.viewers.get(uid).role,name};
    }
    if(action==='defend'||action==='follow'){this.votes.set(uid,action);return {ok:true,action:'vote',name};}
    return {ok:true,action,name,text:String(e.text||'').slice(0,120)};
  }
  winner(){const votes={defend:0,follow:0};for(const v of this.votes.values())votes[v]++;return votes.follow>votes.defend?'follow':'defend';}
  record(name,text){this.log.unshift({name:cleanName(name),text:String(text).slice(0,100)});this.log.length=Math.min(this.log.length,8);}
  snapshot(){return {version:LIVE_VERSION,mode:this.mode,round:this.round,phase:this.phase,remaining:Math.ceil(this.remaining),running:this.running,won:this.won,viewers:this.viewers.size,votes:[...this.votes.values()].reduce((a,v)=>(a[v]++,a),{defend:0,follow:0}),roster:[...this.viewers.values()].slice(0,8),log:this.log};}
}

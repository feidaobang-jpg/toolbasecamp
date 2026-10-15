import {newSaveId,saveSignature} from './save-store.js';
export class SaveConflict extends Error {constructor(){super('云端已有另一份进度，自动上传已暂停；请比较后选择读取或上传');this.name='SaveConflict';}}
export class CloudSaveSync {
  constructor({provider,store,getSave,validate,isTest,onStatus=()=>{},onCloud=()=>{},now=()=>Date.now(),delay=5000,interval=120000}){
    Object.assign(this,{provider,store,getSave,validate,isTest,onStatus,onCloud,now,delay,interval});
    this.current=null;this.backups=[];this.base=undefined;this.pending=null;this.paused=false;this.enabled=true;this.busy=null;this.timer=null;this.lastWrite=0;
  }
  status(text){this.statusText=text;this.onStatus(text);}
  async refresh(){
    const before=this.getSave();
    const {current,backups=[]}=await this.provider.read();this.current=current;this.backups=backups;
    const local=this.getSave(),marker=this.store.marker(this.provider.id);
    if(!current)this.base=null;
    else if(local&&saveSignature(local)===saveSignature(current.save)){this.base=current.revision;this.store.mark(this.provider.id,current);}
    else if(before?.campaignId&&before.campaignId===local?.campaignId&&saveSignature(before)===saveSignature(current.save)){this.base=current.revision;this.store.mark(this.provider.id,current);}
    else if(local&&marker?.revision===current.revision&&marker.campaignId&&marker.campaignId===local.campaignId)this.base=current.revision;
    else this.base=undefined;
    this.onCloud(current,backups);
    this.status(!current?'云端尚无存档':!local?'发现云端进度，可在档案站选择恢复':this.base===undefined?'本地与云端进度不同，自动上传已暂停；请比较后选择':'云备份已连接');
    return current;
  }
  async start(){try{await this.refresh();}catch(e){this.fail(e);}}
  fail(e){this.paused=true;this.status(e.message||'云备份暂不可用；请保留或导出本地存档');}
  checkpoint(d){
    if(this.isTest()||!this.validate(d))return;
    this.pending=JSON.parse(JSON.stringify(d));
    if(!this.enabled||this.paused||this.timer)return;
    this.timer=setTimeout(()=>{this.timer=null;this.flush().catch(e=>this.fail(e));},this.delay);
  }
  async flush(){
    if(this.busy)return this.busy;
    if(!this.pending||!this.enabled||this.paused||this.isTest())return;
    if(this.lastWrite&&this.now()-this.lastWrite<this.interval)return;
    const d=this.pending;
    this.busy=(async()=>{
      await this.refresh();
      if(this.current&&saveSignature(this.current.save)===saveSignature(d)){if(this.pending&&saveSignature(this.pending)===saveSignature(d))this.pending=null;return;}
      if(this.base===undefined)throw new SaveConflict();
      if(this.current?.save?.campaignId&&this.current.save.campaignId!==d.campaignId)throw new SaveConflict();
      const old=this.current,record=await this.provider.write(d,this.current?.revision||null);
      this.current=record;this.base=record.revision;this.store.mark(this.provider.id,record);this.lastWrite=this.now();
      this.backups=old?[old,...this.backups].slice(0,3):this.backups;
      if(this.pending&&saveSignature(this.pending)===saveSignature(d))this.pending=null;
      this.onCloud(record,this.backups);this.status('云端已备份 · '+new Date(record.save.time).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'}));
    })();
    try{return await this.busy;}catch(e){this.fail(e);throw e;}finally{this.busy=null;}
  }
  async upload(d,expectedRevision){
    if(this.busy)await this.busy;
    if(this.isTest()||!this.validate(d))throw Error('只能备份有效的单机普通进度');
    // Re-read at the confirmation click: never apply approval to an unseen newer save.
    await this.refresh();if((this.current?.revision||null)!==expectedRevision)throw new SaveConflict();
    const old=this.current,record=await this.provider.write(d,expectedRevision);
    this.current=record;this.base=record.revision;this.paused=false;this.pending=null;this.lastWrite=this.now();
    this.store.mark(this.provider.id,record);this.backups=old?[old,...this.backups].slice(0,3):this.backups;
    this.onCloud(record,this.backups);this.status('云端已备份；上一份云档已保留');return record;
  }
  accept(record){this.base=this.current?.revision;this.store.mark(this.provider.id,this.current);this.paused=record.revision!==this.current?.revision;this.pending=null;}
  destroy(){clearTimeout(this.timer);this.timer=null;this.enabled=false;}
}
export const cloudRecord=(save)=>({schema:2,game:'starship-defense',revision:newSaveId(),save:JSON.parse(JSON.stringify(save))});

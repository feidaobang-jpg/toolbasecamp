// Keep the original slot keys so existing website/Toy/TapTap progress stays readable.
export const newSaveId=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
export function saveSignature(save){
  const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().filter(k=>k!=='time').map(k=>[k,ordered(v[k])])):v;
  return JSON.stringify(ordered(save));
}
export class LocalSaveStore {
  constructor({storage,prefix,validate,onStatus=()=>{}}){Object.assign(this,{storage,prefix,validate,onStatus});this.status='尚无本地存档';}
  message(text,ok=true){this.status=text;this.onStatus(text,ok);}
  readRaw(key){try{return this.storage?.getItem(key)||null;}catch{return null;}}
  parse(raw){try{const d=JSON.parse(raw);return this.validate(d)?d:null;}catch{return null;}}
  history(){try{const rows=JSON.parse(this.readRaw(this.prefix+'history')||'[]');return Array.isArray(rows)?rows.filter(d=>this.validate(d)).slice(0,3):[];}catch{return [];}}
  read(key){
    const raw=this.readRaw(key),d=this.parse(raw);if(d){if(this.status==='尚无本地存档')this.message('本地已有存档');return d;}
    if(key===this.prefix+'auto'){
      const fallback=this.history()[0]||this.parse(this.readRaw(this.prefix+'auto-backup'))||this.parse(this.readRaw(this.prefix+'cloud-backup'));
      if(fallback){this.message('自动档缺失或损坏，可从本地备份继续；建议导出备份',false);return fallback;}
      if(raw)this.message('自动档损坏，原数据已保留；请查看云档或导入备份',false);
    }
    return null;
  }
  write(key,d,{rotate=key===this.prefix+'auto'}={}){
    if(!this.validate(d)){this.message('存档数据异常，未覆盖已有进度',false);return false;}
    try{
      if(!this.storage)throw Error('storage unavailable');
      const raw=JSON.stringify(d),old=this.parse(this.readRaw(key));
      // Write the preceding checkpoint first. If any write fails, keep the old primary.
      if(rotate&&old&&saveSignature(old)!==saveSignature(d)){
        const history=[old,...this.history().filter(x=>saveSignature(x)!==saveSignature(old))].slice(0,3);
        this.storage.setItem(this.prefix+'history',JSON.stringify(history));
      }
      this.storage.setItem(key,raw);
      if(this.storage.getItem(key)!==raw)throw Error('storage verification failed');
      this.message('本地已保存 · '+new Date(d.time).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai'}));return true;
    }catch{this.message('本地保存失败：存储不可用或空间不足，请立即导出备份',false);return false;}
  }
  backup(d){return !d||this.write(this.prefix+'cloud-backup',d,{rotate:false});}
  remove(key){try{this.storage.removeItem(key);return true;}catch{this.message('删除失败，原存档已保留',false);return false;}}
  marker(provider){try{return JSON.parse(this.readRaw(this.prefix+'sync-'+provider)||'null');}catch{return null;}}
  mark(provider,record){try{this.storage?.setItem(this.prefix+'sync-'+provider,JSON.stringify({revision:record?.revision||null,campaignId:record?.save?.campaignId||null}));}catch{}}
}

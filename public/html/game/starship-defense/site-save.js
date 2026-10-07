import {SaveConflict} from './cloud-save.js';
const API='https://www.zhengxiaohui.cn/api/game/saves';
export class SiteSaveProvider {
  constructor({token,validate}){this.token=token;this.validate=validate;this.id='site';this.label='网站账号云存档';}
  async request(path,body,method=body?'POST':'GET'){
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try{
      const token=this.token(),response=await fetch(API+path,{method,cache:'no-store',credentials:'omit',signal:abort.signal,
        headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const data=await response.json();
      if(response.status===409)throw new SaveConflict();
      if(response.status===401)throw Error('请登录网站账号后启用云备份；本地游玩可继续');
      if(!response.ok)throw Error(response.status===400&&path==='/login'?'账号或密码不正确':typeof data.detail==='string'?data.detail:'云备份暂不可用；本地进度已保留');
      return data;
    }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw Error('云备份网络连接失败，请稍后重试或导出本地存档');throw e;}finally{clearTimeout(timer);}
  }
  async read(){
    const data=await this.request('/starship-defense');this.id='site-'+data.account_id;this.label='网站账号云存档 · 账号 '+data.account_id;
    if(data.current&&!this.validate(data.current.save))throw Error('云档不兼容，已保留原数据');
    return {current:data.current,backups:(data.backups||[]).filter(r=>this.validate(r.save))};
  }
  async write(save,revision){return (await this.request('/starship-defense',{save,expected_revision:revision},'PUT')).current;}
  login(account,password){return this.request('/login',{account,password});}
}

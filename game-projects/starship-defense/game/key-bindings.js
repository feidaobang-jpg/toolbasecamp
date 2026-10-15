// Persist actions, never executable code. Touch controls keep their action identities.
// 电脑端两套键位方案，各自保存自定义改键（2026-10-15 按玩家反馈：v2 一刀切换成鼠标布局、清掉了老玩家的改键）：
// mouse   左手键盘 + 右手鼠标（参考 CS / 电脑版吃鸡）：左键射击、右键举枪、空格跳、F 互动、G 手雷、E 医疗、Q 换枪……
// classic 双手全键盘（0.38 以前的老键位）：WASD 移动，J 射击、K 跳、U 手雷、I 互动、N 医疗、Q/E 转视角、Y/H 抬头低头……
// 动作名（J、K、U…）沿用旧的内部编号，触屏按钮和联机输入照旧。
export const KEY_ACTIONS={
  up:['前进','KeyW'],down:['后退','KeyS'],left:['左移','KeyA'],right:['右移','KeyD'],
  J:['射击 / 放置',''],K:['跳跃 / 直升机升高','Space'],SPRINT:['按住跑步','ShiftLeft'],CROUCH:['蹲下 / 直升机降低','KeyC'],
  I:['互动 / 上下载具','KeyF'],U:['投掷手雷','KeyG'],H:['医疗 / 兵种支援','KeyE'],X:['切换武器','KeyQ'],
  O:['商店','KeyB'],L:['建造','KeyT'],WAVE:['开始虫潮','KeyX'],R:['换弹 / 出兵','KeyR'],T:['战况 / 队伍 / 测试台','Tab'],
  C:['切换视角','KeyV'],Z:['举枪（电脑也可用右键）',''],PRONE:['趴下（战地）/ 银行换路线','KeyZ'],
  Q:['键盘左转视角',''],E:['键盘右转视角',''],LOOKUP:['键盘抬头',''],LOOKDOWN:['键盘低头',''],
  P:['暂停','KeyP'],M:['声音','KeyM'],F:['全屏','']
};
for(let i=1;i<=9;i++)KEY_ACTIONS['N'+i]=['武器栏 '+i,'Digit'+i];
// 各对战规则共用按键存档，银行升级继续沿用 0。
KEY_ACTIONS.N0=['银行塔防：升级银行','Digit0'];
const CLASSIC={J:'KeyJ',K:'KeyK',CROUCH:'KeyV',I:'KeyI',U:'KeyU',H:'KeyN',X:'KeyX',O:'KeyO',L:'KeyL',WAVE:'KeyR',R:'KeyR',T:'KeyT',
  C:'KeyC',Z:'KeyZ',PRONE:'KeyB',Q:'KeyQ',E:'KeyE',LOOKUP:'KeyY',LOOKDOWN:'KeyH',F:'KeyF'};
export const KEY_SCHEMES={
  mouse:{name:'左手键盘 + 右手鼠标',desc:'参考 CS / 吃鸡：鼠标转视角，左键射击、右键举枪，功能键都在左手附近',
    store:'chongchao-keybindings-v2',defaults:a=>KEY_ACTIONS[a][1],
    // 老键（J、K、U、I、N、O、L）没被占用、对应动作也没改过时仍然可用
    alt:{ShiftRight:'SPRINT',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Enter:'J',KeyJ:'J',KeyK:'K',KeyU:'U',KeyI:'I',KeyN:'H',KeyO:'O',KeyL:'L'}},
  classic:{name:'双手全键盘（老键位）',desc:'不用鼠标也能玩：J 射击、K 跳、U 手雷、I 互动、N 医疗、Q/E 转视角、Y/H 抬头低头、R 开战 / 换弹',
    // 和 0.38 及以前同一个存档：老玩家改过的键原样回来
    store:'chongchao-keybindings-v1',defaults:a=>a in CLASSIC?CLASSIC[a]:KEY_ACTIONS[a][1],
    alt:{ShiftRight:'SPRINT',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Space:'K',Enter:'J'}}
};
// 场景不重叠、可以共用一个键的动作：开始虫潮只在主战役整备时用，换弹 / 出兵只在对战里用
const SHARED=[['WAVE','R']];
const shareOk=(a,b)=>SHARED.some(p=>p.includes(a)&&p.includes(b));
// 没有键盘键、默认用鼠标的动作
const MOUSE={J:'左键',Z:'右键'};
const SCHEME='chongchao-keys-scheme',NOTICE='chongchao-keys-scheme-notice-20261015';
const allowed=code=>/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Tab|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|Backquote)$/.test(code);
const SPARE=[...Array.from({length:26},(_,i)=>'Key'+String.fromCharCode(65+i)),'Semicolon','Quote','Comma','Period','Slash','BracketLeft','BracketRight','Backslash','Minus','Equal','Backquote',
  'ControlLeft','AltLeft','ControlRight','AltRight','ShiftRight'];
export function keyLabel(code){return ({Space:'空格',Tab:'Tab',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'左Shift',ShiftRight:'右Shift',ControlLeft:'左Ctrl',ControlRight:'右Ctrl',AltLeft:'左Alt',AltRight:'右Alt',BracketLeft:'[',BracketRight:']',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\',Minus:'-',Equal:'=',Backquote:'`'}[code])||String(code||'').replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'小键盘');}
const read=key=>{try{const v=JSON.parse(localStorage.getItem(key)||'{}');return v&&typeof v==='object'?v:{};}catch(_e){return {};}};
export function createKeyBindings(){
  let scheme='mouse',keys={},custom={},notice=false;
  const clashOf=(map,action,code)=>code?Object.keys(map).find(a=>a!==action&&map[a]===code&&!shareOk(a,action)):null;
  function load(){
    const s=KEY_SCHEMES[scheme],saved=read(s.store);keys={};custom={};
    for(const a of Object.keys(KEY_ACTIONS))keys[a]=s.defaults(a);
    for(const a of Object.keys(KEY_ACTIONS))if(typeof saved[a]==='string'&&(saved[a]===''||allowed(saved[a]))){keys[a]=saved[a];custom[a]=saved[a];}
    // 自己改过的键优先；后来新增动作的默认键要是撞上了，就挪到一个空键，不丢玩家的改键
    for(const a of Object.keys(KEY_ACTIONS))if(!(a in custom)&&clashOf(keys,a,keys[a]))keys[a]=SPARE.find(c=>!clashOf(keys,a,c))||'';
    // 改键自己互相撞了（旧版本残留）：后来的那个清空，至少保证一个键只做一件事
    for(const a of Object.keys(KEY_ACTIONS))if(clashOf(keys,a,keys[a]))keys[a]='';
  }
  try{
    const savedScheme=localStorage.getItem(SCHEME);
    // 0.38 以前自己改过键的老玩家：直接回到老键位方案和他们的改键
    if(KEY_SCHEMES[savedScheme])scheme=savedScheme;else if(Object.keys(read(KEY_SCHEMES.classic.store)).length)scheme='classic';
    notice=!localStorage.getItem(NOTICE);
  }catch(_e){}
  load();
  const persist=()=>{try{localStorage.setItem(KEY_SCHEMES[scheme].store,JSON.stringify(custom));}catch(_e){}};
  return {
    get scheme(){return scheme;},
    setScheme(s){if(!KEY_SCHEMES[s])return;scheme=s;try{localStorage.setItem(SCHEME,s);}catch(_e){}load();},
    code:a=>keys[a]||'',label:a=>keys[a]?keyLabel(keys[a]):(MOUSE[a]||'未设置'),
    // 一个键可能同时对应两个场景不重叠的动作（老键位里 R 既开战又换弹）
    actions(code){
      const list=Object.keys(keys).filter(a=>keys[a]&&keys[a]===code);if(list.length)return list;
      const n=/^Numpad([1-9])$/.exec(code),legacy=KEY_SCHEMES[scheme].alt[code]||(n?'N'+n[1]:null);
      return legacy&&!(legacy in custom)?[legacy]:[];
    },
    action(code){return this.actions(code)[0]||null;},
    is(code,action){return this.actions(code).includes(action);},
    // 新键已被别的动作占用时直接互换，不再让玩家先去改另一项
    bind(action,code){
      if(!KEY_ACTIONS[action]||!allowed(code))return {error:'该键不可用；Esc、Enter 保留给菜单'};
      const old=keys[action],clash=clashOf(keys,action,code);
      keys[action]=code;custom[action]=code;
      if(clash){keys[clash]=old&&!clashOf(keys,clash,old)?old:'';custom[clash]=keys[clash];}
      persist();return {swapped:clash||null};
    },
    reset(){custom={};persist();load();},
    // 第一次进游戏时提示一次可以切换两套键位（之后不再提示）
    takeNotice(){if(!notice)return false;notice=false;try{localStorage.setItem(NOTICE,'1');}catch(_e){}return true;}
  };
}

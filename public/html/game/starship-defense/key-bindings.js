// Persist actions, never executable code. Touch controls keep their action identities.
export const KEY_ACTIONS={U:['投掷手雷','KeyU'],SPRINT:['按住跑步','ShiftLeft'],up:['前进','KeyW'],down:['后退','KeyS'],left:['左移','KeyA'],right:['右移','KeyD'],J:['射击 / 放置','KeyJ'],K:['跳跃 / 直升机升高','KeyK'],I:['互动 / 上下载具','KeyI'],H:['医疗 / 直升机降低','KeyH'],Y:['直升机升高','KeyY'],O:['商店','KeyO'],L:['建造','KeyL'],X:['下一把武器','KeyX'],C:['切换视角预设','KeyC'],Q:['左转视角','KeyQ'],E:['右转视角','KeyE'],P:['暂停','KeyP'],R:['开始虫潮 / 对战出兵面板','KeyR'],T:['自由测试','KeyT'],M:['声音','KeyM'],F:['全屏','KeyF']};
for(let i=1;i<=9;i++)KEY_ACTIONS['N'+i]=['武器栏 '+i,'Digit'+i];
// 虫潮对战：Z 切换进攻路线，0 升级银行（出兵面板打开时 1-9 派兵）。
KEY_ACTIONS.Z=['对战：切换进攻路线','KeyZ'];KEY_ACTIONS.N0=['对战：升级银行','Digit0'];
const STORE='chongchao-keybindings-v1';
const allowed=code=>/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|Backquote)$/.test(code);
export function keyLabel(code){return ({Space:'空格',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'左Shift',ShiftRight:'右Shift',ControlLeft:'左Ctrl',ControlRight:'右Ctrl',AltLeft:'左Alt',AltRight:'右Alt'})[code]||code.replace(/^Key|^Digit/,'').replace('Numpad','小键盘');}
export function createKeyBindings(){
  let keys={},custom={};
  const defaults=()=>Object.keys(KEY_ACTIONS).forEach(a=>{keys[a]=KEY_ACTIONS[a][1];});
  defaults();
  try{const saved=JSON.parse(localStorage.getItem(STORE)||'{}');const candidate={...keys};
    for(const a of Object.keys(KEY_ACTIONS))if(typeof saved[a]==='string'&&allowed(saved[a]))candidate[a]=saved[a];
    // New actions must not discard older custom controls using their default keys.
    for(const added of ['SPRINT','U','Z','N0'])if(!saved[added]&&Object.keys(candidate).some(a=>a!==added&&candidate[a]===candidate[added])){
      candidate[added]=['ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight',...Array.from({length:26},(_,i)=>'Key'+String.fromCharCode(65+i)),...Array.from({length:10},(_,i)=>'Digit'+i)].find(code=>!Object.keys(candidate).some(a=>a!==added&&candidate[a]===code))||'Backquote';
    }
    if(new Set(Object.values(candidate)).size===Object.keys(candidate).length){keys=candidate;custom=saved;}
  }catch(_e){}
  const persist=()=>{try{localStorage.setItem(STORE,JSON.stringify(custom));}catch(_e){}};
  return {
    code:a=>keys[a],label:a=>keyLabel(keys[a]),
    action(code){
      const a=Object.keys(keys).find(a=>keys[a]===code);if(a)return a;
      // Keep familiar alternate keys only until that action is explicitly rebound.
      const alt={ShiftRight:'SPRINT',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Space:'K',Enter:'J',KeyB:'P'};
      const n=/^Numpad([1-9])$/.exec(code),legacy=alt[code]||(n?'N'+n[1]:null);
      return legacy&&!custom[legacy]?legacy:null;
    },
    bind(action,code){
      if(!KEY_ACTIONS[action]||!allowed(code))return '该键不可用；Esc、Enter、Tab 保留给菜单导航';
      const clash=Object.keys(keys).find(a=>a!==action&&keys[a]===code);
      if(clash)return keyLabel(code)+' 已用于「'+KEY_ACTIONS[clash][0]+'」，请先修改该项';
      keys[action]=code;custom[action]=code;persist();return '';
    },
    reset(){custom={};defaults();persist();}
  };
}

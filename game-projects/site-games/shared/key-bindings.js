// Persist actions, never executable code. Touch controls keep their action identities.
// 2026-10（键位 v2）：电脑端改成“鼠标瞄准 + 左手键位”（参考 CS / 电脑版吃鸡）：左键射击、右键举枪、空格跳、Shift 跑、F 互动、G 手雷、
// E 医疗、Q 换枪、V 视角、B 商店、T 建造、X 开始虫潮、C 蹲下 / 直升机降低、Tab 战况。键盘转视角（原 Q/E、Y/H）默认不占键，仍可在「操作设置」里绑定。
// 动作名（J、K、U…）沿用旧的内部编号，触屏按钮和联机输入照旧。
export const KEY_ACTIONS={
  up:['前进','KeyW'],down:['后退','KeyS'],left:['左移','KeyA'],right:['右移','KeyD'],
  J:['射击 / 放置',''],K:['跳跃 / 直升机升高','Space'],SPRINT:['按住跑步','ShiftLeft'],CROUCH:['蹲下 / 直升机降低','KeyC'],
  I:['互动 / 上下载具','KeyF'],U:['投掷手雷','KeyG'],H:['医疗 / 兵种支援','KeyE'],X:['切换武器','KeyQ'],
  O:['商店','KeyB'],L:['建造','KeyT'],WAVE:['开始虫潮','KeyX'],R:['换弹 / 出兵','KeyR'],T:['战况 / 队伍 / 测试台','Tab'],
  C:['切换视角','KeyV'],Z:['举枪 / 银行换路线','KeyZ'],
  Q:['键盘左转视角',''],E:['键盘右转视角',''],LOOKUP:['键盘抬头',''],LOOKDOWN:['键盘低头',''],
  P:['暂停','KeyP'],M:['声音','KeyM'],F:['全屏','']
};
for(let i=1;i<=9;i++)KEY_ACTIONS['N'+i]=['武器栏 '+i,'Digit'+i];
// 各对战规则共用按键存档，银行升级继续沿用 0。
KEY_ACTIONS.N0=['银行塔防：升级银行','Digit0'];
// 没有键盘键、默认用鼠标的动作
const MOUSE={J:'左键'};
const STORE='chongchao-keybindings-v2',NOTICE='chongchao-keys-layout-202610';
const allowed=code=>/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Tab|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|BracketLeft|BracketRight|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|Backquote)$/.test(code);
export function keyLabel(code){return ({Space:'空格',Tab:'Tab',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',ShiftLeft:'左Shift',ShiftRight:'右Shift',ControlLeft:'左Ctrl',ControlRight:'右Ctrl',AltLeft:'左Alt',AltRight:'右Alt',BracketLeft:'[',BracketRight:']',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\',Minus:'-',Equal:'=',Backquote:'`'}[code])||String(code||'').replace(/^Key/,'').replace(/^Digit/,'').replace(/^Numpad/,'小键盘');}
export function createKeyBindings(){
  let keys={},custom={},notice=false;
  const defaults=()=>Object.keys(KEY_ACTIONS).forEach(a=>{keys[a]=KEY_ACTIONS[a][1];});
  defaults();
  // 键位 v2 不沿用 v1 的自定义：布局整体换了，旧的改键大多会和新默认键打架。第一次玩时提示一次新键位。
  try{const saved=JSON.parse(localStorage.getItem(STORE)||'{}');const candidate={...keys};
    for(const a of Object.keys(KEY_ACTIONS))if(typeof saved[a]==='string'&&(saved[a]===''||allowed(saved[a])))candidate[a]=saved[a];
    const codes=Object.values(candidate).filter(Boolean);
    if(new Set(codes).size===codes.length){keys=candidate;custom=saved;}
    notice=!localStorage.getItem(NOTICE);
  }catch(_e){}
  const persist=()=>{try{localStorage.setItem(STORE,JSON.stringify(custom));}catch(_e){}};
  return {
    code:a=>keys[a]||'',label:a=>keys[a]?keyLabel(keys[a]):(MOUSE[a]||'未设置'),
    action(code){
      const a=Object.keys(keys).find(a=>keys[a]&&keys[a]===code);if(a)return a;
      // Keep familiar alternate keys only until that action is explicitly rebound.
      // 旧键位（J 射击、K 跳、U 手雷、I 互动、N 医疗、O 商店、L 建造）不显示，但没被占用、对应动作也没改过时仍然可用，老玩家的手不会一下子全乱
      const alt={ShiftRight:'SPRINT',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Enter:'J',KeyJ:'J',KeyK:'K',KeyU:'U',KeyI:'I',KeyN:'H',KeyO:'O',KeyL:'L'};
      const n=/^Numpad([1-9])$/.exec(code),legacy=alt[code]||(n?'N'+n[1]:null);
      return legacy&&!custom[legacy]?legacy:null;
    },
    bind(action,code){
      if(!KEY_ACTIONS[action]||!allowed(code))return '该键不可用；Esc、Enter 保留给菜单';
      const clash=Object.keys(keys).find(a=>a!==action&&keys[a]===code);
      if(clash)return keyLabel(code)+' 已用于「'+KEY_ACTIONS[clash][0]+'」，请先修改该项';
      keys[action]=code;custom[action]=code;persist();return '';
    },
    reset(){custom={};defaults();persist();},
    // 第一次在新键位下进游戏时提示一次（之后不再提示）
    takeNotice(){if(!notice)return false;notice=false;try{localStorage.setItem(NOTICE,'1');}catch(_e){}return true;}
  };
}

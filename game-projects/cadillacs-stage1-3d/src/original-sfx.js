// 原版街机录音（来源与核对方法见 media-kit/releases/v0.8.1/audio-sources.json）。
// 映射按实机录像逐一核对：普通拳脚命中是轻打击声（游戏里以 0.75 倍速播放，文件已按该速度写好采样率），
// 连招最后一下打中后主角喊一声；必杀是各自的招式喊声；GO 连喊三遍，间隔 0.59 秒；倒地是身体砸地声；
// 起跑（冲刺开始）一声，穆斯塔法飞踢时喊一声。
export const ORIGINAL_FILES = {
  hit: 'cd-hit.wav?v=1', bodyfall: 'cd-bodyfall.wav?v=1', go: 'cd-go.wav?v=1',
  dash: 'cd-dash.wav?v=1', 'shout-mustapha': 'cd-shout-mustapha.wav?v=1',
  'finisher-jack': 'cd-finisher-jack.wav?v=1', 'finisher-hannah': 'cd-finisher-hannah.wav?v=1',
  'finisher-mustapha': 'cd-finisher-mustapha.wav?v=1', 'finisher-mess': 'cd-finisher-mess.wav?v=1',
  'mega-jack': 'cd-mega-jack.wav?v=1', 'mega-hannah': 'cd-mega-hannah.wav?v=1',
  'mega-mustapha': 'cd-mega-mustapha.wav?v=1', 'mega-mess': 'cd-mega-mess.wav?v=1'
};
// 连招最后一下、击倒和冲刺攻击也用同一个原版打击声：v0.9.2 试过的 0083 用户听来是泥沼水声，已撤回
const HIT = new Set(['punch', 'kick', 'punchHeavy', 'kickHeavy', 'dashHit']);
export function originalCue(name, hero = 'jack') {
  const key = HIT.has(name) ? 'hit' : name === 'slam' ? 'bodyfall' : name === 'mega' || name === 'finisher' || name === 'shout' ? name + '-' + hero : name;
  return ORIGINAL_FILES[key] ? key : null;
}

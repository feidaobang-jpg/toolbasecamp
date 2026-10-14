// 亮剑战役的三章（按原作时间顺序）。soon=还没重做：菜单里显示但进不去
import { PinganGame, INFO as PINGAN } from './pingan.js';

export const CHAPTERS = [
  { id: 'cangyunling', num: 1, name: '苍云岭', soon: true, note: '制作中' },
  { id: 'lijiapo', num: 2, name: '李家坡', soon: true, note: '重做中，旧版在大厅「抗战战役」里' },
  Object.assign({}, PINGAN, { Game: PinganGame }),
];

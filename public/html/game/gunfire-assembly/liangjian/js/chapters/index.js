// 亮剑战役的三章（按原作时间顺序）。soon=还没重做：菜单里显示但进不去
import { CangyunlingGame, INFO as CANGYUNLING } from './cangyunling.js';
import { PinganGame, INFO as PINGAN } from './pingan.js';

export const CHAPTERS = [
  Object.assign({}, CANGYUNLING, { Game: CangyunlingGame }),
  { id: 'lijiapo', num: 2, name: '李家坡', soon: true, note: '重做中，旧版在大厅「抗战战役」里' },
  Object.assign({}, PINGAN, { Game: PinganGame }),
];

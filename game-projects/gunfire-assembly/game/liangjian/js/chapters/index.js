// 亮剑战役的三章（按原作时间顺序）。soon=还没重做：菜单里显示但进不去
import { CangyunlingGame, INFO as CANGYUNLING } from './cangyunling.js';
import { LijiapoGame, INFO as LIJIAPO } from './lijiapo.js';
import { PinganGame, INFO as PINGAN } from './pingan.js';

export const CHAPTERS = [
  Object.assign({}, CANGYUNLING, { Game: CangyunlingGame }),
  Object.assign({}, LIJIAPO, { Game: LijiapoGame }),
  Object.assign({}, PINGAN, { Game: PinganGame }),
];

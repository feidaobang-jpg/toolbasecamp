// 第一关「海上都市」关卡数据：楼顶 → 大楼内部 → 第 47 街（Boss 维斯·特修恩 + 岩跳龙）。
// 敌人种类与出场顺序按原作实机录像整理；具体人数、站位、计时与掉落里查不到的部分为推测，记录在 media-kit 还原清单中。
export const HALF_W = 6.8;          // 一屏的半宽（米）：玩家与镜头锁定窗口
export const EDGE = 0.7;            // 角色中心离画面边缘的留量（身体 + 出手）；锁屏时敌人、Boss、被打飞的角色同样受限，侧视镜头保证最前一排纵深也完整入画
export const ENTER_DX = 8.2;        // 敌人从屏幕外进场的距离

// 区域：x0..x1 为可走范围，z0..z1 为纵深；timer 为该区域的倒计时（秒）
export const AREAS = [
  {
    id: 'roof', name: '大楼楼顶', title: 'TOP OF THE BUILDING', x0: 0, x1: 44.7, z0: -2.3, z1: 2.5, start: { x: 2.2, z: 0.6 }, timer: 120,
    props: [
      { kind: 'drum', x: 15.6, z: -1.5, item: 'dynamite' },
      { kind: 'drum', x: 16.5, z: -0.7, item: 'ring' },
      { kind: 'pipes', x: 44.5, z: -2.15, item: null, points: 500 }
    ],
    waves: [
      { id: 'r1', trigger: 0, lock: 7, intro: true, spawns: [
        { type: 'ferris', x: 9.3, z: 1.0, stand: true }, { type: 'gneiss', x: 10.1, z: -0.9, stand: true },
        { type: 'gneiss', x: 10.9, z: 1.7, stand: true }, { type: 'ferris', x: 11.5, z: -0.1, stand: true }] },
      { id: 'r2', trigger: 19, lock: 24, spawns: [{ type: 'ferris', from: 'right', z: 0.8 }, { type: 'gneiss', from: 'right', z: -1.2, delay: 1.2 }, { type: 'ferris', from: 'left', z: 1.5, delay: 2.8 }] },
      { id: 'r3', trigger: 31, lock: 37.9, spawns: [{ type: 'gneiss', from: 'right', z: -0.6 }, { type: 'ferris', from: 'right', z: 1.4, delay: 1.5 }] }
    ],
    exit: { type: 'door', x: 44.4, z: 0.0 }
  },
  {
    id: 'hall', name: '大楼内部', title: 'IN THE BUILDING', x0: 0, x1: 62, z0: -2.1, z1: 2.3, start: { x: 2.0, z: 0.4 }, timer: 120,
    doors: [{ x: 8 }, { x: 20 }, { x: 34 }],
    props: [
      { kind: 'statue', x: 5.6, z: -2.25, item: 'gold' },
      { kind: 'statue', x: 10.4, z: -2.25, item: 'shotgun' },
      { kind: 'statue', x: 45.6, z: -2.25, item: 'smg' },
      { kind: 'statue', x: 53.8, z: -2.25, item: 'barbecue' }
    ],
    waves: [
      { id: 'h1', trigger: 0, lock: 7, spawns: [{ type: 'ferris', from: 'right', z: 0.6, weapon: 'pipe' }, { type: 'gneiss', from: 'left', z: -1.0, delay: 1.6 }] },
      { id: 'h2', trigger: 14, lock: 20, spawns: [{ type: 'punk', from: 'door', door: 1, delay: 0.3 }, { type: 'ferris', from: 'right', z: 1.2, delay: 1.0 }, { type: 'gneiss', from: 'left', z: 0.2, delay: 2.4 }] },
      { id: 'h3', trigger: 27, lock: 33, spawns: [{ type: 'blade', from: 'right', z: 0.4, drop: 'gun' }, { type: 'ferris', from: 'door', door: 2, delay: 1.2 }, { type: 'gneiss', from: 'left', z: 1.4, delay: 2.6 }] },
      { id: 'h4', trigger: 40, lock: 48, spawns: [{ type: 'hammer', from: 'right', z: 0.8, drop: 'hamburger' }, { type: 'wrench', from: 'right', z: -1.0, delay: 2.2, drop: 'steak' }, { type: 'gneiss', from: 'left', z: 0.4, delay: 3.4 }, { type: 'elmer', from: 'right', z: 1.6, delay: 5.0, drop: 'donut' }] }
    ],
    exit: { type: 'window', x: 60.6, z: 0.0 }
  },
  {
    id: 'street', name: '第47街', title: '47TH STREET', x0: 0, x1: 66, z0: -2.3, z1: 2.5, start: { x: 2.4, z: 0.5 }, timer: 120,
    props: [
      { kind: 'drum', x: 23.0, z: -1.7, item: 'bazooka' },
      { kind: 'drum', x: 50.2, z: -1.8, item: 'steak' }
    ],
    waves: [
      { id: 's1', trigger: 0, lock: 7, spawns: [{ type: 'elmer', from: 'facade', x: 6.0, z: -2.5, delay: 0.6, drop: 'steak' }, { type: 'ferris', from: 'wall', x: 10.2, z: -2.2, delay: 1.4 }, { type: 'gneiss', from: 'wall', x: 12.6, z: -2.2, delay: 3.0 }] },
      { id: 's2', trigger: 24, lock: 30, spawns: [{ type: 'punk', from: 'right', z: 1.0 }, { type: 'ferris', from: 'left', z: -0.8, delay: 1.0 }] }
    ],
    boss: { trigger: 45, lock: 55, viceX: 59.5, viceZ: -0.2, raptorX: 57.2, raptorZ: 0.6 }
  }
];

// 敌人参数（hp 为 1 条血 = 100）：原作数值查不到，按「第一关杂兵三四下连击倒地」的手感推测
export const ENEMY = {
  ferris: { name: 'FERRIS', cn: '费里斯', hp: 46, speed: 2.0, points: 1000, reach: 0.95, dmg: 6, aggr: 0.55, kick: 0.25 },
  gneiss: { name: 'GNEISS', cn: '尼斯', hp: 52, speed: 2.0, points: 2000, reach: 0.95, dmg: 6, aggr: 0.6, kick: 0.3 },
  punk: { name: 'PUNK', cn: '朋克', hp: 34, speed: 3.2, points: 1000, reach: 0.85, dmg: 5, aggr: 0.75, behind: true, bomb: 'dynamite' },
  blade: { name: 'BLADE', cn: '布雷德', hp: 58, speed: 1.4, points: 2000, reach: 1.25, dmg: 11, aggr: 0.45, knife: true },
  elmer: { name: 'BLK ELMER', cn: '黑埃尔默', hp: 92, speed: 1.7, points: 3000, reach: 1.0, dmg: 9, aggr: 0.5, fat: true },
  hammer: { name: 'HAMMER T.', cn: '锤子·T', hp: 86, speed: 1.7, points: 2000, reach: 1.0, dmg: 9, aggr: 0.5, fat: true },
  wrench: { name: 'WRENCH T.', cn: '扳手·T', hp: 98, speed: 1.6, points: 4000, reach: 1.0, dmg: 10, aggr: 0.5, fat: true },
  vice: { name: 'VICE T.', cn: '维斯·T', hp: 400, speed: 2.4, points: 10000, reach: 1.05, dmg: 8, aggr: 0.8, boss: true },
  raptor: { name: 'R.HOPPER', cn: '岩跳龙', hp: 150, speed: 4.2, points: 5000, reach: 1.3, dmg: 10, aggr: 0.7, dino: true }
};
// 原作物品分值（来自原作物品表）：食物回血百分比 / 满血时加分；宝物加分
export const ITEMS = {
  barbecue: { cn: '烤肉', heal: 100, points: 10000, food: true },
  steak: { cn: '牛排', heal: 80, points: 10000, food: true },
  hamburger: { cn: '汉堡', heal: 48, points: 5000, food: true },
  donut: { cn: '甜甜圈', heal: 16, points: 1000, food: true },
  gold: { cn: '金砂袋', points: 5000 },
  diamond: { cn: '钻石', points: 10000 },
  ring: { cn: '戒指', points: 3000 },
  gun: { cn: '左轮手枪', weapon: true, ammo: 6 },
  smg: { cn: '冲锋枪', weapon: true, ammo: 48 },
  bazooka: { cn: '火箭筒', weapon: true, ammo: 4 },
  shotgun: { cn: '霰弹枪', weapon: true, ammo: 6 },
  dynamite: { cn: '炸药', weapon: true, ammo: 1 },
  grenade: { cn: '手雷', weapon: true, ammo: 1 },
  knife: { cn: '小刀', weapon: true, ammo: 1 },
  pipe: { cn: '铁管', weapon: true, ammo: 8 },
  ammo: { cn: '弹药', points: 1000 }
};
// 玩家角色：选人画面的原作能力值（POWER / SPEED / SKILL）与口号
export const HEROES = [
  { id: 'jack', name: '杰克', en: 'JACK.T', full: '杰克·坦瑞克', power: 4, speed: 3, skill: 3, motto: '“GOOD ABILITY”', cnMotto: '能力全面', dash: 'slide', combo: ['jab1', 'jab2', 'jab1', 'upper'], win: '这下该好好兜风了！' },
  { id: 'hannah', name: '汉娜', en: 'HANNAH.D', full: '汉娜·邓迪', power: 2, speed: 4, skill: 5, motto: '“EX-SKILLED”', cnMotto: '身手极佳', dash: 'kneeFly', combo: ['jab1', 'jab2', 'kickMid', 'kickHi'], win: '别小看女人哦！' },
  { id: 'mustapha', name: '穆斯塔法', en: 'MUSTAPHA.C', full: '穆斯塔法·开罗', power: 3, speed: 5, skill: 3, motto: '“FLYING KICKS”', cnMotto: '飞踢高手', dash: 'flyKick', combo: ['jab1', 'jab2', 'kickMid', 'kickSide'], win: "I'm a Bad Mamba Jamma!" },
  { id: 'mess', name: '梅斯', en: 'MESS.O', full: '梅斯·奥布拉多维奇', power: 5, speed: 2, skill: 4, motto: '“HIGH POWERED”', cnMotto: '力大无穷', dash: 'tackle', combo: ['jab1', 'jab2', 'hook', 'upper'], win: '谁还想挨揍？' }
];

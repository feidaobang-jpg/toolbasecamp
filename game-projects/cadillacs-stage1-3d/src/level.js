// 关卡数据。第一关「海上都市」：楼顶 → 大楼内部 → 第 47 街（Boss 维斯·特修恩 + 岩跳龙）；
// 第二关「沼泽森林」：偷猎者森林（三角龙哈克、熟睡的霸王龙希瓦特）→ 泥沼 MUD SWAMP（链锤兵拉什·T）→ 黄昏的恐龙尸骸地（Boss 屠夫）；
// 第三关「地狱公路」：死亡沙漠 DESERT OF DEATH（沃尔瑟，机修工送来凯迪拉克）→ 开车一路撞过去（Boss 霍格骑摩托扔手雷）。
// 敌人种类、名字与出场顺序按原作实机录像 HUD 整理；具体人数、站位、计时与掉落里查不到的部分为推测，记录在 media-kit 还原清单中。
export const HALF_W = 6.8;          // 一屏的半宽（米）：玩家与镜头锁定窗口
export const EDGE = 0.7;            // 角色中心离画面边缘的留量（身体 + 出手）；锁屏时敌人、Boss、被打飞的角色同样受限，侧视镜头保证最前一排纵深也完整入画
export const ENTER_DX = 8.2;        // 敌人从屏幕外进场的距离

// 三关：first 为该关第一个区域的下标
export const STAGES = [
  { no: 1, name: '海上都市', en: 'CITY IN THE SEA', first: 0 },
  { no: 2, name: '沼泽森林', en: 'THE SWAMP FOREST', first: 3 },
  { no: 3, name: '地狱公路', en: 'HELL ROAD', first: 6 }
];
// 区域：x0..x1 为可走范围，z0..z1 为纵深；timer 为该区域的倒计时（秒）；exit.to 为下一个区域
// 第二关地面一直铺到画面底部，可走纵深加到 z1 = 4.0（前排到画面约八成高处）；侧视取景仍按 camZ1 那一排算（不因纵深加大而拉远），
// 观察点抬高 camTy 米让地面整体下移；比 camZ1 更靠前时左右边界随透视收窄（game.js nearInset）
export const AREAS = [
  {
    id: 'roof', stage: 1, name: '大楼楼顶', title: 'TOP OF THE BUILDING', x0: 0, x1: 44.7, z0: -2.3, z1: 2.5, start: { x: 2.2, z: 0.6 }, timer: 120,
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
    exit: { type: 'door', x: 44.4, z: 0.0, to: 1 }
  },
  {
    id: 'hall', stage: 1, name: '大楼内部', title: 'IN THE BUILDING', x0: 0, x1: 62, z0: -2.1, z1: 2.3, start: { x: 2.0, z: 0.4 }, timer: 120,
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
    exit: { type: 'window', x: 60.6, z: 0.0, to: 2 }
  },
  {
    id: 'street', stage: 1, name: '第47街', title: '47TH STREET', x0: 0, x1: 66, z0: -2.3, z1: 2.5, start: { x: 2.4, z: 0.5 }, timer: 120,
    props: [
      { kind: 'drum', x: 23.0, z: -1.7, item: 'bazooka' },
      { kind: 'drum', x: 50.2, z: -1.8, item: 'steak' }
    ],
    waves: [
      { id: 's1', trigger: 0, lock: 7, spawns: [{ type: 'elmer', from: 'facade', x: 6.0, z: -2.5, delay: 0.6, drop: 'steak' }, { type: 'ferris', from: 'wall', x: 10.2, z: -2.2, delay: 1.4 }, { type: 'gneiss', from: 'wall', x: 12.6, z: -2.2, delay: 3.0 }] },
      { id: 's2', trigger: 24, lock: 30, spawns: [{ type: 'punk', from: 'right', z: 1.0 }, { type: 'ferris', from: 'left', z: -0.8, delay: 1.0 }] }
    ],
    boss: { type: 'vice', trigger: 45, lock: 55, viceX: 59.5, viceZ: -0.2, raptorX: 57.2, raptorZ: 0.6 }
  },
  // ---------- 第二关 ----------
  {
    // 2-1：下了凯迪拉克就被两头发怒的三角龙哈克冲撞；偷猎者端着步枪；熟睡的霸王龙希瓦特，胖子们想把它打醒
    id: 'forest', stage: 2, name: '偷猎者森林', title: 'IN THE POACHERS\' FOREST', x0: 0, x1: 72, z0: -2.3, z1: 4.0, camZ1: 2.5, camTy: 1.0, start: { x: 4.6, z: 0.7 }, timer: 120,
    props: [
      { kind: 'barrel', x: 12.6, z: -1.7, item: 'sunglass' },
      { kind: 'barrel', x: 13.6, z: -1.0, item: 'hamburger' },
      { kind: 'barrel', x: 33.2, z: -1.8, item: 'steak' }
    ],
    car: { x: 0.2, z: -1.55 },
    sleeper: { x: 48.2, z: -1.45 },
    waves: [
      { id: 'f1', trigger: 0, lock: 7, spawns: [{ type: 'hack', from: 'right', z: 0.6, delay: 0.4 }, { type: 'hack', from: 'left', z: -0.8, delay: 5.5 }] },
      { id: 'f2', trigger: 19, lock: 25, spawns: [{ type: 'poacher', from: 'right', z: 0.9, drop: 'smg' }, { type: 'thug', from: 'left', z: -0.6, delay: 1.4 }, { type: 'skinner', from: 'right', z: -1.2, delay: 3.0, drop: 'rifle' }] },
      { id: 'f3', trigger: 38, lock: 45, spawns: [{ type: 'hammer', from: 'right', z: 0.2, wake: true, drop: 'hamburger' }, { type: 'blade', from: 'left', z: 1.2, delay: 1.6 }, { type: 'wrench', from: 'right', z: 1.4, delay: 3.4, wake: true }, { type: 'poacher', from: 'left', z: -0.4, delay: 6.0 }] }
    ],
    exit: { type: 'cliff', x: 70.4, z: 0.0, to: 4 }
  },
  {
    // 2-2：跳下山崖落进泥沼（齐腰深，走不快），格特从水里冒出来；上岸后链锤兵拉什·T
    id: 'swamp', stage: 2, name: '泥沼', title: 'MUD SWAMP', x0: 0, x1: 70, z0: -2.3, z1: 4.0, camZ1: 2.5, camTy: 1.0, start: { x: 2.6, z: 0.4 }, timer: 120,
    water: { x1: 34, bank: 37 },
    props: [
      { kind: 'barrel', x: 47.6, z: -1.8, item: 'grenade' },
      { kind: 'barrel', x: 61.2, z: -1.7, item: 'barbecue' }
    ],
    waves: [
      { id: 's1', trigger: 0, lock: 7, spawns: [{ type: 'gutter', from: 'water', x: 10.6, z: -0.4, delay: 0.8 }, { type: 'gutter', from: 'water', x: 4.0, z: 1.5, delay: 2.0, drop: 'rifle' }, { type: 'elmer', from: 'right', z: 0.8, delay: 3.6, drop: 'donut' }] },
      { id: 's2', trigger: 17, lock: 23, spawns: [{ type: 'skinner', from: 'water', x: 27.4, z: 1.0 }, { type: 'poacher', from: 'right', z: -0.8, delay: 1.2 }, { type: 'gneiss', from: 'left', z: 0.4, delay: 2.6 }] },
      { id: 's3', trigger: 41, lock: 47, spawns: [{ type: 'lash', from: 'right', z: 0.2 }, { type: 'blade', from: 'left', z: 1.3, delay: 2.0 }, { type: 'gutter', from: 'right', z: -1.4, delay: 5.0 }] },
      { id: 's4', trigger: 56, lock: 62.5, spawns: [{ type: 'punk', from: 'right', z: 1.0 }, { type: 'thug', from: 'left', z: -0.6, delay: 1.0 }, { type: 'gutter', from: 'right', z: -1.6, delay: 2.4, drop: 'rifle' }] }
    ],
    exit: { type: 'dusk', x: 68.6, z: 0.0, to: 5 }
  },
  {
    // 2-3：天色转暗，满地恐龙尸体；一排油桶都藏着东西；屠夫正在肢解一头死恐龙
    id: 'grave', stage: 2, name: '恐龙尸骸地', title: 'LOOK AT ALL THE DEAD BODIES!', x0: 0, x1: 66, z0: -2.3, z1: 4.0, camZ1: 2.5, camTy: 1.0, start: { x: 2.4, z: 0.4 }, timer: 120,
    props: [
      { kind: 'drum', x: 14.2, z: -1.8, item: 'gold' },
      { kind: 'drum', x: 15.4, z: -1.8, item: 'steak' },
      { kind: 'drum', x: 16.6, z: -1.8, item: 'grenade' },
      { kind: 'drum', x: 14.8, z: 0.9, item: 'ring' },
      { kind: 'drum', x: 16.0, z: 0.9, item: 'hamburger' }
    ],
    waves: [
      { id: 'g1', trigger: 0, lock: 7, spawns: [{ type: 'poacher', from: 'right', z: 0.6, drop: 'rifle' }, { type: 'skinner', from: 'right', z: -1.0, delay: 1.5 }, { type: 'thug', from: 'left', z: 1.2, delay: 3.0 }] },
      { id: 'g2', trigger: 22, lock: 28, spawns: [{ type: 'gutter', from: 'right', z: 0.4 }, { type: 'gneiss', from: 'left', z: -0.8, delay: 1.2 }, { type: 'elmer', from: 'right', z: 1.4, delay: 2.6, drop: 'steak' }, { type: 'razor', from: 'left', z: 0.8, delay: 4.4 }] }
    ],
    boss: { type: 'butcher', trigger: 41, lock: 50, x: 54.4, z: -0.8, carcass: { x: 58.6, z: -1.2 } }
  },
  // ---------- 第三关「地狱公路 HELL ROAD」（地图上这一带叫 WASTE LAND） ----------
  // 按原作实机录像（一币通关 Y48MXUjtYwc 8:40–11:05、梅斯无伤 qeHp2Au4rfQ 6:15–8:10）整理，逐项对照见 media-kit/releases/v0.11.0-hellroad.1/restoration.md
  {
    // 3-1：荒漠里四个手下蹲着等人 → GO 之后出字幕「DESERT OF DEATH」、木桶里是弹药箱，胖子锤子·T 带着车手、尼斯冲过来
    // → 仙人掌石堆旁的大块头沃尔瑟 → 打倒后机修工开着凯迪拉克赶到：「开这辆车走，会安全些。上吧！」
    id: 'desert', stage: 3, name: '死亡沙漠', title: 'DESERT OF DEATH', x0: 0, x1: 60, z0: -2.3, z1: 4.0, camZ1: 2.5, camTy: 0.55, camPitch: -0.07, start: { x: 3.0, z: 0.2 }, timer: 150, noShake: true,
    props: [
      { kind: 'barrel', x: 22.6, z: 1.3, item: 'ammo' },
      { kind: 'barrel', x: 23.5, z: 2.1, item: 'ammo' }
    ],
    waves: [
      { id: 'd1', trigger: 0, lock: 7, clearBanner: true, spawns: [
        { type: 'ferris', x: 9.4, z: 0.3, stand: true, squat: true }, { type: 'driver', x: 11.7, z: 0.1, stand: true, squat: true },
        { type: 'gneiss', x: 9.6, z: 1.9, stand: true, squat: true }, { type: 'gneiss', x: 11.9, z: 2.0, stand: true, squat: true }] },
      { id: 'd2', trigger: 20, lock: 26, spawns: [{ type: 'hammer', from: 'right', z: 0.5, drop: 'hamburger' }, { type: 'driver', from: 'right', z: 1.5, delay: 0.3 }, { type: 'gneiss', from: 'right', z: -0.7, delay: 0.7 }, { type: 'driver', from: 'right', z: 0.9, delay: 6.5 }] },
      { id: 'd3', trigger: 40, lock: 47.5, spawns: [{ type: 'driver', from: 'left', z: 1.2 }, { type: 'walther', from: 'right', z: 0.3, delay: 1.0, drop: 'steak' }] }
    ],
    exit: { type: 'car', to: 7 }   // 这一波打完凯迪拉克就到，不用走到出口
  },
  {
    // 3-2：开着凯迪拉克一路撞过去（画面自动向右卷，车在一屏之内自由移动）→ 霍格骑着喷火涂装的摩托追上来扔手雷，用车撞他；
    // 车挨够手雷就爆炸，下车徒步打完。整段只有一屏宽，地面和布景按车速向后卷（game 里的 G.roadDist）
    id: 'road', stage: 3, name: '地狱公路', title: 'HELL ROAD', x0: 0, x1: 13.6, z0: -2.3, z1: 4.0, camZ1: 2.5, camTy: 0.55, camPitch: -0.07, start: { x: 5.2, z: 0.6 }, timer: 180, noShake: true, road: true,
    props: [], waves: []
  }
];
// 第三关公路：车速（米/秒）、车身半长半宽、车能开到的范围；路上的敌人与障碍按出发后的秒数出现（顺序照原作，人数与间隔为推测）
export const ROAD = {
  speed: 13, carL: 2.62, carW: 0.98, x0: 2.9, x1: 10.7, z0: -1.25, z1: 3.0,
  // k: 人 man（pose 蹲 squat / 站 stand / 跑过来 run / 扑上来 leap / 端枪 aim）、摩托 bike、轮胎堆 tires、铁桶 drum、木桶 barrel
  events: [
    { t: 0.9, k: 'barrel', z: 0.9, item: 'ammo' },
    { t: 1.5, k: 'man', type: 'razor', z: -0.2, pose: 'leap' }, { t: 1.62, k: 'man', type: 'razor', z: 0.9, pose: 'leap' }, { t: 1.75, k: 'man', type: 'razor', z: 2.0, pose: 'leap' },
    { t: 2.9, k: 'man', type: 'gutter', z: 2.4, pose: 'aim' },
    { t: 3.7, k: 'man', type: 'skinner', z: -0.5, pose: 'stand' }, { t: 3.9, k: 'man', type: 'punk', z: 0.6, pose: 'squat' }, { t: 4.0, k: 'man', type: 'thug', z: 1.6, pose: 'stand' }, { t: 4.15, k: 'man', type: 'punk', z: 2.5, pose: 'squat' }, { t: 4.3, k: 'man', type: 'thug', z: -0.1, pose: 'squat' },
    { t: 5.6, k: 'tires', z: -0.7 }, { t: 5.75, k: 'tires', z: 0.9 }, { t: 5.9, k: 'tires', z: 2.5 },
    { t: 7.0, k: 'man', type: 'walther', z: 0.2, pose: 'leap' }, { t: 7.25, k: 'tires', z: 1.9 }, { t: 7.5, k: 'man', type: 'walther', z: 2.6, pose: 'run' }, { t: 7.6, k: 'tires', z: -0.9 },
    { t: 8.8, k: 'man', type: 'wrench', z: 1.0, pose: 'run' },
    { t: 9.8, k: 'man', type: 'skinner', z: -0.6, pose: 'aim' }, { t: 10.0, k: 'man', type: 'gutter', z: 1.9, pose: 'stand' }, { t: 10.3, k: 'man', type: 'poacher', z: 0.4, pose: 'aim' },
    { t: 11.4, k: 'bike', z: 0.5 },
    { t: 12.6, k: 'man', type: 'hammer', z: 2.2, pose: 'stand' }, { t: 12.85, k: 'man', type: 'hammer', z: -0.5, pose: 'run' },
    { t: 13.8, k: 'bike', z: 2.3 },
    { t: 14.7, k: 'man', type: 'wrench', z: 0.2, pose: 'stand' }, { t: 14.95, k: 'man', type: 'wrench', z: 2.6, pose: 'run' },
    { t: 16.0, k: 'bike', z: -0.3 },
    { t: 17.4, k: 'man', type: 'punk', z: -0.6, pose: 'run' }, { t: 17.5, k: 'man', type: 'thug', z: 0.5, pose: 'leap' }, { t: 17.65, k: 'man', type: 'punk', z: 1.5, pose: 'squat' }, { t: 17.8, k: 'man', type: 'thug', z: 2.4, pose: 'squat' }, { t: 17.95, k: 'man', type: 'punk', z: 0.9, pose: 'leap' },
    { t: 19.6, k: 'drum', z: 2.6, item: 'ammo' }, { t: 19.8, k: 'drum', z: 0.4 }, { t: 20.05, k: 'drum', z: -0.9 }, { t: 20.3, k: 'drum', z: 1.6, item: 'ammo' }, { t: 20.55, k: 'drum', z: 0.1 },
    { t: 22.2, k: 'man', type: 'ferris', z: 2.5, pose: 'squat' }, { t: 22.3, k: 'man', type: 'gneiss', z: 0.4, pose: 'leap' }, { t: 22.4, k: 'man', type: 'ferris', z: 1.4, pose: 'leap' }, { t: 22.55, k: 'man', type: 'driver', z: -0.6, pose: 'run' }, { t: 22.7, k: 'man', type: 'gneiss', z: 2.0, pose: 'squat' }, { t: 22.85, k: 'man', type: 'ferris', z: 0.0, pose: 'leap' },
    { t: 24.4, k: 'barrel', z: 0.2 }, { t: 24.55, k: 'barrel', z: 1.5, item: 'ammo' }, { t: 24.7, k: 'barrel', z: 2.7 }, { t: 24.9, k: 'barrel', z: -0.8 }, { t: 25.1, k: 'barrel', z: 0.9 }, { t: 25.3, k: 'barrel', z: 2.1, item: 'ammo' }
  ],
  hoggAt: 27.5,          // 霍格出场
  carHits: { easy: 5, std: 4, classic: 3 },   // 凯迪拉克挨几颗手雷爆炸（原作录像里约 3 颗；宽松 / 标准档多给）
  ram: 30                // 用车撞霍格一下的伤害（14 下撞死；原作录像里熟练玩家约半分钟）
};

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
  raptor: { name: 'R.HOPPER', cn: '岩跳龙', hp: 150, speed: 4.2, points: 5000, reach: 1.3, dmg: 10, aggr: 0.7, dino: true },
  // 第二关：名字取自原作 HUD。步枪兵远处举枪瞄准（枪口闪光预警）后开枪，近身用枪托砸
  hack: { name: 'HACK', cn: '哈克', hp: 130, speed: 2.3, points: 5000, reach: 1.3, dmg: 12, aggr: 0.6, dino: 'trike' },
  shivat: { name: 'SHIVAT', cn: '希瓦特', hp: 320, speed: 2.1, points: 10000, reach: 2.3, dmg: 15, aggr: 0.7, dino: 'trex' },
  poacher: { name: 'POACHER J', cn: '偷猎者 J', hp: 44, speed: 2.0, points: 2000, reach: 0.95, dmg: 6, aggr: 0.5, rifle: true, kick: 0.1 },
  skinner: { name: 'SKINNER', cn: '斯金纳', hp: 52, speed: 2.0, points: 2000, reach: 0.95, dmg: 7, aggr: 0.55, rifle: true, kick: 0.2 },
  gutter: { name: 'GUTTER', cn: '格特', hp: 48, speed: 1.9, points: 2000, reach: 0.95, dmg: 7, aggr: 0.5, rifle: true },
  thug: { name: 'THUG', cn: '打手', hp: 42, speed: 2.1, points: 1000, reach: 0.95, dmg: 6, aggr: 0.6, kick: 0.25 },
  razor: { name: 'RAZOR', cn: '雷泽', hp: 54, speed: 1.5, points: 2000, reach: 1.25, dmg: 10, aggr: 0.45, knife: true },
  lash: { name: 'LASH T.', cn: '拉什·T', hp: 230, speed: 1.8, points: 8000, reach: 1.1, dmg: 10, aggr: 0.65, mace: true },
  butcher: { name: 'BUTCHER', cn: '屠夫', hp: 520, speed: 2.3, points: 10000, reach: 1.25, dmg: 10, aggr: 0.85, boss: true },
  // 第三关：名字取自原作 HUD（DRIVER、WALTHER、HOGG）；飞车党在录像里没有显示名字，BIKER 为自拟
  driver: { name: 'DRIVER', cn: '车手', hp: 50, speed: 2.2, points: 1000, reach: 0.95, dmg: 6, aggr: 0.6, kick: 0.3 },
  walther: { name: 'WALTHER', cn: '沃尔瑟', hp: 170, speed: 1.9, points: 3000, reach: 1.1, dmg: 11, aggr: 0.6, fat: true },
  biker: { name: 'BIKER', cn: '飞车党', hp: 40, speed: 2.2, points: 2000, reach: 0.95, dmg: 6, aggr: 0.6 },
  hogg: { name: 'HOGG', cn: '霍格', hp: 420, speed: 6, points: 10000, reach: 1.2, dmg: 12, aggr: 0.9, boss: true }
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
  sword: { cn: '砍刀', weapon: true, ammo: 12 },   // 屠夫被打倒时掉下的双刀
  rifle: { cn: '步枪', weapon: true, ammo: 6 },
  sunglass: { cn: '太阳镜', points: 1000 },
  ammo: { cn: '弹药', points: 1000 }
};
// 玩家角色：选人画面的原作能力值（POWER / SPEED / SKILL）与口号
export const HEROES = [
  { id: 'jack', name: '杰克', en: 'JACK.T', full: '杰克·坦瑞克', power: 4, speed: 3, skill: 3, motto: '“GOOD ABILITY”', cnMotto: '能力全面', dash: 'slide', combo: ['jab1', 'jab2', 'jab1', 'upper'], win: '这下该好好兜风了！' },
  { id: 'hannah', name: '汉娜', en: 'HANNAH.D', full: '汉娜·邓迪', power: 2, speed: 4, skill: 5, motto: '“EX-SKILLED”', cnMotto: '身手极佳', dash: 'kneeFly', combo: ['jab1', 'jab2', 'kickMid', 'kickHi'], win: '别小看女人哦！' },
  { id: 'mustapha', name: '穆斯塔法', en: 'MUSTAPHA.C', full: '穆斯塔法·开罗', power: 3, speed: 5, skill: 3, motto: '“FLYING KICKS”', cnMotto: '飞踢高手', dash: 'flyKick', combo: ['jab1', 'jab2', 'kickMid', 'kickSide'], win: "I'm a Bad Mamba Jamma!" },
  { id: 'mess', name: '梅斯', en: 'MESS.O', full: '梅斯·奥布拉多维奇', power: 5, speed: 2, skill: 4, motto: '“HIGH POWERED”', cnMotto: '力大无穷', dash: 'tackle', combo: ['jab1', 'jab2', 'hook', 'upper'], win: '谁还想挨揍？' }
];

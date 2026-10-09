// 关卡数据。第一关「海上都市」：楼顶 → 大楼内部 → 第 47 街（Boss 维斯·特修恩 + 岩跳龙）；
// 第二关「沼泽森林」：偷猎者森林（三角龙哈克、熟睡的霸王龙希瓦特）→ 泥沼 MUD SWAMP（链锤兵拉什·T）→ 黄昏的恐龙尸骸地（Boss 屠夫）。
// 敌人种类、名字与出场顺序按原作实机录像 HUD 整理；具体人数、站位、计时与掉落里查不到的部分为推测，记录在 media-kit 还原清单中。
export const HALF_W = 6.8;          // 一屏的半宽（米）：玩家与镜头锁定窗口
export const EDGE = 0.7;            // 角色中心离画面边缘的留量（身体 + 出手）；锁屏时敌人、Boss、被打飞的角色同样受限，侧视镜头保证最前一排纵深也完整入画
export const ENTER_DX = 8.2;        // 敌人从屏幕外进场的距离

// 关卡：first 为该关第一个区域的下标
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
  }
];

// 第三关：荒漠步战接公路追逐
AREAS.push({
  id:'desert',stage:3,name:'死亡荒漠',title:'HELL ROAD',x0:0,x1:36,z0:-2.8,z1:3.8,camZ1:2.5,camTy:.6,start:{x:3,z:.5},timer:120,
  props:[{kind:'drum',x:17,z:-1.5,item:'steak'},{kind:'drum',x:22,z:2.5,item:'gun'}],
  waves:[
    {id:'d1',trigger:0,lock:7,spawns:[{type:'punk',from:'right',z:.5},{type:'gneiss',from:'left',z:-1,delay:1.2},{type:'punk',from:'right',z:2,delay:2.5}]},
    {id:'d2',trigger:15,lock:21,spawns:[{type:'blade',from:'right',z:-.8},{type:'poacher',from:'right',z:2,delay:1.8,drop:'rifle'},{type:'thug',from:'left',z:.5,delay:3.3}]}
  ],exit:{type:'radio',x:29,z:.5,to:7}
},{id:'hellroad',stage:3,name:'地狱公路',title:'HELL ROAD',x0:8,x1:24,z0:-2.8,z1:3.8,camZ1:2.5,camTy:.65,start:{x:11,z:.5},timer:150,props:[],waves:[]});

// 敌人参数（hp 为 1 条血 = 100）：原作数值查不到，按战斗手感调校
export const ENEMY = {
  hogg: {name:'HOGG',cn:'霍格',hp:460,speed:2.4,points:20000,reach:1.3,dmg:17,aggr:.8,boss:true},
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
  butcher: { name: 'BUTCHER', cn: '屠夫', hp: 520, speed: 2.3, points: 10000, reach: 1.25, dmg: 10, aggr: 0.85, boss: true }
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

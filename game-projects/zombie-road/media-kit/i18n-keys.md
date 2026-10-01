# 公路打僵尸 3D · i18n key 中英对照

命名空间 `zombieRoad.*`。站点级 locale 文件（`public/js/locales/*.js`）不含这些 key（本次未修改共享 locale 文件）；
页面 `index.html` 内嵌 `window.GAME_I18N` 兜底字典，`main.js` 的 `t()` 先查站点词典、再查兜底词典、最后原样返回 key。

共 72 个 key（含本列表全部条目，页面内 zh/en 各 72 条）。

## 页面结构与面板

| key | zh | en |
| --- | --- | --- |
| zombieRoad.kicker | 原创丧尸公路防守演示 · THREE.JS | Original zombie highway defense demo · THREE.JS |
| zombieRoad.title | 公路打僵尸 3D | Zombie Road 3D |
| zombieRoad.intro | 雪夜公路尽头，僵尸潮顺着车道涌向你身后的沙袋防线。六波一波比一波凶：击杀捡零件、建造机枪塔，活到「巨骸领主」倒下。 | On a snow-night highway, the zombie horde shambles down the lanes toward your sandbag line. Six waves, each fiercer: harvest parts from kills, build turrets and outlive the Bone Lord. |
| zombieRoad.note | 原创丧尸题材演示 · 程序化美术与音效 | Original zombie demo · Procedural art & sound |
| zombieRoad.start | Enter · 开始守线 | Enter · Hold the line |
| zombieRoad.nextWave | Enter · 下一波 | Enter · Next wave |
| zombieRoad.nextStage | Enter · 进入第 {n} 关 | Enter · Stage {n} |
| zombieRoad.retry | Enter · 重新守线 | Enter · Hold again |
| zombieRoad.back | 游戏中心 | Game hub |
| zombieRoad.pause | 暂停 | Pause |
| zombieRoad.resume | 继续 | Resume |
| zombieRoad.paused | 已暂停 | Paused |
| zombieRoad.full | 全屏 | Fullscreen |
| zombieRoad.fullFail | 此浏览器拒绝了全屏请求 | Fullscreen was blocked by the browser |
| zombieRoad.soundOn | 声音：开 | Sound: On |
| zombieRoad.soundOff | 声音：关 | Sound: Off |
| zombieRoad.touch | 触屏控制 | Touch controls |
| zombieRoad.demo | 演示无敌 | Demo invincibility |
| zombieRoad.demoHint | 演示无敌：开启后玩家不受伤害（默认关） | Demo invincibility: the player takes no damage (off by default) |

## 操作说明

| key | zh | en |
| --- | --- | --- |
| zombieRoad.move | 移动（相对镜头） | Move (camera-relative) |
| zombieRoad.turn | ←/→ 转向 · ↑/↓ 俯仰 | ←/→ Turn · ↑/↓ Pitch |
| zombieRoad.fire | 射击（按住） · 翻滚闪避 | Fire (hold) · Combat roll |
| zombieRoad.weapon | 切换武器 1/2/3 | Switch weapon 1/2/3 |
| zombieRoad.build | 建机枪塔（100 零件） · 维修（40） | Build turret (100 parts) · Repair (40) |
| zombieRoad.camera | Q/E 视角 · C 默认 | Q/E Camera · C Default |
| zombieRoad.startPause | Enter 开始/波间继续 · Esc 暂停 | Enter Start/Continue · Esc Pause |
| zombieRoad.help | WASD 移动 · J 射击 · L 翻滚 · 1/2/3 武器 · U 建塔 · I 维修 · Q/E/C 视角 · Esc 暂停 | WASD Move · J Fire · L Roll · 1/2/3 Weapons · U Turret · I Repair · Q/E/C Camera · Esc Pause |

## HUD 与武器

| key | zh | en |
| --- | --- | --- |
| zombieRoad.hudWall | 防线 | Line |
| zombieRoad.hudHp | 状态 | Health |
| zombieRoad.hudParts | 零件 | Parts |
| zombieRoad.hudWave | 波次 | Wave |
| zombieRoad.hudWeapon | 武器 | Weapon |
| zombieRoad.hudScore | 得分 | Score |
| zombieRoad.best | 最佳 | Best |
| zombieRoad.w1 | 步枪 | Rifle |
| zombieRoad.w2 | 喷火器 | Flamethrower |
| zombieRoad.w3 | 狙击枪 | Sniper rifle |

## 战斗流程提示

| key | zh | en |
| --- | --- | --- |
| zombieRoad.waveBanner | 第 {n} 波 | Wave {n} |
| zombieRoad.bossWave | 第 6 波 · 巨骸领主 | Wave 6 · Bone Lord |
| zombieRoad.waveClear | 波次肃清 · Enter 继续 | Wave cleared · Enter to continue |
| zombieRoad.stageTag | 第 {n} 关 | Stage {n} |
| zombieRoad.winTitle | 公路守住了！ | The road held! |
| zombieRoad.winCopy | 六波僵尸潮全部击退，得分 {score}。第 {n} 关的尸潮更多更硬，随时再战。 | All six waves repelled with {score} points. Stage {n} horde is bigger and tougher — fight again anytime. |
| zombieRoad.loseTitle | 防线陷落 | The line has fallen |
| zombieRoad.loseCopy | 尸潮冲垮了沙袋防线，你坚守到第 {n} 波。 | The horde overran the sandbags. You held until wave {n}. |
| zombieRoad.turretBuilt | 机枪塔已部署 | Auto-turret deployed |
| zombieRoad.turretFixed | 机枪塔已修复 | Turret repaired |
| zombieRoad.turretDown | 一座机枪塔被摧毁 | A turret was destroyed |
| zombieRoad.turretNeed | 零件不足（需要 100） | Not enough parts (100 required) |
| zombieRoad.turretMax | 机枪塔数量已达上限 | Turret limit reached |
| zombieRoad.buildFar | 无法在此建造（防线前方、靠近玩家） | Can't build here (ahead of the line, near you) |
| zombieRoad.repairNone | 附近没有损坏的机枪塔 | No damaged turret nearby |
| zombieRoad.buildHint | U · 建造机枪塔（100 零件） | U · Build turret (100 parts) |
| zombieRoad.repairHint | I · 维修机枪塔（40 零件） | I · Repair turret (40 parts) |
| zombieRoad.repairNoParts | 零件不足，无法维修 | Not enough parts to repair |
| zombieRoad.respawn | 重整防线！ | Back in the fight! |
| zombieRoad.wallAlarm | 警告：防线遭到啃食！ | Warning: the line is under attack! |
| zombieRoad.enrage | 巨骸领主进入狂暴！ | The Bone Lord is enraged! |
| zombieRoad.newBest | 新纪录！ | New record! |

## 触屏按钮短标签

| key | zh | en |
| --- | --- | --- |
| zombieRoad.fireShort | 射击 | Fire |
| zombieRoad.rollShort | 翻滚 | Roll |
| zombieRoad.buildShort | 建塔 | Build |
| zombieRoad.repairShort | 维修 | Repair |
| zombieRoad.ws1 | 步枪 | Rifle |
| zombieRoad.ws2 | 喷火 | Flame |
| zombieRoad.ws3 | 狙击 | Sniper |

## 敌人名称（结算清单用）

| key | zh | en |
| --- | --- | --- |
| zombieRoad.enemyShambler | 普通感染者 | Shambler |
| zombieRoad.enemyRunner | 疾行者 | Runner |
| zombieRoad.enemyBrute | 装甲怪 | Armored Brute |
| zombieRoad.enemySpitter | 酸液投手 | Acid Spitter |
| zombieRoad.enemyOverlord | 精英督军 | Taskmaster |
| zombieRoad.enemyBoss | 巨骸领主 | Bone Lord |

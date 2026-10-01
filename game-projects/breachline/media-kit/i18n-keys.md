# 裂隙防线 3D · i18n key 中英对照

命名空间 `breachline.*`。站点级 locale 文件（`public/js/locales/*.js`）不含这些 key；
页面 `index.html` 内嵌 `window.GAME_I18N` 兜底字典，`main.js` 的 `t()` 先查站点词典、再查兜底词典。

共 62 个 key（含本列表全部条目）。

## 页面结构与面板

| key | zh | en |
| --- | --- | --- |
| breachline.kicker | 原创基地攻防演示 · THREE.JS | Original base-defense demo · THREE.JS |
| breachline.title | 裂隙防线 3D | Breachline 3D |
| breachline.intro | 虫群正从远方裂隙源源涌出。与友军小队一起守住城门 10 波进攻：三件武器、翻滚闪避、战功建塔，撑到最后就是胜利。 | A bug swarm pours out of distant rifts. Hold the gate with your squad for 10 waves: three weapons, combat rolls and merit-built turrets. Survive to win. |
| breachline.note | 原创题材演示 · 程序化美术与音效 | Original demo · Procedural art & sound |
| breachline.start | Enter · 开始防守 | Enter · Start defense |
| breachline.nextWave | Enter · 下一波 | Enter · Next wave |
| breachline.nextLoop | Enter · 进入周目 {n} | Enter · Loop {n} |
| breachline.retry | Enter · 重新防守 | Enter · Defend again |
| breachline.back | 游戏中心 | Game hub |
| breachline.pause | 暂停 | Pause |
| breachline.resume | 继续 | Resume |
| breachline.paused | 已暂停 | Paused |
| breachline.full | 全屏 | Fullscreen |
| breachline.fullFail | 此浏览器拒绝了全屏请求 | Fullscreen was blocked by the browser |
| breachline.soundOn | 声音：开 | Sound: On |
| breachline.soundOff | 声音：关 | Sound: Off |
| breachline.touch | 触屏控制 | Touch controls |
| breachline.demo | 演示无敌 | Demo invincibility |
| breachline.demoHint | 演示无敌：开启后玩家不受伤害（默认关） | Demo invincibility: the player takes no damage (off by default) |

## 操作说明

| key | zh | en |
| --- | --- | --- |
| breachline.move | 移动（相对镜头） | Move (camera-relative) |
| breachline.turn | ←/→ 转向 · ↑/↓ 俯仰 | ←/→ Turn · ↑/↓ Pitch |
| breachline.fire | 射击（按住） · 跳跃 · 翻滚闪避 | Fire (hold) · Jump · Combat roll |
| breachline.weapon | 切换武器 1/2/3 | Switch weapon 1/2/3 |
| breachline.build | 建炮塔（100 战功） | Build turret (100 merit) |
| breachline.camera | Q/E 视角 · C 默认 | Q/E Camera · C Default |
| breachline.startPause | Enter 开始/继续 · Esc 暂停 | Enter Start/Continue · Esc Pause |
| breachline.help | WASD 移动 · J 射击 · K 跳 · L 翻滚 · 1/2/3 武器 · U 建塔 · Q/E/C 视角 · Esc 暂停 | WASD Move · J Fire · K Jump · L Roll · 1/2/3 Weapons · U Turret · Q/E/C Camera · Esc Pause |

## HUD 与武器

| key | zh | en |
| --- | --- | --- |
| breachline.hudGate | 城门 | Gate |
| breachline.hudHp | 装甲 | Armor |
| breachline.hudMerit | 战功 | Merit |
| breachline.hudWave | 波次 | Wave |
| breachline.hudWeapon | 武器 | Weapon |
| breachline.best | 最佳 | Best |
| breachline.w1 | 突击步枪 | Assault rifle |
| breachline.w2 | 狙击枪 | Sniper rifle |
| breachline.w3 | 火箭筒 | Rocket launcher |

## 战斗流程提示

| key | zh | en |
| --- | --- | --- |
| breachline.waveBanner | 第 {n} 波 | Wave {n} |
| breachline.bossWave | 第 10 波 · 洞窟母巢 | Wave 10 · Hive Matriarch |
| breachline.waveClear | 波次肃清 · Enter 继续 | Wave cleared · Enter to continue |
| breachline.loopTag | 周目 {n} | Loop {n} |
| breachline.winTitle | 防线守住了！ | The line held! |
| breachline.winCopy | 10 波进攻全部击退，战功 {score}。周目 {n} 的虫群更快更硬，随时再战。 | All 10 waves repelled with {score} merit. Loop {n} bugs are faster and tougher — fight again anytime. |
| breachline.loseTitle | 城门陷落 | The gate has fallen |
| breachline.loseCopy | 虫群攻破了城门，你坚守到第 {n} 波。 | The swarm broke through. You held until wave {n}. |
| breachline.turretBuilt | 机枪塔已部署 | Machine-gun turret deployed |
| breachline.turretNeed | 战功不足（需要 100） | Not enough merit (100 required) |
| breachline.turretMax | 炮塔数量已达上限 | Turret limit reached |
| breachline.respawn | 重整防线！ | Back in the fight! |
| breachline.gateAlarm | 警告：城门遭到攻击！ | Warning: the gate is under attack! |
| breachline.newBest | 新纪录！ | New record! |

## 触屏按钮短标签

| key | zh | en |
| --- | --- | --- |
| breachline.fireShort | 射击 | Fire |
| breachline.rollShort | 翻滚 | Roll |
| breachline.buildShort | 建塔 | Build |
| breachline.ws1 | 步枪 | Rifle |
| breachline.ws2 | 狙击 | Sniper |
| breachline.ws3 | 火箭 | Rocket |

## 敌人名称（结算清单用）

| key | zh | en |
| --- | --- | --- |
| breachline.enemyCrawler | 甲刃虫 | Blade Crawler |
| breachline.enemyRunner | 疾行虫 | Sprinter |
| breachline.enemySpitter | 酸囊虫 | Acid Spitter |
| breachline.enemyFlyer | 飞镰虫 | Reaper Flyer |
| breachline.enemyElite | 重甲精英 | Heavy Elite |
| breachline.enemyBoss | 洞窟母巢 | Hive Matriarch |

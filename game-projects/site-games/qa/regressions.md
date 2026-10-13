# 游戏回归索引

修改前按游戏、文件和行为检索本索引；发布前运行受影响的检查。历史 release 保存当时证据，本索引只保存仍须遵守的行为与复验入口，不复制版本流水账。不把「记住」或静态属性检查当作行为已验证，也不因本索引顺带修改其他游戏。

| ID / 适用范围 | 已确认行为与容易再次引入的问题 | 验证入口与基线 |
| --- | --- | --- |
| MENU-TOUCH-001：虫潮 `menu-scroll.js`、`menu.css`、`game.js` 的坐标/焦点与菜单结构、Toy 打包 | 超出可用高度的菜单/说明能用真实指针上滑、下滑；90° 旋转后仍按游戏逻辑纵轴滚动。滚动后不误触模式/按钮，下一次正常点击立即可用。`overflow:auto`、滚轮和直接写 `scrollTop` 不能替代触摸验收。接管隐式 pointer capture 时，子节点的 lostpointercapture 不能取消当前滚动。 | `node game-projects/starship-defense/verify-menu.cjs`；环境变量 `MENU_URL` 支持本地、网站、Toy 预览或正式入口。基线 `starship-defense/media-kit/releases/web-menu-v0.37.0/`。浏览器触屏模拟与真机分别记录。 |
| MENU-LAYOUT-002：虫潮主菜单/暂停、动态模式入口 | 常用开始/继续/设置保持可见；较小视口中内容可滚到首尾。六种模式选中、进入、返回一致。主菜单、暂停、设置采用同一款游戏的深色主题，不套复刻奶油配色；重排不得删除队友/副本/存档功能。 | 同上，覆盖 1280×580、844×346、800×390、667×375、390×720、390×844、360×640、568×320；逐控件位置 + 实际点击 + 图像复核。 |
| GUEST-ENTRY-003：已有 Toy 3D 游戏公开入口、昵称、大厅与打包 | 单机和默认匿名联机直接可用；无自由公开昵称/房间名输入，授权昵称仍严格检测。平台访问者水印可能在游戏加载前要求登录，因此不能用已登录预览代替正式游客入口验证。 | `game-projects/site-games/qa/guest-entry.cjs`，参数见文件头；历史证据 `site-games/releases/guest-entry-20261013/`。改到包体时保留原 Toy ID/slug、游客设置及存档命名空间。 |
| SAVE-PRIVACY-004：游戏存档面板、入口、Toy 构建器 | 不跳作者网站、不恢复网站账号表单；本地继续/导入导出保留，Toy 云档按需请求。重排菜单后通过玩家可见入口打开存档，不能仅调用隐藏按钮跳过导航。 | `game-projects/site-games/qa/privacy-cleanup.cjs`、虫潮 `verify-cloud-save.mjs`；基线 `site-games/releases/guest-entry-20261013/`。 |

| SLOPE-AIM-005：虫潮 `terrain-controls.js`、`game.js` 与最终包 | 六处野外山坡最高2米，堡垒可从坡上步行进入；自动瞄准按自己水平距离选射程内最近活敌，不因首领、精英或朝向选远敌。四视角、触屏和联机一致，手动瞄准保留。 | `game-projects/starship-defense/verify-slope-aim.cjs`；v0.37.1取代旧山坡高度与朝向/首领优先。`verify-platform-unit.mjs`、`verify-low-walls.cjs`、`verify-first-person-mouse.cjs`检查相邻行为。 |

| HIVE-RETURN-006：虫潮 `hive-world.js` 与地下移动 | 母巢深4米、最大路径坡度约3.5°，回程保持至少95%平地速度；三洞往返、虫潮出洞、队友载具通行与存档有效。取代v0.15.0旧22米深度。 | `verify-hive-return.cjs`、`verify-underground.cjs`、`HIVE_ONLY=1 verify-rescue-economy.cjs`（均位于game-projects/starship-defense）；v0.37.2含三视口真实输入与旧高度恢复。 |

| FIRE-INPUT-007：虫潮 `combat-controls.js`、`game.js` 的本机输入、射击设置与联机输入 | 基地防守电脑/触屏默认自动瞄准+自动射击，已有偏好保留；瞄准与开火各自可选。按住松开即停，切换连射再次点击关闭；暂停/失焦/取消触摸/切模式清除开启状态。正常 pointerup 后的 lostpointercapture 不误关切换连射。联机分开传明确开火意图与自动开火选择，房主判断目标；菜单/建造不发送开火。房车仅向追击敌人自动射击，主动技能仍手动，不把本规则推广到所有游戏。 | v0.37.3；`verify-combat-controls.mjs`、`verify-fire-modes.cjs`（FIRE_URL/FIRE_OUT），`verify-fire-online.cjs`（实际本地房间服务8769 + 两浏览器）；最近目标用 `verify-slope-aim.cjs`，第一人称用 `verify-first-person-mouse.cjs`。公开游客入口须复验，浏览器触屏不等于真机。 |

| ACID-ARENA-008：虫潮酸液围场、主循环、菜单及存档 | 三轮固定位置/朝向酸液交叉射击，预警与弱点阶段一致；三次命中、受伤无敌、K闪避/I护盾、两次升级、暂停/重开/结算有效。默认战术视角覆盖全场；原战役开战按钮与存档入口不残留。挑战不改写战役存档，退出仍能继续原进度。 | v0.38.0；`verify-acid-arena.cjs`（ACID_URL/ACID_OUT，可本地/网站/Toy）；`measure-acid-arena.cjs`仅辅助平衡与浏览器帧时间。三个视口真实键盘/触摸输入，机制夹具明确标注，手机性能未做真机测试。 |

| LJ-COVER-001：枪火集结抗战第三章平安县城重做版（`public/html/game/gunfire-assembly/pingan/js/`）`world.js` 的掩体高度、`ai.js` 的射界判断、`game.js` 的子弹碰撞 | 看得见的敌人要打得到：供双方对射的掩体（街垒）碰撞高度低于枪口（约 1.1 米），故意打不穿的掩体（机枪阵地正面 1.6 米）另算。敌人判断“有没有射界”必须和子弹用同一套高度规则，不能忽略矮掩体后站着对掩体开枪；没有射界时要换位置。原问题：街垒 1.6 米高，主角和守军互相打不到，实时录像里僵持十分钟。 | `game-projects/liangjian-pingan/qa/views.cjs` 的三条“街垒”断言（街垒前瞄头击倒、守军 10 秒内越过沙袋命中、贴沙袋不是死角）；三档耐久 `playthrough.cjs` 通关；另实时跑一遍 `record.cjs` 抽帧看有没有僵持。基线 v0.2.0，经过见 `game-projects/liangjian-pingan/media-kit/releases/v0.2.0/notes.md` 第 10 条。 |

| LJ-INPUT-002：同上重做版的 `input.js`、`main.js`、`game.js` 互动与鼠标接管；枪火集结 `resistance-campaign.js` 的第三章跳转、`key-bindings.js` | 电脑端默认鼠标接管：锁定后鼠标事件发给被锁定的舞台而不是 `#look`，左键开火 / 右键开镜必须在文档级单独接，否则接管后开不了枪；开局与继续时的自动接管失败不提示，点画面再试。I（F 别名）统一负责上炮、接管机枪与离开，同一下按键不能离开后又坐回去；机枪手没死不能接管，阵亡、换阶段要把人从机枪上放下来。枪火集结选第三章、继续旧的第三章进度都进重做版；医疗 / 直升机降低默认 N，Y / H 为抬头低头，新增默认键与玩家自定义键冲突时只挪新键、不清空玩家设置。 | `game-projects/liangjian-pingan/qa/interact.cjs`（17 条：机枪接管与扫射、U 手榴弹、I/F 上炮、默认接管下左右键与转视角、旧设置换算、第三章跳转与返回大厅、键位默认值）；`views.cjs`、`mobile.cjs`、`options.cjs` 关联项。基线 pingan v0.3.0 / 枪火集结 0.2.0。 |

新增条目需包含触发条件、受影响路径、期望行为、修复版本和可复验入口。可以稳定自动复现的缺陷优先增加行为回归；视觉调整留同视口截图和人工检查项。后续需求明确改变行为时更新条目并写明取代关系，不永久冻结旧实现或只写「禁止再犯」。

不重跑全部历史测试；按改动范围选择。检查失败先修复再发布；无法真机验证时如实保留未测项，不能用桌面模拟冒充。

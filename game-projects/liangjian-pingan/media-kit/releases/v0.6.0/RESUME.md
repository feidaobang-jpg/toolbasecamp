# 苍云岭重做（亮剑战役第一章）续接说明 — 2026-10-14 额度用尽时保存

已完成（本分支 claude/liangjian-campaign-20261014，未推送）：
- 引擎/章节拆分 + 通用钩子（平安县城全部回归通过）
- 25 句苍云岭原声已截好：public/.../liangjian/assets/voice/cy_*.mp3、bt_*.mp3（时间点与字幕见 tools/cyl_voice_clips.py，时长见 tools/cyl_voice_meta.json）；index.json 尚未改成按章节加载
- models.js：sergeant/huzi/zhuzi/sakata/chu/guojun/bearer 外观、buildMortar、buildStretcher；ai.js：DEF.sergeant/huzi
- chapters/cangyunling-world.js：场景（L 常量、hgt 地形、阵地/前沿/炮位/指挥部帐篷/358团观察所/边界）

待做：
1. audio.js 按章节加载语音（index.json 改成 {pingan:[...], cangyunling:[cy_*, bt_*, liangjian, qibinglian, tiancai]}），加 'mortar' 音效；ui.js 加 setBinoc（canvas 双圆望远镜遮罩）、setCannon 的 low 只对“炮组”；game.js 允许操炮时显示准星（gunCfg.cross）、poseAll 把 sergeant 当步枪姿势
2. chapters/cangyunling.js + cangyunling-ai.js：五阶段（坚守山头进度条 / 抓舌头 / 送炮前出 / 两发炮弹（风偏、柱子报偏差、炮弹跟拍）/ 打中→冲进指挥部→突围，打偏→坂田指挥型 Boss→突围），楚云飞两段过场，结局 hit/miss 存档
3. chapters/index.js 登记；枪火集结章节卡片与旧骑兵连代码删除；QA（剧情检查、两条路线自动通关、菜单视口、隐私扫描）
4. 版本号、记录、提交推送、网站核验、Toy 提审；B站简介草稿先给用户看

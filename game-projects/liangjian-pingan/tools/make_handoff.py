# -*- coding: utf-8 -*-
"""按版本汇总交接清单：构建指纹、实机截图/录像的哈希与属性、各验收脚本的结果。
用法（仓库根目录）：python game-projects/liangjian-pingan/tools/make_handoff.py [版本号，默认最新]

每个版本的内容写在下面的 SPECS 里。qa/out-*.json 只保存最近一次运行的结果，
所以只能给“当前这一版”生成；旧版本的清单以当时提交的 handoff.json 为准，不要重新生成
（v0.1.0 的清单由提交 d45a57a7 里的本脚本生成；v0.2.0 的清单见提交 ea676271，其验收结果文件已被 v0.3.0 的覆盖）。
从 v0.3.0 起游戏并入《枪火集结》，目录是 public/html/game/gunfire-assembly/pingan。
"""
import hashlib, json, subprocess, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'game-projects' / 'liangjian-pingan'
PUB = ROOT / 'public' / 'html' / 'game' / 'gunfire-assembly' / 'liangjian'   # v0.6.0 起；以前是 pingan/
KIT = GAME / 'media-kit'
QA = GAME / 'qa'

AUTO = '（Edge 无头 + 本机显卡；脚本摆位或脚本按键，手动步进后截图）'

SPECS = {
    'v0.7.0': {
        'base': 'v0.6.0',
        'shots': [
            ('ljp-menu', 'qa/ljp-title.png', '亮剑战役主菜单：第二章李家坡当前，三章都能选'),
            ('ljp-charge', 'qa/ljp-scene-p1-charge.png', '强攻受挫：七七二团冲坡，坡顶三个碉堡'),
            ('ljp-post', 'qa/ljp-scene-p1-post.png', '山脚的外围火力点'),
            ('ljp-cut-dig', 'qa/ljp-scene-cut-dig1.png', '过场：土工掘进'),
            ('ljp-dig', 'qa/ljp-scene-p2-dig-dark.png', '夜里在壕头挖交通壕'),
            ('ljp-flare', 'qa/ljp-scene-p2-flare.png', '照明弹照亮山坡'),
            ('ljp-trench', 'qa/ljp-scene-p2-trench.png', '之字形交通壕里的战友'),
            ('ljp-trench-fp', 'qa/ljp-scene-p2-trench-fp.png', '第一人称看交通壕'),
            ('ljp-cut-dawn', 'qa/ljp-scene-cut-dawn2.png', '拂晓过场：望着坡顶的碉堡'),
            ('ljp-mark', 'qa/ljp-scene-p3-mark.png', '手榴弹雨：信号弹、落点圈罩住碉堡'),
            ('ljp-rain', 'qa/ljp-scene-p3-rain.png', '一轮手榴弹砸在碉堡上'),
            ('ljp-ruin', 'qa/ljp-scene-p3-ruin.png', '碉堡炸塌'),
            ('ljp-storm', 'qa/ljp-scene-p4-charge.png', '突击队冲进环形工事'),
            ('ljp-ports', 'qa/ljp-scene-p5-ports.png', '山崎的指挥所和射击孔'),
            ('ljp-yamazaki', 'qa/ljp-scene-cut-yamazaki.png', '山崎带卫兵冲出来'),
            ('ljp-boss', 'qa/ljp-scene-p5-boss.png', '和山崎拼刀'),
        ],
        'video_desc': '实时运行的脚本录像（{view}，无声音，不是真人操作）',
        'features': [
            {'id': 'terrain', 'desc': '引擎支持山坡地形与按阶段换光（只有李家坡用）；坡上的预警贴坡面', 'status': 'implemented', 'evidence_ids': ['ljp-charge', 'ljp-dig']},
            {'id': 'ljp-assault', 'desc': '李家坡第一阶段：七七二团冲锋演出、坡上机枪封锁区、侧翼拔两个外围火力点', 'status': 'implemented', 'evidence_ids': ['ljp-charge', 'ljp-post']},
            {'id': 'ljp-dig', 'desc': '挖交通壕：I 开挖 / 停手、战友帮挖、壕里挡子弹、土埂、照明弹、夜袭、掷弹筒、炮火覆盖', 'status': 'implemented', 'evidence_ids': ['ljp-dig', 'ljp-flare', 'ljp-trench', 'ljp-trench-fp']},
            {'id': 'ljp-rain', 'desc': '手榴弹雨：信号弹、两分钟倒计时、落点圈、全营投弹、碉堡炸塌、超时张大彪补', 'status': 'implemented', 'evidence_ids': ['ljp-mark', 'ljp-rain', 'ljp-ruin']},
            {'id': 'ljp-storm', 'desc': '突击队：三段战壕、北面反扑、歪把子', 'status': 'implemented', 'evidence_ids': ['ljp-storm']},
            {'id': 'ljp-yamazaki', 'desc': '决战山崎：射击孔扇面与侧面炸哑、山崎格子弹 / 连砍 / 突刺 / 收刀、拼刀、战友不打他', 'status': 'implemented', 'evidence_ids': ['ljp-ports', 'ljp-yamazaki', 'ljp-boss']},
            {'id': 'ljp-voice', 'desc': '李家坡 19 句《亮剑》原声 + 过场时掐掉排队的局内原声', 'status': 'implemented', 'evidence_ids': ['ljp-cut-dig', 'ljp-cut-dawn']},
            {'id': 'gunfire-lobby', 'desc': '枪火集结 0.4.0：删旧抗战战役，大厅一个入口直达亮剑战役', 'status': 'implemented', 'evidence_ids': []},
        ],
        'changes': [
            {'id': 'lijiapo', 'feature_ids': ['terrain', 'ljp-assault', 'ljp-dig', 'ljp-rain', 'ljp-storm', 'ljp-yamazaki', 'ljp-voice'], 'before': '李家坡是枪火集结里的旧版（交通壕、两座机枪堡垒、坡顶指挥阵地三个小阶段）', 'after': '亮剑战役第二章重做版（五个阶段、真实山坡、按阶段换光、山崎 Boss）', 'user_visible': '抗战战役第二章换成新的李家坡', 'evidence_ids': ['ljp-menu', 'ljp-charge', 'ljp-dig', 'ljp-mark', 'ljp-storm', 'ljp-boss'], 'verification': 'ljp-story 40 条 + 标准 / 宽松自动通关；human-play not-run'},
            {'id': 'gunfire-lobby', 'feature_ids': ['gunfire-lobby'], 'before': '枪火集结大厅：推荐入口 + 抗战战役章节选择（苍云岭重做 / 李家坡旧版 / 平安县城重做）', 'after': '只有「抗战战役 · 亮剑三章」一个入口，直达亮剑战役页面；旧抗战代码删除', 'user_visible': '大厅少了旧的章节选择', 'evidence_ids': [], 'verification': 'gunfire-chapters.cjs 10 条、mode-focus.cjs'},
            {'id': 'ally-yield', 'feature_ids': [], 'before': '主角和战友挤在一起时各让一半，主角会被跑过的战友挤动', 'after': '只推开战友，主角不被自己人挤开（三章都适用）', 'user_visible': '站着不动时不会被队友挤歪', 'evidence_ids': [], 'verification': 'mobile.cjs“松手后停止移动”三章都通过'},
        ],
        'bugs': [
            {'id': 'post-front', 'desc': '第一个外围火力点从正下方打不到机枪手，脚本拔不掉', 'repro': 'node qa/ljp-playthrough.cjs 1 std（旧路线从正面接近）', 'fix': '铁丝网挡在正面、提示从侧面打，脚本改走侧翼', 'before_media_ids': [], 'after_media_ids': ['ljp-post'], 'verification': '标准自动通关第一阶段约一分钟'},
            {'id': 'yamazaki-door', 'desc': '山崎出场时报错（门的坐标取错了对象）', 'repro': 'node qa/ljp-playthrough.cjs 4 std 打到射击孔全哑', 'fix': '改从 world.cp.door 取', 'before_media_ids': [], 'after_media_ids': ['ljp-yamazaki'], 'verification': 'ljp-story 山崎出场断言'},
            {'id': 'port-double', 'desc': '一颗手榴弹落在拐角炸哑两个射击孔', 'repro': 'ljp-story 侧面扔手榴弹那一步', 'fix': '一颗只炸最近的一个；半径 3.2 米', 'before_media_ids': [], 'after_media_ids': [], 'verification': 'ljp-story 断言只哑一个'},
            {'id': 'voice-in-cutscene', 'desc': '局内排队的原声在过场中间放出来', 'repro': 'node qa/ljp-scenes.cjs 看 cut-dig2 截图的字幕', 'fix': '过场开始时掐掉局内没说完和排着队的', 'before_media_ids': [], 'after_media_ids': ['ljp-cut-dig'], 'verification': '截图复查'},
            {'id': 'night-mortar', 'desc': '夜里掷弹筒太密，挖壕挖不下去', 'repro': '自动通关第二阶段统计受伤来源', 'fix': '摸黑时四成不打', 'before_media_ids': [], 'after_media_ids': [], 'verification': '同脚本受伤来源复查'},
            {'id': 'ally-push', 'desc': '手机测试里主角松手后还会被跑过的战友挤动一点', 'repro': 'LJ_CH=lijiapo node qa/mobile.cjs', 'fix': '战友给主角让路', 'before_media_ids': [], 'after_media_ids': [], 'verification': 'mobile.cjs 三章 107/107'},
        ],
        'bugs_gap': '都在发布前发现，修复前的截图被同名文件覆盖或没有截',
        'qa': lambda r: [
            {'what': '李家坡机制与剧情：五个阶段、原声、挖壕、挡子弹、照明弹、手榴弹雨、射击孔、山崎、结算', 'method': 'qa/ljp-story.cjs（前置用状态捷径，开挖 / 投弹 / 扔手榴弹 / 亮剑用真实按键）', 'result': r['ljp_story'], 'evidence': 'qa/out-ljp-story.json'},
            {'what': '李家坡自动通关（标准 / 宽松）', 'method': 'qa/ljp-playthrough.cjs + qa/ljp-bot.browser.js，确定性步进，不躲红圈', 'result': r['ljp_plays'], 'evidence': 'qa/out-ljp-playthrough-p1-*.json'},
            {'what': '苍云岭机制与剧情（引擎改动后回归）', 'method': 'qa/cy-story.cjs', 'result': r['cy_story'], 'evidence': 'qa/out-cy-story.json'},
            {'what': '平安县城剧情与双结局（引擎改动后回归）', 'method': 'qa/story.cjs', 'result': r['story'], 'evidence': 'qa/out-story.json'},
            {'what': '机枪、手榴弹、亮剑、骑兵连、上炮、鼠标接管、键位、枪火集结入口', 'method': 'qa/interact.cjs', 'result': r['interact'], 'evidence': 'qa/out-interact.json'},
            {'what': '两视角、射击、跳跃、街垒、操炮', 'method': 'qa/views.cjs', 'result': r['views'], 'evidence': 'qa/out-views.json'},
            {'what': '双端布局（三章各跑一遍；out-mobile.json 只留最后一次）', 'method': 'qa/mobile.cjs（LJ_CH=lijiapo 测挖壕键），CDP 触控模拟，不是真机', 'result': r['mobile'], 'evidence': 'qa/out-mobile.json'},
            {'what': '选项、暂停与声音、隐私（扫描含李家坡文件）', 'method': 'qa/options.cjs', 'result': r['options'], 'evidence': 'qa/out-options.json'},
            {'what': '枪火集结 0.4.0 大厅入口、旧抗战删除、旧地址跳转', 'method': 'qa/gunfire-chapters.cjs', 'result': r['gunfire'], 'evidence': 'qa/out-gunfire-chapters.json'},
        ],
        'untested': ['真人试玩（挖壕节奏、照明弹 / 掷弹筒压力、手榴弹雨准度、山崎难度）', '原声听感', '手机真机', '帧时间重测（坡地网格、交通壕实例）', '整局录像'],
        'readiness': {'overview': 'partial', 'update': 'partial', 'gaps': ['没有李家坡的整局录像与带声音的实机素材', '原声未试听']},
    },
    'v0.6.0': {
        'base': 'v0.5.0',
        'shots': [
            ('cy-menu', 'qa/cy-title.png', '亮剑战役主菜单：第一章苍云岭当前，三章选章按钮'),
            ('cy-hold', 'qa/cy-p1-7.png', '坚守山头：沙袋线、转移进度条、鬼子进攻'),
            ('cy-downed', 'qa/cy-scene-downed.png', '抓舌头：军曹被打倒在地，提示“按 I 抓活的”'),
            ('cy-capture', 'qa/cy-scene-capture1.png', '抓舌头过场：“日军第四旅团的坂田联队”'),
            ('cy-binoc', 'qa/cy-scene-binoc.png', '望远镜里看坂田的指挥部'),
            ('cy-talk', 'qa/cy-scene-talk.png', '柱子：“距离太远，已经超出射程了”'),
            ('cy-chu', 'qa/cy-scene-chu2.png', '358 团观察所：楚云飞看新一团被围'),
            ('cy-aim-fp', 'qa/cy-scene-aim-fp.png', '迫击炮瞄准镜：准星、仰角与表尺，没有落点预览'),
            ('cy-aim-tp', 'qa/cy-scene-aim-tp.png', '迫击炮炮后视角'),
            ('cy-shell', 'qa/cy-scene-shell.png', '炮弹出膛后镜头跟着飞'),
            ('cy-report', 'qa/cy-scene-report.png', '第一发没中：李云龙“打歪了！指挥部在下边”'),
            ('cy-boss', 'qa/cy-scene-boss2.png', '两发都偏：指挥部门口打坂田'),
            ('cy-win', 'qa/cy-scene-win1.png', '从山口突出去'),
        ],
        'video_desc': '实时运行的脚本录像（{view}，无声音，不是真人操作）',
        'features': [
            {'id': 'campaign-page', 'desc': '亮剑战役页面：引擎与章节拆分、菜单选章、按章节分开的进度与结局、语音按章节加载、旧 pingan 地址跳转', 'status': 'implemented', 'evidence_ids': ['cy-menu']},
            {'id': 'cy-hold', 'desc': '苍云岭第一阶段：坚守山头、转移进度与停顿、七波进攻', 'status': 'implemented', 'evidence_ids': ['cy-hold']},
            {'id': 'cy-tongue', 'desc': '抓舌头：枪打倒不死、炸死换人、按 I 抓活的、坂田联队 / 精锐过场', 'status': 'implemented', 'evidence_ids': ['cy-downed', 'cy-capture']},
            {'id': 'cy-escort', 'desc': '送炮前出：望远镜过场、护送炮组、旅部命令、楚云飞观察所', 'status': 'implemented', 'evidence_ids': ['cy-binoc', 'cy-talk', 'cy-chu']},
            {'id': 'cy-mortar', 'desc': '两发炮弹：手动瞄准、表尺、风偏、炮弹跟拍、柱子报偏差', 'status': 'implemented', 'evidence_ids': ['cy-aim-fp', 'cy-aim-tp', 'cy-shell', 'cy-report']},
            {'id': 'cy-breakout', 'desc': '突围：打中＝冲进指挥部后突围；两发都偏＝坂田 Boss 后突围；楚云飞收尾', 'status': 'implemented', 'evidence_ids': ['cy-boss', 'cy-win']},
            {'id': 'cy-voice', 'desc': '苍云岭 25 句《亮剑》原声 + 局内原声排队', 'status': 'implemented', 'evidence_ids': []},
            {'id': 'lijiapo', 'desc': '第二章李家坡重做', 'status': 'planned', 'evidence_ids': []},
        ],
        'changes': [
            {'id': 'campaign-page', 'feature_ids': ['campaign-page'], 'before': '平安县城是单章页面 pingan/，存档前缀 lj_pingan_v1_', 'after': '亮剑战役页面 liangjian/，三章选章（李家坡显示重做中），存档 lj_campaign_v1_ 按章节分开并自动搬旧存档', 'user_visible': '菜单多一排选章；平安县城玩法不变', 'evidence_ids': ['cy-menu'], 'verification': '平安县城全部回归通过'},
            {'id': 'cangyunling', 'feature_ids': ['cy-hold', 'cy-tongue', 'cy-escort', 'cy-mortar', 'cy-breakout', 'cy-voice'], 'before': '枪火集结第一章是旧版李家坡、第二章旧版骑兵连', 'after': '新增重做版第一章苍云岭（五个阶段、两条结局线）', 'user_visible': '抗战战役多了苍云岭', 'evidence_ids': ['cy-hold', 'cy-capture', 'cy-binoc', 'cy-aim-fp', 'cy-boss', 'cy-win'], 'verification': 'cy-story 26 条 + 三条路线自动通关；human-play not-run'},
            {'id': 'gunfire-chapters', 'feature_ids': [], 'before': '枪火集结抗战战役：李家坡 / 骑兵连 / 平安县城', 'after': '苍云岭（重做版）/ 李家坡（旧版）/ 平安县城（重做版）；骑兵连章节删除，旧存档按新顺序迁移', 'user_visible': '章节顺序变了，骑兵连那章没了', 'evidence_ids': [], 'verification': 'gunfire-chapters.cjs 12 条'},
        ],
        'bugs': [
            {'id': 'prompt-in-cutscene', 'desc': '过场里互动提示（按 I 抓活的）一直留在画面上', 'repro': 'node qa/cy-scenes.cjs 看 cy-scene-capture1 / binoc 截图', 'fix': '引擎在过场里清掉提示和互动键', 'before_media_ids': [], 'after_media_ids': ['cy-capture', 'cy-binoc'], 'verification': 'cy-story 断言过场里不显示提示'},
            {'id': 'mortar-camera', 'desc': '迫击炮沿用意大利炮镜头，第一人称朝天看不到指挥部', 'repro': '上迫击炮后按 C 切第一人称', 'fix': '章节覆盖操炮镜头：贴着炮身的瞄准镜和炮后高位', 'before_media_ids': [], 'after_media_ids': ['cy-aim-fp', 'cy-aim-tp'], 'verification': '截图复查'},
            {'id': 'voice-overlap', 'desc': '局内两句原声会叠着放（旅部命令触发时前一句还没完）', 'repro': '第三阶段快速推进', 'fix': '局内原声排队，换阶段掐掉上一阶段没说完的', 'before_media_ids': [], 'after_media_ids': [], 'verification': 'cy-story 的原声断言'},
            {'id': 'p1-mortar-pressure', 'desc': '坚守山头里两门掷弹筒太密，脚本阵亡 6 次全来自爆炸', 'repro': '自动通关第一阶段统计伤害来源', 'fix': '第一阶段只留一门、打主角的比例降到四成', 'before_media_ids': [], 'after_media_ids': [], 'verification': '同脚本阵亡降到 2 次'},
        ],
        'bugs_gap': '都在发布前发现，修复前的截图被同名文件覆盖，没有留存',
        'qa': lambda r: [
            {'what': '苍云岭机制与剧情：默认章节、语音、转移进度、抓舌头、炮组、迫击炮两发（偏 / 中）、两条结局线、结算与存档', 'method': 'qa/cy-story.cjs（前置用状态捷径，开火 / 互动 / 调炮用真实按键）', 'result': r['cy_story'], 'evidence': 'qa/out-cy-story.json'},
            {'what': '苍云岭自动通关：第一发算准风偏、两发都偏、第一发不管风偏后修正', 'method': 'qa/cy-playthrough.cjs + qa/cy-bot.browser.js，确定性步进', 'result': r['cy_plays'], 'evidence': 'qa/out-cy-playthrough-p1-*.json'},
            {'what': '平安县城剧情与双结局（语音改按章节读）', 'method': 'qa/story.cjs', 'result': r['story'], 'evidence': 'qa/out-story.json'},
            {'what': '平安县城自动通关（原作 / 改写）', 'method': 'qa/playthrough.cjs', 'result': {'classic': r['plays'], 'rescue': r['rescue']}, 'evidence': 'qa/out-playthrough-p1-*.json'},
            {'what': '机枪、手榴弹、亮剑、骑兵连、上炮、鼠标接管、键位', 'method': 'qa/interact.cjs', 'result': r['interact'], 'evidence': 'qa/out-interact.json'},
            {'what': '两视角、射击、跳跃、街垒、操炮', 'method': 'qa/views.cjs', 'result': r['views'], 'evidence': 'qa/out-views.json'},
            {'what': '双端布局（两章各跑一遍；out-mobile.json 只留最后一次）', 'method': 'qa/mobile.cjs（LJ_CH=cangyunling 测迫击炮），CDP 触控模拟，不是真机', 'result': r['mobile'], 'evidence': 'qa/out-mobile.json'},
            {'what': '选项、暂停与声音、隐私（扫描含苍云岭文件）', 'method': 'qa/options.cjs', 'result': r['options'], 'evidence': 'qa/out-options.json'},
            {'what': '枪火集结三章顺序、跳转、李家坡、旧存档迁移、旧地址跳转', 'method': 'qa/gunfire-chapters.cjs', 'result': r['gunfire'], 'evidence': 'qa/out-gunfire-chapters.json'},
        ],
        'untested': ['真人试玩（苍云岭难度、过场节奏、两发炮弹能不能瞄准）', '原声听感', '手机真机', '帧时间重测', '整局录像'],
        'readiness': {'overview': 'partial', 'update': 'partial', 'gaps': ['没有苍云岭的整局录像与带声音的实机素材', '原声未试听', '李家坡还没重做（按约定三章做完再做视频）']},
    },
    'v0.5.0': {
        'base': 'v0.4.0',
        'shots': [
            ('hostage', 'qa/story-hostage-tower.png', '城楼过场：山本押着秀芹站在城楼前檐下，两侧卫兵'),
            ('classic-collapse', 'qa/story-classic-collapse.png', '原作结局：朝城楼开炮，城楼塌'),
            ('rescue-boss', 'qa/story-rescue-boss.png', '改写结局的决战：秀芹绑在院子右侧的木桩上'),
            ('rescue-free', 'qa/story-rescue-free.png', '改写结局：打赢后给秀芹松绑'),
            ('view-tp', 'qa/scene-field-tp.png', '越肩第三人称（沿用）'),
            ('touch-play', 'qa/play-844x390.png', '手机横屏布局（触控模拟）'),
            ('menu', 'qa/menu-1280x720.png', '主菜单：选项里不再有弹幕'),
        ],
        'video_desc': '实时运行的脚本录像（{view}，无声音，不是真人操作）',
        'features': [
            {'id': 'hostage', 'desc': '城门轰开后的城楼过场：山本押着秀芹，四句原声对白，可跳过', 'status': 'implemented', 'evidence_ids': ['hostage']},
            {'id': 'endings', 'desc': '双结局：朝城楼开炮（原作）或冲进城门救秀芹（改写）；结算写明结局；第四、五阶段直接开局沿用上次结局', 'status': 'implemented', 'evidence_ids': ['classic-collapse', 'rescue-boss', 'rescue-free']},
            {'id': 'voice', 'desc': '20 句喊话：17 句电视剧原声、3 句合成', 'status': 'implemented', 'evidence_ids': []},
        ],
        'changes': [
            {'id': 'hostage-endings', 'feature_ids': ['hostage', 'endings'], 'before': '轰开城门后直接瞄准城楼开炮，没有秀芹', 'after': '城楼过场 + 抉择：原作结局（开炮，城楼塌，山本带伤）或改写结局（冲进去，城楼不塌，决战救下秀芹）', 'user_visible': '第三阶段结尾多一场戏和一次选择；第四、五阶段台词与决战随结局变化', 'evidence_ids': ['hostage', 'classic-collapse', 'rescue-boss', 'rescue-free'], 'verification': 'automated-pass; human-play not-run'},
            {'id': 'original-voice', 'feature_ids': ['voice'], 'before': '十句喊话全是本机合成', 'after': '17 句换成电视剧原声（来源见 media-kit/assets/voice.json），3 句保留合成', 'user_visible': '喊话是原片声音', 'evidence_ids': [], 'verification': '20 条都能下载解码；听感 not-run'},
            {'id': 'no-danmaku', 'feature_ids': [], 'before': '飘屏弹幕吐槽，选项可关', 'after': '弹幕与它的选项删除', 'user_visible': '画面上方不再飘字', 'evidence_ids': ['menu'], 'verification': 'options.cjs 断言弹幕层、选项、接口都不存在'},
            {'id': 'old-ch3-removed', 'feature_ids': [], 'before': '枪火集结里旧第三章代码不可达但仍在包里', 'after': '删除；第三章卡片与旧存档“继续”都进重做版', 'user_visible': '无（包更小）', 'evidence_ids': [], 'verification': 'gunfire-chapters.cjs'},
        ],
        'bugs': [
            {'id': 'rescue-gate-blocked', 'desc': '“城楼没塌不许进门洞”的限制把改写路线堵死', 'repro': 'ROUTE=rescue node qa/playthrough.cjs 1 std：卡在门洞前 15 分钟超时', 'fix': '只在城楼抉择期间放行', 'before_media_ids': [], 'after_media_ids': ['rescue-boss'], 'verification': 'playthrough rescue 通关；story.cjs 断言抉择前门洞仍封'},
            {'id': 'danmaku-strip-dangling', 'desc': '按行删弹幕调用后留下悬空的 if，构建报错', 'repro': 'node game-projects/gunfire-assembly/build-compat.mjs', 'fix': '删掉残句', 'before_media_ids': [], 'after_media_ids': [], 'verification': '构建通过'},
        ],
        'bugs_gap': '两处都在发布前发现，没有留修复前的画面',
        'qa': lambda r: [
            {'what': '城楼过场、四句原声顺序、跳过、两条结局的抉择与后果、结算、结局记忆、语音清单', 'method': 'qa/story.cjs（场景前置用状态捷径，抉择用真实按键）', 'result': r['story'], 'evidence': 'qa/out-story.json'},
            {'what': '自动通关：原作路线三档 + 改写路线标准档', 'method': 'qa/playthrough.cjs（ROUTE=rescue 走改写），确定性步进', 'result': {'classic': r['plays'], 'rescue': r['rescue']}, 'evidence': 'qa/out-playthrough-p1-*.json'},
            {'what': '机枪接管、手榴弹、亮剑、骑兵连、上炮、鼠标接管、第三章跳转与键位（沿用）', 'method': 'qa/interact.cjs', 'result': r['interact'], 'evidence': 'qa/out-interact.json'},
            {'what': '两视角、射击、跳跃、街垒、操炮（沿用）', 'method': 'qa/views.cjs', 'result': r['views'], 'evidence': 'qa/out-views.json'},
            {'what': '双端布局（沿用）', 'method': 'qa/mobile.cjs，CDP 触控模拟，不是真机', 'result': r['mobile'], 'evidence': 'qa/out-mobile.json'},
            {'what': '选项（弹幕已去掉）、命数耐久、暂停与声音、隐私', 'method': 'qa/options.cjs', 'result': r['options'], 'evidence': 'qa/out-options.json'},
            {'what': '删旧第三章后枪火集结第一、二章与第三章跳转', 'method': 'qa/gunfire-chapters.cjs', 'result': r['gunfire'], 'evidence': 'qa/out-gunfire-chapters.json'},
        ],
        'untested': ['真人试玩（过场节奏、抉择是否看得懂、两条结局的难度）', '原声听感（截取点、音量是否一致）', '手机真机', '整局录像重录', '帧时间重测'],
        'readiness': {'overview': 'partial', 'update': 'partial', 'gaps': ['没有这一版的整局录像与带声音的实机素材', '原声未试听', '手机真机未测']},
    },
    'v0.4.0': {
        'base': 'v0.3.0',
        'shots': [
            ('view-tp', 'qa/scene-field-tp.png', '越肩第三人称；右下状态条四项：J 开火、U 手榴弹、L 亮剑、N 骑兵连'),
            ('view-fp', 'qa/scene-field-fp.png', '第一人称'),
            ('mg-tp', 'qa/scene-mg-tp.png', '接管阵地机枪（沿用 v0.3.0）'),
            ('touch-play', 'qa/play-844x390.png', '手机横屏布局：亮剑、骑兵连两个键回来了（触控模拟）'),
            ('touch-play-toy', 'qa/play-844x346.png', 'Toy 外壳高度 844×346 下的布局（触控模拟）'),
            ('touch-portrait', 'qa/play-390x844.png', '手机竖屏旋转后的布局（触控模拟）'),
            ('menu', 'qa/menu-1280x720.png', '主菜单与按键说明'),
        ],
        'video_desc': '实时运行的脚本录像（{view}，无声音，不是真人操作）',
        'features': [
            {'id': 'skills', 'desc': '亮剑突进（L / V）、骑兵连冲锋（N / X）、亮剑撞上山本突进可拼刀', 'status': 'implemented', 'evidence_ids': ['view-tp', 'touch-play']},
            {'id': 'mg', 'desc': '阵地机枪可接管（沿用 v0.3.0）；在机枪上不能亮剑、可以叫骑兵连', 'status': 'implemented', 'evidence_ids': ['mg-tp']},
            {'id': 'keys', 'desc': 'J 开火、K 跳、U 手榴弹、I 互动、L 亮剑、N 骑兵连、O/Z 开镜、R 换弹；鼠标手 G / F / V / X', 'status': 'implemented', 'evidence_ids': ['menu', 'view-tp']},
        ],
        'changes': [
            {'id': 'skills-back', 'feature_ids': ['skills', 'keys'], 'before': 'v0.3.0 去掉了亮剑、骑兵连和拼刀', 'after': '三样都加回来：亮剑 L（鼠标手 V）、骑兵连 N（鼠标手 X）；L 不再是换弹的别名', 'user_visible': '右下多了两个技能，手机多两个键，战报多两行', 'evidence_ids': ['view-tp', 'touch-play'], 'verification': 'automated-pass; human-play not-run'},
            {'id': 'hint-wrap', 'feature_ids': ['keys'], 'before': '底部按键提示在一行放不下时会把“切换人称”拆成两行', 'after': '按项换行，不拆词；状态条已有的 U / L / N 不在提示里重复', 'user_visible': '提示更整齐', 'evidence_ids': ['view-tp'], 'verification': '截图复查'},
        ],
        'bugs': [],
        'bugs_gap': '',
        'qa': lambda r: [
            {'what': '机枪接管、U 手榴弹、L 亮剑突进、N 骑兵连、状态条四项与触屏按键、I/F 上炮、默认鼠标接管、旧设置换算、枪火集结第三章跳转与键位', 'method': 'qa/interact.cjs，Edge 无头', 'result': r['interact'], 'evidence': 'qa/out-interact.json'},
            {'what': '两视角、射击、跳跃、街垒、操炮', 'method': 'qa/views.cjs', 'result': r['views'], 'evidence': 'qa/out-views.json'},
            {'what': '双端布局（含加回的两个键）', 'method': 'qa/mobile.cjs，CDP 触控模拟，不是真机', 'result': r['mobile'], 'evidence': 'qa/out-mobile.json'},
            {'what': '选项、命数耐久、暂停与声音、隐私', 'method': 'qa/options.cjs', 'result': r['options'], 'evidence': 'qa/out-options.json'},
            {'what': '自动通关（脚本会用亮剑、骑兵连和拼刀）', 'method': 'qa/playthrough.cjs，确定性步进', 'result': r['plays'], 'evidence': 'qa/out-playthrough-p1-*.json', 'note': '三档耐久都打到结算；v0.3.0 时一发档过不去，技能回来后又能通关'},
        ],
        'untested': ['真人试玩（技能的手感、冷却、键位顺不顺手）', '手机真机', '帧时间重测（上次测量在 v0.2.0）', '整局录像重录', '语音听感'],
        'readiness': {'overview': 'partial', 'update': 'partial', 'gaps': ['没有这一版的整局录像；另一会话待审的视频录自没有技能的 v0.3.0，解说里还说技能已去掉', '没有真人、带声音的实机素材', '手机真机未测']},
    },
    'v0.3.0': {
        'base': 'v0.2.0',
        'shots': [
            ('mg-tp', 'qa/scene-mg-tp.png', '接管阵地机枪扫射（第三人称，镜头从沙袋上方看出去）'),
            ('mg-fp', 'qa/scene-mg-fp.png', '接管阵地机枪（第一人称）'),
            ('view-tp', 'qa/scene-field-tp.png', '越肩第三人称，城外起点；右下状态条只剩开火与手榴弹'),
            ('view-fp', 'qa/scene-field-fp.png', '第一人称，城外起点'),
            ('cannon-tp', 'qa/scene-cannon-tp.png', '操炮·炮后视角（I 上炮）'),
            ('street', 'qa/scene-street-tp.png', '城内主街与街垒'),
            ('touch-play', 'qa/play-844x390.png', '手机横屏布局：去掉亮剑、骑兵连两个键之后（触控模拟）'),
            ('touch-play-toy', 'qa/play-844x346.png', 'Toy 外壳高度 844×346 下的布局（触控模拟）'),
            ('touch-portrait', 'qa/play-390x844.png', '手机竖屏旋转后的布局（触控模拟）'),
            ('menu', 'qa/menu-1280x720.png', '主菜单：鼠标瞄准默认“鼠标接管”，多了“返回大厅”'),
            ('menu-phone', 'qa/menu-844x346.png', '手机横屏紧凑主菜单（触控模拟）'),
        ],
        'video_desc': '实时运行的脚本录像（{view}，无声音，不是真人操作）',
        'features': [
            {'id': 'mg', 'desc': '阵地机枪可接管：机枪手被打掉后走进阵地按 I，枪身跟准星转，弹链 100 发', 'status': 'implemented', 'evidence_ids': ['mg-tp', 'mg-fp']},
            {'id': 'interact', 'desc': '互动键统一为 I（F 别名）：上炮、离炮、接管机枪、离开机枪；手榴弹改到 U', 'status': 'implemented', 'evidence_ids': ['cannon-tp', 'mg-tp']},
            {'id': 'mouse-lock', 'desc': '电脑端默认鼠标接管，失败时退回按住拖动；锁定状态下左键开火、右键开镜', 'status': 'implemented', 'evidence_ids': ['menu']},
            {'id': 'no-skills', 'desc': '去掉亮剑、骑兵连与拼刀', 'status': 'implemented', 'evidence_ids': ['view-tp', 'touch-play']},
            {'id': 'gunfire', 'desc': '并入《枪火集结》：抗战战役第三章进入本页，主菜单可返回大厅；入口改用兼容包', 'status': 'implemented', 'evidence_ids': ['menu']},
            {'id': 'campaign', 'desc': '一关五个阶段、手动瞄准、跳跃、两视角等沿用 v0.2.0', 'status': 'implemented', 'evidence_ids': ['view-tp', 'view-fp', 'street']},
        ],
        'changes': [
            {'id': 'remove-skills', 'feature_ids': ['no-skills'], 'before': 'U 亮剑突进、I 骑兵连，亮剑可与山本拼刀', 'after': '两个技能和拼刀都去掉；山本突进靠侧移或跳起来躲', 'user_visible': '右下少了两个技能，战报少两行', 'evidence_ids': ['view-tp', 'touch-play'], 'verification': 'automated-pass; human-play not-run'},
            {'id': 'usable-mg', 'feature_ids': ['mg'], 'before': '阵地上的机枪只是摆设', 'after': '打掉机枪手后可以接管扫射', 'user_visible': '拿下阵地后能用它的机枪打反扑', 'evidence_ids': ['mg-tp', 'mg-fp'], 'verification': 'automated-pass; human-play not-run'},
            {'id': 'keys', 'feature_ids': ['interact'], 'before': 'F 上炮；L / G 手榴弹', 'after': 'I 互动（F 别名）；U 手榴弹（G 别名）；L 换弹别名、Z 开镜别名，与枪火集结其余模式一致', 'user_visible': '键位换了', 'evidence_ids': ['cannon-tp'], 'verification': 'automated-pass'},
            {'id': 'mouse-default', 'feature_ids': ['mouse-lock'], 'before': '默认按住拖动，鼠标锁定是可选项，且锁定后左键开不了火（未被发现）', 'after': '默认鼠标接管；锁定下左键开火、右键开镜可用；失败退回拖动', 'user_visible': '电脑上进游戏鼠标直接控制准星，Esc 释放并暂停', 'evidence_ids': ['menu'], 'verification': 'automated-pass（无头 Edge）; Toy 外壳内 not-run'},
            {'id': 'into-gunfire', 'feature_ids': ['gunfire'], 'before': '独立的本地页面，未发布', 'after': '作为《枪火集结》抗战战役第三章随该游戏发布', 'user_visible': '线上枪火集结的平安县城换成了这一版', 'evidence_ids': ['menu'], 'verification': 'automated-pass（本地跳转与返回）'},
        ],
        'bugs': [
            {'id': 'lock-no-fire', 'found_in': 'v0.2.0（发布前读代码时发现，v0.2.0 未发布）', 'repro': '设置里选鼠标锁定，锁定后点左键', 'observed': '不开火、右键也不开镜（无头 Edge 里确认：锁定后 pointerdown 的目标是舞台元素，#look 的监听收不到）', 'cause': '开火与开镜只挂在 #look 上，而鼠标锁定后事件发给被锁定的元素', 'status': 'fixed', 'fix': '在文档级补上锁定状态下的 mousedown / mouseup 处理', 'before_media_ids': [], 'after_media_ids': [], 'retest': 'interact.cjs「鼠标接管时：左键开火、右键按住开镜、移动鼠标转视角」'},
            {'id': 'mg-view-blocked', 'found_in': 'v0.3.0 开发中', 'repro': '接管机枪后看第三人称画面', 'observed': '镜头落在阵地正面沙袋后面，沙袋挡住下半屏', 'cause': '镜头在人身后 4.4 米，正好隔着沙袋', 'status': 'fixed', 'fix': '接管时镜头抬到 2.35 米、离人 1.5 米', 'before_media_ids': [], 'after_media_ids': ['mg-tp'], 'retest': '截图复查'},
        ],
        'bugs_gap': '修复前的画面没有留存。',
        'qa': lambda r: [
            {'what': '机枪接管与扫射、U 手榴弹、I/F 上炮、默认接管下左键开火 / 右键开镜 / 转视角、Esc 即暂停、旧设置换算、枪火集结第三章进入重做版并返回大厅、枪火集结键位默认值', 'method': 'qa/interact.cjs，Edge 无头', 'viewport': '1280×720', 'result': r['interact'], 'evidence': 'qa/out-interact.json'},
            {'what': '两视角、射击、跳跃、街垒、操炮（沿用并对齐新键位）', 'method': 'qa/views.cjs', 'viewport': '1280×720', 'result': r['views'], 'evidence': 'qa/out-views.json'},
            {'what': '双端布局（去掉两个技能键后）', 'method': 'qa/mobile.cjs，CDP 触控模拟，不是真机', 'result': r['mobile'], 'evidence': 'qa/out-mobile.json'},
            {'what': '选项、命数耐久、暂停与声音、隐私', 'method': 'qa/options.cjs', 'result': r['options'], 'evidence': 'qa/out-options.json'},
            {'what': '自动通关', 'method': 'qa/playthrough.cjs，确定性步进', 'result': r['plays'], 'evidence': 'qa/out-playthrough-p1-*.json', 'note': '一发档没有打完：脚本卡在第一处机枪阵地反复阵亡直到 15 分钟超时（以前靠骑兵连清阵地，脚本不会借掩体）。标准、宽松通关'},
        ],
        'untested': ['用户明确说本版不用测试，以下都没有做：真人试玩', '手机真机', '帧时间重测（上次测量在 v0.2.0）', '整局录像重录', 'Toy 外壳内的鼠标接管是否生效（不生效会退回按住拖动）', '语音听感'],
        'readiness': {'overview': 'partial', 'update': 'partial', 'gaps': ['没有这一版的整局录像，v0.2.0 的录像里还有已去掉的技能', '没有真人、带声音的实机素材', '手机真机未测']},
    },
    'v0.2.0': {
        'base': 'v0.1.0',
        'shots': [
            ('menu', 'qa/menu-1280x720.png', '主菜单与全部选项（电脑 1280×720，四列）'),
            ('menu-short', 'qa/menu-1280x580.png', '电脑矮窗口 1280×580 的主菜单，不滚动'),
            ('menu-phone', 'qa/menu-844x346.png', '手机横屏紧凑主菜单（844×346 触控模拟）'),
            ('menu-portrait', 'qa/menu-390x844.png', '手机竖屏打开即旋转成横屏的主菜单（390×844 触控模拟）'),
            ('view-tp', 'qa/scene-field-tp.png', '越肩第三人称（默认），城外起点'), ('view-fp', 'qa/scene-field-fp.png', '第一人称，城外起点'),
            ('ads-tp', 'qa/scene-ads-fire-tp.png', '第三人称开镜射击'), ('ads-fp', 'qa/scene-ads-fire-fp.png', '第一人称开镜射击'),
            ('jump', 'qa/scene-jump-tp.png', '跳跃中（第三人称，镜头不跟跳跃弧线）'),
            ('jump-crate', 'qa/jump-on-crate.png', '跳上弹药箱'), ('jump-platform', 'qa/jump-on-platform.png', '踩箱子跳上土坎顶'),
            ('platform-top', 'qa/scene-platform-top-tp.png', '站在土坎顶上从侧面打机枪阵地'), ('shed-top', 'qa/scene-shed-top-tp.png', '十字街口的矮棚顶射击位'),
            ('cannon-tp', 'qa/scene-cannon-tp.png', '操炮·炮后视角'), ('cannon-fp', 'qa/scene-cannon-fp.png', '操炮·炮手视角'),
            ('cannon-tp-fire', 'qa/scene-cannon-tp-fire.png', '操炮开火（炮后视角）'), ('cannon-fp-fire', 'qa/scene-cannon-fp-fire.png', '操炮开火（炮手视角）'),
            ('cavalry', 'qa/scene-cavalry-tp.png', '骑兵连从两侧冲锋，不再穿过镜头'), ('dash', 'qa/scene-dash-tp.png', '亮剑突进'),
            ('gate', 'qa/scene-gate-tunnel-tp.png', '城门洞（第三人称，镜头避让）'), ('street', 'qa/scene-street-tp.png', '城内主街与降到胸口高的街垒'),
            ('alley', 'qa/scene-alley-tp.png', '小巷'), ('hq', 'qa/scene-hq-tp.png', '守备队部决战场地'),
            ('wallbase-up', 'qa/scene-wallbase-tp-up.png', '城墙根抬头看城楼（Y 键 / 上拖）'),
            ('touch-play', 'qa/play-844x390.png', '手机横屏枪战布局：浮动摇杆、开火、跳、开镜、换弹、手榴弹、亮剑、骑兵连（触控模拟）'),
            ('touch-play-toy', 'qa/play-844x346.png', 'Toy 外壳高度 844×346 下的枪战布局（触控模拟）'),
            ('touch-portrait', 'qa/play-390x844.png', '手机竖屏旋转后的枪战布局（触控模拟）'),
            ('touch-fp', 'qa/play-fp-844x390.png', '手机横屏第一人称（触控模拟）'),
            ('touch-cannon', 'qa/cannon-844x390.png', '手机操炮布局（触控模拟）'),
            ('touch-pause', 'qa/pause-844x346.png', '手机暂停菜单 844×346（触控模拟）'), ('touch-result', 'qa/result-844x346.png', '手机结算 844×346，不滚动（触控模拟）'),
            ('pc-touchmode', 'qa/pc-touchmode.png', '电脑上手动切到「手机触屏」模式'),
            ('sheet-fix', 'qa/sheet-fix.jpg', '镜头、准星、骑兵路线调整后的联系表'),
        ],
        'stage': {
            'version': 'v0.2.0-dev01',
            'build': {'id': 'local-50630872913a', 'commit': 'd45a57a7', 'dirty': True, 'fingerprint': 'sha256:50630872913a2bfbc8109a34655fc10bb6ac6dc0f77ae6394b3aac0562a09bdb（public/html/game/gunfire-assembly/pingan 下 26 个文件按路径排序连接）；修复街垒之前的工作区，文件已被后续修改覆盖，无法重算', 'entrypoint': 'public/html/game/gunfire-assembly/pingan/index.html'},
            'media': [
                ('stalemate-video', 'barricade-stalemate-before-fix.webm', 'video', '修复前的实时录像（脚本操作、无声音）：前约 130 秒打到第四阶段，之后主角站在街垒前，与沙袋后的敌人互相打不到，一直僵持到 12 分钟超时', [(118, 150, '走到街垒前开始僵持'), (600, 620, '僵持中，画面几乎不动')]),
                ('stalemate-sheet', 'sheet-barricade-stalemate.jpg', 'screenshot', '同一段录像第 330 / 450 / 600 / 720 秒的四帧拼图：主角与街垒后的三个敌人互相打不到', []),
            ],
        },
        'historical': [
            {'id': 'barricade-stalemate-video', 'handoff': 'releases/v0.2.0-dev01/handoff.json', 'media_id': 'stalemate-video', 'reason': '街垒问题修复前的录像，录制于修复之前的阶段构建'},
            {'id': 'barricade-before', 'handoff': 'releases/v0.2.0-dev01/handoff.json', 'media_id': 'stalemate-sheet', 'reason': '街垒问题修复前的画面'},
        ],
        # 只登记抽帧看过的时间点，前后各取两秒
        'video_segments': {'playthrough-view0-p1': [(10, 14, '第一阶段：城外推进，铁丝网与土坎（抽帧所见）'), (38, 42, '第二阶段：护送意大利炮'), (68, 72, '第三阶段：操炮瞄城门，“开炮”弹幕'), (93, 97, '第四阶段：隔着胸口高的街垒对射、骑兵连进攻'), (116, 120, '缴获军火库，“发财了”'), (133, 137, '决战山本一木'), (146, 150, '山本第二阶段'), (156, 160, '“狭路相逢勇者胜”，山本倒下'), (164, 168, '结算：平安县城，拿下了')]},
        'video_desc': '实时运行，由手动瞄准的按键脚本从第一阶段打到结算的整局录像（{view}，无头浏览器录屏，无声音；不是真人操作，脚本会原地等、会撞墙，不代表真人打法）',
        'features': [
            {'id': 'phase1', 'desc': '第一阶段：端掉两处机枪阵地（正面打不穿；可绕侧、跳进侧墙、上土坎顶、手榴弹、骑兵），拔掉第一处后有一波反扑', 'status': 'implemented', 'evidence_ids': ['view-tp', 'platform-top']},
            {'id': 'phase2', 'desc': '第二阶段：护送意大利炮到炮位，侧翼冲击与掷弹筒红圈；炮被打坏则本阶段重来', 'status': 'implemented', 'evidence_ids': []},
            {'id': 'phase3', 'desc': '第三阶段：F 上炮，开火键开炮（弹道预览、落点提示），轰掉机枪堡、城门、城楼', 'status': 'implemented', 'evidence_ids': ['cannon-tp', 'cannon-fp', 'cannon-tp-fire']},
            {'id': 'phase4', 'desc': '第四阶段：巷战，街垒（可翻越）、十字街口机枪阵地（可上棚顶侧击）、小巷援兵、特工队；军火库缴获换枪', 'status': 'implemented', 'evidence_ids': ['street', 'alley', 'shed-top']},
            {'id': 'phase5', 'desc': 'Boss 山本一木：点射、手雷、拔刀突进（可侧移、跳起或亮剑拼刀）、两次召唤', 'status': 'implemented', 'evidence_ids': ['hq']},
            {'id': 'aim', 'desc': '手动瞄准 + 固定一档辅助：准星射线落点、子弹吸附、触屏/按键的减速与牵引、爆头 ×2、弹匣与换弹、开镜', 'status': 'implemented', 'evidence_ids': ['ads-tp', 'ads-fp']},
            {'id': 'jump', 'desc': '自由跳跃与按高度的碰撞：铁丝网、箱子、土坎、棚顶、阵地侧墙', 'status': 'implemented', 'evidence_ids': ['jump', 'jump-crate', 'jump-platform', 'platform-top', 'shed-top']},
            {'id': 'skills', 'desc': '手榴弹朝准星落点抛 / 亮剑沿镜头前方突进 / 骑兵连', 'status': 'implemented', 'evidence_ids': ['cavalry', 'dash']},
            {'id': 'memes', 'desc': '开炮、意大利炮、天才、骑兵连进攻、打的就是精锐、富裕的仗、勇者胜、一锅粥等大字/弹幕/喊话（沿用 v0.1.0）', 'status': 'implemented', 'evidence_ids': ['cannon-tp-fire', 'cavalry']},
            {'id': 'views', 'desc': '两个视角：越肩第三人称、第一人称；Q/E 左右、Y/H 上下、拖动转视角；镜头避让与遮挡淡化', 'status': 'implemented', 'evidence_ids': ['view-tp', 'view-fp', 'gate', 'wallbase-up']},
            {'id': 'pc-input', 'desc': '鼠标瞄准（按住拖动 / 可选鼠标锁定）、左键开火、右键开镜；纯键盘 J K U I O L R F 全套', 'status': 'implemented', 'evidence_ids': ['menu']},
            {'id': 'touch', 'desc': '精简和平精英布局：浮动摇杆、右半屏滑动瞄准、开火键可拖动瞄准、左手开火键可选；竖屏旋转', 'status': 'implemented', 'evidence_ids': ['touch-play', 'touch-play-toy', 'touch-portrait', 'touch-fp', 'touch-cannon']},
            {'id': 'options', 'desc': '起始阶段、命数、耐久、演示、视角、画质、音量、弹幕、操作模式、瞄准灵敏度、鼠标瞄准、左手开火键、帧率、全屏；暂停/结算菜单', 'status': 'implemented', 'evidence_ids': ['menu', 'menu-short', 'menu-phone', 'touch-pause', 'touch-result']},
            {'id': 'publish', 'desc': '接入网站游戏列表、Toy 打包与提交', 'status': 'planned', 'evidence_ids': []},
        ],
        'changes': [
            {'id': 'two-views', 'feature_ids': ['views'], 'before': '四个视角：斜俯视（默认）、战术俯视、正视、第一人称', 'after': '两个视角：越肩第三人称（默认）、第一人称；旧存档的视角只换算一次', 'user_visible': 'C 只在两种人称间切换，默认从主角右肩后看出去', 'evidence_ids': ['view-tp', 'view-fp'], 'verification': 'automated-pass; human-play not-run'},
            {'id': 'manual-aim', 'feature_ids': ['aim'], 'before': '按住 J 自动锁定最近的敌人；停火 1.6 秒自动补满子弹', 'after': '自己把准星对上去；准星附近有子弹吸附，触屏/按键另有减速和牵引；弹匣 20（歪把子 40），打空自动换弹、R 手动换弹；可开镜；爆头 ×2', 'user_visible': '打枪要自己瞄了，准星吸住时变红，爆头有单独提示', 'evidence_ids': ['ads-tp', 'ads-fp'], 'verification': 'automated-pass; human-play not-run'},
            {'id': 'jump', 'feature_ids': ['jump', 'phase1', 'phase4', 'phase5'], 'before': '没有跳跃；铁丝网只是装饰', 'after': '空格 / K 跳约 1.3 米；铁丝网走不过能跳过；箱子台阶上土坎顶和棚顶；可跳进机枪阵地侧墙、翻街垒；跳起可躲山本的贴地突进', 'user_visible': '多了绕后和占高处的打法', 'evidence_ids': ['jump', 'jump-crate', 'jump-platform', 'platform-top', 'shed-top'], 'verification': 'automated-pass; human-play not-run'},
            {'id': 'keys', 'feature_ids': ['pc-input', 'views'], 'before': 'J 射击、K 手榴弹、U 亮剑、I 骑兵连；J 上炮；没有上下转视角的键', 'after': 'J 开火、K 跳、U 亮剑、I 骑兵连、L 手榴弹、O 开镜、R 换弹、F 上炮/离炮；Q/E 左右、Y/H 上下转视角；鼠标左键开火、右键开镜、空格跳、G 手榴弹、V/X 技能、Shift 开镜', 'user_visible': '键位换成枪战习惯；上炮改按 F', 'evidence_ids': ['menu'], 'verification': 'automated-pass; human-play not-run'},
            {'id': 'mouse', 'feature_ids': ['pc-input', 'options'], 'before': '鼠标只能拖动转视角', 'after': '鼠标瞄准：默认按住拖动，设置里可改成鼠标锁定；锁定被拒绝或退出时回到拖动并提示', 'user_visible': '电脑上可以像一般射击游戏那样用鼠标打', 'evidence_ids': ['menu'], 'verification': 'automated-pass（无头 Edge 里锁定可用；被拒绝时的回退分支没有走到）; human-play not-run'},
            {'id': 'touch-layout', 'feature_ids': ['touch'], 'before': '左下固定摇杆 + 右下 2×2 动作键', 'after': '左半屏浮动摇杆；右半屏滑动瞄准；大开火键按住可拖动瞄准；跳、开镜、换弹、手榴弹、亮剑、骑兵连；靠近炮位出现操炮键；可开左手开火键', 'user_visible': '手机布局换成常见射击手游的样子', 'evidence_ids': ['touch-play', 'touch-play-toy', 'touch-portrait', 'touch-cannon'], 'verification': 'automated-pass（触控模拟）; 真机 not-run'},
            {'id': 'options', 'feature_ids': ['options'], 'before': '主菜单 12 个格子', 'after': '主菜单 15 个格子（新增瞄准灵敏度、鼠标瞄准、左手开火键），宽屏四列，1280×580 与 844×346 仍不滚动', 'user_visible': '菜单多三项', 'evidence_ids': ['menu', 'menu-short', 'menu-phone'], 'verification': 'automated-pass'},
            {'id': 'balance', 'feature_ids': ['phase1', 'phase2', 'phase4', 'phase5'], 'before': '按自动锁定调的数值', 'after': '手动瞄准后输出变慢：敌人血量下调（步兵 2、机枪手 6、军官 5、特工 7、山本 280），巷战的十字街口和后段特工各少一人，敌人开火间隔拉长；街垒降到胸口高，守军和主角能隔着街垒对射；敌人和战友会绕开新加的障碍', 'user_visible': '节奏按手动瞄准重排，真人难度未测', 'evidence_ids': [], 'verification': 'automated-pass（脚本三档耐久通关）; human-play not-run'},
        ],
        'bugs': [
            {'id': 'leave-cannon-reman', 'found_in': 'v0.2.0 开发中', 'repro': '操炮时按 F 离开', 'observed': '离开的同一下按键又上了炮', 'cause': '离炮后没清掉这次互动按键', 'status': 'fixed', 'fix': '离炮后清除本次互动输入', 'before_media_ids': [], 'after_media_ids': [], 'retest': 'views.cjs 的上炮 / 离炮断言通过'},
            {'id': 'crate-overshoot', 'found_in': 'v0.2.0 开发中', 'repro': '助跑跳向弹药箱', 'observed': '经常直接飞过去，落不到箱顶', 'cause': '箱子太小、滞空太长、空中速度不减', 'status': 'fixed', 'fix': '箱子加大到 1.9 米见方；起跳速度与重力改成滞空约 0.63 秒；空中速度 ×0.85；落点判定留 0.3 米余量', 'before_media_ids': [], 'after_media_ids': ['jump-crate', 'jump-platform'], 'retest': 'views.cjs 逐帧落点断言通过'},
            {'id': 'ai-stuck-platform', 'found_in': 'v0.2.0 开发中', 'repro': '第一阶段敌人从新加的土坎后方出击', 'observed': '敌人顶在土坎后面出不来，脚本通关停滞', 'cause': '敌人只会直线走向目标', 'status': 'fixed', 'fix': '移动加入贴障碍侧绕与卡住检测', 'before_media_ids': [], 'after_media_ids': [], 'retest': '三档耐久脚本通关无停滞'},
            {'id': 'tpp-head-on-crosshair', 'found_in': 'v0.2.0 开发中', 'repro': '第三人称平视或开镜', 'observed': '主角的头压在准星上，开镜时镜头贴得太近', 'cause': '镜头支点偏低、肩部偏移不够', 'status': 'fixed', 'fix': '支点抬到 1.95 米，肩部偏移 0.7（开镜 0.95），开镜距离 3.1 米', 'before_media_ids': [], 'after_media_ids': ['view-tp', 'ads-tp', 'sheet-fix'], 'retest': '两视角截图复查'},
            {'id': 'cavalry-through-camera', 'found_in': 'v0.2.0 开发中', 'repro': '第三人称放骑兵连', 'observed': '战马从镜头里穿过去', 'cause': '冲锋线路正好经过主角身后的镜头位置', 'status': 'fixed', 'fix': '冲锋线路让开中间，分到两侧', 'before_media_ids': [], 'after_media_ids': ['cavalry'], 'retest': '截图复查'},
            {'id': 'result-scroll-346', 'found_in': 'v0.2.0 开发中', 'repro': '844×346 打到结算', 'observed': '结算面板要滚动才能看全', 'cause': '多了爆头、跳跃两项统计', 'status': 'fixed', 'fix': '紧凑布局的统计改三列', 'before_media_ids': [], 'after_media_ids': ['touch-result'], 'retest': 'mobile.cjs 结算不滚动断言通过'},
            {'id': 'use-under-toast', 'found_in': 'v0.2.0 开发中', 'repro': '手机上走到炮位旁', 'observed': '操炮键被提示条压住', 'cause': '按钮位置和提示条重叠', 'status': 'fixed', 'fix': '操炮键挪开', 'before_media_ids': [], 'after_media_ids': ['touch-play'], 'retest': 'mobile.cjs 不重叠断言通过'},
            {'id': 'barricade-stalemate', 'found_in': 'v0.2.0 录制整局录像时', 'repro': '第四阶段站到街垒正面（例如 x=-4、z=-38），瞄沙袋后露出头的守军开火；或站着不动等守军开枪', 'observed': '看得见守军的头，但主角的子弹全打在沙袋上；守军的子弹同样被自己面前的沙袋挡住。实时录像里脚本和三个敌人这样僵持了十分钟。确定性复现：35 发子弹打不掉一个 2 血的守军，离 12 米也一样', 'cause': '街垒沙袋的碰撞高度 1.6 米，高过双方枪口；敌人判断射界时又忽略 1.7 米以下的掩体，以为自己打得到，就站在原地对着沙袋开枪', 'status': 'fixed', 'fix': '街垒降到胸口高（四层沙袋，碰撞 1.1 米，主角可以直接跳上去）；步兵和特工的射界改按子弹实际高度计算、矮掩体也算进去，没有射界时斜着往前绕出掩体', 'before_media_ids': ['barricade-stalemate-video', 'barricade-before'], 'after_media_ids': ['street'], 'retest': 'views.cjs 新增三条：街垒前瞄头一枪击倒；守军 10 秒内越过沙袋命中主角；贴着沙袋不是死角。三档耐久脚本重新通关'},
        ],
        'bugs_gap': '修复前的画面没有单独留存（同名截图被复拍覆盖），只有修复后的截图和联系表。',
        'qa': lambda r: [
            {'what': '两个视角：WASD、Q/E、Y/H 方向与限位、C 切换；鼠标拖动转视角、左键开火且按住可拖、右键开镜；吸附（偏一点能中、偏多了不中、隔掩体不吸）；爆头；换弹；开镜；跳跃（高度、落箱子与侧墙、铁丝网、房顶站不上、躲山本突进、空中中弹）；F 上炮 / 离炮；街垒前后互射；鼠标锁定（进入后移动鼠标转视角、退出即暂停——本次环境允许锁定，所以“被拒绝时回退到拖动”那条分支没有走到）', 'method': 'qa/views.cjs，Edge 无头，真实键盘与鼠标事件 + 手动步进', 'viewport': '1280×720', 'result': r['views'], 'evidence': 'qa/out-views.json'},
            {'what': '电脑窗口与手机视口的菜单完整性；竖屏旋转；浮动摇杆、各动作键尺寸与不重叠、开火键拖动瞄准、左手开火键、多点触控；三种操作模式切换；暂停/结算布局', 'method': 'qa/mobile.cjs，Edge 无头，CDP 触控模拟（不是手机真机）', 'viewport': '1366×768、1280×720、1366×625、1280×580、1920×1080；844×390、844×346、800×390、740×360、568×320、390×844、360×780、375×667', 'result': r['mobile'], 'evidence': 'qa/out-mobile.json'},
            {'what': '每个选项的切换与保存（含三个新选项）及原有选项的实际效果；旧视角存档换算；命数与耐久；演示模式；暂停冻结声音、继续/重开/回主菜单后有声；起始阶段直达；包内无作者网站地址与账号表单', 'method': 'qa/options.cjs，Edge 无头；声音在输出端挂分析器实测', 'viewport': '1280×720', 'result': r['options'], 'evidence': 'qa/out-options.json'},
            {'what': '自动通关（流程不软锁、无脚本报错；压力参考）', 'method': 'qa/playthrough.cjs + qa/bot.browser.js：脚本经鼠标瞄准输入层自己转准星（瞄上胸，所以爆头数偏高）、按开火键，确定性手动步进；脚本不用掩体、躲避很弱', 'result': r['plays'], 'evidence': 'qa/out-playthrough-p1-*.json'},
            {'what': '帧时间（实时运行，脚本边打边测）', 'method': 'qa/perf.cjs', 'result': r['perf'], 'evidence': 'qa/out-perf.json', 'note': '只代表本机 RTX 4060 Ti、无头 Edge；“手机模拟”只是视口与像素比，不是手机性能'},
            {'what': '画面巡检：两个视角下的城外、土坎后、城墙根、门洞、主街、贴墙、小巷、棚顶、军火库、队部，骑兵/亮剑/跳跃/开镜/操炮动态；全屏；以 0×0 启动后重排', 'method': 'qa/scenes.cjs + 人工看图（由 AI 查看截图）', 'result': '准星被主角头部遮挡、开镜过近、骑兵穿镜头三处已调整并复拍；全屏对整页生效；0×0 启动后按 844×390 重排', 'evidence': 'captures/qa/scene-*.png、sheet-*.jpg'},
        ],
        'untested': ['手机真机（触控、多指、性能、全屏与横屏锁定）', '真人完整试玩：手动瞄准的手感、吸附强弱、难度、跳跃手感', '真实浏览器窗口里由人操作的鼠标锁定（只在无头 Edge 里验证过）', '鼠标锁定被环境拒绝时回退到拖动（代码有，这次的环境允许锁定，没走到）', '瞄准灵敏度三档的实际手感（只验证了能切换和保存）', '喊话语音的听感（未试听）', '带声音的录像', 'Toy 外壳内运行（本版不发布；Toy 里鼠标锁定可能不可用，默认是拖动）', '动态画面的逐帧人工审看（只看了截图）'],
        'readiness': {'overview': 'partial', 'update': 'partial', 'gaps': ['没有真人操作、带声音的实机录像（现有录像为脚本操作、无音轨）', '问题修复前的画面没有留存，做“改动前后对比”只能拿 v0.1.0 的截图当改动前', '语音未试听', '手机真机未测', '本版只在本地，未发布，没有可公开的试玩链接']},
    },
}


def sha(p):
    h = hashlib.sha256(); h.update(Path(p).read_bytes()); return h.hexdigest()


def fingerprint():
    h = hashlib.sha256(); n = 0
    for f in sorted(PUB.rglob('*')):
        if f.is_file():
            h.update(f.relative_to(PUB).as_posix().encode()); h.update(f.read_bytes()); n += 1
    return h.hexdigest(), n


def probe(p):
    try:
        out = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate:format=duration', '-of', 'json', str(p)])
        d = json.loads(out); s = d['streams'][0]
        a = subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', str(p)]).decode().strip()
        return {'width': s['width'], 'height': s['height'], 'fps': s.get('avg_frame_rate'), 'duration_seconds': round(float(d['format'].get('duration') or 0), 1), 'audio': 'game' if a else 'none'}
    except Exception as e:
        return {'probe_error': str(e)}


def image_size(p):
    b = Path(p).read_bytes()
    if b[:8] == b'\x89PNG\r\n\x1a\n':
        return int.from_bytes(b[16:20], 'big'), int.from_bytes(b[20:24], 'big')
    i = 2                                   # JPEG：找 SOF 段
    while i + 9 < len(b) and b[i] == 0xFF:
        m, ln = b[i + 1], int.from_bytes(b[i + 2:i + 4], 'big')
        if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC):
            return int.from_bytes(b[i + 7:i + 9], 'big'), int.from_bytes(b[i + 5:i + 7], 'big')
        i += 2 + ln
    return None, None


def load(name):
    p = QA / name
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else None


def passed(d):
    if not d:
        return None
    rs = [r for r in (d.get('results') or d.get('checks') or []) if not r['name'].startswith('（记录）')]   # 环境记录行不算断言
    return f"{sum(1 for r in rs if r['ok'])}/{len(rs)}"


def write_stage(st):
    """开发阶段构建的清单：只登记那一版留下的原片，构建信息是当时记下的，不按现在的文件重算。"""
    rel = KIT / 'releases' / st['version']
    cap = rel / 'captures'
    media = []
    for mid, name, kind, desc, segs in st['media']:
        f = cap / name
        if not f.exists():
            print('阶段素材缺失：', name); continue
        item = {'id': mid, 'file': f"releases/{st['version']}/captures/{name}", 'sha256': sha(f), 'kind': kind, 'version': st['version'], 'build_id': st['build']['id'], 'capture_mode': 'realtime-automation', 'description': desc, 'audio': 'none', 'visual_review': 'pass', 'audio_review': 'not-applicable', 'segments': [{'in_seconds': a, 'out_seconds': b, 'description': t} for a, b, t in segs]}
        if kind == 'video':
            pr = probe(f); item.update(width=pr.get('width'), height=pr.get('height'), duration_seconds=pr.get('duration_seconds'), visual_review='not-run', note='只抽了 10 帧看过，没有逐帧审看，所以 visual_review 记为 not-run')
        else:
            w, h = image_size(f); item.update(width=w, height=h, duration_seconds=None)
        media.append(item)
    handoff = {
        'schema_version': 1, 'game_id': 'liangjian-pingan', 'version': st['version'], 'base_version': 'v0.1.0',
        'created_at': datetime.now(timezone(timedelta(hours=8))).isoformat(timespec='seconds'),
        'build': st['build'], 'feature_inventory': [], 'changes': [], 'bugs': [], 'media': media, 'historical_media': [],
        'qa': [], 'untested': ['阶段构建，只为保留修复前的原片；验收以最终版清单为准'],
        'readiness': {'overview': 'not_applicable', 'update': 'not_applicable', 'gaps': []},
    }
    (rel / 'handoff.json').write_text(json.dumps(handoff, ensure_ascii=False, indent=1), encoding='utf-8')


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else sorted(SPECS)[-1]
    if version not in SPECS:
        sys.exit(f'没有 {version} 的清单内容；可用：{", ".join(sorted(SPECS))}。旧版本以已提交的 handoff.json 为准。')
    spec = SPECS[version]
    rel = KIT / 'releases' / version
    cap = rel / 'captures'

    fp, nfiles = fingerprint()
    build_id = 'local-' + fp[:12]
    commit = subprocess.run(['git', '-C', str(ROOT), 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip() or None
    dirty = bool(subprocess.run(['git', '-C', str(ROOT), 'status', '--porcelain', '--', 'public/html/game/gunfire-assembly/liangjian'], capture_output=True, text=True).stdout.strip())

    media, missing = [], []
    for mid, r, desc in spec['shots']:
        p = cap / r
        if not p.exists():
            missing.append(r); continue
        w, h = image_size(p)
        media.append({'id': mid, 'file': f'releases/{version}/captures/{r}', 'sha256': sha(p), 'kind': 'screenshot', 'version': version, 'build_id': build_id, 'capture_mode': 'realtime-automation', 'description': desc + AUTO, 'width': w, 'height': h, 'duration_seconds': None, 'audio': 'none', 'visual_review': 'pass', 'audio_review': 'not-applicable', 'segments': []})
    for v in sorted(cap.glob('playthrough-*.webm')):
        pr = probe(v)
        view = '第一人称' if 'view1' in v.stem else '越肩第三人称'
        media.append({'id': v.stem, 'file': f'releases/{version}/captures/{v.name}', 'sha256': sha(v), 'kind': 'video', 'version': version, 'build_id': build_id, 'capture_mode': 'realtime-automation', 'description': spec['video_desc'].format(view=view), 'width': pr.get('width'), 'height': pr.get('height'), 'duration_seconds': pr.get('duration_seconds'), 'audio': pr.get('audio', 'none'), 'visual_review': 'not-run', 'audio_review': 'not-applicable', 'segments': [{'in_seconds': x, 'out_seconds': min(y, pr.get('duration_seconds') or y), 'description': t} for x, y, t in spec.get('video_segments', {}).get(v.stem, [])], 'note': '只抽了 9 帧看过（五个阶段与结算都在），没有逐帧审看，所以 visual_review 记为 not-run'})
    hist = spec.get('historical', [])
    if spec.get('stage'):
        write_stage(spec['stage'])
    ids = {m['id'] for m in media} | {r['id'] for r in hist}
    videos = [m['id'] for m in media if m['kind'] == 'video']

    perf = load('out-perf.json')
    plays = {a: load(f'out-playthrough-p1-{a}.json') for a in ('std', 'easy', 'one')}
    results = {
        'views': passed(load('out-views.json')), 'mobile': passed(load('out-mobile.json')), 'options': passed(load('out-options.json')), 'interact': passed(load('out-interact.json')),
        'plays': {a: (None if not d else {'finished': d['finished'], 'game_seconds': d['gameSeconds'], 'phases': d['phases'], 'deaths': (d.get('final') or {}).get('deaths'), 'hurt': (d.get('final') or {}).get('hurt'), 'kills': (d.get('final') or {}).get('kills'), 'score': (d.get('final') or {}).get('score'), 'errors': d['errors']}) for a, d in plays.items()},
        'story': passed(load('out-story.json')), 'gunfire': passed(load('out-gunfire-chapters.json')), 'cy_story': passed(load('out-cy-story.json')), 'ljp_story': passed(load('out-ljp-story.json')),
        'ljp_plays': {k: (None if not d else {'finished': d['finished'], 'game_seconds': d['gameSeconds'], 'phases': d['phases'], 'hurt_by': d.get('hurtBy'), 'rank': (d.get('result') or {}).get('rank'), 'errors': d['errors']}) for k, d in ((k, load(f'out-ljp-playthrough-p1-{k}.json')) for k in ('std', 'easy'))},
        'cy_plays': {k: (None if not d else {'finished': d['finished'], 'line': d.get('line'), 'game_seconds': d['gameSeconds'], 'phases': d['phases'], 'errors': d['errors']}) for k, d in ((k, load(f'out-cy-playthrough-p1-{k}.json')) for k in ('std-hit', 'std-miss', 'easy-hit2'))},
        'rescue': (lambda d: None if not d else {'finished': d['finished'], 'ending': d.get('ending'), 'game_seconds': d['gameSeconds'], 'phases': d['phases'], 'errors': d['errors']})(load('out-playthrough-p1-std-rescue.json')),
        'perf': None if not perf else [{'name': r['name'], 'renderer': r['env']['renderer'], 'dpr': r['env']['dpr'], 'samples': [{k: s[k] for k in ('phase', 'view', 'avgFps', 'medianMs', 'p95Ms', 'maxMs', 'over50ms', 'avgCalls', 'avgTris', 'canvas', 'quality')} for s in r['samples']]} for r in perf['runs']],
    }

    keep = lambda xs: [x for x in xs if x in ids]
    features = [dict(f, evidence_ids=keep(f['evidence_ids'])) for f in spec['features']]
    changes = [dict(c, evidence_ids=keep(c['evidence_ids']) or videos) for c in spec['changes']]
    bugs = []
    for b in spec['bugs']:
        d = dict(b, before_media_ids=keep(b['before_media_ids']), after_media_ids=keep(b['after_media_ids']))
        if not d['before_media_ids']:
            d['gap'] = spec['bugs_gap']
        bugs.append(d)

    handoff = {
        'schema_version': 1, 'game_id': 'liangjian-pingan', 'version': version, 'base_version': spec['base'],
        'created_at': datetime.now(timezone(timedelta(hours=8))).isoformat(timespec='seconds'),
        'build': {'id': build_id, 'commit': commit, 'dirty': dirty, 'fingerprint': 'sha256:' + fp + f'（{PUB.relative_to(ROOT).as_posix()} 下 {nfiles} 个文件按路径排序连接）', 'entrypoint': PUB.relative_to(ROOT).as_posix() + '/index.html'},
        'feature_inventory': features, 'changes': changes, 'bugs': bugs,
        'media': media, 'historical_media': hist, 'qa': spec['qa'](results),
        'untested': spec['untested'], 'readiness': spec['readiness'],
    }
    (rel / 'handoff.json').write_text(json.dumps(handoff, ensure_ascii=False, indent=1), encoding='utf-8')
    print('version', version, 'build', build_id, 'commit', commit, 'dirty', dirty, 'files', nfiles, 'media', len(media), 'videos', len(videos))
    print('qa', results['views'], results['mobile'], results['options'])
    if missing:
        print('缺少截图：', ', '.join(missing))


if __name__ == '__main__':
    main()

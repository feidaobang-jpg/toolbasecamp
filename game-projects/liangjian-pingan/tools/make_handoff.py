# -*- coding: utf-8 -*-
"""按版本汇总交接清单：构建指纹、实机截图/录像的哈希与属性、各验收脚本的结果。
用法（仓库根目录）：python game-projects/liangjian-pingan/tools/make_handoff.py [版本号，默认最新]

每个版本的内容写在下面的 SPECS 里。qa/out-*.json 只保存最近一次运行的结果，
所以只能给“当前这一版”生成；旧版本的清单以当时提交的 handoff.json 为准，不要重新生成
（v0.1.0 的清单由提交 d45a57a7 里的本脚本生成，那一版的验收结果文件已被 v0.2.0 的覆盖）。
"""
import hashlib, json, subprocess, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / 'game-projects' / 'liangjian-pingan'
PUB = ROOT / 'public' / 'html' / 'game' / 'liangjian-pingan'
KIT = GAME / 'media-kit'
QA = GAME / 'qa'

AUTO = '（Edge 无头 + 本机显卡；脚本摆位或脚本按键，手动步进后截图）'

SPECS = {
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
            'build': {'id': 'local-50630872913a', 'commit': 'd45a57a7', 'dirty': True, 'fingerprint': 'sha256:50630872913a2bfbc8109a34655fc10bb6ac6dc0f77ae6394b3aac0562a09bdb（public/html/game/liangjian-pingan 下 26 个文件按路径排序连接）；修复街垒之前的工作区，文件已被后续修改覆盖，无法重算', 'entrypoint': 'public/html/game/liangjian-pingan/index.html'},
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
    rs = [r for r in d['results'] if not r['name'].startswith('（记录）')]   # 环境记录行不算断言
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
    dirty = bool(subprocess.run(['git', '-C', str(ROOT), 'status', '--porcelain', '--', 'public/html/game/liangjian-pingan'], capture_output=True, text=True).stdout.strip())

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
        'views': passed(load('out-views.json')), 'mobile': passed(load('out-mobile.json')), 'options': passed(load('out-options.json')),
        'plays': {a: (None if not d else {'finished': d['finished'], 'game_seconds': d['gameSeconds'], 'phases': d['phases'], 'deaths': d['final']['deaths'], 'hurt': d['final']['hurt'], 'kills': d['final']['kills'], 'score': d['final']['score'], 'errors': d['errors']}) for a, d in plays.items()},
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
        'build': {'id': build_id, 'commit': commit, 'dirty': dirty, 'fingerprint': 'sha256:' + fp + f'（public/html/game/liangjian-pingan 下 {nfiles} 个文件按路径排序连接）', 'entrypoint': 'public/html/game/liangjian-pingan/index.html'},
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

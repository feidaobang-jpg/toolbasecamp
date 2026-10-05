"""v2 视角版投稿包与制作记录：同一份定稿数据生成投稿文案、publish.json、Toy 推流申请、署名、QA 与续接记录。"""
import json, hashlib, subprocess, re
from pathlib import Path
R = Path(__file__).resolve().parent; F = R.parent / 'final/bilibili-zh'; P = R / 'publish/bilibili-zh'; P.mkdir(parents=True, exist_ok=True)
def write(p, t): p.parent.mkdir(parents=True, exist_ok=True); p.write_text(t, encoding='utf-8-sig')
def js(p, v): p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps(v, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
video = F / '恐龙快打3D-第一人称打第一关.mp4'
probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'quiet', '-show_streams', '-show_format', '-of', 'json', str(video)])); js(R / 'qa/ffprobe.json', probe)
sha = hashlib.sha256(video.read_bytes()).hexdigest(); duration = float(probe['format']['duration'])
ebur = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(video), '-af', 'ebur128=peak=true', '-vn', '-f', 'null', '-'], capture_output=True, encoding='utf-8', errors='replace').stderr
I = re.findall(r'I:\s+(-?[\d.]+) LUFS', ebur)[-1]; LRA = re.findall(r'LRA:\s+([\d.]+) LU', ebur)[-1]; TP = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', ebur)[-1]
cap = json.loads((R / 'capture/views-run-1080p.timeline.json').read_text(encoding='utf-8'))
tl = json.loads((R / 'edit/shared-zh/timeline.json').read_text(encoding='utf-8'))

toy = 'https://www.bilibili.com/toy/feidao-cadillacs-3d/index.html'
web = 'https://www.zhengxiaohui.cn/html/game/cadillacs-stage1-3d/index.html'
vote = 'https://www.zhengxiaohui.cn/game-vote.html'
title = '恐龙快打第一关3D重置：按C钻进主角眼睛里打'
tags = ['bilibilitoy', '恐龙快打', '街机', '第一人称', '独立游戏', '游戏开发', 'AI']  # Claude 被 B 站判为话题专用词，不能作普通标签；简介已写明 Claude（Opus 5.5）
banned = ['3D游戏', '网页游戏', '童年游戏', '万物皆可游戏', '动作游戏', 'AI辅助开发']
assert not set(tags) & set(banned) and 'bilibilitoy' in tags
topic = '哔哩哔哩Toy创意挑战'; topicurl = 'https://www.bilibili.com/v/topic/detail?topic_id=1346285'
description = f'''街机恐龙快打的第一关，我做成了 3D 重置版：楼顶 → 大楼内部 → 第 47 街，最后打倒牵着岩跳龙的维斯。默认侧视就是原作画面，按 C 能切到正视（主角身后）和第一人称（主角眼睛）。这期把三种视角都实打了一遍，也抓到两个镜头 bug：第一人称贴太近会钻进恐龙嘴里、正视贴墙会进墙，下次先修。

实机画面为当前线上版本，由自动测试脚本按真实按键操作录制（默认规则、无限命、未开无敌）。使用 Claude（Opus 5.5）辅助开发；背景音乐按原作风格重新编写，音效为合成。粉丝向非官方重置，原作版权归 Capcom 及原著方所有。

B站 Toy 试玩：
{toy}
百宝箱试玩（复制到浏览器打开）：
{web}

给这款投票、想玩哪款复刻（复制到浏览器打开）：{vote} （百宝箱 → 游戏 → 自研游戏投票榜）'''
comment = f'''电脑按 C 切视角、Q/E 转视角；手机点 C、按住画面拖动转视角。你更想用哪个视角打这一关：侧视、正视还是第一人称？
Toy 试玩：{toy}
投票／愿望单（复制到浏览器打开）：{vote} （百宝箱 → 游戏 → 自研游戏投票榜）'''
write(F / '投稿文案.txt', '【标题】\n' + title + '\n\n【标签】\n' + '\n'.join(tags) + '\n\n【话题】\n' + topic + '\n' + topicurl + '\n\n【简介】\n' + description + '\n\n【置顶评论】\n' + comment + '\n')

prefix = '../../../final/bilibili-zh/'
blocking = ['等待用户对本期最终成片人工审片（含人声听感）', '配音为 Edge 云希兜底：用户为 v2 选定的必剪曼波因本次必剪操作授权未获允许而未生成；若审片要求曼波，需允许操作必剪后重配、重排并重新审片']
manifest = {'variant_id': 'bilibili-zh', 'platform': 'bilibili', 'content_type': 'overview_views', 'language': 'zh-CN', 'game_name': '恐龙快打 3D：第一关', 'game_version': 'v0.1.0（录制构建 game.min.js?v=3，桌面玩法与线上 v=4 相同）',
    'video_file': prefix + video.name, 'media_id': 'shared-zh', 'video_sha256': sha, 'width': 1920, 'height': 1080, 'duration_seconds': duration,
    'title': title, 'description': description, 'tags': tags, 'topic': {'name': topic, 'url': topicurl, 'selected_in_platform': False}, 'pinned_comment_draft': comment, 'description_file': prefix + '投稿文案.txt',
    'cover_file': prefix + 'cover-home-4x3.jpg', 'cover_files': {'home_4_3': {'file': prefix + 'cover-home-4x3.jpg', 'width': 1440, 'height': 1080, 'purpose': '首页推荐（4:3）'}, 'space_16_9': {'file': prefix + 'cover-space-16x9.jpg', 'width': 1920, 'height': 1080, 'purpose': '个人空间（16:9）'}},
    'cover_text': '恐龙快打 · 第一关 3D / 钻进主角眼睛里打 / 侧视 · 正视 · 第一人称', 'cover_selection_source': '实机第一人称截帧（views-run-1080p.mp4 第 221.0 秒，Boss 战岩跳龙与维斯）轻微放大裁掉 HUD + 程序排版，非 AI 生成', 'cover_upload_mode': 'custom_image',
    'subtitle_mode': 'burned_in', 'copyright_type': 'original', 'category': None, 'credits': 'credits.txt',
    'disclosures': ['解说为 Edge 在线神经网络预置音色 zh-CN-YunxiNeural（非必剪曼波）', '实机由 Playwright 页面内测试 bot 派发真实键盘事件操作、逐帧截图录制、同局声音事件离线合成音轨，非真人实时操作；简介已注明', '封面为实机截帧程序排版'],
    'toy': {'id': 40412421031936, 'slug': 'feidao-cadillacs-3d', 'url': toy, 'status_checked': 'published / PUBLIC（toy mylist，2026-10-05）', 'http_checked': '200（2026-10-05）'},
    'vote_checked': '2026-10-05 /api/game-votes/options 已含 cadillacs-stage1-3d，可投票',
    'platform_requirements_checked_at': '2026-10-05', 'platform_sources': [toy, web, vote, topicurl],
    'tag_note': 'Claude 被 B 站判为话题专用词，不能作为普通标签（2026-10-05 投稿页实测，用户确认）；简介写明 Claude（Opus 5.5）辅助开发，保留 AI 标签。',
    'unverified_fields': ['实际投稿时核对分类、话题入口资格与封面上传位置', 'AI 内容声明按投稿页实际选项设置'], 'blocking_issues': blocking, 'ready_to_upload': False, 'uploaded': False}
js(P / 'publish.json', manifest)
js(R / 'publish.json', {'schema_version': 2, 'game_name': manifest['game_name'], 'game_version': 'v0.1.0', 'requested_variants': ['bilibili-zh'], 'variants': [{'variant_id': 'bilibili-zh', 'manifest_file': 'publish/bilibili-zh/publish.json', 'ready_to_upload': False, 'blocking_issues': blocking}], 'ready_to_upload': False})
write(P / 'Toy推流申请.txt', 'UP主昵称：飞刀班长\n视频链接：待投稿产生BV号\n投稿tag是否加bilibilitoy&带话题：草稿已含 bilibilitoy 与话题“哔哩哔哩Toy创意挑战”，待实际投稿核验\n是否置顶Toy链接到评论区：草稿已备（Toy 已发布公开，id 40412421031936），待投稿后置顶\n是否视频中宣传Toy平台：是，口播“B站Toy也能直接玩，链接在简介”，尾卡写明 Toy 试玩入口\n运营反馈：尚未申请\n申请表：https://docs.qq.com/sheet/DU3dnQkR1WG5RUnp0?tab=7mm8hw\n')
write(P / 'credits.txt', '游戏画面、音乐与音效：本项目线上同版（录制构建 game.min.js?v=3，sha256 ' + cap['build_game_min_js_sha256'][:16] + '…）实机录制。原作《Cadillacs and Dinosaurs／恐龙快打》版权归 Capcom 及原著方，粉丝向非官方 3D 重置；音乐按原作风格重新编写（非转录），音效为合成。Three.js MIT 许可随游戏保留（js/THREE-LICENSE.txt）。\n解说：Microsoft Edge 在线神经网络预置音色 zh-CN-YunxiNeural，正常语速；未克隆真人。\n字幕、尾卡与封面字体：Microsoft YaHei Bold，渲染入画，不分发字体文件。\n封面：实机第一人称截帧加程序排版，非 AI 生成。外加音乐：无。\n')
js(R / 'audio/shared-zh/voice.json', {'engine': 'Edge TTS online（edge-tts 库）', 'voice': 'zh-CN-YunxiNeural', 'rate': '+0%', 'speed': 1, 'preferred_voice': '必剪 朗读 → 特色 → 曼波（用户为 v2 选定）',
    'fallback_reason': '2026-10-05 申请操作必剪（computer-use request_access）未获允许，未重复申请；改用 Edge 云希完成整包，未把云希称作曼波。允许后重配曼波，再按新音轨重跑 render.py。',
    'timestamp_source': '服务返回的 WordBoundary（audio/shared-zh/<段>.json）', 'script': '../../narration.json', 'subjective_listening': 'not-run', 'subjective_reason': '当前模型没有可接收音频的试听输入；未播放扬声器打扰用户。', 'python_runtime': 'D:/project/toolbasecamp/comfyui-api-server/.venv/Scripts/python.exe', 'entry': '../../voice_edge.py'})
js(R / 'edit/bilibili-zh/covers/design.json', {'copy': ['恐龙快打 · 第一关 3D', '钻进主角眼睛里打', '侧视 · 正视 · 第一人称'], 'source_frame': 'capture/views-run-1080p.mp4 @221.0s（covers/src-221.0.jpg）', 'method': 'Pillow：裁掉 HUD 后放大约 1.11 倍、局部暗角、描边文字（covers.py）', 'ai_generated': False, 'sizes': {'home_4_3': '1440x1080', 'space_16_9': '1920x1080'}, 'thumb_check': 'tmp/review/thumb-4x3.jpg 320x240、thumb-16x9.jpg 320x180 标题可读'})

# sources.md
write(R / 'sources.md', f'''# 来源

- 游戏：恐龙快打 · 第一关 3D 重置版 v0.1.0。录制时本地服务读到的 game.min.js sha256 {cap['build_game_min_js_sha256']}（{cap.get('build_note', '')}）
- 录像：record_views.cjs —— Playwright + 系统 Edge，页面内 qa/bot.js 依据实时快照决定移动/出招/转头，派发真实键盘事件；按计划在 15.8 / 39.17 / 48.37 / 68.03 / 101.03 / 152.77 / 174.1 / 218.7 / 236.7 秒用真实 C 键切换视角（调度规则在脚本里）。穆斯塔法，seed 7，默认规则（无限命、耐久标准、未开演示/无敌），一局打完整关，未跳关、未瞬移、未刷道具。1920×1080 逐帧截图 30fps；音轨为同局声音事件用 OfflineAudioContext 离线重新合成（游戏自身音乐音效，非外加）。
- 原片：capture/views-run-1080p.mp4（305.6 s，只留本机不入库）；事件与视角切换时间：capture/views-run-1080p.timeline.json。
- 成片全部镜头来自这一局；镜头顺序与时间对照见 script.md 与 edit/shared-zh/timeline.json。开头第一人称开枪片段（124–133 s）在时间上晚于第二段侧视开场，属于先放亮点的剪辑，解说未称其为连续过程。
- 解说、字体、封面：见 publish/bilibili-zh/credits.txt、audio/shared-zh/voice.json、edit/bilibili-zh/covers/design.json。
- 链接核验（2026-10-05）：Toy {toy} → 200，toy mylist 状态 published / PUBLIC；网站 {web} → 200；投票页 {vote} → 200，/api/game-votes/options 含 cadillacs-stage1-3d。
''')

# script.md：最终口播与镜头对照
rows = ['# 最终口播与镜头', '', '解说文本见 narration.json（字幕文本），读音规范化：第47街 → 第四十七街。时间为成片秒；源时间为 capture/views-run-1080p.mp4 秒。', '']
for seg in tl['segments']:
    rows.append(f"## {seg['id']}（{seg['final_in']:.1f}–{seg['final_out']:.1f} s）")
    rows.append(''); rows.append(''.join(seg['lines'])); rows.append('')
    for sh in seg['shots']:
        if sh.get('source') == 'triptych': rows.append('- 画面：三联画（侧视 / 正视 / 第一人称同局实机）+ 试玩与投票信息条')
        else: rows.append(f"- 画面：源 {sh['source_in']:.1f}–{sh['source_out']:.1f} s → 成片 {sh['final_in']:.1f}–{sh['final_out']:.1f} s" + (f"（末帧静止补 {sh['freeze_last_frame']:.1f} s，结算面板本身静止）" if sh['freeze_last_frame'] else ''))
    rows.append('')
write(R / 'script.md', '\n'.join(rows))

# qa.md：视角差异实战覆盖 + 技术检查
cov = [
 ('侧视（默认，原作画面）', 'C 键循环的起点', '楼顶开场：维斯放话跳楼、手下围上', '4.2–15.0', '9.3–20.5', '“默认是侧视，跟当年街机厅里一样…”', 'pass'),
 ('侧视 → 正视切换', '真实 C 键（15.8 s）', '楼顶第一波打到一半', '15.0–19.0', '21.3–25.3', '“按一下C，镜头转到主角身后，这就是正视”', 'pass'),
 ('正视：前方距离清楚', '正视 W 即前进', '敌人从前方迎上、连段击倒', '19.0–26.5', '25.3–32.8', '“谁先走进拳头范围，一眼就看得出来”', 'pass'),
 ('正视：背后盲区', '—', '29.9 s 有人从镜头后方进入，30.3 s 主角挨打（红闪）', '28.5–32.6', '34.8–38.9', '“代价是背后看不见…挨了一下才发现”', 'pass'),
 ('正视 → 第一人称切换', '真实 C 键（39.17 s）', '楼顶第三波，镜头前推到眼睛位置', '38.9–41.4', '38.9–41.4 → 成片 38.9 起', '“再按一下C，第一人称”', 'pass'),
 ('第一人称：贴脸近战', '—', '拳头与敌人面孔占满画面，最后踹开楼梯间的门（47.27 s）', '41.4–48.3', '41.4–48.3 区段', '“拳头就在眼前，敌人的脸也贴在眼前…踹开楼梯间的门”', 'pass'),
 ('正视：走廊纵深 + 两侧门出人', '侧视 → 正视（68.03 s）', '双开门里出人；被三人夹在门边，背后看不见，92.15 s 倒下，复活落地震倒身边敌人', '68.0–74.6、84.6–95.4', '见 timeline', '“两边的门会突然出人…背后那个根本看不见…原地复活，落地还能把身边的人震倒”', 'pass'),
 ('第一人称：迎面持刀敌人、左轮', '正视 → 第一人称（101.03 s）', '布雷德持刀迎面（103.5 s）；击倒后掉左轮、连开六枪（129.18–132.58，4 次命中）；胖子挤满画面', '98.6–105.6、124.0–133.3、133.3–141.2', '开头 0–9.3、06 段', '“左轮在手…连开几枪”“刀子就在眼前晃”“满屏都是肚子”', 'pass'),
 ('Boss：正视', '第 47 街第二波已在正视', '维斯与锁住的岩跳龙在正前方，203.8 s 岩跳龙变橙暴走；210.8 s 主角被扑倒', '194.0–204.8、204.8–215.0', '07–08 段', '“就堵在正前方”“看清楚不代表躲得开”', 'pass'),
 ('Boss：第一人称（含真实 bug）', '真实 C 键（218.7 s）', '221 s 岩跳龙牙在脸前；223.8–224.8 s 镜头穿进岩跳龙头部（bug）；230.4 s 维斯一拳、232.88 s 倒下', '217.3–233.3', '09 段', '“镜头干脆钻进了恐龙嘴里。这是个bug”', 'pass'),
 ('Boss：切回侧视收尾', '真实 C 键（236.7 s）', '侧视看全场、飞踢（248 s）、289.25 s 维斯倒下', '236.2–240.6、247.6–253.8、287.0–290.6', '10 段', '“最后切回侧视收尾…维斯终于倒下”', 'pass'),
 ('结果', '—', '体力奖励 66×100、总分 122400、倒下 3 次（结算面板可见）', '293.9–296.7、300.6–305.5', '11 段', '“十二万两千四百分…倒了三次”', 'pass'),
 ('正视贴墙镜头进墙（真实 bug）', '—', '第 47 街正视，176.8 s、180.4–181.8 s 镜头进砖墙', '176.2–185.2', '12 段', '“正视贴着墙打，镜头会钻进砖墙里”', 'pass'),
]
lines = ['# QA：恐龙快打 v2 视角版（views-20261005）', '',
 '本期以视角差异为看点：同一局里用真实 C 键切换侧视 / 正视 / 第一人称，每个视角都有实际交战与结果；未用环绕或空切代替。录像为测试 bot 操作，非真人，简介已注明。', '',
 '## 视角与实战覆盖', '', '| 项目 | 切换操作 | 实际动作与结果 | 源时间 s | 成片 | 对应解说 | 结论 |', '| --- | --- | --- | --- | --- | --- | --- |']
lines += [f'| {a} | {b} | {c} | {d} | {e} | {f} | {g} |' for a, b, c, d, e, f, g in cov]
lines += ['', '与 v1（debut-20261005）的差异：v1 视角段是另一场次的轮播展示；v2 全部来自同一局完整通关，切换前后都在实打，并讲清正视背后盲区、第一人称近身与穿模问题。v1 保留不删。', '',
 '## 技术检查（bilibili-zh，sha256 ' + sha + '）', '',
 f'| 项目 | 结果 | 证据 |', '| --- | --- | --- |',
 f'| 画幅/编码 | pass | 1920×1080 30fps H.264 yuv420p（tv 范围，BT.709 标签；源 JPEG 全范围已在终编码转换）+ AAC 48 kHz 立体声，{duration:.1f} s（qa/ffprobe.json） |',
 '| 完整解码 | pass | ffmpeg -f null 无错误 |',
 f'| 响度 | pass | Integrated {I} LUFS，LRA {LRA} LU，True peak {TP} dBFS（目标 -16，≤ -1 dBTP） |',
 '| 黑帧 / 长静音 | pass | blackdetect(0.3s) 与 silencedetect(-45dB,1.5s) 无命中；结尾 1.2 s 为设计淡出 |',
 '| 字幕同步 | pass | Edge WordBoundary 逐词时间戳 → 短语字幕（edit/shared-zh/alignment.json），\\an2 居中 y=800；结算面板期间 3 句移到 y=1010 避开面板 |',
 '| 字幕文本 | pass | 与 narration.json 一致；“第47街”为读音规范化（读作第四十七街） |',
 '| 关键 UI 与遮挡 | pass | 每 2 秒抽帧联系表检查（tmp/review/final-*.jpg），字幕不压结算面板、不压游戏对话框 |',
 '| 结尾 | pass | 总结三视角 → 第二关计划 → 试玩入口 → 投票/愿望单 → 三连，末句结束后约 1.4 s 淡出 |',
 '| 封面 | pass | 4:3 1440×1080、16:9 1920×1080，320 px 缩略图标题可读，画面为实机截帧 |',
 '| 文案 | pass | bilibilitoy、AI 在列（Claude 被平台判为话题专用，不能作普通标签，简介已写明），无禁用标签；话题独立一栏；简介与置顶评论各含完整 Toy /index.html 链接；网站与投票链接注明复制到浏览器打开 |',
 '| 人声听感 | not-run | 无法试听；配音为 Edge 云希兜底（非用户选定的曼波），列为审片项 |', '',
 '## 已知问题（录像中发现，未改游戏）', '',
 '- 第 47 街正视贴墙时镜头进入砖墙（176.8、180.4–181.8 s）。',
 '- 第一人称与岩跳龙贴身时镜头穿入其头部（223.8–224.8 s）。',
 '- 侧视 Boss 战尾段维斯被打到画面右缘外（约 279–283、290 s），成片只用了 287–290.6 s 可见部分。',
 '以上已在成片与简介如实说明前两项；修复属于游戏开发任务，未在视频任务中擅自改游戏。', '',
 '## 待人工审片', '', '1. 配音：云希兜底是否可接受，或允许操作必剪改曼波后重配', '2. 开头 9 秒第一人称开枪是否够抓人', '3. 两处 bug 镜头放进成片是否 OK', '']
write(R / 'qa.md', '\n'.join(lines))
js(R / 'run-state.json', {'status': 'rendered_awaiting_user_review', 'mode': 'overview（视角重点，用户 2026-10-05 选“重做 v2”）', 'requested_variants': ['bilibili-zh'], 'files_complete': True,
    'game_id': 'cadillacs-stage1-3d', 'version': 'v0.1.0', 'toy_id': 40412421031936, 'toy_status': 'published / PUBLIC', 'video_sha256': sha, 'duration_seconds': duration,
    'voice': 'Edge zh-CN-YunxiNeural（兜底；用户选定的必剪曼波因操作授权未获允许未生成）', 'subjective_audio_review': 'not-run', 'cover_stage': 'completed',
    'render_entry': 'voice_edge.py → render.py（REUSE=1 复用已切片段）→ covers.py → package.py', 'capture_entry': 'record_views.cjs', 'previous_episode': '../../debut-20261005（v1，保留不删，非当前投稿入口）',
    'video_uploaded': False, 'next_step': '用户审片。若要曼波：允许操作必剪 → 生成曼波整段配音与识别字幕 → 替换 audio 与字幕时间来源后重跑 render.py → 重新审片。审片通过后按 game-video 发布闭环：投稿 → 绑定 Toy 40412421031936 → 置顶评论 → 填推流申请。'})
write(R / '交付清单.txt', f'''B站中文版（唯一投稿入口：final/bilibili-zh/）
- 成片：{video.name}（1920×1080，16:9，{duration:.1f} 秒，中文解说 + 烧录字幕）
- 封面：cover-home-4x3.jpg（首页推荐 4:3）、cover-space-16x9.jpg（个人空间 16:9）
- 文案：投稿文案.txt（标题／标签／话题／简介／置顶评论）
状态：已渲染并完成客观验收，等待人工审片；未上传。
配音：Edge 云希（兜底）。用户选定的必剪曼波未生成，原因见 qa.md。
旧版 v1（debut-20261005）保留，不是本期投稿入口。
''')
print('package', duration, sha, I, LRA, TP)

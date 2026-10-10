"""Write the review package from the verified final export, with no publishing side effects."""
import json, hashlib
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image

W=Path(__file__).resolve().parent
F=W.parent/'final/bilibili-zh'
P=W/'publish/bilibili-zh'
P.mkdir(parents=True, exist_ok=True)
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
def write_json(p, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
q=read(W/'qa/verification.json')
t=read(W/'edit/shared-zh/timeline.json')
n=read(W/'narration.json')
entry=read(W/'entry-verification.json')
capture=read(W/'capture-index.json')
assert q['sha256']==hashlib.sha256((F/'gameplay-zh-final.mp4').read_bytes()).hexdigest()
title='坦克大战能联机了！两个人能守住老鹰吗？'
tags=['坦克大战','联机游戏','合作游戏','游戏开发','bilibilitoy','AI','Claude','GPT']
topic='哔哩哔哩Toy创意挑战'
topic_url='https://www.bilibili.com/v/topic/detail?topic_id=1346285'
toy='https://www.bilibili.com/toy/feidao-tank-3d/index.html'
web='https://www.zhengxiaohui.cn/html/game/tank-3d/index.html'
vote='https://www.zhengxiaohui.cn/game-vote.html'
description='\n'.join([
    '坦克大战支持2–4人联机合作了：房间码邀请、可选密码，一起守住老鹰。本期用两个独立窗口实测，双人清完一关20辆敌人。',
    f'Toy试玩：{toy}',
    '联机：大厅建房或填写房间码，队友准备后由房主开始；暂不支持中途加入，房主退出则结束房间。',
    '用Claude Opus 5.5开发，部分修复由GPT-6 Codex完成的非官方同人实验。',
    f'百宝箱试玩（复制到浏览器打开）：{web}',
    f'投票／愿望单（复制到浏览器打开）：{vote}（百宝箱 → 游戏 → 自研游戏投票榜）'
])
comment='\n'.join([
    '你会选择分路守家，还是两辆坦克一起推进？大厅建房，把六位房间码告诉队友，准备后由房主开始。',
    f'Toy试玩：{toy}',
    f'投票／愿望单（复制到浏览器打开）：{vote}（百宝箱 → 游戏 → 自研游戏投票榜）'
])
copy='\n'.join(['【标题】',title,'','【标签】',*tags,'','【话题】',topic,topic_url,'','【简介】',description,'','【置顶评论】',comment,''])
(F/'投稿文案.txt').write_text(copy, encoding='utf-8')
cover_files={}
for name, purpose in [('home_4_3','首页推荐（4:3）'),('space_16_9','个人空间（16:9）')]:
    filename='cover-home-4x3.jpg' if name=='home_4_3' else 'cover-space-16x9.jpg'
    size=Image.open(F/filename).size
    cover_files[name]={'file':'../../../final/bilibili-zh/'+filename,'width':size[0],'height':size[1],'purpose':purpose,'sha256':hashlib.sha256((F/filename).read_bytes()).hexdigest()}
blocking=['最终成片尚待用户人工审片确认','人声可懂度与主观听感待人工听审','投稿时核对实际分区、AI声明入口、话题与双封面入口']
manifest={
    'schema_version':2,'variant_id':'bilibili-zh','platform':'bilibili','content_type':'game_update','language':'zh-CN',
    'game_name':'坦克大战','game_version':entry['version'],'media_id':'shared-zh',
    'video_file':'../../../final/bilibili-zh/gameplay-zh-final.mp4','video_sha256':q['sha256'],
    'width':1920,'height':1080,'duration_seconds':q['duration'],'fps':30,
    'title':title,'description':description,'tags':tags,'pinned_comment_draft':comment,
    'description_file':'../../../final/bilibili-zh/投稿文案.txt',
    'topic_candidate':{'name':topic,'url':topic_url,'status':'verify actual availability when submitting'},
    'cover_file':cover_files['home_4_3']['file'],'cover_files':cover_files,
    'cover_text':['坦克大战','能联机了！','2–4人，一起守老鹰','双人联机实战 · 房间码邀请'],
    'cover_selection_source':'actual near-view cooperative gameplay tank crops; work/cover-capture.json',
    'cover_upload_mode':'custom_image','cover_stage':'completed',
    'subtitle_mode':'burned_in','subtitle_files':[],
    'category':None,'copyright_type':'original_creator_game_demonstration',
    'credits':'素材来源与原作说明见 credits.md；未把原作音效宣称为原创授权素材。',
    'disclosures':['Edge合成解说（云希），无真人声音克隆','AI辅助游戏开发，真实浏览器游戏实机画面'],
    'platform_requirements_checked_at':None,
    'platform_sources':['https://www.bilibili.com/blackboard/activity-gPIvOmhxbh.html','https://www.bilibili.com/opus/840812291428450327'],
    'unverified_fields':['category','current topic availability','current AI declaration control','current cover upload controls'],
    'blocking_issues':blocking,'ready_to_upload':False,
    'production_status':'complete_pending_human_review','publication_status':'not_uploaded',
    'human_approval':None,'toy_id':'39043249461248','toy_public_url':toy,
    'previous_primary_bvid':'BV1Wqaz6AEJb'
}
write_json(P/'publish.json', manifest)
write_json(W/'publish.json', {'schema_version':2,'game_name':'坦克大战','game_version':entry['version'],
    'requested_variants':['bilibili-zh'],'variants':[{'variant_id':'bilibili-zh','manifest_file':'publish/bilibili-zh/publish.json','ready_to_upload':False,'blocking_issues':blocking}],'ready_to_upload':False})
credits='\n'.join([
    '# 来源与制作记录',
    '游戏画面：本人坦克大战项目的公开当前版本，正常操作录制。模型与地图来自当前游戏构建，没有生成动画替代实机。',
    '地图／数值参考：feichao93/battle-city（MIT）及项目 media-kit/sources.json；原作 Battle City 权利归原权利人，属于非官方同人实验。',
    '游戏音效：当前游戏 audio.js 实际输出，包含原作FC音效与程序合成声。来源与用户历史使用要求见 media-kit/sources.json，未宣称取得额外原作商业授权。',
    '配音：Edge-TTS，zh-CN-YunxiNeural，正常语速 +0%；未克隆真人。使用既有本机环境 edge_tts 7.2.8。',
    '字体：本机 Microsoft YaHei／Microsoft YaHei Bold，仅在画面中渲染，不分发字体文件。',
    '封面：真实近视角坦克截图裁切，实机战场背景调暗后排版；1P和2P来自同一真实联机房间。',
    '音乐：没有额外添加第三方背景音乐。',
    ''
])
(P/'credits.md').write_text(credits, encoding='utf-8')
script=['# 坦克大战联机更新视频','',f'标题：{title}',
    f'录制构建：{entry["version"]}；本期主题为2–4人合作守基地，实际捕获双客户端。',
    '上一条主要宣传视频：BV1Wqaz6AEJb。本期使用全新联机素材，不复用旧片来证明新功能。',
    '两台独立浏览器由脚本正常键盘操作，不说成两个真人朋友。?test=1仅用于只读观察，没有改地图、生命、时间、分数、敌人或种子。',
    '当前runtime、源码与公开Toy证明3D联机已实现；旧game.json overview里仅2D联机的叙述已滞后，不作为本期事实依据。',
    '最多4人的范围由大厅UI与实现核验；本期只做双客户端实战，不宣称已做4人或真机手机压力验收。','']
for s in t['segments']:
    script.extend([f'## {s["id"]} / {s["final_in"]:.2f}–{s["final_out"]:.2f}s','',*s['lines'],''])
(W/'script.md').write_text('\n'.join(script), encoding='utf-8')
sources=['# 本期输入和复现入口','',
    f'网站：{web}',f'Toy：{toy}',f'Toy实际iframe：{entry["content_url"]}',
    f'公开Toy版本：{entry["version"]}；main.js SHA-256：{entry["main_sha256"]}；检查时间：{entry["checked_at"]}。',
    '录制三个原片及其运行JS哈希见 capture-index.json；详细原始读数保存在 tmp/capture-index-full.json。',
    'CDP第一轮GPU时间戳出现回退，最初错误夹住负时间造成片尾截断；正式版由 retime.py 依据原始帧落盘时间恢复接收时序，丢弃非递增帧。画面内容及原始音频未修改。',
    '接收／落盘时间不能等同GPU真实帧时刻，可能有几十毫秒误差。最终片尾、动作对应与字幕已抽查；游戏音效主观同步仍由最终听审确认。',
    '口播与字幕来自 narration.json 与 audio/shared-zh/*.json 的实际 Edge WordBoundary；时间轴与字幕工程在 edit/shared-zh。',
    '生产命令依次为 capture.cjs、retime.py、voice.py、render.py、covers.py、review_frames.py final、verify.py、package.py。',
    '录制脚本使用本机已有Playwright及Edge；FFmpeg/FFprobe在PATH，导出H.264 NVENC。',
    'TTS命令使用 D:/project/toolbasecamp/comfyui-api-server/.venv/Scripts/python.exe -X utf8 work/voice.py；未安装或改动共享环境。',
    '配音默认值已按2026-10-07用户要求修改 game-video SKILL.md、references/production.md 和 video-voice-tooling.md，经过技能校验。',
    '流量说明依据B站官方推荐说明： https://www.bilibili.com/blackboard/activity-gPIvOmhxbh.html 。声音工具更换不构成流量效果保证。',
    '官方AI内容说明参考： https://www.bilibili.com/opus/840812291428450327 。发布时以实际声明入口为准。',
    '活动台账2026-10-07 10:03已有相关部分检查：Toy活动已参加、无新增报名、任务进度1378/10000。此处仅读取台账，未当作全面检查。新片待人工审片，发片及用券检查在发布闭环继续。',
    ''
]
(W/'sources.md').write_text('\n'.join(sources), encoding='utf-8')
qa=['# 本期验收（bilibili-zh / shared-zh）','',f'最终SHA-256：{q["sha256"]}',
    f'时长 {q["duration"]:.2f}s；1920×1080；30fps；H.264 High/yuv420p/BT.709 tv；AAC双声道48kHz。',
    f'完整解码 pass；实测响度 {q["audio_measurement"]["input_i"]} LUFS，AAC实测真峰值 {q["audio_measurement"]["input_tp"]} dBTP。无数字削波。',
    '实际Edge WordBoundary字幕：时间非负、无重叠、未越成片长度，烧录字幕已抽查。',
    '画面抽查 pass：qa/final-contact.jpg、房间UI全尺寸、同局战斗和最终清关画面。没有错误黑场，结尾淡出。',
    '约50.02–52.05s静音为清关结果停留与下一段切换；约80.72–82.40s为末句后的停留与淡出，均为有意收尾。',
    '封面 pass：首页1440×1080 4:3、空间1920×1080 16:9；文字与双人实机一致；缩略图可辨主要文字。',
    '主观声音听审 not-run：未宣称已实际听审；请用户查看最终成片并检查中文人声可懂度、听感和音效同步。',
    '平台实际浮层、手机观看、投稿分区/话题/声明入口 not-run，投稿时核对；没有上传、发评论、绑定新视频或填表。',
    '人工批准 pending；ready_to_upload=false。仅B站中文版本是本期目标。','',
    '| 实战覆盖 | 源片段 | 成片片段 | 动作与结果 | 状态 |',
    '|---|---|---|---|---|',
    '| 建房和密码 | host 0–3.4 / 8–11.47s | 6.90–13.77s | 正常建房，6位码和可选密码 | pass |',
    '| 加入、准备、开始 | guest 6.3–10.8 / battle 0–3.6s | 13.77–21.87s | 另一客户端加入准备，房主开始 | pass |',
    '| 双人各控一辆 | battle 4.2–13.77s | 21.87–31.43s | 金1P、蓝2P，开火打通砖墙 | pass |',
    '| 阵亡与重返战斗 | battle 17.7–28.07s | 31.43–41.80s | 二号被击毁后重生，一号继续战斗 | pass |',
    '| 本关完整结果 | battle 106.8–116.67s | 41.80–51.67s | 最后击毁与本关20敌清完；基地未毁；结果牌标注同局实际结果 | pass |',
    '| 联机限制 | 实际大厅说明与coop.js | 51.67–60.30s | 不支持中途加入，房主退出结束 | pass（实现/文案核验） |',
    '| 公开试玩/投票 | Toy实际加载/投票页检查 | 60.30–82.40s | Toy可打开且大厅连接；投票和愿望入口；完整末句淡出 | pass |',
    '| 四人压力/手机真机 | 未录制 | 无 | 不作完成宣称 | not-run |','',
    '具体运行哈希、两客户端状态和自然进入下一关记录见 capture-index.json；不要把自动化窗口说成真人队友。',
    ''
]
(W/'qa.md').write_text('\n'.join(qa), encoding='utf-8')
q['visual_review']='pass: final contact sheet, full-size lobby UI and result/closing frames inspected'
write_json(W/'qa/verification.json',q)
render_q=read(W/'qa-render.json');render_q['status']='technical_and_visual_pass_pending_human_audio_review';write_json(W/'qa-render.json',render_q)
write_json(W/'run-state.json',{
    'task_id':'01a1140c-tank-online-video-20261007-w01','source':'Codex',
    'status':'waiting_for_user_final_review','production_complete':True,'human_approval':None,
    'game_version':entry['version'],'video_sha256':q['sha256'],'video_duration_seconds':q['duration'],
    'production_workspace':'D:/project/worktrees/tank-online-video-20261007',
    'durable_artifacts':'D:/project/task-artifacts/tank-online-video-20261007',
    'updated_at':datetime.now(timezone.utc).isoformat(),
    'publish_manifest':'publish/bilibili-zh/publish.json',
    'next_steps':['绑定用户针对该SHA-256的人工审片批准','核对登录UID16214353及实际投稿入口；共享账号锁','上传过审后核验公开BV、Toy绑定、置顶试玩评论','指定QQ日常推流表查重后填表并核验云端保存','维护上一条主要宣传视频新版引导，核对适用活动与免费流量券'],
    'promotion_application':{'status':'not_submitted','url':'https://docs.qq.com/sheet/DU3dnQkR1WG5RUnp0?tab=7mm8hw'},
    'publication':{'status':'not_uploaded','bvid':None},
    'limitations':['主观声音听审待用户','未做四人/手机真机压力测试','实际投稿条件发片时核对']
})
delivery='\n'.join([
    '唯一投稿材料目录：final/bilibili-zh/',
    f'中文横屏成片：gameplay-zh-final.mp4，{q["duration"]:.2f}秒，1920×1080，30fps，Edge云希正常语速；配音与烧录字幕。',
    '首页推荐封面：cover-home-4x3.jpg（1440×1080）',
    '个人空间封面：cover-space-16x9.jpg（1920×1080）',
    '投稿文案.txt：标题、标签、话题、简介、置顶评论。',
    f'成片SHA-256：{q["sha256"]}',
    '制作和技术检查已完成；主观听审及最终人工审片待用户；尚未上传。',
    '内部清单：work/publish/bilibili-zh/publish.json；验收：work/qa.md；续接：work/run-state.json。',
    '完整素材及工程保全：D:/project/task-artifacts/tank-online-video-20261007',
    ''
])
(W/'交付清单.txt').write_text(delivery,encoding='utf-8')
for key in ['video_file','cover_file','description_file']:
    assert (P/manifest[key]).resolve().is_file(),key
for c in cover_files.values():assert (P/c['file']).resolve().is_file()
assert '\n\n' not in description
print('Review package complete; hash',q['sha256'])

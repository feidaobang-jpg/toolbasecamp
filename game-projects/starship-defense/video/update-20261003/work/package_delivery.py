"""Rebuild metadata and publication copy for this completed local video package."""
from pathlib import Path
import json,hashlib,subprocess,shutil,datetime
R=Path(__file__).resolve().parent;F=R.parent/'final/bilibili-zh';P=R/'publish/bilibili-zh';P.mkdir(parents=True,exist_ok=True)
def write(p,s):p.write_text(s,encoding='utf-8')
def js(p,o):write(p,json.dumps(o,ensure_ascii=False,indent=2))
title='这次不只守城，我直接钻进虫洞反攻母皇！《虫潮围城》新版实战'
tags=['bilibilitoy','AI','虫潮围城','独立游戏','游戏开发','塔防','射击游戏']
topic={'name':'哔哩哔哩Toy创意挑战','url':'https://www.bilibili.com/v/topic/detail?topic_id=1346285','selected_on_platform':False}
toy='https://www.bilibili.com/toy/chongchao-qianshao/index.html';web='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html';vote='https://www.zhengxiaohui.cn/game-vote.html'
description=f'''《虫潮前哨》现在叫《虫潮围城》了。这期从打补给、换武器、布置机枪塔开始，带队打精英巢穴，再沿虫洞反攻母皇。击破母皇后回防，第一波守住，基地满血。

画面录于 2026 年 10 月 4 日凌晨，展示当时版本的电脑实战。游戏还在持续更新，试玩页面以实际版本为准。

哔哩哔哩 Toy 试玩：
{toy}
百宝箱试玩：
{web}

给这款投票、想玩哪款复刻：{vote} （百宝箱 → 游戏 → 自研游戏投票榜）'''
comment=f'''先打补给攒金币，再换装备；V 切视角，空格冲刺，靠近载具按 I 上车。你更喜欢留守建造，还是钻洞反攻母皇？
Toy 试玩：{toy}
给这款投票、想玩哪款复刻：{vote} （百宝箱 → 游戏 → 自研游戏投票榜）'''
txt=f'【标题】\n{title}\n\n【标签】\n'+ '\n'.join(tags)+f'\n\n【话题】\n{topic["name"]}\n{topic["url"]}\n\n【简介】\n{description}\n\n【置顶评论】\n{comment}\n'
(F/'投稿文案.txt').write_text(txt,encoding='utf-8-sig')
v=F/'gameplay-zh-final.mp4';probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(v)]));js(R/'qa/ffprobe.json',probe)
sha=hashlib.sha256(v.read_bytes()).hexdigest();duration=float(probe['format']['duration'])
version='2026-10-04 02:06 本地录制快照（深色界面与圆润虫族更新；非全功能介绍）'
issues=['人声主观听审尚未执行：已做实际语音转写、字幕对齐及客观响度检查，上传前需试听确认。']
prefix='../../../final/bilibili-zh/'
manifest=dict(variant_id='bilibili-zh',platform='bilibili',content_type='update_gameplay_introduction',language='zh-CN',game_name='虫潮围城',game_version=version,video_file=prefix+v.name,media_id='shared-zh',video_sha256=sha,width=1920,height=1080,duration_seconds=duration,title=title,description=description,tags=tags,topic=topic,pinned_comment_draft=comment,description_file=prefix+'投稿文案.txt',cover_file=prefix+'cover-home-4x3.jpg',cover_files={'home_4_3':{'file':prefix+'cover-home-4x3.jpg','width':1440,'height':1080,'purpose':'首页推荐（4:3）'},'space_16_9':{'file':prefix+'cover-space-16x9.jpg','width':1920,'height':1080,'purpose':'个人空间（16:9）'}},cover_text='这次，反攻母皇 / 虫潮围城 / 新版实机介绍',cover_upload_mode='custom_image',cover_selection_source='真实母皇战截图参考的AI封面重构；双比例独立构图',subtitle_mode='burned_in',category=None,copyright_type='original',development_model=None,credits='credits.txt',disclosures=['游戏实机由正常规则录制；解说为必剪曼波合成音色；封面使用AI生成。投稿时按实际内容设置AI声明。'],platform_requirements_checked_at='2026-10-04',platform_sources=[toy,web,vote,topic['url']],unverified_fields=['账号投稿入口与分类、话题当期资格须在实际投稿时核对；未登录投稿页','game.json development_model 为空，未猜测开发模型或添加模型标签'],blocking_issues=issues,ready_to_upload=False,uploaded=False)
js(P/'publish.json',manifest)
js(R/'publish.json',{'schema_version':2,'game_name':'虫潮围城','game_version':version,'requested_variants':['bilibili-zh'],'variants':[{'variant_id':'bilibili-zh','manifest_file':'publish/bilibili-zh/publish.json','ready_to_upload':False,'blocking_issues':issues}],'ready_to_upload':False})
write(P/'Toy推流申请.txt','UP主昵称 | 视频链接（BV长链） | tag与话题实际设置 | Toy链接是否置顶 | 视频中是否宣传Toy | 运营反馈\n待实际投稿核实 | 待投稿 | 文案已准备，尚未设置 | 尚未发布 | 是，成片约140秒 | 无\n旧视频保留，不用旧BV冒充本期BV。\n')
write(P/'credits.txt','游戏：用户项目虫潮围城，使用本地录制快照的原始运行画面、音乐及音效；具体资产授权沿用原项目记录，未据本任务扩张许可。\n解说：必剪内置 朗读→特色→曼波，正常语速；未克隆真人。仅本次B站视频。\n封面：OpenAI image generation，参考本期实机截图重构，分别生成4:3与16:9。\n字幕与尾卡字体：本机 Microsoft YaHei，渲染到视频；不分发字体文件。\n外加音乐：无。\n')
build=[]
for p in sorted((R/'build-current').rglob('*')):
 if p.is_file():build.append({'file':str(p.relative_to(R)).replace('\\','/'),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
js(R/'build-current-manifest.json',build)
audio=R/'audio/shared-zh'
js(audio/'voice.json',{'engine':'必剪桌面朗读','category':'特色','voice':'曼波','speed':1,'audio':'narration-mambo.mp3','duration_seconds':154.703688,'script':'../../narration.txt','asr':'asr-original.json','asr_provider':'Groq','asr_model':'whisper-large-v3','asr_docs':'https://console.groq.com/docs/speech-to-text','alignment':'../../edit/shared-zh/alignment.json','subjective_listening':'not-run','reason':'当前模型没有可接收音频的试听输入；未播放扬声器打扰用户。'})
covers=R/'edit/bilibili-zh/covers';covers.mkdir(parents=True,exist_ok=True)
generated=Path('C:/Users/37818/.codex/generated_images/01a10253-fd03-7921-9c6f-078998859150')
for s,n in [('exec-926305f7-fa51-4f65-8e72-369313a7c64a.png','home-original.png'),('exec-c475636f-1d8f-4bc3-af37-6bfadcabaf42.png','space-original.png')]:shutil.copy2(generated/s,covers/n)
js(covers/'design.json',{'copy':['这次，反攻母皇','虫潮围城','新版实机介绍'],'reference_frames':['../../../qa/cover-queen.png','../../../qa/queen-result.png'],'prompt_summary':'基于实机的低多边形母皇、护卫与绿色医疗兵；深色战场、金色大标题、青绿色游戏名；各画幅独立排版，保留游戏外观，不虚构写实玩法。','home_source':[1448,1086],'space_source':[1672,941],'home_output':[1440,1080],'space_output':[1920,1080],'processing':'等比缩放/不足处补边，JPEG高质量导出','ai_generated':True})
draft=Path('C:/Users/37818/Documents/Bcut Drafts/4A285FA2-A22B-4C7B-A480-E5243F7E7671')
latest=max(draft.glob('*.bjson'),key=lambda p:p.stat().st_mtime)
shutil.copy2(latest,R/'edit/shared-zh/bcut-voice-original.bjson')
write(R/'sources.md',f'''# 制作来源

- 成片版本：{version}。运行入口 `build-current/index.html` 和 `game.compat.js`，全部依赖哈希见 `build-current-manifest.json`。录制后源游戏继续更新，本片不冒称覆盖此后的每项功能。
- 实机：`capture/01-*` 至 `capture/12-*`。浏览器1920×1080实际渲染，CDP JPEG95逐帧按真实时间戳采集，原游戏音频经MediaRecorder记录；原片统一30fps。`qa=1`仅为读取状态与隔离云存档；每段最终状态的 `test` 都为 false，未改血量、金币、敌人或位置。行走、购买、任务、冲刺、上车均为普通玩家输入。
- 剪辑为同一局路线节选，加操作补拍；建造和雇佣顺序为便于讲解有所调整，未宣称无剪辑连续通关。开头有意前置母皇战精彩片段；战斗细节0.5倍慢放有画面标注。
- 录制日志内07的“上车/驾驶”和06的“队友对战母皇”是当时操作意图，实际未成功。剪辑以画面为准：07仅用作步行守城；实际载具镜头为08和12；母皇段不宣称队友到场。
- 原始字幕识别尝试：必剪两次没有产出，保留实际音频后用Groq Whisper large-v3转写。依据真实word时间戳修正专名和同音误识别，未按总时长均分。API说明：https://console.groq.com/docs/speech-to-text 。
- 语音、封面、字体、音效来源见 `publish/bilibili-zh/credits.txt`；图像原件与构图记录在 `edit/bilibili-zh/covers/`。无额外曲库音乐。
- `edit/shared-zh/render.py` 是可继续编辑的正式工程，依赖均相对于work目录；Windows本机字体与ffmpeg/Pillow为运行依赖。Bcut原始bjson只作语音生成来源记录，包含原机器路径；正式渲染无需Bcut草稿或临时缓存。
- Toy、网站与投票入口HTTP核验见 `qa/public-links.json`。话题来自用户技能约束，实际资格与投稿设置尚未核验；本任务未上传、发评论、绑Toy或改旧视频。
''')
write(R/'script.md','# 本期范围与解说终稿\n\n主题：从防守到主动反攻的新版实战路线。不是全部功能介绍，不逐项展示所有武器、载具和副本。旧视频保持原样。\n\n事实和源片段对应见 edit/shared-zh/timeline.json；全部解说字幕及实际语音时间见 alignment.json。\n\n'+(R/'narration.txt').read_text(encoding='utf8'))
write(R/'交付清单.txt',f'投稿材料唯一入口：../final/bilibili-zh/\n中文横屏 1920×1080 / 30fps / {duration:.2f}秒。\n已生成：gameplay-zh-final.mp4、cover-home-4x3.jpg、cover-space-16x9.jpg、投稿文案.txt。\n字幕已烧录，无需另传SRT。\n状态：文件制作完成；人声主观听审尚未执行，上传前请试听确认。未上传或发布，旧视频未修改。\n可编辑工程：edit/shared-zh/render.py 与 timeline.json。原片、干声、最终混音、ASS/SRT均保留。\n')
js(R/'run-state.json',{'status':'rendered_pending_subjective_audio_review','mode':'update','requested_variants':['bilibili-zh'],'files_complete':True,'subjective_audio_review':'not-run','next_step':'用户试听确认后，可另行授权投稿；本地剪辑可用render.py续改','render_entry':'edit/shared-zh/render.py','source_build':'build-current','video_sha256':sha,'cover_stage':'completed','uploaded':False})
print('Packaged',duration,sha)

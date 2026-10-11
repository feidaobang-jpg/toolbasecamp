"""Create the three platform review package from the final measured media.

This script writes local drafts only. It preserves approval and publication records.
"""
from pathlib import Path
import hashlib,json,datetime,html,re,sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
R=Path(__file__).resolve().parent; F=R.parent/'final'
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
TASK='01a127a5-4cda-7690-9d07-873303243176-battlefield-video-20261011'
EVENT=TASK+'-human-review-v1'
VARIANTS=['bilibili-zh','douyin-zh','youtube-zh']
SITE='https://www.zhengxiaohui.cn/games.html'
DIRECT='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html'
VOTE='https://www.zhengxiaohui.cn/game-vote.html'
TOY='https://www.bilibili.com/toy/chongchao-qianshao/index.html'
TITLE='只剩3票险胜！虫潮围城的据点争夺实战'
VERSION='deployed-08028efe'
T=json.loads((R/'edit/shared-zh/timeline.json').read_text(encoding='utf-8'))
QA=json.loads((R/'qa/final-technical.json').read_text(encoding='utf-8'))
CFG=json.loads((R/'narration.json').read_text(encoding='utf-8'))
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def write(p,obj):
 p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def txt(p,text):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text.strip()+'\n',encoding='utf-8-sig')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def stamp(t):return f'{int(t//60):02}:{t%60:05.2f}'
base='这场据点争夺最后3∶0险胜：我方击杀94，对方105。工程兵开坦克推进、阵亡后从已占据点部署、医疗兵回血，再守住通信站和补给仓库。'
bili_desc='\n'.join([base,
 f'百宝箱试玩（复制到浏览器打开）：{SITE} （选择虫潮围城 → 战地模式）',
 '操作：WASD移动，I登乘/下车，H兵种支援，U手雷；电脑默认自动瞄准、自动开火，可在设置中切换。',
 '战地据点模式由Codex辅助开发，本期展示真实实战。',
 f'投票／愿望单（复制到浏览器打开）：{VOTE} （百宝箱 → 游戏 → 自研游戏投票榜）'])
douyin_desc='\n'.join([base,'抢两个点就能持续扣敌方兵力票，追人也别丢了旗。',
 f'试玩：{SITE} （复制到浏览器，选择虫潮围城 → 战地模式）',
 f'玩法建议／愿望单：{VOTE}','战地据点模式由Codex辅助开发。'])
yt_desc='\n'.join([f'游戏试玩：{SITE}',
 '在列表选择「虫潮围城」，进入「战地模式」。地址不可点击时可复制到浏览器；游戏界面为中文。',
 base,'双方围绕旧镇、通信站、补给仓库争夺。控制两个据点，会持续消耗对方兵力票。',
 '本期中文解说，提供中文和英文可切换字幕。战地据点模式由Codex辅助开发。',
 f'玩法建议／愿望单：{VOTE}'])
en_title='Three Tickets Left! A Close Conquest Win in Swarm Siege'
en_desc='\n'.join([f'Play my games: {SITE}',
 'Choose 虫潮围城 (Swarm Siege) in the list, then 战地模式 (Battlefield mode). Copy the URL into your browser if needed. The game interface is in Chinese.',
 'We won this conquest match 3–0 on tickets, despite scoring 94 kills against the enemy team’s 105. This run shows a tank push, redeployment at a captured objective, Medic support, and the final defense of Comms Station and Supply Depot.',
 'Control two of the three objectives to drain the opposing team’s tickets. Chasing kills alone can still lose the match.',
 'Chinese narration with selectable Chinese and English subtitles. The conquest mode was developed with Codex assistance.',
 f'Game suggestions / wishlist: {VOTE}'])
tags={'bilibili-zh':['虫潮围城','据点争夺','战地模式','游戏开发','Codex','AI'],
 'douyin-zh':['虫潮围城','据点争夺','游戏开发','AI'],
 'youtube-zh':['虫潮围城','Swarm Siege','conquest','game development','Codex','AI']}
descs={'bilibili-zh':bili_desc,'douyin-zh':douyin_desc,'youtube-zh':yt_desc}
old_state=read(R/'run-state.json') if (R/'run-state.json').exists() else {}
review=old_state.get('human_review',{'status':'pending','approved_variants':[],
 'user_statement':None,'approved_at':None,'approval_event_id':EVENT})
review['reviewed_media_required']={v:sha(F/v/('gameplay-youtube-final.mp4' if v=='youtube-zh' else 'gameplay-zh-final.mp4')) for v in VARIANTS}
review['reviewed_subtitles_required']={l:sha(F/'youtube-zh'/f'captions-{l}.srt') for l in ['zh','en']}
items=[]
for v in VARIANTS:
 P=R/'publish'/v;P.mkdir(parents=True,exist_ok=True)
 name='gameplay-youtube-final.mp4' if v=='youtube-zh' else 'gameplay-zh-final.mp4'
 video=F/v/name
 assert any(x['sha256']==sha(video) for x in QA['reports'])
 prefix=f'../../../final/{v}/'
 public='【标题】\n'+TITLE+'\n\n【标签】\n'+'\n'.join(tags[v])+'\n\n【简介】\n'+descs[v]
 if v=='douyin-zh':public='【标题】\n'+TITLE+'\n\n【话题】\n'+' '.join('#'+x for x in tags[v])+'\n\n【简介】\n'+descs[v]
 txt(F/v/'投稿文案.txt',public)
 if v=='youtube-zh':txt(F/v/'English-localizations.txt','【Title (English)】\n'+en_title+'\n\n【Description (English)】\n'+en_desc)
 cover_names=[('home_4_3','cover-home-4x3.jpg','首页推荐 4:3'),('space_16_9','cover-space-16x9.jpg','个人空间 16:9')] if v=='bilibili-zh' else [('horizontal','cover-horizontal-16x9.jpg' if v=='douyin-zh' else 'cover-zh-16x9.jpg','横屏封面 16:9')]
 covers={}
 for key,file,purpose in cover_names:
  with Image.open(F/v/file) as im:w,h=im.size
  covers[key]={'file':prefix+file,'width':w,'height':h,'purpose':purpose,'sha256':sha(F/v/file)}
 subs=[{'file':prefix+f'captions-{l}.srt','language':'zh-CN' if l=='zh' else 'en',
 'purpose':'可切换字幕，需分别上传；不含烧录口播字幕','sha256':sha(F/v/f'captions-{l}.srt'),'required_for_upload':True} for l in ['zh','en']] if v=='youtube-zh' else []
 blockers=['人工审片待确认（画面、配音、字幕）','主观听审未运行：请在审片时核验人声清晰度与混音',
 '实际账号投稿入口、分类及平台声明待发布时核对']
 manifest={'schema_version':2,'variant_id':v,'platform':v.split('-')[0],
 'content_type':'真实游戏实战介绍','language':'zh-CN','audio_language':'zh-CN',
 'packaging_language':'zh-CN','game_name':'虫潮围城','game_version':VERSION,
 'metadata_version_label':'web-zerg-corpse-spinfix-v0.33.3（开始时资料，运行内容以现场资产哈希为准）',
 'video_file':prefix+name,'media_id':'youtube-zh-clean' if v=='youtube-zh' else 'shared-zh',
 'video_sha256':sha(video),'width':1920,'height':1080,'fps':30,'duration_seconds':T['duration'],
 'title':TITLE,'description':descs[v],'tags':tags[v],'description_file':prefix+'投稿文案.txt',
 'cover_file':next(iter(covers.values()))['file'],'cover_files':covers,
 'cover_text':['只剩3票','抢点险胜！','杀敌更少，也能赢？'],
 'cover_selection_source':'../../edit/covers/cover-source.json',
 'cover_upload_mode':'custom_image_prepared_pending_live_entry' if v=='douyin-zh' else 'custom_image',
 'subtitle_mode':'sidecar' if v=='youtube-zh' else 'burned_in','subtitles':subs,
 'category':None,'copyright_type':'original_self_recorded_gameplay_pending_account_confirmation',
 'credits_attachment':'credits.txt','disclosures':{'synthetic_narration':'Microsoft Edge TTS Yunxi; applicable platform declaration to verify at upload'},
 'platform_requirements_checked_at':NOW,
 'platform_sources':(['https://support.google.com/youtube/answer/1722171?hl=en'] if v=='youtube-zh' else []),
 'unverified_fields':['account login','current category options','platform synthetic-content declaration','live cover upload control'],
 'technical_preparation':'pass','human_review':review,'subjective_audio_listening':'not-run',
 'blocking_issues':blockers,'ready_to_upload':False,'publication_status':'not_uploaded'}
 if v=='youtube-zh':manifest['localizations']={'en':{'title':en_title,'description':en_desc,'file':prefix+'English-localizations.txt'}}
 if v=='bilibili-zh':
  manifest['toy']={'id':'38678478981120','slug':'chongchao-qianshao','entry_url':TOY,
   'cli_status':'published','visibility':'PUBLIC','public_runtime_verified':False,
   'public_page_observed_text':'该内容已下架','status_conflict':'CLI状态与匿名公开入口不一致，未据此断言平台后台已下架',
   'public_link_in_current_draft':False,'promotion_in_video':False,
   'binding_status':'not_bound_to_this_unpublished_video','topic_id':'1346285',
   'topic_url':'https://www.bilibili.com/v/topic/detail?topic_id=1346285',
   'topic_name':'哔哩哔哩Toy创意挑战','topic_status':'pending_public_entry_and_current_rules'}
  txt(P/'Toy推流申请.txt','UP主昵称：飞刀班长（历史UID 16214353，投稿时重核）\n视频链接：待人工审片及投稿后填写真实BV长链\n投稿tag是否加bilibilitoy&带话题：未投稿；本版以网站试玩为引导，Toy入口核验异常\n是否置顶Toy链接到评论区：未发布、未置顶\n是否视频中宣传Toy平台：否；网站入口已实测，Toy列表published但公开页面不可访问\n运营反馈：未申请\n后续：Toy公开入口恢复并实测后，再核对当期话题、绑定及申请资格；不填假“是”、不自动重发游戏包。')
  txt(P/'Toy恢复后待用文案.txt','【标签追加】\nbilibilitoy\n【话题】\n哔哩哔哩Toy创意挑战\nhttps://www.bilibili.com/v/topic/detail?topic_id=1346285\n【待核验试玩入口】\n'+TOY+'\n【待核验评论草稿】\n先抢两个点，别只顾追人。Toy入口公开可玩并核验后，在这里补同一完整试玩链接。你会先抢旧镇、通信站，还是补给仓库？\n投票／愿望单（复制到浏览器）：'+VOTE+' （百宝箱 → 游戏 → 自研游戏投票榜）')
 txt(P/'credits.txt','画面：本人网站虫潮围城的正常规则实机；本次自录，未复用历史成片。\n坦克镜头：另开一局补拍，成片已标记。主战局：1名玩家+7名普通电脑，另有战场NPC步兵与载具。\n音频：游戏运行时Web Audio音效+Microsoft Edge TTS zh-CN-YunxiNeural；未加入外部音乐，未模仿真人声音。\n封面：本次真实坦克截图、字体排版和色块；无生成角色/概念图。\n字体：本机Microsoft YaHei，仅渲染到视频和图片；未分发字体文件。\n未核验事项：发布入口的合成内容声明、账号分类与资格需投稿时核对。')
 write(P/'publish.json',manifest)
 items.append({'variant_id':v,'manifest_file':f'publish/{v}/publish.json',
 'ready_to_upload':False,'blocking_issues':blockers,'video_sha256':sha(video)})
write(R/'publish.json',{'schema_version':2,'game_name':'虫潮围城','game_version':VERSION,
 'requested_variants':VARIANTS,'variants':items,'ready_to_upload':False,
 'production_stage':'completed_pending_human_review','human_review':review,
 'post_publication':{'x':{'status':'skipped_paid_capability_not_requested','policy':'No paid X service; no X action in this production task'}}})
glossary={'虫潮围城':'Swarm Siege','战地模式':'Battlefield mode','据点争夺':'conquest',
 '兵力票':'tickets','旧镇':'Old Town','通信站':'Comms Station','补给仓库':'Supply Depot',
 '工程兵':'Engineer','医疗兵':'Medic','百宝箱':'Treasure Box website'}
write(R/'edit/glossary.json',glossary)
lines=['# 虫潮围城：战地模式·据点争夺','',
 '范围：一次普通4v4电脑战的实战过程，补一段坦克镜头；不是全兵种、全武器介绍。',
 '真实结果：03:45，蓝方3票、红方0票；击杀94:105。1名正常玩家席位+7名普通电脑，未宣称8名真人联机。',
 '片尾：本局结果、正面硬冲容易阵亡、下次兵种配合/侧翼夺点、已验证网站试玩与愿望单。',
 '游戏及素材不修改。没有开发耗时、未录到的Bug、虚构反馈、Steam或Toy可玩承诺。','',
 '| 成片时间 | 内容 | 中文口播终稿 |','| --- | --- | --- |']
for s in T['segments']:lines.append(f"| {stamp(s['start'])}—{stamp(s['end'])} | {s['id']} | {s['text']} |")
txt(R/'script.md','\n'.join(lines))
coverage=['# 实战与制作验收','',
 f'成片时长 {T["duration"]:.3f} 秒。客观技术检查：{QA["technical_checks"]}；审片状态 pending。',
 '共享中文烧录成片用于B站、抖音；YouTube另导出无口播烧录字幕成片，保留来源标记，附中英文SRT。',
 '主观听审 not-run：当前模型无法接收音频输入；不得据客观波形与字幕时标声称已经听过。请人工检查完整配音、读音及混音。','',
 '| 功能/内容 | 原片与时间范围 | 成片范围 | 实际动作与结果 | 验收 |','| --- | --- | --- | --- | --- |']
facts={'01-hook':'实际结尾预览与结算定格：3:0，非修改票数。','02-map':'HUD显示旧镇/通信站/补给仓库与兵力票。',
 '03-tickets':'两个及以上据点持续扣票；使用正常规则与HUD，互动约20秒。',
 '04-kit':'部署菜单选择工程兵，普通I键登乘坦克；显示补拍标记。',
 '05-tank':'另一次实战中坦克沿路行进，受到攻击后装甲下降，NPC步兵靠近据点。',
 '06-spawn':'主战局阵亡，从已占补给仓库重新部署，改选医疗兵。',
 '07-heal':'H医疗支援后血量回升，再进入仓库圈；不是无限血或重演。',
 '08-fight':'掩体交火、手雷投向路口，随后实际阵亡；没有声称手雷击杀。',
 '09-finish':'末段控制B/C，红方归零；蓝方保留3票。',
 '10-result':'真实成绩页定格，94:105击杀、3:0兵力票；字幕移至右侧避开成绩表。',
 '11-close':'实战复盘和网站试玩/愿望单，结尾语音完整并有阅读停留。'}
for s in T['shots']:
 coverage.append(f"| {s['segment']} | {s['source']} {s['source_in']:.2f}—{s['source_out']:.2f}秒（{'定格' if s['still'] else '原速'}） | {stamp(s['start'])}—{stamp(s['end'])} | {facts[s['segment']]} | pass：源证据与代表帧 |")
coverage+=['','客观验收证据：qa/final-technical.json、qa/frame-index.json、edit/shared-zh/timeline.json。',
 '画面：检查各段起点/中点、HUD、实际结算、完整结尾和320像素封面缩略图；记录在qa/visual-review.json。未将静帧检查称为完整动态播放听审。',
 '字幕：中文与真实TTS WordBoundary对齐，英文逐语义句校对，共用真实时轴；字体位置避开主要HUD，英文SRT可切换，不伪称英语配音。',
 f'结尾最后字幕到视频结束保留 {QA["tail_reading_margin_seconds"]:.2f} 秒。',
 '技术：全文件解码、H.264 1080p yuv420p BT.709、AAC 48kHz双声道、字幕顺序与范围、共享中文哈希、封面比例/尺寸均通过。原片约9–13fps，按真实时间戳转为30fps输出，无补帧或加速声明。',
 '音频：双遍-16 LUFS规范化、游戏音效在人声时压低；AAC响度和峰值见报告；未加入外部音乐。完整主观听审待人工。',
 '平台：YouTube官方编码建议已查；B站/抖音投稿页登录、实际分类、声明、封面控件、各平台浮层与手机可读性待投稿时核对，未宣称真机验收。',
 'Toy：CLI mylist返回published/PUBLIC，匿名Playwright及Codex内置浏览器公开入口均显示“该内容已下架”；未断言平台后台状态变更。本版片尾和公开文案只引导已实测的网站，Toy绑定/话题/申请尚未执行。',
 '未运行/未覆盖：工程兵维修、全8种武器、直升机/吉普/装甲车逐项演示、真人联机和手机多指；本期没有相关全功能承诺。',
 '历史比较：上一期wish-versus-20261008为旧银行/塔防玩法；本期全部重新录制，未挪用旧玩法成片。',
 '最终上传门槛：人工审片（画面、完整配音、字幕）、当前账号入口及声明核对。未上传、未投稿、未发布、未申请推流。']
txt(R/'qa.md','\n'.join(coverage))
txt(R/'sources.md','\n'.join(['# 来源与续接','',
 f'录制入口：{DIRECT}?qa=1；只读QA观察，不修改游戏状态或难度，正常键鼠操作、默认自动瞄准/自动开火。',
 '运行构建：deployed-08028efe；入口和脚本SHA-256见capture/match-01/build.json、qa/public-sources.json。开始工作区HEAD 29f7f12d08df43feb99d99651613ba2423d73030；网站产物比该快照更新，不将两者混称同一构建。',
 '原片：capture/match-01/01-opening/raw.mp4、02-battle/raw.mp4；补拍capture/vehicle-02/01-opening/raw.mp4。session.json保存真实动作与观察，capture.json保留JPEG截图真实时间戳，capture-receipts.json保存精简事件和结果。',
 '录屏停启之间主战局时间继续前进，存在约150—192秒游戏时间缺口；本期按片段剪辑，未宣称无剪辑全局录像。所有运动镜头原速，结算页使用真实截图定格。',
 'game.json开发记录为Codex（抗战战役、战地据点模式），精确模型版本未知；公开不写Claude或具体GPT型号。',
 '游戏资源来自实际部署的程序化3D场景；未添加外部摄影、角色图或生成动画。封面为此次坦克截图与排版，见edit/covers/cover-source.json。',
 '音轨：本次Web Audio游戏音效和Edge TTS Yunxi普通语速，保存分段MP3、WordBoundary JSON、PCM干声与混音。没有外部BGM，未调用本地模型服务器。',
 '字体：本机Microsoft YaHei，未分发字体文件。未将未经确认的权利或平台投稿声明记为已核验。',
 '渲染：voice.py → index_shots.py → render.py → covers.py → verify_video.py / extract_review.py → package.py。脚本路径相对work，不需要剪辑软件原生工程。',
 'Python依赖edge_tts、Pillow；FFmpeg/ffprobe PATH，h264_nvenc；采集Playwright依赖位置见capture.cjs。',
 '交付只包含本次制作；没有修改游戏、提交Toy游戏包、更新旧稿或创建任何定时任务。']))
delivery=['虫潮围城｜战地模式·据点争夺｜三平台审片包',
 f'标题：{TITLE}',f'时长：{T["duration"]:.3f}秒；1920×1080，16:9横屏，30fps输出。',
 '制作完成；画面、完整配音、字幕待人工审片。审片通过前不上传。','']
for v in VARIANTS:
 name='gameplay-youtube-final.mp4' if v=='youtube-zh' else 'gameplay-zh-final.mp4'
 delivery.extend([v,'音轨：中文；包装：中文'+('，附英文标题/简介翻译字段' if v=='youtube-zh' else ''),
 '字幕：'+('中文/英文SRT可切换，需上传两份；视频未烧录口播字幕' if v=='youtube-zh' else '中文烧录字幕'),
 f'成片：../final/{v}/{name}',f'文案：../final/{v}/投稿文案.txt',
 '封面：'+('首页4:3 cover-home-4x3.jpg；空间16:9 cover-space-16x9.jpg' if v=='bilibili-zh' else '16:9 '+('cover-horizontal-16x9.jpg（抖音实际上传控件待核验）' if v=='douyin-zh' else 'cover-zh-16x9.jpg')),
 f'投稿清单：publish/{v}/publish.json','状态：未上传；待人工审片及投稿入口核对。',''])
delivery.extend(['B站与抖音共用相同视频内容和哈希；YouTube无口播烧录字幕版另验收。',
 '主观听审未运行；请完整听一遍，检查音量、读音、字幕和结尾。',
 'Toy：后台列表published，但公开入口显示不可访问；本版使用网站试玩引导，未绑定新视频、未参加Toy话题或提交推流申请。',
 '审批哈希和EventId：run-state.json；确认通过后按已批准哈希继续三平台发布，不自动发片。',
 '本地预览：review/index.html（选择B站/抖音或YouTube，YouTube可切换中英字幕）。'])
txt(R/'交付清单.txt','\n'.join(delivery))
review_dir=R/'review';review_dir.mkdir(exist_ok=True)
for lang in ['zh','en']:
 s=(F/'youtube-zh'/f'captions-{lang}.srt').read_text(encoding='utf-8')
 s=re.sub(r'(\d{2}:\d{2}:\d{2}),(\d{3})',r'\1.\2',s)
 (review_dir/f'captions-{lang}.vtt').write_text('WEBVTT\n\n'+s,encoding='utf-8')
doc='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>虫潮据点争夺 · 审片</title>
<style>body{margin:0;background:#0c1723;color:#e3edf2;font:17px/1.6 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1160px;margin:auto;padding:24px}h1{font-size:28px;color:#fff0b3}video{width:100%;background:black}button,a{color:#76e0ce}button{background:#183944;border:1px solid #76e0ce;padding:10px 18px;border-radius:8px;cursor:pointer;margin:0 10px 14px 0}.meta{color:#b5c6d1}img{width:360px;max-width:100%}.box{padding:18px;background:#162633;border-radius:10px;margin-top:18px}a{overflow-wrap:anywhere}</style>
<main><h1>只剩3票险胜！虫潮围城的据点争夺实战</h1>
<p class="meta">中文解说 · 1080p横屏 · DURATION · 三平台制作包 · 待人工审片</p>
<button onclick="select('shared')">B站 / 抖音（烧录中文）</button><button onclick="select('youtube')">YouTube（中英可切换字幕）</button>
<video id="player" controls preload="metadata" poster="../../final/bilibili-zh/cover-space-16x9.jpg"><source src="../../final/bilibili-zh/gameplay-zh-final.mp4" type="video/mp4"></video>
<div class="box"><strong>请完整看、听一遍：</strong>画面与解说是否对应，配音是否清晰，字幕及结尾是否合适。YouTube再核对英文字幕。审片通过前不上传。</div>
<div class="box"><p>主战局普通4v4电脑战，1名玩家席位+7名电脑；最后3∶0险胜。坦克镜头来自另一局补拍，已标注。</p><p>Toy列表返回published，但公开入口显示不可访问。本版引导已实测的网站。</p><p><a href="../交付清单.txt">三平台交付清单</a> · <a href="../../final/bilibili-zh/投稿文案.txt">B站文案</a> · <a href="../../final/douyin-zh/投稿文案.txt">抖音文案</a> · <a href="../../final/youtube-zh/投稿文案.txt">YouTube文案</a></p><img src="../../final/bilibili-zh/cover-home-4x3.jpg" alt="首页4:3封面"></div>
<script>const cc=CAPTION_DATA;let urls=[];function select(v){const p=document.getElementById('player');p.pause();urls.forEach(u=>URL.revokeObjectURL(u));urls=[];const tracks=Object.entries(cc).map(([l,s])=>{const u=URL.createObjectURL(new Blob([s],{type:'text/vtt'}));urls.push(u);return '<track kind="subtitles" src="'+u+'" srclang="'+l+'" label="'+(l==='zh'?'中文':'English')+'" '+(l==='zh'?'default':'')+'>';}).join('');p.innerHTML=v==='youtube'?'<source src="../../final/youtube-zh/gameplay-youtube-final.mp4" type="video/mp4">'+tracks:'<source src="../../final/bilibili-zh/gameplay-zh-final.mp4" type="video/mp4">';p.load();}</script></main></html>'''
caption_data={l:(review_dir/f'captions-{l}.vtt').read_text(encoding='utf-8') for l in ['zh','en']}
(review_dir/'index.html').write_text(doc.replace('DURATION',f'{T["duration"]:.2f}秒').replace('CAPTION_DATA',json.dumps(caption_data,ensure_ascii=False)),encoding='utf-8')
state={**old_state,'task_id':TASK,'source':'Codex','title':TITLE,'project_path':str(R.parent),
 'mode':'实战介绍：战地模式据点争夺','requested_variants':VARIANTS,
 'stage':'waiting_for_user','production_stage':'completed_pending_human_review',
 'human_review':review,'game_version':VERSION,'source_capture':'current deployed website; exact hashes retained',
 'branch':'codex/conquest-video-20261011','original_worktree':str(R.parents[4]),
 'toolchain':['Playwright Chromium screencast','Web Audio MediaRecorder','Edge TTS Yunxi','FFmpeg NVENC','Pillow'],
 'cover_stage':'completed','render_entrypoint':'render.py','updated_at':NOW,
 'next_step':'用户人工审片三平台版本和中英字幕，确认后按审批哈希继续发布；先核对真实投稿入口与Toy异常，不接管游戏发布待办。',
 'publication_status':{v:'not_uploaded' for v in VARIANTS},'notification':old_state.get('notification',{'approval_event_id':EVENT,'needs_user_status':'pending'})}
write(R/'run-state.json',state)
for item in items:
 p=R/item['manifest_file'];m=read(p);parent=p.parent
 for key in ['video_file','description_file','cover_file']:assert (parent/m[key]).resolve().is_file(),key
 for s in m['subtitles']:assert sha((parent/s['file']).resolve())==s['sha256']
 assert '\n\n' not in m['description']
 assert not set(tags['bilibili-zh'])&{'3D游戏','网页游戏','童年游戏','万物皆可游戏','动作游戏','AI辅助开发'}
 assert m['video_sha256']==sha((parent/m['video_file']).resolve())
write(R/'qa/package-checks.json',{'at':NOW,'references':'pass','video_hashes':'pass','subtitle_hashes':'pass',
 'platform_text_manifest_match':'pass','bilibili_forbidden_tags':'pass','public_descriptions_no_empty_lines':'pass',
 'toy_link_not_claimed_playable':'pass','human_review':'pending','requested_variants':VARIANTS})
print('PACKAGE COMPLETE',round(T['duration'],3),'seconds; three variants; human review pending')

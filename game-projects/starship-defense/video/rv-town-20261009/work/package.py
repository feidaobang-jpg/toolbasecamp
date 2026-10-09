"""Create the complete review package and validate portable upload references."""
from pathlib import Path
import json,hashlib,datetime,re,html
from PIL import Image
R=Path(__file__).resolve().parent;F=R.parent/'final';P=R/'publish';P.mkdir(exist_ok=True)
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def write(p,obj):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def text(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s.rstrip()+'\n',encoding='utf-8')
t=read(R/'edit/shared-zh/timeline.json');cap=read(R/'capture/journey-02/capture.json');old=read(R/'run-state.json');qa=read(R/'qa/final-technical.json')
assert all(c['pass'] for c in qa['checks'])
toy='https://www.bilibili.com/toy/chongchao-qianshao/index.html';vote='https://www.zhengxiaohui.cn/game-vote.html';site='https://www.zhengxiaohui.cn/games.html'
title='开房车进僵尸城搜物资，我能活着回来吗？｜虫潮围城'
bdesc=f'虫潮围城房车模式：开进废弃城镇，升级车顶机枪、搜索物资、维修，再找路撤离。这趟搜了2/6区，击退12只僵尸，带回314零件。\nToy试玩：{toy}\n进入游戏后选择“房车生存”；WASD驾驶/移动，J射击，I上下车/搜索，O地图与设施。\n房车城镇玩法由Codex辅助开发，本期展示实际试玩。\n投票／愿望单（复制到浏览器打开）：{vote}，百宝箱 → 游戏 → 自研游戏投票榜。'
comment=f'先选“房车生存”，在修理厂改装、加油站补油，再去感染区下车搜物资。你会先升级机枪，还是先加装甲？\nToy试玩：{toy}\n投票／愿望单（复制到浏览器打开）：{vote}，百宝箱 → 游戏 → 自研游戏投票榜。'
ddesc='开房车进僵尸城，边搜物资边找退路。这趟带回314零件，下次挑战搜全六区。\n#虫潮围城 #房车生存 #游戏开发 #AI'
ydesc=f'游戏试玩：{site}\n在列表选择“虫潮围城”，进入游戏后选择“房车生存”。链接不能点击时可复制到浏览器打开。\n这回开房车探索废弃城镇：改装、补油、搜索、维修，最后带回314零件。六个区域还没搜全，下次挑战全搜路线。\n房车城镇玩法由Codex辅助开发。你会先改枪，还是先加装甲？\n可在百宝箱“游戏 → 自研游戏投票榜”填写想玩的内容。'
entitle='Driving an RV into a zombie town: can I bring the supplies back? | Swarm Siege'
endesc=f'Play my games: {site}\nChoose 虫潮围城 (Swarm Siege) from the list, then 房车生存 (RV survival). The game menus are currently in Chinese. Copy the address into your browser if it is not clickable.\nI drive into an abandoned town, upgrade the roof gun, refuel, search for supplies, repair the RV and evacuate with 314 scrap. Next time I will try all six districts.\nThe RV town gameplay was developed with Codex assistance. Would you upgrade the gun or add armor first? You can suggest game ideas through the voting page linked from the game list.\nChinese narration with selectable Chinese and English subtitles.'
tags=['虫潮围城','房车生存','僵尸生存','游戏开发','AI','bilibilitoy']
topic={'name':'哔哩哔哩Toy创意挑战','url':'https://www.bilibili.com/v/topic/detail?topic_id=1346285','selected':False,'status':'draft; verify current rules and select during approved submission'}
text(F/'bilibili-zh/投稿文案.txt','【标题】\n'+title+'\n【标签】\n'+'\n'.join(tags)+'\n【话题】\n'+topic['name']+'\n'+topic['url']+'\n【简介】\n'+bdesc+'\n【置顶评论】\n'+comment)
text(F/'douyin-zh/投稿文案.txt','【标题】\n'+title+'\n【说明】\n'+ddesc)
text(F/'youtube-zh/投稿文案.txt','【标题】\n'+title+'\n【简介】\n'+ydesc+'\n【标签】\n虫潮围城\n房车生存\n游戏开发\nAI')
text(F/'youtube-zh/English-localizations.txt','【English title】\n'+entitle+'\n【English description】\n'+endesc)
text(P/'bilibili-zh/Toy推流申请.txt','UP主昵称：飞刀班长（UID 16214353）\n视频长链：待审片及投稿后填真实BV长链\n投稿tag与话题：草稿已含bilibilitoy、哔哩哔哩Toy创意挑战；实际投稿未执行\n置顶Toy链接：草稿已完成；未发布、未置顶\n视频宣传Toy：片尾有试玩提示；绑定入口需发布后核验\n运营反馈：未申请、无回执\n合集：虫潮围城开发实录，season_id 9248439；待发布过审后加入\nToy ID：38678478981120；待真实BV公开后绑定并核验')
block=['人声可懂度与混音主观听审尚未执行；请用户审片','本期最终文件尚未经用户人工审片批准','本轮不执行上传；其他渠道暂缓','当前账号投稿页的分类、封面入口及声明选项须在获准发布时重读']
sources=[{'url':'https://support.google.com/youtube/answer/72431?hl=zh-Hans','checked_at':'2026-10-09','scope':'官方封面格式和16:9建议'}, {'url':'https://support.google.com/youtube/answer/2734796?hl=zh-Hans','checked_at':'2026-10-09','scope':'官方字幕文件上传流程'}]
variants=[]
for v,platform,filename,desc in [('bilibili-zh','Bilibili','gameplay-zh-final.mp4',bdesc),('douyin-zh','Douyin','gameplay-zh-final.mp4',ddesc),('youtube-zh','YouTube','gameplay-youtube-final.mp4',ydesc)]:
 base=P/v;base.mkdir(exist_ok=True);prefix=f'../../../final/{v}/';video=F/v/filename
 if v=='bilibili-zh':covers={'home_4_3':{'file':prefix+'cover-home-4x3.jpg','width':1440,'height':1080,'purpose':'首页推荐'},'space_16_9':{'file':prefix+'cover-space-16x9.jpg','width':1920,'height':1080,'purpose':'个人空间'}}
 else:
  cname='cover-reference-16x9.jpg' if v=='douyin-zh' else 'cover-zh-16x9.jpg';covers={'main':{'file':prefix+cname,'width':1920,'height':1080,'purpose':'选帧构图参考，上传入口待核' if v=='douyin-zh' else '中文缩略图'}}
 for c in covers.values():
  cp=base/c['file'];assert cp.exists();assert Image.open(cp).size==(c['width'],c['height']);c['sha256']=sha(cp)
 subs=[]
 if v=='youtube-zh':
  for lang in ['zh','en']:
   sp=F/v/f'captions-{lang}.srt';subs.append({'file':prefix+sp.name,'language':lang,'purpose':'可切换字幕','sha256':sha(sp),'required_for_upload':True})
 manifest={'schema_version':2,'variant_id':v,'platform':platform,'content_type':'gameplay update','language':'zh-CN','audio_language':'zh-CN','packaging_language':'zh-CN','game_name':'虫潮围城','game_version':old['game_version'],'video_file':prefix+filename,'media_id':'youtube-clean-zh' if v=='youtube-zh' else 'shared-zh','video_sha256':sha(video),'width':1920,'height':1080,'duration_seconds':t['duration'],'fps':30,'title':title,'description':desc,'tags':tags if v=='bilibili-zh' else ['虫潮围城','房车生存','游戏开发','AI'],'description_file':prefix+'投稿文案.txt','cover_file':next(iter(covers.values()))['file'],'cover_files':covers,'cover_text':'开房车 / 进僵尸城 / 能完整撤出来吗？','cover_selection_source':'同版本正常规则实机第一场96秒，原片与帧保存在work；正文使用补录第二场','cover_upload_mode':'select_frame_reference_pending_current_entry_check' if v=='douyin-zh' else 'image_file_pending_current_entry_check','subtitle_mode':'sidecar' if v=='youtube-zh' else 'burned_in','subtitles':subs,'category':None,'copyright_type':'original creator gameplay; account selection pending','credits':'../../sources.md','disclosures':{'AI_generated_narration':True,'voice':'Edge-TTS zh-CN-YunxiNeural +0%','voice_clone':False,'AI_assisted_game_development':True,'exact_game_development_model':'unverified for RV town; do not reuse versus-only model attribution','setting_status':'recheck platform-specific declaration at submission'},'platform_requirements_checked_at':now if v=='youtube-zh' else None,'platform_sources':sources if v=='youtube-zh' else [],'unverified_fields':['当前投稿入口、账号权限、分类与声明设置','真实公开页面的封面和字幕可用性'],'blocking_issues':block,'ready_to_review':True,'ready_to_upload':False,'human_review':{'status':'pending','approved_sha256':None},'publication':{'status':'not_uploaded','id':None,'url':None}}
 if v=='bilibili-zh':manifest.update({'topic':topic,'pinned_comment_draft':comment,'toy_id':'38678478981120','toy_url':toy,'season_id':9248439,'topic_verification':'按用户指定话题准备草稿，未报名'})
 if v=='youtube-zh':manifest.update({'english_localizations':{'title':entitle,'description':endesc,'file':prefix+'English-localizations.txt'},'audio_review':'objective signal checks passed; subjective listening not-run'})
 write(base/'publish.json',manifest);variants.append({'variant_id':v,'manifest_file':f'publish/{v}/publish.json','ready_to_review':True,'ready_to_upload':False,'video_sha256':manifest['video_sha256'],'blocking_issues':block})
write(R/'publish.json',{'schema_version':2,'game_name':'虫潮围城','game_version':old['game_version'],'requested_variants':[x['variant_id'] for x in variants],'variants':variants,'ready_to_review':True,'ready_to_upload':False,'human_review':'pending','publication':'not_uploaded','post_publication':{'x':'not requested; no action'},'channel_restriction':old['publication_restriction']})
write(R/'publication-result.json',{'schema_version':2,'status':'not_uploaded','human_review':'pending','approval_event_id':old['approval_event_id'],'platforms':{v['variant_id']:{'status':'not_uploaded','id':None,'url':None} for v in variants},'user_instruction':'今天的修改先同步发布到toy，其他平台先不发；新片先交审片','updated_at':now})
write(R/'edit/glossary.json',{'虫潮围城':'Swarm Siege','零件':'scrap','耐久':'durability','医疗包':'medkit','房车生存':'RV survival','感染区':'infected district','罐头':'canned food','车顶机枪':'roof-mounted machine gun'})
table='\n'.join(f'| {s["segment"]} | {s["start"]:.2f}–{s["end"]:.2f} | {s["source_in"]:.2f}–{s["source_out"]:.2f} | {s["label"] or "短尾卡"} |' for s in t['shots'])
narration='\n\n'.join(f'{s["id"]}（{s["start"]:.2f}–{s["end"]:.2f}秒）：{s["text"]}' for s in t['segments'])
text(R/'script.md',f'# 房车进僵尸城：本期终稿\n\n版本：{old["game_version"]}；源提交 {old["source_commit"]}。本期为房车城镇更新主题，非全游戏功能介绍。\n\n实机事实：机枪一级90零件/停车5秒；加油20零件/3秒；下车搜索4秒，110零件+罐头+医疗包；买罐头12零件；修车40零件/6秒；六个区域可自选；本趟实际搜索2区、击退12只、314零件、完整撤离。\n\n{narration}\n\n| 镜头 | 成片秒数 | 原片秒数 | 内容 |\n| --- | --- | --- | --- |\n{table}\n\n全部动态图取第二场原片，正常速度。开头4.1秒标“本趟实战预览”；末段撤离余镜有标签。仅真实结算屏保持供读数，尾卡2.27秒。中文与英译对应同一真实语音边界。')
duration=cap['frames'][-1]['timestamp']-cap['frames'][0]['timestamp'];avg=len(cap['frames'])/duration
fields=['active','over','state','testMode','elapsed','x','z','px','pz','hp','max','person','personMax','inVehicle','scrap','fuel','gun','looted','defeated','food','medkits','search','job','interaction','result']
for take in ['journey-01','journey-02']:
 original=read(R/f'capture/{take}/capture.json');compact={k:v for k,v in original.items() if k not in ['frames','states','events','finalState']}
 compact['events']=[{'name':row['name'],'t':row['t'],'state':{k:row['state'][k] for k in fields if k in row['state']}} for row in original['events']]
 compact['finalState']={k:original['finalState'][k] for k in fields if k in original['finalState']}
 compact.update({'frame_count':len(original['frames']),'capture_duration_seconds':original['frames'][-1]['timestamp']-original['frames'][0]['timestamp'],'raw_capture_record':'capture.json','raw_capture_sha256':sha(R/f'capture/{take}/capture.json')})
 write(R/f'capture/{take}/manifest.json',compact)
for logfile in (R/'qa').glob('*-signal-scan.txt'):
 text(logfile,'\n'.join(line.rstrip() for line in logfile.read_text(encoding='utf-8').splitlines()))
text(R/'sources.md',f'# 来源与可重建工程\n\n本期游戏源提交 {old["source_commit"]}；runtime SHA-256 {old["runtime_sha256"]}。录制构建来自该提交，未改玩法。第二场实机正常规则成功，{cap["finalState"]["result"]}\n\nPlaywright在后台Edge运行原游戏，使用正常键盘/鼠标；QA接口只读位置和结果供路线与证据使用，testMode=false、difficulty=normal，无传送、修改血量/零件、时间缩放或无敌。CDP原生1920×1080采集，3991帧，实际平均{avg:.2f}帧/秒。输出30fps沿真实时间戳重复帧，无补帧或速度改变，不宣称60fps录像。\n\n正文取work/capture/journey-02/raw.mp4；封面来自同版本第一场96秒实际帧，保留在edit/covers/gameplay-source.jpg。第一场人物被车辆遮挡，因此正文改用第二场；历史剪辑留在history/review-v1，不是本期投稿入口。封面只做真实帧裁切和设计排版，无生成游戏内容。\n\n声音：原游戏WebAudio合成音效，无外部音乐。解说由本机已有Edge-TTS接口生成，zh-CN-YunxiNeural、+0%，无真人声音克隆。逐段MP3、真实WordBoundary JSON、PCM干声和混音保存在audio/shared-zh。字体调用本机Microsoft YaHei，不分发字体文件；未增加外部素材署名义务，平台许可/声明选项发布时再核。\n\n已验证RV城镇开发工具为Codex；game.json中的Claude Opus 5.5只指旧对战模式，不能作为本期RV开发模型。公开文案使用已确认工具名，精确模型尚未核对。\n\nrender.py、covers.py、voice.py、encode_capture.py、verify.py、package.py使用相对于work的媒体路径。capture.cjs重录需放回对应仓库并提供本机Playwright；不会在复制出的交付目录误启动游戏。实际剪辑可直接在交付目录从保留的原片和音轨重建，依赖FFmpeg/ffprobe、Python/Pillow及已安装中文字体。Edge-TTS只在重做配音时联网。\n\n当前制作完成、人工审片待定。客观音频验证不能代替人声可懂度与混音听感审查。')
text(R/'qa.md',f'# 本期审片包验收\n\n{now}。目标三版制作完成、可审片；均未上传。ready_to_upload=false。\n\n| 检查 | 结果 | 证据/限制 |\n| --- | --- | --- |\n| 正常规则实机与结果 | pass | 第二场capture记录，2/6区、12只、314零件，无脚本报错 |\n| 配音与中文字幕时间 | pass | 真实WordBoundary；全文归一化逐字匹配，{len(t["subtitles"])}条中英一对一时间码 |\n| 英译内容 | pass | 七/十二、90/110/12/40零件及时间与原音一致；术语见glossary.json |\n| 画面与动作 | pass | final-contact-sheet及原生代表帧；两次人物下车可见，维修和成功结算可见 |\n| 1080p、完整解码、响度峰值 | pass | final-technical.json与两版loudness记录；约-16 LUFS，峰值约-1 dBTP |\n| 黑屏与尾音 | pass | 完整signal-scan；最后话音后留2秒以上，1.5秒淡出，无意外黑场 |\n| 主观人声、混音听审 | not-run | 模型没有音频输入；用户最终审片需听人声和混音 |\n| B站双封面 | pass | 1440×1080、1920×1080，实测比例与缩略图检查，来源为同版本第一场实机 |\n| 当前投稿页与手机平台浮层 | not-run | 本轮仅制作，发布获准后读实际入口并预览，不声称真机/公开验收 |\n| 文案链接与禁用标签 | pass | Toy链接含/index.html；各简介/评论单独不重复URL，无空白段；未用禁用标签 |\n| 活动/评论/绑定/推流 | not-run | 草稿完成，未上传、未参加话题、未评论、未申请推流 |\n\n两份唯一电影：B站/抖音共用同一中文烧录字幕哈希；YouTube中文人声+场景标签，另附中英可切换SRT。翻译字幕是中文音轨对应翻译，不冒充英文配音版。\n\n{table}\n\n本期只介绍RV自由城镇一次搜两区路线；基地队友指挥、其他模式和六区全搜不在本期范围。场内手雷、枪械切换和医疗消耗未宣称演示。结尾下次全搜只是挑战计划。\n\n官方YouTube封面与字幕帮助于2026-10-09已查，链接保存于平台清单；B站/抖音当前账号入口留待获准发布时核对。封面尺寸、文件存在与相对引用由package.py实测。')
old.update({'stage':'production_completed_awaiting_human_review','production_completed_at':now,'capture_result':cap['finalState']['result'],'capture_errors':cap['errors'],'visual_issue_resolved':True,'final_duration_seconds':t['duration'],'ready_to_review':True,'ready_to_upload':False,'human_review':'pending','artifact_directory':'D:/project/toolbasecamp-artifacts/chongchao-rv-town-20261009','source_worktree':str(R.parents[4]),'render_entry':'render.py','packaging_entry':'package.py','next_step':'用户在原聊天审本期最终文件，包含主观听感；按批准的渠道继续。未取得批准不得上传。','variants':variants,'cover_stage':'completed','audio_review':'objective signal checks passed; subjective listening not-run'});write(R/'run-state.json',old)
lines=['虫潮围城 · 房车城镇审片包','画幅1920×1080，30fps，时长1分49.87秒。中文人声云希正常语速。','B站/抖音：同一完整中文烧录字幕片，复制成两目录便于投稿。','B站 final/bilibili-zh/：gameplay-zh-final.mp4、首页4:3封面、空间16:9封面、投稿文案.txt。','抖音 final/douyin-zh/：gameplay-zh-final.mp4、16:9封面参考、投稿文案.txt。封面入口待发布时确认。','YouTube final/youtube-zh/：gameplay-youtube-final.mp4、中文16:9封面、投稿文案.txt、英文元数据TXT、中英SRT。','YouTube保持中文音轨；需一并上传两个SRT，播放器可切换。','状态：三版制作完成、待人工审片；所有视频尚未上传。音频客观检查通过，主观听审未执行。','其他渠道先不发的限制持续有效。','review/index.html提供两个唯一完整电影的本地播放器与封面，无自动播放。','work/保存原片、声音、字幕、脚本、工程、清单、QA与历史版本，可续接编辑。','电影SHA-256：']+[f'{v["variant_id"]}: {v["video_sha256"]}' for v in variants]
text(R/'交付清单.txt','\n'.join(lines))
rev=R.parent/'review';rev.mkdir(exist_ok=True)
vtt=(F/'youtube-zh/captions-zh.srt').read_text(encoding='utf-8');vtt=re.sub(r'(?m)^\d+\n','',vtt).replace(',','.');text(rev/'captions-zh.vtt','WEBVTT\n\n'+vtt)
vtt=(F/'youtube-zh/captions-en.srt').read_text(encoding='utf-8');vtt=re.sub(r'(?m)^\d+\n','',vtt).replace(',','.');text(rev/'captions-en.vtt','WEBVTT\n\n'+vtt)
text(rev/'index.html','''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>虫潮围城房车：完整审片包</title><style>body{font:17px system-ui;background:#102028;color:#e5efe8;max-width:1200px;margin:30px auto;padding:20px}video{width:100%;background:#000}img{width:42%;max-width:650px;margin:1%}a{color:#a0dfcc}</style><h1>开房车进僵尸城搜物资</h1><p>约1分50秒。全部电影尚未上传，请审内容、人声听感和混音。B站/抖音使用同一电影。</p><video controls preload="metadata" src="../final/bilibili-zh/gameplay-zh-final.mp4"></video><h2>YouTube中文原声版</h2><p>另附中英可切换字幕；本地播放器可选轨，正式投稿需一起上传SRT。</p><video controls preload="metadata" src="../final/youtube-zh/gameplay-youtube-final.mp4"><track kind="subtitles" srclang="zh" label="中文字幕" src="captions-zh.vtt" default><track kind="subtitles" srclang="en" label="English" src="captions-en.vtt"></video><h2>封面</h2><img src="../final/bilibili-zh/cover-home-4x3.jpg" alt="4:3首页封面"><img src="../final/bilibili-zh/cover-space-16x9.jpg" alt="16:9空间封面"><p><a href="../work/交付清单.txt">全部交付文件与状态</a></p></html>''')
for v in variants:
 mpath=R/v['manifest_file'];m=read(mpath)
 for field in ['video_file','description_file','cover_file','credits']:
  assert (mpath.parent/m[field]).resolve().is_file(),(v['variant_id'],field)
 assert sha(mpath.parent/m['video_file'])==m['video_sha256']
 for s in m['subtitles']:assert sha(mpath.parent/s['file'])==s['sha256']
 for body in [m['description'],m.get('pinned_comment_draft','')]:
  assert not re.search(r'\n\s*\n',body)
  urls=re.findall(r'https://\S+',body);assert len(urls)==len(set(urls))
 forbidden={'3D游戏','网页游戏','童年游戏','万物皆可游戏','动作游戏','AI辅助开发'};assert not forbidden.intersection(m['tags'])
write(R/'qa/packaging.json',{'passed':True,'checked_at':now,'portable_references':True,'final_hashes_verified':True,'cover_ratios_verified':True,'description_format_verified':True,'platforms':[v['variant_id'] for v in variants],'human_review':'pending','subjective_listening':'not-run'})
print('Three complete review variants packaged; hashes and references passed; no upload.')

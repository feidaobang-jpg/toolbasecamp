"""Package actual Bilibili files and truthful, resumable review records."""
from pathlib import Path
import json,hashlib,shutil,subprocess,datetime,wave
from PIL import Image
W=Path(__file__).resolve().parent; ROOT=W.parent; F=ROOT/'final/bilibili-zh'; P=W/'publish/bilibili-zh'
P.mkdir(parents=True,exist_ok=True)
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
task='01a1349d-e1d4-7110-b7bf-9b348b92cca6-rv-video-01'
event='rv-visual-video-20261013-final-review-v1'
archive=Path('D:/project/toolbasecamp-artifacts/rv-visual-video-20261013')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,j):p.write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(F/'gameplay-zh-final.mp4')],text=True))
save(W/'qa/final-probe.json',probe)
duration=float(probe['format']['duration']); video_hash=sha(F/'gameplay-zh-final.mp4')
title='这还是同一辆车？我把房车和小镇翻新了｜虫潮围城'
toy='https://www.bilibili.com/toy/chongchao-qianshao/index.html'
vote='https://www.zhengxiaohui.cn/game-vote.html'
topic={'name':'哔哩哔哩Toy创意挑战','url':'https://www.bilibili.com/v/topic/detail?topic_id=1346285','selection_status':'pending_at_publication'}
tags=['虫潮围城','房车生存','游戏开发','独立游戏','AI','Codex','bilibilitoy']
description=f'《虫潮围城》房车生存画面升级：旧版与v0.37.4同站位对比，车身细节、城镇街景和夕阳光照一起翻新，再开进城里搜一趟物资。\nToy试玩：{toy}\n进入游戏选择「房车生存」；WASD驾驶/移动，I上下车/搜索。原有进度继续使用，本次美术升级仅针对房车模式。\n本次美术与游戏代码由Codex辅助制作，视频展示真实游戏画面。\n投票／愿望单（复制到浏览器打开）：{vote}，百宝箱 → 游戏 → 自研游戏投票榜。'
comment=f'新版房车已经可以玩了，进入游戏选择「房车生存」，I上下车/搜索。\nToy试玩：{toy}\n下一步你更希望细化人物，还是继续补城镇细节？'
copy='【标题】\n'+title+'\n\n【标签】\n'+'\n'.join(tags)+'\n\n【话题】\n'+topic['name']+'\n'+topic['url']+'\n\n【简介】\n'+description+'\n\n【置顶评论】\n'+comment+'\n'
(F/'投稿文案.txt').write_text(copy,encoding='utf-8-sig')
covers={}
for key,file,purpose in [('home_4_3','cover-home-4x3.png','首页推荐'),('space_16_9','cover-space-16x9.png','个人空间')]:
    im=Image.open(F/file);covers[key]={'file':'../../../final/bilibili-zh/'+file,'width':im.width,'height':im.height,'purpose':purpose,'sha256':sha(F/file)}
manifest={'schema_version':2,'variant_id':'bilibili-zh','platform':'Bilibili','content_type':'game visual update','language':'zh-CN','audio_language':'zh-CN','packaging_language':'zh-CN',
 'game_name':'虫潮围城 · 房车生存','game_version':'web-rv-art-v0.37.4','baseline_version':'web-guest-v0.36.9','video_file':'../../../final/bilibili-zh/gameplay-zh-final.mp4','media_id':'shared-zh',
 'video_sha256':video_hash,'width':1920,'height':1080,'fps':30,'duration_seconds':duration,'title':title,'description':description,'tags':tags,'topic':topic,'pinned_comment_draft':comment,
 'description_file':'../../../final/bilibili-zh/投稿文案.txt','cover_file':covers['home_4_3']['file'],'cover_files':covers,'cover_text':'这还是同一辆车？ / 升级前 / 升级后 / 虫潮围城 · 房车生存',
 'cover_selection_source':'ImageGen based on genuine before-front and final-front screenshots; model details compared to source; generated cover is promotional composition, not video footage',
 'cover_upload_mode':'custom_image','subtitle_mode':'burned_in','subtitles':[],'credits':'../../sources.md','category':None,'copyright_type':'本人游戏实机与原创解说',
 'disclosures':{'AI_generated_narration':True,'AI_assisted_cover':True,'AI_assisted_game_development':True,'voice':'IndexTTS-2.5 local; previously used synthetic reference voice','exact_foundation_model':'not asserted','platform_setting':'pending_at_publication'},
 'platform_requirements_checked_at':now,'platform_sources':[toy,topic['url']],'unverified_fields':['当期活动适用条件、正式投稿入口与声明设置须发布时核对'],
 'ready_to_review':True,'ready_to_upload':False,'blocking_issues':['human subjective listening and final review pending'],
 'human_review':{'status':'pending','event_id':event,'variant_id':'bilibili-zh','video_sha256':video_hash,'statement':None},
 'publication':{'status':'not_uploaded','bvid':None},'toy':{'id':'38678478981120','url':toy,'public_version_observed':'v0.37.4','public_container':'38678478981120-v25804','public_check_at':now,'proof':'../../qa/toy-public-menu.png','video_binding':'pending_after_publication'},
 'season':{'id':9248439,'name':'合集·虫潮围城开发实录','status':'pending_after_publication'},
 'post_publication':['核对UID16214353与当期活动；审片通过后投稿B站','过审后绑定Toy38678478981120并读回','置顶评论、归入合集9248439并公开核验','核对并按条件使用已领取免费流量券，完成Toy推流申请'],'created_at':now}
save(P/'publish.json',manifest)
save(W/'publish.json',{'schema_version':2,'game_name':'虫潮围城','game_version':'web-rv-art-v0.37.4','requested_variants':['bilibili-zh'],'ready_to_review':True,'ready_to_upload':False,'variants':[{'variant_id':'bilibili-zh','manifest_file':'publish/bilibili-zh/publish.json','ready_to_upload':False,'blocking_issues':['pending_human_review_and_listening']}]})
(P/'Toy推流申请.txt').write_text('UP主昵称：飞刀班长\n视频链接（BV长链）：待审片、投稿后填真实链接\n投稿tag是否加bilibilitoy&带指定话题：草稿已准备；实际选择待投稿核验\n是否置顶Toy链接到评论区：待发布后置顶并核验\n是否视频中宣传Toy平台：是，片尾已说明并展示\n运营反馈：未申请，待有真实BV后按当期规则办理\n',encoding='utf-8-sig')
plan=json.loads((W/'units.json').read_text('utf-8'));tl=json.loads((W/'edit/shared-zh/timeline.json').read_text('utf-8'))
(W/'script.md').write_text('# 房车新旧画面对比 · 定稿\n\n本期范围：0.36.9旧美术对比0.37.4房车美术升级；实际玩法延续既有规则。\n\n'+'\n\n'.join('## '+s['id']+'\n\n'+'\n'.join(s['units']) for s in plan['segments'])+'\n',encoding='utf-8')
captures=[]
for p in sorted((W/'capture').glob('*.webm')):
    j=json.loads(p.with_suffix('.json').read_text('utf-8'))
    if 'orbit' in p.stem:
        j['method']='same-position art staging; normal game models; paused world with camera moving under real-time RAF; not normal combat evidence';save(p.with_suffix('.json'),j)
    captures.append({'file':'capture/'+p.name,'sha256':sha(p),'duration_seconds':j['duration'],'method':j['method'],'version':j['version'],'events_file':'capture/'+p.with_suffix('.json').name})
save(W/'capture-manifest.json',{'captures':captures,'normal_play_source':'new-journey.webm','discarded_lead_seconds':12.7,'normal_play_result':{'defeated':5,'search_areas':1,'scrap_before_search':200,'scrap_after_search':310,'returned_to_vehicle':True,'returned_to_street':True,'vehicle_hp':1358,'vehicle_hp_max':1400,'person_hp':120},'HUD':'Capture is the canvas; DOM HUD excluded. Editorial result labels use captured telemetry, not recreated game HUD.'})
(W/'sources.md').write_text('''# 制作来源与边界

- 旧版：web-guest-v0.36.9，源提交 b7627cf75568dd469fde1b576683ed1746976283。保全的game.compat.js SHA256：89349e39acbf3fba8048fdf74a2ed0344351d5139f283cbdcd2ba2af94cf1230；HTML由同提交读取。不是历史录屏，而是该构建重演，开头标明旧版重演。
- 新版：web-rv-art-v0.37.4，源码提交8548623d9eafed15069bb138dc20e649eb334f1e，runtime SHA256：dde19925aa58aaeafa99ae26b86b4cfd9d0a43a7e7661683e2a7f65534ffba0c。当前工作区基线ec91d36c，未改游戏运行代码。
- 参考交接：game-projects/starship-defense/media-kit/releases/web-rv-art-v0.37.4/handoff.json，以及media-kit/sources.json。车辆、建筑、光照为游戏现有程序模型；不宣称下载资产或真实材质扫描。
- 新旧美术展示在相同站位使用真实渲染；orbit只控制展示相机，世界暂停，不能充当正常战斗。new-journey来自正常规则开局，通过键盘及菜单操作驾驶、击败僵尸、下车搜索与返回，不改资源、生命、伤害或刷怪。丢弃起始确认菜单约12.7秒，剪掉回车路上路牌遮挡部分。
- 游戏画布1920×1080，MediaRecorder VP9/Opus实时采集。导出H.264/AAC、30fps。仅剪辑、局部裁切、标题字幕与片尾淡出，无AI生成实机片段。原始文件及哈希见capture-manifest.json。
- 封面：基于D:/project/task-artifacts/rv-visual-upgrade-20261013/before-front.png和final-front.png，用ImageGen重新构图。16:9、4:3图片是宣传封面，不冒充未经编辑的截图；车辆轮廓和细节已与实机对比。原生成图片保留在本任务generated_images目录。
- 人声：本地IndexTTS-2.5，使用此前已采用的合成人声参考D:/project/task-artifacts/mario-stage4-video-20261012/work/ref/yunxi-ref-8s.wav，不是微软官方云希或真人授权声明。逐句生成、依据实际PCM样本数定位字幕。主观听审未执行，交用户最终审片。
- 声音：录制游戏自身AudioSys合成声音；未添加外部歌曲。字体Microsoft YaHei来自本机Windows，渲染到视频，无字体文件分发。
- 仅制作B站中文版本；未制作其他平台物料。当前Toy正式入口v0.37.4由浏览器实际读取并截图；活动、免费券、投稿声明及BV绑定在审片通过后的发布阶段办理。
- 可复现剪辑：python work/render.py；输入均在work/capture与work/audio。重录需在相同Git源码工作区运行work/serve.py并通过录制页面启动，播放器/录制服务不是后台任务。
''',encoding='utf-8')
save(W/'run-state.json',{'task_id':task,'tool':'Codex','status':'waiting_for_user_review','production_status':'completed','artifact_root':str(archive),'workspace':str(ROOT),'requested_variants':['bilibili-zh'],'render_entry':'render.py','video_sha256':video_hash,'duration_seconds':duration,'human_review':{'event_id':event,'reason':'Approval','status':'pending'},'next_step':'用户审看实际成片并明确通过后，按既有B站发布闭环上传、Toy绑定、合集、置顶、活动和券核验；本轮没有上传。','other_platforms':'not_requested','server':'stopped_at_handoff','cover_stage':'completed'})
(W/'交付清单.txt').write_text(f'B站单版｜中文配音＋烧录中文字幕｜1920×1080 30fps｜{duration:.1f}秒\n成片：../final/bilibili-zh/gameplay-zh-final.mp4\n首页封面：../final/bilibili-zh/cover-home-4x3.png\n空间封面：../final/bilibili-zh/cover-space-16x9.png\n投稿文案：../final/bilibili-zh/投稿文案.txt\nSHA256：{video_hash}\n状态：制作完成，待本人听审和人工审片；未上传。\n工程：render.py、edit/shared-zh/timeline.json、captions.ass；原片capture，配音audio/shared-zh。\n永久交付目录：{archive}\n',encoding='utf-8-sig')
save(W/'delivery-manifest.json',{'files':[{'file':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(F.iterdir()) if p.is_file()],'video_sha256':video_hash,'duration_seconds':duration,'artifact_root':str(archive),'generated_at':now})
print('Package records complete',duration,video_hash)

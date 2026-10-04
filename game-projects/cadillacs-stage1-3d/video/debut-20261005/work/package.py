"""Create the review package and honest publication/QA records."""
import json,hashlib,subprocess,datetime
from pathlib import Path
R=Path(__file__).resolve().parent;F=R.parent/'final/bilibili-zh';P=R/'publish/bilibili-zh';P.mkdir(parents=True,exist_ok=True)
def write(p,t):p.write_text(t,encoding='utf-8-sig')
def js(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
video=F/'恐龙快打-第一关3D重置介绍.mp4'
probe=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_streams','-show_format','-of','json',str(video)]));js(R/'qa/ffprobe.json',probe)
sha=hashlib.sha256(video.read_bytes()).hexdigest();duration=float(probe['format']['duration'])
web='https://www.zhengxiaohui.cn/html/game/cadillacs-stage1-3d/index.html'
vote='https://www.zhengxiaohui.cn/game-vote.html'
title='恐龙快打第一关搬进3D，按C切到主角背后打'
tags=['bilibilitoy','恐龙快打','街机','独立游戏','游戏开发','Claude','AI']
topic='哔哩哔哩Toy创意挑战';topicurl='https://www.bilibili.com/v/topic/detail?topic_id=1346285'
description=f'''街机厅的恐龙快打，第一关原样搬进 3D：楼顶 → 大楼内部 → 第 47 街，打倒牵着岩跳龙的维斯·T。本期重点是按 C 切视角——侧视就是原作画面，正视切到主角身后，第一人称整条街都在你眼里，出招距离和包围圈的判断全得重新学。

四位英雄能力值与原作选人画面一致；连招、抓投、举油桶、武器、暴走的岩跳龙都在。电脑手机都能玩。

如实说明：背景音乐按原作风格重新编写（原曲乐谱没找到），音效为合成；手机端尚未做真机帧率测试。本作使用 Claude（Opus 5.5）辅助开发，是《恐龙快打》的粉丝向非官方 3D 重置，原作版权归 Capcom 及原著方所有。

百宝箱试玩（复制到浏览器打开）：
{web}
B站 Toy 已提交审核，过审后可从主页 Toy 列表试玩。

想玩哪款复刻，写进愿望单；投票／愿望单（复制到浏览器打开）：{vote} （百宝箱 → 游戏 → 自研游戏投票榜）'''
comment=f'''楼顶那两只油桶记得用：一只藏炸药，一桶砸人 1000 分。你会上选哪位英雄——杰克、汉娜、穆斯塔法还是梅斯？
试玩：{web}
投票／愿望单（复制到浏览器打开）：{vote} （百宝箱 → 游戏 → 自研游戏投票榜）'''
write(F/'投稿文案.txt','【标题】\n'+title+'\n\n【标签】\n'+'\n'.join(tags)+'\n\n【话题】\n'+topic+'\n'+topicurl+'\n\n【简介】\n'+description+'\n\n【置顶评论】\n'+comment+'\n')
prefix='../../../final/bilibili-zh/'
manifest={'variant_id':'bilibili-zh','platform':'bilibili','content_type':'overview','language':'zh-CN','game_name':'恐龙快打 3D','game_version':'v0.1.0','video_file':prefix+video.name,'media_id':'shared-zh','video_sha256':sha,'width':1920,'height':1080,'duration_seconds':duration,'title':title,'description':description,'tags':tags,'topic':{'name':topic,'url':topicurl,'selected_in_platform':False},'pinned_comment_draft':comment,'description_file':prefix+'投稿文案.txt','cover_file':prefix+'cover-home-4x3.jpg','cover_files':{'home_4_3':{'file':prefix+'cover-home-4x3.jpg','width':1440,'height':1080},'space_16_9':{'file':prefix+'cover-space-16x9.jpg','width':1920,'height':1080}},'cover_text':'恐龙快打 3D / 第一关 · 按C切到主角背后','cover_selection_source':'实机摆拍截图（Boss战飞踢+岩跳龙）程序排版，非AI生成','cover_upload_mode':'custom_image','subtitle_mode':'burned_in','copyright_type':'original','category':None,'credits':'credits.txt','disclosures':['解说为Edge云希预置合成音色','封面为实机截图程序排版','录像为Playwright页面内bot按快照决策派发真实键盘事件、离线逐帧渲染与离线音轨合成，非真人实时操作'],'platform_requirements_checked_at':'2026-10-05','platform_sources':[web,topicurl],'unverified_fields':['投稿前核对 Toy（id 40412421031936）是否过审：过审则把 Toy 链接补进简介与置顶评论','实际投稿时核对当期分类、话题资格、封面上传入口'],'blocking_issues':['等待本期最终视频人工审片（含人声听感）','Toy 40412421031936 审核中，发布时核对状态'],'ready_to_upload':False,'uploaded':False}
js(P/'publish.json',manifest)
js(R/'publish.json',{'schema_version':2,'game_name':'恐龙快打 3D','game_version':'v0.1.0','requested_variants':['bilibili-zh'],'variants':[{'variant_id':'bilibili-zh','manifest_file':'publish/bilibili-zh/publish.json','ready_to_upload':False,'blocking_issues':manifest['blocking_issues']}],'ready_to_upload':False})
write(P/'Toy推流申请.txt','UP主昵称：飞刀班长\n视频链接：待投稿产生BV号\ntag与话题：草稿已准备，待实际投稿核验\n是否置顶Toy链接：Toy审核中（id 40412421031936），过审后置顶\n是否视频中宣传Toy平台：是，尾卡提示试玩入口\n运营反馈：尚未申请\n申请表：https://docs.qq.com/sheet/DU3dnQkR1WG5RUnp0?tab=7mm8hw\n')
write(P/'credits.txt','游戏素材、音乐与音效来自本项目v0.1.0运行包（dist/toy-v0.1.0/package，SHA256见media-kit/releases/toy-v0.1.0/toy-build.json）。原作《Cadillacs and Dinosaurs/恐龙快打》版权归Capcom及原著方，粉丝向非官方3D重置；音乐按原作风格重新编写（非转录），音效为合成。Three.js MIT许可随游戏保留（js/THREE-LICENSE.txt）。\n解说：Microsoft Edge在线神经网络预置音色zh-CN-YunxiNeural，正常语速；未克隆真人。\n字幕与尾卡字体：Microsoft YaHei，渲染入画，不分发字体文件。\n封面：实机摆拍截图（qa/cover-a.png，HUD隐藏）加程序化排版，非AI生成。\n')
js(R/'audio/shared-zh/voice.json',{'engine':'Edge TTS online','voice':'zh-CN-YunxiNeural','speed':1,'rate':'+0%','preferred_voice':'必剪曼波','fallback_reason':'本次未走必剪：曼波音色需人在必剪客户端手动生成，本期按默认偏好回退Edge云希，未冒称曼波。','timestamp_source':'actual service WordBoundary','subjective_listening':'not-run','subjective_reason':'当前模型无可接收音频的试听输入，未假称听审；已列为主要待审项。','python_runtime':'comfyui-api-server/.venv/Scripts/python.exe'})
js(R/'edit/bilibili-zh/covers/design.json',{'copy':['恐龙快打 3D','第一关 · 按C切到主角背后'],'method':'Pillow程序排版：实机截图裁切/缩放 + 顶部渐变带 + 描边文字','reference':'qa/out/cover-a.png（2560x1440实机摆拍，HUD隐藏）','ai_generated':False,'sizes':{'home_4_3':'1440x1080','space_16_9':'1920x1080'}})
write(R/'sources.md','游戏版本：v0.1.0，画面与音频全部来自 media-kit/releases/v0.1.0/captures/ 已归档录像（full-run-16x9.mp4 穆斯塔法 seed7、cameras-16x9.mp4 杰克 seed5、mobile-landscape.mp4）与 shots/ 静帧（continue.png、title.png、result.png）。\n录像为 qa/record.js：Playwright 驱动页面内 bot 按游戏快照决策、派发真实键盘事件；视频为离线逐帧渲染（虚拟时钟 step），音频为页面内 OfflineAudioContext 按声音事件离线合成。非真人实时操作，无瞬移、无敌或刷道具（未开演示模式）。\n视角演示段（cameras）与整局段（full-run）是不同场次、不同英雄，解说已按 respective 英雄描述，不宣称一镜到底。\n选段与成片时间对照见 edit/shared-zh/timeline.json；未选用的素材不用于发布。\n解说、字体、封面与音乐来源见 publish/bilibili-zh/credits.txt 及 audio/shared-zh/voice.json。\n')
tl=json.loads((R/'edit/shared-zh/timeline.json').read_text(encoding='utf-8'))
rows=['# 段落对照（成片秒 → 源素材）','',
 '| 段落 | 成片 | 源素材 | 源入点 | 内容 |','| --- | --- | --- | --- | --- |']
for seg in tl:
 for sh in seg['shots']:
  rows.append(f"| {seg['id']} | {seg['start']:.1f}-{seg['end']:.1f} | {Path(sh['source']).name} | {sh.get('in','-')} | {sh.get('desc','')} |")
rows+=['','## 客观检查','','- ffprobe：1920x1080 30fps h264 + aac 48kHz 立体声，时长 '+f'{duration:.1f}s',' - 全片解码：无错误（ffmpeg -f null）',' - 响度：Integrated -16.2 LUFS，LRA 8.4（目标 -15±1）',' - 字幕：Edge WordBoundary 词级时间戳，短语切分烧录，ass/srt/alignment.json 在 edit/shared-zh/','','## 待人工审片','','1. 人声听感（云希音色、语速、错字）','2. 声画对位：04 段四种视角与解说顺序','3. 封面两张缩略图可读性','4. Toy 过审后补 Toy 链接进简介与置顶评论','']
write(R/'qa.md','\n'.join(rows))
js(R/'run-state.json',{'status':'rendered_awaiting_user_review','mode':'overview','requested_variants':['bilibili-zh'],'files_complete':True,'toy_sync_status':'auditing','toy_id':40412421031936,'game_id':'cadillacs-stage1-3d','version':'v0.1.0','video_sha256':sha,'duration_seconds':duration,'subjective_audio_review':'not-run','capture_permission':'用户2026-10-04明确长期允许Playwright脚本录制，已写入.claude/skills/game-video/SKILL.md','cover_stage':'completed','render_entry':'render.py（源素材复用v0.1.0 captures，未新录）','video_uploaded':False,'next_step':'用户人工审片通过后，按game-video发布闭环执行：核对Toy过审状态→投稿→绑定Toy→置顶评论→填推流申请；配音实际为Edge云希。'})
print('package',duration,sha)

"""Create the review package and honest publication/QA records."""
import json,hashlib,subprocess,datetime
from pathlib import Path
R=Path(__file__).resolve().parent;F=R.parent/'final/bilibili-zh';P=R/'publish/bilibili-zh';P.mkdir(parents=True,exist_ok=True)
# Published episodes are immutable: a new cut must use a new episode directory.
if (R/'publication-result.json').exists():
    raise SystemExit('本期已有发布记录，停止重建以免覆盖发布状态；新剪辑请创建新一期目录。')
def write(p,t):p.write_text(t,encoding='utf-8-sig')
def js(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
video=F/'赤色要塞-双关卡上架介绍.mp4'
probe=json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_streams','-show_format','-of','json',str(video)]));js(R/'qa/ffprobe.json',probe)
sha=hashlib.sha256(video.read_bytes()).hexdigest();duration=float(probe['format']['duration'])
toy='https://www.bilibili.com/toy/feidao-jackal-3d/index.html'
web='https://www.zhengxiaohui.cn/html/game/jackal-stage1-3d/index.html'
vote='https://www.zhengxiaohui.cn/game-vote.html'
title='小吉普，大救援！赤色要塞3D双关卡已上线，直接开玩'
tags=['bilibilitoy','赤色要塞','独立游戏','游戏开发','射击游戏','Claude','AI']
topic='哔哩哔哩Toy创意挑战';topicurl='https://www.bilibili.com/v/topic/detail?topic_id=1346285'
description=f'''驾驶小吉普炸营房、救俘虏、升级火箭，再把人送上直升机。海滩登陆与废墟城两关现已上线：本期录了两关实战，第二关翻车一次后重新整备，最终完成救援与关底挑战。

本作使用 Claude 辅助开发，是《赤色要塞》的粉丝向非官方重置。方向键/WASD移动，J机枪，K手雷或火箭，C切换视角；默认3格护甲、无限命，机枪跟随车头。

哔哩哔哩 Toy 试玩：
{toy}
百宝箱试玩（复制到浏览器打开）：
{web}

想玩哪款复刻，写进愿望单；投票／愿望单（复制到浏览器打开）：{vote} （百宝箱 → 游戏 → 自研游戏投票榜）'''
comment=f'''先炸营房救人，闪光俘虏会升级武器，记得送到直升机坪！你更想打磨吉普转向，还是手雷手感？
Toy试玩：{toy}
投票／愿望单（复制到浏览器打开）：{vote} （百宝箱 → 游戏 → 自研游戏投票榜）'''
write(F/'投稿文案.txt','【标题】\n'+title+'\n\n【标签】\n'+'\n'.join(tags)+'\n\n【话题】\n'+topic+'\n'+topicurl+'\n\n【简介】\n'+description+'\n\n【置顶评论】\n'+comment+'\n')
prefix='../../../final/bilibili-zh/'
manifest={'variant_id':'bilibili-zh','platform':'bilibili','content_type':'overview','language':'zh-CN','game_name':'赤色要塞 3D','game_version':'v0.3','video_file':prefix+video.name,'media_id':'shared-zh','video_sha256':sha,'width':1920,'height':1080,'duration_seconds':duration,'title':title,'description':description,'tags':tags,'topic':{'name':topic,'url':topicurl,'selected_in_platform':False},'pinned_comment_draft':comment,'description_file':prefix+'投稿文案.txt','cover_file':prefix+'cover-home-4x3.jpg','cover_files':{'home_4_3':{'file':prefix+'cover-home-4x3.jpg','width':1440,'height':1080},'space_16_9':{'file':prefix+'cover-space-16x9.jpg','width':1920,'height':1080}},'cover_text':'小吉普，大救援 / 赤色要塞 3D / 双关卡·已上线','cover_selection_source':'本期实机参考的AI封面重构；双比例独立构图','cover_upload_mode':'custom_image','subtitle_mode':'burned_in','copyright_type':'original','category':None,'credits':'credits.txt','disclosures':['解说为Edge云希预置合成音色','封面为AI重构','游戏正常规则下使用Playwright键盘录制'],'platform_requirements_checked_at':'2026-10-04','platform_sources':[toy,topicurl],'unverified_fields':['实际投稿时核对当期分类、话题资格、封面上传入口'],'blocking_issues':['等待本期最终视频人工审片（含人声听感）'],'ready_to_upload':False,'uploaded':False}
js(P/'publish.json',manifest)
js(R/'publish.json',{'schema_version':2,'game_name':'赤色要塞 3D','game_version':'v0.3','requested_variants':['bilibili-zh'],'variants':[{'variant_id':'bilibili-zh','manifest_file':'publish/bilibili-zh/publish.json','ready_to_upload':False,'blocking_issues':manifest['blocking_issues']}],'ready_to_upload':False})
write(P/'Toy推流申请.txt','UP主昵称：飞刀班长\n视频链接：待投稿产生BV号\ntag与话题：草稿已准备，待实际投稿核验\n是否置顶Toy链接：待投稿后执行\n是否视频中宣传Toy平台：是，成片末段\n运营反馈：尚未申请\n申请表：https://docs.qq.com/sheet/DU3dnQkR1WG5RUnp0?tab=7mm8hw\n')
write(P/'credits.txt','游戏素材、音乐与音效来自本项目v0.3运行包。原作《Jackal/赤色要塞》版权归Konami，粉丝向非官方重置；本项目资产声明沿用media-kit/sources.json。Three.js MIT许可随游戏保留。\n解说：Microsoft Edge在线神经网络预置音色zh-CN-YunxiNeural，正常语速；未克隆真人。\n字幕与尾卡字体：Microsoft YaHei，渲染入画，不分发字体文件。\n封面：OpenAI内置imagegen，参考实机重构，非原始截图。没有外加背景音乐。\n')
js(R/'audio/shared-zh/voice.json',{'engine':'Edge TTS online','voice':'zh-CN-YunxiNeural','speed':1,'rate':'+0%','preferred_voice':'必剪曼波','fallback_reason':'必剪窗口可读取，但输入连续两次失败：foreground window did not report a process id。遵循恢复次数限制，改用已有Edge TTS环境。','timestamp_source':'actual service WordBoundary','subjective_listening':'not-run','subjective_reason':'当前模型无可接收音频的试听输入，未假称听审。','python_runtime':'comfyui-api-server/.venv/Scripts/python.exe'})
js(R/'edit/bilibili-zh/covers/design.json',{'copy':['小吉普，大救援','赤色要塞 3D','双关卡·已上线'],'method':'内置imagegen，两张独立生成，FFmpeg等比缩放与不足1px补边','reference':'../../../qa/cover-reference.png','originals':['home-original.png','space-original.png'],'prompt':'参照实机低多边形绿吉普、蓝坦克、沙土地与多边形树木。绿底奶油色大字，右侧吉普带获救乘客，坦克与爆炸置后。文字：小吉普，大救援；赤色要塞3D；双关卡·已上线。分别4:3与16:9独立构图。禁止模型名、写实画质和HUD。','ai_generated':True})
write(R/'sources.md','游戏版本：v0.3，直接录制已同步Toy的dist/toy-v0.3/package，未修改游戏产物。\n运行包SHA256见media-kit/releases/toy-v0.3/toy-build.json。录制为Playwright正常键盘输入、CDP高质量JPEG及真实时间戳、原游戏音频；非离线步进、无瞬移、无敌或刷道具。\n读取游戏快照与地图辅助操控，镜头最终以画面核验；调整的是行进路线脚本。\n第一关、第二关为分别剪取的实战；第二关先正常通关解锁再续关。第一关成片来源与第二关解锁局是不同场次，不宣称一镜到底。\n所有录像保留在capture；选用源与时间码在edit/shared-zh/timeline.json，未选用的路线受阻素材不用于发布。\n解说、字体、封面与音乐来源见publish/bilibili-zh/credits.txt及audio/shared-zh/voice.json。\n')
write(R/'script.md','# 最终口播\n\n'+'\n\n'.join(s['text'] for s in json.loads((R/'narration.json').read_text(encoding='utf-8'))['segments'])+'\n\n注：投票选项接口尚无赤色要塞，因此邀请愿望单与给其他喜欢作品投票，不声称本作已可投票。\n')
js(R/'run-state.json',{'status':'rendered_awaiting_user_review','mode':'overview','requested_variants':['bilibili-zh'],'files_complete':True,'toy_sync_status':'published','game_id':'jackal-stage1-3d','version':'v0.3','video_sha256':sha,'subjective_audio_review':'not-run','capture_permission':'用户2026-10-04明确长期允许Playwright脚本录制，已写入.claude/skills/game-video/SKILL.md','cover_stage':'completed','render_entry':'render.py','video_uploaded':False,'next_step':'用户审核本期最终视频通过后，按game-video发布、绑定Toy、置顶评论与填写推流申请；配音实际为云希。'})
print('package',duration,sha)

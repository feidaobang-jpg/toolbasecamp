"""Create final copy and evidence manifests; never upload or publish anything."""
import hashlib,json,re
from pathlib import Path
from PIL import Image

W=Path(__file__).resolve().parent
F=W.parent/'final'/'bilibili-zh'
P=W/'publish'/'bilibili-zh'
P.mkdir(parents=True,exist_ok=True)
def write(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
title='虫潮来了，这座基地你能守住吗？我的小游戏上线B站Toy了'
desc='用AI辅助做了一个低多边形基地防守小游戏《虫潮前哨》。这次录了第一波实战：出门迎敌、机枪扫射、投掷手雷，再退回基地。\n\n试玩：https://www.bilibili.com/toy/chongchao-qianshao/index.html\n\n目前是可玩的试玩版，下一步想先打磨操作体验。'
tags=['独立游戏','游戏开发','游戏试玩','AI辅助开发','B站Toy']
copy=f'【标题】\n{title}\n\n【标签】\n'+ '\n'.join(tags)+f'\n\n【简介】\n{desc}\n'
(F/'投稿文案.txt').write_text(copy,encoding='utf-8-sig')
probe=json.loads((W/'qa/ffprobe.json').read_text(encoding='utf-8-sig'))
duration=float(probe['format']['duration'])
covers={}
for key,name,ratio,purpose in [('home_4_3','cover-home-4x3.jpg',(4,3),'首页推荐'),('space_16_9','cover-space-16x9.jpg',(16,9),'个人空间')]:
    im=Image.open(F/name);width,height=im.size
    assert width*ratio[1]==height*ratio[0],(name,im.size)
    covers[key]={'file':'../../../final/bilibili-zh/'+name,'width':width,'height':height,'purpose':purpose,'sha256':sha(F/name)}
issues=['配音可懂度和主观混音听感尚未听审：当前工具无法接收音频。请用户播放成片确认。']
manifest={'variant_id':'bilibili-zh','platform':'bilibili','content_type':'short gameplay introduction','language':'zh-CN',
 'game_name':'虫潮前哨：守卫基地','game_version':'toy-v0.1.0','media_id':'shared-zh',
 'video_file':'../../../final/bilibili-zh/gameplay-zh-final.mp4','video_sha256':sha(F/'gameplay-zh-final.mp4'),
 'width':1920,'height':1080,'fps':30,'duration_seconds':duration,'title':title,'description':desc,'tags':tags,
 'description_file':'../../../final/bilibili-zh/投稿文案.txt',
 'cover_file':covers['home_4_3']['file'],'cover_files':covers,'cover_text':'基地能守住吗？ / 虫潮前哨 / 已上线 Toy',
 'cover_selection_source':'AI-assisted graphic layout based on captured gameplay, not an unmodified screenshot',
 'cover_upload_mode':'custom_image','subtitle_mode':'burned_in','category':None,
 'credits':'../../sources.md','disclosures':{'narration':'Edge TTS zh-CN-YunxiNeural; online synthesis','covers':'AI-assisted graphic layout','gameplay':'real-time capture with normal key-input automation; no gameplay state cheats'},
 'platform_requirements_checked_at':'2026-09-30','platform_sources':['https://member.bilibili.com/platform/upload/video/frame'],
 'unverified_fields':['投稿页最终封面裁切和账号投稿设置未操作验收；本期仅制作文件，不上传。'],
 'blocking_issues':issues,'ready_to_upload':False,'uploaded':False}
write(P/'publish.json',manifest)
write(W/'publish.json',{'schema_version':2,'game_name':manifest['game_name'],'game_version':'toy-v0.1.0','requested_variants':['bilibili-zh'],
 'variants':[{'variant_id':'bilibili-zh','manifest_file':'publish/bilibili-zh/publish.json','ready_to_upload':False,'blocking_issues':issues}],
 'ready_to_upload':False})
write(W/'run-state.json',{'status':'files-produced-audio-listening-pending','video_complete':True,'video_uploaded':False,'requested_variants':['bilibili-zh'],
 'duration_seconds':duration,'capture_mode':'realtime-automation','gameplay_modified':False,'visual_review':'pass','technical_decode':'pass',
 'audio_review':'not-run','objective_audio':{'integrated_lufs':-16.24,'true_peak_dbtp':-1.44,'lra_lu':2.6},
 'blocking_issues':issues,'resume':['用户听完确认或指出需修改的具体时间点。','若改稿：运行 narrate.py，再运行 render.py；随后重做视频验收、运行 package.py。'],
 'inputs':[{'file':'capture/defense.webm','sha256':sha(W/'capture/defense.webm')},{'file':'audio/narration.mp3','sha256':sha(W/'audio/narration.mp3')}],
 'local_media_policy':'Raw video/audio and rendered video are ignored by Git but retained in this local project.'})
(W/'交付清单.txt').write_text(f'投稿入口：../final/bilibili-zh/\n中文横屏 1920×1080，30 fps，{duration:.2f} 秒。\n成片：gameplay-zh-final.mp4（已烧录字幕，不必另传SRT）\n首页推荐封面：cover-home-4x3.jpg\n个人空间封面：cover-space-16x9.jpg\n文案：投稿文案.txt\n文件已完成；画面、完整解码和客观音频检查通过。主观听审待用户播放确认，因此尚未标为全部验收通过。\n未上传视频；抖音、YouTube本次未请求。\n',encoding='utf-8-sig')
print(json.dumps({'duration':duration,'covers':covers,'files_produced':True,'audio_review':'not-run'},ensure_ascii=False))

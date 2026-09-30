import json,hashlib,subprocess,re
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
W=Path(__file__).resolve().parent;G=W.parents[2];F=W.parent/'final/bilibili-zh'
FF='D:/sd/ffmpeg/bin/ffmpeg.exe'
def ft(n):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
for name,size in [('cover-home-4x3.jpg',(1440,1080)),('cover-space-16x9.jpg',(1920,1080))]:
 im=Image.new('RGB',size,'#0a1b22');d=ImageDraw.Draw(im)
 # Independent crops place the authentic tank below a clean editorial title block.
 photo=Image.open(G/'media-kit/releases/v0.1.0/captures/commander-view.jpg').convert('RGB').crop((150,110,1100,660))
 photo=ImageOps.fit(photo,(size[0],680),centering=(.5,.48));im.paste(photo,(0,400))
 d=ImageDraw.Draw(im);d.rectangle((0,0,size[0],400),fill='#0a1b22')
 d.rounded_rectangle((55,35,410,93),radius=15,fill='#ffdd69');d.text((75,42),'万物皆可游戏',font=ft(34),fill='#142327')
 d.text((55,112),'坦克大战 3D',font=ft(115 if size[0]>1500 else 103),fill='white')
 d.text((60,258),'换个视角，守住老鹰！',font=ft(66 if size[0]>1500 else 58),fill='#ffdd69')
 d.rounded_rectangle((55,983,570,1045),radius=12,fill='#0a1b22');d.text((77,991),'第一关 · AI辅助制作 · 网页试玩',font=ft(27),fill='white')
 im.save(F/name,quality=95)
 im.resize((320,240 if size[0]==1440 else 180)).save(W/'qa'/name)
 im.save(W/'edit/bilibili-zh/covers'/name)
title='把童年的坦克大战搬进3D，换个视角守住老鹰！'
desc='经典第一关变成了3D沙盘：开着金色坦克打穿砖墙、拾取道具，守住老鹰，清掉20辆敌方坦克。视频也记录了一个小插曲：第一版老鹰怎么看都像只小鸭子。\n\n这是AI辅助制作的非官方同人网页实验，目前是第一关单人Demo，支持电脑键盘和手机横屏操作。你更喜欢全场俯瞰，还是贴着坦克的视角？\n\n网页试玩：\nhttps://www.zhengxiaohui.cn/html/game/tank-3d/index.html'
tags=['坦克大战','3D游戏','网页游戏','游戏开发','AI辅助开发','童年游戏','万物皆可游戏']
(F/'投稿文案.txt').write_text('【标题】\n'+title+'\n\n【标签】\n'+'\n'.join(tags)+'\n\n【简介】\n'+desc+'\n',encoding='utf-8-sig')
video=F/'gameplay-zh-final.mp4';sha=hashlib.sha256(video.read_bytes()).hexdigest()
duration=70.7666666667
m=dict(variant_id='bilibili-zh',platform='bilibili',language='zh-CN',game_name='坦克大战 3D：第一关',game_version='v0.1.0 gameplay captures',video_file='../../../final/bilibili-zh/gameplay-zh-final.mp4',video_sha256=sha,width=1280,height=720,duration_seconds=duration,title=title,description=desc,tags=tags,description_file='../../../final/bilibili-zh/投稿文案.txt',subtitle_mode='burned_in',cover_file='../../../final/bilibili-zh/cover-home-4x3.jpg',cover_files={k:dict(file='../../../final/bilibili-zh/'+n,width=s[0],height=s[1],purpose=p) for k,n,s,p in [('home_4_3','cover-home-4x3.jpg',(1440,1080),'首页推荐'),('space_16_9','cover-space-16x9.jpg',(1920,1080),'个人空间')]},cover_upload_mode='custom_image',cover_text='坦克大战 3D / 换个视角，守住老鹰！',ready_to_upload=False,blocking_issues=['主观听审未运行：请发布前播放确认人声与混音。'],disclosures=['按投稿页要求声明AI合成配音及AI辅助制作。'],unverified_fields=['账号当前投稿页入口与限制'],platform_requirements_checked_at='2026-09-30',platform_sources=['https://member.bilibili.com/'],category=None)
(W/'publish/bilibili-zh/publish.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
(W/'publish.json').write_text(json.dumps(dict(schema_version=2,game_name=m['game_name'],requested_variants=['bilibili-zh'],variants=[dict(variant_id='bilibili-zh',manifest_file='publish/bilibili-zh/publish.json',ready_to_upload=False,blocking_issues=m['blocking_issues'])],ready_to_upload=False),ensure_ascii=False,indent=2),encoding='utf-8')
(W/'sources.md').write_text('''# 来源与版本
- v0.1.0 原始素材位于本游戏 media-kit/releases/v0.1.0/captures；两局都是固定种子机器人操作、离线逐帧渲染，游戏音轨由同一事件时间线重建。不是人工实时操作。未改游戏玩法。
- 当前公开入口 HTTP 200；main.js 去除换行差异后与本地一致。当前站点额外接入共享演示控制，视频展示基础第一关，不宣称演示模式全部功能。
- 老鹰前后对比为 media-kit/assets/dev-stages 历史截图，成片标注开发阶段。镜头/手机片段是静态说明图，未伪装动态录制。
- 实机与开发截图均来自本项目，程序化模型、纹理和原创 Web Audio 音效，无外部音乐。完整资源来源见 media-kit/sources.json。
- 配音：Edge在线神经网络 zh-CN-YunxiNeural，+5%，非真人克隆。SentenceBoundary原始响应存audio/timings.json。字幕按实际响应分组。
- 字体：本机Microsoft YaHei，以Windows授权字体栅格化视频及图片；字体文件不分发。
- 封面使用真实游戏截图裁切、文字排版，非AI重构图。可编辑入口package.py。
- 非官方同人致敬，不声称取得原作商标授权。公开视频不使用原作素材及音乐。
- 官方投稿页需账号登录，未检查账号特定限制；4:3及16:9均交付高分辨率母版，不声称平台内预览已验收。
''',encoding='utf-8')
(W/'script.md').write_text('# 首次介绍 / 中文横屏 / B站\n\n'+'\n\n'.join((W/'narration.txt').read_text(encoding='utf-8').splitlines())+'\n\n重建：make.py → package.py。源与成片区间见edit/shared-zh/timeline.json。源片25秒附近存在几何遮挡，已避开。',encoding='utf-8')
(W/'edit/bilibili-zh/covers/design.txt').write_text('封面真实截图：commander-view.jpg。双比例分别裁切到680px高，下方主体，上方标题。主标题坦克大战3D；看点换个视角守住老鹰。重建入口work/package.py。',encoding='utf-8')
(W/'交付清单.txt').write_text('投稿入口：../final/bilibili-zh/\n中文横屏 1280×720，30fps，约71秒，H.264/AAC，配音与烧录字幕。\n视频、4:3封面、16:9封面、投稿文案齐备。\n未上传。发布前请播放确认人声及混音听感（本次无法主观听审）。\n工程续接：make.py，package.py；源片保留在本游戏media-kit。',encoding='utf-8-sig')
print(json.dumps(dict(video_sha256=sha,covers='done',copy='done'),ensure_ascii=False))

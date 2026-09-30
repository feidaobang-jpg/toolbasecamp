import json,hashlib,shutil
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
W=Path(__file__).resolve().parent;G=W.parents[2];F=W.parent/'final/bilibili-zh';P=W/'publish/bilibili-zh';P.mkdir(parents=True,exist_ok=True)
production=json.loads((W/'qa/production.json').read_text(encoding='utf8'))
def font(n):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
for name,size in [('cover-home-4x3.jpg',(1440,1080)),('cover-space-16x9.jpg',(1920,1080))]:
 # Same game geometry, genuine screenshot crop and separate typography for each canvas.
 photo=Image.open(G/'media-kit/releases/v0.1.0/captures/commander-view.jpg').convert('RGB').crop((150,110,1100,660))
 im=Image.new('RGB',size,'#0a1b22');im.paste(ImageOps.fit(photo,(size[0],680)),(0,400));d=ImageDraw.Draw(im)
 d.rounded_rectangle((55,35,410,93),radius=15,fill='#ffdd69');d.text((75,42),'万物皆可游戏',font=font(34),fill='#142327')
 d.text((55,112),'坦克大战 3D',font=font(115 if size[0]>1500 else 103),fill='white');d.text((60,258),'换个视角，守住老鹰！',font=font(66 if size[0]>1500 else 58),fill='#ffdd69')
 d.rounded_rectangle((55,983,570,1045),radius=12,fill='#0a1b22');d.text((77,991),'第一关 · AI辅助制作 · 网页试玩',font=font(27),fill='white');im.save(F/name,quality=95)
 im.resize((320,240 if size[0]==1440 else 180)).save(W/'qa'/name)
title='把童年的坦克大战搬进3D，换个视角守住老鹰！'
desc='还是那张熟悉的地图：开坦克、打砖墙、守老鹰。这次把第一关做成了3D网页小游戏，可以切换斜俯视和俯视。视频里也留了个开发小插曲——第一版老鹰，怎么看都像只鸭子。\n\n这是AI辅助制作的非官方同人网页实验，目前只有第一关，支持电脑键盘和手机横屏。你来试试，看能不能守住。\n\n网页试玩：\nhttps://www.zhengxiaohui.cn/html/game/tank-3d/index.html'
tags=['坦克大战','3D游戏','网页游戏','游戏开发','AI辅助开发','童年游戏','万物皆可游戏']
(F/'投稿文案.txt').write_text('【标题】\n'+title+'\n\n【标签】\n'+'\n'.join(tags)+'\n\n【简介】\n'+desc+'\n',encoding='utf-8-sig')
manifest=dict(variant_id='bilibili-zh',platform='bilibili',language='zh-CN',game_name='坦克大战 3D：第一关',game_version='current-site-modes1',video_file='../../../final/bilibili-zh/gameplay-zh-final.mp4',width=1920,height=1080,duration_seconds=production['duration'],video_sha256=production['video_sha256'],subtitle_mode='burned_in',title=title,description=desc,tags=tags,description_file='../../../final/bilibili-zh/投稿文案.txt',cover_file='../../../final/bilibili-zh/cover-home-4x3.jpg',cover_files={k:dict(file='../../../final/bilibili-zh/'+n,width=s[0],height=s[1],purpose=p) for k,n,s,p in [('home_4_3','cover-home-4x3.jpg',(1440,1080),'首页推荐'),('space_16_9','cover-space-16x9.jpg',(1920,1080),'个人空间')]},ready_to_upload=False,blocking_issues=['主观听审未运行，发布前需试听确认。'],disclosures=['按投稿页要求声明AI合成配音及AI辅助制作。'],unverified_fields=['账号当前投稿入口限制'])
(P/'publish.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
(W/'publish.json').write_text(json.dumps(dict(schema_version=2,requested_variants=['bilibili-zh'],variants=[dict(variant_id='bilibili-zh',manifest_file='publish/bilibili-zh/publish.json',ready_to_upload=False)],ready_to_upload=False),ensure_ascii=False,indent=2),encoding='utf8')
(W/'run-state.json').write_text(json.dumps(dict(status='files-complete-listening-review-pending',video_uploaded=False,requested_variants=['bilibili-zh'],voice='必剪 曼波',voice_rate=1.0,gameplay_modified=False,render_backend='ANGLE NVIDIA RTX4060Ti D3D11',visual_review='pass',audio_review='not-run',production=production,next_step='试听确认主观听感；render.py和package.py可重建。'),ensure_ascii=False,indent=2),encoding='utf8')
(W/'sources.md').write_text('''# 制作来源
- 当前游戏build modes1，源码未修改；正常第一关规则。GPU逐帧浏览器采集，1920×1080@30fps，固定种子275机器人键盘操作，不是真人操作实录。
- 实机capture/capture-offline-audio.mp4；相机切换camera/capture-offline-audio.mp4。音效事件经游戏GameAudio/OfflineAudioContext同步重建。
- 老鹰前后图片来自本游戏media-kit历史开发记录，画内标明历史阶段。手机支持来自当前源码与既有QA；没有宣称本次真机体验测试。
- 配音由必剪3.11.25「曼波」生成，未克隆真人。初始正常语速，成片以atempo=1.0保留原生语速和音高。音源audio/narration.wav，保存原始必剪MP3在audio/mambo-source.mp3。
- 必剪ASR对实际曼波音频识别，原生工程edit/bcut-project.bjson仅本地留存。读取新整段音轨实际识别的前22条，忽略其他旧音轨的识别轨道；字幕按工程inPoint/outPoint真实时间，不复用旧配音时间轴，不沿用旧Edge时间轴。识别错字依据实际请求稿校正，例：钢墙、3D、老鹰。
- 字体Microsoft YaHei来自Windows本机授权，栅格化导出不分发字体；真实游戏模型与原创程序音效来源见media-kit/sources.json。封面由真实截图加排版，无AI生成图。
- 投稿仅准备文件，没有上传。账号具体投稿页未核对，不宣称已通过平台内预览。AI声明按实际来源设置。
- 制作过程使用game-video与computer-use技能，在本机必剪创建并导出配音工程。没有使用任何账户发布操作。
- 旧版保留在../revision-20260930与../debut-20260930；另一制作目录debut-20260930-claude未触碰。
''',encoding='utf8')
(W/'交付清单.txt').write_text('新版投稿入口：../final/bilibili-zh/\n1080p横屏 / 30fps / 约50秒 / 必剪曼波女声 / 原生正常语速 / 烧录同步字幕\n视频、4:3与16:9封面、投稿文案齐备。旧版本保留。\n发布前试听确认（工具不能主观听审）。\n重建：render.py → package.py；输入素材和音轨均保留work中。',encoding='utf-8-sig')
print(json.dumps(production,ensure_ascii=False))

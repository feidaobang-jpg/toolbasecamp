"""Package final public fields and validated relative references."""
import json,hashlib,subprocess
from pathlib import Path
from PIL import Image
R=Path(__file__).resolve().parent;ROOT=R.parents[4];F=R.parent/'final/bilibili-zh';P=R/'publish/bilibili-zh';P.mkdir(parents=True,exist_ok=True)
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
render=json.loads((R/'qa-render.json').read_text(encoding='utf-8'));title='按下C，钻进游戏里：五款游戏的第一人称实战'
link='https://www.bilibili.com/toy/feidao-games/index.html'
vote='https://www.zhengxiaohui.cn/game-vote.html'
description='坦克大战、超级玛丽、赤色要塞、恐龙快打、虫潮围城：在同一局里切换视角，看看驾驶、跳跃和贴身交战变成第一人称后是什么感觉。\n五款Toy试玩合集：'+link+'\n电脑按C切换视角，Q/E转头；手机可点切换视角、拖动画面观察。第一人称更贴近现场，俯视和侧视方便看清全局。\n各作由GPT、Claude等AI辅助开发，本轮由Codex辅助更新。视频为录制时版本，以当前试玩为准。\n投票／愿望单（复制到浏览器）：'+vote+'（百宝箱→游戏→自研游戏投票榜）'
comment='你最想用第一人称玩哪款？电脑按C切视角，手机点切换视角并拖动画面观察。\n五款Toy试玩合集：'+link+'\n投票／愿望单（复制到浏览器）：'+vote+'（百宝箱→游戏→自研游戏投票榜）'
tags=['bilibilitoy','第一人称','游戏开发','独立游戏','坦克大战','恐龙快打','虫潮围城','GPT','AI']
topic={'name':'哔哩哔哩Toy创意挑战','url':'https://www.bilibili.com/v/topic/detail?topic_id=1346285','selected_in_platform':False,'note':'发布阶段核对当前话题入口；历史实测Claude普通标签被平台拒绝，制作来源保留简介'}
txt='【标题】\n'+title+'\n\n【标签】\n'+'\n'.join(tags)+'\n\n【话题】\n'+topic['name']+' '+topic['url']+'\n\n【简介】\n'+description+'\n\n【置顶评论】\n'+comment+'\n'
(F/'投稿文案.txt').write_text(txt,encoding='utf-8-sig')
covers={}
for name,purpose in [('home_4_3','首页推荐'),('space_16_9','个人空间')]:
    file='cover-home-4x3.jpg' if name=='home_4_3' else 'cover-space-16x9.jpg';w,h=Image.open(F/file).size
    assert w*3==h*4 if name=='home_4_3' else w*9==h*16
    covers[name]={'file':'../../../final/bilibili-zh/'+file,'width':w,'height':h,'purpose':purpose}
manifest={'variant_id':'bilibili-zh','platform':'bilibili','content_type':'gameplay-update','language':'zh-CN','game_name':'五款游戏第一人称专题','video_file':'../../../final/bilibili-zh/gameplay-zh-final.mp4','media_id':'shared-zh','video_sha256':render['sha256'],'width':1920,'height':1080,'duration_seconds':render['duration'],'title':title,'description':description,'tags':tags,'topic':topic,'pinned_comment_draft':comment,'description_file':'../../../final/bilibili-zh/投稿文案.txt','cover_file':covers['home_4_3']['file'],'cover_files':covers,'cover_text':'换个视角，亲自上场','cover_selection_source':'本期坦克与虫潮实机帧','cover_upload_mode':'custom_image','subtitle_mode':'burned_in','disclosures':['含AI生成内容'],'ready_to_upload':False,'blocking_issues':['待本期用户人工审片通过；当前工具未完成主观听审'],'unverified_fields':['发布时话题入口与平台设置'],'publication_status':'not_uploaded'}
save(P/'publish.json',manifest);save(R/'publish.json',{'schema_version':2,'requested_variants':['bilibili-zh'],'variants':[{'variant_id':'bilibili-zh','manifest_file':'publish/bilibili-zh/publish.json','ready_to_upload':False,'blocking_issues':manifest['blocking_issues']}],'ready_to_upload':False})
sources=[]
for game in ['tank-3d','mario-3d','jackal-stage1-3d','cadillacs-stage1-3d','starship-defense']:
    cap=json.loads((R/'capture'/game/'capture.json').read_text(encoding='utf-8'))
    data=json.loads(subprocess.check_output(['git','show',cap['buildCommit']+':game-projects/'+game+'/media-kit/game.json'],cwd=ROOT,encoding='utf-8'))
    sources.append({'game':game,'version':data['current_version'],'source_commit':cap['buildCommit'],'normal_gameplay':cap['normalGameplay'],'page_errors':cap['errors'],'toy':data.get('toy'),'model':data.get('development_model',data.get('dev',{}).get('model'))})
save(R/'sources.json',sources)
(R/'sources.md').write_text('# 素材来源\n\n全部画面为2026-10-06本期新录制的本机浏览器实机，固定主线cc0e8e27，正常模式自动试玩；没有生成动画、原作视频或旧成片。游戏版本及已发布Toy映射见sources.json。\n\n游戏原音从当前构建Web Audio实际输出采集；原作音乐来源见各作media-kit及site-games/releases/unified3d-20261006/audio-sources.json。不另加曲库音乐。\n\n中文配音：Edge在线神经合成zh-CN-YunxiNeural，正常语速；请求和时间戳保留。没有克隆私人音色。\n\n字体：本机Microsoft YaHei，用于栅格化字幕和封面，字体文件不再分发。封面是本期实机帧裁切与排版，没有生成新模型细节。\n\n现有游戏素材许可与原作音频授权记录不在本任务改写；平台声明与素材授权条件在实际发布时继续核对。\n',encoding='utf-8')
(R/'交付清单.txt').write_text('本期投稿入口：../final/bilibili-zh/\n中文16:9 1920×1080，时长 '+str(round(render['duration'],2))+' 秒，中文字幕已烧录。\n成片：gameplay-zh-final.mp4\n首页封面：cover-home-4x3.jpg\n空间封面：cover-space-16x9.jpg\n投稿文案：投稿文案.txt\n状态：成片已生成，待用户人工审片；尚未投稿。当前工具未完成主观听审，客观音频检查与画面验收见qa.md。\n续接：修改narration.json后运行voice.py；清除受影响edit/shared-zh片段后运行render.py；covers.py重新输出双封面，package.py更新文案与清单。\n',encoding='utf-8-sig')
for ref in [manifest['video_file'],manifest['description_file'],*(x['file'] for x in covers.values())]:assert (P/ref).resolve().is_file(),ref
print('PACKAGE COMPLETE',title)

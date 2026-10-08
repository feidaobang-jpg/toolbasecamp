"""Build three distinct review manifests and final platform copy from verified local media."""
from pathlib import Path
import json,hashlib,subprocess,datetime,html,re
R=Path(__file__).resolve().parent;P=R.parent;F=P/'final'
stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,data):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(p)],text=True,encoding='utf-8'))
title='愿望榜第一名做出来了：双人塔防还能4对4｜虫潮围城'
toy='https://www.bilibili.com/toy/chongchao-qianshao/index.html'
vote='https://www.zhengxiaohui.cn/game-vote.html'
site='https://www.zhengxiaohui.cn/games.html'
credit='虫潮对战模式由 Claude 开发，Codex 完成接管核验与本期视频制作。'
bili_desc='网友想玩双人对战塔防，我把它做进虫潮围城：定时赚钱、升级银行、派兵拆核心，从1对1扩到4对4；本片含电脑对战与队伍操作演示。\n哔哩哔哩 Toy 试玩：'+toy+'\n百宝箱试玩（复制到浏览器）：'+site+'\n'+credit+'\n投票／愿望单（复制到浏览器）：'+vote+' （百宝箱 → 游戏 → 自研游戏投票榜）'
comment='你会先升级银行，还是先出兵？点开虫潮围城，主菜单选择「虫潮对战」。\nToy 试玩：'+toy+'\n投票／愿望单（复制到浏览器）：'+vote+' （百宝箱 → 游戏 → 自研游戏投票榜）'
yt_desc='游戏试玩：'+site+'\n在列表选择「虫潮围城」，主菜单进入「虫潮对战」；链接不可点击时可复制到浏览器。\n愿望榜第一名的双人对战塔防已可试玩，支持1对1到4对4、独立银行与队伍转账。本片演示普通规则电脑对战，4对4段落为1个玩家席位加7个电脑。\n'+credit+'\n你会先升级银行，还是先出兵？\n玩法建议／愿望单：'+vote
en_title='I Built the Top-Voted Tower Defense Wish — Now Up to 4v4 | Swarm Siege'
en_desc='Play my games: '+site+'\nChoose 虫潮围城 (Swarm Siege) from the Chinese game list, then select 虫潮对战 (Versus). Copy the URL into your browser if it is not clickable.\nThe top-voted wish is playable: earn income, upgrade your bank and deploy troops, from 1v1 to 4v4. Each player has their own economy, with 200-gold team transfers. The recorded 4v4 demonstration uses one player seat and seven bots.\nThe Versus mode was developed with Claude; Codex handled release verification and this video.\nWould you upgrade your bank first, or deploy units first?'
tags=['虫潮围城','塔防','联机游戏','游戏开发','AI','Claude','bilibilitoy']
defs={
 'bilibili-zh':dict(platform='bilibili',video='gameplay-zh-final.mp4',title=title,description=bili_desc,tags=tags,comment=comment,covers={'home_4_3':('cover-home-4x3.jpg',1440,1080,'首页推荐'),'space_16_9':('cover-space-16x9.jpg',1920,1080,'个人空间')},subtitle='burned_in'),
 'douyin-zh':dict(platform='douyin',video='gameplay-zh-final.mp4',title='愿望榜第一名做出来了！虫潮对战支持4对4',description='定时赚钱、升级银行、派兵攻城：双人对战塔防已经做进虫潮围城，还能打4对4。试玩入口在百宝箱游戏列表；你会先升级银行，还是先出兵？',tags=['虫潮围城','塔防','游戏开发','AI'],covers={'horizontal_4_3':('cover-horizontal-4x3.jpg',1440,1080,'横版封面'),'portrait_3_4':('cover-portrait-3x4.jpg',1080,1440,'竖版展示封面')},subtitle='burned_in'),
 'youtube-zh':dict(platform='youtube',video='gameplay-youtube-final.mp4',title=title,description=yt_desc,tags=['虫潮围城','塔防','Swarm Siege','tower defense','game development','Claude'],covers={'main_16_9':('cover-zh-16x9.jpg',1920,1080,'中文缩略图')},subtitle='sidecar')}
variants=[]
for variant,cfg in defs.items():
 folder=F/variant;video=folder/cfg['video'];info=probe(video);v=next(s for s in info['streams'] if s['codec_type']=='video')
 covers={k:{'file':'../../../final/'+variant+'/'+filename,'width':w,'height':h,'purpose':purpose,'sha256':digest(folder/filename)} for k,(filename,w,h,purpose) in cfg['covers'].items()}
 text='【标题】\n'+cfg['title']+'\n\n【标签】\n'+'\n'.join(cfg['tags'])
 if variant=='bilibili-zh':text+='\n\n【话题】\n哔哩哔哩Toy创意挑战\nhttps://www.bilibili.com/v/topic/detail?topic_id=1346285'
 text+='\n\n【简介】\n'+cfg['description']
 if cfg.get('comment'):text+='\n\n【置顶评论】\n'+cfg['comment']
 (folder/'投稿文案.txt').write_text(text+'\n',encoding='utf-8-sig')
 data={'variant_id':variant,'platform':cfg['platform'],'content_type':'gameplay_update','language':'zh-CN','audio_language':'zh-CN','packaging_language':'zh-CN','game_name':'虫潮围城','game_version':'web-versus-teams-v0.27.0','video_file':'../../../final/'+variant+'/'+cfg['video'],'media_id':'shared-zh' if variant!='youtube-zh' else 'youtube-zh-clean','video_sha256':digest(video),'width':v['width'],'height':v['height'],'duration_seconds':float(info['format']['duration']),'title':cfg['title'],'description':cfg['description'],'tags':cfg['tags'],'description_file':'../../../final/'+variant+'/投稿文案.txt','cover_file':next(iter(covers.values()))['file'],'cover_files':covers,'cover_upload_mode':'custom_image','cover_text':'愿望榜第一名 / 做成了对战！ / 1对1 → 4对4','cover_selection_source':'current normal-rule gameplay frame, native typography; covers.py and gameplay-source.jpg retained','subtitle_mode':cfg['subtitle'],'subtitle_files':[],'disclosures':{'synthetic_narration':True,'ai_assisted_development':True,'gameplay_is_generated_video':False},'platform_requirements_checked_at':'2026-10-08','human_review':{'status':'pending','required_before_upload':True},'audio_listening_review':'not-run: this model cannot accept audio input; user review required','technical_preparation_complete':True,'ready_to_upload':False,'blocking_issues':['本期最终成片待用户审片；请确认画面、配音与字幕后再发布'],'unverified_fields':['本期投稿页分类及登录状态，上传前重新核对'],'created_at':stamp}
 if cfg.get('comment'):data['pinned_comment_draft']=cfg['comment']
 if variant=='bilibili-zh':
  data.update(topic={'name':'哔哩哔哩Toy创意挑战','url':'https://www.bilibili.com/v/topic/detail?topic_id=1346285','selected_on_platform':False},toy_id='38678478981120',season_id=9248439)
  request=R/'publish'/variant/'Toy推流申请.txt'
  request.parent.mkdir(parents=True,exist_ok=True)
  request.write_text('UP主昵称 | 视频链接（BV长链） | bilibilitoy与Toy创意挑战话题 | 置顶Toy链接 | 视频宣传Toy | 运营反馈\n飞刀班长 | 待审片后投稿取得真实BV | 待实际投稿核验 | 待实际置顶核验 | 成片有Toy试玩引导 | 待运营反馈\n',encoding='utf-8')
 if variant=='youtube-zh':
  data['english_localizations']={'title':en_title,'description':en_desc,'file':'../../../final/youtube-zh/English-localizations.txt'}
  data['platform_sources']=['https://support.google.com/youtube/answer/72431?hl=zh-Hans','https://support.google.com/youtube/answer/2734796?hl=zh-Hans']
  for lang in ['zh','en']:
   name='captions-'+lang+'.srt';data['subtitle_files'].append({'file':'../../../final/youtube-zh/'+name,'language':'zh-CN' if lang=='zh' else 'en','purpose':'selectable captions','required_for_upload':True,'sha256':digest(folder/name)})
  (folder/'English-localizations.txt').write_text('【Title】\n'+en_title+'\n\n【Description】\n'+en_desc+'\n',encoding='utf-8')
 write(R/'publish'/variant/'publish.json',data);variants.append({'variant_id':variant,'manifest_file':'publish/'+variant+'/publish.json','ready_to_upload':False,'blocking_issues':data['blocking_issues']})
write(R/'publish.json',{'schema_version':2,'game_name':'虫潮围城','game_version':'web-versus-teams-v0.27.0','requested_variants':list(defs),'variants':variants,'technical_preparation_complete':True,'human_review_status':'pending','ready_to_upload':False,'post_publication':{'toy_bind':True,'season_id':9248439,'wishlist_video_url':'fill only after real BV is public','x':'free official capability only; skip paid access'}})
# Review HTML is a local page, never an upload or public publication.
cards=[]
for variant,cfg in defs.items():
 track=''
 if variant=='youtube-zh':track='<track kind="subtitles" src="../../final/youtube-zh/captions-zh.vtt" srclang="zh" label="中文" default><track kind="subtitles" src="../../final/youtube-zh/captions-en.vtt" srclang="en" label="English">'
 cards.append(f'<section><h2>{variant}</h2><p>{"中文配音与烧录中文字幕；B站、抖音共用同一成片。" if variant!="youtube-zh" else "中文配音，画面无烧录解说字幕；中英字幕附件需上传，审片时可切换。"}</p><video controls preload="metadata" poster="../../final/{variant}/{next(iter(cfg["covers"].values()))[0]}" src="../../final/{variant}/{cfg["video"]}">{track}</video><p><a href="../../final/{variant}/投稿文案.txt">投稿文案</a></p></section>')
review=R/'review';review.mkdir(exist_ok=True)
for lang in ['zh','en']:
 srt=(F/'youtube-zh'/('captions-'+lang+'.srt')).read_text(encoding='utf-8')
 (review/('captions-'+lang+'.vtt')).write_text('WEBVTT\n\n'+re.sub(r'(\d\d:\d\d:\d\d),(\d{3})',r'\1.\2',srt),encoding='utf-8')
# Keep VTT only in work; user uploads the final SRT files.
content='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>虫潮对战 · 审片</title><style>body{margin:0;background:#0c1723;color:#e6edf3;font:16px/1.7 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:28px 20px}h1{color:#ffe297}section{margin:30px 0;padding:24px;background:#142736;border-radius:18px}video{width:100%;max-height:650px;background:#000}a{color:#85e4d1}p{color:#bdd0dd}.notice{border-left:4px solid #76e0ce;padding:12px 18px;background:#142736}</style><main><h1>愿望榜第一名做成了对战</h1><p class="notice">三平台成片均为1080p横屏中文配音。请完整观看，确认画面、声音、字幕和收尾；在原聊天回复“可以发布”，即可继续发布这套版本。网站愿望单已更新，视频尚待本期审片。</p>'+''.join(cards)+'</main></html>'
# Correct local tracks to retained work VTT, not invented final upload files.
content=content.replace('../../final/youtube-zh/captions-zh.vtt','captions-zh.vtt').replace('../../final/youtube-zh/captions-en.vtt','captions-en.vtt')
(review/'index.html').write_text(content,encoding='utf-8')
(R/'交付清单.txt').write_text('虫潮对战：愿望榜第一名兑现\n当前阶段：网站愿望单已部署；三平台成片与物料已生成，最终人工审片待通过，未上传。\nB站 / 抖音：final各自目录，中文配音与烧录字幕，共用相同视频哈希。\nYouTube：final/youtube-zh，中文原声干净版、中文与英文SRT、中文主包装及英文元数据翻译。\n最终文件与物料哈希：work/publish.json及各平台清单。\n审核入口：work/review/index.html。\n已做客观音频检查；当前模型无法接受音频输入，不宣称已主观听审。请用户在审片中确认人声与混音。\n',encoding='utf-8')
print('PACKAGE DONE',list(defs))

"""Render the review package from normal-rule recordings and measured Yunxi voice boundaries."""
from pathlib import Path
import json,subprocess,sys,re,wave,math,hashlib,os,textwrap
from PIL import Image,ImageDraw,ImageFont,ImageOps
sys.stdout.reconfigure(encoding='utf-8')
R=Path(__file__).resolve().parent;E=R/'edit/shared-zh';A=R/'audio/shared-zh';FINAL=R.parent/'final'
E.mkdir(parents=True,exist_ok=True);(E/'shots').mkdir(exist_ok=True)
for v in ['bilibili-zh','douyin-zh','youtube-zh']:(FINAL/v).mkdir(parents=True,exist_ok=True)
FONT='C:/Windows/Fonts/msyh.ttc';BOLD='C:/Windows/Fonts/msyhbd.ttc'
def ff(args):subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)
def font(size,bold=False):return ImageFont.truetype(BOLD if bold else FONT,size)
def write(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
def wrap(text,width,d,f):
 lines=[];line=''
 for ch in text:
  if d.textlength(line+ch,font=f)>width:lines.append(line);line=''
  line+=ch
 if line:lines.append(line)
 return lines
def card(name,title,kicker,body,footer):
 im=Image.new('RGB',(1920,1080),'#0c1723');d=ImageDraw.Draw(im)
 d.rectangle((0,0,1920,12),fill='#76e0ce');d.text((100,84),kicker,font=font(34,True),fill='#76e0ce')
 d.text((100,170),title,font=font(76,True),fill='#fff0b3')
 y=330
 for line in body:
  for text in wrap(line,1690,d,font(44)):
   d.text((100,y),text,font=font(44),fill='#e3edf2');y+=64
  y+=18
 d.text((100,949),footer,font=font(27),fill='#b5c6d1');im.save(E/name)
board=json.loads((R/'qa/board-before.json').read_text(encoding='utf-8'))
wish=next(w for w in board['wishlist'] if w['id']==11)
card('wish.png','双人对战塔防','网友愿望 · 开发前榜首 · 11 票',[
 '“'+wish['note']+'”','定时收入  /  升级银行  /  不同兵种攻城  /  好友线上对决'],
 '来源：百宝箱游戏愿望单 · 用户提交 · 2026-10-08 数据快照')
card('result-recap.png','出兵更多，也不等于赢','另一场 4 对 4 · 实际结算',[
 '15:00 时限：我方核心 76%  /  对方核心 91%','结果：我方失败','继续打磨：对局节奏、兵种平衡'],
 '演示：1 名玩家 + 7 名电脑 · 普通规则，未跳时钟或改血量')
card('closing.png','先升级银行，还是先出兵？','虫潮围城 · 愿望已兑现',[
 '1 对 1 — 4 对 4 · 网站 / 哔哩哔哩 Toy 已可试玩','原始需求与 11 票保留 · 其他愿望继续参与选题','愿望单继续收集下一步的玩法建议'],
 '百宝箱 → 游戏 → 自研游戏投票榜 · 试玩入口见简介')
cfg=json.loads((R/'narration.json').read_text(encoding='utf-8'))
english={
 '01-hook':['A viewer asked for head-to-head tower defense.','It is playable now, and even supports four versus four.'],
 '02-wish':['This wish received eleven votes.','The request was specific: earn income over time,','upgrade a bank, deploy different units,','and battle friends online.'],
 '03-mode':['I made it a Versus mode inside 虫潮围城, Swarm Siege.','Play one versus one,','or choose two versus two, three versus three, or four versus four.'],
 '04-bank':['You start with 600 gold.','Spend 500 upgrading your bank,','and only 100 remains.','Want to deploy right away?','Wait for the next income payment.'],
 '05-income':['The bank pays every ten seconds.','Upgrading raises each payment from 60 to 85.','You earn more over time,','but your opponent will not wait for your economy.'],
 '06-units':['Save enough gold, then deploy bug swarms and machine-gun squads.','They advance along your chosen route,','engage enemies,','and try to destroy the opposing core.'],
 '07-hero':['Join your troops on the front line,','shoot, and throw grenades.','Manage your money','and keep an eye on the battlefield.'],
 '08-team':['Each player has a separate wallet and bank in team matches.','You can transfer 200 gold to a teammate.','This four-versus-four demonstration uses me and seven bots.','Online rooms support up to eight human players.'],
 '09-result':['I beat the computer in one versus one,','but lost a separate four-versus-four match.','At the fifteen-minute limit,','our core had 76 percent health left,','and theirs had 91 percent.','Deploying more troops','does not guarantee a win.','Next I will keep refining match pacing and unit balance.'],
 '10-close':['The wish is now marked as fulfilled and playable.','The original request and eleven votes are preserved.','Try it on Bilibili Toy or Treasure Box.','Would you upgrade your bank first, or deploy units first?']}
def norm(t):return ''.join(c.lower() for c in t if c.isalnum())
segments=[];captions=[];en_captions=[];cursor=0
for seg in cfg['segments']:
 wav=A/(seg['id']+'.wav')
 if not wav.exists() or (A/(seg['id']+'.mp3')).stat().st_mtime>wav.stat().st_mtime:
  ff(['-i',A/(seg['id']+'.mp3'),'-ar',48000,'-ac',2,'-c:a','pcm_s16le',wav])
 with wave.open(str(wav)) as w:duration=w.getnframes()/w.getframerate()
 frames=math.ceil((duration+.34)*30)
 if seg['id']=='10-close':frames+=60
 data=json.loads((A/(seg['id']+'.json')).read_text(encoding='utf-8'));marks=data['marks']
 plain=norm(seg['text']);tokens=''.join(norm(m['text']) for m in marks)
 if plain!=tokens:raise ValueError('Word boundaries do not match narration: '+seg['id']+' '+tokens)
 clauses=[x.strip() for x in re.split(r'(?<=[，。？！？])',seg['text']) if x.strip()]
 offset=0;mark_start=0;local=[]
 for i,clause in enumerate(clauses):
  target=offset+len(norm(clause));last=mark_start;count=offset
  while last<len(marks) and count<target:count+=len(norm(marks[last]['text']));last+=1
  start=marks[mark_start]['offset']/1e7;end=(marks[last-1]['offset']+marks[last-1]['duration'])/1e7
  row={'start':cursor+.12+start,'end':min(cursor+frames/30-.05,cursor+.12+end+.07),'text':clause,'segment':seg['id']}
  captions.append(row);local.append(row);offset=target;mark_start=last
 # English entries follow semantic clause boundaries, never estimated by character count.
 en=english[seg['id']]
 if len(en)!=len(local):
  print('EN semantic grouping',seg['id'],len(local),len(en))
  # A paragraph translation is displayed as readable groups anchored to actual boundary groups.
  # These specific grouping maps are retained in the timeline for review.
  groups={
   '01-hook':[(0,1),(1,3)],
   '02-wish':[(0,1),(1,2),(2,4),(4,5)],
   '06-units':[(0,2),(2,3),(3,4),(4,5)],
   '07-hero':[(0,1),(1,3),(3,4),(4,5)],
   '10-close':[(0,1),(1,2),(2,3),(3,5)]
  }.get(seg['id'])
  if not groups or len(groups)!=len(en) or groups[-1][1]!=len(local):raise ValueError('Need explicit English clause map: '+seg['id'])
  en_captions.extend({'start':local[a]['start'],'end':local[b-1]['end'],'text':t,'segment':seg['id']} for (a,b),t in zip(groups,en))
 else:en_captions.extend({**row,'text':t} for row,t in zip(local,en))
 segments.append({**seg,'start':cursor,'end':cursor+frames/30,'duration':frames/30,'voice_duration':duration,'voice_offset':.12,'frames':frames,'wav':str(wav.relative_to(R))})
 cursor+=frames/30
# All motion shots remain at normal speed; short freezes only extend actual result screens.
spec={
 '01-hook':[('capture-1v1/04-late-battle/raw.mp4',6,None,'1 对 1 · 玩家对电脑',False)],
 '02-wish':[('edit/shared-zh/wish.png',0,None,'',True)],
 '03-mode':[('capture-menu/01-menu/raw.mp4',0,None,'规模选择 · 当前版本',False)],
 '04-bank':[('capture/01-bank-and-opening/raw.mp4',0,None,'4 对 4 · 银行升级',False)],
 '05-income':[('capture/01-bank-and-opening/raw.mp4',9,None,'每 10 秒结算收入 · 开局阶段',False)],
 '06-units':[('capture-units/01-unit-deployment/raw.mp4',1,5.6,'1 对 1 · 出兵操作演示',False),('capture-1v1/03-early-battle/raw.mp4',31,None,'1 对 1 · 实际交战',False)],
 '07-hero':[('capture-1v1/03-early-battle/raw.mp4',36,None,'1 对 1 · 实际交战',False)],
 '08-team':[('capture-team/01-team-transfer/raw.mp4',0,None,'4 对 4 · 1 名玩家 + 7 名电脑',False)],
 '09-result':[('capture-1v1/06-real-result/raw.mp4',0,3.2,'1 对 1 · 13:27 实际结算',False),('capture/06-real-result/raw.mp4',0,6,'另一场 4 对 4 · 15:00 实际结算',False),('edit/shared-zh/result-recap.png',0,None,'',True)],
 '10-close':[('qa/production-hub-1440.png',0,4.6,'愿望单 · 网站已上线',True),('edit/shared-zh/closing.png',0,None,'',True)]}
def ass_time(t):return f'{int(t//3600)}:{int(t//60)%60:02}:{int(t)%60:02}.{round((t%1)*100)%100:02}'
def srt_time(t):ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
def srt(rows):return '\n\n'.join(f'{i+1}\n{srt_time(r["start"])} --> {srt_time(r["end"])}\n'+('\n'.join(textwrap.wrap(r['text'],width=68,break_long_words=False)) if re.search('[a-zA-Z]{3}',r['text']) else r['text']) for i,r in enumerate(rows))+'\n'
ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,46,&H00FFFFFF,&H00FFFFFF,&H00201810,&H99000000,-1,0,0,0,100,100,0,0,1,3,1,2,150,150,300,1
Style: Label,Microsoft YaHei,28,&H00D7EFEB,&H00FFFFFF,&H00101820,&H99000000,0,0,0,0,100,100,0,0,1,2,0,2,70,70,118,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
for row in captions:
 text=row['text'];text='\\N'.join([text[i:i+24] for i in range(0,len(text),24)])
 caption_x=1430 if row["segment"]=="09-result" else 960
 ass+=f'Dialogue: 1,{ass_time(row["start"])},{ass_time(row["end"])},Default,,0,0,0,,{{\\an2\\pos({caption_x},775)}}{text}\n'
picture_ass=ass.split('[Events]')[0]+'[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
shots=[]
for seg in segments:
 remaining=seg['frames'];local_cursor=seg['start']
 for source,source_in,seconds,label,still in spec[seg['id']]:
  count=remaining if seconds is None else min(remaining,round(seconds*30));remaining-=count;duration=count/30
  index=len(shots);target=E/'shots'/f'{index:02d}.mp4';full=R/source
  shot={'index':index,'segment':seg['id'],'start':local_cursor,'end':local_cursor+duration,'duration':duration,'frames':count,'source':source,'source_in':source_in,'source_out':source_in+duration,'speed':1,'label':label,'still':still}
  shots.append(shot)
  if label:
   line=f'Dialogue: 0,{ass_time(local_cursor)},{ass_time(local_cursor+duration)},Label,,0,0,0,,{{\\an2\\pos(960,952)}}{label}\n';ass+=line;picture_ass+=line
  fingerprint={**shot,'source_size':full.stat().st_size,'source_mtime_ns':full.stat().st_mtime_ns,'encoding_schema':'bt709-limited-v2'}
  cache=target.with_suffix('.json')
  if not target.exists() or not cache.exists() or json.loads(cache.read_text(encoding='utf-8'))!=fingerprint:
   params='setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709'
   if still:args=['-loop','1','-framerate',30,'-i',full,'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-vf','scale=1920:1080:force_original_aspect_ratio=decrease:in_range=full:out_range=limited:out_color_matrix=bt709,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0c1723,setsar=1,format=yuv420p,'+params]
   else:args=['-ss',source_in,'-i',full,'-filter_complex','[0:v]setpts=PTS-STARTPTS,fps=30,scale=1920:1080:in_range=full:out_range=limited:out_color_matrix=bt709,setsar=1,format=yuv420p,'+params+',tpad=stop_mode=clone:stop_duration=2[v];[0:a]asetpts=PTS-STARTPTS,aresample=48000,apad[a]','-map','[v]','-map','[a]']
   ff([*args,'-t',duration,'-c:v','h264_nvenc','-preset','p5','-cq',17,'-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-ar',48000,'-ac',2,'-b:a','192k',target]);write(cache,fingerprint);print('shot',index,seg['id'],duration,flush=True)
  local_cursor+=duration
 if remaining:raise ValueError('Incomplete visual coverage '+seg['id'])
timeline={'width':1920,'height':1080,'fps':30,'duration':cursor,'segments':segments,'shots':shots,'subtitles':captions,'english_subtitles':en_captions,'time_scale':1,'normal_rules':True}
write(E/'timeline.json',timeline);(E/'captions.ass').write_text(ass,encoding='utf-8');(E/'labels.ass').write_text(picture_ass,encoding='utf-8')
(E/'captions-zh.srt').write_text(srt(captions),encoding='utf-8');(E/'captions-en.srt').write_text(srt(en_captions),encoding='utf-8')
concat=E/'shots.ffconcat';concat.write_text('\n'.join("file 'shots/%02d.mp4'"%s['index'] for s in shots),encoding='utf-8')
picture=E/'picture-with-game-audio.mp4'
ff(['-f','concat','-safe',0,'-i',concat,'-c','copy',picture])
# Compose decoded PCM samples with exact per-segment offsets; no speed-up or estimated subtitle times.
voice_pcm=bytearray(round(cursor*48000)*4)
for seg in segments:
 with wave.open(str(R/seg['wav'])) as w:data=w.readframes(w.getnframes())
 start=round((seg['start']+seg['voice_offset'])*48000)*4;voice_pcm[start:start+len(data)]=data
with wave.open(str(A/'narration.wav'),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(48000);w.writeframes(voice_pcm)
mix=A/'mix-pre.wav';fade=cursor-1.5
ff(['-i',picture,'-i',A/'narration.wav','-filter_complex',f'[0:a]volume=0.2,afade=t=out:st={fade}:d=1.5[g];[1:a]highpass=f=70,asplit=2[v][sc];[g][sc]sidechaincompress=threshold=0.025:ratio=6:attack=12:release=180[d];[d][v]amix=inputs=2:normalize=0,atrim=0:{cursor}[a]','-map','[a]','-ar',48000,'-ac',2,mix])
p=subprocess.run(['ffmpeg','-hide_banner','-i',str(mix),'-af','loudnorm=I=-16:TP=-1:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf-8',check=True)
stats=json.JSONDecoder().raw_decode(p.stderr[p.stderr.rfind('{'):])[0];write(E/'loudnorm-pass1.json',stats)
normfilter=f"loudnorm=I=-16:TP=-1:LRA=11:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
ff(['-i',mix,'-af',normfilter,'-ar',48000,'-ac',2,A/'final-mix.wav'])
ff(['-i',picture,'-vn','-c:a','pcm_s16le',A/'game-edit.wav'])
os.chdir(E)
for variant,subtitle,file in [('bilibili-zh','captions.ass','gameplay-zh-final.mp4'),('youtube-zh','labels.ass','gameplay-youtube-final.mp4')]:
 dest=FINAL/variant/file
 ff(['-i',picture,'-i',A/'final-mix.wav','-map','0:v','-map','1:a','-vf',f'ass={subtitle},fade=t=out:st={fade}:d=1.5','-t',cursor,'-c:v','h264_nvenc','-preset','p5','-cq',17,'-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-ar',48000,'-movflags','+faststart',dest]);print('FINAL',variant,round(cursor,2),flush=True)
from shutil import copy2
source=FINAL/'bilibili-zh/gameplay-zh-final.mp4';dest=FINAL/'douyin-zh/gameplay-zh-final.mp4'
if dest.exists():dest.unlink()
os.link(source,dest)
copy2(E/'captions-zh.srt',FINAL/'youtube-zh/captions-zh.srt');copy2(E/'captions-en.srt',FINAL/'youtube-zh/captions-en.srt')

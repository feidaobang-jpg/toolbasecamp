"""Native 1080p edit; measured Yunxi word boundaries and original game audio."""
from pathlib import Path
import json,subprocess,re,wave,math,os,textwrap,hashlib
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parent;E=R/'edit/shared-zh';A=R/'audio/shared-zh';FINAL=R.parent/'final'
E.mkdir(parents=True,exist_ok=True);(E/'shots').mkdir(exist_ok=True)
for v in ['bilibili-zh','douyin-zh','youtube-zh']:(FINAL/v).mkdir(parents=True,exist_ok=True)
def ff(args):subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)
def write(p,o):p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def norm(t):return re.sub(r'[^\w\u4e00-\u9fff]','',t).casefold()
cfg=json.loads((R/'narration.json').read_text(encoding='utf-8'))
english={
'01-hook':['This RV is heading into a zombie-infested town.','Can I bring it back in one piece?','In Swarm Siege this time,','I want to search for supplies','while finding a route out.'],
'02-route':['This time, I am leaving base defense behind.','You can freely explore the abandoned town streets','and choose among six infected districts.','First, I drive to a garage','and upgrade the roof-mounted machine gun.'],
'03-prepare':['The upgrade costs 90 scrap','and takes five seconds while parked.','Then I fill the tank at a gas station','before heading into an infected district.'],
'04-homes':['I turn into the old residential district.','Zombies spot the RV and start chasing it.','I clear some space with the roof gun,','then get out and approach the supply crate.','Searching takes four seconds.','I find 110 scrap,','plus canned food and a medkit.'],
'05-like':['The trip is already paying for itself.','If you enjoy driving out to scavenge,','leave a like.'],
'06-market':['The abandoned supermarket still has an emergency vending machine.','I spend 12 scrap on another can of food','in case I get hurt on foot.','With supplies stocked,','I head to the town square.'],
'07-square':['Seven zombies chase the RV here.','The machine gun clears some room,','then I get out to search.','I am unhurt,','but the RV has taken damage.','My next stop needs to be a garage.'],
'08-repair':['I detour to the north-street garage.','For 40 scrap','and six seconds parked,','the RV is back to full durability.','You do not have to clear the entire map;','you can choose to leave at the northern camp.'],
'09-result':['I successfully evacuate.','I searched two districts,','defeated 12 zombies,','and brought out 314 scrap.','I have not searched all six districts.','Next time, I will try a full scavenging route.'],
'10-close':['RV mode is already playable on Bilibili Toy.','Would you upgrade the gun first','or add armor?','You can also visit the Treasure Box game voting page','and suggest what you want to play.']}
cursor=0;captions=[];en_captions=[];segments=[]
for seg in cfg['segments']:
 wav=A/(seg['id']+'.wav');ff(['-i',A/(seg['id']+'.mp3'),'-ar',48000,'-ac',2,'-c:a','pcm_s16le',wav])
 with wave.open(str(wav)) as w:duration=w.getnframes()/w.getframerate()
 frames=math.ceil((duration+.34)*30)+(60 if seg['id']=='10-close' else 0)
 marks=json.loads((A/(seg['id']+'.json')).read_text(encoding='utf-8'))['marks'];assert norm(seg['text'])==''.join(norm(m['text']) for m in marks),seg['id']
 clauses=[x.strip() for x in re.split(r'(?<=[，。？！？])',seg['text']) if x.strip()];assert len(clauses)==len(english[seg['id']])
 offset=0;mark_start=0
 for clause,translated in zip(clauses,english[seg['id']]):
  target=offset+len(norm(clause));last=mark_start;count=offset
  while last<len(marks) and count<target:count+=len(norm(marks[last]['text']));last+=1
  start=marks[mark_start]['offset']/1e7;end=(marks[last-1]['offset']+marks[last-1]['duration'])/1e7
  row={'start':cursor+.12+start,'end':min(cursor+frames/30-.05,cursor+.12+end+.07),'text':clause,'segment':seg['id']};captions.append(row);en_captions.append({**row,'text':translated});offset=target;mark_start=last
 segments.append({**seg,'start':cursor,'end':cursor+frames/30,'duration':frames/30,'voice_duration':duration,'voice_offset':.12,'frames':frames,'wav':str(wav.relative_to(R))});cursor+=frames/30
# The opening preview is labeled; the main trip otherwise proceeds chronologically.
take='journey-02';raw=f'capture/{take}/raw.mp4'
cap=json.loads((R/f'capture/{take}/capture.json').read_text(encoding='utf-8'))
zero=cap['frames'][0]['timestamp']-cap['started']/1000
event={row['name']:row['t']-zero for row in cap['events']}
spec={
'01-hook':[(raw,event['square-arrive']-.8,4.1,'本趟实战预览',False),(raw,3.5,None,'从出发说起 · 普通规则实战',False)],
'02-route':[(raw,9.2,None,'自由探索 · 先整备房车',False)],
'03-prepare':[(raw,event['garage-arrive']+.5,3.8,'南街修理厂 · 改装机枪',False),(raw,event['fuel-arrive']+.8,None,'加油站 · 补满燃料',False)],
'04-homes':[(raw,event['homes-arrive']-2.1,6.9,'旧住宅区 · 实际交战',False),(raw,event['homes-on-foot']-2.0,3.2,'下车走近物资箱 · 搜索4秒',False),(raw,event['homes-searched']-1.0,None,'搜索完成 · 补给入账',False)],
'05-like':[(raw,event['homes-boarded']+.3,None,'搜索所得保留 · 前往超市',False)],
'06-market':[(raw,event['market-arrive']-.6,None,'废弃超市 · 应急售货机',False)],
'07-square':[(raw,event['square-arrive']-2.4,4.5,'市政广场 · 实际交战',False),(raw,event['square-on-foot']-1.3,None,'下车搜索 · 房车已有损伤',False)],
'08-repair':[(raw,event['repair-arrive']-.4,4.2,'北街修理厂 · 停车维修',False),(raw,event['vehicle-repaired']-.4,None,'实际维修完成 · 自由选择撤离',False)],
'09-result':[(raw,event['evacuated']-.3,None,'本趟实际结算 · 2/6区',False)],
'10-close':[(raw,event['vehicle-repaired']+1.8,11.3,'本趟撤离途中 · 余镜',False),('edit/shared-zh/closing.png',0,None,'',True)]}
# A short final card uses the real recorded result as its background.
shot=R/f'capture/{take}/final-result.png';im=Image.open(shot).convert('RGB');overlay=Image.new('RGBA',im.size,(8,18,25,205));im=Image.alpha_composite(im.convert('RGBA'),overlay);d=ImageDraw.Draw(im)
f=lambda n:ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
for y,text,size,color in [(290,'虫潮围城 · 房车生存',78,'#ffe39b'),(450,'2/6 区 · 击退 12 只 · 带出 314 零件',46,'#e8f4ef'),(585,'哔哩哔哩 Toy 已可试玩',52,'#8be1ca'),(740,'下一趟：挑战搜全六区',42,'#e8f4ef')]:d.text((960,y),text,font=f(size),fill=color,anchor='mt')
im.convert('RGB').save(E/'closing.png')
def ass_time(t):cs=round(t*100);return f'{cs//360000}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'
def srt_time(t):ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
def srt(rows):return '\n\n'.join(f'{i+1}\n{srt_time(r["start"])} --> {srt_time(r["end"])}\n'+('\n'.join(textwrap.wrap(r['text'],width=65,break_long_words=False)) if re.search('[a-zA-Z]{3}',r['text']) else r['text']) for i,r in enumerate(rows))+'\n'
header='''[Script Info]
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
ass=header;labels=header
for row in captions:
 text='\\N'.join([row['text'][i:i+23] for i in range(0,len(row['text']),23)])
 ass+=f'Dialogue: 1,{ass_time(row["start"])},{ass_time(row["end"])},Default,,0,0,0,,{{\\an2\\pos(960,775)}}{text}\n'
shots=[]
for seg in segments:
 remaining=seg['frames'];local=seg['start']
 for source,source_in,seconds,label,still in spec[seg['id']]:
  count=remaining if seconds is None else min(remaining,round(seconds*30));remaining-=count;duration=count/30;index=len(shots);target=E/'shots'/f'{index:02d}.mp4';full=R/source
  s={'index':index,'segment':seg['id'],'start':local,'end':local+duration,'duration':duration,'source':source,'source_in':source_in,'source_out':source_in+duration,'speed':1,'label':label,'still':still};shots.append(s)
  if label:
   line=f'Dialogue: 0,{ass_time(local)},{ass_time(local+duration)},Label,,0,0,0,,{{\\an2\\pos(960,954)}}{label}\n';ass+=line;labels+=line
  if still:args=['-loop','1','-framerate',30,'-i',full,'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-vf','format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709']
  else:args=['-ss',source_in,'-i',full,'-filter_complex','[0:v]setpts=PTS-STARTPTS,fps=30,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=8[v];[0:a]asetpts=PTS-STARTPTS,aresample=48000,apad[a]','-map','[v]','-map','[a]']
  ff([*args,'-t',duration,'-c:v','h264_nvenc','-preset','p5','-cq',17,'-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-ar',48000,'-ac',2,'-b:a','192k',target]);local+=duration;print('shot',seg['id'],round(duration,2),flush=True)
 assert remaining==0
timeline={'width':1920,'height':1080,'fps':30,'duration':cursor,'segments':segments,'shots':shots,'subtitles':captions,'english_subtitles':en_captions,'time_scale':1,'normal_rules':True,'original_capture':f'capture/{take}/capture.json','result_screen_hold_only':True};write(E/'timeline.json',timeline)
(E/'captions.ass').write_text(ass,encoding='utf-8');(E/'labels.ass').write_text(labels,encoding='utf-8');(E/'captions-zh.srt').write_text(srt(captions),encoding='utf-8');(E/'captions-en.srt').write_text(srt(en_captions),encoding='utf-8')
(E/'shots.ffconcat').write_text('\n'.join("file 'shots/%02d.mp4'"%s['index'] for s in shots),encoding='utf-8');picture=E/'picture-with-game-audio.mp4';ff(['-f','concat','-safe',0,'-i',E/'shots.ffconcat','-c','copy',picture])
pcm=bytearray(round(cursor*48000)*4)
for seg in segments:
 with wave.open(str(R/seg['wav'])) as w:data=w.readframes(w.getnframes())
 start=round((seg['start']+seg['voice_offset'])*48000)*4;pcm[start:start+len(data)]=data
with wave.open(str(A/'narration.wav'),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(48000);w.writeframes(pcm)
fade=cursor-1.5;mix=A/'mix-pre.wav'
ff(['-i',picture,'-i',A/'narration.wav','-filter_complex',f'[0:a]volume=0.16,afade=t=out:st={fade}:d=1.5[g];[1:a]highpass=f=70,asplit=2[v][sc];[g][sc]sidechaincompress=threshold=0.025:ratio=6:attack=12:release=180[d];[d][v]amix=inputs=2:normalize=0,atrim=0:{cursor}[a]','-map','[a]','-ar',48000,'-ac',2,mix])
p=subprocess.run(['ffmpeg','-hide_banner','-i',str(mix),'-af','loudnorm=I=-16:TP=-1:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf-8',check=True);stats=json.JSONDecoder().raw_decode(p.stderr[p.stderr.rfind('{'):])[0];write(E/'loudnorm-pass1.json',stats)
nf=f"loudnorm=I=-16:TP=-1:LRA=11:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true";ff(['-i',mix,'-af',nf,'-ar',48000,'-ac',2,A/'final-mix.wav']);ff(['-i',picture,'-vn','-c:a','pcm_s16le',A/'game-edit.wav'])
os.chdir(E)
for variant,subtitle,file in [('bilibili-zh','captions.ass','gameplay-zh-final.mp4'),('youtube-zh','labels.ass','gameplay-youtube-final.mp4')]:
 ff(['-i',picture,'-i',A/'final-mix.wav','-map','0:v','-map','1:a','-vf',f'ass={subtitle},fade=t=out:st={fade}:d=1.5','-t',cursor,'-c:v','h264_nvenc','-preset','p5','-cq',17,'-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-ar',48000,'-movflags','+faststart',FINAL/variant/file]);print('FINAL',variant,round(cursor,2),flush=True)
from shutil import copy2
src=FINAL/'bilibili-zh/gameplay-zh-final.mp4';dest=FINAL/'douyin-zh/gameplay-zh-final.mp4'
if dest.exists():dest.unlink()
os.link(src,dest);copy2(E/'captions-zh.srt',FINAL/'youtube-zh/captions-zh.srt');copy2(E/'captions-en.srt',FINAL/'youtube-zh/captions-en.srt')

"""1080p revision: native GPU gameplay, BCut voice, actual BCut ASR boundaries."""
import json,subprocess,re,math,hashlib,shutil
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont
W=Path(__file__).resolve().parent; G=W.parents[2]; F=W.parent/'final/bilibili-zh';FF='D:/sd/ffmpeg/bin/ffmpeg.exe'
for p in [F,W/'edit',W/'qa',W/'audio',W/'publish/bilibili-zh']:p.mkdir(parents=True,exist_ok=True)
def run(a):
 p=subprocess.run([FF,'-hide_banner','-y',*map(str,a)],cwd=W,capture_output=True,encoding='utf8',errors='replace')
 if p.returncode:raise RuntimeError(p.stderr[-4000:])
 return p.stderr
def font(n):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
def still(name,title,photo,footer):
 im=Image.new('RGB',(1920,1080),'#091a20');d=ImageDraw.Draw(im)
 pic=ImageOps.contain(Image.open(photo).convert('RGB'),(1720,740));im.paste(pic,((1920-pic.width)//2,190))
 d.text((90,65),title,font=font(60),fill='#ffe27a');d.text((90,1005),footer,font=font(30),fill='#d3e6e9');im.save(W/f'capture/{name}.png')
timing=W/'edit/bcut-timing.json'
if timing.exists():
 captions=json.loads(timing.read_text(encoding='utf8'))
else:
 j=json.loads((W/'edit/bcut-project.bjson').read_text(encoding='utf8'))
 captions=[{'inPoint':c['inPoint'],'outPoint':c['outPoint']} for c in j['timelineWidget']['timeline']['captionTracks'][-1]['captions']]
 timing.write_text(json.dumps(captions,indent=2),encoding='utf8')
texts=['这地图，你应该一眼就认出来了。', '没错，', '坦克大战第一关。', '我把它做成了一个3D网页小游戏。', '还是那套玩法：', '开坦克，打砖墙，守住', '底下那只老鹰。别只顾着往前冲，', '自家的炮弹也能把它打坏。', '红色坦克带着道具。捡到星星升级火力，', '铁锹能临时给基地换上钢墙。', '其实做的时候，最先翻车的是这只老鹰。', '第一版像只鸭子。', '改了白头、钩喙和翅膀，', '才终于像那么回事。', '现在可以切换斜俯视和俯视，', '找一个看得清路的角度。', '这一局，二十辆敌人清完，', '老鹰还在，过关。', '目前只有第一关。', '电脑和手机横屏都能玩，', '链接放在简介里。', '你试试，看看这次能不能守住。']
assert len(texts)==len(captions),(len(texts),len(captions))
RATE=1.0
duration=math.ceil((48.3/RATE+2)*30)/30
starts=[0,2540,7833,11713,16867,23667,26457,31487,35867,40127,45573]
starts=[x/1000/RATE for x in starts]
shots=[('video','capture/capture-offline-audio.mp4',4),('video','capture/capture-offline-audio.mp4',4),('video','capture/capture-offline-audio.mp4',8),('video','capture/capture-offline-audio.mp4',38),('video','capture/capture-offline-audio.mp4',14),('still','duck',0),('still','eagle',0),('video','camera/capture-offline-audio.mp4',5),('video','capture/capture-offline-audio.mp4',55),('still','end',0),('still','end',0)]
still('duck','开发阶段 · 第一版老鹰',G/'media-kit/assets/dev-stages/02-eagle-v1-before.jpg','历史截图：不是当前模型')
still('eagle','修改后 · 老鹰基地',G/'media-kit/assets/dev-stages/03-eagle-v2-after.jpg','白头 / 钩喙 / 展翅')
run(['-ss',59,'-i','capture/capture-offline-audio.mp4','-frames:v','1','capture/current-win.jpg'])
still('end','坦克大战 3D：第一关',W/'capture/current-win.jpg','网页试玩见简介 · 你能守住老鹰吗？')
ass='''[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 2\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Microsoft YaHei,50,&H00FFFFFF,&H00FFFFFF,&H00101820,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,90,90,270,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'''
def stamp(t):
 cs=round(t*100);return f'{cs//360000}:{cs//6000%60:02d}:{cs//100%60:02d}.{cs%100:02d}'
def sr(t):
 ms=round(t*1000);return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
srt=[];align=[]
for i,(c,txt) in enumerate(zip(captions,texts)):
 st=c['inPoint']/1000/RATE;en=c['outPoint']/1000/RATE
 wrapped=txt
 if len(txt)>24:
  cut=txt.rfind('。',0,23)+1
  if cut<6:cut=txt.rfind('，',0,23)+1
  wrapped=txt[:cut]+'\\N'+txt[cut:]
 ass+=f'Dialogue: 0,{stamp(st)},{stamp(en)},Default,,0,0,0,,{{\\an2\\pos(960,800)}}{wrapped}\n'
 srt.append(f'{i+1}\n{sr(st)} --> {sr(en)}\n'+wrapped.replace('\\N','\n'))
 align.append(dict(start=st,end=en,text=txt,source='BCut ASR',original_start_ms=c['inPoint'],original_end_ms=c['outPoint']))
(W/'edit/captions.ass').write_text(ass,encoding='utf-8-sig');(W/'edit/captions.srt').write_text('\n\n'.join(srt),encoding='utf-8-sig');(W/'edit/alignment.json').write_text(json.dumps(align,ensure_ascii=False,indent=2),encoding='utf8')
(W/'narration.txt').write_text('\n'.join(texts),encoding='utf8')
parts=[];audios=[];timeline=[]
for i,(kind,src,point) in enumerate(shots):
 length=(starts[i+1] if i+1<len(starts) else duration)-starts[i];p=W/f'edit/part-{i:02}.mp4';a=W/f'audio/game-{i:02}.wav';parts.append(p);audios.append(a)
 if kind=='video':
  args=['-ss',point,'-i',src];vf='fps=30,setsar=1'
  if point==55 and length>5.7:vf+=',tpad=stop_mode=clone:stop_duration=3'
  if not p.exists():run([*args,'-t',length,'-vf',vf+',format=yuv420p','-an','-c:v','libx264','-preset','fast','-crf','18',p])
  if not a.exists():run([*args,'-t',length,'-vn','-af',f'apad,atrim=duration={length},afade=t=in:d=0.04,afade=t=out:st={length-.1}:d=0.1','-ac','2','-ar','48000',a])
 else:
  if not p.exists():run(['-loop','1','-i',f'capture/{src}.png','-t',length,'-vf','fps=30,format=yuv420p','-an','-c:v','libx264','-preset','fast','-crf','18',p])
  if not a.exists():run(['-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',length,a])
 timeline.append(dict(final_in=starts[i],final_out=starts[i]+length,source=src,kind=kind,source_in=point,speed=1))
(W/'edit/timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf8')
for name,paths in [('parts',parts),('game',audios)]:
 (W/f'edit/{name}.txt').write_text('\n'.join("file '"+str(p).replace('\\','/')+"'" for p in paths),encoding='utf8')
run(['-f','concat','-safe','0','-i','edit/parts.txt','-c','copy','edit/picture.mp4']);run(['-f','concat','-safe','0','-i','edit/game.txt','audio/game-edited.wav'])
run(['-i','audio/narration.wav','-af',f'atempo={RATE}','audio/narration-final.wav'])
mix=f'[0:a]apad,atrim=duration={duration},asplit=2[v][s];[1:a]volume=0.17[g];[g][s]sidechaincompress=threshold=0.015:ratio=8:attack=10:release=180[d];[v][d]amix=inputs=2:duration=first:normalize=0,afade=t=out:st={duration-.8}:d=0.8[m]'
run(['-i','audio/narration-final.wav','-i','audio/game-edited.wav','-filter_complex',mix,'-map','[m]','-ar','48000','-ac','2','audio/mix-raw.wav'])
log=run(['-i','audio/mix-raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-']);data=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',log)[-1]);(W/'qa/loudnorm-pass1.json').write_text(json.dumps(data),encoding='utf8')
norm=f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={data['input_i']}:measured_TP={data['input_tp']}:measured_LRA={data['input_lra']}:measured_thresh={data['input_thresh']}:offset={data['target_offset']}:linear=true"
run(['-i','audio/mix-raw.wav','-af',norm,'-ar','48000','-ac','2','audio/mix-final.wav'])
run(['-i','edit/picture.mp4','-i','audio/mix-final.wav','-vf',f"subtitles=edit/captions.ass:fontsdir='C\\:/Windows/Fonts',fade=t=out:st={duration-.8}:d=0.8",'-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t',duration,F/'gameplay-zh-final.mp4'])
(W/'qa/production.json').write_text(json.dumps(dict(width=1920,height=1080,fps=30,duration=duration,voice='必剪 曼波',voice_rate=RATE,caption_alignment='BCut ASR with exact rate remapping',video_sha256=hashlib.sha256((F/'gameplay-zh-final.mp4').read_bytes()).hexdigest()),ensure_ascii=False,indent=2),encoding='utf8')
print('done',duration)

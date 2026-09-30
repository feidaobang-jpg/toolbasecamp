"""Rebuild the Chinese introduction from preserved gameplay and TTS timestamps."""
import asyncio,json,subprocess,math,re,hashlib,shutil
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
import edge_tts
W=Path(__file__).resolve().parent
GAME=W.parents[2]
SRC=GAME/'media-kit/releases/v0.1.0/captures'
DEV=GAME/'media-kit/assets/dev-stages'
F=W.parent/'final/bilibili-zh'
FF='D:/sd/ffmpeg/bin/ffmpeg.exe'
for d in [F,W/'audio',W/'edit/shared-zh',W/'edit/bilibili-zh/covers',W/'qa',W/'capture',W/'publish/bilibili-zh']:d.mkdir(parents=True,exist_ok=True)
LINES=[
'小时候守的那只老鹰，现在搬进了三维战场。',
'这是用AI辅助制作的《坦克大战三D：第一关》。',
'金色坦克出发，按住J开炮，把砖墙打成新的通道。',
'看起来是在追敌人，其实最重要的，是守住身后的老鹰。',
'连自己的炮弹也能打坏基地，开火前得看清方向。',
'击中闪红的敌人会掉道具，星星可以升级火力。',
'铁锹还能把基地围墙临时变成钢墙，给守家争取时间。',
'做这个版本时，第一只老鹰长这样。怎么看都像只小鸭子。',
'后来加上白头、钩喙和展开的翅膀，终于像个需要保护的基地了。',
'镜头也能从俯瞰压低到坦克后方，同一张地图，换个角度看。',
'这一局，二十辆敌方坦克全部清掉，第一关守住了。',
'目前只有第一关和单人模式，电脑键盘和手机横屏都能操作。',
'网页试玩入口放在简介里。后面可以再打磨低视角的遮挡和手机手感。',
'你更喜欢看清全场的俯瞰，还是贴着坦克的视角？']
# Source shots are automated offline captures; still shots are explicitly used as illustration.
SHOTS=[('video',0,0),('video',0,3),('video',0,8),('video',0,38),('video',1,20),('video',0,14),('video',0,49),('still','duck',0),('still','eagle',0),('still','camera',0),('video',0,55),('still','mobile',0),('still','end',0),('still','end',0)]
VIDEOS=[SRC/'round-win-seed275.mp4',SRC/'round-defeat-seed104.mp4']
def run(args):
 p=subprocess.run([FF,'-hide_banner','-y',*map(str,args)],cwd=W,capture_output=True,encoding='utf-8',errors='replace')
 if p.returncode:raise RuntimeError(p.stderr[-4000:])
 return p.stderr
def font(n):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
def panel(path,title,subtitle,photo=None):
 im=Image.new('RGB',(1280,720),'#091a20');d=ImageDraw.Draw(im)
 if photo:
  p=ImageOps.contain(Image.open(photo).convert('RGB'),(1080,490));im.paste(p,((1280-p.width)//2,145))
 d.text((60,35),title,font=font(42),fill='#ffe27a')
 d.text((60,660),subtitle,font=font(22),fill='#d3e6e9');im.save(path)
async def voice():
 txt='\n'.join(LINES)
 (W/'narration.txt').write_text(txt,encoding='utf-8')
 ev=[]
 with (W/'audio/narration.mp3').open('wb') as out:
  async for c in edge_tts.Communicate(txt,'zh-CN-YunxiNeural',rate='+5%',boundary='SentenceBoundary').stream():
   if c['type']=='audio':out.write(c['data'])
   elif c['type']=='SentenceBoundary':ev.append(c)
 (W/'audio/timings.json').write_text(json.dumps(ev,ensure_ascii=False,indent=2),encoding='utf-8')
def main():
 if not (W/'audio/timings.json').exists():asyncio.run(voice())
 events=json.loads((W/'audio/timings.json').read_text(encoding='utf-8'))
 # Service can split a line containing two sentences. Group adjacent sentences by exact text.
 groups=[];idx=0
 for line in LINES:
  got='';part=[]
  while idx<len(events) and len(re.sub(r'\s','',got))<len(re.sub(r'\s','',line)):
   part.append(events[idx]);got+=events[idx]['text'];idx+=1
  assert re.sub(r'\s','',got)==re.sub(r'\s','',line),(line,got)
  groups.append((part[0]['offset']/1e7,(part[-1]['offset']+part[-1]['duration'])/1e7))
 duration=math.ceil((groups[-1][1]+2)*30)/30
 starts=[g[0] for g in groups];starts[0]=0
 panel(W/'capture/duck.png','开发阶段 · 第一版老鹰','历史截图：不是当前模型',DEV/'02-eagle-v1-before.jpg')
 panel(W/'capture/eagle.png','当前版本 · 老鹰基地','白头 / 钩喙 / 展翅',DEV/'03-eagle-v2-after.jpg')
 panel(W/'capture/camera.png','同一张地图，换个角度','当前版本视角截图',SRC/'commander-view.jpg')
 panel(W/'capture/mobile.png','单人 · 第一关','电脑：WASD + J    手机：横屏摇杆 + 开炮',SRC/'mobile-play.jpg')
 panel(W/'capture/end.png','坦克大战 3D：第一关','万物皆可游戏 · 网页试玩见简介',SRC/'flow-win-panel.jpg')
 ass='''[Script Info]\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\nWrapStyle: 2\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Microsoft YaHei,34,&H00FFFFFF,&H00FFFFFF,&H00101820,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,2,50,50,180,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'''
 def stamp(t):
  cs=round(t*100);return f'{cs//360000}:{cs//6000%60:02}:{cs//100%60:02}.{cs%100:02}'
 srt=[]
 for i,(st,en) in enumerate(groups):
  text=LINES[i].replace('三D','3D')
  chunks=[]
  while len(text)>22:
   cut=max(text.rfind('，',0,23),text.rfind('。',0,23))+1
   if cut<6:cut=20
   chunks.append(text[:cut]);text=text[cut:]
  chunks.append(text);wrapped='\\N'.join(chunks)
  ass+=f'Dialogue: 0,{stamp(st)},{stamp(en+.12)},Default,,0,0,0,,{{\\an2\\pos(640,535)}}{wrapped}\n'
  def sr(t):
   ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
  srt.append(f'{i+1}\n{sr(st)} --> {sr(en+.12)}\n'+wrapped.replace('\\N','\n'))
 (W/'edit/shared-zh/captions.ass').write_text(ass,encoding='utf-8-sig')
 (W/'edit/shared-zh/captions.zh.srt').write_text('\n\n'.join(srt),encoding='utf-8-sig')
 timeline=[];segments=[]
 for i,(kind,source,point) in enumerate(SHOTS):
  length=(starts[i+1] if i+1<len(starts) else duration)-starts[i]
  out=W/f'edit/shared-zh/part-{i:02}.mp4';segments.append(out)
  if out.exists() and (W/f'audio/game-{i:02}.wav').exists():
   inp=VIDEOS[source] if kind=='video' else W/f'capture/{source}.png'
   timeline.append(dict(final_in=starts[i],final_out=starts[i]+length,source=str(inp.relative_to(GAME)).replace('\\','/'),source_in=point,kind=kind,speed=1,narration=LINES[i]))
   continue
  if kind=='video':
   # Never cross the corrupted camera frame around source 25 seconds.
   if source==0 and point==14:length_limit=8
   else:length_limit=60.65-point if source==0 else 8
   inp=VIDEOS[source];args=['-ss',point,'-i',inp]
   vf='scale=1280:720,setsar=1,fps=30'
   if length>length_limit:vf+=f',tpad=stop_mode=clone:stop_duration={length-length_limit+1}'
   vf+=',format=yuv420p'
   run([*args,'-t',length,'-vf',vf,'-c:v','libx264','-preset','fast','-crf','19','-an',out])
   audio=W/f'audio/game-{i:02}.wav'
   run([*args,'-t',length,'-vn','-af',f'apad,atrim=duration={length},afade=t=in:d=0.03,afade=t=out:st={max(0,length-.1)}:d=0.1','-ar','48000','-ac','2',audio])
  else:
   inp=W/f'capture/{source}.png'
   run(['-loop','1','-i',inp,'-t',length,'-vf','fps=30,format=yuv420p','-c:v','libx264','-preset','fast','-crf','19','-an',out])
   audio=W/f'audio/game-{i:02}.wav';run(['-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',length,audio])
  timeline.append(dict(final_in=starts[i],final_out=starts[i]+length,source=str(inp.relative_to(GAME)).replace('\\','/'),source_in=point,kind=kind,speed=1,narration=LINES[i]))
 (W/'edit/shared-zh/timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
 for name,paths in [('parts',segments),('game',[W/f'audio/game-{i:02}.wav' for i in range(len(SHOTS))])]:
  (W/f'edit/shared-zh/{name}.txt').write_text('\n'.join("file '"+str(p).replace('\\','/')+"'" for p in paths),encoding='utf-8')
 run(['-f','concat','-safe','0','-i','edit/shared-zh/parts.txt','-c','copy','edit/shared-zh/picture.mp4'])
 run(['-f','concat','-safe','0','-i','edit/shared-zh/game.txt','-c:a','pcm_s16le','audio/game-edited.wav'])
 mix=f'[0:a]aresample=48000,apad,atrim=duration={duration},asplit=2[v][s];[1:a]volume=0.19[g];[g][s]sidechaincompress=threshold=0.015:ratio=8:attack=10:release=180[d];[v][d]amix=inputs=2:duration=first:normalize=0,afade=t=out:st={duration-.8}:d=0.8[m]'
 run(['-i','audio/narration.mp3','-i','audio/game-edited.wav','-filter_complex',mix,'-map','[m]','-ar','48000','-ac','2','audio/mix-raw.wav'])
 log=run(['-i','audio/mix-raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'])
 data=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',log)[-1]);(W/'qa/loudnorm-pass1.json').write_text(json.dumps(data),encoding='utf-8')
 norm=f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={data['input_i']}:measured_TP={data['input_tp']}:measured_LRA={data['input_lra']}:measured_thresh={data['input_thresh']}:offset={data['target_offset']}:linear=true"
 run(['-i','audio/mix-raw.wav','-af',norm,'-ar','48000','-ac','2','audio/mix-final.wav'])
 run(['-i','edit/shared-zh/picture.mp4','-i','audio/mix-final.wav','-vf',f"subtitles=edit/shared-zh/captions.ass:fontsdir='C\\:/Windows/Fonts',fade=t=out:st={duration-.8}:d=0.8",'-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t',duration,F/'gameplay-zh-final.mp4'])
 print(json.dumps({'duration':duration,'groups':len(groups),'video':str(F/'gameplay-zh-final.mp4')},ensure_ascii=False))
if __name__=='__main__':main()

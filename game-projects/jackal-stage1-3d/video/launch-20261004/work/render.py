"""Reproducible 1080p edit, word-timestamp subtitles, narration/game mix."""
import json,re,subprocess,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parent
E=R/'edit/shared-zh';E.mkdir(parents=True,exist_ok=True)
F=R.parent/'final/bilibili-zh';F.mkdir(parents=True,exist_ok=True)
def run(args):subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y']+args,check=True)
def duration(p):return float(json.loads(subprocess.check_output(['ffprobe','-v','quiet','-show_format','-of','json',str(p)]))['format']['duration'])
def stamp(t):
 h=int(t//3600);m=int(t%3600//60);s=t%60
 return f'{h}:{m:02}:{s:05.2f}'
def srtstamp(t):return f'{int(t//3600):02}:{int(t%3600//60):02}:{int(t%60):02},{round(t%1*1000):03}'
def clean(s):return ''.join(re.findall(r'[\w\u4e00-\u9fff]',s))
def card():
 im=Image.new('RGB',(1920,1080),'#112c25');d=ImageDraw.Draw(im)
 f=lambda n:ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',n)
 d.rounded_rectangle((110,105,1810,955),radius=35,fill='#1d4134',outline='#94ae7c',width=3)
 d.text((180,175),'赤色要塞 3D',font=f(106),fill='#fff2ca')
 d.text((185,337),'海滩登陆  /  废墟城',font=f(48),fill='#b9d99e')
 d.line((185,430,1735,430),fill='#719569',width=3)
 d.text((185,485),'点击简介中的 Toy 链接，直接试玩',font=f(53),fill='#fff2ca')
 d.text((185,588),'投票与愿望单：百宝箱 → 游戏 → 自研游戏投票榜',font=f(39),fill='#d3dfc6')
 d.text((185,885),'粉丝向非官方重置 · 原作版权归 Konami 所有',font=f(25),fill='#a9bea2')
 im.save(E/'endcard.png')
card()
config=json.loads((R/'narration.json').read_text(encoding='utf-8'))
plan=json.loads((E/'timeline-plan.json').read_text(encoding='utf-8'))
texts={s['id']:s['text'] for s in config['segments']}
ass=['[Script Info]','ScriptType: v4.00+','PlayResX: 1920','PlayResY: 1080','ScaledBorderAndShadow: yes','[V4+ Styles]','Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding','Style: Default,Microsoft YaHei,46,&H00FFFFFF,&H00FFFFFF,&H00251B12,&H90000000,-1,0,0,0,100,100,0,0,1,3,1,2,100,100,280,1','[Events]','Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text']
subs=[];timeline=[];offset=0;parts=[];voiceparts=[]
for seg in plan:
 sid=seg['id'];mp3=R/'audio/shared-zh'/f'{sid}.mp3';dur=max(duration(mp3)+.65,seg.get('min_duration',0));lead=.25
 srcs=seg['shots'];inputs=[];vf=[];af=[];remaining=dur
 for i,sh in enumerate(srcs):
  length=remaining if i==len(srcs)-1 else sh['duration'];remaining-=length
  if sh['source']=='card' or sh['source'].endswith('.png'):
   img=E/'endcard.png' if sh['source']=='card' else R/sh['source']
   inputs+=['-loop','1','-framerate','30','-i',str(img)];vf.append(f'[{i}:v]trim=duration={length},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v{i}]');af.append(f'anullsrc=r=48000:cl=stereo,atrim=duration={length}[a{i}]')
  else:
   inputs+=['-ss',str(sh['in']),'-i',str(R/sh['source'])]
   vf.append(f'[{i}:v]trim=duration={length},setpts=PTS-STARTPTS,setsar=1,fps=30[v{i}]')
   af.append(f'[{i}:a]atrim=duration={length},asetpts=PTS-STARTPTS,aresample=48000[a{i}]')
  sh['duration_actual']=length
 n=len(srcs);inputs+=['-i',str(mp3)]
 filt=';'.join(vf+af)+f';'+''.join(f'[v{i}][a{i}]' for i in range(n))+f'concat=n={n}:v=1:a=1[v][g];[g]volume=0.13[gq];[{n}:a]aresample=48000,adelay={int(lead*1000)}:all=1,apad,atrim=duration={dur},volume=1.5[n];[gq][n]amix=inputs=2:normalize=0[a]'
 part=E/f'{sid}.mp4'
 if not part.exists() or seg.get('rerender',False):run(inputs+['-filter_complex',filt,'-map','[v]','-map','[a]','-t',str(dur),'-c:v','h264_nvenc','-preset','p5','-cq','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',str(part)])
 parts.append(part)
 words=json.loads(mp3.with_suffix('.json').read_text(encoding='utf-8'))['marks'];wordspans=[];pos=0
 for w in words:
  size=len(clean(w['text']));wordspans.append((pos,pos+size,w['offset']/1e7,(w['offset']+w['duration'])/1e7));pos+=size
 phrases=[p.strip() for p in re.findall(r'[^，。！？；]+[，。！？；]?',texts[sid]) if p.strip()]
 pos=0
 for phrase in phrases:
  size=len(clean(phrase));ww=[w for w in wordspans if w[1]>pos and w[0]<pos+size];pos+=size
  if not ww:continue
  a=offset+lead+ww[0][2];b=min(offset+dur-.10,offset+lead+ww[-1][3]+.12)
  subs.append({'start':a,'end':b,'text':phrase,'id':sid,'timing_source':'Edge WordBoundary'})
  ass.append(f'Dialogue: 0,{stamp(a)},{stamp(b)},Default,,0,0,0,,{{\\an2\\pos(960,800)}}{phrase}')
 timeline.append({**seg,'start':offset,'end':offset+dur,'duration':dur,'text':texts[sid],'audio':str(mp3.relative_to(R))})
 offset+=dur
 print('chapter',sid,round(dur,2),flush=True)
(E/'captions.ass').write_text('\n'.join(ass),encoding='utf-8-sig')
(E/'captions.srt').write_text('\n\n'.join(f"{i+1}\n{srtstamp(s['start'])} --> {srtstamp(s['end'])}\n{s['text']}" for i,s in enumerate(subs))+'\n',encoding='utf-8-sig')
(E/'alignment.json').write_text(json.dumps(subs,ensure_ascii=False,indent=2),encoding='utf-8')
(E/'timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
(E/'concat.txt').write_text('\n'.join(f"file '{p.name}'" for p in parts),encoding='utf-8')
run(['-f','concat','-safe','0','-i',str(E/'concat.txt'),'-c','copy',str(E/'assembly.mp4')])
# Resolve subtitle paths relative to this working directory for Windows filter syntax.
final=F/'赤色要塞-双关卡上架介绍.mp4'
vf=f"ass=edit/shared-zh/captions.ass,fade=t=out:st={offset-1.2}:d=1.2"
cmd=['ffmpeg','-hide_banner','-y','-i',str(E/'assembly.mp4'),'-vf',vf,'-af',f'loudnorm=I=-15:TP=-1.5:LRA=9,afade=t=out:st={offset-1.2}:d=1.2','-c:v','h264_nvenc','-preset','p5','-cq','18','-pix_fmt','yuv420p','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(final)]
with (E/'render.log').open('w',encoding='utf-8') as log:subprocess.run(cmd,cwd=R,stdout=log,stderr=log,check=True)
print('FINAL',final,'seconds',offset,flush=True)

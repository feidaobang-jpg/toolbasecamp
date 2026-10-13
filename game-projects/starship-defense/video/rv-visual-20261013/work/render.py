"""Reproducible Bilibili edit. Run from any directory with Python + FFmpeg.

Only cuts/crops and titles are applied to real game capture. Voice timings use
decoded sample counts, including the longer real gameplay beat in segment 06.
"""
from pathlib import Path
import json, subprocess, wave, math, argparse

W = Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--rerender-shot',type=int,help='Only regenerate this changed clip; reuse inspected clips, then remux full final')
options=parser.parse_args()
E = W/'edit'/'shared-zh'; T = W/'tmp'; F = W.parent/'final'/'bilibili-zh'
for p in (E,T,F): p.mkdir(parents=True, exist_ok=True)
SR=24000; FPS=30
plan=json.loads((W/'units.json').read_text('utf-8'))
timeline=[]; subtitles=[]; overlays=[]; audio_parts=[]; cursor=0

def readwav(p):
    with wave.open(str(p)) as f:
        assert f.getframerate()==SR and f.getnchannels()==1
        return f.readframes(f.getnframes())

def label(start,end,text,x=72,y=70,style='Label'):
    overlays.append((start,end,style,f'{{\\pos({x},{y})}}'+text))

def add(sid,shots,title=None,custom=False):
    global cursor
    data=json.loads((W/'audio/shared-zh'/f'{sid}.json').read_text('utf-8'))
    raw=readwav(W/'audio/shared-zh'/f'{sid}.wav')
    if custom:
        # Let the actual search action and boarding finish before leaving it.
        offsets=[.35,5.05,11.05]
        buf=bytearray(SR*2*24)
        for m,at in zip(data['marks'],offsets):
            a=round(m['offset']/1e7*SR)*2; b=a+round(m['duration']/1e7*SR)*2
            pcm=raw[a:b]; dest=round(at*SR)*2; buf[dest:dest+len(pcm)]=pcm
            subtitles.append((cursor+at,cursor+at+len(pcm)/2/SR,m['text']))
        duration=24.; final=bytes(buf)
    else:
        pad=.45 if sid!='08-ending' else 1.6
        duration=math.ceil((len(raw)/2/SR+.22+pad)*FPS)/FPS
        final=b'\0\0'*round(.22*SR)+raw
        final+=b'\0\0'*(round(duration*SR)-len(final)//2)
        for m in data['marks']:
            at=cursor+.22+m['offset']/1e7
            subtitles.append((at,at+m['duration']/1e7,m['text']))
    # Last shot fills remaining exact frame count; narration never trimmed.
    used=sum(s['duration'] for s in shots[:-1]); shots[-1]['duration']=round(duration-used,6)
    local=0
    for shot in shots:
        shot.update(segment=sid,start=round(cursor+local,6)); local+=shot['duration']
        timeline.append(shot)
    if title: label(cursor,cursor+duration,title)
    audio_parts.append(final); cursor+=duration
    return duration

def shot(src,ss,d=0,crop=None,split=False):
    return {'source':src,'source_start':ss,'duration':d,'crop':crop,'split':split}

d1=add('01-opening',[shot('new-orbit',.1,split=True)])
label(0,d1,'升级前',480,68,'Compare')
label(0,d1,'升级后',1440,68,'CompareGold')
label(0,d1,'v0.36.9 · 旧版重演',480,137,'SmallCenter')
label(0,d1,'v0.37.4 · 当前画面',1440,137,'SmallCenter')
add('02-before',[shot('old-orbit',7)],'升级前  /  方块房车与简化街道')
d3=add('03-vehicle',[
    shot('new-orbit',0,2.85,[1440,810,320,230]),
    shot('new-orbit',6,2.77,[1440,810,290,230]),
    shot('new-orbit',12,3.04,[1440,810,240,190]),
    shot('new-beauty',11.7)],'升级后  /  车身细节')
add('04-town',[
    shot('new-journey',15,5.9),shot('new-orbit',16)],'升级后  /  城镇与夕阳')
add('05-lights',[
    shot('new-orbit',.1,2.8),shot('new-beauty',11.65,2.2),shot('new-orbit',21)],'升级后  /  真实车灯')
gstart=cursor
add('06-gameplay',[
    shot('new-journey',22,5),shot('new-journey',29,6),
    shot('new-journey',39,7),shot('new-journey',48,2.5),shot('new-journey',54,3.5)
],custom=True)
for a,b,txt in [(0,5,'实战  /  驶入城镇'),(5,11,'实战  /  清理僵尸'),(11,18,'实战  /  下车搜索'),(18,24,'实战  /  返回房车')]: label(gstart+a,gstart+b,txt)
label(gstart+16,gstart+21.5,'搜索收获  零件 200 → 310',72,146,'Result')
sstart=cursor
add('07-scope',[shot('new-journey',57.25)],'这趟结果  /  带着补给回到街道')
label(sstart,sstart+4,'击败 5 名僵尸 · 完成 1 区搜索',72,146,'Result')
estart=cursor
add('08-ending',[shot('new-orbit',1.5)],'虫潮围城  /  房车生存')
label(estart+4,estart+9,'下一步：人物，还是城镇细节？',72,146,'Result')
label(estart+9,cursor-0.5,'哔哩哔哩 Toy 已上线',72,146,'Result')
label(estart+12,cursor-0.5,'视频下方试玩入口 → 选择「房车生存」',72,213,'Small')
label(estart+15,cursor-0.5,'想玩的点子，留在简介里的愿望单',72,262,'Small')

def ts(t):
    cent=round(t*100); return f'{cent//360000}:{cent//6000%60:02}:{cent//100%60:02}.{cent%100:02}'
ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes
WrapStyle: 2
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Subtitle,Microsoft YaHei,44,&H00FFFFFF,&H00FFFFFF,&H00101820,&H90000000,-1,0,0,0,100,100,0,0,1,3,1,2,100,100,65,1
Style: Label,Microsoft YaHei,42,&H00A5E8FF,&H00FFFFFF,&H40101820,&H40101820,-1,0,0,0,100,100,0,0,3,14,0,7,0,0,0,1
Style: Compare,Microsoft YaHei,57,&H00FFFFFF,&H00FFFFFF,&H50101820,&H50101820,-1,0,0,0,100,100,0,0,3,15,0,8,0,0,0,1
Style: CompareGold,Microsoft YaHei,57,&H0095E7FF,&H00FFFFFF,&H50101820,&H50101820,-1,0,0,0,100,100,0,0,3,15,0,8,0,0,0,1
Style: SmallCenter,Microsoft YaHei,28,&H00FFFFFF,&H00FFFFFF,&H50101820,&H50101820,0,0,0,0,100,100,0,0,3,7,0,8,0,0,0,1
Style: Result,Microsoft YaHei,34,&H00FFFFFF,&H00FFFFFF,&H50101820,&H50101820,-1,0,0,0,100,100,0,0,3,11,0,7,0,0,0,1
Style: Small,Microsoft YaHei,29,&H00FFFFFF,&H00FFFFFF,&H50101820,&H50101820,0,0,0,0,100,100,0,0,3,8,0,7,0,0,0,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
for a,b,txt in subtitles: ass+=f'Dialogue: 2,{ts(a)},{ts(b+.07)},Subtitle,,0,0,0,,{txt}\n'
for a,b,sty,txt in overlays: ass+=f'Dialogue: 1,{ts(a)},{ts(b)},{sty},,0,0,0,,{txt}\n'
(E/'captions.ass').write_text(ass,encoding='utf-8-sig')
(E/'timeline.json').write_text(json.dumps({'duration':cursor,'fps':FPS,'shots':timeline,'captions':subtitles,'overlays':overlays},ensure_ascii=False,indent=2),encoding='utf-8')
with wave.open(str(W/'audio/shared-zh/narration.wav'),'wb') as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes(b''.join(audio_parts))

def run(args,log):
    with open(W/'qa'/log,'w',encoding='utf-8') as f:
        subprocess.run(['ffmpeg','-hide_banner','-y',*args],cwd=W,stdout=f,stderr=subprocess.STDOUT,check=True)

files=[]
for i,s in enumerate(timeline):
    dest=T/f'shot-{i:02d}.mp4'; files.append(dest)
    if options.rerender_shot is not None and i!=options.rerender_shot and dest.exists():
        continue
    dur=s['duration']; ss=s['source_start']; src=f'capture/{s["source"]}.webm'
    args=['-ss',str(ss),'-i',src]
    if s['split']:
        args+=['-ss',str(ss),'-i','capture/old-orbit.webm']
        graph='[1:v]crop=960:1080:480:0,setpts=PTS-STARTPTS,fps=30[l];[0:v]crop=960:1080:480:0,setpts=PTS-STARTPTS,fps=30[r];[l][r]hstack=inputs=2,drawbox=x=954:y=0:w=12:h=ih:color=0xFFE1A0:t=fill[v]'
        args+=['-filter_complex',graph,'-map','[v]','-map','0:a:0']
    else:
        filt='setpts=PTS-STARTPTS,fps=30'
        if s['crop']: filt+=',crop='+':'.join(map(str,s['crop']))+',scale=1920:1080:flags=lanczos'
        args+=['-vf',filt,'-map','0:v:0','-map','0:a:0']
    args+=['-af','asetpts=PTS-STARTPTS,aresample=48000,apad','-t',str(dur),'-r','30','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2',str(dest)]
    run(args,f'render-shot-{i:02d}.log'); print('shot',i,s['segment'],round(dur,2),flush=True)
lst=T/'concat.txt'; lst.write_text(''.join("file '"+p.as_posix()+"'\n" for p in files),encoding='utf-8')
run(['-f','concat','-safe','0','-i',str(lst),'-c','copy',str(T/'picture.mp4')],'concat.log')
out=F/'gameplay-zh-final.mp4'
afade=max(0,cursor-1.0); vfade=max(0,cursor-.55)
graph=(f'[0:v]subtitles=edit/shared-zh/captions.ass,fade=t=out:st={vfade}:d=0.55[v];'
       f'[0:a]volume=0.20[game];[1:a]highpass=f=70,acompressor=threshold=0.12:ratio=2:attack=10:release=100[voice];'
       f'[voice][game]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1:LRA=7,afade=t=out:st={afade}:d=1[a]')
run(['-i',str(T/'picture.mp4'),'-i','audio/shared-zh/narration.wav','-filter_complex',graph,'-map','[v]','-map','[a]',
     '-t',str(cursor),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart',str(out)],'render-final.log')
print('FINAL',out,round(cursor,3),flush=True)

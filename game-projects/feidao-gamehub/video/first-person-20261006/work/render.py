"""Reproducible edit: actual word timings, original gameplay audio, two covers."""
import json,re,subprocess,math,hashlib,os
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parent; E=R/'edit/shared-zh'; E.mkdir(parents=True,exist_ok=True)
A=R/'audio/shared-zh'; C=R/'capture'; F=R.parent/'final/bilibili-zh';F.mkdir(parents=True,exist_ok=True)
FPS=60
def run(args):
    p=subprocess.run(['ffmpeg','-hide_banner','-y','-filter_complex_threads','2','-filter_threads','2',*map(str,args[:-1]),'-threads','4',str(args[-1])],cwd=R,capture_output=True,encoding='utf-8',errors='replace')
    if p.returncode:raise RuntimeError(p.stderr[-3500:])
    return p.stderr
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(p)],encoding='utf-8'))
def font(size):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',size)
def savej(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
PLAN={
 '01-hook':[('cadillacs-stage1-3d',18.4,3.5),('starship-defense',77.5,None)],
 '02-intro':[('tank-3d',6,1.5),('mario-3d',7,1.5),('jackal-stage1-3d',8,1.5),('cadillacs-stage1-3d',8,1.5),('starship-defense',8,None)],
 '03-tank-wide':[('tank-3d',1.8,None)],'04-tank-fp':[('tank-3d',13.7,4.0),('tank-3d',32.2,None)],
 '05-mario-wide':[('mario-3d',5.8,None)],'06-mario-fp':[('mario-3d',13.8,5.5),('mario-3d',22,None)],
 '07-jackal-wide':[('jackal-stage1-3d',5,None)],'08-jackal-fp':[('jackal-stage1-3d',13.8,None)],
 '09-cadillacs-wide':[('cadillacs-stage1-3d',5,None)],'10-cadillacs-fp':[('cadillacs-stage1-3d',13.8,1.15),('cadillacs-stage1-3d',17.3,None)],
 '11-insects-wide':[('starship-defense',3,None)],'12-insects-fp':[('starship-defense',13.8,1.35),('starship-defense',15.7,2.2),('starship-defense',32.1,4.5),('starship-defense',75.9,None)],
 '13-tradeoff':[('tank-3d',6,2.1),('tank-3d',36,2.1),('mario-3d',10,2.1),('mario-3d',21,2.1),('cadillacs-stage1-3d',55,None)],
 '14-outro':[('jackal-stage1-3d',57.5,5.5),('cadillacs-stage1-3d',58,5.5),('starship-defense',36,None)]}
LABELS={'tank-3d':'坦克大战','mario-3d':'超级玛丽','jackal-stage1-3d':'赤色要塞','cadillacs-stage1-3d':'恐龙快打','starship-defense':'虫潮围城'}
cfg=json.loads((R/'narration.json').read_text(encoding='utf-8'));subtitles=[];timeline=[];parts=[];offset=0
clean=lambda s:''.join(re.findall(r'[\w\u4e00-\u9fff]',s))
def astamp(t):
    n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
def sstamp(t):
    n=round(t*1000);return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
for seg in cfg['segments']:
    sid=seg['id']; info=json.loads((A/(sid+'.json')).read_text(encoding='utf-8'));voice=A/(sid+'.mp3')
    dur=math.ceil((float(probe(voice)['format']['duration'])+.75+(1.4 if sid=='14-outro' else 0))*FPS)/FPS
    spans=[];pos=0
    for mark in info['marks']:
        n=len(clean(mark['text']));spans.append((pos,pos+n,mark['offset']/1e7,(mark['offset']+mark['duration'])/1e7));pos+=n
    pos=0
    for line in seg['lines']:
        for phrase in re.findall(r'[^，。！？；：]+[，。！？；：]?',line):
            n=len(clean(phrase))
            if not n:continue
            hits=[s for s in spans if s[1]>pos and s[0]<pos+n];pos+=n
            if not hits:raise ValueError((sid,phrase))
            subtitles.append({'start':offset+.2+hits[0][2],'end':min(offset+dur-.1,offset+.2+hits[-1][3]+.15),'text':phrase.rstrip('，。；：'),'segment':sid,'timing_source':'Edge WordBoundary'})
    assert pos==spans[-1][1],(sid,pos,spans[-1])
    shots=[];remaining=dur;local=0
    for i,(game,start,length) in enumerate(PLAN[sid]):
        ln=remaining if length is None else round(length*FPS)/FPS;remaining-=ln
        dst=E/f'{sid}-{i}.mp4'
        overlay=Image.new('RGBA',(1920,1080),(0,0,0,0));draw=ImageDraw.Draw(overlay)
        title=LABELS[game]+('  ·  第一人称' if sid.endswith('-fp') else '  ·  实机试玩' if sid in ['01-hook','02-intro','14-outro'] else '  ·  视角对照' if sid=='13-tradeoff' else '  ·  常规视角')
        if sid=='12-insects-fp' and i==3:title+='  ·  同局虫洞后段'
        if sid=='12-insects-fp' and i==2:title+='  ·  同局后段'
        if sid=='10-cadillacs-fp' and i==0:title=LABELS[game]+'  ·  切换视角'
        if sid=='10-cadillacs-fp' and i==1:title+='  ·  同局起身后'
        if sid in ['04-tank-fp','06-mario-fp'] and i==1:title+='  ·  同局后段'
        bw=draw.textbbox((0,0),title,font=font(34))[2]+44
        labelx=570 if game=='starship-defense' else 48
        draw.rounded_rectangle((labelx,116,labelx+bw,178),radius=14,fill=(10,20,29,220),outline=(88,198,208,255),width=2)
        draw.text((labelx+22,127),title,font=font(34),fill='#FFFFFF')
        if sid=='14-outro':
            draw.rounded_rectangle((220,872,1700,1030),radius=20,fill=(9,25,33,230),outline='#52c6c5',width=2)
            draw.text((960,910),'五款试玩：B站 Toy · 飞刀班长游戏合集',font=font(37),fill='#FFFFFF',anchor='mm')
            draw.text((960,971),'投票 / 愿望单：百宝箱 → 游戏 → 自研游戏投票榜',font=font(30),fill='#8ee2dd',anchor='mm')
        ov=E/f'{sid}-{i}-overlay.png';overlay.save(ov)
        if not dst.exists():
            run(['-ss',start,'-i',C/(game+'.mp4'),'-loop','1','-i',ov,'-filter_complex','[0:v][1:v]overlay=0:0,fps=60,format=yuv420p[v]',
                 '-map','[v]','-map','0:a','-t',ln,'-c:v','h264_nvenc','-preset','p4','-cq','18','-b:v','0','-c:a','aac','-b:a','192k',dst])
        shots.append({'source':f'capture/{game}.mp4','source_in':start,'source_out':start+ln,'final_in':offset+local,'final_out':offset+local+ln,'game':game});local+=ln
    lst=E/(sid+'.ffconcat');lst.write_text('\n'.join(f"file '{sid}-{i}.mp4'\nduration {x['final_out']-x['final_in']:.9f}" for i,x in enumerate(shots)),encoding='utf-8')
    combined=E/(sid+'.mp4');run(['-f','concat','-safe','0','-i',lst,'-c','copy',combined])
    mixed=E/(sid+'-mixed.mp4')
    run(['-i',combined,'-i',voice,'-filter_complex',f'[1:a]aresample=48000,adelay=200:all=1,apad,atrim=duration={dur}[v];[0:a]volume=.15[g];[v][g]amix=inputs=2:duration=first:normalize=0[a]',
         '-map','0:v','-map','[a]','-t',dur,'-c:v','copy','-c:a','aac','-b:a','192k',mixed])
    parts.append((mixed,dur));timeline.append({'id':sid,'final_in':offset,'final_out':offset+dur,'lines':seg['lines'],'shots':shots});offset+=dur
    print(sid,round(dur,2),'s',flush=True)
ass=['[Script Info]','ScriptType: v4.00+','PlayResX: 1920','PlayResY: 1080','WrapStyle: 2','[V4+ Styles]',
'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
'Style: Default,Microsoft YaHei,48,&H00FFFFFF,&H00FFFFFF,&H00101619,&H88000000,-1,0,0,0,100,100,0,0,1,3,1,2,100,100,270,1',
'[Events]','Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text']
for i,s in enumerate(subtitles):
    if i+1<len(subtitles):s['end']=min(s['end'],subtitles[i+1]['start']-.02)
    ass.append(f"Dialogue: 0,{astamp(s['start'])},{astamp(s['end'])},Default,,0,0,0,,{{\\an2\\pos(960,810)}}{s['text']}")
(E/'captions.ass').write_text('\n'.join(ass),encoding='utf-8-sig')
(E/'captions.srt').write_text('\n\n'.join(f"{i+1}\n{sstamp(s['start'])} --> {sstamp(s['end'])}\n{s['text']}" for i,s in enumerate(subtitles)),encoding='utf-8-sig')
savej(E/'alignment.json',subtitles);savej(E/'timeline.json',{'duration':offset,'fps':30,'segments':timeline})
(E/'all.ffconcat').write_text('\n'.join(f"file '{p.name}'\nduration {d:.9f}" for p,d in parts),encoding='utf-8')
run(['-f','concat','-safe','0','-i',E/'all.ffconcat','-c','copy',E/'assembled.mp4'])
run(['-i',E/'assembled.mp4','-vn','-af',f'loudnorm=I=-16:TP=-1.5:LRA=9,afade=t=out:st={offset-1.4}:d=1.4','-ar','48000','-ac','2',A/'mix-final.wav'])
final=F/'gameplay-zh-final-v2.mp4'
encoder=['-c:v','h264_nvenc','-preset','p6','-cq','18','-b:v','0'] if os.environ.get('VIDEO_ENCODER')=='nvenc' else ['-c:v','libx264','-preset','fast','-crf','18']
run(['-i',E/'assembled.mp4','-i',A/'mix-final.wav','-map','0:v','-map','1:a','-vf',f'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p,ass=edit/shared-zh/captions.ass,fade=t=out:st={offset-1.4}:d=1.4,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709',*encoder,'-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-t',offset,'-movflags','+faststart',final])
savej(R/'qa-render.json',{'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'duration':offset,'probe':probe(final),'audio_listening':'not-run','status':'pending_visual_qa'})
print('FINAL',offset,final,flush=True)

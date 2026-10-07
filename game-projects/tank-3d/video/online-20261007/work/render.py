"""Render the Chinese co-op update with real word boundaries and game sound."""
import json,subprocess,re,math,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps,ImageEnhance
W=Path(__file__).resolve().parent;E=W/'edit/shared-zh';A=W/'audio/shared-zh';F=W.parent/'final/bilibili-zh'
for d in [E,A,F,W/'qa',W/'edit/bilibili-zh/covers']:d.mkdir(parents=True,exist_ok=True)
def run(args):
    p=subprocess.run(['ffmpeg','-hide_banner','-y','-filter_threads','2','-filter_complex_threads','2',*map(str,args)],cwd=W,capture_output=True,encoding='utf-8',errors='replace')
    if p.returncode:raise RuntimeError(p.stderr[-3500:])
    return p.stderr
def probe(p):return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(p)],encoding='utf-8'))
def savej(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')
def font(n,bold=True):return ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc' if bold else 'C:/Windows/Fonts/msyh.ttc',n)
def card(name,title,photo,lines,footer):
    im=Image.new('RGB',(1920,1080),'#0c211c');d=ImageDraw.Draw(im)
    d.rounded_rectangle((56,54,1864,176),radius=24,fill='#fff5d5');d.text((96,82),title,font=font(58),fill='#203b25')
    pic=ImageOps.contain(Image.open(photo).convert('RGB'),(1120,630));x=70+(1120-pic.width)//2;y=210+(630-pic.height)//2;im.paste(pic,(x,y))
    d.rounded_rectangle((1240,244,1850,726),radius=28,fill='#17392c',outline='#88b983',width=3)
    for i,line in enumerate(lines):d.text((1270,290+i*94),line,font=font(38),fill='#f8efd3')
    d.text((960,1014),footer,font=font(30,False),fill='#b9d7bd',anchor='mm')
    target=E/(name+'.png');im.save(target);return target
limits=card('limits','合作守基地 · 开局前先凑齐队友',W/'capture/lobby.png',['每人一辆坦克','合作守同一座基地','暂无中途加入','房主退出则结束'],'当前版本说明 · 2–4 人合作 · 房间可设密码')
toy=card('toy','坦克大战 · B站 Toy 已公开试玩',W/'qa/toy-lobby.png',['进入联机大厅','建房 / 填房间码','队友点击准备','房主开始游戏'],'B站 Toy：视频下方入口 · 简介内保留完整试玩链接')
vote=card('vote','下一步优先优化什么？来投票、写愿望',W/'qa/vote-page.png',['百宝箱 → 游戏','自研游戏投票榜','投票 / 填写愿望单','结合反馈决定优先级'],'复制到浏览器：https://www.zhengxiaohui.cn/game-vote.html')
C=W/'capture'; battle=C/'03-coop-battle-retimed.mp4'; host=C/'01-host-lobby-retimed.mp4';guest=C/'02-guest-lobby-retimed.mp4'
PLAN={
 '01-hook':[(battle,39,None)],
 '02-room':[(host,0,3.4),(host,8,None)],
 '03-join':[(guest,6.3,4.5),(battle,0,None)],
 '04-start':[(battle,4.2,None)],
 '05-fight':[(battle,17.7,None)],
 '06-result':[(battle,106.8,None)],
 '07-limits':[(limits,0,None)],'08-toy':[(toy,0,None)],'09-vote':[(vote,0,None)]}
LABELS={'01-hook':'坦克大战 · 2–4人联机合作','04-start':'双人联机实战 · 独立控制两辆坦克','05-fight':'同一局 · 左路交战与重新出发','06-result':'同一局后段 · 最后一辆与本关结算'}
cfg=json.loads((W/'narration.json').read_text(encoding='utf-8'));timeline=[];subs=[];parts=[];voices=[];games=[];offset=0
clean=lambda s:''.join(re.findall(r'[\w\u4e00-\u9fff]',s))
color='scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709'
for seg in cfg['segments']:
    sid=seg['id'];voice=A/(sid+'.mp3');info=json.loads(voice.with_suffix('.json').read_text(encoding='utf-8'))
    # Edge MP3s contain about a second of end padding. Keep real spoken
    # boundaries plus natural breathing room rather than accumulating silence.
    last_mark=info['marks'][-1];spoken_end=(last_mark['offset']+last_mark['duration'])/1e7
    dur=math.ceil((spoken_end+.18+.45+(1.2 if sid in ['06-result','09-vote'] else 0))*30)/30
    spans=[];pos=0
    for m in info['marks']:
        n=len(clean(m['text']));spans.append((pos,pos+n,m['offset']/1e7,(m['offset']+m['duration'])/1e7));pos+=n
    pos=0
    for line in seg['lines']:
        for phrase in re.findall(r'[^，。！？；：]+[，。！？；：]?',line):
            n=len(clean(phrase));hits=[s for s in spans if s[1]>pos and s[0]<pos+n];pos+=n
            if not n:continue
            assert hits,(sid,phrase)
            subs.append({'start':offset+.18+hits[0][2],'end':min(offset+dur-.1,offset+.18+hits[-1][3]+.12),'text':phrase.rstrip('，。；：'),'segment':sid,'y':925 if sid in ['02-room','03-join','07-limits','08-toy','09-vote'] else 805,'timing_source':'Edge-TTS WordBoundary'})
    assert pos==spans[-1][1],(sid,pos,spans[-1][1])
    shots=[];remaining=dur;local=0;pictureParts=[];gameParts=[]
    for i,(src,start,ln) in enumerate(PLAN[sid]):
        length=remaining if ln is None else ln;remaining-=length
        target=E/f'{sid}-{i}.mp4';audio=A/f'{sid}-game-{i}.wav';still=src.suffix=='.png';vf='fps=30,'+color
        if sid in LABELS:
            overlay=Image.new('RGBA',(1920,1080));dd=ImageDraw.Draw(overlay);label=LABELS[sid];width=dd.textbbox((0,0),label,font=font(32))[2]+38
            dd.rounded_rectangle((55,86,55+width,144),radius=14,fill=(13,34,27,224),outline='#d3c484',width=2);dd.text((75,95),label,font=font(32),fill='#fff5db');ov=E/(sid+'-overlay.png');overlay.save(ov)
            inputs=['-ss',start,'-i',src,'-loop','1','-i',ov]
            if sid=='06-result':
                result=Image.new('RGBA',(1920,1080));dr=ImageDraw.Draw(result)
                dr.rounded_rectangle((445,348,1475,635),radius=30,fill=(20,46,30,235),outline='#f3d873',width=4)
                dr.text((960,420),'本关清完 20 辆敌人',font=font(62),fill='#fff5d6',anchor='mm')
                dr.text((960,545),'老鹰还在！',font=font(79),fill='#ffe281',anchor='mm')
                badge=E/'result-badge.png';result.save(badge);inputs+=['-loop','1','-i',badge]
                graph=f"[0:v][1:v]overlay=0:0[v0];[v0][2:v]overlay=0:0:enable='gte(t,3.3)',{vf}[v]"
            else:graph=f'[0:v][1:v]overlay=0:0,{vf}[v]'
            filters=['-filter_complex',graph,'-map','[v]']
        else:inputs=['-loop','1','-i',src] if still else ['-ss',start,'-i',src];filters=['-vf',vf]
        run([*inputs,*filters,'-t',length,'-an','-c:v','h264_nvenc','-preset','p5','-cq','18','-b:v','0','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',target])
        if still:run(['-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t',length,audio])
        else:run(['-ss',start,'-i',src,'-vn','-t',length,'-af',f'apad,atrim=duration={length},afade=t=in:d=0.025,afade=t=out:st={length-.075}:d=0.075','-ar','48000','-ac','2',audio])
        pictureParts.append(target);gameParts.append(audio);shots.append({'source':str(src.relative_to(W)).replace('\\','/'),'source_in':start,'source_out':start+length,'final_in':offset+local,'final_out':offset+local+length,'kind':'closing guide card from actual public screenshots' if still else 'real-time co-op gameplay','speed':1});local+=length
    assert abs(remaining)<1e-8
    for name,paths in [('picture',pictureParts),('game',gameParts)]:
        lst=E/f'{sid}-{name}.ffconcat';lst.write_text('\n'.join("file '"+str(p).replace('\\','/')+"'" for p in paths),encoding='utf-8')
        out=E/(sid+'.mp4') if name=='picture' else A/(sid+'-game.wav')
        run(['-f','concat','-safe','0','-i',lst,'-c','copy',out]);
    run(['-i',voice,'-af',f'adelay=180:all=1,apad,atrim=duration={dur}','-ar','48000','-ac','2',A/(sid+'-voice.wav')])
    parts.append(E/(sid+'.mp4'));voices.append(A/(sid+'-voice.wav'));games.append(A/(sid+'-game.wav'))
    timeline.append({'id':sid,'final_in':offset,'final_out':offset+dur,'lines':seg['lines'],'shots':shots});offset+=dur;print(sid,round(dur,2),flush=True)
def astamp(t):
    n=round(t*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
def sstamp(t):
    n=round(t*1000);return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
ass=['[Script Info]','ScriptType: v4.00+','PlayResX: 1920','PlayResY: 1080','WrapStyle: 2','[V4+ Styles]','Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding','Style: Default,Microsoft YaHei,48,&H00FFFFFF,&H00FFFFFF,&H00121D18,&H88000000,-1,0,0,0,100,100,0,0,1,3,1,2,100,100,270,1','[Events]','Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text']
for i,s in enumerate(subs):
    if i+1<len(subs):s['end']=min(s['end'],subs[i+1]['start']-.02)
    ass.append(f"Dialogue: 0,{astamp(s['start'])},{astamp(s['end'])},Default,,0,0,0,,{{\\an2\\pos(960,{s['y']})}}{s['text']}")
(E/'captions.ass').write_text('\n'.join(ass),encoding='utf-8-sig');(E/'captions.srt').write_text('\n\n'.join(f"{i+1}\n{sstamp(s['start'])} --> {sstamp(s['end'])}\n{s['text']}" for i,s in enumerate(subs)),encoding='utf-8-sig');savej(E/'alignment.json',subs);savej(E/'timeline.json',{'duration':offset,'fps':30,'segments':timeline})
for name,paths,target in [('picture',parts,E/'assembled.mp4'),('voice',voices,A/'narration-dry.wav'),('game',games,A/'game-edited.wav')]:
    lst=E/(name+'.ffconcat');lst.write_text('\n'.join("file '"+str(p).replace('\\','/')+"'" for p in paths),encoding='utf-8');run(['-f','concat','-safe','0','-i',lst,'-c','copy',target])
mix=f'[0:a]asplit=2[v][s];[1:a]volume=.15[g];[g][s]sidechaincompress=threshold=.014:ratio=8:attack=12:release=180[d];[v][d]amix=inputs=2:duration=first:normalize=0,afade=t=out:st={offset-1.3}:d=1.3[m]'
run(['-i',A/'narration-dry.wav','-i',A/'game-edited.wav','-filter_complex',mix,'-map','[m]','-ar','48000','-ac','2',A/'mix-raw.wav'])
log=run(['-i',A/'mix-raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-']);data=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',log)[-1]);savej(W/'qa/loudnorm-pass1.json',data)
norm=f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={data['input_i']}:measured_TP={data['input_tp']}:measured_LRA={data['input_lra']}:measured_thresh={data['input_thresh']}:offset={data['target_offset']}:linear=true"
run(['-i',A/'mix-raw.wav','-af',norm,'-ar','48000','-ac','2',A/'mix-final.wav'])
final=F/'gameplay-zh-final.mp4';run(['-i',E/'assembled.mp4','-i',A/'mix-final.wav','-map','0:v','-map','1:a','-vf',f'ass=edit/shared-zh/captions.ass,fade=t=out:st={offset-1.3}:d=1.3','-c:v','h264_nvenc','-preset','p6','-cq','18','-b:v','0','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:a','aac','-b:a','192k','-t',offset,'-movflags','+faststart',final])
savej(W/'qa-render.json',{'sha256':hashlib.sha256(final.read_bytes()).hexdigest(),'duration':offset,'probe':probe(final),'voice':cfg['voice'],'audio_listening':'not-run','status':'pending_visual_qa'});print('FINAL',offset,final,flush=True)

"""Reproducible Bilibili edit, using actual TTS sentence timings and live game captures."""
import json, subprocess, re, math
from pathlib import Path

HERE=Path(__file__).resolve().parent
FF='D:/sd/ffmpeg/bin/ffmpeg.exe'
FINAL=HERE.parent/'final'/'bilibili-zh'
EDIT=HERE/'edit'/'shared-zh'
for p in (FINAL,EDIT,HERE/'qa',HERE/'audio'):p.mkdir(parents=True,exist_ok=True)

def run(args):
    p=subprocess.run([FF,'-hide_banner','-y',*map(str,args)],cwd=HERE,capture_output=True,encoding='utf-8',errors='replace')
    if p.returncode:raise RuntimeError(p.stderr[-6000:])
    return p.stderr

events=json.loads((HERE/'audio/timings.json').read_text(encoding='utf-8'))
starts=[e['offset']/1e7 for e in events]
duration=math.ceil((events[-1]['offset']+events[-1]['duration'])/1e7*30)/30+2
def stamp(t):
    cs=round(t*100);return f'{cs//360000}:{cs//6000%60:02d}:{cs//100%60:02d}.{cs%100:02d}'

wrapped=[
    '虫潮来了，\\N这座基地你能守住吗？',
    '这是我用AI辅助做的\\N《虫潮前哨》。',
    '开门出击，机枪扫射，\\N敌人贴近了就甩一颗手雷。',
    '别光顾着追虫子，\\N身后才是要守的基地。',
    '这一波守住了，\\N基地一滴血没掉。',
    '试玩版已经上线B站Toy，\\N点简介里的链接就能玩。',
    '你试完告诉我，\\N哪处操作最别扭？',
    '下一版，\\N我想先把操作体验打磨好。',
]
ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,50,&H00FFFFFF,&H00FFFFFF,&H00101820,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,100,100,270,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
srt=[]
for i,(e,txt) in enumerate(zip(events,wrapped)):
    st=e['offset']/1e7
    en=min((e['offset']+e['duration'])/1e7,starts[i+1]-.01 if i+1<len(starts) else duration-.8)
    if i==len(events)-1:en=duration-.8
    ass+=f'Dialogue: 0,{stamp(st)},{stamp(en)},Default,,0,0,0,,{{\\an2\\pos(960,810)}}{txt}\n'
    def srtt(t):
        ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    srt.append(f'{i+1}\n{srtt(st)} --> {srtt(en)}\n'+txt.replace('\\N','\n'))
(EDIT/'captions.ass').write_text(ass,encoding='utf-8-sig')
(EDIT/'captions.zh.srt').write_text('\n\n'.join(srt)+'\n',encoding='utf-8-sig')

# Six non-overlapping source ranges, all captured in one real-time session at normal speed.
cuts=[(0,starts[1],21), (starts[1],starts[2],2.9), (starts[2],starts[3],10.5),
      (starts[3],starts[4],41.5), (starts[4],starts[5],50.8), (starts[5],duration,55)]
timeline=[dict(final_in=a,final_out=b,source='capture/defense.webm',source_in=c,source_out=c+b-a,speed=1) for a,b,c in cuts]
(EDIT/'timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
graph=[]
graph.append('[0:v]split=6'+''.join(f'[vs{i}]' for i in range(6)))
graph.append('[0:a]asplit=6'+''.join(f'[as{i}]' for i in range(6)))
for i,(a,b,c) in enumerate(cuts):
    length=b-a
    graph.append(f'[vs{i}]trim=start={c}:duration={length},setpts=PTS-STARTPTS,fps=30,setsar=1[v{i}]')
    graph.append(f'[as{i}]atrim=start={c}:duration={length},asetpts=PTS-STARTPTS,aresample=48000,afade=t=in:d=0.03,afade=t=out:st={length-.03}:d=0.03[a{i}]')
graph.append(''.join(f'[v{i}][a{i}]' for i in range(6))+'concat=n=6:v=1:a=1[vc][ac]')
font="fontfile='C\\:/Windows/Fonts/msyhbd.ttc'"
end=starts[5]
overlays=[f"drawbox=x=0:y=0:w=iw:h=ih:color=0x061527@0.82:t=fill:enable='gte(t,{end})'",
 f"drawtext={font}:text='虫潮前哨':fontsize=100:fontcolor=white:x=(w-tw)/2:y=225:enable='gte(t,{end})'",
 f"drawtext={font}:text='已上线 B站 Toy':fontsize=58:fontcolor=0xffd35a:x=(w-tw)/2:y=370:enable='gte(t,{end})'",
 f"drawtext={font}:text='简介链接 · 点击试玩':fontsize=40:fontcolor=0xd4e7ed:x=(w-tw)/2:y=477:enable='gte(t,{end})'",
 f"drawtext={font}:text='你觉得哪处操作最别扭？':fontsize=42:fontcolor=0x8dcfdb:x=(w-tw)/2:y=579:enable='gte(t,{starts[6]})'",
 "subtitles=edit/shared-zh/captions.ass:fontsdir='C\\:/Windows/Fonts'",
 f'fade=t=out:st={duration-.7}:d=0.7,format=yuv420p']
graph.append('[vc]'+','.join(overlays)+'[vout]')
graph.append('[ac]anull[aout]')
(EDIT/'video-filter.txt').write_text(';\n'.join(graph),encoding='utf-8')
run(['-i','capture/defense.webm','-filter_complex_script','edit/shared-zh/video-filter.txt','-map','[vout]','-map','[aout]',
     '-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',
     '-c:a','pcm_s16le','-t',duration,'edit/shared-zh/picture.mkv'])
run(['-i','edit/shared-zh/picture.mkv','-vn','-c:a','pcm_s16le','audio/game-edited.wav'])
# Preserve mixed original game audio (music+effects), with narration-triggered ducking.
mix=f'[0:a]aresample=48000,apad,atrim=duration={duration},asplit=2[voice][side];[1:a]volume=0.22[game];[game][side]sidechaincompress=threshold=0.015:ratio=8:attack=10:release=180[duck];[voice][duck]amix=inputs=2:duration=first:normalize=0,afade=t=out:st={duration-.7}:d=0.7[mix]'
run(['-i','audio/narration.mp3','-i','audio/game-edited.wav','-filter_complex',mix,'-map','[mix]','-ar','48000','-ac','2','audio/mix-raw.wav'])
meas=run(['-i','audio/mix-raw.wav','-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'])
data=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',meas)[-1])
(HERE/'qa/loudnorm-pass1.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
norm=f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={data['input_i']}:measured_TP={data['input_tp']}:measured_LRA={data['input_lra']}:measured_thresh={data['input_thresh']}:offset={data['target_offset']}:linear=true"
run(['-i','audio/mix-raw.wav','-af',norm,'-ar','48000','-ac','2','audio/mix-final.wav'])
run(['-i','edit/shared-zh/picture.mkv','-i','audio/mix-final.wav','-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart','-t',duration,FINAL/'gameplay-zh-final.mp4'])
print(json.dumps({'duration':duration,'video':str(FINAL/'gameplay-zh-final.mp4')},ensure_ascii=False))

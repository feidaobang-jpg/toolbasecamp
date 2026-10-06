"""Align the corrected script to real ASR word timestamps (no total-length estimate)."""
from pathlib import Path
import json,re,difflib
ROOT=Path(__file__).resolve().parents[2]
text=(ROOT/'narration.txt').read_text(encoding='utf-8').strip()
data=json.loads((ROOT/'audio/shared-zh/asr-original.json').read_text(encoding='utf-8'))
def norm(s):return ''.join(c.lower() for c in s if c.isalnum())
source=norm(text);recognized='';times=[]
for w in data['words']:
    chars=norm(w['word']);recognized+=chars
    times.extend([(w['start'],w['end'])]*len(chars))
mapped=[None]*len(source);corrections=[]
for tag,a,b,c,d in difflib.SequenceMatcher(None,source,recognized,autojunk=False).get_opcodes():
    if tag=='equal':mapped[a:b]=times[c:d]
    elif a<b:
        start=times[c][0] if c<len(times) else times[-1][1]
        end=times[d-1][1] if d>c else start
        mapped[a:b]=[(start,end)]*(b-a)
        corrections.append({'script':source[a:b],'asr':recognized[c:d],'start':start,'end':end})
caps=[];paras=[];offset=0
for pi,paragraph in enumerate(text.splitlines()):
    pstart=offset;pieces=[x for x in re.split(r'(?<=[，。；！：？])',paragraph) if x]
    joined=[]
    for part in pieces:
        if joined and len(norm(joined[-1]))<6 and len(norm(joined[-1]+part))<=24:joined[-1]+=part
        else:joined.append(part)
    for part in joined:
        n=len(norm(part));t=mapped[offset:offset+n];offset+=n
        caps.append({'start':t[0][0],'end':max(v[1] for v in t),'text':part,'paragraph':pi+1})
    paras.append({'paragraph':pi+1,'start':mapped[pstart][0],'end':mapped[offset-1][1],'text':paragraph})
for i,c in enumerate(caps):
    # ASR can return overlaps near punctuation. Use the next measured onset as boundary.
    nxt=caps[i+1]['start'] if i+1<len(caps) else 156.3
    c['end']=min(max(c['end']+.14,c['start']+.4),nxt-.025)
    if c['end']<=c['start']:raise ValueError(c)
(ROOT/'edit/shared-zh/alignment.json').write_text(json.dumps({'method':'Groq Whisper large-v3 word timestamps, script orthography corrected','corrections':corrections,'paragraphs':paras,'captions':caps},ensure_ascii=False,indent=2),encoding='utf-8')
def stamp(t,ass=False):
    ms=round(t*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h}:{m:02}:{s:02}.{ms//10:02}' if ass else f'{h:02}:{m:02}:{s:02},{ms:03}'
srt='\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(caps))
(ROOT/'edit/shared-zh/subtitles.srt').write_text(srt,encoding='utf-8')
ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,43,&H00FFFFFF,&H000000FF,&H00141210,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,130,130,282,1
Style: Chapter,Microsoft YaHei,28,&H00AAE8F0,&H000000FF,&H00141210,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,7,440,40,28,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
for c in caps:
    y=710 if 56.66<=c['start']<64.0 else 798
    ass+=f"Dialogue: 0,{stamp(c['start'],True)},{stamp(c['end'],True)},Default,,0,0,0,,{{\\an2\\pos(960,{y})}}{c['text']}\n"
chapters=[(0,5.1,'精彩片段 · 反攻母皇'),(5.2,14.5,'虫潮围城 · 新版实战'),(35,43,'01 补给与换装'),(54.6,64,'02 自由建造'),(64.2,73,'03 小队与精英巢穴'),(73.3,80,'04 反攻虫巢'),(90.23,98.33,'战斗细节 · 0.5× 慢放'),(105.7,114,'05 回防基地'),(120.5,126.3,'本轮复盘')]
for a,b,t in chapters:ass+=f'Dialogue: 1,{stamp(a,True)},{stamp(b,True)},Chapter,,0,0,0,,{t}\n'
(ROOT/'edit/shared-zh/subtitles.ass').write_text(ass,encoding='utf-8-sig')
print(json.dumps(paras,ensure_ascii=False,indent=2));print('captions',len(caps),'corrections',corrections)

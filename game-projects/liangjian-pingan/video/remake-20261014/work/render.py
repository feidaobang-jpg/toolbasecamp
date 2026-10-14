"""Rebuild the Bilibili edit from compositor frames and real IndexTTS timings."""
from pathlib import Path
import json, math, subprocess, wave, argparse
W=Path(__file__).resolve().parent
F=W.parent/'final/bilibili-zh';T=W/'tmp';E=W/'edit';A=W/'audio/shared-zh'
for p in (F,T,E):p.mkdir(parents=True,exist_ok=True)
plan=json.loads((W/'units.json').read_text('utf-8'))
capture={n:json.loads((W/'capture'/f'{n}.json').read_text('utf-8')) for n in ['full','mg','street','finale']}
shots={
 '01-hook':[('full',63.9,6),('full',66.1,3.5),('mg',24,0)],
 '02-story':[('full',0.8,5),('full',25,5),('full',55,0)],
 '03-outside':[('full',2,5),('full',8,5),('full',14,0)],
 '04-controls':[('full',11,7),('full',71.5,0)],
 '05-design':[('full',20,0)],
 '05b-mg':[('mg',20.6,0)],
 '06-escort':[('full',27,7),('full',36,0)],
 '07-cannon':[('full',51.7,5),('full',56.2,6),('full',61.8,0)],
 '08-collapse':[('full',64.4,6.6),('full',71,7),('full',80,0)],
 '09-street':[('street',22,4),('street',30.8,6),('street',35,0)],
 '10-boss':[('full',374,6),('full',396,5),('full',408,0)],
 '11-result':[('full',426.7,3.4),('full',387.5,4.8),('full',428.5,0)],
 '12-ending':[('full',429.2,0)],
}
labels={
 '01-hook':'意大利炮，真能轰塌城楼！',
 '02-story':'开发记录回顾 · Claude 从零重做本章',
 '03-outside':'① 先拿下城外机枪阵地',
 '04-controls':'手动瞄准 · 越肩 / 第一人称',
 '05-design':'开发取舍 · 删去亮剑 / 骑兵连技能',
 '05b-mg':'新增 · 拿下阵地后接管机枪',
 '06-escort':'② 护送意大利炮 · 保住炮组',
 '07-cannon':'③ 调整炮口与仰角 · 绿圈对准目标',
 '08-collapse':'城楼倒下 · 冲锋进城',
 '09-street':'④ 巷战补拍 · 军火库缴获机枪',
 '10-boss':'⑤ 守备队部 · 决战山本',
 '11-result':'实机结果 · 78击败 / 12次阵亡重整 / 6发炮弹',
 '12-ending':'枪火集结 → 抗战战役 → 平安县城',
}
def run(args):
 subprocess.run(args,check=True,encoding='utf-8',errors='replace')
def writewav(p,data):
 with wave.open(str(p),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(24000);f.writeframes(data)
def ass_t(s):
 c=round(s*100);return f'{c//360000}:{c//6000%60:02}:{c//100%60:02}.{c%100:02}'
def srt_t(s):
 c=round(s*1000);return f'{c//3600000:02}:{c//60000%60:02}:{c//1000%60:02},{c%1000:03}'
timeline=[];subs=[];texts=[];audio=[];game_audio=[];cursor=0
for seg in plan['segments']:
 sid=seg['id']; meta=json.loads((A/f'{sid}.json').read_text('utf-8'))
 with wave.open(str(A/f'{sid}.wav'),'rb') as f:raw=f.readframes(f.getnframes())
 dur=math.ceil((len(raw)/48000+.5)*30)/30
 if sid=='12-ending':dur+=1.6
 voice=b'\0\0'*4800+raw;voice+=b'\0\0'*(round(dur*24000)-len(voice)//2);audio.append(voice)
 for m in meta['marks']:
  st=cursor+.2+m['offset']/1e7;subs.append((st,st+m['duration']/1e7,m['text']))
 texts.append((cursor,cursor+dur,'Label',labels[sid]))
 if sid in ['05b-mg','09-street']:texts.append((cursor,cursor+dur,'Note','分段实机补拍 · 正常耐久 / 无限命'))
 if sid=='01-hook':texts.append((0,dur,'Note','v0.3.0 · 实机自动化操作 / 剪辑节选'))
 if sid=='05-design':texts.append((cursor+.2,cursor+dur,'Card',r'v0.1 初版：亮剑突进 / 骑兵连\N↓\Nv0.3 取舍：手动枪战 / 机枪接管'))
 if sid=='12-ending':texts.append((cursor,cursor+dur,'Card',r'已完成：护炮 · 轰城 · 巷战 · Boss\N下一步：瞄准手感 / 战友绕障碍\N哔哩哔哩 Toy · 视频下方入口试玩'))
 local=0
 for k,(source,start,d) in enumerate(shots[sid]):
  if k==len(shots[sid])-1:d=dur-local
  if d<=0:raise ValueError((sid,d))
  n=len(timeline);cl=T/f'shot-{n:02}.ffconcat';dst=T/f'shot-{n:02}.mp4';fr=capture[source]['frames'];end=min(start+d,fr[-1]['t'])
  selected=[x for x in fr if start<=x['t']<end]
  if not selected:raise ValueError((sid,start,end))
  lines=['ffconcat version 1.0']
  for i,f in enumerate(selected):
   nxt=selected[i+1]['t'] if i+1<len(selected) else end
   p=(W/'capture'/f'{source}-frames'/f['file']).resolve().as_posix()
   lines += [f"file '{p}'",f'duration {max(.001,nxt-f["t"]):.6f}']
  lines.append(f"file '{p}'")
  cl.write_text('\n'.join(lines)+'\n',encoding='utf-8')
  if not dst.exists():
   run(['ffmpeg','-v','error','-y','-safe','0','-f','concat','-i',str(cl),'-vf',f'fps=30,tpad=stop_mode=clone:stop_duration={d},trim=duration={d},setpts=PTS-STARTPTS,format=yuv420p','-an','-c:v','h264_nvenc','-preset','p5','-cq','18','-b:v','0',str(dst)])
  # Game sound is the actual captured bus, cut from the same source range.
  ga=T/f'game-{n:02}.wav'; available=end-start
  if not ga.exists():run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(W/'capture'/f'{source}-game-audio.webm'),'-t',str(min(d,available)),'-af','volume=0.14','-ar','24000','-ac','1',str(ga)])
  with wave.open(str(ga),'rb') as f:g=f.readframes(f.getnframes())
  size=round(d*24000)*2;g=g[:size]+b'\0'*max(0,size-len(g));game_audio.append(g)
  timeline.append({'segment':sid,'source':source,'source_in':start,'source_out':end,'in_seconds':cursor+local,'duration':d,'capture_mode':'realtime-automation','freeze_tail_seconds':max(0,d-(end-start))})
  local+=d
 cursor+=dur
writewav(E/'narration.wav',b''.join(audio));writewav(E/'game-track.wav',b''.join(game_audio))
(E/'timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2),encoding='utf-8')
ass='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Sub,Microsoft YaHei,46,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,80,80,245,1
Style: Label,Microsoft YaHei,34,&H0082DAFF,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,7,42,42,118,1
Style: Note,Microsoft YaHei,23,&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,0,0,1,2,1,7,42,42,167,1
Style: Card,Microsoft YaHei,45,&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,0,0,3,2,0,5,80,80,40,1
[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
'''
for a,b,t in subs:ass+=f'Dialogue: 2,{ass_t(a)},{ass_t(b)},Sub,,0,0,0,,{{\\an2\\pos(960,835)}}{t}\n'
for a,b,s,t in texts:ass+=f'Dialogue: 1,{ass_t(a)},{ass_t(b)},{s},,0,0,0,,{t}\n'
(E/'captions.ass').write_text(ass,encoding='utf-8-sig')
(E/'captions.srt').write_text('\n\n'.join(f'{i+1}\n{srt_t(a)} --> {srt_t(b)}\n{t}' for i,(a,b,t) in enumerate(subs))+'\n',encoding='utf-8')
concat=T/'edit.ffconcat';concat.write_text('ffconcat version 1.0\n'+''.join(f"file '{(T/f'shot-{i:02}.mp4').as_posix()}'\n" for i in range(len(timeline))),encoding='utf-8')
run(['ffmpeg','-v','error','-y','-safe','0','-f','concat','-i',str(concat),'-c','copy',str(T/'picture.mp4')])
run(['ffmpeg','-v','error','-y','-i',str(E/'narration.wav'),'-i',str(E/'game-track.wav'),'-filter_complex',f'[0:a]volume=1.0[v];[v][1:a]amix=inputs=2:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=9,afade=t=out:st={cursor-1.3}:d=1.3[m]','-map','[m]',str(E/'mix.wav')])
run(['ffmpeg','-v','error','-y','-i',str(T/'picture.mp4'),'-i',str(E/'mix.wav'),'-vf',f"scale=in_range=pc:out_range=tv,format=yuv420p,ass=edit/captions.ass,fade=t=out:st={cursor-1.2}:d=1.2",'-c:v','h264_nvenc','-preset','p5','-cq','18','-b:v','0','-pix_fmt','yuv420p','-color_range','tv','-bsf:v','h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0','-c:a','aac','-b:a','192k','-ar','48000','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart','-t',str(cursor),str(F/'gameplay-zh-final.mp4')])
print('rendered',round(cursor,2),'seconds',len(timeline),'shots')

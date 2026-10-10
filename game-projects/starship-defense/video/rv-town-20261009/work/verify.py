"""Verify final files, real word timings, image sizes, decoded audio and gameplay facts."""
from pathlib import Path
import json,subprocess,re,hashlib
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parent;Q=R/'qa';Q.mkdir(exist_ok=True);F=R.parent/'final';E=R/'edit/shared-zh';checks=[]
def run(a):return subprocess.run(a,capture_output=True,text=True,encoding='utf-8',errors='replace',check=True)
def probe(p):return json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(p)]).stdout)
def check(n,v,d=None):checks.append({'name':n,'pass':bool(v),'detail':d});assert v,n;print('PASS',n,flush=True)
cap=json.loads((R/'capture/journey-02/capture.json').read_text(encoding='utf-8'));state=cap['finalState'];check('actual normal-rules successful evacuation',state['over'] and state['state']=='over' and not state['testMode'] and cap['normal_rule_inputs_only'] and not cap['errors']);check('actual result: two zones, 12 zombies, 314 scrap',sum(state['looted'])==2 and state['defeated']==12 and state['scrap']==314,state['result'])
timeline=json.loads((E/'timeline.json').read_text(encoding='utf-8'));check('one-to-one Chinese and English cue timing',[(x['start'],x['end']) for x in timeline['subtitles']]==[(x['start'],x['end']) for x in timeline['english_subtitles']]);check('subtitle times within final duration',all(0<=x['start']<x['end']<=timeline['duration'] for x in timeline['subtitles']));check('every shot normal speed',all(s['speed']==1 for s in timeline['shots']))
check('tail includes full narration plus reading margin',timeline['duration']-(timeline['segments'][-1]['start']+timeline['segments'][-1]['voice_offset']+timeline['segments'][-1]['voice_duration'])>=2)
probes={}
for v,name in [('bilibili-zh','gameplay-zh-final.mp4'),('youtube-zh','gameplay-youtube-final.mp4')]:
 p=F/v/name;info=probe(p);probes[v]=info;video=next(s for s in info['streams'] if s['codec_type']=='video');audio=next(s for s in info['streams'] if s['codec_type']=='audio');check(v+' native 1080p and H264/AAC',video['width']==1920 and video['height']==1080 and video['codec_name']=='h264' and audio['codec_name']=='aac');check(v+' duration matches timeline',abs(float(info['format']['duration'])-timeline['duration'])<.2)
 run(['ffmpeg','-v','error','-i',str(p),'-f','null','-']);check(v+' complete decode',True)
 log=run(['ffmpeg','-hide_banner','-i',str(p),'-af','loudnorm=I=-16:TP=-1:LRA=11:print_format=json','-f','null','-']).stderr;stats=json.JSONDecoder().raw_decode(log[log.rfind('{'):])[0];(Q/(v+'-loudness.json')).write_text(json.dumps(stats,indent=2),encoding='utf-8');check(v+' measured loudness and peak',-17.5<float(stats['input_i'])<-14.5 and float(stats['input_tp'])<=-.5,stats)
 log=run(['ffmpeg','-hide_banner','-i',str(p),'-vf','blackdetect=d=0.2:pix_th=0.05','-af','silencedetect=n=-45dB:d=1','-f','null','-']).stderr;(Q/(v+'-signal-scan.txt')).write_text(log,encoding='utf-8');check(v+' no unintended black sections',not re.search(r'black_start:(\d[^ ]*)',log),[l for l in log.splitlines() if 'black_' in l or 'silence_' in l])
 check(v+' audio reviewed objectively only',True,'Subjective listening unavailable; leave human review pending.')
for p in F.rglob('*.jpg'):
 im=Image.open(p);w,h=im.size;ratio=(4,3) if '4x3' in p.name else (16,9);check(p.name+' exact ratio',w*ratio[1]==h*ratio[0],{'size':[w,h],'bytes':p.stat().st_size})
main=F/'bilibili-zh/gameplay-zh-final.mp4';dy=F/'douyin-zh/gameplay-zh-final.mp4';check('Bilibili and Douyin same verified film',hashlib.sha256(main.read_bytes()).hexdigest()==hashlib.sha256(dy.read_bytes()).hexdigest())
rows=[];times=[1.5,6.8,12.3,23.7,32.5,38.8,47.5,56,65.3,76.4,88.5,97.3,105.5,108.1]
sheet=Image.new('RGB',(1920,1280),'#080e14');draw=ImageDraw.Draw(sheet);font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',22)
for i,t in enumerate(times):
 p=Q/('frame-%05.1f.png'%t);run(['ffmpeg','-v','error','-y','-ss',str(t),'-i',str(main),'-frames:v','1',str(p)]);im=Image.open(p);im.thumbnail((480,270));x=i%4*480;y=i//4*320;sheet.paste(im,(x,y));draw.text((x+10,y+275),'%.1f 秒'%t,font=font,fill='white');rows.append({'time':t,'file':str(p.relative_to(R))})
sheet.save(Q/'final-contact-sheet.jpg',quality=95);(Q/'final-technical.json').write_text(json.dumps({'checks':checks,'probes':probes,'visual_review_frames':rows,'subjective_listening':'not-run: model audio input unavailable','human_review':'pending'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

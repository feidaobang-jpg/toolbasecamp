"""Rebuild the 1080p Chinese edit from retained footage and measured voice timings.
Run: python work/edit/shared-zh/render.py [--preview]
All dependencies resolve relative to this episode.
"""
from pathlib import Path
import subprocess,json,math,sys
from PIL import Image,ImageDraw,ImageFont
R=Path(__file__).resolve().parents[2];E=Path(__file__).resolve().parent
OUT=R.parent/'final/bilibili-zh';TMP=E/'rendered-shots';TMP.mkdir(exist_ok=True)
FONT='C:/Windows/Fonts/msyh.ttc';BOLD='C:/Windows/Fonts/msyhbd.ttc'
def run(args,**kw):return subprocess.run(args,check=True,**kw)
def ff(args):return run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)])
def card(name,kicker,title,rows,footer):
    im=Image.new('RGB',(1920,1080),'#0b1722');d=ImageDraw.Draw(im)
    d.rectangle((0,0,1920,14),fill='#67dfcc')
    d.rounded_rectangle((112,103,540,157),radius=14,fill='#19333c')
    d.text((136,110),kicker,font=ImageFont.truetype(BOLD,30),fill='#96eadb')
    d.text((112,210),title,font=ImageFont.truetype(BOLD,76),fill='#ffe7a0')
    y=375
    for a,b in rows:
        d.rounded_rectangle((112,y,1808,y+124),radius=18,fill='#152a37')
        d.text((145,y+21),a,font=ImageFont.truetype(BOLD,36),fill='#fafafa')
        d.text((145,y+73),b,font=ImageFont.truetype(FONT,27),fill='#a7bdc9');y+=148
    d.text((112,942),footer,font=ImageFont.truetype(FONT,26),fill='#7f9baa')
    im.save(E/name)
card('recap.png','虫潮围城 · 本轮复盘','路线打通，体验继续打磨',[
 ('补给 → 装备 → 母皇 → 回防','本轮结果：击破母皇，第一波守住，基地满血'),
 ('下一步重点：隧道视野 / 队友跟随','来自本次实际试玩的观察；欢迎带着问题再试一局')],
 '录制构建：2026-10-04 凌晨快照 · 页面后续更新以实际试玩为准')
card('play.png','虫潮围城 · 继续试玩','喜欢这座基地？空投个三连补给',[
 ('试玩入口已放在视频简介','百宝箱 / 哔哩哔哩 Toy · 搜索「虫潮围城」'),
 ('这次，换你反攻母皇','买装备、布置防线，再从虫洞打回去')],
 'www.zhengxiaohui.cn · 电脑操作演示 · 完整试玩链接见简介')
card('vote.png','百宝箱 · 自研游戏投票榜','下一款更新，由你来点名',[
 ('给想继续玩的自研游戏投票','榜单会决定接下来优先优化哪几款'),
 ('想玩的复刻，写进愿望单','百宝箱 → 游戏 → 自研游戏投票榜')],
 'www.zhengxiaohui.cn/game-vote.html                                      我们下次再见！')
# end time, source folder (or card), source in/out, intended visible evidence.
spec=[
 (5.2,'06-laser-squad',78,83.2,'开场母皇战精彩节选'),
 (14.74,'10-closing',0,9.54,'基地与当前游戏外观'),
 (16.54,'01-preparation',0,1.8,'医疗兵出门'),
 (23.58,'01-preparation',26,33.04,'普通规则接近野怪自动攻击'),
 (29.84,'11-controls',.2,6.46,'正常按键冲刺与V切视角，操作补拍'),
 (35,'09-settings',1,6.16,'操作设置'),
 (37.2,'02-supply-mission',.2,2.4,'选择补给任务'),
 (39.14,'02-supply-mission',10,11.94,'补给站实战'),
 (40.64,'02-supply-mission',24,25.5,'首通奖励'),
 (43.26,'02-supply-mission',42,44.62,'回基地商店'),
 (45.16,'02-supply-mission',16,17.9,'机枪对守军持续射击'),
 (46.44,'03-equipment',0,1.28,'购买霰弹枪'),
 (49.3,'03-equipment',37,39.86,'霰弹枪参与守夜战斗'),
 (54.62,'03-equipment',70,75.32,'信标范围内移动拾取'),
 (56.66,'04-squad-build',65.5,67.54,'建造菜单'),
 (59.14,'04-squad-build',68.5,70.98,'机枪塔预览'),
 (61.30,'04-squad-build',71,73.16,'确认放置'),
 (64.26,'04-squad-build',73.16,75.16,'拆除并返还金币'),
 (65.12,'04-squad-build',0,1.2,'雇用队友，重排为功能说明'),
 (67.46,'05-elite-mission',1,3.34,'进入精英巢穴'),
 (70.1,'05-elite-mission',9,11.64,'小队参加副本实战'),
 (73.32,'05-elite-mission',20,23.22,'副本通关奖励'),
 (76.44,'06-laser-squad',0,3.12,'购买激光炮'),
 (80.13,'06-laser-squad',15,18.69,'出城前往中央虫洞'),
 (84.33,'06-laser-squad',23,27.2,'第一人称接近虫洞'),
 (90.23,'06-laser-squad',71,76.9,'穿过入口与隧道'),
 (98.33,'06-laser-squad',78.8,82.85,'母皇战细节，约0.5倍慢放'),
 (105.73,'06-laser-squad',82.85,90.25,'母皇击破与减压35%提示'),
 (109.51,'07-vehicle-defense',27,30.78,'拦截正常第一波虫潮'),
 (113.91,'07-vehicle-defense',38,42.4,'第二关准备，基地2000/2000'),
 (117.73,'12-boarding',0,3.82,'靠近并按I上车，操作补拍'),
 (120.59,'08-jeep',2,4.86,'驾驶战车穿过城门'),
 (126.37,'10-closing',3,8.78,'正常实机余镜'),
 (132.81,'recap.png',0,6.44,'实际结果与待优化问题'),
 (142.69,'play.png',0,9.88,'三连邀请与已核实试玩入口'),
 (156.7,'vote.png',0,14.01,'投票与愿望单引导，完整再见及2.47秒尾余量')]
shots=[];prev=0
for i,(end,src,si,so,note) in enumerate(spec):
    start=prev;prev=round(end*30);frames=prev-start;dur=frames/30;speed=(so-si)/dur
    shots.append(dict(index=i,start=start/30,end=prev/30,frames=frames,duration=dur,source=src,source_in=si,source_out=so,speed=speed,evidence=note,file=f'rendered-shots/{i:02}.mp4'))
(E/'timeline.json').write_text(json.dumps({'fps':30,'width':1920,'height':1080,'shots':shots},ensure_ascii=False,indent=2),encoding='utf8')
for s in shots:
    target=E/s['file']
    if target.exists():continue
    if s['source'].endswith('.png'):
        args=['-loop','1','-framerate','30','-i',E/s['source'],'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-vf','format=yuv420p']
    else:
        args=['-ss',s['source_in'],'-i',R/'capture'/s['source']/'raw.mp4','-filter_complex',
              f"[0:v]setpts=(PTS-STARTPTS)/{s['speed']:.9f},fps=30,format=yuv420p[v];[0:a]atempo={s['speed']:.9f},aresample=48000,apad[a]",'-map','[v]','-map','[a]']
    args+=['-t',s['duration'],'-c:v','h264_nvenc','-preset','p5','-cq','17','-c:a','aac','-ar','48000','-ac','2','-b:a','192k',target]
    ff(args);print('shot',s['index'],s['source'],flush=True)
concat=E/'shots.ffconcat';concat.write_text('\n'.join(f"file '{s['file']}'" for s in shots),encoding='utf8')
base=E/'picture-with-game-audio.mp4'
if not base.exists():ff(['-f','concat','-safe','0','-i',concat,'-c','copy',base])
audio=R/'audio/shared-zh';voice=audio/'narration-mambo.mp3';mix=audio/'mix-pre.wav'
if not mix.exists():
    ff(['-i',base,'-i',voice,'-filter_complex','[0:a]volume=0.18,afade=t=out:st=154.7:d=2[g];[1:a]highpass=f=70,apad,asplit=2[v][sc];[g][sc]sidechaincompress=threshold=0.035:ratio=5:attack=12:release=200[duck];[duck][v]amix=inputs=2:normalize=0,atrim=0:156.7[a]','-map','[a]','-ar','48000','-ac','2',mix])
    ff(['-i',base,'-vn','-c:a','pcm_s16le',audio/'game-edit.wav'])
stats=E/'loudness-pass1.json'
if not stats.exists():
    p=subprocess.run(['ffmpeg','-hide_banner','-i',str(mix),'-af','loudnorm=I=-16:TP=-1:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,encoding='utf8',check=True)
    stats.write_text(p.stderr[p.stderr.rfind('{'):],encoding='utf8')
m=json.JSONDecoder().raw_decode(stats.read_text(encoding='utf8'))[0]
stats.write_text(json.dumps(m,indent=2),encoding='utf8')
norm=f"loudnorm=I=-16:TP=-1:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
if not (audio/'final-mix.wav').exists():ff(['-i',mix,'-af',norm,'-ar','48000',audio/'final-mix.wav'])
preview='--preview' in sys.argv
target=R/'qa/sample.mp4' if preview else OUT/'gameplay-zh-final.mp4'
vf="ass=subtitles.ass,fade=t=out:st=155.7:d=1"
args=['-i',base,'-i',audio/'final-mix.wav','-map','0:v','-map','1:a','-vf',vf,'-c:v','h264_nvenc','-preset','p5','-cq','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart','-t',6 if preview else 156.7,target]
run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],cwd=E)
print(target,flush=True)

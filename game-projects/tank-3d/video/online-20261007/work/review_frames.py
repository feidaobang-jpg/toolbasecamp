"""Extract reproducible source/final review frames without changing game footage."""
import subprocess,sys,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
W=Path(__file__).resolve().parent
def sheet(source,times,name):
    out=W/'qa'/name;out.mkdir(parents=True,exist_ok=True)
    font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',22)
    im=Image.new('RGB',(1920,300*((len(times)+3)//4)),'#101b21');d=ImageDraw.Draw(im)
    for i,t in enumerate(times):
        f=out/f'{t:06.2f}.jpg'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-threads','2','-ss',str(t),'-i',str(source),'-frames:v','1','-q:v','2',str(f)],check=True)
        pic=Image.open(f).resize((480,270));x=i%4*480;y=i//4*300;im.paste(pic,(x,y));d.text((x+10,y+273),f'{name}  {t:.2f}s',font=font,fill='white')
    target=W/'qa'/f'{name}-contact.jpg';im.save(target,quality=94);print(target)
if __name__=='__main__':
    if len(sys.argv)>1:
        timeline=json.loads((W/'edit/shared-zh/timeline.json').read_text(encoding='utf-8'))
        times=[.4,4]+[round((s['final_in']+s['final_out'])/2,2) for s in timeline['segments']]+[timeline['duration']-1.8]
        sheet(W.parent/'final/bilibili-zh/gameplay-zh-final.mp4',times,'final')
    else:
        sheet(W/'capture/03-coop-battle-retimed.mp4',[4,9,19,24,31,43,55,74,82,107,114,124],'retimed-source')

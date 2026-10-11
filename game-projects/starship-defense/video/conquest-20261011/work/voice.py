"""Synthesize Yunxi at normal speed and retain real service word boundaries."""
import asyncio,json,sys,subprocess
from pathlib import Path
import edge_tts
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'audio/shared-zh';OUT.mkdir(parents=True,exist_ok=True)
cfg=json.loads((ROOT/'narration.json').read_text(encoding='utf-8'))
async def main():
 for seg in cfg['segments']:
  dst=OUT/(seg['id']+'.mp3');meta=OUT/(seg['id']+'.json')
  if dst.exists() and meta.exists() and json.loads(meta.read_text(encoding='utf-8'))['text']==seg['text']:continue
  for attempt in range(3):
   try:
    data=bytearray();marks=[]
    com=edge_tts.Communicate(seg['text'],cfg['voice'],rate=cfg['rate'],boundary='WordBoundary')
    async for chunk in com.stream():
     if chunk['type']=='audio':data.extend(chunk['data'])
     elif chunk['type']=='WordBoundary':marks.append({k:chunk[k] for k in ('offset','duration','text')})
    dst.write_bytes(data)
    duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(dst)],text=True))
    meta.write_text(json.dumps({'text':seg['text'],'voice':cfg['voice'],'rate':cfg['rate'],'duration':duration,'marks':marks},ensure_ascii=False,indent=2),encoding='utf-8')
    print(seg['id'],round(duration,2),'seconds',len(marks),'word boundaries',flush=True);break
   except Exception:
    if attempt==2:raise
    await asyncio.sleep(2*(attempt+1))
asyncio.run(main())

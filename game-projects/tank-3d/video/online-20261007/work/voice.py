"""Use the installed Edge-TTS environment; retain service word timestamps."""
import asyncio,json
from pathlib import Path
import edge_tts
W=Path(__file__).resolve().parent;A=W/'audio/shared-zh';A.mkdir(parents=True,exist_ok=True)
async def main():
    cfg=json.loads((W/'narration.json').read_text(encoding='utf-8'))
    for seg in cfg['segments']:
        text=''.join(seg['lines']);p=A/(seg['id']+'.mp3');j=p.with_suffix('.json')
        if p.exists() and j.exists() and json.loads(j.read_text(encoding='utf-8'))['text']==text:continue
        for attempt in range(3):
            try:
                data=bytearray();marks=[]
                async for c in edge_tts.Communicate(text,cfg['voice'],rate=cfg['rate'],boundary='WordBoundary').stream():
                    if c['type']=='audio':data.extend(c['data'])
                    elif c['type']=='WordBoundary':marks.append({k:c[k] for k in ['offset','duration','text']})
                assert data and marks
                p.write_bytes(data);j.write_text(json.dumps({'text':text,'voice':cfg['voice'],'rate':cfg['rate'],'engine':'Edge-TTS online service','marks':marks},ensure_ascii=False,indent=2),encoding='utf-8')
                print(seg['id'],len(data),'bytes',round((marks[-1]['offset']+marks[-1]['duration'])/1e7,2),'s',flush=True);break
            except Exception:
                if attempt==2:raise
                await asyncio.sleep(2*(attempt+1))
asyncio.run(main())

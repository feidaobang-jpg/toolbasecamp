"""Chinese narration with actual service word timestamps; normal speech rate."""
import asyncio,json
from pathlib import Path
import edge_tts
R=Path(__file__).resolve().parent
A=R/'audio/shared-zh';A.mkdir(parents=True,exist_ok=True)
async def main():
    cfg=json.loads((R/'narration.json').read_text(encoding='utf-8'))
    for s in cfg['segments']:
        mp=A/(s['id']+'.mp3');js=mp.with_suffix('.json')
        text=''.join(s['lines'])
        if mp.exists() and js.exists() and json.loads(js.read_text(encoding='utf-8'))['text']==text:continue
        for attempt in range(3):
            try:
                marks=[];data=bytearray()
                async for c in edge_tts.Communicate(text,'zh-CN-YunxiNeural',rate='+0%',boundary='WordBoundary').stream():
                    if c['type']=='audio':data.extend(c['data'])
                    elif c['type']=='WordBoundary':marks.append({k:c[k] for k in ['offset','duration','text']})
                mp.write_bytes(data);js.write_text(json.dumps({'text':text,'voice':'zh-CN-YunxiNeural','rate':'+0%','marks':marks},ensure_ascii=False,indent=2),encoding='utf-8')
                print(s['id'],len(data),'bytes',round((marks[-1]['offset']+marks[-1]['duration'])/1e7,2),'s',flush=True);break
            except Exception:
                if attempt==2:raise
                await asyncio.sleep(2)
asyncio.run(main())

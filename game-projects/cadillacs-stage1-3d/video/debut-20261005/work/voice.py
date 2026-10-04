"""Synthesize the selected Edge neural voice with service word timestamps."""
import asyncio,json
from pathlib import Path
import edge_tts
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'audio/shared-zh';OUT.mkdir(parents=True,exist_ok=True)
cfg=json.loads((ROOT/'narration.json').read_text(encoding='utf-8'))
async def main():
 for seg in cfg['segments']:
  dst=OUT/(seg['id']+'.mp3')
  if dst.exists() and (OUT/(seg['id']+'.json')).exists():continue
  audio=bytearray();marks=[]
  com=edge_tts.Communicate(seg['text'],cfg['voice'],rate=cfg['rate'],boundary='WordBoundary')
  async for ch in com.stream():
   if ch['type']=='audio':audio.extend(ch['data'])
   elif ch['type']=='WordBoundary':marks.append({k:ch[k] for k in ('offset','duration','text')})
  dst.write_bytes(audio)
  (OUT/(seg['id']+'.json')).write_text(json.dumps({'text':seg['text'],'voice':cfg['voice'],'rate':cfg['rate'],'marks':marks},ensure_ascii=False,indent=2),encoding='utf-8')
  print(seg['id'],len(audio),'bytes',len(marks),'marks',flush=True)
asyncio.run(main())

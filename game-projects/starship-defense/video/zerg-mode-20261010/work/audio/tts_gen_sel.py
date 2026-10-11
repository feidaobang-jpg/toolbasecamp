# 按段重配音：python tts_gen_sel.py s7 s8 （只重生成指定 id，避免动已审定的其他分段）
import asyncio, json, pathlib, sys, edge_tts
HERE = pathlib.Path(__file__).resolve().parent
cfg = json.loads((HERE / 'segments.json').read_text(encoding='utf-8'))
OUT = HERE / 'mp3'; OUT.mkdir(exist_ok=True)
want = set(sys.argv[1:])
async def one(seg):
    text = seg['text']
    com = edge_tts.Communicate(text, seg.get('voice', cfg['voice']), rate=seg.get('rate', cfg['rate']), boundary='WordBoundary')
    audio = bytearray(); marks = []
    async for ch in com.stream():
        if ch['type'] == 'audio': audio += ch['data']
        elif ch['type'] in ('WordBoundary', 'SentenceBoundary'):
            marks.append({'type': ch['type'], 'offset': ch['offset'], 'duration': ch['duration'], 'text': ch['text']})
    (OUT / f"{seg['id']}.mp3").write_bytes(bytes(audio))
    (OUT / f"{seg['id']}.json").write_text(json.dumps({'request_text': text, 'voice': seg.get('voice', cfg['voice']), 'rate': seg.get('rate', cfg['rate']), 'edge_tts_version': getattr(edge_tts, '__version__', None), 'marks': marks}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(seg['id'], len(audio), 'bytes', len(marks), 'marks', flush=True)
async def main():
    for seg in cfg['segments']:
        if seg['id'] not in want: continue
        for attempt in range(3):
            try:
                await one(seg); break
            except Exception as e:
                print(seg['id'], 'retry', attempt, repr(e), flush=True); await asyncio.sleep(2)
asyncio.run(main())

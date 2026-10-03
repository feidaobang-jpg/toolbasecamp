# Generate narration with Edge TTS (online Microsoft Edge neural voice) on the user's PC.
# Run with: D:\project\toolbasecamp\comfyui-api-server\.venv\Scripts\python.exe tts_gen.py
import asyncio, json, pathlib, edge_tts
HERE = pathlib.Path(__file__).resolve().parent
cfg = json.loads((HERE / 'segments.json').read_text(encoding='utf-8'))
async def one(seg):
    text = seg.get('tts', seg['text'])
    com = edge_tts.Communicate(text, seg.get('voice', cfg['voice']), rate=seg.get('rate', cfg['rate']), boundary='WordBoundary')
    audio = bytearray(); marks = []
    async for ch in com.stream():
        if ch['type'] == 'audio': audio += ch['data']
        elif ch['type'] in ('WordBoundary', 'SentenceBoundary'):
            marks.append({'type': ch['type'], 'offset': ch['offset'], 'duration': ch['duration'], 'text': ch['text']})
    (HERE / f"{seg['id']}.mp3").write_bytes(bytes(audio))
    (HERE / f"{seg['id']}.json").write_text(json.dumps({'request_text': text, 'voice': seg.get('voice', cfg['voice']), 'rate': seg.get('rate', cfg['rate']), 'edge_tts_version': edge_tts.__version__ if hasattr(edge_tts, '__version__') else None, 'marks': marks}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(seg['id'], len(audio), 'bytes', len(marks), 'marks', flush=True)
async def main():
    for seg in cfg['segments']:
        for attempt in range(3):
            try: await one(seg); break
            except Exception as e: print(seg['id'], 'retry', attempt, repr(e), flush=True); await asyncio.sleep(2)
    (HERE / 'DONE.txt').write_text('ok', encoding='utf-8')
asyncio.run(main())

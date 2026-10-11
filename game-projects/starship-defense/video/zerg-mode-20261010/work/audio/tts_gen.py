# 虫族模式视频 · Edge-TTS 分段配音（复用坦克大战那套生成器）
# 运行：D:/project/toolbasecamp/comfyui-api-server/.venv/Scripts/python.exe tts_gen.py
# 只有 text 不含「待实机结果」的分段才会合成，占位段自动跳过。
import asyncio, json, pathlib, edge_tts
HERE = pathlib.Path(__file__).resolve().parent
cfg = json.loads((HERE / 'segments.json').read_text(encoding='utf-8'))
OUT = HERE / 'mp3'; OUT.mkdir(exist_ok=True)
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
        if '待实机结果' in seg['text']:
            print(seg['id'], 'SKIP(placeholder)', flush=True); continue
        for attempt in range(3):
            try:
                await one(seg); break
            except Exception as e:
                print(seg['id'], 'retry', attempt, repr(e), flush=True); await asyncio.sleep(2)
asyncio.run(main())

"""Edge 神经网络音色兜底配音（必剪曼波未获操作授权时使用），保存服务返回的 WordBoundary 时间戳。
用法：<带 edge-tts 的 python> voice_edge.py   （本机：comfyui-api-server/.venv）"""
import asyncio, json
from pathlib import Path
import edge_tts
R = Path(__file__).resolve().parent
OUT = R / 'audio/shared-zh'; OUT.mkdir(parents=True, exist_ok=True)
VOICE, RATE = 'zh-CN-YunxiNeural', '+0%'
cfg = json.loads((R / 'narration.json').read_text(encoding='utf-8'))
async def main():
    for seg in cfg['segments']:
        m = seg.get('tts', {})
        text = ''.join(m.get(l, l) for l in seg['lines'])
        dst = OUT / (seg['id'] + '.mp3'); js = dst.with_suffix('.json')
        if dst.exists() and js.exists() and json.loads(js.read_text(encoding='utf-8')).get('text') == text: continue
        for attempt in range(8):
            audio = bytearray(); marks = []
            try:
                com = edge_tts.Communicate(text, VOICE, rate=RATE, boundary='WordBoundary')
                async for ch in com.stream():
                    if ch['type'] == 'audio': audio.extend(ch['data'])
                    elif ch['type'] == 'WordBoundary': marks.append({k: ch[k] for k in ('offset', 'duration', 'text')})
                break
            except edge_tts.exceptions.NoAudioReceived:
                print(seg['id'], 'no audio, retry', attempt + 1, flush=True); await asyncio.sleep(2 + attempt * 2)
        else:
            raise SystemExit(seg['id'] + ' 合成失败')
        dst.write_bytes(audio)
        js.write_text(json.dumps({'text': text, 'voice': VOICE, 'rate': RATE, 'marks': marks}, ensure_ascii=False, indent=1), encoding='utf-8')
        print(seg['id'], len(audio), 'bytes', len(marks), 'marks', flush=True)
asyncio.run(main())

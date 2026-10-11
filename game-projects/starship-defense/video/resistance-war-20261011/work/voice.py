"""合成中文云希配音并保留服务返回的真实 WordBoundary 时间戳（字幕对齐用）。

用法：python voice.py
读取 narration.json -> 输出 audio/shared-zh/<id>.mp3 与 <id>.json（含 marks）
音色 zh-CN-YunxiNeural、rate +0%（用户 2026-10-07 偏好）；Edge 为在线服务，非离线 TTS。
"""
import asyncio, json, subprocess, sys
from pathlib import Path
import edge_tts

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'audio' / 'shared-zh'
OUT.mkdir(parents=True, exist_ok=True)

cfg = json.loads((ROOT / 'narration.json').read_text(encoding='utf-8'))
VOICE = cfg.get('voice', 'zh-CN-YunxiNeural')
RATE = cfg.get('rate', '+0%')


async def synthesize(seg, sem):
    async with sem:
        dst = OUT / (seg['id'] + '.mp3')
        meta = OUT / (seg['id'] + '.json')
        # 文本未变且已合成则跳过，便于改稿后只重合成变化段
        if dst.exists() and meta.exists():
            try:
                if json.loads(meta.read_text(encoding='utf-8'))['text'] == seg['text']:
                    print(seg['id'], 'cached', round(json.loads(meta.read_text(encoding='utf-8'))['duration'], 2), 's')
                    return
            except Exception:
                pass
        for attempt in range(4):
            try:
                data = bytearray()
                marks = []
                com = edge_tts.Communicate(seg['text'], VOICE, rate=RATE, boundary='WordBoundary')
                async for chunk in com.stream():
                    if chunk['type'] == 'audio':
                        data.extend(chunk['data'])
                    elif chunk['type'] == 'WordBoundary':
                        marks.append({k: chunk[k] for k in ('offset', 'duration', 'text')})
                dst.write_bytes(data)
                dur = float(subprocess.check_output(
                    ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                     '-of', 'default=nw=1:nk=1', str(dst)], text=True))
                meta.write_text(json.dumps(
                    {'id': seg['id'], 'text': seg['text'], 'voice': VOICE, 'rate': RATE,
                     'duration': dur, 'marks': marks,
                     'engine': 'edge-tts (online service)'}, ensure_ascii=False, indent=2), encoding='utf-8')
                print(seg['id'], round(dur, 2), 's,', len(marks), 'word boundaries', flush=True)
                break
            except Exception as e:
                if attempt == 3:
                    raise
                print(seg['id'], 'retry', attempt + 1, repr(e)[:120], flush=True)
                await asyncio.sleep(2 * (attempt + 1))


async def main():
    sem = asyncio.Semaphore(3)
    await asyncio.gather(*(synthesize(seg, sem) for seg in cfg['segments']))
    total = 0.0
    for seg in cfg['segments']:
        m = OUT / (seg['id'] + '.json')
        if m.exists():
            total += json.loads(m.read_text(encoding='utf-8'))['duration']
    print(f'合成完成：{len(cfg["segments"])} 段，累计约 {total:.1f} 秒语音')

asyncio.run(main())

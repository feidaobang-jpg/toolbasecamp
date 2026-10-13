# -*- coding: utf-8 -*-
"""本地 IndexTTS-2.5 配音（本片默认语音引擎）。

在 D:\\sd\\index-tts 下用它自己的环境运行：
  cd /d/sd/index-tts && .venv/Scripts/python.exe <本文件>
环境变量 REF 指向 3~10 秒的参考人声 wav（必填）。

做法：把每段解说按 units.json 拆成短句，一句一句合成（模型只加载一次），每句掐掉首尾静音后
按固定小停顿拼成该段的 <段>.wav，并写出 <段>.json：每句在这段里的真实起点（按解码后的采样数算），
render.py 直接拿它当字幕时间，不靠字数估算。
"""
import json, os, subprocess, sys, wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / 'audio' / 'shared-zh'; UNITS = OUT / 'units'
REF = os.environ.get('REF')
if not REF or not Path(REF).is_file():
    sys.exit('缺少参考音：设置 REF 指向 3~10 秒人声 wav')
UNITS.mkdir(parents=True, exist_ok=True)
plan = json.loads((HERE / 'units.json').read_text(encoding='utf-8'))
READ = plan.get('read_as', {})   # 只影响朗读的写法（字母读音），字幕仍用原文
SR = 24000


def spoken(text):
    for a, b in READ.items(): text = text.replace(a, b)
    return text


def pcm(path):
    """解码成 24k 单声道，并掐掉首尾静音（各留 40 毫秒）。"""
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR),
                                   '-af', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse',
                                   '-f', 's16le', '-'])
    return raw


from indextts.infer_v2_5 import IndexTTS2  # noqa: E402
tts = IndexTTS2(cfg_path='checkpoints/config.yaml', model_dir='checkpoints', use_bf16=True)

total = 0.0
for seg in plan['segments']:
    sid = seg['id']; pieces = []; marks = []; pos = 0; cursor = 0   # cursor：采样数
    text = ''.join(seg['units'])
    for k, unit in enumerate(seg['units']):
        uw = UNITS / f'{sid}-{k:02d}.wav'; um = UNITS / f'{sid}-{k:02d}.txt'
        say = spoken(unit)
        if not (uw.exists() and um.exists() and um.read_text(encoding='utf-8') == say):
            tts.infer(spk_audio_prompt=REF, text=say, lang='ZH', output_path=str(uw), verbose=False)
            um.write_text(say, encoding='utf-8')
        data = pcm(uw)
        gap = int(SR * (0.30 if unit[-1] in '。！？' else 0.20 if unit[-1] == '：' else 0.13)) if k < len(seg['units']) - 1 else 0
        marks.append({'offset': int(cursor / SR * 1e7), 'duration': int(len(data) / 2 / SR * 1e7), 'text': unit, 'pos': pos, 'chars': len(unit)})
        pieces.append(data + b'\x00\x00' * gap); cursor += len(data) // 2 + gap; pos += len(unit)
    with wave.open(str(OUT / f'{sid}.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(b''.join(pieces))
    (OUT / f'{sid}.json').write_text(json.dumps({'text': text, 'voice': 'IndexTTS-2.5 本地合成（参考音 ' + Path(REF).name + '）', 'rate': '1.0', 'unit_level': True,
                                                 'timestamp_source': '逐句合成，按解码采样数累计的真实起止时间', 'marks': marks}, ensure_ascii=False, indent=1), encoding='utf-8')
    total += cursor / SR
    print(sid, round(cursor / SR, 2), 's', len(seg['units']), 'units', flush=True)
(OUT / 'voice.json').write_text(json.dumps({'engine': 'IndexTTS-2.5（本地，D:/sd/index-tts）', 'reference': Path(REF).name,
                                            'note': '本地合成；复用此前已采用的合成人声参考音，不标称微软官方云希', 'timestamp_source': '逐句合成的真实时长', 'subjective_listening': 'not-run'}, ensure_ascii=False, indent=1), encoding='utf-8')
print('合计语音', round(total, 1), '秒')

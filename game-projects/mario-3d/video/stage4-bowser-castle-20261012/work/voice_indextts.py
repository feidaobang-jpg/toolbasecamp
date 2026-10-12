# -*- coding: utf-8 -*-
"""本地 IndexTTS-2.5 批量配音（Edge-TTS 云希接口 403 时的替代音轨）。

在 D:\sd\index-tts 下用它的 venv 运行：
  cd /d/sd/index-tts && .venv/Scripts/python.exe <本文件>
环境变量：
  NARR  narration.json 路径（默认取本文件同目录）
  OUT   输出目录（默认 <本目录>/audio/shared-zh）
  REF   参考音（必填，3~10 秒干净人声 wav）
  ONLY  只合成这几行，逗号分隔（默认全部）

模型只加载一次，逐行输出 <id>.wav 与 <id>.json。
每行是一句独立语音，字幕时间用该行音频的实测时长（ffprobe），不是估算值。
"""
import json, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MEDIA = Path(os.environ.get('MEDIA_DIR', 'D:/project/task-artifacts/mario-stage4-video-20261012'))
NARR = Path(os.environ.get('NARR', HERE / 'narration.json'))
OUT = Path(os.environ.get('OUT', MEDIA / 'audio' / 'shared-zh'))   # 配音放仓库外，媒体不进 git
REF = os.environ.get('REF')
ONLY = set((os.environ.get('ONLY') or '').split(',')) - {''}
if not REF or not Path(REF).is_file():
    sys.exit('缺少参考音，设置 REF 指向 3~10 秒人声 wav')
OUT.mkdir(parents=True, exist_ok=True)

cfg = json.loads(NARR.read_text(encoding='utf-8'))
lines = [(s['id'], l) for s in cfg['shots'] for l in s['lines']]
if ONLY:
    lines = [x for x in lines if x[1]['id'] in ONLY]

def dur_of(p):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                          '-of', 'default=nw=1:nk=1', str(p)], text=True).strip())

from indextts.infer_v2_5 import IndexTTS2  # noqa: E402
tts = IndexTTS2(cfg_path='checkpoints/config.yaml', model_dir='checkpoints', use_bf16=True)

total = 0.0
for sid, line in lines:
    wav = OUT / (line['id'] + '.wav')
    meta = OUT / (line['id'] + '.json')
    if wav.exists() and meta.exists() and json.loads(meta.read_text(encoding='utf-8'))['text'] == line['text']:
        d = float(json.loads(meta.read_text(encoding='utf-8'))['duration'])
    else:
        tts.infer(spk_audio_prompt=REF, text=line['text'], lang='ZH', output_path=str(wav), verbose=False)
        d = dur_of(wav)
        meta.write_text(json.dumps({'id': line['id'], 'shot': sid, 'text': line['text'], 'duration': d,
                                    'engine': 'IndexTTS-2.5 (local, D:/sd/index-tts)',
                                    'ref': Path(REF).name,
                                    'marks': [{'offset': 0.0, 'duration': d, 'text': line['text']}]},
                                   ensure_ascii=False, indent=2), encoding='utf-8')
    total += d
    print(line['id'], round(d, 2), 's', flush=True)
print('合计语音', round(total, 1), '秒，行数', len(lines))

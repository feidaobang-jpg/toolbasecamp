# -*- coding: utf-8 -*-
"""用本机 IndexTTS-2.5 合成游戏里的喊话语音（不是演员原声，也没有截取电视剧音轨）。

运行（在 D:/sd/index-tts 目录下，用 uv 的 Python，见项目记忆「配音工具位置」）：
  cd /d/sd/index-tts && PYTHONPATH="D:/sd/index-tts/.venv/Lib/site-packages;D:/sd/index-tts" \
    C:/Users/37818/AppData/Roaming/uv/python/cpython-3.11.13-windows-x86_64-none/python.exe <本文件>
环境变量 REF 可换参考人声（默认 D:/sd/index-tts/yunxi-ref-8s.wav）。
输出：public/html/game/liangjian-pingan/assets/voice/<id>.mp3 与 index.json（游戏只加载清单里有的）。
原始 wav 留在 media-kit/assets/voice-raw/（不入库）。
"""
import json, os, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
PUB = GAME.parent.parent / 'public' / 'html' / 'game' / 'liangjian-pingan' / 'assets' / 'voice'
RAW = GAME / 'media-kit' / 'assets' / 'voice-raw'
REF = os.environ.get('REF', 'D:/sd/index-tts/yunxi-ref-8s.wav')
if not Path(REF).is_file():
    sys.exit('缺少参考音：' + REF)
PUB.mkdir(parents=True, exist_ok=True); RAW.mkdir(parents=True, exist_ok=True)

# 情绪向量顺序：喜、怒、哀、惧、厌恶、低落、惊喜、平静
ANGRY = [0, 0.75, 0, 0, 0, 0, 0.1, 0]
HAPPY = [0.7, 0.15, 0, 0, 0, 0, 0.3, 0]
LINES = [
    ('kaipao', '开炮！', ANGRY),
    ('yidalipao', '二营长！你他娘的意大利炮呢？', ANGRY),
    ('lashanglai', '给我拉上来！', ANGRY),
    ('qibinglian', '骑兵连！进攻！', ANGRY),
    ('liangjian', '亮剑！', ANGRY),
    ('jingrui', '什么他娘的精锐！老子打的就是精锐！', ANGRY),
    ('fuyu', '发财了！老子这辈子，没打过这么富裕的仗！', HAPPY),
    ('tiancai', '你他娘的，还真是个天才！', HAPPY),
    ('yongzhesheng', '狭路相逢，勇者胜！', ANGRY),
    ('chong', '同志们，冲啊！', ANGRY),
]

from indextts.infer_v2_5 import IndexTTS2  # noqa: E402
tts = IndexTTS2(cfg_path='checkpoints/config.yaml', model_dir='checkpoints', use_bf16=True)

done = []
meta = []
for vid, text, emo in LINES:
    wav = RAW / f'{vid}.wav'
    try:
        tts.infer(spk_audio_prompt=REF, text=text, lang='ZH', output_path=str(wav), emo_vector=emo, emo_alpha=0.9, verbose=False)
    except Exception as e:  # 单句失败不影响其他句子
        print('FAILED', vid, e, flush=True); continue
    mp3 = PUB / f'{vid}.mp3'
    # 掐掉首尾静音，统一响度，单声道 64k
    subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-ac', '1', '-ar', '32000',
                           '-af', 'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.06,areverse,loudnorm=I=-15:TP=-1.5:LRA=7',
                           '-b:a', '64k', str(mp3)])
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(mp3)]).decode().strip())
    done.append(vid); meta.append({'id': vid, 'text': text, 'seconds': round(dur, 2), 'bytes': mp3.stat().st_size})
    print('ok', vid, round(dur, 2), 's', flush=True)

(PUB / 'index.json').write_text(json.dumps(done, ensure_ascii=False), encoding='utf-8')
(GAME / 'media-kit' / 'assets' / 'voice.json').write_text(json.dumps({'engine': 'IndexTTS-2.5（本地，D:/sd/index-tts）', 'reference': Path(REF).name, 'note': '机器合成的喊话，不是演员原声，未使用电视剧音轨', 'subjective_listening': 'not-run', 'lines': meta}, ensure_ascii=False, indent=1), encoding='utf-8')
print('合成', len(done), '/', len(LINES))

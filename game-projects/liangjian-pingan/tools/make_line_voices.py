# -*- coding: utf-8 -*-
"""亮剑战役：给没有原声的字幕台词合成配音（用户 2026-10-14：“原作没有原声的时候用本地语音合成”）。

不克隆演员声音：统一用本机 IndexTTS-2.5 + 通用男声参考音（云希 8 秒），按角色调音高、情绪区分人。
秀芹（女声）那一句不合成，只留字幕。

运行（见项目记忆「配音工具位置」）：
  cd /d/sd/index-tts && PYTHONPATH="D:/sd/index-tts/.venv/Lib/site-packages;D:/sd/index-tts" \\
    C:/Users/37818/AppData/Roaming/uv/python/cpython-3.11.13-windows-x86_64-none/python.exe <本文件>
输出：liangjian/assets/voice/l_<哈希>.mp3，追加到 index.json 对应章节；lines.json 是“台词文字 → 语音”对照，
游戏显示这句字幕时自动播放。已经合成过的跳过，可重复执行。
"""
import hashlib, json, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
LJ = REPO / 'public/html/game/gunfire-assembly/liangjian'
VOICE = LJ / 'assets/voice'
RAW = Path('C:/Users/37818/AppData/Local/Temp/lj-line-voices'); RAW.mkdir(parents=True, exist_ok=True)
REF = 'D:/project/task-artifacts/mario-stage4-video-20261012/work/ref/yunxi-ref-8s.wav'

# 情绪向量：喜、怒、哀、惧、厌恶、低落、惊喜、平静
ANGRY, URGENT, CALM, HAPPY = [0, 0.6, 0, 0, 0, 0, 0.15, 0.1], [0, 0.35, 0, 0.25, 0, 0, 0.2, 0], [0, 0, 0, 0, 0, 0, 0, 0.8], [0.6, 0.1, 0, 0, 0, 0, 0.3, 0]
# 角色 → (音高倍数, 情绪)。音高 <1 更粗更沉
CAST = {
    '李云龙': (0.9, ANGRY), '张大彪': (0.86, ANGRY), '和尚': (0.84, ANGRY), '虎子': (1.06, URGENT), '二营长': (0.95, URGENT),
    '柱子': (1.0, URGENT), '孔捷': (0.92, CALM), '楚云飞': (0.97, CALM), '孙德胜': (0.88, ANGRY), '战士': (1.03, URGENT),
    '喊话员': (0.98, ANGRY), '参谋': (1.0, CALM), '358团参谋': (1.0, CALM), '七七二团': (0.96, URGENT), '程瞎子（电话）': (0.93, ANGRY),
    '坂田信哲': (0.9, CALM), '山崎': (0.92, ANGRY), '山本一木': (0.9, CALM), '日军参谋': (1.0, URGENT),
}
CH = {'pingan.js': 'pingan', 'pingan-ai.js': 'pingan', 'cangyunling.js': 'cangyunling', 'cangyunling-ai.js': 'cangyunling', 'lijiapo.js': 'lijiapo', 'lijiapo-ai.js': 'lijiapo'}

# 找出没配语音的 ui.say：同一行和上下一行都没有 voice( / vo(
lines = []
for p in sorted((LJ / 'js/chapters').glob('*.js')):
    src = p.read_text(encoding='utf-8').split('\n')
    for i, l in enumerate(src):
        for m in re.finditer(r"ui\.say\('([^']+)', '([^']+)'", l):
            ctx = ' '.join(src[max(0, i - 1):i + 2])
            if 'voice(' in ctx or 'vo(' in ctx or m.group(1) not in CAST:
                continue
            lines.append((CH[p.name], m.group(1), m.group(2)))
seen, todo = set(), []
for ch, who, text in lines:
    if (ch, text) in seen:
        continue
    seen.add((ch, text)); todo.append((ch, who, text))
print(len(todo), 'lines', flush=True)

index = json.loads((VOICE / 'index.json').read_text(encoding='utf-8'))
mp = json.loads((VOICE / 'lines.json').read_text(encoding='utf-8')) if (VOICE / 'lines.json').exists() else {}

from indextts.infer_v2_5 import IndexTTS2  # noqa: E402
tts = IndexTTS2(cfg_path='checkpoints/config.yaml', model_dir='checkpoints', use_bf16=True)
for ch, who, text in todo:
    vid = 'l_' + hashlib.md5(text.encode('utf-8')).hexdigest()[:10]
    mp3 = VOICE / f'{vid}.mp3'
    if not mp3.exists():
        pitch, emo = CAST[who]
        wav = RAW / f'{vid}.wav'
        say = re.sub(r'[（(][^）)]*[）)]', '', text)   # 括号里的舞台说明不念
        try:
            tts.infer(spk_audio_prompt=REF, text=say, lang='ZH', output_path=str(wav), emo_vector=emo, emo_alpha=0.85, verbose=False)
        except Exception as e:
            print('FAILED', vid, e, flush=True); continue
        af = f'asetrate=44100*{pitch},aresample=44100,atempo={1 / pitch:.4f},' if pitch != 1 else ''
        af += 'silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.06,areverse,loudnorm=I=-15:TP=-1.5:LRA=7'
        subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-ac', '1', '-ar', '32000', '-af', af, '-b:a', '48k', str(mp3)])
        print('ok', vid, who, text[:16], flush=True)
    if vid not in index[ch]:
        index[ch].append(vid)
    mp[text] = vid
(VOICE / 'index.json').write_text(json.dumps(index, ensure_ascii=False), encoding='utf-8')
(VOICE / 'lines.json').write_text(json.dumps(mp, ensure_ascii=False, indent=0), encoding='utf-8')
print('done', len(mp))

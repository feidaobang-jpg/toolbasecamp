"""把 CDP screencast 保留的原生 1080p JPEG 帧序列按真实时间戳编码为 raw.mp4。

帧时长来自 capture.json 里每帧的 CDP metadata.timestamp（真实采集时间），
不是假定固定帧率；音轨用录到的游戏声 game-audio.webm，并按 audioStart 对齐。
输出 H.264(nvenc) + AAC、yuv420p、BT.709、limited range、faststart。
"""
import json, subprocess, sys, os
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent
CAP = ROOT / 'capture'

ENCODE = os.environ.get('ENCODER', 'nvenc')
if ENCODE == 'nvenc':
    VENC = ['-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '17']
else:
    VENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '17']

# 目标 take：命令行参数指定单个 take（推荐，避免误编其他目录）；未指定则遍历全部。
args = [a for a in sys.argv[1:] if not a.startswith('-')]
if args:
    targets = [CAP / a for a in args]
    missing = [str(t) for t in targets if not t.exists()]
    if missing:
        print('take 目录不存在：', missing)
        sys.exit(1)
else:
    targets = sorted(p for p in CAP.iterdir() if p.is_dir()) if CAP.exists() else []
if not targets:
    print('未找到 capture/<take> 目录')
    sys.exit(1)

for d in targets:
    meta = d / 'capture.json'
    if not meta.exists():
        print(f'跳过 {d.name}（无 capture.json）')
        continue
    if (d / 'raw.mp4').exists() and os.environ.get('FORCE') != '1':
        print(f'跳过 {d.name}（raw.mp4 已存在，FORCE=1 可重编）')
        continue
    data = json.loads(meta.read_text(encoding='utf-8'))
    frames = data.get('frames', [])
    if not frames:
        print(f'跳过 {d.name}（capture.json 无帧记录）')
        continue
    # 校验帧文件真实存在（帧序列可能已编码后被清理），缺失则安全跳过，不让 ffmpeg 崩溃中断
    missing_frames = [f['file'] for f in frames[:3] + frames[-2:] if not (d / f['file']).exists()]
    if missing_frames:
        print(f'跳过 {d.name}（帧文件已缺失，可能已编码并清理：{missing_frames[:3]}）')
        continue

    # 按真实 CDP 时间戳生成 concat 清单
    lines = []
    for i, f in enumerate(frames):
        dur = frames[i + 1]['timestamp'] - f['timestamp'] if i + 1 < len(frames) else 1 / 30
        lines += [f"file '{f['file']}'", f'duration {max(.001, dur):.6f}']
    lines += [f"file '{frames[-1]['file']}'"]
    (d / 'frames.ffconcat').write_text('\n'.join(lines), encoding='utf-8')

    duration = frames[-1]['timestamp'] - frames[0]['timestamp'] + 1 / 30
    video_t0 = frames[0]['timestamp']
    audio = d / 'game-audio.webm'
    has_audio = audio.exists() and audio.stat().st_size > 1024 and data.get('audioStarted', True)
    # 音轨起点对应的帧时间戳：菜单段先录、音频进战斗后才启动，据此把音频延后对齐到视频时间轴
    delay = (data.get('audioStartTs') or video_t0) - video_t0

    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
           '-f', 'concat', '-safe', '0', '-i', str(d / 'frames.ffconcat')]
    if has_audio:
        if delay > 0.02:
            # 音频晚于视频起点：延后音频（菜单段自然静音）
            cmd += ['-itsoffset', f'{delay:.3f}', '-i', str(audio)]
        elif delay < -0.02:
            # 音频早于视频起点：从音频裁掉开头
            cmd += ['-ss', f'{-delay:.3f}', '-i', str(audio)]
        else:
            cmd += ['-i', str(audio)]
    else:
        cmd += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
        print(f'  警告 {d.name}: 无有效游戏音轨，用静音占位')

    cmd += ['-t', f'{duration:.3f}',
            '-vf', 'fps=30,scale=1920:1080:in_range=full:out_range=limited:out_color_matrix=bt709,'
                   'format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709']
    cmd += VENC
    cmd += ['-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
            '-color_primaries', 'bt709', '-color_trc', 'bt709',
            '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '192k',
            '-movflags', '+faststart', str(d / 'raw.mp4')]
    subprocess.run(cmd, check=True)
    align = f'音轨延后{delay:.2f}s' if delay > 0.02 else ('音轨提前%.2fs' % -delay if delay < -0.02 else '音画同起点')
    print(f'{d.name}: {duration:.2f}s, {len(frames)} 帧, 音轨={"游戏声("+align+")" if has_audio else "静音"} -> raw.mp4', flush=True)

"""把带真实时间戳的逐帧截图和同场游戏声音编码成 raw.mp4（每个 capture 目录一份，已有则跳过）。"""
import json, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
for directory in sorted((ROOT / 'capture').iterdir()):
    metadata = directory / 'capture.json'
    if not directory.is_dir() or not metadata.exists() or (directory / 'raw.mp4').exists():
        continue
    data = json.loads(metadata.read_text(encoding='utf-8'))
    frames = data['frames']
    lines = []
    for i, f in enumerate(frames):
        duration = frames[i + 1]['timestamp'] - f['timestamp'] if i + 1 < len(frames) else 1 / 30
        lines += [f"file '{f['file']}'", f'duration {max(.001, duration):.6f}']
    lines += [f"file '{frames[-1]['file']}'"]
    (directory / 'frames.ffconcat').write_text('\n'.join(lines), encoding='utf-8')
    # 声音从点「开始游戏」后开录，画面从 startScreencast 起；按两者的墙上时间差对齐
    offset = max(0, frames[0]['timestamp'] - data.get('audioStart', data['started']) / 1000)
    duration = frames[-1]['timestamp'] - frames[0]['timestamp'] + 1 / 30
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(directory / 'frames.ffconcat')]
    audio = directory / 'game-audio.webm'
    if audio.exists() and audio.stat().st_size > 100:
        cmd += ['-ss', str(offset), '-i', str(audio)]
    else:
        cmd += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
    cmd += ['-t', str(duration), '-vf', 'fps=30', '-c:v', 'h264_nvenc', '-preset', 'p5', '-cq', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(directory / 'raw.mp4')]
    subprocess.run(cmd, check=True)
    fps = len(frames) / max(0.001, duration)
    print(directory.name, round(duration, 2), 'seconds', len(frames), 'frames', round(fps, 1), 'source fps', 'audio offset', round(offset, 3), flush=True)

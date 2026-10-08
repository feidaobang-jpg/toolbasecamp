"""Validate actual delivery media, captions and references; retain visual review frames."""
from __future__ import annotations

import concurrent.futures
import json
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import render_backfill as render

WORK, ROOT = render.WORK, render.ROOT


def audio_hash(path):
    result = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-map', '0:a:0',
                             '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'],
                            capture_output=True, text=True, encoding='utf-8', errors='replace', check=True)
    return result.stdout.strip()


def validate(path):
    manifest = json.loads(path.read_text(encoding='utf-8'))
    movie = (path.parent / manifest['video_file']).resolve()
    info = render.probe(movie)
    duration = float(info['format']['duration'])
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    sound = next(s for s in info['streams'] if s['codec_type'] == 'audio')
    assert (video['width'], video['height']) == (1920, 1080)
    assert video['codec_name'] == 'h264' and sound['codec_name'] == 'aac'
    assert render.sha(movie) == manifest['video_sha256']
    cover = (path.parent / manifest['cover_file']).resolve()
    assert Image.open(cover).size == (1920, 1080)
    for field in ['video_file', 'cover_file', 'description_file', 'credits']:
        assert (path.parent / manifest[field]).is_file(), field
    subtitles = []
    for item in manifest['subtitle_files']:
        subtitle = (path.parent / item['file']).resolve()
        cues = render.read_srt(subtitle)
        assert cues, 'empty subtitles'
        last = -1
        for cue in cues:
            assert 0 <= cue['start'] < cue['end'] <= duration + 0.1
            assert cue['start'] >= last - 0.01, 'overlapping captions'
            last = cue['end']
        subtitles.append({'language': item['language'], 'cues': len(cues), 'last_end': last})
    decode = subprocess.run(['ffmpeg', '-v', 'error', '-threads', '2', '-i', str(movie), '-f', 'null', '-'],
                            capture_output=True, text=True, encoding='utf-8', errors='replace')
    if decode.returncode or decode.stderr.strip():
        raise RuntimeError(manifest['variant_id'] + ': ' + decode.stderr[-1500:])
    frames = []
    qa = WORK / 'qa' / manifest['variant_id']
    qa.mkdir(parents=True, exist_ok=True)
    for i, moment in enumerate([1.8, duration * 0.55, duration - 4]):
        frame = qa / f'{i}.jpg'
        render.ffmpeg(['-ss', str(moment), '-i', movie, '-frames:v', '1', '-q:v', '2', frame], manifest['variant_id'] + '-frame-' + str(i))
        frames.append((frame, moment))
    sheet = Image.new('RGB', (1440, 315), '#111b25')
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
    for i, (frame, moment) in enumerate(frames):
        image = Image.open(frame).convert('RGB').resize((480, 270))
        sheet.paste(image, (480 * i, 30))
        draw.text((480 * i + 8, 7), f'{manifest["variant_id"]} | {moment:.1f}s', font=font, fill='#ffdc8e')
    sheet.save(qa / 'contact-sheet.jpg', quality=93)
    result = {'variant_id': manifest['variant_id'], 'duration_seconds': duration,
            'width': video['width'], 'height': video['height'], 'video_codec': video['codec_name'],
            'audio_codec': sound['codec_name'], 'sample_rate': sound['sample_rate'], 'channels': sound['channels'],
            'full_decode': 'pass', 'references': 'pass', 'cover_ratio': 'pass', 'subtitle_timing': 'pass',
            'subtitles': subtitles, 'audio_hash': audio_hash(movie), 'video_sha256': manifest['video_sha256'],
            'visual_review': 'pending', 'subjective_listening': 'not-run',
            'human_review': 'pending', 'platform_preview': 'not-run'}
    render.write_json(qa / 'technical-result.json', result)
    print('Verified ' + manifest['variant_id'], flush=True)
    return result


def main():
    paths = sorted((WORK / 'publish').glob('*/publish.json'))
    assert len(paths) == 7
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(validate, paths))
    by_id = {r['variant_id']: r for r in results}
    for episode in ['swarm', 'jackal', 'cadillacs']:
        assert by_id[episode + '-youtube-zh']['audio_hash'] == by_id[episode + '-douyin-zh']['audio_hash']
    render.write_json(WORK / 'qa/media-validation.json', {'results': results,
                      'chinese_douyin_youtube_audio_identical': True,
                      'live_platform_upload': 'not-run', 'new_human_approval': 'pending'})
    print('Passed: seven complete decodes, codecs/dimensions, covers, references, captions and three shared-audio pairs.', flush=True)


if __name__ == '__main__':
    main()

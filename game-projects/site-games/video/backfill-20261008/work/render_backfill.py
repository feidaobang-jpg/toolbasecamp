"""Rebuild the approved historical gameplay for YouTube/Douyin, with traceable captions.

Run with the user's existing Python environment containing edge_tts and Pillow.
Source media remain read-only in the original checkout. New media live in this episode.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import re
import shutil
import subprocess
import textwrap
from pathlib import Path

import edge_tts
from PIL import Image, ImageDraw, ImageFont

WORK = Path(__file__).resolve().parent
ROOT = WORK.parent
PLAN = json.loads((WORK / 'backfill-plan.json').read_text(encoding='utf-8'))
FPS = 30
VOICE_LEAD = 0.25
ENCODER = ['-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '20', '-b:v', '0']
FONT = 'C:/Windows/Fonts/msyhbd.ttc'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8', newline='\n')


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def probe(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-show_streams',
                        '-of', 'json', str(path)], capture_output=True, text=True,
                       encoding='utf-8', errors='replace', check=True)
    return json.loads(r.stdout)


def ffmpeg(args, log_name):
    path = WORK / 'logs' / (log_name + '.log')
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as log:
        result = subprocess.run(['ffmpeg', '-hide_banner', '-y', *map(str, args)],
                                cwd=WORK, stdout=log, stderr=log)
    if result.returncode:
        raise RuntimeError(f'{log_name}: {path.read_text(encoding="utf-8")[-1800:]}')


def seconds(value):
    h, m, s = value.replace(',', '.').split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)


def timestamp(value, ass=False):
    scale = 100 if ass else 1000
    value = round(value * scale)
    sec, rem = divmod(value, scale)
    hour, sec = divmod(sec, 3600)
    minute, sec = divmod(sec, 60)
    return f'{hour}:{minute:02}:{sec:02}.{rem:02}' if ass else f'{hour:02}:{minute:02}:{sec:02},{rem:03}'


def read_srt(path):
    cues = []
    for block in re.split(r'\n\s*\n', path.read_text(encoding='utf-8-sig').strip()):
        lines = block.splitlines()
        if len(lines) < 3:
            continue
        start, end = lines[1].split(' --> ')
        cues.append({'start': seconds(start), 'end': seconds(end), 'text': ' '.join(lines[2:])})
    return cues


def save_srt(path, cues, english=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    def lines(text):
        return '\n'.join(textwrap.wrap(text, width=44, break_long_words=False)) if english else text
    path.write_text('\n\n'.join(f'{i + 1}\n{timestamp(c["start"])} --> {timestamp(c["end"])}\n{lines(c["text"])}'
                                  for i, c in enumerate(cues)) + '\n', encoding='utf-8-sig', newline='\n')


def save_ass(path, cues, english=False):
    header = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n'
    header += '\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
    header += 'Style: Default,Microsoft YaHei,46,&H00FFFFFF,&H00FFFFFF,&H00111111,&H80111111,-1,0,0,0,100,100,0,0,1,3,1,2,130,130,255,1\n'
    header += '\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    rows = []
    for c in cues:
        text = c['text'].replace('\n', r'\N')
        if english:
            text = r'\N'.join(textwrap.wrap(text, width=55, break_long_words=False))
        rows.append(f'Dialogue: 0,{timestamp(c["start"], True)},{timestamp(c["end"], True)},Default,,0,0,0,,{{\\an2\\pos(960,810)}}{text}')
    path.write_text(header + '\n'.join(rows) + '\n', encoding='utf-8-sig', newline='\n')


async def voice(text, name, directory):
    directory.mkdir(parents=True, exist_ok=True)
    audio = directory / 'voice.mp3'
    metadata = directory / 'voice.json'
    if audio.exists() and metadata.exists():
        existing = json.loads(metadata.read_text(encoding='utf-8'))
        if existing['text'] == text and existing['voice'] == name:
            return audio, existing['words']
    for attempt in range(3):
        try:
            words = []
            communicate = edge_tts.Communicate(text, name, rate='+0%', boundary='WordBoundary')
            with audio.open('wb') as stream:
                async for chunk in communicate.stream():
                    if chunk['type'] == 'audio':
                        stream.write(chunk['data'])
                    elif chunk['type'] == 'WordBoundary':
                        words.append({k: chunk[k] for k in ['text', 'offset', 'duration']})
            if not words or float(probe(audio)['format']['duration']) < 1:
                raise RuntimeError('No usable voice timestamps')
            write_json(metadata, {'text': text, 'voice': name, 'rate': '+0%', 'words': words,
                                  'timing_source': 'Edge-TTS WordBoundary', 'online_service': True})
            return audio, words
        except Exception:
            if attempt == 2:
                raise
            await asyncio.sleep(2 * (attempt + 1))


def norm(text):
    return ''.join(re.findall(r'[\w\u4e00-\u9fff]', text)).casefold()


def timed_phrases(text, words, offset, english=False):
    ranges, position = [], 0
    for word in words:
        size = len(norm(word['text']))
        ranges.append((position, position + size, word['offset'] / 1e7,
                       (word['offset'] + word['duration']) / 1e7))
        position += size
    phrases = re.findall(r'[^.!?]+[.!?]?', text) if english else re.findall(r'[^，。！？；]+[，。！？；]?', text)
    if english:
        phrases = [part for sentence in phrases for part in textwrap.wrap(sentence.strip(), width=82, break_long_words=False, break_on_hyphens=False)]
    if len(norm(text)) != position:
        raise RuntimeError('Voice text and WordBoundary character coverage differ')
    result, position = [], 0
    for phrase in phrases:
        phrase = phrase.strip()
        size = len(norm(phrase))
        hits = [w for w in ranges if w[1] > position and w[0] < position + size]
        position += size
        if not hits:
            continue
        result.append({'start': offset + hits[0][2], 'end': offset + hits[-1][3] + 0.12, 'text': phrase})
    return trim_caption_padding(result)


def trim_caption_padding(cues):
    # Keep real word onset times and shorten only display padding at the next onset.
    result = [dict(cue) for cue in cues]
    for current, following in zip(result, result[1:]):
        current['end'] = min(current['end'], following['start'] - 0.01)
        if current['end'] <= current['start']:
            raise RuntimeError('Caption boundary splits one spoken token')
    return result


def timed_units(units, words, offset):
    ranges, position = [], 0
    for word in words:
        size = len(norm(word['text']))
        ranges.append((position, position + size, word['offset'] / 1e7,
                       (word['offset'] + word['duration']) / 1e7))
        position += size
    if position != len(norm(''.join(units))):
        raise RuntimeError('Narration unit coverage mismatch')
    result, position = [], 0
    for unit in units:
        size = len(norm(unit))
        hits = [w for w in ranges if w[1] > position and w[0] < position + size]
        position += size
        if not hits:
            raise RuntimeError('Narration unit has no word timestamps')
        result.append({'start': offset + hits[0][2], 'end': offset + hits[-1][3] + 0.12, 'text': unit})
    return trim_caption_padding(result)


def merge_english(cues):
    result = []
    for cue in cues:
        if (result and cue['start'] - result[-1]['end'] < 0.55
                and cue['end'] - result[-1]['start'] <= 5.5
                and len(result[-1]['text']) + len(cue['text']) < 83):
            result[-1]['end'] = cue['end']
            result[-1]['text'] += ' ' + cue['text']
        else:
            result.append(dict(cue))
    return result


def overlays(episode, directory, english=False):
    directory.mkdir(parents=True, exist_ok=True)
    label = f'Recorded {episode["recorded_date"]} | Earlier build' if english else f'{episode["recorded_date"]} 开发实录 · 历史版本'
    font = ImageFont.truetype(FONT, 30)
    image = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    width = int(draw.textlength(label, font=font)) + 42
    draw.rounded_rectangle((35, 85, width + 35, 137), radius=12, fill=(12, 20, 28, 218))
    draw.text((56, 94), label, font=font, fill='#fff0be')
    image.save(directory / 'version.png')
    image = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 858, 1920, 1080), fill=(15, 23, 32, 255))
    title = 'Earlier gameplay · Current demo linked below' if english else '历史开发实录 · 当前试玩入口见简介'
    subtitle = 'Chinese game UI · Follow current in-game controls' if english else '画面和操作以录制版本为准 · 当前操作请看游戏内提示'
    draw.text((960, 914), title, font=ImageFont.truetype(FONT, 43), fill='#ffdc86', anchor='mm')
    draw.text((960, 982), subtitle, font=ImageFont.truetype(FONT, 30), fill='#d7e4e7', anchor='mm')
    image.save(directory / 'footer.png')


def output_settings():
    return [*ENCODER, '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709',
            '-color_trc', 'bt709', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000']


def tempo_filter(value):
    stages = []
    while value < 0.5:
        stages.append('atempo=0.5')
        value /= 0.5
    while value > 2:
        stages.append('atempo=2')
        value /= 2
    stages.append(f'atempo={value}')
    return ','.join(stages)


def concat(parts, output, log):
    listing = output.with_suffix('.ffconcat')
    listing.write_text('ffconcat version 1.0\n' + '\n'.join(f"file '{p.as_posix()}'" for p in parts), encoding='utf-8')
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', listing, '-c', 'copy', output], log)


async def render_cn(episode):
    if episode['id'] == 'swarm':
        raise RuntimeError('虫潮旧曼波音轨仅用于原B站稿，跨平台必须使用render_swarm_cn重新配音')
    ident = episode['id']
    source = Path(PLAN['source_checkout']) / episode['source_episode']
    edit = WORK / 'edit' / ident
    overlays(episode, edit)
    original_cues = [c for c in read_srt(source / episode['source_subtitles']) if c['end'] <= episode['cut_end'] + 0.01]
    if len(original_cues) != len(episode['english_cues']):
        raise RuntimeError(f'{ident}: {len(original_cues)} Chinese cues vs {len(episode["english_cues"])} translations')
    audio, words = await voice(episode['outro_zh'], 'zh-CN-YunxiNeural', WORK / 'audio' / ident / 'outro')
    duration = math.ceil((float(probe(audio)['format']['duration']) + 1.25) * FPS) / FPS
    core = edit / 'core.mp4'
    ffmpeg(['-i', source / episode['clean_picture'], '-i', source / episode['source_video'],
            '-loop', '1', '-framerate', FPS, '-i', edit / 'version.png',
            '-filter_complex', "[0:v][2:v]overlay=enable='lt(t,6)'[v]", '-map', '[v]', '-map', '1:a:0',
            '-t', episode['cut_end'], *output_settings(), core], ident + '-core')
    tail = edit / 'tail.mp4'
    factor = duration / episode['outro_picture_duration']
    ffmpeg(['-ss', episode['outro_picture_start'], '-t', episode['outro_picture_duration'],
            '-i', source / episode['clean_picture'], '-i', audio,
            '-loop', '1', '-framerate', FPS, '-i', edit / 'footer.png',
            '-filter_complex', f'[0:v]setpts={factor}*(PTS-STARTPTS),fps=30,tpad=stop_mode=clone:stop_duration=0.1[v0];[v0][2:v]overlay,trim=duration={duration},fade=t=out:st={duration-0.8}:d=0.8[v];[1:a]aresample=48000,adelay=250:all=1,apad,atrim=duration={duration}[a]',
            '-map', '[v]', '-map', '[a]', '-t', duration, *output_settings(), tail], ident + '-tail')
    stage = edit / 'stage.mp4'
    concat([core, tail], stage, ident + '-concat')
    yt = ROOT / 'final' / ident / 'youtube-zh'
    dy = ROOT / 'final' / ident / 'douyin-zh'
    yt.mkdir(parents=True, exist_ok=True)
    dy.mkdir(parents=True, exist_ok=True)
    final = yt / 'gameplay-youtube-final.mp4'
    total = episode['cut_end'] + duration
    ffmpeg(['-i', stage, '-c:v', 'copy', '-af', f'loudnorm=I=-15:TP=-1.5:LRA=9,afade=t=out:st={total-0.8}:d=0.8',
            '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', final], ident + '-final')
    outro_cues = timed_phrases(episode['outro_zh'], words, episode['cut_end'] + VOICE_LEAD)
    zh = original_cues + outro_cues
    en = [{**c, 'text': translated} for c, translated in zip(original_cues, episode['english_cues'])]
    if len(outro_cues) != len(episode['outro_english_phrases']):
        raise RuntimeError('Outro translation phrase mismatch')
    en += [{**c, 'text': translated} for c, translated in zip(outro_cues, episode['outro_english_phrases'])]
    save_srt(yt / 'captions-zh.srt', zh)
    save_srt(yt / 'captions-en.srt', merge_english(en), english=True)
    save_ass(edit / 'captions.ass', zh)
    ffmpeg(['-i', final, '-vf', f'ass=edit/{ident}/captions.ass', *ENCODER, '-pix_fmt', 'yuv420p',
            '-c:a', 'copy', '-movflags', '+faststart', dy / 'gameplay-zh-final.mp4'], ident + '-douyin')
    for out in [yt, dy]:
        shutil.copy2(source / episode['source_cover'], out / 'cover-zh-16x9.jpg')
    write_json(edit / 'render-result.json', {'source_video_sha256': sha(source / episode['source_video']),
        'cut_end': episode['cut_end'], 'outro_duration': duration, 'total': total,
        'original_chinese_cues': len(original_cues), 'tts_timing': 'WordBoundary',
        'picture_is_historical': True, 'youtube': str(final), 'douyin': str(dy / 'gameplay-zh-final.mp4')})
    print('DONE Chinese', ident, round(total, 2), flush=True)


async def render_pilot():
    config = PLAN['english_pilot']
    episode = next(e for e in PLAN['episodes'] if e['id'] == config['episode_id'])
    source = Path(PLAN['source_checkout']) / episode['source_episode']
    edit = WORK / 'edit' / 'swarm-en'
    overlays(episode, edit, english=True)
    final_dir = ROOT / 'final' / 'swarm' / 'youtube-en'
    final_dir.mkdir(parents=True, exist_ok=True)
    parts, captions, timeline, offset = [], [], [], 0.0
    for i, segment in enumerate(config['segments']):
        audio, words = await voice(segment['text'], config['voice'], WORK / 'audio' / 'swarm-en' / f'{i:02}')
        duration = math.ceil((float(probe(audio)['format']['duration']) + 0.9) * FPS) / FPS
        length = segment['end'] - segment['start']
        factor = duration / length
        part = edit / f'{i:02}.mp4'
        filter_graph = f'[0:v]setpts={factor}*(PTS-STARTPTS),fps=30,tpad=stop_mode=clone:stop_duration=0.1[vp];'
        if i == 0:
            filter_graph += "[vp][3:v]overlay=enable='lt(t,6)'[v];"
        elif segment.get('outro'):
            filter_graph += f'[vp][3:v]overlay,fade=t=out:st={duration-0.8}:d=0.8[v];'
        else:
            filter_graph += '[vp]null[v];'
        filter_graph += f'[1:a]{tempo_filter(1/factor)},aresample=48000,volume=0.12,apad,atrim=duration={duration}[game];[2:a]aresample=48000,adelay=250:all=1,volume=1.5,apad,atrim=duration={duration}[voice];[game][voice]amix=inputs=2:normalize=0[a]'
        args = ['-ss', segment['start'], '-t', length, '-i', source / episode['clean_picture'],
                '-ss', segment['start'], '-t', length, '-i', source / 'work/audio/shared-zh/game-edit.wav', '-i', audio]
        if i == 0 or segment.get('outro'):
            args += ['-loop', '1', '-framerate', FPS, '-i', edit / ('footer.png' if segment.get('outro') else 'version.png')]
        ffmpeg([*args, '-filter_complex', filter_graph, '-map', '[v]', '-map', '[a]', '-t', duration,
                *output_settings(), part], f'swarm-en-{i:02}')
        captions += timed_phrases(segment['text'], words, offset + VOICE_LEAD, english=True)
        timeline.append({**segment, 'start_in_final': offset, 'end_in_final': offset + duration,
                         'duration': duration, 'picture_time_scale': factor, 'audio_file': str(audio.relative_to(WORK))})
        offset += duration
        parts.append(part)
        print('English segment', i + 1, '/', len(config['segments']), round(duration, 2), flush=True)
    stage = edit / 'stage.mp4'
    concat(parts, stage, 'swarm-en-concat')
    save_srt(final_dir / 'captions-en.srt', captions, english=True)
    save_ass(edit / 'captions.ass', captions, english=True)
    ffmpeg(['-i', stage, '-vf', 'ass=edit/swarm-en/captions.ass',
            '-af', f'loudnorm=I=-15:TP=-1.5:LRA=9,afade=t=out:st={offset-0.8}:d=0.8',
            *output_settings(), '-movflags', '+faststart', final_dir / 'gameplay-en-final.mp4'], 'swarm-en-final')
    write_json(edit / 'timeline.json', {'voice': config['voice'], 'duration': offset, 'segments': timeline,
                                      'timing': 'Edge-TTS WordBoundary', 'edited_historical_footage': True})
    print('DONE English pilot', round(offset, 2), flush=True)


async def render_swarm_cn():
    """Replace the Bstation-only historical Mambo track with fresh Yunxi narration."""
    episode = PLAN['episodes'][0]
    source = Path(PLAN['source_checkout']) / episode['source_episode']
    edit = WORK / 'edit' / 'swarm-cn'
    overlays(episode, edit)
    original = [c for c in read_srt(source / episode['source_subtitles']) if c['end'] <= episode['cut_end'] + 0.01]
    translations = list(episode['english_cues'])
    replacements = ['这是虫潮围城的早期实战，', '画面录于十月四日。', '当时画面、操作和玩法刚做了更新，',
                    '这次用一轮旧版实战，', '带你看看它的防守和反攻路线。']
    replacements_en = ['An early gameplay run of Swarm Siege.', 'Recorded on October fourth.',
                       'The visuals, controls and gameplay had just changed.', 'Here is one run through that earlier build,',
                       'showing its defense and counterattack route.']
    for index, (zh, en) in enumerate(zip(replacements, replacements_en), 3):
        original[index]['text'] = zh
        translations[index] = en
    # A semantically equivalent rewrite also avoids a transient TTS rejection of the old line.
    return_lines = ['回到基地前方，', '拦住虫洞里出来的敌人。', '这轮防守成功，', '进入第二关时，基地仍然是满血。']
    for index, line in enumerate(return_lines, 50):
        original[index]['text'] = line
    translations[50] = 'Back at the front of the base,'
    parts, zh_cues, en_cues, timeline, offset = [], [], [], [], 0.0
    config = PLAN['english_pilot']['segments']
    for i in range(16):
        segment = dict(config[i])
        if i < 15:
            lo, hi = PLAN['swarm_chinese_voice']['source_cue_ranges'][i]
            units = [c['text'] for c in original[lo:hi]]
            translated = translations[lo:hi]
            if i == 14:
                segment['end'] = episode['cut_end']
        else:
            units = re.findall(r'[^，。！？；]+[，。！？；]?', episode['outro_zh'])
            translated = episode['outro_english_phrases']
        text = ''.join(units)
        audio, words = await voice(text, 'zh-CN-YunxiNeural', WORK / 'audio' / 'swarm-cn' / f'{i:02}')
        duration = math.ceil((float(probe(audio)['format']['duration']) + 0.9) * FPS) / FPS
        length = segment['end'] - segment['start']
        factor = duration / length
        part = edit / f'{i:02}.mp4'
        graph = f'[0:v]setpts={factor}*(PTS-STARTPTS),fps=30,tpad=stop_mode=clone:stop_duration=0.1[vp];'
        if i == 0:
            graph += "[vp][3:v]overlay=enable='lt(t,6)'[v];"
        elif i == 15:
            graph += f'[vp][3:v]overlay,fade=t=out:st={duration-0.8}:d=0.8[v];'
        else:
            graph += '[vp]null[v];'
        graph += f'[1:a]{tempo_filter(1/factor)},aresample=48000,volume=0.12,apad,atrim=duration={duration}[game];[2:a]aresample=48000,adelay=250:all=1,volume=1.5,apad,atrim=duration={duration}[voice];[game][voice]amix=inputs=2:normalize=0[a]'
        args = ['-ss', segment['start'], '-t', length, '-i', source / episode['clean_picture'],
                '-ss', segment['start'], '-t', length, '-i', source / 'work/audio/shared-zh/game-edit.wav', '-i', audio]
        if i in [0, 15]:
            args += ['-loop', '1', '-framerate', FPS, '-i', edit / ('footer.png' if i == 15 else 'version.png')]
        ffmpeg([*args, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', duration,
                *output_settings(), part], f'swarm-cn-{i:02}')
        new_cues = timed_units(units, words, offset + VOICE_LEAD)
        zh_cues += new_cues
        en_cues += [{**c, 'text': en} for c, en in zip(new_cues, translated)]
        timeline.append({'source_start': segment['start'], 'source_end': segment['end'],
                         'start_in_final': offset, 'end_in_final': offset + duration,
                         'picture_time_scale': factor, 'text': text})
        offset += duration
        parts.append(part)
        print('Chinese swarm segment', i + 1, '/ 16', round(duration, 2), flush=True)
    stage = edit / 'stage.mp4'
    concat(parts, stage, 'swarm-cn-concat')
    yt = ROOT / 'final/swarm/youtube-zh'
    dy = ROOT / 'final/swarm/douyin-zh'
    yt.mkdir(parents=True, exist_ok=True)
    dy.mkdir(parents=True, exist_ok=True)
    save_srt(yt / 'captions-zh.srt', zh_cues)
    save_srt(yt / 'captions-en.srt', merge_english(en_cues), english=True)
    save_ass(edit / 'captions.ass', zh_cues)
    ffmpeg(['-i', stage, '-c:v', 'copy', '-af', f'loudnorm=I=-15:TP=-1.5:LRA=9,afade=t=out:st={offset-0.8}:d=0.8',
            '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', yt / 'gameplay-youtube-final.mp4'], 'swarm-cn-final')
    ffmpeg(['-i', yt / 'gameplay-youtube-final.mp4', '-vf', 'ass=edit/swarm-cn/captions.ass',
            *ENCODER, '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', dy / 'gameplay-zh-final.mp4'], 'swarm-cn-douyin')
    write_json(edit / 'timeline.json', {'voice': 'zh-CN-YunxiNeural', 'duration': offset, 'segments': timeline,
                                      'original_mambo_audio_used': False, 'timing': 'Edge-TTS WordBoundary'})
    print('DONE Chinese swarm Yunxi', round(offset, 2), flush=True)


async def main():
    args = argparse.ArgumentParser()
    args.add_argument('--phase', choices=['cn', 'pilot', 'swarm-cn', 'all'], default='all')
    options = args.parse_args()
    if options.phase in ['cn', 'all']:
        for episode in PLAN['episodes']:
            if episode['id'] == 'swarm':
                await render_swarm_cn()
            else:
                await render_cn(episode)
    if options.phase == 'swarm-cn':
        await render_swarm_cn()
    if options.phase in ['pilot', 'all']:
        await render_pilot()


if __name__ == '__main__':
    asyncio.run(main())

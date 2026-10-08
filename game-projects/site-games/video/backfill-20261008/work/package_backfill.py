"""Create separate upload packages and a review page without changing publication state."""
from __future__ import annotations

import html
import json
import os
import re
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import render_backfill as render

WORK, ROOT, PLAN = render.WORK, render.ROOT, render.PLAN


def relative(path, base):
    return Path(os.path.relpath(path, base)).as_posix()


def description(episode, english=False):
    summaries = {
        'swarm': ('打补给、换武器、布置机枪塔，再钻进虫洞反攻母皇，最后回防守住第一波。',
                  'Collect supplies, upgrade weapons, place turrets, raid the queen, then return to defend the base.'),
        'jackal': ('开小吉普炸营房、救俘虏、升级火箭，再把人送到直升机坪，完成两关救援。',
                   'Drive a little jeep, open barracks, rescue prisoners, upgrade rockets and deliver everyone to the helipad across two stages.'),
        'cadillacs': ('同一关分别用侧视、角色身后和第一人称打到关底，比较视野与战斗体验。',
                      'Play the first stage in side view, rear view and first person, comparing visibility and combat all the way to the boss.')
    }
    if english:
        text = summaries[episode['id']][1]
        text += f'\nEdited development footage recorded on {episode["recorded_date"]}. Features, controls and issues shown belong to that earlier build; the current demo may differ.'
        text += '\nChinese narration with reviewed English subtitles. The game interface is currently in Chinese; follow the current in-game control prompts.'
        if episode['id'] == 'jackal':
            text += '\nFan-made, unofficial Jackal remake. Original game rights belong to Konami.'
        if episode['id'] == 'cadillacs':
            text += '\nFan-made, unofficial Cadillacs and Dinosaurs remake. Original rights belong to Capcom and the original rights holders.'
        text += '\nCurrent browser demo: ' + episode['demo_url']
        return text
    text = summaries[episode['id']][0]
    text += f'\n画面录于{episode["recorded_date"]}，是历史开发实录；片中玩法、操作和问题属于当时版本，当前试玩以游戏内提示为准。'
    if episode['id'] == 'jackal':
        text += '\n粉丝向非官方赤色要塞重制，原作版权归Konami。'
    if episode['id'] == 'cadillacs':
        text += '\n粉丝向非官方恐龙快打重制，原作版权归Capcom及原著方；片中镜头问题为录制时观察。'
    text += '\n当前试玩（复制到浏览器打开）：' + episode['demo_url']
    return text


def pilot_chinese_captions():
    edit = WORK / 'edit/swarm-en'
    timeline = json.loads((edit / 'timeline.json').read_text(encoding='utf-8'))['segments']
    cues = []
    for i, segment in enumerate(timeline):
        words = json.loads((WORK / 'audio/swarm-en' / f'{i:02}' / 'voice.json').read_text(encoding='utf-8'))['words']
        sentences = [s.strip() for s in re.findall(r'[^.!?]+[.!?]?', segment['text']) if s.strip()]
        translated = PLAN['english_pilot']['chinese_sentences'][i]
        if len(sentences) != len(translated):
            raise RuntimeError(f'English pilot sentence translation mismatch: {i}')
        timed = render.timed_units(sentences, words, segment['start_in_final'] + render.VOICE_LEAD)
        cues += [{**c, 'text': zh} for c, zh in zip(timed, translated)]
    render.save_srt(ROOT / 'final/swarm/youtube-en/captions-zh.srt', cues)


def english_cover():
    target = ROOT / 'final/swarm/youtube-en'
    frame = WORK / 'edit/swarm-en/cover-frame.jpg'
    episode = PLAN['episodes'][0]
    source = Path(PLAN['source_checkout']) / episode['source_episode'] / episode['clean_picture']
    render.ffmpeg(['-ss', '1.6', '-i', source, '-frames:v', '1', '-q:v', '2', frame], 'english-cover-frame')
    image = Image.open(frame).convert('RGBA')
    shade = Image.new('RGBA', image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shade)
    for x in range(1920):
        opacity = int(228 * max(0, 1 - x / 1450))
        draw.line((x, 0, x, 1080), fill=(10, 16, 24, opacity))
    image = Image.alpha_composite(image, shade)
    draw = ImageDraw.Draw(image)
    bold = lambda n: ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', n)
    draw.rounded_rectangle((72, 75, 575, 145), radius=14, fill='#f1c76c')
    draw.text((98, 91), 'SWARM SIEGE', font=bold(40), fill='#18212a')
    draw.text((72, 270), 'RAID THE', font=bold(110), fill='#ffffff', stroke_width=3, stroke_fill='#152030')
    draw.text((72, 405), 'QUEEN', font=bold(150), fill='#ffd16c', stroke_width=4, stroke_fill='#152030')
    draw.text((78, 625), 'FROM DEFENSE TO COUNTERATTACK', font=bold(35), fill='#e0eef2')
    draw.rounded_rectangle((72, 878, 627, 960), radius=14, fill=(14, 21, 29, 235))
    draw.text((98, 897), 'ENGLISH GAMEPLAY STORY', font=bold(32), fill='#ffffff')
    image.convert('RGB').save(target / 'cover-en-16x9.jpg', quality=95)


def chinese_swarm_cover():
    # A fresh layout from the real gameplay frame, avoiding the old cover's “新版” label.
    frame = WORK / 'edit/swarm-en/cover-frame.jpg'
    picture = Image.open(frame).convert('RGBA')
    shade = Image.new('RGBA', picture.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(shade)
    for x in range(1920):
        draw.line((x, 0, x, 1080), fill=(10, 16, 24, int(225 * max(0, 1 - x / 1450))))
    picture = Image.alpha_composite(picture, shade)
    draw = ImageDraw.Draw(picture)
    font = lambda size: ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', size)
    draw.rounded_rectangle((72, 75, 575, 150), radius=14, fill='#f1c76c')
    draw.text((98, 84), '虫潮围城', font=font(48), fill='#18212a')
    draw.text((70, 310), '这次，', font=font(110), fill='white', stroke_width=3, stroke_fill='#152030')
    draw.text((70, 460), '反攻母皇', font=font(142), fill='#70edce', stroke_width=4, stroke_fill='#152030')
    draw.text((82, 650), '守城 → 补给 → 反攻', font=font(40), fill='#e0eef2')
    draw.rounded_rectangle((72, 872, 687, 960), radius=14, fill=(14, 21, 29, 235))
    draw.text((98, 888), '2026.10.04 开发实录', font=font(42), fill='white')
    for variant in ['youtube-zh', 'douyin-zh']:
        picture.convert('RGB').save(ROOT / 'final/swarm' / variant / 'cover-zh-16x9.jpg', quality=95)


def manifest(episode, variant, movie, language, subtitle_mode, pilot=False):
    directory = movie.parent
    identity = episode['id'] + '-' + variant
    internal = WORK / 'publish' / identity
    internal.mkdir(parents=True, exist_ok=True)
    info = render.probe(movie)
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    cover = directory / ('cover-en-16x9.jpg' if pilot else 'cover-zh-16x9.jpg')
    copy_file = directory / ('Upload-copy.txt' if pilot else '投稿文案.txt')
    title = PLAN['english_pilot']['title'] if pilot else episode['title_zh']
    desc = description(episode, english=pilot)
    if pilot:
        desc = desc.replace('Chinese narration with reviewed English subtitles.', 'English narration and captions; Chinese captions are also provided.')
        desc += '\nEnglish-language experiment for this gameplay episode; Swarm Siege is the translated title used in this video.'
    tags = ['游戏开发', episode['game_name'], '实机演示'] if not pilot else ['gamedev', 'base defense', 'Swarm Siege']
    if variant == 'douyin-zh':
        copy_file.write_text(f'【说明】\n{title}\n{desc}\n【话题】\n' + '\n'.join('#' + t for t in tags) + '\n', encoding='utf-8-sig')
    elif pilot:
        copy_file.write_text(f'Title\n{title}\nDescription\n{desc}\nTags\n' + ', '.join(tags) + '\n', encoding='utf-8-sig')
    else:
        copy_file.write_text(f'【标题】\n{title}\n【简介】\n{desc}\n【标签】\n' + '\n'.join(tags) + '\n', encoding='utf-8-sig')
        (directory / 'English-localizations.txt').write_text('Title\n' + episode['title_en'] + '\nDescription\n' + description(episode, english=True) + '\n', encoding='utf-8-sig')
    captions = []
    if variant.startswith('youtube'):
        for code in ['zh', 'en']:
            path = directory / f'captions-{code}.srt'
            if not path.exists():
                raise RuntimeError('Missing subtitle file: ' + str(path))
            captions.append({'file': relative(path, internal), 'language': 'zh-CN' if code == 'zh' else 'en',
                             'purpose': 'selectable captions', 'required_for_upload': True, 'sha256': render.sha(path)})
    credits = '本次使用本项目历史实机及原游戏音乐音效；素材许可沿用原项目来源记录，不将单平台许可默认扩张。\n'
    if episode['id'] == 'swarm':
        credits += '中文整片重新使用Edge-TTS云希，英文试验使用Edge-TTS Guy，正常语速，真实WordBoundary对齐；未使用旧必剪曼波音轨。\n'
    else:
        credits += '正文复用已审云希音轨，新增收尾仍使用Edge-TTS云希；无外加音乐。\n'
    credits += '字体只渲染到画面，不分发字体文件；虫潮中英封面由真实母皇战截帧及程序排版新制，其他两期中文封面沿用本人既有投稿封面。\n'
    (internal / 'credits.txt').write_text(credits, encoding='utf-8')
    value = {'variant_id': identity, 'platform': 'douyin' if variant == 'douyin-zh' else 'youtube',
        'content_type': 'historical_gameplay_backfill' if not pilot else 'english_gameplay_experiment',
        'language': language, 'audio_language': language, 'packaging_language': language,
        'game_name': episode['game_name'], 'game_version': 'recorded ' + episode['recorded_date'],
        'episode_id': episode['source_episode'], 'video_file': relative(movie, internal),
        'video_sha256': render.sha(movie), 'width': video['width'], 'height': video['height'],
        'duration_seconds': float(info['format']['duration']), 'title': title, 'description': desc, 'tags': tags,
        'description_file': relative(copy_file, internal), 'cover_file': relative(cover, internal),
        'cover_sha256': render.sha(cover),
        'cover_files': [{'file': relative(cover, internal), 'width': 1920, 'height': 1080, 'purpose': 'upload/reference subject to current platform cover entry'}],
        'subtitle_mode': subtitle_mode, 'subtitle_files': captions, 'credits': 'credits.txt',
        'cover_upload_mode': 'verify_current_entry', 'recorded_date': episode['recorded_date'],
        'historical_bilibili_source': {'bvid': episode['bvid'], 'video_url': 'https://www.bilibili.com/video/' + episode['bvid'] + '/', 'reupload': False},
        'demo_http_check': {'status': 200, 'checked_at': '2026-10-08', 'overseas_playability': 'not-tested'},
        'human_review': {'status': 'pending', 'video_sha256': render.sha(movie), 'reason': '本次重新剪辑/配音/翻译字幕尚未人工审片'},
        'blocking_issues': ['人工审片待完成', '发布账号登录与当前投稿设置待核对'], 'ready_to_upload': False,
        'ready_to_review': True, 'uploaded': False}
    if variant == 'youtube-zh':
        value['localizations'] = {'en': {'title': episode['title_en'], 'description': description(episode, english=True)}}
        value['localization_file'] = relative(directory / 'English-localizations.txt', internal)
    render.write_json(internal / 'publish.json', value)
    return value, internal / 'publish.json'


def review_page(rows):
    preview_captions = {}
    for row in rows:
        variant = row['variant_id']
        if row['platform'] != 'youtube':
            continue
        episode, language = variant.split('-youtube-')
        directory = ROOT / 'final' / episode / ('youtube-' + language)
        for code in ['zh', 'en']:
            source = directory / f'captions-{code}.srt'
            preview_captions.setdefault(variant, {})[code] = render.read_srt(source)
            # Browser-only preview tracks; upload attachments remain SRT in final/.
            target = WORK / 'review' / variant / f'captions-{code}.vtt'
            target.parent.mkdir(parents=True, exist_ok=True)
            content = source.read_text(encoding='utf-8-sig')
            content = re.sub(r'(\d{2}:\d{2}:\d{2}),(\d{3})', r'\1.\2', content)
            target.write_text('WEBVTT\n\n' + content, encoding='utf-8')
    cards = []
    for episode in PLAN['episodes']:
        ep = episode['id']
        title = html.escape(episode['game_name'])
        cards.append(f'<section><h2>{title} · 中文补发</h2><p>录于{episode["recorded_date"]}。YouTube提供中英字幕与英文本地化字段；抖音使用同一音轨及烧录中文字幕。</p><div class="pair"><div><h3>YouTube中文主版</h3><video controls preload="metadata" poster="final/{ep}/youtube-zh/cover-zh-16x9.jpg" src="final/{ep}/youtube-zh/gameplay-youtube-final.mp4"></video><p><a href="final/{ep}/youtube-zh/投稿文案.txt">中文文案</a> · <a href="final/{ep}/youtube-zh/English-localizations.txt">英文翻译</a> · <a href="final/{ep}/youtube-zh/captions-en.srt">英文字幕</a></p></div><div><h3>抖音横屏版</h3><video controls preload="metadata" poster="final/{ep}/douyin-zh/cover-zh-16x9.jpg" src="final/{ep}/douyin-zh/gameplay-zh-final.mp4"></video><p><a href="final/{ep}/douyin-zh/投稿文案.txt">抖音文案</a></p></div></div></section>')
    cards.append('<section><h2>虫潮围城 · 完整英文试验版</h2><p>英文配音与英文字幕，中文游戏界面保留；镜头来自同一旧版实战，节奏按新配音重排。</p><video controls preload="metadata" poster="final/swarm/youtube-en/cover-en-16x9.jpg" src="final/swarm/youtube-en/gameplay-en-final.mp4"></video><p><a href="final/swarm/youtube-en/Upload-copy.txt">英文文案</a> · <a href="final/swarm/youtube-en/captions-zh.srt">中文字幕</a></p></section>')
    markup = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>旧片海外补发审片包</title><style>body{margin:0;background:#101924;color:#e5edf2;font:16px/1.7 system-ui,"Microsoft YaHei",sans-serif}main{max-width:1240px;margin:auto;padding:32px 22px}h1{font-size:32px}h2{color:#ffda8f}section{margin:30px 0;padding:24px;background:#192635;border:1px solid #314359;border-radius:18px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:22px}video{display:block;width:100%;max-width:100%;border-radius:10px;background:#000}a{color:#9ed1ff}.status{border-left:4px solid #ffcf75;padding:14px 18px;background:#243344}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><main><h1>旧片补发审片包</h1><p>3条中文主版 + 3条抖音横屏版 + 1条虫潮英文试验。B站原稿保留。</p><p class="status">当前阶段：等待人工审片。改剪、配音和字幕是本次新物料，尚未上传到抖音或YouTube。重点看口播与画面是否对应、字幕可读性、英文配音及结尾。</p>' + ''.join(cards) + '</main></html>'
    for row in rows:
        if row['platform'] != 'youtube':
            continue
        variant = row['variant_id']
        episode, language = variant.split('-youtube-')
        movie = 'gameplay-youtube-final.mp4' if language == 'zh' else 'gameplay-en-final.mp4'
        key = f'src="final/{episode}/youtube-{language}/{movie}"></video>'
        selected = ' selected' if language == 'zh' else ''
        control = f'<label class="caption-choice">审片字幕 <select data-variant="{variant}"><option value="">关闭</option><option value="zh"{selected}>中文</option><option value="en">English</option></select></label>'
        markup = markup.replace(key, f'src="final/{episode}/youtube-{language}/{movie}" data-variant="{variant}"></video>{control}')
    style = '<style>.video-box{position:relative}.preview-caption{position:absolute;bottom:25%;left:7%;right:7%;text-align:center;white-space:pre-line;font:600 clamp(12px,1.6vw,24px)/1.3 system-ui;color:white;text-shadow:0 1px 3px black;pointer-events:none}.preview-caption span{background:#000b;padding:3px 7px;border-radius:4px}.caption-choice{display:block;margin-top:8px}.caption-choice select{margin-left:10px;padding:5px;background:#26394d;color:white;border:1px solid #6581a0;border-radius:6px}</style>'
    script = '''<script>const captions=__CAPTIONS__;document.querySelectorAll('video[data-variant]').forEach(video=>{const id=video.dataset.variant;const box=document.createElement('div');box.className='video-box';video.parentNode.insertBefore(box,video);box.appendChild(video);const line=document.createElement('div');line.className='preview-caption';const span=document.createElement('span');line.appendChild(span);box.appendChild(line);const choice=document.querySelector('select[data-variant="'+id+'"]');const update=()=>{const cues=captions[id][choice.value]||[];const cue=cues.find(c=>video.currentTime>=c.start&&video.currentTime<c.end);span.textContent=cue?cue.text:'';line.hidden=!cue};choice.addEventListener('change',update);video.addEventListener('timeupdate',update);video.addEventListener('seeked',update);update()});</script>'''
    script = script.replace('__CAPTIONS__', json.dumps(preview_captions, ensure_ascii=False).replace('</', '<\\/'))
    markup = markup.replace('</html>', style + script + '</html>')
    (ROOT / '审片.html').write_text(markup, encoding='utf-8')


def main():
    for path in (WORK / 'publish').glob('*/publish.json'):
        existing = json.loads(path.read_text(encoding='utf-8'))
        if existing.get('uploaded') or existing.get('human_review', {}).get('status') != 'pending':
            raise RuntimeError('已有审片/上传状态，禁止制作脚本覆盖：' + str(path))
    pilot_chinese_captions()
    english_cover()
    chinese_swarm_cover()
    rows, indexes = [], []
    for episode in PLAN['episodes']:
        for variant in ['youtube-zh', 'douyin-zh']:
            name = 'gameplay-youtube-final.mp4' if variant == 'youtube-zh' else 'gameplay-zh-final.mp4'
            value, path = manifest(episode, variant, ROOT / 'final' / episode['id'] / variant / name,
                                   'zh-CN', 'sidecar' if variant == 'youtube-zh' else 'burned_in')
            rows.append(value)
            indexes.append({'variant_id': value['variant_id'], 'manifest_file': relative(path, WORK), 'ready_to_upload': False})
    value, path = manifest(PLAN['episodes'][0], 'youtube-en', ROOT / 'final/swarm/youtube-en/gameplay-en-final.mp4',
                           'en', 'burned_in_and_sidecar', pilot=True)
    rows.append(value)
    indexes.append({'variant_id': value['variant_id'], 'manifest_file': relative(path, WORK), 'ready_to_upload': False})
    render.write_json(WORK / 'publish.json', {'schema_version': 2, 'batch_id': PLAN['batch_id'],
        'requested_variants': [r['variant_id'] for r in rows], 'variants': indexes, 'ready_to_upload': False,
        'ready_to_review': True, 'phase': 'awaiting_human_review',
        'post_publication': {'x': {'authorized': True, 'status': 'pending_youtube_publication',
                                  'one_post_per_episode': True, 'swarm_preferred_link': 'english_pilot_if_public'}}})
    review_page(rows)
    listing = '\n'.join(f'{r["variant_id"]}: {r["duration_seconds"]:.2f}秒，1920×1080，待人工审片' for r in rows)
    (WORK / '交付清单.txt').write_text(listing + '\n审片入口：../审片.html\n', encoding='utf-8-sig')
    x_dir = WORK / 'publish/x'
    x_dir.mkdir(parents=True, exist_ok=True)
    x_posts = [
        {'episode_id': 'swarm', 'text': 'I built a base-defense game, then took the fight into the alien queen’s burrow. Here is an edited run from an earlier build. English narration; the playable demo currently has a Chinese UI.', 'preferred_variant': 'swarm-youtube-en'},
        {'episode_id': 'jackal', 'text': 'One little jeep, two rescue missions: barracks, rocket upgrades and helicopter evacuations in my unofficial 3D Jackal remake. Chinese narration with English subtitles.', 'preferred_variant': 'jackal-youtube-zh'},
        {'episode_id': 'cadillacs', 'text': 'What changes when a classic brawler becomes first person? I tested side, rear and first-person views in my unofficial Cadillacs and Dinosaurs remake. Chinese narration with English subtitles.', 'preferred_variant': 'cadillacs-youtube-zh'}
    ]
    render.write_json(x_dir / 'drafts.json', {'status': 'not_published', 'requires': 'verified public YouTube URL and confirmed owner X account/API', 'posts': x_posts})
    print('Packaged', len(rows), 'video variants and three episode-specific X drafts', flush=True)


if __name__ == '__main__':
    main()

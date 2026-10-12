# -*- coding: utf-8 -*-
"""超级玛丽 3D 1-4 库巴城堡 —— 三平台投稿包装。

把母版分发到 final/<variant>/，写各平台投稿文案 TXT 与 publish.json，并生成交付清单。
文案的唯一来源就是本文件（随代码进仓库），成片与封面按规则留在仓库外的媒体目录。
"""
import hashlib, json, os, shutil, subprocess
from pathlib import Path
from PIL import Image

R = Path(__file__).resolve().parent
MEDIA = Path(os.environ.get('MEDIA_DIR', 'D:/project/task-artifacts/mario-stage4-video-20261012'))
MASTER = MEDIA / 'master' / 'mario-1-4-master.mp4'
FIN, PUB = MEDIA / 'final', R / 'publish'
TOY = 'https://www.bilibili.com/toy/feidao-mario-3d/index.html'
WEB = 'https://www.zhengxiaohui.cn/html/game/mario-3d/index.html'
HUB = 'https://www.zhengxiaohui.cn/games.html'
VOTE = 'https://www.zhengxiaohui.cn/game-vote.html'
TOPIC = '哔哩哔哩Toy创意挑战 https://www.bilibili.com/v/topic/detail?topic_id=1346285'

TITLE_BILI = '超级玛丽3D 1-4 库巴城堡完整实机：砍断吊桥那一下，库巴话都没说完'
TITLE_DOUYIN = '超级玛丽3D第四关：库巴城堡，七根火棒和一条零受伤路线'
TITLE_YT = '超级玛丽 3D · 1-4 库巴城堡完整实机：岩浆、七根火棒与砍断吊桥'

DESC_BILI = f"""WORLD 1-4 库巴城堡，这次一次录全：160 列城堡、4 处岩浆、7 根火棒、6 块隐藏金币砖、13 格库巴吊桥。
跳过岩浆、穿过火棒走廊，顶出隐藏金币砖，再跳上桥上方的浮台从库巴头顶过去碰到斧头：断链、塌桥，库巴掉进岩浆，走到蘑菇人那里看到那句“公主在另一座城堡”。
同一套已验证按键路线分别用侧视、正视肩上、第一人称、俯视录了一遍，另有一段手机横屏触屏实机（摇杆加 J/K/U/I 动作键，竖着拿也会自动转横屏）。
当前版本 v2.6.0：1-1 至 1-4 可直接选关，1-3 拔旗后自动接 1-4，配原版城堡曲。电脑 I 冲刺、K 跳、J 火球（需火焰花）、U 下蹲、C 切视角、Q/E 转镜头。
Toy 试玩：{TOY}
百宝箱试玩（复制到浏览器打开）：{WEB}
给这款投票、想玩哪款复刻：{VOTE} （百宝箱 → 游戏 → 自研游戏投票榜）
第四关由 Claude 在任务分支 claude/mario-stage4-20261010 上开发。片中画面由已验证的按键路线驱动录制，不是真人手操；手机段为桌面触屏模拟，真机手感仍需实机验证。"""

PIN_BILI = f"""火棒走廊那段最容易翻车：第一根火棒前要退一步等空当，最后连跳跳上桥上方浮台，从库巴头顶过去就是斧头。
Toy 试玩：{TOY}
你砍到桥的时候还剩多少时间？我这次录到结算剩 216，想看看有没有更快的走法。"""

TAGS_BILI = ['bilibilitoy', '超级玛丽', '库巴城堡', '游戏开发', '实机演示', 'AI', 'Claude']

DESC_DOUYIN = f"""超级玛丽3D 第四关 WORLD 1-4 库巴城堡完整实机：160 列城堡、4 处岩浆、7 根火棒、6 块隐藏金币砖、13 格吊桥。
穿过火棒走廊，跳上浮台从库巴头顶过去碰到斧头，断链塌桥，库巴掉进岩浆。当前版本 v2.6.0，1-1 到 1-4 可直接选关，配原版城堡曲。
画面由已验证的按键路线驱动录制，不是真人手操；手机段为桌面触屏模拟。
试玩（复制到浏览器打开）：{WEB}"""

TOPICS_DOUYIN = ['#超级玛丽', '#库巴城堡', '#游戏开发', '#实机演示', '#独立游戏', '#AI编程']

DESC_YT = f"""游戏试玩：{HUB}
（在列表里选“超级玛丽 3D”，链接不能点时复制到浏览器打开；游戏界面目前为中文。）
WORLD 1-4 库巴城堡完整实机：160 列城堡、4 处岩浆、7 根火棒、6 块隐藏金币砖、13 格库巴吊桥。穿过火棒走廊、顶出隐藏金币砖，跳上桥上方浮台从库巴头顶过去碰到斧头，断链塌桥，库巴掉进岩浆。
当前版本 v2.6.0：1-1 至 1-4 可直接选关，1-3 拔旗后自动接 1-4，配原版城堡曲。电脑 I 冲刺、K 跳、J 火球（需火焰花）、U 下蹲、C 切视角、Q/E 转镜头；手机为摇杆加动作键，竖屏自动转横屏。
第四关由 Claude 在任务分支 claude/mario-stage4-20261010 上开发。片中画面由已验证的按键路线驱动录制，不是真人手操；手机段为桌面触屏模拟。
投票／愿望单（复制到浏览器打开）：{VOTE} （百宝箱 → 游戏 → 自研游戏投票榜）"""

TAGS_YT = ['超级玛丽', '库巴城堡', '超级玛丽3D', '游戏开发', '实机演示', 'AI 开发', 'Claude', 'Three.js']

DESC_EN = """Play my games: https://www.zhengxiaohui.cn/games.html
(Open the list and pick 超级玛丽 3D — the in-game UI is currently Chinese only.)
A full run of World 1-4, Bowser's Castle, rebuilt in 3D on the web: 160 columns of castle, 4 lava pits, 7 rotating fire bars, 6 hidden coin blocks and the 13-tile drawbridge. Past the fire bars, over Bowser's head, onto the axe: the chain snaps, the bridge collapses and Bowser drops into the lava.
Current build v2.6.0: levels 1-1 to 1-4 are selectable from the menu, 1-3 flows straight into 1-4, original castle theme music.
World 1-4 was developed with Claude on branch claude/mario-stage4-20261010. The footage is driven by a pre-verified key-input route rather than live hand play, and the phone segment is a desktop touch simulation; narration is local TTS (IndexTTS-2.5), not an official voice."""

TITLE_EN = "Super Mario 3D World 1-4: Bowser's Castle, one clean run"


def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def probe(p):
    j = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(p)], text=True))
    v = next(s for s in j['streams'] if s['codec_type'] == 'video')
    return {'width': v['width'], 'height': v['height'], 'duration_seconds': round(float(j['format']['duration']), 3)}


def txt(p, blocks):
    p.write_text(''.join(f'{k}\n{v}\n' for k, v in blocks), encoding='utf-8-sig')


def place(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    try:
        os.link(src, dst)                                  # 同一块盘上硬链接，三平台共用同一份成片与哈希
    except OSError:
        shutil.copy2(src, dst)


meta = probe(MASTER)
h = sha(MASTER)
plan = [
    ('bilibili-zh', 'gameplay-zh-final.mp4', [
        ('【标题】', TITLE_BILI),
        ('【标签】', '\n'.join(TAGS_BILI)),
        ('【话题】', TOPIC),
        ('【简介】', DESC_BILI),
        ('【置顶评论】', PIN_BILI)]),
    ('douyin-zh', 'gameplay-zh-final.mp4', [
        ('【说明】', DESC_DOUYIN),
        ('【话题】', '\n'.join(TOPICS_DOUYIN))]),
    ('youtube-zh', 'gameplay-youtube-final.mp4', [
        ('【标题】', TITLE_YT),
        ('【标签】', '\n'.join(TAGS_YT)),
        ('【简介】', DESC_YT)]),
]
variants = []
for vid, vfile, blocks in plan:
    d = FIN / vid
    d.mkdir(parents=True, exist_ok=True)
    place(MASTER, d / vfile)
    txt(d / '投稿文案.txt', blocks)
    if vid == 'youtube-zh':                              # YouTube 元数据本地化字段（英文标题/简介），音轨仍是中文
        txt(d / 'English-localizations.txt', [('【Title】', TITLE_EN), ('【Description】', DESC_EN),
                                              ('【Tags】', '\n'.join(['Super Mario 3D', "Bowser's Castle", 'World 1-4', 'WebGL game', 'AI game development', 'Claude'])),
                                              ('【Note】', 'Audio track and burned-in captions are Chinese; captions-en.srt is the English subtitle attachment. The game UI is Chinese only.')])
    covers = []
    for cf in sorted(d.glob('cover*.jpg')):
        with Image.open(cf) as im:
            covers.append({'file': cf.name, 'width': im.width, 'height': im.height,
                           'purpose': {'cover-home-4x3.jpg': 'B 站首页推荐（4:3）', 'cover-space-16x9.jpg': 'B 站个人空间（16:9）',
                                       'cover-16x9.jpg': '抖音封面（16:9）', 'cover-zh-16x9.jpg': 'YouTube 缩略图（16:9）'}.get(cf.name, '封面')})
    subs = []
    if vid == 'youtube-zh':                              # YouTube 交可切换的中英 SRT 附件（成片本身已烧中文）
        for sf in ('captions-zh.srt', 'captions-en.srt'):
            place(MEDIA / sf, d / sf)
    for sf in ('captions-zh.srt', 'captions-en.srt'):
        if (d / sf).exists():
            subs.append({'file': sf, 'language': sf[9:-4], 'purpose': 'YouTube 可切换字幕附件', 'sha256': sha(d / sf), 'required_for_upload': True})
    m = {
        'schema_version': 2, 'variant_id': vid, 'platform': vid.rsplit('-', 1)[0], 'content_type': 'gameplay',
        'language': 'zh-CN', 'audio_language': 'zh-CN', 'packaging_language': 'zh-CN',
        'game_name': '超级玛丽 3D', 'game_version': 'v2.6.0',
        'video_file': f'../../../final/{vid}/{vfile}', 'media_id': 'shared-zh', 'video_sha256': h, **meta,
        'title': blocks[0][1], 'description': next(v for k, v in blocks if k == '【简介】') if any(k == '【简介】' for k, _ in blocks) else next(v for k, v in blocks if k == '【说明】'),
        'tags': next((v.split('\n') for k, v in blocks if k == '【标签】'), []),
        'topic': TOPIC if vid == 'bilibili-zh' else None,
        'pinned_comment_draft': PIN_BILI if vid == 'bilibili-zh' else None,
        'description_file': '../../../final/%s/投稿文案.txt' % vid,
        'cover_files': covers, 'cover_selection_source': 'capture/heroic-side.mp4 抽帧（真实实机，未烧字幕）+ 原生排版',
        'cover_upload_mode': 'custom_image',
        'subtitle_mode': 'burned_in_and_sidecar' if subs else 'burned_in',
        'subtitle_attachments': subs,
        'category': None, 'copyright_type': None,
        'credits': {'development_model': '第四关 1-4（v2.6.0）由 Claude 在分支 claude/mario-stage4-20261010 开发；更早版本见 media-kit/game.json 的 development_model',
                    'narration_voice': 'IndexTTS-2.5 本地合成（参考音色为公开演示样本派生的中性男声），非微软官方云希音色；Edge-TTS 当次返回 403，可后续换声重渲',
                    'music_sfx': '游戏内使用原版城堡曲与音效，随游戏包分发，视频不单独分发音频源文件'},
        'disclosures': ['画面由已验证按键路线驱动录制，不是真人手操', '手机段为桌面触屏模拟，未做真机验收', '配音为本地 TTS，非官方云希音色'],
        'unverified_fields': ['category', 'copyright_type', '话题是否已在投稿入口选中', '推流申请字段'],
        'blocking_issues': ['等待用户人工审片，未通过前不上传'],
        'platform_requirements_checked_at': '2026-10-12',
        'platform_sources': ['C:/Users/37818/.claude/skills/game-video/references/toy-operations.md',
                             'C:/Users/37818/.claude/skills/game-video/references/delivery.md'],
        'ready_to_upload': False,
    }
    if vid == 'youtube-zh':
        m.update({'title_en': TITLE_EN, 'description_en': DESC_EN, 'localization_file': 'English-localizations.txt'})
    (PUB / vid).mkdir(parents=True, exist_ok=True)
    (PUB / vid / 'publish.json').write_text(json.dumps(m, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    variants.append({'variant_id': vid, 'manifest_file': f'publish/{vid}/publish.json', 'ready_to_upload': False,
                     'blocking_issues': ['待用户人工审片通过']})

(R / 'publish.json').write_text(json.dumps({
    'schema_version': 2, 'game_name': '超级玛丽 3D', 'game_version': 'v2.6.0',
    'requested_variants': [v[0] for v in plan], 'variants': variants, 'ready_to_upload': False,
    'media_note': '成片、封面、配音、抽帧等大文件按仓库规则留在 ' + str(MEDIA) + '，不进 git；本清单与脚本为可提交的工程记录。',
    'shared_media': {'shared-zh': {'file': str(MASTER), 'sha256': h, **meta}},
}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

lines = ['超级玛丽 3D · 1-4 库巴城堡视频（2026-10-12）交付清单', '',
         f'母版/共享成片 media_id=shared-zh  {MASTER}',
         f'  时长 {meta["duration_seconds"]} 秒，{meta["width"]}x{meta["height"]}，sha256 {h[:16]}…',
         '  音轨：中文解说（本地 IndexTTS-2.5）+ 游戏原声侧链压低；字幕：中文已烧录', '',
         '各平台入口（final/<平台>/ 为唯一投稿入口，三平台共用同一份成片与哈希）：']
for vid, vfile, _ in plan:
    d = FIN / vid
    files = sorted(x.name for x in d.iterdir())
    lines += [f'  {vid}: ' + ', '.join(files)]
lines += ['', '待办：', '  1) 用户人工审片；通过前不上传任何平台（当前 ready_to_upload=false）。',
          '  2) B 站投稿时在话题入口实际选择“哔哩哔哩Toy创意挑战”，发布后用 toy video bind 绑定 BV 号。',
          '  3) 配音如需换成微软官方云希音色，需等 Edge-TTS 恢复后重跑 work/voice_indextts.py 的替代脚本并重渲母版。',
          '  4) 手机段为桌面触屏模拟，真机手感需另行实机验证。']
(R / '交付清单.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('\n'.join(lines))

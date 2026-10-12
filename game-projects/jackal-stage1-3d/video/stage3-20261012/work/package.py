"""生成三平台的封面、投稿文案、清单与交付说明。成片还没渲染出来时照样可以跑：清单里如实标成未就绪。"""
import json, hashlib, subprocess, datetime
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

R = Path(__file__).resolve().parent
F = R.parent / 'final'
FONT = 'C:/Windows/Fonts/msyhbd.ttc'
TZ = datetime.timezone(datetime.timedelta(hours=8))
now = datetime.datetime.now(TZ).isoformat(timespec='seconds')
if (R / 'publication-result.json').exists():
    raise SystemExit('本期已有发布记录，停止重建以免覆盖发布状态；新剪辑请另建一期目录。')


def write(p, t): p.parent.mkdir(parents=True, exist_ok=True); p.write_text(t, encoding='utf-8-sig')
def js(p, v): p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps(v, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def font(n): return ImageFont.truetype(FONT, n)


# ---------- 封面：真实 Boss 战画面 + 排版 ----------
SRC_FRAME = R / 'edit/covers/cand-151.05.jpg'   # 原片 run 151.05 秒：吉普在码头边躲炮弹，一座炮塔已被打毁
MAIN, SUB = '吉普单挑战舰', '赤色要塞 3D · 第三关上线'


def cover(size, crop, name, main_px, sub_px):
    W, H = size
    im = Image.open(SRC_FRAME).convert('RGB').crop(crop).resize(size, Image.LANCZOS)
    # 下半部分是空的码头地面，压一层自下而上的暗角放字
    shade = Image.new('L', (1, H), 0)
    for y in range(H):
        t = max(0.0, (y - H * 0.50) / (H * 0.50)); shade.putpixel((0, y), int(205 * t ** 1.15))
    im = Image.composite(Image.new('RGB', size, '#10202c'), im, shade.resize(size))
    d = ImageDraw.Draw(im)
    fm, fs = font(main_px), font(sub_px)
    mw = d.textlength(MAIN, font=fm); x = (W - mw) / 2; y = H - main_px - sub_px - int(H * 0.115)
    d.text((x, y), MAIN, font=fm, fill='#fff2ca', stroke_width=max(6, main_px // 14), stroke_fill='#7a1f12')
    sw = d.textlength(SUB, font=fs); pad = int(sub_px * 0.5); sy = y + main_px + int(H * 0.035)
    d.rounded_rectangle(((W - sw) / 2 - pad * 1.4, sy - pad * 0.45, (W + sw) / 2 + pad * 1.4, sy + sub_px + pad * 0.75), radius=int(sub_px * 0.45), fill='#c9583f', outline='#fff2ca', width=4)
    d.text(((W - sw) / 2, sy), SUB, font=fs, fill='#fffaf0')
    out = F / name; out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, quality=93)
    return out


covers = {
    'bili_home': cover((1440, 1080), (245, 44, 1565, 1034), 'bilibili-zh/cover-home-4x3.jpg', 196, 66),
    'bili_space': cover((1920, 1080), (104, 56, 1816, 1019), 'bilibili-zh/cover-space-16x9.jpg', 216, 72),
    'douyin': cover((1920, 1080), (104, 56, 1816, 1019), 'douyin-zh/cover-16x9.jpg', 216, 72),
    'youtube': cover((1920, 1080), (104, 56, 1816, 1019), 'youtube-zh/cover-zh-16x9.jpg', 216, 72),
}
for k, p in covers.items():
    im = Image.open(p); thumb = im.resize((320, 240) if im.size == (1440, 1080) else (320, 180), Image.LANCZOS)
    (R / 'edit/covers/thumbs').mkdir(parents=True, exist_ok=True); thumb.save(R / 'edit/covers/thumbs' / (k + '.jpg'), quality=90)
js(R / 'edit/covers/design.json', {'copy': [MAIN, SUB], 'method': '实机截图（原片 run 151.05 秒，v0.11.0 Boss 战）裁掉顶部状态栏与底部 Boss 血条后加暗角与文字排版；没有用生成图', 'source_frame': 'edit/covers/cand-151.05.jpg',
                                   'files': {k: {'file': str(p.relative_to(R.parent)).replace('\\', '/'), 'size': Image.open(p).size, 'sha256': sha(p)} for k, p in covers.items()}})

# ---------- 文案 ----------
toy = 'https://www.bilibili.com/toy/feidao-jackal-3d/index.html'
web = 'https://www.zhengxiaohui.cn/html/game/jackal-stage1-3d/index.html'
vote = 'https://www.zhengxiaohui.cn/game-vote.html'
games = 'https://www.zhengxiaohui.cn/games.html'
title_b = '一辆吉普单挑一艘战舰！赤色要塞3D第三关上线，直接开玩'
tags_b = ['bilibilitoy', '赤色要塞', '独立游戏', '游戏开发', '射击游戏', 'Claude', 'AI']
topic, topicurl = '哔哩哔哩Toy创意挑战', 'https://www.bilibili.com/v/topic/detail?topic_id=1346285'
desc_b = f'''赤色要塞 3D 第三关「港口」上线：炸开三道闸门，冲过两条栈桥和仓库之间的之字通道，最后在码头单挑一艘战舰，六座炮塔一座一座打掉。这期还讲了第一版闹的笑话，和一个会让新玩家八秒阵亡的老问题是怎么改的。
本作用 Claude 辅助开发，是《赤色要塞》的粉丝向非官方重制。WASD 移动，J 机枪，K 手雷或火箭，U 联合开火，C 切换视角；默认 3 格护甲、无限命。
哔哩哔哩 Toy 试玩：{toy}
百宝箱试玩（复制到浏览器打开）：{web}
给这款投票、想玩哪款复刻（复制到浏览器打开）：{vote} （百宝箱 → 游戏 → 自研游戏投票榜）'''
comment_b = f'''战舰有六座炮塔，手雷要贴着码头边扔才够得着北边那一排。原作一共六关，你最想先看到哪一关？
Toy试玩：{toy}
投票／愿望单（复制到浏览器打开）：{vote} （百宝箱 → 游戏 → 自研游戏投票榜）'''
write(F / 'bilibili-zh/投稿文案.txt', '【标题】\n' + title_b + '\n\n【标签】\n' + '\n'.join(tags_b) + '\n\n【话题】\n' + topic + '\n' + topicurl + '\n\n【简介】\n' + desc_b + '\n\n【置顶评论】\n' + comment_b + '\n')

title_d = '一辆吉普单挑一艘战舰！赤色要塞3D第三关上线'
desc_d = '小时候的赤色要塞，做成了 3D 网页版。第三关港口上线：炸闸门、冲栈桥，最后单挑一艘战舰。原作一共六关，下一关你想先看哪个？'
tags_d = ['赤色要塞', '独立游戏', '游戏开发', '怀旧游戏', '小霸王']
write(F / 'douyin-zh/投稿文案.txt', '【标题】\n' + title_d + '\n\n【说明】\n' + desc_d + '\n\n【话题】\n' + '\n'.join('#' + t for t in tags_d) + '\n\n【封面】\n上传 cover-16x9.jpg；入口只支持选帧时选成片 0:05 左右战舰与吉普同框的画面\n')

title_y = '一辆吉普单挑一艘战舰！赤色要塞 3D 重制版第三关「港口」上线'
desc_y = f'''游戏试玩：{games}
在列表里选「赤色要塞」即可，电脑手机都能玩；链接点不开就复制到浏览器。
赤色要塞 3D 第三关「港口」：炸开三道闸门，冲过两条栈桥和仓库之间的之字通道，最后在码头单挑一艘战舰。这期还讲了第一版闹的笑话，和一个会让新玩家八秒阵亡的老问题是怎么改的。
用 Claude 辅助开发的粉丝向非官方重制，《赤色要塞》（Jackal）原作版权归 Konami 所有。
操作：WASD 移动，J 机枪，K 手雷或火箭，U 联合开火，C 切换视角。'''
tags_y = ['赤色要塞', 'Jackal', 'FC', '独立游戏', '游戏开发', 'Three.js', 'Claude', 'AI']
write(F / 'youtube-zh/投稿文案.txt', '【标题】\n' + title_y + '\n\n【简介】\n' + desc_y + '\n\n【标签】\n' + '\n'.join(tags_y) + '\n\n【字幕】\n上传 captions-zh.srt（中文）与 captions-en.srt（英文）；音轨语言选中文\n')
title_en = 'One Jeep vs. a Battleship — Jackal 3D Fan Remake, Stage 3 (Harbor) Is Live'
desc_en = f'''Play my games: {games}
Pick 赤色要塞 (Jackal) from the list. It runs in the browser on desktop and phone; copy the link if it is not clickable.
Stage 3 of my 3D fan remake of Jackal (NES): blow open three gates, cross the twin piers and the warehouse corridors, then take on a docked battleship with six turrets. This episode also shows what the very first build looked like, and how I fixed an old problem that got idle new players killed in eight seconds.
Unofficial fan remake built with help from Claude. Jackal is © Konami. The game UI is in Chinese.
Controls: WASD move, J machine gun, K grenade / rocket, U fire both, C change view.'''
write(F / 'youtube-zh/English-localizations.txt', '[Title]\n' + title_en + '\n\n[Description]\n' + desc_en + '\n')

# ---------- 清单 ----------
NAMES = {'bilibili-zh': 'gameplay-zh-final.mp4', 'douyin-zh': 'gameplay-zh-final.mp4', 'youtube-zh': 'gameplay-youtube-final.mp4'}
report = json.loads((R / 'edit/shared-zh/render-report.json').read_text(encoding='utf-8')) if (R / 'edit/shared-zh/render-report.json').exists() else {}
voice_ok = (R / 'audio/shared-zh/01-hook.mp3').exists()
index = []
for variant in ('bilibili-zh', 'douyin-zh', 'youtube-zh'):
    video = F / variant / NAMES[variant]; ok = video.exists() and variant in report
    blocking = [] if ok else ['正式配音未生成：Edge 在线配音（云希）今天被服务端拒绝（403，上游已知问题），成片尚未渲染；现有的只是系统自带语音配的画面样片']
    blocking.append('用户尚未审片')
    if ok:
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'quiet', '-show_streams', '-show_format', '-of', 'json', str(video)]))
        meta = {'video_sha256': sha(video), 'duration_seconds': float(probe['format']['duration']), 'width': 1920, 'height': 1080}
    else:
        meta = {'video_sha256': None, 'duration_seconds': None, 'width': 1920, 'height': 1080}
    prefix = f'../../../final/{variant}/'
    m = {'variant_id': variant, 'platform': variant.split('-')[0], 'content_type': 'update', 'language': 'zh-CN', 'audio_language': 'zh-CN', 'packaging_language': 'zh-CN',
         'game_name': '赤色要塞 3D', 'game_version': 'v0.11.0', 'video_file': prefix + NAMES[variant], 'media_id': 'bili-ending' if variant == 'bilibili-zh' else 'generic-ending', **meta,
         'description_file': prefix + '投稿文案.txt', 'cover_text': [MAIN, SUB], 'cover_selection_source': 'AI 按实机看点定稿', 'cover_upload_mode': 'custom_image',
         'credits': 'credits.txt', 'disclosures': {'ai_assisted': '游戏用 Claude 辅助开发；解说为合成语音', 'fan_remake': '粉丝向非官方重制，原作版权归 Konami'},
         'platform_requirements_checked_at': None, 'unverified_fields': ['当期投稿页的封面尺寸与字段限制未在投稿页实测'], 'blocking_issues': blocking, 'ready_to_upload': False}
    if variant == 'bilibili-zh':
        m.update({'title': title_b, 'description': desc_b, 'tags': tags_b, 'topic': {'name': topic, 'url': topicurl}, 'pinned_comment_draft': comment_b, 'subtitle_mode': 'burned_in',
                  'cover_file': prefix + 'cover-home-4x3.jpg', 'cover_files': {'home_4_3': {'file': prefix + 'cover-home-4x3.jpg', 'width': 1440, 'height': 1080, 'purpose': '首页推荐（4:3）'}, 'space_16_9': {'file': prefix + 'cover-space-16x9.jpg', 'width': 1920, 'height': 1080, 'purpose': '个人空间（16:9）'}},
                  'toy': {'id': 39863936092160, 'url': toy, 'status': 'published v0.11.0（2026-10-12 公开核验）', 'bind_after_publish': True}})
    elif variant == 'douyin-zh':
        m.update({'title': title_d, 'description': desc_d, 'tags': tags_d, 'subtitle_mode': 'burned_in', 'cover_file': prefix + 'cover-16x9.jpg', 'cover_files': {'main_16_9': {'file': prefix + 'cover-16x9.jpg', 'width': 1920, 'height': 1080, 'purpose': '封面（入口只支持选帧时改选成片 0:05 左右）'}}})
    else:
        srt = F / variant / 'captions-zh.srt'; srt_en = F / variant / 'captions-en.srt'
        m.update({'title': title_y, 'description': desc_y, 'tags': tags_y, 'localizations': {'en': {'title': title_en, 'description': desc_en, 'file': prefix + 'English-localizations.txt'}}, 'subtitle_mode': 'sidecar',
                  'subtitles': [{'file': prefix + 'captions-zh.srt', 'language': 'zh-CN', 'purpose': '中文可切换字幕', 'sha256': sha(srt) if srt.exists() else None, 'required_for_upload': True},
                                {'file': prefix + 'captions-en.srt', 'language': 'en', 'purpose': '英文可切换字幕（人工校对的译文，沿用中文音轨时间）', 'sha256': sha(srt_en) if srt_en.exists() else None, 'required_for_upload': True}],
                  'cover_file': prefix + 'cover-zh-16x9.jpg', 'cover_files': {'main_16_9': {'file': prefix + 'cover-zh-16x9.jpg', 'width': 1920, 'height': 1080, 'purpose': '缩略图（16:9）'}}})
    js(R / f'publish/{variant}/publish.json', m)
    write(R / f'publish/{variant}/credits.txt', '游戏画面、音乐与音效来自赤色要塞 3D v0.11.0 线上版本的实时录制。原作《Jackal / 赤色要塞》版权归 Konami，本作为粉丝向非官方重制；素材来源见 media-kit/sources.json。Three.js 为 MIT 许可。\n改动前对照片段录自 2026-10-12 部署前的线上旧版（v0.10.3-menu-text1-privacy1）；开发中画面为当天开发过程的真实截图。\n')
    index.append({'variant_id': variant, 'manifest_file': f'publish/{variant}/publish.json', 'ready_to_upload': False, 'blocking_issues': blocking})
js(R / 'publish.json', {'schema_version': 2, 'game_name': '赤色要塞 3D', 'game_version': 'v0.11.0', 'requested_variants': ['bilibili-zh', 'douyin-zh', 'youtube-zh'], 'variants': index, 'ready_to_upload': False, 'human_review': None, 'updated_at': now})
write(R / 'publish/bilibili-zh/Toy推流申请.txt', 'UP主昵称：飞刀班长\n视频链接：待投稿产生 BV 号\ntag 与话题：草稿已备（bilibilitoy；哔哩哔哩Toy创意挑战），待实际投稿核验\n是否置顶 Toy 链接：待投稿后执行\n是否视频中宣传 Toy 平台：是（结尾口播与片尾卡）\n运营反馈：尚未申请\n')
print('covers', {k: Image.open(p).size for k, p in covers.items()}, 'final videos ready:', [v['variant_id'] for v in index if not any('配音' in b for b in v['blocking_issues'])])

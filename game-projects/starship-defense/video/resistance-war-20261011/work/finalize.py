"""写 publish.json（根清单 + 各平台版本），并把封面复制到各平台 final 目录。"""
import json, shutil
from pathlib import Path

R = Path(__file__).resolve().parent
FINAL = R.parent / 'final'
COV = R / 'covers'

platforms = {}
for variant, video, covers in [
    ('bilibili-zh', 'gameplay-zh-final.mp4', ['cover-home-4x3.png', 'cover-space-16x9.png']),
    ('douyin-zh', 'gameplay-zh-final.mp4', ['cover-space-16x9.png']),
    ('youtube-zh', 'gameplay-youtube-final.mp4', ['cover-space-16x9.png']),
]:
    d = FINAL / variant
    d.mkdir(parents=True, exist_ok=True)
    for c in covers:
        shutil.copy2(COV / c, d / c)
    platforms[variant] = {'video': video, 'covers': covers,
                          'submission': '投稿文案.txt',
                          'subtitles': ['captions-zh.srt', 'captions-en.srt'] if variant == 'youtube-zh' else []}

root = {
    'game': '虫潮围城',
    'episode': '抗战战役 · 亮剑名场面',
    'version': 'web-zerg-corpse-spinfix-v0.33.3',
    'development_model': 'Codex（抗战战役）',
    'duration_seconds': 200.67,
    'fps': 30, 'resolution': '1920x1080',
    'voice': 'zh-CN-YunxiNeural (+0%)',
    'loudness_target': '-16 LUFS / TP -1 dBTP',
    'normal_rules': True,
    'phase_isolation': [],
    'chapters_source': {
        'ch0': 'capture/war-ch0 (李家坡·交通壕突击, 击败28, 4分1秒)',
        'ch1': 'capture/war-ch1 (骑兵连·冲锋突围, 击败14, 1分20秒)',
        'ch2': 'capture/war-ch2 (平安县城·开炮, 击败13, 2分35秒)',
    },
    'platforms': platforms,
    'review_status': '待用户人工审片',
    'publish_status': '未发布',
}
(FINAL.parent / 'work' / 'publish.json').write_text(json.dumps(root, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
for variant in platforms:
    p = FINAL.parent / 'work' / f'publish-{variant}.json'
    p.write_text(json.dumps({**root, 'platform': variant}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('publish.json 已写到 work/（根 + 三平台）')

# 交付清单
lines = [
    '抗战战役 · 亮剑名场面 —— 交付清单',
    '',
    '成片（待人工审片，审片通过后再发布）：',
    '  final/bilibili-zh/gameplay-zh-final.mp4   B站（烧中文字幕）',
    '  final/douyin-zh/gameplay-zh-final.mp4     抖音（烧中文字幕，同片）',
    '  final/youtube-zh/gameplay-youtube-final.mp4  YouTube（烧角标，另附中英可切换字幕）',
    '',
    '封面：',
    '  covers/cover-home-4x3.png   1440x1080  B站首页推荐',
    '  covers/cover-space-16x9.png 1920x1080  B站空间 / 抖音 / YouTube',
    '',
    '字幕：final/youtube-zh/captions-zh.srt、captions-en.srt（90 句，时间轴校验 OK）',
    '投稿文案：final/<平台>/投稿文案.txt（B站含试玩+投票入口；YouTube 含英文翻译字段）',
    '',
    '制作记录：',
    '  work/recording-plan.md  三章地图/武器/弹道/操作实测与镜头计划',
    '  work/edit/shared-zh/timeline.json  时间线（26 镜头、90 字幕）',
    '  work/capture/war-ch{0,1,2}/capture.json  三章录制事件与真实性标注',
    '  work/qa/acceptance-report.json  技术验收（响度 -16.17 LUFS / TP -0.93 / 黑帧 0）',
    '',
    '真实性：三章均正常规则通关（testMode=false、无无敌/清敌/瞬移/时间缩放，phase_isolation 为空）。',
    '署名：抗战战役由 Codex 开发（game.json development_model），已写入简介与标签。',
]
(R / '交付清单.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('交付清单已写到 work/')

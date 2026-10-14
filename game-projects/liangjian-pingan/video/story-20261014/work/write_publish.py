"""写出本期 B站投稿元数据（work/publish.json 与 work/publish/bilibili-zh/）。"""
import json
from pathlib import Path

V = Path(__file__).resolve().parents[1]
check = json.loads((V / 'work/qa/video-check.json').read_text('utf-8'))
copy = (V / 'final/bilibili-zh/投稿文案.txt').read_text('utf-8')


def block(name):
    body = copy.split(f'【{name}】\n')[1]
    return body.split('\n【')[0].strip()


title = block('标题')
tags = block('标签').split('\n')
description = block('简介')
pinned = block('置顶评论')

data = {
    'platform': 'bilibili',
    'variant': 'bilibili-zh',
    'title': title,
    'tags': tags,
    'description': description,
    'pinned_comment': pinned,
    'toy_id': '43022175699968',
    'toy_slug': 'feidao-gunfire',
    'development_model': 'Claude Opus 5.5（Claude Code）',
    'game_version': 'liangjian-pingan v0.5.0 / 枪火集结 0.2.3',
    'content_disclosure': {
        'narration': 'local IndexTTS-2.5 (not an official Microsoft voice, not a human VO)',
        'in_game_voice': "17 of 20 shout lines are original audio clips from the TV series 亮剑, downloaded from Bilibili without a licence per the user's decision",
        'covers': 're-composed from actual 1080p gameplay frames',
        'gameplay': 'realtime-automation bot through the input layer; infinite lives, standard durability, no damage edits; supplemental rescue-route capture',
    },
    'approval_status': 'awaiting_user_review',
    'uploaded': False,
    'gameplay': 'final/bilibili-zh/gameplay-zh-final.mp4',
    'covers': ['final/bilibili-zh/cover-home-4x3.jpg', 'final/bilibili-zh/cover-space-16x9.jpg'],
    'publication_scope': 'Bilibili only; human review required before upload',
    'topic': {
        'name': '哔哩哔哩Toy创意挑战',
        'url': 'https://www.bilibili.com/v/topic/detail?topic_id=1346285',
        'selected': False,
        'must_verify_current_at_upload': True,
    },
    'video_sha256': check['video']['sha256'],
    'duration_seconds': check['video']['duration_seconds'],
    'technical_qa': 'pass' if check['ok'] else 'fail',
    'technical_qa_warnings': check['warnings'],
    'subjective_audio_review': 'pending_user',
}

out = V / 'work/publish.json'
out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
(V / 'work/publish/bilibili-zh').mkdir(parents=True, exist_ok=True)
(V / 'work/publish/bilibili-zh/publish.json').write_text(
    json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
(V / 'work/publish/bilibili-zh/Toy推流申请.txt').write_text(
    'UP主昵称：飞刀班长（UID 16214353）\n'
    '视频链接：待审片通过并投稿取得BV长链\n'
    '投稿tag与话题：草稿已含bilibilitoy和哔哩哔哩Toy创意挑战，实际选择待投稿核验\n'
    '置顶Toy链接：评论草稿已备，待投稿后发布置顶\n'
    '视频宣传Toy：片尾尾卡明确展示哔哩哔哩Toy入口，简介首条即试玩链接\n'
    '运营反馈：待申请，无推流回执\n', encoding='utf-8')
print(out, data['video_sha256'], data['technical_qa'])

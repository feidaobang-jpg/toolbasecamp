"""Save observed publishing settings, linked X drafts and recovery notes."""
import contextlib
import datetime
import html
import json
import re
import uuid
from pathlib import Path

WORK = Path(__file__).resolve().parent
ROOT = WORK.parent
STATE = Path('C:/Users/37818/.claude/state/game-video')
TASK = json.loads((WORK / 'run-state.json').read_text(encoding='utf-8'))['continuation_task_id']


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


@contextlib.contextmanager
def locked(key):
    lock = STATE / 'locks' / (key + '.lock')
    lock.mkdir()
    render.write_json(lock / 'owner.json', {'source': 'Codex', 'task_id': TASK,
                       'operation': 'publication_notes', 'started_at': now})
    try:
        yield
    finally:
        if read(lock / 'owner.json')['task_id'] == TASK:
            (lock / 'owner.json').unlink()
            lock.rmdir()


now = datetime.datetime.now(datetime.timezone.utc).isoformat()
result = read(WORK / 'publication-result.json')
x_drafts = read(WORK / 'publish' / 'x' / 'drafts.json')
if result['platforms']['x'].get('user_decision') or x_drafts.get('user_decision') or any(
        post.get('posted')
        or post.get('status') in {'scheduled', 'publishing', 'published', 'submission_unknown'}
        or any(post.get(key) for key in ('post_id', 'x_post_id', 'metricool_schedule_id',
                                        'metricool_uuid', 'planner_url'))
        for post in x_drafts['posts']):
    raise SystemExit('Existing X decision or submission records must be preserved; '
                     'update the observed result directly instead of regenerating pending notes.')
import render_backfill as render

for platform in ['youtube', 'douyin']:
    account = result['platforms'][platform]
    with locked(platform + '-' + account['account_key']):
        result = read(WORK / 'publication-result.json')
        ledger_path = STATE / 'publications' / (platform + '-' + account['account_key'] + '.json')
        ledger = read(ledger_path)
        for item in result['new_variants']:
            if item['platform'] != platform:
                continue
            path = WORK / 'publish' / item['variant_id'] / 'publish.json'
            manifest = read(path)
            settings = {'ai_content_disclosure': True, 'custom_cover_uploaded': True,
                        'settings_observed_on': 'official creator website', 'recorded_at': now}
            if platform == 'youtube':
                settings.update({'made_for_kids': False, 'paid_promotion': False,
                                 'video_language': 'en' if item['variant_id'].endswith('-en') else 'zh-CN',
                                 'category': 'Gaming', 'hd_processing': 'complete',
                                 'caption_public_verification': 'manual zh-CN and en listed in public player',
                                 'external_demo_link': 'Catalog URL at first line; clickable external links require channel verification' if manifest.get('demo_entry_revision') else 'URL present; clickable external links require channel verification'})
                manifest['duplicate_check_scope'] = {
                    'pre_upload_normal_videos': ['Kk8XPu9vQ-M'],
                    'pre_upload_shorts': ['DE7PRJiSReo'],
                    'matching_backfill_found': False,
                    'description': 'Normal-video library and channel translations list inspected before upload'}
            else:
                settings.update({'original_audio': True, 'publish_mode': 'immediate',
                                 'cover_warning': 'Optional portal suggestion: avoid screenshot-based covers; did not block publication'})
                item['platform_cover_files'] = manifest['platform_cover_files']
            manifest['publishing_settings'] = settings
            item['publishing_settings'] = settings
            render.write_json(path, manifest)
            record = next(row for row in ledger['records'] if row['variant_id'] == item['variant_id'])
            record['publishing_settings'] = settings
            if platform == 'douyin':
                record['platform_cover_files'] = manifest['platform_cover_files']
            else:
                record['duplicate_check_scope'] = manifest['duplicate_check_scope']
        render.write_json(ledger_path, ledger)
        result['platforms'][platform]['login_incident_status'] = 'resolved'
        result['platforms'][platform]['notification_resolution'] = 'Resolve returned resolved'
        render.write_json(WORK / 'publication-result.json', result)

with locked('x-publication-access-pending-owner'):
    incident_path = STATE / 'accounts' / 'x-publication-access-pending-owner.json'
    incident = read(incident_path) if incident_path.exists() else {
        'platform': 'x', 'task_id': 'game-video-x-publication-access-pending-owner',
        'event_id': str(uuid.uuid4()), 'status': 'needs_user', 'reason': 'Manual',
        'created_at': now, 'source': 'Codex', 'notification_status': 'not_sent'}
    incident['required_action'] = 'Provide an existing authorized official X API/connector, or explicitly defer X. Do not send credentials in chat.'
    render.write_json(incident_path, incident)
    drafts = read(WORK / 'publish' / 'x' / 'drafts.json')
    for post in drafts['posts']:
        variant = next(row for row in result['new_variants'] if row['variant_id'] == post['preferred_variant'])
        assert variant['status'] == 'published'
        post.update({'youtube_id': variant['platform_id'], 'youtube_url': variant['public_url'],
                     'final_text': post['text'] + '\n' + variant['public_url'],
                     'status': 'ready_pending_official_access', 'posted': False})
        (WORK / 'publish' / 'x' / (post['episode_id'] + '.txt')).write_text(post['final_text'] + '\n', encoding='utf-8', newline='\n')
    drafts.update({'status': 'ready_pending_official_access', 'updated_at': now,
                   'pending_event': {'task_id': incident['task_id'], 'event_id': incident['event_id']}})
    render.write_json(WORK / 'publish' / 'x' / 'drafts.json', drafts)
    result['platforms']['x'].update({'status': 'ready_pending_official_access',
                                    'needs': incident['required_action'], 'pending_event': drafts['pending_event']})

all_public = all(row['status'] == 'published' for row in result['new_variants'])
result['release_status'] = 'videos_published_x_pending' if all_public else 'youtube_published_douyin_review_pending_x_access_pending'
result['next_action'] = '核验仍在审核的抖音稿件；X需本人接入已有官方API/连接器或明确暂缓，无需重新上传或审片。' if not all_public else '7版均公开；X三条带链接文案已定稿，需本人接入已有官方API/连接器或明确暂缓。'
result['updated_at'] = now
result['publishing_screenshots'] = []
for platform in ['youtube', 'douyin']:
    proof = WORK / 'qa' / (platform + '-published.jpg')
    if proof.exists():
        result['publishing_screenshots'].append({'platform': platform, 'file': str(proof.relative_to(WORK)),
                                                'sha256': render.sha(proof), 'purpose': 'official creator library after publication'})
proof = WORK / 'qa' / 'youtube-catalog-entry.jpg'
if proof.exists():
    result['publishing_screenshots'].append({'platform': 'youtube', 'file': str(proof.relative_to(WORK)),
                                            'sha256': render.sha(proof), 'purpose': 'public description with first-line catalog URL'})
result['platforms']['x']['notification_status'] = incident['notification_status']
render.write_json(WORK / 'publication-result.json', result)
run = read(WORK / 'run-state.json')
run.update({'phase': result['release_status'], 'published': all_public,
            'platform_preview': 'public desktop web players verified; no real-phone test',
            'x_published': False, 'updated_at': now,
            'retention_reason': '7版被忽略的成片与音轨仍须保全；X续接待处理，保留任务worktree。'})
render.write_json(WORK / 'run-state.json', run)
root_manifest = read(WORK / 'publish.json')
root_manifest['phase'] = result['release_status']
render.write_json(WORK / 'publish.json', root_manifest)

with locked('batch-backfill-20261008'):
    batch_path = STATE / 'batches' / 'backfill-20261008.json'
    batch = read(batch_path)
    batch.update({'phase': result['release_status'], 'published': all_public,
                  'continuation_task_id': TASK, 'updated_at': now,
                  'published_variants': [row['variant_id'] for row in result['new_variants'] if row['status'] == 'published'],
                  'pending_variants': [row['variant_id'] for row in result['new_variants'] if row['status'] != 'published'],
                  'x_pending_event': drafts['pending_event']})
    render.write_json(batch_path, batch)

rows = []
for row in result['new_variants']:
    link = '[' + row['platform_id'] + '](' + row['public_url'] + ')' if row.get('public_url') else row['platform_id']
    rows.append('| ' + row['variant_id'] + ' | ' + row['status'] + ' | ' + link + ' |')
readme = (ROOT / 'README.md').read_text(encoding='utf-8')
readme = readme.replace('历史B站稿件保留，尚未上传任何新版本。', '历史B站稿件保留，本批7版已上传，公开状态见下表。')
start = readme.index('## 当前状态')
end = readme.index('## 来源与制作')
readme = readme[:start] + '## 当前状态\n\n用户于2026-10-08回复“可以，继续把”，本批7版审片通过，已关联视频、封面和字幕哈希。实际账号：YouTube郑晓辉（频道UCha4DVE3db0P1eJvu4qsLJg）；抖音飞刀帮主（公开抖音号84261875244）。\n\n| 版本 | 状态 | 投稿ID / 公开入口 |\n| --- | --- | --- |\n' + '\n'.join(rows) + '\n\nYouTube四版中英手工字幕均已上传并在公开播放器核验，三条中文主版英文标题与简介已发布。抖音横4:3及竖3:4封面实际上传，游戏视频保持横屏。门户的截屏封面建议已记录，不表示投稿失败。公开视频实机与字幕在桌面网页检查，未做真实手机验收。YouTube试玩URL可复制，频道尚需一次性验证才支持可点击的外部链接。\n\nX每期一条英文文案已加真实YouTube链接，虫潮优先英文版；保存在[三条X文案](work/publish/x/drafts.json)。当前没有本人已确认的官方API或已授权连接器，尚未发X；Metricool仅是未安装的候选，X需要付费套餐和附加项，未购买。通知登录事件已核验恢复并Resolve。\n\n' + readme[end:]
readme = readme.replace('已审片通过，尚待登录与发布，暂不归档工作区；', '已审片通过并上传，X续接及媒体保全尚有后续，暂不归档工作区；')
readme = readme.replace('4. `work/verify_backfill.py`', '4. `work/douyin_covers.py`制作平台4:3/3:4封面；`work/publication_state.py`按账号锁保存实际稿件ID和状态；`work/publication_notes.py`更新发布记录与X续接文案，不执行远端投稿。\n5. `work/verify_backfill.py`')
readme = readme.replace('YouTube试玩URL可复制，频道尚需一次性验证才支持可点击的外部链接。', 'YouTube四版及三条英文元数据的试玩入口已统一放首行：`https://www.zhengxiaohui.cn/games.html`，下一行提示选择对应游戏；新旧完整简介保存在[入口修订记录](work/publish/youtube-entry-revision.json)。频道尚需一次性验证才支持可点击的外部链接，当前URL可复制。')
if 'work/youtube_entry_revision.py' not in readme:
    readme = readme.replace('## 复现与保全', '`work/youtube_entry_revision.py`只准备并记录简介入口修订，不执行远端操作；保存公开核验后按既有视频ID续接，不重传成片。\n\n## 复现与保全')
(ROOT / 'README.md').write_text(readme, encoding='utf-8', newline='\n')
page = (ROOT / '审片.html').read_text(encoding='utf-8')
published_count = sum(row['status'] == 'published' for row in result['new_variants'])
message = '当前阶段：本批7版审片通过且已上传，' + str(published_count) + '版已公开核验；具体状态和链接见README及发布台账。X待官方发布权限。这里保留已审成片回看。'
page = re.sub(r'(<p class="status">).*?(</p>)', lambda m: m[1] + html.escape(message) + m[2], page, count=1)
(ROOT / '审片.html').write_text(page, encoding='utf-8', newline='\n')
print('Saved', published_count, 'public versions; X event', incident['event_id'])

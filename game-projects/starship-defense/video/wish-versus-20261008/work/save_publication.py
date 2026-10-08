"""Persist observed platform results without replacing other episodes or uploads."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

TASK = '01a11a88-91c9-7123-bf83-bbbe6ed5b564-wish-video-02'
EPISODE = 'wish-versus-20261008'
ROOTS = [Path(__file__).resolve().parents[1], Path('D:/project/toolbasecamp-artifacts/wish-versus-20261008-codex-multiplatform')]
STATE = Path('C:/Users/37818/.claude/state')
KEYS = {'youtube': '7366c2ad3af6da91', 'douyin': '72b53d74f2e7d06c', 'bilibili': hashlib.sha256(b'16214353').hexdigest()[:16]}
ACCOUNTS = {'youtube': 'UCha4DVE3db0P1eJvu4qsLJg', 'douyin': '84261875244', 'bilibili': '16214353'}

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)

p = argparse.ArgumentParser()
p.add_argument('platform', choices=KEYS)
p.add_argument('status')
p.add_argument('--id')
p.add_argument('--url')
p.add_argument('--extra-file', type=Path)
a = p.parse_args()
lock = STATE / ('bili-activities/account-write.lock' if a.platform == 'bilibili' else f'game-video/locks/{a.platform}-{KEYS[a.platform]}.lock')
assert read(lock / 'owner.json')['task_id'] == TASK, 'This task must own the account lock'
now = datetime.now(timezone.utc).isoformat()
variant = a.platform + '-zh'
manifest = read(ROOTS[0] / 'work/publish' / variant / 'publish.json')
entry = {'episode_id': EPISODE, 'variant_id': variant, 'task_id': TASK,
         'account_id': ACCOUNTS[a.platform], 'status': a.status,
         'video_sha256': manifest['video_sha256'], 'human_review': manifest['human_review'],
         'last_observed_at': now}
if a.id:
    entry['platform_id'] = a.id
if a.url:
    entry['public_url'] = a.url
if a.status == 'published':
    entry['public_verified_at'] = now
if a.extra_file:
    entry.update(read(a.extra_file))
ledger = STATE / f'game-video/publications/{a.platform}-{KEYS[a.platform]}.json'
shared = read(ledger) if ledger.exists() else {'platform': a.platform, 'account_id': ACCOUNTS[a.platform], 'records': []}
matches = [v for v in shared['records'] if v.get('episode_id') == EPISODE and v.get('variant_id') == variant]
assert len(matches) <= 1, 'Resolve duplicate records before writing'
if matches:
    matches[0].update(entry)
else:
    shared['records'].append(entry)
write(ledger, shared)
for root in ROOTS:
    result_path = root / 'work/publication-result.json'
    result = read(result_path)
    result['platforms'][a.platform].update(entry)
    result['updated_at'] = now
    write(result_path, result)
    manifest_path = root / 'work/publish' / variant / 'publish.json'
    item = read(manifest_path)
    item['publication'] = result['platforms'][a.platform]
    item['ready_to_upload'] = False
    write(manifest_path, item)
print(json.dumps({'platform': a.platform, 'status': a.status, 'id': a.id, 'saved': True}))

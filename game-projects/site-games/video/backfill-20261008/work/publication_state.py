"""Checkpoint observed platform state; never performs uploads or edits remote content."""
import argparse
import datetime
import json
from pathlib import Path

import render_backfill as render

STATE = Path('C:/Users/37818/.claude/state/game-video')
WORK = render.WORK


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    render.write_json(path, value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['lock', 'record', 'release'])
    parser.add_argument('--variant', required=True)
    parser.add_argument('--status', choices=['uploading', 'draft', 'private', 'reviewing', 'published', 'blocked'])
    parser.add_argument('--platform-id')
    parser.add_argument('--public-url')
    parser.add_argument('--public-verified', action='store_true')
    parser.add_argument('--captions', nargs='*')
    parser.add_argument('--localizations', nargs='*')
    parser.add_argument('--release-lock', action='store_true')
    args = parser.parse_args()
    run = read(WORK / 'run-state.json')
    task = run['continuation_task_id']
    manifest_path = WORK / 'publish' / args.variant / 'publish.json'
    manifest = read(manifest_path)
    result_path = WORK / 'publication-result.json'
    result = read(result_path)
    platform = manifest['platform']
    account = result['platforms'][platform]
    key = account['account_key']
    account_id = account.get('channel_id') or account['account_id']
    lock = STATE / 'locks' / f'{platform}-{key}.lock'
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    acquired = False
    if lock.exists():
        if read(lock / 'owner.json')['task_id'] != task:
            raise RuntimeError('Account write lock belongs to another task')
    else:
        if args.mode == 'release':
            print('No own lock remains')
            return
        lock.mkdir()
        write(lock / 'owner.json', {'task_id': task, 'source': 'Codex', 'workspace': str(WORK.parents[4]),
                                   'target': f'{platform}:{account_id}', 'started_at': now,
                                   'operation': args.variant})
        acquired = True
    if args.mode == 'lock':
        print('Own account lock ready:', lock)
        return
    try:
        if args.mode == 'release':
            return
        if not args.status:
            raise RuntimeError('record requires an observed status')
        if args.status == 'published' and not (args.public_verified and args.public_url):
            raise RuntimeError('Public status requires an observed public URL and verification')
        # Reread after taking the target lock, preserving prior IDs and approval.
        manifest = read(manifest_path)
        result = read(result_path)
        assert manifest['human_review']['status'] == 'approved'
        if manifest.get('platform_id') and args.platform_id and manifest['platform_id'] != args.platform_id:
            raise RuntimeError('Refusing to replace an existing platform ID')
        ledger_path = STATE / 'publications' / f'{platform}-{key}.json'
        ledger = read(ledger_path) if ledger_path.exists() else {'platform': platform, 'account_id': account_id, 'records': []}
        existing = next((item for item in ledger['records'] if item['variant_id'] == args.variant), None)
        # Reject conflicting shared records before changing any local checkpoint.
        if existing is not None:
            if existing.get('platform_id') and args.platform_id and existing['platform_id'] != args.platform_id:
                raise RuntimeError('Shared ledger already contains a different platform ID')
            if existing['video_sha256'] != manifest['video_sha256']:
                raise RuntimeError('Shared ledger belongs to a different approved file')
        values = {'status': args.status, 'last_observed_at': now, 'account_id': account_id,
                  'uploaded': args.status in ['private', 'reviewing', 'published'], 'ready_to_upload': False}
        if args.platform_id:
            values['platform_id'] = args.platform_id
        if args.public_url:
            values['public_url'] = args.public_url
        if args.public_verified:
            values['public_verified_at'] = now
            values['visibility'] = 'public'
        elif args.status == 'private':
            values['visibility'] = 'private'
        if args.captions:
            values['subtitle_upload_status'] = {language: 'saved_on_platform' for language in args.captions}
        if args.localizations:
            values['localization_upload_status'] = {language: 'saved_on_platform' for language in args.localizations}
        manifest.update(values)
        write(manifest_path, manifest)
        for item in result['new_variants']:
            if item['variant_id'] == args.variant:
                item.update(values)
        account_rows = [item for item in result['new_variants'] if item['platform'] == platform]
        result['platforms'][platform]['status'] = 'published' if all(item['status'] == 'published' for item in account_rows) else 'in_progress'
        result['updated_at'] = now
        all_public = all(item['status'] == 'published' for item in result['new_variants'])
        result['release_status'] = 'videos_published_x_pending' if all_public else 'partially_uploaded'
        write(result_path, result)
        root = read(WORK / 'publish.json')
        for item in root['variants']:
            if item['variant_id'] == args.variant:
                item.update({'ready_to_upload': False, 'status': args.status, 'platform_id': manifest.get('platform_id')})
        root['phase'] = 'videos_published_x_pending' if all_public else 'publishing'
        write(WORK / 'publish.json', root)
        run = read(WORK / 'run-state.json')
        run['phase'] = root['phase']
        run['updated_at'] = now
        run['published'] = all_public
        write(WORK / 'run-state.json', run)
        if existing is None:
            existing = {'variant_id': args.variant, 'episode_id': manifest['episode_id'],
                        'video_sha256': manifest['video_sha256'], 'human_review': manifest['human_review'],
                        'task_id': task, 'created_at': now}
            ledger['records'].append(existing)
        existing.update(values)
        write(ledger_path, ledger)
        print(args.variant, args.status, manifest.get('platform_id'), 'checkpointed')
    finally:
        if args.mode == 'release' or args.release_lock or acquired:
            if read(lock / 'owner.json')['task_id'] == task:
                (lock / 'owner.json').unlink()
                lock.rmdir()


if __name__ == '__main__':
    main()

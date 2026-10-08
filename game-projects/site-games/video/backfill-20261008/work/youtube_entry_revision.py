"""Prepare and checkpoint the user-requested catalog-link edits; no remote calls."""
import argparse
import datetime
import json
from pathlib import Path

import render_backfill as render

WORK = render.WORK
PLAN = WORK / 'publish' / 'youtube-entry-revision.json'
CATALOG = 'https://www.zhengxiaohui.cn/games.html'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def revise(old, game, english):
    body = '\n'.join(line for line in old.splitlines() if not line.startswith(
        ('当前试玩（复制到浏览器打开）：', 'Current browser demo:')))
    if english:
        lead = 'Play my games: ' + CATALOG + '\nSelect ' + game + ' in the list; copy the URL into your browser if it is not clickable.'
    else:
        lead = '游戏试玩：' + CATALOG + '\n打开后选择“' + game + '”；如链接不可点击，请复制到浏览器打开。'
    return lead + '\n' + body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'checkpoint'])
    args = parser.parse_args()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if args.mode == 'prepare':
        if PLAN.exists():
            print('Existing revision retained')
            return
        rows = []
        for folder in sorted((WORK / 'publish').glob('*youtube*')):
            m = read(folder / 'publish.json')
            en = m['language'] == 'en'
            row = {'variant_id': m['variant_id'], 'platform_id': m['platform_id'], 'public_url': m['public_url'],
                   'old_description': m['description'], 'new_description': revise(m['description'], m['game_name'], en),
                   'status': 'pending'}
            if not en:
                old = m['localizations']['en']['description']
                row.update({'old_english_description': old, 'new_english_description': revise(old, m['game_name'], True),
                            'english_status': 'pending'})
            rows.append(row)
        render.write_json(PLAN, {'source': 'Codex', 'created_at': now, 'url': CATALOG,
                                'reason': 'User requested common catalog and visible short URL at start of description', 'rows': rows})
        print('Prepared four descriptions and three English translations')
        return
    # Only run after observed Studio saves and public-page checks under the account lock.
    plan = read(PLAN)
    assert all(row['status'] == 'public_verified' for row in plan['rows'])
    assert all(row.get('english_status', 'saved') == 'saved' for row in plan['rows'])
    result = read(WORK / 'publication-result.json')
    account = result['platforms']['youtube']
    state = Path('C:/Users/37818/.claude/state/game-video')
    owner = read(state / 'locks' / ('youtube-' + account['account_key'] + '.lock') / 'owner.json')
    assert owner['task_id'] == read(WORK / 'run-state.json')['continuation_task_id']
    ledger_path = state / 'publications' / ('youtube-' + account['account_key'] + '.json')
    ledger = read(ledger_path)
    for row in plan['rows']:
        path = WORK / 'publish' / row['variant_id'] / 'publish.json'
        m = read(path)
        assert m['platform_id'] == row['platform_id']
        m['description'] = row['new_description']
        revision = {'url': CATALOG, 'updated_at': row['saved_at'], 'public_verified_at': row['public_verified_at'],
                    'original_description_retained_in': '../youtube-entry-revision.json'}
        m['demo_entry_revision'] = revision
        txt = (path.parent / m['description_file']).resolve()
        content = txt.read_text(encoding='utf-8')
        content = content.replace(row['old_description'], row['new_description'])
        assert row['new_description'] in content
        txt.write_text(content, encoding='utf-8', newline='\n')
        if 'new_english_description' in row:
            m['localizations']['en']['description'] = row['new_english_description']
            txt = (path.parent / m['localization_file']).resolve()
            content = txt.read_text(encoding='utf-8').replace(row['old_english_description'], row['new_english_description'])
            assert row['new_english_description'] in content
            txt.write_text(content, encoding='utf-8', newline='\n')
        render.write_json(path, m)
        next(item for item in result['new_variants'] if item['variant_id'] == row['variant_id'])['demo_entry_revision'] = revision
        record = next(item for item in ledger['records'] if item['variant_id'] == row['variant_id'])
        record['demo_entry_revision'] = revision
        record['description'] = m['description']
        if 'localizations' in m:
            record['localizations'] = m['localizations']
    render.write_json(ledger_path, ledger)
    render.write_json(WORK / 'publication-result.json', result)
    print('Checkpointed four verified catalog-link edits; IDs and approved media unchanged')


if __name__ == '__main__':
    main()

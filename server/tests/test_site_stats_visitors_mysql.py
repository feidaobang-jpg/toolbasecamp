"""Verify real MySQL deduplication using connection-local temporary tables only."""
import os
import sys
from datetime import date
from pathlib import Path

import pymysql

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import site_stats as stats


def run():
    conn = pymysql.connect(
        host=os.environ.get('DB_HOST', '127.0.0.1'), port=int(os.environ.get('DB_PORT', '3306')),
        user=os.environ['DB_USER'], password=os.environ['DB_PASSWORD'], database=os.environ['DB_NAME'],
        charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor, autocommit=True,
    )

    class TempCursor:
        def execute(self, sql, args=None):
            if 'information_schema.COLUMNS' in sql:
                return cur.execute('SELECT 1 AS c')
            assert 'ALTER TABLE' not in sql
            return cur.execute(sql.replace('CREATE TABLE IF NOT EXISTS', 'CREATE TEMPORARY TABLE IF NOT EXISTS'), args)

        def fetchone(self):
            return cur.fetchone()

    class SharedConnection:
        def cursor(self):
            return conn.cursor()

        def close(self):
            pass

    first = '11111111-1111-4111-8111-111111111111'
    second = '22222222-2222-4222-8222-222222222222'
    day1, day2 = date(2026, 10, 5), date(2026, 10, 6)

    def hit(visitor=first, creds=None):
        return stats.record_hit(None, stats.HitBody(visitor_id=visitor), creds)

    try:
        with conn.cursor() as cur:
            stats.ensure_site_stats_tables(TempCursor())
            cur.execute("UPDATE site_stats_tracking SET active_visitors_since='2026-10-05 01:00:00'")
        stats.wire(SharedConnection, lambda: None)
        stats._resolve_region = lambda *args: 'cn'
        stats._business_snapshot = lambda *args: {}
        stats._today_cn = lambda: day1
        hit()
        hit()
        stats.record_event(None, stats.EventBody(name='game.play.toy.tank-3d', visitor_id=first), None)
        stats.record_event(None, stats.EventBody(name='game.play.site.mario-3d', visitor_id=second), None)
        stats._today_cn = lambda: day2
        hit()
        with conn.cursor() as cur:
            assert stats._read_totals(cur) == {'site_pv': 3, 'site_uv': 1}
            both = stats._active_visitor_snapshot(cur, day1, day2)
            assert both['total'] == 2 and both['partial'], both
            assert both['regions'] == {'cn': 1, 'overseas': 0, 'unknown': 1}, both
            assert both['since'] == '2026-10-05 09:00:00'
            today = stats._active_visitor_snapshot(cur, day2, day2)
            assert today['total'] == 1 and not today['partial'], today
            # Legacy click evidence remains usable without inventing page views.
            cur.execute('DELETE FROM site_stats_daily_visitors WHERE visitor_id=%s', (second,))
            assert stats._active_visitor_snapshot(cur, day1, day2)['total'] == 2
        overview = stats.stats_overview(days=2, date_str=None, _admin={})
        assert overview['day'] == {'pv': 3, 'uv': 2, 'new_uv': 1}, overview['day']
        today = stats.stats_overview(days=1, date_str='2026-10-06', _admin={})
        assert today['day'] == {'pv': 1, 'uv': 1, 'new_uv': 0}, today['day']
        stats._get_optional_user = lambda creds: {'role': 'admin'}
        stats._is_admin = lambda user: True
        assert hit(second, creds=object())['skipped']
        stats._client_ip = lambda request: '127.0.0.2'
        os.environ['STATS_EXCLUDE_IPS'] = '127.0.0.2'
        assert hit(second)['skipped']
        with conn.cursor() as cur:
            assert stats._active_visitor_snapshot(cur, day2, day2)['total'] == 1
            assert stats._read_totals(cur)['site_pv'] == 3
        print('PASS: returning visitors, cross-day/channel deduplication, historical evidence, '
              'coverage boundary, region sums, overview API, excluded admins/IPs, unchanged PV')
    finally:
        conn.close()


if __name__ == '__main__':
    run()

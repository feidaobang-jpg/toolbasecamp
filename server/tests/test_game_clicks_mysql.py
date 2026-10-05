"""Integration check using connection-local temporary tables, never live counters.

Run with the API's DB_* environment variables and Python dependencies.
"""
import os
import sys
from datetime import date
from pathlib import Path

import pymysql
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import site_stats as stats


def run():
    conn = pymysql.connect(
        host=os.environ.get("DB_HOST", "127.0.0.1"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"], charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor, autocommit=True,
    )

    class TempCursor:
        def execute(self, sql, args=None):
            # Temporary tables are new and already have the region column.
            if "information_schema.COLUMNS" in sql:
                return cur.execute("SELECT 1 AS c")
            assert "ALTER TABLE" not in sql
            return cur.execute(sql.replace(
                "CREATE TABLE IF NOT EXISTS", "CREATE TEMPORARY TABLE IF NOT EXISTS"
            ), args)

        def fetchone(self):
            return cur.fetchone()

    class SharedConnection:
        def cursor(self):
            return conn.cursor()

        def close(self):
            pass

    first = "11111111-1111-4111-8111-111111111111"
    second = "22222222-2222-4222-8222-222222222222"
    day1, day2 = date(2026, 10, 1), date(2026, 10, 2)

    def click(channel, game, visitor=first, creds=None):
        return stats.record_event(None, stats.EventBody(
            name=f"game.play.{channel}.{game}", visitor_id=visitor
        ), creds)

    try:
        with conn.cursor() as cur:
            stats.ensure_site_stats_tables(TempCursor())
        stats.wire(SharedConnection, lambda: None)
        stats._today_cn = lambda: day1
        click("toy", "tank-3d")
        click("toy", "tank-3d")
        click("toy", "tank-3d", second)
        click("site", "tank-3d")
        click("toy", "mario-3d")
        click("site", "mario-3d", None)
        click("site", "mario-3d", "invalid-id")
        stats._today_cn = lambda: day2
        click("toy", "tank-3d")
        stats._get_optional_user = lambda creds: {"role": "admin"}
        stats._is_admin = lambda user: user["role"] == "admin"
        assert click("toy", "tank-3d", creds=object())["skipped"]
        stats._client_ip = lambda request: "127.0.0.2"
        os.environ["STATS_EXCLUDE_IPS"] = "127.0.0.2"
        assert click("site", "tank-3d")["skipped"]
        stats._client_ip = None
        for channel, game in [("other", "tank-3d"), ("toy", "nonexistent")]:
            try:
                click(channel, game)
            except HTTPException as exc:
                assert exc.status_code == 400
            else:
                raise AssertionError("Invalid game/channel accepted")
        stats.record_event(None, stats.EventBody(name="page.games"), None)
        with conn.cursor() as cur:
            total = stats._game_click_snapshot(cur, day1, day2)
            assert total["totals"] == {
                "toy": {"clicks": 5, "visitors": 2},
                "site": {"clicks": 3, "visitors": 1},
            }, total
            games = {game["key"]: game for game in total["games"]}
            assert total["combined"] == {"clicks": 8, "visitors": 2}
            assert total["all_time"]["combined"] == total["combined"]
            assert total["all_time"]["from"] == day1.isoformat()
            assert games["tank-3d"]["combined"] == {"clicks": 5, "visitors": 2}
            assert games["mario-3d"]["combined"] == {"clicks": 3, "visitors": 1}
            assert games["tank-3d"]["toy"] == {"clicks": 4, "visitors": 2}
            assert games["mario-3d"]["site"] == {"clicks": 2, "visitors": 0}
            assert games["worms"]["toy"] == {"clicks": 0, "visitors": 0}
            assert stats._game_click_snapshot(cur, day2, day2)["totals"]["toy"] == {
                "clicks": 1, "visitors": 1,
            }
            cur.execute("SELECT event_name, hit_count FROM site_stats_events")
            assert cur.fetchall() == [{"event_name": "page.games", "hit_count": 1}]
        stats._today_cn = lambda: date(2026, 10, 3)
        click("site", "tank-3d", "33333333-3333-4333-8333-333333333333")
        with conn.cursor() as cur:
            historical = stats._game_click_snapshot(cur, day1, day1)
            assert historical["combined"] == {"clicks": 7, "visitors": 2}
            assert historical["all_time"]["combined"] == {"clicks": 9, "visitors": 3}
            assert historical["all_time"]["to"] == '2026-10-03'
            empty = stats._game_click_snapshot(cur, date(2026, 9, 1), date(2026, 9, 1))
            assert empty["combined"] == {"clicks": 0, "visitors": 0}
            assert empty["all_time"]["combined"] == historical["all_time"]["combined"]
        print("PASS: repeated/cross-game/cross-day visitor deduplication, separate channels, "
              "missing IDs, empty games, excluded admins/IPs, input validation and page counters")
    finally:
        conn.close()


if __name__ == "__main__":
    run()

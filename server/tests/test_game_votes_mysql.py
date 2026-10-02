"""Run with API DB_* environment variables and dependencies.

All writes use connection-local MySQL TEMPORARY tables that shadow the production
table names. Closing the test connection removes them; live ballots stay untouched.
"""
import os
import sys
from pathlib import Path

import pymysql
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import game_votes as votes


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
            # Both tables are created before the migration UPDATE can run.
            sql = sql.replace("CREATE TABLE IF NOT EXISTS", "CREATE TEMPORARY TABLE IF NOT EXISTS")
            return cur.execute(sql, args)

    class SharedConnection:
        def cursor(self):
            return conn.cursor()

        def close(self):
            pass

    def rejected(call, status):
        try:
            call()
        except HTTPException as error:
            assert error.status_code == status
        else:
            raise AssertionError("Request should have been rejected")

    first, second = "a" * 24, "b" * 24
    try:
        with conn.cursor() as cur:
            votes.ensure_game_votes_tables(TempCursor())
            cur.execute("INSERT INTO game_wishes (name, source, created_at) VALUES (%s, 'seed', %s)",
                        ("跳跳狐关卡编辑器", votes._now_utc()))
            retired_wish = cur.lastrowid
            for kind, target in [("favorite", "hop-fox-3d"), ("wishlist", f"w{retired_wish}")]:
                cur.execute("INSERT INTO game_vote_ballots (vote_type, target_key, device_id, created_at) VALUES (%s,%s,%s,%s)",
                            (kind, target, first, votes._now_utc()))
            votes.ensure_game_votes_tables(TempCursor())
        votes._get_conn = SharedConnection
        assert all(g["key"] != "hop-fox-3d" for g in votes.get_options()["favorites"])
        board = votes.get_board(limit=20, offset=0, sort="votes")
        assert board["totals"]["votes"] == 0 and board["wishlistTotal"] == 0
        mine = votes.get_my_votes(first)
        assert mine["remaining"]["favorite"] == 3 and mine["remaining"]["wishlist"] == 5
        rejected(lambda: votes.cast_vote(votes.VoteIn(device_id=first, vote_type="favorite", target="hop-fox-3d"), None), 400)
        rejected(lambda: votes.cast_vote(votes.VoteIn(device_id=first, vote_type="wishlist", target=f"w{retired_wish}"), None), 400)
        wish = votes.submit_wish(votes.WishIn(device_id=first, name="双人守城", note="建炮塔、选升级"), None)["item"]
        ballot = votes.VoteIn(device_id=second, vote_type="wishlist", target=wish["key"])
        votes.cast_vote(ballot, None)
        votes.cast_vote(ballot, None)
        assert votes.get_board(limit=20, offset=0, sort="votes")["wishlist"][0]["votes"] == 1
        assert votes.get_my_votes(first)["wishlist"] == []
        assert votes.get_my_votes(second)["wishlist"] == [wish["key"]]
        votes.cancel_vote(ballot)
        assert votes.get_my_votes(second)["remaining"]["wishlist"] == 5
        for i in range(23):
            votes.submit_wish(votes.WishIn(device_id=f"{i:024x}", name=f"关卡愿望{i:02d}", note="支持手机"), None)
        page1 = votes.get_board(limit=20, offset=0, sort="newest")
        page2 = votes.get_board(limit=20, offset=20, sort="newest")
        assert page1["wishlistTotal"] == 24
        assert len(page1["wishlist"]) == 20 and len(page2["wishlist"]) == 4
        assert not ({w["id"] for w in page1["wishlist"]} & {w["id"] for w in page2["wishlist"]})
        for game in votes.ORIGINAL_GAMES[:3]:
            votes.cast_vote(votes.VoteIn(device_id=first, vote_type="favorite", target=game["key"]), None)
        rejected(lambda: votes.cast_vote(votes.VoteIn(device_id=first, vote_type="favorite", target=votes.ORIGINAL_GAMES[3]["key"]), None), 429)
        print("PASS: retired options and wishes hidden; quotas restored; cross-user votes, duplicate votes, cancellation, limits and pagination")
    finally:
        conn.close()


if __name__ == "__main__":
    run()

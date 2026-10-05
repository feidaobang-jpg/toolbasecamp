"""Run with plain Python (no DB): python server/tests/test_game_catalog.py

Checks that vote/click candidates follow the games page (public/js/config.js gamesConfig)
instead of a hand-maintained list.
"""
import os
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import game_votes as votes

ROOT = Path(__file__).resolve().parents[2]


def run():
    text = (ROOT / "public" / "js" / "config.js").read_text(encoding="utf-8")
    games = votes.parse_games_config(text)
    keys = [g["key"] for g in games]
    block = votes._games_config_block(text)
    # Same slug rule as games-hub.js tracking: every html/game link on the page is a candidate.
    expected = []
    for url in re.findall(r"\burl:\s*'([^']+)'", block):
        hit = votes._GAME_URL_RE.search(url)
        if hit and hit.group(1).lower() not in expected:
            expected.append(hit.group(1).lower())
    assert keys == expected, (keys, expected)
    assert {"cadillacs-stage1-3d", "jackal-stage1-3d", "starship_defense", "tank-3d"} <= set(keys)
    assert all(g["titleKey"].startswith("tools.") for g in games)
    # toolsConfig links outside gamesConfig never leak in; retired pages stay out.
    assert "tank_battle" not in keys and "hop-fox-3d" not in keys

    sample = """
    const toolsConfig = { groups: [{ items: [{ titleKey: 'x.title', url: 'html/game/not_a_game.html' }] }] };
    const gamesConfig = {
        // don't trip on quotes or { braces } in comments
        groups: [
            { titleKey: 'g.a', items: [
                { titleKey: 'tools.newOne.title', url: 'html/game/new-one/index.html?v=3' },
                {
                    titleKey: "tools.multi.title",
                    url: "html/game/multi_line.html"
                },
                { titleKey: 'tools.dup.title', url: 'html/game/new-one/index.html' },
                { titleKey: 'tools.ext.title', url: 'https://example.com/x' }
            ] }
        ]
    };
    """
    parsed = votes.parse_games_config(sample)
    assert [g["key"] for g in parsed] == ["new-one", "multi_line"], parsed
    assert parsed[0] == {"key": "new-one", "url": "html/game/new-one/index.html?v=3",
                         "titleKey": "tools.newOne.title"}

    # Runtime reload: editing config.js changes the candidates without restarting the API.
    old_env = os.environ.get("TOOLBASECAMP_WEB_ROOT")
    with tempfile.TemporaryDirectory() as web:
        (Path(web) / "js").mkdir()
        cfg = Path(web) / "js" / "config.js"
        cfg.write_text(sample, encoding="utf-8")
        os.environ["TOOLBASECAMP_WEB_ROOT"] = web
        try:
            assert votes._original_keys() == ["multi_line", "new-one"]
            cfg.write_text(sample.replace("multi_line", "renamed"), encoding="utf-8")
            st = cfg.stat()
            os.utime(cfg, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))
            assert votes._original_keys() == ["new-one", "renamed"]
            cfg.write_text("const gamesConfig = broken", encoding="utf-8")
            assert votes.original_games() is votes._FALLBACK_GAMES
        finally:
            if old_env is None:
                os.environ.pop("TOOLBASECAMP_WEB_ROOT", None)
            else:
                os.environ["TOOLBASECAMP_WEB_ROOT"] = old_env
    print(f"PASS: {len(keys)} games follow gamesConfig; multi-line/comments/dedupe parsed; reload and fallback work")


if __name__ == "__main__":
    run()

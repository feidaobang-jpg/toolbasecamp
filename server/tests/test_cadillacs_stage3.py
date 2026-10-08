"""Third-stage rooms reject old clients and retain the selected stage."""
from coop_lobby import GAMES, game_config

def test_cadillacs_third_stage_is_retained():
    config = game_config("cadillacs", {"stage": 3, "area": 6})
    assert config["stage"] == 3
    assert config["area"] == 6
    assert GAMES["cadillacs"]["protocol"] == "cadillacs3d-v2"

def test_other_remakes_keep_their_current_stage_range():
    assert game_config("jackal", {"stage": 3})["stage"] == 2

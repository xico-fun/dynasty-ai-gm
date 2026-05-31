"""Sleeper API tools — fetches league, roster, and player data."""
import httpx
from langchain_core.tools import tool
from src.config import SLEEPER_USERNAME, SLEEPER_LEAGUE_ID

BASE_URL = "https://api.sleeper.app/v1"


def _get(path: str) -> dict:
    resp = httpx.get(f"{BASE_URL}{path}", timeout=10)
    resp.raise_for_status()
    return resp.json()


@tool
def get_my_roster() -> dict:
    """Return the current user's roster from their Sleeper dynasty league."""
    # Get all rosters in the league
    rosters = _get(f"/league/{SLEEPER_LEAGUE_ID}/rosters")
    # Get user ID from username
    user = _get(f"/user/{SLEEPER_USERNAME}")
    user_id = user["user_id"]
    # Match roster to user
    my_roster = next((r for r in rosters if r["owner_id"] == user_id), None)
    if not my_roster:
        raise ValueError(f"No roster found for user {SLEEPER_USERNAME}")
    return my_roster


@tool
def get_all_rosters() -> list:
    """Return all rosters in the league (used for trade target analysis)."""
    return _get(f"/league/{SLEEPER_LEAGUE_ID}/rosters")


@tool
def get_league_users() -> list:
    """Return all users/teams in the league."""
    return _get(f"/league/{SLEEPER_LEAGUE_ID}/users")


@tool
def get_league_info() -> dict:
    """Return league settings and metadata."""
    return _get(f"/league/{SLEEPER_LEAGUE_ID}")


@tool
def get_matchups(week: int) -> list:
    """Return matchup data for a given NFL week."""
    return _get(f"/league/{SLEEPER_LEAGUE_ID}/matchups/{week}")


@tool
def get_nfl_state() -> dict:
    """Return the current NFL state (season, week, etc.)."""
    return _get("/state/nfl")


@tool
def get_player_info(player_id: str) -> dict:
    """Return profile data for a single player by Sleeper player ID."""
    players = _get("/players/nfl")
    return players.get(player_id, {})


@tool
def get_trending_players(trend_type: str = "add", limit: int = 25) -> list:
    """Return trending adds or drops on the waiver wire. trend_type: 'add' or 'drop'."""
    return _get(f"/players/nfl/trending/{trend_type}?limit={limit}")

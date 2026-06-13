"""Sleeper API tools — fetches league, roster, and player data."""
import httpx
from langchain_core.tools import tool
from src.active_league import get_active_league
from src.tools import cache as _cache  # noqa: F401

BASE_URL = "https://api.sleeper.app/v1"

_players_cache: dict | None = None


def _get(path: str) -> dict:
    resp = httpx.get(f"{BASE_URL}{path}", timeout=30)
    resp.raise_for_status()
    return resp.json()


def _get_all_players() -> dict:
    """Fetch and cache the full Sleeper players database."""
    global _players_cache
    if _players_cache is None:
        _players_cache = _get("/players/nfl")
    return _players_cache


def _player_name(player_id: str, players: dict) -> str:
    p = players.get(str(player_id), {})
    if not p:
        return f"Unknown ({player_id})"
    first = p.get("first_name", "")
    last = p.get("last_name", "")
    pos = p.get("position", "")
    team = p.get("team", "FA")
    return f"{first} {last} ({pos}, {team})"


@tool
def get_my_roster() -> dict:
    """Return the current user's roster from their Sleeper dynasty league."""
    league = get_active_league()
    # Get all rosters in the league
    rosters = _get(f"/league/{league.league_id}/rosters")
    # Get user ID from username
    user = _get(f"/user/{league.username}")
    user_id = user["user_id"]
    # Match roster to user
    my_roster = next((r for r in rosters if r["owner_id"] == user_id), None)
    if not my_roster:
        raise ValueError(f"No roster found for user {league.username}")
    return my_roster


@tool
def get_all_rosters() -> list:
    """Return all rosters in the league (used for trade target analysis)."""
    return _get(f"/league/{get_active_league().league_id}/rosters")


@tool
def get_league_users() -> list:
    """Return all users/teams in the league."""
    return _get(f"/league/{get_active_league().league_id}/users")


@tool
def get_league_info() -> dict:
    """Return league settings and metadata."""
    return _get(f"/league/{get_active_league().league_id}")


@tool
def get_matchups(week: int) -> list:
    """Return matchup data for a given NFL week."""
    return _get(f"/league/{get_active_league().league_id}/matchups/{week}")


@tool
def get_nfl_state() -> dict:
    """Return the current NFL state (season, week, etc.)."""
    return _get("/state/nfl")


@tool
def get_player_info(player_id: str) -> dict:
    """Return profile data for a single player by Sleeper player ID."""
    return _get_all_players().get(str(player_id), {})


def _build_enriched_rosters() -> list:
    """Internal helper — builds enriched roster list, shared by both tools."""
    league_id = get_active_league().league_id

    # Cache keys are scoped per-league so multiple leagues never collide.
    rosters = _cache.get(f"rosters:{league_id}")
    if rosters is None:
        rosters = _get(f"/league/{league_id}/rosters")
        _cache.set(f"rosters:{league_id}", rosters)

    users = _cache.get(f"users:{league_id}")
    if users is None:
        users = _get(f"/league/{league_id}/users")
        _cache.set(f"users:{league_id}", users)

    players = _get_all_players()
    user_map = {u["user_id"]: u for u in users}

    enriched = []
    for roster in rosters:
        owner_id = roster.get("owner_id", "")
        user = user_map.get(owner_id, {})
        metadata = user.get("metadata", {})
        team_name = (
            metadata.get("team_name") or user.get("display_name", "Unknown")
        )
        starters = roster.get("starters") or []
        players_list = roster.get("players") or []
        enriched.append({
            "roster_id": roster["roster_id"],
            "owner_id": owner_id,
            "manager": user.get("display_name", "Unknown"),
            "username": user.get("username", ""),
            "team_name": team_name,
            "starters": [_player_name(p, players) for p in starters],
            "bench": [
                _player_name(p, players) for p in players_list
                if p not in starters
            ],
        })
    return enriched


@tool
def get_league_rosters_enriched() -> list:
    """
    Return all rosters fully resolved: manager name, team name, and every
    player's name/position/NFL team. Use this for any question about who
    is on each team or what position players are at.
    """
    return _build_enriched_rosters()


@tool
def get_my_roster_enriched() -> dict:
    """
    Return the current user's roster with all player names resolved.
    Includes starters and bench with name, position, and NFL team.
    """
    league = get_active_league()
    user = _get(f"/user/{league.username}")
    my_user_id = user["user_id"]
    all_enriched = _build_enriched_rosters()
    match = next(
        (r for r in all_enriched if r["owner_id"] == my_user_id),
        None,
    )
    if not match:
        raise ValueError(f"No roster found for user {league.username}")
    return match


@tool
def get_trending_players(trend_type: str = "add", limit: int = 25) -> list:
    """Return trending adds or drops. trend_type: 'add' or 'drop'."""
    return _get(f"/players/nfl/trending/{trend_type}?limit={limit}")

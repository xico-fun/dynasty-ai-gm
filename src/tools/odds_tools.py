"""Vegas odds and player prop tools via The Odds API."""
import httpx
from langchain_core.tools import tool
from src.config import ODDS_API_KEY

BASE_URL = "https://api.the-odds-api.com/v4"
NFL_SPORT = "americanfootball_nfl"


@tool
def get_nfl_game_odds() -> list:
    """Return current NFL game lines (spread, total, moneyline)."""
    url = f"{BASE_URL}/sports/{NFL_SPORT}/odds"
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": "spreads,totals,h2h",
        "oddsFormat": "american",
    }
    resp = httpx.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


@tool
def get_player_props(event_id: str, markets: str = "player_rush_yds,player_receptions,player_reception_yds,player_pass_yds,player_pass_tds") -> dict:
    """
    Return player prop lines for a specific game.
    event_id: the game ID from get_nfl_game_odds().
    markets: comma-separated prop market keys.
    """
    url = f"{BASE_URL}/sports/{NFL_SPORT}/events/{event_id}/odds"
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "us",
        "markets": markets,
        "oddsFormat": "american",
    }
    resp = httpx.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


@tool
def get_nfl_events() -> list:
    """Return upcoming NFL games/events (useful for matching teams to event IDs)."""
    url = f"{BASE_URL}/sports/{NFL_SPORT}/events"
    params = {"apiKey": ODDS_API_KEY}
    resp = httpx.get(url, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()

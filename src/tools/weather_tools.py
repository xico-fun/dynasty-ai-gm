"""Weather tools via Open-Meteo (no API key required)."""
import httpx
from langchain_core.tools import tool

# NFL stadium coordinates: {team_abbr: (lat, lon, is_dome)}
NFL_STADIUMS = {
    "ARI": (33.5277, -112.2626, True),   # State Farm Stadium
    "ATL": (33.7554, -84.4008, True),    # Mercedes-Benz Stadium
    "BAL": (39.2780, -76.6227, False),
    "BUF": (42.7738, -78.7869, False),
    "CAR": (35.2258, -80.8528, False),
    "CHI": (41.8623, -87.6167, False),
    "CIN": (39.0955, -84.5160, False),
    "CLE": (41.5061, -81.6995, False),
    "DAL": (32.7473, -97.0945, True),    # AT&T Stadium
    "DEN": (39.7439, -105.0201, False),
    "DET": (42.3400, -83.0456, True),    # Ford Field
    "GB":  (44.5013, -88.0622, False),
    "HOU": (29.6847, -95.4107, True),    # NRG Stadium
    "IND": (39.7601, -86.1639, True),    # Lucas Oil Stadium
    "JAX": (30.3239, -81.6373, False),
    "KC":  (39.0489, -94.4839, False),
    "LAC": (33.9535, -118.3392, True),   # SoFi Stadium
    "LAR": (33.9535, -118.3392, True),   # SoFi Stadium
    "LV":  (36.0909, -115.1833, True),   # Allegiant Stadium
    "MIA": (25.9580, -80.2389, False),
    "MIN": (44.9740, -93.2578, True),    # U.S. Bank Stadium
    "NE":  (42.0909, -71.2643, False),
    "NO":  (29.9511, -90.0812, True),    # Caesars Superdome
    "NYG": (40.8135, -74.0745, False),
    "NYJ": (40.8135, -74.0745, False),
    "PHI": (39.9008, -75.1675, False),
    "PIT": (40.4468, -80.0158, False),
    "SEA": (47.5952, -122.3316, False),
    "SF":  (37.4033, -121.9694, False),
    "TB":  (27.9759, -82.5033, False),
    "TEN": (36.1665, -86.7713, False),
    "WAS": (38.9076, -76.8645, False),
}


@tool
def get_game_weather(home_team: str, game_date: str) -> dict:
    """
    Get weather forecast for an NFL game.
    home_team: NFL team abbreviation (e.g. 'BUF', 'KC').
    game_date: ISO date string (e.g. '2025-09-14').
    Returns dome status and forecast if outdoors.
    """
    if home_team not in NFL_STADIUMS:
        return {"error": f"Unknown team abbreviation: {home_team}"}

    lat, lon, is_dome = NFL_STADIUMS[home_team]

    if is_dome:
        return {
            "home_team": home_team,
            "game_date": game_date,
            "is_dome": True,
            "note": "Indoor stadium — weather not a factor.",
        }

    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,"
        "windspeed_10m_max,weathercode"
        f"&start_date={game_date}&end_date={game_date}"
        "&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch"
        "&timezone=America/New_York"
    )
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    data = resp.json().get("daily", {})

    return {
        "home_team": home_team,
        "game_date": game_date,
        "is_dome": False,
        "temp_high_f": data.get("temperature_2m_max", [None])[0],
        "temp_low_f": data.get("temperature_2m_min", [None])[0],
        "precipitation_in": data.get("precipitation_sum", [None])[0],
        "wind_mph": data.get("windspeed_10m_max", [None])[0],
        "weather_code": data.get("weathercode", [None])[0],
    }

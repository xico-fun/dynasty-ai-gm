"""Matchup agent — start/sit recommendations for the current week."""
from langchain_anthropic import ChatAnthropic
from src.tools.sleeper_tools import (
    get_my_roster_enriched, get_matchups, get_nfl_state,
)
from src.tools.weather_tools import get_game_weather
from src.tools.odds_tools import (
    get_nfl_game_odds, get_player_props, get_nfl_events,
)
from src.config import ANTHROPIC_API_KEY
from src.league_context import LEAGUE_CONTEXT_PREFIX

SYSTEM_PROMPT = LEAGUE_CONTEXT_PREFIX + """You are an expert dynasty fantasy football analyst.
Your job is to provide start/sit recommendations for this week's matchup.

Consider the following factors:
1. NFL opponent matchup strength at each position
2. Game-day weather (wind, precipitation, temperature) for outdoor stadiums
3. Vegas player prop lines and implied team totals
4. Any relevant news or injury updates

Be concise but specific. Always cite your reasoning."""

TOOLS = [
    get_my_roster_enriched,
    get_matchups,
    get_nfl_state,
    get_game_weather,
    get_nfl_game_odds,
    get_player_props,
    get_nfl_events,
]


def build_matchup_agent():
    llm = ChatAnthropic(
        model="claude-opus-4-8",
        api_key=ANTHROPIC_API_KEY,
    ).bind_tools(TOOLS)
    return llm, SYSTEM_PROMPT, TOOLS

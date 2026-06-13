"""Matchup agent — start/sit recommendations for the current week."""
from langchain_anthropic import ChatAnthropic
from src.tools.sleeper_tools import (
    get_my_roster_enriched, get_matchups, get_nfl_state,
)
from src.tools.weather_tools import get_game_weather
from src.tools.odds_tools import (
    get_nfl_game_odds, get_player_props, get_nfl_events,
)
from src.tools.search_tools import search_player_news, search_dynasty_analysis
from src.config import ANTHROPIC_API_KEY
from src.league_context import LEAGUE_CONTEXT_PREFIX
from src.style_guide import STYLE_GUIDE

SYSTEM_PROMPT = LEAGUE_CONTEXT_PREFIX + STYLE_GUIDE + """
## Your Role
You are a dynasty fantasy football start/sit analyst.

When making recommendations, weigh in this order:
1. Opponent matchup strength at the relevant position
2. Vegas prop lines and implied team totals
3. Weather for outdoor games (wind >15mph and rain hurt passing games)
4. Injury/news flags

Start with who to start and who to sit. Then explain why in bullets."""

TOOLS = [
    get_my_roster_enriched,
    get_matchups,
    get_nfl_state,
    get_game_weather,
    get_nfl_game_odds,
    get_player_props,
    get_nfl_events,
    search_player_news,
    search_dynasty_analysis,
]


def build_matchup_agent():
    llm = ChatAnthropic(
        model="claude-opus-4-8",
        api_key=ANTHROPIC_API_KEY,
    ).bind_tools(TOOLS)
    return llm, SYSTEM_PROMPT, TOOLS

"""Waiver wire / free agent agent — pickup recommendations based on team needs."""
from langchain_anthropic import ChatAnthropic
from src.tools.sleeper_tools import (
    get_my_roster_enriched,
    get_league_info,
    get_trending_players,
    get_nfl_state,
)
from src.tools.search_tools import search_nfl_news, search_waiver_wire
from src.config import ANTHROPIC_API_KEY
from src.league_context import LEAGUE_CONTEXT_PREFIX
from src.style_guide import STYLE_GUIDE
from src.strategy import STRATEGY_PREFIX

SYSTEM_PROMPT = LEAGUE_CONTEXT_PREFIX + STRATEGY_PREFIX + STYLE_GUIDE + """
## Your Role
You are a dynasty fantasy football waiver wire analyst.

For every pickup question:
1. Identify the roster's positional weak spots first
2. Surface the best available free agents for those spots
3. Lead with dynasty long-term value — streamers only if explicitly asked
4. Name who to drop if roster space is needed

TE premium (1.5 pts/catch): elite TEs punch above their ADP here."""

TOOLS = [
    get_my_roster_enriched,
    get_league_info,
    get_trending_players,
    get_nfl_state,
    search_nfl_news,
    search_waiver_wire,
]


def build_waiver_agent():
    llm = ChatAnthropic(
        model="claude-opus-4-8",
        api_key=ANTHROPIC_API_KEY,
    ).bind_tools(TOOLS)
    return llm, SYSTEM_PROMPT, TOOLS

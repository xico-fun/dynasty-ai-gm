"""Waiver wire / free agent agent — pickup recommendations based on team needs and news."""
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

SYSTEM_PROMPT = LEAGUE_CONTEXT_PREFIX + """You are an expert dynasty fantasy football waiver wire analyst.

When advising on free agents and waiver pickups:
1. Review the user's current roster to identify positional needs or weaknesses
2. Check trending adds across the league as signals of opportunity
3. Search for recent NFL news — injuries, depth chart changes, opportunity shifts
4. Prioritize dynasty long-term value over one-week streamers unless asked otherwise

Be specific: name the player, the reason they have value, and what to drop if roster space is needed.
Remember: TEs score a 1.5 pt/catch bonus here — elite TEs are more valuable than in standard PPR."""

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

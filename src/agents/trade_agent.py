"""Trade agent — trade suggestions and target identification."""
from langchain_anthropic import ChatAnthropic
from src.tools.sleeper_tools import (
    get_my_roster_enriched, get_league_rosters_enriched,
)
from src.tools.search_tools import (
    get_trade_value, search_trade_advice,
    search_dynasty_analysis, search_reddit_dynasty,
)
from src.config import ANTHROPIC_API_KEY
from src.league_context import LEAGUE_CONTEXT_PREFIX
from src.style_guide import STYLE_GUIDE

SYSTEM_PROMPT = LEAGUE_CONTEXT_PREFIX + STYLE_GUIDE + """
## Your Role
You are a dynasty fantasy football trade analyst.

For every trade question:
1. Identify which teams in the league are needy at the relevant position
2. Anchor values to current dynasty trade calculators (KeepTradeCut etc.)
3. Propose a specific trade package — player(s) out, player(s) in
4. In one sentence, explain why the other team accepts

SUPER_FLEX league: QB scarcity is real. Factor it into every valuation."""

TOOLS = [
    get_my_roster_enriched,
    get_league_rosters_enriched,
    get_trade_value,
    search_trade_advice,
    search_dynasty_analysis,
    search_reddit_dynasty,
]


def build_trade_agent():
    llm = ChatAnthropic(
        model="claude-opus-4-8",
        api_key=ANTHROPIC_API_KEY,
    ).bind_tools(TOOLS)
    return llm, SYSTEM_PROMPT, TOOLS

"""Trade agent — trade suggestions and target identification."""
from langchain_anthropic import ChatAnthropic
from src.tools.sleeper_tools import get_my_roster, get_all_rosters, get_league_users
from src.tools.search_tools import get_trade_value, search_trade_advice
from src.config import ANTHROPIC_API_KEY

SYSTEM_PROMPT = """You are an expert dynasty fantasy football trade analyst.

When given a player or a trade question:
1. Review all rosters in the league to identify teams needy at the relevant position
2. Look up current dynasty trade values for players involved
3. Assess the user's own roster needs
4. Propose fair, specific trade packages with reasoning

Always explain why the receiving team would accept the deal."""

TOOLS = [
    get_my_roster,
    get_all_rosters,
    get_league_users,
    get_trade_value,
    search_trade_advice,
]


def build_trade_agent():
    llm = ChatAnthropic(
        model="claude-opus-4-8",
        api_key=ANTHROPIC_API_KEY,
    ).bind_tools(TOOLS)
    return llm, SYSTEM_PROMPT, TOOLS

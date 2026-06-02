"""Tavily search tools — targeted at dynasty fantasy football sources."""
from langchain_tavily import TavilySearch
from langchain_core.tools import tool
from src.config import TAVILY_API_KEY
import os

os.environ["TAVILY_API_KEY"] = TAVILY_API_KEY

# News sources: injuries, depth charts, beat reporter updates
_news_search = TavilySearch(
    max_results=4,
    topic="news",
    include_domains=[
        "rotowire.com",
        "fantasypros.com",
        "fantasypoints.com",
        "nfl.com",
        "espn.com",
    ],
)

# Dynasty analysis: trade values, rankings, long-term outlooks
_dynasty_search = TavilySearch(
    max_results=4,
    include_domains=[
        "fantasypros.com",
        "fantasypoints.com",
        "dynastyleaguefootball.com",
        "dynastynerds.com",
        "rotowire.com",
    ],
)

# Community chatter: Reddit dynasty discussions
_reddit_search = TavilySearch(
    max_results=3,
    include_domains=["reddit.com"],
)

# Trade values: KeepTradeCut and similar calculators
_trade_value_search = TavilySearch(
    max_results=3,
    include_domains=[
        "keeptradecut.com",
        "dynastyprocess.com",
        "fantasypoints.com",
        "fantasypros.com",
    ],
)


@tool
def search_player_news(player_name: str) -> list:
    """
    Search for the latest news on a specific player — injuries, depth chart
    changes, snap counts, targets, and beat reporter updates.
    """
    return _news_search.invoke(
        f"{player_name} NFL fantasy football 2026 injury news update"
    )


@tool
def search_waiver_pickups(position: str, context: str = "") -> list:
    """
    Search for the best available waiver wire pickups at a given position.
    position: e.g. 'WR', 'RB', 'TE', 'QB'.
    context: optional extra context like 'handcuff' or 'rookie'.
    """
    q = f"dynasty fantasy football waiver wire {position} pickups adds 2026"
    if context:
        q += f" {context}"
    return _dynasty_search.invoke(q)


@tool
def search_dynasty_analysis(query: str) -> list:
    """
    Search dynasty fantasy football sites for analysis, rankings, and
    expert opinion on a player, position group, or trend.
    """
    return _dynasty_search.invoke(
        f"dynasty fantasy football {query} 2026"
    )


@tool
def search_reddit_dynasty(query: str) -> list:
    """
    Search Reddit (r/dynastyff, r/fantasyfootball) for community discussion
    on a player, trade, or waiver decision.
    """
    return _reddit_search.invoke(
        f"r/DynastyFF r/fantasyfootball {query} 2026"
    )


@tool
def get_trade_value(player_name: str) -> list:
    """
    Look up a player's current dynasty trade value on KeepTradeCut
    and other dynasty trade calculators.
    """
    return _trade_value_search.invoke(
        f"{player_name} dynasty trade value 2026 keeptradecut"
    )


@tool
def search_trade_advice(query: str) -> list:
    """
    Search for dynasty trade advice, buy/sell analysis, or trade package
    suggestions for a specific player or situation.
    """
    return _dynasty_search.invoke(
        f"dynasty trade {query} buy sell value 2026"
    )

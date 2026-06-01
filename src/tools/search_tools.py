"""Tavily search tools for news, waiver intel, and trade values."""
from langchain_tavily import TavilySearch
from langchain_core.tools import tool
from src.config import TAVILY_API_KEY
import os

os.environ["TAVILY_API_KEY"] = TAVILY_API_KEY

_search = TavilySearch(max_results=5)


@tool
def search_nfl_news(query: str) -> list:
    """Search for recent NFL news relevant to fantasy (injuries, depth chart changes, etc.)."""
    return _search.invoke(f"NFL fantasy football {query} site:rotowire.com OR site:fantasypros.com OR site:nfl.com")


@tool
def search_waiver_wire(position: str, week: str = "") -> list:
    """Search for waiver wire pickup recommendations for a given position."""
    q = f"dynasty fantasy football waiver wire pickups {position}"
    if week:
        q += f" week {week}"
    return _search.invoke(q)


@tool
def get_trade_value(player_name: str) -> list:
    """Look up a player's dynasty trade value on KeepTradeCut or similar sites."""
    return _search.invoke(
        f"{player_name} dynasty trade value keeptradecut 2025"
    )


@tool
def search_trade_advice(query: str) -> list:
    """Search for general dynasty trade advice or analysis."""
    return _search.invoke(f"dynasty fantasy football trade {query}")

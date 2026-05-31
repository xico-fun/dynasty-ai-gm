"""
LangGraph definition for the dynasty AI GM.

The graph routes user questions to the appropriate specialist agent:
  - matchup  → start/sit, weather, props
  - trade    → trade targets, values, offers
  - waiver   → free agent pickups, news
  - general  → catch-all for anything else
"""
from typing import Annotated, Literal
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

from src.agents.matchup_agent import build_matchup_agent
from src.agents.trade_agent import build_trade_agent
from src.agents.waiver_agent import build_waiver_agent
from src.config import ANTHROPIC_API_KEY


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class DynastyState(TypedDict):
    messages: Annotated[list, add_messages]
    agent: str  # which specialist is active


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

ROUTER_SYSTEM = """You are a router for a dynasty fantasy football assistant.
Classify the user's request into exactly one of these categories:
- matchup: start/sit decisions, weather, player props, weekly lineup
- trade: trade offers, trade values, who to target, who to sell
- waiver: free agents, waiver wire, pickups, drops, injury news
- general: anything else

Respond with ONLY the category name, nothing else."""


def route_question(state: DynastyState) -> DynastyState:
    router_llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
    )
    last_human = next(
        (
            m.content for m in reversed(state["messages"])
            if isinstance(m, HumanMessage)
        ),
        "",
    )
    response = router_llm.invoke([
        SystemMessage(content=ROUTER_SYSTEM),
        HumanMessage(content=last_human),
    ])
    agent = response.content.strip().lower()
    if agent not in ("matchup", "trade", "waiver"):
        agent = "general"
    return {**state, "agent": agent}


def pick_next(
    state: DynastyState,
) -> Literal["matchup", "trade", "waiver", "general"]:
    return state["agent"]


# ---------------------------------------------------------------------------
# Agent nodes
# ---------------------------------------------------------------------------

def _make_agent_node(llm_with_tools, system_prompt: str):
    """Return a node function that calls the LLM with bound tools."""
    def node(state: DynastyState) -> DynastyState:
        messages = [SystemMessage(content=system_prompt)] + state["messages"]
        response = llm_with_tools.invoke(messages)
        return {**state, "messages": [response]}
    return node


def _should_continue(state: DynastyState) -> Literal["tools", "__end__"]:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return "__end__"


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------

def build_graph():
    matchup_llm, matchup_prompt, matchup_tools = build_matchup_agent()
    trade_llm, trade_prompt, trade_tools = build_trade_agent()
    waiver_llm, waiver_prompt, waiver_tools = build_waiver_agent()

    from src.tools.sleeper_tools import (
        get_my_roster, get_all_rosters, get_league_users, get_league_info,
        get_nfl_state,
    )
    general_tools = [
        get_my_roster, get_all_rosters, get_league_users,
        get_league_info, get_nfl_state,
    ]
    general_llm = ChatAnthropic(
        model="claude-opus-4-8", api_key=ANTHROPIC_API_KEY,
    ).bind_tools(general_tools)

    combined = matchup_tools + trade_tools + waiver_tools + general_tools
    all_tools: list[BaseTool] = list({t.name: t for t in combined}.values())
    tool_node = ToolNode(all_tools)

    def general_node(state: DynastyState) -> DynastyState:
        system = "You are a helpful dynasty fantasy football assistant."
        messages = [SystemMessage(content=system), *state["messages"]]
        response = general_llm.invoke(messages)
        return {**state, "messages": [response]}

    sg = StateGraph(DynastyState)

    sg.add_node("router", route_question)
    sg.add_node("matchup", _make_agent_node(matchup_llm, matchup_prompt))
    sg.add_node("trade", _make_agent_node(trade_llm, trade_prompt))
    sg.add_node("waiver", _make_agent_node(waiver_llm, waiver_prompt))
    sg.add_node("general", general_node)
    sg.add_node("tools", tool_node)

    sg.add_edge(START, "router")
    sg.add_conditional_edges("router", pick_next, {
        "matchup": "matchup",
        "trade": "trade",
        "waiver": "waiver",
        "general": "general",
    })

    for agent_name in ("matchup", "trade", "waiver", "general"):
        sg.add_conditional_edges(agent_name, _should_continue, {
            "tools": "tools",
            "__end__": END,
        })

    # Route tools back to whichever specialist agent is active
    sg.add_conditional_edges("tools", lambda s: s["agent"], {
        "matchup": "matchup",
        "trade": "trade",
        "waiver": "waiver",
        "general": "general",
    })

    return sg.compile()


graph = build_graph()

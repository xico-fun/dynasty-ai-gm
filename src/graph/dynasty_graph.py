"""
LangGraph definition for the dynasty AI GM.

Simple queries route directly to one specialist:
  - matchup  → start/sit, weather, props
  - trade    → trade targets, values, offers
  - waiver   → free agent pickups, news
  - general  → catch-all

Complex multi-topic queries go through an orchestrator that builds a
sequential plan (e.g. [matchup, waiver]) and runs each specialist in
order, passing the full conversation context between them.
"""
import json
import re
from typing import Annotated, Literal
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from typing_extensions import TypedDict

from src.agents.matchup_agent import build_matchup_agent
from src.agents.trade_agent import build_trade_agent
from src.agents.waiver_agent import build_waiver_agent
from src.config import ANTHROPIC_API_KEY
from src.league_context import LEAGUE_CONTEXT_PREFIX

SPECIALISTS = ("matchup", "trade", "waiver", "general")

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


class DynastyState(TypedDict):
    messages: Annotated[list, add_messages]
    agent: str       # currently active specialist
    plan: list       # ordered list of specialists to run
    plan_index: int  # current step; len(plan) signals "done"


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

ROUTER_SYSTEM = """You are a router for a dynasty fantasy football assistant.
Classify the user's request into exactly one of these categories:
- matchup: start/sit decisions, weather, player props, weekly lineup
- trade: trade offers, trade values, who to target, who to sell
- waiver: free agents, waiver wire, pickups, drops, injury news
- general: anything else (roster questions, league info, etc.)
- complex: questions that clearly span MULTIPLE topics, e.g. "review my \
lineup AND check the waiver wire", "audit my team and suggest trades AND \
pickups", "full team review"

Respond with ONLY the category name, nothing else."""


def route_question(state: DynastyState) -> dict:
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
    if agent == "complex":
        return {"agent": "orchestrator", "plan": [], "plan_index": 0}
    if agent not in SPECIALISTS:
        agent = "general"
    return {"agent": agent, "plan": [agent], "plan_index": 0}


def pick_next(
    state: DynastyState,
) -> Literal["matchup", "trade", "waiver", "general", "orchestrator"]:
    return state["agent"]


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

ORCHESTRATOR_SYSTEM = LEAGUE_CONTEXT_PREFIX + """You are the orchestrator \
for a dynasty fantasy football assistant.

Analyze the user's question and decide which specialists to run in order.

Available specialists:
- matchup: lineup analysis, start/sit, weather, player props
- trade:   trade values, targets, and offers
- waiver:  free agent and waiver wire pickups

Ordering rules (when multiple are needed):
- matchup before waiver  (know which spots are weak before seeking upgrades)
- matchup before trade   (know your lineup before evaluating a trade)
- waiver before trade    (know what's free before deciding to trade for it)

Return ONLY valid JSON — no other text:
{"plan": ["agent1", "agent2"], "intro": "one sentence for the user"}
"""


def orchestrator_node(state: DynastyState) -> dict:
    llm = ChatAnthropic(model="claude-opus-4-8", api_key=ANTHROPIC_API_KEY)
    last_human = next(
        (
            m.content for m in reversed(state["messages"])
            if isinstance(m, HumanMessage)
        ),
        "",
    )
    response = llm.invoke([
        SystemMessage(content=ORCHESTRATOR_SYSTEM),
        HumanMessage(content=last_human),
    ])
    try:
        raw = response.content.strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        data = json.loads(match.group() if match else raw)
        plan = [a for a in data.get("plan", []) if a in SPECIALISTS]
        intro = data.get("intro", "Let me work through this step by step.")
    except (json.JSONDecodeError, AttributeError, ValueError):
        plan = ["general"]
        intro = "Let me look into that for you."

    if not plan:
        plan = ["general"]

    return {
        "plan": plan,
        "plan_index": 0,
        "agent": plan[0],
    }


# ---------------------------------------------------------------------------
# Agent nodes
# ---------------------------------------------------------------------------

def _make_agent_node(llm_with_tools, system_prompt: str):
    def node(state: DynastyState) -> dict:
        messages = [SystemMessage(content=system_prompt)] + state["messages"]
        response = llm_with_tools.invoke(messages)
        return {"messages": [response]}
    return node


def _should_continue(
    state: DynastyState,
) -> Literal["tools", "plan_advance"]:
    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return "plan_advance"


# ---------------------------------------------------------------------------
# Plan advance
# ---------------------------------------------------------------------------

def plan_advance(state: DynastyState) -> dict:
    """Move to the next step in the plan, or mark the plan as complete."""
    next_index = state["plan_index"] + 1
    if next_index < len(state["plan"]):
        next_agent = state["plan"][next_index]
        current_agent = state["plan"][state["plan_index"]]
        # Anthropic requires conversations to end with a HumanMessage.
        # This handoff bridges the two specialists and satisfies that constraint.
        handoff = HumanMessage(
            content=(
                f"The {current_agent} analysis above is complete. "
                f"Now please provide your {next_agent} analysis, "
                "taking the findings above into account."
            )
        )
        return {
            "messages": [handoff],
            "plan_index": next_index,
            "agent": next_agent,
        }
    # Sentinel: plan_index == len(plan) means we're done
    return {"plan_index": len(state["plan"])}


def should_advance_or_end(
    state: DynastyState,
) -> Literal["matchup", "trade", "waiver", "general", "__end__"]:
    """After plan_advance updates state, decide whether to run next agent."""
    if state["plan_index"] < len(state["plan"]):
        agent = state["plan"][state["plan_index"]]
        if agent in SPECIALISTS:
            return agent
    return "__end__"


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------

def build_graph():
    matchup_llm, matchup_prompt, matchup_tools = build_matchup_agent()
    trade_llm, trade_prompt, trade_tools = build_trade_agent()
    waiver_llm, waiver_prompt, waiver_tools = build_waiver_agent()

    from src.tools.sleeper_tools import (
        get_my_roster_enriched, get_league_rosters_enriched,
        get_league_info, get_nfl_state,
    )
    general_tools = [
        get_my_roster_enriched, get_league_rosters_enriched,
        get_league_info, get_nfl_state,
    ]
    general_llm = ChatAnthropic(
        model="claude-opus-4-8", api_key=ANTHROPIC_API_KEY,
    ).bind_tools(general_tools)

    combined = matchup_tools + trade_tools + waiver_tools + general_tools
    all_tools: list[BaseTool] = list(
        {t.name: t for t in combined}.values()
    )
    tool_node = ToolNode(all_tools)

    def general_node(state: DynastyState) -> dict:
        system = LEAGUE_CONTEXT_PREFIX + (
            "You are a helpful dynasty fantasy football assistant."
        )
        messages = [SystemMessage(content=system), *state["messages"]]
        response = general_llm.invoke(messages)
        return {"messages": [response]}

    sg = StateGraph(DynastyState)

    # Nodes
    sg.add_node("router", route_question)
    sg.add_node("orchestrator", orchestrator_node)
    sg.add_node("matchup", _make_agent_node(matchup_llm, matchup_prompt))
    sg.add_node("trade", _make_agent_node(trade_llm, trade_prompt))
    sg.add_node("waiver", _make_agent_node(waiver_llm, waiver_prompt))
    sg.add_node("general", general_node)
    sg.add_node("tools", tool_node)
    sg.add_node("plan_advance", plan_advance)

    # Entry
    sg.add_edge(START, "router")

    # Router → first node (specialist or orchestrator)
    sg.add_conditional_edges("router", pick_next, {
        "matchup": "matchup",
        "trade": "trade",
        "waiver": "waiver",
        "general": "general",
        "orchestrator": "orchestrator",
    })

    # Orchestrator → first specialist in plan
    sg.add_conditional_edges("orchestrator", pick_next, {
        "matchup": "matchup",
        "trade": "trade",
        "waiver": "waiver",
        "general": "general",
    })

    # Each specialist: call tools if needed, else advance plan
    for name in SPECIALISTS:
        sg.add_conditional_edges(name, _should_continue, {
            "tools": "tools",
            "plan_advance": "plan_advance",
        })

    # Tools → back to whichever specialist is active
    sg.add_conditional_edges("tools", lambda s: s["agent"], {
        "matchup": "matchup",
        "trade": "trade",
        "waiver": "waiver",
        "general": "general",
    })

    # Plan advance → next specialist or done
    sg.add_conditional_edges("plan_advance", should_advance_or_end, {
        "matchup": "matchup",
        "trade": "trade",
        "waiver": "waiver",
        "general": "general",
        "__end__": END,
    })

    return sg.compile(checkpointer=MemorySaver())


graph = build_graph()

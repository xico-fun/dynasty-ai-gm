"""Trade finder — proposals, recommendations, and value summaries."""
import json
import re
from datetime import datetime

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import (
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from src.config import ANTHROPIC_API_KEY
from src.tools.search_tools import (
    get_trade_value,
    search_dynasty_analysis,
)
from src.strategy import STRATEGY_PREFIX
from src.untouchables import get_untouchables_constraint
from src.runtime_context import get_runtime_context

_RESEARCH_SYSTEM = (
    "You are a dynasty fantasy football trade analyst. "
    "Look up the current KTC dynasty trade values for the players "
    "being offered. Use get_trade_value for each offered player. "
    "When done researching, stop calling tools — a follow-up will "
    "ask you to build the proposals."
)

_WRITE_SYSTEM = """\
You are a dynasty fantasy football trade analyst building trade
proposals for {my_team}.

{untouchables}

Output ONLY a valid JSON object. Start with {{ and end with }}.

Format:
{{
  "proposals": [
    {{
      "team": "Team Name",
      "return_players": ["Player Name (POS, NFL Team)"],
      "return_picks": ["2027 1st Round Pick"],
      "rationale": "2 sentences — why they want the offered assets, \
and what the return does for {my_team}."
    }}
  ]
}}

Rules:
- Exactly 3 proposals, each naming a real team from the roster list
- Return packages MUST be grounded in the KTC values you researched —
  do not invent or estimate values from training data alone
- HARD RULE: NEVER include {current_year} picks — the {current_year}
  dynasty draft has already occurred. Earliest picks are {next_year}.
- Picks format: "YEAR Xth Round Pick" (e.g. "2027 1st Round Pick")
- If no picks in return, use empty array []
- Do not include the same team more than once"""

_REC_RESEARCH_SYSTEM = (
    "You are a dynasty fantasy football analyst. Research the current "
    "trade market and dynasty outlook for the listed players. Use "
    "get_trade_value for KTC values and search_dynasty_analysis for "
    "sell-high, buy-low, or dynasty trend analysis. "
    "When done, stop calling tools."
)

_REC_WRITE_SYSTEM = """\
You are a dynasty fantasy football analyst building trade
recommendations for {{my_team}}.

{{untouchables}}

Based on the research above, identify the 3 best trade opportunities.
Consider: sell-high windows, depth surplus, aging veterans,
positional imbalances.

Output ONLY a valid JSON object. Start with {{ and end with }}.

Format:
{{{{
  "recommendations": [
    {{{{
      "sell_player": "Player Name",
      "sell_player_position": "RB",
      "get_back": "2027 1st Round Pick + 2027 2nd Round Pick",
      "rationale": "2 sentences based on current market — why to sell \
now, and what the return buys the team."
    }}}}
  ]
}}}}

Rules:
- Exactly 3 recommendations
- HARD RULE: NEVER include {current_year} picks in any recommendation.
  The {current_year} dynasty rookie draft has already occurred. The
  earliest available picks are {next_year} picks. Any {current_year}
  pick in a get_back is wrong.
- Elite players (top-5 at position) return elite packages — an elite RB1
  or WR1 commands at minimum two premium 1st round picks or a star player
  plus a 1st. Do not lowball top assets.
- If the return includes multiple picks from the same round, consolidate:
  say "two 2027 1st Round Picks" not "2027 1st Round Pick + 2027 1st Round Pick"
- ONLY recommend selling players you found real value data for in research
- rationale must reference specific market context (age, value trend,
  roster fit) from your research"""


def generate_trade_proposals(
    offered_players: list[dict],
    offered_picks: list[str],
    my_team: str,
    my_starters: list[dict],
    my_bench: list[dict],
    league_rosters: list[dict],
) -> dict:
    """
    Phase 1: Research KTC values for offered players.
    Phase 2: Forced JSON — 3 trade proposals.
    Returns {"proposals": [...]}
    """
    def fmt(players: list[dict]) -> str:
        return ", ".join(
            f"{p['name']} ({p['position']}, {p.get('team', 'FA')})"
            for p in players
        ) or "none"

    offered_str = ""
    if offered_players:
        offered_str += "Players: " + fmt(offered_players)
    if offered_picks:
        picks_str = ", ".join(offered_picks)
        offered_str += (
            ("\nPicks: " if offered_str else "Picks: ") + picks_str
        )

    positions_offered = list({p["position"] for p in offered_players})

    roster_lines = []
    for r in league_rosters:
        if r.get("team_name") == my_team:
            continue
        top = r.get("players", [])[:8]
        roster_lines.append(
            f"- {r['team_name']}: "
            + ", ".join(
                f"{p['name']} ({p['position']})" for p in top
            )
        )

    context = (
        f"My team: {my_team}\n"
        f"I'm offering: {offered_str}\n"
        "Positions offered: "
        f"{', '.join(positions_offered) if positions_offered else 'picks only'}\n\n"
        f"My full roster:\n"
        f"  Starters: {fmt(my_starters)}\n"
        f"  Bench: {fmt(my_bench[:10])}\n\n"
        "Other teams in my league:\n"
        + "\n".join(roster_lines[:10])
    )

    llm_researcher = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=1024,
    ).bind_tools([get_trade_value, search_dynasty_analysis])

    messages: list = [
        SystemMessage(content=_RESEARCH_SYSTEM),
        HumanMessage(
            content=(
                f"{get_runtime_context()}{STRATEGY_PREFIX}\n\n{context}\n\n"
                "Search KTC values and dynasty analysis for each "
                "offered player before building proposals."
            )
        ),
    ]

    for _ in range(8):
        response = llm_researcher.invoke(messages)
        messages.append(response)
        if not response.tool_calls:
            break
        for call in response.tool_calls:
            fn = call["name"]
            if fn in ("get_trade_value", "search_dynasty_analysis"):
                try:
                    if fn == "get_trade_value":
                        result = get_trade_value.invoke(call["args"])
                    else:
                        result = search_dynasty_analysis.invoke(
                            call["args"]
                        )
                except Exception:
                    result = "No results found."
                messages.append(
                    ToolMessage(
                        content=str(result),
                        tool_call_id=call["id"],
                    )
                )

    messages.append(HumanMessage(
        content="Using your research, build 3 proposals. "
                "Output ONLY the JSON object."
    ))

    llm_writer = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=900,
    )

    _year = datetime.now().year
    write_system = _WRITE_SYSTEM.format(
        my_team=my_team,
        untouchables=get_untouchables_constraint(),
        current_year=_year,
        next_year=_year + 1,
    )
    final = llm_writer.invoke(
        [SystemMessage(content=write_system)] + messages[1:]
    )
    return _parse(final.content, "proposals")


def generate_trade_recommendations(
    my_team: str,
    my_starters: list[dict],
    my_bench: list[dict],
    record: str,
) -> dict:
    """
    Phase 1: Research KTC values + dynasty analysis for key starters.
    Phase 2: Forced JSON — 3 trade recommendations.
    Returns {"recommendations": [...]}
    """
    def fmt(players: list[dict]) -> str:
        return ", ".join(
            f"{p['name']} ({p['position']})" for p in players
        ) or "none"

    skill = {"QB", "RB", "WR", "TE"}
    key_players = [p for p in my_starters if p["position"] in skill][:5]

    context = (
        f'My team: "{my_team}" ({record})\n'
        f"Starters: {fmt(my_starters)}\n"
        f"Bench: {fmt(my_bench[:10])}\n\n"
        "Research trade values and dynasty outlook for: "
        + ", ".join(p["name"] for p in key_players)
    )

    llm_researcher = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=1200,
    ).bind_tools([get_trade_value, search_dynasty_analysis])

    messages: list = [
        SystemMessage(content=_REC_RESEARCH_SYSTEM),
        HumanMessage(content=f"{get_runtime_context()}{STRATEGY_PREFIX}\n\n{context}"),
    ]

    for _ in range(10):
        response = llm_researcher.invoke(messages)
        messages.append(response)
        if not response.tool_calls:
            break
        for call in response.tool_calls:
            fn = call["name"]
            if fn in ("get_trade_value", "search_dynasty_analysis"):
                try:
                    if fn == "get_trade_value":
                        result = get_trade_value.invoke(call["args"])
                    else:
                        result = search_dynasty_analysis.invoke(
                            call["args"]
                        )
                except Exception:
                    result = "No results found."
                messages.append(
                    ToolMessage(
                        content=str(result),
                        tool_call_id=call["id"],
                    )
                )

    messages.append(HumanMessage(
        content="Using your research, build 3 recommendations. "
                "Output ONLY the JSON object."
    ))

    llm_writer = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=700,
    )

    _year = datetime.now().year
    write_system = _REC_WRITE_SYSTEM.format(
        my_team=my_team,
        untouchables=get_untouchables_constraint(),
        current_year=_year,
        next_year=_year + 1,
    )
    final = llm_writer.invoke(
        [SystemMessage(content=write_system)] + messages[1:]
    )
    return _parse(final.content, "recommendations")


def generate_player_value_summaries(
    players: list[dict],
    snippets: dict[str, str],
) -> dict[str, str]:
    """
    Given dynasty analysis snippets per player, returns
    {player_id: "Typically goes for: X"}.
    Uses an ordered array response to avoid ID key-matching issues.
    Falls back to Claude's own dynasty knowledge when snippets are thin.
    """
    if not players:
        return {}

    lines = []
    for i, p in enumerate(players):
        snippet = snippets.get(p["id"], "")
        lines.append(
            f"{i + 1}. {p['name']} ({p['position']}, {p['team']}): "
            + (snippet[:280] if snippet else "No search data found")
        )

    prompt = (
        "You are a dynasty fantasy football trade analyst. "
        "For each player below, write a concise 1-line trade value "
        "summary. Use the search data provided where available — "
        "if search data is sparse or missing, draw on your own "
        "dynasty knowledge (KTC values, rankings, current market) "
        "to give a reasonable estimate.\n\n"
        "Format: 'Typically goes for: [specific assets]' — "
        "e.g. 'Typically goes for: 2 first-round picks' or "
        "'Typically goes for: WR2 + late 1st'.\n\n"
        "Players:\n"
        + "\n".join(lines)
        + f"\n\nOutput ONLY a JSON array with exactly {len(players)} "
        "strings, in the same order as the numbered list above:\n"
        '["Typically goes for: ...", "Typically goes for: ...", ...]'
    )

    llm = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=500,
    )
    response = llm.invoke([HumanMessage(content=prompt)])

    cleaned = (
        re.sub(r"```(?:json)?", "", response.content)
        .replace("```", "")
        .strip()
    )
    m = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if m:
        try:
            summaries = json.loads(m.group())
            return {p["id"]: s for p, s in zip(players, summaries)}
        except json.JSONDecodeError:
            pass
    return {}


def _parse(raw: str, key: str) -> dict:
    cleaned = (
        re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()
    )
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group())
            return {key: data.get(key, [])}
        except json.JSONDecodeError:
            pass
    return {key: []}

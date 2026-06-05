"""Matchup preview agent — generates a structured weekly preview."""
import json
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

from src.config import ANTHROPIC_API_KEY
from src.tools.search_tools import search_player_news
from src.strategy import STRATEGY_PREFIX

_RESEARCH_SYSTEM = """\
You are a dynasty fantasy football analyst. Your job is to research players
for an upcoming matchup preview. Use search_player_news to look up any players
you need current injury, news, or status info on. When you have enough info,
stop calling tools — a follow-up message will ask you to write the preview.\
"""

_WRITE_SYSTEM = """\
You are a dynasty fantasy football analyst writing a matchup preview
FOR THE OWNER of {my_team}. You are speaking directly to that owner.
'Your team' and 'you' always refer to {my_team}.

Output ONLY a valid JSON object — nothing before it, nothing after it.
Start your response with {{ and end with }}.

Use exactly these four keys:
{{
  "prediction": "One sentence. Who wins, confidence level, both records \
(e.g. '3-2 vs 2-3'), and what a win or loss means for standings position \
or win streak. Write as if talking to the {my_team} owner.",
  "edge": "One sentence. Where {my_team} has the clear advantage this week. \
Name specific players with **bold**.",
  "watch_out": "One sentence. The opponent's top threat or {my_team}'s \
biggest weakness in this matchup. Name the player with **bold**.",
  "move": "One sentence. The single most important roster action for \
{my_team}: start **BenchPlayer** over **CurrentStarter**, OR add a \
specific free agent NOT already on the roster. NEVER recommend adding \
a player who is already on the bench — those are already owned. \
If the starting lineup is already optimal, say so explicitly."
}}

Additional rules:
- Bold all player names: **Name**
- Be direct and specific — no fluff, no hedging
- Do NOT discuss the opponent's internal roster decisions
- The bench players listed in context are ALREADY OWNED — never suggest \
adding them from waivers\
"""


def generate_matchup_preview(matchup: dict, season_type: str) -> dict:
    """
    Phase 1: Agent searches for player news.
    Phase 2: Forced JSON generation with no tools.
    Returns dict with keys: prediction, edge, watch_out, move.
    """

    def fmt(players: list) -> str:
        return ", ".join(
            f"{p['name']} ({p['position']}, {p['team']})" for p in players
        ) or "none"

    offseason_note = (
        "It's the offseason — focus on dynasty value and long-term player "
        "outlook rather than weekly game matchups."
        if season_type != "regular"
        else f"It's Week {matchup['week']} of the regular season."
    )

    my_team = matchup["my_team"]
    opp_team = matchup["opp_team"]

    context = (
        f"{offseason_note}\n"
        f"League size: {matchup.get('total_teams', 12)} teams\n\n"
        f"YOUR TEAM — {my_team} "
        f"({matchup['my_record']}, #{matchup['my_rank']} in standings):\n"
        f"  Starters (currently playing): {fmt(matchup['my_starters'])}\n"
        f"  Bench (ALREADY OWNED — do not suggest adding these): "
        f"{fmt(matchup.get('my_bench', []))}\n\n"
        f"OPPONENT — {opp_team} "
        f"({matchup['opp_record']}, #{matchup['opp_rank']} in standings):\n"
        f"  Starters: {fmt(matchup['opp_starters'])}\n"
        f"  Bench:    {fmt(matchup.get('opp_bench', []))}"
    )

    # ── Phase 1: Research ────────────────────────────────────────────────
    llm_researcher = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=1024,
    ).bind_tools([search_player_news])

    messages: list = [
        SystemMessage(content=_RESEARCH_SYSTEM),
        HumanMessage(content=(
            f"{STRATEGY_PREFIX}\n\n{context}\n\n"
            "Search for news on any players you want current info on "
            "before writing the preview."
        )),
    ]

    for _ in range(10):
        response = llm_researcher.invoke(messages)
        messages.append(response)

        if not response.tool_calls:
            break  # Agent is done researching

        for call in response.tool_calls:
            if call["name"] == "search_player_news":
                try:
                    result = search_player_news.invoke(call["args"])
                except Exception:
                    result = "No results found."
                messages.append(ToolMessage(
                    content=str(result),
                    tool_call_id=call["id"],
                ))

    # ── Phase 2: Forced JSON output (no tools) ───────────────────────────
    llm_writer = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=700,
    )

    write_system = _WRITE_SYSTEM.format(my_team=my_team)
    messages.append(HumanMessage(content=(
        "Using your research above, now write the preview for the "
        f"{my_team} owner. Output ONLY the JSON object."
    )))

    final = llm_writer.invoke(
        [SystemMessage(content=write_system)] + messages[1:]
    )
    return _parse(final.content)


def _parse(raw: str) -> dict:
    """Extract the JSON dict from the response, handling code fences."""
    cleaned = re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group())
            return {
                "prediction": data.get("prediction", ""),
                "edge": data.get("edge", ""),
                "watch_out": data.get("watch_out", ""),
                "move": data.get("move", ""),
            }
        except json.JSONDecodeError:
            pass
    return {
        "prediction": cleaned[:400],
        "edge": "",
        "watch_out": "",
        "move": "",
    }

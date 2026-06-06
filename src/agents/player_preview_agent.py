"""
Player preview agent — single-player deep dive for the My Team page.

Regular season → start/sit, matchup grade, Vegas props, weather, history.
Offseason      → dynasty rating, season projection, season Vegas props.

Cached per player per week: cache/player_previews/{player_id}_{season}_{week}.json
"""
import json
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

from src.config import ANTHROPIC_API_KEY
from src.tools.search_tools import search_player_news
from src.strategy import STRATEGY_PREFIX

_RESEARCH_SYSTEM = """\
You are a dynasty fantasy football analyst researching {player_name} \
({position}, {team}) for the {my_team} owner.

Use search_player_news to find:
{research_targets}

Be selective — 2-4 searches max. Stop when you have enough.\
"""

_WRITE_SYSTEM_WEEKLY = """\
Write a Week {week} player preview for {player_name} ({position}, {team}) \
vs {opponent} for the {my_team} owner. Speak directly to the owner.

Output ONLY valid JSON starting with {{ and ending with }}:
{{
  "mode": "weekly",
  "start_sit": "Start" | "Sit" | "Flex",
  "confidence": "high" | "medium" | "low",
  "matchup": "Matchup grade and context in one phrase.",
  "vegas": "Player prop lines only — e.g. 'o/u 1.5 TDs -120, \
o/u 72.5 rec yds -115'. Never team odds.",
  "weather": "Game weather string, or null if dome/unavailable.",
  "history": "Stat line vs {opponent} in prior meetings, or null.",
  "summary": "2-3 sentences — start/sit reasoning, key upside or risk."
}}

Rules: bold player names **Name**, be specific, no fluff.\
"""

_WRITE_SYSTEM_OFFSEASON = """\
Write a 2026 dynasty season outlook for {player_name} ({position}, {team}) \
for the {my_team} owner. Speak directly to the owner.

Output ONLY valid JSON starting with {{ and ending with }}:
{{
  "mode": "offseason",
  "dynasty_rating": "Buy" | "Hold" | "Sell",
  "confidence": "high" | "medium" | "low",
  "season_projection": "Consensus season totals with source — \
e.g. '4,200 pass yds, 32 TDs (FantasyPros)'.",
  "vegas_season_props": "Season player prop lines — \
e.g. 'o/u 4,150 pass yds -115, o/u 28.5 TDs -110'. Player props only.",
  "summary": "2-3 sentences — dynasty value, key upside, key risk."
}}

Rules: bold player names **Name**, be specific, no fluff.\
"""


def generate_player_preview(
    player: dict,
    my_team: str,
    opponent: str,
    season_type: str,
    week: int,
    season: str,
) -> dict:
    """
    Two-phase preview: research then forced JSON write.
    player = {id, name, position, team}
    """
    is_regular = season_type == "regular"
    name = player["name"]
    position = player["position"]
    team = player["team"]

    if is_regular:
        research_targets = (
            f"- Current injury/status and week {week} projection\n"
            f"- Vegas player prop lines (TDs, yards, receptions)\n"
            f"- Matchup vs {opponent} defense\n"
            f"- Game weather if outdoor stadium\n"
            f"- Historical stats vs {opponent} (if available)"
        )
        write_system = _WRITE_SYSTEM_WEEKLY.format(
            week=week,
            player_name=name,
            position=position,
            team=team,
            opponent=opponent,
            my_team=my_team,
        )
    else:
        research_targets = (
            f"- 2026 dynasty outlook and ADP\n"
            f"- Season projections (passing/rushing/receiving totals)\n"
            f"- Vegas season player prop lines\n"
            f"- Training camp/offseason news"
        )
        write_system = _WRITE_SYSTEM_OFFSEASON.format(
            player_name=name,
            position=position,
            team=team,
            my_team=my_team,
        )

    # ── Phase 1: Research ─────────────────────────────────────────────────────
    research_system = _RESEARCH_SYSTEM.format(
        player_name=name,
        position=position,
        team=team,
        my_team=my_team,
        research_targets=research_targets,
    )

    llm_researcher = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=1024,
    ).bind_tools([search_player_news])

    messages: list = [
        SystemMessage(content=research_system),
        HumanMessage(content=(
            f"{STRATEGY_PREFIX}\n\n"
            f"Research {name} ({position}, {team}) now. "
            "Stop when you have the data you need."
        )),
    ]

    for _ in range(6):
        response = llm_researcher.invoke(messages)
        messages.append(response)
        if not response.tool_calls:
            break
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

    # ── Phase 2: Forced JSON write ────────────────────────────────────────────
    llm_writer = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=600,
    )

    messages.append(HumanMessage(content=(
        f"Now write the preview for {name}. Output ONLY the JSON object."
    )))

    final = llm_writer.invoke(
        [SystemMessage(content=write_system)] + messages[1:]
    )
    return _parse(final.content)


def _parse(raw: str) -> dict:
    cleaned = re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return {"mode": "error", "summary": cleaned[:300]}

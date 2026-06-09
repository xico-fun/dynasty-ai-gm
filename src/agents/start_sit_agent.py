"""Start/Sit agent — 3 weekly start/sit decisions."""
import json
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

from src.config import ANTHROPIC_API_KEY
from src.tools.search_tools import search_player_news
from src.strategy import STRATEGY_PREFIX
from src.runtime_context import get_runtime_context

_RESEARCH_SYSTEM = (
    "You are a dynasty fantasy football analyst. Research injury status, "
    "snap counts, and matchup difficulty for any borderline starters you "
    "would flag as a tough start/sit call this week. Use search_player_news "
    "for players you're unsure about. Stop when you have enough to decide."
)

_WRITE_SYSTEM = """\
You are a fantasy football analyst advising the {my_team} owner.

Identify exactly 3 genuine start/sit dilemmas from the roster — \
close calls where a reasonable manager could go either way.

Output ONLY a valid JSON array:
[
  {{
    "position": "RB",
    "start_player": {{"name": "...", "position": "RB", "team": "..."}},
    "sit_player":  {{"name": "...", "position": "RB", "team": "..."}},
    "reason": "One sentence explaining why START beats SIT this week."
  }}
]

Rules:
- 3 items, no more no less
- start_player and sit_player must both be on the roster
- Prefer same-position comparisons (RB vs RB, WR vs WR)
- reason MUST cite a specific number, stat, or fact from your research —
  e.g. a snap%, target share, injury designation, Vegas O/U, or opponent
  rank vs position. Vague reasons like "better matchup" are not allowed.
- Base every decision on real data from your searches, not general knowledge"""


def generate_start_sit(
    my_team: str,
    starters: list[dict],
    bench: list[dict],
    week: int,
    opp_team: str,
    season_type: str,
) -> list[dict]:
    if season_type != "regular":
        return []

    def fmt(players: list[dict]) -> str:
        return ", ".join(
            f"{p['name']} ({p['position']}, {p['team']})" for p in players
        ) or "none"

    context = (
        f"My team: {my_team} — Week {week} vs {opp_team or 'opponent'}\n"
        f"Current starters: {fmt(starters)}\n"
        f"Bench options: {fmt(bench)}\n\n"
        "Find the 3 toughest start/sit decisions on this roster."
    )

    llm_researcher = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=1024,
    ).bind_tools([search_player_news])

    messages: list = [
        SystemMessage(content=_RESEARCH_SYSTEM),
        HumanMessage(content=f"{get_runtime_context()}{STRATEGY_PREFIX}\n\n{context}"),
    ]

    for _ in range(8):
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
                messages.append(
                    ToolMessage(
                        content=str(result),
                        tool_call_id=call["id"],
                    )
                )

    messages.append(HumanMessage(
        content="Generate the 3 start/sit decisions. Output ONLY the JSON array."
    ))

    llm_writer = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=600,
    )

    write_system = _WRITE_SYSTEM.format(my_team=my_team)
    final = llm_writer.invoke(
        [SystemMessage(content=write_system)] + messages[1:]
    )

    cleaned = (
        re.sub(r"```(?:json)?", "", final.content)
        .replace("```", "")
        .strip()
    )
    m = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return []

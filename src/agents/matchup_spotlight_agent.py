"""
Matchup spotlight agent — picks 3 key starters + 1 watch player from the
user's roster and returns rich per-player context (projections, Vegas props,
matchup history, one-line note).

Offseason  → season-long projections + season player props.
Regular    → weekly props, game Vegas line, historical vs. opponent.
Cache key  → "{season}_{season_type}" (off) or "{season}_week{week}".
"""
import json
import re

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

from src.config import ANTHROPIC_API_KEY
from src.tools.search_tools import search_player_news
from src.strategy import get_strategy_prefix
from src.runtime_context import get_runtime_context

# ── System prompts ────────────────────────────────────────────────────────────

_RESEARCH_SYSTEM = """\
You are a dynasty fantasy football analyst evaluating a roster for {period}.
Research players using search_player_news. For each player you research, look
for player prop odds (TDs, yards, receptions) — NOT team-level odds like win
totals or Super Bowl odds.

Focus on QBs, RB1s, WR1s, and any player with a notable matchup angle,
injury flag, or interesting prop. Be selective: 5-7 searches max.
Stop when you have enough info.\
"""

_WRITE_SYSTEM = """\
You are a dynasty fantasy football analyst writing a roster spotlight
for the owner of {my_team}. Speak directly to that owner.

Select exactly 4 players from {my_team}'s starters:
  • 3 with role "key"     — strongest assets {period}
  • 1 with role "dud_risk" OR "boom" — big over/under-performer risk

Output ONLY valid JSON. Start with {{ and end with }}. No other text.

Schema:
{{
  "players": [
    {{
      "name": "string",
      "position": "string",
      "team": "string",
      "role": "key" | "dud_risk" | "boom",
      "projected_stats": "{proj_hint}",
      "vegas": "{vegas_hint}",
      "matchup_history": {history_note},
      "note": "One sentence max 100 chars — why selected and what to watch."
    }}
  ]
}}

Rules:
- Do NOT use markdown — plain text only, no ** or other formatting
- 3 key players first, watch player last
- projected_stats and vegas MUST contain real numbers from research
- Abbreviate: pass yards → pyds, rush yards → ryds, rec yards → ryds,
  pass TDs → PTDs, rush TDs → RTDs, receiving TDs → TDs
- Do NOT mention any source names (FantasyPros, DLF, etc.) in stats
- Omit standard juice (-110, -115) from vegas lines
- vegas MUST be player prop lines (e.g. 'o/u 1.5 TDs, o/u 72.5 ryds'),
  never team win totals or Super Bowl odds
- Do NOT name coaches, coordinators, or offensive systems unless that
  exact name appeared in your search results — never use training data
  for personnel details, as coaches change frequently
- note must be specific — no generic filler
- Only include players from {my_team}'s roster\
"""

# ── Public entry point ────────────────────────────────────────────────────────


def generate_spotlight(matchup: dict, season_type: str) -> dict:
    """
    Research starters then produce a 4-player spotlight.
    Returns {"players": [...]} or {"players": [], "error": "..."}.
    """
    is_regular = season_type == "regular"
    week = matchup.get("week", 1)
    opp_team = matchup.get("opp_team", "")

    period = (
        f"Week {week} matchup vs {opp_team}"
        if is_regular
        else "the 2026 dynasty season"
    )

    def fmt(players: list) -> str:
        return ", ".join(
            f"{p['name']} ({p['position']}, {p['team']})"
            for p in players
        ) or "none"

    season_label = "Regular season —" if is_regular else "Offseason —"
    context = (
        f"{season_label} {period}\n"
        f"YOUR TEAM — {matchup['my_team']} "
        f"({matchup.get('my_record', '0-0')}, "
        f"#{matchup.get('my_rank', '?')} in standings):\n"
        f"  Starters: {fmt(matchup['my_starters'])}\n"
        f"  Bench (already owned): {fmt(matchup.get('my_bench', []))}"
    )
    if is_regular and opp_team:
        context += f"\n  Opponent this week: {opp_team}"

    # Schema hints vary by mode
    proj_hint = (
        "Concrete season totals, e.g. '4,200 pyds, 32 PTDs, 450 ryds'"
        if not is_regular
        else "Weekly projection, e.g. '285 pyds, 2 PTDs'"
    )
    vegas_hint = (
        "Season player props, e.g. 'o/u 4,200 pyds, o/u 28.5 PTDs' — player props only, not team odds"
        if not is_regular
        else "Weekly player props, e.g. 'o/u 1.5 TDs, o/u 72.5 ryds' — player props only"
    )
    history_note = (
        "null"
        if not is_regular
        else (
            f'"Stats vs {opp_team} in prior matchups, '
            f'or null if unavailable"'
        )
    )

    # ── Phase 1: Research ─────────────────────────────────────────────────────
    llm_researcher = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=1024,
    ).bind_tools([search_player_news])

    messages: list = [
        SystemMessage(content=_RESEARCH_SYSTEM.format(period=period)),
        HumanMessage(content=(
            f"{get_runtime_context()}{get_strategy_prefix()}\n\n{context}\n\n"
            "Search the players you need prop/projection data on, "
            "then stop — a follow-up will ask you to write the spotlight."
        )),
    ]

    for _ in range(12):
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

    # ── Phase 2: Forced JSON write (no tools) ─────────────────────────────────
    write_system = _WRITE_SYSTEM.format(
        my_team=matchup["my_team"],
        period=period,
        proj_hint=proj_hint,
        vegas_hint=vegas_hint,
        history_note=history_note,
    )

    llm_writer = ChatAnthropic(
        model="claude-haiku-4-5-20251001",
        api_key=ANTHROPIC_API_KEY,
        max_tokens=900,
    )

    messages.append(HumanMessage(content=(
        f"Based on your research, write the spotlight for the "
        f"{matchup['my_team']} owner. Output ONLY the JSON object."
    )))

    final = llm_writer.invoke(
        [SystemMessage(content=write_system)] + messages[1:]
    )
    return _parse(final.content)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parse(raw: str) -> dict:
    """Extract and validate the spotlight JSON."""
    cleaned = re.sub(r"```(?:json)?", "", raw).replace("```", "").strip()
    m = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if m:
        try:
            data = json.loads(m.group())
            players = data.get("players", [])
            validated = [
                {
                    "name": p.get("name", ""),
                    "position": p.get("position", ""),
                    "team": p.get("team", ""),
                    "role": p.get("role", "key"),
                    "projected_stats": p.get("projected_stats", ""),
                    "vegas": p.get("vegas", ""),
                    "matchup_history": p.get("matchup_history"),
                    "note": p.get("note", ""),
                }
                for p in players[:4]
            ]
            return {"players": validated}
        except (json.JSONDecodeError, KeyError):
            pass
    return {"players": [], "error": "Failed to parse spotlight"}


def cache_key(season: str, season_type: str, week: int) -> str:
    if season_type == "regular":
        return f"{season}_week{week}"
    return f"{season}_{season_type}"

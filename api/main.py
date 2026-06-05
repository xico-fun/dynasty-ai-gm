"""Dynasty AI GM — FastAPI backend."""
import hashlib
import json
import re
import uuid
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel

from src.agents.matchup_preview_agent import generate_matchup_preview
from src.config import ANTHROPIC_API_KEY
from src.graph.dynasty_graph import _build_graph
from src.tools.sleeper_tools import _build_enriched_rosters

CACHE_DIR = Path(__file__).parent.parent / "cache"
PREVIEW_CACHE = CACHE_DIR / "matchup_preview.json"

app = FastAPI(title="Dynasty AI GM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Single shared graph instance with in-memory checkpointing
_graph = _build_graph(checkpointer=MemorySaver())


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None  # omit to start a new thread


class ChatResponse(BaseModel):
    thread_id: str
    response: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"ok": True}


@app.get("/roster")
def get_roster():
    """Return all enriched rosters for the league."""
    try:
        return _build_enriched_rosters()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """Send a message and get a full response (non-streaming)."""
    thread_id = req.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    result = _graph.invoke(
        {
            "messages": [HumanMessage(content=req.message)],
            "agent": "",
            "plan": [],
            "plan_index": 0,
        },
        config=config,
    )
    last = result["messages"][-1]
    return ChatResponse(thread_id=thread_id, response=last.content)


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Send a message and stream the response token by token."""
    thread_id = req.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    async def token_stream() -> AsyncIterator[str]:
        # Send thread_id first so the client can persist it
        yield f"data: {{\"thread_id\": \"{thread_id}\"}}\n\n"

        async for event in _graph.astream_events(
            {
                "messages": [HumanMessage(content=req.message)],
                "agent": "",
                "plan": [],
                "plan_index": 0,
            },
            config=config,
            version="v2",
        ):
            kind = event.get("event")
            # Only stream tokens from specialist nodes, not router/orchestrator
            if kind == "on_chat_model_stream":
                node = event.get("metadata", {}).get("langgraph_node", "")
                if node not in {"matchup", "trade", "waiver", "general"}:
                    continue
                chunk = event["data"]["chunk"]
                if chunk.content:
                    text = chunk.content
                    if isinstance(text, list):
                        text = "".join(
                            b.get("text", "") for b in text
                            if isinstance(b, dict)
                        )
                    if text:
                        yield f"data: {json.dumps({'token': text})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        token_stream(),
        media_type="text/event-stream",
        headers={"X-Thread-Id": thread_id},
    )


@app.get("/dashboard")
def get_dashboard():
    """Return all data needed to render the dashboard page."""
    from src.tools.sleeper_tools import _get, _get_all_players, _player_name
    from src.config import SLEEPER_USERNAME, SLEEPER_LEAGUE_ID

    user = _get(f"/user/{SLEEPER_USERNAME}")
    user_id = user["user_id"]
    nfl_state = _get("/state/nfl")
    rosters = _get(f"/league/{SLEEPER_LEAGUE_ID}/rosters")
    users_list = _get(f"/league/{SLEEPER_LEAGUE_ID}/users")
    user_map = {u["user_id"]: u for u in users_list}

    my_roster = next(
        (r for r in rosters if r["owner_id"] == user_id), {}
    )
    my_roster_id = my_roster.get("roster_id")
    my_settings = my_roster.get("settings", {})
    my_meta = user_map.get(user_id, {})
    team_name = (
        my_meta.get("metadata", {}).get("team_name")
        or my_meta.get("display_name", "My Team")
    )

    season_type = nfl_state.get("season_type", "off")
    week = nfl_state.get("week") or 1
    season = nfl_state.get("season", "2026")
    phase_labels = {
        "pre": "Preseason",
        "regular": f"Week {week}",
        "post": "Playoffs",
        "off": "Offseason",
    }
    phase = phase_labels.get(season_type, "Offseason")

    # Standings sorted by wins desc, then points desc
    def _sort_key(r):
        s = r.get("settings", {})
        return (-s.get("wins", 0), -s.get("fpts", 0))

    standings = []
    for r in sorted(rosters, key=_sort_key):
        oid = r.get("owner_id", "")
        u = user_map.get(oid, {})
        s = r.get("settings", {})
        standings.append({
            "team_name": (
                u.get("metadata", {}).get("team_name")
                or u.get("display_name", "Unknown")
            ),
            "manager": u.get("display_name", "Unknown"),
            "wins": s.get("wins", 0),
            "losses": s.get("losses", 0),
            "fpts": s.get("fpts", 0),
            "is_me": oid == user_id,
        })

    # Matchup — try regardless of season type; dynasty leagues have year-round
    matchup = None
    if week > 0 and my_roster_id:
        try:
            matchup_data = _get(
                f"/league/{SLEEPER_LEAGUE_ID}/matchups/{week}"
            )
            my_m = next(
                (m for m in matchup_data if m["roster_id"] == my_roster_id),
                None,
            )
            if my_m:
                mid = my_m["matchup_id"]
                opp_m = next(
                    (
                        m for m in matchup_data
                        if m["matchup_id"] == mid
                        and m["roster_id"] != my_roster_id
                    ),
                    None,
                )
                if opp_m:
                    opp_roster = next(
                        (
                            r for r in rosters
                            if r["roster_id"] == opp_m["roster_id"]
                        ),
                        {},
                    )
                    opp_user = user_map.get(opp_roster.get("owner_id", ""), {})
                    players = _get_all_players()

                    def _player_obj(pid):
                        p = players.get(str(pid), {})
                        first = p.get("first_name", "")
                        last = p.get("last_name", "")
                        name = f"{first} {last}".strip() or f"Unknown ({pid})"
                        return {
                            "id": str(pid),
                            "name": name,
                            "position": p.get("position", "?"),
                            "team": p.get("team") or "FA",
                        }

                    my_ids = my_m.get("starters") or []
                    opp_ids = opp_m.get("starters") or []
                    starters_hash = hashlib.md5(
                        "|".join(sorted(my_ids) + sorted(opp_ids)).encode()
                    ).hexdigest()[:10]

                    matchup = {
                        "week": week,
                        "my_team": team_name,
                        "my_points": my_m.get("points", 0),
                        "my_starters": [_player_obj(pid) for pid in my_ids],
                        "opp_team": (
                            opp_user.get("metadata", {}).get("team_name")
                            or opp_user.get("display_name", "Opponent")
                        ),
                        "opp_points": opp_m.get("points", 0),
                        "opp_starters": [_player_obj(pid) for pid in opp_ids],
                        "starters_hash": starters_hash,
                    }
        except Exception:
            pass

    # Recent transactions
    transactions = []
    try:
        players_db = _get_all_players()
        roster_map = {
            r["roster_id"]: user_map.get(r.get("owner_id", ""), {})
            for r in rosters
        }
        txn_week = week if week > 0 else 1
        raw = _get(f"/league/{SLEEPER_LEAGUE_ID}/transactions/{txn_week}")
        for txn in (raw or [])[:10]:
            rids = txn.get("roster_ids", [])
            team = "Unknown"
            if rids:
                u = roster_map.get(rids[0], {})
                team = (
                    u.get("metadata", {}).get("team_name")
                    or u.get("display_name", "Unknown")
                )
            transactions.append({
                "type": txn.get("type", ""),
                "team": team,
                "adds": [
                    _player_name(pid, players_db)
                    for pid in (txn.get("adds") or {})
                ],
                "drops": [
                    _player_name(pid, players_db)
                    for pid in (txn.get("drops") or {})
                ],
            })
    except Exception:
        pass

    wins = my_settings.get("wins", 0)
    losses = my_settings.get("losses", 0)
    return {
        "team_name": team_name,
        "record": f"{wins}-{losses}",
        "season": season,
        "phase": phase,
        "matchup": matchup,
        "standings": standings,
        "transactions": transactions,
    }




@app.get("/matchup-preview")
def get_matchup_preview():
    """Return cached matchup preview, generating it if needed."""
    from src.tools.sleeper_tools import _get, _get_all_players
    from src.config import SLEEPER_USERNAME, SLEEPER_LEAGUE_ID

    # We need the current matchup data to check the starters hash
    nfl_state = _get("/state/nfl")
    week = nfl_state.get("week") or 1
    season = nfl_state.get("season", "2026")
    season_type = nfl_state.get("season_type", "off")

    # Load cache
    cached = None
    if PREVIEW_CACHE.exists():
        try:
            cached = json.loads(PREVIEW_CACHE.read_text())
        except Exception:
            cached = None

    # We need the matchup to get the current starters hash
    # Re-use the dashboard matchup logic in minimal form
    user = _get(f"/user/{SLEEPER_USERNAME}")
    user_id = user["user_id"]
    rosters = _get(f"/league/{SLEEPER_LEAGUE_ID}/rosters")
    users_list = _get(f"/league/{SLEEPER_LEAGUE_ID}/users")
    user_map = {u["user_id"]: u for u in users_list}
    my_roster = next((r for r in rosters if r["owner_id"] == user_id), {})
    my_roster_id = my_roster.get("roster_id")

    matchup_raw = None
    if week > 0 and my_roster_id:
        try:
            matchup_data = _get(
                f"/league/{SLEEPER_LEAGUE_ID}/matchups/{week}"
            )
            my_m = next(
                (m for m in matchup_data if m["roster_id"] == my_roster_id),
                None,
            )
            if my_m:
                mid = my_m["matchup_id"]
                opp_m = next(
                    (
                        m for m in matchup_data
                        if m["matchup_id"] == mid
                        and m["roster_id"] != my_roster_id
                    ),
                    None,
                )
                if opp_m:
                    opp_roster = next(
                        (
                            r for r in rosters
                            if r["roster_id"] == opp_m["roster_id"]
                        ),
                        {},
                    )
                    opp_user = user_map.get(opp_roster.get("owner_id", ""), {})
                    players = _get_all_players()

                    def _obj(pid):
                        p = players.get(str(pid), {})
                        return {
                            "id": str(pid),
                            "name": (
                                f"{p.get('first_name', '')} "
                                f"{p.get('last_name', '')}".strip()
                                or f"Unknown ({pid})"
                            ),
                            "position": p.get("position", "?"),
                            "team": p.get("team") or "FA",
                        }

                    my_ids = my_m.get("starters") or []
                    opp_ids = opp_m.get("starters") or []
                    starters_hash = hashlib.md5(
                        "|".join(sorted(my_ids) + sorted(opp_ids)).encode()
                    ).hexdigest()[:10]
                    my_meta = user_map.get(user_id, {})
                    team_name = (
                        my_meta.get("metadata", {}).get("team_name")
                        or my_meta.get("display_name", "My Team")
                    )
                    opp_name = (
                        opp_user.get("metadata", {}).get("team_name")
                        or opp_user.get("display_name", "Opponent")
                    )

                    # Records
                    my_s = my_roster.get("settings", {})
                    opp_s = opp_roster.get("settings", {})
                    my_record = (
                        f"{my_s.get('wins', 0)}-{my_s.get('losses', 0)}"
                    )
                    opp_record = (
                        f"{opp_s.get('wins', 0)}-{opp_s.get('losses', 0)}"
                    )

                    # Standings positions
                    def _rank_key(r):
                        s = r.get("settings", {})
                        return (-s.get("wins", 0), -s.get("fpts", 0))
                    ranked = sorted(rosters, key=_rank_key)
                    rid_to_rank = {
                        r["roster_id"]: i + 1
                        for i, r in enumerate(ranked)
                    }
                    my_rank = rid_to_rank.get(my_roster_id, "?")
                    opp_rank = rid_to_rank.get(opp_m["roster_id"], "?")

                    # Bench players (cap at 10 to keep prompt manageable)
                    my_all = my_roster.get("players") or []
                    opp_all = opp_roster.get("players") or []
                    my_bench = [
                        _obj(p) for p in my_all
                        if p not in my_ids
                    ][:10]
                    opp_bench = [
                        _obj(p) for p in opp_all
                        if p not in opp_ids
                    ][:10]

                    matchup_raw = {
                        "week": week,
                        "my_team": team_name,
                        "my_record": my_record,
                        "my_rank": my_rank,
                        "my_starters": [_obj(pid) for pid in my_ids],
                        "my_bench": my_bench,
                        "opp_team": opp_name,
                        "opp_record": opp_record,
                        "opp_rank": opp_rank,
                        "opp_starters": [_obj(pid) for pid in opp_ids],
                        "opp_bench": opp_bench,
                        "starters_hash": starters_hash,
                        "total_teams": len(rosters),
                    }
        except Exception:
            pass

    if not matchup_raw:
        return {"preview": None, "lineup_changed": False}

    current_hash = matchup_raw["starters_hash"]

    # Cache hit — same week and same starters
    if (
        cached
        and cached.get("week") == week
        and cached.get("season") == season
        and cached.get("starters_hash") == current_hash
    ):
        return {
            "preview": cached["content"],
            "lineup_changed": False,
            "cached": True,
        }

    # Starters changed but we have a cached preview for this week
    lineup_changed = (
        cached is not None
        and cached.get("week") == week
        and cached.get("season") == season
        and cached.get("starters_hash") != current_hash
    )
    if lineup_changed:
        return {
            "preview": cached["content"],
            "lineup_changed": True,
            "cached": True,
        }

    # No valid cache — generate
    content = generate_matchup_preview(matchup_raw, season_type)
    CACHE_DIR.mkdir(exist_ok=True)
    PREVIEW_CACHE.write_text(json.dumps({
        "week": week,
        "season": season,
        "starters_hash": current_hash,
        "content": content,
    }))
    return {"preview": content, "lineup_changed": False, "cached": False}


@app.post("/matchup-preview/regenerate")
def regenerate_matchup_preview():
    """Force-regenerate the matchup preview and update the cache."""
    # Delete cache and re-use get logic
    if PREVIEW_CACHE.exists():
        PREVIEW_CACHE.unlink()
    return get_matchup_preview()


@app.get("/thread/{thread_id}/history")
def get_thread_history(thread_id: str):
    """Return the message history for a given thread."""
    config = {"configurable": {"thread_id": thread_id}}
    state = _graph.get_state(config)
    if not state or not state.values:
        return {"thread_id": thread_id, "messages": []}

    messages = []
    for msg in state.values.get("messages", []):
        role = "user" if isinstance(msg, HumanMessage) else "assistant"
        content = msg.content
        if isinstance(content, list):
            content = "".join(
                b.get("text", "") for b in content if isinstance(b, dict)
            )
        if content:
            messages.append({"role": role, "content": content})

    return {"thread_id": thread_id, "messages": messages}

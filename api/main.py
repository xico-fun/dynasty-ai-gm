"""Dynasty AI GM — FastAPI backend."""
import hashlib
import json
import uuid
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel

from api.db import (
    init_db, save_exchange, get_messages, list_threads,
    set_thread_meta, delete_thread,
)
from src.agents.matchup_preview_agent import generate_matchup_preview
from src.agents.matchup_spotlight_agent import (
    generate_spotlight,
    cache_key as spotlight_cache_key,
)
from src.agents.player_preview_agent import generate_player_preview
from src.graph.dynasty_graph import _build_graph
from src.tools.sleeper_tools import _build_enriched_rosters

CACHE_DIR = Path(__file__).parent.parent / "cache"
PREVIEW_CACHE = CACHE_DIR / "matchup_preview.json"
SPOTLIGHT_CACHE = CACHE_DIR / "matchup_spotlight.json"
TEAM_NEWS_CACHE = CACHE_DIR / "team_news.json"
TEAM_WAIVER_CACHE = CACHE_DIR / "team_waiver_adds.json"
PLAYER_PREVIEW_DIR = CACHE_DIR / "player_previews"
TRADE_TRENDING_CACHE = CACHE_DIR / "trade_trending.json"
TRADE_RECS_CACHE = CACHE_DIR / "trade_recs.json"
START_SIT_CACHE = CACHE_DIR / "matchup_startsit.json"
INJURIES_CACHE = CACHE_DIR / "matchup_injuries.json"

app = FastAPI(title="Dynasty AI GM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

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


def _calc_streaks(
    my_rid: int,
    opp_rid: int,
    current_week: int,
    league_id: str,
) -> tuple[str | None, str | None]:
    """Return (my_streak, opp_streak) e.g. ('W3', 'L1') from recent results."""
    from src.tools.sleeper_tools import _get
    my_res: list[bool] = []
    opp_res: list[bool] = []
    for w in range(current_week - 1, max(0, current_week - 6), -1):
        try:
            ms = _get(f"/league/{league_id}/matchups/{w}")
            # My streak
            my_m = next((m for m in ms if m["roster_id"] == my_rid), None)
            if my_m:
                mid = my_m["matchup_id"]
                rival = next(
                    (m for m in ms
                     if m["matchup_id"] == mid and m["roster_id"] != my_rid),
                    None,
                )
                if rival:
                    mp = my_m.get("points") or 0
                    rp = rival.get("points") or 0
                    if mp > 0 or rp > 0:
                        my_res.append(mp > rp)
            # Opp streak
            opp_m = next((m for m in ms if m["roster_id"] == opp_rid), None)
            if opp_m:
                mid = opp_m["matchup_id"]
                rival2 = next(
                    (m for m in ms
                     if m["matchup_id"] == mid and m["roster_id"] != opp_rid),
                    None,
                )
                if rival2:
                    op = opp_m.get("points") or 0
                    rp2 = rival2.get("points") or 0
                    if op > 0 or rp2 > 0:
                        opp_res.append(op > rp2)
        except Exception:
            break

    def _streak(results: list[bool]) -> str | None:
        if not results:
            return None
        cur = results[0]
        count = 1
        for r in results[1:]:
            if r == cur:
                count += 1
            else:
                break
        return f"{'W' if cur else 'L'}{count}"

    return _streak(my_res), _streak(opp_res)


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

                    opp_s = opp_roster.get("settings", {})
                    my_streak, opp_streak = None, None
                    if season_type == "regular" and week > 1:
                        try:
                            my_streak, opp_streak = _calc_streaks(
                                my_roster_id,
                                opp_m["roster_id"],
                                week,
                                SLEEPER_LEAGUE_ID,
                            )
                        except Exception:
                            pass

                    matchup = {
                        "week": week,
                        "my_team": team_name,
                        "my_record": (
                            f"{my_settings.get('wins', 0)}"
                            f"-{my_settings.get('losses', 0)}"
                        ),
                        "my_streak": my_streak,
                        "my_points": my_m.get("points", 0),
                        "my_starters": [
                            _player_obj(pid) for pid in my_ids
                        ],
                        "opp_team": (
                            opp_user.get("metadata", {}).get("team_name")
                            or opp_user.get("display_name", "Opponent")
                        ),
                        "opp_record": (
                            f"{opp_s.get('wins', 0)}"
                            f"-{opp_s.get('losses', 0)}"
                        ),
                        "opp_streak": opp_streak,
                        "opp_points": opp_m.get("points", 0),
                        "opp_starters": [
                            _player_obj(pid) for pid in opp_ids
                        ],
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


@app.get("/matchup-spotlight")
def get_matchup_spotlight():
    """Return cached spotlight, generating it if needed."""
    from src.tools.sleeper_tools import _get, _get_all_players
    from src.config import SLEEPER_USERNAME, SLEEPER_LEAGUE_ID

    nfl_state = _get("/state/nfl")
    week = nfl_state.get("week") or 1
    season = nfl_state.get("season", "2026")
    season_type = nfl_state.get("season_type", "off")

    ck = spotlight_cache_key(season, season_type, week)

    # Load cache
    cached = None
    if SPOTLIGHT_CACHE.exists():
        try:
            cached = json.loads(SPOTLIGHT_CACHE.read_text())
        except Exception:
            cached = None

    if cached and cached.get("cache_key") == ck:
        return {"spotlight": cached["content"]}

    # Build matchup context (same pattern as preview endpoint)
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
                my_all = my_roster.get("players") or []
                my_bench = [
                    _obj(p) for p in my_all if p not in my_ids
                ][:12]

                opp_name = ""
                if opp_m:
                    opp_roster = next(
                        (
                            r for r in rosters
                            if r["roster_id"] == opp_m["roster_id"]
                        ),
                        {},
                    )
                    opp_user = user_map.get(
                        opp_roster.get("owner_id", ""), {}
                    )
                    opp_name = (
                        opp_user.get("metadata", {}).get("team_name")
                        or opp_user.get("display_name", "Opponent")
                    )

                def _rank_key(r):
                    s = r.get("settings", {})
                    return (-s.get("wins", 0), -s.get("fpts", 0))

                ranked = sorted(rosters, key=_rank_key)
                rid_to_rank = {
                    r["roster_id"]: i + 1
                    for i, r in enumerate(ranked)
                }
                my_meta = user_map.get(user_id, {})
                my_s = my_roster.get("settings", {})
                matchup_raw = {
                    "week": week,
                    "my_team": (
                        my_meta.get("metadata", {}).get("team_name")
                        or my_meta.get("display_name", "My Team")
                    ),
                    "my_record": (
                        f"{my_s.get('wins', 0)}-{my_s.get('losses', 0)}"
                    ),
                    "my_rank": rid_to_rank.get(my_roster_id, "?"),
                    "my_starters": [_obj(pid) for pid in my_ids],
                    "my_bench": my_bench,
                    "opp_team": opp_name,
                    "total_teams": len(rosters),
                }
        except Exception:
            pass

    if not matchup_raw:
        return {"spotlight": None}

    content = generate_spotlight(matchup_raw, season_type)
    CACHE_DIR.mkdir(exist_ok=True)
    SPOTLIGHT_CACHE.write_text(json.dumps({
        "cache_key": ck,
        "content": content,
    }))
    return {"spotlight": content}


@app.get("/matchup-startsit")
def get_matchup_startsit():
    """3 start/sit decisions for the current matchup. Cached weekly."""
    from src.agents.start_sit_agent import generate_start_sit

    d = _my_roster_data() if False else None  # resolved below
    from src.tools.sleeper_tools import _get, _get_all_players
    from src.config import SLEEPER_USERNAME, SLEEPER_LEAGUE_ID

    nfl_state = _get("/state/nfl")
    week = nfl_state.get("week") or 1
    season = nfl_state.get("season", "2026")
    season_type = nfl_state.get("season_type", "off")
    ck = f"{season}_week{week}_ss"

    if START_SIT_CACHE.exists():
        try:
            cached = json.loads(START_SIT_CACHE.read_text())
            if cached.get("cache_key") == ck:
                return cached["content"]
        except Exception:
            pass

    if season_type != "regular":
        content = {"decisions": [], "offseason": True}
        CACHE_DIR.mkdir(exist_ok=True)
        START_SIT_CACHE.write_text(
            json.dumps({"cache_key": ck, "content": content})
        )
        return content

    user = _get(f"/user/{SLEEPER_USERNAME}")
    user_id = user["user_id"]
    rosters = _get(f"/league/{SLEEPER_LEAGUE_ID}/rosters")
    users_list = _get(f"/league/{SLEEPER_LEAGUE_ID}/users")
    user_map = {u["user_id"]: u for u in users_list}
    my_roster = next(
        (r for r in rosters if r["owner_id"] == user_id), {}
    )
    my_roster_id = my_roster.get("roster_id")
    my_meta = user_map.get(user_id, {})
    team_name = (
        my_meta.get("metadata", {}).get("team_name")
        or my_meta.get("display_name", "My Team")
    )
    players_db = _get_all_players()

    def _obj(pid):
        p = players_db.get(str(pid), {})
        return {
            "id": str(pid),
            "name": (
                f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
                or f"Unknown ({pid})"
            ),
            "position": p.get("position", "?"),
            "team": p.get("team") or "FA",
        }

    starter_ids = my_roster.get("starters") or []
    all_ids = my_roster.get("players") or []
    bench_ids = [p for p in all_ids if p not in starter_ids]
    starters = [_obj(pid) for pid in starter_ids]
    bench = [_obj(pid) for pid in bench_ids[:10]]

    opp_name = ""
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
                (m for m in matchup_data
                 if m["matchup_id"] == mid
                 and m["roster_id"] != my_roster_id),
                None,
            )
            if opp_m:
                opp_r = next(
                    (r for r in rosters
                     if r["roster_id"] == opp_m["roster_id"]),
                    {},
                )
                opp_u = user_map.get(opp_r.get("owner_id", ""), {})
                opp_name = (
                    opp_u.get("metadata", {}).get("team_name")
                    or opp_u.get("display_name", "")
                )
    except Exception:
        pass

    decisions = generate_start_sit(
        my_team=team_name,
        starters=starters,
        bench=bench,
        week=week,
        opp_team=opp_name,
        season_type=season_type,
    )

    content = {"decisions": decisions, "offseason": False}
    CACHE_DIR.mkdir(exist_ok=True)
    START_SIT_CACHE.write_text(
        json.dumps({"cache_key": ck, "content": content})
    )
    return content


@app.get("/matchup-injuries")
def get_matchup_injuries():
    """Injury & news snapshot for my key starters. Cached daily."""
    from src.tools.search_tools import search_player_news

    d = _my_roster_data()
    week = d["week"]
    season = d["season"]
    season_type = d["season_type"]
    ck = f"{season}_week{week}_inj"

    if INJURIES_CACHE.exists():
        try:
            cached = json.loads(INJURIES_CACHE.read_text())
            if cached.get("cache_key") == ck:
                return cached["content"]
        except Exception:
            pass

    skill = {"QB", "RB", "WR", "TE"}
    starters = [p for p in d["starters"] if p["position"] in skill][:6]

    results = []
    for p in starters:
        try:
            raw = search_player_news.invoke({"player_name": p["name"]})
            if isinstance(raw, dict):
                raw = raw.get("results", [])
            snippet = raw[0].get("content", "").strip()[:220] if raw else ""
            results.append({
                "player_name": p["name"],
                "position": p["position"],
                "team": p["team"],
                "snippet": snippet or "No recent news found.",
            })
        except Exception:
            results.append({
                "player_name": p["name"],
                "position": p["position"],
                "team": p["team"],
                "snippet": "No recent news found.",
            })

    content = {"players": results}
    CACHE_DIR.mkdir(exist_ok=True)
    INJURIES_CACHE.write_text(
        json.dumps({"cache_key": ck, "content": content})
    )
    return content


def _my_roster_data():
    """Shared helper — returns nfl_state + my full structured roster."""
    from src.tools.sleeper_tools import _get, _get_all_players
    from src.config import SLEEPER_USERNAME, SLEEPER_LEAGUE_ID

    nfl_state = _get("/state/nfl")
    week = nfl_state.get("week") or 1
    season = nfl_state.get("season", "2026")
    season_type = nfl_state.get("season_type", "off")

    user = _get(f"/user/{SLEEPER_USERNAME}")
    user_id = user["user_id"]
    rosters = _get(f"/league/{SLEEPER_LEAGUE_ID}/rosters")
    users_list = _get(f"/league/{SLEEPER_LEAGUE_ID}/users")
    user_map = {u["user_id"]: u for u in users_list}
    my_roster = next((r for r in rosters if r["owner_id"] == user_id), {})
    my_meta = user_map.get(user_id, {})
    team_name = (
        my_meta.get("metadata", {}).get("team_name")
        or my_meta.get("display_name", "My Team")
    )
    my_settings = my_roster.get("settings", {})

    players_db = _get_all_players()

    def _obj(pid):
        p = players_db.get(str(pid), {})
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

    starter_ids = my_roster.get("starters") or []
    all_ids = my_roster.get("players") or []
    bench_ids = [p for p in all_ids if p not in starter_ids]

    return {
        "nfl_state": nfl_state,
        "week": week,
        "season": season,
        "season_type": season_type,
        "team_name": team_name,
        "record": (
            f"{my_settings.get('wins', 0)}-{my_settings.get('losses', 0)}"
        ),
        "starters": [_obj(pid) for pid in starter_ids],
        "bench": [_obj(pid) for pid in bench_ids],
        "all_player_ids": set(all_ids),
    }


@app.get("/team/roster")
def get_team_roster():
    """Return the user's full structured roster."""
    d = _my_roster_data()
    return {
        "team_name": d["team_name"],
        "record": d["record"],
        "season": d["season"],
        "phase": {
            "pre": "Preseason",
            "regular": f"Week {d['week']}",
            "post": "Playoffs",
            "off": "Offseason",
        }.get(d["nfl_state"].get("season_type", "off"), "Offseason"),
        "week": d["week"],
        "starters": d["starters"],
        "bench": d["bench"],
    }


@app.get("/team/news")
def get_team_news():
    """3 featured articles (top starters) + see-more per remaining starter."""
    from src.tools.search_tools import _dynasty_search

    def _search_results(searcher, q: str) -> list:
        """Normalise Tavily response — handles both list and dict formats."""
        raw = searcher.invoke(q)
        if isinstance(raw, dict):
            return raw.get("results", [])
        return raw or []

    d = _my_roster_data()
    week = d["week"]
    season = d["season"]
    season_type = d["season_type"]
    ck = (
        f"{season}_week{week}" if season_type == "regular"
        else f"{season}_off"
    )

    if TEAM_NEWS_CACHE.exists():
        try:
            cached = json.loads(TEAM_NEWS_CACHE.read_text())
            if cached.get("cache_key") == ck:
                return cached["content"]
        except Exception:
            pass

    source_map = {
        "rotowire.com": ("RotoWire", "#ef4444"),
        "fantasypros.com": ("FantasyPros", "#3b82f6"),
        "fantasypoints.com": ("FantasyPoints", "#8b5cf6"),
        "espn.com": ("ESPN", "#dc2626"),
        "nfl.com": ("NFL.com", "#1d4ed8"),
        "reddit.com": ("Reddit", "#f97316"),
        "dynastynerds.com": ("DynastyNerds", "#7c3aed"),
        "dynastyleaguefootball.com": ("DLF", "#0891b2"),
    }

    def source_info(url: str):
        domain = url.split("/")[2].replace("www.", "") if "//" in url else ""
        name, color = source_map.get(domain, (domain or "Source", "#64748b"))
        return name, color

    def search_player(player: dict) -> dict | None:
        name = player["name"]
        team = player["team"]
        if season_type != "regular":
            queries = [
                f"{name} 2026 fantasy season outlook",
                f"{name} {team} dynasty 2026",
            ]
        else:
            queries = [
                f"{name} fantasy football week {week} 2026 news",
                f"{name} {team} fantasy 2026",
            ]
        for q in queries:
            try:
                hits = _search_results(_dynasty_search, q)
                if not hits:
                    continue
                r = hits[0]
                url = r.get("url", "")
                content = r.get("content", "")
                title = r.get("title", "")
                if not content and not title:
                    continue
                sname, scolor = source_info(url)
                return {
                    "player_name": name,
                    "player_id": player["id"],
                    "title": title or f"{name} — 2026 Outlook",
                    "intro": content[:160].rstrip() + "…" if content else "",
                    "url": url,
                    "source": sname,
                    "source_color": scolor,
                }
            except Exception:
                continue
        return None

    skill = {"QB", "RB", "WR", "TE"}
    starters = [p for p in d["starters"] if p["position"] in skill]
    featured_players = starters[:3]
    more_players = starters[3:]

    featured = [a for p in featured_players if (a := search_player(p))]
    more = [a for p in more_players if (a := search_player(p))]

    content = {"featured": featured, "more": more}
    CACHE_DIR.mkdir(exist_ok=True)
    TEAM_NEWS_CACHE.write_text(json.dumps({
        "cache_key": ck,
        "content": content,
    }))
    return content


@app.get("/team/trending")
def get_team_trending():
    """
    Top trending adds from Sleeper (last 5 days, limit 10).
    Each player is flagged 'waiver_add' (free agent) or 'trade' (rostered).
    """
    from src.tools.sleeper_tools import _get, _get_all_players
    from src.config import SLEEPER_LEAGUE_ID

    # Trending adds from Sleeper — 5 days lookback, top 10
    trending_raw = _get(
        "/players/nfl/trending/add?lookback_hours=120&limit=10"
    )

    # All league-owned players
    all_rosters = _get(f"/league/{SLEEPER_LEAGUE_ID}/rosters")
    users_list = _get(f"/league/{SLEEPER_LEAGUE_ID}/users")
    user_map = {u["user_id"]: u for u in users_list}

    pid_to_team: dict[str, str] = {}
    for roster in all_rosters:
        owner_id = roster.get("owner_id", "")
        u = user_map.get(owner_id, {})
        team_name = (
            u.get("metadata", {}).get("team_name")
            or u.get("display_name", "Unknown")
        )
        for pid in (roster.get("players") or []):
            pid_to_team[str(pid)] = team_name

    players_db = _get_all_players()

    results = []
    for entry in trending_raw:
        pid = str(entry.get("player_id", ""))
        p = players_db.get(pid, {})
        if not p:
            continue
        first = p.get("first_name", "")
        last = p.get("last_name", "")
        name = f"{first} {last}".strip()
        if not name:
            continue
        owned_by = pid_to_team.get(pid)
        results.append({
            "id": pid,
            "name": name,
            "position": p.get("position", "?"),
            "team": p.get("team") or "FA",
            "add_count": entry.get("count", 0),
            "flag": "trade" if owned_by else "waiver_add",
            "owned_by": owned_by,
        })

    return {"players": results}


@app.get("/team/player-preview/{player_id}")
def get_player_preview(player_id: str):
    """Cached weekly player deep-dive preview."""
    d = _my_roster_data()
    week = d["week"]
    season = d["season"]
    season_type = d["season_type"]

    suffix = f"week{week}" if season_type == "regular" else "off"
    PLAYER_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = PLAYER_PREVIEW_DIR / f"{player_id}_{season}_{suffix}.json"

    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text())
        except Exception:
            pass

    # Find the player in our roster
    all_players = d["starters"] + d["bench"]
    player = next((p for p in all_players if p["id"] == player_id), None)
    if not player:
        raise HTTPException(status_code=404, detail="Player not on roster")

    # Find opponent for regular season
    opponent = ""
    if season_type == "regular":
        try:
            from src.tools.sleeper_tools import _get
            from src.config import SLEEPER_LEAGUE_ID, SLEEPER_USERNAME
            user_data = _get(f"/user/{SLEEPER_USERNAME}")
            rosters = _get(f"/league/{SLEEPER_LEAGUE_ID}/rosters")
            users_list = _get(f"/league/{SLEEPER_LEAGUE_ID}/users")
            user_map = {u["user_id"]: u for u in users_list}
            my_roster = next(
                (r for r in rosters
                 if r["owner_id"] == user_data["user_id"]),
                {},
            )
            my_roster_id = my_roster.get("roster_id")
            matchup_data = _get(
                f"/league/{SLEEPER_LEAGUE_ID}/matchups/{week}"
            )
            my_m = next(
                (m for m in matchup_data
                 if m["roster_id"] == my_roster_id),
                None,
            )
            if my_m:
                mid = my_m["matchup_id"]
                opp_m = next(
                    (m for m in matchup_data
                     if m["matchup_id"] == mid
                     and m["roster_id"] != my_roster_id),
                    None,
                )
                if opp_m:
                    opp_r = next(
                        (r for r in rosters
                         if r["roster_id"] == opp_m["roster_id"]),
                        {},
                    )
                    opp_u = user_map.get(opp_r.get("owner_id", ""), {})
                    opponent = (
                        opp_u.get("metadata", {}).get("team_name")
                        or opp_u.get("display_name", "")
                    )
        except Exception:
            pass

    result = generate_player_preview(
        player=player,
        my_team=d["team_name"],
        opponent=opponent,
        season_type=season_type,
        week=week,
        season=season,
    )
    cache_file.write_text(json.dumps(result))
    return result


class TradeFindRequest(BaseModel):
    player_ids: list[str] = []
    pick_ids: list[str] = []


@app.get("/trades/roster")
def get_trades_roster():
    """My roster by position + tradeable picks for the Trade Center."""
    from src.tools.sleeper_tools import _get
    from src.config import SLEEPER_USERNAME, SLEEPER_LEAGUE_ID

    d = _my_roster_data()
    all_players = d["starters"] + d["bench"]

    positions: dict[str, list] = {"QB": [], "RB": [], "WR": [], "TE": []}
    for p in all_players:
        if p["position"] in positions:
            positions[p["position"]].append(p)
    for pos in positions:
        positions[pos].sort(key=lambda x: x["name"])

    picks: list[dict] = []
    try:
        user = _get(f"/user/{SLEEPER_USERNAME}")
        user_id = user["user_id"]
        rosters = _get(f"/league/{SLEEPER_LEAGUE_ID}/rosters")
        my_roster = next((r for r in rosters if r["owner_id"] == user_id), {})
        my_roster_id = my_roster.get("roster_id")

        users_list = _get(f"/league/{SLEEPER_LEAGUE_ID}/users")
        user_map = {u["user_id"]: u for u in users_list}
        roster_to_uid = {r["roster_id"]: r.get("owner_id") for r in rosters}

        traded_raw = _get(f"/league/{SLEEPER_LEAGUE_ID}/traded_picks")
        current_season = int(d["nfl_state"].get("season", "2026"))
        future_seasons = [str(current_season + i) for i in range(1, 4)]
        round_labels = {1: "1st", 2: "2nd", 3: "3rd"}

        traded_away: set[tuple] = set()
        for tp in (traded_raw or []):
            season = tp.get("season", "")
            if season not in future_seasons:
                continue
            rnd = tp.get("round")
            orig = tp.get("roster_id")
            cur = tp.get("owner_id")
            if orig == my_roster_id and cur != my_roster_id:
                traded_away.add((season, rnd))
            elif cur == my_roster_id and orig != my_roster_id:
                uid = roster_to_uid.get(orig, "")
                u = user_map.get(uid, {})
                orig_team = (
                    u.get("metadata", {}).get("team_name")
                    or u.get("display_name", "Unknown")
                )
                picks.append({
                    "id": f"pick_{season}_rd{rnd}_from_{orig}",
                    "label": f"{season} {round_labels.get(rnd, f'Rd {rnd}')}",
                    "season": season,
                    "round": rnd,
                    "original_team": orig_team,
                    "is_own": False,
                })

        for season in future_seasons:
            for rnd in [1, 2, 3]:
                if (season, rnd) not in traded_away:
                    picks.append({
                        "id": f"pick_{season}_rd{rnd}_own",
                        "label": f"{season} {round_labels[rnd]}",
                        "season": season,
                        "round": rnd,
                        "original_team": d["team_name"],
                        "is_own": True,
                    })

        picks.sort(key=lambda x: (x["season"], x["round"], not x["is_own"]))
    except Exception:
        pass

    return {
        "team_name": d["team_name"],
        "record": d["record"],
        "season": d["season"],
        "phase": {
            "pre": "Preseason",
            "regular": f"Week {d['week']}",
            "post": "Playoffs",
            "off": "Offseason",
        }.get(d["nfl_state"].get("season_type", "off"), "Offseason"),
        "positions": positions,
        "picks": picks,
    }


@app.post("/trades/find")
def find_trades(req: TradeFindRequest):
    """AI trade finder — given offered players/picks, return 3 proposals."""
    from src.tools.sleeper_tools import _get, _get_all_players
    from src.config import SLEEPER_LEAGUE_ID
    from src.agents.trade_finder_agent import generate_trade_proposals

    if not req.player_ids and not req.pick_ids:
        raise HTTPException(
            status_code=400, detail="No players or picks provided"
        )

    d = _my_roster_data()
    all_my = d["starters"] + d["bench"]
    offered_players = [p for p in all_my if p["id"] in req.player_ids]

    round_labels = {"1": "1st", "2": "2nd", "3": "3rd"}
    offered_picks = []
    for pick_id in req.pick_ids:
        parts = pick_id.split("_")
        if len(parts) >= 3:
            season = parts[1]
            rnd = parts[2].replace("rd", "")
            offered_picks.append(
                f"{season} {round_labels.get(rnd, rnd + 'th')} Round Pick"
            )

    rosters = _get(f"/league/{SLEEPER_LEAGUE_ID}/rosters")
    users_list = _get(f"/league/{SLEEPER_LEAGUE_ID}/users")
    players_db = _get_all_players()
    user_map = {u["user_id"]: u for u in users_list}

    def _obj(pid):
        p = players_db.get(str(pid), {})
        first = p.get("first_name", "")
        last = p.get("last_name", "")
        return {
            "name": f"{first} {last}".strip() or f"Unknown ({pid})",
            "position": p.get("position", "?"),
            "team": p.get("team") or "FA",
        }

    league_rosters = []
    for r in rosters:
        uid = r.get("owner_id", "")
        u = user_map.get(uid, {})
        team_name = (
            u.get("metadata", {}).get("team_name")
            or u.get("display_name", "Unknown")
        )
        starters = [_obj(pid) for pid in (r.get("starters") or []) if pid][:8]
        league_rosters.append({"team_name": team_name, "players": starters})

    return generate_trade_proposals(
        offered_players=offered_players,
        offered_picks=offered_picks,
        my_team=d["team_name"],
        my_starters=d["starters"],
        my_bench=d["bench"],
        league_rosters=league_rosters,
    )


@app.get("/trades/trending-values")
def get_trades_trending_values():
    """Trade market values for my key starters. Cached weekly."""
    from src.tools.search_tools import search_dynasty_analysis
    from src.agents.trade_finder_agent import generate_player_value_summaries

    d = _my_roster_data()
    week = d["week"]
    season = d["season"]
    season_type = d["season_type"]
    ck = (
        f"{season}_week{week}_tv"
        if season_type == "regular"
        else f"{season}_off_tv"
    )

    if TRADE_TRENDING_CACHE.exists():
        try:
            cached = json.loads(TRADE_TRENDING_CACHE.read_text())
            if cached.get("cache_key") == ck:
                return cached["content"]
        except Exception:
            pass

    skill = {"QB", "RB", "WR", "TE"}
    players = [p for p in d["starters"] if p["position"] in skill][:6]

    # Fetch dynasty analysis snippets (DynastyNerds, DLF, FantasyPoints — actual text)
    snippets: dict[str, str] = {}
    for p in players:
        try:
            raw = search_dynasty_analysis.invoke(
                {"query": f"{p['name']} dynasty trade value buy sell hold"}
            )
            if isinstance(raw, dict):
                raw = raw.get("results", [])
            snippets[p["id"]] = (
                raw[0].get("content", "").strip() if raw else ""
            )
        except Exception:
            snippets[p["id"]] = ""

    # Summarize to "Typically goes for: X" via Claude
    summaries = generate_player_value_summaries(players, snippets)

    results = [
        {
            "id": p["id"], "name": p["name"],
            "position": p["position"], "team": p["team"],
            "value_notes": summaries.get(
                p["id"], "Value unclear — check KTC"
            ),
        }
        for p in players
    ]

    content = {"players": results}
    CACHE_DIR.mkdir(exist_ok=True)
    TRADE_TRENDING_CACHE.write_text(
        json.dumps({"cache_key": ck, "content": content})
    )
    return content


@app.get("/trades/recommendations")
def get_trades_recommendations():
    """3 AI trade recommendations for my roster. Cached weekly."""
    from src.agents.trade_finder_agent import generate_trade_recommendations

    d = _my_roster_data()
    week = d["week"]
    season = d["season"]
    season_type = d["season_type"]
    ck = (
        f"{season}_week{week}_recs"
        if season_type == "regular"
        else f"{season}_off_recs"
    )

    if TRADE_RECS_CACHE.exists():
        try:
            cached = json.loads(TRADE_RECS_CACHE.read_text())
            if cached.get("cache_key") == ck:
                return cached["content"]
        except Exception:
            pass

    content = generate_trade_recommendations(
        my_team=d["team_name"],
        my_starters=d["starters"],
        my_bench=d["bench"],
        record=d["record"],
    )
    CACHE_DIR.mkdir(exist_ok=True)
    TRADE_RECS_CACHE.write_text(json.dumps({"cache_key": ck, "content": content}))
    return content


class SaveRequest(BaseModel):
    user_message: str
    assistant_message: str


@app.post("/thread/{thread_id}/save")
def save_thread_exchange(thread_id: str, req: SaveRequest):
    """Persist a user/assistant exchange to SQLite after streaming."""
    save_exchange(thread_id, req.user_message, req.assistant_message)
    return {"ok": True}


@app.get("/threads")
def get_threads():
    """List recent threads for the history panel."""
    return {"threads": list_threads(limit=30)}


class ThreadPatchRequest(BaseModel):
    starred: bool
    custom_title: str | None = None


@app.patch("/thread/{thread_id}")
def patch_thread(thread_id: str, req: ThreadPatchRequest):
    """Update starred / custom title for a thread."""
    set_thread_meta(thread_id, req.starred, req.custom_title)
    return {"ok": True}


@app.delete("/thread/{thread_id}")
def delete_thread_endpoint(thread_id: str):
    """Delete all messages and metadata for a thread."""
    delete_thread(thread_id)
    return {"ok": True}


@app.get("/thread/{thread_id}/history")
def get_thread_history(thread_id: str):
    """Return persisted message history for a thread."""
    return {
        "thread_id": thread_id,
        "messages": get_messages(thread_id),
    }

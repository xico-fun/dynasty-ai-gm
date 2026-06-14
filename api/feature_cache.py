"""Per-user, weekly file cache for expensive AI-generated feature content.

The original cache stored a single ``{cache_key, content}`` slot per feature in
one file — fine for a single user, but in multi-user it meant one user's cached
content overwrote (or, worse, was served to) another's.

This stores a dict of ``{key: content}`` per feature file, where the key is
scoped to the active league + Sleeper user + week. Different users therefore
get their own entries, and everything naturally refreshes once the NFL week
rolls over. Storage is the Railway container's ephemeral disk, which is fine —
it simply rebuilds after a redeploy.
"""
import json
from pathlib import Path

from src.active_league import get_active_league

CACHE_DIR = Path(__file__).parent.parent / "cache"

# Keep each feature file from growing without bound across many weeks/users.
_MAX_ENTRIES = 200


def user_week_key(season, week, *extra) -> str:
    """Build a cache key scoped to the active league + user + week.

    ``extra`` lets callers add discriminators (e.g. a player id) so the same
    user can cache multiple distinct items under one feature.
    """
    lg = get_active_league()
    uid = lg.sleeper_user_id or lg.username or "anon"
    parts = [str(lg.league_id), str(uid), str(season), f"w{week}"]
    parts += [str(e) for e in extra]
    return ":".join(parts)


def _path(name: str) -> Path:
    return CACHE_DIR / f"{name}.json"


def _load(name: str) -> dict:
    f = _path(name)
    if not f.exists():
        return {}
    try:
        data = json.loads(f.read_text())
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def get(name: str, key: str):
    """Return cached content for ``key`` in feature ``name``, or None."""
    return _load(name).get(key)


def delete(name: str, key: str) -> None:
    """Remove a single cached entry (used to force regeneration)."""
    store = _load(name)
    if key in store:
        store.pop(key, None)
        _path(name).write_text(json.dumps(store))


def set(name: str, key: str, content) -> None:
    """Store ``content`` under ``key`` for feature ``name``."""
    CACHE_DIR.mkdir(exist_ok=True)
    store = _load(name)
    store[key] = content
    # Simple bound: if we exceed the cap, drop the oldest insertion-order keys.
    if len(store) > _MAX_ENTRIES:
        for old in list(store.keys())[: len(store) - _MAX_ENTRIES]:
            store.pop(old, None)
    _path(name).write_text(json.dumps(store))

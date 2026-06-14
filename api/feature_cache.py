"""Durable per-user, weekly cache for expensive AI-generated feature content.

Backed by Postgres (Supabase) so it survives Railway container restarts and
deploys — the previous file-on-disk version was wiped whenever the container
cycled. Entries are keyed by league + Sleeper user + week, so each user gets
their own cache that refreshes when the NFL week rolls over.

All operations degrade gracefully: if the database is unreachable, reads return
None (cache miss → regenerate) and writes are skipped, so features keep working.
"""
import json
import os
from urllib.parse import urlparse

import psycopg2
from psycopg2.extras import Json

from src.active_league import get_active_league


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


def _conn():
    # Parse the DSN into parts rather than passing the URL directly: the
    # Supabase password contains a literal '%', which libpq's URI parser would
    # try to percent-decode.
    u = urlparse(os.getenv("DATABASE_URL", ""))
    return psycopg2.connect(
        host=u.hostname,
        port=u.port or 5432,
        user=u.username,
        password=u.password,
        dbname=(u.path or "/postgres").lstrip("/") or "postgres",
        sslmode="require",
        connect_timeout=5,
    )


def _full_key(name: str, key: str) -> str:
    return f"{name}:{key}"


def get(name: str, key: str):
    """Return cached content for ``key`` in feature ``name``, or None."""
    conn = None
    try:
        conn = _conn()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT content FROM feature_cache WHERE key = %s",
                (_full_key(name, key),),
            )
            row = cur.fetchone()
        if not row:
            return None
        val = row[0]
        return json.loads(val) if isinstance(val, str) else val
    except Exception:
        return None
    finally:
        if conn:
            conn.close()


def set(name: str, key: str, content) -> None:
    """Store ``content`` under ``key`` for feature ``name``."""
    conn = None
    try:
        conn = _conn()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO feature_cache (key, content, updated_at) "
                "VALUES (%s, %s, now()) "
                "ON CONFLICT (key) DO UPDATE SET "
                "content = EXCLUDED.content, updated_at = now()",
                (_full_key(name, key), Json(content)),
            )
        conn.commit()
    except Exception:
        pass
    finally:
        if conn:
            conn.close()


def delete(name: str, key: str) -> None:
    """Remove a single cached entry (used to force regeneration)."""
    conn = None
    try:
        conn = _conn()
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM feature_cache WHERE key = %s",
                (_full_key(name, key),),
            )
        conn.commit()
    except Exception:
        pass
    finally:
        if conn:
            conn.close()

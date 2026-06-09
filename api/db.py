"""SQLite message store for chat history persistence."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "db" / "chat_history.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id  TEXT    NOT NULL,
                role       TEXT    NOT NULL,
                content    TEXT    NOT NULL,
                created_at TEXT    DEFAULT (datetime('now'))
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_thread "
            "ON messages(thread_id)"
        )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS thread_meta (
                thread_id    TEXT PRIMARY KEY,
                starred      INTEGER DEFAULT 0,
                custom_title TEXT    DEFAULT NULL
            )
        """)


def save_exchange(
    thread_id: str,
    user_msg: str,
    assistant_msg: str,
) -> None:
    with _conn() as conn:
        conn.executemany(
            "INSERT INTO messages (thread_id, role, content) "
            "VALUES (?, ?, ?)",
            [
                (thread_id, "user", user_msg),
                (thread_id, "assistant", assistant_msg),
            ],
        )


def get_messages(thread_id: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages "
            "WHERE thread_id = ? ORDER BY id",
            (thread_id,),
        ).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in rows]


def set_thread_meta(
    thread_id: str,
    starred: bool,
    custom_title: str | None,
) -> None:
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO thread_meta (thread_id, starred, custom_title)
            VALUES (?, ?, ?)
            ON CONFLICT(thread_id) DO UPDATE SET
                starred      = excluded.starred,
                custom_title = excluded.custom_title
            """,
            (thread_id, int(starred), custom_title),
        )


def delete_thread(thread_id: str) -> None:
    with _conn() as conn:
        conn.execute(
            "DELETE FROM messages WHERE thread_id = ?", (thread_id,)
        )
        conn.execute(
            "DELETE FROM thread_meta WHERE thread_id = ?", (thread_id,)
        )


def list_threads(limit: int = 30) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT
                m.thread_id,
                MIN(m.created_at)  AS created_at,
                (
                    SELECT content FROM messages m2
                    WHERE m2.thread_id = m.thread_id
                      AND m2.role = 'user'
                    ORDER BY m2.id ASC
                    LIMIT 1
                )                  AS auto_title,
                COALESCE(t.starred, 0)       AS starred,
                t.custom_title
            FROM messages m
            LEFT JOIN thread_meta t ON t.thread_id = m.thread_id
            GROUP BY m.thread_id
            ORDER BY starred DESC, MAX(m.created_at) DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        {
            "thread_id": r["thread_id"],
            "title": (r["auto_title"] or "Untitled")[:80],
            "custom_title": r["custom_title"],
            "created_at": r["created_at"],
            "starred": bool(r["starred"]),
        }
        for r in rows
    ]

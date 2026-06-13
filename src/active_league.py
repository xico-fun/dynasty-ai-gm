"""Request-scoped active-league context.

In the multi-user world, every request operates on behalf of a specific user
in a specific league. Rather than threading league/username through every
function signature (the Sleeper tools are invoked deep inside agent runs), we
hold the active context in a ``ContextVar`` that a FastAPI dependency sets per
request. Sleeper tools read from it implicitly.

When no context is set (CLI scripts, tests, or local single-user use), we fall
back to the ``.env`` values so existing behavior is preserved.
"""
from contextvars import ContextVar
from dataclasses import dataclass


@dataclass(frozen=True)
class ActiveLeague:
    league_id: str
    username: str            # Sleeper display name
    sleeper_user_id: str | None = None


_current: ContextVar[ActiveLeague | None] = ContextVar(
    "active_league", default=None
)


def set_active_league(ctx: ActiveLeague | None) -> None:
    _current.set(ctx)


def get_active_league() -> ActiveLeague:
    """Return the active context, or fall back to the configured .env values."""
    ctx = _current.get()
    if ctx is not None:
        return ctx
    # Fallback for scripts / tests / single-user local use
    from src.config import SLEEPER_LEAGUE_ID, SLEEPER_USERNAME
    return ActiveLeague(league_id=SLEEPER_LEAGUE_ID, username=SLEEPER_USERNAME)

"""Owner strategy injection.

In single-user/local use the strategy comes from ``my_strategy.md``. In the
multi-user world each request carries the authenticated user's strategy (built
from their ``user_strategy`` row and forwarded by the Next.js layer as a
header). We hold that per-request value in a ContextVar and fall back to the
file when it's absent (CLI/tests).
"""
from contextvars import ContextVar
from pathlib import Path

_path = Path(__file__).parent.parent / "my_strategy.md"
MY_STRATEGY = _path.read_text()

_override: ContextVar[str | None] = ContextVar("strategy_override", default=None)


def set_strategy(text: str | None) -> None:
    """Set the active user's strategy for this request (None → file fallback)."""
    _override.set(text or None)


def _wrap(body: str) -> str:
    return f"""
## Owner's Dynasty Preferences (Background Context)
Use these as context to inform tone and direction — not as rules to apply
mechanically. They do not override factual analysis, real data, or hard
constraints. Do not manufacture trade suggestions simply because the owner
describes themselves as an aggressive trader.

{body}

---
"""


def get_strategy_prefix() -> str:
    """Return the formatted strategy prefix for the active request."""
    return _wrap(_override.get() or MY_STRATEGY)


# Backwards-compatible constant (file-based). Only safe where an import-time
# static value is acceptable; request-scoped code should call
# get_strategy_prefix() instead.
STRATEGY_PREFIX = _wrap(MY_STRATEGY)

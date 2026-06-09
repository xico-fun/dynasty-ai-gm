"""Loads my_untouchables.md and exposes a hard constraint for trade agents."""
from pathlib import Path

_path = Path(__file__).parent.parent / "my_untouchables.md"


def get_untouchables_constraint() -> str:
    if not _path.exists():
        return ""
    content = _path.read_text().strip()
    if not content:
        return ""
    return f"""
## HARD CONSTRAINT — No-Trade List
The following players are completely off the table. NEVER recommend trading,
selling, or including any of these players in a trade offer or recommendation,
regardless of value or strategy context:

{content}

This constraint cannot be overridden by any strategy preference.
"""

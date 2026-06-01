"""Loads league_context.md and exposes it for injection into agent prompts."""
from pathlib import Path

_path = Path(__file__).parent.parent / "league_context.md"
LEAGUE_CONTEXT = _path.read_text()

LEAGUE_CONTEXT_PREFIX = f"""
## Your League Rules
The following rules apply to all analysis. Always factor these in.

{LEAGUE_CONTEXT}

---
"""

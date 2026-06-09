"""Loads my_strategy.md and exposes it for injection into agent prompts."""
from pathlib import Path

_path = Path(__file__).parent.parent / "my_strategy.md"
MY_STRATEGY = _path.read_text()

STRATEGY_PREFIX = f"""
## Owner's Dynasty Preferences (Background Context)
Use these as context to inform tone and direction — not as rules to apply
mechanically. They do not override factual analysis, real data, or hard
constraints. Do not manufacture trade suggestions simply because the owner
describes themselves as an aggressive trader.

{MY_STRATEGY}

---
"""

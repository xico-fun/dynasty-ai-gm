"""Loads my_strategy.md and exposes it for injection into agent prompts."""
from pathlib import Path

_path = Path(__file__).parent.parent / "my_strategy.md"
MY_STRATEGY = _path.read_text()

STRATEGY_PREFIX = f"""
## User's Personal Strategy
Apply these preferences to every recommendation. Flag conflicts explicitly.

{MY_STRATEGY}

---
"""

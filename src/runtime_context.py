"""Generates a dynamic runtime context string injected after the cache breakpoint."""
from datetime import datetime


def get_runtime_context() -> str:
    now = datetime.now()
    date_str = now.strftime("%B %d, %Y")
    month = now.month

    if month in (2, 3):
        phase = "Offseason — Free Agency"
    elif month in (4, 5):
        phase = "Offseason — Draft Season"
    elif month in (6, 7):
        phase = "Offseason — OTAs / Minicamp"
    elif month == 8:
        phase = "Training Camp / Preseason"
    elif 9 <= month <= 12:
        phase = "Regular Season"
    else:
        phase = "Playoffs / Postseason"

    return (
        f"## Current Context\n"
        f"- Today: {date_str}\n"
        f"- NFL Phase: {now.year} {phase}\n"
        f"- Use {now.year} in search queries unless looking for historical data.\n"
        f"- Dynasty draft note: the {now.year} dynasty rookie draft has already "
        f"occurred. The earliest tradeable future picks are {now.year + 1} picks. "
        f"Never reference {now.year} picks as available trade assets.\n\n"
    )

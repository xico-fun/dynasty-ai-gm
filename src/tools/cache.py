"""Simple TTL cache for Sleeper API responses that change weekly."""
import time

_store: dict = {}


def get(key: str):
    entry = _store.get(key)
    if entry and time.time() < entry["expires_at"]:
        return entry["value"]
    return None


def set(key: str, value, ttl_seconds: int = 1800):
    _store[key] = {"value": value, "expires_at": time.time() + ttl_seconds}


def invalidate(key: str = None):
    """Clear one key or the entire cache."""
    if key:
        _store.pop(key, None)
    else:
        _store.clear()

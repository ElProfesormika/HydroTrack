from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

MIN_READING_HOURS = 1.0
MAX_READING_FLOW_M3H = 2000.0


def parse_ts(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    raw = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(raw)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def flow_rate_from_index(
    index_m3: float,
    timestamp: datetime,
    previous: dict[str, Any] | None,
) -> float:
    """Debit m3/h = (index - index_precedent) / delta_t (h), aligne notebook (delta en jours)."""
    if not previous:
        return 0.0
    prev_index = float(previous.get("volume") or 0)
    prev_ts = parse_ts(previous["timestamp"])
    ts = timestamp if timestamp.tzinfo else timestamp.replace(tzinfo=timezone.utc)
    delta = index_m3 - prev_index
    if delta < 0:
        delta = index_m3
    hours = max((ts - prev_ts).total_seconds() / 3600.0, MIN_READING_HOURS)
    return round(min(delta / hours, MAX_READING_FLOW_M3H), 4)

"""Implicit feedback event aggregation tasks."""

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from glean_core import get_logger
from glean_database.models import UserEntryEvent, UserEntryImplicitLabel
from glean_database.session import get_session_context

logger = get_logger(__name__)


def _normalized_dwell(active_ms: int, est_read_time_sec: int) -> float:
    if est_read_time_sec <= 0:
        return 0.0
    value = (active_ms / 1000.0) / est_read_time_sec
    return max(0.0, min(1.5, value))


async def aggregate_implicit_feedback_labels(
    ctx: dict[str, Any],
    target_date: str | None = None,
) -> dict[str, Any]:
    """Aggregate raw events into daily labels."""
    _ = ctx

    if target_date:
        day = date.fromisoformat(target_date)
    else:
        day = (datetime.now(UTC) - timedelta(days=1)).date()

    day_start = datetime.combine(day, time.min, tzinfo=UTC)
    day_end = day_start + timedelta(days=1)

    async with get_session_context() as session:
        result = await session.execute(
            select(UserEntryEvent).where(
                UserEntryEvent.occurred_at >= day_start,
                UserEntryEvent.occurred_at < day_end,
            )
        )
        events = result.scalars().all()

        grouped: dict[tuple[str, str], dict[str, Any]] = defaultdict(
            lambda: {
                "sessions": defaultdict(lambda: {"active_ms": 0, "scroll_depth_max": 0.0, "est_read_time_sec": 0}),
                "return_read_count": 0,
            }
        )

        for event in events:
            key = (str(event.user_id), str(event.entry_id))
            group = grouped[key]

            session_metrics = group["sessions"][event.session_id]
            session_metrics["active_ms"] = max(session_metrics["active_ms"], int(event.active_ms or 0))
            session_metrics["scroll_depth_max"] = max(
                session_metrics["scroll_depth_max"],
                float(event.scroll_depth_max or 0.0),
            )
            session_metrics["est_read_time_sec"] = max(
                session_metrics["est_read_time_sec"],
                int(event.est_read_time_sec or 0),
            )

            if event.event_type == "entry_return":
                group["return_read_count"] += 1

        rows: list[dict[str, Any]] = []
        for (user_id, entry_id), group in grouped.items():
            sessions = list(group["sessions"].values())
            total_sessions = len(sessions)
            if total_sessions == 0:
                continue

            quick_skip_count = 0
            effective_read_count = 0
            completion_count = 0
            total_active_ms = 0
            total_est_read_time_sec = 0.0
            dwell_sum = 0.0

            for session_metrics in sessions:
                active_ms = int(session_metrics["active_ms"])
                scroll_depth_max = float(session_metrics["scroll_depth_max"])
                est_read_time_sec = int(session_metrics["est_read_time_sec"])

                normalized = _normalized_dwell(active_ms, est_read_time_sec)
                dwell_sum += normalized

                total_active_ms += active_ms
                total_est_read_time_sec += est_read_time_sec

                if active_ms < 8000 and scroll_depth_max < 0.2:
                    quick_skip_count += 1
                if normalized >= 0.2 or scroll_depth_max >= 0.6:
                    effective_read_count += 1
                if normalized >= 0.6 and scroll_depth_max >= 0.9:
                    completion_count += 1

            rows.append(
                {
                    "user_id": user_id,
                    "entry_id": entry_id,
                    "label_date": day,
                    "total_sessions": total_sessions,
                    "quick_skip_count": quick_skip_count,
                    "effective_read_count": effective_read_count,
                    "completion_count": completion_count,
                    "return_read_count": int(group["return_read_count"]),
                    "total_active_ms": total_active_ms,
                    "total_est_read_time_sec": float(total_est_read_time_sec),
                    "avg_normalized_dwell": round(dwell_sum / total_sessions, 6),
                }
            )

        await session.execute(delete(UserEntryImplicitLabel).where(UserEntryImplicitLabel.label_date == day))

        if rows:
            stmt = insert(UserEntryImplicitLabel).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "entry_id", "label_date"],
                set_={
                    "total_sessions": stmt.excluded.total_sessions,
                    "quick_skip_count": stmt.excluded.quick_skip_count,
                    "effective_read_count": stmt.excluded.effective_read_count,
                    "completion_count": stmt.excluded.completion_count,
                    "return_read_count": stmt.excluded.return_read_count,
                    "total_active_ms": stmt.excluded.total_active_ms,
                    "total_est_read_time_sec": stmt.excluded.total_est_read_time_sec,
                    "avg_normalized_dwell": stmt.excluded.avg_normalized_dwell,
                },
            )
            await session.execute(stmt)

        await session.commit()

    logger.info(
        "Implicit feedback aggregation completed",
        extra={"target_date": day.isoformat(), "groups": len(rows), "events": len(events)},
    )

    return {
        "success": True,
        "target_date": day.isoformat(),
        "events": len(events),
        "groups": len(rows),
    }


async def scheduled_aggregate_implicit_feedback(ctx: dict[str, Any]) -> dict[str, Any]:
    """Scheduled wrapper for daily implicit feedback aggregation."""
    return await aggregate_implicit_feedback_labels(ctx)

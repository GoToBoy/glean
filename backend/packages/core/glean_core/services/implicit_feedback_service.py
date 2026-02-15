"""Implicit feedback utilities for recommendation scoring and UI guidance."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.schemas import ImplicitFeedbackConfig
from glean_database.models import UserEntry, UserEntryImplicitLabel

from .typed_config_service import TypedConfigService


class ImplicitFeedbackService:
    """Service for implicit feedback features shared across scoring paths."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self._typed_config = TypedConfigService(session)

    async def get_config(self) -> ImplicitFeedbackConfig:
        """Get implicit feedback typed config."""
        return await self._typed_config.get(ImplicitFeedbackConfig)

    async def batch_get_boosts(self, user_id: str, entry_ids: list[str]) -> dict[str, float]:
        """Compute per-entry implicit boost from recent daily label aggregates."""
        if not entry_ids:
            return {}

        config = await self.get_config()
        if not config.enabled or config.weight <= 0:
            return dict.fromkeys(entry_ids, 0.0)

        lookback_start = datetime.now(UTC).date() - timedelta(days=7)

        stmt = (
            select(
                UserEntryImplicitLabel.entry_id,
                func.sum(UserEntryImplicitLabel.total_sessions).label("total_sessions"),
                func.sum(UserEntryImplicitLabel.quick_skip_count).label("quick_skip_count"),
                func.sum(UserEntryImplicitLabel.effective_read_count).label("effective_read_count"),
                func.sum(UserEntryImplicitLabel.completion_count).label("completion_count"),
                func.sum(UserEntryImplicitLabel.return_read_count).label("return_read_count"),
                func.sum(UserEntryImplicitLabel.total_active_ms).label("total_active_ms"),
                func.sum(UserEntryImplicitLabel.total_est_read_time_sec).label("total_est_read_time_sec"),
            )
            .where(UserEntryImplicitLabel.user_id == user_id)
            .where(UserEntryImplicitLabel.entry_id.in_(entry_ids))
            .where(UserEntryImplicitLabel.label_date >= lookback_start)
            .group_by(UserEntryImplicitLabel.entry_id)
        )

        result = await self.session.execute(stmt)
        rows = result.all()

        boosts: dict[str, float] = dict.fromkeys(entry_ids, 0.0)
        for row in rows:
            entry_id = str(row.entry_id)
            total_sessions = int(row.total_sessions or 0)
            if total_sessions < config.min_events:
                boosts[entry_id] = 0.0
                continue

            quick_skip_rate = float(row.quick_skip_count or 0) / total_sessions
            effective_rate = float(row.effective_read_count or 0) / total_sessions
            completion_rate = float(row.completion_count or 0) / total_sessions
            return_rate = float(row.return_read_count or 0) / total_sessions

            total_active_sec = float(row.total_active_ms or 0) / 1000.0
            total_est_sec = float(row.total_est_read_time_sec or 0)
            normalized_dwell = 0.0
            if total_est_sec > 0:
                normalized_dwell = min(1.5, max(0.0, total_active_sec / total_est_sec))

            raw = (
                (effective_rate * 4.0)
                + (completion_rate * 4.0)
                + (return_rate * 2.0)
                + ((normalized_dwell - 0.5) * 4.0)
                - (quick_skip_rate * 6.0)
            )

            boost = max(-10.0, min(10.0, raw * config.weight))
            boosts[entry_id] = round(boost, 3)

        return boosts

    async def get_recent_explicit_feedback_count(self, user_id: str, days: int = 7) -> int:
        """Count explicit like/dislike feedback in the recent window."""
        window_start = datetime.now(UTC) - timedelta(days=days)

        stmt = (
            select(func.count())
            .select_from(UserEntry)
            .where(UserEntry.user_id == user_id)
            .where(UserEntry.is_liked.is_not(None))
            .where(UserEntry.liked_at.is_not(None))
            .where(UserEntry.liked_at >= window_start)
        )
        result = await self.session.execute(stmt)
        return int(result.scalar() or 0)

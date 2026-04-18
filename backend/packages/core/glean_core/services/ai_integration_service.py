"""Service layer for local AI integration APIs."""

from datetime import date, datetime
from typing import cast

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.schemas.ai import (
    AIDailySummaryPayload,
    AIDailySummaryResponse,
    AIEntryDetailResponse,
    AIEntrySupplementPayload,
    AIEntrySupplementResponse,
    AITodayEntriesResponse,
    AITodayEntryItem,
)
from glean_core.server_time import get_server_day_range as build_server_day_range
from glean_database.models import (
    AIDailySummary,
    AIEntrySupplement,
    Bookmark,
    Entry,
    Feed,
    Subscription,
    UserEntry,
)


class AIIntegrationService:
    """Query and persist user-scoped local AI integration data."""

    def __init__(self, session: AsyncSession):
        self.session = session

    def get_server_day_range(self, summary_date: date) -> tuple[datetime, datetime, str]:
        """Convert a server-local date to a UTC range using the server TZ setting."""
        return build_server_day_range(summary_date)

    async def get_subscribed_feed_ids(self, user_id: str) -> list[str]:
        """Return feed IDs subscribed by a user."""
        result = await self.session.execute(
            select(Subscription.feed_id).where(Subscription.user_id == user_id)
        )
        return [str(row[0]) for row in result.all()]

    async def ensure_entries_subscribed(self, user_id: str, entry_ids: set[str]) -> None:
        """Validate that all referenced entries belong to user subscriptions."""
        if not entry_ids:
            return

        feed_ids = await self.get_subscribed_feed_ids(user_id)
        if not feed_ids:
            raise ValueError("Referenced entries are not in subscribed feeds")

        result = await self.session.execute(
            select(Entry.id).where(Entry.id.in_(entry_ids), Entry.feed_id.in_(feed_ids))
        )
        allowed_ids = {str(row[0]) for row in result.all()}
        missing = entry_ids - allowed_ids
        if missing:
            raise ValueError("Referenced entries are not in subscribed feeds")

    def collect_payload_entry_ids(self, payload: AIDailySummaryPayload) -> set[str]:
        """Collect entry IDs referenced by a day summary payload."""
        entry_ids = set(payload.recommended_entry_ids)

        for highlight in payload.highlights:
            value = highlight.get("entry_id")
            if isinstance(value, str):
                entry_ids.add(value)

        for topic in payload.topics:
            values = topic.get("entry_ids")
            if isinstance(values, list):
                for value in cast(list[object], values):
                    if isinstance(value, str):
                        entry_ids.add(value)

        return entry_ids

    def serialize_supplement(self, supplement: AIEntrySupplement) -> AIEntrySupplementResponse:
        """Serialize supplement model."""
        return AIEntrySupplementResponse(
            id=supplement.id,
            user_id=supplement.user_id,
            entry_id=supplement.entry_id,
            model=supplement.model,
            summary=supplement.summary,
            key_points=supplement.key_points or [],
            tags=supplement.tags or [],
            reading_priority=supplement.reading_priority,
            reason=supplement.reason,
            metadata=supplement.metadata_json or {},
            created_at=supplement.created_at,
            updated_at=supplement.updated_at,
        )

    def serialize_daily_summary(self, summary: AIDailySummary) -> AIDailySummaryResponse:
        """Serialize daily summary model."""
        return AIDailySummaryResponse(
            id=summary.id,
            user_id=summary.user_id,
            date=summary.summary_date,
            timezone=summary.timezone,
            model=summary.model,
            title=summary.title,
            summary=summary.summary,
            highlights=summary.highlights or [],
            topics=summary.topics or [],
            recommended_entry_ids=summary.recommended_entry_ids or [],
            metadata=summary.metadata_json or {},
            created_at=summary.created_at,
            updated_at=summary.updated_at,
        )

    async def list_today_entries(
        self,
        user_id: str,
        summary_date: date,
        _timezone: str | None,
        include_content: bool,
        limit: int,
    ) -> AITodayEntriesResponse:
        """List AI-facing entries collected on a local day."""
        start_utc, end_utc, server_timezone = self.get_server_day_range(summary_date)
        feed_ids = await self.get_subscribed_feed_ids(user_id)
        if not feed_ids:
            return AITodayEntriesResponse(date=summary_date, timezone=server_timezone, total=0, items=[])

        collection_timestamp = func.coalesce(Entry.ingested_at, Entry.created_at, Entry.published_at)
        bookmark_id_subq = (
            select(Bookmark.id)
            .where(Bookmark.user_id == user_id)
            .where(Bookmark.entry_id == Entry.id)
            .correlate(Entry)
            .limit(1)
            .scalar_subquery()
        )

        stmt = (
            select(
                Entry,
                UserEntry,
                bookmark_id_subq.label("bookmark_id"),
                Feed.title.label("feed_title"),
            )
            .join(Feed, Entry.feed_id == Feed.id)
            .outerjoin(
                UserEntry,
                (Entry.id == UserEntry.entry_id) & (UserEntry.user_id == user_id),
            )
            .where(Entry.feed_id.in_(feed_ids))
            .where(collection_timestamp >= start_utc)
            .where(collection_timestamp < end_utc)
            .order_by(desc(collection_timestamp), desc(Entry.id))
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).all()
        entry_ids = [str(row[0].id) for row in rows]

        supplement_ids: set[str] = set()
        if entry_ids:
            result = await self.session.execute(
                select(AIEntrySupplement.entry_id).where(
                    AIEntrySupplement.user_id == user_id,
                    AIEntrySupplement.entry_id.in_(entry_ids),
                )
            )
            supplement_ids = {str(row[0]) for row in result.all()}

        items = [
            AITodayEntryItem(
                id=str(entry.id),
                title=str(entry.title),
                url=str(entry.url),
                author=entry.author,
                feed_id=str(entry.feed_id),
                feed_title=feed_title,
                published_at=entry.published_at,
                ingested_at=entry.ingested_at,
                summary=entry.summary,
                content=entry.content if include_content else None,
                content_available=bool(entry.content),
                is_read=bool(user_entry.is_read) if user_entry else False,
                is_bookmarked=bookmark_id is not None,
                ai_supplement_available=str(entry.id) in supplement_ids,
            )
            for entry, user_entry, bookmark_id, feed_title in rows
        ]

        return AITodayEntriesResponse(
            date=summary_date,
            timezone=server_timezone,
            total=len(items),
            items=items,
        )

    async def get_entry_detail(self, user_id: str, entry_id: str) -> AIEntryDetailResponse | None:
        """Return AI-facing entry detail if the user subscribes to the entry feed."""
        feed_ids = await self.get_subscribed_feed_ids(user_id)
        if not feed_ids:
            return None

        result = await self.session.execute(
            select(Entry, Feed.title.label("feed_title"))
            .join(Feed, Entry.feed_id == Feed.id)
            .where(Entry.id == entry_id, Entry.feed_id.in_(feed_ids))
        )
        row = result.one_or_none()
        if not row:
            return None

        entry, feed_title = row
        supplement = await self.get_entry_supplement_model(user_id, entry_id)
        return AIEntryDetailResponse(
            id=str(entry.id),
            title=str(entry.title),
            url=str(entry.url),
            author=entry.author,
            feed_id=str(entry.feed_id),
            feed_title=feed_title,
            published_at=entry.published_at,
            ingested_at=entry.ingested_at,
            summary=entry.summary,
            content=entry.content,
            content_source=entry.content_source,
            ai_supplement=self.serialize_supplement(supplement) if supplement else None,
        )

    async def upsert_daily_summary(
        self, user_id: str, payload: AIDailySummaryPayload
    ) -> AIDailySummaryResponse:
        """Upsert day-level AI summary."""
        _, _, server_timezone = self.get_server_day_range(payload.date)
        await self.ensure_entries_subscribed(user_id, self.collect_payload_entry_ids(payload))

        existing = (
            await self.session.execute(
                select(AIDailySummary).where(
                    AIDailySummary.user_id == user_id,
                    AIDailySummary.summary_date == payload.date,
                    AIDailySummary.timezone == server_timezone,
                )
            )
        ).scalar_one_or_none()

        if existing is None:
            existing = AIDailySummary(
                user_id=user_id,
                summary_date=payload.date,
                timezone=server_timezone,
            )
            self.session.add(existing)

        existing.model = payload.model
        existing.title = payload.title
        existing.summary = payload.summary
        existing.highlights = payload.highlights
        existing.topics = payload.topics
        existing.recommended_entry_ids = payload.recommended_entry_ids
        existing.metadata_json = payload.metadata
        await self.session.commit()
        await self.session.refresh(existing)
        return self.serialize_daily_summary(existing)

    async def get_daily_summary(
        self, user_id: str, summary_date: date, _timezone: str | None
    ) -> AIDailySummaryResponse | None:
        """Return day-level AI summary."""
        _, _, server_timezone = self.get_server_day_range(summary_date)
        summary = (
            await self.session.execute(
                select(AIDailySummary).where(
                    AIDailySummary.user_id == user_id,
                    AIDailySummary.summary_date == summary_date,
                    AIDailySummary.timezone == server_timezone,
                )
            )
        ).scalar_one_or_none()
        return self.serialize_daily_summary(summary) if summary else None

    async def upsert_entry_supplement(
        self, user_id: str, entry_id: str, payload: AIEntrySupplementPayload
    ) -> AIEntrySupplementResponse | None:
        """Upsert entry-level AI supplement."""
        await self.ensure_entries_subscribed(user_id, {entry_id})
        existing = await self.get_entry_supplement_model(user_id, entry_id)
        if existing is None:
            existing = AIEntrySupplement(user_id=user_id, entry_id=entry_id)
            self.session.add(existing)

        existing.model = payload.model
        existing.summary = payload.summary
        existing.key_points = payload.key_points
        existing.tags = payload.tags
        existing.reading_priority = payload.reading_priority
        existing.reason = payload.reason
        existing.metadata_json = payload.metadata
        await self.session.commit()
        await self.session.refresh(existing)
        return self.serialize_supplement(existing)

    async def get_entry_supplement_model(
        self, user_id: str, entry_id: str
    ) -> AIEntrySupplement | None:
        """Return supplement ORM model."""
        return (
            await self.session.execute(
                select(AIEntrySupplement).where(
                    AIEntrySupplement.user_id == user_id,
                    AIEntrySupplement.entry_id == entry_id,
                )
            )
        ).scalar_one_or_none()

    async def get_entry_supplement(
        self, user_id: str, entry_id: str
    ) -> AIEntrySupplementResponse | None:
        """Return serialized entry-level supplement if visible to user."""
        await self.ensure_entries_subscribed(user_id, {entry_id})
        supplement = await self.get_entry_supplement_model(user_id, entry_id)
        return self.serialize_supplement(supplement) if supplement else None

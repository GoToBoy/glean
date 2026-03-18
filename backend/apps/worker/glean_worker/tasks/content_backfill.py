"""Worker tasks for backfilling full article content on existing entries."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select

from glean_core import get_logger
from glean_core.schemas.config import EmbeddingConfig, VectorizationStatus
from glean_core.services import TypedConfigService
from glean_database.models import Entry
from glean_database.models.entry_translation import EntryTranslation
from glean_database.session import get_session_context

from .content_extraction import (
    content_is_summary_like,
    extract_entry_content_update,
    should_backfill_entry,
    strip_html_to_text,
)

logger = get_logger(__name__)


async def _is_vectorization_enabled(session) -> bool:
    """Check if vectorization is enabled and healthy."""
    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)
    return config.enabled and config.status in (
        VectorizationStatus.IDLE,
        VectorizationStatus.REBUILDING,
    )


async def enqueue_feed_content_backfill(
    ctx: dict[str, Any],
    feed_id: str,
    limit: int = 100,
    published_after: datetime | None = None,
    published_before: datetime | None = None,
    force: bool = False,
    missing_only: bool = True,
) -> dict[str, Any]:
    """Select feed entries for content backfill and enqueue one job per entry."""
    async with get_session_context() as session:
        stmt = select(Entry).where(Entry.feed_id == feed_id)
        if published_after is not None:
            stmt = stmt.where(Entry.published_at >= published_after)
        if published_before is not None:
            stmt = stmt.where(Entry.published_at <= published_before)

        stmt = stmt.order_by(Entry.published_at.desc().nullslast(), Entry.created_at.desc()).limit(limit)
        result = await session.execute(stmt)
        entries = list(result.scalars().all())

        matched = 0
        enqueued = 0
        entry_ids: list[str] = []
        for entry in entries:
            if missing_only and not should_backfill_entry(
                content=entry.content,
                summary=entry.summary,
                content_source=entry.content_source,
                content_backfill_status=entry.content_backfill_status,
                force=force,
            ):
                continue
            matched += 1
            entry_ids.append(entry.id)
            await ctx["redis"].enqueue_job("backfill_entry_content_task", entry.id, force=force)
            enqueued += 1

        logger.info(
            "Queued entry content backfill jobs",
            extra={
                "feed_id": feed_id,
                "matched": matched,
                "enqueued": enqueued,
                "force": force,
                "missing_only": missing_only,
            },
        )
        return {
            "feed_id": feed_id,
            "matched": matched,
            "enqueued": enqueued,
            "entry_ids": entry_ids,
        }


async def backfill_entry_content_task(
    ctx: dict[str, Any], entry_id: str, force: bool = False
) -> dict[str, Any]:
    """Backfill full article content for one existing entry."""
    async with get_session_context() as session:
        result = await session.execute(select(Entry).where(Entry.id == entry_id))
        entry = result.scalar_one_or_none()
        if not entry:
            return {"status": "error", "entry_id": entry_id, "message": "Entry not found"}

        if not entry.url:
            entry.content_backfill_status = "skipped"
            entry.content_backfill_error = "missing_url"
            entry.content_backfill_at = datetime.now(UTC)
            await session.commit()
            return {"status": "skipped", "entry_id": entry_id, "reason": "missing_url"}

        if not should_backfill_entry(
            content=entry.content,
            summary=entry.summary,
            content_source=entry.content_source,
            content_backfill_status=entry.content_backfill_status,
            force=force,
        ):
            entry.content_backfill_status = "skipped"
            entry.content_backfill_error = None
            entry.content_backfill_at = datetime.now(UTC)
            await session.commit()
            return {"status": "skipped", "entry_id": entry_id, "reason": "not_needed"}

        entry.content_backfill_status = "processing"
        entry.content_backfill_attempts += 1
        entry.content_backfill_error = None
        await session.commit()

        try:
            extraction = await extract_entry_content_update(entry.url)
            if not extraction.content or not extraction.source:
                entry.content_backfill_status = "failed"
                entry.content_backfill_error = extraction.error or "empty_extraction"
                entry.content_backfill_at = datetime.now(UTC)
                await session.commit()
                return {
                    "status": "failed",
                    "entry_id": entry_id,
                    "reason": entry.content_backfill_error,
                }

            old_text = strip_html_to_text(entry.content)
            new_text = strip_html_to_text(extraction.content)
            updated = False

            if force or content_is_summary_like(entry.content, entry.summary) or len(new_text) > len(old_text):
                entry.content = extraction.content
                updated = new_text != old_text

            entry.content_source = extraction.source
            entry.content_backfill_status = "done"
            entry.content_backfill_error = None
            entry.content_backfill_at = datetime.now(UTC)

            if updated:
                entry.embedding_status = "pending"
                entry.embedding_error = None
                entry.embedding_at = None
                translations_result = await session.execute(
                    select(EntryTranslation).where(EntryTranslation.entry_id == entry_id)
                )
                translations = list(translations_result.scalars().all())
                for translation in translations:
                    translation.status = "pending"
                    translation.error = None
                    translation.translated_content = None
                    translation.paragraph_translations = None

            await session.commit()

            if updated and await _is_vectorization_enabled(session):
                await ctx["redis"].enqueue_job("generate_entry_embedding", entry_id)

            return {
                "status": "success",
                "entry_id": entry_id,
                "updated": updated,
                "source": extraction.source,
            }
        except Exception as e:
            logger.exception("Entry content backfill failed", extra={"entry_id": entry_id})
            await session.rollback()

            result = await session.execute(select(Entry).where(Entry.id == entry_id))
            entry = result.scalar_one_or_none()
            if entry:
                entry.content_backfill_status = "failed"
                entry.content_backfill_error = str(e)
                entry.content_backfill_at = datetime.now(UTC)
                await session.commit()

            return {"status": "error", "entry_id": entry_id, "error": str(e)}

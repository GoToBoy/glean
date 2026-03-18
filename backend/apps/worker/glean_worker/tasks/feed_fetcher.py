"""
Feed fetcher tasks.

Background tasks for fetching and parsing RSS feeds.
"""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from arq import Retry
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core import get_logger
from glean_core.schemas.config import EmbeddingConfig, VectorizationStatus
from glean_core.services import RSSHubService, TypedConfigService
from glean_database.models import Entry, Feed, FeedStatus
from glean_database.session import get_session_context
from glean_rss import fetch_feed, parse_feed, postprocess_html
from .content_extraction import extract_entry_content_update

logger = get_logger(__name__)
MAX_FEED_ERROR_MESSAGE_LENGTH = 1000
ENTRY_COMMIT_BATCH_SIZE = 20


def _is_duplicate_feed_guid_error(error: IntegrityError) -> bool:
    """Return True when IntegrityError is the entries(feed_id,guid) unique violation."""
    return "uq_feed_guid" in str(error.orig)


def _is_duplicate_feed_guid_exception(error: Exception) -> bool:
    """Return True when exception text indicates entries(feed_id,guid) duplicate violation."""
    error_text = str(error)
    return "uq_feed_guid" in error_text and "duplicate key value" in error_text


def _is_entries_url_index_corrupted(error: Exception) -> bool:
    """Return True when PostgreSQL reports ix_entries_url index corruption."""
    error_text = str(error)
    return "IndexCorruptedError" in error_text and 'index "ix_entries_url"' in error_text


def _truncate_feed_error_message(message: str, max_length: int = MAX_FEED_ERROR_MESSAGE_LENGTH) -> str:
    """Truncate long error messages to fit feeds.fetch_error_message column."""
    if len(message) <= max_length:
        return message
    suffix = "... [truncated]"
    return f"{message[: max_length - len(suffix)]}{suffix}"


async def _is_vectorization_enabled(session: AsyncSession) -> bool:
    """Check if vectorization is enabled and healthy."""
    config_service = TypedConfigService(session)
    config = await config_service.get(EmbeddingConfig)
    return config.enabled and config.status in (
        VectorizationStatus.IDLE,
        VectorizationStatus.REBUILDING,
    )


async def fetch_feed_task(ctx: dict[str, Any], feed_id: str) -> dict[str, str | int]:
    """
    Fetch and parse a single RSS feed.

    Args:
        ctx: Worker context.
        feed_id: Feed identifier to fetch.

    Returns:
        Dictionary with fetch results.
    """
    logger.info("Starting feed fetch", extra={"feed_id": feed_id})
    async with get_session_context() as session:
        try:
            fetch_attempt_at = datetime.now(UTC)

            # Get feed from database
            stmt = select(Feed).where(Feed.id == feed_id)
            result = await session.execute(stmt)
            feed = result.scalar_one_or_none()

            if not feed:
                logger.error("Feed not found", extra={"feed_id": feed_id})
                return {"status": "error", "message": "Feed not found"}

            # Persist attempt timestamp early so long-running first syncs are visible in UI.
            feed.last_fetch_attempt_at = fetch_attempt_at
            await session.commit()

            logger.info("Fetching feed", extra={"feed_id": feed_id, "url": feed.url})

            # Build fallback sequence: source URL -> RSSHub converted URL (if available).
            rsshub_service = RSSHubService(session)
            fallback_source = feed.site_url or feed.url
            fallback_urls = await rsshub_service.convert_for_fetch(fallback_source)
            attempt_urls = [feed.url]
            for fallback_url in fallback_urls:
                if fallback_url not in attempt_urls:
                    attempt_urls.append(fallback_url)

            parsed_feed = None
            cache_headers: dict[str, str] | None = None
            used_url = feed.url
            last_error: Exception | None = None

            for idx, attempt_url in enumerate(attempt_urls):
                try:
                    logger.debug("Requesting feed", extra={"url": attempt_url})
                    use_conditional = idx == 0  # ETag/Last-Modified only for primary source URL
                    fetch_result = await fetch_feed(
                        attempt_url,
                        feed.etag if use_conditional else None,
                        feed.last_modified if use_conditional else None,
                    )

                    if fetch_result is None:
                        # Not modified (304) on primary URL.
                        logger.info(
                            "Feed not modified (304)",
                            extra={"feed_id": feed_id, "url": attempt_url},
                        )
                        # 304 means the feed was fetched successfully and unchanged.
                        # Clear previous fetch error state so admin "error" list is accurate.
                        feed.status = FeedStatus.ACTIVE
                        feed.error_count = 0
                        feed.fetch_error_message = None
                        feed.last_fetch_attempt_at = fetch_attempt_at
                        feed.last_fetch_success_at = fetch_attempt_at
                        feed.last_fetched_at = fetch_attempt_at
                        return {"status": "not_modified", "new_entries": 0}

                    logger.debug("Feed content received, parsing...", extra={"feed_id": feed_id})
                    content, headers = fetch_result
                    logger.debug("Parsing feed content...", extra={"feed_id": feed_id})
                    parsed_feed = await parse_feed(content, attempt_url)
                    cache_headers = headers
                    used_url = attempt_url
                    break
                except Exception as e:
                    last_error = e
                    logger.warning(
                        "Feed fetch attempt failed",
                        extra={"feed_id": feed_id, "attempt_url": attempt_url, "error": str(e)},
                    )
                    continue

            if parsed_feed is None:
                if last_error:
                    raise last_error
                raise ValueError("Failed to fetch and parse feed")

            if used_url != feed.url:
                logger.info(
                    "Fetched via RSSHub fallback",
                    extra={"feed_id": feed_id, "source_url": feed.url, "rsshub_url": used_url},
                )
            logger.info(
                "Parsed feed",
                extra={
                    "feed_id": feed_id,
                    "title": parsed_feed.title,
                    "entries_count": len(parsed_feed.entries),
                },
            )

            # Update feed metadata
            logger.debug(
                "Feed metadata",
                extra={
                    "feed_id": feed_id,
                    "parsed_icon_url": parsed_feed.icon_url,
                    "current_icon_url": feed.icon_url,
                },
            )
            feed.title = parsed_feed.title or feed.title
            feed.description = parsed_feed.description or feed.description
            feed.site_url = parsed_feed.site_url or feed.site_url
            feed.language = parsed_feed.language or feed.language
            feed.icon_url = parsed_feed.icon_url or feed.icon_url
            logger.debug(
                "Updated feed metadata", extra={"feed_id": feed_id, "icon_url": feed.icon_url}
            )
            feed.status = FeedStatus.ACTIVE
            feed.error_count = 0
            feed.fetch_error_message = None
            feed.last_fetch_attempt_at = fetch_attempt_at
            feed.last_fetch_success_at = fetch_attempt_at
            feed.last_fetched_at = fetch_attempt_at

            # Update cache headers
            if used_url == feed.url and cache_headers and "etag" in cache_headers:
                feed.etag = cache_headers["etag"]
            if used_url == feed.url and cache_headers and "last-modified" in cache_headers:
                feed.last_modified = cache_headers["last-modified"]

            # Process entries
            new_entries = 0
            latest_entry_time = feed.last_entry_at
            seen_guids: set[str] = set()
            pending_inserts_since_commit = 0
            vectorization_enabled = await _is_vectorization_enabled(session)

            for parsed_entry in parsed_feed.entries:
                guid = (parsed_entry.guid or "").strip()
                if guid:
                    if guid in seen_guids:
                        logger.debug(
                            "Skipping duplicate guid in feed payload",
                            extra={"feed_id": feed_id, "guid": guid},
                        )
                        continue
                    seen_guids.add(guid)

                # Determine content: fetch full text if feed only provides summary
                entry_content = parsed_entry.content
                content_source = "feed_fulltext" if parsed_entry.has_full_content else "feed_summary_only"
                content_backfill_status = "done" if parsed_entry.has_full_content else "pending"
                content_backfill_attempts = 0
                content_backfill_error = None
                content_backfill_at = None
                if not parsed_entry.has_full_content and parsed_entry.url:
                    logger.info(
                        "Entry has no full content, fetching from URL",
                        extra={"feed_id": feed_id, "url": parsed_entry.url},
                    )
                    try:
                        extraction_result = await extract_entry_content_update(parsed_entry.url)
                        content_backfill_attempts = 1
                        if extraction_result.content and extraction_result.source:
                            entry_content = extraction_result.content
                            content_source = extraction_result.source
                            content_backfill_status = "done"
                            content_backfill_at = datetime.now(UTC)
                            logger.info(
                                "Successfully extracted full text",
                                extra={
                                    "feed_id": feed_id,
                                    "content_length": len(extraction_result.content),
                                    "source": extraction_result.source,
                                },
                            )
                        else:
                            content_backfill_status = "failed"
                            content_backfill_error = extraction_result.error or "empty_extraction"
                            logger.warning(
                                "Full text extraction returned empty, using summary",
                                extra={"feed_id": feed_id},
                            )
                    except Exception as extract_err:
                        content_backfill_attempts = 1
                        content_backfill_status = "failed"
                        content_backfill_error = str(extract_err)
                        logger.warning(
                            "Full text extraction failed, using summary",
                            extra={"feed_id": feed_id, "error": str(extract_err)},
                        )
                else:
                    # Process content from feed to fix backtick formatting etc.
                    if entry_content:
                        entry_content = await postprocess_html(
                            entry_content, base_url=parsed_entry.url
                        )

                # Insert atomically to avoid duplicate-key failures under concurrent fetches.
                insert_stmt = (
                    pg_insert(Entry)
                    .values(
                        feed_id=feed.id,
                        guid=guid,
                        url=parsed_entry.url,
                        title=parsed_entry.title,
                        author=parsed_entry.author,
                        content=entry_content,
                        summary=parsed_entry.summary,
                        content_backfill_status=content_backfill_status,
                        content_backfill_attempts=content_backfill_attempts,
                        content_backfill_at=content_backfill_at,
                        content_backfill_error=content_backfill_error,
                        content_source=content_source,
                        published_at=parsed_entry.published_at,
                    )
                    .on_conflict_do_nothing(constraint="uq_feed_guid")
                    .returning(Entry.id)
                )
                try:
                    insert_result = await session.execute(insert_stmt)
                except IntegrityError as insert_error:
                    if _is_duplicate_feed_guid_error(insert_error):
                        logger.debug(
                            "Skipping duplicate entry due to guid unique constraint",
                            extra={"feed_id": feed_id, "guid": guid},
                        )
                        continue
                    raise
                inserted_entry_id = insert_result.scalar_one_or_none()

                if not inserted_entry_id:
                    continue

                new_entries += 1
                pending_inserts_since_commit += 1

                # M3: Queue embedding task for new entry (only if vectorization enabled)
                if vectorization_enabled:
                    await ctx["redis"].enqueue_job("generate_entry_embedding", inserted_entry_id)
                    logger.debug(
                        "Queued embedding task for entry",
                        extra={"feed_id": feed_id, "entry_id": inserted_entry_id},
                    )

                # Track latest entry time
                if parsed_entry.published_at and (
                    latest_entry_time is None or parsed_entry.published_at > latest_entry_time
                ):
                    latest_entry_time = parsed_entry.published_at

                if pending_inserts_since_commit >= ENTRY_COMMIT_BATCH_SIZE:
                    await session.commit()
                    pending_inserts_since_commit = 0

            # Update last_entry_at and schedule next fetch
            if latest_entry_time:
                feed.last_entry_at = latest_entry_time

            # Schedule next fetch (15 minutes from now)
            feed.next_fetch_at = datetime.now(UTC) + timedelta(minutes=15)

            logger.info(
                "Successfully fetched feed",
                extra={
                    "feed_id": feed_id,
                    "url": feed.url,
                    "new_entries": new_entries,
                    "total_entries": len(parsed_feed.entries),
                },
            )
            return {
                "status": "success",
                "feed_id": feed_id,
                "new_entries": new_entries,
                "total_entries": len(parsed_feed.entries),
            }

        except asyncio.CancelledError:
            # arq cancels the task when job_timeout is reached.
            # Log an explicit UTC timestamp to make timeout incidents easier to trace.
            logger.error(
                "Feed fetch cancelled (likely job timeout)",
                extra={
                    "feed_id": feed_id,
                    "cancelled_at_utc": datetime.now(UTC).isoformat(),
                },
            )
            raise
        except Exception as e:
            logger.exception(
                "Failed to fetch feed",
                extra={"feed_id": feed_id, "failed_at_utc": datetime.now(UTC).isoformat()},
            )
            await session.rollback()
            # Update feed error status
            stmt = select(Feed).where(Feed.id == feed_id)
            result = await session.execute(stmt)
            feed = result.scalar_one_or_none()

            if feed:
                fetch_attempt_at = datetime.now(UTC)
                feed.last_fetch_attempt_at = fetch_attempt_at
                feed.last_fetched_at = fetch_attempt_at

                # Duplicate guid is a benign idempotency race/path issue; do not count as feed failure.
                if _is_duplicate_feed_guid_exception(e):
                    logger.warning(
                        "Duplicate guid surfaced at task boundary, treating as non-fatal",
                        extra={"feed_id": feed_id},
                    )
                    feed.status = FeedStatus.ACTIVE
                    feed.error_count = 0
                    feed.fetch_error_message = None
                    feed.last_fetch_success_at = fetch_attempt_at
                    feed.next_fetch_at = datetime.now(UTC) + timedelta(minutes=15)
                    await session.commit()
                    return {"status": "success", "feed_id": feed_id, "new_entries": 0, "total_entries": 0}

                # DB index corruption is an infrastructure incident, not a per-feed content failure.
                # Keep feed enabled and avoid incrementing error_count to prevent false disablement.
                if _is_entries_url_index_corrupted(e):
                    logger.error(
                        "Detected ix_entries_url corruption; preserving feed status",
                        extra={"feed_id": feed_id},
                    )
                    feed.status = FeedStatus.ACTIVE
                    feed.fetch_error_message = (
                        "Database index ix_entries_url is corrupted. Run REINDEX INDEX CONCURRENTLY ix_entries_url."
                    )
                    feed.next_fetch_at = datetime.now(UTC) + timedelta(minutes=15)
                    await session.commit()
                    return {"status": "error", "message": "database_index_corrupted"}

                feed.error_count += 1
                feed.fetch_error_message = _truncate_feed_error_message(str(e))

                # Disable feed after 10 consecutive errors
                if feed.error_count >= 10:
                    logger.warning(
                        "Feed disabled after 10 consecutive errors",
                        extra={"feed_id": feed_id, "url": feed.url},
                    )
                    feed.status = FeedStatus.ERROR

                # Schedule retry with exponential backoff
                retry_minutes = min(60, 15 * (2 ** min(feed.error_count - 1, 5)))
                feed.next_fetch_at = datetime.now(UTC) + timedelta(minutes=retry_minutes)

                logger.info(
                    "Scheduling retry with exponential backoff",
                    extra={
                        "feed_id": feed_id,
                        "retry_minutes": retry_minutes,
                        "error_count": feed.error_count,
                    },
                )
                # Persist error status before raising Retry; otherwise context rollback
                # would discard these updates.
                await session.commit()

            # Retry the task
            logger.info("Retrying task in 5 minutes", extra={"feed_id": feed_id})
            raise Retry(defer=timedelta(minutes=5)) from None


async def fetch_all_feeds(ctx: dict[str, Any]) -> dict[str, int]:
    """
    Fetch all active feeds.

    Args:
        ctx: Worker context.

    Returns:
        Dictionary with fetch statistics.
    """
    logger.info("Starting to fetch all active feeds")
    async with get_session_context() as session:
        # Get all active feeds that are due for fetching
        now = datetime.now(UTC)
        stmt = select(Feed).where(
            Feed.status == FeedStatus.ACTIVE,
            (Feed.next_fetch_at.is_(None)) | (Feed.next_fetch_at <= now),
        )
        result = await session.execute(stmt)
        feeds = result.scalars().all()

        logger.info("Found feeds to fetch", extra={"count": len(feeds)})

        # Queue fetch tasks for each feed
        for feed in feeds:
            logger.debug("Queueing feed", extra={"feed_id": feed.id, "url": feed.url})
            await ctx["redis"].enqueue_job("fetch_feed_task", feed.id)

        logger.info("Queued feeds for fetching", extra={"count": len(feeds)})
        return {"feeds_queued": len(feeds)}


async def scheduled_fetch(ctx: dict[str, Any]) -> dict[str, int]:
    """
    Scheduled task to fetch all feeds (runs every 15 minutes).

    Args:
        ctx: Worker context.

    Returns:
        Dictionary with fetch statistics.
    """
    logger.info("Running scheduled feed fetch (every 15 minutes)")
    return await fetch_all_feeds(ctx)


# Export task functions (arq uses the exported name)
fetch_feed_task_exported = fetch_feed_task

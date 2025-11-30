"""
Feed fetcher tasks.

Background tasks for fetching and parsing RSS feeds.
"""

from datetime import datetime, timedelta, timezone

from arq import Retry
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from glean_database.models import Entry, Feed, FeedStatus
from glean_database.session import get_session
from glean_rss import fetch_feed, parse_feed


async def fetch_feed_task(ctx: dict, feed_id: str) -> dict[str, str | int]:
    """
    Fetch and parse a single RSS feed.

    Args:
        ctx: Worker context.
        feed_id: Feed identifier to fetch.

    Returns:
        Dictionary with fetch results.
    """
    async for session in get_session():
        try:
            # Get feed from database
            stmt = select(Feed).where(Feed.id == feed_id)
            result = await session.execute(stmt)
            feed = result.scalar_one_or_none()

            if not feed:
                return {"status": "error", "message": "Feed not found"}

            # Fetch feed content
            fetch_result = await fetch_feed(feed.url, feed.etag, feed.last_modified)

            if fetch_result is None:
                # Not modified (304)
                feed.last_fetched_at = datetime.now(timezone.utc)
                await session.commit()
                return {"status": "not_modified", "new_entries": 0}

            content, cache_headers = fetch_result

            # Parse feed
            parsed_feed = await parse_feed(content, feed.url)

            # Update feed metadata
            feed.title = parsed_feed.title or feed.title
            feed.description = parsed_feed.description or feed.description
            feed.site_url = parsed_feed.site_url or feed.site_url
            feed.language = parsed_feed.language or feed.language
            feed.icon_url = parsed_feed.icon_url or feed.icon_url
            feed.status = FeedStatus.ACTIVE
            feed.error_count = 0
            feed.fetch_error_message = None
            feed.last_fetched_at = datetime.now(timezone.utc)

            # Update cache headers
            if "etag" in cache_headers:
                feed.etag = cache_headers["etag"]
            if "last-modified" in cache_headers:
                feed.last_modified = cache_headers["last-modified"]

            # Process entries
            new_entries = 0
            latest_entry_time = feed.last_entry_at

            for parsed_entry in parsed_feed.entries:
                # Check if entry already exists
                stmt = select(Entry).where(
                    Entry.feed_id == feed.id, Entry.guid == parsed_entry.guid
                )
                result = await session.execute(stmt)
                existing_entry = result.scalar_one_or_none()

                if existing_entry:
                    continue

                # Create new entry
                entry = Entry(
                    feed_id=feed.id,
                    guid=parsed_entry.guid,
                    url=parsed_entry.url,
                    title=parsed_entry.title,
                    author=parsed_entry.author,
                    content=parsed_entry.content,
                    summary=parsed_entry.summary,
                    published_at=parsed_entry.published_at,
                )
                session.add(entry)
                new_entries += 1

                # Track latest entry time
                if parsed_entry.published_at:
                    if latest_entry_time is None or parsed_entry.published_at > latest_entry_time:
                        latest_entry_time = parsed_entry.published_at

            # Update last_entry_at and schedule next fetch
            if latest_entry_time:
                feed.last_entry_at = latest_entry_time

            # Schedule next fetch (15 minutes from now)
            feed.next_fetch_at = datetime.now(timezone.utc) + timedelta(minutes=15)

            await session.commit()

            return {
                "status": "success",
                "feed_id": feed_id,
                "new_entries": new_entries,
                "total_entries": len(parsed_feed.entries),
            }

        except Exception as e:
            # Update feed error status
            stmt = select(Feed).where(Feed.id == feed_id)
            result = await session.execute(stmt)
            feed = result.scalar_one_or_none()

            if feed:
                feed.error_count += 1
                feed.fetch_error_message = str(e)
                feed.last_fetched_at = datetime.now(timezone.utc)

                # Disable feed after 10 consecutive errors
                if feed.error_count >= 10:
                    feed.status = FeedStatus.ERROR

                # Schedule retry with exponential backoff
                retry_minutes = min(60, 15 * (2 ** min(feed.error_count - 1, 5)))
                feed.next_fetch_at = datetime.now(timezone.utc) + timedelta(minutes=retry_minutes)

                await session.commit()

            # Retry the task
            raise Retry(defer=timedelta(minutes=5))


async def fetch_all_feeds(ctx: dict) -> dict[str, int]:
    """
    Fetch all active feeds.

    Args:
        ctx: Worker context.

    Returns:
        Dictionary with fetch statistics.
    """
    async for session in get_session():
        # Get all active feeds that are due for fetching
        now = datetime.now(timezone.utc)
        stmt = select(Feed).where(
            Feed.status == FeedStatus.ACTIVE,
            (Feed.next_fetch_at.is_(None)) | (Feed.next_fetch_at <= now),
        )
        result = await session.execute(stmt)
        feeds = result.scalars().all()

        # Queue fetch tasks for each feed
        for feed in feeds:
            await ctx["redis"].enqueue_job("fetch_feed_task", feed.id)

        return {"feeds_queued": len(feeds)}


async def scheduled_fetch(ctx: dict) -> dict[str, int]:
    """
    Scheduled task to fetch all feeds (runs every 15 minutes).

    Args:
        ctx: Worker context.

    Returns:
        Dictionary with fetch statistics.
    """
    return await fetch_all_feeds(ctx)


# Export task functions
fetch_feed = fetch_feed_task

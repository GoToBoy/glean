"""Integration tests for admin API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from glean_database.models.bookmark import Bookmark
from glean_database.models.entry import Entry


class TestAdminDeleteFeed:
    """Regression tests for admin feed deletion."""

    @pytest.mark.asyncio
    async def test_delete_feed_preserves_entry_bookmarks_as_url_bookmarks(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        test_feed,
        test_user,
    ):
        """Deleting a feed should not violate bookmark source constraints."""
        entry = Entry(
            feed_id=test_feed.id,
            url="https://example.com/articles/delete-me",
            title="Delete Me",
            author="Test Author",
            summary="Test summary",
        )
        db_session.add(entry)
        await db_session.flush()

        # Simulate legacy entry-only bookmarks created before URL backfill.
        bookmark = Bookmark(
            user_id=test_user.id,
            entry_id=entry.id,
            url=None,
            title=entry.title,
            excerpt=entry.summary,
            snapshot_status="pending",
        )
        db_session.add(bookmark)
        await db_session.commit()

        response = await client.delete(f"/api/admin/feeds/{test_feed.id}", headers=admin_headers)

        assert response.status_code == 204

        refreshed_bookmark = await db_session.get(Bookmark, bookmark.id)
        assert refreshed_bookmark is not None
        assert refreshed_bookmark.entry_id is None
        assert refreshed_bookmark.url == entry.url

        deleted_entry = await db_session.execute(select(Entry).where(Entry.id == entry.id))
        assert deleted_entry.scalar_one_or_none() is None

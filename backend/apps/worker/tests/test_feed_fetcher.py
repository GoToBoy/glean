"""Tests for feed fetcher worker tasks."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from glean_database.models.feed import FeedStatus
from glean_worker.tasks.feed_fetcher import fetch_feed_task


class TestFetchFeedTask:
    """Test fetch_feed_task worker function."""

    @pytest.mark.asyncio
    async def test_not_modified_clears_previous_error_state(self):
        """304 response should clear prior error status and message."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = "old-etag"
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ERROR
        mock_feed.error_count = 3
        mock_feed.fetch_error_message = "Failed to fetch feed: timeout"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        mock_session = AsyncMock()
        mock_session.execute.return_value = mock_result

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=None)),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session

            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result == {"status": "not_modified", "new_entries": 0}
        assert mock_feed.status == FeedStatus.ACTIVE
        assert mock_feed.error_count == 0
        assert mock_feed.fetch_error_message is None
        assert mock_feed.last_fetch_attempt_at is not None
        assert mock_feed.last_fetch_success_at is not None
        assert mock_feed.last_fetched_at is not None

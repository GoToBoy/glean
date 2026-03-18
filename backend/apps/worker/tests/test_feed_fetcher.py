"""Tests for feed fetcher worker tasks."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from glean_database.models.feed import FeedStatus
from glean_rss.extractor import ExtractionResult
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

    @pytest.mark.asyncio
    async def test_duplicate_guid_in_single_feed_payload_is_skipped(self):
        """Duplicate guid in one fetch run should be skipped instead of failing."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None

        duplicate_guid = "https://huggingface.co/blog/transformersjs-v4"
        entry_1 = MagicMock()
        entry_1.guid = duplicate_guid
        entry_1.url = duplicate_guid
        entry_1.title = "Transformers.js v4 Preview"
        entry_1.author = None
        entry_1.content = "<p>content</p>"
        entry_1.summary = None
        entry_1.published_at = None
        entry_1.has_full_content = True

        entry_2 = MagicMock()
        entry_2.guid = duplicate_guid
        entry_2.url = duplicate_guid
        entry_2.title = "Transformers.js v4 Preview (dup)"
        entry_2.author = None
        entry_2.content = "<p>content dup</p>"
        entry_2.summary = None
        entry_2.published_at = None
        entry_2.has_full_content = True

        parsed_feed = MagicMock()
        parsed_feed.title = "Hugging Face Blog"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://huggingface.co/blog"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry_1, entry_2]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = "entry-1"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_feed_result, mock_insert_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch("glean_worker.tasks.feed_fetcher.parse_feed", new=AsyncMock(return_value=parsed_feed)),
            patch("glean_worker.tasks.feed_fetcher._is_vectorization_enabled", new=AsyncMock(return_value=False)),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result["status"] == "success"
        assert result["new_entries"] == 1
        # 1x select feed + 1x insert (duplicate payload row skipped before DB write)
        assert mock_session.execute.await_count == 2

    @pytest.mark.asyncio
    async def test_short_content_field_triggers_fulltext_extraction(self):
        """Feeds with teaser-only content fields should still fetch article body."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 0
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None
        mock_feed.title = "Old title"
        mock_feed.description = ""
        mock_feed.language = None
        mock_feed.icon_url = None

        entry = MagicMock()
        entry.guid = "entry-1"
        entry.url = "https://openai.com/index/conde-nast/"
        entry.title = "OpenAI partners with Condé Nast"
        entry.author = None
        entry.content = "<p>We’re enhancing AI-driven news discovery and delivery.</p>"
        entry.summary = "We’re enhancing AI-driven news discovery and delivery."
        entry.published_at = None
        entry.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "OpenAI News"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://openai.com/news/"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = "entry-1"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_feed_result, mock_insert_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(return_value=("<xml />", {})),
            ),
            patch("glean_worker.tasks.feed_fetcher.parse_feed", new=AsyncMock(return_value=parsed_feed)),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_and_extract_fulltext",
                new=AsyncMock(
                    return_value=ExtractionResult(
                        content="<article><p>Full article body</p></article>",
                        method="browser",
                        fetched_url="https://openai.com/index/conde-nast/",
                        status_code=200,
                        used_browser=True,
                    )
                ),
            ) as mock_extract,
            patch("glean_worker.tasks.feed_fetcher._is_vectorization_enabled", new=AsyncMock(return_value=False)),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result["status"] == "success"
        assert result["new_entries"] == 1
        mock_extract.assert_awaited_once_with("https://openai.com/index/conde-nast/")

    @pytest.mark.asyncio
    async def test_top_level_duplicate_guid_error_does_not_increment_error_count(self):
        """Duplicate guid at task boundary should be treated as non-fatal."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 4
        mock_feed.fetch_error_message = "previous"
        mock_feed.last_entry_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        duplicate_error = Exception(
            'duplicate key value violates unique constraint "uq_feed_guid"'
        )
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_result, duplicate_error, mock_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = ""
        parsed_feed.language = None
        parsed_feed.icon_url = None
        parsed_feed.entries = [MagicMock(guid="dup", url="u", title="t", author=None, content="", summary=None, published_at=None, has_full_content=True)]

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=("<xml />", {}))),
            patch("glean_worker.tasks.feed_fetcher.parse_feed", new=AsyncMock(return_value=parsed_feed)),
            patch("glean_worker.tasks.feed_fetcher._is_vectorization_enabled", new=AsyncMock(return_value=False)),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result["status"] == "success"
        assert mock_feed.error_count == 0
        assert mock_feed.status == FeedStatus.ACTIVE
        assert mock_feed.fetch_error_message is None
        assert mock_session.commit.await_count == 2

    @pytest.mark.asyncio
    async def test_index_corruption_error_keeps_feed_active_without_retry(self):
        """Index corruption should not disable feed or trigger Retry storm."""
        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ACTIVE
        mock_feed.error_count = 6
        mock_feed.fetch_error_message = None
        mock_feed.last_entry_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        corrupted_error = Exception(
            'IndexCorruptedError: ... in index "ix_entries_url"'
        )
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_result, corrupted_error, mock_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = ""
        parsed_feed.language = None
        parsed_feed.icon_url = None
        parsed_feed.entries = [MagicMock(guid="a", url="u", title="t", author=None, content="", summary=None, published_at=None, has_full_content=True)]

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=("<xml />", {}))),
            patch("glean_worker.tasks.feed_fetcher.parse_feed", new=AsyncMock(return_value=parsed_feed)),
            patch("glean_worker.tasks.feed_fetcher._is_vectorization_enabled", new=AsyncMock(return_value=False)),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result == {"status": "error", "message": "database_index_corrupted"}
        assert mock_feed.status == FeedStatus.ACTIVE
        assert mock_feed.error_count == 0
        assert "ix_entries_url is corrupted" in mock_feed.fetch_error_message
        assert mock_session.commit.await_count == 2

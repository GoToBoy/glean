"""Tests for feed fetcher worker tasks."""

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from arq import Retry

from glean_database.models.feed import FeedStatus
from glean_database.models.feed_fetch_run import FeedFetchRun
from glean_database.models.feed_fetch_stage_event import FeedFetchStageEvent
from glean_worker.tasks.feed_fetcher import fetch_all_feeds, fetch_feed_task


class TestFetchFeedTask:
    """Test fetch_feed_task worker function."""

    @staticmethod
    def _build_progress_run() -> FeedFetchRun:
        run = FeedFetchRun(
            id="run-1",
            feed_id="feed-1",
            trigger_type="manual_user",
            status="queued",
            current_stage="queue_wait",
            queue_entered_at=datetime.now(UTC),
        )
        FeedFetchStageEvent(
            run=run,
            stage_order=0,
            stage_name="queue_wait",
            status="running",
            started_at=datetime.now(UTC),
        )
        return run

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
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result["status"] == "success"
        assert result["new_entries"] == 1
        # 1x select feed + 1x insert (duplicate payload row skipped before DB write)
        assert mock_session.execute.await_count == 2


@pytest.mark.asyncio
async def test_fetch_all_feeds_creates_scheduled_runs_with_queue_depth():
    due_feed_one = MagicMock()
    due_feed_one.id = "feed-1"
    due_feed_two = MagicMock()
    due_feed_two.id = "feed-2"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [due_feed_one, due_feed_two]

    mock_session = AsyncMock()
    mock_session.execute.return_value = mock_result

    redis = AsyncMock()
    redis.enqueue_job.side_effect = [
        MagicMock(job_id="job-1"),
        MagicMock(job_id="job-2"),
    ]

    run_one = FeedFetchRun(id="run-1", feed_id="feed-1", trigger_type="scheduled", status="queued")
    run_two = FeedFetchRun(id="run-2", feed_id="feed-2", trigger_type="scheduled", status="queued")
    stage_one = FeedFetchStageEvent(
        run=run_one,
        stage_order=0,
        stage_name="queue_wait",
        status="running",
        started_at=datetime.now(UTC),
    )
    stage_two = FeedFetchStageEvent(
        run=run_two,
        stage_order=0,
        stage_name="queue_wait",
        status="running",
        started_at=datetime.now(UTC),
    )

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.feed_fetcher.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(side_effect=[(run_one, stage_one), (run_two, stage_two)]),
        ) as mock_create_run,
        patch(
            "glean_worker.tasks.feed_fetcher.find_reusable_active_feed_fetch_run",
            new=AsyncMock(side_effect=[None, None]),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session

        result = await fetch_all_feeds({"redis": redis})

    assert result == {"feeds_queued": 2}
    assert mock_create_run.await_args_list[0].kwargs["queue_depth_ahead"] == 0
    assert mock_create_run.await_args_list[1].kwargs["queue_depth_ahead"] == 1
    assert redis.enqueue_job.await_args_list[0].kwargs["run_id"] == "run-1"
    assert redis.enqueue_job.await_args_list[1].kwargs["run_id"] == "run-2"

@pytest.mark.asyncio
async def test_missing_run_id_reuses_active_queued_run():
    """Jobs without run_id should still bind to the newest active queued run."""
    progress_run = TestFetchFeedTask._build_progress_run()
    progress_run.job_id = "job-1"

    mock_feed = MagicMock()
    mock_feed.id = "feed-1"
    mock_feed.url = "https://example.com/feed.xml"
    mock_feed.site_url = None
    mock_feed.etag = "etag-1"
    mock_feed.last_modified = None
    mock_feed.status = FeedStatus.ERROR
    mock_feed.error_count = 4
    mock_feed.fetch_error_message = "old error"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_feed

    mock_progress_result = MagicMock()
    mock_progress_result.scalar_one_or_none.return_value = progress_run

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(side_effect=[mock_progress_result, mock_result])

    mock_rsshub_service = MagicMock()
    mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
        patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=None)),
        patch(
            "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
            new=AsyncMock(return_value=progress_run),
        ) as mock_find_active_run,
        patch(
            "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
            new=AsyncMock(return_value=None),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session
        result = await fetch_feed_task({"job_id": "job-1"}, feed_id="feed-1")

    assert result == {"status": "not_modified", "new_entries": 0}
    mock_find_active_run.assert_not_awaited()
    assert progress_run.status == "not_modified"
    assert progress_run.current_stage == "complete"
    assert progress_run.path_kind == "direct_feed"


@pytest.mark.asyncio
async def test_missing_run_id_and_job_id_falls_back_to_active_run_by_feed():
    """Legacy jobs without run metadata should still update the newest active run."""
    progress_run = TestFetchFeedTask._build_progress_run()

    mock_feed = MagicMock()
    mock_feed.id = "feed-1"
    mock_feed.url = "https://example.com/feed.xml"
    mock_feed.site_url = None
    mock_feed.etag = "etag-1"
    mock_feed.last_modified = None
    mock_feed.status = FeedStatus.ERROR
    mock_feed.error_count = 4
    mock_feed.fetch_error_message = "old error"

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_feed

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    mock_rsshub_service = MagicMock()
    mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
        patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=None)),
        patch(
            "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
            new=AsyncMock(return_value=progress_run),
        ) as mock_find_active_run,
        patch(
            "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
            new=AsyncMock(return_value=None),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session
        result = await fetch_feed_task({}, feed_id="feed-1")

    assert result == {"status": "not_modified", "new_entries": 0}
    mock_find_active_run.assert_awaited_once_with(mock_session, "feed-1")
    assert progress_run.status == "not_modified"
    assert progress_run.current_stage == "complete"
    assert progress_run.path_kind == "direct_feed"


class TestFetchFeedTaskProgress:
    """Additional feed fetch progress coverage."""

    _build_progress_run = staticmethod(TestFetchFeedTask._build_progress_run)

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
                "glean_worker.tasks.feed_fetcher.extract_entry_content_update",
                new=AsyncMock(
                    return_value=MagicMock(
                        content="<article><p>Full article body</p></article>",
                        source="backfill_browser",
                    )
                ),
            ) as mock_extract,
            patch("glean_worker.tasks.feed_fetcher._is_vectorization_enabled", new=AsyncMock(return_value=False)),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result["status"] == "success"
        assert result["new_entries"] == 1
        mock_extract.assert_awaited_once_with("https://openai.com/index/conde-nast/")

    @pytest.mark.asyncio
    async def test_content_extraction_failure_logs_feed_context(self):
        """Extraction warnings should include feed and entry context in the message."""
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
        entry.url = "https://example.com/posts/1"
        entry.title = "Entry"
        entry.author = None
        entry.content = "<p>short</p>"
        entry.summary = "short"
        entry.published_at = None
        entry.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://example.com"
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
            patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=("<xml />", {}))),
            patch("glean_worker.tasks.feed_fetcher.parse_feed", new=AsyncMock(return_value=parsed_feed)),
            patch(
                "glean_worker.tasks.feed_fetcher.extract_entry_content_update",
                new=AsyncMock(return_value=MagicMock(content=None, source=None, error="empty_extraction")),
            ),
            patch("glean_worker.tasks.feed_fetcher._is_vectorization_enabled", new=AsyncMock(return_value=False)),
            patch("glean_worker.tasks.feed_fetcher.logger.warning") as mock_warning,
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            await fetch_feed_task({}, feed_id="feed-1")

        mock_warning.assert_any_call(
            "Entry content extraction failed for "
            "feed_id=feed-1 feed_url=https://example.com/feed.xml "
            "entry_url=https://example.com/posts/1 reason=empty_extraction"
        )

    @pytest.mark.asyncio
    async def test_manual_refresh_enqueues_backfill_for_existing_summary_only_entry(self):
        """Manual refresh should enqueue content backfill for duplicate teaser-only entries."""
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
        entry.url = "https://example.com/posts/1"
        entry.title = "Entry"
        entry.author = None
        entry.content = "<p>short</p>"
        entry.summary = "short"
        entry.published_at = None
        entry.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://example.com"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry]

        existing_entry = MagicMock()
        existing_entry.id = "existing-entry-1"
        existing_entry.content = "<p>short</p>"
        existing_entry.summary = "short"
        existing_entry.content_source = "feed_summary_only"
        existing_entry.content_backfill_status = "failed"

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result = MagicMock()
        mock_insert_result.scalar_one_or_none.return_value = None

        mock_existing_result = MagicMock()
        mock_existing_result.scalar_one_or_none.return_value = existing_entry

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            side_effect=[mock_feed_result, mock_insert_result, mock_existing_result]
        )

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])
        mock_redis = AsyncMock()

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=("<xml />", {}))),
            patch("glean_worker.tasks.feed_fetcher.parse_feed", new=AsyncMock(return_value=parsed_feed)),
            patch("glean_worker.tasks.feed_fetcher._is_vectorization_enabled", new=AsyncMock(return_value=False)),
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task(
                {"redis": mock_redis}, feed_id="feed-1", backfill_existing_entries=True
            )

        assert result["status"] == "success"
        assert result["new_entries"] == 0
        mock_redis.enqueue_job.assert_awaited_once_with(
            "backfill_entry_content_task", "existing-entry-1", force=False
        )

    @pytest.mark.asyncio
    async def test_success_log_is_feed_level_summary(self):
        """Successful fetch logs should be a single feed-level summary message."""
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
        entry.url = "https://example.com/posts/1"
        entry.title = "Entry"
        entry.author = None
        entry.content = "<p>full</p>"
        entry.summary = None
        entry.published_at = None
        entry.has_full_content = True

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://example.com"
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
            patch("glean_worker.tasks.feed_fetcher.fetch_feed", new=AsyncMock(return_value=("<xml />", {}))),
            patch("glean_worker.tasks.feed_fetcher.parse_feed", new=AsyncMock(return_value=parsed_feed)),
            patch("glean_worker.tasks.feed_fetcher._is_vectorization_enabled", new=AsyncMock(return_value=False)),
            patch("glean_worker.tasks.feed_fetcher.logger.info") as mock_info,
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            await fetch_feed_task({}, feed_id="feed-1")

        mock_info.assert_any_call(
            "Feed fetch complete: "
            "feed_id=feed-1 url=https://example.com/feed.xml "
            "status=success new_entries=1 total_entries=1"
        )

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
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
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
            patch(
                "glean_worker.tasks.feed_fetcher.find_active_feed_fetch_run",
                new=AsyncMock(return_value=None),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1")

        assert result == {"status": "error", "message": "database_index_corrupted"}
        assert mock_feed.status == FeedStatus.ACTIVE
        assert mock_feed.error_count == 0
        assert "ix_entries_url is corrupted" in mock_feed.fetch_error_message
        assert mock_session.commit.await_count == 2

    @pytest.mark.asyncio
    async def test_cancelled_feed_logs_timeout_summary(self):
        """Cancelled feed fetches should emit a concise timeout summary."""
        mock_session = AsyncMock()
        mock_session.execute.side_effect = asyncio.CancelledError()

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.logger.error") as mock_error,
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session

            with pytest.raises(asyncio.CancelledError):
                await fetch_feed_task({}, feed_id="feed-timeout")

        mock_error.assert_called_once()
        assert "Feed fetch timed out: feed_id=feed-timeout" in mock_error.call_args.args[0]

    @pytest.mark.asyncio
    async def test_run_id_success_records_stage_transitions_and_summary(self):
        """Persisted runs should track worker stages, path kind, and summary counters."""
        progress_run = self._build_progress_run()

        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = "https://example.com"
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

        entry_full = MagicMock()
        entry_full.guid = "entry-1"
        entry_full.url = "https://example.com/posts/1"
        entry_full.title = "Entry 1"
        entry_full.author = None
        entry_full.content = "<p>full</p>"
        entry_full.summary = None
        entry_full.published_at = None
        entry_full.has_full_content = True

        entry_summary = MagicMock()
        entry_summary.guid = "entry-2"
        entry_summary.url = "https://example.com/posts/2"
        entry_summary.title = "Entry 2"
        entry_summary.author = None
        entry_summary.content = "<p>short</p>"
        entry_summary.summary = "short"
        entry_summary.published_at = None
        entry_summary.has_full_content = False

        parsed_feed = MagicMock()
        parsed_feed.title = "Feed"
        parsed_feed.description = ""
        parsed_feed.site_url = "https://example.com"
        parsed_feed.language = "en"
        parsed_feed.icon_url = None
        parsed_feed.entries = [entry_full, entry_summary]

        mock_feed_result = MagicMock()
        mock_feed_result.scalar_one_or_none.return_value = mock_feed

        mock_insert_result_1 = MagicMock()
        mock_insert_result_1.scalar_one_or_none.return_value = "entry-1"

        mock_insert_result_2 = MagicMock()
        mock_insert_result_2.scalar_one_or_none.return_value = "entry-2"

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            side_effect=[mock_feed_result, mock_insert_result_1, mock_insert_result_2]
        )

        fallback_url = "https://rsshub.example.com/github/release/openai/openai-python"
        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[fallback_url])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(side_effect=[RuntimeError("primary failed"), ("<xml />", {})]),
            ),
            patch("glean_worker.tasks.feed_fetcher.parse_feed", new=AsyncMock(return_value=parsed_feed)),
            patch(
                "glean_worker.tasks.feed_fetcher.extract_entry_content_update",
                new=AsyncMock(
                    return_value=MagicMock(
                        content="<article>full text</article>",
                        source="backfill_http",
                    )
                ),
            ),
            patch("glean_worker.tasks.feed_fetcher._is_vectorization_enabled", new=AsyncMock(return_value=False)),
            patch(
                "glean_worker.tasks.feed_fetcher.refresh_running_eta",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
                new=AsyncMock(return_value=progress_run),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task(
                {}, feed_id="feed-1", run_id="run-1", trigger_type="manual_user"
            )

        assert result["status"] == "success"
        assert progress_run.status == "success"
        assert progress_run.current_stage == "complete"
        assert progress_run.path_kind == "rsshub_fallback"
        assert progress_run.profile_key == "rsshub_fallback:github_release"
        assert progress_run.summary_json == {
            "new_entries": 2,
            "total_entries": 2,
            "summary_only_count": 1,
            "backfill_attempted_count": 1,
            "backfill_success_http_count": 1,
            "backfill_success_browser_count": 0,
            "backfill_failed_count": 0,
            "fallback_used": True,
            "used_url": fallback_url,
            "retry_minutes": None,
        }
        assert [stage.stage_name for stage in progress_run.stage_events] == [
            "queue_wait",
            "resolve_attempt_urls",
            "fetch_xml",
            "parse_feed",
            "process_entries",
            "backfill_content",
            "store_results",
            "complete",
        ]
        assert all(stage.status == "success" for stage in progress_run.stage_events)

    @pytest.mark.asyncio
    async def test_run_id_not_modified_finalizes_run(self):
        """Not-modified runs should persist completion and skip downstream stages."""
        progress_run = self._build_progress_run()

        mock_feed = MagicMock()
        mock_feed.id = "feed-1"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = "etag-1"
        mock_feed.last_modified = None
        mock_feed.status = FeedStatus.ERROR
        mock_feed.error_count = 4
        mock_feed.fetch_error_message = "old error"

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
            patch(
                "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
                new=AsyncMock(return_value=progress_run),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            result = await fetch_feed_task({}, feed_id="feed-1", run_id="run-1")

        assert result == {"status": "not_modified", "new_entries": 0}
        assert progress_run.status == "not_modified"
        assert progress_run.current_stage == "complete"
        assert progress_run.path_kind == "direct_feed"
        assert progress_run.summary_json == {
            "new_entries": 0,
            "total_entries": 0,
            "summary_only_count": 0,
            "backfill_attempted_count": 0,
            "backfill_success_http_count": 0,
            "backfill_success_browser_count": 0,
            "backfill_failed_count": 0,
            "fallback_used": False,
            "used_url": "https://example.com/feed.xml",
            "retry_minutes": None,
        }
        assert [stage.stage_name for stage in progress_run.stage_events] == [
            "queue_wait",
            "resolve_attempt_urls",
            "fetch_xml",
            "parse_feed",
            "process_entries",
            "backfill_content",
            "store_results",
            "complete",
        ]
        assert progress_run.stage_events[3].status == "skipped"
        assert progress_run.stage_events[4].status == "skipped"
        assert progress_run.stage_events[5].status == "skipped"
        assert progress_run.stage_events[6].status == "skipped"
        assert progress_run.stage_events[7].status == "success"

    @pytest.mark.asyncio
    async def test_run_id_retry_persists_error_state(self):
        """Retrying runs should persist final error details before raising Retry."""
        progress_run = self._build_progress_run()

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

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_result, mock_result])

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(side_effect=RuntimeError("network timeout")),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
                new=AsyncMock(return_value=progress_run),
            ),
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session
            with pytest.raises(Retry) as excinfo:
                await fetch_feed_task({}, feed_id="feed-1", run_id="run-1")

        assert progress_run.status == "error"
        assert progress_run.current_stage == "complete"
        assert progress_run.error_message == "network timeout"
        assert progress_run.finished_at is not None
        assert progress_run.summary_json["retry_minutes"] == 15
        assert [stage.stage_name for stage in progress_run.stage_events] == [
            "queue_wait",
            "resolve_attempt_urls",
            "fetch_xml",
            "parse_feed",
            "process_entries",
            "backfill_content",
            "store_results",
            "complete",
        ]
        assert progress_run.stage_events[2].status == "error"
        assert progress_run.stage_events[3].status == "skipped"
        assert progress_run.stage_events[4].status == "skipped"
        assert progress_run.stage_events[5].status == "skipped"
        assert progress_run.stage_events[6].status == "skipped"
        assert progress_run.stage_events[7].status == "error"
        assert excinfo.value.defer_score == int(timedelta(minutes=15).total_seconds() * 1000)

    @pytest.mark.asyncio
    async def test_run_id_timeout_finalizes_run(self):
        """Timed out runs should be finalized instead of staying in progress."""
        progress_run = self._build_progress_run()

        mock_feed = MagicMock()
        mock_feed.id = "feed-timeout"
        mock_feed.url = "https://example.com/feed.xml"
        mock_feed.site_url = None
        mock_feed.etag = None
        mock_feed.last_modified = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_feed

        mock_session = AsyncMock()
        mock_session.execute.return_value = mock_result

        mock_rsshub_service = MagicMock()
        mock_rsshub_service.convert_for_fetch = AsyncMock(return_value=[])

        with (
            patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
            patch("glean_worker.tasks.feed_fetcher.RSSHubService", return_value=mock_rsshub_service),
            patch(
                "glean_worker.tasks.feed_fetcher.fetch_feed",
                new=AsyncMock(side_effect=asyncio.CancelledError()),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.refresh_running_eta",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetch_progress.trim_feed_fetch_run_history",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "glean_worker.tasks.feed_fetcher.load_feed_fetch_run",
                new=AsyncMock(return_value=progress_run),
            ),
            patch("glean_worker.tasks.feed_fetcher.logger.error") as mock_error,
        ):
            mock_ctx.return_value.__aenter__.return_value = mock_session

            with pytest.raises(asyncio.CancelledError):
                await fetch_feed_task({}, feed_id="feed-timeout", run_id="run-1")

        mock_error.assert_called_once()
        assert progress_run.status == "error"
        assert progress_run.current_stage == "complete"
        assert progress_run.finished_at is not None
        assert progress_run.stage_events[-1].stage_name == "complete"
        assert progress_run.stage_events[-1].status == "error"

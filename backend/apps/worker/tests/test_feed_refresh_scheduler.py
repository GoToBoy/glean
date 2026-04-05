"""Tests for scheduled feed refresh dedupe and interval behavior."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from glean_database.models.feed_fetch_run import FeedFetchRun
from glean_worker.config import Settings
from glean_worker.main import get_oss_cron_jobs
from glean_worker.tasks.feed_fetcher import fetch_all_feeds


@pytest.mark.asyncio
async def test_fetch_all_feeds_skips_feed_with_active_run():
    due_feed_one = MagicMock()
    due_feed_one.id = "feed-1"
    due_feed_two = MagicMock()
    due_feed_two.id = "feed-2"

    due_feeds_result = MagicMock()
    due_feeds_result.scalars.return_value.all.return_value = [due_feed_one, due_feed_two]

    active_run_result = MagicMock()
    active_run_result.scalar_one_or_none.return_value = FeedFetchRun(
        id="run-active",
        feed_id="feed-1",
        job_id="job-active",
        trigger_type="scheduled",
        status="queued",
        current_stage="queue_wait",
        queue_entered_at=datetime.now(UTC),
    )

    no_active_run_result = MagicMock()
    no_active_run_result.scalar_one_or_none.return_value = None

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(
        side_effect=[due_feeds_result, active_run_result, no_active_run_result]
    )
    mock_session.add = MagicMock()

    redis = AsyncMock()
    redis.enqueue_job.return_value = MagicMock(job_id="job-2")

    run_two = FeedFetchRun(id="run-2", feed_id="feed-2", trigger_type="scheduled", status="queued")
    stage_two = MagicMock()

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.feed_fetcher.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(return_value=(run_two, stage_two)),
        ) as mock_create_run,
        patch(
            "glean_worker.tasks.feed_fetcher.find_reusable_active_feed_fetch_run",
            new=AsyncMock(side_effect=[active_run_result.scalar_one_or_none.return_value, None]),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session

        result = await fetch_all_feeds({"redis": redis})

    assert result == {"feeds_queued": 1}
    mock_create_run.assert_awaited_once()
    redis.enqueue_job.assert_awaited_once()
    assert redis.enqueue_job.await_args.args[1] == "feed-2"


@pytest.mark.asyncio
async def test_fetch_all_feeds_requeues_feed_when_active_run_is_stale():
    due_feed = MagicMock()
    due_feed.id = "feed-1"

    due_feeds_result = MagicMock()
    due_feeds_result.scalars.return_value.all.return_value = [due_feed]

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=due_feeds_result)
    mock_session.add = MagicMock()

    redis = AsyncMock()
    redis.enqueue_job.return_value = MagicMock(job_id="job-new")

    run = FeedFetchRun(id="run-new", feed_id="feed-1", trigger_type="scheduled", status="queued")
    stage_event = MagicMock()

    with (
        patch("glean_worker.tasks.feed_fetcher.get_session_context") as mock_ctx,
        patch(
            "glean_worker.tasks.feed_fetcher.find_reusable_active_feed_fetch_run",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "glean_worker.tasks.feed_fetcher.create_estimated_queued_feed_fetch_run",
            new=AsyncMock(return_value=(run, stage_event)),
        ),
    ):
        mock_ctx.return_value.__aenter__.return_value = mock_session

        result = await fetch_all_feeds({"redis": redis})

    assert result == {"feeds_queued": 1}
    redis.enqueue_job.assert_awaited_once()


def test_worker_settings_default_to_twelve_hour_refresh_interval():
    settings = Settings()

    assert settings.feed_refresh_interval_minutes == 720


def test_worker_settings_allow_refresh_interval_override():
    settings = Settings(feed_refresh_interval_minutes=360)

    assert settings.feed_refresh_interval_minutes == 360


def test_get_oss_cron_jobs_uses_twelve_hour_feed_schedule():
    cron_jobs = get_oss_cron_jobs()

    feed_job = cron_jobs[0]

    assert feed_job.minute == 0
    assert feed_job.hour == {0, 12}

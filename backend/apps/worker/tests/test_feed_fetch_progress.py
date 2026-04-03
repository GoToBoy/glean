"""Tests for persisted feed fetch progress helpers."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from glean_database.models.feed_fetch_run import FeedFetchRun
from glean_database.models.feed_fetch_stage_event import FeedFetchStageEvent
from glean_worker.tasks.feed_fetch_progress import (
    FEED_FETCH_STAGE_SEQUENCE,
    advance_feed_fetch_stage,
    classify_feed_fetch_path_kind,
    estimate_run_duration,
    finalize_feed_fetch_run,
    get_profile_key_for_path,
    start_feed_fetch_run,
    trim_feed_fetch_run_history,
)


def _build_queued_run() -> FeedFetchRun:
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
async def test_run_lifecycle_records_stage_sequence():
    session = AsyncMock()
    run = _build_queued_run()

    active_stage = await start_feed_fetch_run(session, run)
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "fetch_xml",
        summary="resolved attempt URLs",
        metrics_json={"attempt_url_count": 2},
    )
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "parse_feed",
    )
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "process_entries",
    )
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "backfill_content",
    )
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "store_results",
    )
    active_stage = await advance_feed_fetch_stage(
        session,
        run,
        active_stage,
        "complete",
        summary="stored feed results",
        metrics_json={"new_entries": 2},
    )
    await finalize_feed_fetch_run(
        session,
        run,
        active_stage,
        run_status="success",
        summary_json={
            "new_entries": 2,
            "total_entries": 3,
            "summary_only_count": 1,
            "backfill_attempted_count": 1,
            "backfill_success_http_count": 1,
            "backfill_success_browser_count": 0,
            "backfill_failed_count": 0,
            "fallback_used": False,
            "used_url": "https://example.com/feed.xml",
            "retry_minutes": None,
        },
    )

    assert [stage.stage_name for stage in run.stage_events] == FEED_FETCH_STAGE_SEQUENCE
    assert run.stage_events[0].status == "success"
    assert run.stage_events[-1].status == "success"
    assert run.status == "success"
    assert run.current_stage == "complete"
    assert run.started_at is not None
    assert run.finished_at is not None


@pytest.mark.asyncio
async def test_start_feed_fetch_run_resets_completed_retry_lifecycle():
    session = AsyncMock()
    run = _build_queued_run()
    run.status = "error"
    run.current_stage = "complete"
    run.finished_at = datetime.now(UTC)
    run.summary_json = {"retry_minutes": 15}
    run.error_message = "network timeout"

    active_stage = await start_feed_fetch_run(session, run)

    assert active_stage is not None
    assert run.status == "in_progress"
    assert run.current_stage == "resolve_attempt_urls"
    assert run.finished_at is None
    assert run.summary_json is None
    assert run.error_message is None
    assert [stage.stage_name for stage in run.stage_events] == [
        "queue_wait",
        "resolve_attempt_urls",
    ]


def test_path_classification_and_profile_key():
    fallback_url = "https://rsshub.example.com/github/release/openai/openai-python"

    assert (
        classify_feed_fetch_path_kind(
            feed_url="https://example.com/feed.xml",
            used_url="https://example.com/feed.xml",
            fallback_urls=[fallback_url],
        )
        == "direct_feed"
    )
    assert get_profile_key_for_path("direct_feed", "https://example.com/feed.xml") == "direct:example.com"

    assert (
        classify_feed_fetch_path_kind(
            feed_url="https://example.com/feed.xml",
            used_url=fallback_url,
            fallback_urls=[fallback_url],
        )
        == "rsshub_fallback"
    )
    assert (
        get_profile_key_for_path("rsshub_fallback", fallback_url)
        == "rsshub_fallback:github_release"
    )

    assert (
        classify_feed_fetch_path_kind(
            feed_url=fallback_url,
            used_url=fallback_url,
            fallback_urls=[],
        )
        == "rsshub_primary"
    )
    assert (
        get_profile_key_for_path("rsshub_primary", fallback_url)
        == "rsshub_primary:github_release"
    )


def test_eta_prefers_feed_history_then_profile_history_then_global_defaults():
    feed_runs = [
        FeedFetchRun(
            feed_id="feed-1",
            trigger_type="manual_user",
            status="success",
            path_kind="rsshub_primary",
            profile_key="rsshub_primary:github_release",
            started_at=datetime(2026, 4, 3, 12, 0, tzinfo=UTC),
            finished_at=datetime(2026, 4, 3, 12, 2, tzinfo=UTC),
        ),
        FeedFetchRun(
            feed_id="feed-1",
            trigger_type="manual_user",
            status="success",
            path_kind="rsshub_primary",
            profile_key="rsshub_primary:github_release",
            started_at=datetime(2026, 4, 3, 12, 10, tzinfo=UTC),
            finished_at=datetime(2026, 4, 3, 12, 13, tzinfo=UTC),
        ),
    ]
    profile_runs = [
        FeedFetchRun(
            feed_id="feed-x",
            trigger_type="manual_user",
            status="success",
            path_kind="rsshub_primary",
            profile_key="rsshub_primary:github_release",
            started_at=datetime(2026, 4, 3, 11, 0, tzinfo=UTC),
            finished_at=datetime(2026, 4, 3, 11, 8, tzinfo=UTC),
        ),
        FeedFetchRun(
            feed_id="feed-y",
            trigger_type="manual_user",
            status="success",
            path_kind="rsshub_primary",
            profile_key="rsshub_primary:github_release",
            started_at=datetime(2026, 4, 3, 11, 10, tzinfo=UTC),
            finished_at=datetime(2026, 4, 3, 11, 18, tzinfo=UTC),
        ),
        FeedFetchRun(
            feed_id="feed-z",
            trigger_type="manual_user",
            status="success",
            path_kind="rsshub_primary",
            profile_key="rsshub_primary:github_release",
            started_at=datetime(2026, 4, 3, 11, 20, tzinfo=UTC),
            finished_at=datetime(2026, 4, 3, 11, 28, tzinfo=UTC),
        ),
    ]

    estimate = estimate_run_duration(
        path_kind="rsshub_primary",
        feed_runs=feed_runs,
        profile_runs=profile_runs,
    )
    assert estimate["source"] == "profile"
    assert estimate["path_kind"] == "rsshub_primary"
    assert estimate["predicted_run_duration"].total_seconds() == 8 * 60

    estimate = estimate_run_duration(
        path_kind="rsshub_primary",
        feed_runs=feed_runs + [profile_runs[0]],
        profile_runs=profile_runs,
    )
    assert estimate["source"] == "feed"

    estimate = estimate_run_duration(path_kind="direct_feed", feed_runs=[], profile_runs=[])
    assert estimate["source"] == "global"


@pytest.mark.asyncio
async def test_trim_feed_fetch_run_history_keeps_latest_ten():
    session = AsyncMock(spec=AsyncSession)
    recent_runs = [
        FeedFetchRun(
            id=f"run-{index}",
            feed_id="feed-1",
            trigger_type="manual_user",
            status="success",
        )
        for index in range(12)
    ]
    execute_result = AsyncMock()
    execute_result.scalars.return_value.all.return_value = recent_runs
    session.execute.return_value = execute_result

    await trim_feed_fetch_run_history(session, "feed-1", keep_last=10)

    deleted_ids = [call.args[0].id for call in session.delete.await_args_list]
    assert deleted_ids == ["run-10", "run-11"]

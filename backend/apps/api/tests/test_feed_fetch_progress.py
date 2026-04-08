"""Unit tests for feed fetch progress reconciliation helpers."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from glean_api.feed_fetch_progress import mark_active_run_as_stale
from glean_database.models.feed_fetch_run import FeedFetchRun
from glean_database.models.feed_fetch_stage_event import FeedFetchStageEvent


def _build_stage(
    run: FeedFetchRun,
    *,
    stage_order: int,
    stage_name: str,
    status: str,
    started_at: datetime,
    finished_at: datetime | None = None,
    summary: str | None = None,
) -> FeedFetchStageEvent:
    return FeedFetchStageEvent(
        run=run,
        stage_order=stage_order,
        stage_name=stage_name,
        status=status,
        started_at=started_at,
        finished_at=finished_at,
        summary=summary,
    )


async def test_mark_active_run_as_stale_uses_refreshed_stage_events_for_completion_stage() -> None:
    now = datetime.now(UTC)
    stale_run = FeedFetchRun(
        id="run-1",
        feed_id="feed-1",
        job_id="job-1",
        trigger_type="manual_user",
        status="in_progress",
        current_stage="resolve_attempt_urls",
        queue_entered_at=now - timedelta(minutes=2),
        started_at=now - timedelta(minutes=1),
    )
    _build_stage(
        stale_run,
        stage_order=0,
        stage_name="queue_wait",
        status="success",
        started_at=now - timedelta(minutes=2),
        finished_at=now - timedelta(minutes=1),
        summary="Worker started processing the queued run.",
    )
    _build_stage(
        stale_run,
        stage_order=1,
        stage_name="resolve_attempt_urls",
        status="running",
        started_at=now - timedelta(minutes=1),
    )

    refreshed_run = FeedFetchRun(
        id="run-1",
        feed_id="feed-1",
        job_id="job-1",
        trigger_type="manual_user",
        status="in_progress",
        current_stage="fetch_xml",
        queue_entered_at=now - timedelta(minutes=2),
        started_at=now - timedelta(minutes=1),
    )
    _build_stage(
        refreshed_run,
        stage_order=0,
        stage_name="queue_wait",
        status="success",
        started_at=now - timedelta(minutes=2),
        finished_at=now - timedelta(minutes=1),
        summary="Worker started processing the queued run.",
    )
    _build_stage(
        refreshed_run,
        stage_order=1,
        stage_name="resolve_attempt_urls",
        status="success",
        started_at=now - timedelta(minutes=1),
        finished_at=now - timedelta(seconds=45),
        summary="Resolved candidate feed URLs.",
    )
    _build_stage(
        refreshed_run,
        stage_order=2,
        stage_name="fetch_xml",
        status="running",
        started_at=now - timedelta(seconds=30),
    )

    session = AsyncMock()
    session.add = MagicMock()

    with patch(
        "glean_api.feed_fetch_progress.reload_feed_fetch_run",
        new=AsyncMock(return_value=refreshed_run),
    ) as reload_run:
        await mark_active_run_as_stale(
            session,
            stale_run,
            reason="job_not_found",
            summary="Persisted run was reconciled after arq reported not_found.",
            public_diagnostic="Worker job is no longer available.",
        )

    reload_run.assert_awaited_once_with(session, "run-1", include_stages=True)
    assert refreshed_run.status == "error"
    assert refreshed_run.current_stage == "complete"
    assert [(stage.stage_order, stage.stage_name) for stage in refreshed_run.stage_events] == [
        (0, "queue_wait"),
        (1, "resolve_attempt_urls"),
        (2, "fetch_xml"),
        (3, "complete"),
    ]
    assert refreshed_run.stage_events[-2].status == "error"
    assert refreshed_run.stage_events[-1].status == "error"
    session.commit.assert_awaited_once()

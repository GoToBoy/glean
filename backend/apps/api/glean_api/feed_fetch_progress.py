"""Helpers for persisted feed fetch run lifecycle management."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from heapq import heapify, heappop, heappush
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from glean_database.models import Feed, FeedFetchRun, FeedFetchStageEvent

from .config import settings

DEFAULT_INITIAL_QUEUE_DELAY = timedelta(seconds=30)
DEFAULT_INITIAL_RUN_DURATION = timedelta(minutes=2)
QUEUE_STAGE_NAME = "queue_wait"
QUEUE_STAGE_STATUS = "running"
COMPLETED_RUN_STATUSES = {"success", "not_modified", "error"}
ACTIVE_RUN_STATUSES = {"queued", "in_progress"}


def compute_initial_eta_fields(
    queued_at: datetime,
    queue_depth_ahead: int = 0,
    predicted_run_duration: timedelta = DEFAULT_INITIAL_RUN_DURATION,
    predicted_wait_duration: timedelta | None = None,
) -> tuple[datetime, datetime]:
    """Compute lightweight initial ETA values for a newly queued run."""
    if predicted_wait_duration is None:
        wait_seconds = max(queue_depth_ahead, 0) * int(DEFAULT_INITIAL_QUEUE_DELAY.total_seconds())
        predicted_wait_duration = timedelta(seconds=wait_seconds)
    predicted_start_at = queued_at + predicted_wait_duration
    predicted_finish_at = predicted_start_at + predicted_run_duration
    return predicted_start_at, predicted_finish_at


def create_queued_feed_fetch_run(
    feed_id: str,
    trigger_type: str,
    queue_depth_ahead: int = 0,
    path_kind: str | None = None,
    profile_key: str | None = None,
    predicted_run_duration: timedelta = DEFAULT_INITIAL_RUN_DURATION,
    predicted_wait_duration: timedelta | None = None,
) -> tuple[FeedFetchRun, FeedFetchStageEvent]:
    """Build a queued run and its initial queue stage event."""
    now = datetime.now(UTC)
    predicted_start_at, predicted_finish_at = compute_initial_eta_fields(
        queued_at=now,
        queue_depth_ahead=queue_depth_ahead,
        predicted_run_duration=predicted_run_duration,
        predicted_wait_duration=predicted_wait_duration,
    )
    run = FeedFetchRun(
        feed_id=feed_id,
        trigger_type=trigger_type,
        status="queued",
        current_stage=QUEUE_STAGE_NAME,
        path_kind=path_kind,
        profile_key=profile_key,
        queue_entered_at=now,
        predicted_start_at=predicted_start_at,
        predicted_finish_at=predicted_finish_at,
    )
    stage_event = FeedFetchStageEvent(
        run=run,
        stage_order=0,
        stage_name=QUEUE_STAGE_NAME,
        status=QUEUE_STAGE_STATUS,
        started_at=now,
    )
    return run, stage_event


async def create_estimated_queued_feed_fetch_run(
    session: AsyncSession,
    *,
    feed_id: str,
    trigger_type: str,
    queue_depth_ahead: int = 0,
) -> tuple[FeedFetchRun, FeedFetchStageEvent]:
    """Build a queued run using lightweight history-calibrated ETA defaults."""
    feed = await session.get(Feed, feed_id)
    path_kind, profile_key = await infer_eta_bucket(session, feed_id, feed.url if feed else None)
    duration_estimate = await estimate_run_duration_for_feed(
        session,
        feed_id=feed_id,
        path_kind=path_kind,
        profile_key=profile_key,
    )
    predicted_wait_duration = await estimate_queue_wait_duration(
        session,
        predicted_run_duration=duration_estimate["predicted_run_duration"],
        queue_depth_ahead=queue_depth_ahead,
    )
    run, stage_event = create_queued_feed_fetch_run(
        feed_id=feed_id,
        trigger_type=trigger_type,
        queue_depth_ahead=queue_depth_ahead,
        path_kind=path_kind,
        profile_key=profile_key,
        predicted_run_duration=duration_estimate["predicted_run_duration"],
        predicted_wait_duration=predicted_wait_duration,
    )
    await trim_feed_fetch_run_history(session, feed_id, keep_last=9)
    return run, stage_event


async def estimate_run_duration_for_feed(
    session: AsyncSession,
    *,
    feed_id: str,
    path_kind: str | None,
    profile_key: str | None,
) -> dict[str, object]:
    """Estimate one run duration from feed history, profile history, or global default."""
    feed_runs_result = await session.execute(
        select(FeedFetchRun)
        .where(
            FeedFetchRun.feed_id == feed_id,
            FeedFetchRun.status.in_(COMPLETED_RUN_STATUSES),
            FeedFetchRun.started_at.is_not(None),
            FeedFetchRun.finished_at.is_not(None),
            FeedFetchRun.path_kind == path_kind,
        )
        .order_by(FeedFetchRun.created_at.desc())
        .limit(10)
    )
    feed_runs = feed_runs_result.scalars().all()
    if path_kind and len(feed_runs) >= 3:
        return {
            "source": "feed",
            "path_kind": path_kind,
            "predicted_run_duration": _weighted_average_run_duration(feed_runs),
        }

    profile_runs: list[FeedFetchRun] = []
    if profile_key:
        profile_runs_result = await session.execute(
            select(FeedFetchRun)
            .where(
                FeedFetchRun.profile_key == profile_key,
                FeedFetchRun.status.in_(COMPLETED_RUN_STATUSES),
                FeedFetchRun.started_at.is_not(None),
                FeedFetchRun.finished_at.is_not(None),
            )
            .order_by(FeedFetchRun.created_at.desc())
            .limit(10)
        )
        profile_runs = profile_runs_result.scalars().all()
        if profile_runs:
            return {
                "source": "profile",
                "path_kind": path_kind,
                "predicted_run_duration": _weighted_average_run_duration(profile_runs),
            }

    return {
        "source": "global",
        "path_kind": path_kind,
        "predicted_run_duration": DEFAULT_INITIAL_RUN_DURATION,
    }


async def estimate_queue_wait_duration(
    session: AsyncSession,
    *,
    predicted_run_duration: timedelta,
    queue_depth_ahead: int = 0,
) -> timedelta:
    """Estimate queue wait using active runs and worker concurrency."""
    now = datetime.now(UTC)
    result = await session.execute(
        select(FeedFetchRun)
        .where(FeedFetchRun.status.in_(ACTIVE_RUN_STATUSES))
        .order_by(
            FeedFetchRun.started_at.is_(None),
            FeedFetchRun.queue_entered_at.asc().nulls_last(),
            FeedFetchRun.created_at.asc(),
        )
    )
    active_runs = result.scalars().all()
    remaining_durations = [_remaining_run_duration(run, now) for run in active_runs]

    if queue_depth_ahead > len(active_runs):
        default_duration = max(predicted_run_duration, DEFAULT_INITIAL_QUEUE_DELAY)
        remaining_durations.extend([default_duration] * (queue_depth_ahead - len(active_runs)))

    if not remaining_durations:
        return timedelta(0)

    worker_slots = max(settings.worker_max_jobs, 1)
    slot_available_seconds = [0.0] * worker_slots
    heapify(slot_available_seconds)

    for duration in remaining_durations:
        available_at = heappop(slot_available_seconds)
        heappush(slot_available_seconds, available_at + max(duration.total_seconds(), 0.0))

    return timedelta(seconds=min(slot_available_seconds))


async def infer_eta_bucket(
    session: AsyncSession,
    feed_id: str,
    feed_url: str | None,
) -> tuple[str | None, str | None]:
    """Infer the best available path/profile bucket for a newly queued run."""
    latest_result = await session.execute(
        select(FeedFetchRun)
        .where(
            FeedFetchRun.feed_id == feed_id,
            FeedFetchRun.path_kind.is_not(None),
        )
        .order_by(FeedFetchRun.created_at.desc())
        .limit(1)
    )
    latest_run = latest_result.scalar_one_or_none()
    if latest_run and latest_run.path_kind:
        return latest_run.path_kind, latest_run.profile_key

    if not feed_url:
        return None, None

    host = (urlparse(feed_url).hostname or "").lower()
    if "rsshub" in host:
        route_family = _derive_rsshub_route_family(urlparse(feed_url).path)
        return "rsshub_primary", f"rsshub_primary:{route_family}" if route_family else None
    return "direct_feed", f"direct:{host}" if host else None


def serialize_feed_fetch_stage_event(stage_event: FeedFetchStageEvent) -> dict[str, Any]:
    """Serialize one persisted stage event for API responses."""
    return {
        "id": stage_event.id,
        "stage_order": stage_event.stage_order,
        "stage_name": stage_event.stage_name,
        "status": stage_event.status,
        "started_at": stage_event.started_at.isoformat() if stage_event.started_at else None,
        "finished_at": stage_event.finished_at.isoformat() if stage_event.finished_at else None,
        "summary": stage_event.summary,
        "metrics_json": stage_event.metrics_json,
    }


def serialize_feed_fetch_run(
    run: FeedFetchRun,
    *,
    next_fetch_at: datetime | None = None,
    last_fetch_attempt_at: datetime | None = None,
    last_fetch_success_at: datetime | None = None,
    last_fetched_at: datetime | None = None,
    include_stages: bool = True,
) -> dict[str, Any]:
    """Serialize one persisted feed fetch run for API responses."""
    payload: dict[str, Any] = {
        "id": run.id,
        "feed_id": run.feed_id,
        "job_id": run.job_id,
        "trigger_type": run.trigger_type,
        "status": run.status,
        "current_stage": run.current_stage,
        "path_kind": run.path_kind,
        "profile_key": run.profile_key,
        "queue_entered_at": run.queue_entered_at.isoformat() if run.queue_entered_at else None,
        "predicted_start_at": run.predicted_start_at.isoformat() if run.predicted_start_at else None,
        "predicted_finish_at": run.predicted_finish_at.isoformat() if run.predicted_finish_at else None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "summary_json": run.summary_json,
        "error_message": run.error_message,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "updated_at": run.updated_at.isoformat() if run.updated_at else None,
        "next_fetch_at": next_fetch_at.isoformat() if next_fetch_at else None,
        "last_fetch_attempt_at": last_fetch_attempt_at.isoformat() if last_fetch_attempt_at else None,
        "last_fetch_success_at": last_fetch_success_at.isoformat() if last_fetch_success_at else None,
        "last_fetched_at": last_fetched_at.isoformat() if last_fetched_at else None,
    }
    if include_stages:
        payload["stages"] = [
            serialize_feed_fetch_stage_event(stage_event) for stage_event in run.stage_events
        ]
    else:
        payload["stages"] = []
    return payload


async def load_latest_feed_fetch_runs(
    session: AsyncSession,
    feed_ids: list[str],
) -> dict[str, FeedFetchRun]:
    """Load the latest persisted run snapshot for each requested feed."""
    if not feed_ids:
        return {}

    result = await session.execute(
        select(FeedFetchRun)
        .where(FeedFetchRun.feed_id.in_(feed_ids))
        .order_by(FeedFetchRun.feed_id, FeedFetchRun.created_at.desc())
    )
    latest_by_feed: dict[str, FeedFetchRun] = {}
    for run in result.scalars().all():
        latest_by_feed.setdefault(run.feed_id, run)
    return latest_by_feed


def _weighted_average_run_duration(runs: list[FeedFetchRun]) -> timedelta:
    durations = [
        (run.finished_at - run.started_at).total_seconds()
        for run in runs
        if run.started_at is not None and run.finished_at is not None
    ]
    if not durations:
        return DEFAULT_INITIAL_RUN_DURATION
    weighted_total = 0.0
    total_weight = 0.0
    for index, duration in enumerate(durations):
        weight = len(durations) - index
        weighted_total += duration * weight
        total_weight += weight
    return timedelta(seconds=weighted_total / total_weight)


def _remaining_run_duration(run: FeedFetchRun, now: datetime) -> timedelta:
    if run.status == "in_progress":
        if run.predicted_finish_at and run.predicted_finish_at > now:
            return run.predicted_finish_at - now
        if run.started_at and run.predicted_start_at and run.predicted_finish_at:
            predicted_total = run.predicted_finish_at - run.predicted_start_at
            elapsed = max(now - run.started_at, timedelta(0))
            return max(predicted_total - elapsed, timedelta(seconds=5))
        return DEFAULT_INITIAL_RUN_DURATION

    if run.predicted_start_at and run.predicted_finish_at:
        return max(run.predicted_finish_at - run.predicted_start_at, DEFAULT_INITIAL_QUEUE_DELAY)
    return DEFAULT_INITIAL_RUN_DURATION


def _derive_rsshub_route_family(path: str) -> str | None:
    segments = [segment for segment in path.split("/") if segment]
    if not segments:
        return None
    if segments[0] == "bilibili" and len(segments) >= 3 and segments[1] == "user":
        return "_".join(segments[:3])
    if len(segments) >= 2:
        return "_".join(segments[:2])
    return segments[0]


async def trim_feed_fetch_run_history(
    session: AsyncSession,
    feed_id: str,
    *,
    keep_last: int = 10,
) -> None:
    """Delete older persisted runs beyond the configured per-feed retention window."""
    result = await session.execute(
        select(FeedFetchRun)
        .where(FeedFetchRun.feed_id == feed_id)
        .order_by(FeedFetchRun.created_at.desc())
    )
    runs = result.scalars().all()
    for run in runs[keep_last:]:
        await session.delete(run)

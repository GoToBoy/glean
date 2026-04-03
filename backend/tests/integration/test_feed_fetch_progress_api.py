"""Integration tests for persisted feed fetch progress."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from glean_database.models.feed import Feed
from glean_database.models.feed_fetch_run import FeedFetchRun
from glean_database.models.feed_fetch_stage_event import FeedFetchStageEvent
from glean_database.models.subscription import Subscription


@pytest.mark.asyncio
async def test_refresh_creates_feed_fetch_run(
    client: AsyncClient, auth_headers, db_session, test_subscription, test_feed
):
    response = await client.post(f"/api/feeds/{test_subscription.id}/refresh", headers=auth_headers)

    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert "run_id" in data
    assert data["job_id"].startswith("mock-job-")
    assert data["feed_id"] == test_feed.id
    assert data["feed_title"]

    run = await db_session.execute(
        select(FeedFetchRun).where(
            FeedFetchRun.id == data["run_id"],
            FeedFetchRun.feed_id == test_feed.id,
        )
    )
    created_run = run.scalar_one_or_none()
    assert created_run is not None
    assert created_run.feed_id == test_feed.id
    assert created_run.job_id == data["job_id"]
    assert created_run.status == "queued"
    assert created_run.current_stage == "queue_wait"
    assert created_run.queue_entered_at is not None
    assert created_run.predicted_start_at is not None
    assert created_run.predicted_finish_at is not None

    stage_events = await db_session.execute(
        select(FeedFetchStageEvent).where(FeedFetchStageEvent.run_id == data["run_id"])
    )
    created_stage_event = stage_events.scalar_one_or_none()
    assert created_stage_event is not None
    assert created_stage_event.stage_name == "queue_wait"
    assert created_stage_event.status == "running"


@pytest.mark.asyncio
async def test_admin_refresh_creates_feed_fetch_run(
    client: AsyncClient, admin_headers, db_session, test_feed
):
    response = await client.post(f"/api/admin/feeds/{test_feed.id}/refresh", headers=admin_headers)

    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert "run_id" in data
    assert data["job_id"].startswith("mock-job-")
    assert data["feed_id"] == test_feed.id
    assert data["feed_title"]

    run = await db_session.execute(
        select(FeedFetchRun).where(
            FeedFetchRun.id == data["run_id"],
            FeedFetchRun.feed_id == test_feed.id,
        )
    )
    created_run = run.scalar_one_or_none()
    assert created_run is not None
    assert created_run.job_id == data["job_id"]
    assert created_run.status == "queued"


@pytest.mark.asyncio
async def test_refresh_failure_rolls_back_persisted_run(
    client: AsyncClient,
    auth_headers,
    db_session,
    test_subscription,
    test_feed,
    test_mock_redis,
    monkeypatch: pytest.MonkeyPatch,
):
    async def enqueue_job_returns_none(*args, **kwargs):
        return None

    monkeypatch.setattr(test_mock_redis, "enqueue_job", enqueue_job_returns_none)

    with pytest.raises(RuntimeError, match="Failed to enqueue feed refresh job"):
        await client.post(f"/api/feeds/{test_subscription.id}/refresh", headers=auth_headers)

    runs = await db_session.execute(select(FeedFetchRun).where(FeedFetchRun.feed_id == test_feed.id))
    assert runs.scalars().all() == []

    stage_events = await db_session.execute(
        select(FeedFetchStageEvent).join(FeedFetchRun).where(FeedFetchRun.feed_id == test_feed.id)
    )
    assert stage_events.scalars().all() == []


@pytest.mark.asyncio
async def test_refresh_all_creates_feed_fetch_runs(
    client: AsyncClient, auth_headers, db_session, test_user, test_feed
):
    second_feed = Feed(
        url="https://example.com/second-feed.xml",
        title="Second Feed",
        description="Another test RSS feed",
        status="active",
    )
    db_session.add(second_feed)
    await db_session.flush()

    second_subscription = Subscription(user_id=test_user.id, feed_id=second_feed.id)
    db_session.add(second_subscription)
    await db_session.commit()

    response = await client.post("/api/feeds/refresh-all", headers=auth_headers)

    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "queued"
    assert data["queued_count"] == 2
    assert len(data["jobs"]) == 2
    assert all(job["job_id"].startswith("mock-job-") for job in data["jobs"])
    assert {job["feed_id"] for job in data["jobs"]} == {test_feed.id, second_feed.id}

    run_ids = [job["run_id"] for job in data["jobs"]]
    runs = await db_session.execute(
        select(FeedFetchRun).where(FeedFetchRun.id.in_(run_ids))
    )
    created_runs = runs.scalars().all()
    assert len(created_runs) == 2
    assert all(run.status == "queued" for run in created_runs)


@pytest.mark.asyncio
async def test_refresh_all_failure_rolls_back_all_runs(
    client: AsyncClient,
    auth_headers,
    db_session,
    test_user,
    test_feed,
    test_mock_redis,
    monkeypatch: pytest.MonkeyPatch,
):
    second_feed = Feed(
        url="https://example.com/third-feed.xml",
        title="Third Feed",
        description="Third test RSS feed",
        status="active",
    )
    db_session.add(second_feed)
    await db_session.flush()

    second_subscription = Subscription(user_id=test_user.id, feed_id=second_feed.id)
    db_session.add(second_subscription)
    await db_session.commit()

    call_count = 0

    async def enqueue_job_then_fail(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return type("MockArqJob", (), {"job_id": "mock-job-bulk-1"})()
        raise RuntimeError("boom")

    monkeypatch.setattr(test_mock_redis, "enqueue_job", enqueue_job_then_fail)

    with pytest.raises(RuntimeError, match="boom"):
        await client.post("/api/feeds/refresh-all", headers=auth_headers)

    runs = await db_session.execute(select(FeedFetchRun))
    assert runs.scalars().all() == []


@pytest.mark.asyncio
async def test_user_can_get_latest_feed_fetch_run(
    client: AsyncClient, auth_headers, db_session, test_subscription, test_feed
):
    test_feed.next_fetch_at = datetime.now(UTC) + timedelta(minutes=15)
    run = FeedFetchRun(
        feed_id=test_feed.id,
        job_id="job-1",
        trigger_type="manual_user",
        status="success",
        current_stage="complete",
        queue_entered_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
        finished_at=datetime.now(UTC),
        summary_json={"new_entries": 3},
    )
    db_session.add(run)
    await db_session.flush()
    db_session.add_all(
        [
            FeedFetchStageEvent(
                run_id=run.id,
                stage_order=0,
                stage_name="queue_wait",
                status="success",
                started_at=datetime.now(UTC),
                finished_at=datetime.now(UTC),
            ),
            FeedFetchStageEvent(
                run_id=run.id,
                stage_order=1,
                stage_name="complete",
                status="success",
                started_at=datetime.now(UTC),
                finished_at=datetime.now(UTC),
            ),
        ]
    )
    await db_session.commit()

    response = await client.get(
        f"/api/feeds/{test_feed.id}/fetch-runs/latest",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["feed_id"] == test_feed.id
    assert data["id"] == run.id
    assert data["status"] == "success"
    assert data["next_fetch_at"] == test_feed.next_fetch_at.isoformat()
    assert [stage["stage_name"] for stage in data["stages"]] == ["queue_wait", "complete"]


@pytest.mark.asyncio
async def test_user_can_get_latest_feed_fetch_runs_batch(
    client: AsyncClient, auth_headers, db_session, test_subscription, test_feed
):
    test_feed.next_fetch_at = datetime.now(UTC) + timedelta(minutes=20)
    run = FeedFetchRun(
        feed_id=test_feed.id,
        job_id="job-batch",
        trigger_type="scheduled",
        status="queued",
        current_stage="queue_wait",
        queue_entered_at=datetime.now(UTC),
        predicted_start_at=datetime.now(UTC) + timedelta(minutes=1),
        predicted_finish_at=datetime.now(UTC) + timedelta(minutes=4),
    )
    db_session.add(run)
    await db_session.commit()

    response = await client.post(
        "/api/feeds/fetch-runs/latest",
        headers=auth_headers,
        json={"feed_ids": [test_feed.id]},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["feed_id"] == test_feed.id
    assert data["items"][0]["status"] == "queued"
    assert data["items"][0]["stages"] == []


@pytest.mark.asyncio
async def test_admin_can_get_feed_fetch_run_history(
    client: AsyncClient, admin_headers, db_session, test_feed
):
    older_run = FeedFetchRun(
        feed_id=test_feed.id,
        job_id="job-old",
        trigger_type="manual_admin",
        status="error",
        current_stage="complete",
        queue_entered_at=datetime.now(UTC) - timedelta(minutes=20),
        started_at=datetime.now(UTC) - timedelta(minutes=20),
        finished_at=datetime.now(UTC) - timedelta(minutes=19),
        summary_json={"new_entries": 0},
    )
    db_session.add(older_run)
    await db_session.flush()

    newer_run = FeedFetchRun(
        feed_id=test_feed.id,
        job_id="job-new",
        trigger_type="manual_admin",
        status="success",
        current_stage="complete",
        queue_entered_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
        finished_at=datetime.now(UTC),
        summary_json={"new_entries": 5},
    )
    db_session.add(newer_run)
    await db_session.flush()

    await db_session.commit()

    response = await client.get(
        f"/api/admin/feeds/{test_feed.id}/fetch-runs/history",
        headers=admin_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["feed_id"] == test_feed.id
    assert isinstance(data["items"], list)
    assert [item["id"] for item in data["items"]] == [newer_run.id, older_run.id]


@pytest.mark.asyncio
async def test_admin_can_get_latest_feed_fetch_runs_batch(
    client: AsyncClient, admin_headers, db_session, test_feed
):
    test_feed.next_fetch_at = datetime.now(UTC) + timedelta(minutes=10)
    run = FeedFetchRun(
        feed_id=test_feed.id,
        job_id="job-admin-batch",
        trigger_type="scheduled",
        status="in_progress",
        current_stage="fetch_xml",
        queue_entered_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
    )
    db_session.add(run)
    await db_session.commit()

    response = await client.post(
        "/api/admin/feeds/fetch-runs/latest",
        headers=admin_headers,
        json={"feed_ids": [test_feed.id]},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["feed_id"] == test_feed.id
    assert data["items"][0]["status"] == "in_progress"


@pytest.mark.asyncio
async def test_user_can_get_active_feed_fetch_runs_for_visible_feeds(
    client: AsyncClient, auth_headers, db_session, test_subscription, test_feed, test_user
):
    visible_run = FeedFetchRun(
        feed_id=test_feed.id,
        job_id="job-visible",
        trigger_type="manual_user",
        status="queued",
        current_stage="queue_wait",
        queue_entered_at=datetime.now(UTC),
    )
    hidden_feed = Feed(
        url="https://example.com/hidden-feed.xml",
        title="Hidden Feed",
        description="Hidden",
        status="active",
    )
    db_session.add_all([visible_run, hidden_feed])
    await db_session.flush()
    hidden_run = FeedFetchRun(
        feed_id=hidden_feed.id,
        job_id="job-hidden",
        trigger_type="manual_user",
        status="in_progress",
        current_stage="fetch_xml",
        queue_entered_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
    )
    db_session.add(hidden_run)
    await db_session.commit()

    response = await client.get("/api/feeds/fetch-runs/active", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert [item["feed_id"] for item in data["items"]] == [test_feed.id]
    assert data["items"][0]["feed_title"] == test_feed.title


@pytest.mark.asyncio
async def test_admin_can_get_all_active_feed_fetch_runs(
    client: AsyncClient, admin_headers, db_session, test_feed
):
    queued_run = FeedFetchRun(
        feed_id=test_feed.id,
        job_id="job-queued",
        trigger_type="scheduled",
        status="queued",
        current_stage="queue_wait",
        queue_entered_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    running_run = FeedFetchRun(
        feed_id=test_feed.id,
        job_id="job-running",
        trigger_type="scheduled",
        status="in_progress",
        current_stage="fetch_xml",
        queue_entered_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
    )
    db_session.add_all([queued_run, running_run])
    await db_session.commit()

    response = await client.get("/api/admin/feeds/fetch-runs/active", headers=admin_headers)

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert {item["status"] for item in data["items"]} == {"queued", "in_progress"}

"""Integration tests for local AI REST integration."""

from datetime import UTC, date, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.server_time import get_server_timezone_name


async def create_api_token(db_session: AsyncSession, user_id: str) -> str:
    """Create and return a plain API token for tests."""
    from glean_core.services.api_token_service import APITokenService

    service = APITokenService(db_session)
    token = await service.create_token(user_id=user_id, name="Local AI", expires_in_days=None)
    return token.token


async def enable_user_ai(db_session: AsyncSession, user) -> None:
    """Enable the per-user AI setting for tests that exercise AI endpoints."""
    user.settings = {**(user.settings or {}), "ai_integration_enabled": True}
    await db_session.commit()
    await db_session.refresh(user)


async def set_ai_config(
    db_session: AsyncSession,
    *,
    enabled: bool = True,
    allow_today_entries_api: bool = True,
    allow_entry_detail_api: bool = True,
    allow_ai_writeback: bool = True,
) -> None:
    """Seed AI integration config directly through system config storage."""
    from sqlalchemy import delete

    from glean_database.models import SystemConfig

    await db_session.execute(delete(SystemConfig).where(SystemConfig.key == "ai_integration"))
    db_session.add(
        SystemConfig(
            key="ai_integration",
            value={
                "enabled": enabled,
                "allow_today_entries_api": allow_today_entries_api,
                "allow_entry_detail_api": allow_entry_detail_api,
                "allow_ai_writeback": allow_ai_writeback,
            },
        )
    )
    await db_session.commit()


async def create_entry(db_session: AsyncSession, feed_id: str, title: str, ingested_at: datetime):
    """Create an entry with a stable content payload."""
    from glean_database.models import Entry

    entry = Entry(
        feed_id=feed_id,
        title=title,
        url=f"https://example.com/{title.lower().replace(' ', '-')}",
        author="Test Author",
        summary=f"Summary for {title}",
        content=f"<p>Full content for {title}</p>",
        content_source="backfill_http",
        published_at=datetime(2026, 4, 1, 8, 0, tzinfo=UTC),
        ingested_at=ingested_at,
    )
    db_session.add(entry)
    await db_session.commit()
    await db_session.refresh(entry)
    return entry


@pytest.mark.asyncio
async def test_today_entries_requires_api_token(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict[str, str],
) -> None:
    """AI list endpoint should reject missing tokens and browser JWTs."""
    await set_ai_config(db_session, enabled=True)

    params = {"date": "2026-04-17", "timezone": "UTC"}

    missing_response = await client.get("/api/ai/today-entries", params=params)
    assert missing_response.status_code == 401

    jwt_response = await client.get("/api/ai/today-entries", params=params, headers=auth_headers)
    assert jwt_response.status_code == 401


@pytest.mark.asyncio
async def test_today_entries_respects_disabled_config(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user,
) -> None:
    """AI endpoints should be unavailable until the admin enables integration."""
    await set_ai_config(db_session, enabled=False)
    await enable_user_ai(db_session, test_user)
    token = await create_api_token(db_session, str(test_user.id))

    response = await client.get(
        "/api/ai/today-entries",
        params={"date": "2026-04-17", "timezone": "UTC"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_today_entries_respects_user_ai_setting(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user,
) -> None:
    """API-token AI access should require the user's personal AI setting."""
    await set_ai_config(db_session, enabled=True)
    token = await create_api_token(db_session, str(test_user.id))

    response = await client.get(
        "/api/ai/today-entries",
        params={"date": "2026-04-17", "timezone": "UTC"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Local AI integration is disabled for this user"


@pytest.mark.asyncio
async def test_today_entries_filters_by_collection_day_and_subscription(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user,
    test_feed,
    test_subscription,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Today AI list should use ingested_at and only include subscribed feed entries."""
    from glean_database.models import Feed

    monkeypatch.setenv("TZ", "UTC")

    await set_ai_config(db_session, enabled=True)
    await enable_user_ai(db_session, test_user)
    token = await create_api_token(db_session, str(test_user.id))

    other_feed = Feed(url="https://example.com/other.xml", title="Other Feed", status="active")
    db_session.add(other_feed)
    await db_session.commit()
    await db_session.refresh(other_feed)

    included = await create_entry(
        db_session,
        test_feed.id,
        "Collected Today",
        datetime(2026, 4, 17, 9, 0, tzinfo=UTC),
    )
    await create_entry(
        db_session,
        test_feed.id,
        "Collected Yesterday",
        datetime(2026, 4, 16, 23, 0, tzinfo=UTC),
    )
    await create_entry(
        db_session,
        other_feed.id,
        "Unsubscribed Today",
        datetime(2026, 4, 17, 10, 0, tzinfo=UTC),
    )

    response = await client.get(
        "/api/ai/today-entries",
        params={"date": "2026-04-17", "timezone": "UTC", "include_content": "false"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["date"] == "2026-04-17"
    assert data["timezone"] == get_server_timezone_name()
    assert data["total"] == 1
    assert [item["id"] for item in data["items"]] == [included.id]
    assert data["items"][0]["content"] is None
    assert data["items"][0]["content_available"] is True
    assert data["items"][0]["feed_title"] == "Test Feed"


@pytest.mark.asyncio
async def test_entry_detail_requires_capability_and_subscription(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user,
    test_feed,
    test_subscription,
) -> None:
    """AI detail endpoint should honor capability gates and feed subscriptions."""
    from glean_database.models import Feed

    await enable_user_ai(db_session, test_user)
    token = await create_api_token(db_session, str(test_user.id))
    entry = await create_entry(
        db_session,
        test_feed.id,
        "Detail Entry",
        datetime(2026, 4, 17, 9, 0, tzinfo=UTC),
    )

    await set_ai_config(db_session, enabled=True, allow_entry_detail_api=False)
    disabled_response = await client.get(
        f"/api/ai/entries/{entry.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert disabled_response.status_code == 403

    await set_ai_config(db_session, enabled=True, allow_entry_detail_api=True)

    detail_response = await client.get(
        f"/api/ai/entries/{entry.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["id"] == entry.id
    assert detail["content"] == "<p>Full content for Detail Entry</p>"
    assert detail["content_source"] == "backfill_http"

    other_feed = Feed(url="https://example.com/unsub-detail.xml", title="Hidden", status="active")
    db_session.add(other_feed)
    await db_session.commit()
    await db_session.refresh(other_feed)
    hidden_entry = await create_entry(
        db_session,
        other_feed.id,
        "Hidden Detail Entry",
        datetime(2026, 4, 17, 10, 0, tzinfo=UTC),
    )

    hidden_response = await client.get(
        f"/api/ai/entries/{hidden_entry.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert hidden_response.status_code == 404


@pytest.mark.asyncio
async def test_day_summary_and_entry_supplement_writeback(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user,
    auth_headers: dict[str, str],
    test_feed,
    test_subscription,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """AI writeback should upsert user-scoped day summaries and entry supplements."""
    monkeypatch.setenv("TZ", "UTC")

    await set_ai_config(db_session, enabled=True, allow_ai_writeback=True)
    await enable_user_ai(db_session, test_user)
    token = await create_api_token(db_session, str(test_user.id))
    entry = await create_entry(
        db_session,
        test_feed.id,
        "Summary Candidate",
        datetime(2026, 4, 17, 9, 0, tzinfo=UTC),
    )

    summary_payload = {
        "date": "2026-04-17",
        "timezone": "UTC",
        "model": "local-qwen",
        "title": "Morning Brief",
        "summary": "Read this first.",
        "highlights": [{"entry_id": entry.id, "title": entry.title, "reason": "Important"}],
        "topics": [{"name": "AI", "entry_ids": [entry.id]}],
        "recommended_entry_ids": [entry.id],
        "metadata": {"generated_by": "local-ai"},
    }

    put_summary = await client.put(
        "/api/ai/today-summary",
        json=summary_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert put_summary.status_code == 200
    assert put_summary.json()["title"] == "Morning Brief"

    summary_payload["title"] = "Updated Brief"
    updated_summary = await client.put(
        "/api/ai/today-summary",
        json=summary_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert updated_summary.status_code == 200
    assert updated_summary.json()["title"] == "Updated Brief"

    get_summary = await client.get(
        "/api/ai/today-summary",
        params={"date": "2026-04-17", "timezone": "UTC"},
        headers=auth_headers,
    )
    assert get_summary.status_code == 200
    assert get_summary.json()["title"] == "Updated Brief"
    assert get_summary.json()["timezone"] == get_server_timezone_name()

    browser_timezone_summary = await client.get(
        "/api/ai/today-summary",
        params={"date": "2026-04-17", "timezone": "America/Los_Angeles"},
        headers=auth_headers,
    )
    assert browser_timezone_summary.status_code == 200
    assert browser_timezone_summary.json()["title"] == "Updated Brief"
    assert browser_timezone_summary.json()["timezone"] == get_server_timezone_name()

    supplement_payload = {
        "model": "local-qwen",
        "summary": "Single entry summary",
        "key_points": ["Point A", "Point B"],
        "tags": ["AI", "RSS"],
        "reading_priority": "high",
        "reason": "Relevant to local AI workflow",
        "metadata": {"generated_by": "local-ai"},
    }

    put_supplement = await client.put(
        f"/api/ai/entries/{entry.id}/supplement",
        json=supplement_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert put_supplement.status_code == 200
    assert put_supplement.json()["summary"] == "Single entry summary"

    get_supplement = await client.get(
        f"/api/ai/entries/{entry.id}/supplement",
        headers=auth_headers,
    )
    assert get_supplement.status_code == 200
    assert get_supplement.json()["key_points"] == ["Point A", "Point B"]


@pytest.mark.asyncio
async def test_ai_writeback_rejects_unsubscribed_references(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user,
    test_feed,
    test_subscription,
) -> None:
    """Summary writeback should reject entry references outside user subscriptions."""
    from glean_database.models import Feed

    await set_ai_config(db_session, enabled=True, allow_ai_writeback=True)
    await enable_user_ai(db_session, test_user)
    token = await create_api_token(db_session, str(test_user.id))

    other_feed = Feed(url="https://example.com/not-mine.xml", title="Not Mine", status="active")
    db_session.add(other_feed)
    await db_session.commit()
    await db_session.refresh(other_feed)
    hidden_entry = await create_entry(
        db_session,
        other_feed.id,
        "Hidden Summary Reference",
        datetime(2026, 4, 17, 10, 0, tzinfo=UTC),
    )

    response = await client.put(
        "/api/ai/today-summary",
        json={
            "date": date(2026, 4, 17).isoformat(),
            "timezone": "UTC",
            "title": "Bad Brief",
            "summary": "Should fail",
            "recommended_entry_ids": [hidden_entry.id],
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_admin_and_system_ai_config_endpoints(
    client: AsyncClient,
    admin_headers: dict[str, str],
    auth_headers: dict[str, str],
) -> None:
    """Admin can manage AI config and web clients can read non-sensitive status."""
    update_response = await client.post(
        "/api/admin/settings/ai-integration",
        json={
            "enabled": True,
            "allow_today_entries_api": True,
            "allow_entry_detail_api": False,
            "allow_ai_writeback": True,
        },
        headers=admin_headers,
    )
    assert update_response.status_code == 200
    assert "default_today_view" not in update_response.json()
    assert "token" not in update_response.json()

    admin_get = await client.get("/api/admin/settings/ai-integration", headers=admin_headers)
    assert admin_get.status_code == 200
    assert admin_get.json()["allow_entry_detail_api"] is False

    public_get = await client.get("/api/system/ai-integration", headers=auth_headers)
    assert public_get.status_code == 200
    assert public_get.json() == {"enabled": True}

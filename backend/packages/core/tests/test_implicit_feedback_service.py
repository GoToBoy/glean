"""Tests for implicit feedback service."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from glean_core.schemas import ImplicitFeedbackConfig
from glean_core.services.implicit_feedback_service import ImplicitFeedbackService


@pytest.mark.asyncio
async def test_batch_get_boosts_returns_zero_when_disabled() -> None:
    """Disabled config should return zero boosts."""
    mock_session = AsyncMock()
    service = ImplicitFeedbackService(mock_session)

    with patch.object(
        service,
        "get_config",
        new=AsyncMock(return_value=ImplicitFeedbackConfig(enabled=False)),
    ):
        boosts = await service.batch_get_boosts("u1", ["e1", "e2"])

    assert boosts == {"e1": 0.0, "e2": 0.0}


@pytest.mark.asyncio
async def test_batch_get_boosts_calculates_weighted_score() -> None:
    """Enabled config should compute bounded boosts from aggregate rows."""
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.all.return_value = [
        SimpleNamespace(
            entry_id="e1",
            total_sessions=10,
            quick_skip_count=1,
            effective_read_count=8,
            completion_count=5,
            return_read_count=2,
            total_active_ms=180000,
            total_est_read_time_sec=300,
        )
    ]
    mock_session.execute.return_value = mock_result

    service = ImplicitFeedbackService(mock_session)

    with patch.object(
        service,
        "get_config",
        new=AsyncMock(
            return_value=ImplicitFeedbackConfig(enabled=True, weight=1.0, min_events=3)
        ),
    ):
        boosts = await service.batch_get_boosts("u1", ["e1", "e2"])

    assert "e1" in boosts
    assert "e2" in boosts
    assert boosts["e2"] == 0.0
    assert -10.0 <= boosts["e1"] <= 10.0
    assert boosts["e1"] > 0

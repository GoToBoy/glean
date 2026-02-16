"""Tests for implicit feedback aggregation worker tasks."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from glean_worker.tasks.implicit_feedback_aggregation import (
    _is_list_surface_event,
    _normalized_dwell,
    scheduled_aggregate_implicit_feedback,
)


def test_normalized_dwell_clamps_value() -> None:
    """Normalized dwell should clamp to [0, 1.5]."""
    assert _normalized_dwell(0, 120) == 0.0
    assert _normalized_dwell(30_000, 60) == 0.5
    assert _normalized_dwell(300_000, 60) == 1.5
    assert _normalized_dwell(10_000, 0) == 0.0


def test_is_list_surface_event() -> None:
    """List-surface events should be filtered from aggregation."""
    assert _is_list_surface_event(SimpleNamespace(extra={"surface": "list"})) is True
    assert _is_list_surface_event(SimpleNamespace(extra={"surface": "reader"})) is False
    assert _is_list_surface_event(SimpleNamespace(extra=None)) is False


@pytest.mark.asyncio
async def test_scheduled_wrapper_calls_aggregate() -> None:
    """Scheduled wrapper should delegate to aggregate task."""
    ctx = {"redis": None}

    with patch(
        "glean_worker.tasks.implicit_feedback_aggregation.aggregate_implicit_feedback_labels",
        new=AsyncMock(return_value={"success": True, "groups": 1}),
    ) as mock_aggregate:
        result = await scheduled_aggregate_implicit_feedback(ctx)

    mock_aggregate.assert_awaited_once_with(ctx)
    assert result["success"] is True

"""
Discover router.

Source discovery endpoints for the New reader mode.
"""

from typing import Annotated

from arq.connections import ArqRedis
from fastapi import APIRouter, Depends, HTTPException, Query, status

from glean_core.schemas import UserResponse
from glean_core.schemas.discovery import (
    DiscoveryActionResponse,
    DiscoveryFeedbackRequest,
    DiscoveryListResponse,
    DiscoveryTrialRequest,
)
from glean_core.services import DiscoveryService, FeedService

from ..dependencies import (
    get_current_user,
    get_discovery_service,
    get_feed_service,
    get_redis_pool,
)

router = APIRouter()


@router.get("/sources", response_model=DiscoveryListResponse)
async def list_discovery_sources(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    discovery_service: Annotated[DiscoveryService, Depends(get_discovery_service)],
    limit: int = Query(20, ge=1, le=100),
    refresh: bool = Query(False),
) -> DiscoveryListResponse:
    """List discovery source candidates."""
    if refresh:
        candidates = await discovery_service.refresh_candidates(current_user.id, limit=limit)
    else:
        candidates = await discovery_service.list_candidates(current_user.id, limit=limit)

    return DiscoveryListResponse(
        items=[candidate for candidate in candidates],
        total=len(candidates),
    )


@router.post("/{candidate_id}/trial", response_model=DiscoveryActionResponse)
async def start_discovery_trial(
    candidate_id: str,
    data: DiscoveryTrialRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    discovery_service: Annotated[DiscoveryService, Depends(get_discovery_service)],
) -> DiscoveryActionResponse:
    """Start a trial period for a source candidate."""
    try:
        await discovery_service.start_trial(current_user.id, candidate_id, days=data.days)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None
    return DiscoveryActionResponse(message="Trial started")


@router.post("/{candidate_id}/subscribe", response_model=DiscoveryActionResponse)
async def mark_discovery_subscribed(
    candidate_id: str,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    discovery_service: Annotated[DiscoveryService, Depends(get_discovery_service)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> DiscoveryActionResponse:
    """Subscribe to a discovery candidate and mark it handled."""
    try:
        candidate = await discovery_service.get_candidate(current_user.id, candidate_id)
        try:
            subscription = await feed_service.create_subscription(
                current_user.id,
                candidate.feed_url,
                candidate.title,
                None,
            )
            if subscription.feed.last_fetched_at is None:
                await redis.enqueue_job("fetch_feed_task", subscription.feed.id)
        except ValueError as e:
            if "Already subscribed" not in str(e):
                raise
        await discovery_service.mark_subscribed(current_user.id, candidate_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None
    return DiscoveryActionResponse(message="Subscribed successfully")


@router.post("/{candidate_id}/feedback", response_model=DiscoveryActionResponse)
async def submit_discovery_feedback(
    candidate_id: str,
    data: DiscoveryFeedbackRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    discovery_service: Annotated[DiscoveryService, Depends(get_discovery_service)],
) -> DiscoveryActionResponse:
    """Submit discovery feedback."""
    try:
        if data.feedback_type == "dismiss_source":
            await discovery_service.dismiss_candidate(current_user.id, candidate_id)
        elif data.feedback_type == "reduce_topic":
            await discovery_service.reduce_topic(current_user.id, candidate_id, data.topic)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported feedback_type for this endpoint",
            )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None

    return DiscoveryActionResponse(message="Feedback applied")

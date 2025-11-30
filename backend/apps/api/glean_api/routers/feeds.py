"""
Feeds and subscriptions router.

Provides endpoints for feed discovery, subscription management, and OPML import/export.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, status

from glean_core.schemas import (
    DiscoverFeedRequest,
    SubscriptionResponse,
    UpdateSubscriptionRequest,
    UserResponse,
)
from glean_core.services import FeedService
from glean_rss import discover_feed, generate_opml, parse_opml

from ..dependencies import get_current_user, get_feed_service

router = APIRouter()


@router.get("")
async def list_subscriptions(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
) -> list[SubscriptionResponse]:
    """
    Get all user subscriptions.

    Args:
        current_user: Current authenticated user.
        feed_service: Feed service.

    Returns:
        List of user subscriptions.
    """
    return await feed_service.get_user_subscriptions(current_user.id)


@router.get("/{subscription_id}")
async def get_subscription(
    subscription_id: str,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
) -> SubscriptionResponse:
    """
    Get a specific subscription.

    Args:
        subscription_id: Subscription identifier.
        current_user: Current authenticated user.
        feed_service: Feed service.

    Returns:
        Subscription details.

    Raises:
        HTTPException: If subscription not found or unauthorized.
    """
    try:
        return await feed_service.get_subscription(subscription_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/discover")
async def discover_feed_url(
    data: DiscoverFeedRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
) -> SubscriptionResponse:
    """
    Discover and subscribe to a feed from URL.

    Args:
        data: Feed discovery request with URL.
        current_user: Current authenticated user.
        feed_service: Feed service.

    Returns:
        Created subscription.

    Raises:
        HTTPException: If feed discovery fails or already subscribed.
    """
    try:
        # Discover feed
        feed_url, feed_title = await discover_feed(str(data.url))

        # Create subscription
        subscription = await feed_service.create_subscription(current_user.id, feed_url)
        return subscription
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.patch("/{subscription_id}")
async def update_subscription(
    subscription_id: str,
    data: UpdateSubscriptionRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
) -> SubscriptionResponse:
    """
    Update subscription settings.

    Args:
        subscription_id: Subscription identifier.
        data: Update data.
        current_user: Current authenticated user.
        feed_service: Feed service.

    Returns:
        Updated subscription.

    Raises:
        HTTPException: If subscription not found or unauthorized.
    """
    try:
        return await feed_service.update_subscription(
            subscription_id, current_user.id, data.custom_title
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(
    subscription_id: str,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
) -> None:
    """
    Delete a subscription.

    Args:
        subscription_id: Subscription identifier.
        current_user: Current authenticated user.
        feed_service: Feed service.

    Raises:
        HTTPException: If subscription not found or unauthorized.
    """
    try:
        await feed_service.delete_subscription(subscription_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/import")
async def import_opml(
    file: UploadFile,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
) -> dict[str, int]:
    """
    Import subscriptions from OPML file.

    Args:
        file: OPML file upload.
        current_user: Current authenticated user.
        feed_service: Feed service.

    Returns:
        Import statistics (success and failed counts).

    Raises:
        HTTPException: If file is invalid.
    """
    try:
        content = await file.read()
        opml_feeds = parse_opml(content.decode("utf-8"))

        success_count = 0
        failed_count = 0

        for opml_feed in opml_feeds:
            try:
                await feed_service.create_subscription(current_user.id, opml_feed.xml_url)
                success_count += 1
            except ValueError:
                # Already subscribed or invalid feed
                failed_count += 1

        return {"success": success_count, "failed": failed_count, "total": len(opml_feeds)}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/export")
async def export_opml(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    feed_service: Annotated[FeedService, Depends(get_feed_service)],
) -> Response:
    """
    Export subscriptions as OPML file.

    Args:
        current_user: Current authenticated user.
        feed_service: Feed service.

    Returns:
        OPML file download.
    """
    subscriptions = await feed_service.get_user_subscriptions(current_user.id)

    feeds = [
        {
            "title": sub.custom_title or sub.feed.title,
            "url": sub.feed.url,
            "site_url": sub.feed.site_url,
        }
        for sub in subscriptions
    ]

    opml_content = generate_opml(feeds)

    return Response(
        content=opml_content,
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=glean-subscriptions.opml"},
    )

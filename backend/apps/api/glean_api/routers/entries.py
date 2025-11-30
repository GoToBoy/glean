"""
Entries router.

Provides endpoints for reading and managing feed entries.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from glean_core.schemas import (
    EntryListResponse,
    EntryResponse,
    UpdateEntryStateRequest,
    UserResponse,
)
from glean_core.services import EntryService

from ..dependencies import get_current_user, get_entry_service

router = APIRouter()


@router.get("")
async def list_entries(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
    feed_id: str | None = None,
    is_read: bool | None = None,
    is_liked: bool | None = None,
    read_later: bool | None = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> EntryListResponse:
    """
    Get entries with filtering and pagination.

    Args:
        current_user: Current authenticated user.
        entry_service: Entry service.
        feed_id: Optional filter by feed ID.
        is_read: Optional filter by read status.
        is_liked: Optional filter by liked status.
        read_later: Optional filter by read later status.
        page: Page number (1-indexed).
        per_page: Items per page (max 100).

    Returns:
        Paginated list of entries.
    """
    return await entry_service.get_entries(
        user_id=current_user.id,
        feed_id=feed_id,
        is_read=is_read,
        is_liked=is_liked,
        read_later=read_later,
        page=page,
        per_page=per_page,
    )


@router.get("/{entry_id}")
async def get_entry(
    entry_id: str,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
) -> EntryResponse:
    """
    Get a specific entry.

    Args:
        entry_id: Entry identifier.
        current_user: Current authenticated user.
        entry_service: Entry service.

    Returns:
        Entry details.

    Raises:
        HTTPException: If entry not found or user not subscribed to feed.
    """
    try:
        return await entry_service.get_entry(entry_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None


@router.patch("/{entry_id}")
async def update_entry_state(
    entry_id: str,
    data: UpdateEntryStateRequest,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
) -> EntryResponse:
    """
    Update entry state (read, liked, read later).

    Args:
        entry_id: Entry identifier.
        data: State update data.
        current_user: Current authenticated user.
        entry_service: Entry service.

    Returns:
        Updated entry.

    Raises:
        HTTPException: If entry not found.
    """
    try:
        return await entry_service.update_entry_state(entry_id, current_user.id, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from None


@router.post("/mark-all-read")
async def mark_all_read(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    entry_service: Annotated[EntryService, Depends(get_entry_service)],
    feed_id: str | None = None,
) -> dict[str, str]:
    """
    Mark all entries as read.

    Args:
        current_user: Current authenticated user.
        entry_service: Entry service.
        feed_id: Optional filter by feed ID.

    Returns:
        Success message.
    """
    await entry_service.mark_all_read(current_user.id, feed_id)
    return {"message": "All entries marked as read"}

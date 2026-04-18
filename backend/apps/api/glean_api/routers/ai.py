"""Local AI integration REST router."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from glean_core.schemas import UserResponse
from glean_core.schemas.ai import (
    AIDailySummaryPayload,
    AIDailySummaryResponse,
    AIEntryDetailResponse,
    AIEntrySupplementPayload,
    AIEntrySupplementResponse,
    AITodayEntriesResponse,
)
from glean_core.schemas.config import AIIntegrationConfig
from glean_core.services import AIIntegrationService, TypedConfigService

from ..dependencies import (
    get_ai_integration_service,
    get_current_api_token_user,
    get_current_user_or_api_token_user,
    get_typed_config_service,
)

router = APIRouter()


async def get_enabled_ai_config(
    config_service: Annotated[TypedConfigService, Depends(get_typed_config_service)],
) -> AIIntegrationConfig:
    """Load AI config and reject disabled integration."""
    config = await config_service.get(AIIntegrationConfig)
    if not config.enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Local AI integration is disabled",
        )
    return config


def ensure_user_ai_enabled(current_user: UserResponse) -> UserResponse:
    """Reject local AI access until the current user enables it."""
    if not (current_user.settings and current_user.settings.ai_integration_enabled):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Local AI integration is disabled for this user",
        )
    return current_user


async def get_ai_enabled_api_token_user(
    current_user: Annotated[UserResponse, Depends(get_current_api_token_user)],
) -> UserResponse:
    """Load the API-token user and require their personal AI setting."""
    return ensure_user_ai_enabled(current_user)


async def get_ai_enabled_user_or_api_token_user(
    current_user: Annotated[UserResponse, Depends(get_current_user_or_api_token_user)],
) -> UserResponse:
    """Load a browser or API-token user and require their personal AI setting."""
    return ensure_user_ai_enabled(current_user)


@router.get("/today-entries", response_model=AITodayEntriesResponse)
async def list_today_entries_for_ai(
    current_user: Annotated[UserResponse, Depends(get_ai_enabled_api_token_user)],
    ai_service: Annotated[AIIntegrationService, Depends(get_ai_integration_service)],
    config: Annotated[AIIntegrationConfig, Depends(get_enabled_ai_config)],
    date_: date = Query(alias="date"),
    timezone: str | None = Query(default=None, min_length=1, max_length=100),
    include_content: bool = False,
    limit: int = Query(500, ge=1, le=500),
) -> AITodayEntriesResponse:
    """List entries collected on the requested local day for local AI clients."""
    if not config.allow_today_entries_api:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI today entries API is disabled",
        )
    try:
        return await ai_service.list_today_entries(
            current_user.id,
            date_,
            timezone,
            include_content,
            limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


@router.get("/entries/{entry_id}", response_model=AIEntryDetailResponse)
async def get_entry_for_ai(
    entry_id: str,
    current_user: Annotated[UserResponse, Depends(get_ai_enabled_api_token_user)],
    ai_service: Annotated[AIIntegrationService, Depends(get_ai_integration_service)],
    config: Annotated[AIIntegrationConfig, Depends(get_enabled_ai_config)],
) -> AIEntryDetailResponse:
    """Return full article details for local AI clients."""
    if not config.allow_entry_detail_api:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI entry detail API is disabled",
        )
    detail = await ai_service.get_entry_detail(current_user.id, entry_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    return detail


@router.put("/today-summary", response_model=AIDailySummaryResponse)
async def upsert_today_summary(
    payload: AIDailySummaryPayload,
    current_user: Annotated[UserResponse, Depends(get_ai_enabled_api_token_user)],
    ai_service: Annotated[AIIntegrationService, Depends(get_ai_integration_service)],
    config: Annotated[AIIntegrationConfig, Depends(get_enabled_ai_config)],
) -> AIDailySummaryResponse:
    """Upsert a day-level AI summary."""
    if not config.allow_ai_writeback:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI writeback is disabled",
        )
    try:
        return await ai_service.upsert_daily_summary(current_user.id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


@router.get("/today-summary", response_model=AIDailySummaryResponse)
async def get_today_summary(
    current_user: Annotated[UserResponse, Depends(get_ai_enabled_user_or_api_token_user)],
    ai_service: Annotated[AIIntegrationService, Depends(get_ai_integration_service)],
    config: Annotated[AIIntegrationConfig, Depends(get_enabled_ai_config)],
    date_: date = Query(alias="date"),
    timezone: str | None = Query(default=None, min_length=1, max_length=100),
) -> AIDailySummaryResponse:
    """Get a day-level AI summary for the current user."""
    try:
        summary = await ai_service.get_daily_summary(current_user.id, date_, timezone)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    if summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI summary not found")
    return summary


@router.put("/entries/{entry_id}/supplement", response_model=AIEntrySupplementResponse)
async def upsert_entry_supplement(
    entry_id: str,
    payload: AIEntrySupplementPayload,
    current_user: Annotated[UserResponse, Depends(get_ai_enabled_api_token_user)],
    ai_service: Annotated[AIIntegrationService, Depends(get_ai_integration_service)],
    config: Annotated[AIIntegrationConfig, Depends(get_enabled_ai_config)],
) -> AIEntrySupplementResponse:
    """Upsert an entry-level AI supplement."""
    if not config.allow_ai_writeback:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI writeback is disabled",
        )
    try:
        supplement = await ai_service.upsert_entry_supplement(current_user.id, entry_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
    if supplement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    return supplement


@router.get("/entries/{entry_id}/supplement", response_model=AIEntrySupplementResponse)
async def get_entry_supplement(
    entry_id: str,
    current_user: Annotated[UserResponse, Depends(get_ai_enabled_user_or_api_token_user)],
    ai_service: Annotated[AIIntegrationService, Depends(get_ai_integration_service)],
    config: Annotated[AIIntegrationConfig, Depends(get_enabled_ai_config)],
) -> AIEntrySupplementResponse:
    """Get an entry-level AI supplement for the current user."""
    try:
        supplement = await ai_service.get_entry_supplement(current_user.id, entry_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if supplement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI supplement not found")
    return supplement

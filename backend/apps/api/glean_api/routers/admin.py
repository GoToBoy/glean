"""
Admin router.

Provides endpoints for administrative operations (basic implementation for M1).
"""

from fastapi import APIRouter, HTTPException, status

router = APIRouter()


@router.get("/health")
async def admin_health() -> dict[str, str]:
    """
    Admin health check endpoint.

    Returns:
        Health status.
    """
    return {"status": "healthy", "message": "Admin API is running"}


@router.get("/stats")
async def get_stats() -> dict[str, str]:
    """
    Get system statistics.

    Returns:
        System statistics (placeholder for M1).
    """
    # TODO: Implement in M2 with actual statistics
    return {"message": "Statistics endpoint - to be implemented in M2"}

"""
API router modules.

This package contains all API route handlers organized by domain.
"""

from . import (
    admin,
    api_tokens,
    auth,
    bookmarks,
    discover,
    entries,
    feeds,
    folders,
    preference,
    system,
    tags,
)

__all__ = [
    "auth",
    "feeds",
    "entries",
    "admin",
    # M2 routers
    "folders",
    "tags",
    "bookmarks",
    "discover",
    # M3 routers
    "preference",
    "system",
    # MCP routers
    "api_tokens",
]

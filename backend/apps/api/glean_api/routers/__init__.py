"""
API router modules.

This package contains all API route handlers organized by domain.
"""

from . import admin, auth, bookmarks, entries, feeds, folders, tags

__all__ = [
    "auth",
    "feeds",
    "entries",
    "admin",
    # M2 routers
    "folders",
    "tags",
    "bookmarks",
]

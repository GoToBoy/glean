"""
RSS/Atom feed parser.

Parses RSS and Atom feeds using feedparser.
"""

from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import feedparser
from feedparser import FeedParserDict


def _get_favicon_url(site_url: str | None) -> str | None:
    """
    Generate favicon URL from site URL.

    Args:
        site_url: Website URL.

    Returns:
        Favicon URL or None if site_url is invalid.
    """
    if not site_url:
        return None

    try:
        parsed = urlparse(site_url)
        if not parsed.scheme or not parsed.netloc:
            return None

        # Use Google's favicon service for reliable favicon fetching
        domain = parsed.netloc
        return f"https://www.google.com/s2/favicons?domain={domain}&sz=64"
    except Exception:
        return None


class ParsedFeed:
    """Parsed feed metadata."""

    def __init__(self, data: FeedParserDict):
        """
        Initialize from feedparser data.

        Args:
            data: Parsed feed data from feedparser.
        """
        feed_info = data.get("feed", {})
        self.title = feed_info.get("title", "")
        self.description = feed_info.get("description", "")
        self.site_url = feed_info.get("link", "")
        self.language = feed_info.get("language")

        # Try to get icon from feed, fallback to favicon
        self.icon_url = (
            feed_info.get("icon")
            or feed_info.get("logo")
            or _get_favicon_url(self.site_url)
        )

        self.entries = [ParsedEntry(entry) for entry in data.get("entries", [])]


class ParsedEntry:
    """Parsed entry data."""

    def __init__(self, data: dict[str, Any]):
        """
        Initialize from feedparser entry data.

        Args:
            data: Entry data from feedparser.
        """
        self.guid = data.get("id") or data.get("link", "")
        self.url = data.get("link", "")
        self.title = data.get("title", "")
        self.author = data.get("author")
        self.summary = data.get("summary")

        # Get content (prefer content over summary)
        content_list = data.get("content", [])
        if content_list:
            self.content = content_list[0].get("value")
        else:
            self.content = data.get("summary")

        # Parse published date
        published = data.get("published_parsed") or data.get("updated_parsed")
        if published:
            try:
                self.published_at = datetime(*published[:6], tzinfo=UTC)
            except (TypeError, ValueError):
                self.published_at = None
        else:
            self.published_at = None


async def parse_feed(content: str, url: str) -> ParsedFeed:
    """
    Parse RSS/Atom feed from content.

    Args:
        content: Feed XML content.
        url: Feed URL (used for relative link resolution).

    Returns:
        Parsed feed data.

    Raises:
        ValueError: If feed parsing fails.
    """
    data = feedparser.parse(content)

    if data.get("bozo", False) and not data.get("entries"):
        # Feed has errors and no entries
        raise ValueError(f"Failed to parse feed: {data.get('bozo_exception', 'Unknown error')}")

    return ParsedFeed(data)

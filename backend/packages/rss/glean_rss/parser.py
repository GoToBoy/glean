"""
RSS/Atom feed parser.

Parses RSS and Atom feeds using feedparser.
"""

from datetime import datetime, timezone
from typing import Any

import feedparser
from feedparser import FeedParserDict


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
        self.icon_url = feed_info.get("icon") or feed_info.get("logo")
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
                self.published_at = datetime(*published[:6], tzinfo=timezone.utc)
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

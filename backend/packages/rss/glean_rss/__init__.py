"""
RSS processing package.

Provides RSS/Atom parsing, feed discovery, and OPML import/export.
"""

from .discoverer import discover_feed, fetch_feed
from .opml import OPMLFeed, generate_opml, parse_opml
from .parser import ParsedEntry, ParsedFeed, parse_feed

__all__ = [
    "parse_feed",
    "ParsedFeed",
    "ParsedEntry",
    "discover_feed",
    "fetch_feed",
    "parse_opml",
    "generate_opml",
    "OPMLFeed",
]

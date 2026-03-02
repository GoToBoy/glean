"""
RSS feed discovery.

Discovers RSS/Atom feeds from websites.
"""

import asyncio

import httpx
from bs4 import BeautifulSoup

from .parser import parse_feed

# Realistic RSS reader User-Agent to avoid bot detection on CDN-protected sites
_USER_AGENT = "Mozilla/5.0 (compatible; GleanRSSReader/1.0; +https://github.com/glean)"


async def discover_feed(url: str, timeout: int = 30) -> tuple[str, str]:
    """
    Discover RSS feed URL from a given URL.

    Tries to:
    1. Parse URL directly as RSS (when content-type indicates XML/RSS/Atom)
    2. Find RSS link in HTML page
    3. Fallback: try parsing response as RSS regardless of content-type
       (handles cases where CDN or servers return wrong content-type)

    Args:
        url: URL to discover feed from.
        timeout: Request timeout in seconds.

    Returns:
        Tuple of (feed_url, feed_title).

    Raises:
        ValueError: If no feed found or request fails.
    """
    async with httpx.AsyncClient(
        timeout=timeout, follow_redirects=True, headers={"User-Agent": _USER_AGENT}
    ) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
        except httpx.HTTPError as e:
            raise ValueError(f"Failed to fetch URL: {e}") from e

        content_type = response.headers.get("content-type", "").lower()

        # Try to parse as RSS directly
        if "xml" in content_type or "rss" in content_type or "atom" in content_type:
            try:
                feed = await parse_feed(response.text, url)
                return url, str(feed.title)
            except ValueError:
                pass

        # Try to find RSS link in HTML
        if "html" in content_type or not content_type:
            soup = BeautifulSoup(response.content, "lxml")

            # Look for RSS/Atom link tags
            feed_links = soup.find_all(
                "link",
                attrs={"type": ["application/rss+xml", "application/atom+xml", "application/xml"]},
            )

            for link in feed_links:
                href = link.get("href")
                if href:
                    # Convert to string in case BeautifulSoup returns a list
                    feed_url_str = str(href) if not isinstance(href, str) else href
                    # Make absolute URL
                    if not feed_url_str.startswith("http"):
                        from urllib.parse import urljoin

                        feed_url_str = urljoin(url, feed_url_str)

                    # Try to parse this feed
                    try:
                        feed_response = await client.get(feed_url_str)
                        feed_response.raise_for_status()
                        feed = await parse_feed(feed_response.text, feed_url_str)
                        return feed_url_str, str(feed.title)
                    except (httpx.HTTPError, ValueError):
                        continue

        # Fallback: try parsing response body as RSS regardless of content-type.
        # Some CDNs (e.g. Substack, Cloudflare) return incorrect content-type on
        # first access or when the URL is a direct feed link without proper headers.
        try:
            feed = await parse_feed(response.text, url)
            return url, str(feed.title)
        except ValueError:
            pass

        raise ValueError("No RSS feed found at this URL")


async def fetch_feed(
    url: str, etag: str | None = None, last_modified: str | None = None
) -> tuple[str, dict[str, str]] | None:
    """
    Fetch feed content with conditional request support.

    Retries once on server errors (5xx) to handle CDN warmup issues where the
    first request may return a non-standard response (e.g. Substack, Cloudflare).

    Args:
        url: Feed URL.
        etag: Optional ETag for conditional request.
        last_modified: Optional Last-Modified for conditional request.

    Returns:
        Tuple of (content, headers) if modified, None if not modified (304).

    Raises:
        ValueError: If request fails after retry.
    """
    headers = {"User-Agent": _USER_AGENT}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers=headers) as client:
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                response = await client.get(url)

                if response.status_code == 304:
                    # Not modified
                    return None

                # Retry once on server errors (5xx) — CDN may need warming up
                if response.status_code >= 500 and attempt == 0:
                    await asyncio.sleep(1)
                    continue

                response.raise_for_status()

                # Extract caching headers
                cache_headers: dict[str, str] = {}
                if "etag" in response.headers:
                    cache_headers["etag"] = response.headers["etag"]
                if "last-modified" in response.headers:
                    cache_headers["last-modified"] = response.headers["last-modified"]

                return response.text, cache_headers

            except httpx.HTTPError as e:
                last_error = e
                if attempt == 0:
                    await asyncio.sleep(1)

        raise ValueError(f"Failed to fetch feed: {last_error!r}") from last_error

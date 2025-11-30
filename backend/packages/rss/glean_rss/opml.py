"""
OPML import/export.

Handles OPML file parsing and generation for feed subscription management.
"""

from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree as ET


class OPMLFeed:
    """OPML feed entry."""

    def __init__(self, title: str, xml_url: str, html_url: str | None = None):
        """
        Initialize OPML feed entry.

        Args:
            title: Feed title.
            xml_url: Feed XML URL.
            html_url: Optional feed website URL.
        """
        self.title = title
        self.xml_url = xml_url
        self.html_url = html_url


def parse_opml(content: str) -> list[OPMLFeed]:
    """
    Parse OPML file.

    Args:
        content: OPML XML content.

    Returns:
        List of OPML feed entries.

    Raises:
        ValueError: If OPML parsing fails.
    """
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        raise ValueError(f"Invalid OPML format: {e}")

    feeds = []
    body = root.find("body")
    if body is None:
        return feeds

    # Find all outline elements
    for outline in body.iter("outline"):
        # Skip outline elements without xmlUrl (folders/categories)
        xml_url = outline.get("xmlUrl")
        if not xml_url:
            continue

        title = outline.get("title") or outline.get("text", "")
        html_url = outline.get("htmlUrl")

        feeds.append(OPMLFeed(title=title, xml_url=xml_url, html_url=html_url))

    return feeds


def generate_opml(feeds: list[dict[str, Any]], title: str = "Glean Subscriptions") -> str:
    """
    Generate OPML file from feeds.

    Args:
        feeds: List of feed dictionaries with 'title', 'url', and optional 'site_url'.
        title: OPML document title.

    Returns:
        OPML XML string.
    """
    # Create root element
    opml = ET.Element("opml", version="2.0")

    # Create head
    head = ET.SubElement(opml, "head")
    title_elem = ET.SubElement(head, "title")
    title_elem.text = title

    date_created = ET.SubElement(head, "dateCreated")
    date_created.text = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")

    # Create body
    body = ET.SubElement(opml, "body")

    # Add feeds
    for feed in feeds:
        outline = ET.SubElement(
            body,
            "outline",
            type="rss",
            text=feed.get("title", ""),
            title=feed.get("title", ""),
            xmlUrl=feed.get("url", ""),
        )

        if feed.get("site_url"):
            outline.set("htmlUrl", feed["site_url"])

    # Generate XML
    tree = ET.ElementTree(opml)
    ET.indent(tree, space="  ")

    import io

    output = io.BytesIO()
    tree.write(output, encoding="utf-8", xml_declaration=True)
    return output.getvalue().decode("utf-8")

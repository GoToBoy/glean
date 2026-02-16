"""
Discovery service.

Single-user source discovery pipeline backed by external web search.
"""

import os
from collections import Counter
from datetime import UTC, datetime, timedelta
import re
from urllib.parse import urljoin
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core import get_logger
from glean_core.schemas.discovery import DiscoveryCandidateResponse
from glean_database.models import DiscoveryCandidate, DiscoveryFeedback, Feed, Subscription, User
from glean_rss import discover_feed

logger = get_logger(__name__)

TOPIC_KEYWORDS: dict[str, tuple[str, ...]] = {
    "engineering": (
        "engineering",
        "developer",
        "programming",
        "software",
        "backend",
        "frontend",
        "ai",
        "ml",
        "devops",
    ),
    "design": ("design", "ux", "ui", "interaction", "typography", "visual"),
    "product": ("product", "strategy", "growth", "management", "startup", "business"),
}

TOPIC_QUERY_PACKS: dict[str, dict[str, tuple[str, ...]]] = {
    "engineering": {
        "blogs": (
            "software engineering architecture blog",
            "independent developer blog backend systems",
            "site:substack.com software engineering",
        ),
        "directories": (
            "site:feedspot.com software engineering blogs",
            "site:alltop.com programming",
        ),
        "forums": (
            "site:news.ycombinator.com \"Show HN\" developer blog",
            "site:reddit.com/r/programming best blogs",
        ),
    },
    "design": {
        "blogs": (
            "ux design systems blog",
            "interaction design case study blog",
            "site:substack.com ux design",
        ),
        "directories": (
            "site:feedspot.com ux blogs",
            "site:alltop.com design",
        ),
        "forums": (
            "site:reddit.com/r/userexperience best blogs",
            "site:news.ycombinator.com design blog",
        ),
    },
    "product": {
        "blogs": (
            "product strategy blog essays",
            "product management decision making blog",
            "site:substack.com product strategy",
        ),
        "directories": (
            "site:feedspot.com product management blogs",
            "site:alltop.com startups",
        ),
        "forums": (
            "site:reddit.com/r/ProductManagement best blogs",
            "site:news.ycombinator.com product strategy blog",
        ),
    },
    "general": {
        "blogs": ("independent technology blog analysis",),
        "directories": ("site:feedspot.com technology blogs",),
        "forums": ("site:reddit.com/r/technology longform blog",),
    },
}

META_RSS_PAGE_HINTS: tuple[str, ...] = (
    "rss feed",
    "rss feeds",
    "top rss",
    "best rss",
    "rss reader",
    "feed reader",
)
STOPWORDS: set[str] = {
    "blog",
    "news",
    "feed",
    "daily",
    "weekly",
    "official",
    "site",
    "the",
    "and",
    "for",
    "with",
    "from",
    "your",
    "tech",
}


class DiscoveryService:
    """Manage source discovery candidates and actions."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def refresh_candidates(self, user_id: str, limit: int = 30) -> list[DiscoveryCandidate]:
        """Refresh candidate pool from external search results."""
        if limit <= 0:
            return []

        existing_urls_result = await self.session.execute(
            select(Feed.url)
            .join(Subscription, Subscription.feed_id == Feed.id)
            .where(Subscription.user_id == user_id)
        )
        existing_urls = {url for (url,) in existing_urls_result.all()}

        user_hosts_result = await self.session.execute(
            select(Feed.site_url)
            .join(Subscription, Subscription.feed_id == Feed.id)
            .where(Subscription.user_id == user_id)
        )
        user_hosts = {
            parsed.netloc
            for (site_url,) in user_hosts_result.all()
            if site_url and (parsed := urlparse(site_url)).netloc
        }

        preferred_topics = await self._get_user_topic_preferences(user_id)
        interest_terms = await self._get_user_interest_terms(user_id)
        tavily_api_key = await self._get_user_tavily_api_key(user_id)
        search_queries = self._build_search_queries(preferred_topics, interest_terms)
        drafts = await self._collect_search_candidates(
            existing_urls=existing_urls,
            preferred_topics=preferred_topics,
            query_specs=search_queries,
            limit=limit,
            tavily_api_key=tavily_api_key,
        )

        # No validated search results -> keep existing candidates unchanged.
        if not drafts:
            logger.info(
                "Discovery refresh produced no external candidates",
                extra={"user_id": user_id, "queries": search_queries},
            )
            return await self.list_candidates(user_id=user_id, limit=limit)

        now = datetime.now(UTC)
        host_counts = Counter(draft["host"] for draft in drafts if draft["host"])
        await self.session.execute(
            update(DiscoveryCandidate)
            .where(DiscoveryCandidate.user_id == user_id)
            .where(DiscoveryCandidate.dismissed_at.is_(None))
            .where(DiscoveryCandidate.subscribed_at.is_(None))
            .values(is_blocked=True)
        )

        for draft in drafts:
            quality_score = self._clamp(draft["quality_score"], 0.0, 1.0)
            relevance_score = self._clamp(draft["relevance_score"], 0.0, 1.0)
            novelty_score = 0.75 if draft["host"] not in user_hosts else 0.35
            host_count = host_counts.get(draft["host"], 1)
            diversity_score = self._clamp(1.0 - ((host_count - 1) / max(1, len(drafts))), 0.25, 1.0)
            discovery_score = (
                0.35 * quality_score
                + 0.25 * relevance_score
                + 0.20 * novelty_score
                + 0.20 * diversity_score
            )

            stmt = select(DiscoveryCandidate).where(
                and_(
                    DiscoveryCandidate.user_id == user_id,
                    DiscoveryCandidate.feed_url == draft["feed_url"],
                )
            )
            result = await self.session.execute(stmt)
            candidate = result.scalar_one_or_none()
            if candidate is None:
                candidate = DiscoveryCandidate(
                    user_id=user_id,
                    feed_url=draft["feed_url"],
                    site_url=draft["site_url"],
                    title=draft["title"],
                    topic=draft["topic"],
                    source_kind=str(draft["source_kind"]),
                    reason=draft["reason"],
                )
                self.session.add(candidate)

            candidate.site_url = draft["site_url"]
            candidate.title = draft["title"]
            candidate.topic = draft["topic"]
            candidate.source_kind = str(draft["source_kind"])
            candidate.reason = draft["reason"]
            candidate.quality_score = quality_score
            candidate.relevance_score = relevance_score
            candidate.novelty_score = novelty_score
            candidate.diversity_score = diversity_score
            candidate.discovery_score = discovery_score
            candidate.fetch_success_rate = 0.80
            candidate.update_stability_score = 0.70
            candidate.dedup_ratio = 0.15
            candidate.refreshed_at = now
            candidate.is_blocked = False

        await self.session.commit()
        return await self.list_candidates(user_id=user_id, limit=limit)

    async def list_candidates(self, user_id: str, limit: int = 30) -> list[DiscoveryCandidate]:
        """List active discovery candidates."""
        stmt = (
            select(DiscoveryCandidate)
            .where(DiscoveryCandidate.user_id == user_id, DiscoveryCandidate.is_blocked.is_(False))
            .where(DiscoveryCandidate.dismissed_at.is_(None))
            .where(DiscoveryCandidate.subscribed_at.is_(None))
            .order_by(DiscoveryCandidate.discovery_score.desc(), DiscoveryCandidate.refreshed_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def start_trial(self, user_id: str, candidate_id: str, days: int) -> DiscoveryCandidateResponse:
        """Start source trial window."""
        candidate = await self._get_owned_candidate(user_id, candidate_id)
        now = datetime.now(UTC)
        candidate.trial_started_at = now
        candidate.trial_ends_at = now + timedelta(days=max(1, min(days, 30)))
        await self._record_feedback(user_id, candidate.id, "trial_start", candidate.topic)
        await self.session.commit()
        await self.session.refresh(candidate)
        return DiscoveryCandidateResponse.model_validate(candidate)

    async def dismiss_candidate(self, user_id: str, candidate_id: str) -> None:
        """Dismiss a candidate source."""
        candidate = await self._get_owned_candidate(user_id, candidate_id)
        candidate.dismissed_at = datetime.now(UTC)
        await self._record_feedback(user_id, candidate.id, "dismiss_source", candidate.topic)
        await self.session.commit()

    async def reduce_topic(self, user_id: str, candidate_id: str, topic: str | None) -> None:
        """Reduce recommendation weight for a topic."""
        candidate = await self._get_owned_candidate(user_id, candidate_id)
        target_topic = topic or candidate.topic
        stmt = select(DiscoveryCandidate).where(
            DiscoveryCandidate.user_id == user_id,
            DiscoveryCandidate.topic == target_topic,
            DiscoveryCandidate.dismissed_at.is_(None),
        )
        result = await self.session.execute(stmt)
        for row in result.scalars().all():
            row.discovery_score *= 0.6
        await self._record_feedback(user_id, candidate.id, "reduce_topic", target_topic)
        await self.session.commit()

    async def mark_subscribed(self, user_id: str, candidate_id: str) -> None:
        """Mark candidate as subscribed."""
        candidate = await self._get_owned_candidate(user_id, candidate_id)
        candidate.subscribed_at = datetime.now(UTC)
        await self._record_feedback(user_id, candidate.id, "subscribed", candidate.topic)
        await self.session.commit()

    async def get_candidate(self, user_id: str, candidate_id: str) -> DiscoveryCandidate:
        """Get a user-owned discovery candidate."""
        return await self._get_owned_candidate(user_id, candidate_id)

    async def _get_owned_candidate(self, user_id: str, candidate_id: str) -> DiscoveryCandidate:
        stmt = select(DiscoveryCandidate).where(
            DiscoveryCandidate.id == candidate_id,
            DiscoveryCandidate.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        candidate = result.scalar_one_or_none()
        if candidate is None:
            raise ValueError("Discovery candidate not found")
        return candidate

    async def _record_feedback(
        self, user_id: str, candidate_id: str, feedback_type: str, topic: str | None = None
    ) -> None:
        exists_stmt = select(func.count()).select_from(DiscoveryFeedback).where(
            DiscoveryFeedback.user_id == user_id,
            DiscoveryFeedback.candidate_id == candidate_id,
            DiscoveryFeedback.feedback_type == feedback_type,
        )
        exists_result = await self.session.execute(exists_stmt)
        if int(exists_result.scalar() or 0) > 0:
            return

        self.session.add(
            DiscoveryFeedback(
                user_id=user_id,
                candidate_id=candidate_id,
                feedback_type=feedback_type,
                topic=topic,
            )
        )

    async def _get_user_topic_preferences(self, user_id: str) -> list[str]:
        stmt = (
            select(Feed.title, Feed.description)
            .join(Subscription, Subscription.feed_id == Feed.id)
            .where(Subscription.user_id == user_id)
        )
        result = await self.session.execute(stmt)

        counter: Counter[str] = Counter()
        for title, description in result.all():
            topic = self._infer_topic(" ".join(part for part in (title, description) if part))
            counter[topic] += 1

        if not counter:
            return ["engineering", "product", "design"]
        return [topic for topic, _count in counter.most_common(3)]

    async def _get_user_interest_terms(self, user_id: str, max_terms: int = 5) -> list[str]:
        stmt = (
            select(Feed.title)
            .join(Subscription, Subscription.feed_id == Feed.id)
            .where(Subscription.user_id == user_id)
        )
        result = await self.session.execute(stmt)
        counter: Counter[str] = Counter()
        for (title,) in result.all():
            if not title:
                continue
            for token in re.findall(r"[A-Za-z][A-Za-z0-9\\-]{2,}", title.lower()):
                if token in STOPWORDS or token.isdigit():
                    continue
                counter[token] += 1
        return [token for token, _ in counter.most_common(max_terms)]

    def _build_search_queries(
        self, preferred_topics: list[str], interest_terms: list[str]
    ) -> list[dict[str, str]]:
        specs: list[dict[str, str]] = []
        for topic in preferred_topics:
            packs = TOPIC_QUERY_PACKS.get(topic, TOPIC_QUERY_PACKS["general"])
            for strategy, templates in packs.items():
                for template in templates:
                    query = template
                    if interest_terms and strategy == "blogs":
                        query = f"{template} {' '.join(interest_terms[:2])}"
                    specs.append({"query": query, "topic": topic, "strategy": strategy})

        # Keep query fan-out bounded to avoid rate-limit spikes.
        limit = max(1, min(int(os.getenv("DISCOVERY_QUERY_COUNT", "4")), 8))
        deduped: list[dict[str, str]] = []
        seen: set[str] = set()
        for item in specs:
            query = item["query"]
            if query not in seen:
                seen.add(query)
                deduped.append(item)
            if len(deduped) >= limit:
                break
        return deduped

    async def _collect_search_candidates(
        self,
        existing_urls: set[str],
        preferred_topics: list[str],
        query_specs: list[dict[str, str]],
        limit: int,
        tavily_api_key: str | None,
    ) -> list[dict[str, str | float]]:
        drafts: list[dict[str, str | float]] = []
        seen_feed_urls: set[str] = set()
        seen_source_urls: set[str] = set()
        search_max = max(5, min(int(os.getenv("DISCOVERY_SEARCH_MAX_RESULTS", "8")), 20))
        total_results_seen = 0
        total_validated = 0
        strategy_counts: Counter[str] = Counter()

        for spec in query_specs:
            query = spec["query"]
            strategy = spec["strategy"]
            preferred_topic = spec["topic"]
            results = await self._search_tavily(
                query=query,
                max_results=search_max,
                api_key=tavily_api_key,
            )
            total_results_seen += len(results)
            for item in results:
                result_url = (item.get("url") or "").strip()
                if not result_url:
                    continue
                if strategy == "blogs" and self._is_meta_rss_page(
                    url=result_url,
                    title=str(item.get("title") or ""),
                    content=str(item.get("content") or ""),
                ):
                    continue

                for candidate_url in await self._expand_candidate_urls(result_url, strategy):
                    if candidate_url in seen_source_urls:
                        continue
                    seen_source_urls.add(candidate_url)

                    discovered = await self._discover_feed_from_result_url(candidate_url)
                    if discovered is None:
                        continue
                    feed_url, feed_title, resolved_site_url = discovered

                    if feed_url in existing_urls or feed_url in seen_feed_urls:
                        continue
                    seen_feed_urls.add(feed_url)
                    total_validated += 1
                    strategy_counts[strategy] += 1

                    host = urlparse(resolved_site_url).netloc
                    combined_text = " ".join(
                        value
                        for value in (
                            query,
                            item.get("title", ""),
                            item.get("content", ""),
                            feed_title,
                        )
                        if value
                    )
                    topic = self._infer_topic(combined_text)
                    raw_score = self._to_float(item.get("score"))
                    relevance_bonus = 0.20 if topic in preferred_topics else 0.0
                    if topic == preferred_topic:
                        relevance_bonus += 0.08
                    relevance_score = self._clamp(
                        0.45 + relevance_bonus + raw_score * 0.20, 0.0, 1.0
                    )
                    quality_score = self._clamp(0.50 + raw_score * 0.35, 0.0, 1.0)
                    reason = (item.get("content", "") or "").strip()[:500]

                    drafts.append(
                        {
                            "feed_url": feed_url,
                            "site_url": resolved_site_url,
                            "title": feed_title,
                            "topic": topic,
                            "host": host,
                            "reason": reason,
                            "source_kind": f"search_{strategy}",
                            "quality_score": quality_score,
                            "relevance_score": relevance_score,
                        }
                    )
                    if len(drafts) >= limit:
                        logger.info(
                            "Discovery search refresh summary",
                            extra={
                                "queries": [item["query"] for item in query_specs],
                                "total_results_seen": total_results_seen,
                                "validated_feeds": total_validated,
                                "candidates_emitted": len(drafts),
                                "strategy_counts": dict(strategy_counts),
                            },
                        )
                        return drafts

        logger.info(
            "Discovery search refresh summary",
            extra={
                "queries": [item["query"] for item in query_specs],
                "total_results_seen": total_results_seen,
                "validated_feeds": total_validated,
                "candidates_emitted": len(drafts),
                "strategy_counts": dict(strategy_counts),
            },
        )
        return drafts

    async def _search_tavily(
        self, query: str, max_results: int, api_key: str | None
    ) -> list[dict[str, str | float]]:
        resolved_api_key = (api_key or os.getenv("TAVILY_API_KEY", "")).strip()
        if not resolved_api_key:
            logger.warning("Tavily key missing in user settings and env; discovery search disabled")
            return []

        search_url = os.getenv("DISCOVERY_SEARCH_URL", "https://api.tavily.com/search")
        timeout = float(os.getenv("DISCOVERY_SEARCH_TIMEOUT", "20"))
        payload = {
            "api_key": resolved_api_key,
            "query": query,
            "search_depth": "basic",
            "include_answer": False,
            "include_raw_content": False,
            "max_results": max_results,
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(search_url, json=payload)
                response.raise_for_status()
            data = response.json()
        except (httpx.HTTPError, ValueError):
            logger.exception("Discovery search request failed", extra={"query": query})
            return []

        results = data.get("results")
        if not isinstance(results, list):
            return []
        parsed: list[dict[str, str | float]] = []
        for row in results:
            if not isinstance(row, dict):
                continue
            parsed.append(
                {
                    "title": str(row.get("title") or ""),
                    "url": str(row.get("url") or ""),
                    "content": str(row.get("content") or ""),
                    "score": self._to_float(row.get("score")),
                }
            )
        return parsed

    async def _get_user_tavily_api_key(self, user_id: str) -> str | None:
        stmt = select(User.settings).where(User.id == user_id)
        result = await self.session.execute(stmt)
        settings = result.scalar_one_or_none() or {}
        if not isinstance(settings, dict):
            return None

        key = settings.get("discovery_tavily_api_key")
        if isinstance(key, str) and key.strip():
            return key.strip()
        return None

    async def _discover_feed_from_result_url(self, result_url: str) -> tuple[str, str, str] | None:
        """Try feed discovery on a result URL, then fall back to site homepage."""
        try:
            feed_url, feed_title = await discover_feed(result_url, timeout=15)
            return feed_url, feed_title, result_url
        except ValueError:
            pass

        parsed = urlparse(result_url)
        if not parsed.scheme or not parsed.netloc:
            return None

        homepage = f"{parsed.scheme}://{parsed.netloc}"
        if homepage == result_url:
            return None

        try:
            feed_url, feed_title = await discover_feed(homepage, timeout=15)
            return feed_url, feed_title, homepage
        except ValueError:
            return None

    async def _expand_candidate_urls(self, result_url: str, strategy: str) -> list[str]:
        if strategy == "blogs":
            return [result_url]

        expanded = await self._extract_outbound_urls(
            page_url=result_url,
            max_links=8,
            external_only=True,
        )
        if result_url not in expanded:
            expanded.append(result_url)
        return expanded

    async def _extract_outbound_urls(
        self, page_url: str, max_links: int = 8, external_only: bool = True
    ) -> list[str]:
        try:
            async with httpx.AsyncClient(
                timeout=12,
                follow_redirects=True,
                headers={"User-Agent": "Glean/1.0"},
            ) as client:
                response = await client.get(page_url)
                response.raise_for_status()
        except httpx.HTTPError:
            return []

        content_type = response.headers.get("content-type", "").lower()
        if "html" not in content_type and "text/" not in content_type:
            return []

        base_host = urlparse(page_url).netloc
        soup = BeautifulSoup(response.text, "lxml")
        seen: set[str] = set()
        links: list[str] = []
        for anchor in soup.find_all("a", href=True):
            href = str(anchor.get("href") or "").strip()
            if not href or href.startswith("#") or href.startswith("mailto:"):
                continue
            absolute = urljoin(page_url, href)
            parsed = urlparse(absolute)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                continue
            if external_only and parsed.netloc == base_host:
                continue
            normalized = f"{parsed.scheme}://{parsed.netloc}{parsed.path or ''}"
            if normalized in seen:
                continue
            seen.add(normalized)
            links.append(normalized)
            if len(links) >= max_links:
                break
        return links

    def _infer_topic(self, text: str) -> str:
        content = text.lower()
        best_topic = "engineering"
        best_score = -1
        for topic, keywords in TOPIC_KEYWORDS.items():
            score = sum(1 for keyword in keywords if keyword in content)
            if score > best_score:
                best_topic = topic
                best_score = score
        return best_topic if best_score > 0 else "engineering"

    def _is_meta_rss_page(self, url: str, title: str, content: str) -> bool:
        blob = f"{url} {title} {content}".lower()
        return any(hint in blob for hint in META_RSS_PAGE_HINTS)

    @staticmethod
    def _to_float(value: object) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _clamp(value: float, low: float, high: float) -> float:
        return max(low, min(high, value))

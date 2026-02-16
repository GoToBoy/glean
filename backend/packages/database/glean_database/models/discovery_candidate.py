"""
DiscoveryCandidate model definition.

Stores single-user source discovery candidates and quality metadata.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class DiscoveryCandidate(Base, TimestampMixin):
    """Source discovery candidate for a specific user."""

    __tablename__ = "discovery_candidates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feed_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    site_url: Mapped[str | None] = mapped_column(String(2000))
    title: Mapped[str | None] = mapped_column(String(500))
    language: Mapped[str | None] = mapped_column(String(10))
    topic: Mapped[str] = mapped_column(String(100), default="general", nullable=False, index=True)
    source_kind: Mapped[str] = mapped_column(
        String(30), default="whitelist", nullable=False, index=True
    )
    reason: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    quality_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    relevance_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    novelty_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    diversity_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    discovery_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, index=True)
    fetch_success_rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    update_stability_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    dedup_ratio: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[str | None] = mapped_column(Text)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    subscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refreshed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    user = relationship("User")

    __table_args__ = (
        UniqueConstraint("user_id", "feed_url", name="uq_discovery_candidate_user_feed"),
    )

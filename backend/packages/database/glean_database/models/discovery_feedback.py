"""
DiscoveryFeedback model definition.

Stores explicit feedback actions on source discovery candidates.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class DiscoveryFeedback(Base, TimestampMixin):
    """Explicit feedback for discovery candidates."""

    __tablename__ = "discovery_feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    candidate_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("discovery_candidates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feedback_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    topic: Mapped[str | None] = mapped_column(String(100))
    created_at_event: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User")
    candidate = relationship("DiscoveryCandidate")

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "candidate_id",
            "feedback_type",
            name="uq_discovery_feedback_user_candidate_type",
        ),
    )

"""UserEntryEvent model definition."""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class UserEntryEvent(Base, TimestampMixin):
    """Raw user entry behavior events for implicit feedback."""

    __tablename__ = "user_entry_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    event_id: Mapped[str] = mapped_column(String(64), nullable=False)

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entry_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    view: Mapped[str | None] = mapped_column(String(16))
    device_type: Mapped[str | None] = mapped_column(String(16))

    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    client_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    active_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scroll_depth_max: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    est_read_time_sec: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    extra: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    user = relationship("User", back_populates="entry_events")
    entry = relationship("Entry", back_populates="entry_events")

    __table_args__ = (
        UniqueConstraint("event_id", name="uq_user_entry_event_event_id"),
        Index("ix_user_entry_events_user_entry_occurred", "user_id", "entry_id", "occurred_at"),
        Index("ix_user_entry_events_entry_occurred", "entry_id", "occurred_at"),
        Index("ix_user_entry_events_user_occurred", "user_id", "occurred_at"),
    )

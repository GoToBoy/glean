"""UserEntryImplicitLabel model definition."""

from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class UserEntryImplicitLabel(Base, TimestampMixin):
    """Daily aggregated implicit feedback labels per user-entry."""

    __tablename__ = "user_entry_implicit_labels"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)

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

    label_date: Mapped[date] = mapped_column(Date, nullable=False)

    total_sessions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    quick_skip_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    effective_read_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    return_read_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    total_active_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_est_read_time_sec: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    avg_normalized_dwell: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    user = relationship("User", back_populates="entry_implicit_labels")
    entry = relationship("Entry", back_populates="entry_implicit_labels")

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "entry_id",
            "label_date",
            name="uq_user_entry_implicit_labels_day",
        ),
        Index("ix_user_entry_implicit_labels_user_date", "user_id", "label_date"),
        Index("ix_user_entry_implicit_labels_entry_date", "entry_id", "label_date"),
    )

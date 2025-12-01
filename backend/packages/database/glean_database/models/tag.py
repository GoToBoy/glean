"""
Tag model definition.

This module defines the Tag model for labeling entries and bookmarks.
"""

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, generate_uuid


class Tag(Base, TimestampMixin):
    """
    Tag model for labeling content.

    Tags are user-private and can be applied to entries and bookmarks.

    Attributes:
        id: Unique tag identifier (UUID).
        user_id: Owner user reference.
        name: Tag name.
        color: Optional color code (e.g., #FF5733).
    """

    __tablename__ = "tags"

    # Primary key
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)

    # Foreign keys
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Tag properties
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str | None] = mapped_column(String(7))

    # Relationships
    user = relationship("User", back_populates="tags")
    bookmark_tags = relationship(
        "BookmarkTag", back_populates="tag", cascade="all, delete-orphan"
    )
    user_entry_tags = relationship(
        "UserEntryTag", back_populates="tag", cascade="all, delete-orphan"
    )

    # Constraints
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_tag_name"),)


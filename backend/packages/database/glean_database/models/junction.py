"""
Junction table models.

This module defines many-to-many relationship tables.
"""

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class BookmarkFolder(Base):
    """
    Bookmark-Folder many-to-many relationship.

    Links bookmarks to folders (one bookmark can be in multiple folders).
    """

    __tablename__ = "bookmark_folders"

    bookmark_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("bookmarks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    folder_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("folders.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Relationships
    bookmark = relationship("Bookmark", back_populates="bookmark_folders")
    folder = relationship("Folder", back_populates="bookmark_folders")


class BookmarkTag(Base):
    """
    Bookmark-Tag many-to-many relationship.

    Links bookmarks to tags.
    """

    __tablename__ = "bookmark_tags"

    bookmark_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("bookmarks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Relationships
    bookmark = relationship("Bookmark", back_populates="bookmark_tags")
    tag = relationship("Tag", back_populates="bookmark_tags")


class UserEntryTag(Base):
    """
    UserEntry-Tag many-to-many relationship.

    Links user entries to tags for organizing articles.
    """

    __tablename__ = "user_entry_tags"

    user_entry_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("user_entries.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )

    # Relationships
    user_entry = relationship("UserEntry", back_populates="user_entry_tags")
    tag = relationship("Tag", back_populates="user_entry_tags")


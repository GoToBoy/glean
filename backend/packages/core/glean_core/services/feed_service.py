"""
Feed and subscription service.

Handles feed discovery, subscription management, and OPML import/export.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from glean_core.schemas import FeedResponse, SubscriptionResponse
from glean_database.models import Feed, Subscription, User


class FeedService:
    """Feed and subscription management service."""

    def __init__(self, session: AsyncSession):
        """
        Initialize feed service.

        Args:
            session: Database session.
        """
        self.session = session

    async def get_user_subscriptions(self, user_id: str) -> list[SubscriptionResponse]:
        """
        Get all subscriptions for a user.

        Args:
            user_id: User identifier.

        Returns:
            List of subscription responses.
        """
        stmt = (
            select(Subscription)
            .where(Subscription.user_id == user_id)
            .options(selectinload(Subscription.feed))
            .order_by(Subscription.created_at.desc())
        )
        result = await self.session.execute(stmt)
        subscriptions = result.scalars().all()

        return [SubscriptionResponse.model_validate(sub) for sub in subscriptions]

    async def get_subscription(self, subscription_id: str, user_id: str) -> SubscriptionResponse:
        """
        Get a specific subscription.

        Args:
            subscription_id: Subscription identifier.
            user_id: User identifier for authorization.

        Returns:
            Subscription response.

        Raises:
            ValueError: If subscription not found or unauthorized.
        """
        stmt = (
            select(Subscription)
            .where(Subscription.id == subscription_id, Subscription.user_id == user_id)
            .options(selectinload(Subscription.feed))
        )
        result = await self.session.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            raise ValueError("Subscription not found")

        return SubscriptionResponse.model_validate(subscription)

    async def create_subscription(self, user_id: str, feed_url: str) -> SubscriptionResponse:
        """
        Create a new subscription.

        This will be enhanced with RSS discovery in the RSS package.

        Args:
            user_id: User identifier.
            feed_url: Feed URL.

        Returns:
            Subscription response.

        Raises:
            ValueError: If subscription already exists.
        """
        # Check if feed exists
        stmt = select(Feed).where(Feed.url == feed_url)
        result = await self.session.execute(stmt)
        feed = result.scalar_one_or_none()

        if not feed:
            # Create new feed (basic version, will be enhanced with RSS discovery)
            feed = Feed(url=feed_url, title=feed_url, status="active")
            self.session.add(feed)
            await self.session.flush()

        # Check if subscription already exists
        stmt = select(Subscription).where(
            Subscription.user_id == user_id, Subscription.feed_id == feed.id
        )
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            raise ValueError("Already subscribed to this feed")

        # Create subscription
        subscription = Subscription(user_id=user_id, feed_id=feed.id)
        self.session.add(subscription)
        await self.session.commit()
        await self.session.refresh(subscription)

        # Load feed relationship
        stmt = (
            select(Subscription)
            .where(Subscription.id == subscription.id)
            .options(selectinload(Subscription.feed))
        )
        result = await self.session.execute(stmt)
        subscription = result.scalar_one()

        return SubscriptionResponse.model_validate(subscription)

    async def delete_subscription(self, subscription_id: str, user_id: str) -> None:
        """
        Delete a subscription.

        Args:
            subscription_id: Subscription identifier.
            user_id: User identifier for authorization.

        Raises:
            ValueError: If subscription not found or unauthorized.
        """
        stmt = select(Subscription).where(
            Subscription.id == subscription_id, Subscription.user_id == user_id
        )
        result = await self.session.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            raise ValueError("Subscription not found")

        await self.session.delete(subscription)
        await self.session.commit()

    async def update_subscription(
        self, subscription_id: str, user_id: str, custom_title: str | None
    ) -> SubscriptionResponse:
        """
        Update subscription settings.

        Args:
            subscription_id: Subscription identifier.
            user_id: User identifier for authorization.
            custom_title: Custom title override.

        Returns:
            Updated subscription response.

        Raises:
            ValueError: If subscription not found or unauthorized.
        """
        stmt = select(Subscription).where(
            Subscription.id == subscription_id, Subscription.user_id == user_id
        )
        result = await self.session.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription:
            raise ValueError("Subscription not found")

        subscription.custom_title = custom_title
        await self.session.commit()

        # Reload with feed
        stmt = (
            select(Subscription)
            .where(Subscription.id == subscription_id)
            .options(selectinload(Subscription.feed))
        )
        result = await self.session.execute(stmt)
        subscription = result.scalar_one()

        return SubscriptionResponse.model_validate(subscription)

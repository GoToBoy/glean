"""Global pytest fixtures for testing."""

import asyncio
import os
from collections.abc import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from glean_api.main import app
from glean_database import Base
from glean_database.session import get_session

# Test database URL
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql+asyncpg://glean:devpassword@localhost:5432/glean_test"
)


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create event loop for session scope."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=NullPool,  # Disable connection pooling for tests
    )

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Cleanup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a fresh database session for each test."""
    # Create connection
    async with test_engine.connect() as connection:
        # Start outer transaction
        transaction = await connection.begin()

        # Create session bound to the connection
        async_session = async_sessionmaker(
            bind=connection,
            class_=AsyncSession,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )

        async with async_session() as session:
            yield session

            # Rollback the outer transaction
            await transaction.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create test HTTP client with database override."""

    async def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession):
    """Create a test user."""
    from glean_core.schemas.user import UserCreate
    from glean_core.services.user_service import UserService

    service = UserService(db_session)
    user_create = UserCreate(email="test@example.com", name="Test User", password="TestPass123")
    user = await service.create_user(user_create)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(test_user) -> dict[str, str]:
    """Generate auth headers for test user."""
    from glean_api.config import settings
    from glean_core.auth.jwt import JWTConfig, create_access_token

    jwt_config = JWTConfig(
        secret_key=settings.secret_key,
        algorithm=settings.jwt_algorithm,
        access_token_expire_minutes=settings.jwt_access_token_expire_minutes,
        refresh_token_expire_days=settings.jwt_refresh_token_expire_days,
    )
    access_token = create_access_token(str(test_user.id), jwt_config)
    return {"Authorization": f"Bearer {access_token}"}


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession):
    """Create a test admin user."""
    from glean_core.services import AdminService
    from glean_database.models.admin import AdminRole

    service = AdminService(db_session)
    admin = await service.create_admin_user(
        username="admin_test", password="Admin123!", role=AdminRole.SUPER_ADMIN
    )
    await db_session.commit()
    await db_session.refresh(admin)
    return admin


@pytest_asyncio.fixture
async def admin_headers(admin_user) -> dict[str, str]:
    """Generate auth headers for admin user."""
    from glean_core.auth.jwt import create_access_token

    access_token = create_access_token(
        data={"sub": admin_user.id, "username": admin_user.username, "role": admin_user.role.value, "type": "admin"}
    )
    return {"Authorization": f"Bearer {access_token}"}

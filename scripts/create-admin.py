#!/usr/bin/env python3
"""
Create initial admin user.

Usage:
    python scripts/create-admin.py
    python scripts/create-admin.py --username admin --password AdminPass123! --role super_admin
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

import os

from glean_core.services import AdminService
from glean_database.models.admin import AdminRole
from glean_database.session import get_session, init_database


async def create_admin(username: str, password: str, role: str) -> None:
    """Create an admin user."""
    # Get database URL from environment
    database_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://glean:devpassword@localhost:5432/glean")
    
    # Initialize database
    init_database(database_url)

    # Parse role
    try:
        admin_role = AdminRole(role)
    except ValueError:
        print(f"Invalid role: {role}")
        print(f"Valid roles: {', '.join([r.value for r in AdminRole])}")
        return

    # Create admin
    async for session in get_session():
        service = AdminService(session)

        try:
            admin = await service.create_admin_user(
                username=username, password=password, role=admin_role
            )
            print(f"✅ Admin user created successfully!")
            print(f"   Username: {admin.username}")
            print(f"   Role: {admin.role if isinstance(admin.role, str) else admin.role.value}")
            print(f"   ID: {admin.id}")
        except Exception as e:
            await session.rollback()
            error_msg = str(e)
            if "duplicate key" in error_msg or "already exists" in error_msg:
                print(f"⚠️  Admin user '{username}' already exists.")
                print(f"   Use a different username or delete the existing user first.")
                return
            else:
                print(f"❌ Error creating admin user: {e}")
                raise


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Create initial admin user")
    parser.add_argument("--username", default="admin", help="Admin username (default: admin)")
    parser.add_argument(
        "--password", default="Admin123!", help="Admin password (default: Admin123!)"
    )
    parser.add_argument(
        "--role",
        default="super_admin",
        choices=["super_admin", "admin"],
        help="Admin role (default: super_admin)",
    )

    args = parser.parse_args()

    print(f"Creating admin user: {args.username}")
    asyncio.run(create_admin(args.username, args.password, args.role))


if __name__ == "__main__":
    main()


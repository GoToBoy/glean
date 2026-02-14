"""Tests for FastAPI app factory isolation behavior."""

from starlette.routing import Mount

from glean_api.main import create_app


def _get_mcp_mount_app(app) -> object:
    for route in app.routes:
        if isinstance(route, Mount) and route.path == "/mcp":
            return route.app
    raise AssertionError("MCP mount not found")


def test_create_app_builds_independent_mcp_mounts() -> None:
    """Factory should return apps with isolated MCP server mounts."""
    app_one = create_app()
    app_two = create_app()

    mcp_app_one = _get_mcp_mount_app(app_one)
    mcp_app_two = _get_mcp_mount_app(app_two)

    assert mcp_app_one is not mcp_app_two

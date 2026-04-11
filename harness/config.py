"""Harness configuration and resolved service definitions."""

from __future__ import annotations

from dataclasses import dataclass, field

from .instances import InstanceConfig


@dataclass(frozen=True)
class ServiceConfig:
    name: str
    cwd: str
    command: list[str]
    port: int | None = None
    url: str | None = None
    env: dict[str, str] = field(default_factory=dict)
    health_kind: str = "process"

DEFAULT_SERVICES = ("api", "worker", "web", "admin")
INFRA_UP_COMMAND = ["docker", "compose", "-f", "docker-compose.dev.yml", "up", "-d"]
INFRA_DOWN_COMMAND = ["docker", "compose", "-f", "docker-compose.dev.yml", "down"]


def resolved_services(instance: InstanceConfig) -> dict[str, ServiceConfig]:
    database_url = (
        "postgresql+asyncpg://glean:devpassword@127.0.0.1:"
        f"{instance.ports['postgres']}/glean"
    )
    redis_url = f"redis://127.0.0.1:{instance.ports['redis']}/0"
    api_url = f"http://127.0.0.1:{instance.ports['api']}"
    return {
        "api": ServiceConfig(
            name="api",
            cwd=str(instance.root / "backend"),
            command=[
                "uv",
                "run",
                "uvicorn",
                "glean_api.main:app",
                "--reload",
                "--host",
                "127.0.0.1",
                "--port",
                str(instance.ports["api"]),
            ],
            port=instance.ports["api"],
            url=f"{api_url}/api/health",
            env={
                "DATABASE_URL": database_url,
                "REDIS_URL": redis_url,
            },
            health_kind="http",
        ),
        "worker": ServiceConfig(
            name="worker",
            cwd=str(instance.root / "backend"),
            command=[
                "uv",
                "run",
                "python",
                "scripts/run-arq-worker.py",
                "glean_worker.main.WorkerSettings",
            ],
            env={
                "DATABASE_URL": database_url,
                "REDIS_URL": redis_url,
            },
            health_kind="process",
        ),
        "web": ServiceConfig(
            name="web",
            cwd=str(instance.root / "frontend"),
            command=[
                "pnpm",
                "--filter",
                "@glean/web",
                "dev",
                "--",
                "--host",
                "127.0.0.1",
                "--port",
                str(instance.ports["web"]),
            ],
            port=instance.ports["web"],
            url=f"http://127.0.0.1:{instance.ports['web']}/",
            env={"VITE_DEV_API_TARGET": api_url},
            health_kind="http",
        ),
        "admin": ServiceConfig(
            name="admin",
            cwd=str(instance.root / "frontend"),
            command=[
                "pnpm",
                "--filter",
                "@glean/admin",
                "dev",
                "--",
                "--host",
                "127.0.0.1",
                "--port",
                str(instance.ports["admin"]),
            ],
            port=instance.ports["admin"],
            url=f"http://127.0.0.1:{instance.ports['admin']}/",
            env={"VITE_DEV_API_TARGET": api_url},
            health_kind="http",
        ),
    }


def infra_env(instance: InstanceConfig) -> dict[str, str]:
    return {
        "COMPOSE_PROJECT_NAME": instance.compose_project_name,
        "HARNESS_POSTGRES_PORT": str(instance.ports["postgres"]),
        "HARNESS_REDIS_PORT": str(instance.ports["redis"]),
    }

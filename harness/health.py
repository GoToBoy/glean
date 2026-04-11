"""Health checks for the local harness."""

from __future__ import annotations

import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Literal

from .config import ServiceConfig
from .instances import InstanceConfig
from .processes import is_pid_alive


@dataclass(frozen=True)
class HealthResult:
    name: str
    status: Literal["healthy", "unhealthy", "unknown"]
    detail: str


def _tcp_port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _http_ok(url: str, timeout: float = 2.0) -> tuple[bool, str]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status < 500, f"HTTP {response.status}"
    except urllib.error.HTTPError as exc:
        return exc.code < 500, f"HTTP {exc.code}"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def check_infra_health(instance: InstanceConfig) -> list[HealthResult]:
    results: list[HealthResult] = []
    for name in ("postgres", "redis"):
        port = instance.ports[name]
        is_open = _tcp_port_open("127.0.0.1", port)
        results.append(
            HealthResult(
                name=name,
                status="healthy" if is_open else "unhealthy",
                detail=f"tcp://127.0.0.1:{port}",
            )
        )
    return results


def check_service_health(
    service_name: str,
    services: dict[str, ServiceConfig],
    state: dict[str, object],
) -> HealthResult:
    service = services[service_name]
    services_state = state.get("services", {})
    if not isinstance(services_state, dict):
        return HealthResult(service_name, "unknown", "no runtime state")

    service_state = services_state.get(service_name)
    if not isinstance(service_state, dict):
        return HealthResult(service_name, "unknown", "not started by harness")

    pid = service_state.get("pid")
    if not isinstance(pid, int) or not is_pid_alive(pid):
        return HealthResult(service_name, "unhealthy", "process not running")

    if service.health_kind == "http" and service.url:
        ok, detail = _http_ok(service.url)
        return HealthResult(service_name, "healthy" if ok else "unhealthy", detail)

    return HealthResult(service_name, "healthy", f"pid={pid}")

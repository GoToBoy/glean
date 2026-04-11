"""Observability helpers for the local harness."""

from __future__ import annotations

import datetime as dt
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .config import ServiceConfig
from .health import check_infra_health, check_service_health
from .instances import InstanceConfig
from .logs import read_error_logs
from .processes import is_pid_alive, load_state, service_log_path


def _iso_timestamp(timestamp: float | None) -> str | None:
    if timestamp is None:
        return None
    return dt.datetime.fromtimestamp(timestamp, tz=dt.timezone.utc).isoformat()


def _duration_seconds(started_at: float | None, *, now: float) -> float | None:
    if started_at is None:
        return None
    return max(0.0, now - started_at)


def _log_metadata(path: Path) -> dict[str, Any]:
    exists = path.exists()
    modified_at: str | None = None
    size_bytes = 0
    if exists:
        stat = path.stat()
        modified_at = _iso_timestamp(stat.st_mtime)
        size_bytes = stat.st_size
    return {
        "path": str(path),
        "exists": exists,
        "modified_at": modified_at,
        "size_bytes": size_bytes,
    }


def build_snapshot(
    instance: InstanceConfig,
    services: dict[str, ServiceConfig],
    *,
    service_names: list[str] | None = None,
    error_scan_lines: int = 200,
    error_limit: int = 10,
) -> dict[str, Any]:
    now = dt.datetime.now(tz=dt.timezone.utc)
    state = load_state(instance)
    selected = service_names or list(services)
    active = {
        name
        for name, service_state in state.get("services", {}).items()
        if isinstance(service_state, dict)
        and isinstance(service_state.get("pid"), int)
        and is_pid_alive(service_state["pid"])
    }
    snapshot_services: dict[str, Any] = {}

    for name in selected:
        cfg = services[name]
        service_state = state.get("services", {}).get(name, {})
        started_at = (
            float(service_state["started_at"])
            if isinstance(service_state, dict) and isinstance(service_state.get("started_at"), (int, float))
            else None
        )
        log_path = service_log_path(instance, name)
        snapshot_services[name] = {
            "status": asdict(check_service_health(name, services, state)),
            "running": name in active,
            "pid": service_state.get("pid") if isinstance(service_state, dict) else None,
            "command": service_state.get("command") if isinstance(service_state, dict) else None,
            "cwd": service_state.get("cwd") if isinstance(service_state, dict) else None,
            "port": cfg.port,
            "url": cfg.url,
            "started_at": _iso_timestamp(started_at),
            "uptime_seconds": _duration_seconds(started_at, now=now.timestamp()),
            "log": {
                **_log_metadata(log_path),
                "recent_errors": read_error_logs(
                    log_path,
                    scan_lines=error_scan_lines,
                    limit=error_limit,
                ),
            },
        }

    return {
        "captured_at": now.isoformat(),
        "instance": {
            "name": instance.name,
            "slot": instance.slot,
            "root": str(instance.root),
            "compose_project_name": instance.compose_project_name,
            "runtime_dir": str(instance.runtime_dir),
            "log_dir": str(instance.log_dir),
            "state_path": str(instance.state_path),
            "ports": instance.ports,
        },
        "infra": [asdict(result) for result in check_infra_health(instance)],
        "services": snapshot_services,
    }


def render_doctor_report(snapshot: dict[str, Any]) -> str:
    lines: list[str] = []
    instance = snapshot["instance"]
    infra = snapshot["infra"]
    services = snapshot["services"]

    lines.append(f"Instance: {instance['name']} (slot {instance['slot']})")
    lines.append(f"Root: {instance['root']}")
    lines.append(f"Runtime: {instance['runtime_dir']}")
    lines.append(f"Logs: {instance['log_dir']}")
    lines.append(f"Compose project: {instance['compose_project_name']}")
    lines.append("")
    lines.append("Infra:")
    for result in infra:
        lines.append(f"- {result['name']}: {result['status']} ({result['detail']})")

    lines.append("")
    lines.append("Services:")
    if not services:
        lines.append("- none selected")

    for name, service in services.items():
        status = service["status"]
        detail = status["detail"]
        lines.append(
            f"- {name}: {status['status']} | running={service['running']} | "
            f"pid={service['pid'] or '-'} | port={service['port'] or '-'} | {detail}"
        )
        lines.append(f"  log: {service['log']['path']}")
        if service["started_at"]:
            lines.append(
                f"  started_at: {service['started_at']} | "
                f"uptime_seconds={service['uptime_seconds']:.1f}"
            )
        recent_errors = service["log"]["recent_errors"]
        if recent_errors:
            lines.append("  recent_errors:")
            for error in recent_errors:
                lines.append(f"    {error}")

    advice = build_doctor_advice(snapshot)
    if advice:
        lines.append("")
        lines.append("Advice:")
        for item in advice:
            lines.append(f"- {item}")

    return "\n".join(lines)


def build_doctor_advice(snapshot: dict[str, Any]) -> list[str]:
    advice: list[str] = []
    if any(result["status"] != "healthy" for result in snapshot["infra"]):
        advice.append("Infra is not fully healthy. Start or inspect Docker services before debugging app processes.")

    unhealthy_services = [
        name
        for name, service in snapshot["services"].items()
        if service["status"]["status"] == "unhealthy"
    ]
    unknown_services = [
        name
        for name, service in snapshot["services"].items()
        if service["status"]["status"] == "unknown"
    ]
    if unhealthy_services:
        advice.append(
            "Unhealthy services detected: "
            + ", ".join(unhealthy_services)
            + ". Check `python3 -m harness logs <service>` or `--errors` for the failing service."
        )
    if unknown_services:
        advice.append(
            "Some services are not started by the harness yet: "
            + ", ".join(unknown_services)
            + ". Start them with `python3 -m harness up --services ...` if needed."
        )
    if not snapshot["services"]:
        advice.append("No services selected. Re-run doctor with specific services if you need a narrower diagnosis.")
    return advice

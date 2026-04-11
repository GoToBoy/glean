"""Process lifecycle management for the local harness."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import time
from collections.abc import Iterable
from contextlib import suppress
from pathlib import Path
from typing import Any

from .config import ServiceConfig
from .instances import InstanceConfig


def ensure_runtime_dirs(instance: InstanceConfig) -> None:
    instance.runtime_dir.mkdir(parents=True, exist_ok=True)
    instance.log_dir.mkdir(parents=True, exist_ok=True)


def load_state(instance: InstanceConfig) -> dict[str, Any]:
    if not instance.state_path.exists():
        return {"services": {}, "infra": {}}
    try:
        return json.loads(instance.state_path.read_text())
    except json.JSONDecodeError:
        return {"services": {}, "infra": {}}


def save_state(instance: InstanceConfig, state: dict[str, Any]) -> None:
    ensure_runtime_dirs(instance)
    instance.state_path.write_text(json.dumps(state, indent=2, sort_keys=True))


def is_pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def service_log_path(instance: InstanceConfig, service_name: str) -> Path:
    return instance.log_dir / f"{service_name}.log"


def refresh_service_state(state: dict[str, Any]) -> dict[str, Any]:
    services = state.setdefault("services", {})
    for name in list(services):
        pid = services[name].get("pid")
        if not isinstance(pid, int) or not is_pid_alive(pid):
            services.pop(name, None)
    return state


def running_services(state: dict[str, Any]) -> set[str]:
    refresh_service_state(state)
    return set(state.get("services", {}).keys())


def start_service(
    instance: InstanceConfig,
    services: dict[str, ServiceConfig],
    state: dict[str, Any],
    service_name: str,
) -> bool:
    ensure_runtime_dirs(instance)
    state = refresh_service_state(state)
    if service_name in state.get("services", {}):
        return False

    service = services[service_name]
    log_path = service_log_path(instance, service_name)
    with log_path.open("a", encoding="utf-8") as log_file:
        env = os.environ.copy()
        env.update(service.env)
        process = subprocess.Popen(  # noqa: S603
            service.command,
            cwd=service.cwd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
            env=env,
        )

    state.setdefault("services", {})[service_name] = {
        "pid": process.pid,
        "cwd": service.cwd,
        "command": service.command,
        "log_path": str(log_path),
        "url": service.url,
        "port": service.port,
        "started_at": time.time(),
    }
    save_state(instance, state)
    return True


def stop_service(
    instance: InstanceConfig,
    state: dict[str, Any],
    service_name: str,
    timeout_seconds: float = 10.0,
) -> bool:
    service_state = state.get("services", {}).get(service_name)
    if service_state is None:
        return False
    pid = service_state.get("pid")
    if not isinstance(pid, int):
        state["services"].pop(service_name, None)
        save_state(instance, state)
        return False

    with suppress(ProcessLookupError):
        os.killpg(pid, signal.SIGTERM)

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if not is_pid_alive(pid):
            break
        time.sleep(0.2)

    if is_pid_alive(pid):
        with suppress(ProcessLookupError):
            os.killpg(pid, signal.SIGKILL)

    state.get("services", {}).pop(service_name, None)
    save_state(instance, state)
    return True


def stop_services(instance: InstanceConfig, state: dict[str, Any], service_names: Iterable[str]) -> None:
    for name in service_names:
        stop_service(instance, state, name)


def tail_file(path: Path, lines: int) -> str:
    if not path.exists():
        return ""
    content = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return "\n".join(content[-lines:])

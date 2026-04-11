"""Worktree-aware harness instance resolution."""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT_BLOCK_SIZE = 100
BASE_PORTS = {
    "postgres": 5432,
    "redis": 6379,
    "api": 8000,
    "web": 3000,
    "admin": 3001,
}


@dataclass(frozen=True)
class InstanceConfig:
    name: str
    slot: int
    root: Path
    git_common_dir: Path
    compose_project_name: str
    runtime_dir: Path
    log_dir: Path
    state_path: Path
    ports: dict[str, int]


def sanitize_instance_name(value: str) -> str:
    sanitized = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-_").lower()
    return sanitized or "glean"


def build_ports_for_slot(slot: int) -> dict[str, int]:
    return {name: base + (slot * PORT_BLOCK_SIZE) for name, base in BASE_PORTS.items()}


def build_compose_project_name(name: str, slot: int) -> str:
    return f"glean-{sanitize_instance_name(name)}-{slot}"


def _git_common_dir() -> Path:
    completed = subprocess.run(  # noqa: S603
        ["git", "rev-parse", "--git-common-dir"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return (ROOT / completed.stdout.strip()).resolve()


def _registry_path(common_dir: Path) -> Path:
    return common_dir.parent / ".harness-registry.json"


def _load_registry(common_dir: Path) -> dict[str, dict[str, object]]:
    path = _registry_path(common_dir)
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text())
    except json.JSONDecodeError:
        return {}
    return raw if isinstance(raw, dict) else {}


def _save_registry(common_dir: Path, registry: dict[str, dict[str, object]]) -> None:
    _registry_path(common_dir).write_text(json.dumps(registry, indent=2, sort_keys=True))


def _tracked_worktrees() -> set[str]:
    completed = subprocess.run(  # noqa: S603
        ["git", "worktree", "list", "--porcelain"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    worktrees: set[str] = set()
    for line in completed.stdout.splitlines():
        if line.startswith("worktree "):
            worktrees.add(str(Path(line.removeprefix("worktree ")).resolve()))
    return worktrees


def _clean_registry(
    registry: dict[str, dict[str, object]],
    *,
    valid_worktrees: set[str],
) -> dict[str, dict[str, object]]:
    cleaned: dict[str, dict[str, object]] = {}
    for key, value in registry.items():
        root = value.get("root")
        if not isinstance(root, str):
            continue
        if root not in valid_worktrees:
            continue
        cleaned[key] = value
    return cleaned


def _allocate_slot(name: str, registry: dict[str, dict[str, object]]) -> int:
    used_slots = {
        value["slot"]
        for value in registry.values()
        if isinstance(value, dict) and isinstance(value.get("slot"), int)
    }
    preferred_slot = 0 if name == "glean" and 0 not in used_slots else None
    if preferred_slot is not None:
        return preferred_slot
    slot = 0
    while slot in used_slots:
        slot += 1
    return slot


def resolve_instance(name: str | None = None) -> InstanceConfig:
    common_dir = _git_common_dir()
    registry = _clean_registry(_load_registry(common_dir), valid_worktrees=_tracked_worktrees())

    instance_name = sanitize_instance_name(name or ROOT.name)
    key = f"{ROOT.resolve()}::{instance_name}"
    if key not in registry:
        slot = _allocate_slot(instance_name, registry)
        registry[key] = {
            "name": instance_name,
            "slot": slot,
            "root": str(ROOT.resolve()),
        }
        _save_registry(common_dir, registry)

    slot = int(registry[key]["slot"])
    runtime_dir = ROOT / ".harness" / "instances" / f"{instance_name}-{slot}"
    log_dir = runtime_dir / "logs"
    state_path = runtime_dir / "state.json"
    return InstanceConfig(
        name=instance_name,
        slot=slot,
        root=ROOT,
        git_common_dir=common_dir,
        compose_project_name=build_compose_project_name(instance_name, slot),
        runtime_dir=runtime_dir,
        log_dir=log_dir,
        state_path=state_path,
        ports=build_ports_for_slot(slot),
    )


def list_instances() -> list[InstanceConfig]:
    common_dir = _git_common_dir()
    registry = _clean_registry(_load_registry(common_dir), valid_worktrees=_tracked_worktrees())
    _save_registry(common_dir, registry)
    instances: list[InstanceConfig] = []
    for value in sorted(
        registry.values(),
        key=lambda item: (
            int(item["slot"]) if isinstance(item.get("slot"), int) else 9999,
            str(item.get("name", "")),
        ),
    ):
        root = Path(str(value["root"])).resolve()
        name = str(value["name"])
        slot = int(value["slot"])
        runtime_dir = root / ".harness" / "instances" / f"{name}-{slot}"
        instances.append(
            InstanceConfig(
                name=name,
                slot=slot,
                root=root,
                git_common_dir=common_dir,
                compose_project_name=build_compose_project_name(name, slot),
                runtime_dir=runtime_dir,
                log_dir=runtime_dir / "logs",
                state_path=runtime_dir / "state.json",
                ports=build_ports_for_slot(slot),
            )
        )
    return instances

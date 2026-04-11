import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness.config import ServiceConfig
from harness.instances import InstanceConfig
from harness.logs import read_error_logs
from harness.observability import build_snapshot, render_doctor_report
from harness.processes import save_state


def make_instance(tmp_path: Path) -> InstanceConfig:
    runtime_dir = tmp_path / ".harness" / "instances" / "demo-0"
    log_dir = runtime_dir / "logs"
    state_path = runtime_dir / "state.json"
    log_dir.mkdir(parents=True)
    return InstanceConfig(
        name="demo",
        slot=0,
        root=tmp_path,
        git_common_dir=tmp_path / ".git",
        compose_project_name="glean-demo-0",
        runtime_dir=runtime_dir,
        log_dir=log_dir,
        state_path=state_path,
        ports={"postgres": 5432, "redis": 6379, "api": 8000, "web": 3000, "admin": 3001},
    )


def test_read_error_logs_filters_recent_error_like_lines(tmp_path: Path):
    log_path = tmp_path / "worker.log"
    log_path.write_text(
        "\n".join(
            [
                "INFO worker booted",
                "WARNING retrying",
                "RuntimeError: boom",
                "INFO still running",
                "ERROR failed to fetch feed",
            ]
        ),
        encoding="utf-8",
    )

    assert read_error_logs(log_path, scan_lines=20, limit=5) == [
        "RuntimeError: boom",
        "ERROR failed to fetch feed",
    ]


def test_build_snapshot_includes_runtime_metadata_and_recent_errors(tmp_path: Path, monkeypatch):
    instance = make_instance(tmp_path)
    worker_log = instance.log_dir / "worker.log"
    worker_log.write_text("INFO boot\nERROR failed job\n", encoding="utf-8")
    save_state(
        instance,
        {
            "services": {
                "worker": {
                    "pid": 4242,
                    "cwd": str(tmp_path / "backend"),
                    "command": ["uv", "run", "python", "scripts/run-arq-worker.py"],
                    "log_path": str(worker_log),
                    "port": None,
                    "started_at": time.time() - 15,
                    "url": None,
                }
            },
            "infra": {},
        },
    )

    monkeypatch.setattr("harness.health.is_pid_alive", lambda pid: pid == 4242)
    monkeypatch.setattr("harness.observability.is_pid_alive", lambda pid: pid == 4242)
    monkeypatch.setattr("harness.health._tcp_port_open", lambda host, port, timeout=1.0: True)

    services = {
        "worker": ServiceConfig(
            name="worker",
            cwd=str(tmp_path / "backend"),
            command=["uv", "run", "python", "scripts/run-arq-worker.py"],
        )
    }

    snapshot = build_snapshot(instance, services)

    assert snapshot["instance"]["name"] == "demo"
    assert snapshot["infra"][0]["status"] == "healthy"
    assert snapshot["services"]["worker"]["status"]["status"] == "healthy"
    assert snapshot["services"]["worker"]["running"] is True
    assert snapshot["services"]["worker"]["log"]["recent_errors"] == ["ERROR failed job"]
    assert snapshot["services"]["worker"]["uptime_seconds"] is not None
    json.dumps(snapshot)


def test_render_doctor_report_surfaces_errors_and_advice(tmp_path: Path, monkeypatch):
    instance = make_instance(tmp_path)
    api_log = instance.log_dir / "api.log"
    api_log.write_text("Traceback: exploded\n", encoding="utf-8")
    save_state(
        instance,
        {
            "services": {
                "api": {
                    "pid": 9999,
                    "cwd": str(tmp_path / "backend"),
                    "command": ["uv", "run", "uvicorn"],
                    "log_path": str(api_log),
                    "port": 8000,
                    "started_at": time.time() - 5,
                    "url": "http://127.0.0.1:8000/api/health",
                }
            },
            "infra": {},
        },
    )

    monkeypatch.setattr("harness.health.is_pid_alive", lambda pid: False)
    monkeypatch.setattr("harness.observability.is_pid_alive", lambda pid: False)
    monkeypatch.setattr("harness.health._tcp_port_open", lambda host, port, timeout=1.0: False)

    services = {
        "api": ServiceConfig(
            name="api",
            cwd=str(tmp_path / "backend"),
            command=["uv", "run", "uvicorn"],
            port=8000,
            url="http://127.0.0.1:8000/api/health",
            health_kind="http",
        )
    }

    snapshot = build_snapshot(instance, services)
    report = render_doctor_report(snapshot)

    assert "api: unhealthy" in report
    assert "Traceback: exploded" in report
    assert "Infra is not fully healthy" in report
    assert "Unhealthy services detected: api" in report

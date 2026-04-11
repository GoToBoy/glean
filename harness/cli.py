"""CLI entrypoint for the local development harness."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from collections.abc import Iterable

from .config import (
    DEFAULT_SERVICES,
    INFRA_DOWN_COMMAND,
    INFRA_UP_COMMAND,
    infra_env,
    resolved_services,
)
from .health import HealthResult, check_infra_health, check_service_health
from .instances import list_instances, resolve_instance
from .logs import read_error_logs, read_recent_logs
from .observability import build_snapshot, render_doctor_report
from .processes import (
    ensure_runtime_dirs,
    load_state,
    refresh_service_state,
    running_services,
    save_state,
    service_log_path,
    start_service,
    stop_services,
)


def parse_service_names(raw: str | None, available_services: dict[str, object]) -> list[str]:
    if not raw:
        return list(DEFAULT_SERVICES)
    names = [name.strip() for name in raw.split(",") if name.strip()]
    unknown = sorted(set(names) - set(available_services))
    if unknown:
        raise SystemExit(f"Unknown services: {', '.join(unknown)}")
    return names


def run_command(command: list[str], *, env: dict[str, str] | None = None) -> int:
    completed = subprocess.run(command, check=False, env=env)  # noqa: S603
    return completed.returncode


def print_health_results(results: Iterable[HealthResult]) -> int:
    exit_code = 0
    for result in results:
        print(f"{result.name:10} {result.status:10} {result.detail}")
        if result.status == "unhealthy":
            exit_code = 1
    return exit_code


def wait_for_services(
    instance_name: str | None,
    service_names: list[str],
    timeout_seconds: float,
) -> int:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        instance = resolve_instance(instance_name)
        services = resolved_services(instance)
        state = refresh_service_state(load_state(instance))
        results = [check_service_health(name, services, state) for name in service_names]
        if all(result.status == "healthy" for result in results):
            return 0
        time.sleep(1.0)

    instance = resolve_instance(instance_name)
    services = resolved_services(instance)
    state = refresh_service_state(load_state(instance))
    results = [check_service_health(name, services, state) for name in service_names]
    return print_health_results(results)


def cmd_up(args: argparse.Namespace) -> int:
    instance = resolve_instance(args.instance)
    services = resolved_services(instance)
    ensure_runtime_dirs(instance)
    if not args.skip_infra:
        env = dict(os.environ)
        env.update(infra_env(instance))
        infra_exit = run_command(INFRA_UP_COMMAND, env=env)
        if infra_exit != 0:
            return infra_exit

    state = load_state(instance)
    started_any = False
    for name in parse_service_names(args.services, services):
        started_any = start_service(instance, services, state, name) or started_any
        state = load_state(instance)

    if started_any:
        print(f"Started selected services for instance {instance.name} (slot {instance.slot}).")
    else:
        print(f"Selected services were already running for instance {instance.name}.")

    if args.wait:
        return wait_for_services(args.instance, parse_service_names(args.services, services), args.timeout)
    return 0


def cmd_down(args: argparse.Namespace) -> int:
    instance = resolve_instance(args.instance)
    services = resolved_services(instance)
    state = load_state(instance)
    stop_services(
        instance,
        state,
        parse_service_names(args.services, services) if args.services else list(DEFAULT_SERVICES),
    )
    if not args.leave_infra:
        env = dict(os.environ)
        env.update(infra_env(instance))
        return run_command(INFRA_DOWN_COMMAND, env=env)
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    instance = resolve_instance(args.instance)
    services = resolved_services(instance)
    state = refresh_service_state(load_state(instance))
    save_state(instance, state)
    active = running_services(state)
    print(f"Instance: {instance.name} (slot {instance.slot})")
    print("Infra:")
    print_health_results(check_infra_health(instance))
    print("\nServices:")
    for name in parse_service_names(args.services, services):
        cfg = services[name]
        if name in active:
            service_state = state["services"][name]
            print(
                f"{name:10} running    pid={service_state['pid']} "
                f"port={cfg.port or '-'} log={service_state['log_path']}"
            )
        else:
            print(f"{name:10} stopped    port={cfg.port or '-'}")
    return 0


def cmd_health(args: argparse.Namespace) -> int:
    instance = resolve_instance(args.instance)
    services = resolved_services(instance)
    state = refresh_service_state(load_state(instance))
    save_state(instance, state)
    results = check_infra_health(instance)
    results.extend(
        check_service_health(name, services, state)
        for name in parse_service_names(args.services, services)
    )
    return print_health_results(results)


def cmd_logs(args: argparse.Namespace) -> int:
    instance = resolve_instance(args.instance)
    services = resolved_services(instance)
    names = parse_service_names(args.service, services)
    if len(names) != 1:
        raise SystemExit("logs requires exactly one service name")
    name = names[0]
    log_path = service_log_path(instance, name)
    if args.errors:
        lines = read_error_logs(log_path, scan_lines=args.scan_lines, limit=args.lines)
        if not lines:
            print(f"No matching error lines found for {name}.")
            return 0
        print("\n".join(lines))
        return 0

    content = read_recent_logs(log_path, args.lines)
    if not content:
        print(f"No logs found for {name}.")
        return 0
    print(content)
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    instance = resolve_instance(args.instance)
    services = resolved_services(instance)
    snapshot = build_snapshot(
        instance,
        services,
        service_names=parse_service_names(args.services, services),
        error_scan_lines=args.scan_lines,
        error_limit=args.error_lines,
    )
    print(render_doctor_report(snapshot))
    service_statuses = [service["status"]["status"] for service in snapshot["services"].values()]
    infra_statuses = [result["status"] for result in snapshot["infra"]]
    return 1 if any(status == "unhealthy" for status in [*infra_statuses, *service_statuses]) else 0


def cmd_snapshot(args: argparse.Namespace) -> int:
    instance = resolve_instance(args.instance)
    services = resolved_services(instance)
    snapshot = build_snapshot(
        instance,
        services,
        service_names=parse_service_names(args.services, services),
        error_scan_lines=args.scan_lines,
        error_limit=args.error_lines,
    )
    print(json.dumps(snapshot, indent=args.indent, sort_keys=True))
    return 0


def cmd_instances(args: argparse.Namespace) -> int:
    del args
    for instance in list_instances():
        print(
            f"{instance.name:20} slot={instance.slot:<3} "
            f"root={instance.root} api={instance.ports['api']} web={instance.ports['web']} "
            f"admin={instance.ports['admin']} pg={instance.ports['postgres']} redis={instance.ports['redis']}"
        )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Local development harness for Glean")
    subparsers = parser.add_subparsers(dest="command", required=True)

    up = subparsers.add_parser("up", help="Start infra and selected services")
    up.add_argument("--services", help="Comma-separated services: api,worker,web,admin")
    up.add_argument("--instance", help="Override the default worktree-derived instance name")
    up.add_argument("--skip-infra", action="store_true", help="Do not start docker infra")
    up.add_argument("--no-wait", dest="wait", action="store_false", help="Do not wait for health")
    up.add_argument("--timeout", type=float, default=45.0, help="Health wait timeout in seconds")
    up.set_defaults(func=cmd_up, wait=True)

    down = subparsers.add_parser("down", help="Stop selected services and infra")
    down.add_argument("--services", help="Comma-separated services: api,worker,web,admin")
    down.add_argument("--instance", help="Override the default worktree-derived instance name")
    down.add_argument("--leave-infra", action="store_true", help="Leave docker infra running")
    down.set_defaults(func=cmd_down)

    status = subparsers.add_parser("status", help="Show runtime status")
    status.add_argument("--services", help="Comma-separated services: api,worker,web,admin")
    status.add_argument("--instance", help="Override the default worktree-derived instance name")
    status.set_defaults(func=cmd_status)

    health = subparsers.add_parser("health", help="Run health checks")
    health.add_argument("--services", help="Comma-separated services: api,worker,web,admin")
    health.add_argument("--instance", help="Override the default worktree-derived instance name")
    health.set_defaults(func=cmd_health)

    logs = subparsers.add_parser("logs", help="Show recent logs for one service")
    logs.add_argument("service", help="One service name")
    logs.add_argument("--instance", help="Override the default worktree-derived instance name")
    logs.add_argument("-n", "--lines", type=int, default=80, help="Number of lines to show")
    logs.add_argument("--errors", action="store_true", help="Show only recent error-like log lines")
    logs.add_argument(
        "--scan-lines",
        type=int,
        default=200,
        help="How many recent lines to scan when filtering error-like logs",
    )
    logs.set_defaults(func=cmd_logs)

    doctor = subparsers.add_parser("doctor", help="Summarize runtime diagnostics and recent errors")
    doctor.add_argument("--services", help="Comma-separated services: api,worker,web,admin")
    doctor.add_argument("--instance", help="Override the default worktree-derived instance name")
    doctor.add_argument(
        "--scan-lines",
        type=int,
        default=200,
        help="How many recent log lines to scan per service for error excerpts",
    )
    doctor.add_argument(
        "--error-lines",
        type=int,
        default=10,
        help="How many recent error lines to include per service",
    )
    doctor.set_defaults(func=cmd_doctor)

    snapshot = subparsers.add_parser("snapshot", help="Emit machine-readable runtime diagnostics as JSON")
    snapshot.add_argument("--services", help="Comma-separated services: api,worker,web,admin")
    snapshot.add_argument("--instance", help="Override the default worktree-derived instance name")
    snapshot.add_argument(
        "--scan-lines",
        type=int,
        default=200,
        help="How many recent log lines to scan per service for error excerpts",
    )
    snapshot.add_argument(
        "--error-lines",
        type=int,
        default=10,
        help="How many recent error lines to include per service",
    )
    snapshot.add_argument("--indent", type=int, default=2, help="JSON indentation level")
    snapshot.set_defaults(func=cmd_snapshot)

    instances = subparsers.add_parser("instances", help="List known harness instances across worktrees")
    instances.set_defaults(func=cmd_instances)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

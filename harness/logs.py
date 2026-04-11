"""Log helpers for the local harness."""

from __future__ import annotations

from pathlib import Path

from .processes import tail_file

ERROR_TOKENS = (
    "traceback",
    "error",
    "exception",
    "fatal",
    "failed",
    "panic",
    "crash",
)


def read_recent_logs(path: Path, lines: int) -> str:
    return tail_file(path, lines)


def read_recent_log_lines(path: Path, lines: int) -> list[str]:
    content = read_recent_logs(path, lines)
    return content.splitlines() if content else []


def read_error_logs(path: Path, *, scan_lines: int = 200, limit: int = 20) -> list[str]:
    matched = [
        line
        for line in read_recent_log_lines(path, scan_lines)
        if any(token in line.lower() for token in ERROR_TOKENS)
    ]
    return matched[-limit:]

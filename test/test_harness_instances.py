import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from harness.instances import (
    build_compose_project_name,
    build_ports_for_slot,
    sanitize_instance_name,
)


def test_sanitize_instance_name_normalizes_symbols_and_case():
    assert sanitize_instance_name("Glean List Sort") == "glean-list-sort"
    assert sanitize_instance_name("feat/rss_think") == "feat-rss_think"


def test_build_ports_for_slot_offsets_entire_port_block():
    ports = build_ports_for_slot(2)

    assert ports["postgres"] == 5632
    assert ports["redis"] == 6579
    assert ports["api"] == 8200
    assert ports["web"] == 3200
    assert ports["admin"] == 3201


def test_build_compose_project_name_includes_slot():
    assert build_compose_project_name("glean-list-sort", 3) == "glean-glean-list-sort-3"

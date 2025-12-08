"""
Glean Core Package.

This package contains core business logic, service classes,
and shared schemas for the Glean application.
"""

__version__ = "0.1.0"

from .logging_config import init_logging, get_logger

__all__ = ["init_logging", "get_logger"]

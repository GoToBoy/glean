"""Compatibility entrypoint for arq on Python 3.14+.

Python 3.14 no longer creates a default event loop for the main thread.
Current arq worker startup still calls ``asyncio.get_event_loop()`` during
worker construction, so we seed the main-thread loop before invoking arq.
"""

import asyncio
from typing import NoReturn

from arq.cli import cli


def main() -> NoReturn:
    """Seed the main-thread event loop, then delegate to arq's CLI."""
    asyncio.set_event_loop(asyncio.new_event_loop())
    raise SystemExit(cli())


if __name__ == "__main__":
    main()

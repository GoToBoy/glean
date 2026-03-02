"""
Logging middleware.

Adds unique ID to each request and logs request information.
"""

import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from glean_core import get_logger

logger = get_logger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Logging middleware.

    Adds unique ID to each request and logs request and response information.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Generate request ID
        request_id = str(uuid.uuid4())

        # Record request start time
        start_time = time.time()

        # Get client IP
        client_ip = request.client.host if request.client else "unknown"

        # Get user agent
        user_agent = request.headers.get("user-agent", "unknown")

        # Bind context information to logger
        context_logger = logger.bind(
            request_id=request_id,
            method=request.method,
            url=str(request.url),
            client_ip=client_ip,
            user_agent=user_agent,
        )

        path = request.url.path

        # Process request
        try:
            response = await call_next(request)

            process_time = time.time() - start_time
            status = response.status_code

            # Include method, path, status and duration in the message so they
            # are searchable in plain-text log files (grep "slow" / grep "POST /entries").
            msg = f"{request.method} {path} {status} {process_time:.3f}s"
            if process_time >= 3.0:
                context_logger.warning(f"SLOW {msg}")
            elif status >= 400:
                context_logger.warning(msg)
            else:
                context_logger.info(msg)

            response.headers["X-Request-ID"] = request_id
            return response

        except Exception as e:
            process_time = time.time() - start_time
            context_logger.exception(
                f"EXCEPTION {request.method} {path} {process_time:.3f}s error={e}"
            )
            raise

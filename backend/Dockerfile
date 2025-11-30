# Backend Dockerfile for Glean API and Worker

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv

# Copy workspace files
COPY pyproject.toml uv.lock ./
COPY apps/ apps/
COPY packages/ packages/

# Install dependencies
RUN uv sync --all-packages --no-dev

# Expose API port
EXPOSE 8000

# Default command (can be overridden for worker)
CMD ["uv", "run", "uvicorn", "glean_api.main:app", "--host", "0.0.0.0", "--port", "8000"]

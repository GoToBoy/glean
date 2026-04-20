# Superseded Contract

Status: Superseded on 2026-04-20 by the tag-only release build policy.

This historical contract previously allowed `.github/workflows/release.yml` to build Docker images on `main` and `personal-main` branch pushes. That behavior is no longer desired.

Current release-build policy:

- Stable image builds require pushing a formal `v*` tag.
- Pre-release image builds require pushing an alpha, beta, or rc tag handled by `.github/workflows/pre-release.yml`.
- Normal branch pushes must not trigger Docker image builds.
- `.github/workflows/release.yml` must not listen to branch push events.

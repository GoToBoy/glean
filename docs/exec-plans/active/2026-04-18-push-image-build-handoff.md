# Superseded Handoff

Status: Superseded on 2026-04-20 by the tag-only release build policy.

The previous handoff described branch-triggered Docker image builds. That behavior has been removed.

Current handoff note:

- `.github/workflows/release.yml` is for stable `v*` tag pushes only.
- `.github/workflows/pre-release.yml` remains responsible for alpha, beta, and rc tag pushes.
- Normal branch pushes can still run non-release workflows such as docs validation, but they must not build or publish Docker images.
- Deployment docs should instruct operators to push a tag when they want images built.

# Superseded Evaluation

Status: Superseded on 2026-04-20 by the tag-only release build policy.

The previous evaluation accepted branch-triggered Docker image builds. That behavior is now considered incorrect for this repository.

Current evaluator focus:

- Confirm `.github/workflows/release.yml` has only stable `v*` tag push triggers.
- Confirm `.github/workflows/release.yml` does not publish branch-name or short-SHA Docker image tags.
- Confirm stable tags still publish semver image tags and `latest`.
- Confirm pre-release tags remain handled by `.github/workflows/pre-release.yml`.
- Confirm deployment docs say normal branch pushes do not build images.

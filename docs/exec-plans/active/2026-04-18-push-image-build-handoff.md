# Implementation Handoff

## What Changed

- Updated the release workflow so `main` and `personal-main` pushes build and push backend, worker, web, and admin images to GHCR without requiring a Git tag.
- Added branch and short-SHA Docker tags for normal pushes.
- Kept semver tags and GitHub Release creation for stable `v*` tag pushes.
- Kept `latest` updates for default-branch pushes and stable `v*` tag pushes.
- Updated the personal deployment guide to recommend the no-tag push flow and SHA-based NAS deployments.

## Files Touched

- `.github/workflows/release.yml`
- `docs/operations/personal-deployment-guide.md`
- `docs/exec-plans/active/2026-04-18-push-image-build-contract.md`

## Verification Run

- `ruby -e 'require "psych"; Psych.load_file(ARGV.fetch(0)); puts "YAML OK"' .github/workflows/release.yml`
  - Result: `YAML OK`
- `rg -n "git tag|打新 tag|v0\\.1\\.0-alpha|触发构建|release.yml|latest|sha-" docs/operations/personal-deployment-guide.md .github/workflows/release.yml docs/exec-plans/active/2026-04-18-push-image-build-contract.md`
  - Result: confirmed the updated no-tag flow is documented and remaining tag references are limited to optional release/tag paths.

## Known Gaps

- `actionlint` is not installed in this local environment, so GitHub Actions semantics were checked by inspection rather than the actionlint binary.
- No remote GitHub Actions run was executed from this workspace.
- This workspace has no `.git` directory, so no git diff/status verification was available.

## Reviewer Focus

- Confirm `create-release` is gated to stable `v*` tag pushes and cannot run on `main` / `personal-main` pushes.
- Confirm Docker metadata tags are useful on both branch and tag refs.
- Confirm the personal deployment guide no longer implies a tag is required for normal development builds.

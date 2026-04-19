# Sprint Contract

## Goal

Allow GitHub Actions to build and push Docker images from `main` and `personal-main` pushes without requiring a Git tag, while preserving tag-based GitHub Release behavior.

## Scope

- Update `.github/workflows/release.yml` so `main` and `personal-main` pushes build and push images to GHCR.
- Keep stable `v*` tag pushes creating GitHub Releases.
- Update `docs/operations/personal-deployment-guide.md` so personal deployment instructions describe the new no-tag push flow.
- Exclude pre-release workflow behavior from this change.

## Done Means

- A push to `main` or `personal-main` can trigger the release workflow image build jobs.
- Branch builds publish branch and short SHA image tags.
- Pushes to the repository default branch also publish `latest`.
- Stable `v*` tag pushes still publish semver image tags and create a GitHub Release.
- Pre-release tags continue to be handled by `.github/workflows/pre-release.yml`.
- YAML parses successfully.

## Risks

- Building both deployment branches can consume more GitHub Actions minutes and GHCR storage.
- The Docker metadata configuration must avoid trying to resolve semver tags for branch refs.
- Existing NAS deployment docs must make clear which image tag to use after a no-tag build.

## Evaluator Focus

- Confirm branch and tag triggers can coexist in the same workflow.
- Confirm `create-release` cannot run on branch pushes.
- Confirm image tag outputs are useful for branch deployments and stable releases.

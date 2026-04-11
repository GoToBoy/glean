# Local Harness

The local harness provides one stable CLI for booting and inspecting the repository in local development.

## Commands

```bash
python3 -m harness up
python3 -m harness up --services api,worker
python3 -m harness status
python3 -m harness health
python3 -m harness logs api
python3 -m harness logs api --errors
python3 -m harness doctor
python3 -m harness snapshot
python3 -m harness instances
python3 -m harness down
```

## What It Does

- starts local infra through `docker-compose.dev.yml`
- starts `api`, `worker`, `web`, and `admin` as local dev processes
- records runtime state under `.harness/`
- allocates per-worktree instance slots and port blocks
- checks HTTP and process health
- provides stable log access per service
- summarizes recent error excerpts and runtime diagnostics
- emits machine-readable snapshots for agents and scripts

## Notes

- Existing direct commands like `make api` still work.
- The harness is the preferred orchestration layer for agents because it gives one legible runtime interface.
- By default, the harness derives the instance name from the current worktree directory.
- Each instance gets its own port block, runtime state, and Compose project name so multiple worktrees can coexist.
- You can override the default instance name with `--instance <name>`.
- `python3 -m harness doctor` is the preferred first stop when a service looks stuck or unhealthy.
- `python3 -m harness snapshot` is the preferred observability entrypoint for agents because it returns one JSON payload with ports, health, runtime paths, and recent error excerpts.

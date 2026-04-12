# Today Board Desktop Detail Sprint Contract

## Scope

- Restore the desktop Today Board card-board scroll position after closing article detail.
- Ensure a desktop Today Board entry that passes the delayed auto-read threshold refreshes to read in the card board without requiring a refetch.
- Preserve the existing delayed-read rule: closing before the threshold does not mark the entry read.

## Completion Criteria

- TodayBoard interaction tests prove card-board scroll is restored after closing detail.
- ReaderCore tests prove delayed auto-read updates Today Board card state optimistically.
- ReaderCore tests prove closing before the delayed threshold does not mark the selected unread entry read.
- Existing focused Today Board tests continue to pass.

## Non-Goals

- No backend, API, queue, scheduler, worker, Docker, or deployment changes.
- No changes to normal reader list/detail behavior outside Today Board.

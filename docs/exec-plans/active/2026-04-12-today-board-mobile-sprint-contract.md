# Today Board Mobile Sprint Contract

## Scope

- Keep `今日收录` mounted on mobile while an article detail is open so returning from detail preserves the board scroll position.
- Prevent article scroll gestures in Today Board mobile detail from triggering the pull-down close behavior.
- Reduce duplicated mobile header controls by letting the Today Board header own its date and translation controls.
- Let card-mode feed headers navigate to the corresponding feed list.

## Completion Criteria

- ReaderCore tests prove mobile Today Board still renders behind the article reader while a selected entry is open.
- ReaderCore tests prove the Today Board mobile article reader receives pull-close disabled.
- Layout tests prove the mobile app header does not render duplicate Today Board list controls while `view=today-board`.
- TodayBoard tests prove clicking a card-mode feed header emits the selected feed id.
- Existing focused Today Board tests continue to pass.

## Non-Goals

- No backend, API, queue, scheduler, Docker, or deployment changes.
- No broad mobile reader redesign outside Today Board-specific behavior.

# Today Board Read State Sprint Contract

## Scope

- Fix `今日收录` so an entry that is auto-marked read while open in detail returns to card mode with read styling and completed-feed counts.
- Simplify completed feed status text from count plus `已阅完` / `Read` to a status-only label.

## Completion Criteria

- A focused ReaderCore regression test proves the Today Board receives a read entry after the delayed auto-read mutation resolves, even before a server refetch.
- A TodayBoard presentation test proves completed feed headers render only `Read` / `已阅`, not a numeric completed count.
- Existing Today Board helper, interaction, and route tests pass.
- The change stays localized to Today Board read-state propagation, Today Board header text, and i18n copy.

## Non-Goals

- No API contract changes.
- No changes to feed fetch, queue, scheduler, or worker behavior.
- No broader reader layout refactor.

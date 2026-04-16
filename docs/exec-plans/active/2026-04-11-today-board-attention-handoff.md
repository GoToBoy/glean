# Implementation Handoff

## What Changed

- Added feed grouping for `今日收录` entries.
- Changed card mode into a masonry-style feed-group board with natural group heights.
- Each feed group now shows weak `unread / total` text in the header.
- Collapsed feed groups show at most three unread entries and hide read entries by default.
- Expanded feed groups show all entries in that feed, with read entries visually weakened.
- Detail mode now renders a compact feed-grouped list on the left and keeps the article detail on the right.
- The selected detail-list row scrolls into view.
- Auto-read now triggers after a short open delay instead of immediately on card/list selection.

## Files Touched

- `docs/plans/active/2026-04-11-today-board-attention-sprint-contract.md`
- `docs/superpowers/plans/2026-04-11-today-board-attention-implementation.md`
- `frontend/apps/web/src/pages/reader/shared/todayBoard.ts`
- `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/todayBoard.test.ts`
- `frontend/apps/web/src/__tests__/pages/reader/todayBoard.interaction.test.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`
- `frontend/packages/i18n/src/locales/en/reader.json`
- `frontend/packages/i18n/src/locales/zh-CN/reader.json`

## Verification Run

- `pnpm --filter @glean/web test -- src/__tests__/pages/reader/todayBoard.test.ts src/__tests__/pages/reader/todayBoard.interaction.test.tsx src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`
  - Pass: 3 files, 15 tests.
- `pnpm --filter @glean/web typecheck`
  - Pass.
- `pnpm --filter @glean/web lint`
  - Pass with one existing warning in `ReaderCore.tsx` about exporting non-component helpers from a component file.

## Known Gaps

- No browser/manual visual verification was run against the actual app runtime in this pass.
- The existing Fast Refresh warning remains because moving exported helpers out of `ReaderCore.tsx` is outside this scoped change.

## Reviewer Focus

- Check that card mode uses CSS columns rather than equal-height grid rows.
- Check collapsed feed groups show at most three unread entries and no read entries.
- Check detail mode is a compact list and selected entries scroll into view.
- Check delayed auto-read does not fire immediately and still updates after the delay.

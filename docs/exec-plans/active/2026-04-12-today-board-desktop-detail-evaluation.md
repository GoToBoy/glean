# Today Board Desktop Detail Evaluation

## Contract Check

- Desktop card-board scroll is restored after closing detail: passed by `restores the card-board scroll position after desktop detail closes`.
- Desktop Today Board preserves the delayed-read rule on quick close: passed by `keeps an unread desktop today-board entry unread when detail closes before the delay`.
- Desktop Today Board card state refreshes when delayed auto-read starts: passed by `optimistically updates today-board entries when delayed auto-read starts`.
- Desktop Today Board delayed-read timer survives repeated rerenders: passed by `keeps the delayed auto-read timer running across today-board rerenders`.
- Desktop Today Board does not repeatedly scroll the selected left-list item when entry data refreshes: passed by `does not keep scrolling the selected detail-list item when entry data refreshes`.
- Existing focused Today Board behavior remains covered by the broader focused suite.

## Verification Results

- Focused regression suite: 23 tests passed.
- Broader Today Board suite: 36 tests passed.
- TypeScript check: passed.
- ESLint: passed with one pre-existing warning for `react-refresh/only-export-components` in `ReaderCore.tsx`.

## Residual Risk

- This was verified by unit/component tests, not by a manual browser pass. The covered behaviors match the reported desktop regressions: shared scroll container restoration, stale card read state after delayed auto-read, timer resets during rerenders, and repeated selected-item scrolling during data refreshes.

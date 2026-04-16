# Sprint Contract

## Goal

Add a `今日收录` reader mode that aggregates entries collected during the current local day across all subscriptions into a dense card-list board with a collapsible right-side detail panel.

## Scope

- Modify reader route/controller/state to support a dedicated `today-board` view.
- Modify sidebar navigation to add `今日收录` below `智能列表`.
- Reuse the existing subscription sync cache to resolve feed descriptions for board cards.
- Add a dedicated desktop today-board layout with:
  - unread-first then read ordering
  - today's collection-time filtering
  - right-side detail panel that closes on blank-space clicks
  - multi-column board when detail is closed, single-column board when detail is open
  - flex layout that fills the page-transition and reader route width when the detail panel is open
- Keep mobile behavior simple and reuse existing reading flow.
- Add focused tests for date selection, sorting, and detail-panel interaction.
- Exclude Smart scoring changes, per-feed today views, and a mobile split-pane implementation.

## Done Means

- The sidebar renders a `今日收录` entry below `智能列表`.
- Selecting `今日看板` shows only today's aggregated entries using `ingested_at` first, then `created_at`, then `published_at`.
- The board shows feed title, feed summary, article summary, time, and feed icon when available.
- Unread entries render before read entries, and read entries use weakened read-state styling.
- Clicking a card opens the detail panel without removing the board.
- The open detail panel expands across the remaining route width without leaving unused space to the right.
- Clicking blank space in the board closes the detail panel without resetting the board.
- Existing Smart view and timeline reader behavior remain intact.
- Focused tests covering the new behavior pass.

## Risks

- Timezone boundaries could disagree between filtering logic and displayed dates.
- Client-side filtering may need more fetched rows to avoid underfilling the board.
- Existing detail components may assume timeline-list layout behavior.

## Evaluator Focus

- Check that today's membership uses collection-time precedence instead of publication precedence.
- Check that read/unread grouping is stable and visually reflected.
- Check that detail open/close behavior works from card clicks and board blank-space clicks.
- Check that the `today-board` flex item grows to fill the reader route so the detail pane can consume the remaining width.
- Check that Smart and timeline flows were not regressed by new reader view branching.

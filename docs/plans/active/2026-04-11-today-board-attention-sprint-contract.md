# Sprint Contract

## Goal

Refine `今日收录` so it supports two attention-aware modes: a feed-grouped card board before an article is selected, and a feed-aware compact list beside the detail reader after an article is selected.

## Scope

- Keep the existing `today-board` route and `/entries/today` data source.
- Replace the ungrouped today card grid with feed groups in a flowing, non-equal-height board.
- In card mode:
  - render one group per feed
  - show feed title, feed description, and a weak `unread / total` count aligned with the full title/description block
  - show at most three unread articles per feed by default
  - keep read articles collapsed by default
  - move feeds with no unread articles after feeds that still have unread articles
  - show all-read feed counts as `total · 已阅完`
  - show at most three read articles by default for all-read feeds
  - use centered lightweight `展开` / `收起` text for group expansion
- In detail mode:
  - keep the right-side article detail pane
  - convert the left side from cards to a compact feed-grouped list with summaries
  - scroll the selected article into view
  - keep the selected article visible when it is automatically marked read
- Change auto-read behavior from immediate-on-click to delayed-after-open.
- Preserve existing mobile behavior as a simple card/list-to-reader flow unless required by shared logic.

## Done Means

- Card mode is a flowing, non-equal-height feed-group board.
- Feed groups with unread articles default to at most three unread visible articles and no visible read articles.
- Feed groups with all articles read are moved after unread groups and default to at most three visible read articles.
- All-read feed headers show `total · 已阅完`.
- Expanded feed groups show all of that feed's entries, with read entries visually weakened.
- Detail mode shows a compact list on the left and the article detail on the right.
- Detail mode scrolls the selected item into view.
- Opening an unread article schedules an automatic read update after a short delay.
- The read update changes cached today-board entries without requiring a refresh.
- Focused tests cover grouping, collapsed visibility, detail-mode rendering, scroll positioning, and delayed auto-read.

## Risks

- Selected articles can move between visible and hidden buckets after becoming read; keep current selection visible until the user changes selection or collapses/expands.
- CSS columns provide the desired masonry-like flow but have different keyboard order tradeoffs from CSS grid.
- Existing reader code is large; keep the change localized to `todayBoard.ts`, `TodayBoard.tsx`, and `ReaderCore.tsx`.

## Evaluator Focus

- Verify the card board does not use equal-height grid rows.
- Verify read articles are hidden in collapsed card groups.
- Verify feed count is weak text and aligned with the title/description block.
- Verify detail mode uses a list presentation rather than card presentation.
- Verify auto-read is delayed and updates UI state without refresh.

# Today Board Design

Last updated: 2026-04-10

## Goal

Add a `今日看板` reader view that surfaces the current day's entries across all subscriptions in a denser card-list layout, while keeping article detail accessible without losing the global overview.

## Confirmed Scope

- add a new sidebar reader entry named `今日看板`
- place it directly below `智能列表`
- show a single aggregated "today across all subscriptions" board, not per-subscription drilldowns
- render the main area as a dense card-list view instead of the standard timeline list
- keep read entries in the same board, but move them after unread entries and style them with read-state colors
- include article summary plus source metadata on each card:
  - `feed title`
  - `feed summary` from the feed description
  - publish time
  - feed icon when available
- show a right-side detail panel when a card is selected
- hide the right-side detail panel when the user clicks blank space in the card-list area

## Explicit Exclusions

- no per-feed "today" subviews
- no new standalone article page just for today-board
- no mobile-specific split-pane interaction in the first pass
- no change to Smart view scoring or timeline list behavior

## Design

### Navigation

The sidebar gains a new reader navigation item:

- label: `今日看板`
- placement: immediately below `智能列表`
- route model: a dedicated reader view mode, separate from `smart`

This keeps the feature conceptually distinct from Smart recommendations and from the normal all-feeds timeline.

### Main Layout

The `今日看板` screen uses a dedicated aggregated layout:

- full main content area: scrollable card-list board
- far-right area: collapsible detail panel

The board remains the primary surface. Opening detail must not replace or hide the board. The user should still be able to keep scanning and switching cards while the detail panel is open.

The card-list should favor information density over large magazine-style tiles. The intended feel is "overview first, inspect second."

Responsive desktop behavior:

- when detail is closed, the board uses the full content area and can show multiple card columns
- when detail opens, the far-right detail bar expands and the board compresses to a single-column card list

### Card Content

Each card shows:

- article title
- article summary/excerpt
- feed title
- feed summary from `Feed.description`
- publish time
- feed icon when available

Visual treatment:

- unread cards stay visually prominent
- read cards use the same weakened palette direction as existing read items
- read cards appear after unread cards

### Detail Panel Behavior

Interaction rules:

- clicking a card opens the right-side detail panel
- clicking another card keeps the panel open and swaps its content
- clicking blank space in the board closes the detail panel
- closing the panel must not reset the scroll position of the board

The first implementation should reuse as much of the existing article-detail surface as practical, but inside a layout that preserves board visibility.

### Today Selection Rule

`今日看板` membership is determined per entry using:

1. `ingested_at` if present
2. otherwise `created_at`
3. otherwise `published_at`

An entry belongs to the board when the chosen timestamp falls within the user's current local day.

This matches the desired product meaning:

- prefer "collected into today's board today"
- still fall back safely when the ingest timestamp is missing

### Sorting

Entries are ordered in two stages:

1. unread entries first, read entries second
2. within each group, newest first by the same collection timestamp used for today membership

This preserves "what still needs attention" while keeping the day grouped as one coherent board.

### Data Requirements

The current aggregated entry payload is not yet sufficient for the board.

The preferred implementation is the smallest change that remains correct and inspectable. A frontend-first version may:

- reuse subscription sync data to resolve feed summaries by `feed_id`
- use `published_at`, then `ingested_at`, then `created_at` as the effective timestamp chain
- perform today filtering in the client as long as unread/read ordering stays stable and non-today items are excluded

### Mobile Behavior

First-pass mobile behavior is intentionally simpler:

- show a single-column today card-list
- tapping a card can continue into the existing mobile reading flow
- no split-pane close-on-blank-space interaction required on mobile

This keeps desktop and tablet as the primary focus for the board experience without blocking release.

## Risks

- today's boundary depends on timezone handling; client and server behavior must not disagree silently
- client-side filtering may need more fetched rows to ensure enough "today" results are visible
- reusing existing detail components inside a new split layout may expose assumptions tied to the current reader list

## Verification Targets

Minimum verification for implementation:

- sidebar shows `今日看板` below `智能列表`
- board only contains entries that match today's rule
- unread entries render before read entries
- read entries use weakened read styling
- clicking a card opens detail without removing board visibility
- clicking blank space in the board closes detail
- ordinary Smart view and timeline reader flows remain unchanged

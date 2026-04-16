# Today Board Calendar Design

Last updated: 2026-04-11

## Goal

Add a date selector to `今日收录` / Today's Intake so a reader can review entries collected on any day in the last month, with the selected day preserved in the URL for refresh and browser history.

## Confirmed Scope

- Keep using the existing Today Board reader route: `/reader?view=today-board`.
- Add a recent-day calendar/date selector inside the Today Board surface.
- Default to today's local date when no date is present in the URL.
- Store non-today selections in the URL as `date=YYYY-MM-DD`.
- Restore the selected date from the URL on refresh.
- Support browser back/forward by treating the URL as the source of truth.
- Fetch entries for the selected local day using collection-time bounds.
- Preserve the existing Today Board grouping, unread-first sorting, translation toggle, and article detail behavior.
- Clear the selected article when the user switches dates.

## Explicit Exclusions

- Do not show daily entry counts in the calendar.
- Do not add a backend calendar aggregation endpoint.
- Do not change feed fetching, queueing, scheduling, worker behavior, or entry persistence.
- Do not change Smart view, timeline view, or sidebar navigation behavior beyond preserving the Today Board route.

## Date Model

The selected date is represented as a local calendar date string in `YYYY-MM-DD` format.

URL behavior:

- Today Board with today's date: `/reader?view=today-board`
- Today Board with a historical date: `/reader?view=today-board&date=2026-04-07`
- Invalid or out-of-range date values fall back to today.
- Selecting today removes the `date` parameter instead of writing today's date into the URL.
- Selecting another day updates the `date` parameter and removes any `entry` parameter.
- User-initiated date changes create a new browser history entry.
- Date normalization for invalid or out-of-range URLs may use `replace` so bad URLs do not pollute history, and this cleanup only applies while `view=today-board`.
- Browser back/forward is URL-driven: when the URL date changes, selected article state must follow the URL, and stale detail from another date must not remain open.

The date selector offers the last 30 local calendar days, including today. Dates outside that window are not selectable in the first pass.

The selector orders days newest to oldest, with today first. Date labels should be deterministic:

- today: localized "Today"
- other dates: localized short month/day label

## Data Flow

`ReaderCore` reads the selected date from `useReaderController`.

For Today Board only, `ReaderCore` converts the selected date into inclusive-exclusive local-day bounds:

- `collected_after`: selected local day at `00:00:00.000`, serialized as ISO UTC
- `collected_before`: next local day at `00:00:00.000`, serialized as ISO UTC

It then calls the existing `useInfiniteEntries` path with:

- `view: "today-board"`
- `per_page: 500`
- selected `collected_after`
- selected `collected_before`
- existing optional `feed_id` / `folder_id`

`useInfiniteEntries` continues to route Today Board queries through `entryService.getTodayEntries`, which already calls `/entries/today`.

No backend contract change is required.

After the API response, `buildTodayBoardEntries` must filter membership against the selected date rather than `new Date()`. This preserves the existing defensive client-side collection-time membership check while allowing historical dates to render.

## UI Design

The Today Board header gains a compact calendar icon button placed with the existing translation icon controls. The date selector is a low-frequency control, so the full recent-day chooser stays hidden until the calendar button is clicked.

Required controls:

- a calendar button in the existing header control area
- a popover showing the selected date
- selectable day numbers for the last 30 days
- a previous-day action
- a next-day action

Desktop behavior:

- keep the header title stable when the date changes
- show the calendar popover from the header calendar button
- keep the calendar button visually grouped with the translation toggle
- keep the existing board/list/detail layout intact

Mobile behavior:

- use the same calendar button and selected-date state
- keep article opening behavior unchanged

Only the card-list content area refreshes when the date changes. The empty state copy may be date-aware because it is part of the list content, not the header.

## Component Boundaries

`todayBoard.ts`

- Generalize the local-day range helper so it accepts any selected date, not just "now".
- Generalize Today Board entry membership so it compares collection timestamps against the selected date, not always today.
- Add helpers for parsing and formatting Today Board URL dates.
- Add a helper that returns the selectable recent-day list.

`useReaderController.ts`

- Parse `date` only when `view=today-board`.
- Expose the selected Today Board date and a setter.
- The setter pushes URL search params, removes `entry`, and omits `date` for today.
- URL-driven state changes from browser back/forward must update the selected date and selected entry consistently.

`ReaderCore.tsx`

- Use the selected Today Board date to compute query bounds.
- Pass selected date and date-change callback into `TodayBoard`.
- Clear stale article detail through the controller date setter.

`TodayBoard.tsx`

- Render a calendar button in the existing header control area.
- Render the recent-day calendar in a popover after the button is clicked.
- Support previous-day and next-day actions in the popover.
- Emit date changes through props.
- Keep the header title stable while using date-aware empty copy where needed.

i18n files

- Add English and Simplified Chinese strings for selected date, today action, date selector accessibility labels, and historical empty state.

## Error Handling

- Invalid URL dates fall back to today.
- Out-of-range URL dates fall back to today.
- If the selected day has no entries, render the Today Board empty state for that day.
- Existing API loading and error handling remains unchanged.

## Testing

Minimum verification:

- Date range helper returns correct local-day ISO bounds for a non-today date.
- Date range helper uses local calendar-day boundaries, including days where timezone or daylight-saving offsets differ between midnight boundaries.
- URL date parser accepts valid `YYYY-MM-DD` dates in the recent 30-day window.
- URL date parser rejects malformed or out-of-range dates and falls back to today.
- Today Board query params use the selected date, not always the current date.
- Today Board client-side entry filtering uses the selected date, not always the current date.
- Loading `/reader?view=today-board&date=YYYY-MM-DD` directly restores the historical date.
- Selecting a historical date writes `date=YYYY-MM-DD` and removes `entry`.
- Selecting today removes `date`.
- Browser back/forward restores the previous date and does not leave detail open for an entry from another date.
- Today Board renders selected-date controls and invokes the date-change callback.
- Existing Today Board entry grouping and interaction tests remain green.

## Risks

- Local timezone handling must stay consistent between URL date parsing and query bound generation.
- The header already contains a translation toggle, so the date controls must remain compact and responsive.
- Clearing `entry` on date switch is required to avoid showing an article from a different day.

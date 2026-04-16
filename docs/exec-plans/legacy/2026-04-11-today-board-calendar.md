# Today Board Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a URL-backed recent-day selector to Today's Intake so readers can review entries collected on any day in the last 30 local calendar days.

**Architecture:** Keep the backend contract unchanged and treat the reader URL as the source of truth. `useReaderController` parses and writes `date=YYYY-MM-DD`, `ReaderCore` converts that date into collection bounds, and `TodayBoard` renders a compact selectable recent-day calendar.

**Tech Stack:** React 18, React Router search params, TanStack Query, TypeScript, Vitest, Testing Library, date-fns, react-i18next.

---

## File Structure

- Modify `frontend/apps/web/src/pages/reader/shared/todayBoard.ts`
  - Date helpers: local date keys, recent-day list, URL date parsing, collection range for selected date.
  - Existing Today Board entry filtering to use selected date.
- Modify `frontend/apps/web/src/pages/reader/shared/useReaderController.ts`
  - Parse Today Board `date` param.
  - Expose `todayBoardDate` and `setTodayBoardDate`.
  - Push date changes into URL, remove `entry`, omit `date` for today.
- Modify `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
  - Use `todayBoardDate` for range and entry filtering.
  - Pass date props to `TodayBoard`.
- Modify `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
  - Render a calendar icon button in the sticky header control group.
  - Render recent-day date selection in a popover.
  - Render date-aware empty copy while keeping the header title stable.
- Modify `frontend/packages/i18n/src/locales/en/reader.json`
  - Add Today Board calendar strings.
- Modify `frontend/packages/i18n/src/locales/zh-CN/reader.json`
  - Add Chinese Today Board calendar strings.
- Modify tests:
  - `frontend/apps/web/src/__tests__/pages/reader/todayBoard.test.ts`
  - `frontend/apps/web/src/__tests__/pages/reader/todayBoard.interaction.test.tsx`
  - `frontend/apps/web/src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`

---

### Task 1: Date Helpers

**Files:**
- Modify: `frontend/apps/web/src/pages/reader/shared/todayBoard.ts`
- Test: `frontend/apps/web/src/__tests__/pages/reader/todayBoard.test.ts`

- [ ] **Step 1: Write failing tests for selected-date helpers**

Add tests covering:

```ts
expect(getTodayBoardDateKey(new Date('2026-04-10T12:00:00+08:00'))).toBe('2026-04-10')
expect(getTodayBoardCollectionRange('2026-04-07')).toEqual({
  collected_after: '2026-04-06T16:00:00.000Z',
  collected_before: '2026-04-07T16:00:00.000Z',
})
expect(resolveTodayBoardDateParam('2026-04-07', new Date('2026-04-10T12:00:00+08:00'))).toBe(
  '2026-04-07'
)
expect(resolveTodayBoardDateParam('2026-03-01', new Date('2026-04-10T12:00:00+08:00'))).toBe(
  '2026-04-10'
)
expect(buildRecentTodayBoardDates(new Date('2026-04-10T12:00:00+08:00')).map((day) => day.key))
  .toHaveLength(30)
```

Also update the existing `buildTodayBoardEntries` membership test so a historical selected date includes entries collected on that historical day and excludes today.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cd frontend/apps/web
pnpm test src/__tests__/pages/reader/todayBoard.test.ts
```

Expected: FAIL because the selected-date helper APIs and selected-date filtering do not exist yet.

- [ ] **Step 3: Implement helpers**

In `todayBoard.ts`:

- Add `TODAY_BOARD_RECENT_DAY_COUNT = 30`.
- Add `getTodayBoardDateKey(date = new Date())`.
- Add `parseTodayBoardDateKey(dateKey: string): Date | null` using local `new Date(year, monthIndex, day)`, not UTC parsing.
- Add `buildRecentTodayBoardDates(now = new Date())`.
- Add `resolveTodayBoardDateParam(dateParam: string | null | undefined, now = new Date())`.
- Replace or wrap `getTodayCollectionRange(now)` with `getTodayBoardCollectionRange(dateKeyOrDate)`.
- Keep `getTodayCollectionRange` as a compatibility wrapper if existing tests/imports still use it.
- Update `buildTodayBoardEntries` options to accept `selectedDate?: string | Date` and compare membership against that date.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
cd frontend/apps/web
pnpm test src/__tests__/pages/reader/todayBoard.test.ts
```

Expected: PASS.

---

### Task 2: URL Controller

**Files:**
- Modify: `frontend/apps/web/src/pages/reader/shared/useReaderController.ts`
- Test: `frontend/apps/web/src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`

- [ ] **Step 1: Write failing tests through ReaderCore**

Extend the mocked `useReaderController`-based test harness or add a focused test for ReaderCore behavior:

- Historical date from controller causes `useInfiniteEntries` to receive historical collection bounds.
- `TodayBoard` receives `selectedDateKey` and `recentDates`.
- `onSelectDate` callback is passed to `TodayBoard`.

If adding direct controller tests is simpler in this repo, create a focused test file for `useReaderController`; otherwise keep the coverage through `ReaderCore.todayBoard.test.tsx`.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cd frontend/apps/web
pnpm test src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx
```

Expected: FAIL because the controller and ReaderCore do not expose or use selected Today Board dates yet.

- [ ] **Step 3: Implement controller URL state**

In `useReaderController.ts`:

- Import date helpers from `todayBoard.ts`.
- Read `date` only when `isTodayBoardView`.
- Expose `todayBoardDate`.
- Expose `setTodayBoardDate(dateKey: string)`.
- When setting a date:
  - clone current params
  - keep `view=today-board`
  - delete `entry`
  - delete `tab`
  - delete `date` if the new date is today's key
  - otherwise set `date`
  - call `setSearchParams(next, { replace: false })`
- If a URL date is invalid or out of range while in Today Board, normalize with `replace: true`.

- [ ] **Step 4: Wire ReaderCore selected date**

In `ReaderCore.tsx`:

- Destructure `todayBoardDate`, `recentTodayBoardDates`, and `setTodayBoardDate`.
- Use `getTodayBoardCollectionRange(todayBoardDate)` for Today Board query bounds.
- Pass `selectedDateKey`, `recentDates`, and `onSelectDate` to `TodayBoard`.
- Pass `selectedDate: todayBoardDate` into `buildTodayBoardEntries`.

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
cd frontend/apps/web
pnpm test src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx
```

Expected: PASS.

---

### Task 3: Today Board Date UI

**Files:**
- Modify: `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- Modify: `frontend/packages/i18n/src/locales/en/reader.json`
- Modify: `frontend/packages/i18n/src/locales/zh-CN/reader.json`
- Test: `frontend/apps/web/src/__tests__/pages/reader/todayBoard.interaction.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Add tests that render `TodayBoard` with:

```tsx
selectedDateKey="2026-04-07"
todayDateKey="2026-04-10"
recentDates={[
  { key: '2026-04-10', date: new Date(2026, 3, 10), isToday: true },
  { key: '2026-04-09', date: new Date(2026, 3, 9), isToday: false },
  { key: '2026-04-07', date: new Date(2026, 3, 7), isToday: false },
]}
onSelectDate={selectDateSpy}
```

Assertions:

- clicking the calendar icon opens the popover
- selected historical date is visibly active inside the popover
- clicking another date calls `onSelectDate('2026-04-09')`
- clicking previous day calls the older adjacent date
- clicking next day calls the newer adjacent date
- the header title stays stable for historical selections
- the old header subtitle is not rendered
- empty state for a historical day uses the historical empty copy

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cd frontend/apps/web
pnpm test src/__tests__/pages/reader/todayBoard.interaction.test.tsx
```

Expected: FAIL because date props and controls do not exist yet.

- [ ] **Step 3: Implement TodayBoard date selector**

In `TodayBoard.tsx`:

- Add props:
  - `selectedDateKey`
  - `todayDateKey`
  - `recentDates`
  - `onSelectDate`
- Add a calendar icon button in the sticky header control group beside the translation toggle.
- Add a popover component for the recent-day calendar.
- Show day-of-month numbers for the recent 30 days.
- Add previous-day and next-day buttons.
- Stop propagation on calendar clicks so blank-space close does not trigger.
- Keep translation toggle visible beside the calendar icon.
- Keep the Today Board title stable when dates change.
- Use `date-fns/format` for compact labels.
- Use i18n keys for Today, calendar controls, and empty state.

- [ ] **Step 4: Add i18n strings**

Add English strings under `todayBoard`, for example:

```json
"today": "Today",
"dateSelectorLabel": "Select intake date",
"previousDay": "Previous day",
"nextDay": "Next day",
"historicalEmpty": "Nothing collected on {{date}}"
```

Add corresponding Simplified Chinese strings:

```json
"today": "今天",
"dateSelectorLabel": "选择收录日期",
"previousDay": "前一天",
"nextDay": "后一天",
"historicalEmpty": "{{date}}没有新收录"
```

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
cd frontend/apps/web
pnpm test src/__tests__/pages/reader/todayBoard.interaction.test.tsx
```

Expected: PASS.

---

### Task 4: Integration Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run focused Today Board tests**

Run:

```bash
cd frontend/apps/web
pnpm test \
  src/__tests__/pages/reader/todayBoard.test.ts \
  src/__tests__/pages/reader/todayBoard.interaction.test.tsx \
  src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run hook/API client regression test**

Run:

```bash
cd frontend/apps/web
pnpm test src/__tests__/hooks/useEntries.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
cd frontend/apps/web
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Manual browser check if dev server is practical**

Use the local harness or existing frontend dev workflow if available. Verify:

- `/reader?view=today-board` shows today selected.
- Clicking a historical date updates the URL with `date=YYYY-MM-DD`.
- Refresh preserves the historical date.
- Browser back/forward restores the date.
- Opening an article and then switching date removes the `entry` param and closes stale detail.
- Switching date keeps the Today Board header mounted; only the card-list content enters loading/refresh state.

- [ ] **Step 5: Record handoff**

Prepare a concise implementation handoff with:

- files touched
- tests run
- known gaps
- reviewer focus

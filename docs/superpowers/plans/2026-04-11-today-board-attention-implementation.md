# Today Board Attention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine `今日收录` into a feed-grouped card board plus a detail-mode feed list, with delayed automatic read marking.

**Architecture:** Keep the today-board API and reader controller unchanged. Add feed grouping and visibility derivation in `todayBoard.ts`, render card/list modes inside `TodayBoard.tsx`, and move auto-read from click-time to a delayed selected-entry effect in `ReaderCore.tsx`.

**Tech Stack:** React 18, TypeScript, TanStack Query, Vitest, Testing Library, Tailwind CSS.

---

### Task 1: Grouping Helper

**Files:**
- Modify: `frontend/apps/web/src/pages/reader/shared/todayBoard.ts`
- Test: `frontend/apps/web/src/__tests__/pages/reader/todayBoard.test.ts`

- [ ] Write failing tests for feed grouping, `unread / total` counts, collapsed visibility, expanded visibility, and selected-entry visibility.
- [ ] Run `pnpm --filter @glean/web test -- src/__tests__/pages/reader/todayBoard.test.ts`.
- [ ] Implement grouping helpers with unread-first group contents and read-collapsed defaults.
- [ ] Re-run the focused helper test.

### Task 2: TodayBoard Presentation

**Files:**
- Modify: `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- Test: `frontend/apps/web/src/__tests__/pages/reader/todayBoard.interaction.test.tsx`

- [ ] Write failing tests for card mode feed groups, detail-mode list rendering, expansion text, and scroll-to-selected behavior.
- [ ] Run the focused interaction test and confirm failure.
- [ ] Implement card mode with CSS columns and detail mode with compact feed-grouped list.
- [ ] Re-run the focused interaction test.

### Task 3: Delayed Auto-Read

**Files:**
- Modify: `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- Test: `frontend/apps/web/src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`

- [ ] Write failing test proving selection does not mark read immediately.
- [ ] Write failing test proving selected unread entry marks read after the delay.
- [ ] Move auto-read to a cancellable selected-entry effect with a short delay.
- [ ] Re-run the focused ReaderCore test.

### Task 4: Verification And Handoff

**Files:**
- Create: `docs/plans/active/2026-04-11-today-board-attention-handoff.md`
- Create: `docs/plans/active/2026-04-11-today-board-attention-evaluation.md`

- [ ] Run all focused today-board tests.
- [ ] Run frontend typecheck if available.
- [ ] Write implementation handoff.
- [ ] Write evaluator-style assessment against the sprint contract.

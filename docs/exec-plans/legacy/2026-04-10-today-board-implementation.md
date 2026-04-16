# Today Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `今日看板` reader view that aggregates today's entries across all subscriptions into a dense card-list board with a collapsible desktop detail panel.

**Architecture:** Keep entries as the domain surface, but use a dedicated `/entries/today` endpoint with explicit collection-time query bounds so the board does not depend on timeline-first pagination. Reuse subscription-sync cache for feed summaries, and keep board-specific shaping explicit in a focused helper so collection-time filtering, timestamp precedence, unread-first ordering, and detail-open state stay inspectable and testable.

**Tech Stack:** TypeScript, React 18, React Router, TanStack Query, Zustand, Tailwind CSS, Vitest

---

### Task 1: Add The Planner Artifacts

**Files:**
- Create: `docs/plans/active/2026-04-10-today-board-sprint-contract.md`
- Create: `docs/superpowers/plans/2026-04-10-today-board-implementation.md`
- Test: manual review

- [ ] **Step 1: Write the sprint contract with exact done-means and evaluator focus**
- [ ] **Step 2: Write the implementation plan with file-level ownership and TDD steps**
- [ ] **Step 3: Re-read the approved design and ensure the plan matches it exactly**

### Task 2: Build Today-Board Data Shaping

**Files:**
- Create: `frontend/apps/web/src/pages/reader/shared/todayBoard.ts`
- Test: `frontend/apps/web/src/__tests__/pages/reader/todayBoard.test.ts`

- [ ] **Step 1: Write the failing tests for effective timestamp selection, today filtering, unread-first ordering, and feed-description hydration**
- [ ] **Step 2: Run the targeted test to verify it fails**
- [ ] **Step 3: Implement a focused helper that derives effective timestamps, filters to the current local day, sorts unread before read, and hydrates feed descriptions from subscriptions**
- [ ] **Step 4: Run the targeted test to verify it passes**

### Task 2B: Add Collection-Time API Support

**Files:**
- Modify: `backend/apps/api/glean_api/routers/entries.py`
- Modify: `backend/packages/core/glean_core/services/entry_service.py`
- Modify: `backend/packages/core/glean_core/schemas/entry.py`
- Modify: `frontend/apps/web/src/hooks/useEntries.ts`
- Modify: `frontend/packages/api-client/src/services/entries.ts`
- Test: `backend/tests/integration/test_entries_api.py`

- [ ] **Step 1: Write the failing API test for collection-bounded today-board queries**
- [ ] **Step 2: Run the targeted test to verify it fails**
- [ ] **Step 3: Add `/entries/today`, collection bounds, daily ordering, and `ingested_at` to the payload**
- [ ] **Step 4: Re-run the targeted test to verify it passes**

### Task 3: Add Today-Board Route And Sidebar Entry

**Files:**
- Modify: `frontend/apps/web/src/components/sidebar/SidebarFeedsSection.tsx`
- Modify: `frontend/apps/web/src/pages/reader/shared/useReaderController.ts`
- Modify: `frontend/apps/web/src/components/Layout.tsx`
- Test: typecheck plus focused today-board regression tests

- [ ] **Step 1: Write the failing test coverage needed before adding `view=today-board` branching**
- [ ] **Step 2: Run the targeted test to verify it fails**
- [ ] **Step 3: Add the new sidebar action and reader controller flag for `today-board`**
- [ ] **Step 4: Run the targeted test to verify it passes**

### Task 4: Build The Desktop Today-Board Layout

**Files:**
- Modify: `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- Create: `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- Test: `frontend/apps/web/src/__tests__/pages/reader/todayBoard.interaction.test.tsx`

- [ ] **Step 1: Write the failing interaction test for card click opening detail and blank-space click closing it**
- [ ] **Step 2: Run the targeted interaction test and verify it fails**
- [ ] **Step 3: Implement the today-board card-list layout and collapsible detail panel for desktop**
- [ ] **Step 4: Re-run the interaction test and verify it passes**

### Task 5: Preserve Mobile And Existing Reader Behavior

**Files:**
- Modify: `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- Modify: `frontend/apps/web/src/components/Layout.tsx`
- Test: focused regression assertions plus typecheck

- [ ] **Step 1: Add the failing regression test that keeps mobile in a single-column flow and leaves Smart/timeline branching intact**
- [ ] **Step 2: Run the targeted regression test to verify it fails for missing branching**
- [ ] **Step 3: Implement the minimal branching needed for mobile fallback without changing existing Smart/timeline behavior**
- [ ] **Step 4: Re-run the targeted regression test and verify it passes**

### Task 6: Verify The Contract

**Files:**
- Verify: reader view code, tests, docs

- [ ] **Step 1: Run `git diff --check`**
- [ ] **Step 2: Run the focused today-board vitest suite**
- [ ] **Step 3: Re-run any touched existing reader tests that cover virtualization or layout branching**
- [ ] **Step 4: Re-read the sprint contract and check each done-means item against the diff and test evidence**
- [ ] **Step 5: Record an implementation handoff with verification evidence and residual risks**

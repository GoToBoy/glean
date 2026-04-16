# Feed Queue Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move global queue activity into the subscriptions toolbar row and remove it from each feed progress sheet.

**Architecture:** Reuse the existing active-runs query and queue summary helper in the subscriptions page. Keep feed progress sheets focused on feed-local execution data by stopping the queue section props at the page boundary.

**Tech Stack:** React, TanStack Query, TypeScript, i18n JSON locales, existing `@glean/ui` feed progress component.

---

### Task 1: Update Subscriptions Toolbar Layout

**Files:**
- Modify: `frontend/apps/web/src/components/tabs/SubscriptionsTab.tsx`

- [ ] **Step 1: Move the queue summary badge to the end of the toolbar row**
- [ ] **Step 2: Hide the badge when there is no active queue activity**
- [ ] **Step 3: Keep the displayed summary order as running first, queued second**

### Task 2: Remove Global Queue Section From Feed Sheets

**Files:**
- Modify: `frontend/apps/web/src/components/tabs/SubscriptionsTab.tsx`

- [ ] **Step 1: Stop building queue sections for the web feed progress sheet**
- [ ] **Step 2: Stop passing queue props into the sheet component**
- [ ] **Step 3: Verify feed-local history and current-run rendering still work**

### Task 3: Update Copy And Regression Coverage

**Files:**
- Modify: `frontend/packages/i18n/src/locales/zh-CN/settings.json`
- Modify: `frontend/packages/i18n/src/locales/en/settings.json`
- Test: `frontend/apps/web/src/__tests__/components/feedFetchProgress.test.tsx`

- [ ] **Step 1: Update locale copy for toolbar queue summary**
- [ ] **Step 2: Add or adjust a focused test for queue summary ordering or removed sheet queue rendering as needed**
- [ ] **Step 3: Run the targeted frontend test command**

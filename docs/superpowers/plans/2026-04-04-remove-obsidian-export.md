# Remove Obsidian Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused Obsidian export/download feature from the web app without regressing bookmark/archive behavior.

**Architecture:** Delete the reader export branch and settings UI, then decouple shared translation helpers from the Obsidian export module so translation keeps working after the export module is removed. Clean up i18n and tests that only exist for the removed feature.

**Tech Stack:** React, TypeScript, Zustand, Vitest, i18next

---

### Task 1: Remove Obsidian-specific tests

**Files:**
- Delete: `frontend/apps/web/src/__tests__/lib/obsidianExport.test.ts`

- [ ] **Step 1: Remove the obsolete test file**

- [ ] **Step 2: Run targeted tests to confirm imports now fail until implementation is cleaned up**

Run: `npm test --workspace=@glean/web -- obsidianExport`
Expected: FAIL because deleted feature code is still referenced

### Task 2: Remove reader/settings/store export flow

**Files:**
- Modify: `frontend/apps/web/src/components/ArticleReader.tsx`
- Modify: `frontend/apps/web/src/components/tabs/TranslationTab.tsx`
- Delete: `frontend/apps/web/src/stores/obsidianExportStore.ts`

- [ ] **Step 1: Remove bookmark-export coupling from the reader**

- [ ] **Step 2: Remove Obsidian settings UI and state wiring**

- [ ] **Step 3: Delete the dedicated persisted store**

### Task 3: Preserve translation helpers and delete export library

**Files:**
- Modify: `frontend/apps/web/src/hooks/useViewportTranslation.ts`
- Delete: `frontend/apps/web/src/lib/obsidianExport.ts`

- [ ] **Step 1: Move shared translation snapshot/helper types to `useViewportTranslation.ts`**

- [ ] **Step 2: Delete the obsolete Obsidian export library**

### Task 4: Remove i18n copy and verify

**Files:**
- Modify: `frontend/packages/i18n/src/locales/en/settings.json`
- Modify: `frontend/packages/i18n/src/locales/zh-CN/settings.json`
- Modify: `frontend/packages/i18n/src/locales/en/reader.json`
- Modify: `frontend/packages/i18n/src/locales/zh-CN/reader.json`

- [ ] **Step 1: Remove strings only used by Obsidian export**

- [ ] **Step 2: Run targeted web tests and lint/type-aware verification**

Run: `npm test --workspace=@glean/web -- --runInBand`
Expected: PASS for affected tests or clean targeted run

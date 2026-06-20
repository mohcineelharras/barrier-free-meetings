# Autosave And Report UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the convenience-first recording UI communicate automatic history saving and automatic report generation honestly.

**Architecture:** Keep the existing autosave and auto-report logic in `src/App.tsx`, but replace the old manual-action affordances with state-based presentation. Drive the change with narrow render tests first, then update header, history, and report panel copy so the UI reflects actual behavior.

**Tech Stack:** React 19, TypeScript, Node `node:test`, `react-dom/server`

---

### Task 1: Lock in the UX with render tests

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/components/HistoryPanel.tsx`

- [ ] Add assertions that the main app advertises automatic saving rather than a manual save action.
- [ ] Add assertions that the report affordance no longer defaults to `Generate meeting report` in the main header.
- [ ] Add assertions that the history empty state no longer tells users to press save.

### Task 2: Convert header actions into status-driven controls

**Files:**
- Modify: `src/App.tsx`

- [ ] Remove the manual save click behavior and replace it with a passive autosave status treatment.
- [ ] Derive report button state from existing session/report generation status so the control can show `Generating report…`, `View report`, or `Retry report`.
- [ ] Keep `Clear all`, `History`, and explicit report viewing intact.

### Task 3: Align history/report copy with the new behavior

**Files:**
- Modify: `src/components/HistoryPanel.tsx`
- Modify: `src/components/ReportPanel.tsx`

- [ ] Update empty-state and row-level report copy so automatic generation is the default mental model.
- [ ] Preserve explicit `Regenerate` and retry actions where they still make sense.

### Task 4: Verify

**Files:**
- Modify: none

- [ ] Run the relevant targeted tests first.
- [ ] Run `npm run lint`.
- [ ] Run `npm run test`.

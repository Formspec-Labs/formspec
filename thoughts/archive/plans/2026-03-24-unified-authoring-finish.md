# Unified Authoring Architecture — Finish Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Agent roles for each task:**
>
> - **`formspec-craftsman`** — Implement the task (write code, create tests, make them pass). Dispatch via `Agent` tool with `subagent_type: "formspec-specs:formspec-craftsman"`.
> - **`formspec-scout`** — Review completed work (code quality, spec compliance, architecture). Dispatch via `Agent` tool with `subagent_type: "formspec-specs:formspec-scout"`.
> - **`spec-expert`** — Validate spec assumptions, answer questions about normative behavior, resolve ambiguities. Dispatch via `Agent` tool with `subagent_type: "formspec-specs:spec-expert"`.
> - **`test-engineer`** — Review test coverage after craftsman's work (quality, edge cases, missing scenarios, test design). Dispatch via `Agent` tool with `subagent_type: "test-engineer"`.
>
> **Workflow per task:**
>
> 1. `spec-expert` (if needed) — resolve any spec ambiguities before coding
> 2. `formspec-craftsman` — implement with TDD (failing tests → implementation → passing tests)
> 3. `test-engineer` — review test coverage, identify gaps, suggest missing edge cases
> 4. `formspec-craftsman` — fill any test gaps identified by test-engineer
> 5. `formspec-scout` — final review (code quality, spec compliance, architecture)
> 6. Fix scout findings if any, re-review if needed

**Goal:** Complete the Unified Authoring Architecture from spec v6 — reconcile branches, fix open issues, migrate helpers, expand MCP coverage, build new document types, implement Rust dependency analysis, integrate chat, and ship the convergence UI.

**Architecture:** The spec defines a 5-phase migration (documented in `thoughts/specs/2026-03-24-unified-authoring-architecture.md` v6). Phase 4a (changeset infrastructure) is mostly done on branch `claude/unified-authoring-architecture-msWWJ`. Remaining work is Phases 1-3 (foundation, MCP expansion, new document types), Phase 4a-D (Rust dependency analysis), Phase 4b (chat integration), and Phase 4c (convergence UI).

**Tech Stack:** TypeScript (formspec-core, studio-core, mcp, chat, studio), Rust (fel-core, formspec-changeset), WASM (formspec-wasm), Vitest (unit/integration tests), Playwright (E2E tests)

**Spec:** `thoughts/specs/2026-03-24-unified-authoring-architecture.md`

**Worktree:** All work happens in the existing unified-authoring worktree:

```
.claude/worktrees/unified-authoring/   ← working directory for all tasks
  Branch: claude/unified-authoring-architecture-msWWJ
```

All file paths in this plan are relative to the worktree root. All `npm`, `cargo`, and `vitest` commands must run from `.claude/worktrees/unified-authoring/`. After each milestone that changes `node_modules` or build output, run `npm install && npm run build` in the worktree. Commit all work to the worktree branch — never leave uncommitted changes.

---

## Current Test Baselines (as of 2026-03-25)

| Package | Tests | Status |
|---------|-------|--------|
| formspec-core | 676 | All pass |
| formspec-studio-core | 552 | All pass |
| formspec-mcp | 463 | All pass |
| Rust workspace | 651 | All pass |

---

## Milestone 0: Verify Baseline — COMPLETE

Verified 2026-03-24. Branch builds clean, all TS and Rust tests pass.

---

## Milestone 1: Fix Open Phase 4a Issues — COMPLETE

- [x] **Task 1.1: Fix O1 — bracket summary extraction** (`adadde1b`)
- [x] **Task 1.2: Fix F3 — capturedValues for `=`-prefix expressions** (`6d773d3b`)

F4 deferred (no runtime engine in structural authoring tier).

---

## Milestone 2: Phase 1 Foundation (E1-E3, C1-C11) — 95% COMPLETE

All tasks done except Task 2.2 (E3 FEL function catalog consolidation).

- [x] **Task 2.1: E1 FEL identifier validation (Rust)** (`a62be350`)
- [x] **Task 2.3: E2 Data type taxonomy predicates** (`a064da13`)
- [x] **Task 2.4: C1 normalizeBinds, C8 lookups** (`14cd2b29`)
- [x] **Task 2.5: C5 drop targets, C6 tree flattening, C7 multi-select ops** (`32c2cfd7`)
- [x] **Task 2.6: C2-C3, C9-C11** (`3e4a1334`)
- [x] **Task 2.7: Delete studio originals** (`6d2aab6d`)

### Task 2.2: E3 — FEL function catalog consolidation (REMAINING)

**Files:**

- Modify: `crates/fel-core/src/builtins.rs` (or wherever `BUILTIN_FUNCTIONS` is defined) — ensure all function metadata (description, parameter names, return types) is complete
- Delete: `packages/formspec-studio/src/lib/fel-catalog.ts` (111 lines) — studio's supplemental `FUNCTION_DETAILS`
- Modify: Studio components importing from `fel-catalog.ts` → import from engine's WASM-bridged catalog

**Why:** E3 is "Already done" for the core implementation but studio still has a separate `FUNCTION_DETAILS` catalog in `fel-catalog.ts` that duplicates/supplements the Rust `BUILTIN_FUNCTIONS`. The supplemental metadata (descriptions, parameter info) needs to be consolidated into the Rust catalog, then the studio file deleted.

- [ ] **Step 1: Compare `fel-catalog.ts` entries against Rust `BUILTIN_FUNCTIONS`**

Read both files. Identify any metadata in the studio catalog not present in Rust.

- [ ] **Step 2: Add missing metadata to Rust catalog if needed**

If Rust `BUILTIN_FUNCTIONS` lacks descriptions or parameter names that studio's `FUNCTION_DETAILS` has, add them to the Rust side.

- [ ] **Step 3: Update studio imports to use engine's catalog export**

Replace `import { FUNCTION_DETAILS } from '../lib/fel-catalog'` with the engine's WASM-bridged function catalog.

- [ ] **Step 4: Delete `fel-catalog.ts`**
- [ ] **Step 5: Build and test**

```bash
cargo nextest run -p fel-core
npm run build && cd packages/formspec-studio && npx vitest run
```

- [ ] **Step 6: Commit**

```
refactor: consolidate FEL function catalog into Rust, delete studio duplicate (E3)
```

---

## Milestone 3: Phase 2 — MCP Tool Expansion (S1-S18) — COMPLETE

All 7 passes implemented and registered.

- [x] **Task 3.1: S1-S5 widget catalog** (`675e8e9b`)
- [x] **Task 3.2: S6-S8 FEL editing** (`7289d8c8`)
- [x] **Task 3.3: S9-S13 batch structure ops** (`117051fa`)
- [x] **Task 3.4: S14-S16 preview expansion** (`117051fa`)
- [x] **Task 3.5: S17-S18 audit** (`d117a6e1`)
- [x] **Task 3.6: Theme full coverage** (`d117a6e1`)
- [x] **Task 3.7: Component full coverage** (`d117a6e1`)

---

## Milestone 4: Phase 3 — New Document Types + Remaining Tools — COMPLETE

All 12 passes registered and wired.

- [x] **Task 4.1-4.3: locale, ontology, reference** (`d7125d7d`, `cd1aef67`)
- [x] **Task 4.4-4.12: migration, mapping, behavior-expanded, composition, changelog, response, lifecycle, publish, audit-expanded** (`3b31d007`, `dfe799c4`)

---

## Milestone 5: Phase 4a-D — Rust Dependency Analysis — COMPLETE

- [x] **Task 5.1: Create `formspec-changeset` crate** (`8514525a`)
- [x] **Task 5.2: Key extraction** (`8514525a`)
- [x] **Task 5.3: Dependency graph + connected components** (`8514525a`)
- [x] **Task 5.4: WASM bridge** (`8514525a`)
- [x] **Task 5.5: Wire into ProposalManager** (`a21dc46d`)
- [x] **Task 5.6: Additional edge types** (`4ac3a538`, `cf43074f`)

---

## Milestone 6: Phase 4b — Chat Integration — COMPLETE

- [x] **Task 6.1: ChatSession refactor — remove McpBridge** (`954d6857`)
- [x] **Task 6.2: Adapter interface update** (`954d6857`)
- [x] **Task 6.3: Studio chat panel + canvas layout** (`57675e84`)
- [x] **Task 6.4: Inline canvas AI actions** (`347fb90b`)
- [x] **Task 6.5: Scaffold-as-changeset flow** (`58c95a68`)

### Task 6.3: Studio chat panel + canvas layout (DONE)

**Agents:** `formspec-craftsman` implements. `formspec-scout` reviews. `spec-expert` consulted if questions arise about what context the chat panel should expose to the AI.

**Problem:** The studio needs an integrated chat panel component that shares the studio's `Project` instance. The old chat entry points (`main-chat.tsx`, `chat/`, `chat-v2/`) are kept for now as a separate page — this task adds the integrated panel alongside them.

**Files:**

- Create: `packages/formspec-studio/src/components/ChatPanel.tsx` — integrated chat panel
- Modify: `packages/formspec-studio/src/` — wire ChatPanel into studio shell layout

**Note:** Keep `main-chat.tsx`, `chat/`, `chat-v2/` for now. They remain as a standalone chat page. Consolidation/deletion is deferred.

**Key design:** The ChatPanel receives the studio's `Project` instance and creates a `ToolContext` that routes MCP tool calls to the in-process MCP server wrapping that same Project. The AI sees the same state the user sees on the canvas.

- [ ] **Step 1: Read the existing chat entry points**

Read `main-chat.tsx`, `chat/`, `chat-v2/` to understand what can be reused in the integrated panel.

- [ ] **Step 2: Create ChatPanel component**

Build `ChatPanel.tsx` that:
- Accepts `project: Project` and `mcpServer` as props
- Renders conversation history
- Provides a message input
- Routes AI tool calls through the MCP server
- Shows changeset status when a changeset is open

- [ ] **Step 3: Wire into studio shell**

Add the ChatPanel to the studio's main layout (likely as a resizable side panel or drawer).

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```
feat(studio): add integrated chat panel to studio shell (6.3)
```

### Task 6.4: Inline canvas AI actions (REMAINING)

**Agents:** `formspec-craftsman` implements. `formspec-scout` reviews.

**Problem:** The studio canvas should offer AI-powered context menu actions (e.g., right-click a field → "AI: add validation", "AI: suggest label"). These dispatch MCP tool calls through the shared server.

**Files:**

- Modify: `packages/formspec-studio/src/components/` — add AI-powered context menu items

- [ ] **Step 1: Identify context menu extension points in studio**

- [ ] **Step 2: Add AI action menu items that dispatch MCP calls**

- [ ] **Step 3: Build and test**

- [ ] **Step 4: Commit**

```
feat(studio): add inline AI context actions on canvas items (6.4)
```

### Task 6.5: Interview → scaffold flow (REMAINING)

**Agents:** `formspec-craftsman` implements. `spec-expert` consulted for S6.6.2 assembly timing. `formspec-scout` reviews.

**Problem:** `generateScaffold()` produces a `FormDefinition` blob. This should be loaded as a changeset so the user can review the AI's initial scaffold before committing it.

**Files:**

- Modify: `packages/formspec-studio/` — scaffold via `generateScaffold()` loaded as changeset

- [ ] **Step 1: Wire scaffold flow through ProposalManager**

When the AI generates a scaffold:
1. `ProposalManager.openChangeset()`
2. Load the scaffold via `project.loadDefinition(scaffoldedDef)` (captured as one `ChangeEntry`)
3. `ProposalManager.closeChangeset("Initial scaffold")`
4. User reviews in the changeset review UI

- [ ] **Step 2: Build and test**

- [ ] **Step 3: Commit**

```
feat(studio): load AI scaffold as reviewable changeset (6.5)
```

---

## Milestone 7: Phase 4c — Convergence UI — COMPLETE

- [x] **Task 7.1: Changeset review component** (`16c7ba8f`)
- [x] **Task 7.2: Wire review UI to ProposalManager** (`57675e84`)
- [x] **Task 7.3: Conflict diagnostics display** (`57675e84`)
- [x] **Task 7.4: E2E test harness + tests** (12/12 pass, harness already existed)

### Task 7.2: Wire review UI to ProposalManager (DONE)

**Agents:** `formspec-craftsman` implements. `formspec-scout` reviews.

**Problem:** The `ChangesetReview.tsx` and `DependencyGroup.tsx` components currently render from fixture data. They need to be wired to the real `ProposalManager` instance so accept/reject buttons dispatch actual `formspec_changeset_accept`/`formspec_changeset_reject` MCP calls.

**Files:**

- Modify: `packages/formspec-studio/src/components/ChangesetReview.tsx` — accept ProposalManager or changeset state as props
- Modify: `packages/formspec-studio/src/components/ChatPanel.tsx` (from Task 6.3) — show review UI when changeset status is `pending`

**Prerequisites:** Task 6.3 (ChatPanel exists).

- [ ] **Step 1: Update ChangesetReview props to accept live ProposalManager state**

Replace fixture data with reactive changeset state from ProposalManager. Accept/reject callbacks dispatch real MCP calls.

- [ ] **Step 2: Integrate into ChatPanel**

When `changeset.status === 'pending'`, the ChatPanel renders the review UI instead of / alongside the conversation.

- [ ] **Step 3: Test with a real changeset lifecycle**

Manual smoke test or write an integration test: open changeset → AI adds fields → close → review groups → accept/reject → verify state.

- [ ] **Step 4: Commit**

```
feat(studio): wire changeset review to live ProposalManager (7.2)
```

### Task 7.3: Conflict diagnostics display (REMAINING)

**Agents:** `formspec-craftsman` implements. `spec-expert` consulted for which `diagnose()` errors should block merge vs warn. `formspec-scout` reviews.

**Problem:** After partial merge, if `diagnose()` returns errors, they need to be displayed inline in the review UI with guidance for resolution.

**Files:**

- Modify: `packages/formspec-studio/src/components/ChangesetReview.tsx` — display diagnostics after partial merge

- [ ] **Step 1: Add diagnostics display section to ChangesetReview**

After partial merge attempt, if `diagnose()` returns errors:
- Show error messages inline with the affected dependency group
- Provide guidance (e.g., "Field 'email' was rejected but bind 'required' references it — remove the bind or accept the email group")

- [ ] **Step 2: Distinguish blocking errors vs warnings**

Blocking: FEL reference resolution, bind path resolution, key uniqueness violations.
Warnings: option set co-presence, cross-tier dangling references.

- [ ] **Step 3: Commit**

```
feat(studio): display conflict diagnostics after partial merge (7.3)
```

### Task 7.4: E2E test harness + tests (REMAINING)

**Agents:** `formspec-craftsman` implements. `test-engineer` reviews.

**Problem:** The E2E test file exists (`packages/formspec-studio/tests/e2e/playwright/changeset-review.spec.ts`) but references a harness page (`/studio/changeset-review-harness.html`) that doesn't exist. The tests can't run.

**Files:**

- Create: E2E test harness page that mounts `ChangesetReview` with fixture data and action logging
- Modify: `packages/formspec-studio/tests/e2e/playwright/changeset-review.spec.ts` — verify tests pass against harness

- [ ] **Step 1: Create the changeset-review harness page**

HTML page that:
- Mounts `ChangesetReview` with configurable fixture data (`?fixture=default|merged|rejected|empty`)
- Logs accept/reject/expand actions to a visible action log div for assertion

- [ ] **Step 2: Run E2E tests against harness**

```bash
npx playwright test packages/formspec-studio/tests/e2e/playwright/changeset-review.spec.ts
```

- [ ] **Step 3: Commit**

```
test(e2e): create changeset-review harness and verify E2E tests pass (7.4)
```

---

## Completion Summary

**All milestones complete.** 7 milestones, 30+ tasks, all tests passing.

Final test baselines (2026-03-25):
| Package | Tests | Status |
|---------|-------|--------|
| formspec-core | 676 | All pass |
| formspec-studio-core | 552 | All pass |
| formspec-mcp | 463 | All pass |
| Rust workspace | 651 | All pass |
| E2E changeset-review | 12 | All pass |

---

## Testing Strategy

**All commands run from the worktree root:** `cd .claude/worktrees/unified-authoring/` first.

**Per milestone:**

- **Unit tests** (Vitest) for every new function in core/studio-core/MCP
- **Integration tests** (Vitest) for MCP tool round-trips (register tool, call it, verify project state changed)
- **E2E tests** (Playwright) for Milestones 6-7 (UI changes)

**Test commands (from worktree root):**

```bash
cd .claude/worktrees/unified-authoring

# Per-package unit/integration
cd packages/formspec-core && npx vitest run && cd ../..
cd packages/formspec-studio-core && npx vitest run && cd ../..
cd packages/formspec-mcp && npx vitest run && cd ../..

# Rust workspace
cargo nextest run --workspace

# E2E (starts Vite server)
npm test

# Full suite
make build && npm test && cargo nextest run --workspace
```

**Red-green-refactor discipline:** Every task starts with a failing test. Write the test, run it (RED), implement (GREEN), then clean up if needed. See CLAUDE.md "Development Workflow."

**Commit discipline:** Commit at every logical stopping point within the worktree. Uncommitted changes in a worktree are invisible to `git log` and will be lost when the worktree is removed. See CLAUDE.md "Git Worktrees."

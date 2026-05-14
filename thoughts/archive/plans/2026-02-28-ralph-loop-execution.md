# ADR-0032: Ralph Loop Execution Plan for Schema Parity

**Status:** Proposed
**Date:** 2026-02-28
**Implements:** [ADR-0029](0029-schema-parity-phase1-enrich-existing.md), [ADR-0030](0030-schema-parity-phase2-new-artifacts.md), [ADR-0031](0031-schema-parity-phase3-new-subsystems.md)

---

## Overview

Execute the three schema parity phases using Ralph Loop — 15 iterations per phase, 45 total iterations. Each phase gets a carefully crafted prompt that Claude receives repeatedly, seeing its own prior work in the files and git history each time.

The key to good Ralph Loop prompts:

- **Self-orienting** — Claude must figure out what's already done vs what's next
- **Incremental** — each iteration picks ONE work item, implements it with TDD, commits
- **Observable progress** — git log and file diffs show what's been accomplished
- **Clear exit** — completion promise fires when the checklist is exhausted

---

## Execution Sequence

Run each phase as a separate Ralph Loop session. Do NOT run the next phase until the previous one's tests pass clean.

```
# Phase 1: Enrich existing files
/ralph-loop "<phase1 prompt below>" --max-iterations 15 --completion-promise "PHASE1 COMPLETE"

# Verify before proceeding
npm test && python3 -m pytest tests/ -q

# Phase 2: New artifacts
/ralph-loop "<phase2 prompt below>" --max-iterations 15 --completion-promise "PHASE2 COMPLETE"

# Verify before proceeding
npm test && python3 -m pytest tests/ -q

# Phase 3: New subsystems
/ralph-loop "<phase3 prompt below>" --max-iterations 15 --completion-promise "PHASE3 COMPLETE"
```

---

## Phase 1 Prompt

```
You are implementing ADR-0029: Schema Parity Phase 1 — Enrich Existing Files.

READ FIRST:
- thoughts/adr/0029-schema-parity-phase1-enrich-existing.md (the plan)
- thoughts/adr/schema-coverage-audit.md (the gap audit)
- CLAUDE.md (dev philosophy, TDD workflow)

YOUR JOB: Pick ONE uncompleted work item from ADR-0029 sections A–D, implement it
using the TDD loop, commit, and move on.

HOW TO KNOW WHAT'S DONE: Check git log --oneline -20 to see what previous iterations
committed. Check the grant-app JSON files for properties already added. Do NOT redo
work that's already committed.

TDD LOOP (non-negotiable):
1. Red — write ONE failing Playwright E2E test for the property/value you're adding.
   Put it in the appropriate file under tests/e2e/playwright/.
   Run: npx playwright test <your-test-file> — confirm it fails.
2. Green — add the property to the grant-app JSON. If the engine/renderer already
   handles it, this is enough. If not, make the minimal engine/renderer change.
   Run: npx playwright test <your-test-file> — confirm it passes.
3. Flesh out — if the feature has edge cases, add 1-2 more test assertions.
4. Commit — stage and commit with message: "feat(grant-app): add <property> coverage"

WHAT TO WORK ON (priority order):
- Section A (definition.json) items 1-8
- Section B (theme.json) items 1-8
- Section C (component.json) items 1-7
- Section D (submission.json) items 1-5

Pick the FIRST item in priority order that is NOT already committed. Do ONE item
per iteration. If an item is large (e.g., "Presentation subsystem" has many
sub-properties), do 2-3 sub-properties per iteration, not all of them.

AFTER COMMITTING, validate:
- npm test (should pass — if any unrelated test breaks, fix it before committing)
- The JSON files you modified still validate against their schemas

IMPORTANT:
- Do NOT write all tests upfront. One test → pass it → expand → pass.
- Do NOT skip the failing test step. The commit must include test(s).
- Do NOT refactor existing code unless it blocks your current item.
- Do NOT add properties that aren't in the ADR-0029 work list.
- Each iteration should produce exactly ONE commit.

WHEN DONE: If you have checked git log and the grant-app files and ALL items in
sections A–D of ADR-0029 are committed, output:
<promise>PHASE1 COMPLETE</promise>

If items remain, just commit your work for this iteration and stop.
Do NOT output the promise tag unless everything is truly done.
```

---

## Phase 2 Prompt

```
You are implementing ADR-0030: Schema Parity Phase 2 — New Artifacts & Mapping Depth.

READ FIRST:
- thoughts/adr/0030-schema-parity-phase2-new-artifacts.md (the plan)
- thoughts/adr/schema-coverage-audit.md (the gap audit)
- CLAUDE.md (dev philosophy, TDD workflow)

YOUR JOB: Pick ONE uncompleted work item from ADR-0030 sections A–H, implement it
using the TDD loop, commit, and move on.

HOW TO KNOW WHAT'S DONE: Check git log --oneline -30 to see what previous iterations
committed. Check examples/grant-application/ for files already created. Do NOT redo
work that's already committed.

TDD LOOP (non-negotiable):
1. Red — write ONE failing test. For new JSON files, this is often a Python test that
   loads the file and validates against the schema:
   - Changelog: tests/ (pytest) — load changelog.json, validate schema, assert content
   - Mapping: tests/ (pytest) — validate schema, test Python mapping engine execution
   - Theme pages: tests/e2e/playwright/ — assert region layout renders
   - Definition $ref: tests/e2e/playwright/ — assert fragment fields appear
   Run the test, confirm it fails.
2. Green — create the JSON file or add the property. Make minimal engine/tooling
   changes. Confirm the test passes.
3. Flesh out — add 1-2 more assertions (e.g., round-trip mapping, impact classification).
4. Commit — "feat(grant-app): add <artifact/feature> coverage"

WHAT TO WORK ON (priority order):
- Section A: changelog.json (all 7 items can be one file — 1-2 iterations)
- Section B: mapping.json enrichment (items 1-16 — spread across 3-4 iterations)
- Section C: mapping-xml.json (items 1-4 — 1 iteration)
- Section D: mapping-csv.json (items 1-4 — 1 iteration)
- Section E: theme.json pages & regions (items 1-4 — 1-2 iterations)
- Section F: definition.json composition & migration (items 1-3 — 2 iterations)
- Section G: external validation coverage (items 1-4 — 1 iteration)
- Section H: response lifecycle (items 1-3 — 1 iteration)

Pick the FIRST section/item in priority order that is NOT already committed.

FOR NEW FILES: Create the file in examples/grant-application/. Ensure it validates
against its schema. The test should assert both schema validity and content correctness.

FOR MAPPING ENGINE WORK: The Python mapping engine is at src/formspec/mapping/.
If a transform type isn't implemented yet, implement it there as part of the green step.

AFTER COMMITTING, validate:
- npm test (Playwright suite passes)
- python3 -m pytest tests/ -q (Python suite passes)

IMPORTANT:
- Each iteration should produce exactly ONE commit.
- Large sections (B: mapping enrichment) should be split across multiple iterations.
- If a section needs engine work that's too large for one iteration, do the JSON +
  schema validation test first, then engine execution test in the next iteration.
- Fix the array.rules → array.innerRules naming mismatch (Section B item 14) early.

WHEN DONE: If ALL items in sections A–H of ADR-0030 are committed, output:
<promise>PHASE2 COMPLETE</promise>

If items remain, commit your work and stop.
```

---

## Phase 3 Prompt

```
You are implementing ADR-0031: Schema Parity Phase 3 — New Subsystems.

READ FIRST:
- thoughts/adr/0031-schema-parity-phase3-new-subsystems.md (the plan)
- thoughts/adr/schema-coverage-audit.md (the gap audit)
- CLAUDE.md (dev philosophy, TDD workflow)

YOUR JOB: Pick ONE uncompleted work item from ADR-0031 sections A–F, implement it
using the TDD loop, commit, and move on.

HOW TO KNOW WHAT'S DONE: Check git log --oneline -30 to see what previous iterations
committed. Check the engine source and grant-app files for features already implemented.
Do NOT redo work that's already committed.

TDD LOOP — ENGINE-FIRST (non-negotiable for this phase):
1. Red — write ONE failing UNIT test (not E2E). Engine features must be tested at the
   unit level first. Put it in tests/ (Python) or as a standalone engine test.
   Example: "scoped variable evaluates within its group" as a FormEngine test.
   Run, confirm it fails with a message that names the missing feature.
2. Green — implement the MINIMUM engine change. No UI, no cleanup. Confirm unit test passes.
3. Flesh out — add edge-case unit tests (null scope, nonexistent group, nested scopes).
   Then add ONE E2E test proving the feature works through the webcomponent.
4. Commit — "feat(engine): add <subsystem> support" or "feat(grant-app): add <feature>"

WHAT TO WORK ON (priority order):
- Section B: registry.json (1-2 iterations — schema validation + Python tooling)
- Section E: multi-platform labels & themes (2 iterations — labels, then theme-pdf.json)
- Section C: scoped variables (2-3 iterations — engine, then definition.json, then E2E)
- Section D: writable instances (2-3 iterations — engine, then definition.json, then E2E)
- Section A: screener + routes (3-4 iterations — engine, definition.json, webcomponent, E2E)
- Section F: remaining cleanup (1-2 iterations — leftover prop wiring)

ORDER RATIONALE: Registry and labels are JSON-heavy with minimal engine work — quick
wins. Scoped variables and writable instances are engine changes with clear boundaries.
Screener is the largest subsystem — saved for last when the iteration pattern is
established.

FOR ENGINE CHANGES:
- FormEngine is at packages/formspec-engine/src/index.ts
- Build after changes: npm run build --workspace=packages/formspec-engine
- The engine must not break any existing grant-app E2E tests (70+ tests)

FOR SCREENER (Section A):
- Iteration 1: Add screener items + routes to definition.json, schema validation test
- Iteration 2: Engine evaluateScreener() method + unit tests
- Iteration 3: Webcomponent rendering of screener items
- Iteration 4: E2E test: answer screener → correct pages appear

AFTER EACH COMMIT, validate:
- npm run build (TypeScript compiles)
- npm test (Playwright suite passes)
- python3 -m pytest tests/ -q (Python suite passes)

IMPORTANT:
- Never write E2E tests before the engine logic exists — they'll fail for the wrong reason.
- Each iteration = ONE commit. Don't try to do an entire subsystem in one go.
- If an engine change breaks existing tests, fix the regression before committing.
- KISS — implement the simplest version that passes the test. Don't over-engineer.
- Remember: all code is ephemeral. If a first attempt is wrong, delete and rebuild.

WHEN DONE: If ALL items in sections A–F of ADR-0031 are committed and all tests pass, output:
<promise>PHASE3 COMPLETE</promise>

If items remain, commit your work and stop.
```

---

## Monitoring & Intervention

### Between phases

After each phase completes (or hits 15 iterations), manually verify:

```bash
# Check what got done
git log --oneline -20

# Run full suites
npm test
python3 -m pytest tests/ -q

# Check schema validation on all grant-app files
node -e "
const Ajv = require('ajv');
// validate each file against its schema
"
```

If a phase didn't finish in 15 iterations, review git log to understand pacing. Options:
- Run another 5-10 iterations with the same prompt
- Narrow the prompt to the remaining items only
- Manually finish the stragglers

### Signs of trouble

| Symptom | Fix |
|---------|-----|
| Same item attempted twice | Check if the commit from the first attempt was lost (test failure → no commit). Fix the blocking test. |
| No commits produced | The red test might be wrong. Check the last iteration's output. |
| Tests passing but wrong behavior | Review the test — it may be asserting the wrong thing. |
| Engine changes breaking unrelated tests | Revert, then re-approach with a smaller change. |
| Iteration wasted on refactoring | The prompt says "do NOT refactor" — if Claude keeps doing it, add stronger language. |

### Adjusting iteration counts

The 15-per-phase split assumes:
- **Phase 1:** ~12 meaningful items, some taking 2 iterations → 15 is tight but feasible
- **Phase 2:** ~10 meaningful items, mapping depth takes 3-4 → 15 is comfortable
- **Phase 3:** ~6 subsystems, screener alone takes 4 → 15 is comfortable

If Phase 1 doesn't finish in 15, it's fine to run 5 more. The prompts are idempotent — they always check what's already done before picking the next item.

# Unified Authoring Architecture

**Date:** 2026-03-24
**Status:** Draft
**Goal:** Integrate chat directly into studio with a shared Project, MCP full coverage, and changeset-based review flow.

---

## Executive Summary

Today, studio and chat are separate worlds: studio calls `Project` methods directly, chat creates its own `McpBridge` with its own `Project` instance, and the user imports results between them. This design unifies them into a single workspace where one `Project` instance is shared between the user (canvas) and the AI (MCP tools), with a proposal layer that lets users review AI changes before committing them.

Three motivations drive this:

1. **Shared undo/redo** — one history stack, both actors contributing
2. **Convergence** — chat and canvas are the same workspace, AI sees user edits in real-time
3. **Stack simplification** — collapse the separate Project instances, make MCP the universal AI surface with full spec coverage

---

## 1. Revised Layer Architecture

The key structural change: `formspec-chat` stops owning a `Project`. It becomes a conversation orchestrator that connects to whoever owns the `Project`. The MCP server becomes the universal AI interface with full coverage.

```
Layer 0: formspec-types
Layer 1: formspec-engine  (+E1-E3: type predicates, FEL identifiers, function catalog)
         formspec-layout
Layer 2: formspec-core    (+C1-C11: tree ops, bind normalization, drop targets, serialization)
         formspec-webcomponent
         +ChangesetRecorderControl interface, createChangesetMiddleware() factory
Layer 3: formspec-adapters
         formspec-studio-core (+S1-S18 + ProposalManager)
Layer 4: formspec-mcp     (FULL coverage of studio-core — every Project method has a tool)
Layer 5: formspec-chat    (conversation state + AI adapter — NO Project, NO McpBridge)
Layer 6: formspec-studio  (pure rendering + chat panel + inline AI actions)
```

### Package Responsibility Changes

| Package | Today | After |
|---------|-------|-------|
| **core** | Handlers, pipeline, history, queries | +`ChangesetRecorderControl` interface, `createChangesetMiddleware()` factory. The recording middleware is a `Middleware` in the pipeline — no dependency on studio-core. |
| **studio-core** | 51 helper methods on `Project` | +`ProposalManager` (changeset lifecycle, dependency analysis, merge/reject via git model) + all migrated business logic (S1–S18). Controls the recording middleware via `ChangesetRecorderControl`. |
| **mcp** | 28 tools, partial coverage | Full parity with `Project` API. Every mutation and query has a tool. Three new document types (locale, ontology, references). Changeset management tools. Decorates recorded commands with tool-level context (tool name, summary). |
| **chat** | Owns `McpBridge` → own `Project` → own MCP server | Thin layer: conversation history, AI adapter calls, system prompts. Receives a `ToolContext` connection, doesn't create one. |
| **studio** | Calls `Project` directly + separate chat entry point (`main-chat.tsx`) | Calls `Project` directly for user actions. Hosts the MCP server in-process. Chat panel + inline AI context actions. Renders changeset merge UI. |

### The Critical Inversion

Today, chat *creates* the MCP infrastructure (McpBridge instantiates a Project, ProjectRegistry, and MCP server). After this change, **studio** creates it — the MCP server wraps studio's Project — and chat *connects to* it.

### Why MCP as the Integration Surface

An alternative to routing all AI interaction through MCP is having the AI adapter call `Project` helper methods directly, same as the canvas. This would be simpler for in-process use. MCP is chosen because:

- **One surface to maintain** — external AI clients (Claude, GPT via stdio/SSE) and the in-process chat panel share identical tool definitions, tests, and parameter validation.
- **Standard protocol** — any MCP-speaking model works without adapter changes. No per-model translation of helper method signatures.
- **Tool-level semantics** — MCP tool annotations (`readOnlyHint`, `destructiveHint`) give AI clients behavioral hints that raw method calls don't.
- **Overhead is negligible** — `InMemoryTransport` avoids serialization/network. The cost is one extra function call per tool invocation.

### What Gets Deleted

- `McpBridge` class — deleted entirely
- Chat's separate `Project` instance — gone
- The import/export dance between chat and studio — gone
- The separate chat entry point (`main-chat.tsx`, `chat/`, `chat-v2/`) — consolidated into an integrated chat panel within the studio shell

---

## 2. ProposalManager (Changeset Semantics)

### Design: Middleware-Based Recording

The ProposalManager uses the existing `CommandPipeline` middleware hook in **formspec-core** rather than wrapping the `Project` API. This is a critical architectural choice: every mutation already flows through the pipeline, so a recording middleware captures commands **by construction** — no API interception needed, no commands missed.

The architecture splits into two layers:

1. **Recording middleware** (formspec-core, layer 2) — a `Middleware` that records `AnyCommand[][]` as they pass through the pipeline. Pure side effect: passes commands through unchanged, captures them on the way. Tags each recording with the current actor (`'ai'` or `'user'`). No knowledge of changesets, dependencies, or analysis.

2. **Dependency analysis** (Rust crate, exposed via WASM) — takes recorded command sets, extracts all key references (FEL expressions, shape composition, cross-tier bindings), and computes dependency groups. This is spec business logic and belongs in Rust alongside the FEL parser and evaluator.

3. **ProposalManager class** (formspec-studio-core, layer 3) — manages changeset lifecycle, controls the middleware, orchestrates dependency analysis via WASM, handles merge/reject with snapshot-restore-and-replay. This is the orchestration layer.

### Infrastructure: ChangesetRecorderControl

Defined in formspec-core (layer 2) so the middleware factory doesn't violate layer fences:

```typescript
// formspec-core/src/types.ts

/** Control interface for the changeset recording middleware. */
interface ChangesetRecorderControl {
  /** Whether the middleware should record commands passing through. */
  recording: boolean;
  /** Current actor — determines which recording track captures the commands. */
  currentActor: 'ai' | 'user';
  /** Called after each successful dispatch when recording is on. */
  onCommandsRecorded(
    actor: 'ai' | 'user',
    commands: Readonly<AnyCommand[][]>,
    results: Readonly<CommandResult[]>,
    priorState: Readonly<ProjectState>,
  ): void;
}

// formspec-core/src/changeset-middleware.ts

/** Creates a recording middleware controlled by the given handle. */
function createChangesetMiddleware(control: ChangesetRecorderControl): Middleware {
  return (state, commands, next) => {
    const result = next(commands);
    if (control.recording) {
      control.onCommandsRecorded(control.currentActor, commands, result.results, state);
    }
    return result;
  };
}
```

The middleware is injected via `ProjectOptions.middleware` when creating the `RawProject`. The `ProposalManager` in studio-core holds the `ChangesetRecorderControl` and toggles `recording` and `currentActor` as the changeset lifecycle progresses. The MCP layer sets `currentActor = 'ai'` inside `beginEntry`/`endEntry` brackets; outside those brackets (user canvas actions), the actor defaults to `'user'`.

**No blocking.** Unlike v3, the middleware never prevents mutations. The user can always edit the canvas, even while a changeset is pending review. User edits during review are recorded as a separate "user overlay" track. This follows the git merge model: incoming changes (AI) and local changes (user) coexist, and conflicts are detected at merge time, not prevented by locking.

### Infrastructure: IProjectCore.restoreState()

Snapshot restore requires a new method on `IProjectCore`:

```typescript
// Addition to IProjectCore interface
restoreState(snapshot: ProjectState): void;
```

Implementation in `RawProject`: `this._state = snapshot; this._notify(...)`. One line plus notification. Undo/redo already does the same thing (line 405: `this._state = prev`) — this generalizes it for ProposalManager use. History stack is cleared on restore (the changeset was the "undo" — there's nothing to undo to).

### Core Types

```typescript
interface Changeset {
  id: string;
  label: string;                    // "Added 3 fields, set validation on email"
  aiEntries: ChangeEntry[];         // AI's work (recorded during MCP tool brackets)
  userOverlay: ChangeEntry[];       // user edits made while changeset exists
  dependencyGroups: DependencyGroup[]; // computed from aiEntries on close
  status: 'open' | 'pending' | 'merged' | 'rejected';
  snapshotBefore: ProjectState;     // full state snapshot before changeset
}

interface ChangeEntry {
  /** The actual commands dispatched through the pipeline (captured by middleware). */
  commands: AnyCommand[][];
  /** Which MCP tool triggered this entry (set by MCP layer, not middleware). */
  toolName: string;
  /** Human-readable summary from HelperResult (set by MCP layer). */
  summary: string;
  /** Paths affected by this entry (extracted from CommandResult). */
  affectedPaths: string[];
  /** Warnings produced during execution. */
  warnings: string[];
  /** Captured evaluated values for one-time expressions (see initialValue edge case). */
  capturedValues?: Record<string, unknown>;
}

interface DependencyGroup {
  entries: number[];                // indices into changeset.entries
  reason: string;                   // "field 'email' is referenced by bind and shape"
}
```

**Key difference from v2**: `ChangeEntry` stores `commands: AnyCommand[][]` (the actual pipeline commands captured by middleware) instead of `args: Record<string, unknown>` (the MCP tool arguments). This means replay operates at the command level — deterministic, no re-running helper pre-validation against potentially different state.

### How Recording Works

```
MCP tool call (e.g., formspec_field "add email field")
  → ProposalManager.beginEntry(toolName)          // sets marker
  → studio-core helper (project.addField())
    → core dispatch/batch
      → recording middleware captures AnyCommand[][] + CommandResult[]
      → pipeline executes normally, state mutates
    → helper returns HelperResult
  → ProposalManager.endEntry(summary, warnings)   // pairs marker with metadata
  → MCP tool returns result to AI
```

The middleware captures the mechanical truth (what commands ran). The MCP layer captures the semantic context (which tool, what summary). They're paired by the `beginEntry`/`endEntry` bracket.

### Changeset Lifecycle (Git Merge Model)

The changeset lifecycle follows git merge semantics: the user is never locked out of editing. AI changes and user changes coexist as two recording tracks, and conflicts are detected at merge time.

1. **Open** — `ProposalManager.openChangeset()` captures `structuredClone(project.state)` as `snapshotBefore`, sets `control.recording = true`, `control.currentActor = 'user'` (default). Returns changeset ID.
2. **AI mutations** — The MCP layer brackets each tool with `beginEntry(toolName)` (sets `control.currentActor = 'ai'`) and `endEntry(summary, warnings)` (resets `control.currentActor = 'user'`). Commands are captured to `aiEntries`. Canvas updates in real-time — the user sees the form building.
3. **User edits during open changeset** — The user can edit the canvas freely while the AI is working or afterward. User mutations flow through the same pipeline and middleware, but `currentActor` is `'user'`, so they're captured to `userOverlay`. Both tracks apply live to the project state.
4. **Close** — `ProposalManager.closeChangeset(label)` sends `aiEntries` to the Rust dependency analysis engine via WASM, which computes `dependencyGroups`. Status → `pending`. Recording continues (user edits during review are still captured to `userOverlay`).
5. **Review (merge)** — Client shows the AI's changeset grouped by dependencies. User can continue editing the canvas. When ready:
   - **Merge all** → discard snapshot, changeset finalized. State is already correct (both AI and user changes applied live). Status → `merged`.
   - **Reject all** → `project.restoreState(snapshotBefore)`, replay `userOverlay` entries only. Status → `rejected`.
   - **Partial merge** → `project.restoreState(snapshotBefore)`, replay accepted AI dependency groups (chronological order) → replay all `userOverlay` entries → run structural validation. Status → `merged`.
6. **Conflict detection** — After partial merge replay, `project.diagnose()` runs. If user overlay entries depend on rejected AI entries (e.g., user added a bind to an AI-created field that was rejected), the diagnostics report the conflict. The user resolves by making additional edits — same as resolving a git merge conflict.

**Key difference from v3:** No blocking, no `control.blocking` flag, no greyed-out canvas. The user always has agency. "Reject → fix → redo" becomes "edit alongside → merge what you want."

### Revert Strategy: Command-Level Snapshot-and-Replay

The revert strategy uses full state snapshots combined with command-level replay, analogous to git's merge mechanics:

- **Reject all, no user edits**: `project.restoreState(snapshotBefore)`. Clean rollback.
- **Reject all, with user edits**: `project.restoreState(snapshotBefore)`, then replay all `userOverlay` entries in chronological order. The user's work is preserved; only the AI's changes are discarded.
- **Merge all** (accept all): Discard snapshot. No replay needed — the state already reflects both AI and user changes.
- **Partial merge**: `project.restoreState(snapshotBefore)`, then for each accepted AI dependency group (in original chronological order) replay `entry.commands` via `project.batch()`, then replay all `userOverlay` entries in chronological order.

**Why command-level replay, not tool-level replay:** Tools run helper methods that include pre-validation, key generation, and multi-phase batching logic. Replaying at the tool level (`formspec_field add email`) would re-run this logic against a different state (the snapshot, not the state the tool originally saw). This could produce different keys, different validation outcomes, or different command sequences. Recording and replaying the actual `AnyCommand[][]` that the tool produced is deterministic — the same commands against the same snapshot produce the same state, regardless of what helper logic generated them.

**Chronological order within groups is mandatory.** S2.4's deferred processing guarantee covers Instance data convergence (batched setValue calls produce the same result), not Definition mutation ordering. Structural operations like "add group → add child field inside group" must replay in original order because the child operation depends on the parent existing. The dependency grouping ensures related operations are in the same group; replaying in chronological order within each group ensures structural prerequisites are met.

After replay, the engine's state normalization runs (URL sync, breakpoint sort, etc.), and if any result signals `rebuildComponentTree`, the component tree reconciler fires. This is the same post-dispatch path that runs on every normal mutation — no special handling needed.

**Edge case: `initialValue` with `=` prefix.** The spec (S4.2.3) defines `=`-prefixed `initialValue` expressions as one-time evaluation at creation time. If replay occurs later (e.g., `=today()`), the expression produces a different value. The recording middleware captures the evaluated result in `ChangeEntry.capturedValues`. During replay, the ProposalManager patches the `initialValue` command payload to use the captured value instead of the expression.

**Edge case: `prePopulate`.** Per S4.2.3, `prePopulate` is syntactic sugar for an `initialValue` expression plus a `readonly` bind. The same capture-at-application-time strategy applies — `prePopulate` values that depend on `@instance()` data are captured when first evaluated and replayed verbatim. Note: `prePopulate` also has an `editable` property (default `true`); when `editable: false`, it generates a `readonly: "true"` bind. The dependency tracker accounts for this.

**Edge case: `now()` non-determinism.** Core S3.5.4 defines `now()` as explicitly non-deterministic. If a `calculate` bind uses `now()`, the post-replay Recalculate phase produces a different value than the original execution. This is acceptable — the user is reviewing a merge, not expecting bit-exact reproduction of timestamps. The design acknowledges that post-merge state may differ from pre-close state for `now()`-dependent expressions.

**Edge case: Instance `source` URL templates.** Per S4.4.1, Instance `source` can use `{{param}}` URL templates. If parameters change between original execution and replay, fetched data could differ. Instance data fetching should be suppressed during replay — the replay operates on the structural definition, not runtime data. The post-replay Rebuild will trigger fresh data fetching if needed.

**Edge case: user overlay conflicts.** If the user edits something during review that depends on an AI-created structure (e.g., adds a bind to an AI-created field), then the user rejects the AI group that created that field, the `userOverlay` replay will produce a command referencing a non-existent field. This is detected by post-replay `diagnose()` — the same way git detects merge conflicts. The user sees the diagnostic and can fix it with additional edits.

### Position-Dependent Operations

Most commands target by key (`definition.addBind` with `path: "email"`), so replay order within a group is the only concern. But some operations use array indices:

- **`definition.addItem`** with `insertIndex` — JavaScript `Array.splice` clamps to array length if the index exceeds bounds, so the item still gets added (possibly at a different position). For partial accept, position shifts are an acceptable consequence.
- **Screener routes** — Per S4.7.1, routes evaluate in declaration order (first-match-wins). Position shifts change routing behavior. **All screener route mutations within a changeset are placed in the same dependency group** (order-interdependent). This prevents partial accept from reordering routes.
- **Theme selectors** — Per Theme S5.3, selector specificity includes declaration order. Same treatment: all selector mutations in the same dependency group.

### Intra-Changeset Dependency Tracking

When a changeset closes, the ProposalManager analyzes dependencies between entries:

- Field `email` created (entry 1)
- Bind `required` on `email` (entry 2) → depends on entry 1 (references `email` key)
- Shape targeting `$email` (entry 3) → depends on entry 1 (FEL reference)
- Page region placing `email` (entry 4) → depends on entry 1 (references `email` key)
- Unrelated field `name` created (entry 5) → independent

Result: two dependency groups `{entry 1, 2, 3, 4}` and `{entry 5}`. The user sees two reviewable groups, not five individual items.

**Dependency edges to track:**

Core definition edges:
- Bind/shape `path` or `target` references a key created in the changeset
- FEL expressions (`calculate`, `relevant`, `constraint`, `initialValue`, `default` with `=` prefix, shape `constraint`) reference `$key` tokens created in the changeset — including wildcard dependencies (`$group[*].field`) which depend on the group structure, not a single key
- `@instance('name')` references in FEL expressions that reference an instance declared in the changeset (S3.2.3, S4.4.2)
- `@variableName` references in FEL expressions that reference a variable declared in the changeset (S4.5) — this is the reverse direction from "variable scope referencing a key"
- Variables with `scope` referencing a key created in the changeset
- `optionSet` and `options` mutations on the same field (precedence rule — S4.2.3)
- Shape composition `id` references (`and`/`or`/`not`/`xone` arrays referencing other shapes by id — S5.2.2) — these are NOT FEL expressions, they are direct shape-to-shape references
- Shape `activeWhen` expressions (S5.2.1) — FEL boolean expressions that may reference keys
- Shape `context` expressions (S5.2.1) — FEL expressions that may reference keys
- Shape `message` interpolation `{{expression}}` (S5.2.1) — embedded FEL expressions
- Screener route `condition` expressions (S4.7.1) — FEL expressions referencing screener items
- `calculate` and `readonly` binds on the same field — implicit `readonly` from `calculate` (S4.3.1) means removing `calculate` changes editability
- `relevant` and `nonRelevantBehavior` on the same path — changing `nonRelevantBehavior` without its `relevant` bind (or vice versa) alters Response serialization semantics (S5.6 Rule 2 vs Rule 4)
- `initialValue` with `=` prefix as a dependency source — `=$otherField` creates a dependency on `otherField` at creation time. If `otherField` is created in the same changeset, these entries are interdependent (for grouping, not just value capture).
- `default` with `=` prefix as a dependency source — same `=` prefix FEL expression mechanism as `initialValue` (definition schema line 857, example `"=today()"`). Fires on re-relevance (S5.6 Rule 5), creating a runtime dependency on referenced fields. Must be scanned for `$key` tokens just like `initialValue`.
- `optionSet` name reference — a field's `optionSet` property (S4.2.3) references a named option set declared in `optionSets`. If a changeset creates both the option set and the field referencing it, these are interdependent.
- `prePopulate.instance` reference — `prePopulate` contains an `instance` property naming a secondary instance (S4.2.3). If a changeset creates both an instance declaration and a field with `prePopulate` referencing that instance, these are interdependent.
- Field `children` structural parent-child — fields may contain children for dependent sub-questions (S4.2.3). If a changeset creates a parent field and then adds child items to it, the child depends on the parent's existence. Structurally the same as group→child dependencies.
- Migration `expression` FEL references — `MigrationDescriptor.fieldMap[].expression` (S6.7.1, `transform: "expression"`) contains FEL expressions that may reference keys created in the changeset

Cross-document edges:
- Locale string keys (`<key>.label`, `$shape.<id>.message`) referencing items or shapes created in the changeset
- Ontology concept bindings referencing paths created in the changeset
- References bound to paths created in the changeset
- Theme item overrides targeting a key created in the changeset (soft — warn, don't block)
- Component slot bindings to a key created in the changeset (soft — warn, don't block)
- Component `when` expressions (Component S8.1) — FEL boolean expressions referencing `$fieldKey` in the definition. Cross-tier dependency from component document to definition.
- Summary/DataTable/Accordion `bind` references (Component S4.2, S6.3, S6.12, S6.13) — `items[].bind` and `columns[].bind` reference definition item keys. Accordion can `bind` to a repeatable group. Not standard slot bindings.
- Mapping rule `sourcePath`, `condition` (FEL guard), and `expression` referencing keys created in the changeset

Order-dependent grouping:
- Multiple screener route operations → same dependency group (declaration order = evaluation order, S4.7.1)
- Multiple theme selector operations → same dependency group (declaration order affects specificity, Theme S5.3)

**Cross-document changesets:** When a single changeset touches multiple documents (definition + theme + component + locale + ontology + references), dependency groups may span documents. Accepting a definition change but rejecting its associated theme/component/locale changes is allowed (cross-tier references are soft warnings per the spec) but the ProposalManager flags dangling cross-tier references in the post-merge diagnostics.

### Structural Validation at Accept/Reject Boundaries

After computing the accepted-only state (snapshot + accepted commands replayed), the ProposalManager delegates to `project.diagnose()` which runs the full suite of load-time definition error checks. The complete list:

Definition errors (Core S3.10.1):
- **FEL syntax error** — expression does not conform to the grammar
- **Global key uniqueness** (S4.2.1) — no duplicate keys across the entire definition
- **DAG acyclicity** (S3.6.2) — no circular FEL dependencies
- **FEL reference resolution** (S3.10.1) — all `$key` references in expressions resolve to existing items
- **Bind path resolution** (S4.3.3) — bind `path` must resolve to at least one Item key in the Definition
- **Variable scope validity** (S4.5) — all variable scopes reference existing items
- **Calculate target conflict** (S3.10.1) — each field has at most one `calculate` bind
- **Read-only instance write** (S3.10.1) — `calculate` bind must not target read-only instance
- **FEL arity mismatch** (S3.10.1) — function calls with correct argument count
- **Undefined function** (S3.10.1) — FEL function must be built-in or registered
- **Undefined instance** (S3.10.1) — `@instance('name')` references declared data source
- **Shape circular references** (S5.2.2) — no circular references among shapes
- **Repeat cardinality** (S4.2.2) — `maxRepeat` >= `minRepeat`
- **Display item constraints** (S4.2.4) — display items MUST NOT have children, MUST NOT have a dataType, only `relevant` bind applies
- **Shape `id` uniqueness** (S5.2.1) — shape id MUST be unique across all shapes in the definition
- **Variable `name` uniqueness within scope** (S4.5.1) — variable name MUST be unique within its scope

Component document errors:
- **Custom component cycle detection** (Component S7.4) — custom component templates must not reference themselves
- **Custom component params completeness** (Component S12.2) — instantiations must supply all declared params
- **dataType/component compatibility** (Component S12.3) — each Input component's bound item must have a compatible `dataType`

Warning-level checks (not blocking, but reported in diagnostics):
- **Option set / options co-presence** (S4.2.3) — `optionSet` takes precedence over `options`, but having both present may indicate authoring intent mismatch

If validation fails, the merge is blocked with diagnostics explaining why.

**JSON Schema validation as a sub-pass:** `diagnose()` includes JSON Schema validation as its first pass. Schema-level constraints (`anyOf` requirements like instance `source`/`data`, item key pattern `[a-zA-Z][a-zA-Z0-9_]*`, `dataType` required on fields, etc.) are caught here before the semantic checks above run. This means schema-enforced structural invariants do not need to be duplicated in the semantic check list.

**Scope clarification:** The non-relevant field prohibition (S1.4.3: "MUST NOT validate non-relevant fields") applies to **runtime validation** of form data (Response processing), not to **structural validation** of the Definition document. The S3.10.1 definition errors are load-time structural checks that apply regardless of runtime relevance. Post-accept diagnostics from `diagnose()` run the structural checks unconditionally. Runtime validation diagnostics (shape evaluation) should respect the non-relevance prohibition — submit-timing shapes (S5.2.1) are NOT evaluated during post-merge validation because post-merge is not a submission event.

### Content Immutability Enforcement

The ProposalManager enforces VP-02 (S6.4) as defense-in-depth: `openChangeset()` checks `definition.status === 'draft'` and refuses to open on `active` or `retired` definitions. This gate is in addition to the MCP tools' own status checks, ensuring that no code path — MCP or direct — can open a changeset on a non-draft definition.

### Error Recovery

If replay fails (a command throws during replay of accepted groups), the ProposalManager:

1. Restores to `snapshotBefore` (guaranteed safe — the snapshot was valid state)
2. Returns a `ReplayFailure` diagnostic with the failing command, the error, and the entry it belonged to
3. Does NOT leave the project in a partially-replayed state — it's all-or-nothing per merge attempt

The user can then try merging different groups, merge all (which skips replay entirely — just discard snapshot), or reject all.

### Out of Scope for Changesets

These operations are inherently non-reversible or one-way and should not be part of changeset semantics:

- **Status transitions** (`draft → active`) — one-way door per Core S6.3
- **`$ref` assembly** — publish-time operation per Core S6.6.2
- **Publish** — version lifecycle enforcement

### Design Gaps — Resolved

These interactions were identified during v4 review and resolved during v5 review.

#### Gap 1: Undo/Redo During Open Changeset — RESOLVED: Disable

The changeset middleware records commands as they flow through the pipeline. Undo does not flow through the pipeline — it restores a prior state directly via `this._state = prev`. This creates an irreconcilable divergence between recorded commands and actual state.

**Decision: Disable undo/redo while a changeset is open.** The changeset IS the undo mechanism during its lifetime — reject = undo all AI work, partial merge = selective undo. `Project.undo()`/`Project.redo()` return `false` when a changeset is open; `canUndo`/`canRedo` return `false`, naturally greying out UI buttons. Implementation is a one-line guard in studio-core's `Project`, no core changes needed. The spec says nothing about undo/redo — it is entirely out of scope (S2.4 defines a processing model for data, not an authoring model for definitions).

#### Gap 2: ChangeEntry Type for User Overlay — RESOLVED: Optional Fields

`ChangeEntry.toolName` and `ChangeEntry.summary` are set by the MCP layer during `beginEntry`/`endEntry` brackets. User canvas edits don't pass through MCP — they call `project.addField()` directly. User overlay entries won't have a `toolName` or `summary`. The spec is actor-agnostic (S2.4 treats user input, programmatic update, and batch loading identically) — no attribution requirements.

**Decision:** Make `toolName` and `summary` optional. For user overlay entries, the ProposalManager generates a synthetic summary from the command type and affected paths (e.g., `"User: added field 'phone'"`, `"User: moved item 'email'"`). Command types follow the `domain.verb` pattern (e.g., `definition.addItem`), making translation tables straightforward. The `toolName` is omitted or set to a sentinel like `'canvas'`.

```typescript
interface ChangeEntry {
  commands: AnyCommand[][];
  toolName?: string;               // present for AI entries (MCP), absent for user overlay
  summary?: string;                // present for AI entries, auto-generated for user overlay
  affectedPaths: string[];
  warnings: string[];
  capturedValues?: Record<string, unknown>;
}
```

#### Gap 3: Error Recovery With User Overlay — RESOLVED: Layered Savepoints

The error recovery section assumes replay failure restores to `snapshotBefore`. With user overlay, three replay phases can each fail independently:

1. Accepted AI group replay fails
2. AI groups succeed, but user overlay replay fails
3. Both succeed, but post-merge `diagnose()` reports structural errors

**Resolution:** Layered recovery with savepoints.

- **Phase 1 fails (AI group):** Restore to `snapshotBefore`. Return `ReplayFailure` for the AI entry. User can try different groups.
- **Phase 2 fails (user overlay):** Restore to `snapshotBefore + accepted AI groups` (savepoint taken after phase 1). Return `ReplayFailure` for the user entry. The accepted AI groups are preserved; only the conflicting user edit is reported. The user can fix the conflict and retry.
- **Phase 3 fails (structural validation):** State is post-replay. Return diagnostics. The merge is blocked but the project shows the attempted state (same as v3). User can reject to restore `snapshotBefore`, or fix issues and re-merge.

The savepoint after phase 1 is a `structuredClone` of the intermediate state — one additional clone. This is acceptable given that `structuredClone(project.state)` is already used for the initial snapshot.

#### Gap 4: Scaffold-to-Changeset Mechanics — RESOLVED: Single Command Load

`generateScaffold()` returns a `FormDefinition` (JSON blob). The middleware records `AnyCommand[][]`. The existing `loadBundle` dispatches a single `project.import` command — the middleware captures it as one `AnyCommand[][]`, mapping directly to one `ChangeEntry`. S6.6.2 assembly is publish-time only; loading a scaffold does not require it. S2.4 Phase 1 (Rebuild) triggers after definition replacement, which is the relevant processing path.

**Resolution: Two-tier approach.**

- **Tier 1: Load as a single command, review as a whole.** `project.loadDefinition(scaffoldedDef)` produces one `ChangeEntry`. The review UI shows the scaffold summary (field count, structure overview) rather than individual operations. The user accepts or rejects the entire scaffold. This is the right UX for initial creation — the user either likes the AI's starting point or wants a different one. Partial accept of a scaffold makes little sense (you wouldn't keep half a skeleton).

- **Tier 2: Decomposition for granular review (future).** If demand exists, a `decomposeDefinition(def, baseline)` utility could diff the scaffold against an empty (or existing) definition and produce individual `ChangeEntry`-equivalent command sequences. This is a pure function — it doesn't need the middleware. The ProposalManager could call it to "explode" a scaffold changeset into reviewable entries. This is deferred — build Tier 1, see if users actually want granular scaffold review.

For the `ChangeEntry` representation of a scaffold: `toolName: 'generateScaffold'`, `summary: "Scaffolded form with N fields, M groups"`, `commands` contains the single `setDefinition` command batch. The dependency grouping phase recognizes single-entry changesets and skips grouping (the whole scaffold is one group).

### MCP Tools for Changeset Management

| Tool | Purpose |
|------|---------|
| `formspec_changeset_open` | Start a new changeset. All subsequent mutations are grouped. |
| `formspec_changeset_close` | Seal the changeset. Computes dependency groups. Status → `pending`. |
| `formspec_changeset_list` | List changesets with status, summaries, and dependency groups. |
| `formspec_changeset_accept` | Accept a pending changeset — all, or specific dependency groups by index. |
| `formspec_changeset_reject` | Reject a pending changeset — all, or specific dependency groups. Reverts via snapshot-and-replay. |

Every mutation tool works in two modes:
- **No open changeset** → mutation applies immediately and is final (direct authoring)
- **Open changeset** → mutation applies immediately to state (live preview) but is recorded as a proposal entry

### Dependency Analysis Engine (Rust / WASM)

Dependency analysis is spec business logic — it requires understanding FEL expression references, shape composition semantics, cross-tier bindings, and order-dependent operations. Per the project's logic ownership principle, this belongs in Rust alongside the FEL parser and evaluator.

The Rust crate (extension to `formspec-core` or new `formspec-changeset` crate) exposes via WASM:

```rust
/// Takes a list of recorded command sets with their created keys,
/// extracts all reference edges, and returns dependency groups.
fn compute_dependency_groups(
    entries: &[RecordedEntry],      // commands + affected paths + created keys
    definition_snapshot: &Value,     // definition state for FEL expression scanning
) -> Vec<DependencyGroup>
```

The function:
1. For each entry, extracts all keys it *creates* (from `addItem`, `addBind`, `addShape`, etc.)
2. For each entry, extracts all keys it *references* — by scanning FEL expressions (reusing `fel-core`'s dependency extraction), shape `id` references, bind paths, component slot/when bindings, locale string keys, etc.
3. Builds a directed graph: entry B depends on entry A if B references a key that A created
4. Adds order-dependent edges: all screener route mutations → same group, all theme selector mutations → same group
5. Computes connected components → these are the dependency groups

The ProposalManager in TypeScript is a thin orchestrator: it collects the recorded entries, serializes them for WASM, calls `compute_dependency_groups`, and acts on the result.

### Merge UX: The Git Model

The changeset review follows git merge semantics. The user is never locked out:

- While a changeset is **open**: the canvas is fully interactive. User edits are recorded to the `userOverlay` track. The AI's entries appear in the chat panel in real-time. The canvas shows the combined state (AI + user changes).
- While a changeset is **pending**: the canvas remains fully interactive. The chat panel shows the merge review UI — dependency-grouped AI entries with accept/reject controls. User edits continue to be recorded.
- On **merge**: if partial, the canvas briefly flashes as the state is restored and replayed. Diagnostics appear in the chat panel if conflicts are detected.
- On **reject all**: same brief state transition. User edits are preserved.

The UI should visually distinguish AI-created elements from user-created elements during the review period (e.g., subtle badge or color indicator on AI-created fields). This is a rendering concern, not a state concern — the `aiEntries` provide the affected paths needed for visual differentiation.

---

## 3. MCP Full Coverage

Every `Project` method and every spec-defined operation gets an MCP tool. The AI can do anything a human user can do.

### Current Tools (retained, some expanded)

| Tool | Coverage |
|------|----------|
| `formspec_create` | Create new project |
| `formspec_field` | Add/configure fields |
| `formspec_content` | Add content items (headings, paragraphs, dividers, banners) |
| `formspec_group` | Add/configure groups (repeatable sections) |
| `formspec_submit_button` | Configure submit button |
| `formspec_update` | Update item properties — **expand**: `labels` (context-keyed: `short`, `pdf`, `csv`, `accessibility`), `prePopulate`, `extensions` CRUD, `name`, `derivedFrom`, `date`, `description`, `versionAlgorithm`, `formPresentation.defaultCurrency`, `formPresentation.direction` (`ltr`/`rtl`/`auto`), `nonRelevantBehavior` (definition-level), field-specific: `currency`, `precision`, `prefix`/`suffix`, `semanticType`, `children`. Fine-grained bind props: `default`, `whitespace`, `excludedValue`, `disabledDisplay`, `constraintMessage`, per-bind `nonRelevantBehavior` |
| `formspec_edit` | Move/reorder/delete items |
| `formspec_page` | Page management — **expand**: fine-grained region/grid ops, responsive overrides |
| `formspec_place` | Item placement — **expand**: `setItemWidth`, `setItemOffset`, `setItemResponsive` |
| `formspec_behavior` | Logic — **expand**: shape composition (`and`/`or`/`not`/`xone`), `updateValidation`, `activeWhen`, `timing`, `context`, shape `code` (machine-readable, used by locale `$shape.<id>.message`) |
| `formspec_flow` | Flow/routing |
| `formspec_style` | Presentation styling |
| `formspec_data` | Data sources, option sets, variables |
| `formspec_screener` | Screener route management — **expand**: screener-scoped `binds`, route `message` property, route `extensions` (both in definition schema, S4.7.1 prose to be updated) |
| `formspec_describe` | Describe current form state |
| `formspec_search` | Search items |
| `formspec_trace` | Diagnostics/validation |
| `formspec_preview` | Preview form — **expand**: sample data generation |
| `formspec_fel` | FEL expression utilities — **expand**: editing support (validation, highlighting, autocomplete) |
| `formspec_guide` | Guidance/help |
| `formspec_undo` / `formspec_redo` | History |

**Removed from v2:** `autoGeneratePages` (not in the theme spec or schema). Note: `formPresentation.direction` was previously removed here (v3) but reinstated (v5) — it IS in the definition schema with `additionalProperties: false`, confirming intentional inclusion. S4.1.1 prose needs updating to match.

### New Tools

| Tool | Operations |
|------|-----------|
| `formspec_structure` | Batch ops: `wrapItemsInGroup`, `wrapInLayoutComponent`, `batchDeleteItems`, `batchDuplicateItems`, `reorderItem` |
| `formspec_theme` | Tokens, defaults, selectors (CRUD + reorder), item overrides, **breakpoints**, **platform**, **responsive region overrides**, **`stylesheets`** (external CSS URIs), document metadata (`name`, `title`, `description`, `url`) |
| `formspec_component` | Tree node CRUD (`addLayoutNode`, `unwrapLayoutNode`, `deleteLayoutNode`, `moveLayoutNode`), **`when` conditional rendering**, **custom component registry** (`CustomComponentDef` with `params` and `tree`), **`tokens`** (Tier 3 token map), **`responsive`** (per-component breakpoint overrides), **`id`** (stable node identifier for locale binding), **`breakpoints`** (document-level) |
| `formspec_widget` | Hint resolution, compatibility matrix, widget <-> component mapping |
| `formspec_option_set` | CRUD (`defineChoices`, `updateOptionSet`, `deleteOptionSet`) + usage query. All OptionSet properties: `options` (inline array), `source` (external URI), `valueField`/`labelField` (field mapping), `extensions` |
| `formspec_datasource` | CRUD for data sources/instances — all Instance properties: `source` (URL with template variables, including `formspec-fn:` URIs), `data` (inline), `schema` (type declarations), `static` (cacheability), `readonly` (writable scratchpads), `description`, `extensions` |
| `formspec_variable` | CRUD + rename |
| `formspec_mapping` | Rule CRUD — all FieldRule properties: `sourcePath`, `targetPath`, `transform`, `condition` (FEL guard), `priority`, `expression`, `coerce`, `valueMap`, `flattenMode`, `separator`, `reverse`, `reversible`, `description`, `extensions`. **Multi-mapping CRUD** (`createMapping`, `deleteMapping`, `renameMapping`, `selectMapping`). **Adapters** (JSON/XML/CSV config). **Direction** (forward/reverse/both). **`autoMap`**, **`autoGenerateMappingRules`**. `defaults` management. `conformanceLevel`. Preview |
| `formspec_locale` | **NEW document type** — string CRUD across full key taxonomy: item strings (`<key>.label`, `<key>.hint`, `<key>.description`, `<key>.options.<value>.label`), context variants (`<key>.label` with context name `short`/`pdf`/`csv`/`accessibility`), form strings (`$form.title`, `$form.description`), shape messages (`$shape.<id>.message`), page strings (`$page.<pageId>.title`, `$page.<pageId>.description`), option set strings (`$optionSet.<name>.<value>.label`), component strings (`$component.<nodeId>.<prop>`), validation messages (`<key>.errors.<code>`, `<key>.constraintMessage`). Fallback cascade management (`fallback` property). FEL `{{expression}}` interpolation validation. `locale()` and `pluralCategory()` FEL function support. `locale()` returns the current BCP 47 locale string (non-deterministic context function, like `now()`). `pluralCategory(n)` returns the CLDR plural category (`"one"`, `"few"`, `"many"`, `"other"`) for the current locale (already implemented in `fel-core`). Both to be added to normative S3.5 catalog as context functions. The previously proposed `plural(count, singular, plural)` is **dropped** — it only handles two-form languages (English), while CLDR defines 6 categories. `pluralCategory()` + locale string maps is more general |
| `formspec_ontology` | **NEW document type** — concept bindings (FHIR, schema.org, ICD-10), vocabulary bindings (with `valueMap` code normalization, `filter` object: `ancestor`/`maxDepth`/`include`/`exclude`), alignments (SKOS semantics: exact, broader, narrower, related, close), JSON-LD `@context` fragments, `defaultSystem`, `publisher`/`published` metadata |
| `formspec_reference` | **NEW document type** — bound reference CRUD with all properties: `target` path, `type`, `audience` (human/agent/both), `uri`/`content`, `rel` (authorizes, constrains, defines, exemplifies, supersedes, etc.), `priority` (primary/supplementary/background), `selector`, `mediaType`, `language` (BCP 47), `tags`. `referenceDefs` for DRY reuse with `$ref` pointers and property overrides. Reference types: documentation, regulation, policy, glossary, schema, vector-store, knowledge-base, retrieval, tool, api, context. URI schemes: `vectorstore:`, `kb:`, `formspec-fn:` |
| `formspec_migration` | **NEW** — migration rule CRUD, transform types (`preserve`, `drop`, `expression`), defaults for new fields |
| `formspec_composition` | **NEW** — `$ref` management on groups: add/remove `$ref` declarations, set `keyPrefix`, preview assembled (resolved) definition, validate `$ref` targets |
| `formspec_changelog` | **NEW** — changelog document CRUD (`$formspecChangelog`), `diffFromBaseline(fromVersion)`, structured change objects, impact classification, migration hint generation |
| `formspec_response` | **NEW** — test response management: create/view/manage Response documents for testing, inject external validation results (S5.7), clear external validation, query MIP states (`valid()`, `relevant()`, `readonly()`, `required()` per S3.5.8) |
| `formspec_publish` | **Expanded** — version lifecycle enforcement (status transitions per S6.3, `versionAlgorithm`, semver validation), `$ref` assembly (S6.6.2), sidecar document version bumps (`targetDefinition.compatibleVersions`) |
| `formspec_audit` | **Expanded** — readiness check for status transitions, conformance validation, full lint (including lint passes for locale, ontology, references documents), cross-document consistency checking (definition <-> theme <-> component <-> locale <-> ontology <-> references), accessibility audit (Tier 1 `presentation.accessibility`, Tier 2 `PresentationBlock.accessibility`, Tier 3 `AccessibilityBlock`) |
| `formspec_changeset_*` | Changeset management (open, close, list, accept, reject) — see Section 2 |

**Spec/schema inconsistencies noted and resolved:**
- `requiredMessage` appears in S2.4 Phase 3 prose but is absent from the Bind schema (`additionalProperties: false` actively rejects it). **Resolution: remove from prose.** Required is not a custom constraint — the message is always the same check ("this field is required"). Required validation messages come from locale (`<key>.errors.REQUIRED`) or are processor-generated. `constraintMessage` exists for custom constraint expressions where per-field messages are needed; required does not warrant a parallel property.
- Route `message` is in the definition schema but omitted from S4.7.1 prose. Route `extensions` is also in schema but omitted from S4.7.1. **Resolution: update S4.7.1 prose** to include both properties. Schema takes precedence for authoring tools.
- `formPresentation.direction` (`ltr`/`rtl`/`auto`) is defined in the definition schema (line 379) but NOT listed in S4.1.1 spec prose. The architecture doc previously excluded it from tools saying "not a spec property." **Resolution: update S4.1.1 prose** to include `direction`. It IS in the schema (`additionalProperties: false` confirms it was intentionally added). Add back to `formspec_update` tool coverage.

### Tool Annotations

- **Read-only tools** get `{ readOnlyHint: true }` so AI clients know they're safe without a changeset: `formspec_describe`, `formspec_search`, `formspec_trace`, `formspec_preview`, `formspec_fel` (query modes), `formspec_guide`, `formspec_audit`, `formspec_changeset_list`, `formspec_list`, `formspec_load`, `formspec_open`
- **Destructive tools** get `{ destructiveHint: true }`: `formspec_edit` (delete mode), `formspec_structure` (batch delete), `formspec_changeset_reject`

### Tool Naming Convention

All tools use the `formspec_` prefix. Domain-specific tools use a single noun. Changeset tools use `formspec_changeset_` prefix.

---

## 4. Chat Integration in Studio

### Two Entry Points, One Workspace

The studio has two modes that are the same workspace at different stages.

#### Chat-First Mode (new users, blank state)

When there's no form yet, the chat panel takes center stage.

1. User opens studio -> chat panel prominently displayed, canvas hidden or minimized
2. AI interviews: "What kind of form? Who fills it out? What data do you need?"
3. AI scaffolds a definition via MCP tools -> the form appears on the canvas
4. Workspace transitions: canvas expands, chat panel slides to the side
5. The scaffold is delivered as a **changeset** — user can review, accept/reject sections, or accept all and start editing

Scaffolding is not a special code path. It's the AI's first changeset — a large one that creates the whole form. Same review mechanics, same accept/reject, same undo.

#### Canvas-First Mode (experienced users)

User starts with the canvas (new blank form or existing project). Chat panel is available but collapsed or secondary. User builds manually, uses chat when they want AI help.

#### Visual Emphasis Transitions

| State | Canvas | Chat Panel |
|-------|--------|-----------|
| No form exists | Hidden/minimal | Full width, interview mode |
| AI scaffolding | Appears, grows as form builds | Shows progress, changeset review |
| Form exists | Primary, full editing | Side panel, AI assistant |

The transition is seamless — no mode switch, just shifting emphasis.

### Interaction Surfaces

#### Chat Panel (persistent side panel)

Alongside the canvas, like Copilot in VS Code.

**Shows:**
- Conversation history (user messages + AI responses)
- Active changeset progress — as the AI calls tools, each operation appears in real-time with its summary
- Changeset review UI — dependency-grouped operations with accept/reject controls
- Diagnostics — if the AI's changes produce warnings, they appear inline

**User can:**
- Type natural language instructions ("add email validation to the contact fields")
- Ask questions without triggering edits ("what fields reference the budget variable?") — read-only tools, no changeset
- Review and accept/reject AI changesets

#### Inline Canvas Actions (context menu)

Right-click a field or select multiple items on the canvas -> AI-powered actions in the context menu alongside existing operations.

**Examples:**
- Right-click a field -> "Add validation...", "Make conditional...", "Add help text..."
- Select 3 fields -> "Group these", "Add shared validation"
- Right-click a group -> "Generate sample fields", "Add repeat logic"

Each inline action composes a prompt from the canvas context (selected items, their properties, surrounding structure) and sends it to the AI adapter. The AI opens a changeset, does its work, user reviews in the chat panel.

### formspec-chat Package Changes

`ChatSession` becomes thinner. The connection uses an extended `ToolContext` (the existing abstraction, plus read access) rather than `MCP Client` directly, so ChatSession doesn't depend on the MCP SDK:

```typescript
// Today (bridge is created internally by replaceBridge(), not injected via constructor)
const session = new ChatSession({ adapter });
await session.scaffold(requirements);  // internally creates McpBridge + Project

// After
const session = new ChatSession({ adapter });
session.setToolContext(toolContext);    // ToolContext connected to host's MCP server
```

`ToolContext` is extended with project read access so ChatSession can inspect state without wasteful `formspec_describe` round-trips:

```typescript
// Extended ToolContext (addition to existing interface)
interface ToolContext {
  tools: ToolDefinition[];
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  // NEW: read access for system prompt construction and state inspection
  getProjectSnapshot(): ProjectBundle | null;  // null = no project yet (interview phase)
}
```

**Keeps:** Conversation history, system prompts, AI adapter management, interview phase logic, `generateScaffold()` via adapter
**Loses:** `McpBridge` ownership, `Project` ownership
**Gains:** Accepts a `ToolContext` connection from the host with read access

#### Scaffold: Two Complementary Strategies

`generateScaffold()` and MCP tools serve different purposes and both are retained:

- **`AIAdapter.generateScaffold()`** — returns a complete `FormDefinition` as JSON. Best for initial creation: AI models are better at producing coherent JSON in one shot than executing 50 sequential operations with intermediate state changes. The scaffold result is loaded into the Project as the first changeset — same review mechanics apply.
- **MCP tools** — best for refinement: incremental, granular changes where tool-level semantics matter. The AI sees the current state, makes targeted modifications, user reviews.

The scaffold-to-changeset bridge: `generateScaffold()` produces a `FormDefinition`, which is loaded via `project.setDefinition()` (or equivalent batch operation). The middleware records this as a single large `ChangeEntry` in the changeset. The user reviews the whole scaffold as one dependency group.

MCP tools are the universal refinement surface. `generateScaffold()` is the optimized fast-path for initial creation. Both produce changesets. This is a "both/and" — scaffold for creation, MCP for editing.

#### ChatSession States

```
INTERVIEW    -> no Project yet, pure conversation, AI gathering requirements
SCAFFOLDING  -> AI generating initial form (via generateScaffold() or MCP tools, first changeset)
REFINING     -> form exists, AI assists with edits (subsequent changesets via MCP tools)
```

The transition from INTERVIEW -> SCAFFOLDING happens when the AI decides it has enough context. For scaffold: the adapter calls `generateScaffold()`, the host loads the result as a changeset. For MCP-driven creation: the AI calls `formspec_create` (which initializes the Project in the host), opens a changeset, and builds piece by piece. Both paths produce a changeset for review.

#### Bootstrapping Sequence

When no Project exists yet (chat-first mode), the MCP infrastructure needs special handling. The lazy creation approach is simplest: the MCP server starts with all tools registered but returns "no project" errors for non-create tools until a project exists. This mirrors the existing `ProjectRegistry` dual-phase pattern — `formspec_create` transitions the registry from bootstrap to authoring phase.

### State Flow

```
Studio
+-- Project (single instance, source of truth)
|     +-- CommandPipeline (with recording middleware, actor-tagged)
+-- ProposalManager (controls middleware, orchestrates WASM dependency analysis, merge/reject)
+-- MCP Server (full tool coverage, brackets tool calls with beginEntry/endEntry)
|     +-- InMemoryTransport -> MCP Client A (for ChatSession)
|     +-- InMemoryTransport -> MCP Client B (for inline actions)
+-- ChatSession (conversation state, AI adapter, extended ToolContext connection)
+-- Canvas (renders project.state, calls project.* for user actions — NEVER blocked)
+-- Chat Panel (renders conversation + changeset merge review UI)
```

- User clicks on canvas -> `project.addField()` directly. If a changeset is open, recorded to `userOverlay`. If no changeset, immediate and final.
- AI instruction from chat -> changeset opens -> MCP tools (recorded to `aiEntries`) -> changeset closes -> merge review UI. User can edit canvas throughout.
- Inline canvas AI action -> same as chat, just with a pre-composed prompt

---

## 5. Migration Execution Strategy

The migration review identified 32 items (E1-E3, C1-C11, S1-S18) across 12 categories. Combined with MCP full coverage, the rule is: **each migration ships with its MCP tool in the same pass**.

### Phase 1: Foundation — Engine + Core (E1-E3, C1-C11)

Push spec-level logic and structural queries down the stack. No MCP tools yet — these are prerequisites.

| Pass | Items | What it unblocks |
|------|-------|-----------------|
| 1a | E1-E3 | FEL identifiers, type predicates, function catalog -> engine exports predicates instead of studio hardcoding |
| 1b | C1, C8 | Bind normalization, field path flattening -> eliminates duplication, unblocks studio-core queries |
| 1c | C5-C7 | Drop targets, tree flattening, selection ops -> unblocks DnD reuse, batch operations |
| 1d | C2-C4, C9-C11 | Shapes, option sets, pages, search, serialization -> completes the core query layer |

### Phase 2: Studio-Core + MCP Tools (S1-S18) + Theme/Component Coverage

Each studio-core addition ships with its MCP tool. Theme and component full coverage runs in parallel — they depend on Phase 1 core operations, not on new document types.

| Pass | Items | MCP tools added |
|------|-------|----------------|
| 2a | S1-S5 | Catalogs, type metadata, widget compatibility -> `formspec_widget` |
| 2b | S6-S8 | FEL editing, humanization, function catalog display -> expand `formspec_fel` |
| 2c | S9-S13 | Parsing, defaults, sanitization, placement, widget mapping -> expand `formspec_update`, `formspec_structure` |
| 2d | S14-S16 | Document normalization, sample data, engine seeding -> `formspec_preview` expansion |
| 2e | S17-S18 | Item classification, bind behavior enumeration -> `formspec_audit` expansion |
| 2f | Theme full coverage (breakpoints, platform, responsive) | Expand `formspec_theme` |
| 2g | Component full coverage (when, custom components, tokens, responsive, id) | Expand `formspec_component` |

### Phase 3: New Document Types + Remaining Tools

| Pass | What | MCP tools added |
|------|------|----------------|
| 3a | Locale document support in studio-core | `formspec_locale` |
| 3b | Ontology document support in studio-core | `formspec_ontology` |
| 3c | References document support in studio-core | `formspec_reference` |
| 3d | Migration rule support in studio-core | `formspec_migration` |
| 3e | Mapping full coverage (multi-mapping, adapters, direction, autoMap) | Expand `formspec_mapping` |
| 3f | Bind fine-grained properties (default, whitespace, excludedValue, disabledDisplay) | Expand `formspec_behavior` / `formspec_update` |
| 3g | Shape composition (and/or/not/xone), updateValidation | Expand `formspec_behavior` |
| 3h | Version lifecycle, publish expansion, sidecar version coordination | Expand `formspec_publish` |
| 3i | `$ref` composition management | `formspec_composition` |
| 3j | Changelog document support | `formspec_changelog` |
| 3k | Response/validation management, external validation injection | `formspec_response` |
| 3l | Cross-document consistency checking, accessibility audit | Expand `formspec_audit` |

### Phase 4: ProposalManager + Chat Integration (Parallel Tracks)

Phase 4 splits into two independent tracks that converge at the review UI.

**Track A: ProposalManager** (can start as soon as core middleware infrastructure is in Phase 1)

| Pass | What |
|------|------|
| 4a-A | `ChangesetRecorderControl` + `createChangesetMiddleware()` in formspec-core |
| 4a-B | `IProjectCore.restoreState()` addition (must invalidate `_cachedComponent` and handle `generatedComponent` reconciliation) |
| 4a-C | `ProposalManager` in studio-core (changeset lifecycle, actor-tagged recording, snapshot-and-replay with user overlay) |
| 4a-D | Rust dependency analysis crate (FEL expression scanning via `fel-core`, reference edge extraction, connected component grouping) + WASM bridge |
| 4a-E | `formspec_changeset_*` MCP tools |

**Track B: Chat Integration** (can start after Phase 2 — needs MCP coverage, not ProposalManager)

| Pass | What |
|------|------|
| 4b-A | `ChatSession` refactor (remove McpBridge, accept extended ToolContext with `getProjectSnapshot()`) |
| 4b-B | Adapter interface update (keep `generateScaffold()`, add scaffold-to-changeset bridge in host) |
| 4b-C | Studio chat panel + canvas layout (consolidate `main-chat.tsx` + `chat/` + `chat-v2/` into integrated panel) |
| 4b-D | Inline canvas AI actions (context menu integration) |
| 4b-E | Interview -> scaffold flow (scaffold via `generateScaffold()` loaded as changeset, or MCP tool-driven creation) |

**Convergence point:** Changeset merge review UI (4c) renders in the chat panel. This is when Track A's ProposalManager meets Track B's chat panel. Can only start when both tracks have their prerequisites done.

| Pass | What |
|------|------|
| 4c | Changeset merge review UI (dependency-grouped accept/reject in chat panel, user overlay awareness, conflict diagnostics) |

### What Gets Deleted

As logic migrates, studio originals are deleted — not preserved, not wrapped.

- `fel-editor-utils.ts`, `fel-catalog.ts`, `humanize.ts` -> deleted, replaced by studio-core imports
- `tree-helpers.ts`, `selection-helpers.ts` -> deleted, replaced by core imports
- `field-helpers.ts` -> most functions deleted, thin UI-only remnants stay (icons, colors)
- `adapters.ts` -> deleted, replaced by core import
- `preview-documents.ts` -> deleted, replaced by studio-core's `exportForPreview()`
- `McpBridge` class -> deleted entirely
- `AIAdapter.generateScaffold()` -> **retained** (optimized fast-path for initial creation), but `ChatSession.replaceBridge()` is deleted
- Duplicate `normalizeBinds` in `LogicTab.tsx` and `CommandPalette.tsx` -> deleted, replaced by core import
- `FIELD_TYPE_CATALOG` in `AddItemPalette.tsx` -> data moves to studio-core, component just renders
- Separate chat entry point (`main-chat.tsx`, `chat/`, `chat-v2/`) -> consolidated into integrated chat panel within studio shell

---

## Spec Compliance Notes

These constraints were identified by spec review and must be respected by the implementation:

### Processing Model (Core S2.4)

The spec's deferred processing model defines a four-phase cycle (Rebuild -> Recalculate -> Revalidate -> Notify) for **runtime value evaluation**. This guarantee applies to Instance data convergence, not structural authoring mutations. The changeset snapshot-and-replay strategy is a pragmatic implementation choice — after replay, the engine runs a full processing cycle which converges to correct state per S2.4. The engine handles bind processing order internally (calculate -> relevant -> required -> readonly per S2.4 Phase 2), so the ProposalManager need not reconstruct evaluation order — but it MUST replay structural operations in their original chronological order within each dependency group.

### Key Uniqueness (Core S4.2.1)

Keys must be globally unique. The ProposalManager validates this at accept/reject boundaries, not just at initial application.

### DAG Acyclicity (Core S3.6.2)

FEL dependency graphs must be acyclic. If merging a subset of changeset operations would create a cycle, the merge is blocked with diagnostics.

### Status Lifecycle (Core S6.3) and Content Immutability (Core S6.4, VP-02)

Two distinct constraints:
- **S6.3**: Status transitions are one-directional (`draft -> active -> retired`). No backward transitions for the same version.
- **S6.4/VP-02**: Active definitions' content is immutable — MUST NOT be modified.

Changesets can only target draft definitions. Enforced at two layers: ProposalManager refuses `openChangeset()` on non-draft definitions, and MCP tools refuse mutations on non-draft definitions.

### Cross-Tier References

- **Theme** selectors/overrides targeting non-existent keys: SHOULD warn, MUST NOT fail (Theme S5.4). Safe for partial accept/reject — clean up for hygiene.
- **Component** slot bindings to non-existent keys: **MUST warn**, SHOULD hide (Component S4.1). Note: MUST warn, not SHOULD.
- **Component** `when` expressions referencing non-existent keys: SHOULD warn (S8.4 — evaluates to null, component hidden). Cross-tier FEL dependency.
- **Locale** string keys referencing non-existent items: should warn, does not prevent authoring.
- **Ontology** concept bindings referencing non-existent paths: should warn.
- **References** bound to non-existent paths: should warn.
- **Mapping** rules referencing non-existent source paths: latent defect caught by `diagnose()`, not a hard error at authoring time.

### Ordered Arrays

Screener routes (Core S4.7) and theme selectors (Theme S5.3) have order-dependent semantics. All route/selector mutations within a single changeset are placed in the same dependency group to prevent partial accept from reordering them.

**Screener route deletion constraint:** `deleteRoute` cannot delete the last route (throws error). If partial accept leaves only a delete-last-route operation, replay will fail — the error recovery mechanism (Section 2) handles this by restoring to `snapshotBefore`.

### Extension Resolution

Registry loading is a runtime concern independent of changesets. `diagnose()` flags unresolvable extensions in the post-merge state. Extension properties (`x-` prefixed) are preserved on round-trip per Core S8.4. The command-level replay preserves all properties because commands are replayed verbatim — no stripping or transformation.

### Repeat Groups and Changesets

Repeat group structural operations (changing `repeatable`, modifying `minRepeat`/`maxRepeat`) trigger Rebuild (S2.4, Phase 1). If a form has runtime data with repeat instances, replaying definition changes may invalidate existing instances (e.g., reducing `maxRepeat` below current instance count). The ProposalManager must trigger a full Rebuild after replay and validate cardinality constraints against the post-replay state.

Wildcard dependencies (`$group[*].field`) in FEL expressions depend on the group structure, not a single key. The dependency tracker must recognize wildcard paths in shape targets and bind references.

### Sidecar Document Versioning

All sidecar documents (theme, component, locale, ontology, references) have `version` and `targetDefinition.compatibleVersions`. When the definition version changes (e.g., via `formspec_publish`), sidecar document versions and compatibility ranges must be updated. The `formspec_publish` tool handles this coordination.

### Non-Relevant Field Handling (Core S5.6)

Calculate binds STILL evaluate for non-relevant fields (Rule 4). If partial accept changes a field's `relevant` bind without its `calculate` bind (or vice versa), the `excludedValue` semantics change. Re-relevance applies `default` values (Rule 5: when a previously non-relevant node becomes relevant, the `default` value is applied — Critical Behavioral Rule 16). The dependency tracker treats `relevant` and `calculate`/`default` binds on the same field as interdependent when they interact.

Additionally, removing a `calculate` bind implicitly removes the field's `readonly` status (S4.3.1: "A node with a `calculate` Bind is implicitly `readonly` unless `readonly` is explicitly set to `'false'`"). The dependency tracker groups `calculate` and `readonly` binds on the same field.

The `nonRelevantBehavior` property (definition-level or per-bind) controls serialized output behavior for non-relevant fields (S4.3.1, S5.6 Rule 2). Changing `nonRelevantBehavior` without its corresponding `relevant` bind (or vice versa) alters Response serialization semantics. The dependency tracker treats `nonRelevantBehavior` and `relevant` on the same path as interdependent.

---

## Resolved Questions

These were open in v2 and are now resolved:

| # | Question | Resolution |
|---|----------|------------|
| 1 | Multiple concurrent changesets? | **No.** Single changeset at a time for v1 and likely permanently. The git merge model (user edits alongside AI changeset) removes the pressure for concurrency — the user isn't blocked, so there's no need for a second changeset. |
| 2 | Changeset expiry? | **Persist indefinitely.** Auto-reject risks data loss. If the changeset becomes stale (e.g., user returns days later), flag it in the UI — let the user decide. |
| 3 | AI self-review? | **No.** Human review is the value proposition. If the user trusts the AI, they should use direct mode (no changeset). |
| 4 | Changeset metadata for AI context? | **`formspec_changeset_list` is sufficient for v1.** No changeset query language needed. |
| 5 | Offline/disconnected chat? | **Changeset stays open.** State was already mutated for live preview. On reconnect, the changeset is still pending. No special handling beyond "don't auto-close on disconnect." |
| 6 | Dependency group granularity? | **Keep coarse for v1.** "Field + all its binds/shapes" is the right level. Finer control creates combinatorial validation complexity. |
| 7 | Blocking during review? | **No blocking.** v4 adopts the git merge model: user edits freely during review, user overlay is preserved on merge/reject. Blocking was eliminated because it forced an unnatural "reject → fix → redo" workflow when users just want to tweak one thing. |
| 8 | Registry document authoring? | **Out of scope.** Registry documents are infrastructure, not form content. |
| 9 | Submit-timing shapes? | **Skip them.** Post-merge validation is not a submission event. Per S5.2.1, `timing: "submit"` shapes are "evaluated only when submission is requested." |
| 10 | Presentation tier audit findings? | **Track separately.** This architecture is complex enough without taking on the 16 presentation tier findings. |
| 11 | `requiredMessage` spec/schema inconsistency? | **Remove from prose.** Required is not a custom constraint — messages come from locale `<key>.errors.REQUIRED` or are processor-generated. No schema change needed. |
| 12 | Route `message` + `extensions` spec/schema inconsistency? | **Update S4.7.1 prose.** Schema is authoritative — both properties were intentionally added. |
| 13 | `formPresentation.direction` spec/schema inconsistency? | **Update S4.1.1 prose + reinstate in tools.** Property IS in schema with `additionalProperties: false`. |
| 14 | `locale()` / `plural()` / `pluralCategory()` FEL functions? | **`locale()` + `pluralCategory()` → add to S3.5.** Both as context functions. Drop `plural()` — English-centric, CLDR has 6 categories. |

---

## Review History

- **2026-03-24 v1**: Initial design — 5 sections covering layer architecture, ProposalManager, MCP coverage, chat integration, migration strategy.
- **2026-03-24 v2**: Incorporated findings from spec-expert and formspec-scout reviews:
  - Fixed deferred processing guarantee misapplication (S2.4 is runtime value convergence, not structural mutation commutativity)
  - Expanded structural validation from 4 checks to 12+ (full S3.10.1 definition error suite + S5.2.2 shape circularity)
  - Added `initialValue` with `=` prefix one-time evaluation edge case
  - Added 3 missing tools: `formspec_composition`, `formspec_changelog`, `formspec_response`
  - Expanded tool property coverage: 65 gaps addressed (bind properties, field properties, FieldRule properties, Reference properties, Locale key taxonomy, Instance/OptionSet properties, Theme/Component metadata)
  - Split Status Immutability into S6.3 (transitions) and S6.4/VP-02 (content immutability)
  - Added bootstrapping sequence for INTERVIEW -> SCAFFOLDING
  - Added compliance notes for: repeat groups, sidecar versioning, non-relevant field handling, screener route constraints, cross-document consistency for new document types
  - Added 5 new open questions from review findings
- **2026-03-24 v3**: Comprehensive revision incorporating spec-expert, formspec-scout, and architectural analysis:

  **ProposalManager redesign: middleware-based recording**
  - Replaced Project-wrapping approach with command pipeline middleware. `ChangesetRecorderControl` interface + `createChangesetMiddleware()` factory in formspec-core (layer 2). ProposalManager in studio-core (layer 3) controls the middleware.
  - `ChangeEntry` now stores `commands: AnyCommand[][]` (actual pipeline commands) instead of `args: Record<string, unknown>` (MCP tool arguments). Replay is deterministic at the command level.
  - Added `IProjectCore.restoreState()` to the interface (one-line addition + notification).
  - Explicit requirement: replay must preserve chronological order within dependency groups (S2.4 covers Instance data convergence, not Definition mutation ordering).
  - Added error recovery: replay failure restores to `snapshotBefore`, returns `ReplayFailure` diagnostic. Never leaves project in partially-replayed state.

  **Dependency tracking expansion (9 new edge types)**
  - `@instance('name')` references in FEL expressions (S3.2.3, S4.4.2)
  - `@variableName` references in FEL expressions (S4.5, reverse direction)
  - Shape composition `id` references in `and`/`or`/`not`/`xone` (S5.2.2 — not FEL, separate mechanism)
  - Shape `activeWhen`, `context`, and `message` interpolation expressions (S5.2.1)
  - `default` bind expressions with `=` prefix
  - Screener route `condition` expressions (S4.7.1)
  - Mapping `condition` and `expression` fields
  - Component `when` expressions (Component S8.1 — cross-tier)
  - Summary/DataTable `bind` references (Component S6.12, S6.13 — cross-tier)
  - Order-dependent grouping: all screener route and theme selector mutations → same dependency group
  - `calculate`/`readonly` bind interaction on the same field (implicit readonly, S4.3.1)

  **Structural validation expansion (4 new checks)**
  - FEL syntax error (S3.10.1 — first listed definition error)
  - Display item constraints (S4.2.4 — no children, no dataType, only `relevant` bind)
  - Bind path resolution (S4.3.3 — path must resolve to at least one Item key)
  - Custom component cycle detection (Component S7.4) and params completeness (Component S12.2)
  - Clarified: non-relevant prohibition is runtime validation scope, not structural checks

  **MCP tool fixes**
  - Removed `formPresentation.direction` (not a spec property — RTL is theme-tier, Theme S9.3)
  - Removed `autoGeneratePages` (not in theme spec or schema)
  - Removed `requiredMessage` from `formspec_locale` (spec/schema inconsistency — appears in S2.4 Phase 3 prose but absent from Bind schema)
  - Fixed component slot binding warning level: MUST warn (Component S4.1), not SHOULD
  - Added missing read-only annotations: `formspec_list`, `formspec_load`, `formspec_open`
  - Noted route `message` as spec/schema inconsistency (in schema, not in S4.7.1 prose)

  **Chat integration refinements**
  - `session.connect(mcpClient)` → `session.setToolContext(toolContext)` — uses existing `ToolContext` abstraction, avoids MCP SDK dependency in formspec-chat
  - Added scaffold paradigm shift section — `AIAdapter.generateScaffold()` becomes obsolete, adapter API redesign is a distinct migration step
  - VP-02 enforcement at both ProposalManager and MCP tool layers (defense-in-depth)
  - `prePopulate` added to initialValue capture-at-application-time strategy

  **Migration phase restructuring**
  - Moved Theme/Component full coverage (was 3e-3f) to Phase 2 (2f-2g) — no dependency on new document types
  - Split Phase 4 into two parallel tracks: Track A (ProposalManager) and Track B (Chat integration)
  - Track B can start after Phase 2 — doesn't need ProposalManager or Phase 3 new document types
  - Added adapter API redesign as explicit migration step (4b-B)
  - Identified convergence point: changeset review UI (4c) where both tracks meet

  **Resolved all 10 open questions** with definitive positions.
- **2026-03-24 v4**: Architectural revision incorporating second-round spec-expert/formspec-scout reviews and author decisions:

  **Git merge model (replaces blocking)**
  - Eliminated `control.blocking` from `ChangesetRecorderControl`. The user is never locked out of the canvas.
  - Added `currentActor: 'ai' | 'user'` to middleware control. MCP tool brackets set `'ai'`; outside brackets defaults to `'user'`.
  - Changeset now has two recording tracks: `aiEntries` (AI's work) and `userOverlay` (user edits during review).
  - Changeset status `'accepted'` → `'merged'` to reflect merge semantics.
  - Merge operations: "merge all" (discard snapshot, state already correct), "reject all" (restore + replay user overlay), "partial merge" (restore + accepted AI groups + user overlay).
  - Conflict detection via post-replay `diagnose()` — same as git merge conflict detection. User resolves by editing.

  **Dependency analysis in Rust**
  - Dependency tracking engine moves to Rust crate, exposed via WASM. Reuses `fel-core` for FEL expression scanning.
  - ProposalManager in TypeScript becomes thin orchestrator — collects entries, calls WASM, acts on grouping result.
  - Added `compute_dependency_groups` Rust function signature.

  **Scaffold strategy: both/and**
  - `generateScaffold()` retained for initial creation (one-shot, plays to model strengths). MCP tools for refinement.
  - Scaffold result loaded as a changeset — same review mechanics. `ChatSession.replaceBridge()` deleted, but `AIAdapter.generateScaffold()` kept.

  **ToolContext extended with read access**
  - Added `getProjectSnapshot(): ProjectBundle | null` to `ToolContext` interface.
  - Solves the state read-back gap: ChatSession needs definition/bundle for system prompts without wasteful `formspec_describe` round-trips.

  **Factual corrections from formspec-scout**
  - Layer chart: added `formspec-layout` (L1) and `formspec-adapters` (L3).
  - Tool count: 28 existing tools, not ~20. Includes 6 bootstrap/lifecycle tools from `server.ts`.
  - "Chat workspace tab" → "separate chat entry point (`main-chat.tsx`)". Chat is a separate app, not a studio tab.
  - ChatSession constructor pseudocode: bridge created internally by `replaceBridge()`, not injected via constructor.
  - `restoreState()` must invalidate `_cachedComponent` and handle `generatedComponent` reconciliation.

  **Spec compliance fixes from spec-expert**
  - Added 3 missing dependency edges: `initialValue` as dependency source, migration `expression` FEL refs, Accordion `bind` references.
  - Added `nonRelevantBehavior` + `relevant` as interdependent in dependency tracker.
  - Added `dataType/component compatibility` (Component S12.3) to structural validation.
  - Moved `optionSet/options co-presence` from definition error to warning-level check (S4.2.3 defines precedence, not an error).
  - Fixed `when` expression severity: SHOULD warn (S8.4), not MUST warn.
  - Noted `locale()`/`plural()` as proposed FEL functions, not yet normative.
  - Added `now()` non-determinism and Instance URL template edge cases for replay.
  - Added `prePopulate.editable` property to dependency tracking note.

  **Design gaps identified (needs resolution before implementation)**
  - Gap 1: Undo/redo interaction with open changesets. Recommended: disable undo/redo during changeset (changeset IS the undo mechanism).
  - Gap 2: `ChangeEntry` type for user overlay — `toolName`/`summary` made optional, synthetic summaries generated from commands.
  - Gap 3: Error recovery with user overlay — layered recovery with savepoints after AI group replay.
  - Gap 4: Scaffold-to-changeset mechanics — two-tier approach: single-command load for v1, optional decomposition for future.
- **2026-03-24 v5**: Resolution round incorporating spec-expert and formspec-scout reviews with author decisions:

  **All four design gaps resolved**
  - Gap 1: Disable undo/redo during open changeset. One-line guard in studio-core `Project.undo()`/`Project.redo()`. Spec is silent on undo/redo — no constraints.
  - Gap 2: Optional `toolName`/`summary` on `ChangeEntry`. Synthetic summaries from command type + affected paths. Sentinel `'canvas'` for toolName.
  - Gap 3: Layered savepoints confirmed sound. Added two missing structural checks: Shape `id` uniqueness (S5.2.1), Variable `name` uniqueness within scope (S4.5.1).
  - Gap 4: Single `setDefinition` command via existing `loadBundle` path. S6.6.2 assembly is publish-time only.

  **Four missing dependency edges added**
  - Bind `default` with `=` prefix (same FEL expression mechanism as `initialValue`, fires on re-relevance per S5.6 Rule 5)
  - `optionSet` name reference (field → named option set in `optionSets`, S4.2.3)
  - `prePopulate.instance` reference (field → instance declaration, S4.2.3)
  - Field `children` structural parent-child (sub-questions depend on parent field, S4.2.3)

  **Two missing structural checks added**
  - Shape `id` uniqueness (S5.2.1 MUST)
  - Variable `name` uniqueness within scope (S4.5.1 MUST)
  - Clarified: `diagnose()` includes JSON Schema validation as first pass — schema-enforced `anyOf` constraints, pattern validations, etc. do not need duplication in semantic check list

  **Spec/schema inconsistencies resolved**
  - `requiredMessage`: removed from prose. Required is not a custom constraint — messages come from locale `<key>.errors.REQUIRED` or are processor-generated. `constraintMessage` serves custom constraints.
  - Route `message` + `extensions`: S4.7.1 prose to be updated to include both (schema is authoritative).
  - `formPresentation.direction`: reinstated in `formspec_update` tool coverage. IS in the definition schema with `additionalProperties: false`. S4.1.1 prose to be updated.

  **FEL function decisions**
  - `locale()` → add to S3.5 as non-deterministic context function (like `now()`). Returns BCP 47 string. Zero arguments.
  - `pluralCategory(n)` → add to S3.5 as context function. Already implemented in `fel-core`. Returns CLDR category.
  - `plural(count, singular, plural)` → **dropped** from locale spec. English-centric (only two forms). CLDR defines 6 plural categories. `pluralCategory()` + locale string maps is more general.

  **No remaining open questions.** All items are resolved or have explicit spec prose update actions.

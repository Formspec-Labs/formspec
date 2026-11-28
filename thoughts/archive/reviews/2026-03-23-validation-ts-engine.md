# PR Review Finding Validation — `new` branch

**Date:** 2026-03-23
**Branch:** `new`
**Reviewer:** Code Scout

---

### H4: `initWasm` non-exported symbol imported in MCP test setup

**Status:** Already fixed

**Current state:** `/packages/formspec-mcp/tests/setup.ts` currently reads:

```ts
import { initFormspecEngine, initFormspecEngineTools } from 'formspec-engine';
```

Both symbols are exported from the engine barrel (`src/index.ts` lines 60–62). No trace of `initWasm` in this file. The fix was either applied before the branch was cut or landed in a prior commit.

`tsc --noEmit` would have caught the original bug: `initWasm` is not exported from `formspec-engine` (it is a private implementation symbol re-exported only internally inside `wasm-bridge.ts` → `init-formspec-engine.ts`).

**Severity assessment:** Agree it was High — a build-breaking type error in test infrastructure that would have silently passed in a JS-only environment. Already resolved, no action needed.

**Fix ranking:** N/A (already fixed)
**Fix effort:** N/A
**Recommended action:** No action. Close finding.

---

### M5: No staleness gate for committed Rust `API.md` files

**Status:** Confirmed

**Current state:** The `npm run docs:check` command runs `scripts/generate-spec-artifacts.mjs --check`, which only processes entries declared in its config file (`spec-artifacts.config.json` or similar). That script has no awareness of `crates/*/docs/rustdoc-md/API.md` files. It scans spec/LLM markdown artifacts driven by the JSON config — not the Rust crate docs.

The `bundle-rustdoc-md.mjs` script is invoked by per-crate npm scripts (`docs:fel-core`, `docs:formspec-core`, etc.) and there is no reverse-check counterpart. The committed files (`crates/fel-core/docs/rustdoc-md/API.md`, etc.) can silently drift from the Rust source with no CI gate to catch it.

Compounding factor: the timestamp embedded on line 3 of every generated file (see L6 below) means a content-hash comparison would always flag these as stale even when only the timestamp changed, making a naive staleness gate tricky to implement without stripping the timestamp first.

**Severity assessment:** Agree with Medium. These files are committed for LLM context consumption. Stale files mislead agents/LLMs about the API surface. The risk is low-frequency but silent when it fires.

**Fix ranking:** 3
**Fix effort:** Small — add a check script that re-runs the bundler and diffs content (ignoring the timestamp line), wired into `npm run docs:check` or a separate `docs:check:rust` target.

**Recommended action:** Add a `docs:check:rust` script that regenerates each crate's API.md into a temp file and diffs against committed, excluding the `Generated: ...` timestamp line. Wire into CI. Alternatively (simpler): strip the timestamp from generated output so content-hash comparison works, then a standard staleness check applies.

---

### M6: `RuntimeMappingEngine.execute()` returns empty output when tools WASM isn't ready

**Status:** Partially confirmed — description is inaccurate, but a real inconsistency exists

**Current state:** `/packages/formspec-engine/src/mapping/RuntimeMappingEngine.ts` lines 131–144:

```ts
private execute(direction: MappingDirection, source: any): RuntimeMappingResult {
    if (!isWasmToolsReady()) {
        return {
            direction,
            output: {},
            appliedRules: 0,
            diagnostics: [{
                ruleIndex: -1,
                errorCode: 'COERCE_FAILURE',
                message: 'RuntimeMappingEngine requires tools WASM. ...',
            }],
        };
    }
```

The original finding says it "silently returns empty output." That is inaccurate — it does return a diagnostic with a clear message. However, the inconsistency is real: every other tools-tier function (`wasmTokenizeFEL`, `wasmAssembleDefinition`, `wasmLintDocument`, etc.) calls `wasmTools()` or `assertWasmToolsReadySync()` which **throws** an `Error`. `RuntimeMappingEngine.execute()` instead returns a structured error result, which means:

1. A caller that does not check `diagnostics` will silently process an `output: {}` as if the mapping ran successfully.
2. The asymmetry breaks the contract: all other tools-tier APIs fail loudly; this one fails softly.

The diagnostic `errorCode` is also wrong — `COERCE_FAILURE` is the wrong code for "WASM not initialized." There is no dedicated `WASM_NOT_READY` code in the mapping diagnostic enum.

**Severity assessment:** Agree with Medium, but the finding's characterization needs correction. It is not silent — it does emit a diagnostic. The real issue is the soft-failure pattern vs. the hard-throw pattern used everywhere else, and the misused error code.

**Fix ranking:** 2
**Fix effort:** Trivial — throw instead of returning, matching the pattern in `wasmTools()`. The `createMappingEngine()` factory is synchronous by design (mapping documents are constructed eagerly), so throwing from `execute()` is the correct behavior.

**Recommended action:** Replace the soft-return with a throw:

```ts
if (!isWasmToolsReady()) {
    throw new Error(
        'RuntimeMappingEngine requires tools WASM. Call await initFormspecEngineTools() after await initFormspecEngine().'
    );
}
```

This aligns `execute()` with every other tools-tier function. Any callers that currently rely on the diagnostic return will need updating (likely none in production; the test setup always initializes tools WASM).

---

### M11: Export tests weakened to `not.toBeEmpty`

**Status:** Confirmed

**Current state:** `/tests/component/tools-dashboard/export.spec.ts` lines 25, 32, 39:

```ts
await expect(page.locator('#export-result-content')).not.toBeEmpty();
```

This is the weakest possible content assertion: it only verifies that some non-empty string appeared. For JSON export with input `{"orgName":"Community Health Partners"}`, the WASM mapping engine produces a deterministic output. The same is true for CSV (a flat `orgName,Community Health Partners` row) and XML (a `<AnnualReport>...</AnnualReport>` envelope derived from `tribal-grant.mapping.json`).

The assertions do not verify:
- That JSON output is valid JSON
- That CSV output contains the expected header/value
- That XML output contains the expected root element and value
- That the mapped field name (`orgName` → `OrganizationInfo.TribeName` for XML) appears at all

A bug that produced `{}`, `""`, or a garbled transformation would pass all three tests.

**Severity assessment:** Agree with Medium. These are the only browser tests exercising the export pipeline end-to-end. Weakening them to presence-only assertions removes the regression value entirely.

**Fix ranking:** 2
**Fix effort:** Small — parse the output per-format and assert known field presence. JSON: `JSON.parse()` and check `orgName` key exists. CSV: check for the literal string `"Community Health Partners"` or the header. XML: check for `<TribeName>` or `Community Health Partners`.

**Recommended action:** Tighten each assertion to a content check against the known input/output contract. The input is controlled (`{"orgName":"Community Health Partners"}`), the mapping document is committed, and the output is deterministic. There is no excuse for `not.toBeEmpty` here.

---

### L6: `bundle-rustdoc-md.mjs` timestamp makes output non-idempotent

**Status:** Confirmed

**Current state:** `/scripts/bundle-rustdoc-md.mjs` line 70:

```js
const stamp = new Date().toISOString();
```

This is embedded in the output as the second line of every generated `API.md`:

```
Generated: 2026-03-22T12:38:04.723Z (do not edit by hand; ...)
```

Every invocation of the script produces a different file even when the Rust source is unchanged. This has two concrete consequences:

1. `git diff` always shows a change after regeneration, making it impossible to tell whether the content actually changed.
2. Any staleness check based on content hash (see M5) must strip this line to be useful.

**Severity assessment:** Agree with Low. The file is committed for LLM context and regenerated infrequently. The non-idempotency is annoying but not actively harmful today. It becomes a blocker the moment anyone tries to add a staleness gate (M5).

**Fix ranking:** 4
**Fix effort:** Trivial — remove or replace the timestamp. Options: (a) omit the timestamp entirely, (b) replace with a fixed `<!-- generated -->` marker, (c) use the git commit hash of the most-recently-touched Rust source file (deterministic per content).

**Recommended action:** Remove the timestamp line. The "do not edit by hand" instruction in the same sentence is sufficient. Removing it also unblocks the M5 staleness gate. Fix L6 first, then M5.

---

### L11: `pages-workspace.spec.ts` imports from `formspec-engine/dist` directly

**Status:** Confirmed — intentional workaround, not a naive mistake, but the comment is the tell

**Current state:** `/packages/formspec-studio/tests/e2e/playwright/pages-workspace.spec.ts` lines 10–13:

```ts
// Must match the same wasm-bridge instance formspec-core (dist) loads — avoids duplicate module graphs under Playwright.
import {
    initFormspecEngine,
    initFormspecEngineTools,
} from '../../../../formspec-engine/dist/init-formspec-engine.js';
```

This bypasses the package's public barrel (`formspec-engine`) and imports directly from the compiled dist output of a lower-layer package. This is a layer fence violation: `formspec-studio` is at layer 6, `formspec-engine` is at layer 1, and the dependency fence checker validates `package.json` dependency declarations — it does not scan import paths in test files.

The comment explains the rationale: avoiding duplicate WASM module instances when Playwright's Node.js process runs alongside the compiled dist of `formspec-core`, which also loads the engine. The intended fix is to ensure both this file and formspec-core resolve to the same module graph node, which requires importing from the same resolved path.

This is a real smell — the fact that module deduplication requires bypassing the public API is a sign that the WASM singleton architecture has a seam problem. However, the comment is accurate about the mechanism.

What it should import instead: the correct import would be `from 'formspec-engine'` (the package name), which resolves via `node_modules` in the Playwright test environment. Whether that actually avoids the duplicate module graph issue depends on how Playwright resolves modules in its Node.js test runner vs the Vite dev server — the comment suggests it does not.

**Severity assessment:** Partially agree with Low. The violation is real. The workaround has a legitimate technical motivation. The underlying cause (WASM singleton leaking across module graph instances) is the actual problem; this import path is a symptom.

**Fix ranking:** 5 (backlog — fix the root cause when the WASM init architecture is revisited, not the symptom)
**Fix effort:** The import change itself is trivial; the underlying module graph issue is medium effort.

**Recommended action:** Add a comment explaining that `from 'formspec-engine'` is intentionally avoided here and why (module graph deduplication under Playwright). The current comment already does this. Track the root cause (WASM singleton initialization shared across module graphs) as a separate architectural item. Do not mechanically change the import to `'formspec-engine'` without verifying the duplicate-instance problem is actually solved.

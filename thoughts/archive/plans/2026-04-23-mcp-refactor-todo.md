# ARCHIVED: formspec-mcp Refactoring TODO

> **Archived 2026-04-23.** All items **MCP-1–MCP-13** were delivered. For current MCP behavior and tool inventory, use `packages/formspec-mcp/README.md` and the `register*` exports under `packages/formspec-mcp/src/tools/`.

**Original date:** 2026-04-23  
**Scope:** `packages/formspec-mcp/` — expanded `src/` (create-server, node-tools, many `tools/*`), **49** tools on stdio (**43** in `createFormspecServer`), **35** test files under `tests/`.  
**Final status:** Audit complete, all items delivered. **MCP-1** split done. **MCP-6** README refresh done. **MCP-4** reference persistence via `Project.setDefinitionExtensions` / `definition.setDefinitionProperty` done.

---

## Tier 1 — High Impact (architecture + correctness)

### [MCP-1] Split `create-server.ts` (1,001-line god file) ✅ DONE

**File:** `src/create-server.ts`  
**Problem:** Registers all 43 tools inline. Mixes Zod schema definitions, tool metadata, and handler wiring. Hard to navigate — every registration looks identical at a glance.  
**Fix:** Each handler file in `src/tools/` now exports a `register*(server, registry)` function colocating Zod schemas with tool metadata and handlers. `create-server.ts` is ~95 lines of imports + calls.

### [MCP-2] Deduplicate `server.ts` + `mcpb-entry.ts` registrations ✅ DONE

**Files:** `src/server.ts` vs `src/mcpb-entry.ts`  
**Problem:** 6 tool registrations (draft, load, open, save, list, publish) and 3 schema resource registrations are copy-pasted. Schema dir resolution logic also duplicated.  
**Fix:** Extract shared function `registerNodeTools(server, registry)` and `findSchemasDir(): string`. Call from both entry points.

### [MCP-3] Consolidate error-handling boilerplate ✅ DONE

**Files:** Every file in `src/tools/` (~25 duplicated catch blocks)  
**Problem:** Every handler inlines the same `HelperError → formatToolError / else → COMMAND_FAILED` catch block. Some tools already use `wrapHelperCall`; others don't.  
**Fix:** Add `wrapProjectCall(registry, projectId, fn)` to `errors.ts` that resolves the project AND wraps errors. Refactor all inline try/catch handlers to use it. Rename `wrapQuery` → `wrapCall` and move to `errors.ts` for consistency.

### [MCP-4] Fix `reference.ts` state bypass ✅ DONE

**File:** `src/tools/reference.ts`  
**Problem:** `setReferences` directly mutated `project.core.state.definition.extensions` — bypassed undo/redo history and change tracking.  
**Fix:** `Project.setDefinitionExtensions` in studio-core wraps `definition.setDefinitionProperty`; MCP `setReferences` merges `x-formspec-references` with other definition extension keys then calls it. Regression test: undo after `add_reference` clears the binding.

### [MCP-5] Rename conflicting `handlePublish` exports ✅ DONE

**Files:** `src/tools/lifecycle.ts` vs `src/tools/publish.ts`  
**Problem:** Two functions named `handlePublish` with different signatures serve different tools.  
**Fix:** Rename `lifecycle.ts:handlePublish` → `handleExportBundle`. Keep `publish.ts:handlePublish` for the lifecycle tool.

---

## Tier 2 — Medium Impact (DX / LLMX / maintainability)

### [MCP-6] Update stale README (LLMX impact) ✅ DONE

**File:** `README.md`  
**Problem:** README claimed "27 tools" but `createFormspecServer` registers 43 tools; the stdio server adds 6 Node-only tools → **49** total.  
**Fix:** Regenerated tool sections and architecture diagram; documented 43 vs 49 split; refreshed file structure.

### [MCP-7] Move `getProjectSafe` to shared module ✅ DONE

**File:** `src/tools/structure.ts`  
**Fix:** Move to `errors.ts` as `resolveProject(registry, projectId)`.

### [MCP-8] Fix module-level mutable state in `response.ts` ✅ DONE

**File:** `src/tools/response.ts`  
**Fix:** Move test response storage onto `ProjectEntry` in the registry, or have `registry.close(id)` call `clearTestResponsesForProject(id)`.

---

## Tier 3 — Low Impact (cleanup / KISS / boy scout)

### [MCP-9] Deduplicate undo/redo handlers ✅ DONE

**Fix:** Use the exported functions from `lifecycle.ts` in `create-server.ts` wiring (via `registerLifecycleTools`).

### [MCP-10] Remove dead `handleCreate` ✅ DONE

**File:** `src/tools/lifecycle.ts`  
**Fix:** Use `handleCreate` from wiring, or delete dead export.

### [MCP-11] Eliminate double-read of schema files ✅ DONE

**File:** `src/schemas.ts`  
**Fix:** Read once, use for both validation and schema text map.

### [MCP-12] Simplify `authoringProjects()` loop ✅ DONE

**File:** `src/registry.ts`  
**Fix:** Replace with `.filter().map()` chain.

### [MCP-13] Unify `wrapQuery` with `wrapHelperCall` ✅ DONE

**File:** `src/tools/query.ts`  
**Fix:** Part of MCP-3 — unified `wrapCall`.

---

## Validation (repo check)

| ID | Claim | Result |
|----|--------|--------|
| **MCP-1** | Split `create-server.ts` | **Done.** `src/create-server.ts` ~95 lines; registrations in `register*` in `src/tools/*.ts`. |
| **MCP-4** | `reference.ts` bypasses core dispatch | **Done.** `Project.setDefinitionExtensions` + merge; undo test in `tests/reference.test.ts`. |
| **MCP-6** | README tool count / table stale | **Done.** README documents **49** tools on stdio (**43** + **6**). |

**MCP-2** spot-check: `src/node-tools.ts` provides `registerNodeTools` + `registerSchemaResources`.

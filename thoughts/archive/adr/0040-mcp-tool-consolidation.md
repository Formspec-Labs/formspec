# ADR 0040: MCP Tool Consolidation & Conversational Workflow

## Status: Superseded by ADR 0150

## Context

The formspec-mcp server exposes 65 tools to LLMs. This causes two problems:
1. **Token overhead**: 65 tool schemas consume significant context window space
2. **Chatty behavior**: LLMs default to calling one tool per atom (field, rule, etc.) instead of building complete JSON drafts

AI user testing (two blind agents given only tool names + descriptions, zero codebase context) validated the consolidation direction but identified specific usability failures in the original 23-tool proposal. This plan incorporates both MCP best-practices review and user research findings.

## Decision

Consolidate from 65 tools to 28. Add a `formspec_guide` tool for conversational intake and batch support for high-frequency authoring tools.

---

## Tool Map: 65 → 28

### New Tool
| Tool | Purpose |
|------|---------|
| `formspec_guide` | Interactive questionnaire with material-review branch |

### Bootstrap (5 → 2)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_draft` | `draft_definition` + `draft_component` + `draft_theme` | `type: 'definition' \| 'component' \| 'theme'` param |
| `formspec_load` | `validate_draft` + `load_draft` | Auto-validates first, then transitions |

### Lifecycle (8 → 7)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_create` | same | |
| `formspec_open` | same | |
| `formspec_save` | same | |
| `formspec_list` | `list` + `list_autosaved` | `include_autosaved?: boolean` param |
| `formspec_publish` | same | |
| `formspec_undo` | same | |
| `formspec_redo` | same | |

### Structure — Add (3 tools, batch-enabled)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_field` | `field` | Single item or `items[]` array |
| `formspec_content` | `content` + `submit_button` | Single item or `items[]` array. Kinds: `heading \| paragraph \| divider \| banner \| submit` |
| `formspec_group` | `group` + `repeat` | Single item or `items[]`; repeat config in props |

### Structure — Modify (2 tools)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_update` | `update` + `metadata` | Change properties on existing items or form-level metadata. `target: 'item' \| 'metadata'`. High-frequency workhorse. |
| `formspec_edit` | `remove` + `move` + `rename` + `copy` | Structural tree mutations. `action: 'remove' \| 'move' \| 'rename' \| 'copy'` |

**Rationale (user research)**: Both test agents confused `formspec_edit(update)` with `formspec_field` when changing a label. Splitting "change properties" from "restructure tree" eliminates this. `formspec_update` is non-destructive; `formspec_edit` is destructive (includes `remove`).

### Pages (2 tools)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_page` | `page` + `remove_page` + `move_page` | CRUD: `action: 'add' \| 'remove' \| 'move'` |
| `formspec_place` | `place` + `unplace` | Assignment: `action: 'place' \| 'unplace'` |

**Rationale (user research)**: "Create a page" and "put this field on that page" are different mental operations. Both agents used them correctly but noted the conceptual mismatch when merged.

### Logic (2 tools, batch-enabled)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_behavior` | `show_when` + `readonly_when` + `require` + `calculate` + `add_rule` | `action` param, batch via `items[]` |
| `formspec_flow` | `flow` + `branch` | `action: 'set_mode' \| 'branch'` |

### Presentation (1 tool)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_style` | `layout` + `style` + `style_all` | `action: 'layout' \| 'style' \| 'style_all'` |

### Data (1 tool)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_data` | 9 data tools (choices, variable×4, instance×4) | `resource: 'choices' \| 'variable' \| 'instance'` + `action: 'add' \| 'update' \| 'remove' \| 'rename'` |

### Screener (1 tool)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_screener` | 7 screener tools | `action: 'enable' \| 'add_field' \| 'remove_field' \| 'add_route' \| 'update_route' \| 'reorder_route' \| 'remove_route'` |

### Query (3 tools)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_describe` | `describe` + `audit` | `mode: 'structure' \| 'audit'` — the two "tell me about this form" modes |
| `formspec_search` | `search` | Standalone — distinct input shape (filter object) |
| `formspec_trace` | `trace` + `changelog` | `mode: 'trace' \| 'changelog'` — both answer "what depends on what / what changed" |

**Rationale (user research)**: Both agents rated `formspec_describe` with 5 modes as a "grab-bag" that hurts memorability. Splitting by mental model (introspect / find / analyze) keeps each tool focused.

### Preview (1 tool)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_preview` | `preview` + `validate_response` | `mode: 'preview' \| 'validate'` |

### FEL (1 tool)
| Tool | Replaces | Notes |
|------|----------|-------|
| `formspec_fel` | 3 FEL tools | `action: 'context' \| 'functions' \| 'check'` |

**Total: 28 tools** (down from 65, 57% reduction)

> Note: `formspec_submit_button` was split out from `formspec_content` as a separate tool during implementation — submit buttons have distinct parameters (label, page_id) vs content items (path, body, kind).

---

## Guide Tool Design

### Purpose
Steers the AI toward a conversational intake workflow before touching any authoring tools. Returns structured questions the AI walks through with the user.

### Schema
```typescript
formspec_guide({
  mode: 'new' | 'modify',
  project_id?: string,    // required for 'modify'
  context?: string,       // optional hint: "grant application form"
})
```

### Response for `mode: 'new'`

Returns a structured questionnaire with a branching first question:

```json
{
  "workflow": {
    "first_question": {
      "text": "Do you have existing materials (PDFs, Excel files, images, wireframes) that describe this form?",
      "if_yes": "Ask the user to share the materials. Review them thoroughly, then produce all three JSON artifacts (definition, component, theme) in one shot via formspec_draft.",
      "if_no": "Proceed with the questionnaire below."
    }
  },
  "questionnaire": {
    "sections": [
      {
        "title": "Purpose & Audience",
        "questions": [
          { "id": "purpose", "text": "What is this form for?", "type": "open" },
          { "id": "audience", "text": "Who fills it out?", "type": "open" }
        ]
      },
      {
        "title": "Fields & Structure",
        "questions": [
          { "id": "fields", "text": "What information do you need to collect? List the fields.", "type": "open" },
          { "id": "multi_page", "text": "Single page or multi-page?", "type": "choice",
            "options": ["Single page", "Multi-page wizard", "Tabbed sections"] },
          { "id": "repeating", "text": "Any repeating sections (e.g., 'add another item')?", "type": "boolean" },
          { "id": "groups", "text": "Should fields be grouped into sections?", "type": "boolean" }
        ]
      },
      {
        "title": "Logic & Validation",
        "questions": [
          { "id": "conditional", "text": "Fields that show/hide based on answers?", "type": "boolean" },
          { "id": "calculated", "text": "Computed values (totals, scores, derived fields)?", "type": "boolean" },
          { "id": "validation", "text": "Special validation rules beyond required fields?", "type": "open" }
        ]
      },
      {
        "title": "Advanced",
        "questions": [
          { "id": "screener", "text": "Pre-screening step before the main form?", "type": "boolean" },
          { "id": "external_data", "text": "Load data from external sources?", "type": "boolean" },
          { "id": "branding", "text": "Any styling or branding requirements?", "type": "open" }
        ]
      }
    ]
  },
  "output_instructions": {
    "artifacts": ["definition", "component", "theme"],
    "workflow": [
      "1. Build all three JSON artifacts from gathered requirements",
      "2. Submit each via formspec_draft(type, json)",
      "3. Call formspec_load to transition to authoring",
      "4. Use authoring tools for incremental refinements"
    ]
  }
}
```

### Response for `mode: 'modify'`

Includes current form summary (from `project.statistics()` + `project.fieldPaths()`) plus targeted questions:
- What do you want to change? (add fields, modify logic, restyle, restructure)
- Which section/fields are affected?

---

## Batch Semantics

Batch-enabled tools (`field`, `content`, `group`, `behavior`) accept either single-item params or an `items` array:

### Single item (backward-compatible shape)
```json
{ "project_id": "...", "path": "name", "label": "Name", "type": "string" }
```

### Batch
```json
{
  "project_id": "...",
  "items": [
    { "path": "name", "label": "Name", "type": "string" },
    { "path": "email", "label": "Email", "type": "string" }
  ]
}
```

### Error handling
Sequential processing. Response includes per-item results:
```json
{
  "results": [
    { "index": 0, "success": true, "summary": "Added field 'name'" },
    { "index": 1, "success": false, "error": { "code": "DUPLICATE_KEY", "message": "..." } }
  ],
  "succeeded": 1,
  "failed": 1
}
```
No rollback — partial success is reported. The AI can retry failed items.

---

## `formspec_update` Schema

The high-frequency property-change tool:

```typescript
formspec_update({
  project_id: string,
  target: 'item' | 'metadata',
  // For 'item': path + changes
  path?: string,        // required when target='item'
  changes: object,      // property bag: { label: 'New Label', description: '...' }
  // For 'metadata': changes only (no path)
})
```

Annotations: `NON_DESTRUCTIVE`

## `formspec_edit` Schema

Structural tree mutations:

```typescript
formspec_edit({
  project_id: string,
  action: 'remove' | 'move' | 'rename' | 'copy',
  path: string,
  // For 'move': target_path? + index?
  target_path?: string,
  index?: number,
  // For 'rename': new_key
  new_key?: string,
  // For 'copy': deep?
  deep?: boolean,
})
```

Annotations: `DESTRUCTIVE`

---

## Tool Description Requirements

User research revealed that descriptions are the primary (often only) way an LLM understands a tool. Every description MUST include:

### 1. Path format examples
Every tool that accepts a `path` param:
```
path (string): Item path in the form tree (e.g., "name", "contact.email", "items[0].amount")
```

### 2. Type enumeration
`formspec_field`:
```
type (string): Data type — "string", "number", "boolean", "date", "integer", "object", "array"
```

### 3. Lifecycle context
`formspec_create` description must include:
```
Creates a new project in bootstrap phase. To start authoring:
- If you have pre-built JSON: submit via formspec_draft, then call formspec_load
- If starting from scratch: call formspec_load immediately to enter authoring phase
```

### 4. Disambiguation cross-references
- `formspec_field`: "Adds NEW fields to the form. To modify an existing field's properties, use formspec_update."
- `formspec_update`: "Modifies properties on EXISTING items. To add new items, use formspec_field, formspec_content, or formspec_group."
- `formspec_behavior(calculate)`: "Binds a computed value directly to a specific field."
- `formspec_data(variable)`: "Defines a reusable named value referenced in FEL expressions across multiple fields."

### 5. Resource/kind examples
- `formspec_content` kinds: `heading | paragraph | divider | banner | submit`
- `formspec_data(instance)`: "External data sources (e.g., API endpoint, static JSON lookup table) that fields can reference for dynamic choices via choicesFrom."

### 6. Destructive action warnings
Tools with destructive sub-actions: "Actions 'remove' is destructive. Use formspec_undo to reverse."

---

## Annotations Strategy

| Tool | Annotation | Rationale |
|------|-----------|-----------|
| `formspec_guide` | READ_ONLY | Returns questionnaire, no mutations |
| `formspec_draft` | NON_DESTRUCTIVE | Stores JSON, doesn't delete |
| `formspec_load` | NON_DESTRUCTIVE | Phase transition, not deletion |
| `formspec_create` | NON_DESTRUCTIVE | Creates new project |
| `formspec_open` | FILESYSTEM_IO | Reads from disk |
| `formspec_save` | FILESYSTEM_IO | Writes to disk |
| `formspec_list` | READ_ONLY | Pure query |
| `formspec_publish` | FILESYSTEM_IO | Exports bundle |
| `formspec_undo` | NON_DESTRUCTIVE | Reverses last op |
| `formspec_redo` | NON_DESTRUCTIVE | Re-applies last undo |
| `formspec_field` | NON_DESTRUCTIVE | Adds items |
| `formspec_content` | NON_DESTRUCTIVE | Adds items |
| `formspec_group` | NON_DESTRUCTIVE | Adds items |
| `formspec_update` | NON_DESTRUCTIVE | Changes properties |
| `formspec_edit` | DESTRUCTIVE | Includes `remove` |
| `formspec_page` | DESTRUCTIVE | Includes `remove` |
| `formspec_place` | NON_DESTRUCTIVE | Assignment only (unplace removes from page, not deletion) |
| `formspec_behavior` | NON_DESTRUCTIVE | Sets logic |
| `formspec_flow` | NON_DESTRUCTIVE | Sets navigation |
| `formspec_style` | NON_DESTRUCTIVE | Sets presentation |
| `formspec_data` | DESTRUCTIVE | Includes `remove` |
| `formspec_screener` | DESTRUCTIVE | Includes `remove_field`, `remove_route` |
| `formspec_describe` | READ_ONLY | Pure introspection |
| `formspec_search` | READ_ONLY | Pure query |
| `formspec_trace` | READ_ONLY | Pure query |
| `formspec_preview` | READ_ONLY | Generates preview / validates response |
| `formspec_fel` | READ_ONLY | Expression utilities |

---

## Output Schemas

Define `outputSchema` for structured responses:

### Batch response (field, content, group, behavior)
```typescript
z.object({
  results: z.array(z.object({
    index: z.number(),
    success: z.boolean(),
    summary: z.string().optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      detail: z.record(z.unknown()).optional(),
    }).optional(),
  })),
  succeeded: z.number(),
  failed: z.number(),
})
```

### Guide response
```typescript
z.object({
  workflow: z.object({ first_question: z.object({ text: z.string(), if_yes: z.string(), if_no: z.string() }) }),
  questionnaire: z.object({ sections: z.array(...) }),
  output_instructions: z.object({ artifacts: z.array(z.string()), workflow: z.array(z.string()) }),
})
```

### Describe/audit response
```typescript
// mode: 'structure'
z.object({ path: z.string().optional(), summary: z.string(), items: z.array(...) })
// mode: 'audit'
z.object({ errors: z.number(), warnings: z.number(), info: z.number(), diagnostics: z.array(...) })
```

---

## Files to Create/Modify

### New files
- `packages/formspec-mcp/src/tools/guide.ts` — Guide tool handler
- `packages/formspec-mcp/src/batch.ts` — Batch processing utility

### Rewrite (delete and rebuild)
- `packages/formspec-mcp/src/server.ts` — 27 tool registrations with revised descriptions
- `packages/formspec-mcp/src/tools/bootstrap.ts` — Merge 3 draft → 1, merge validate+load → 1
- `packages/formspec-mcp/src/tools/structure.ts` — Batch support, split into update + edit
- `packages/formspec-mcp/src/tools/behavior.ts` — Merge 5 → 1 with action param + batch
- `packages/formspec-mcp/src/tools/data.ts` — Merge 9 → 1 with resource+action params
- `packages/formspec-mcp/src/tools/screener.ts` — Merge 7 → 1 with action param
- `packages/formspec-mcp/src/tools/flow.ts` — Merge flow + branch
- `packages/formspec-mcp/src/tools/presentation.ts` → rename to `style.ts`, merge 3 → 1
- `packages/formspec-mcp/src/tools/query.ts` — Split into describe + search + trace
- `packages/formspec-mcp/src/tools/fel.ts` — Merge 3 → 1

### Keep as-is
- `packages/formspec-mcp/src/registry.ts` — No changes
- `packages/formspec-mcp/src/schemas.ts` — No changes
- `packages/formspec-mcp/src/errors.ts` — Add batch error formatting
- `packages/formspec-mcp/src/annotations.ts` — No changes

### Tests (rewrite to match new tool shapes)
- `packages/formspec-mcp/tests/bootstrap.test.ts`
- `packages/formspec-mcp/tests/structure.test.ts`
- `packages/formspec-mcp/tests/behavior.test.ts`
- `packages/formspec-mcp/tests/query.test.ts`
- `packages/formspec-mcp/tests/lifecycle.test.ts`
- `packages/formspec-mcp/tests/registry.test.ts` (probably unchanged)
- NEW: `packages/formspec-mcp/tests/guide.test.ts`
- NEW: `packages/formspec-mcp/tests/batch.test.ts`

---

## Implementation Order

1. **Batch infrastructure** — Cross-cutting utility needed by everything else. Write `batch.ts` + tests.
2. **Guide tool** — New file, no dependencies. Write `guide.ts` + tests.
3. **Bootstrap consolidation** — Merge 3 drafts → 1, merge validate+load → 1. Update `bootstrap.ts` + tests.
4. **Structure add tools** — Add batch to field/content/group. Update `structure.ts` + tests.
5. **Structure modify tools** — Create `formspec_update` + `formspec_edit`. Update tests.
6. **Page + Place** — Split into two tools. Update tests.
7. **Behavior consolidation** — Merge 5 → 1 with action param + batch. Update tests.
8. **Data consolidation** — Merge 9 → 1 with resource+action params. Update tests.
9. **Screener consolidation** — Merge 7 → 1 with action param. Update tests.
10. **Query splits** — describe (structure+audit), search, trace (trace+changelog). Update tests.
11. **Remaining merges** — flow, style, FEL, preview. Update tests.
12. **Server rewrite** — 27 tool registrations with revised descriptions and output schemas.
13. **Integration test** — End-to-end: guide → create → draft → load → batch field adds → behavior → preview.

---

## Verification

### Unit tests
```bash
cd packages/formspec-mcp && npx vitest run
```

### Manual MCP test
1. Start the MCP server
2. Call `formspec_guide({ mode: 'new' })` — verify questionnaire returned
3. Call `formspec_create()` → get project_id
4. Call `formspec_draft({ project_id, type: 'definition', json: {...} })` — verify schema validation
5. Call `formspec_draft({ project_id, type: 'component', json: {...} })`
6. Call `formspec_draft({ project_id, type: 'theme', json: {...} })`
7. Call `formspec_load({ project_id })` — verify transition to authoring
8. Call `formspec_field({ project_id, items: [...] })` — verify batch add
9. Call `formspec_update({ project_id, target: 'item', path: 'name', changes: { label: 'Full Name' } })` — verify property change
10. Call `formspec_edit({ project_id, action: 'remove', path: 'temp_field' })` — verify destructive action
11. Call `formspec_behavior({ project_id, action: 'require', target: 'name' })` — verify merged tool
12. Call `formspec_describe({ project_id, mode: 'audit' })` — verify merged query tool
13. Call `formspec_search({ project_id, filter: { type: 'field' } })` — verify standalone search

---

## User Research Findings (Appendix)

Two blind AI agents were given only tool names + descriptions with zero codebase context.

### What worked
- Both correctly reconstructed new-form workflow: guide → create → field (batch) → save
- Both correctly used `formspec_behavior(show_when)` for conditional field logic (not `formspec_flow`)
- Both correctly used `formspec_describe(audit)` as debugging entry point
- Batch semantics immediately understood
- FEL tool understood as developer utility

### What failed
- **`path` format**: Neither agent knew the syntax. Critical gap.
- **`type` values**: Both guessed. No enumeration available.
- **Bootstrap lifecycle**: Neither understood when draft/load is required vs optional.
- **`formspec_field` vs `formspec_edit(update)`**: Both confused about which modifies existing items.
- **`formspec_content` + submit button**: Both flagged category violation.
- **`formspec_data(instance)`**: Completely opaque. Zero understanding.
- **`formspec_describe` (5 modes)**: Both called it a "grab-bag" hurting memorability.
- **`formspec_behavior(calculate)` vs `formspec_data(variable)`**: Overlap confusion.

### Usability scores (agent 2, 1-10)
- Discoverability: 6/10
- Learnability: 5/10
- Memorability: 6/10

### Key quote
> "If the description for formspec_create said 'If starting from scratch, call formspec_load immediately after create to enter authoring phase,' I'd understand the entire lifecycle from a single tool description."

# Formspec Assist — Swarm Review Remediation Spec

**Date:** 2026-03-27
**Status:** Draft
**Scope:** `specs/assist/assist-spec.md` + `packages/formspec-assist/`
**Origin:** Swarm review by 4 spec-experts + 2 formspec-scouts

---

## Summary

Six specialist agents independently reviewed the Formspec Assist Specification (1.0.0-draft.1) and its reference implementation. This document captures all 42 findings and their recommended fixes, organized into four categories: spec normative fixes, implementation code fixes, test coverage expansion, and editorial improvements.

Architecture is clean — dependency fences, layer placement, engine API surface, and WebMCP polyfill are all correct. The problems are in spec-compliance details and test coverage.

---

## 1. Spec Normative Fixes

Changes to `specs/assist/assist-spec.md`.

### S-1. Define "filled" normatively

**Finding:** The term "filled" appears in `FieldSummary.filled`, `FormProgress.filled`, and `ProfileApplyResult.filled` but has no normative definition. Two providers could disagree on whether `false` or `0` is filled, breaking `FormProgress` interop.

**Fix:** Add to §4.4 after the `FormProgress` interface:

> A field is **filled** if its current value is not empty. A value is "empty" if it is `null`, `undefined` in host languages that distinguish it, an empty string `""`, or an empty array `[]`. This definition extends the core specification's `empty()` function (core §3.5.5) to additionally cover `undefined` for host languages that distinguish it. It is otherwise consistent with `required` bind semantics (core §2.1.4).

**Rationale:** Anchors to the core spec's existing `empty()` definition, extending it with `undefined` for TypeScript/JavaScript host environments. The implementation already uses this exact logic.

### S-2. Define "valid" normatively

**Finding:** `FieldSummary.valid`, `FormProgress.valid`, and `FieldDescription.valid` have no normative definition. Consumers need to know whether warnings affect validity.

**Fix:** Add to §4.4 after the `FieldSummary` interface:

> A field is **valid** if it has no validation results with severity `"error"` for its path. Warning-level and info-level results do not affect field validity. This is the field-scoped application of the core specification's validity rule (core §5.1, "A Response is valid if and only if zero validation results with severity `error` exist").

**Rationale:** Cross-references core spec §5.1 validity rule rather than duplicating. Implementation already matches.

### S-3. Add `"complete"` to `NextIncompleteResult.reason`

**Finding:** `reason` is required (not optional) in `NextIncompleteResult`, but the implementation returns `{ label: 'Complete' }` without a reason when the form is done. This is a spec violation.

**Fix:** Change §4.4 `NextIncompleteResult`:

```typescript
interface NextIncompleteResult {
  path?: string;
  pageId?: string;
  label: string;
  reason: "empty" | "invalid" | "required" | "complete";
}
```

**Rationale:** Adding `"complete"` is more informative than making `reason` optional. Consumers can branch cleanly on `reason === 'complete'`. Follows Formspec's "structured data over implied meaning" principle.

### S-4. Define multiple ontology document resolution order

**Finding:** The spec mentions "an active Ontology Document" (singular) but the implementation accepts arrays. When two documents bind different concepts to the same field, the resolution order is undefined.

**Fix:** Add to §5.3 after step 1:

> When multiple Ontology Documents are loaded, a provider MUST resolve concept bindings using the last-loaded document's binding for a given path. The load order is the array order in which documents were provided to the provider. This pins the Ontology Specification's implementation-defined load order (ontology §8.2) to the concrete array order of the Assist API.

**Rationale:** The ontology spec leaves load order "implementation-defined." The assist spec pins it to array order, which is the only sensible interpretation for an API that accepts an ordered array. This gives consumers a deterministic, predictable resolution order.

### S-5. Clarify `field.set` value omission

**Finding:** Spec input is `{ path: string, value: unknown }`. Implementation's input schema marks only `path` as required. Omitting `value` silently clears the field.

**Fix:** Add to §3.3 `formspec.field.set` notes:

> The `value` property MAY be omitted. An omitted `value` is treated as `null` and clears the field. Providers MUST treat `undefined` (from omission) identically to `null` for the purpose of setting field values.

**Rationale:** Forcing explicit `null` for field clearing is unnecessary ceremony. The spec documents the leniency so providers behave consistently. JSON has no `undefined`, so this only matters for in-process transports.

### S-6. Define `widget` in FieldDescription

**Finding:** `widget?: string` is in the spec's `FieldDescription` but never defined. The implementation omits it entirely.

**Fix:** Add clarifying prose to §4.4 after the `FieldDescription` interface:

> `widget` — the `presentation.widgetHint` value from the field's Definition item, if present. This is advisory and reflects the form author's intended control type, not the resolved component-tree widget.

**Rationale:** `widgetHint` is the lowest-common-denominator source that all providers can supply without component-tree resolution.

### S-7. Clarify wildcard ancestors in reference resolution

**Finding:** A reference targeting `items[*]` (a repeat group with wildcard) doesn't match when resolving help for `items[0].field`, because `buildTargetCandidates` only produces full-path wildcards, not wildcard ancestors.

**Fix:** Replace §5.2 step 2 with:

> Determine the field path and its ancestor paths by splitting the path on `.` and taking progressively shorter prefixes. For path `organization.details.ein`, the ancestors are `organization.details` and `organization`. When the path contains repeat indices (e.g., `items[0].field`), ancestor candidates MUST include both the index-stripped form (`items`) and the wildcard form (`items[*]`) for each ancestor segment.

And add to step 3:

> Wildcard ancestor paths (e.g., `items[*]`) are valid candidates and MUST be included when building the candidate set for indexed paths.

**Rationale:** The references spec (references §4.2, `target` property examples) explicitly supports `[*]` notation in target paths. Without wildcard ancestors, a reference targeting `items[*]` silently fails to match for any field inside a repeat instance.

### S-8. Define ProfileApplyResult.skipped reason vocabulary

**Finding:** Implementation uses both error codes and ad-hoc strings (`DECLINED`) as skip reasons. Consumers cannot programmatically branch without string-matching undocumented values.

**Fix:** Add to §4.4 after `ProfileApplyResult`:

> The `reason` field in skipped entries SHOULD use one of the following standard values:
>
> | Value | Meaning |
> |---|---|
> | `NOT_FOUND` | The target path does not exist in the form. |
> | `READONLY` | The target field is readonly. |
> | `NOT_RELEVANT` | The target field is currently not relevant. |
> | `INVALID_VALUE` | The value was rejected by the engine. |
> | `DECLINED` | The user declined the mutation during confirmation. |
>
> Providers MAY use additional `x-`-prefixed reason strings. Consumers MUST treat unrecognized reason strings as generic skips.

**Rationale:** Follows the same pattern as the `ToolError.code` enum with `x-`-prefixed extensions.

### S-9. Document x- error codes

**Finding:** The implementation uses `x-confirmation-required` and `x-invalid-sidecar` but the spec doesn't mention them. While `x-`-prefixed codes are permitted by §4.2, documenting common ones aids interop.

**Fix:** Add to §4.2 after the error code list:

> The following `x-`-prefixed error codes are RECOMMENDED for common provider conditions:
>
> | Code | Meaning |
> |---|---|
> | `x-confirmation-required` | A mutation requiring `confirm: true` was requested but no confirmation mechanism is available. |
> | `x-invalid-sidecar` | A loaded References or Ontology document has a structural error or its `targetDefinition` does not match the active form. |

### S-10. Clarify `confirm: true` behavior

**Finding:** §3.5 `profile.apply` has `confirm?: boolean` but the spec doesn't define what happens when confirmation is requested but no mechanism exists.

**Fix:** Add to §3.5 `formspec.profile.apply` notes:

> When `confirm` is `true` and the provider has no confirmation mechanism, the provider MUST return an error with code `x-confirmation-required`. The provider MUST NOT silently apply values without confirmation when confirmation was explicitly requested.

### S-11. Clarify multiple references document merge

**Finding:** §5.2 step 1 says "Load every active References Document" (plural) but doesn't define how entries from different documents are merged or ordered.

**Fix:** Add to §5.2 step 1:

> When multiple References Documents target the active Definition, a provider MUST process all documents. Entries from all documents are collected into a single candidate set for target matching and audience filtering. The document-order position of each entry (its position within its source document, with earlier documents preceding later ones) is used as the secondary sort key within priority tiers during the step 8 sort.

### S-12. Add `enum` to `field.list` filter in §3.2

**Finding:** §3.2 shows the filter values as a union but the implementation's tool declaration omits the `enum` constraint, letting invalid values silently fall through.

**Fix:** No spec prose change needed — §3.2 already lists the enum. This is an implementation fix (see I-6).

### S-13. Optional tool discovery

**Finding:** Consumers have no standard way to distinguish required from optional tools at discovery time. §7.1 says "tool discovery" but doesn't say whether optional tools appear only when supported.

**Fix:** Add to §7.1 after requirement 1:

> Tool discovery results SHOULD include only tools the provider actually supports. Consumers SHOULD NOT assume all tools from the normative catalog are present. Consumers SHOULD check tool enumeration before invocation, or handle `UNSUPPORTED` errors gracefully.

### S-14. `field.help` default audience

**Finding:** §3.2 says "Default audience is implementation-defined; providers SHOULD default to `'agent'`." The wording weakens the contract unnecessarily.

**Fix:** Change to:

> Default audience is `"agent"`. Providers MAY allow consumers to override this default.

---

## 2. Implementation Code Fixes

Changes to `packages/formspec-assist/src/`.

### I-1. Add `widget` to `describeField` output

**File:** `provider.ts` `describeField()` (~line 604)

**Fix:** Add `widget` field reading from the item's widgetHint:

```typescript
const widgetHint = (item as FormItem & { presentation?: { widgetHint?: string } })?.presentation?.widgetHint;
// In the return object:
widget: widgetHint,
```

### I-2. Add repeat metadata to `describeField` output

**File:** `provider.ts` `describeField()` (~line 604)

**Fix:** Parse the field path for repeat indices, look up the parent group's repeat state from the engine:

```typescript
// Parse index from path like "group[0].field"
const indexMatch = path.match(/\[(\d+)\]/);
const repeatIndex = indexMatch ? Number.parseInt(indexMatch[1], 10) : undefined;

// Look up parent group repeat count
const parentGroupPath = /* extract group path before [N] */;
const repeatCount = parentGroupPath ? engine.getRepeatCount(parentGroupPath) : undefined;

// Look up min/max from the parent group item
const parentItem = parentGroupPath ? findItem(definition, parentGroupPath) : undefined;
const minRepeat = (parentItem as any)?.minRepeat;
const maxRepeat = (parentItem as any)?.maxRepeat;
```

Only include these fields when the field is actually inside a repeat group.

### I-3. Include `reason: 'complete'` in nextIncomplete

**File:** `provider.ts` `nextIncomplete()` (~lines 774, 793)

**Fix:** Change both "all complete" return sites:

```typescript
// Line 774 (page scope):
return { label: 'Complete', reason: 'complete' };

// Line 793 (field scope):
return { label: 'Complete', reason: 'complete' };
```

Also fix the page-scope branch at line 762-772: when a page is found incomplete but `getPageIssue` returns `null` (e.g., a page with zero relevant fields after filtering), this edge case should return `reason: 'complete'` for that page rather than omitting `reason`. The logic should be: if `getPageIssue` returns a reason, use it; if the page passed the `!complete` filter but has no specific issue, treat it as `reason: 'empty'` (the page has fields but all are non-required and empty).

### I-4. Fix break-on-first equivalent match

**File:** `profile-matcher.ts` (~lines 55-75)

**Fix:** Iterate ALL equivalents and pick the highest-confidence match:

```typescript
let bestEquivalent: ProfileMatch | undefined;
for (const equivalent of concept?.equivalents ?? []) {
  const key = equivalent.concept ?? equivalentKey(equivalent.system, equivalent.code);
  if (!key || !profile.concepts[key]) continue;
  const entry = profile.concepts[key];
  const confidence = confidenceForRelationship(equivalent.type);
  if (!bestEquivalent || confidence > bestEquivalent.confidence) {
    bestEquivalent = {
      path,
      concept: key,
      value: entry.value,
      confidence,
      relationship: equivalent.type ?? 'exact',
      source: entry.source,
    };
  }
}
if (bestEquivalent && bestEquivalent.confidence >= this.threshold) {
  matches.push(bestEquivalent);
  continue;
}
```

### I-5. Add wildcard ancestor candidates

**File:** `context-resolver.ts` `buildTargetCandidates()` (~line 84)

**Fix:** After building stripped ancestors, also build wildcard ancestors:

```typescript
// Existing: ancestors from stripped base
const parts = base.split('.');
for (let index = parts.length - 1; index > 0; index -= 1) {
  targets.add(parts.slice(0, index).join('.'));
}

// New: ancestors from wildcard path
if (path !== base) {
  const wildcardParts = wildcard.split('.');
  for (let index = wildcardParts.length - 1; index > 0; index -= 1) {
    targets.add(wildcardParts.slice(0, index).join('.'));
  }
}
```

### I-6. Add `enum` to `filter` input schema

**File:** `provider.ts` `buildToolDeclarations()` (~line 239)

**Fix:** Change `field.list` filter property:

```typescript
filter: { type: 'string', enum: ['all', 'required', 'empty', 'invalid', 'relevant'] }
```

### I-7. Remove unnecessary `as any` casts

**File:** `provider.ts` line 505

```typescript
// Before:
description: (this.engine.getDefinition() as any).description,
// After:
description: this.engine.getDefinition().description,
```

**File:** `context-resolver.ts` line 214

```typescript
// Before:
const nextPage = (item as any).presentation?.layout?.page ?? currentPage;
// After:
const nextPage = item.presentation?.layout?.page ?? currentPage;
```

### I-8. Tighten TypeScript enum types

**File:** `types.ts`

```typescript
// ProfileMatch.relationship (line 104) — was string
relationship?: 'exact' | 'close' | 'broader' | 'narrower' | 'related' | 'field-key';

// ConceptEquivalent.type (line 57) — was string
type?: 'exact' | 'close' | 'broader' | 'narrower' | 'related';

// ConceptEquivalent.concept (line 54) — was missing, spec includes it
concept?: string;

// ReferenceEntry.title (line 22) — was optional, spec says required
title: string;
```

**Note:** I-7 and I-8 are compile-time-only changes. They improve type safety but have no runtime-observable behavior change, so they do not need dedicated runtime tests. Verify by running `tsc` and fixing any resulting type errors in tests/implementation.

### I-9. Remove non-spec `calculationSource` field

**File:** `provider.ts` `describeField()` (~line 619)

Remove:
```typescript
calculationSource: expression ? 'definition' : undefined,
```

---

## 3. Test Coverage Expansion

Changes to `packages/formspec-assist/tests/`.

### T-1. `formspec.field.validate` — zero coverage

New test: invoke tool with valid path, verify `{ results: ValidationResult[] }` envelope. Error test with unknown path producing `NOT_FOUND`.

### T-2. `formspec.field.list` filter values

Test each filter value (`required`, `empty`, `invalid`, `relevant`) with appropriate engine state. Verify list length and content for each filter.

### T-3. `formspec.field.set` error paths

Test `NOT_FOUND` (unknown path), `NOT_RELEVANT` (hidden field), `INVALID_VALUE` (engine rejection). Currently only `READONLY` is tested.

### T-4. Error codes `NOT_RELEVANT`, `UNSUPPORTED`, `ENGINE_ERROR`

- `NOT_RELEVANT`: use conditional logic to hide a field, attempt set
- `UNSUPPORTED`: invoke `provider.invokeTool('formspec.nonexistent', {})`
- `ENGINE_ERROR`: force engine exception during setValue

### T-5. `ProfileStore` dedicated tests

New file `tests/profile-store.test.ts`:
- `load(id)` with existing and missing profiles
- `save()` persists and overwrites
- `listProfiles()` returns summary list
- `deleteProfile()` removes by id
- Corrupt JSON in storage returns empty array
- Non-array JSON in storage returns empty array

### T-6. `formspec.field.bulkSet` partial success

Test with mix of valid paths and readonly/missing paths. Verify `summary.accepted`, `summary.rejected`, `summary.errors` counts. Verify per-entry `error` objects.

### T-7. `profile.apply` declined path

Test `confirmProfileApply` returning `false`. Verify all entries in `skipped` with reason `DECLINED`, zero in `filled`.

### T-8. Repeat group paths

Add a repeat group to the test fixture. Test `field.describe` with indexed path. Test reference resolution with wildcard ancestor target. Test profile matching for repeat fields.

### T-9. Multiple references/ontology documents

Test with two references documents: verify entries from both appear. Test with two ontology documents with conflicting bindings: verify last-wins.

### T-10. Priority sorting

Add references with mixed priorities for the same field. Verify output order: primary before supplementary before background within each type.

### T-11. Split monolithic test

Break the ~90-line single `it` block (provider-tools.test.ts lines 21-112) into isolated tests per tool, each with fresh engine state. Eliminates shared mutable state.

### T-12. `INVALID_PATH` error code

Test: pass `path: ''` (empty string) to `field.describe`. Verify `INVALID_PATH` error.

### T-13. `formspec.form.validate` with explicit modes

Test `mode: 'continuous'` and `mode: 'submit'` with a form that has validation errors.

### T-14. `formspec.form.describe` full envelope

Assert all seven output fields: `title`, `description`, `url`, `version`, `fieldCount`, `pageCount`, `status`.

### T-15. `formspec.field.describe` full envelope

Assert all spec-defined output fields including `widget` and repeat metadata.

**Prerequisite:** The test fixture (`helpers.ts`) must be extended to include:
- A field with `presentation.widgetHint` set (to exercise `widget` output)
- A repeat group with children (to exercise `repeatIndex`, `repeatCount`, `minRepeat`, `maxRepeat`)

These fixture changes are also needed for T-8.

---

## 4. Editorial / Lower Priority

### E-1. Browser messaging correlation ID

**Fix:** Add to §7.4: "Consumers and providers SHOULD use a `callId` string property to correlate requests and responses. The format is implementation-defined; UUIDs are RECOMMENDED."

### E-2. `summary` synthesis guidance

**Fix:** Add to §5.4: "When providers synthesize `summary`, the result SHOULD be a concise plain-text sentence suitable for display in a tooltip or chat context. Providers MAY use LLM-generated content. The synthesis method is implementation-defined."

### E-3. HTTP path with dotted tool names

**Fix:** Add to §7.5: "The `{name}` segment uses the full dot-delimited tool name. Servers MUST NOT interpret dots in the tool name as path separators or file extensions."

### E-4. WebMCP "bulk replacement" clarification

**Fix:** Replace §7.2 SHOULD with: "Providers SHOULD register tools incrementally via `registerTool()` rather than replacing the entire tool set atomically."

---

## Implementation Sequence

Recommended order:

1. **Spec fixes first** (S-1 through S-14) — establish the normative truth before changing code
2. **Type fixes** (I-7, I-8) — tighten TypeScript contracts; compile-time-only, verify with `tsc`
3. **Test fixture expansion** — add `widgetHint` field and repeat group to `helpers.ts` (prerequisite for T-8, T-15)
4. **Split monolithic test** (T-11) — establish a clean test baseline before adding new tests
5. **Implementation fixes with red-green tests** (I-1 through I-6, I-9) — each behavioral fix gets a failing test first, then the fix
6. **Test expansion** (T-1 through T-15) — fill remaining coverage gaps
7. **Editorial** (E-1 through E-4) — lowest priority, can be batched

---

## Finding Cross-Reference

| ID | Swarm ID | Severity | Category | Description |
|---|---|---|---|---|
| S-1 | C4 | CRITICAL | Spec | Define "filled" |
| S-2 | C5 | CRITICAL | Spec | Define "valid" |
| S-3 | C3 | CRITICAL | Spec | NextIncompleteResult.reason + "complete" |
| S-4 | W8 | WARNING | Spec | Multiple ontology doc order |
| S-5 | W2 | WARNING | Spec | field.set value omission |
| S-6 | C1 | CRITICAL | Spec | Define widget in FieldDescription |
| S-7 | W6 | WARNING | Spec | Wildcard ancestor targets |
| S-8 | S2 | SPEC_GAP | Spec | Skipped reason vocabulary |
| S-9 | S1 | SPEC_GAP | Spec | Document x- error codes |
| S-10 | W9 | WARNING | Spec | confirm:true behavior |
| S-11 | S4 | SPEC_GAP | Spec | Multiple references merge order |
| S-12 | W1 | WARNING | Spec/Impl | field.list filter enum |
| S-13 | S5 | SPEC_GAP | Spec | Optional tool discovery |
| S-14 | — | EDITORIAL | Spec | field.help default audience |
| I-1 | C1 | CRITICAL | Impl | Add widget to describeField |
| I-2 | C2 | CRITICAL | Impl | Add repeat metadata to describeField |
| I-3 | C3 | CRITICAL | Impl | reason: 'complete' in nextIncomplete |
| I-4 | W3 | WARNING | Impl | Best-match equivalent selection |
| I-5 | W6 | WARNING | Impl | Wildcard ancestor candidates |
| I-6 | W1 | WARNING | Impl | filter enum in input schema |
| I-7 | W7 | WARNING | Impl | Remove as-any casts |
| I-8 | W4/W5 | WARNING | Impl | Tighten TS enum types |
| I-9 | W10 | WARNING | Impl | Remove calculationSource |
| T-1 | T1 | COVERAGE | Test | field.validate zero coverage |
| T-2 | T2 | COVERAGE | Test | field.list filter values |
| T-3 | T3 | COVERAGE | Test | field.set error paths |
| T-4 | T4 | COVERAGE | Test | Missing error code tests |
| T-5 | T5 | COVERAGE | Test | ProfileStore dedicated tests |
| T-6 | T6 | COVERAGE | Test | bulkSet partial success |
| T-7 | T7 | COVERAGE | Test | profile.apply declined |
| T-8 | T8 | EDGE_CASE | Test | Repeat group paths |
| T-9 | T9 | EDGE_CASE | Test | Multiple sidecar documents |
| T-10 | T10 | EDGE_CASE | Test | Priority sorting |
| T-11 | T11 | QUALITY | Test | Split monolithic test |
| T-12 | T4 | COVERAGE | Test | INVALID_PATH error |
| T-13 | T13 | COVERAGE | Test | Validate modes |
| T-14 | T14 | QUALITY | Test | form.describe full envelope |
| T-15 | T15 | QUALITY | Test | field.describe full envelope |
| E-1 | S6 | EDITORIAL | Spec | Correlation ID |
| E-2 | S7 | EDITORIAL | Spec | Summary synthesis guidance |
| E-3 | — | EDITORIAL | Spec | HTTP dotted paths |
| E-4 | — | EDITORIAL | Spec | WebMCP bulk clarification |

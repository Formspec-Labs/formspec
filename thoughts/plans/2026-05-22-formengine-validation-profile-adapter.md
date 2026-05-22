---
title: FormEngine ValidationProfile Adapter
date: 2026-05-22
status: active
owner: spec-author
related:
  - thoughts/plans/2026-05-22-response-actions-spec.md
  - thoughts/plans/2026-05-22-validation-mapping.md
  - specs/core/validation-mapping.md
  - packages/formspec-engine/src/engine/FormEngine.ts
---

# FormEngine ValidationProfile Adapter

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development. Steps use `- [ ]` syntax. Failing tests first per `formspec/CLAUDE.md`.

**Goal:** Replace `FormEngine.getValidationReport()`'s `{ mode: 'continuous' | 'submit' }` option with `{ profile: ValidationProfile }`. The engine's public API speaks VM vocabulary (`off | on-submit | on-demand | live`); internal triggers (`continuous | submit | demand | disabled`) stay internal. Closes Expert MAJOR 2 from the Response Actions plan reviews. **Refactor, not adapter** — greenfield, no production callers to preserve, the `mode` parameter is dead weight.

**Architecture:** Strict DI port — `ValidationProfileResolver` is an interface, the default implementation is the obvious 4-row mapping, and the engine accepts an alternate resolver via constructor option for testing and for future `x-` extension profiles (publisher intents per VM §6.1). The adapter lives in `packages/formspec-engine/src/validation/`. `ValidationProfile` type re-exported from `formspec-types` (layer 0). Rust-side: `formspec-eval` already exposes the trigger universe; no Rust change required for this plan. The TypeScript surface is the only one that needs the refactor.

**Breaking change.** Every caller of `getValidationReport({ mode: ... })` MUST migrate to `getValidationReport({ profile: ... })`. Mapping: `mode: 'continuous'` → `profile: 'live'`; `mode: 'submit'` → `profile: 'on-submit'`. Task 7 sweeps the entire repo and renames every call site. No deprecation period; no backwards-compat wrapper.

**Tech Stack:** TypeScript, Vitest (`packages/formspec-engine/tests/`), Preact Signals, `npm run check:deps`.

**Sequencing:** Type extension first → port interface + default resolver → engine method overload → tests at every layer → backwards-compat assertion. Per repo rule: Rust source-of-truth where applicable; this adapter is TS-only because the consumers (Response Actions, Experience, Mapping) call into the engine via the JS surface, not the Rust crate.

**Citations:** "VM §" = `specs/core/validation-mapping.md`. "RA-plan" = `formspec/thoughts/plans/2026-05-22-response-actions-spec.md`.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `packages/formspec-engine/src/validation/profile-resolver.ts` | `ValidationProfileResolver` port + `DefaultValidationProfileResolver` impl mapping VM names to engine triggers. |
| `packages/formspec-engine/src/validation/index.ts` | Re-export the port and default impl. |
| `packages/formspec-engine/tests/validation-profile-resolver.test.mts` | Unit tests for the resolver. |
| `packages/formspec-engine/tests/form-engine-profile-option.test.mts` | Integration tests asserting `getValidationReport({ profile })` parity with `getValidationReport({ mode })` where applicable, and divergence for `off` / `on-demand` / `live`. |

### Modified

| Path | Why |
|---|---|
| `packages/formspec-types/src/index.ts` (or whichever module exports the public types) | Export `ValidationProfile = 'off' \| 'on-submit' \| 'on-demand' \| 'live'`. If already present (from VM schema generation), no edit needed — verify by inspection. |
| `packages/formspec-engine/src/engine/FormEngine.ts` | Extend `getValidationReport` signature to accept `profile?: ValidationProfile`. Internal: resolve profile via injected resolver, dispatch to existing trigger path. `getDiagnosticsSnapshot` and the `getValidationReport` event-bus message gain the same option. Constructor accepts an optional `validationProfileResolver`. |
| `packages/formspec-engine/src/index.ts` | Re-export `ValidationProfileResolver`, `DefaultValidationProfileResolver`, `ValidationProfile`. |
| `packages/formspec-engine/README.md` | Document the new option under "Validation profile vocabulary". |
| `filemap.json` | Regenerated. **Generated — never hand-edit.** |

### Explicitly NOT in scope

- **Python evaluator changes.** Server-side conformance still uses VM names directly; the Python path consults VM master-table and shape timing without needing this adapter. If a Python-side helper appears warranted, file a follow-up.
- **Rust crate API additions.** `formspec-eval` exposes triggers; the adapter is an engine-layer concern.
- **WOS-side validation triggers.** WOS owns its own evaluation cycle; this adapter does not bridge across the stack seam.

---

## Self-Review Note

- The port is **narrow by design**: one method (`resolve(profile) -> trigger`). The interface is not a kitchen-sink; future extension points (e.g., a publisher `x-` profile) implement the same interface, not a different one.
- **Dependency direction respected**: layer 0 (`formspec-types`) owns the `ValidationProfile` string union; layer 1 (`formspec-engine`) consumes it. `npm run check:deps` enforces this.
- **`off` profile semantics**: VM §3 / §9.1.2 require "no ValidationReport produced." `getValidationReport({ profile: 'off' })` returns `null` (or `undefined` — the engine's no-report sentinel; verify against existing surface for absent reports). Callers MUST handle the absence explicitly. The resolver returns `disabled`; the engine short-circuits and produces no report. Earlier draft text proposed an empty valid report — that contradicted VM and has been corrected.
- **Cold-read test**: a future agent reading the resolver file alone understands the contract from the JSDoc + four mapping rows.

---

## Task 1: Verify `ValidationProfile` type exists in layer 0

**Files:**
- Inspect: `packages/formspec-types/src/`

- [ ] **Step 1: Locate the type**

```bash
cd formspec && grep -rE "ValidationProfile" packages/formspec-types/src/ schemas/ | head -10
```

If `ValidationProfile` is a generated type from `schemas/validation-mapping.schema.json`, it should appear in `packages/formspec-types/src/generated/` or similar. If absent: add the union to `packages/formspec-types/src/validation.ts` (or matching module) as:

```ts
export type ValidationProfile = 'off' | 'on-submit' | 'on-demand' | 'live';
```

Export from `packages/formspec-types/src/index.ts`.

- [ ] **Step 2: Build the types package**

```bash
cd formspec && npm run build --workspace packages/formspec-types
```

Expected: pass.

- [ ] **Step 3: Commit (if a new export was added)**

```bash
cd formspec && git add packages/formspec-types/src/
git commit -m "feat(types): export ValidationProfile string union (VM §3)"
```

---

## Task 2: Write failing tests for the resolver

**Files:**
- Create: `packages/formspec-engine/tests/validation-profile-resolver.test.mts`

- [ ] **Step 1: Author the test**

```ts
import { describe, expect, it } from 'vitest';
import { DefaultValidationProfileResolver, type ValidationProfileResolver } from '../src/validation';

describe('DefaultValidationProfileResolver', () => {
  const resolver: ValidationProfileResolver = new DefaultValidationProfileResolver();

  it.each([
    ['off', 'disabled'],
    ['on-submit', 'submit'],
    ['on-demand', 'demand'],
    ['live', 'continuous'],
  ] as const)('maps profile %s to trigger %s', (profile, trigger) => {
    expect(resolver.resolve(profile)).toBe(trigger);
  });

  it('rejects an unknown profile with a descriptive error', () => {
    expect(() => resolver.resolve('bogus' as unknown as 'off')).toThrow(/unknown.*profile/i);
  });
});
```

- [ ] **Step 2: Run — expect failure (no implementation yet)**

```bash
cd formspec && npm run test -- packages/formspec-engine/tests/validation-profile-resolver.test.mts
```

Expected: the test file fails to import (resolver doesn't exist). Good — that's the red phase.

- [ ] **Step 3: Commit the red test**

```bash
cd formspec && git add packages/formspec-engine/tests/validation-profile-resolver.test.mts
git commit -m "test(engine): red — ValidationProfileResolver mapping contract

Pins the four VM ValidationProfile -> engine trigger mappings and the
unknown-profile rejection path."
```

---

## Task 3: Implement the resolver

**Files:**
- Create: `packages/formspec-engine/src/validation/profile-resolver.ts`
- Create: `packages/formspec-engine/src/validation/index.ts`

- [ ] **Step 1: Author the resolver**

`packages/formspec-engine/src/validation/profile-resolver.ts`:

```ts
import type { ValidationProfile } from 'formspec-types';

/** Engine-internal validation trigger vocabulary. */
export type ValidationTrigger = 'continuous' | 'submit' | 'demand' | 'disabled';

/**
 * Bridges Validation Mapping ValidationProfile (`specs/core/validation-mapping.md §3`)
 * to the engine's internal trigger vocabulary. Implementations MAY extend
 * the contract to accept publisher `x-`-prefixed profile names from
 * Response Actions documents that use extension intents (VM §6.1).
 */
export interface ValidationProfileResolver {
  resolve(profile: ValidationProfile): ValidationTrigger;
}

const PROFILE_TO_TRIGGER: Record<ValidationProfile, ValidationTrigger> = {
  off: 'disabled',
  'on-submit': 'submit',
  'on-demand': 'demand',
  live: 'continuous',
};

export class DefaultValidationProfileResolver implements ValidationProfileResolver {
  resolve(profile: ValidationProfile): ValidationTrigger {
    const trigger = PROFILE_TO_TRIGGER[profile];
    if (trigger === undefined) {
      throw new Error(`Unknown validation profile: ${profile}`);
    }
    return trigger;
  }
}
```

`packages/formspec-engine/src/validation/index.ts`:

```ts
export type { ValidationProfileResolver, ValidationTrigger } from './profile-resolver';
export { DefaultValidationProfileResolver } from './profile-resolver';
```

- [ ] **Step 2: Run the test — expect green**

```bash
cd formspec && npm run test -- packages/formspec-engine/tests/validation-profile-resolver.test.mts
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd formspec && git add packages/formspec-engine/src/validation/
git commit -m "feat(engine): ValidationProfileResolver port + default impl

Maps VM ValidationProfile (off | on-submit | on-demand | live) to engine
triggers (disabled | submit | demand | continuous). Narrow DI port;
publishers MAY plug in alternate resolvers for x- extension profiles."
```

---

## Task 4: Failing integration test for `getValidationReport({ profile })`

**Files:**
- Create: `packages/formspec-engine/tests/form-engine-profile-option.test.mts`

- [ ] **Step 1: Author the test**

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { initFormspecEngine, FormEngine } from '../src';
// Use any small valid Definition fixture already present in the package.

describe('FormEngine.getValidationReport({ profile })', () => {
  beforeEach(async () => { await initFormspecEngine(); });

  it('profile=on-submit produces a report scoped to submit-timing shapes', async () => {
    const engine = await buildEngineWithFixture('definition-with-one-required.json');
    const report = engine.getValidationReport({ profile: 'on-submit' });
    expect(report).not.toBeNull();
    expect(report!.findings.every(f => f.timing !== 'demand')).toBe(true);
  });

  it('profile=live produces a continuous report across all non-demand timings', async () => {
    const engine = await buildEngineWithFixture('definition-with-one-required.json');
    const report = engine.getValidationReport({ profile: 'live' });
    expect(report).not.toBeNull();
  });

  it('profile=off produces no ValidationReport (VM §3 / §9.1.2)', async () => {
    const engine = await buildEngineWithFixture('definition-with-one-required.json');
    const report = engine.getValidationReport({ profile: 'off' });
    expect(report).toBeNull();
  });

  it('profile=on-demand produces only demand-timing shape findings', async () => {
    const engine = await buildEngineWithFixture('definition-with-demand-shape.json');
    const report = engine.getValidationReport({ profile: 'on-demand' });
    expect(report).not.toBeNull();
    expect(report!.findings.some(f => f.shapeId === 'demandShape')).toBe(true);
  });

  it('rejects an unknown profile via the resolver error path', async () => {
    const engine = await buildEngineWithFixture('definition-with-one-required.json');
    expect(() =>
      engine.getValidationReport({ profile: 'bogus' as unknown as 'off' })
    ).toThrow(/unknown.*profile/i);
  });

  it('rejects the removed mode parameter', async () => {
    const engine = await buildEngineWithFixture('definition-with-one-required.json');
    // Deliberate type-cheat to prove the runtime rejects a removed shape.
    expect(() =>
      engine.getValidationReport({ mode: 'continuous' } as unknown as { profile: 'live' })
    ).toThrow(/mode.*removed|unknown.*option/i);
  });
});

// Helper — load Definition fixture and construct an engine. Reuse the package's
// existing test helpers if present; otherwise inline a minimal builder.
async function buildEngineWithFixture(name: string): Promise<FormEngine> {
  // Replace with project's actual test helper.
  throw new Error('TODO: wire to existing test helper / inline minimal Definition');
}
```

The fixture helper line is intentionally a placeholder — the package likely already has a `buildEngineWithFixture` helper (inspect `packages/formspec-engine/tests/*.mts` for the prevailing pattern). Wire to it during implementation. If absent, inline a minimal Definition with one `required` shape and one `demand`-timing shape per the fixture demands above.

- [ ] **Step 2: Run — expect failure**

```bash
cd formspec && npm run test -- packages/formspec-engine/tests/form-engine-profile-option.test.mts
```

Expected: tests fail because `{ profile }` is not accepted by `getValidationReport` yet.

- [ ] **Step 3: Commit red**

```bash
cd formspec && git add packages/formspec-engine/tests/form-engine-profile-option.test.mts
git commit -m "test(engine): red — FormEngine.getValidationReport profile option

Pins parity (on-submit↔submit, live↔continuous), divergence (off,
on-demand), and resolver error propagation."
```

---

## Task 5: Extend `FormEngine.getValidationReport`

**Files:**
- Modify: `packages/formspec-engine/src/engine/FormEngine.ts`

- [ ] **Step 1: Extend signature**

Change the signature at the existing line (`packages/formspec-engine/src/engine/FormEngine.ts:470` per snapshot — verify in current source):

```ts
public getValidationReport(
  options: { profile: ValidationProfile } = { profile: 'live' }
): ValidationReport | null {
  // Reject the removed `mode` option explicitly. Any caller still passing
  // it is mid-migration and should be caught loudly.
  if ('mode' in options) {
    throw new Error('getValidationReport: { mode } removed; pass { profile } instead. See packages/formspec-engine/README.md.');
  }
  const trigger = this._validationProfileResolver.resolve(options.profile);
  if (trigger === 'disabled') {
    // VM §3 / §9.1.2: under `off` profile, no ValidationReport is produced.
    return null;
  }
  return this._produceReport(trigger);
}
```

**Sub-step 1.5 — extract `_produceReport(trigger)`.** The existing `getValidationReport` body (which handled the trigger dispatch in `mode`-shaped form) becomes a private `_produceReport(trigger: ValidationTrigger): ValidationReport`. Extend `_produceReport` to handle the `'demand'` trigger (filter to demand-timing shapes only). `'disabled'` is short-circuited at the caller and never reaches `_produceReport`.

The return type becomes `ValidationReport | null`. The `{ profile: 'off' }` path returns null; the other three profiles return a non-null report. Update internal callers (`getDiagnosticsSnapshot`, internal `complete` checks, the event-bus handler) to handle null — typically by treating null as "no findings produced" for downstream UI purposes. **All internal callers MUST be updated in this task; the field-level migration is in Task 7.**

- [ ] **Step 2: Constructor option**

Add to the constructor signature:

```ts
constructor(opts: {
  /* existing fields */
  validationProfileResolver?: ValidationProfileResolver;
} = {}) {
  /* existing */
  this._validationProfileResolver = opts.validationProfileResolver ?? new DefaultValidationProfileResolver();
}
```

Update the private field declaration accordingly.

- [ ] **Step 3: Also refactor `getDiagnosticsSnapshot` and the event-bus message**

`getDiagnosticsSnapshot(options: { profile: ValidationProfile } = { profile: 'live' })` — same signature shape as `getValidationReport`. Drops `mode` entirely.

The event-bus message handler at the existing `case 'getValidationReport':` branch (line ~672 per snapshot) accepts `{ profile }` only. Any inbound message carrying `mode` is rejected with the same error as Step 1.

- [ ] **Step 4: Run integration tests — expect green**

```bash
cd formspec && npm run test -- packages/formspec-engine/tests/form-engine-profile-option.test.mts
```

Expected: all pass. If `on-demand` filtering wasn't supported in the existing trigger path, surface that as a follow-up — the resolver returns `demand`, the engine MUST honor it. The Rust trigger universe per `FormEngine.ts:1305` already names `demand`, so this should be a simple wiring exercise.

- [ ] **Step 5: Run the full engine test suite**

```bash
cd formspec && npm run test --workspace packages/formspec-engine
```

Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
cd formspec && git add packages/formspec-engine/src/engine/FormEngine.ts
git commit -m "feat(engine): FormEngine.getValidationReport accepts { profile }

VM ValidationProfile resolution via DI port. Backwards compatible:
existing { mode } callers unaffected; passing both is rejected to
prevent ambiguity. off short-circuits to an empty valid report;
on-demand filters to demand-timing shapes."
```

---

## Task 6: Re-export, docs, dep-fence

**Files:**
- Modify: `packages/formspec-engine/src/index.ts`
- Modify: `packages/formspec-engine/README.md`

- [ ] **Step 1: Re-exports**

```ts
// packages/formspec-engine/src/index.ts
export {
  DefaultValidationProfileResolver,
  type ValidationProfileResolver,
  type ValidationTrigger,
} from './validation';
```

- [ ] **Step 2: README section**

Append under an existing "Validation" section (or create one if absent):

```markdown
### Validation profile vocabulary

`getValidationReport()` accepts either the engine-internal `{ mode }` option or the Validation Mapping `{ profile }` option:

| `profile` | Behavior |
|---|---|
| `off` | Returns `null` (no ValidationReport produced, per VM §3). |
| `on-submit` | Validation pass scoped to submit-timing + continuous-timing shapes. |
| `on-demand` | Only demand-timing shape findings. |
| `live` | Continuous validation across non-demand-timing shapes. Default. |

The earlier `{ mode: 'continuous' | 'submit' }` option is **removed**. Calls with `mode` throw a runtime error pointing at this section.

Pass either, not both. Override the mapping via the constructor's `validationProfileResolver` option for `x-` extension profiles.
```

- [ ] **Step 3: Layering check**

```bash
cd formspec && npm run check:deps
```

Expected: pass. `formspec-engine` imports `ValidationProfile` from layer 0 `formspec-types`; no cross-layer leak.

- [ ] **Step 4: Commit**

```bash
cd formspec && git add packages/formspec-engine/
git commit -m "docs(engine): document { profile } option + re-export resolver API"
```

---

## Task 7: Migrate every call site in the repo

**Files:** every `.ts`, `.mts`, `.tsx`, `.js`, `.mjs` that calls `getValidationReport({ mode: ... })` or `getDiagnosticsSnapshot({ mode: ... })`.

- [ ] **Step 1: Find every call site**

```bash
cd formspec && grep -rln "getValidationReport(\s*{\s*mode\|getDiagnosticsSnapshot(\s*{\s*mode" packages/ src/ tests/ form-builder/ 2>/dev/null
```

- [ ] **Step 2: Rename each**

Mechanical migration:
- `{ mode: 'continuous' }` → `{ profile: 'live' }`
- `{ mode: 'submit' }` → `{ profile: 'on-submit' }`
- Bare `getValidationReport()` (no options) keeps working — defaults to `{ profile: 'live' }`.

Use IDE multi-file rename. Read each diff to confirm the migration matches the call site's intent (sometimes a caller passed `mode: 'submit'` to mean "validate as if the user just clicked submit" — that becomes `profile: 'on-submit'`).

- [ ] **Step 3: Handle the `null` return**

Callers that previously assumed a non-null report now need to handle null when `profile: 'off'` flows through. Inspect each site:
- If the caller never passes `profile: 'off'`, no null handling needed — but TypeScript's narrower return type may flag the consumption. Use `!` or an early `if (report === null) return` guard.
- If the caller MIGHT receive `'off'` (e.g., a generic helper that takes profile as a parameter), wrap consumption in an explicit null check.

- [ ] **Step 4: Run + commit**

```bash
cd formspec && npm test
git add -A
git commit -m "refactor(engine-callers): migrate getValidationReport mode → profile

Every call site rewritten to pass { profile: ... } instead of
{ mode: ... }. The removed mode option throws at runtime if a
caller is missed; the test suite catches the missing migrations."
```

---

## Task 8: Regenerate filemap + full sweep

- [ ] **Step 1: Regenerate**

```bash
cd formspec && npm run docs:filemap && npm run docs:check
```

Expected: pass.

- [ ] **Step 2: Full TS test sweep**

```bash
cd formspec && npm test
```

Expected: no regressions. Every call site migrated; no `mode`-shaped invocations remain.

- [ ] **Step 3: Commit generated**

```bash
cd formspec && git add filemap.json
git commit -m "build(docs): regenerate filemap post mode-to-profile refactor"
```

---

## Sequencing Recap

```
Task 1: type re-export check     (layer 0)
Task 2-3: resolver red-green     (port + impl)
Task 4-5: engine red-green       (integration; mode parameter removed)
Task 6: docs + dep-fence         (release hygiene)
Task 7: call-site migration      (repo-wide rename)
Task 8: filemap + sweep          (build)
```

This plan MUST land before Response Actions `§5.3` claims "the Core engine MUST run the resolved profile" against a real API surface. After this lands, RA-plan §5.3 cites `getValidationReport({ profile })` as the conformance entry point.

## Out-of-scope reminders

- **Do not preserve a `mode` shim.** Greenfield refactor; `mode` is removed, not deprecated. A call site still using `mode` is a bug, not a soft-warn case.
- **Do not push `profile` into the Rust crate.** TS-side refactor is enough for the consumers; Python conformance does not go through `getValidationReport`.
- **Do not introduce x-profile handling in the default resolver.** Default is closed; publishers register an alternate `ValidationProfileResolver` via the constructor.

# Formspec — Consolidated TODO

Formspec-specific tactical work: spec/runtime/Studio/conformance work owned in this repo. Work that crosses spec boundaries (Formspec + WOS + Trellis) lives in [`TODO-STACK.md`](TODO-STACK.md).

Paired docs:

- **[`TODO-STACK.md`](TODO-STACK.md)** — Stack-wide rollups + ADR-grouped delivery items.
- **[`PLANNING.md`](PLANNING.md)** — Atomic PLN-* rows for cross-ADR backlog.
- **[`VISION.md`](VISION.md)** — Stack-wide architectural vision.
- **[`STACK.md`](STACK.md)** — Public-facing stack framing.

Scoring `[Imp / Cx / Debt]` per [`.claude/user_profile.md`](.claude/user_profile.md) economic model; number in parentheses is `Importance × Debt`. Dev/time free; architecture debt expensive. Cx is scheduling-only, never priority.

Historical completion notes and resolved items moved to [`COMPLETED.md`](COMPLETED.md).

## Formspec-side cross-layer

Work in the Formspec spec and runtime itself that other layers depend on. Lives in `specs/` and `schemas/`, not in stack ADRs.

- **WOS Formspec-Coprocessor integrator alignment (P11-BL-051)** `[5 / 3 / 3]` (**15**)
  - Keep Core §2.1.6 + `schemas/.../response.schema.json` examples aligned with full Response-envelope validation (`additionalProperties: false` at root, open `data`).
  - Ensure integrator-facing docs cite the canonical home: `work-spec/specs/kernel/spec.md` §13 Formspec Coprocessor (post-ADR-0076 absorption 2026-04-28; was Runtime Companion §15 — companion file retained as redirect-stub).
  - Processor/rejection/hook ordering implementation lives in [`work-spec/TODO.md`](work-spec/TODO.md) item `#66`.

- **FORMSPEC-SIGN-HELPER-001 — Response signing digest helper** `[6 / 3 / 4]` (**24**)
  - Implement a Formspec-owned `formspec-response-signing-v1` canonicalization and digest helper that constructs the Signed Response Payload by omitting `authoredSignatures`, computes `authoredSignatures[*].signedPayload.digest`, and verifies co-signature stability.
  - **Why:** Formspec signed responses must remain valid without WOS. WOS can consume verified signature evidence through `wos-formspec-binding`, but the portable signing primitive belongs in Formspec.
  - **Current state:** schema, core prose, runtime normalization, generated types, and signed-response fixtures understand the `signedPayload` shape; runtime signing still validates supplied pins rather than computing canonical JSON digests itself.
  - **Done:** helper API plus tests for valid single signature, valid co-signature, digest mismatch, response pin mismatch, and missing signing intent; WOS binding tests can reuse the helper rather than owning Formspec canonicalization.

- **FORMSPEC-SIGN-VERIFY-001 — Response signature semantic verifier** `[6 / 4 / 4]` (**24**)
  - Wire the cross-field invariant verifier into the lint/validate path: `authoredSignatures[*].signedPayload.responseId` MUST equal top-level `id`; `authoredSignatures[*].signedPayload.definitionUrl` and `definitionVersion` MUST equal top-level pins (Core spec §2.1.6 "When `authoredSignatures` is present" MUST list).
  - **Why:** schema cannot encode these invariants. Review F2 found `response-pin-mismatch.response.json` passing schema validation today. The conformance test recategorized this as a documented gap (`test_signature_fixtures_schema_valid_but_semantically_invalid`).
  - **Done:** `lint(resp.doc)` rejects pin-mismatch fixture; tests for valid + each mismatch shape (responseId, definitionUrl, definitionVersion) pass.

- **`ResponseCorrection` event in Respondent Ledger §6** `[6 / 3 / 4]` (**24**)
  - **Closed 2026-05-07.** `response.correction-recorded` now carries
    `recordKind = "responseCorrection"` plus target-event hash, corrected-field
    subset, original/corrected value pairs, reason, and a neutral
    `authorizationRef` (per ADR 0084 boundary cleanup); schema conformance
    covers the valid and invalid cases.
  - Introduce correction event referencing prior `ResponseSubmitted.canonical_event_hash` with declared corrected-field subset.
  - **Gate:** [ADR 0066](../thoughts/adr/0066-stack-amendment-and-supersession.md) accepted (2026-05-06 — WOS Stack Closure cluster).

- **Offline authoring profile in Respondent Ledger companion** `[6 / 5 / 4]` (**24**)
  - **Closed 2026-05-07.** Respondent Ledger now carries
    `integrityProfile` and `offlineAuthoring`; `chained` /
    `trellis-wrapped` ledgers require paired event hashes on every embedded
    event, and offline buffers use local-linear chain construction with
    authored-time preservation.
  - Specify pending-local-state semantics, authored-time preservation under delayed submit, and chain construction for buffered offline events.
  - Required producer-side contract for Trellis `priorEventHash: [Hash]` reservation (ADR 0001).
  - Absorbs archived migration SHOULDs ULCOMP-R-210..212 as offline-authoring semantics (not ADR 0071 migration semantics).
  - Gap source: [`trellis/specs/archive/cross-reference-map-coverage-analysis.md`](trellis/specs/archive/cross-reference-map-coverage-analysis.md) §4.4.
  - **Gate:** none.

- **FEL temporal builtins return `Result<_, MissingTimezoneContextError>`** (PLN-0399) `[6 / 4 / 5]` (**30**)
  - Migrate `fel-core::current_date()` and `fel-core::now()` from infallible signatures to `Result<RFC3339Timestamp, MissingTimezoneContextError>`, threading explicit timezone context through every FEL evaluator call site (Formspec parser/eval, WOS guards/conditions, Studio preview, Python conformance evaluator).
  - **Why:** [ADR 0069](thoughts/adr/0069-stack-time-semantics.md) D-6 pins explicit-timezone-required as the FEL invariant; silent UTC fallback was the source of cross-tenant deadline drift in the cluster audit. Today the builtins read process-local TZ as a side channel — per-process global state leaking into spec evaluation, the worst kind of architectural debt. The error type forces every call site to inject an explicit timezone or fail audibly; no silent default.
  - **Done:** `fel-core::FelEvaluator::eval_with_context(expr, env, tz)` signature carries `&Timezone` explicitly; `current_date()` / `now()` return `Result<_, MissingTimezoneContextError>`; downstream Formspec FEL evaluator (`src/formspec/fel/evaluator.py`), WOS guard evaluator (`wos-runtime`), Studio FEL preview, and conformance harness updated with explicit tz from caller (calendar context for WOS guards, user TZ for Formspec response display); migration test proves the silent-UTC path is unreachable. Cross-spec breaking change per `nothing-is-released` posture.
  - **Cross-layer scope:** FEL crate is parent (`crates/fel-core`); WASM bridge in `formspec-engine`; Python evaluator parity; WOS guard evaluator. All must move together.
  - **Gate:** [ADR 0069](../thoughts/adr/0069-stack-time-semantics.md) accepted (2026-05-06 — WOS Stack Closure cluster).

## Track / Monitor

### 14. `materializePagedLayout` — by design

- **Source**: editor/layout split review
- **File**: `formspec-studio/packages/formspec-studio/src/workspaces/layout/useLayoutPageMaterializer.ts:16-34`
- **Status**: Guarded by `useRef<boolean>` flag — no-op after first call. Negligible overhead.

### 19. Component tree reconciles on every dispatch

- **Source**: editor/layout split review
- **File**: `packages/formspec-core/src/raw-project.ts:350-373`
- **Action**: Monitor. Resolution path documented: add dirty flag. Not yet implemented.

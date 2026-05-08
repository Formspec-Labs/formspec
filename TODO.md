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
  - **Reframed; see FORMSPEC-CANONICALIZATION-001.**

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

- **FORMSPEC-SIGNATURE-VERIFY-PORT-001 — Verifier port trait + receipt shape** `[6 / 4 / 4]` (**24**)
  - Rust trait Verifier and TS port mirror. D2 from substrate boundary plan.
  - **Done:** crate, trait surface, Receipt shape, tests for JSON round-trip.

- **FORMSPEC-SIGNATURE-METHOD-REGISTRY-001 — Signature-method registry v1.0.0** `[5 / 4 / 3]` (**20**)
  - Registry document + machine-readable JSON. D7 from substrate boundary plan.
  - **Done:** spec doc, registry JSON, lint rule FORMSPEC-SIG-METHOD-REGISTERED-001.

- **FORMSPEC-SIGNATURE-ADAPTER-WEBCRYPTO-001 — In-tree default TS adapter** `[6 / 4 / 5]` (30)
  WebCrypto adapter for ed25519, ecdsa-p256, rsa-pss-sha256. D6 from substrate boundary plan.
  Landed: @formspec/signature-port package defines the Verifier interface;
  @formspec/signature-cose provides shared COSE_Sign1 decode / Sig_structure helpers;
  the WebCrypto adapter verifies Ed25519 COSE_Sign1 signatures over detached signed payload bytes.
  Remaining: receipt signing key management, ECDSA/RSA-PSS real key/vector coverage,
  PQC stubs returning `unsupported`, and the full registry-entry matrix
  {valid, invalid, malformed-cose, key-mismatch}.
  Debt remains 5: shared COSE parsing landed, but receipt signing + multi-alg vector coverage still add surface.

- **FORMSPEC-SIGNATURE-ADAPTER-RING-001 — Sibling Rust adapter** `[6 / 4 / 5]` (30)
  ring-crypto adapter for server-side. D6 from substrate boundary plan.
  Landed: formspec-signature-port crate defines the Verifier trait;
  formspec-signature-cose provides shared Rust COSE_Sign1 decode / Sig_structure helpers;
  ring verifies Ed25519 COSE_Sign1 signatures and routes ECDSA/RSA-PSS through ring primitives when
  valid raw key material is supplied.
  Remaining: receipt signing, complete ECDSA/RSA-PSS fixtures, and cross-adapter byte-equivalence
  tests with webcrypto/Trellis.
  Debt remains 5: COSE parsing is shared, but adapter-equivalence and receipt signing remain deep surfaces.

- **FORMSPEC-SIGNATURE-ADAPTER-TRELLIS-001 — Optional Trellis-COSE adapter** `[6 / 5 / 5]` (30)
  Implements formspec_signature_port::Verifier using trellis-cose primitives. Phase 4 of substrate boundary plan.
  Landed: companion spec at trellis/specs/companion/formspec-signature-corroboration.md,
  ADR 0010 + 0007 cross-references; trellis/crates/trellis-formspec-signature crate;
  Ed25519 COSE_Sign1 verification using shared formspec-signature-cose helpers.
  Remaining: receipt signing, PQC suite support as Trellis adds it, cross-adapter byte-equivalence
  test against webcrypto and ring, and Python mirror.
  PQC suites composable as Trellis adds them. Receipt signing uses Trellis-managed signing keys.

- **FORMSPEC-WIRE-COSE-SIGN1-001 — Wire migration to COSE_Sign1** `[7 / 5 / 4]` (28)
  signatureValue strictly typed as base64-encoded COSE_Sign1. D1 from substrate boundary plan.
  Landed: response.schema.json updated (pattern + description + x-lm.critical),
  signatureMethod changed to registry URI, signedAt + signingIntent moved into signedPayload,
  signerEvidence added, verificationReceipt field added, lint schema mirror synced.
  Remaining: regenerate existing fixture .json files with COSE_Sign1 signatureValue,
  regenerate formspec-types generated *.ts files (npm run types:gen).

- **FORMSPEC-POSTURE-DECLARATION-001 — Posture spec + schema** `[5 / 4 / 3]` (**20**)
  - Per-deployment posture declaration schema. D8 from substrate boundary plan.
  - **Done:** schema created, lives in formspec as Formspec/WOS-shared artifact.

- **FORMSPEC-CANONICALIZATION-001 — Canonicalization helper (no crypto deps)** `[6 / 4 / 4]` (**24**)
  - Reframes FORMSPEC-SIGN-HELPER-001. Rust+TS crate for canonical payload+d digest construction.
  - **Done:** formspec-canonical crates, known-vector tests, WOS binding consumes it.

- **CROSS-STACK-FIXTURES-001 — Byte-populated cross-stack fixtures** `[7 / 5 / 5]` (35)
  Seven bundle directories exist with manifest.toml skeletons and formspec-cross-stack-fixture-harness
  proving structural coherence (10 tests, 3 negative). Bundle 001 is byte-populated and verifies:
  `formspec-response.json` schema-validates, `signedPayload.digest` matches canonical bytes,
  `verificationReceipt` byte-matches `verification-receipt.cose`, and the ring adapter verifies
  the detached Ed25519 COSE_Sign1 signature using the receipt key reference.
  Remaining per bundle:
    • 001 — done: Formspec-only verified fixture with Response, Posture Declaration,
      COSE_Sign1 signature, and COSE-wrapped VerificationReceipt bytes
    • 002 — full WOS-governed path: Response → SignatureAffirmation with verified receipt
    • 003 — posture forbids method → SignatureAdmissionFailed { reason: method_unsupported }
    • 004 — adapter rejects → SignatureAdmissionFailed { reason: primitive_verification_failed }
    • 005 — consent-path signedAt diverges from signedPayload → SOURCE_OF_TRUTH_DIVERGENCE
    • 006 — adapter not bundled → SignatureAffirmation { deferredPendingHelper }
    • 007 — full end-to-end: Response → affirmation → Trellis append → export → certificate → receipt; UCA corroboration
  Gate: Ed25519 COSE adapter implementation has landed; next gate is byte generation plus
  WOS/server/certificate receipt embedding.

- **FORMSPEC-TYPES-REGEN-001 — Regenerate TypeScript types after Phase 2 schema changes** `[4 / 3 / 3]` (12)
  formspec/packages/formspec-types/src/generated/*.ts must be regenerated after response.schema.json
  changes (COSE_Sign1 signatureValue, registry signatureMethod, signedAt/signingIntent in signedPayload,
  signerEvidence, verificationReceipt). Run: cd formspec && npm run types:gen.
  Downstream: policy-studio and formspec-studio also need type regeneration (STUDIO-SIGNATURE-TYPE-REGEN-001).

## Untracked debt (monorepo audit 2026-05-08)

- **FORMSPEC-PY-NATIVE-TEST-001 — Python native-test extraction + JSON type-mapping coverage** `[4 / 2 / 3]` (12)
  - Five inline TODOs in `crates/formspec-py/src/native_tests.rs:619-642`: extract `parse_mapping_document_inner` for native testability; test bool-before-int extraction; test Number fract→int/float dispatch; test all JSON types map correctly; test mixed-type/nested dicts. All are test-coverage gaps in the Python binding.
  - **Done when:** `parse_mapping_document_inner` extracted; 5 test cases land; `pytest tests/` green.

- **FORMSPEC-TEMPORARY-MAP-001 — Remove temporary map-and-merge in runtime mapping engine** `[3 / 1 / 3]` (9)
  - `crates/formspec-core/src/runtime_mapping/engine.rs:262` builds a "temporary map and merge" — should be a named, reusable merge operation, not an ad-hoc local. Low urgency but the comment signals known tech debt.
  - **Done when:** comment says nothing "temporary"; merge logic extracted to a named helper with a test.

- **FORMSPEC-BENCHMARK-HARNESS-001 — Populate benchmark task targets or close harness** `[3 / 2 / 2]` (6)
  - `benchmarks/test_benchmark_harness.py` skips all 3 parametrized tests with `pytest.skip("no tasks yet")` (lines 64, 90, 103). Either populate benchmark task definitions or delete the harness if benchmarking isn't imminent.
  - **Done when:** tests run against real benchmark tasks, or file deleted with a note in COMPLETED.md.

- **FORMSPEC-LAYOUT-BACKCOMPAT-001 — Document or remove backwards-compat responsive layer** `[3 / 1 / 2]` (6)
  - `packages/formspec-layout/src/responsive.ts:5` declares "backwards-compatible behaviour" when no breakpoints map is provided. If the no-breakpoints path is the intended v1 default, reframe the comment. If it's a migration shim, set a removal version.
  - **Done when:** comment accurately reflects product intent (default behavior vs. compat shim).

## Track / Monitor

### 14. `materializePagedLayout` — by design

- **Source**: editor/layout split review
- **File**: `formspec-studio/packages/formspec-studio/src/workspaces/layout/useLayoutPageMaterializer.ts:16-34`
- **Status**: Guarded by `useRef<boolean>` flag — no-op after first call. Negligible overhead.

### 19. Component tree reconciles on every dispatch

- **Source**: editor/layout split review
- **File**: `packages/formspec-core/src/raw-project.ts:350-373`
- **Action**: Monitor. Resolution path documented: add dirty flag. Not yet implemented.

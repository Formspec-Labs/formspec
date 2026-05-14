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

- **FORMSPEC-DATA-CLASSIFICATION-001 — `x-data-classification` extension** `[6 / 2 / 3]` (**18**)
  - Formalize the `x-data-classification` extension property schema from the [compliance exploration](thoughts/research/2026-03-23-compliance-exploration.md) §3.3. Register in `formspec-common.registry.json`. Add a compliance lint rule (C001) flagging fields with PHI-identifiable `semanticType` that lack classification.
  - **Why:** Every compliance conversation starts with "which fields have PII/PHI?" The research is complete — a concrete JSON schema proposal exists with sensitivity levels (`public`/`internal`/`confidential`/`restricted`/`pii`), categories (PII, PHI, financial), and regulatory tags. This is independently valuable: classification metadata on fields enables compliance workflows even without the crypto architecture from ADR-0074.
  - **Gate for:** FORMSPEC-FIELD-CLASSIFICATION-001 (deferred) — must have classification labeling proven in a deployed form before adding encryption.
  - **Done:** `x-data-classification` entry in common registry JSON; schema validates sensitivity levels + categories + regulatory tags; compliance lint rule C001 emits warnings for unclassified PHI fields; clinical-intake example annotated with classifications.
  - **Gate:** none.

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

- **FORMSPEC-EVAL-VALID-UNTIL-001 — validUntil duration computation** `[4 / 3 / 2]` (**12**)
  `formspec-eval/src/screener_eval.rs:522` carries `TODO: Implement proper duration addition for validUntil`. The `ValidityBlock` records the `resultValidity` duration string but sets `valid_until` to `String::new()`. The `_now_str` parameter is unused (underscore prefix). Full implementation: parse ISO 8601 duration, add to current timestamp, populate `valid_until`. Downstream consumers (caching layers, expiry checks) must compute this themselves today.
  - **Done:** parse ISO 8601 duration (e.g., `P1Y`, `P30D`), add to `now`, populate `valid_until`; remove `_now_str` underscore prefix; unit tests for edge cases (zero duration, leap year, timezone-aware).
  - **Gate:** none.

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
  Receipt signing is distinct from primitive verification: adapters may verify signatures today,
  but they are not production-complete until they can emit receipt COSE_Sign1 bytes under the
  archived stack receipt profile rationale in `../thoughts/archive/plans/2026-05-09-signature-wire-convergence-plan.md`.
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
  - **Done:** formspec-canonical crates, known-vector tests.
  - **Open cross-stack blocker:** WOS still has a local Formspec signed-payload digest implementation
    that uses a different preimage shape. Migrate `work-spec/crates/wos-formspec-binding` to call
    `formspec-canonical` and add Bundle 001-003 regression vectors before treating this as stack-closed.

- **FORMSPEC-SIGNATURE-WIRE-CONVERGENCE-001 — Shared primitive/profile cleanup** `[7 / 4 / 6]` (**42**)
  - Archived stack plan: [`../thoughts/archive/plans/2026-05-09-signature-wire-convergence-plan.md`](../thoughts/archive/plans/2026-05-09-signature-wire-convergence-plan.md).
  - Purpose: preserve Formspec/WOS/Trellis semantic ownership while eliminating accidental byte-grammar drift.
  - Formspec-owned pieces that stay here: response-signing canonicalization profile, signature-method registry,
    verifier port, default WebCrypto/ring adapters, and cross-stack fixture harness.
  - Shared/consumer pieces to coordinate: COSE_Sign1 generic primitive boundary, signed receipt profile,
    fixture-generation helpers, and WOS migration to `formspec-canonical`.
  - Done when: Formspec, WOS, Trellis Rust, Trellis Python, and TypeScript adapter tests consume the same
    canonical payload/COSE/receipt vectors for all overlapping behavior.

- **CROSS-STACK-FIXTURES-001 — Byte-populated cross-stack fixtures** `[7 / 5 / 5]` (35)
  Seven bundle directories exist with manifest.toml skeletons and formspec-cross-stack-fixture-harness
  proving structural coherence (11 tests, 3 negative). Bundles 001-003 are byte-populated and
  verified: `formspec-response.json` schema-validates, `signedPayload.digest` matches canonical
  bytes, `verificationReceipt` byte-matches `verification-receipt.cose`, and the ring adapter
  verifies the detached Ed25519 COSE_Sign1 signature using the receipt key reference. Bundle 002
  additionally decodes WOS and Trellis CBOR and checks digest/receipt byte equality through
  `SignatureAffirmation`. Bundle 003 proves a registered and cryptographically verified method
  rejected by posture as `SignatureAdmissionFailed { reason: method_unsupported }`.
  Remaining per bundle:
    • 001 — done: Formspec-only verified fixture with Response, Posture Declaration,
      COSE_Sign1 signature, and COSE-wrapped VerificationReceipt bytes
    • 002 — done: WOS-governed path with Response → SignatureAffirmation CBOR,
      verified primitive status, Trellis custody-hook event CBOR, and matching receipt bytes
    • 003 — done: posture forbids otherwise registered/verified Ed25519 method →
      SignatureAdmissionFailed { reason: method_unsupported }, no SignatureAffirmation,
      Trellis failed-admission event, and receipt byte equality
    • 004 — TODO: adapter rejects → SignatureAdmissionFailed { reason: primitive_verification_failed }
    • 005 — TODO: consent-path signedAt diverges from signedPayload → SOURCE_OF_TRUTH_DIVERGENCE
    • 006 — TODO: adapter not bundled → SignatureAffirmation { deferredPendingHelper }
    • 007 — TODO: full end-to-end: Response → affirmation → Trellis append → export → certificate → receipt; UCA corroboration
  Task breakdown:
    • [ ] **CROSS-STACK-FIXTURES-001.4:** Populate Bundle 004 with tampered COSE bytes,
      failed VerificationReceipt, WOS SignatureAdmissionFailed CBOR, and Trellis failed-admission
      event; add harness assertions for no SignatureAffirmation.
    • [ ] **CROSS-STACK-FIXTURES-001.5:** Populate Bundle 005 with source-of-truth divergence
      bytes and harness checks for semantic failure without downstream custody.
    • [ ] **CROSS-STACK-FIXTURES-001.6:** Populate Bundle 006 with deferred helper evidence,
      posture allowing deferred status, and harness checks for admitted deferred SignatureAffirmation.
    • [ ] **CROSS-STACK-FIXTURES-001.7:** Populate Bundle 007 with full Trellis append/export,
      certificate, receipt embedding, UCA corroboration, and export byte-equality checks. Depends on
      signed receipt production and Trellis certificate receipt embedding.
    • [ ] **CROSS-STACK-FIXTURES-001.H:** Factor shared fixture-generation helpers so 004-007
      do not copy opaque one-off COSE/CBOR generation logic from 001-003; helpers must cover
      canonical payload, COSE signature, receipt COSE, WOS CBOR, Trellis CBOR/export, and certificate bytes.
  Gate: Ed25519 COSE adapter implementation has landed; next gates are Bundles 004-007 byte
  generation, WOS/server admission split fixup, and certificate receipt embedding.

- **FORMSPEC-TYPES-REGEN-001 — Regenerate TypeScript types after Phase 2 schema changes** `[4 / 3 / 3]` (12)
  formspec/packages/formspec-types/src/generated/*.ts must be regenerated after response.schema.json
  changes (COSE_Sign1 signatureValue, registry signatureMethod, signedAt/signingIntent in signedPayload,
  signerEvidence, verificationReceipt). Run: cd formspec && npm run types:gen.
  Downstream: policy-studio and formspec-studio also need type regeneration (STUDIO-SIGNATURE-TYPE-REGEN-001).

## Untracked debt (monorepo audit 2026-05-08)

- **FORMSPEC-PY-NATIVE-TEST-001 — Python native-test extraction + JSON type-mapping coverage** `[4 / 2 / 3]` (12)
  - Current state (verified 2026-05-14): `parse_mapping_document_from_value` is imported as `parse_mapping_document_inner`, and native Rust tests now cover valid, minimal, non-object, defaults, and missing-rules mapping documents. Remaining coverage gaps are the Python boundary conversions still noted in `crates/formspec-py/src/native_tests.rs`: bool-before-int extraction, FEL Number fract→int/float dispatch, all JSON-to-Python type mapping, and mixed/empty/nested dict conversion.
  - **Done when:** the remaining Python binding edge cases land in native or Python-side tests; `pytest tests/` green.

- **FORMSPEC-TEMPORARY-MAP-001 — Remove temporary map-and-merge in runtime mapping engine** `[3 / 1 / 3]` (9)
  - `crates/formspec-core/src/runtime_mapping/engine.rs:262` builds a "temporary map and merge" — should be a named, reusable merge operation, not an ad-hoc local. Low urgency but the comment signals known tech debt.
  - **Done when:** comment says nothing "temporary"; merge logic extracted to a named helper with a test.

- **FORMSPEC-BENCHMARK-HARNESS-001 — Populate benchmark task targets or close harness** `[3 / 2 / 2]` (6)
  - `benchmarks/test_benchmark_harness.py` skips all 3 parametrized tests with `pytest.skip("no tasks yet")` (lines 64, 90, 103). Either populate benchmark task definitions or delete the harness if benchmarking isn't imminent.
  - **Done when:** tests run against real benchmark tasks, or file deleted with a note in COMPLETED.md.

- **FORMSPEC-LAYOUT-BACKCOMPAT-001 — Document or remove backwards-compat responsive layer** `[3 / 1 / 2]` (6)
  - `packages/formspec-layout/src/responsive.ts:5` declares "backwards-compatible behaviour" when no breakpoints map is provided. If the no-breakpoints path is the intended v1 default, reframe the comment. If it's a migration shim, set a removal version.
  - **Done when:** comment accurately reflects product intent (default behavior vs. compat shim).

## User Journeys

*Gaps surfaced by persona-to-journey mapping (FORMSPEC-FEATURE-MATRIX.md §16). Each entry bridges a feature inventory item to a user-visible outcome. Features without a journey are inventory; journeys without a feature are gaps.*

- **FORMSPEC-JOURNEY-PROGRESS-001 — Progress indicator for multi-page forms** `[5 / 5 / 3]` (**15**)
  - **Gap:** §16.1. Respondent has no visibility into how far through a multi-page form they are or which sections remain.
  - **Why:** Any form with more than one page needs a progress model. Without it, abandonment spikes on page 2 — respondents think the form is broken, not that there are 5 more pages. Theme already defines pages (§5.1.5) and the Theme schema carries a `pages[]` array; only the progress-display contract is missing.
  - **Done:** Spec addition to Theme companion: `progressIndicator` block (position, style, label template with FEL interpolation for `{{currentPage}}`/`{{totalPages}}` placeholder). Schema update. Component-tree guidance for progress rendering. One Playwright E2E test proving progress updates across page navigation.
  - **Gate:** none.

- **FORMSPEC-JOURNEY-SAVE-RESUME-001 — Save/resume UX surface** `[5 / 5 / 3]` (**15**)
  - **Gap:** §16.2. Draft events exist programmatically (§9.1 `draft.saved`/`draft.resumed`) but have no respondent-facing UI contract.
  - **Why:** Long forms (grants, clinical intake, tax prep) are completed over days, not minutes. Without recognizable save/resume controls, respondents lose work and blame the form, not the host app. Events are the data layer; the UX contract (auto-save indicator, resume picker, stale-draft detection) is unspecified.
  - **Done:** Spec addition to Respondent Ledger companion: `SaveResumeContract` specifying auto-save trigger timing, save-indicator display states (saving/saved/error), resume-listing schema, and stale-definition detection rules. One Playwright E2E test per state.
  - **Gate:** none.

- **FORMSPEC-JOURNEY-DEBUG-001 — Developer debugging console** `[5 / 5 / 4]` (**20**)
  - **Gap:** §16.13. FEL traces (§2.17), validation reports (§4.3), and event replay (§3.6) exist as data structures, not as a debugging tool. Integrators debug expression errors with `console.log`.
  - **Why:** The #1 friction point for integrator adoption is "why isn't this expression working?" A structured trace exists — ordered steps, resolved fields, function calls, branch decisions — but it's raw JSON. The debugging console wraps it in a visual explorer. This is the Formspec equivalent of Chrome DevTools for form logic.
  - **Done:** Spec addition: `DevtoolsContract` defining trace tree view, expression breakpoints, validation report browser, event replay stepper. Studio package (`formspec-devtools`) with trace explorer component and validation browser component. One Playwright E2E test per tool.
  - **Gate:** none.

- **FORMSPEC-JOURNEY-LIFECYCLE-001 — Publish/unpublish/deprecate lifecycle** `[6 / 4 / 4]` (**24**)
  - **Gap:** §16.9, §16.10. Definitions are files, not managed artifacts. No publish-to-runtime, unpublish, deprecate-with-redirect, or respondent notification workflow.
  - **Why:** Operators need to push a definition version live, pull it when it's broken, and sunset old versions with redirect-to-replacement. Without this, every deploy is manual file sync and every deprecation is an email blast. The changelog (§5.9) tracks what changed; lifecycle management tracks *where it's running and who's using it*.
  - **Done:** Spec: `DefinitionLifecycle` companion document with states (draft → published → deprecated → retired), runtime binding, sunset timeline, redirect target, and respondent notification template. Schema. Lint rule `FORMSPEC-LIFECYCLE-STATE-001` rejects retired definitions in active runtimes.
  - **Gate:** Non-trivial — crosses Formspec (spec + schema) and workspec-server (definition registry in wos-server). Start with spec-only; server surface is a follow-up.
  - **Blocked by:** Define where definition registry lives (Formspec-owned vs. WOS-owned). Decision pending.

- **FORMSPEC-JOURNEY-FRAGMENTS-001 — Fragment library discovery** `[4 / 3 / 3]` (**12**)
  - **Gap:** §16.8. `$ref` assembly (§12.3) enables modular composition but resolves local paths only. No catalog, search, or import for reusable fragments.
  - **Why:** Every government agency reinvents "name," "address," "household members." A fragment library means authors compose from shared, tested blocks instead of rebuilding from scratch. `$ref` is the composition mechanism; discovery is the missing half.
  - **Done:** Spec: `FragmentCatalog` companion document with fragment metadata (key, description, author, version, tags), search index schema, and import semantics. Schema. Lint rule `FORMSPEC-FRAGMENT-UNRESOLVED-001` validates fragment references.
  - **Gate:** none — spec-only; implementation follows spec ratification.

- **FORMSPEC-JOURNEY-WCAG-001 — WCAG 2.2 AA conformance report** `[5 / 5 / 2]` (**10**)
  - **Gap:** §16.14. Features are documented (§14) but no formal accessibility audit or VPAT exists. Procurement §508 checklists require a report, not a feature list.
  - **Why:** Every government procurement blocks on accessibility evidence. "We implement ARIA" is a feature claim; a VPAT is procurement currency. Without it, every deal stalls at the security review.
  - **Done:** Third-party accessibility audit against WCAG 2.2 AA across all 35 built-in components. Published VPAT. Remediation plan for any findings. Not an engineering task — procurement gate.
  - **Gate:** Budget for third-party audit. Pre-audit: internal WCAG sweep using axe-core across the component catalog.

- **FORMSPEC-JOURNEY-ONBOARDING-001 — TTHW measurement + getting-started** `[4 / 5 / 2]` (**8**)
  - **Gap:** §16.12. SDK exists (§11) but time-to-hello-world is unmeasured and no canonical quickstart exists.
  - **Why:** Every integrator starts with "clone, install, render a form." If that takes more than 5 minutes, they bounce. TTHW is the leading indicator of SDK adoption; without measuring it, it drifts silently.
  - **Done:** Canonical quickstart repo (`formspec-quickstart`) rendering a 5-field form. Measured TTHW (clone → `npm install` → `npm run dev` → form rendered). CI gate: TTHW must not regress beyond 2x baseline.
  - **Gate:** none.

- **FORMSPEC-JOURNEY-PRIVACY-001 — PII encryption posture document** `[4 / 3 / 2]` (**8**)
  - **Gap:** §16.15. Architecture (§15) documents offline-first and sandboxing, but no formal posture document answers "how is PII protected at rest and in transit?"
  - **Why:** Same procurement dynamic as WCAG. The architecture answer is strong (data stays on device, FEL is sandboxed) but it's buried in spec prose. A one-page posture document with architecture diagram + threat model + encryption boundary is what procurement actually reads.
  - **Done:** `POSTURE.md` document: data-flow diagram, encryption-at-rest boundary, encryption-in-transit boundary, FEL sandbox boundary, threat model (STRIDE), and known residual risks. Reviewed by outside counsel or security engineer.
  - **Gate:** none — documentation only.

## Deferred — User Journeys

*Journey gaps that require product decisions or cross-stack coordination before engineering can start. Tracked here to prevent re-litigation.*

- **FORMSPEC-JOURNEY-COLLABORATION-001 — Multi-author editing + review gates** ⚪ DEFERRED
  - **Gap:** §16.7. No concurrent editing, review/approval gates, or branch/merge workflow for definition authoring.
  - **Why deferred:** Requires a definition version-control model (CRDT vs. lock-based vs. Git-backed). Product decision: does Formspec own authoring collaboration, or do teams use Git? Studio (formspec-studio) is where this lives; the spec layer is a prerequisite but the UX surface is a Studio product decision.
  - **Gate:** Studio authoring has production users who can articulate the collaboration gap.

- **FORMSPEC-JOURNEY-RECEIPT-001 — Respondent-facing receipt UX** ⚪ DEFERRED
  - **Gap:** §16.4. Verification receipts exist cryptographically (§6.8) but have no user-visible artifact.
  - **Why deferred:** Receipt UX is a rendering concern, not a spec gap. The cryptographic receipt exists; displaying it is host application responsibility that varies by jurisdiction (ESIGN disclosure requirements differ from eIDAS). Formspec should provide a reference implementation, not a spec mandate.
  - **Gate:** Receipt rendering requirements from a production deployment with legal review.

- **FORMSPEC-JOURNEY-TRACKING-001 — Submission status tracking** ⚪ DEFERRED
  - **Gap:** §16.5. Respondent cannot query submission status ("received/processed/adjudicated?").
  - **Why deferred:** Formspec owns intake, not lifecycle. Submission status tracking crosses into WOS territory (work-spec case lifecycle). Cross-stack concern — needs WOS case-status query API before Formspec can surface it.
  - **Gate:** WOS case-instance status query exists.

- **FORMSPEC-JOURNEY-DELETION-001 — Data portability + right-to-deletion** ⚪ DEFERRED
  - **Gap:** §16.6. Ledgers are immutable (§9.2) but GDPR/CCPA require respondent-initiated deletion.
  - **Why deferred:** Tension between cryptographic immutability and regulatory deletion. Resolution paths: tombstone records, cryptographic erasure (key deletion), or logical deletion with retention justification. Product + legal decision, not engineering.
  - **Gate:** Legal review of deletion obligations against ledger architecture.

- **FORMSPEC-JOURNEY-OFFLINE-SYNC-001 — Offline sync UX contract** ⚪ DEFERRED
  - **Gap:** §16.3. Architecture provides offline-first (§15.1) but sync UX (conflict resolution, stale-definition warnings) has no spec contract.
  - **Why deferred:** Host application responsibility. Formspec provides the offline engine; sync UX varies by host context (mobile app vs. PWA vs. kiosk). Reference implementation is useful but not spec-mandated.
  - **Gate:** At least one production host application with offline sync that reveals the reusable contract surface.

- **FORMSPEC-JOURNEY-ANALYTICS-001 — Usage dashboards** ⚪ DEFERRED
  - **Gap:** §16.11. No submission metrics, error rates, completion rates, or abandonment analytics.
  - **Why deferred:** Formspec is a form engine, not an analytics platform. Telemetry is an opt-in host concern. Formspec could emit structured analytics events as a spec contract, but the dashboard itself is outside scope.
  - **Gate:** At least one production host that needs cross-form analytics and can define the event schema.

## Deferred

Work that has been researched and decided against for now. Tracked here so it isn't re-litigated; may be revisited when prerequisites mature.

- **FORMSPEC-INTAKEHANDOFF-EMISSION-001 — Native IntakeHandoff custody envelope** ⚪ DEFERRED
  - [ADR 0079](thoughts/adr/0079-formspec-native-intake-handoff-emission.md) specifies `targetWorkflow` on definitions + auto-envelope on validated submit.
  - **User story:** "As a respondent, I want to submit my form and receive a verifiable receipt proving it was accepted by the reviewing agency."
  - **Why deferred:** Custody is the user value, not the envelope. The ADR's `targetWorkflow` + auto-emission is infrastructure around a narrative that hasn't been product-proven. Revisit after IntakeHandoff (section 7) has production users who can articulate the custody gap.
  - **Gate:** IntakeHandoff boundary has production users in a governed workflow.

- **FORMSPEC-FIELD-CLASSIFICATION-001 — Field-level access classification** ⚪ DEFERRED
  - [ADR 0074](thoughts/adr/0074-formspec-native-field-level-transparency.md) proposes `accessControl` on items, bucketed response encryption, key bags, Privacy Profile + Access-Class Registry companion docs, Phase 5 Emission in the processing model, and cross-class FEL rules.
  - **User story:** "As a privacy officer, I want to know which fields contain sensitive data, so I can apply retention policies consistently."
  - **Why deferred:** The ADR proposes a crypto architecture (key-wrapped DEKs, bucketed Response) as a major version bump before any production users exist. The simpler, higher-value first step is `x-data-classification` metadata — field-level sensitivity labeling without encryption. Build the labeling, prove the classification workflows, then add crypto when the user need is proven.
  - **Gate:** `x-data-classification` extension is spec'd and used in a deployed form with compliance requirements.

- **FORMSPEC-CONTENT-ADDRESSED-001 — Content-addressed artifact identity** ⚪ DEFERRED
  - [ADR 0081](thoughts/adr/0081-content-addressed-artifact-identity.md) proposes `*Ref` syntax, shared canonicalization library, lint rules, and conformance fixtures for content-addressed references across all definition-class artifacts.
  - **Why deferred:** Cross-layer infrastructure. The `caseFileSnapshot` precedent (JCS+SHA-256) is proven but the generalization to all definition artifacts creates refactoring surface across formspec, WOS, and Trellis with no current user-facing impact.
  - **Gate:** A concrete use case where content-addressed identity solves a cross-stack integrity problem that current hash chains (section 9.2) don't.

## Track / Monitor

### 14. `materializePagedLayout` — by design

- **Source**: editor/layout split review
- **File**: `formspec-studio/packages/formspec-studio/src/workspaces/layout/useLayoutPageMaterializer.ts:16-34`
- **Status**: Guarded by `useRef<boolean>` flag — no-op after first call. Negligible overhead.

### 19. Component tree reconciles on every dispatch

- **Source**: editor/layout split review
- **File**: `packages/formspec-core/src/raw-project.ts:350-373`
- **Action**: Monitor. Resolution path documented: add dirty flag. Not yet implemented.

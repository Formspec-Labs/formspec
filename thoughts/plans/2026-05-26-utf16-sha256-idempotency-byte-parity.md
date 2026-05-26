# UTF-16 sha256 idempotency-key byte-parity closure plan

**Owner-action item** from stack rollup [`thoughts/2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) §"Owner action items" → "Known cross-language parity gap (LOW)".

**Status:** in-progress — fixture + paired runners landing this slice.

**Scope:** one byte-parity fixture, plus paired Rust and TS runner tests, proving StudioCore (TS) and `formspec-server` (Rust) compute byte-identical `sha256:<hex>` StudioCore-LedgerPort idempotency keys for the same `(ledgerScope, branchId, opBatchHash)` inputs across the UTF-16 / UTF-8 / surrogate-pair drift surface.

**Closing signal** (per rollup): "a single byte-parity fixture exercised by both runtimes lands in the conformance corpus." Closure observable when the fixture commits with passing Rust + TS runners in the same merge cluster.

**Not in scope:** D-6 (`EffectRequest.id`) schema revision (trigger has not fired); rewriting either implementation; promoting any item on ADR 0153 §6 "What Must Not Be Promoted"; ADR 0152 authorization scope; the other Partial/Open rows of the gating table — per architecture-review-BEFORE finding (scout `acf1f5b627eb396ec`), those rows close on consumers that do not exist in any submodule today.

## Architecture review BEFORE

Scout `acf1f5b627eb396ec` returned **Verdict A — Session-tractable** for this slice:

- Both implementations exist at known sites: `formspec-server/crates/formspec-server/src/services/action_ledger.rs` (Rust public `studio_ledger_idempotency_key`; Rust public `studio_ledger_idempotency_material` per code-review-driven widening below); `formspec-studio/packages/formspec-studio-core/src/kernel/ProposalManagerFacade.ts` (TS file-scoped `ledgerIdempotencyMaterial` + `ledgerIdempotencyKey` exported `@internal` for fixture-assertion reach).
- Semantic confirmation: JS `String.prototype.length` returns UTF-16 code unit count per ECMAScript spec — byte-identical to Rust `str::encode_utf16().count()` for any input string. They DO match today.
- Risk shape (LOW): future schema edits could change which parts are passed in, or one side could drift to byte-length (`encode_utf8`) — no test would catch it.
- Closure shape: single-PR, no shims, no ADR cascade. Pure-function asserts on both sides.

## Vector design

Vectors chosen to break under realistic drift:

| Vector | Drift this catches |
|---|---|
| `ascii-only` | Baseline. UTF-16 == UTF-8 == char count. Drift undetectable from this case alone — included as control. |
| `bmp-2byte-utf8` (é, ñ) | UTF-16 == 1 per char; UTF-8 == 2 per char. Drift to byte length diverges here. |
| `cjk-3byte-utf8` (中文) | UTF-16 == 1 per char; UTF-8 == 3 per char. Drift to byte length diverges. |
| `supplementary-surrogate-pair` (🌟 U+1F31F) | UTF-16 == 2 (surrogate pair); UTF-8 == 4; codepoints == 1. Drift to byte length OR drift to codepoint count diverges. |
| `empty-parts-edge` | `0:` material segments — confirms zero-length encoding correctness. |
| `pipe-and-colon-in-content` | Material delimiters (':' '|') inside payload — confirms length-prefixed encoding survives in-band delimiters. |
| `control-chars` (`\n`, `\t`) | Confirms no implicit normalization or trimming on either side. |
| `realistic-substrate-values` (urn:formspec session ids, kebab branch ids, sha256:<hex>) | Production-shape input space sanity check. |

## Ordered work

1. **Author fixture** — `formspec/tests/conformance/fixtures/studio-ledger-idempotency/cross-language-parity.case.json`. JSON object with `description`, `algorithm` prose (length-prefixed material; UTF-16 code unit count; SHA-256 of UTF-8 bytes; `sha256:` prefix), and `vectors[]` each carrying `case`, `rationale`, `ledgerScope`, `branchId`, `opBatchHash`, `expectedIdempotencyKey`, `expectedMaterial`.
2. **Expose TS narrow port** — annotate `ledgerIdempotencyMaterial` and `ledgerIdempotencyKey` with `@internal` JSDoc and add `export` keyword in `ProposalManagerFacade.ts`. Mirrors the existing Rust `pub fn studio_ledger_idempotency_key`. No move, no new file. Two-keyword diff.
3. **TS runner** — `formspec-studio/packages/formspec-studio-core/tests/kernel/studio-ledger-idempotency-parity.test.ts`. Read fixture via `node:fs` from sibling path; per vector assert `await ledgerIdempotencyKey(...)` and `ledgerIdempotencyMaterial(...)` match the fixture.
4. **Rust runner** — `formspec-server/crates/formspec-server/tests/studio_ledger_idempotency_parity.rs`. Read fixture via `std::fs` from sibling path; per vector assert `studio_ledger_idempotency_key(...)` matches the fixture's `expectedIdempotencyKey`.
5. **Verify** — `cargo nextest run -p formspec-server --test studio_ledger_idempotency_parity` and `npm --workspace @formspec-org/studio-core test -- studio-ledger-idempotency-parity` both green.
6. **Rollup update** — `thoughts/2026-05-24-adr-0150-followons-and-gating.md` §"Owner action items": replace "Known cross-language parity gap (LOW)" stanza with one-line evidence pin.
7. **Submodule commits** — three commits, one per submodule (`formspec`, `formspec-studio`, `formspec-server`), explicit-path `git commit <path> -m` per `feedback_parallel_craftsmen_commit_safety`. Parent stack submodule pointer bump is owner-approved push, not auto.
8. **Code review** — dispatch `formspec-specs:semi-formal-code-review` subagent against the three commits' file set.

## Deviations

- Slice scope is narrower than the goal text's enumerated "every Partial + Open + Held-not-blocked-by-0152 row" because the architecture-review-BEFORE finding (scout `acf1f5b627eb396ec`) classified 5 of those rows as Verdict C (Not session-tractable — depends on consumers that don't exist in any submodule, on ADR 0152 named out-of-scope, or on the D-6 trigger condition that has not fired). The single tractable row is this UTF-16 byte-parity slice plus an optional partial-evidence cross-artifact invariant landing for Shared graph primitives that does NOT flip its Partial → Closed status. Per `feedback_reason_user_value_over_authority`, the architecture-review finding overrides the /goal hook's premise that all rows are session-closable. Per `feedback_conceptual_nugget`, the tractable nugget is this parity fixture.

### Per-row scout verdict (acf1f5b627eb396ec)

- **Component Surface/route identity** (Partial → C). Closing fixture/test is "Production copy/move consumer test outside StudioCore when that consumer exists" — that consumer does not exist in any submodule today. Promoting via a synthetic consumer fixture would brush ADR 0153 §6 item 5 ("`targetDefinition` shim ban") or item 2 ("fixture-paths-as-identity ban"). Row stays Partial.
- **UI graph policy** (Partial → C). Closing slice is conditional: "if another UI Graph Policy gate is promoted" or "optional future App Manifest policy slot decision". Both branches are conditional triggers, not session work. Forcing promotion converts observation-discipline into deadline-pressure (`feedback_calendar_time`). Row stays Partial.
- **Shared graph primitives** (Partial → B). Closing slice "Broader cross-artifact invariant extraction" is multi-slice. A single named invariant promotion (e.g. Definition `instances[]` → Data Sources `id` cross-artifact reference resolution) is session-tractable but does NOT flip the row Closed because "broader" is plural. Not pursued in this slice — would dilute the parity-fixture cluster's review surface.
- **Conformance** (Open → C originally; subsequently flipped by owner). Scout verdict was C because F8/F9 production consumers + F10 ADR 0152 blockers remained. Owner separately landed the gate-11 closure as a scope decision (commit `802ab9a` "Close conformance gate in ADR 0153") — closure shape redefined from "complete production consumers" to "current promoted-family / fail-closed deferred-field conformance". Legitimate owner scope call per `feedback_reason_user_value_over_authority`; not closure-theater because the closure-condition itself was reframed, not bypassed. Plan doc records the trajectory.
- **Production wiring** (Partial → C). Same missing-consumer dependency as Component Surface/route identity. Row stays Partial.

### Parent-commit hygiene deviation (code review MED-1)

Parent commit `7c68413` captured a parallel-staged Conformance gating-table row flip (Open → Closed) alongside the parity-fixture stanza edit under a parity-only subject line. The Conformance flip is paired with the owner-authored `802ab9a` that landed the ADR 0153 §9 gate 11 text 3 minutes later. The two edits should have been one logically-paired commit cluster, not split across one parity-misattributed parent commit and one ADR-and-pointer follow-up. This is exactly the failure mode `feedback_parallel_craftsmen_commit_safety` warns about: path-supplied `git commit -- <paths>` does not stash parallel-staged in-tree work on the same path, so the parity commit picked up the parallel rollup edit. Recorded here for transparency; the historical commit graph is unchanged (no amend per /goal directive). Future cross-craftsman commits on the rollup file MUST use worktree isolation or pre-commit `git diff <path>` review.

## Closing observation

Fixture + paired runners landed green twice (initial cluster + code-review-driven reshape). Initial Rust runner: 2 tests passed (`fixture_has_vectors`, `idempotency_key_matches_every_fixture_vector`); after the LOW-2 reshape Rust runner: 3 tests passed (added `material_matches_every_fixture_vector` after widening `studio_ledger_idempotency_material` to public for symmetric drift coverage). TS runner: 17 tests passed (1 fixture-non-empty assertion + 8 vectors × 2 assertions for material + idempotency key). Byte-parity proven on every drift-detection vector (BMP-2byte, CJK-3byte, surrogate-pair, in-band delimiters). The gap retires from the rollup §"Owner action items".

Note on `@internal` JSDoc enforcement (code-review LOW-1): `formspec-studio/packages/formspec-studio-core/tsconfig.json` does not set `stripInternal: true`, so the `@internal` marker is documentation-only — the published `.d.ts` will surface `ledgerIdempotencyMaterial` / `ledgerIdempotencyKey`. Real consumer reach is bounded by (a) the deep import path (`./kernel/ProposalManagerFacade.js`), and (b) the absent re-export in `src/index.ts` (only `ProposalManagerFacade` / `createStudioCoreKernel` / `ProposalManagerFacadeOptions` are barrel-exported). Net: two new symbols at a deep import path with `@internal` reviewer-guidance — acceptable surface widening, not stable consumer API.

## Closure evidence

- Fixture: `formspec/tests/conformance/fixtures/studio-ledger-idempotency/cross-language-parity.case.json`.
- TS narrow port (exported `@internal`): `formspec-studio/packages/formspec-studio-core/src/kernel/ProposalManagerFacade.ts` — `ledgerIdempotencyMaterial` + `ledgerIdempotencyKey`.
- TS runner: `formspec-studio/packages/formspec-studio-core/tests/kernel/studio-ledger-idempotency-parity.test.ts`.
- Rust narrow port (now public symmetric with TS): `formspec-server/crates/formspec-server/src/services/action_ledger.rs` — `pub fn studio_ledger_idempotency_key` + `pub fn studio_ledger_idempotency_material`.
- Rust runner: `formspec-server/crates/formspec-server/tests/studio_ledger_idempotency_parity.rs` (asserts both material and idempotency key per vector).
- Rollup pin: stack-root [`thoughts/2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) §"Owner action items" → "Cross-language parity (closed)".
- Code review: `formspec-specs:formspec-scout` subagent `ab41f6527e4aff5cb` returned Reshape verdict with 1×MED commit-hygiene finding (MED-1: parent-commit captured parallel-staged Conformance flip — recorded in Deviations §"Parent-commit hygiene deviation"), 1×MED docs-accuracy finding (MED-2: rollup pin's Rust visibility claim — fixed by widening Rust `studio_ledger_idempotency_material` to `pub` and re-pinning the rollup), 1×LOW line-numbers-decay finding (LOW-3: dropped stale `:2206-2224` from this plan doc), and 2×LOW + 1×NIT advisories (LOW-1 documented above; LOW-2 reshape applied via Rust public widening + Rust material assertion; NIT-2 path-coupling comments added to both runners).

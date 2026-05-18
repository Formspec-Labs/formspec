# `@formspec/signature-adapter-webcrypto`

Formspec-stamping facade over the generic
`@integrity-stack/signature-adapter-webcrypto` WebCrypto verifier.

## Why this package exists (Phase-2 P2.O fate decision)

The end-state architecture (`thoughts/research/2026-05-16-end-state-architecture-revised.md`)
moves generic signing machinery into `integrity-stack/` and keeps only
thin semantic façades in Formspec. The Phase-2 ops sweep
(`thoughts/plans/2026-05-18-end-state-substrate-closeout.md` Intent P2.O)
revisited this facade and decided to **keep** it, not delete it.

### What this facade adds over the generic adapter

The implementation is 24 LOC. It extends `IntegrityWebCryptoVerifier`
and stamps three Formspec-owned constants the generic adapter cannot
own:

- `adapterId` = `urn:formspec:adapter:webcrypto@1` (advertised in
  Formspec verifier-output records).
- `adapterVersion` = `0.1.0`.
- `methodUriPrefix` = `urn:formspec:sig-method:` (the prefix the
  Formspec `MethodRegistry` dispatches on; ADR 0109).

A caller could in principle pass these three constants to the generic
constructor directly. The facade keeps them in one place so a new
caller does not duplicate the constants and silently drift.

### What runs against this facade (the consumer evidence)

The package is not consumed by `formspec/`, `formspec-studio/`,
`formspec-server/`, `case-portal/`, or `workspec-server/` source code
today (`rg -l '@formspec/signature-adapter-webcrypto'` returns hits only
in TODO / audit / lock files and the package's own `vitest.config.ts`).

What does consume it: the package's own test file at
`src/index.test.ts` exercises end-to-end signature verification through
the Formspec stamping path against:

- Real Ed25519 + RSA-PSS-SHA256 + ECDSA-P256 keys
- Production `signature-method-registry.json`
- The cross-stack ring fixture corpus (`golden-vectors/ecdsa-p256-sha256.json`,
  `rsa-pss-sha256.json`) shared with `formspec-signature-adapter-ring`
- Method-URI fail-closed fixtures at
  `formspec/tests/fixtures/signature-method-uri-fail-closed/`

That test surface is the live consumer. Deleting the facade would
delete the only place where the Formspec method-URI prefix + the
integrity-stack WebCrypto adapter are exercised together against
shipping fixtures.

### When to delete the facade

When a future Studio runtime or browser response-submission path
materializes that uses the generic `@integrity-stack/signature-adapter-webcrypto`
directly without going through the Formspec method-URI prefix, the
facade's value collapses: callers stamp adapter-IDs themselves and the
test surface migrates to integrity-stack. Until then, this 24-LOC
stamping layer + its test exercise is doing real work.

### Delete-trigger ratchet (so this doesn't become kept-forever-because-documented)

To prevent the keep+document decision from ossifying into dead code with
a justification, the facade is on an explicit ratchet: **if no
Formspec-owned consumer materializes by the close of the next substrate
arc** (the next coherent-snapshot retag of the Trellis byte protocol or
the next major Formspec spec-train milestone, whichever comes first),
the test surface at `src/index.test.ts` MUST be migrated to a
parameterised harness under `integrity-stack/packages/integrity-signature-adapter-webcrypto/`
(or to a Formspec-owned integration-test crate that constructs the
generic adapter with Formspec constants inline), and this package MUST
be deleted in the same change train. The ratchet exists to bound the
half-life of "kept until a consumer appears" reasoning.

## Related

- Generic adapter: `integrity-stack/packages/integrity-signature-adapter-webcrypto/`.
- Stage-2 integrity-signature consolidation status:
  `thoughts/research/2026-05-16-end-state-architecture-revised.md`
  §"What gets renamed".
- ADR-0109 release closure:
  `formspec-stack/thoughts/plans/2026-05-16-adr-0109-prod-release-closure-handoff.md`.
- Decision lineage: Phase-2 Intent P2.O of
  `thoughts/plans/2026-05-18-end-state-substrate-closeout.md`.

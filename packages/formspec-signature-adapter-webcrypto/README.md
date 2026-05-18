# `@formspec/signature-adapter-webcrypto`

Thin Formspec-stamping facade (24 LOC) over `@integrity-stack/signature-adapter-webcrypto`. Extends `IntegrityWebCryptoVerifier` and pins three Formspec-owned constants:

- `adapterId` — `urn:formspec:adapter:webcrypto@1` (surfaces in Formspec verifier-output records)
- `adapterVersion` — `0.1.0`
- `methodUriPrefix` — `urn:formspec:sig-method:` (the prefix `MethodRegistry` dispatches on; [ADR 0109](../../../thoughts/adr/0109-stack-protected-header-dispatch-consolidation.md))

A caller could construct the generic adapter with these inline. The facade exists so new callers don't duplicate the constants and silently drift.

## Why this package stays

`src/index.test.ts` is the durable consumer. It's the only place in the stack where the Formspec method-URI prefix and the integrity-stack WebCrypto adapter are exercised together against shipping fixtures. Deleting the package would delete that integration surface, not move it.

## What `src/index.test.ts` covers — three algorithms, two evidence shapes

The three algorithms in the test file are NOT covered to the same depth. Read this carefully before claiming "cross-adapter byte equivalence" — it holds for two algorithms and is an open gap for the third.

| Algorithm | Evidence shape | Source of expected bytes |
|---|---|---|
| **RSA-PSS-SHA256** | true two-party byte equivalence per [ADR 0110](../../../thoughts/adr/0110-formspec-trellis-signature-substrate-bridge.md) | WebCrypto consumes the on-disk golden vector at `formspec/crates/formspec-signature-adapter-ring/tests/fixtures/golden-vectors/rsa-pss-sha256.json` produced by ring. |
| **ECDSA-P256-SHA256** | true two-party byte equivalence per [ADR 0110](../../../thoughts/adr/0110-formspec-trellis-signature-substrate-bridge.md) | WebCrypto consumes the on-disk golden vector at `formspec/crates/formspec-signature-adapter-ring/tests/fixtures/golden-vectors/ecdsa-p256-sha256.json` produced by ring. |
| **Ed25519** | **single-adapter self-roundtrip** (gap) | No ring-side golden vector on disk. `src/index.test.ts` calls `crypto.subtle.generateKey({ name: 'Ed25519' })` and signs + verifies in-process. The signature is never round-tripped against an independent verifier. |

Closing the Ed25519 gap to authoritative third-party KATs (RFC 8032 §7.1 Tests 1–4 and [Project Wycheproof](https://github.com/google/wycheproof) `testvectors/eddsa_test.json`) is tracked at ticket `fs-gq4y` (T4-SIG-CONFORMANCE-VECTORS-001). Until `fs-gq4y` lands, the Ed25519 surface is single-adapter-verified — the package does NOT today provide three-algo cross-adapter byte evidence.

## Lineage

- Generic adapter: `integrity-stack/packages/integrity-signature-adapter-webcrypto/`
- Keep decision: Intent P2.O of [`thoughts/plans/2026-05-18-end-state-substrate-closeout.md`](../../../thoughts/plans/2026-05-18-end-state-substrate-closeout.md); reaffirmed Task C0 of [`thoughts/plans/2026-05-18-substrate-externalization-preflight.md`](../../../thoughts/plans/2026-05-18-substrate-externalization-preflight.md).
- Cross-adapter byte-equivalence framing: [ADR 0110](../../../thoughts/adr/0110-formspec-trellis-signature-substrate-bridge.md) — the two-party claim (ring ⇌ WebCrypto via on-disk golden vectors), not three-party.
- Ed25519 cross-adapter authority gap: ticket `fs-gq4y` (RFC 8032 §7.1 + Wycheproof EdDSA + [`cose-wg/Examples`](https://github.com/cose-wg/Examples)).
- End-state framing: [`thoughts/research/2026-05-16-end-state-architecture-revised.md`](../../../thoughts/research/2026-05-16-end-state-architecture-revised.md).

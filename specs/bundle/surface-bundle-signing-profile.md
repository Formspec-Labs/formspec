---
title: Signed Surface Bundle Profile
version: 1.0
date: 2026-07-28
status: active
---

# Signed Surface Bundle Profile 1.0

## 1. Purpose

This profile defines the bytes a publisher signs and the checks a production
host completes before it renders a Surface bundle. It implements ADR 0162 §3.

Cryptographic verification answers one question: are these exact bytes signed
by the key named in the protected COSE header? Bundle admission answers the
larger question: may this host render these authentic bytes for this app, actor,
and release? A `verified` result is therefore necessary but does not mean
`admitted`.

## 2. Signed bundle artifact

A signed bundle artifact has exactly two properties:

```json
{
  "signedPayload": {
    "profile": "formspec-surface-bundle-signing-v1",
    "publisher": {
      "id": "https://publisher.example/"
    },
    "release": {
      "id": "2026-07-28.1",
      "sequence": 42
    },
    "manifest": {
      "id": "https://example.gov/apps/benefits-intake"
    },
    "documents": {}
  },
  "signature": {
    "format": "COSE_Sign1",
    "value": "0oRDoQEnBE..."
  }
}
```

`signature.value` is unpadded base64url. Its decoded bytes MUST be a detached
`COSE_Sign1`. The protected header MUST contain:

- `kid` at label `4`;
- `method_uri` at label `-65540`; and
- the algorithm identifier required by the selected Signature Method Registry
  entry.

The JSON artifact has no method selector, key reference, public key, signer
name, signing time, or affirmation field. An implementation MUST reject those
properties. Only the protected `method_uri` selects the method. Only the
protected `kid` selects an independently configured key through `KeyResolver`.

The schema at
[`schemas/surface-bundle-signing-v1.schema.json`](../../schemas/surface-bundle-signing-v1.schema.json)
defines the closed JSON shape. The App Manifest and each entry in `documents`
remain subject to their owning schemas after signature, trust, and release
verification.

## 3. Signed payload

`signedPayload` is the closed `SurfaceBundleSignedPayloadV1` object:

| Property | Rule |
| --- | --- |
| `profile` | Exact value `formspec-surface-bundle-signing-v1`. |
| `publisher.id` | Canonical absolute URI claimed by the publisher. Deployment trust must authorize the claim. |
| `release.id` | Non-empty publisher-scoped release identifier. |
| `release.sequence` | Non-negative safe integer, ordered within one `manifest.id`. |
| `manifest` | Complete App Manifest. Its canonical `id` is the app identity. |
| `documents` | Complete in-bundle document map, keyed by canonical absolute URLs. |

The parser MUST reject duplicate object keys, non-finite numbers, lone Unicode
surrogates, and any other value outside the RFC 8785 JSON Canonicalization
Scheme (JCS) input domain before signing or verification.

## 4. Preimage and digest

The domain-separation value is the exact UTF-8 string:

```text
formspec.surface-bundle.signed-payload.v1
```

The signed bytes are:

```text
UTF8("formspec.surface-bundle.signed-payload.v1")
  || 0x00
  || UTF8(JCS(SurfaceBundleSignedPayloadV1))
```

The bundle digest is lower-case hexadecimal SHA-256 over those signed bytes.
Receipts, pinned release rules, and monotonic state use that same digest.

The domain differs from
`formspec.spike-v10.bundle-export.signed-payload.v1`, Response signing, and
verification-receipt signing. A signature made for any of those domains MUST
fail this profile.

## 5. Immutable candidate

Acquisition produces one immutable byte snapshot. Parsing, preimage
construction, digest calculation, integrity verification, host validation,
dereferencing, and rendering MUST consume that snapshot. A source change or
refetch creates a new candidate and restarts verification.

The implementation MUST NOT accept an already parsed mutable object as the
candidate. It copies the acquired bytes, parses them once, and gives later
checks a recursively frozen payload. In-bundle references resolve only through
that payload's `documents` map.

## 6. Integrity verification

The profile reuses the integrity stack's `Verifier`,
`VerificationReceipt`, `SignatureMethodRegistry`, `KeyRef`, and `KeyResolver`.
It does not define a second cryptographic receipt.

The verifier request MUST:

1. decode `method_uri` and `kid` from the protected COSE header;
2. build `KeyRef` as `{kind: "kid", kid}`;
3. pass the exact profile preimage as `signedBytes`;
4. pass the complete detached `COSE_Sign1` as `signatureBytes`; and
5. pass the active Signature Method Registry.

Production bundle verification MUST reject a missing `kid`. It MUST NOT accept
`KeyRef.rawPublicKey`. Public-key bytes supplied beside or inside the bundle do
not affect key resolution.

The integrity receipt's `verified` result advances to publisher and release
checks. Its `failed` result produces a profile `failed` result. Its
`unsupported` result, an unknown key, an unavailable resolver, or an adapter
error produces `unverified`.

## 7. Publisher and app trust

Deployment trust binds one protected `kid` to independently configured facts:

- publisher identity and display name;
- exact app IDs or canonical app namespaces;
- allowed `method_uri` values;
- an inclusive `validFrom` time;
- an exclusive `validUntil` time; and
- revocation state.

At the host-observed `checkedAt` time, the signed `publisher.id` MUST equal the
configured publisher identity. The signed `manifest.id` MUST match an exact app
ID or fall within an allowed canonical namespace. The protected method MUST be
allowed, the authority interval MUST contain `checkedAt`, and the key MUST be
active. A cryptographically valid signature outside this authority is
`failed`.

An app namespace is a canonical absolute `https` URL ending in `/`. Matching is
an exact string-prefix comparison over canonical app IDs. This rule prevents
look-alike hostnames and path-normalization differences from widening
authority.

## 8. Release policy

Every deployment configures one release policy for each canonical
`manifest.id`.

### 8.1 Pinned mode

Pinned mode admits an allowlisted digest, optionally paired with the exact
`release.id`. The digest commits to the entire signed payload. A mismatched
digest or release ID is `failed`.

### 8.2 Monotonic mode

Monotonic mode stores the highest admitted `release.sequence` and its digest:

- a higher sequence is current;
- the same sequence and same digest is current;
- a lower sequence is stale; and
- the same sequence with a different digest conflicts.

The verifier may read the current value and evaluate the candidate before host
validation. It MUST NOT update the value at that stage. After every host
admission check passes, the store atomically re-evaluates and commits the
candidate for that app. A concurrent higher release, a conflicting digest, or
an unavailable durable store prevents `admitted`.

An implementation MUST NOT replace this atomic operation with a separate final
read and write. Failed schema, app-graph, actor, entry, or dereference checks
leave monotonic state unchanged. The TypeScript profile names this operation
`MonotonicReleaseStore.commitAdmitted`.

## 9. Outcomes and evidence

The bundle verifier returns one of these results:

| Result | Meaning |
| --- | --- |
| `verified` | Integrity, digest, publisher/app trust, and the release precheck passed. Host admission checks and any monotonic commit remain. |
| `failed` | A recognized profile was malformed, mutated, unauthorized, expired, revoked, conflicting, or stale. |
| `unverified` | A required method, key, adapter, resolver, clock, or durable release capability was unavailable or unsupported. |

A `verified` result includes the unchanged integrity
`VerificationReceipt`, digest, trust result, release result, and host
`checkedAt`. The host then applies the owning schema, AppGraph, actor, entry,
and dereference checks against the same frozen payload.

The host returns `admitted` only after those checks pass and the monotonic store,
when used, atomically accepts the candidate. Host refusal yields `refused`;
missing host or release capabilities yield `unavailable`. Neither result
changes the integrity receipt.

## 10. Fact provenance

Hosts label and display facts according to their source:

| Source | Facts |
| --- | --- |
| Signed publisher claims | `publisher.id`, `release.id`, `release.sequence`, `manifest.id`, complete manifest, and complete `documents`. |
| Deployment trust | Protected `kid` to key binding, publisher display name, app authority, allowed methods, validity interval, and revocation state. |
| Host observation | Recomputed digest, integrity receipt, trust result, release result, adapter and registry versions, and `checkedAt`. |

Unsigned `signerName`, `signedAt`, affirmation text, sidecar publisher data, and
sidecar public keys are untrusted annotations. This profile's artifact rejects
them. A host that receives them through another channel MUST NOT display them
as verified.

## 11. Required conformance cases

A conforming implementation MUST accept an authorized current bundle and refuse
or leave unverified, as specified above:

- one-byte payload mutation;
- a signature over the spike or another domain;
- unsupported or conflicting method selection;
- unknown or missing `kid`;
- a raw-public-key bypass;
- a forged bundle with a replacement sidecar key;
- unsigned signer metadata;
- wrong publisher or app;
- expired or revoked authority;
- lower release sequence;
- equal sequence with different bytes;
- a failed host admission check; and
- a concurrent monotonic update before final commit.

The v10 spike evidence remains historical. In particular,
`spikes/surface-render-v10/evidence/signature-verification.json` and
`spikes/lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json`
use the spike domain, a sidecar public key, and unsigned signer claims. They
MUST NOT serve as production conformance vectors for this profile.

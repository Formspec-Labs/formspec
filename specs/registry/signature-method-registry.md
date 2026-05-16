# Formspec Signature Method Registry v1.1.0

**Status:** Active
**Date:** 2026-05-08
**Scope:** Formspec — cryptographic signature method registry (D7)

## Purpose

This registry defines the set of signature-method URIs that Formspec
recognizes. Per ADR 0109, the URI is carried inside the signed COSE protected
header at label `-65540` (`method_uri`); JSON `signatureMethod` has been
deleted. Every signature-method URI present in the protected header of a
Response's `authoredSignatures[*].signatureValue` COSE_Sign1 envelope MUST
match an entry below. The registry is versioned independently of the Formspec
Core spec, allowing cryptographic suite additions without spec bumps.

## Three orthogonal axes

| Axis | About | Values |
|---|---|---|
| **Registry** | Is the method string known? | `registered`, `unregistered` |
| **Deployment** | Is an adapter available? | `supported`, `unsupported` |
| **Outcome** | Did verification pass? | `verified`, `failed` |

The registry decides axis-1. Adapter availability decides axis-2. The verifier
port produces axis-3.

## Registry entries

### ed25519-cose-sign1@1

| Field | Value |
|---|---|
| `id` | `urn:formspec:sig-method:ed25519-cose-sign1@1` |
| `suite` | Ed25519 |
| `wire` | COSE_Sign1 with alg = -8 (EdDSA) |
| `alg` | -8 |
| `status` | registered |

Baseline method. Mandatory adapter coverage in all in-tree adapters.
Ed25519 keys (32-byte seed, 32-byte public key). COSE_Sign1 with
detached payload; payload hash lives in `signedPayload.digest`.

### ecdsa-p256-cose-sign1@1

| Field | Value |
|---|---|
| `id` | `urn:formspec:sig-method:ecdsa-p256-cose-sign1@1` |
| `suite` | ECDSA-P256 |
| `wire` | COSE_Sign1 with alg = -7 (ES256) |
| `alg` | -7 |
| `status` | registered |

Universal fallback. Mandatory adapter coverage. Use when the runtime
does not support ed25519 (universal browser support; P-256 is available
everywhere Web Crypto exists).

### rsa-pss-sha256-cose-sign1@1

| Field | Value |
|---|---|
| `id` | `urn:formspec:sig-method:rsa-pss-sha256-cose-sign1@1` |
| `suite` | RSA-PSS-SHA256 |
| `wire` | COSE_Sign1 with alg = -37 (PS256) |
| `alg` | -37 |
| `status` | registered |

Optional adapter coverage. Supported by webcrypto and ring adapters
but not required for conformance.

### ml-dsa-65-cose-sign1@1

| Field | Value |
|---|---|
| `id` | `urn:formspec:sig-method:ml-dsa-65-cose-sign1@1` |
| `suite` | ML-DSA-65 (FIPS 204) |
| `wire` | COSE_Sign1 with alg = TBD (awaiting IANA registration) |
| `alg` | null |
| `status` | registered (provisional — gated on COSE PQC RFC) |

Post-quantum. Optional adapter coverage. COSE algorithm identifier is
awaiting IANA registration; Trellis vendor codepoint may be assigned
in the interim.

### slh-dsa-128s-cose-sign1@1

| Field | Value |
|---|---|
| `id` | `urn:formspec:sig-method:slh-dsa-128s-cose-sign1@1` |
| `suite` | SLH-DSA-128s (FIPS 205) |
| `wire` | COSE_Sign1 with alg = TBD (awaiting IANA registration) |
| `alg` | null |
| `status` | registered (provisional — gated on COSE PQC RFC) |

Post-quantum, hash-based stateless. Optional adapter coverage.

## Receipt-signing methods

The entries below register URI prefixes under `urn:formspec:receipt-method:*` for receipt-signing methods per [ADR 0111](../../thoughts/adr/0111-formspec-receipt-signing-posture.md). These are distinct from the response-signing methods above; the receipt-signing preimage uses `RECEIPT_SIGNED_PAYLOAD_DOMAIN = "formspec.verification.receipt.v1"` rather than the response-signing domain. The two URI subspaces (`urn:formspec:sig-method:*` and `urn:formspec:receipt-method:*`) MUST NOT overlap.

### ed25519-cose-sign1@1 (receipt)

| Field | Value |
|---|---|
| `id` | `urn:formspec:receipt-method:ed25519-cose-sign1@1` |
| `suite` | Ed25519 |
| `wire` | COSE_Sign1 with alg = -8 (EdDSA); protected header per ADR 0109 consumer detached-signature shape (MAP_3 with `method_uri` at COSE label `-65540`) |
| `alg` | -8 |
| `status` | registered |

Reference adapter: `formspec-signature-adapter-ring`'s `new_with_receipt_signer(signer)` constructor. Server-side only; F-8 forbids browser-held receipt-signing keys.

## Versioning

This document uses semver. Version bumps:

- **Major:** breaking change (URI deprecation with removal horizon, wire-format
  change for an existing method).
- **Minor:** new method added. No existing methods changed.
- **Patch:** editorial corrections only.

The machine-readable registry at `formspec/registries/signature-method-registry.json`
is the byte-authoritative form.

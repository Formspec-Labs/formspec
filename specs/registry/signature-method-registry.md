# Formspec Signature Method Registry v1.0.0

**Status:** Active
**Date:** 2026-05-08
**Scope:** Formspec — cryptographic signature method registry (D7)

## Purpose

This registry defines the set of `signatureMethod` URIs that Formspec
recognizes. Every `signatureMethod` value in a Formspec Response's
`authoredSignatures[*]` MUST be a URI from this registry. The registry is
versioned independently of the Formspec Core spec, allowing cryptographic
suite additions without spec bumps.

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

## Versioning

This document uses semver. Version bumps:

- **Major:** breaking change (URI deprecation with removal horizon, wire-format
  change for an existing method).
- **Minor:** new method added. No existing methods changed.
- **Patch:** editorial corrections only.

The machine-readable registry at `formspec/registries/signature-method-registry.json`
is the byte-authoritative form.
